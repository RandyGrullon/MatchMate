/**
 * Lo que no es pantalla de la hoja «Anotadores» (ScorersSheet.tsx) y de /anotar/<código>: hasta dónde llega el
 * permiso, quién sale en cada lista, qué botón lleva cada persona, las confirmaciones y los avisos. Funciones puras,
 * con pruebas en logic.test.ts. Los datos y las RPC están en src/lib/data/scorers.ts.
 */
import type { InviteResultStatus } from '../../lib/data/invites';
import type { PersonHit } from '../../lib/data/people';
import type { ScorerInvite, ScorerJoinStatus, ScorerLink, ScorerLinkInfo, ScorerLinkRemoved, ScorerLinkStatus } from '../../lib/data/scorers';
import type { League, LeagueKind, Member } from '../../lib/types';
import { leagueSport } from '../../sports/registry';

// ---------- Hasta dónde llega el permiso ----------

/**
 * El permiso es de la liga (`league_members.is_scorer`): en un torneo sin liga, ese torneo; en una liga de boliche,
 * sus torneos (no las prácticas); en una liga de otro deporte, todos sus eventos.
 */
export type ScorerReach = 'torneo' | 'bowling' | 'liga';

export function scorerReach(league: Pick<League, 'id' | 'kind' | 'sport'>): ScorerReach {
  if (league.kind === 'torneo') return 'torneo';
  return leagueSport(league) === 'bowling' ? 'bowling' : 'liga';
}

/** La primera línea de la hoja: hasta dónde anotan los que se nombran ahí. */
export function scorerReachText(reach: ScorerReach): string {
  switch (reach) {
    case 'torneo':
      return 'Anotan los resultados de este torneo. No los inscribe como jugadores.';
    case 'bowling':
      return 'Podrán anotar en los torneos de esta liga (no en las prácticas). No los inscribe como jugadores.';
    default:
      return 'Podrán anotar en los eventos de esta liga, no solo en este. No los inscribe como jugadores.';
  }
}

/** Lo mismo de una sola persona (la pregunta antes de nombrarla). */
export function scorerReachOne(reach: ScorerReach): string {
  switch (reach) {
    case 'torneo':
      return 'Podrá anotar los resultados de este torneo.';
    case 'bowling':
      return 'Podrá anotar en los torneos de esta liga (no en las prácticas).';
    default:
      return 'Podrá anotar en los eventos de esta liga, no solo en este.';
  }
}

/**
 * Lo mismo dicho a quien lo invitan (la invitación y /anotar/<código>): null en un torneo sin liga (ahí anota ese
 * torneo y ya).
 */
export function scorerReachForYou(reach: ScorerReach): string | null {
  if (reach === 'bowling') return 'Podrás anotar en los torneos de esta liga (no en las prácticas).';
  if (reach === 'liga') return 'Podrás anotar en todos los eventos de esta liga, no solo en este.';
  return null;
}

/** «la liga» o «el torneo». */
export const nounOf = (kind: LeagueKind | null | undefined) => (kind === 'torneo' ? 'el torneo' : 'la liga');
/** «de la liga» o «del torneo». */
export const fromNoun = (kind: LeagueKind | null | undefined) => (kind === 'torneo' ? 'del torneo' : 'de la liga');
/** «a la liga» o «al torneo». */
export const toNoun = (kind: LeagueKind | null | undefined) => (kind === 'torneo' ? 'al torneo' : 'a la liga');

// ---------- Quién juega ----------

/**
 * ¿Ese miembro juega este torneo? Con la lista de la pantalla (`participants`: sus jugadores), si su jugador está en
 * ella. Sin lista (no se sabe, o todavía no llega) no se marca a nadie: ni «Juega» ni la pregunta de juez y parte.
 * Tener jugador no es jugar este torneo (toda cuenta que entra a jugar recibe el suyo).
 */
export function playsHere(member: Pick<Member, 'playerId'>, participants: ReadonlySet<string> | null): boolean {
  return !!member.playerId && !!participants && participants.has(member.playerId);
}

