import { useMemo, type ReactNode } from 'react';
import type { Match } from '../../../lib/data/matches';
import { useServerOffset } from '../../../lib/data/teamSports';
import { formatClock } from '../../../sports/team/clock';
import { twoNumbersParser } from '../../../components/match';
import { Card, cx } from '../../../components/ui';
import { useTicker } from '../team/ScorerPieces';
import { decodeLines, liveClockMs, liveFromScore, periodsFromScore } from './adapter';
import type { TeamLeague } from '../team/useTeamLeague';

/** Lector de «solo resultado» del baloncesto: «78-72» (sin empates). */
export const basketballParser = twoNumbersParser({ allowDraw: false, max: 300, unit: 'puntos' });

/** Posiciones del baloncesto para la plantilla. */
export const BASKETBALL_POSITIONS = ['Base', 'Escolta', 'Alero', 'Ala-pívot', 'Pívot'] as const;

/** «BONUS» (el equipo ya tira libres por faltas): en rojo, sin fondo. */
function Bonus() {
  return <b className="ml-1 text-[11px] font-bold tracking-[0.05em] text-danger">BONUS</b>;
}

/**
 * Lo que se ve de un partido en vivo: periodo, reloj de referencia (lo avanza este teléfono con la hora del
 * servidor, sin volver a consultar) y faltas de equipo con BONUS. Rediseño: una línea tranquila, el periodo en el color
 * del deporte.
 */
export function LiveStrip({ match: m, names, className }: { match: Pick<Match, 'score' | 'status'>; names: [string, string]; className?: string }) {
  const live = liveFromScore(m.score);
  const offset = useServerOffset();
  useTicker(!!live?.clk?.r && m.status === 'live', 500);
  if (!live || (m.status !== 'live' && m.status !== 'suspended')) return null;
  const ms = liveClockMs(live, Date.now() + offset);
  return (
    <div className={cx('flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted', className)}>
      <span className="font-semibold text-accent">{live.pl}</span>
      {ms !== null && (
        <span className="num font-semibold text-fg">
          {formatClock(ms, 'up')}
          {!live.clk?.r && <span className="font-normal text-muted"> (parado)</span>}
        </span>
      )}
      <span>
        Faltas: {names[0]} {live.tf[0]}
        {live.bonus[0] && <Bonus />} · {names[1]} {live.tf[1]}
        {live.bonus[1] && <Bonus />}
      </span>
      {m.status === 'suspended' && <span className="font-semibold text-warn">Suspendido</span>}
    </div>
  );
}

const TH = 'py-3 text-[11px] font-bold tracking-[0.05em] text-muted uppercase';

/** Puntos por periodo («1C 2C 3C 4C Pr.») en una tarjeta; `title` va arriba (no sale nada si hay un solo periodo). */
export function PeriodsTable({ match: m, names, periodsPerGame, title }: { match: Pick<Match, 'score'>; names: [string, string]; periodsPerGame: number; title?: ReactNode }) {
  const periods = periodsFromScore(m.score);
  if (periods.length < 2) return null;
  const label = (i: number) => (i >= periodsPerGame ? `Pr.${i - periodsPerGame > 0 ? i - periodsPerGame + 1 : ''}` : periodsPerGame === 2 ? `${i + 1}T` : `${i + 1}C`);
  return (
    <>
      {title}
      <Card className="overflow-hidden">
        <div className="no-scrollbar overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={cx(TH, 'pl-4 text-left')}>
                  <span className="sr-only">Equipo</span>
                </th>
                {periods.map((_, i) => (
                  <th key={i} className={cx(TH, 'px-1.5 text-right')}>
                    {label(i)}
                  </th>
                ))}
                <th className={cx(TH, 'pr-4 pl-2 text-right')}>T</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1].map((k) => (
                <tr key={k} className="border-t border-line">
                  <td className="max-w-32 truncate py-3 pr-2 pl-4 text-[15px] font-semibold">{names[k]}</td>
                  {periods.map((p, i) => (
                    <td key={i} className="num px-1.5 py-3 text-right text-[15px] text-muted">
                      {p[k]}
                    </td>
                  ))}
                  <td className="num py-3 pr-4 pl-2 text-right text-[17px] font-bold">{periods.reduce((a, p) => a + p[k], 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/**
 * Los puntos de cada presente (de lo publicado por la mesa), un equipo por tarjeta, del que más anotó al que menos. En
 * Pro (`full`), también triples, tiros libres y faltas (5 faltas, en rojo).
 */
export function BoxScore({ tl, match: m, full }: { tl: TeamLeague; match: Match; full?: boolean }) {
  const lines = useMemo(() => decodeLines(m.score?.lines), [m.score]);
  if (!lines.length) return null;
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {m.sides.map((sd) => {
        const rows = lines.filter((l) => l.side === sd.side).sort((a, b) => b.points - a.points);
        if (!rows.length) return null;
        return (
          <Card key={sd.side} className="overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={cx(TH, 'pl-4 text-left normal-case tracking-normal')}>
                    <span className="text-[15px] font-bold text-fg">{tl.teamOf(sd.teamId)?.name ?? sd.label}</span>
                  </th>
                  <th className={cx(TH, 'px-1.5 text-right', !full && 'pr-4')} title="Puntos">
                    PTS
                  </th>
                  {full && (
                    <>
                      <th className={cx(TH, 'px-1.5 text-right')} title="Triples">
                        3P
                      </th>
                      <th className={cx(TH, 'px-1.5 text-right')} title="Tiros libres anotados">
                        TL
                      </th>
                      <th className={cx(TH, 'pr-4 pl-1.5 text-right')} title="Faltas">
                        F
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const j = sd.players.find((p) => p.playerId === l.playerId)?.jersey ?? tl.jerseyOf(l.playerId, sd.teamId);
                  return (
                    <tr key={l.playerId} className="border-t border-line">
                      <td className="max-w-0 w-full py-2.5 pr-2 pl-4">
                        <span className="flex min-w-0 items-center gap-2 text-[15px]">
                          <span className="num w-7 shrink-0 text-[13px] font-semibold text-faint">{j != null ? `#${j}` : ''}</span>
                          <span className="min-w-0 truncate font-medium">{tl.nameOf(l.playerId)}</span>
                        </span>
                      </td>
                      <td className={cx('num px-1.5 py-2.5 text-right text-[17px] font-bold', !full && 'pr-4')}>{l.points}</td>
                      {full && (
                        <>
                          <td className="num px-1.5 py-2.5 text-right text-[15px] text-muted">{l.threes}</td>
                          <td className="num px-1.5 py-2.5 text-right text-[15px] text-muted">{l.ones}</td>
                          <td className={cx('num py-2.5 pr-4 pl-1.5 text-right text-[15px]', l.fouls >= 5 ? 'font-bold text-danger' : 'text-muted')}>{l.fouls}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
