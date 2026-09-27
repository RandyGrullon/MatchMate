import { isOpen, sideOf, type Match } from '../../../lib/data/matches';
import { myTeamRoles, teamsICanSpeakFor, type RosterEntry, type SeasonTeam, type TeamRole } from '../../../lib/data/seasonTeams';
import type { MatchOfficial } from '../../../lib/data/teamSports';
import type { Member, Player } from '../../../lib/types';
import type { Side } from '../../../sports/types';

/**
 * Quién es quién en los partidos de equipos (puro, lo mismo que decide la base; el servidor manda igual):
 * - lado del «delegado»: capitán o delegado del equipo de un lado (anota, propone y confirma por su equipo);
 * - lado de la plantilla: cualquier jugador del equipo (su convocatoria);
 * - quién puede abrir la mesa y a quién se puede designar como anotador.
 */

type SideLike = Pick<Match, 'sides'>;
type TeamLike = Pick<SeasonTeam, 'id' | 'roster'>;

/** Lado donde hablo por el equipo (capitán o delegado); null si no o si estoy en los dos. */
export function speakerSide(m: SideLike, teams: readonly TeamLike[], myPlayerId: string | null | undefined): Side | null {
  if (!myPlayerId) return null;
  return sideOf(m, { teamIds: teamsICanSpeakFor(myTeamRoles(teams, myPlayerId), 'team') });
}

/** Lado del equipo en cuya plantilla está el jugador (cualquier rol); null si en ninguno o en los dos. */
export function rosterSide(m: SideLike, teams: readonly TeamLike[], playerId: string | null | undefined): Side | null {
  if (!playerId) return null;
  const ids = teams.filter((t) => t.roster.some((r) => r.playerId === playerId)).map((t) => t.id);
  return sideOf(m, { teamIds: ids });
}

export const rosterOf = (teams: readonly TeamLike[], teamId: string | null | undefined): RosterEntry[] => teams.find((t) => t.id === teamId)?.roster ?? [];

/** Mis equipos (por mi jugador) con mi rol. */
export function myTeams<T extends TeamLike>(teams: readonly T[], myPlayerId: string | null | undefined): { team: T; role: TeamRole }[] {
  const roles = myTeamRoles(teams, myPlayerId);
  return teams.filter((t) => roles.has(t.id)).map((team) => ({ team, role: roles.get(team.id)! }));
}

/**
 * Puede abrir la mesa anotadora: el partido sigue abierto y es admin, anotador de la liga, el anotador designado
 * o capitán/delegado de uno de los lados.
 */
export function canOpenTable(o: {
  match: Pick<Match, 'status'>;
  isAdmin: boolean;
  isScorer: boolean;
  userId: string | null | undefined;
  official: Pick<MatchOfficial, 'userId'> | null | undefined;
  speaker: Side | null;
}): boolean {
  if (!o.userId || !isOpen(o.match)) return false;
  return o.isAdmin || o.isScorer || o.speaker !== null || o.official?.userId === o.userId;
}

export interface ScorerCandidate {
  uid: string;
  name: string;
  /** «Admin», «Anotador de la liga», «Delegado de Tigres». */
  why: string;
}

const ROLE_WORD: Record<TeamRole, string> = { captain: 'Capitán', delegate: 'Delegado', player: 'Jugador' };

/**
 * A quién se puede designar como anotador de mesa de un partido (lo mismo que acepta la base): admins, anotadores
 * de la liga y capitanes o delegados (con cuenta) de los dos equipos.
 */
export function scorerCandidates(
  m: SideLike,
  teams: readonly (TeamLike & Pick<SeasonTeam, 'name'>)[],
  members: readonly Pick<Member, 'uid' | 'name' | 'role' | 'scorer'>[],
  players: readonly Pick<Player, 'id' | 'uid'>[],
): ScorerCandidate[] {
  const out = new Map<string, ScorerCandidate>();
  const add = (uid: string, why: string) => {
    const mem = members.find((x) => x.uid === uid);
    if (mem && !out.has(uid)) out.set(uid, { uid, name: mem.name, why });
  };
  for (const s of m.sides) {
    const team = teams.find((t) => t.id === s.teamId);
    if (!team) continue;
    for (const r of team.roster) {
      if (r.role === 'player') continue;
      const uid = players.find((p) => p.id === r.playerId)?.uid;
      if (uid) add(uid, `${ROLE_WORD[r.role]} de ${team.name}`);
    }
  }
  for (const mem of members) if (mem.scorer) add(mem.uid, 'Anotador de la liga');
  for (const mem of members) if (mem.role === 'owner' || mem.role === 'admin') add(mem.uid, 'Admin');
  return [...out.values()];
}

