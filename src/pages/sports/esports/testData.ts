/** Solo pruebas: torneos, inscritos, series y enlaces de mentira con la forma de la capa de datos. */
import type { BrGame, EntryMember, EsportsEntry, EsportsTournament, StageLink } from '../../../lib/data/esports';
import type { Match, MatchSide, MatchStatus } from '../../../lib/data/matches';
import { buildSeriesScore, defaultSettings, type BestOf, type EntryType, type Format, type GameId, type GameRecord, type Mode, type StagePlan, type TournamentSettings } from '../../../sports/esports';
import type { Side } from '../../../sports/types';

/** Un uuid fijo a partir de un número (las lecturas de IDs de juego piden uuids). */
export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function mkTournament(o: Partial<EsportsTournament> & { game?: GameId; mode?: Mode; format?: Format; entryType?: EntryType } = {}): EsportsTournament {
  const game = o.game ?? 'valorant';
  const mode = o.mode ?? '5v5';
  const format = o.format ?? 'double_elim';
  const settings: TournamentSettings = o.settings ?? defaultSettings(game, mode, format);
  const start = o.startsAt ?? new Date(Date.now() + 3 * 86_400_000).toISOString();
  return {
    eventId: 'E1',
    leagueId: 'L1',
    name: 'Copa VALORANT',
    game,
    mode,
    entryType: o.entryType ?? 'teams',
    format,
    status: 'registration',
    startsAt: start,
    registrationOpensAt: null,
    registrationClosesAt: start,
    checkinMinutes: null,
    maxEntries: 8,
    settings,
    prizeText: '',
    announcement: '',
    updatedAt: null,
    ...o,
  };
}

export function mkMember(userId: string, name: string, role: EntryMember['role'] = 'member', extra: Partial<EntryMember> = {}): EntryMember {
  return { userId, role, displayName: name, gamerTag: `${name}#LAN`, ranks: {}, rankSource: 'declarado', playerId: null, ...extra };
}

export function mkEntry(id: string, name: string, o: Partial<EsportsEntry> = {}): EsportsEntry {
  return {
    id,
    leagueId: 'L1',
    eventId: 'E1',
    kind: 'team',
    teamId: null,
    name,
    tag: '',
    captainId: null,
    status: 'approved',
    seed: null,
    checkedInAt: null,
    note: null,
    sideTeamId: `T-${id}`,
    assignedEntry: null,
    members: [],
    createdAt: null,
    ...o,
  };
}

const side = (s: Side, teamId: string | null, label: string): MatchSide => ({ side: s, teamId, label, seed: null, players: [] });

export function mkMatch(o: Partial<Match> & { teams?: [string | null, string | null]; labels?: [string, string] } = {}): Match {
  const { teams = [null, null], labels = ['Por definir', 'Por definir'], ...rest } = o;
  const status: MatchStatus = rest.status ?? 'scheduled';
  return {
    id: rest.id ?? 'M1',
    leagueId: 'L1',
    eventId: 'E1',
    round: 1,
    stage: '',
    bracketKey: null,
    court: '',
    scheduledAt: null,
    status,
    format: 'valorant',
    requireConfirm: true,
    score: null,
    winner: null,
    walkoverSide: null,
    scorerId: null,
    leaseUntil: null,
    seq: 0,
    version: 0,
    proposedBy: null,
    proposedAt: null,
    proposedSide: null,
    confirmedBy: null,
    confirmedAt: null,
    disputedBy: null,
    disputedAt: null,
    disputeNote: null,
    note: null,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
    rules: { game: 'valorant', bestOf: 1, draws: false },
    sides: [side(1, teams[0], labels[0]), side(2, teams[1], labels[1])],
    ...rest,
  };
}

/**
 * Lo que la base guardaría al crear la fase con este plan: un partido por llave (id = 'm:' + llave, lados con el equipo
 * de temporada del inscrito o el texto) y su enlace. `names`: el nombre de cada inscrito.
 */
export function stageFromPlan(plan: StagePlan, names: Readonly<Record<string, string>>, game: GameId = 'valorant'): { matches: Match[]; links: StageLink[] } {
  const id = (key: string) => `m:${key}`;
  const matches = plan.matches.map((p) => {
    const team = (i: 0 | 1) => (p.sides[i].kind === 'entry' ? `T-${(p.sides[i] as { entryId: string }).entryId}` : null);
    const label = (i: 0 | 1) => (p.sides[i].kind === 'entry' ? (names[(p.sides[i] as { entryId: string }).entryId] ?? '') : p.labels[i]);
    return mkMatch({ id: id(p.key), bracketKey: p.key, round: p.round, stage: p.stage, teams: [team(0), team(1)], labels: [label(0), label(1)], rules: { game, bestOf: p.bestOf, draws: false }, format: game });
  });
  const links: StageLink[] = plan.matches.map((p) => ({
    matchId: id(p.key),
    stage: plan.kind,
    part: p.part,
    groupNo: p.group,
    bestOf: p.bestOf,
    winnerTo: p.winnerTo ? id(p.winnerTo.key) : null,
    winnerSide: p.winnerTo?.side ?? null,
    loserTo: p.loserTo ? id(p.loserTo.key) : null,
    loserSide: p.loserTo?.side ?? null,
  }));
  return { matches, links };
}

/** Una serie de VALORANT terminada con esos mapas (el marcador lo arma el motor). */
export function played(m: Match, games: GameRecord[], o: { status?: MatchStatus; bestOf?: BestOf; proposedSide?: Side | null; proposedAt?: string | null } = {}): Match {
  const rules = { game: (m.rules?.game as GameId) ?? 'valorant', bestOf: o.bestOf ?? ((m.rules?.bestOf as BestOf) || 1), draws: false };
  const score = buildSeriesScore(rules, games);
  const winner: Side | null = score.sides[0] > score.sides[1] ? 1 : score.sides[1] > score.sides[0] ? 2 : null;
  return { ...m, status: o.status ?? 'confirmed', score, winner, proposedSide: o.proposedSide ?? null, proposedAt: o.proposedAt ?? null };
}

export function mkBrGame(id: string, round: number, gameNo: number, results: BrGame['results'], status: BrGame['status'] = 'finished'): BrGame {
  return { id, eventId: 'E1', round, gameNo, map: '', status, scheduledAt: null, proof: [], results };
}
