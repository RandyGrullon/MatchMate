import type { LeagueRole, Member, UserProfile } from '../types';
import { getUserId, invalidate, rpc, select, useLive, type Live } from './client';
import { keys, tags } from './keys';
import { toMember, toProfile, type MembershipRow, type ProfileRow } from './rows';

export { memberId } from './rows';

const MEMBER_COLUMNS = 'league_id,user_id,role,is_scorer,display_name,player_id';

export async function fetchMembership(lid: string, uid: string): Promise<Member | null> {
  const rows = await select<MembershipRow>({
    table: 'memberships',
    columns: MEMBER_COLUMNS,
    filters: [
      { col: 'league_id', op: 'eq', value: lid },
      { col: 'user_id', op: 'eq', value: uid },
    ],
  });
  return rows[0] ? toMember(rows[0]) : null;
}

/** La membresía de la cuenta en la liga (null = no es miembro). Trae su jugador (`playerId`). */
export const useMembership = (lid: string | undefined, uid: string | undefined): Live<Member | null> =>
  useLive<Member | null>(
    lid && uid ? keys.membership(lid, uid) : null,
    lid ? { kind: 'membership', lid } : null,
    () => fetchMembership(lid!, uid!),
    { initial: null, tags: lid ? [tags.league(lid), tags.members, tags.leagueMembers(lid)] : [] },
  );

/** Ligas de las que la cuenta era miembro en la última lectura (para notar si la sacaron). */
const lastLeagues = new Map<string, Set<string>>();

export async function fetchMyMemberships(uid: string): Promise<Member[]> {
  const rows = await select<MembershipRow>({ table: 'memberships', columns: MEMBER_COLUMNS, filters: [{ col: 'user_id', op: 'eq', value: uid }] });
  const list = rows.map(toMember);
  // Perdió el acceso a una liga (lo sacaron o se borró): lo de esa liga se vuelve a leer (y deja de verse si era privada).
  const now = new Set(list.map((m) => m.leagueId));
  const before = lastLeagues.get(uid);
  lastLeagues.set(uid, now);
  if (before) for (const lid of before) if (!now.has(lid)) queueMicrotask(() => invalidate(tags.league(lid), tags.leagues));
  return list;
}

export const useMyMemberships = (uid: string | undefined): Live<Member[]> =>
  useLive<Member[]>(uid ? keys.myMemberships(uid) : null, { kind: 'memberships' }, () => fetchMyMemberships(uid!), {
    initial: [],
    tags: [tags.members],
  });

export const fetchLeagueMembers = async (lid: string): Promise<Member[]> =>
  (
    await select<MembershipRow>({
      table: 'memberships',
      columns: MEMBER_COLUMNS,
      filters: [{ col: 'league_id', op: 'eq', value: lid }],
      order: [{ col: 'display_name' }],
    })
  ).map(toMember);

export const useLeagueMembers = (lid: string | undefined): Live<Member[]> =>
  useLive<Member[]>(lid ? keys.leagueMembers(lid) : null, lid ? { kind: 'members', lid } : null, () => fetchLeagueMembers(lid!), {
    initial: [],
    tags: lid ? [tags.league(lid), tags.leagueMembers(lid)] : [],
  });

export const fetchUsers = async (): Promise<UserProfile[]> =>
  (await select<ProfileRow>({ table: 'profiles', columns: 'id,email,name,username,is_superadmin', order: [{ col: 'name' }] })).map(toProfile);

/** Cuentas registradas (solo el superadmin puede leerlas todas). Tienen correos: no se guardan en el teléfono. */
export const useUsers = (enabled: boolean): Live<UserProfile[]> =>
  useLive<UserProfile[]>(enabled ? keys.users : null, { kind: 'users' }, fetchUsers, { initial: [], tags: [tags.users], persist: false });

/** Lo que cambia cuando cambia una membresía. */
const afterMember = (lid: string, uid: string) => {
  invalidate(tags.leagueMembers(lid), tags.players(lid));
  if (uid === getUserId()) invalidate(tags.members, tags.league(lid), tags.feeds);
};

/** Salir de la liga (o que un admin saque a alguien): su jugador queda sin cuenta y su en vivo se quita. */
export async function removeMember(member: Pick<Member, 'leagueId' | 'uid'>) {
  await rpc('remove_member', { p_league: member.leagueId, p_user: member.uid });
  afterMember(member.leagueId, member.uid);
}

export async function setMemberRole(member: Pick<Member, 'leagueId' | 'uid'>, role: Exclude<LeagueRole, 'owner'>) {
  await rpc('set_member_role', { p_league: member.leagueId, p_user: member.uid, p_role: role });
  afterMember(member.leagueId, member.uid);
}

/** Anotador del torneo (solo lo cambia el dueño). */
export async function setMemberScorer(member: Pick<Member, 'leagueId' | 'uid'>, scorer: boolean) {
  await rpc('set_member_scorer', { p_league: member.leagueId, p_user: member.uid, p_scorer: scorer });
  afterMember(member.leagueId, member.uid);
}

export async function setSuperadmin(uid: string, value: boolean) {
  await rpc('set_superadmin', { p_user: uid, p_value: value });
  invalidate(tags.users, tags.profile(uid));
}
