import { BLOCKED_MESSAGE, isBlockedError } from '../backend/errors';
import { uuidv7 } from '../db/ids';
import { averageForDay } from '../bowlingSeason';
import { playerStats } from '../stats';
import type { Entry, Member, Player } from '../types';
import { invalidate, rpc, select, useLive, type Live } from './client';
import { keys, tags } from './keys';
import { chunks, toEntry, toPlayer, type EntryRow, type PlayerRow } from './rows';
import { fetchLeagueSeasons } from './seasons';

// ---------- Lecturas ----------

export const fetchPlayers = async (lid: string): Promise<Player[]> =>
  (await select<PlayerRow>({ table: 'players', filters: [{ col: 'league_id', op: 'eq', value: lid }], order: [{ col: 'name' }] })).map(toPlayer);

export const usePlayers = (lid: string | undefined): Live<Player[]> =>
  useLive<Player[]>(lid ? keys.players(lid) : null, lid ? { kind: 'players', lid } : null, () => fetchPlayers(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), tags.players(lid)] : [],
  });

export async function fetchPlayer(lid: string, id: string): Promise<Player | null> {
  const rows = await select<PlayerRow>({
    table: 'players',
    filters: [
      { col: 'id', op: 'eq', value: id },
      { col: 'league_id', op: 'eq', value: lid },
    ],
  });
  return rows[0] ? toPlayer(rows[0]) : null;
}

export const usePlayer = (lid: string | undefined, id: string | undefined): Live<Player | null> =>
  useLive<Player | null>(lid && id ? keys.player(lid, id) : null, lid ? { kind: 'player', lid, id } : null, () => fetchPlayer(lid!, id!), {
    initial: null,
    tags: lid ? [tags.league(lid), tags.players(lid)] : [],
  });

/**
 * Promedio con el que cada jugador entra a un evento (para el handicap). Con `at` (la fecha del evento y su id): el
 * de la temporada de ese día cuando ya tiene el mínimo de juegos; si no, el de la temporada anterior, el fijo o el
 * de su última participación (averageForDay en src/lib/bowlingSeason.ts; no cuenta los juegos de ese mismo evento).
 * Sin `at`, o si no se pueden leer las temporadas: el fijo o el calculado con todos sus juegos verificados.
 */
export async function fetchEffectiveAverages(lid: string, players: Pick<Player, 'id' | 'averageOverride'>[], at?: { date: string; eventId?: string | null }) {
  if (at?.date && players.length) {
    const bySeason = await seasonAverages(lid, players, at).catch((e: unknown) => {
      console.error(e);
      return null;
    });
    if (bySeason) return bySeason;
  }
  const result = new Map<string, number>();
  const need = players.filter((p) => {
    if (p.averageOverride != null) result.set(p.id, p.averageOverride);
    return p.averageOverride == null;
  });
  for (const chunk of chunks(need)) {
    const rows = await select<EntryRow>({
      table: 'entries',
      filters: [
        { col: 'league_id', op: 'eq', value: lid },
        { col: 'player_id', op: 'in', value: chunk.map((p) => p.id) },
      ],
    });
    const entries: Entry[] = rows.map(toEntry);
    for (const p of chunk) result.set(p.id, playerStats(entries.filter((e) => e.playerId === p.id)).autoAverage ?? 0);
  }
  return result;
}

/** El promedio por temporada de fetchEffectiveAverages: temporadas, fechas de los eventos y sus participaciones. */
async function seasonAverages(lid: string, players: Pick<Player, 'id' | 'averageOverride'>[], at: { date: string; eventId?: string | null }) {
  const [seasons, events] = await Promise.all([
    fetchLeagueSeasons(lid),
    select<{ id: string; date: string }>({ table: 'events', columns: 'id,date', filters: [{ col: 'league_id', op: 'eq', value: lid }] }),
  ]);
  const dateOf = new Map(events.map((e) => [e.id, e.date]));
  const result = new Map<string, number>();
  for (const chunk of chunks(players)) {
    const rows = await select<EntryRow>({
      table: 'entries',
      filters: [
        { col: 'league_id', op: 'eq', value: lid },
        { col: 'player_id', op: 'in', value: chunk.map((p) => p.id) },
      ],
    });
    const entries = rows.map(toEntry).flatMap((entry) => (dateOf.has(entry.eventId) ? [{ entry, date: dateOf.get(entry.eventId)! }] : []));
    for (const p of chunk) {
      const mine = entries.filter((d) => d.entry.playerId === p.id);
      result.set(p.id, averageForDay({ entries: mine, seasons, day: at.date, skipEvent: at.eventId, override: p.averageOverride }).average);
    }
  }
  return result;
}

