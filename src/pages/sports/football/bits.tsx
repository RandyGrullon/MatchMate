import { useMemo } from 'react';
import { AlertTriangle, Goal, Timer } from 'lucide-react';
import type { Match } from '../../../lib/data/matches';
import { useServerOffset } from '../../../lib/data/teamSports';
import { formatClock } from '../../../sports/team/clock';
import type { Side } from '../../../sports/types';
import { Badge, cx } from '../../../components/ui';
import { useTicker } from '../team/ScorerPieces';
import type { TeamLeague } from '../team/useTeamLeague';
import { REASON_TEXT } from './rules';
import { decodeLines, decodeTimeline, liveFromScore, liveMinute, livePowerPlays, pensFromScore, periodsFromScore, type ScoreEvent, type ScoreLine } from './adapter';

/** Posiciones del fútbol para la plantilla. */
export const FOOTBALL_POSITIONS = ['Portero', 'Defensa', 'Medio', 'Delantero'] as const;

/** Tarjetita amarilla o roja (la doble amarilla, amarilla sobre roja). */
export function CardIcon({ kind, className }: { kind: 'yellow' | 'second_yellow' | 'red'; className?: string }) {
  if (kind === 'second_yellow') {
    return (
      <span aria-label="Doble amarilla" className={cx('relative inline-block h-4 w-3.5 shrink-0', className)}>
        <span className="absolute left-0 top-0 h-3.5 w-2.5 rounded-[2px] bg-yellow-400 ring-1 ring-black/10" />
        <span className="absolute bottom-0 right-0 h-3.5 w-2.5 rounded-[2px] bg-red-600 ring-1 ring-black/10" />
      </span>
    );
  }
  return (
    <span
      aria-label={kind === 'yellow' ? 'Amarilla' : 'Roja'}
      className={cx('inline-block h-3.5 w-2.5 shrink-0 rounded-[2px] ring-1 ring-black/10', kind === 'yellow' ? 'bg-yellow-400' : 'bg-red-600', className)}
    />
  );
}

/**
 * Lo que se ve de un partido en vivo: tiempo y minuto (lo avanza este teléfono con la hora del servidor, sin volver
 * a consultar), añadido, faltas acumuladas de sala, rojas y los 2 minutos con uno menos.
 */
export function LiveStrip({ match: m, names, className }: { match: Pick<Match, 'score' | 'status'>; names: [string, string]; className?: string }) {
  const live = liveFromScore(m.score);
  const offset = useServerOffset();
  useTicker(!!live?.clk?.r && m.status === 'live', 1000);
  if (!live || (m.status !== 'live' && m.status !== 'suspended')) return null;
  const serverNow = Date.now() + offset;
  const minute = liveMinute(live, serverNow);
  const pps = livePowerPlays(live, serverNow);
  const pens = pensFromScore(m.score);
  return (
    <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs', className)}>
      <span className="font-semibold">{live.pl}</span>
      {minute && (
        <span className="flex items-center gap-1 font-semibold tabular-nums text-ok">
          <Timer className="size-3.5" />
          {minute}
          {!live.clk?.r && <span className="font-normal text-muted">(parado)</span>}
        </span>
      )}
      {live.add != null && live.add > 0 && <span className="text-muted">+{live.add} de añadido</span>}
      {live.so && pens && (
        <span className="font-semibold tabular-nums">
          Penales {pens[0]}-{pens[1]}
        </span>
      )}
      {live.f && (
        <span className="text-muted tabular-nums">
          Faltas: {names[0]} {live.f[0]}
          {live.f[0] >= 5 && (
            <Badge tone="danger" className="ml-1">
              10 m
            </Badge>
          )}{' '}
          · {names[1]} {live.f[1]}
          {live.f[1] >= 5 && (
            <Badge tone="danger" className="ml-1">
              10 m
            </Badge>
          )}
        </span>
      )}
      {(live.r[0] > 0 || live.r[1] > 0) && (
        <span className="flex items-center gap-1 text-muted">
          <CardIcon kind="red" />
          {live.r[0] > 0 && `${names[0]} ${live.r[0]}`}
          {live.r[0] > 0 && live.r[1] > 0 && ' · '}
          {live.r[1] > 0 && `${names[1]} ${live.r[1]}`}
        </span>
      )}
      {pps.map((p, i) => (
        <Badge key={i} tone="warn">
          {names[p.side - 1]} con uno menos · {formatClock(p.remainingMs, 'up')}
        </Badge>
      ))}
      {m.status === 'suspended' && <Badge tone="warn">Suspendido</Badge>}
    </div>
  );
}

const KIND_TEXT: Record<ScoreEvent['kind'], string> = { goal: 'Gol', own_goal: 'Autogol', yellow: 'Amarilla', second_yellow: 'Doble amarilla (roja)', red: 'Roja' };