/** Minúsculas y sin tildes («José» = «jose»), como normalize_name de la base. */
export function foldName(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Tiene todas las palabras buscadas (vacío = sí). */
export function nameMatches(name: string, query: string): boolean {
  const words = foldName(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = foldName(name);
  return words.every((w) => hay.includes(w));
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'es');

// ---------- «Anotan ahora» ----------

/** Una fila de «Anotan ahora»: un miembro con el permiso o una invitación de anotador pendiente. */
export type ScorerRow =
  | { kind: 'member'; key: string; name: string; member: Member; plays: boolean; scorerOnly: boolean }
  | { kind: 'invite'; key: string; name: string; username: string; invite: ScorerInvite; plays: false; scorerOnly: false };

/**
 * Quién anota hoy: los miembros (rol miembro) con el permiso, por nombre, y después las invitaciones de anotador
 * pendientes, la más nueva primero. «Juega» si juega este torneo; «Solo anota» si entró solo para anotar y no tiene
 * jugador. Los admins no salen (ya anotan): ver `adminCount`.
 */
export function scorerRows(members: readonly Member[], invites: readonly ScorerInvite[], participants: ReadonlySet<string> | null): ScorerRow[] {
  const inLeague = new Set(members.map((m) => m.uid));
  const people: ScorerRow[] = members
    .filter((m) => m.role === 'member' && m.scorer)
    .sort(byName)
    .map((m) => ({ kind: 'member', key: `m:${m.uid}`, name: m.name, member: m, plays: playsHere(m, participants), scorerOnly: !!m.scorerOnly && !m.playerId }));
  const pending: ScorerRow[] = invites
    .filter((i) => !inLeague.has(i.user.id))
    .map((i) => ({ kind: 'invite', key: `i:${i.id}`, name: i.user.name || (i.user.username ? `@${i.user.username}` : 'Sin nombre'), username: i.user.username, invite: i, plays: false, scorerOnly: false }));
  return [...people, ...pending];
}

/** Cuántos admins (y el dueño) hay: también anotan. */
export const adminCount = (members: readonly Pick<Member, 'role'>[]) => members.filter((m) => m.role !== 'member').length;

/** «Los admins (3) también anotan.» (el dueño cuenta). */
export const adminsLine = (n: number) => (n === 1 ? 'El dueño también anota.' : `Los admins (${n}) también anotan.`);

/**
 * «Anotan ahora» vacío («de la liga» o, en un torneo sin liga, «del torneo», como la pestaña). Con menores no hay
 * link: solo elegir o buscar por @usuario.
 */
export const emptyScorersText = (kind: LeagueKind | null | undefined, hasMinors: boolean) =>
  hasMinors
    ? `Todavía no hay anotadores. Elige a alguien ${fromNoun(kind)} o búscalo por su @usuario.`
    : `Todavía no hay anotadores. Elige a alguien ${fromNoun(kind)}, búscalo por su @usuario o manda el link.`;

// ---------- «De la liga» ----------

export interface PickableMember {
  member: Member;
  plays: boolean;
}

/** Los miembros (rol miembro) que todavía no anotan y tienen lo buscado en el nombre, por nombre. */
export function pickableMembers(members: readonly Member[], query: string, participants: ReadonlySet<string> | null): PickableMember[] {
  return members
    .filter((m) => m.role === 'member' && !m.scorer && nameMatches(m.name, query))
    .sort(byName)
    .map((m) => ({ member: m, plays: playsHere(m, participants) }));
}

/** Lo que dice la lista vacía: todos ya anotan, nadie con eso, o la liga no tiene más miembros (con menores, sin link). */
export function pickableEmptyText(members: readonly Member[], query: string, hasMinors: boolean): string {
  if (query.trim() && members.some((m) => m.role === 'member' && !m.scorer)) return 'Nadie con ese nombre';
  if (members.some((m) => m.role === 'member')) return 'Todos los miembros ya anotan';
  return `Todavía no hay miembros sin permisos. Búscalo por su @usuario${hasMinors ? '' : ' o manda el link'}.`;
}

// ---------- «Por @usuario» ----------

/** Quien todavía no tiene cuenta: el link; con menores no hay link, así que primero se crea la cuenta. */
const noAccountText = (hasMinors: boolean) =>
  hasMinors ? 'Si todavía no tiene cuenta, pídele que se cree una y búscalo aquí.' : 'Si todavía no tiene cuenta, mándale el link.';

/** «Por @usuario» antes de buscar (no sigue a nadie). */
export const usernameHintText = (hasMinors: boolean) => `Escribe su nombre o su @usuario. ${noAccountText(hasMinors)}`;

/** «Por @usuario» sin resultados. */
export const nobodyFoundText = (query: string, hasMinors: boolean) => `No encontramos a nadie con «${query.trim()}». ${noAccountText(hasMinors)}`;

/**
 * El botón de cada persona encontrada:
 * - 'scorer': ya anota («Ya anota», apagado);
 * - 'admin': es admin o dueño («Admin», apagado: ya anota);
 * - 'member': está en la liga («Hacer anotador», directo);
 * - 'invited': ya tiene una invitación de anotador pendiente («Invitado», con «Retirar»);
 * - 'invite': cualquier otra («Invitar a anotar»), también si tenía una invitación para jugar (la nueva la reemplaza).
 */
export type PersonAction = 'scorer' | 'admin' | 'member' | 'invited' | 'invite';

export function personAction(
  hit: Pick<PersonHit, 'inLeague'>,
  member: Pick<Member, 'role' | 'scorer'> | null | undefined,
  invite: ScorerInvite | null | undefined,
): PersonAction {
  if (member?.scorer && member.role === 'member') return 'scorer';
  if (member && member.role !== 'member') return 'admin';
  if (member || hit.inLeague) return 'member';
  if (invite) return 'invited';
  return 'invite';
}

// ---------- Confirmaciones ----------

export interface ScorerConfirm {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

/**
 * «Hacer anotador»: a quien no juega, sin preguntar (null); a quien juega, se pregunta, porque lo que anote de lo
 * suyo no cuenta para insignias (juez y parte). Dicho de esa persona (en singular).
 */
export function makeConfirm(name: string, plays: boolean, league: Pick<League, 'id' | 'kind' | 'sport'>): ScorerConfirm | null {
  if (!plays) return null;
  const bowling = leagueSport(league) === 'bowling';
  return {
    title: `¿Hacer anotador a ${name}?`,
    message: `${scorerReachOne(scorerReach(league))} ${
      bowling ? 'Como también juega, sus juegos sin foto no cuentan para insignias.' : 'Lo que anote de sus propios partidos no cuenta para insignias.'
    }`,
    confirmText: 'Hacer anotador',
  };
}

/** «Invitar a anotar» en una liga con menores: entra y ve todo, también a los menores (sin menores: null). */
export function inviteConfirm(name: string, league: Pick<League, 'kind' | 'hasMinors'>): ScorerConfirm | null {
  if (!league.hasMinors) return null;
  return {
    title: `¿Invitar a ${name} a anotar?`,
    message: `${name} entrará ${toNoun(league.kind)} y verá sus datos, también los de los menores.`,
    confirmText: 'Invitar',
  };
}

/**
 * ¿Quitarle el permiso lo saca de la liga? A quien entró solo para anotar y sigue así: miembro, sin jugador y sin
 * «Diseña insignias» (ese permiso lo dio el dueño: se queda). Lo mismo que hace set_member_scorer en la base.
 */
export const leavesOnRemove = (m: Pick<Member, 'role' | 'playerId' | 'scorerOnly' | 'badgeMaker'>) =>
  m.role === 'member' && !!m.scorerOnly && !m.playerId && !m.badgeMaker;

/**
 * «Quitar»: quien entró solo para anotar (leavesOnRemove) sale de la liga y ya no vuelve a entrar con un link para
 * anotar (si no se sabe quién es, el link se reenvió: hay que cambiarlo); los demás se quedan. `done` es el aviso
 * después.
 */
export function removeConfirm(
  member: Pick<Member, 'name' | 'playerId' | 'scorerOnly' | 'role' | 'badgeMaker'>,
  kind: LeagueKind | null | undefined,
): ScorerConfirm & { done: string } {
  const noun = nounOf(kind);
  const name = member.name || 'Esta persona';
  if (leavesOnRemove(member)) {
    return {
      title: `¿Quitarle el permiso de anotar a ${name}?`,
      message: `${name} entró solo para anotar: al quitarle el permiso sale ${fromNoun(kind)} y ya no puede volver a entrar con un link para anotar. Si no sabes quién es, cambia también el link.`,
      confirmText: 'Quitar',
      danger: true,
      done: `${name} salió ${fromNoun(kind)}`,
    };
  }
  return {
    title: `¿Quitarle el permiso de anotar a ${name}?`,
    message: member.playerId ? `Sigue en ${noun} como jugador.` : `Sigue en ${noun}.`,
    confirmText: 'Quitar',
    done: `${name} ya no anota`,
  };
}

// ---------- Avisos ----------

/** El aviso después de nombrar a alguien. */
export const madeText = (name: string) => `${name || 'Listo:'} ya puede anotar`;

/** Cómo le fue a la invitación de anotador de una persona. */
export function inviteScorerText(status: InviteResultStatus, name: string, kind: LeagueKind | null | undefined): string {
  const who = name.trim() || 'Esa persona';
  switch (status) {
    case 'sent':
      return `Le llegó la invitación a ${who}`;
    case 'pending':
      return `${who} ya tiene una invitación`;
    case 'declined':
      return `${who} la rechazó hace poco. Prueba en unos días.`;
    case 'unavailable':
      return 'Esa cuenta no está disponible';
    case 'rate_limited':
      return 'Mandaste muchas invitaciones hoy. Prueba mañana.';
    case 'member':
      return `${who} ya está en ${nounOf(kind)}`;
  }
}

// ---------- El link ----------

/** «6 de octubre» en la zona de la liga. */
export function expiryDay(iso: string, tz?: string | null): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  try {
    return new Date(t).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', ...(tz ? { timeZone: tz } : {}) });
  } catch {
    return new Date(t).toLocaleDateString('es-DO', { day: 'numeric', month: 'long' });
  }
}

/**
 * Lo que se dice del link de este torneo: si sirve, cuándo vence y cuántas veces se usó; si no, por qué no sirve
 * (o que todavía no hay).
 */
export function linkStateText(link: Pick<ScorerLink, 'status' | 'expiresAt' | 'uses' | 'maxUses'> | null, tz?: string | null): string {
  if (!link) return 'Todavía no hay link para anotar en este torneo.';
  switch (link.status) {
    case 'ok': {
      const day = expiryDay(link.expiresAt, tz);
      return `${day ? `Vence el ${day} · ` : ''}${link.uses} de ${link.maxUses} usos`;
    }
    case 'expired':
      return 'El link para anotar venció.';
    case 'full':
      return 'El link para anotar ya se usó todas las veces.';
    case 'revoked':
      return 'Quitaste el link para anotar.';
    default:
      return 'El link para anotar se cerró: quien lo creó ya no es admin.';
  }
}

/** El texto que acompaña al link (WhatsApp y el menú del teléfono). */
export const scorerShareText = (title: string) => `Te invito a anotar en ${title.trim() || 'mi torneo'} con MatchMate`;

export const LINK_WARNING = 'Cualquiera con este link puede entrar a anotar. Mándalo solo a quien va a anotar.';
export const MINORS_NO_LINK = 'En una liga con menores no hay link para anotar: invita a cada anotador por su @usuario.';
export const MINORS_WARNING = 'Quien anota ve la liga completa, también a los menores.';

// ---------- /anotar/<código> ----------

/**
 * Lo que dice /anotar/<código> cuando el link no sirve (null: el código no existe), no sirve para esta cuenta (un
 * admin la quitó) o hubo muchos intentos.
 */
export function deadLinkText(status: Exclude<ScorerLinkStatus, 'ok'> | ScorerLinkRemoved | 'rate_limited' | null): { title: string; body: string } {
  switch (status) {
    case null:
      return { title: 'Este link no sirve', body: 'El código no existe. Pídele el link a quien organiza.' };
    case 'removed':
      return { title: 'Este link ya no te sirve', body: 'Un admin te quitó el permiso de anotar. Si fue un error, pídele que te vuelva a invitar.' };
    case 'expired':
      return { title: 'Este link venció', body: 'Pídele uno nuevo a quien organiza.' };
    case 'full':
      return { title: 'Este link ya se usó todas las veces', body: 'Pídele otro a quien organiza.' };
    case 'rate_limited':
      return { title: 'Demasiados intentos', body: 'Espera unos minutos y vuelve a abrir el link.' };
    default:
      return { title: 'Este link ya no sirve', body: 'Pídele uno nuevo a quien organiza.' };
  }
}

/** El aviso al entrar con el link (con 'already' no se dice nada). */
export function joinedScorerText(status: ScorerJoinStatus, title: string): string | null {
  const where = title.trim() || 'el torneo';
  if (status === 'joined') return `Ya puedes anotar en ${where}`;
  if (status === 'upgraded') return `Ya puedes anotar en ${where}. Sigues jugando.`;
  return null;
}

/** A dónde vuelve /login para entrar solo con el link después de entrar o de crear la cuenta. */
export const scorerJoinNext = (code: string) => encodeURIComponent(`/anotar/${code}?entrar=1`);

/**
 * La marca de «tocó el botón» (docs/anotadores.md D12): «Crear cuenta y entrar a anotar» y «Ya tengo cuenta» la dejan
 * en el teléfono con el código (vale 24 horas, como la ruta de después de entrar, y también en otra pestaña: la del
 * link del correo para confirmar). Al volver con ?entrar=1, /anotar/<código> entra solo únicamente si la encuentra
 * (y la borra): un link con ?entrar=1 que llega de otro lado no mete a nadie en una liga sin tocar.
 */
export const SCORER_INTENT_KEY = 'mm:anotar-entrar';
export const SCORER_INTENT_MS = 24 * 60 * 60 * 1000;

type IntentStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function intentStorage(): IntentStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Tocó «Crear cuenta y entrar a anotar» o «Ya tengo cuenta» con este link. */
export function rememberScorerIntent(code: string, now = Date.now(), store: IntentStorage | null = intentStorage()): void {
  if (!code || !store) return;
  try {
    store.setItem(SCORER_INTENT_KEY, JSON.stringify({ code, at: now }));
  } catch {
    // Sin almacenamiento: al volver verá «Entrar para anotar» (un toque más).
  }
}

/** ¿Tocó entrar con este link en este teléfono hace menos de 24 horas? */
export function hasScorerIntent(code: string, now = Date.now(), store: IntentStorage | null = intentStorage()): boolean {
  if (!code || !store) return false;
  try {
    const raw = store.getItem(SCORER_INTENT_KEY);
    const saved = raw ? (JSON.parse(raw) as { code?: unknown; at?: unknown } | null) : null;
    const at = typeof saved?.at === 'number' ? saved.at : NaN;
    return saved?.code === code && now - at >= 0 && now - at < SCORER_INTENT_MS;
  } catch {
    return false;
  }
}

/** Lo mismo, y la borra si era de este link (sirve una vez). */
export function takeScorerIntent(code: string, now = Date.now(), store: IntentStorage | null = intentStorage()): boolean {
  const ok = hasScorerIntent(code, now, store);
  if (ok) {
    try {
      store?.removeItem(SCORER_INTENT_KEY);
    } catch {
      // sin almacenamiento: no hay nada que borrar
    }
  }
  return ok;
}

/**
 * Qué hace /anotar/<código> al volver de /login con ?entrar=1 (ya con la sesión y el link que sirve):
 * - 'skip': ya anota (dueño, admin o anotador): va directo al torneo;
 * - 'enter': tocó el botón en este teléfono (la marca): entra solo, una vez;
 * - 'card': sin la marca (el link con ?entrar=1 llegó de otro lado): se quita ?entrar=1 y se ve la tarjeta con
 *   «Entrar para anotar». No entra a ninguna liga sin un toque.
 */
export function autoEnterStep(info: Pick<ScorerLinkInfo, 'canScore'>, intended: boolean): 'skip' | 'enter' | 'card' {
  if (info.canScore) return 'skip';
  return intended ? 'enter' : 'card';
}
