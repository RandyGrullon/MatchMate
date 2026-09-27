import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Eye, Flame, Hash, Trophy, Users } from 'lucide-react';
import { useLeagueCtx } from '../../lib/league';
import { entryLine, rank, teamLines, type Line } from '../../lib/stats';
import type { BowlingEvent, Entry, Player, RankBy } from '../../lib/types';
import { AnimatedNumber, Card, Empty, Position, cx } from '../ui';

function Toggle<K extends string>({ value, options, onChange }: { value: K; options: { key: K; label: string }[]; onChange: (k: K) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cx('rounded-md px-3 py-1 font-medium', value === o.key ? 'bg-surface shadow-sm' : 'text-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function StandingsTab({
  event,
  entries,
  players,
  readOnly,
  onOpen,
}: {
  event: BowlingEvent;
  entries: Entry[];
  players: Player[];
  /** Vista de observador: sin la vista previa de borradores. */
  readOnly?: boolean;
  /** Tocar un jugador abre el detalle de sus juegos. */
  onOpen?: (entry: Entry) => void;
}) {
  const { base, myPlayerId } = useLeagueCtx();
  const isTorneo = event.type === 'torneo';
  const hasHcp = isTorneo && event.hcpPercent > 0;
  // Parten de la regla del torneo (2025: individual con handicap, equipos scratch) y se pueden alternar para mirar.
  const [indMode, setIndMode] = useState<RankBy>(hasHcp ? (event.individualRankBy ?? 'hcp') : 'scratch');
  const [teamMode, setTeamMode] = useState<RankBy>(hasHcp ? (event.teamRankBy ?? 'scratch') : 'scratch');
  const [preview, setPreview] = useState(false);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (l: Line) => byId.get(l.entry.playerId)?.name ?? '(jugador borrado)';

  const lines = entries.map((e) => entryLine(e, event, preview)).filter((l) => l.games > 0);
  const pending = entries.reduce((n, e) => n + entryLine(e, event).pending, 0);
  const useHcp = hasHcp && indMode === 'hcp';
  const teamHcp = hasHcp && teamMode === 'hcp';
  const value = (l: Line) => (isTorneo ? (useHcp ? l.total : l.scratch) : l.avg);
  const individual = rank(lines, value);
  const teams = isTorneo ? rank(teamLines(event, lines).filter((t) => t.members.length), (t) => (teamHcp ? t.total : t.scratch)) : [];
  const modeOptions: { key: RankBy; label: string }[] = [
    { key: 'hcp', label: 'Con handicap' },
    { key: 'scratch', label: 'Scratch' },
  ];
  const official = (mode: RankBy, rule: RankBy | undefined, fallback: RankBy) => mode === (rule ?? fallback);

  const best = lines.reduce<{ score: number; line: Line | null }>(
    (acc, l) => (l.high > acc.score ? { score: l.high, line: l } : acc),
    { score: 0, line: null },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && pending > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
            <Eye className="size-4" /> Vista previa (incluye {pending} sin foto)
          </label>
        )}
      </div>

      {lines.length === 0 ? (
        <Empty icon={<Trophy className="size-8" />} title={pending > 0 ? 'Sin juegos verificados' : 'Todavía no hay juegos'}>
          {pending > 0
            ? `La clasificación cuenta solo juegos verificados.${readOnly ? '' : ' Activa la vista previa para ver los borradores.'}`
            : 'Cuando se anoten los juegos, la clasificación se actualiza sola.'}
        </Empty>
      ) : (
        <>
          {best.line && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat icon={<Flame className="size-4" />} label="Mejor juego" value={best.score} sub={nameOf(best.line)} />
              <Stat icon={<Users className="size-4" />} label="Jugadores" value={lines.length} />
              <Stat icon={<Hash className="size-4" />} label="Juegos" value={lines.reduce((n, l) => n + l.games, 0)} className="hidden sm:block" />
            </div>
          )}

          {isTorneo && teams.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader
                title="Equipos"
                toggle={hasHcp && <Toggle value={teamMode} onChange={setTeamMode} options={modeOptions} />}
                unofficial={hasHcp && !official(teamMode, event.teamRankBy, 'scratch')}
              />
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-line">
                      <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                      <th className="px-2 py-2 text-left font-medium">Equipo</th>
                      {Array.from({ length: event.games }, (_, i) => (
                        <th key={i} className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                          J{i + 1}
                        </th>
                      ))}
                      {teamHcp && <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Hcp</th>}
                      <th className="px-3 py-2 text-right font-medium">{teamHcp ? 'Total' : 'Scratch'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map(({ row: t, pos }) => (
                      <tr key={t.teamId} className="border-b border-line last:border-0">
                        <td className="px-3 py-2.5">
                          <Position pos={pos} />
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="font-medium">{t.name}</div>
                          <div className="text-xs text-muted">{t.members.map(nameOf).join(', ')}</div>
                        </td>
                        {Array.from({ length: event.games }, (_, i) => {
                          const v = t.members.reduce((s, m) => (m.scores[i] != null ? s + m.scores[i]! + (teamHcp ? m.hcp : 0) : s), 0);
                          return (
                            <td key={i} className="hidden px-2 py-2.5 text-right text-muted tabular-nums sm:table-cell">
                              {v || '—'}
                            </td>
                          );
                        })}
                        {teamHcp && <td className="hidden px-2 py-2.5 text-right text-muted tabular-nums sm:table-cell">{t.hcpTotal}</td>}
                        <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">{teamHcp ? t.total : t.scratch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <SectionHeader
              title={isTorneo ? 'Individual' : 'Resultados de la práctica'}
              toggle={hasHcp && <Toggle value={indMode} onChange={setIndMode} options={modeOptions} />}
              unofficial={hasHcp && !official(indMode, event.individualRankBy, 'hcp')}
            />
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                    <th className="px-2 py-2 text-left font-medium">Jugador</th>
                    {Array.from({ length: event.games }, (_, i) => (
                      <th key={i} className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                        J{i + 1}
                      </th>
                    ))}
                    <th className="hidden px-2 py-2 text-right font-medium md:table-cell">Mejor</th>
                    {isTorneo ? (
                      <>
                        {useHcp && <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Scratch</th>}
                        {useHcp && <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Hcp</th>}
                        <th className="px-3 py-2 text-right font-medium">{useHcp ? 'Total' : 'Scratch'}</th>
                      </>
                    ) : (
                      <>
                        <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Total</th>
                        <th className="px-3 py-2 text-right font-medium">Prom.</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {individual.map(({ row: l, pos }) => (
                    <tr
                      key={l.entry.id}
                      onClick={onOpen ? () => onOpen(l.entry) : undefined}
                      className={cx(
                        'border-b border-line last:border-0',
                        onOpen && 'cursor-pointer transition hover:bg-surface-2/70',
                        l.entry.playerId === myPlayerId && 'bg-accent-soft/50',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <Position pos={pos} />
                      </td>
                      <td className="px-2 py-2.5">
                        <Link
                          to={`${base}/j/${l.entry.playerId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {nameOf(l)}
                        </Link>
                        <div className="text-xs text-muted tabular-nums sm:hidden">{l.scores.map((s) => s ?? '–').join(' · ')}</div>
                        {isTorneo && l.entry.teamId && event.teams?.[l.entry.teamId] && (
                          <div className="hidden text-xs text-muted sm:block">{event.teams[l.entry.teamId].name}</div>
                        )}
                      </td>
                      {l.scores.map((s, i) => (
                        <td key={i} className={cx('hidden px-2 py-2.5 text-right tabular-nums sm:table-cell', s === l.high && s != null ? 'font-semibold' : 'text-muted')}>
                          {s ?? '—'}
                        </td>
                      ))}
                      <td className="hidden px-2 py-2.5 text-right text-muted tabular-nums md:table-cell">{l.high}</td>
                      {isTorneo ? (
                        <>
                          {useHcp && <td className="hidden px-2 py-2.5 text-right text-muted tabular-nums sm:table-cell">{l.scratch}</td>}
                          {useHcp && <td className="hidden px-2 py-2.5 text-right text-muted tabular-nums sm:table-cell">{l.hcpTotal}</td>}
                          <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">{useHcp ? l.total : l.scratch}</td>
                        </>
                      ) : (
                        <>
                          <td className="hidden px-2 py-2.5 text-right text-muted tabular-nums sm:table-cell">{l.scratch}</td>
                          <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">{l.avg}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function SectionHeader({ title, toggle, unofficial }: { title: string; toggle?: ReactNode; unofficial?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-muted">
        {title}
        {unofficial && <span className="ml-2 font-normal text-warn">(no es el criterio oficial del torneo)</span>}
      </h3>
      {toggle}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  icon,
  className,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cx('animate-fade-up px-4 py-3', className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon && <span className="text-accent">{icon}</span>}
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight">{typeof value === 'number' ? <AnimatedNumber value={value} /> : value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </Card>
  );
}
