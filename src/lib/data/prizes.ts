import { useMemo } from 'react';
import { asBackendError } from '../db/errors';
import type { League, Member } from '../types';
import { badgeTags } from './badges';
import { getUserId, invalidate, queryClient, remember, rpc, select, type Live } from './client';
import { tags } from './keys';
import { canMakeBadges } from './leagueBadges';
import { useTopic } from './topics';

/**
 * Premios del torneo (docs/premios-torneo.md; 20260929001200_premios_torneo.sql): qué diseño del creador de insignias
 * se lleva cada lugar del podio de una competencia (un evento, un torneo de golf de varias rondas o un playoff) y la
 * entrega. Lo comparten todos los deportes; cada pantalla arma su competencia con src/prizes/catalog.ts.
 *
 * - Leer: select directo a `tournament_prizes` y `tournament_prize_slots` (las ve quien ve la liga, también sin cuenta).
 * - Escribir: solo por RPC y con señal (no entra en la cola sin conexión): `set_tournament_prizes` (quien diseña
 *   insignias), `tournament_podium`, `deliver_tournament_prizes` y `close_tournament_prizes` (admin o quien diseña).
 * - Tiempo real: la base avisa `badges` {kind: 'premio'} por `league:<liga>`; topics.ts invalida `badges:l:<liga>`
 *   (badgeTags.league), que es la etiqueta de todo lo de aquí.
 */

// ---------- Tipos ----------

/** De qué competencia es la premiación. */
export type PrizeScope = 'evento' | 'golf_torneo' | 'playoff';
/** Qué se premia: un equipo (o club), una pareja o un jugador. */
export type PrizeCategory = 'equipo' | 'pareja' | 'individual';
export type PrizePlace = 1 | 2 | 3;
/**
 * Qué competencia es (private.prize_comp): torneo del boliche, torneo de raqueta por categorías, noche de raqueta,
 * torneo relámpago, playoff, golf o natación.
 */
export type PrizeKind = 'bowling' | 'racket_tourney' | 'racket_night' | 'team_ko' | 'playoff' | 'golf' | 'swim';
/**
 * El podio de un lugar: 'listo'; 'vacio' (nadie: empate en el lugar de arriba, final por W.O.); 'sin_resultado'
 * (todavía no cuenta); 'empate_multiple' (más de 3 empatados: no se entrega sola); 'telefono' (lo arma el teléfono:
 * golf, natación y noches).
 */
export type PodiumStatus = 'listo' | 'vacio' | 'sin_resultado' | 'empate_multiple' | 'telefono';

export const PRIZE_SCOPES: readonly PrizeScope[] = ['evento', 'golf_torneo', 'playoff'];
export const PRIZE_CATEGORIES: readonly PrizeCategory[] = ['equipo', 'pareja', 'individual'];
export const PRIZE_PLACES: readonly PrizePlace[] = [1, 2, 3];
export const PRIZE_KINDS: readonly PrizeKind[] = ['bowling', 'racket_tourney', 'racket_night', 'team_ko', 'playoff', 'golf', 'swim'];
const STATUSES: readonly PodiumStatus[] = ['listo', 'vacio', 'sin_resultado', 'empate_multiple', 'telefono'];

/** Topes de la base (§4): lugares por competencia, unidades empatadas por lugar, jugadores por unidad y por entrega. */
export const MAX_PRIZE_SLOTS = 24;
export const MAX_PODIUM_UNITS = 3;
export const MAX_UNIT_PLAYERS = 100;
export const MAX_DELIVERY_PLAYERS = 300;
/** Largo de la cinta (league_badge_awards.period) y de la división que se copia a la insignia. */
export const PRIZE_PERIOD_MAX = 10;
export const PRIZE_LABEL_MAX = 16;
/** Días para corregir desde la primera entrega de cada lugar (después, o con «Cerrar premios», solo el dueño). */
export const PRIZE_EDIT_DAYS = 14;

/** Quién ganó un lugar (la foto que guarda la entrega; solo para mostrar). */
export interface PrizeWinner {
  /** 't:<equipo>', 'p:<jugador>', 'c:<club>' o 's:<partido>:<lado>'. */
  ref: string;
  name: string;
  teamId: string | null;
  /** Los jugadores que recibieron la insignia. */
  players: string[];
}

