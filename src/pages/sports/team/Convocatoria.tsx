import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import type { Match } from '../../../lib/data/matches';
import { rsvpShortfall, rsvpSummary, setMatchRsvp, useMatchRsvps, type MatchRsvp, type RsvpStatus } from '../../../lib/data/teamSports';
import type { Side } from '../../../sports/types';
import { useAction } from '../../../components/feedback';
import { Badge, Card, SectionHeader, cx } from '../../../components/ui';
import { rosterOf, rosterSide, rsvpTargets } from './logic';
import { Jersey, RsvpBadge, RsvpButtons } from './TeamBits';
import { TeamCrest } from './TeamUi';
import { rsvpLine } from './view';
import type { TeamLeague } from './useTeamLeague';

/**
 * Convocatoria de un partido (Voy / No voy / Tal vez). Cada jugador marca la suya («¿Vas a este partido?», arriba);
 * cada equipo es una tarjeta con cómo va («3 van · faltan 2», en ámbar si no llega al mínimo) y «Lista ▾»: el capitán
 * o delegado ve la lista de su equipo y marca a quien no tiene la app; el admin, a todos. Va por la cola: sin señal se
 * ve de una y sale sola.
 *
 * `flags` (opcional, p. ej. el fútbol): jugadores marcados con un aviso corto («Suspendido»). Sale en la lista y, si
 * el jugador dijo «Voy» o «Tal vez», un aviso arriba de su equipo (la app avisa, no bloquea).
 */
export function Convocatoria({
  tl,
  match: m,
  minPlayers,
  compact,
  flags,
  className,
}: {
  tl: TeamLeague;
  match: Match;
  minPlayers: number;
  compact?: boolean;
  flags?: ReadonlyMap<string, string>;
  className?: string;
}) {
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const run = useAction();
  const [open, setOpen] = useState<Side | null>(null);
  // Los equipos del partido (también los de una temporada pasada).
  const teams = tl.allTeams.data;
  const targets = useMemo(() => rsvpTargets(m, teams, tl.myPlayerId, tl.isAdmin), [m, teams, tl.myPlayerId, tl.isAdmin]);
  const mySide = rosterSide(m, teams, tl.myPlayerId);
  const editable = m.status === 'scheduled' || m.status === 'postponed' || m.status === 'live' || m.status === 'suspended';
  const statusOf = (playerId: string): MatchRsvp | undefined => rsvps.data.find((r) => r.matchId === m.id && r.playerId === playerId);

  const set = (playerId: string, side: Side, status: RsvpStatus | null) =>
    run(() => setMatchRsvp(tl.lid, m.id, playerId, side, status), status ? undefined : 'Convocatoria quitada');

  const sides = m.sides.filter((s) => s.teamId && rosterOf(teams, s.teamId).length);
  if (!sides.length) return null;

  return (
    <section aria-labelledby={`convocatoria-${m.id}`} className={className}>
      <SectionHeader id={`convocatoria-${m.id}`} title="Convocatoria" action={<span className="text-meta text-muted">Mínimo {minPlayers}</span>} />

      {mySide && tl.myPlayerId && editable && (
        <Card className="mb-3.5 px-[18px] pt-4 pb-[18px]">
          <p className="text-body font-semibold">¿Vas a este partido?</p>
          <div className="mt-3">
            <RsvpButtons value={statusOf(tl.myPlayerId)?.status} onChange={(s) => set(tl.myPlayerId!, mySide, s)} label="Mi convocatoria" />
          </div>
        </Card>
      )}

      <div className={cx('grid gap-3.5', !compact && 'sm:grid-cols-2')}>
        {sides.map((s) => {
          const roster = rosterOf(teams, s.teamId).map((r) => r.playerId);
          const sum = rsvpSummary(rsvps.data, m.id, s.side, roster);
          const short = editable && m.status !== 'live' ? rsvpShortfall(sum, minPlayers) : null;
          const target = targets.find((t) => t.side === s.side && t.playerIds.length > 1);
          const team = tl.teamOf(s.teamId);
          const canList = !!target || tl.isAdmin || !compact;
          const alerts = flags ? [...sum.yes, ...sum.maybe].filter((pid) => flags.has(pid)) : [];
          return (
            <Card key={s.side} className="overflow-hidden">
              <div className="flex min-h-row items-center gap-3.5 py-2.5 pr-[18px] pl-5">
                <TeamCrest team={team} label={s.label} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-semibold tracking-[-0.01em]">{team?.name ?? s.label}</p>
                  <p className={cx('mt-0.5 text-sm', short !== null ? 'font-medium text-warn' : 'text-muted')}>
                    {rsvpLine(sum, minPlayers)}
                    {sum.no.length > 0 && ` · ${sum.no.length} no ${sum.no.length === 1 ? 'va' : 'van'}`}
                  </p>
                </div>
                {canList && (
                  <button
                    type="button"
                    className="relative inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 text-sm font-semibold text-fg-2 transition active:scale-[0.97] after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    onClick={() => setOpen(open === s.side ? null : s.side)}
                    aria-expanded={open === s.side}
                  >
                    Lista
                    <ChevronDown aria-hidden="true" className={cx('size-4 transition', open === s.side && 'rotate-180')} />
                  </button>
                )}
              </div>
              {alerts.map((pid) => (
                <p key={pid} role="alert" className="flex items-center gap-1.5 px-5 pb-2.5 text-[13px] font-semibold text-danger">
                  <AlertTriangle className="size-4 shrink-0" />
                  {tl.nameOf(pid)}: {flags!.get(pid)} y está convocado.
                </p>
              ))}
              {open === s.side && (
                <ul className="border-t border-line">
                  {[...sum.yes, ...sum.maybe, ...sum.none, ...sum.no].map((pid, i) => {
                    const r = statusOf(pid);
                    const canSet = editable && !!targets.find((t) => t.side === s.side && t.playerIds.includes(pid));
                    return (
                      <li key={pid} className={cx('flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-[18px] pl-5', i > 0 && 'border-t border-line')}>
                        <Jersey n={tl.jerseyOf(pid, s.teamId)} color={team?.color ?? undefined} />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{tl.nameOf(pid)}</span>
                        {flags?.has(pid) && <Badge tone="danger">{flags.get(pid)}</Badge>}
                        {canSet && pid !== tl.myPlayerId ? (
                          <div className="w-full sm:w-auto sm:min-w-56">
                            <RsvpButtons size="sm" value={r?.status} onChange={(st) => set(pid, s.side, st)} label={`Convocatoria de ${tl.nameOf(pid)}`} />
                          </div>
                        ) : (
                          <RsvpBadge status={r?.status} pending={r?.pending} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