/** Goles y tarjetas del acta con su minuto (de lo publicado), local a la izquierda y visita a la derecha. */
export function MatchTimeline({ tl, match: m, names }: { tl: TeamLeague; match: Pick<Match, 'score' | 'sides'>; names: [string, string] }) {
  const lines = useMemo(() => decodeLines(m.score?.lines), [m.score]);
  const events = useMemo(() => decodeTimeline(m.score?.tl, lines), [m.score, lines]);
  if (!events.length) return null;
  const jersey = (side: Side, id: string) => m.sides[side - 1].players.find((p) => p.playerId === id)?.jersey ?? tl.jerseyOf(id, m.sides[side - 1].teamId);
  const who = (side: Side, id: string | null) => {
    if (!id) return null;
    const j = jersey(side, id);
    return `${j != null ? `#${j} ` : ''}${tl.nameOf(id)}`;
  };
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Goles y tarjetas">
      {events.map((e, i) => {
        const playerSide: Side = e.kind === 'own_goal' ? (e.side === 1 ? 2 : 1) : e.side;
        const right = e.side === 2;
        const icon =
          e.kind === 'goal' || e.kind === 'own_goal' ? <Goal className={cx('size-4 shrink-0', e.kind === 'own_goal' ? 'text-danger' : 'text-ok')} /> : <CardIcon kind={e.kind} />;
        const text = (
          <span className="min-w-0">
            <span className="font-medium">{who(playerSide, e.player) ?? (e.kind === 'goal' || e.kind === 'own_goal' ? names[e.side - 1] : '')}</span>
            {e.kind === 'own_goal' && <span className="text-muted"> (autogol)</span>}
            {e.assist && <span className="block text-xs text-muted">Asistencia: {who(e.side, e.assist)}</span>}
            {!e.player && e.kind !== 'goal' && e.kind !== 'own_goal' && <span className="text-muted">{KIND_TEXT[e.kind]}</span>}
          </span>
        );
        return (
          <li key={i} className={cx('flex items-start gap-2 text-sm', right && 'flex-row-reverse text-right')}>
            <span className="w-10 shrink-0 text-center text-xs font-semibold tabular-nums text-muted">{e.minute ? `${e.minute}'` : ''}</span>
            <span className="mt-0.5">{icon}</span>
            {text}
          </li>
        );
      })}
    </ol>
  );
}

/** Goles por tiempo («1T 2T Pr.») y penales. */
export function PeriodsLine({ match: m }: { match: Pick<Match, 'score'> }) {
  const periods = periodsFromScore(m.score);
  const pens = pensFromScore(m.score);
  if (periods.length < 2 && !pens) return null;
  const label = (i: number) => (i < 2 ? `${i + 1}T` : `Pr.${i - 1}`);
  return (
    <p className="flex flex-wrap gap-x-3 text-xs text-muted tabular-nums">
      {periods.map((p, i) => (
        <span key={i}>
          {label(i)}: {p[0]}-{p[1]}
        </span>
      ))}
      {pens && (
        <span className="font-semibold text-fg">
          Penales: {pens[0]}-{pens[1]}
        </span>
      )}
    </p>
  );
}

/** Jugadores de cada lado con goles, asistencias y tarjetas (del acta publicada). */
export function PlayersTable({ tl, match: m }: { tl: TeamLeague; match: Match }) {
  const lines = useMemo(() => decodeLines(m.score?.lines), [m.score]);
  if (!lines.length) return null;
  const jersey = (l: ScoreLine) => m.sides[l.side - 1].players.find((p) => p.playerId === l.playerId)?.jersey ?? tl.jerseyOf(l.playerId, m.sides[l.side - 1].teamId);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {m.sides.map((sd) => {
        const rows = lines.filter((l) => l.side === sd.side).sort((a, b) => (jersey(a) ?? 1000) - (jersey(b) ?? 1000));
        if (!rows.length) return null;
        return (
          <div key={sd.side} className="overflow-x-auto">
            <p className="mb-1 text-sm font-semibold">{tl.teamOf(sd.teamId)?.name ?? sd.label}</p>
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1 text-left font-medium">Jugador</th>
                  <th className="px-1 text-right font-medium" title="Goles">
                    G
                  </th>
                  <th className="px-1 text-right font-medium" title="Asistencias">
                    A
                  </th>
                  <th className="px-1 text-right font-medium" title="Tarjetas">
                    T
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const j = jersey(l);
                  return (
                    <tr key={l.playerId} className={cx('border-t border-line', !l.played && 'text-muted')}>
                      <td className="max-w-40 truncate py-1.5">
                        <span className="mr-1 text-muted">{j != null ? `#${j}` : ''}</span>
                        {tl.nameOf(l.playerId)}
                        {l.keeper && <span className="ml-1 text-xs text-muted">(portero{l.played ? `, ${l.conceded} rec.` : ''})</span>}
                        {!l.played && <span className="ml-1 text-xs">(banco)</span>}
                      </td>
                      <td className="px-1 text-right font-bold">
                        {l.goals || ''}
                        {l.ownGoals ? <span className="text-xs font-normal text-danger"> ({l.ownGoals} AG)</span> : null}
                      </td>
                      <td className="px-1 text-right">{l.assists || ''}</td>
                      <td className="px-1 text-right">
                        <span className="inline-flex items-center gap-0.5">
                          {l.red === 'second_yellow' ? (
                            <CardIcon kind="second_yellow" />
                          ) : (
                            <>
                              {Array.from({ length: l.yellows }, (_, k) => (
                                <CardIcon key={k} kind="yellow" />
                              ))}
                              {l.red === 'direct' && <CardIcon kind="red" />}
                            </>
                          )}
                        </span>
                      </td>
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

/** Aviso de suspendidos para un partido (la app avisa, no bloquea). */
export function SuspendedNotice({ tl, list, title = 'Suspendidos para este partido' }: { tl: TeamLeague; list: { player: string; team: string; remaining: number; reason: string }[]; title?: string }) {
  if (!list.length) return null;
  return (
    <div role="status" className="flex flex-col gap-1 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
      <p className="flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="size-4 shrink-0" />
        {title}
      </p>
      <ul className="flex flex-col gap-0.5">
        {list.map((s) => (
          <li key={`${s.team}:${s.player}`}>
            {tl.nameOf(s.player)} ({tl.teamOf(s.team)?.name ?? 'equipo'}) · {REASON_TEXT[s.reason] ?? s.reason}
            {s.remaining > 1 ? ` · le faltan ${s.remaining} partidos` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { REASON_TEXT };