/** Un lugar premiado: la categoría, la división, el lugar y el diseño que se lleva. */
export interface PrizeSlot {
  id: string;
  category: PrizeCategory;
  /** '' general; raqueta: la categoría del torneo ('A'); golf: 'gross' | 'neto'; natación: 'F' | 'M'. */
  division: string;
  /** Lo que se copia a la insignia como división («Categoría A», «Femenino», «Gross»). */
  label: string;
  place: PrizePlace;
  badgeId: string;
  /** El título que calcula la base («Equipos (scratch)»); '' si se leyó de la tabla (usa prizeTitle). */
  title: string;
  winners: PrizeWinner[];
  /** El servidor comprobó el orden al entregar (boliche, cuadros, relámpago y playoffs). */
  verified: boolean;
  /** Primera entrega (null = sin entregar). */
  deliveredAt: string | null;
  deliveredBy: string | null;
  /** Hasta cuándo corrige un admin (la primera entrega + 14 días); null sin entregar. */
  editableUntil: string | null;
  updatedAt: string;
}

/** La premiación de una competencia. */
export interface TournamentPrize {
  id: string;
  leagueId: string;
  scope: PrizeScope;
  /** El evento, el torneo de golf o el playoff. */
  refId: string;
  /** La cinta de las insignias que se entregan («OCT 2026»). */
  period: string;
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Equipos, parejas, individual; por división y lugar. */
  slots: PrizeSlot[];
}

export interface PodiumPlayer {
  id: string;
  name: string;
  /**
   * Equipos y lados de raqueta (la base lo manda): true si apareció en la alineación de esos partidos, false si está
   * por la plantilla. Con alineaciones, la entrega marca por defecto solo a quienes jugaron. Sin él (boliche, golf…):
   * todos jugaron.
   */
  played?: boolean;
}

/** Una unidad del podio: un equipo, una pareja, un club o un jugador, con quiénes recibirían. */
export interface PodiumUnit {
  ref: string;
  name: string;
  teamId: string | null;
  players: PodiumPlayer[];
  /** Solo del teléfono, para mostrar: «1 812 pinos». La base no lo manda ni lo lee. */
  detail?: string;
}

/** Quien tiene hoy el premio de un lugar. */
export interface PrizeHolder {
  awardId: string;
  playerId: string;
  teamId: string | null;
}

/** El podio de un lugar según el servidor (`tournament_podium`). */
export interface SlotPodium {
  slotId: string;
  verified: boolean;
  status: PodiumStatus;
  /** Ya se puede entregar (en golf, natación y noches: la competencia terminó). */
  finished: boolean;
  units: PodiumUnit[];
  holders: PrizeHolder[];
  /** A quién se lo quitaron a mano y hoy no lo tiene: la entrega lo deja desmarcado. */
  withdrawn: string[];
}

export interface TournamentPodium {
  prizeId: string;
  kind: PrizeKind | null;
  /** El servidor calcula y comprueba el orden (boliche, cuadros, relámpago, playoffs). */
  verified: boolean;
  slots: SlotPodium[];
}

/** Un lugar para `set_tournament_prizes`. */
export interface PrizeSlotInput {
  category: PrizeCategory;
  division?: string;
  /** null o sin él: la base pone el de la división (el nombre de la categoría del torneo, «Femenino», «Gross»). */
  label?: string | null;
  place: PrizePlace;
  badgeId: string;
}

/** Una unidad que se entrega: su ref (la del podio) y los jugadores marcados. */
export interface DeliverUnit {
  ref: string;
  players: readonly string[];
}

/** El estado deseado de un lugar: `units: []` le quita el premio a quien lo tenga. */
export interface DeliverSlot {
  slotId: string;
  units: readonly DeliverUnit[];
}

export interface DeliverResult {
  /** Jugadores a los que se les dio, a los que se les quitó, que ya lo tenían y a los que se les avisó. */
  added: number;
  revoked: number;
  unchanged: number;
  notified: number;
  prize: TournamentPrize | null;
}

