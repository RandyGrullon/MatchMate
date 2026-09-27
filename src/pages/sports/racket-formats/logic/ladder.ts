/**
 * Escalera (tenis, pickleball y pádel): configuración en events.config, filas de ladder_rungs y
 * ladder_challenges pasadas a la app, a quién puedo retar, plazos y textos. Puro. La base
 * (20260927000700_raqueta.sql) valida y mueve la escalera; aquí se muestra y se avisa antes de llamar.
 * Las reglas de retar son las de src/sports/formats/ladder.ts (challengeError).
 */
import { challengeError, type Challenge } from '../../../../sports/formats';

export interface LadderConfig {
  v: 1;
  format: 'escalera';
  /** Escalera de parejas de temporada (true) o de jugadores. */
  doubles: boolean;
  /** Puestos hacia arriba que se pueden retar (3). */
  maxUp: number;
  /** Días para aceptar (3) y para jugar desde que se crea el reto (7). */
  acceptDays: number;
  playDays: number;
  /** Cualquiera de la liga entra solo (abajo del todo). */
  open: boolean;
  /** Reglas del partido del reto (si no, las de la liga): `{ match: {...} }`. */
  rules?: Record<string, unknown>;
}

export const DEFAULT_LADDER: Omit<LadderConfig, 'doubles'> = { v: 1, format: 'escalera', maxUp: 3, acceptDays: 3, playDays: 7, open: true };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;

export function parseLadderConfig(raw: unknown): LadderConfig {
  const c = isObj(raw) ? raw : {};
  const out: LadderConfig = {
    v: 1,
    format: 'escalera',
    doubles: c.doubles === true,
    maxUp: int(c.maxUp, 1, 20, DEFAULT_LADDER.maxUp),
    acceptDays: int(c.acceptDays, 1, 30, DEFAULT_LADDER.acceptDays),
    playDays: int(c.playDays, 1, 60, DEFAULT_LADDER.playDays),
    open: c.open !== false,
  };
  if (isObj(c.rules)) out.rules = c.rules;
  return out;
}

export const ladderConfigJson = (c: LadderConfig): Record<string, unknown> => ({ ...c });

// ---------------------------------------------------------------------------------------------------------
// Filas

export interface Rung {
  entrantId: string;
  position: number;
  playerId: string | null;
  teamId: string | null;
  joinedAt: string;
}

export interface RungRow {
  event_id: string;
  entrant_id: string;
  position: number;
  player_id: string | null;
  team_id: string | null;
  joined_at: string;
}

export const toRung = (r: RungRow): Rung => ({
  entrantId: r.entrant_id,
  position: Number(r.position),
  playerId: r.player_id ?? null,
  teamId: r.team_id ?? null,
  joinedAt: typeof r.joined_at === 'string' ? r.joined_at : String(r.joined_at ?? ''),
});

export type ChallengeStatus = 'pending' | 'accepted' | 'played' | 'walkover' | 'cancelled';

export interface LadderChallenge {
  id: string;
  eventId: string;
  challenger: string;
  challenged: string;
  challengerPos: number | null;
  challengedPos: number | null;
  matchId: string | null;
  status: ChallengeStatus;
  acceptBy: string;
  playBy: string;
  acceptedAt: string | null;
  resolvedAt: string | null;
  winner: string | null;
  note: string | null;
  createdAt: string;
}

export interface ChallengeRow {
  id: string;
  event_id: string;
  challenger: string;
  challenged: string;
  challenger_pos: number | null;
  challenged_pos: number | null;
  match_id: string | null;
  status: string;
  accept_by: string;
  play_by: string;
  accepted_at: string | null;
  resolved_at: string | null;
  winner: string | null;
  note: string | null;
  created_at: string;
}

const STATUSES: readonly ChallengeStatus[] = ['pending', 'accepted', 'played', 'walkover', 'cancelled'];
const iso = (v: unknown) => (typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : v == null ? null : String(v));

export const toChallenge = (r: ChallengeRow): LadderChallenge => ({
  id: r.id,
  eventId: r.event_id,
  challenger: r.challenger,
  challenged: r.challenged,
  challengerPos: r.challenger_pos ?? null,
  challengedPos: r.challenged_pos ?? null,
  matchId: r.match_id ?? null,
  status: STATUSES.includes(r.status as ChallengeStatus) ? (r.status as ChallengeStatus) : 'cancelled',
  acceptBy: iso(r.accept_by) ?? '',
  playBy: iso(r.play_by) ?? '',
  acceptedAt: iso(r.accepted_at),
  resolvedAt: iso(r.resolved_at),
  winner: r.winner ?? null,
  note: r.note ?? null,
  createdAt: iso(r.created_at) ?? '',
});

