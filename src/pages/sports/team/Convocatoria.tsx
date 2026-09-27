import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Users } from 'lucide-react';
import type { Match } from '../../../lib/data/matches';
import { rsvpShortfall, rsvpSummary, setMatchRsvp, useMatchRsvps, type MatchRsvp, type RsvpStatus } from '../../../lib/data/teamSports';
import type { Side } from '../../../sports/types';
import { useAction } from '../../../components/feedback';
import { Badge, Card, cx } from '../../../components/ui';
import { rosterOf, rosterSide, rsvpTargets } from './logic';
import { Jersey, RsvpBadge, RsvpButtons, TeamName } from './TeamBits';
import type { TeamLeague } from './useTeamLeague';

/**
 * Convocatoria de un partido (Voy / No voy / Tal vez). Cada jugador marca la suya; el capitán o delegado ve la
 * lista de su equipo y marca a quien no tiene la app; el admin, a todos. Avisa si hay menos «Voy» que el mínimo.
 * Va por la cola: sin señal se ve de una y sale sola.
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
}: {
  tl: TeamLeague;
  match: Match;
  minPlayers: number;
  compact?: boolean;
  flags?: ReadonlyMap<string, string>;
}) {
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const run = useAction();
  const [open, setOpen] = useState<Side | null>(null);
  const teams = tl.teams.data;
  const targets = useMemo(() => rsvpTargets(m, teams, tl.myPlayerId, tl.isAdmin), [m, teams, tl.myPlayerId, tl.isAdmin]);
  const mySide = rosterSide(m, teams, tl.myPlayerId);
  const editable = m.status === 'scheduled' || m.status === 'postponed' || m.status === 'live' || m.status === 'suspended';
  const statusOf = (playerId: string): MatchRsvp | undefined => rsvps.data.find((r) => r.matchId === m.id && r.playerId === playerId);

  const set = (playerId: string, side: Side, status: RsvpStatus | null) =>
    run(() => setMatchRsvp(tl.lid, m.id, playerId, side, status), status ? undefined : 'Convocatoria quitada');

  const sides = m.sides.filter((s) => s.teamId && rosterOf(teams, s.teamId).length);
  if (!sides.length) return null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-accent" />
        <h3 className="flex-1 font-semibold">Convocatoria</h3>
        <span className="text-xs text-muted">Mínimo {minPlayers}</span>
      </div>

      {mySide && tl.myPlayerId && editable && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">¿Vas a este partido?</p>
          <RsvpButtons value={statusOf(tl.myPlayerId)?.status} onChange={(s) => void set(tl.myPlayerId!, mySide, s)} label="Mi convocatoria" />
        </div>
      )}

      <div className={cx('grid gap-2', !compact && 'sm:grid-cols-2')}>
        {sides.map((s) => {
          const roster = rosterOf(teams, s.teamId).map((r) => r.playerId);
          const sum = rsvpSummary(rsvps.data, m.id, s.side, roster);
          const short = editable && m.status !== 'live' ? rsvpShortfall(sum, minPlayers) : null;
          const target = targets.find((t) => t.side === s.side && t.playerIds.length > 1);
          const team = tl.teamOf(s.teamId);
          return (
            <div key={s.side} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
              <div className="flex items-center gap-2">
                <TeamName team={team} label={s.label} className="flex-1 font-medium" />
                {(target || tl.isAdmin || !compact) && (
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-accent"
                    onClick={() => setOpen(open === s.side ? null : s.side)}
                    aria-expanded={open === s.side}
                  >
                    {open === s.side ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    Lista
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <span>
                  <b className="tabular-nums text-ok">{sum.yes.length}</b> van
                </span>
                <span>
                  <b className="tabular-nums text-warn">{sum.maybe.length}</b> tal vez
                </span>
                <span>
                  <b className="tabular-nums text-danger">{sum.no.length}</b> no van
                </span>
                {sum.none.length > 0 && <span className="text-muted">{sum.none.length} sin responder</span>}
              </div>
              {short !== null && (
                <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-warn">
                  <AlertTriangle className="size-4 shrink-0" />
                  Faltan {short} para llegar a {minPlayers}.
                </p>
              )}
              {flags &&
                [...sum.yes, ...sum.maybe]
                  .filter((pid) => flags.has(pid))
                  .map((pid) => (
                    <p key={pid} role="alert" className="flex items-center gap-1.5 text-xs font-medium text-danger">
                      <AlertTriangle className="size-4 shrink-0" />
                      {tl.nameOf(pid)}: {flags.get(pid)} y está convocado.
                    </p>
                  ))}
              {open === s.side && (
                <ul className="flex flex-col divide-y divide-line">
                  {[...sum.yes, ...sum.maybe, ...sum.none, ...sum.no].map((pid) => {
                    const r = statusOf(pid);
                    const canSet = editable && !!targets.find((t) => t.side === s.side && t.playerIds.includes(pid));
                    return (
                      <li key={pid} className="flex flex-wrap items-center gap-2 py-2">
                        <Jersey n={tl.jerseyOf(pid, s.teamId)} />
                        <span className="min-w-0 flex-1 truncate text-sm">{tl.nameOf(pid)}</span>
                        {flags?.has(pid) && <Badge tone="danger">{flags.get(pid)}</Badge>}
                        {canSet && pid !== tl.myPlayerId ? (
                          <div className="w-full sm:w-auto sm:min-w-56">
                            <RsvpButtons size="sm" value={r?.status} onChange={(st) => void set(pid, s.side, st)} label={`Convocatoria de ${tl.nameOf(pid)}`} />
                          </div>
                        ) : (
                          <RsvpBadge status={r?.status} pending={r?.pending} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