// ---------- Permisos (los mismos de la base) ----------

type PrizeCtx = { isOwner: boolean; isAdmin: boolean; member: Pick<Member, 'role' | 'badgeMaker'> | null; league: Pick<League, 'badgeMakers'> };

/** Elegir los premios: quien diseña insignias (private.can_badges). */
export const canPickPrizes = (ctx: PrizeCtx): boolean => canMakeBadges(ctx);
/** Entregar, corregir y cerrar: un admin de la liga o quien diseña insignias. */
export const canDeliverPrizes = (ctx: PrizeCtx): boolean => ctx.isAdmin || canMakeBadges(ctx);

// ---------- Ayudas ----------

/** La clave de un lugar: categoría, división y lugar (única en una premiación). */
export const slotKeyOf = (s: { category: string; division?: string | null; place: number }): string => `${s.category}|${s.division ?? ''}|${s.place}`;

const CATEGORY_ORDER: Readonly<Record<PrizeCategory, number>> = { equipo: 0, pareja: 1, individual: 2 };

/** El orden de la base: equipos, parejas, individual; división; lugar. */
export function compareSlots(a: Pick<PrizeSlot, 'category' | 'division' | 'place'>, b: Pick<PrizeSlot, 'category' | 'division' | 'place'>): number {
  return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || (a.division < b.division ? -1 : a.division > b.division ? 1 : 0) || a.place - b.place;
}

const DAY_MS = 24 * 3600_000;

/** Hasta cuándo corrige un admin ese lugar (null si no se entregó). */
export function editableUntil(slot: Pick<PrizeSlot, 'deliveredAt'>): string | null {
  const t = slot.deliveredAt ? Date.parse(slot.deliveredAt) : NaN;
  return Number.isFinite(t) ? new Date(t + PRIZE_EDIT_DAYS * DAY_MS).toISOString() : null;
}

/**
 * ¿El lugar está entregado? Solo si hoy tiene ganadores: uno que se quitó entero («Entregar este lugar» apagado, units
 * []) vuelve a estar sin entregar (se cambia su insignia, no dice «Nadie en este lugar» bajo «Campeones»), aunque la
 * base guarde su primera entrega para los 14 días.
 */
export const slotDelivered = (s: Pick<PrizeSlot, 'deliveredAt' | 'winners'>): boolean => !!s.deliveredAt && s.winners.length > 0;

/** ¿Se entregó algún lugar? (la cinta ya no cambia). */
export const anyDelivered = (prize: Pick<TournamentPrize, 'slots'> | null | undefined): boolean => !!prize?.slots.some(slotDelivered);

type WindowSlot = Pick<PrizeSlot, 'deliveredAt' | 'editableUntil'>;

/** ¿Pasaron los 14 días desde la primera entrega de ese lugar? (desde ahí solo el dueño lo cambia). */
export function slotExpired(s: WindowSlot, now: number): boolean {
  const until = s.editableUntil ?? editableUntil(s);
  return until != null && Date.parse(until) < now;
}

/**
 * ¿Quien no es dueño todavía puede entregar o corregir algo? No si la premiación se cerró, ni si todos los lugares ya
 * pasaron sus 14 días. La base lo revisa lugar por lugar: un lugar sin entregar se entrega aunque otro ya se venció.
 */
export function prizeOpen(prize: { closedAt: string | null; slots: readonly WindowSlot[] }, now: number): boolean {
  if (prize.closedAt) return false;
  return prize.slots.some((s) => !slotExpired(s, now));
}

/**
 * El próximo vencimiento de las correcciones («Puedes corregir hasta el 13 oct»): el más cercano de los lugares
 * entregados que todavía no se vencieron a `now` (sin `now`, el primero de todos); null si no queda ninguno.
 */
export function prizeDeadline(prize: { slots: readonly WindowSlot[] }, now = -Infinity): string | null {
  let best: string | null = null;
  for (const s of prize.slots) {
    const until = s.editableUntil ?? editableUntil(s);
    if (until && Date.parse(until) >= now && (!best || Date.parse(until) < Date.parse(best))) best = until;
  }
  return best;
}

