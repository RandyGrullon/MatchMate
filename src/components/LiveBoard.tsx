import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, MessageCircleHeart } from 'lucide-react';
import { useEventEntries, useEventLive, useEventSubmissions, usePlayers } from '../lib/data';
import { eventLabel } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { liveRows, type LiveInfo, type LiveSource } from '../lib/live';
import type { BowlingEvent } from '../lib/types';
import { Avatar } from './Avatar';
import { Card, Skeleton, cx } from './ui';

/** Filas que se ven antes de "Ver todos". */
const SHOWN = 8;

const SOURCE_LABEL: Record<LiveSource, string> = {
  tabla: 'en la tabla',
  'sin-verificar': 'sin verificar',
  enviado: 'enviado, falta aprobar',
  jugador: 'anotado por el jugador',
};

/**
 * Tablero en vivo del evento que se está jugando: cómo va cada uno, para que lo vea toda la liga.
 * Junta lo que está en la tabla, lo que enviaron y lo que cada jugador va anotando en su teléfono.
 * `onOpen` abre el juego (para felicitar y comentar) cuando ya está en la tabla.
 */
export function LiveBoard({
  event,
  info,
  onOpen,
  actions,
}: {
  event: BowlingEvent;
  info: LiveInfo;
  onOpen?: (entryId: string) => void;
  /** Arriba del tablero: lo que puede hacer la cuenta (anotar sus juegos, anotar los de todos). */
  actions?: ReactNode;
}) {
  const { lid, base } = useLeagueCtx();
  const entries = useEventEntries(lid, event.id);
  const subs = useEventSubmissions(lid, event.id);
  const live = useEventLive(lid, event.id);
  const players = usePlayers(lid);
  const [all, setAll] = useState(false);
  const loading = entries.loading || players.loading || subs.loading || live.loading;
  const rows = liveRows(event, entries.data, subs.data, live.data);
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? 'Jugador';
  const visible = all ? rows : rows.slice(0, SHOWN);
  const unconfirmed = rows.some((r) => r.games.some((g) => g.source && g.source !== 'tabla'));

  return (
    <Card className="animate-fade-up overflow-hidden border-ok/40" tour="tablero">
      <div className="flex items-center gap-2 bg-ok-soft/60 px-4 py-2 text-xs font-semibold text-ok">
        <span className="live-dot" />
        {info.startsSoon ? `Empieza a las ${info.startLabel}` : 'En juego ahora'}
        <span className="min-w-0 flex-1 truncate font-normal text-muted">· {eventLabel(event)}</span>
        {rows.length > 0 && <span className="shrink-0 font-normal text-muted">{rows.length} jugando</span>}
      </div>
      {actions && <div className="flex flex-col gap-3 border-b border-line p-4">{actions}</div>}

      {loading ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">Todavía nadie ha anotado juegos. Aquí se ve en vivo cómo va cada uno.</p>
      ) : (
        <div className="stagger divide-y divide-line">
          {visible.map((r, i) => {
            const pos = rows.findIndex((x) => x.total === r.total) + 1;
            const canOpen = !!(r.entryId && onOpen);
            const Row = canOpen ? 'button' : 'div';
            return (
              <Row
                key={r.playerId}
                type={canOpen ? 'button' : undefined}
                onClick={canOpen ? () => onOpen!(r.entryId!) : undefined}
                style={{ '--i': i } as CSSProperties}
                className={cx('flex w-full items-center gap-2.5 px-4 py-2.5 text-left', canOpen && 'transition hover:bg-surface-2')}
              >
                {/* Puesto por pinos hasta ahora (sin medallas: la clasificación oficial es la del evento). */}
                <span className="w-5 shrink-0 text-center text-sm font-semibold text-muted tabular-nums">{pos}</span>
                <Avatar name={nameOf(r.playerId)} className="size-8 text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{nameOf(r.playerId)}</span>
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {r.games.map((g, k) => (
                      <span
                        key={k}
                        title={g.source ? `Juego ${k + 1}: ${SOURCE_LABEL[g.source]}` : `Juego ${k + 1}: sin jugar`}
                        className={cx(
                          'inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-xs font-bold tabular-nums',
                          g.score == null
                            ? 'text-muted'
                            : g.source === 'tabla'
                              ? g.score >= 200
                                ? 'bg-accent text-accent-fg'
                                : 'bg-surface-2'
                              : 'border border-dashed border-line text-fg',
                        )}
                      >
                        {g.score ?? '–'}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base leading-tight font-bold tabular-nums">{r.total}</span>
                  <span className="block text-[10px] text-muted tabular-nums">
                    {r.played === 1 ? '1 juego' : `${r.played} juegos`} · prom {Math.floor(r.total / r.played)}
                  </span>
                </span>
              </Row>
            );
          })}
        </div>
      )}

      {(rows.length > SHOWN || unconfirmed || onOpen === undefined || rows.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-xs text-muted">
          {rows.length > 0 && <span>Pinos hasta ahora · la clasificación oficial está en el evento</span>}
          {unconfirmed && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-3 rounded border border-dashed border-line" /> Falta que el admin lo apruebe
            </span>
          )}
          {rows.length > SHOWN && (
            <button type="button" onClick={() => setAll((v) => !v)} className="font-medium text-accent">
              {all ? 'Ver menos' : `Ver los ${rows.length}`}
            </button>
          )}
          {onOpen === undefined && (
            <Link to={`${base}/juegos`} className="ml-auto inline-flex items-center gap-1 font-medium text-accent">
              <MessageCircleHeart className="size-3.5" /> Felicitar y comentar <ChevronRight className="size-3.5" />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
