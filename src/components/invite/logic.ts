/**
 * Lo que no es pantalla de la hoja de invitar (InviteSheet.tsx): quién puede invitar, qué se ve según la búsqueda,
 * cómo se marca cada persona, el botón de enviar y el link para compartir. Funciones puras, con pruebas en
 * logic.test.ts. Los datos y las RPC están en src/lib/data/people.ts y src/lib/data/invites.ts.
 */
import { INVITE_MAX } from '../../lib/data/invites';
import { PEOPLE_QUERY_MIN, peopleQuery, type PersonHit } from '../../lib/data/people';
import type { League, LeagueKind } from '../../lib/types';

// ---------- Quién invita ----------

/**
 * El dueño o un admin invita a cualquiera de sus ligas (también las privadas); un miembro, solo a una pública (la
 * misma regla de la base en invite_to_league y de la portada de la liga).
 */
export function canInviteTo(league: Pick<League, 'visibility'>, isAdmin: boolean, member: boolean): boolean {
  return isAdmin || (member && league.visibility === 'public');
}

// ---------- Personas ----------

/** Por qué no se puede elegir a alguien: ya está en la liga o ya tiene una invitación pendiente. */
export type PersonState = 'member' | 'invited' | null;

export function personState(hit: Pick<PersonHit, 'inLeague' | 'invited'>): PersonState {
  return hit.inLeague ? 'member' : hit.invited ? 'invited' : null;
}

export const PERSON_STATE_TEXT: Record<Exclude<PersonState, null>, string> = {
  member: 'En la liga',
  invited: 'Invitado',
};

/** La marca de la tarjeta: «En la liga» o, en un torneo, «En el torneo»; «Invitado». */
export function personStateText(state: Exclude<PersonState, null>, kind: LeagueKind = 'liga'): string {
  return state === 'member' && kind === 'torneo' ? 'En el torneo' : PERSON_STATE_TEXT[state];
}

/** «la liga» o «el torneo». */
export const leagueNounOf = (kind: LeagueKind | null | undefined) => (kind === 'torneo' ? 'el torneo' : 'la liga');

/** El título de la hoja y del botón que la abre: «Invitar a la liga» o «Invitar al torneo». */
export const inviteTitle = (kind: LeagueKind | null | undefined) => (kind === 'torneo' ? 'Invitar al torneo' : 'Invitar a la liga');

/** @usuario con la arroba (null si todavía no llegó: perfiles guardados de antes). */
export const handleOf = (username: string | null | undefined) => (username ? `@${username}` : null);

/** Lo que lee el lector de pantalla en cada tarjeta: «Ana Pérez, @ana, ya está en la liga» (o «en el torneo»). */
export function personLabel(hit: PersonHit, kind: LeagueKind = 'liga'): string {
  const state = personState(hit);
  const parts = [hit.name || handleOf(hit.username) || 'Sin nombre'];
  const handle = handleOf(hit.username);
  if (hit.name && handle) parts.push(handle);
  if (state === 'member') parts.push(`ya está en ${leagueNounOf(kind)}`);
  if (state === 'invited') parts.push('ya tiene invitación');
  return parts.join(', ');
}

/**
 * Elegir o soltar a alguien. A quien ya está en la liga o ya tiene invitación no se le elige, y no pasan de
 * `max` (la base no acepta más de 50 por vez): en esos casos devuelve la misma selección.
 */
export function toggleSelected(
  selected: ReadonlyMap<string, PersonHit>,
  hit: PersonHit,
  max = INVITE_MAX,
): ReadonlyMap<string, PersonHit> {
  const next = new Map(selected);
  if (next.has(hit.id)) {
    next.delete(hit.id);
    return next;
  }
  if (personState(hit) || next.size >= max) return selected;
  next.set(hit.id, hit);
  return next;
}

/**
 * Lo elegido después de enviar: salen quienes ya quedaron invitados o ya están en la liga ('sent', 'pending',
 * 'member'); se quedan elegidos los que no se pudieron invitar (la rechazó hace poco, no disponible, límite del día)
 * para que se vea a quiénes no les llegó. Sin cambios, la misma selección.
 */
