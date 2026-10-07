import { useState } from 'react';
import { Link } from 'react-router';
import { ImageOff } from 'lucide-react';
import { approveSubmission, fetchEffectiveAverages, rejectSubmission } from '../../lib/data';
import { useLeagueCtx } from '../../lib/league';
import { usePhoto } from '../../lib/photos';
import { isValidScore } from '../../lib/stats';
import type { BowlingEvent, Entry, Player, Submission } from '../../lib/types';
import { BusyIcon, useBusy } from '../busy';
import { useAction, useFeedback } from '../feedback';
import { PhotoModal } from '../PhotoModal';
import { Button, Card, Field, Input, Modal, cx } from '../ui';
import { gamesList, shortName } from './board';

/** Lo que se aprueba de un envío con un toque: juego (desde 0) → pinos. */
export interface QuickApproval {
  values: Record<number, number>;
  /** Los juegos, en orden. */
  games: number[];
}

/**
 * Lo que «Aprobar» guarda de un envío sin abrirlo, o null si hay que revisarlo (Organizar › Aprobar, con la foto en
 * grande y lo que leyó la IA): lo leído en la foto o, si no hay, lo anotado (como propone la hoja de aprobar), cada
 * juego en su lugar del evento. Se revisa si lo anotado y lo leído no coinciden, si algún número no vale, si no cabe en
 * el evento o si llegó sin la foto que la liga exige.
 */
export function quickApproval(sub: Pick<Submission, 'scores' | 'scanned' | 'photoId'>, games: number, requirePhoto: boolean): QuickApproval | null {
  if (requirePhoto && !sub.photoId) return null;
  const typed = sub.scores ?? [];
  const scanned = sub.scanned ?? [];
  const values: Record<number, number> = {};
  const idx: number[] = [];
  for (let i = 0; i < Math.max(typed.length, scanned.length); i++) {
    const t = typed[i] ?? null;
    const s = scanned[i] ?? null;
    if (t != null && s != null && t !== s) return null;
    const v = s ?? t;
    if (v == null) continue;
    if (!isValidScore(v) || i >= games) return null;
    values[i] = v;
    idx.push(i);
  }
  return idx.length ? { values, games: idx } : null;
}

/**
 * «Juego 2 · 181» o «Juegos 1 y 2 · 187 · 210» (lo que se aprueba; si hay que revisarlo, lo que anotó). `short`, para un
 * teléfono angosto: «J2», «J1 y J2».
 */
function gamesText(sub: Pick<Submission, 'scores'>, quick: QuickApproval | null): { label: string; short: string; scores: string } {
  const idx = quick ? quick.games : sub.scores.flatMap((s, i) => (s != null ? [i] : []));
  const scores = idx.map((i) => (quick ? quick.values[i] : sub.scores[i])).join(' · ');
  const short = idx.map((i) => `J${i + 1}`);
  return {
    label: `${idx.length === 1 ? 'Juego' : 'Juegos'} ${gamesList(idx)}`,
    short: short.length > 1 ? `${short.slice(0, -1).join(', ')} y ${short[short.length - 1]}` : (short[0] ?? ''),
    scores,
  };
}

/** El encabezado: «Por aprobar · 2 con foto». */
export function approvalTitle(subs: readonly Pick<Submission, 'photoId'>[]): string {
  const n = subs.length;
  const photos = subs.filter((s) => s.photoId).length;
  return `Por aprobar · ${photos === n ? `${n} con foto` : photos ? `${n} · ${photos} con foto` : `${n} sin foto`}`;
}

// Los botones de cada fila se ven de 36 px y se tocan en 44.
const rowButton =
  "relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[11px] px-2.5 text-[13.5px] font-semibold whitespace-nowrap transition active:scale-[0.97] after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";

