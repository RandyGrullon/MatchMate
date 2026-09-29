import { uuidv7 } from '../db/ids';
import { playerStats } from '../stats';
import type { Entry, Member, Player } from '../types';
import { invalidate, rpc, select, useLive, type Live } from './client';
import { keys, tags } from './keys';
import { chunks, toEntry, toPlayer, type EntryRow, type PlayerRow } from './rows';

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

/** Promedio que tiene hoy cada jugador en la liga (fijo o calculado con sus juegos verificados). */
export async function fetchEffectiveAverages(lid: string, players: Pick<Player, 'id' | 'averageOverride'>[]) {
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

// ---------- Jugadores y vínculo con la cuenta ----------

/** Lo que cambia cuando cambia un jugador: la lista, las membresías (su jugador) y lo que cuelga de él. */
const afterPlayer = (lid: string) => invalidate(tags.players(lid), tags.leagueMembers(lid), tags.members);

export async function createPlayer(lid: string, name: string, averageOverride: number | null): Promise<string> {
  const id = uuidv7();
  await rpc('create_player', { p_league: lid, p_name: name.trim(), p_average_override: averageOverride, p_id: id });
  invalidate(tags.players(lid));
  return id;
}

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
