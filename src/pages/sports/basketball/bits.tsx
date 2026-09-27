import { useMemo } from 'react';
import type { Match } from '../../../lib/data/matches';
import { useServerOffset } from '../../../lib/data/teamSports';
import { formatClock } from '../../../sports/team/clock';
import { twoNumbersParser } from '../../../components/match';
import { Badge, cx } from '../../../components/ui';
import { useTicker } from '../team/ScorerPieces';
import { decodeLines, liveClockMs, liveFromScore, periodsFromScore } from './adapter';
import type { TeamLeague } from '../team/useTeamLeague';

/** Lector de «solo resultado» del baloncesto: «78-72» (sin empates). */
export const basketballParser = twoNumbersParser({ allowDraw: false, max: 300, unit: 'puntos' });

/** Posiciones del baloncesto para la plantilla. */
export const BASKETBALL_POSITIONS = ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'] as const;

/**
 * Lo que se ve de un partido en vivo: periodo, reloj de referencia (lo avanza este teléfono con la hora del
 * servidor, sin volver a consultar) y faltas de equipo con BONUS.
 */
export function LiveStrip({ match: m, names, className }: { match: Pick<Match, 'score' | 'status'>; names: [string, string]; className?: string }) {
  const live = liveFromScore(m.score);
  const offset = useServerOffset();
  useTicker(!!live?.clk?.r && m.status === 'live', 500);
  if (!live || (m.status !== 'live' && m.status !== 'suspended')) return null;
  const ms = liveClockMs(live, Date.now() + offset);
  return (
    <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
      <span className="font-semibold">{live.pl}</span>
      {ms !== null && (
        <span className="flex items-center gap-1 tabular-nums">
          {formatClock(ms, 'up')}
          {!live.clk?.r && <span className="text-muted">(parado)</span>}
        </span>
      )}
      <span className="text-muted">
        Faltas: {names[0]} {live.tf[0]}
        {live.bonus[0] && (
          <Badge tone="danger" className="ml-1">
            BONUS
          </Badge>
        )}{' '}
        · {names[1]} {live.tf[1]}
        {live.bonus[1] && (
          <Badge tone="danger" className="ml-1">
            BONUS
          </Badge>
        )}
      </span>
      {m.status === 'suspended' && <Badge tone="warn">Suspendido</Badge>}
    </div>
  );
}

/** Puntos por periodo («1C 2C 3C 4C Pr.»). */
export function PeriodsTable({ match: m, names, periodsPerGame }: { match: Pick<Match, 'score'>; names: [string, string]; periodsPerGame: number }) {
  const periods = periodsFromScore(m.score);
  if (periods.length < 2) return null;
  const label = (i: number) => (i >= periodsPerGame ? `Pr.${i - periodsPerGame > 0 ? i - periodsPerGame + 1 : ''}` : periodsPerGame === 2 ? `${i + 1}T` : `${i + 1}C`);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1 pr-2 text-left font-medium" />
            {periods.map((_, i) => (
              <th key={i} className="px-1.5 py-1 text-right font-medium">
                {label(i)}
              </th>
            ))}
            <th className="py-1 pl-2 text-right font-semibold">T</th>
          </tr>
        </thead>
        <tbody>
          {[0, 1].map((k) => (
            <tr key={k} className="border-t border-line">
              <td className="max-w-28 truncate py-1.5 pr-2">{names[k]}</td>
              {periods.map((p, i) => (
                <td key={i} className="px-1.5 py-1.5 text-right">
                  {p[k]}
                </td>
              ))}
              <td className="py-1.5 pl-2 text-right font-bold">{periods.reduce((a, p) => a + p[k], 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Puntos, triples, tiros libres y faltas de cada presente (de lo publicado por la mesa). */
export function BoxScore({ tl, match: m }: { tl: TeamLeague; match: Match }) {
  const lines = useMemo(() => decodeLines(m.score?.lines), [m.score]);
  if (!lines.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {m.sides.map((sd) => {
        const rows = lines.filter((l) => l.side === sd.side).sort((a, b) => b.points - a.points);
        if (!rows.length) return null;
        return (
          <div key={sd.side} className="overflow-x-auto">
            <p className="mb-1 text-sm font-semibold">{tl.teamOf(sd.teamId)?.name ?? sd.label}</p>
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 text-left font-medium">Jugador</th>
                  <th className="px-1 text-right font-medium" title="Puntos">
                    PTS
                  </th>
                  <th className="px-1 text-right font-medium" title="Triples">
                    3P
                  </th>
                  <th className="px-1 text-right font-medium" title="Tiros libres anotados">
                    TL
                  </th>
                  <th className="px-1 text-right font-medium" title="Faltas">
                    F
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const j = sd.players.find((p) => p.playerId === l.playerId)?.jersey ?? tl.jerseyOf(l.playerId, sd.teamId);
                  return (
                    <tr key={l.playerId} className="border-t border-line">
                      <td className="max-w-36 truncate py-1.5">
                        <span className="mr-1 text-muted">{j != null ? `#${j}` : ''}</span>
                        {tl.nameOf(l.playerId)}
                      </td>
                      <td className="px-1 text-right font-bold">{l.points}</td>
                      <td className="px-1 text-right">{l.threes}</td>
                      <td className="px-1 text-right">{l.ones}</td>
                      <td className={cx('px-1 text-right', l.fouls >= 5 && 'font-bold text-danger')}>{l.fouls}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
