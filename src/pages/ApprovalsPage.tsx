import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock, Grid3x3, ImageOff, Inbox, RotateCcw, ScanLine, Sparkles, WifiOff, X } from 'lucide-react';
import {
  approveSubmission,
  fetchEffectiveAverages,
  practiceForDate,
  rejectSubmission,
  setSubmissionScan,
  useAllEntries,
  useEvents,
  usePhoto,
  usePlayers,
  useSubmissions,
} from '../lib/data';
import { eventTitle, formatDate } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { rowFor, type ScanRow } from '../lib/scan-result';
import { scanDone, startScan, useScanJob, waitingText } from '../lib/scanJobs';
import { firstFreeSlot, isValidScore, slots } from '../lib/stats';
import { useNow } from '../lib/useNow';
import type { BowlingEvent, Entry, Player, Submission } from '../lib/types';
import { useAction, useFeedback } from '../components/feedback';
import { PhotoView } from '../components/PhotoModal';
import { Avatar } from '../components/Avatar';
import { FramesGrid } from '../components/frames/FramesGrid';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, LoadError, Modal, Select, Skeleton, Spinner, cx } from '../components/ui';

/** Tiempo en que el teléfono del jugador todavía puede estar leyendo la foto después de enviarla. */
const FRESH_MS = 5 * 60_000;

export default function ApprovalsPage() {
  const { lid } = useLeagueCtx();
  const subs = useSubmissions(lid, 'pendiente');
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const entries = useAllEntries(lid);

  const sorted = useMemo(
    () => [...subs.data].sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)),
    [subs.data],
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Aprobar juegos</h2>
        <p className="text-sm text-muted">Juegos que los jugadores subieron desde su perfil. Al aprobarlos cuentan en sus estadísticas.</p>
      </div>
      {subs.error ? (
        <LoadError error={subs.error} />
      ) : subs.loading || events.loading || players.loading ? (
        <ListSkeleton rows={3} />
      ) : sorted.length === 0 ? (
        <Empty icon={<Inbox className="size-8" />} title="Nada pendiente">
          Cuando un jugador suba juegos desde su página aparecerán aquí.
        </Empty>
      ) : (
        sorted.map((s) => {
          // Envío por fecha: va a la práctica de ese día si ya existe (si no, se crea al aprobar).
          const event = s.eventId
            ? events.data.find((e) => e.id === s.eventId)
            : events.data.find((e) => e.type === 'practica' && e.date === s.date);
          return (
            <SubmissionCard
              key={s.id}
              sub={s}
              event={event}
              events={events.data}
              player={players.data.find((p) => p.id === s.playerId)}
              entry={event ? entries.data.find((e) => e.eventId === event.id && e.playerId === s.playerId) ?? null : null}
            />
          );
        })
      )}
    </div>
  );
}

