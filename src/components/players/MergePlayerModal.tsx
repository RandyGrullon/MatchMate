import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, BadgeCheck, Check, Merge, Search } from 'lucide-react';
import { mergeBlockText, mergeErrorText, mergePlayers, previewMergePlayers, type MergePreview } from '../../lib/data/players';
import { useLeagueCtx } from '../../lib/league';
import type { Player } from '../../lib/types';
import { Avatar } from '../Avatar';
import { useFeedback } from '../feedback';
import { searchPlayers } from '../league/logic';
import { Badge, Button, Input, Modal, Spinner, cx } from '../ui';
import { mergeCandidates, mergeSummary } from './logic';

/**
 * Admin › Jugadores › «Juntar con…»: alguien quedó dos veces en la lista (con otro nombre, o una vez con cuenta y otra
 * sin cuenta). Se elige al otro, se ve qué pasaría (merge_league_players_preview: si los dos tienen cuenta, si uno es
 * menor, o lo que choca porque jugaron lo mismo) y, al confirmar, todo lo del que se va pasa al que queda
 * (merge_league_players). Si solo el que se va tenía cuenta, la cuenta pasa al que queda.
 */
export function MergePlayerModal({
  open,
  onClose,
  player,
  players,
  onMerged,
}: {
  open: boolean;
  onClose: () => void;
  /** El jugador desde el que se abrió (de entrada, el que queda). */
  player: Player | null;
  players: readonly Player[];
  /** Después de juntar (p. ej. cerrar la ficha del jugador, que pudo borrarse). */
  onMerged?: (keptId: string) => void;
}) {
  const { lid } = useLeagueCtx();
  const { toast, confirm } = useFeedback();
  const [q, setQ] = useState('');
  const [other, setOther] = useState<string | null>(null);
  // Con qué nombre queda: el jugador desde el que se abrió (true) o el otro.
  const [keepMine, setKeepMine] = useState(true);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setOther(null);
    setKeepMine(true);
    setPreview(null);
    setError(null);
  }, [open, player?.id]);

  const candidates = useMemo(() => (player ? mergeCandidates(players, player.id) : []), [players, player]);
  const shown = useMemo(() => searchPlayers(candidates, q), [candidates, q]);
  const otherPlayer = other ? (players.find((p) => p.id === other) ?? null) : null;
  const keep = player && otherPlayer ? (keepMine ? player : otherPlayer) : null;
  const drop = player && otherPlayer ? (keepMine ? otherPlayer : player) : null;

  // Cada vez que cambia la pareja (o cuál queda), se vuelve a preguntar qué pasaría.
  useEffect(() => {
    if (!open || !keep || !drop) return;
    let alive = true;
    setLoading(true);
    setPreview(null);
    setError(null);
    previewMergePlayers(lid, keep.id, drop.id)
      .then((p) => alive && setPreview(p))
      .catch((e) => alive && setError(mergeErrorText(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, lid, keep?.id, drop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function merge() {
    if (busy || !preview?.canMerge || !keep || !drop) return;
    const ok = await confirm({
      title: `¿Juntar a ${drop.name} con ${keep.name}?`,
      message: `${mergeSummary(preview)} No se puede deshacer.`,
      confirmText: 'Juntar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const r = await mergePlayers(lid, keep.id, drop.id);
      toast(`Listo: ${drop.name} quedó junto con ${keep.name}`);
      onClose();
      onMerged?.(r.playerId);
    } catch (e) {
      console.error(e);
      setError(mergeErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const blocked = preview ? mergeBlockText(preview.reason, preview.keep.name, preview.drop.name) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={player ? `Juntar a ${player.name} con…` : 'Juntar jugadores'}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          {otherPlayer && (
            <Button variant="primary" icon={<Merge className="size-4" />} loading={busy} disabled={!preview?.canMerge || loading} onClick={merge}>
              Juntar
            </Button>
          )}
        </>
      }
    >
      {!otherPlayer ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            ¿Está dos veces en la lista (con otro nombre, o una vez con cuenta y otra sin cuenta)? Elige al otro: sus juegos, partidos y «voy» pasan a uno
            solo.
          </p>
          {candidates.length >= 8 && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jugador" aria-label="Buscar jugador" className="pl-9" />
            </div>
          )}
          <div className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {shown.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setOther(p.id)}
                className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-surface-2"
              >
                <Avatar name={p.name} className="size-8 text-xs" />
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                {p.uid ? (
                  <Badge tone="ok">
                    <BadgeCheck className="size-3" aria-hidden="true" /> Con cuenta
                  </Badge>
                ) : p.isMinor ? (
                  <Badge>Menor</Badge>
                ) : null}
              </button>
            ))}
            {shown.length === 0 && (
              <p className="px-3 py-3 text-center text-sm text-muted">{candidates.length ? 'Nadie se llama así en la lista.' : 'No hay nadie más en la lista.'}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setOther(null)}
            className="-ml-1 inline-flex min-h-11 items-center gap-1.5 self-start rounded-lg px-1 text-sm font-medium text-accent hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Elegir a otro
          </button>
          {player && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">¿Con qué nombre queda?</legend>
              {[player, otherPlayer].map((p) => {
                const on = (p.id === player.id) === keepMine;
                return (
                  <label
                    key={p.id}
                    className={cx(
                      'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/50',
                      on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <input type="radio" name="merge-keep" className="sr-only" checked={on} onChange={() => setKeepMine(p.id === player.id)} />
                    <Avatar name={p.name} className="size-8 text-xs" />
                    <span className={cx('min-w-0 flex-1 truncate', on ? 'font-semibold text-accent' : 'font-medium')}>{p.name}</span>
                    {p.uid && (
                      <Badge tone="ok">
                        <BadgeCheck className="size-3" aria-hidden="true" /> Con cuenta
                      </Badge>
                    )}
                    <span
                      aria-hidden="true"
                      className={cx(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border',
                        on ? 'border-accent bg-accent text-accent-fg' : 'border-line',
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          )}
          <div aria-live="polite" className="flex flex-col gap-2">
            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Spinner className="size-4" /> Revisando si se pueden juntar…
              </p>
            )}
            {blocked && <Problem>{blocked}</Problem>}
            {preview && !blocked && preview.conflicts.length > 0 && (
              <Problem>
                <span className="block">Los dos jugaron lo mismo, y así no se pueden juntar:</span>
                <ul className="mt-1 list-disc pl-5">
                  {preview.conflicts.map((c) => (
                    <li key={c.what}>
                      {c.label} ({c.count})
                    </li>
                  ))}
                </ul>
                <span className="mt-1 block">Quita lo repetido (borra uno de los dos resultados) y junta otra vez.</span>
              </Problem>
            )}
            {preview?.canMerge && <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm">{mergeSummary(preview)}</p>}
            {error && <Problem>{error}</Problem>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Problem({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