// ---------- Jugadores y vínculo con la cuenta ----------

/** Lo que cambia cuando cambia un jugador: la lista, las membresías (su jugador) y lo que cuelga de él. */
const afterPlayer = (lid: string) => invalidate(tags.players(lid), tags.leagueMembers(lid), tags.members);

/**
 * Un menor de edad (solo en ligas con menores): el nombre de su padre, madre o tutor (obligatorio), su teléfono
 * (opcional) y su permiso (obligatorio). Va a player_private: solo lo leen los admins.
 */
export interface MinorInput {
  guardianName: string;
  guardianPhone?: string | null;
  /** El padre, madre o tutor dio permiso para registrarlo en la app. */
  consent: boolean;
}

/** Los parámetros del tutor para create_player / set_player_minor (el teléfono, sin espacios ni guiones). */
const minorArgs = (m: MinorInput) => ({
  p_guardian_name: m.guardianName.trim(),
  p_guardian_phone: m.guardianPhone?.replace(/[\s().-]/g, '') || null,
  p_consent: m.consent,
});

/** Admin: jugador de la lista, sin cuenta. `minor`: es menor de edad (con su tutor y el permiso). */
export async function createPlayer(lid: string, name: string, averageOverride: number | null, minor: MinorInput | null = null): Promise<string> {
  const id = uuidv7();
  await rpc('create_player', {
    p_league: lid,
    p_name: name.trim(),
    p_average_override: averageOverride,
    p_id: id,
    ...(minor ? { p_is_minor: true, ...minorArgs(minor) } : {}),
  });
  invalidate(tags.players(lid));
  return id;
}

/**
 * Admin: marca a un jugador sin cuenta como menor (con su tutor y el permiso) o lo desmarca (`minor` null). Los
 * datos del tutor quedan en player_private (solo admins).
 */
export async function setPlayerMinor(lid: string, playerId: string, minor: MinorInput | null): Promise<void> {
  await rpc('set_player_minor', { p_player: playerId, p_is_minor: !!minor, ...(minor ? minorArgs(minor) : {}) });
  invalidate(tags.players(lid), `player-private:${lid}`);
}

/** Datos privados de un menor (solo admins): su tutor, el teléfono y cuándo dio el permiso. */
export interface GuardianInfo {
  playerId: string;
  guardianName: string | null;
  guardianPhone: string | null;
  consentAt: string | null;
}

/** Solo admins (la RLS de player_private). No se guarda en el teléfono: son datos de menores. */
export async function fetchGuardians(lid: string): Promise<Record<string, GuardianInfo>> {
  const rows = await select<{ player_id: string; guardian_name: string | null; guardian_phone: string | null; consent_at: string | null }>({
    table: 'player_private',
    columns: 'player_id,guardian_name,guardian_phone,consent_at',
    filters: [{ col: 'league_id', op: 'eq', value: lid }],
  });
  const out: Record<string, GuardianInfo> = {};
  for (const r of rows) {
    out[r.player_id] = { playerId: r.player_id, guardianName: r.guardian_name, guardianPhone: r.guardian_phone, consentAt: r.consent_at };
  }
  return out;
}

export const useGuardians = (lid: string | undefined, enabled = true): Live<Record<string, GuardianInfo>> =>
  useLive<Record<string, GuardianInfo>>(
    lid && enabled ? `player-private:guardians:${lid}` : null,
    lid ? { kind: 'guardians', lid } : null,
    () => fetchGuardians(lid!),
    { initial: {}, persist: false, tags: lid ? [tags.league(lid), tags.players(lid), `player-private:${lid}`] : [] },
  );