// ---------- De la base a la pantalla ----------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (list.includes(v as T) ? (v as T) : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);

function toWinner(raw: unknown): PrizeWinner | null {
  if (!isObj(raw)) return null;
  const ref = str(raw.ref);
  if (!ref) return null;
  return { ref, name: str(raw.name), teamId: strOrNull(raw.teamId ?? raw.team_id), players: strings(raw.players) };
}

/** Un lugar de la RPC (camelCase) o de la tabla (snake_case); null si le falta lo básico. */
export function toPrizeSlot(raw: unknown): PrizeSlot | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const category = oneOf(raw.category, PRIZE_CATEGORIES);
  const place = int(raw.place);
  const badgeId = str(raw.badgeId ?? raw.badge_id);
  if (!id || !category || !badgeId || place < 1 || place > 3) return null;
  const deliveredAt = strOrNull(raw.deliveredAt ?? raw.delivered_at);
  return {
    id,
    category,
    division: str(raw.division),
    label: str(raw.label),
    place: place as PrizePlace,
    badgeId,
    title: str(raw.title),
    winners: Array.isArray(raw.winners) ? raw.winners.map(toWinner).filter((w): w is PrizeWinner => w !== null) : [],
    verified: raw.verified === true,
    deliveredAt,
    deliveredBy: strOrNull(raw.deliveredBy ?? raw.delivered_by),
    editableUntil: strOrNull(raw.editableUntil) ?? editableUntil({ deliveredAt }),
    updatedAt: str(raw.updatedAt ?? raw.updated_at),
  };
}

/**
 * Una premiación de la RPC (`prize_json`, camelCase, con sus lugares) o una fila de `tournament_prizes` con las filas
 * de sus lugares aparte. null si le falta lo básico.
 */
export function toTournamentPrize(raw: unknown, slotRows?: readonly unknown[]): TournamentPrize | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const leagueId = str(raw.leagueId ?? raw.league_id);
  const scope = oneOf(raw.scope, PRIZE_SCOPES);
  const refId = str(raw.refId ?? raw.event_id ?? raw.golf_tournament_id ?? raw.playoff_id);
  if (!id || !leagueId || !scope || !refId) return null;
  const rows = slotRows ?? (Array.isArray(raw.slots) ? raw.slots : []);
  return {
    id,
    leagueId,
    scope,
    refId,
    period: str(raw.period),
    closedAt: strOrNull(raw.closedAt ?? raw.closed_at),
    closedBy: strOrNull(raw.closedBy ?? raw.closed_by),
    createdAt: str(raw.createdAt ?? raw.created_at),
    updatedAt: str(raw.updatedAt ?? raw.updated_at),
    slots: rows
      .map(toPrizeSlot)
      .filter((s): s is PrizeSlot => s !== null)
      .sort(compareSlots),
  };
}

function toUnit(raw: unknown): PodiumUnit | null {
  if (!isObj(raw)) return null;
  const ref = str(raw.ref);
  if (!ref) return null;
  const players = Array.isArray(raw.players)
    ? raw.players
        .map((p): PodiumPlayer | null =>
          isObj(p) && str(p.id) ? { id: str(p.id), name: str(p.name).trim() || 'Jugador', ...(typeof p.played === 'boolean' ? { played: p.played } : {}) } : null,
        )
        .filter((p): p is PodiumPlayer => p !== null)
    : [];
  return { ref, name: str(raw.name).trim(), teamId: strOrNull(raw.teamId), players };
}

function toSlotPodium(raw: unknown): SlotPodium | null {
  if (!isObj(raw)) return null;
  const slotId = str(raw.slotId);
  if (!slotId) return null;
  return {
    slotId,
    verified: raw.verified === true,
    status: oneOf(raw.status, STATUSES) ?? 'sin_resultado',
    finished: raw.finished === true,
    units: Array.isArray(raw.units) ? raw.units.map(toUnit).filter((u): u is PodiumUnit => u !== null) : [],
    holders: Array.isArray(raw.holders)
      ? raw.holders
          .map((h): PrizeHolder | null => (isObj(h) && str(h.awardId) && str(h.playerId) ? { awardId: str(h.awardId), playerId: str(h.playerId), teamId: strOrNull(h.teamId) } : null))
          .filter((h): h is PrizeHolder => h !== null)
      : [],
    withdrawn: strings(raw.withdrawn),
  };
}

