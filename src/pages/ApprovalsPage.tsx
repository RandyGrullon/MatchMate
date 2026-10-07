import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Clock, Grid3x3, ImageOff, Inbox, RotateCcw, ScanLine, Sparkles, WifiOff, X } from 'lucide-react';
import {
  approveSubmission,
  fetchEffectiveAverages,
  practiceForDate,
  rejectSubmission,
  setSubmissionScan,
  useAllEntries,
  useEvents,
  usePlayers,
  useSubmissions,
} from '../lib/data';
import { eventTitle, formatDate } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { usePhoto } from '../lib/photos';
import { rowFor, type ScanRow } from '../lib/scan-result';
import { scanDone, startScan, useScanJob, waitingText } from '../lib/scanJobs';
import { firstFreeSlot, isValidScore, slots } from '../lib/stats';
import { useNow } from '../lib/useNow';
import type { BowlingEvent, Entry, Player, Submission } from '../lib/types';
import { useAction, useFeedback } from '../components/feedback';
import { BusyIcon, useBusy } from '../components/busy';
import { PhotoView } from '../components/PhotoModal';
import { FramesGrid } from '../components/frames/FramesGrid';
import { photosLine, shortName } from '../components/organizer/hubLogic';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, LoadError, Modal, Select, Skeleton, Spinner, cx } from '../components/ui';

/** Tiempo en que el teléfono del jugador todavía puede estar leyendo la foto después de enviarla. */
const FRESH_MS = 5 * 60_000;

/** Lo que «Aprobar todo» necesita de cada envío: si está listo y cómo se aprueba (con lo que tiene puesto ahora). */
interface Approver {
  ready: boolean;
  games: number;
  approve: () => Promise<boolean>;
}

interface ApproveAllApi {
  /** Cada envío se anota (y se quita al irse). */
  register: (id: string, get: () => Approver) => () => void;
  /** «Aprobar todo» está corriendo: los botones de cada envío esperan. */
  running: boolean;
}

const ApproveAll = createContext<ApproveAllApi | null>(null);

/**
 * Organizar › Aprobar juegos: los envíos de los jugadores (lo más viejo primero) en una tarjeta, con «Por aprobar · 2
 * con foto» y «Aprobar todo» arriba; cada uno con su foto, «Juego 2 · 181», Rechazar y Aprobar. Al tocarlo se abre la
 * foto, lo que leyó la IA, los cuadros y los juegos para corregir antes de aprobar (y desde qué juego se guardan). Lo
 * aprobado cuenta en la tabla y en las estadísticas; lo pendiente no suma.
 */