export const isOpenChallenge = (c: Pick<LadderChallenge, 'status'>) => c.status === 'pending' || c.status === 'accepted';

/** Los ids en orden (1.º primero). */
export const ladderOrder = (rungs: readonly Rung[]) => [...rungs].sort((a, b) => a.position - b.position).map((r) => r.entrantId);

/** Para el motor de formatos (src/sports/formats/ladder.ts). */
export const engineChallenge = (c: LadderChallenge): Challenge => ({
  id: c.id,
  challenger: c.challenger,
  challenged: c.challenged,
  createdAt: c.createdAt,
  acceptBy: c.acceptBy,
  playBy: c.playBy,
  status: c.status,
  ...(c.winner ? { winner: c.winner } : {}),
});

/** Por qué no puedo retar a ese (texto) o null si puedo. */
export function whyNot(order: readonly string[], me: string, target: string, challenges: readonly LadderChallenge[], maxUp: number): string | null {
  return challengeError(order, me, target, challenges.filter(isOpenChallenge).map(engineChallenge), maxUp);
}

/** A quiénes puedo retar ahora (de arriba abajo). */
export function targetsFor(order: readonly string[], me: string, challenges: readonly LadderChallenge[], maxUp: number): string[] {
  const p = order.indexOf(me);
  if (p <= 0) return [];
  return order.slice(Math.max(0, p - maxUp), p).filter((t) => whyNot(order, me, t, challenges, maxUp) === null);
}

/** Participantes con un reto abierto. */
export function busy(challenges: readonly LadderChallenge[]): Set<string> {
  const out = new Set<string>();
  for (const c of challenges) {
    if (!isOpenChallenge(c)) continue;
    out.add(c.challenger);
    out.add(c.challenged);
  }
  return out;
}

/** Mis participantes en la escalera: mi jugador (individual) o mis parejas (dobles). */
export function myEntrants(order: readonly string[], myPlayerId: string | null | undefined, myTeams: readonly string[]): string[] {
  if (!myPlayerId) return [];
  return order.filter((id) => id === myPlayerId || myTeams.includes(id));
}

// ---------------------------------------------------------------------------------------------------------
// Textos

const DAY = 86_400_000;

/** «hoy», «mañana», «en 3 días», «hace 2 días». */
export function relDays(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = Math.round((t - now) / DAY);
  if (t < now) {
    const ago = Math.max(0, Math.floor((now - t) / DAY));
    return ago === 0 ? 'hoy' : ago === 1 ? 'ayer' : `hace ${ago} días`;
  }
  if (d <= 0) return 'hoy';
  if (d === 1) return 'mañana';
  return `en ${d} días`;
}

/** Plazo del reto abierto: «Para aceptar: mañana», «Para jugar: en 5 días» (null si ya se cerró). */
export function deadlineText(c: LadderChallenge, now: number): string | null {
  if (c.status === 'pending') return `Para aceptar: ${relDays(c.acceptBy, now)}`;
  if (c.status === 'accepted') return `Para jugar: ${relDays(c.playBy, now)}`;
  return null;
}

/** El plazo que corre ya se venció (lo aplica la base al abrir: W.O. a favor del retador). */
export function overdue(c: LadderChallenge, now: number): boolean {
  if (c.status === 'pending') return Date.parse(c.acceptBy) < now;
  if (c.status === 'accepted') return Date.parse(c.playBy) < now;
  return false;
}

export const STATUS_TEXT: Record<ChallengeStatus, string> = {
  pending: 'Por aceptar',
  accepted: 'Aceptado',
  played: 'Jugado',
  walkover: 'W.O.',
  cancelled: 'Cancelado',
};

/** «Luis ganó y sube al 2.º», «Ana defendió su puesto», «W.O.: Luis sube al 3.º», «Cancelado». */
export function outcomeText(c: LadderChallenge, nameOf: (id: string) => string): string {
  if (c.status === 'cancelled') return c.note ? `Cancelado: ${c.note}` : 'Cancelado';
  if (!c.winner) return STATUS_TEXT[c.status];
  const up = c.winner === c.challenger && c.challengedPos != null;
  if (c.status === 'walkover') return up ? `W.O.: ${nameOf(c.winner)} sube al ${c.challengedPos}.º` : `W.O. a favor de ${nameOf(c.winner)}`;
  return up ? `${nameOf(c.winner)} ganó y sube al ${c.challengedPos}.º` : `${nameOf(c.winner)} defendió su puesto`;
}