/** La vista previa de «Entregar premios» (`tournament_podium`). */
export function toTournamentPodium(raw: unknown): TournamentPodium | null {
  if (!isObj(raw)) return null;
  const prizeId = str(raw.prizeId);
  if (!prizeId) return null;
  return {
    prizeId,
    kind: oneOf(raw.kind, PRIZE_KINDS),
    verified: raw.verified === true,
    slots: Array.isArray(raw.slots) ? raw.slots.map(toSlotPodium).filter((s): s is SlotPodium => s !== null) : [],
  };
}

export function toDeliverResult(raw: unknown): DeliverResult {
  if (!isObj(raw)) return { added: 0, revoked: 0, unchanged: 0, notified: 0, prize: null };
  return {
    added: int(raw.added),
    revoked: int(raw.revoked),
    unchanged: int(raw.unchanged),
    notified: int(raw.notified),
    prize: toTournamentPrize(raw.prize),
  };
}

// ---------- Lecturas ----------

const PRIZE_COLUMNS = 'id, league_id, scope, event_id, golf_tournament_id, playoff_id, period, closed_at, closed_by, created_at, updated_at';
const SLOT_COLUMNS = 'id, prize_id, category, division, label, place, badge_id, winners, verified, delivered_at, delivered_by, updated_at';
const REF_COLUMN: Readonly<Record<PrizeScope, string>> = { evento: 'event_id', golf_torneo: 'golf_tournament_id', playoff: 'playoff_id' };

export const prizeKeys = {
  /** La premiación de una competencia. */
  comp: (lid: string, scope: PrizeScope, refId: string) => `prizes:${lid}:${scope}:${refId}`,
};

/** La premiación de una competencia con sus lugares (null si todavía no hay premios elegidos). */
export async function fetchTournamentPrize(lid: string, scope: PrizeScope, refId: string): Promise<TournamentPrize | null> {
  const [row] = await select<Record<string, unknown>>({
    table: 'tournament_prizes',
    columns: PRIZE_COLUMNS,
    filters: [
      { col: 'league_id', op: 'eq', value: lid },
      { col: REF_COLUMN[scope], op: 'eq', value: refId },
    ],
    limit: 1,
  });
  if (!row) return null;
  const slots = await select<Record<string, unknown>>({
    table: 'tournament_prize_slots',
    columns: SLOT_COLUMNS,
    filters: [{ col: 'prize_id', op: 'eq', value: str(row.id) }],
  });
  return toTournamentPrize(row, slots);
}

const live = <T>(st: { data: T; loading: boolean; error: Error | null }): Live<T> => ({ data: st.data, loading: st.loading, error: st.error });

/**
 * La premiación de una competencia (`refId` null = no leer). Con cuenta, al día con el tiempo real de la liga. La ve
 * quien ve la liga («El campeón se lleva…»), también sin cuenta en una liga pública.
 */
export function useTournamentPrize(lid: string | null | undefined, scope: PrizeScope, refId: string | null | undefined): Live<TournamentPrize | null> {
  const signedIn = !!getUserId();
  useTopic(lid && refId && signedIn ? `league:${lid}` : null, lid ?? null);
  const key = lid && refId ? prizeKeys.comp(lid, scope, refId) : null;
  if (key) remember(key, { kind: 'tournamentPrize', lid: lid!, id: refId! });
  const st = queryClient.useQuery<TournamentPrize | null>(key, () => fetchTournamentPrize(lid!, scope, refId!), {
    initial: null,
    tags: lid ? [badgeTags.all, badgeTags.league(lid), tags.league(lid)] : [],
    staleMs: 60_000,
  });
  return useMemo(() => live(st), [st]);
}