/**
 * A quién le puedo marcar la convocatoria en este partido: el admin a toda la plantilla de los dos equipos; el
 * capitán o delegado a la de su equipo; cualquier otro, solo a sí mismo (si está en una plantilla).
 */
export function rsvpTargets(m: SideLike, teams: readonly TeamLike[], myPlayerId: string | null | undefined, isAdmin: boolean): { side: Side; playerIds: string[] }[] {
  const out: { side: Side; playerIds: string[] }[] = [];
  const speaker = speakerSide(m, teams, myPlayerId);
  for (const s of m.sides) {
    const roster = rosterOf(teams, s.teamId).map((r) => r.playerId);
    if (!roster.length) continue;
    if (isAdmin || speaker === s.side) out.push({ side: s.side, playerIds: roster });
    else if (myPlayerId && roster.includes(myPlayerId) && rosterSide(m, teams, myPlayerId) === s.side) out.push({ side: s.side, playerIds: [myPlayerId] });
  }
  return out;
}

/** Partidos abiertos de esos equipos, del más cercano al más lejano (sin hora al final). */
export function upcomingFor<M extends Pick<Match, 'status' | 'scheduledAt' | 'sides'>>(matches: readonly M[], teamIds: readonly string[], now: number = Date.now()): M[] {
  const set = new Set(teamIds);
  const t = (m: M) => (m.scheduledAt ? Date.parse(m.scheduledAt) : Number.POSITIVE_INFINITY);
  return matches
    .filter((m) => (m.status === 'scheduled' || m.status === 'postponed' || m.status === 'live' || m.status === 'suspended') && m.sides.some((s) => s.teamId && set.has(s.teamId)))
    .filter((m) => m.status === 'live' || m.status === 'suspended' || t(m) >= now - 3 * 3600_000 || !m.scheduledAt)
    .sort((a, b) => t(a) - t(b));
}

/** La jornada que toca ahora: la primera con partidos abiertos (o la última si todo terminó). */
export function currentRound(matches: readonly Pick<Match, 'round' | 'status'>[]): number | null {
  const rounds = [...new Set(matches.map((m) => m.round).filter((r): r is number => r != null))].sort((a, b) => a - b);
  if (!rounds.length) return null;
  const open = rounds.find((r) => matches.some((m) => m.round === r && isOpen(m)));
  return open ?? rounds[rounds.length - 1];
}

/** Colores para los equipos sin color (por su orden). */
export const TEAM_PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569'];

export function teamColor(team: Pick<SeasonTeam, 'color' | 'order'> | null | undefined, index = 0): string {
  if (team?.color && /^#[0-9a-f]{6}$/i.test(team.color)) return team.color;
  return TEAM_PALETTE[Math.abs((team?.order ?? index) - 1 + TEAM_PALETTE.length) % TEAM_PALETTE.length];
}

/** Texto negro o blanco sobre ese color (contraste). */
export function textOn(hex: string): '#000000' | '#ffffff' {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#ffffff';
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? '#000000' : '#ffffff';
}

/**
 * Letra sobre el verde de estado (--ok) sólido: nunca blanco fijo, porque en oscuro el verde (y el ámbar) se aclaran.
 * Usa --on-ok si el tema la define; si no, el fondo de la página (casi blanco en claro y con sol, casi negro en
 * oscuro), como la letra del lado B del modo cancha (--court-b-fg). En clases de Tailwind:
 * `text-[color:var(--on-ok,var(--bg))]` (y `--on-warn` sobre el ámbar).
 */
export const ON_OK = 'var(--on-ok, var(--bg))';

/** Dorsal para mostrar: «#7» o «–». */
export const jerseyText = (n: number | null | undefined) => (n == null ? '–' : `#${n}`);

/** Nombre corto para los botones de la mesa: «Juan P.». */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}