export async function updatePlayer(lid: string, id: string, patch: Partial<Omit<Player, 'id'>>) {
  const p: Record<string, unknown> = {};
  if (patch.name !== undefined) p.name = patch.name.trim();
  if (patch.averageOverride !== undefined) p.average_override = patch.averageOverride;
  if (patch.isMinor !== undefined) p.is_minor = patch.isMinor;
  // La cuenta (uid) no se cambia aquí: claimPlayer, linkAccountToPlayer, unlinkAccount.
  if (!Object.keys(p).length) return;
  await rpc('update_player', { p_player: id, p_patch: p });
  invalidate(tags.players(lid));
}

/** Borra el jugador con sus participaciones, envíos, «voy» y en vivo; su cuenta, si tiene, queda sin jugador. */
export async function deletePlayer(lid: string, id: string, _uid?: string | null) {
  await rpc('delete_player', { p_player: id });
  afterPlayer(lid);
  invalidate(tags.entries(lid), tags.subs(lid), tags.events(lid), tags.social(lid));
}

/**
 * La cuenta (la de la sesión) pide ser un jugador de la liga que todavía no tiene cuenta: queda el pedido y lo
 * aprueba el dueño o un admin (un admin lo toma al momento). Devuelve el id del pedido (null si ya era suyo).
 * Para la pantalla, mejor requestClaim de ./claims (actualiza la caché y trae la nota).
 */
export async function claimPlayer(lid: string, _uid: string, playerId: string): Promise<string | null> {
  const id = await rpc<string | null>('claim_player', { p_player: playerId });
  afterPlayer(lid);
  invalidate(`claims:${lid}`, 'claims:me');
  return id ?? null;
}

/** El jugador de la cuenta en la liga (el que tiene o uno nuevo; lo crea la base). */
export async function createOwnPlayer(lid: string, _uid: string, _name: string): Promise<string> {
  const id = await rpc<string>('ensure_my_player', { p_league: lid });
  afterPlayer(lid);
  return id;
}

// Jugadores que se están dejando listos ahora (una sola vez aunque se pida desde varios lados).
const ensuring = new Map<string, Promise<string>>();

/**
 * La cuenta juega en la liga con su propia cuenta. La base decide (en una transacción, sin crear dos): el
 * que ya tiene; si no, uno nuevo. Si eligió un jugador libre (`prefer`) o hay un único libre con su mismo
 * nombre, además queda el pedido de ese jugador para que el dueño o un admin lo apruebe (un admin lo toma al
 * momento y se devuelve ese). `fresh` queda por compatibilidad (la base ya crea el del dueño al crear la liga).
 */
export function ensurePlayer(
  lid: string,
  uid: string,
  _name: string,
  { prefer = null }: { fresh?: boolean; prefer?: string | null } = {},
): Promise<string> {
  const key = `${lid}:${uid}`;
  const pending = ensuring.get(key);
  if (pending) return pending;
  const next = rpc<string>('ensure_my_player', { p_league: lid, p_prefer: prefer })
    .then((id) => {
      afterPlayer(lid);
      return id;
    })
    .finally(() => ensuring.delete(key));
  ensuring.set(key, next);
  return next;
}

/**
 * Admin: une la cuenta de un miembro con un jugador de la lista que no tiene cuenta (sus juegos pasan a la
 * cuenta). Del jugador que tenía, lo pendiente pasa al nuevo; si nunca jugó un evento se borra.
 */
export async function linkAccountToPlayer(lid: string, member: Pick<Member, 'uid'>, playerId: string): Promise<{ removedOld: boolean }> {
  const r = await rpc<{ removed_old: boolean; old_player_id: string | null }>('link_account_to_player', { p_player: playerId, p_user: member.uid });
  afterPlayer(lid);
  invalidate(tags.subs(lid), tags.events(lid));
  return { removedOld: r?.removed_old === true };
}

/**
 * Admin (o la propia cuenta): separa la cuenta del jugador y le da a la cuenta su jugador nuevo en el mismo
 * momento (si no, al abrir la liga se volvería a vincular sola con este por el nombre).
 */
export async function unlinkAccount(lid: string, playerId: string, _account: { uid: string; name: string }) {
  await rpc<string>('unlink_account', { p_player: playerId });
  afterPlayer(lid);
}

// ---------- Juntar dos jugadores repetidos (admin) ----------