/** La vista previa de «Entregar premios»: el podio de cada lugar, quién lo tiene y a quién se lo quitaron a mano. */
export async function fetchTournamentPodium(prizeId: string): Promise<TournamentPodium> {
  const res = toTournamentPodium(await rpc<unknown>('tournament_podium', { p_prize: prizeId }));
  if (!res) throw new Error('tournament_podium: respuesta sin podio');
  return res;
}

// ---------- Escrituras (con señal) ----------

type PrizeRef = Pick<TournamentPrize, 'id' | 'leagueId' | 'scope' | 'refId'>;

/** Deja en la caché lo que devolvió la base y vuelve a leer lo de la liga (insignias y premios). */
function afterPrizes(lid: string, saved?: { scope: PrizeScope; refId: string; prize: TournamentPrize | null }, extra: string[] = []) {
  if (saved) queryClient.setQueryData<TournamentPrize | null>(prizeKeys.comp(lid, saved.scope, saved.refId), saved.prize);
  invalidate(badgeTags.league(lid), ...extra);
}

export interface SetPrizesInput {
  lid: string;
  scope: PrizeScope;
  refId: string;
  /** La cinta (≤ 10). null = la que tiene, o el mes de la competencia al crearla. */
  period?: string | null;
  /** EL CONJUNTO COMPLETO (0–24): un lugar que no viene se borra; [] borra la premiación. */
  slots: readonly PrizeSlotInput[];
}

/**
 * Guarda qué insignia se lleva cada lugar (quien diseña insignias). Idempotente: reintentar no duplica nada. Devuelve
 * la premiación como quedó, o null si quedó sin lugares.
 */
export async function setTournamentPrizes(input: SetPrizesInput): Promise<TournamentPrize | null> {
  let prize: TournamentPrize | null | undefined;
  try {
    const res = await rpc<unknown>('set_tournament_prizes', {
      p_league: input.lid,
      p_scope: input.scope,
      p_ref: input.refId,
      p_period: input.period ?? null,
      p_slots: input.slots.map((s) => ({
        category: s.category,
        division: s.division ?? '',
        ...(s.label != null ? { label: s.label } : {}),
        place: s.place,
        badge_id: s.badgeId,
      })),
    });
    prize = res == null ? null : toTournamentPrize(res);
    return prize;
  } finally {
    afterPrizes(input.lid, prize !== undefined ? { scope: input.scope, refId: input.refId, prize } : undefined);
  }
}

/**
 * Los lugares en tandas de hasta `max` jugadores (el tope de la base por llamada), sin partir un lugar: tres clubes
 * grandes de natación en el podio pasan de 300 entre todos. Sin lugares, una tanda vacía (la llamada igual devuelve la
 * premiación).
 */
export function deliveryBatches(slots: readonly DeliverSlot[], max = MAX_DELIVERY_PLAYERS): DeliverSlot[][] {
  const out: DeliverSlot[][] = [];
  let batch: DeliverSlot[] = [];
  let count = 0;
  for (const s of slots) {
    const n = s.units.reduce((t, u) => t + new Set(u.players).size, 0);
    if (batch.length && count + n > max) {
      out.push(batch);
      batch = [];
      count = 0;
    }
    batch.push(s);
    count += n;
  }
  if (batch.length || !out.length) out.push(batch);
  return out;
}

/**
 * Entrega o corrige (estado deseado: correrla otra vez con lo mismo no cambia nada). `slots` trae solo los lugares
 * que se tocan; `units: []` quita. Con `notify`, push a quien recibe (nunca en ligas con menores). Si pasan de 300
 * jugadores, va en varias llamadas (`deliveryBatches`); si una falla, reintentar completa lo que faltó.
 */