export default function ApprovalsPage() {
  const { lid } = useLeagueCtx();
  const subs = useSubmissions(lid, 'pendiente');
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const entries = useAllEntries(lid);
  const { confirm, toast } = useFeedback();
  const all = useBusy();
  const approvers = useRef(new Map<string, () => Approver>());

  const sorted = useMemo(
    () => [...subs.data].sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)),
    [subs.data],
  );
  // De más de un evento (o fecha): cada envío dice de cuál es.
  const showEvent = new Set(sorted.map((s) => s.eventId ?? `fecha:${s.date ?? ''}`)).size > 1;

  const register = useCallback((id: string, get: () => Approver) => {
    approvers.current.set(id, get);
    return () => {
      if (approvers.current.get(id) === get) approvers.current.delete(id);
    };
  }, []);
  const running = all.isBusy();
  const api = useMemo(() => ({ register, running }), [register, running]);

  async function approveAll() {
    const list = [...approvers.current.values()].map((get) => get());
    const ready = list.filter((a) => a.ready);
    if (!ready.length) return;
    const games = ready.reduce((n, a) => n + a.games, 0);
    const left = list.length - ready.length;
    const ok = await confirm({
      title: ready.length === 1 ? '¿Aprobar el envío?' : `¿Aprobar los ${ready.length} envíos?`,
      message: `Se guardan ${games} ${games === 1 ? 'juego' : 'juegos'} como están ahora y ${games === 1 ? 'cuenta' : 'cuentan'} en la tabla.${
        left ? ` ${left === 1 ? 'Uno queda' : `${left} quedan`} para que ${left === 1 ? 'lo revises' : 'los revises'} uno por uno (sin foto o con algo por corregir).` : ''
      }`,
      confirmText: 'Aprobar todo',
    });
    if (!ok) return;
    await all.run('todo', async () => {
      let done = 0;
      let saved = 0;
      for (const a of ready) {
        if (await a.approve()) {
          done++;
          saved += a.games;
        }
      }
      if (done) toast(`Aprobados: ${saved} ${saved === 1 ? 'juego' : 'juegos'} de ${done} ${done === 1 ? 'jugador' : 'jugadores'}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {subs.error ? (
        <LoadError error={subs.error} />
      ) : subs.loading || events.loading || players.loading ? (
        <ListSkeleton rows={3} />
      ) : sorted.length === 0 ? (
        <Empty icon={<Inbox className="size-8" />} title="Nada por aprobar">
          Cuando un jugador envíe sus juegos, salen aquí con su foto. Al aprobarlos cuentan en la tabla.
        </Empty>
      ) : (
        <ApproveAll.Provider value={api}>
          <Card className="overflow-hidden">
            <div className="flex min-h-11 items-center gap-2 pt-1.5 pr-2 pl-4">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warn" />
              <p className="min-w-0 flex-1 py-1 text-sm leading-snug font-[650] text-warn">Por aprobar · {photosLine(sorted.map((s) => ({ hasPhoto: !!s.photoId })))}</p>
              {/* Mientras corre se queda (con su ruedita) aunque ya quede uno solo. */}
              {(sorted.length > 1 || running) && (
                <button
                  type="button"
                  onClick={() => void approveAll()}
                  disabled={running}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm font-[650] text-accent transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
                >
                  <BusyIcon busy={running} className="size-4" />
                  Aprobar todo
                </button>
              )}
            </div>
            {sorted.map((s) => {
              // Envío por fecha: va a la práctica de ese día si ya existe (si no, se crea al aprobar).
              const event = s.eventId
                ? events.data.find((e) => e.id === s.eventId)
                : events.data.find((e) => e.type === 'practica' && e.date === s.date);
              return (
                <SubmissionRow
                  key={s.id}
                  sub={s}
                  event={event}
                  events={events.data}
                  showEvent={showEvent}
                  player={players.data.find((p) => p.id === s.playerId)}
                  entry={event ? (entries.data.find((e) => e.eventId === event.id && e.playerId === s.playerId) ?? null) : null}
                />
              );
            })}
          </Card>
          <p className="px-1 text-sm text-muted">Toca un envío para ver la foto, lo que leyó la IA y corregir un juego antes de aprobarlo.</p>
        </ApproveAll.Provider>
      )}
    </div>
  );
}

/**
 * Rechazar (con contorno) y Aprobar (en el color del deporte, suave) de cada envío: se ven compactos, como en el
 * diseño, y se tocan en 44 px. Mientras espera, la ruedita en lugar del texto (el botón no cambia de ancho).
 */
function RowButton({
  line,
  busy,
  disabled,
  ariaLabel,
  onClick,
  children,
}: {
  line?: boolean;
  busy: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      className={cx(
        'group inline-flex h-11 items-center outline-none select-none disabled:pointer-events-none',
        disabled && !busy && 'opacity-50',
      )}
    >
      <span
        className={cx(
          'relative inline-flex h-9 items-center justify-center rounded-[11px] px-2.5 text-[13.5px] font-semibold whitespace-nowrap transition group-active:scale-[0.97]',
          'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent',
          line ? 'text-fg shadow-[inset_0_0_0_1.5px_var(--color-line)]' : 'bg-accent-soft text-accent',
        )}
      >
        <span className={cx(busy && 'invisible')}>{children}</span>
        {busy && (
          <span className="absolute inset-0 grid place-items-center">
            <BusyIcon busy className="size-4" />
          </span>
        )}
      </span>
    </button>
  );
}

/** Cómo quedan los juegos del envío: «Juego 2 · 181» o «J1 187 · J2 210» (el número en negrita). */
function GamesLine({ values, start }: { values: readonly string[]; start: number }) {
  const games = values.map((v, k) => ({ slot: start + k + 1, v: v.trim() })).filter((g) => g.v !== '');
  if (!games.length) return <>Sin juegos</>;
  if (games.length === 1)
    return (
      <>
        Juego {games[0].slot} · <b className="num font-semibold text-fg">{games[0].v}</b>
      </>
    );
  return (
    <>
      {games.map((g, i) => (
        <span key={g.slot}>
          {i > 0 && ' · '}J{g.slot} <b className="num font-semibold text-fg">{g.v}</b>
        </span>
      ))}
    </>
  );
}

function SubmissionRow({
  sub,
  event,
  events,
  showEvent,
  player,
  entry,
}: {
  sub: Submission;
  event?: BowlingEvent;
  events: BowlingEvent[];
  showEvent: boolean;
  player?: Player;
  entry: Entry | null;
}) {
  const { lid, league, myPlayerId } = useLeagueCtx();
  const run = useAction();
  const { toast } = useFeedback();
  const all = useContext(ApproveAll);
  const photo = usePhoto(lid, sub.photoId);
  // La liga exige foto pero el jugador lo envió sin ella: el admin decide si lo acepta.
  const unverified = !sub.photoId && league.requirePhoto !== false;
  const [open, setOpen] = useState(false);
  const [showFrames, setShowFrames] = useState(false);
  const busy = useBusy<'aprobar' | 'rechazar' | 'descartar'>();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  // Juegos por posición (J1, J2...); se propone lo leído por la IA y, si no hay, lo anotado.
  const typed = sub.scores ?? [];
  const scanned = sub.scanned ?? [];
  const count = Math.max(typed.length, scanned.length);
  const rows = Array.from({ length: count }, (_, i) => ({ typed: typed[i] ?? null, scanned: scanned[i] ?? null }));
  // Juegos del evento destino (una práctica nueva por fecha tiene al menos 3, o los que subió).
  const games = event?.games ?? Math.max(3, count);
  // Desde el primer dibujo con lo que se propone (sin un «Sin juegos» de paso); el efecto lo vuelve a poner si cambia.
  const [values, setValues] = useState<string[]>(() => rows.map((r) => String(r.scanned ?? r.typed ?? '')));
  const [start, setStart] = useState(() => (sub.eventId ? 0 : firstFreeSlot(entry, games, rows.length)));

  useEffect(() => {
    setValues(rows.map((r) => String(r.scanned ?? r.typed ?? '')));
    // Envío de un evento: cada juego va en su lugar (J2 es el J2; un juego vacío es que no lo mandó).
    // Por fecha (práctica sin crear o ya creada), se buscan los primeros juegos libres.
    setStart(sub.eventId ? 0 : firstFreeSlot(entry, games, rows.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.id, event?.id, entry == null]);

  // Lo que se propone guardar: lo leído por la IA y, si no hay, lo anotado.
  const proposal = rows.map((r) => String(r.scanned ?? r.typed ?? ''));
  // La foto se lee en segundo plano, así que lo leído puede llegar con el envío abierto. Si lo pidió el
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

  const gone = (!event && !sub.date) || !player;
  const verified = slots(entry?.photos, games, null);
  const invalid = values.some((v) => v.trim() !== '' && !isValidScore(Number(v)));
  const toSave = values.filter((v, k) => v.trim() !== '' && start + k < games).length;
  const locked = busy.isBusy() || !!all?.running;

  async function approve(silent = false): Promise<boolean> {
    if (!player) return false;
    const map: Record<number, number> = {};
    values.forEach((v, k) => {
      if (v.trim() !== '' && start + k < games) map[start + k] = Number(v);
    });
    const ok = await busy.run('aprobar', () =>
      run(async () => {
        const target = event ?? (await practiceForDate(lid, events, sub.date!, count));
        const average = entry
          ? entry.average
          : ((await fetchEffectiveAverages(lid, [player], { date: target.date, eventId: target.id || null })).get(player.id) ?? 0);
        await approveSubmission(lid, sub, target, entry, average, map, start);
        return true;
      }),
    );
    if (ok && !silent) toast(`Aprobado: ${toSave} ${toSave === 1 ? 'juego' : 'juegos'} de ${player.name}`);
    return !!ok;
  }

  // «Aprobar todo» toma lo que este envío tiene puesto ahora. Sin foto (cuando la liga la exige) o con algo mal
  // escrito, se queda para revisarlo uno por uno.
  const self = useRef<() => Approver>(() => ({ ready: false, games: 0, approve: async () => false }));
  self.current = () => ({ ready: !gone && !invalid && toSave > 0 && !unverified, games: toSave, approve: () => approve(true) });
  const register = all?.register;
  useEffect(() => register?.(sub.id, () => self.current()), [register, sub.id]);

  async function reject() {
    // El modal se cierra y la ruedita sale en «Rechazar» del envío.
    setRejecting(false);
    await busy.run('rechazar', () => run(() => rejectSubmission(lid, sub, note.trim() || null), 'Envío rechazado'));
  }

  if (gone) {
    return (
      <div className="mm-row relative flex items-center gap-3 py-2.5 pr-3.5 pl-4 text-sm text-muted">
        <span className="min-w-0 flex-1">Envío de un jugador o evento que ya no existe.</span>
        <Button
          className="h-11"
          loading={busy.isBusy('descartar')}
          disabled={locked}
          onClick={() => void busy.run('descartar', () => run(() => rejectSubmission(lid, sub, 'Evento o jugador eliminado')))}
        >
          Descartar
        </Button>
      </div>
    );
  }

  const where = event ? eventTitle(event) : `Práctica ${formatDate(sub.date!)} · se crea al aprobar`;

  return (
    <div className="mm-row relative pr-3.5 pl-3.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${player.name}: ${open ? 'cerrar' : 'ver la foto y los juegos'}`}
          className="flex min-h-[58px] min-w-[7.5rem] flex-1 basis-0 items-center gap-2.5 rounded-xl text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span
            aria-hidden="true"
            className={cx('grid size-10 shrink-0 place-items-center overflow-hidden rounded-[10px]', unverified ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-faint')}
          >
            {photo.data ? (
              <img src={photo.data.url} alt="" className="size-full object-cover" draggable={false} />
            ) : sub.photoId && photo.loading ? (
              <Camera className="size-5" />
            ) : (
              <ImageOff className="size-5" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{shortName(player.name)}</span>
              {/* El dueño y los admins también juegan: sus propios envíos se aprueban aquí igual. */}
              {sub.playerId === myPlayerId && <Badge tone="accent">Tú</Badge>}
            </span>
            <span className="mt-px block truncate text-[13px] text-muted">
              {unverified && <span className="font-medium text-warn">Sin foto · </span>}
              {showEvent && `${event ? eventTitle(event) : formatDate(sub.date!)} · `}
              <GamesLine values={values} start={start} />
            </span>
          </span>
        </button>
        <div className="ml-auto flex shrink-0 gap-1.5">
          <RowButton
            line
            busy={busy.isBusy('rechazar')}
            disabled={locked}
            ariaLabel={`Rechazar el envío de ${player.name}`}
            onClick={() => setRejecting(true)}
          >
            Rechazar
          </RowButton>
          <RowButton
            busy={busy.isBusy('aprobar')}
            disabled={invalid || !toSave || locked}
            ariaLabel={`Aprobar ${toSave} ${toSave === 1 ? 'juego' : 'juegos'} de ${player.name}`}
            onClick={() => void approve()}
          >
            Aprobar
          </RowButton>
        </div>
      </div>

      {open && (
        <div className="animate-fade-up mt-3 grid gap-4 pb-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {unverified ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-warn-soft px-4 py-5 text-center text-sm text-warn">
              <AlertTriangle className="size-6" />
              <p className="font-semibold">Enviado sin foto del marcador</p>
              <p className="text-xs">Esta liga exige foto. Apruébalo solo si confías en los juegos; si no, recházalo y pídele la foto.</p>
            </div>
          ) : !sub.photoId ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-2 text-sm text-muted">
              <ImageOff className="size-6" /> Sin foto (la liga no la exige)
            </div>
          ) : photo.data ? (
            <PhotoView src={photo.data.url} />
          ) : photo.loading ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : (
            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-2 text-sm text-muted">
              <ImageOff className="size-6" /> {photo.error ? 'No se pudo cargar la foto (¿sin señal?)' : 'La foto ya no existe'}
            </div>
          )}
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              {where}
              {sub.createdAt && ` · enviado ${new Date(sub.createdAt.toMillis()).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}`}
            </p>
            {sub.photoId && <PhotoReading sub={sub} player={player} photoUrl={photo.data?.url ?? null} onApply={() => (proposeRead.current = true)} />}
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
                  className="h-11"
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
                <Button size="sm" className="h-11 self-start" icon={<Grid3x3 className="size-4" />} onClick={() => setShowFrames((v) => !v)}>
                  {showFrames ? 'Ocultar cuadros' : 'Ver cuadros que anotó'}
                </Button>
                {showFrames &&
                  Object.entries(sub.frames).map(([k, f]) => (
                    <div key={k} className="flex flex-col gap-1">
                      <span className="text-xs text-muted">J{+k + 1}</span>
                      <FramesGrid rolls={f.rolls} masks={f.masks} compact />
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
                          className="h-11 w-16 rounded-xl border border-line bg-surface text-center font-semibold tabular-nums"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Field label="Guardar desde el juego">
              <Select value={start} onChange={(e) => setStart(+e.target.value)} className="h-11">
                {Array.from({ length: games }, (_, i) => (
                  <option key={i} value={i}>
                    Juego {i + 1}
                  </option>
                ))}
              </Select>
            </Field>
            {!entry && <p className="text-xs text-muted">{player.name} no estaba en este evento: se inscribe al aprobar.</p>}
          </div>
        </div>
      )}
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Rechazar envío"
        footer={
          <>
            <Button onClick={() => setRejecting(false)}>Cancelar</Button>
            <Button variant="danger" icon={<X className="size-4" />} onClick={reject}>
              Rechazar
            </Button>
          </>
        }
      >
        <Field label="Motivo (lo verá el jugador)">
          <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ej. la foto no se lee" />
        </Field>
      </Modal>
    </div>
  );
}

/** Lecturas de fotos que pidió el admin, por envío (siguen aunque cambie de pantalla y vuelva). */
const adminReads = new Map<string, { jobId: string; pick: boolean }>();

/**
 * Lo que leyó la IA de la foto del envío. Recién enviado, puede que el teléfono del jugador todavía la
 * esté leyendo (se lee en segundo plano); si no llegó (cerró la app, sin señal, no encontró su fila),
 * el admin la lee aquí (con la foto guardada: se baja de su URL firmada y va a la Edge Function). Con lo leído
 * ya puesto, se puede volver a leer (la misma foto sale de la caché de 24 h, sin gastar cupo) o elegir otra fila.
 */
function PhotoReading({ sub, player, photoUrl, onApply }: { sub: Submission; player: Player; photoUrl: string | null; onApply: () => void }) {
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
  // Guardando la fila leída en el envío.
  const saving = useBusy();
  const busy = job?.status === 'leyendo' || job?.status === 'esperando';
  const hasRead = sub.scanned != null;
  const fresh = !!sub.createdAt && now.getTime() - sub.createdAt.toMillis() < FRESH_MS;

  function forget() {
    adminReads.delete(sub.id);
    setRead(null);
    setPicked('');
  }

  function apply(row: ScanRow) {
    return saving.run('fila', () => {
      onApply();
      return run(() => setSubmissionScan(lid, sub.id, row.games, row.name));
    });
  }

  function start(pick: boolean) {
    if (!photoUrl) return;
    const next = { jobId: startScan(photoUrl, { leagueId: lid, eventId: sub.eventId ?? null }), pick };
    adminReads.set(sub.id, next);
    setRead(next);
    scanDone(next.jobId)
      .then((rows) => {
        const row = rowFor(player.name, rows);
        // Si se sabe cuál es su fila, se pone sola; si no (o se pidió cambiarla), el admin la elige.
        if (row && !pick) {
          adminReads.delete(sub.id);
          void apply(row);
        } else if (row) {
          setPicked(String(rows.indexOf(row)));
        }
      })
      .catch(() => undefined);
  }

  if (hasRead && !read) {
    return photoUrl ? (
      <Button variant="ghost" size="sm" className="h-11 self-start" icon={<RotateCcw className="size-4" />} onClick={() => start(true)}>
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
      ) : saving.isBusy() && !choices ? (
        <span className="flex items-center gap-2 text-accent">
          <Spinner className="text-accent" /> Guardando lo leído…
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
          <Select value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Fila de la foto" className="h-11 min-w-0 flex-1">
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
            className="h-11"
            loading={saving.isBusy()}
            disabled={picked === ''}
            onClick={() => {
              const row = choices[+picked];
              if (!row) return;
              // Se queda la fila elegida (con la ruedita) hasta que se guarda.
              void apply(row).then(forget);
            }}
          >
            Usar esta fila
          </Button>
          <Button size="sm" className="h-11" onClick={forget}>
            Cancelar
          </Button>
        </div>
      )}
      {!busy && !saving.isBusy() && !choices && photoUrl && (!hasRead || job?.status === 'error') && (
        <Button size="sm" className="h-11 self-start" icon={<ScanLine className="size-4" />} onClick={() => start(hasRead)}>
          {job?.status === 'error' ? 'Intentar de nuevo' : 'Leer con IA'}
        </Button>
      )}
    </div>
  );
}