/** Por qué no se pueden juntar: los dos tienen cuenta, o uno es menor y el otro tiene cuenta. */
export type MergeBlock = 'dos_cuentas' | 'menor_con_cuenta';

export interface MergeSide {
  id: string;
  name: string;
  userId: string | null;
  isMinor: boolean;
}

/** Lo que pasaría al juntar (merge_league_players_preview): no cambia nada. */
export interface MergePreview {
  canMerge: boolean;
  reason: MergeBlock | null;
  /** Lo que choca (los dos jugaron el mismo evento o partido…): hay que quitarlo antes. */
  conflicts: { what: string; label: string; count: number }[];
  /** La cuenta del que se va pasa al que queda. */
  moveAccount: boolean;
  keep: MergeSide;
  drop: MergeSide;
}

/** Admin: qué pasaría al juntar `drop` en `keep` (los dos de la liga). */
export async function previewMergePlayers(lid: string, keep: string, drop: string): Promise<MergePreview> {
  const r = await rpc<MergePreview>('merge_league_players_preview', { p_league: lid, p_keep: keep, p_drop: drop });
  return { ...r, reason: r.reason ?? null, conflicts: r.conflicts ?? [], moveAccount: !!r.moveAccount };
}

/**
 * Admin: junta `drop` en `keep` (el que queda): sus juegos, partidos, envíos y «voy» pasan a `keep` y `drop` se
 * borra. Si solo `drop` tenía cuenta, la cuenta pasa a `keep`. Si chocan: BackendError 'conflicto: …' (ver
 * mergeErrorText). Devuelve el que queda y su cuenta.
 */
export async function mergePlayers(lid: string, keep: string, drop: string): Promise<{ playerId: string; removedId: string; userId: string | null }> {
  const r = await rpc<{ playerId: string; removedId: string; userId: string | null }>('merge_league_players', {
    p_league: lid,
    p_keep: keep,
    p_drop: drop,
  });
  // Cambia casi todo lo de la liga (tablas, eventos, partidos, pedidos): se vuelve a leer.
  invalidate(tags.league(lid), tags.members, tags.feeds, `claims:${lid}`, 'claims:me');
  return { playerId: r.playerId, removedId: r.removedId, userId: r.userId ?? null };
}

/** Por qué no se pueden juntar, en palabras (para el aviso del modal). */
export function mergeBlockText(reason: MergeBlock | null, keep: string, drop: string): string | null {
  if (reason === 'dos_cuentas') return `${keep} y ${drop} tienen cuenta cada uno: son dos personas distintas y no se pueden juntar.`;
  if (reason === 'menor_con_cuenta') return 'Uno es menor de edad y el otro tiene cuenta: un menor no puede quedar con una cuenta.';
  return null;
}

/** Lo que choca, de un error 'conflicto: Juegos en el mismo evento (1), …'; null si el error es otro. */
export function mergeConflictList(e: unknown): string[] | null {
  const msg = (e instanceof Error ? e.message : typeof e === 'string' ? e : '').trim();
  const m = /^conflicto:\s*([\s\S]*)$/.exec(msg);
  if (!m) return null;
  return m[1]
    .split(/,\s*(?![^()]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** El error de juntar en palabras simples. */
export function mergeErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const list = mergeConflictList(e);
  if (list) {
    const what = list.length ? `: ${list.join(', ')}` : '';
    return `No se pueden juntar porque los dos jugaron lo mismo${what}. Quita lo repetido y junta otra vez.`;
  }
  const kind = e && typeof e === 'object' ? (e as { kind?: unknown }).kind : null;
  const code = (e instanceof Error ? e.message : '').trim().split(/[\s:]/)[0];
  if (kind === 'permission' || code === 'no_permitido') return 'Solo el dueño o un admin de la liga puede juntar jugadores.';
  if (kind === 'not_found' || code === 'no_existe') return 'Uno de los dos ya no está en la liga.';
  if (kind === 'network') return 'Sin conexión. Prueba otra vez cuando tengas señal.';
  if (code === 'invalido') return 'Esos dos no se pueden juntar (los dos tienen cuenta, o uno es menor y el otro tiene cuenta).';
  return 'No se pudo juntar. Prueba otra vez.';
}