export async function deliverTournamentPrizes(prize: PrizeRef, slots: readonly DeliverSlot[], notify = true): Promise<DeliverResult> {
  let saved: TournamentPrize | null | undefined;
  const total: DeliverResult = { added: 0, revoked: 0, unchanged: 0, notified: 0, prize: null };
  try {
    for (const batch of deliveryBatches(slots)) {
      const res = toDeliverResult(
        await rpc<unknown>('deliver_tournament_prizes', {
          p_prize: prize.id,
          p_podium: batch.map((s) => ({ slot_id: s.slotId, units: s.units.map((u) => ({ ref: u.ref, players: [...new Set(u.players)] })) })),
          p_notify: notify,
        }),
      );
      total.added += res.added;
      total.revoked += res.revoked;
      total.unchanged += res.unchanged;
      total.notified += res.notified;
      total.prize = res.prize;
      saved = res.prize ?? undefined;
    }
    return total;
  } finally {
    // Quien entrega puede estar en el podio (boliche): su vitrina también cambia.
    afterPrizes(prize.leagueId, saved !== undefined ? { scope: prize.scope, refId: prize.refId, prize: saved } : undefined, [badgeTags.mine]);
  }
}

/** «Cerrar premios» antes de los 14 días: desde ahí solo el dueño corrige. No se reabre. */
export async function closeTournamentPrizes(prize: PrizeRef): Promise<void> {
  try {
    await rpc('close_tournament_prizes', { p_prize: prize.id });
  } finally {
    // La premiación lleva la etiqueta de las insignias de la liga: se vuelve a leer con closedAt.
    afterPrizes(prize.leagueId);
  }
}

// ---------- Errores en palabras ----------

/** Código corto de una RPC de premios ('ya_entregado', 'podio_cambio'…) o null (red, sesión, otro). */
export function prizeCode(e: unknown): string | null {
  const be = asBackendError(e);
  if (!be) return null;
  const msg = be.message.trim();
  // private.deny() lanza 'no_permitido' con 42501; los demás (private.fail) van con P0001.
  if (be.code === '42501') return msg === 'no_permitido' ? msg : null;
  if (be.code !== 'P0001' && be.kind !== 'rate_limited') return null;
  const m = /^([a-z_]+)/.exec(msg);
  return m ? m[1] : null;
}

/** Lo que dice el teléfono con cada código (docs/premios-torneo.md §4.6). */
export const PRIZE_ERROR_TEXT: Readonly<Record<string, string>> = {
  no_existe: 'Ese torneo o esa insignia ya no existe.',
  no_permitido: 'No tienes permiso para esto.',
  invalido: 'Revisa los premios: algo no corresponde a este torneo.',
  no_activa: 'Esa insignia está archivada. Actívala o elige otra.',
  texto_bloqueado: 'Ese texto no se puede usar.',
  ya_entregado: 'Ese premio ya se entregó. Quítalo primero para cambiarlo.',
  sin_resultado: 'Todavía no hay resultado final para ese premio.',
  podio_cambio: 'El podio cambió mientras mirabas. Vuelve a cargarlo.',
  a_si_mismo: 'Estás en ese podio. Pídele a otro admin o al dueño que entregue ese premio.',
  cerrado: 'Los premios de este torneo ya se cerraron. Solo el dueño puede corregirlos.',
  rate_limited: 'Demasiados cambios seguidos. Prueba en un rato.',
};

const defaultFallback = (e: unknown): string => {
  const be = asBackendError(e);
  if (be?.kind === 'network') return 'Sin conexión. Intenta de nuevo cuando vuelva la señal.';
  if (be?.kind === 'auth') return 'Tu sesión venció. Entra de nuevo.';
  return 'No se pudo guardar. Intenta de nuevo.';
};

/** El error de una RPC de premios en palabras; lo demás (red, sesión) con `fallback` (en pantalla: saveErrorMessage). */
export function prizeErrorText(e: unknown, fallback: (e: unknown) => string = defaultFallback): string {
  const code = prizeCode(e);
  return (code && PRIZE_ERROR_TEXT[code]) || fallback(e);
}

/** El error al cargar el podio de «Entregar premios» (una lectura: nada de «No se pudo guardar»). */
export function podiumLoadErrorText(e: unknown): string {
  return prizeErrorText(e, (x) => {
    const be = asBackendError(x);
    if (be?.kind === 'network') return 'Sin conexión. Intenta de nuevo cuando vuelva la señal.';
    if (be?.kind === 'auth') return 'Tu sesión venció. Entra de nuevo.';
    return 'No se pudo cargar el podio. Intenta de nuevo.';
  });
}