export function selectionAfterSend(
  selected: ReadonlyMap<string, PersonHit>,
  results: readonly { userId: string; status: string }[],
): ReadonlyMap<string, PersonHit> {
  const done = new Set(results.filter((r) => r.status === 'sent' || r.status === 'pending' || r.status === 'member').map((r) => r.userId));
  const next = new Map([...selected].filter(([id]) => !done.has(id)));
  return next.size === selected.size ? selected : next;
}

/** El aviso después de enviar: normal si salió al menos una; de error si no salió ninguna. */
export const sendTone = (results: readonly { status: string }[]): 'ok' | 'error' => (results.some((r) => r.status === 'sent') ? 'ok' : 'error');

/** «Enviar invitación» con una persona; «Enviar a 3 personas» con varias. */
export function sendLabel(n: number): string {
  return n <= 1 ? 'Enviar invitación' : `Enviar a ${n} personas`;
}

/** A quiénes se va a invitar: «Ana», «Ana y Beto», «Ana, Beto y Carla», «Ana, Beto y 3 más». */
export function selectedSummary(people: readonly Pick<PersonHit, 'name' | 'username'>[]): string {
  const names = people.map((p) => p.name || handleOf(p.username) || 'Sin nombre');
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} y ${names[2]}`;
  return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
}

/**
 * Qué muestra la hoja según lo escrito y la lista que se ve (usePeople la cambia 250 ms después de la última
 * tecla y mientras tanto deja la anterior):
 * - 'following': sin buscar, las personas que sigo; 'no-following': no sigo a nadie todavía.
 * - 'short': una sola letra (la base no busca con menos de 2).
 * - 'loading': esperando la lista (sin nada que mostrar todavía).
 * - 'results': lo encontrado; 'none': nadie con eso.
 * - 'error': no se pudo leer y no hay nada que mostrar.
 */
export type PeopleView = 'following' | 'no-following' | 'short' | 'loading' | 'results' | 'none' | 'error';

export function peopleView(
  input: string,
  live: { data: readonly unknown[]; loading: boolean; settled: boolean; query: string; error?: unknown },
): PeopleView {
  const q = peopleQuery(input);
  if (q.length > 0 && q.length < PEOPLE_QUERY_MIN) return 'short';
  if (live.loading && live.data.length === 0) return 'loading';
  if (live.error && live.data.length === 0 && live.settled) return 'error';
  // La lista que se ve es la de lo escrito antes (una letra): espera la nueva.
  if (live.query.length > 0 && live.query.length < PEOPLE_QUERY_MIN) return 'loading';
  if (!live.query) return live.data.length ? 'following' : live.settled ? 'no-following' : 'loading';
  if (live.data.length) return 'results';
  return live.settled ? 'none' : 'loading';
}

// ---------- El link ----------

/** El link de invitación con código (el admin): /unirse/<código>. */
export const codeInviteUrl = (origin: string, code: string) => `${origin}/unirse/${code}`;

/**
 * El link para compartir:
 * - un miembro de una liga pública, el de la liga (/l/<id>): cualquiera puede unirse desde ahí;
 * - el dueño o un admin, el de invitación con código (sirve también para las privadas); mientras se pide,
 *   'loading'; si la liga no tiene código todavía, 'none': la hoja ofrece crearlo ahí mismo (en vez de copiar,
 *   WhatsApp y «Más», que no tendrían qué mandar).
 */
export type InviteLink = { kind: 'loading' } | { kind: 'url'; url: string } | { kind: 'none' };

export function inviteLink(opts: { lid: string; isAdmin: boolean; code: string | null | undefined; origin: string }): InviteLink {
  const { lid, isAdmin, code, origin } = opts;
  if (!isAdmin) return { kind: 'url', url: `${origin}/l/${lid}` };
  if (code === undefined) return { kind: 'loading' };
  if (!code) return { kind: 'none' };
  return { kind: 'url', url: codeInviteUrl(origin, code) };
}

/** El texto que acompaña al link (WhatsApp y el menú del teléfono). */
export const inviteShareText = (leagueName: string) => `Únete a ${leagueName.trim() || 'mi liga'} en MatchMate`;