/**
 * «Por aprobar» arriba de la Planilla (Pro, quien organiza): cada envío de los jugadores con su foto (se toca para verla
 * en grande), quién y qué juego, y **Rechazar / Aprobar** ahí mismo; arriba, «Aprobar todo». Lo que no se puede aprobar
 * con un toque (no coincide con la foto, sin la foto que se exige…) lleva «Revisar», que abre Organizar › Aprobar. Lo
 * pendiente se ve en ámbar en la Planilla y no suma hasta aprobarse.
 */
export function ApprovalCard({
  event,
  subs,
  entries,
  players,
  className,
}: {
  event: BowlingEvent;
  /** Los envíos pendientes de este evento. */
  subs: readonly Submission[];
  entries: readonly Entry[];
  players: readonly Player[];
  className?: string;
}) {
  const { lid, league, base } = useLeagueCtx();
  const run = useAction();
  const { toast } = useFeedback();
  const busy = useBusy();
  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ id: string; title: string } | null>(null);
  const requirePhoto = league.requirePhoto !== false;
  const byId = new Map(players.map((p) => [p.id, p]));
  // Los de un jugador que ya no existe se descartan en Organizar › Aprobar.
  const rows = subs
    .filter((s) => s.status === 'pendiente' && byId.has(s.playerId))
    .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
    .map((sub) => ({ sub, player: byId.get(sub.playerId)!, quick: quickApproval(sub, event.games, requirePhoto) }));
  if (!rows.length) return null;
  const quick = rows.filter((r) => r.quick);

  async function approve(sub: Submission, player: Player, q: QuickApproval) {
    const entry = entries.find((e) => e.playerId === sub.playerId) ?? null;
    const average = entry ? entry.average : ((await fetchEffectiveAverages(lid, [player], { date: event.date, eventId: event.id })).get(player.id) ?? 0);
    await approveSubmission(lid, sub, event, entry, average, q.values, 0);
    return true;
  }

  const approveOne = (r: (typeof rows)[number]) =>
    busy.run(`ok:${r.sub.id}`, () =>
      run(() => approve(r.sub, r.player, r.quick!), `Aprobado: ${r.quick!.games.length === 1 ? 'juego' : 'juegos'} ${gamesList(r.quick!.games)} de ${r.player.name}`),
    );

  const approveAll = () =>
    busy.run('todo', async () => {
      let n = 0;
      for (const r of quick) {
        const ok = await run(() => approve(r.sub, r.player, r.quick!));
        if (!ok) break;
        n += r.quick!.games.length;
      }
      if (n) toast(`Aprobados ${n} ${n === 1 ? 'juego' : 'juegos'}`);
    });

  async function reject() {
    const sub = rejecting;
    if (!sub) return;
    // La hoja se cierra y la ruedita sale en «Rechazar» de la fila.
    setRejecting(null);
    await busy.run(`no:${sub.id}`, () => run(() => rejectSubmission(lid, sub, note.trim() || null), 'Envío rechazado'));
    setNote('');
  }

  return (
    <Card className={cx('px-3.5 pt-3 pb-1.5', className)}>
      <section aria-label="Por aprobar">
        <div className="flex items-center justify-between gap-3 px-0.5 pb-1.5">
          <h3 className="inline-flex min-w-0 items-center gap-2 text-sm font-[650] text-warn">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-warn" />
            <span className="truncate">{approvalTitle(rows.map((r) => r.sub))}</span>
          </h3>
          {quick.length > 1 && (
            <button
              type="button"
              onClick={() => void approveAll()}
              disabled={busy.isBusy()}
              aria-busy={busy.isBusy('todo') || undefined}
              className="-my-3 inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-[650] text-accent disabled:opacity-60"
            >
              <BusyIcon busy={busy.isBusy('todo')} className="size-4" />
              Aprobar todo
            </button>
          )}
        </div>
        {rows.map((r, i) => {
          const { label, short, scores } = gamesText(r.sub, r.quick);
          return (
            <div
              key={r.sub.id}
              className={cx(
                'relative flex items-center gap-2.5 py-[9px]',
                i > 0 && "before:absolute before:top-0 before:right-0 before:left-[50px] before:h-px before:bg-line before:content-['']",
              )}
            >
              <Thumb
                lid={lid}
                photoId={r.sub.photoId}
                name={r.player.name}
                onOpen={() => r.sub.photoId && setPhoto({ id: r.sub.photoId, title: `${r.player.name} · ${label}` })}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{shortName(r.player.name)}</p>
                <p className="mt-px truncate text-[13px] text-muted">
                  {/* En un teléfono angosto, «J2 · 181»: el número no se corta. */}
                  <span className="max-[389px]:hidden">{label}</span>
                  <span className="min-[390px]:hidden">{short}</span> · <b className="num font-[650] text-fg">{scores}</b>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejecting(r.sub)}
                disabled={busy.isBusy()}
                aria-busy={busy.isBusy(`no:${r.sub.id}`) || undefined}
                aria-label={`Rechazar ${label.toLowerCase()} de ${r.player.name}`}
                className={cx(rowButton, '-mr-1 text-fg shadow-[inset_0_0_0_1.5px_var(--line)]')}
              >
                <BusyIcon busy={busy.isBusy(`no:${r.sub.id}`)} className="size-4" />
                Rechazar
              </button>
              {r.quick ? (
                <button
                  type="button"
                  onClick={() => void approveOne(r)}
                  disabled={busy.isBusy()}
                  aria-busy={busy.isBusy(`ok:${r.sub.id}`) || undefined}
                  aria-label={`Aprobar ${label.toLowerCase()} de ${r.player.name}`}
                  className={cx(rowButton, 'bg-accent-soft text-accent')}
                >
                  <BusyIcon busy={busy.isBusy(`ok:${r.sub.id}`)} className="size-4" />
                  Aprobar
                </button>
              ) : (
                <Link to={`${base}/admin?tab=aprobar`} aria-label={`Revisar el envío de ${r.player.name}`} className={cx(rowButton, 'bg-accent-soft text-accent')}>
                  Revisar
                </Link>
              )}
            </div>
          );
        })}
      </section>

      <Modal
        open={rejecting != null}
        onClose={() => setRejecting(null)}
        title="Rechazar envío"
        footer={
          <>
            <Button onClick={() => setRejecting(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => void reject()}>
              Rechazar
            </Button>
          </>
        }
      >
        <Field label="Motivo (lo verá el jugador)">
          <Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Ej. la foto no se lee" />
        </Field>
      </Modal>
      <PhotoModal photoId={photo?.id ?? null} onClose={() => setPhoto(null)} title={photo?.title} />
    </Card>
  );
}

/** La foto del marcador en chiquito (40 px): se toca para verla en grande. Sin foto, el ícono. */
function Thumb({ lid, photoId, name, onOpen }: { lid: string; photoId: string | null; name: string; onOpen: () => void }) {
  const photo = usePhoto(lid, photoId);
  if (!photoId) {
    return (
      <span aria-label="Sin foto" role="img" className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-faint">
        <ImageOff aria-hidden="true" className="size-[18px]" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Ver la foto de ${name}`}
      className="relative size-10 shrink-0 overflow-hidden rounded-[10px] bg-[linear-gradient(160deg,#2b3040,#151822)] transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {photo.data ? (
        <img src={photo.data.url} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        // Mientras llega (o si no carga): un marcador dibujado.
        <span aria-hidden="true">
          <i className="absolute top-[11px] right-[5px] left-[5px] h-[3px] rounded-sm bg-white/35" />
          <i className="absolute top-[19px] right-[14px] left-[5px] h-[3px] rounded-sm bg-white/35" />
          <i className="absolute top-[27px] right-[5px] left-[5px] h-[3px] rounded-sm bg-white/35" />
        </span>
      )}
    </button>
  );
}