function SubmissionCard({
  sub,
  event,
  events,
  player,
  entry,
}: {
  sub: Submission;
  event?: BowlingEvent;
  events: BowlingEvent[];
  player?: Player;
  entry: Entry | null;
}) {
  const { lid, league, myPlayerId } = useLeagueCtx();
  const run = useAction();
  const { toast } = useFeedback();
  const photo = usePhoto(lid, sub.photoId);
  // La liga exige foto pero el jugador lo envió sin ella: el admin decide si lo acepta.
  const unverified = !sub.photoId && league.requirePhoto !== false;
  const [showFrames, setShowFrames] = useState(false);
  const [values, setValues] = useState<string[]>([]);
  const [start, setStart] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  // Juegos por posición (J1, J2...); se propone lo leído por la IA y, si no hay, lo anotado.
  const typed = sub.scores ?? [];
  const scanned = sub.scanned ?? [];
  const count = Math.max(typed.length, scanned.length);
  const rows = Array.from({ length: count }, (_, i) => ({ typed: typed[i] ?? null, scanned: scanned[i] ?? null }));
  // Juegos del evento destino (una práctica nueva por fecha tiene al menos 3, o los que subió).
  const games = event?.games ?? Math.max(3, count);

  useEffect(() => {
    setValues(rows.map((r) => String(r.scanned ?? r.typed ?? '')));
    // Envío de un evento: cada juego va en su lugar (J2 es el J2; un juego vacío es que no lo mandó).
    // Por fecha (práctica sin crear o ya creada), se buscan los primeros juegos libres.
    setStart(sub.eventId ? 0 : firstFreeSlot(entry, games, rows.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.id, event?.id, entry == null]);

  // Lo que se propone guardar: lo leído por la IA y, si no hay, lo anotado.
  const proposal = rows.map((r) => String(r.scanned ?? r.typed ?? ''));
  // La foto se lee en segundo plano, así que lo leído puede llegar con la tarjeta abierta. Si lo pidió el
  // admin (Leer con IA) y no tocó nada, se propone solo; si llegó del teléfono del jugador, no se cambia lo
  // que el admin está revisando: se marca y se ofrece "Usar lo leído".
  const edited = useRef(false);
  const proposeRead = useRef(false);
  const mounted = useRef(false);
  const [lateRead, setLateRead] = useState(false);
  const scannedKey = JSON.stringify(sub.scanned ?? null);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (proposeRead.current) {
      proposeRead.current = false;
      if (!edited.current) setValues(proposal);
    } else if (sub.scanned != null) {
      setLateRead(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannedKey]);
  const readDiffers = lateRead && proposal.some((v, k) => (values[k] ?? '') !== v);

  if ((!event && !sub.date) || !player) {
    return (
      <Card className="flex items-center justify-between px-4 py-3 text-sm text-muted">
        Envío de un jugador o evento que ya no existe.
        <Button size="sm" onClick={() => run(() => rejectSubmission(lid, sub, 'Evento o jugador eliminado'))}>
          Descartar
        </Button>
      </Card>
    );
  }

  const verified = slots(entry?.photos, games, null);
  const invalid = values.some((v) => v.trim() !== '' && !isValidScore(Number(v)));
  const toSave = values.filter((v, k) => v.trim() !== '' && start + k < games).length;

  async function approve() {
    if (!player) return;
    setBusy(true);
    const map: Record<number, number> = {};
    values.forEach((v, k) => {
      if (v.trim() !== '' && start + k < games) map[start + k] = Number(v);
    });
    const ok = await run(async () => {
      const target = event ?? (await practiceForDate(lid, events, sub.date!, count));
      const average = entry ? entry.average : ((await fetchEffectiveAverages(lid, [player])).get(player.id) ?? 0);
      await approveSubmission(lid, sub, target, entry, average, map, start);
      return true;
    });
    setBusy(false);
    if (ok) toast(`Aprobado: ${toSave} ${toSave === 1 ? 'juego' : 'juegos'} de ${player.name}`);
  }

  async function reject() {
    setRejecting(false);
    await run(() => rejectSubmission(lid, sub, note.trim() || null), 'Envío rechazado');
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar name={player.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{player.name}</span>
            {/* El dueño y los admins también juegan: sus propios envíos se aprueban aquí igual. */}
            {sub.playerId === myPlayerId && <Badge>Tú</Badge>}
            {unverified && (
              <Badge tone="warn">
                <AlertTriangle className="size-3" /> Sin foto
              </Badge>
            )}
          </div>
          <div className="truncate text-xs text-muted">
            {event ? eventTitle(event) : `Práctica ${formatDate(sub.date!)} · se crea al aprobar`}
          </div>
        </div>
        {sub.createdAt && <span className="hidden text-xs text-muted sm:block">{new Date(sub.createdAt.toMillis()).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}</span>}
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {unverified ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-warn/50 bg-warn-soft px-4 py-5 text-center text-sm text-warn">
            <AlertTriangle className="size-6" />
            <p className="font-semibold">Enviado sin foto del marcador</p>
            <p className="text-xs">Esta liga exige foto. Apruébalo solo si confías en los juegos; si no, recházalo y pídele la foto.</p>
          </div>
        ) : !sub.photoId ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm text-muted">
            <ImageOff className="size-6" /> Sin foto (la liga no la exige)
          </div>
        ) : photo.data ? (
          <PhotoView src={photo.data.data} />
        ) : (
          <Skeleton className="h-48 w-full rounded-xl" />
        )}
        <div className="flex flex-col gap-3">
          {sub.photoId && (
            <PhotoReading sub={sub} player={player} photoData={photo.data?.data ?? null} onApply={() => (proposeRead.current = true)} />
          )}
          {sub.scannedName && (
            <p className="text-xs text-muted">
              La IA tomó la fila <b className="text-fg">{sub.scannedName}</b> de la foto.
            </p>
          )}
          {readDiffers && (
            <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
              <Sparkles className="size-4 shrink-0" />
              <span className="flex-1">Llegó lo que leyó la IA y no coincide con lo que se va a guardar.</span>
              <Button
                size="sm"
                onClick={() => {
                  edited.current = false;
                  setLateRead(false);
                  setValues(proposal);
                }}
              >
                Usar lo leído
              </Button>
            </div>
          )}
          {sub.frames && Object.keys(sub.frames).length > 0 && (
            <div className="flex flex-col gap-2">
              <Button size="sm" className="self-start" icon={<Grid3x3 className="size-4" />} onClick={() => setShowFrames((v) => !v)}>
                {showFrames ? 'Ocultar cuadros' : 'Ver cuadros que anotó'}
              </Button>
              {showFrames &&
                Object.entries(sub.frames).map(([k, f]) => (
                  <div key={k} className="flex flex-col gap-1">
                    <span className="text-xs text-muted">J{+k + 1}</span>
                    <FramesGrid rolls={f.rolls} compact />
                  </div>
                ))}
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1 text-left font-medium">Juego</th>
                <th className="py-1 text-right font-medium">Anotó</th>
                <th className="py-1 text-right font-medium">Leyó la IA</th>
                <th className="py-1 text-right font-medium">Se guarda</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => {
                const slot = start + k;
                const mismatch = r.typed != null && r.scanned != null && r.typed !== r.scanned;
                return (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1.5">
                      {slot < games ? `J${slot + 1}` : <span className="text-danger">fuera</span>}
                      {slot < games && verified[slot] && <span className="ml-1 text-[10px] text-muted">(reemplaza)</span>}
                    </td>
                    <td className={cx('py-1.5 text-right tabular-nums', mismatch && 'text-warn')}>{r.typed ?? '—'}</td>
                    <td className={cx('py-1.5 text-right tabular-nums', mismatch && 'text-warn')}>{r.scanned ?? '—'}</td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={values[k] ?? ''}
                        onChange={(e) => {
                          edited.current = true;
                          setValues((vs) => vs.map((x, j) => (j === k ? e.target.value : x)));
                        }}
                        aria-label={`Juego ${slot + 1}`}
                        className="h-9 w-16 rounded-lg border border-line bg-surface text-center font-semibold tabular-nums"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Field label="Guardar desde el juego">
            <Select value={start} onChange={(e) => setStart(+e.target.value)}>
              {Array.from({ length: games }, (_, i) => (
                <option key={i} value={i}>
                  Juego {i + 1}
                </option>
              ))}
            </Select>
          </Field>
          {!entry && <p className="text-xs text-muted">{player.name} no estaba en este evento: se inscribe al aprobar.</p>}
          <div className="mt-auto flex gap-2">
            <Button className="flex-1" icon={<X className="size-4" />} onClick={() => setRejecting(true)}>
              Rechazar
            </Button>
            <Button className="flex-1" variant="primary" icon={<Check className="size-4" />} loading={busy} disabled={invalid || !toSave} onClick={approve}>
              Aprobar {toSave || ''}
            </Button>
          </div>
        </div>
      </div>
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Rechazar envío"
        footer={
          <>
            <Button onClick={() => setRejecting(false)}>Cancelar</Button>
            <Button variant="danger" onClick={reject}>
              Rechazar
            </Button>
          </>
        }
      >
        <Field label="Motivo (lo verá el jugador)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. la foto no se lee" />
        </Field>
      </Modal>
    </Card>
  );
}

/** Lecturas de fotos que pidió el admin, por envío (siguen aunque cambie de pantalla y vuelva). */
const adminReads = new Map<string, { jobId: string; pick: boolean }>();

/**
 * Lo que leyó la IA de la foto del envío. Recién enviado, puede que el teléfono del jugador todavía la
 * esté leyendo (se lee en segundo plano); si no llegó (cerró la app, sin señal, no encontró su fila),
 * el admin la lee aquí. Con lo leído ya puesto, se puede volver a leer o elegir otra fila de la foto.
 */
function PhotoReading({ sub, player, photoData, onApply }: { sub: Submission; player: Player; photoData: string | null; onApply: () => void }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const now = useNow(30_000);
  const [read, setRead] = useState(() => adminReads.get(sub.id) ?? null);
  const job = useScanJob(read?.jobId ?? null);
  const found = job?.status === 'listo' ? job.rows : null;
  const match = found ? rowFor(player.name, found) : null;
  // Elegir la fila: si se pidió (cambiar fila) o si ninguna es la del jugador.
  const choices = found && (read?.pick || !match) ? found : null;
  const [picked, setPicked] = useState('');
  const busy = job?.status === 'leyendo' || job?.status === 'esperando';
  const hasRead = sub.scanned != null;
  const fresh = !!sub.createdAt && now.getTime() - sub.createdAt.toMillis() < FRESH_MS;

  function forget() {
    adminReads.delete(sub.id);
    setRead(null);
    setPicked('');
  }

  function apply(row: ScanRow) {
    onApply();
    void run(() => setSubmissionScan(lid, sub.id, row.games, row.name));
  }

  function start(pick: boolean) {
    if (!photoData) return;
    const next = { jobId: startScan(photoData), pick };
    adminReads.set(sub.id, next);
    setRead(next);
    scanDone(next.jobId)
      .then((rows) => {
        const row = rowFor(player.name, rows);
        // Si se sabe cuál es su fila, se pone sola; si no (o se pidió cambiarla), el admin la elige.
        if (row && !pick) {
          adminReads.delete(sub.id);
          apply(row);
        } else if (row) {
          setPicked(String(rows.indexOf(row)));
        }
      })
      .catch(() => undefined);
  }

  if (hasRead && !read) {
    return photoData ? (
      <Button variant="ghost" size="sm" className="self-start" icon={<RotateCcw className="size-4" />} onClick={() => start(true)}>
        Leer de nuevo o elegir otra fila
      </Button>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
      {job?.status === 'leyendo' ? (
        <span className="flex items-center gap-2 text-accent">
          <Spinner className="text-accent" /> Leyendo la foto con IA…
        </span>
      ) : job?.status === 'esperando' ? (
        <span className="flex items-center gap-2 text-muted">
          {job.motivo === 'sin-senal' ? <WifiOff className="size-4 shrink-0" /> : <Clock className="size-4 shrink-0" />} {waitingText(job.motivo)}
        </span>
      ) : job?.status === 'error' ? (
        <span className="flex items-start gap-2 text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {job.message} Revísala tú.
        </span>
      ) : choices ? (
        <span className="text-muted">
          {read?.pick && match ? `¿Cuál fila de la foto es la de ${player.name}?` : `No encontramos a ${player.name} en la foto. ¿Cuál fila es?`}
        </span>
      ) : hasRead ? null : fresh ? (
        <span className="flex items-center gap-2 text-muted">
          <Clock className="size-4 shrink-0" /> Puede que el teléfono de {player.name} todavía esté leyendo la foto.
        </span>
      ) : (
        <span className="flex items-center gap-2 text-warn">
          <AlertTriangle className="size-4 shrink-0" /> La IA no leyó esta foto (no pudo o no encontró la fila de {player.name}).
        </span>
      )}
      {choices && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Fila de la foto" className="min-w-0 flex-1">
            <option value="" disabled>
              — Elegir fila —
            </option>
            {choices.map((r, i) => (
              <option key={i} value={i}>
                {r.name}: {r.games.map((g) => g ?? '–').join(' · ')}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="primary"
            disabled={picked === ''}
            onClick={() => {
              const row = choices[+picked];
              if (!row) return;
              forget();
              apply(row);
            }}
          >
            Usar esta fila
          </Button>
          <Button size="sm" onClick={forget}>
            Cancelar
          </Button>
        </div>
      )}
      {!busy && !choices && photoData && (!hasRead || job?.status === 'error') && (
        <Button size="sm" className="self-start" icon={<ScanLine className="size-4" />} onClick={() => start(hasRead)}>
          {job?.status === 'error' ? 'Intentar de nuevo' : 'Leer con IA'}
        </Button>
      )}
    </div>
  );
}
