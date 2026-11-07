/**
 * Lo que no es pantalla de Organizar › Jugadores y miembros › Miembros (MembersPanel de src/pages/AdminPage.tsx y la
 * pantalla de la app del teléfono, movil/src/components/members): el orden de la lista, quién puede hacer qué con cada
 * cuenta, la línea de arriba, las marcas, los botones y las confirmaciones. Funciones puras (pruebas en
 * members.test.ts). Los datos y las RPC están en src/lib/data/members.ts y src/lib/data/leagueBadges.ts.
 */
import type { LeagueKind, Member } from '../../lib/types';
import { sportAdminTabs } from '../../sports/adminTabs';
import { leagueSport } from '../../sports/registry';
import { leavesOnRemove, removeConfirm } from '../scorers/logic';
import { PEOPLE_TABS } from './logic';

/** El orden de la lista: el dueño, los admins y los miembros (cada grupo por nombre). */
export const ORDER: Record<Member['role'], number> = { owner: 0, admin: 1, member: 2 };

export function sortMembers<T extends Pick<Member, 'role' | 'name'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.name.localeCompare(b.name));
}

/** Lo de la liga que cambia los textos: «la liga» o «el torneo», el boliche y la regla de las insignias. */
export interface MembersScope {
  /** «el torneo» o «la liga». */
  where: 'el torneo' | 'la liga';
  /** Anotadores: en todas (en una liga de boliche anotan sus torneos, no las prácticas). */
  bowling: boolean;
  /** La liga de boliche con prácticas y torneos (el admin también los crea). */
  bowlingLeague: boolean;
  /** «Diseña insignias» vale con la regla «Yo y los que yo elija» (`badgeMakersOf(league) === 'chosen'`). */
  chosen: boolean;
  kind: LeagueKind | null | undefined;
}

export function membersScope(league: { id: string; sport?: string | null; kind?: LeagueKind | null }, chosen: boolean): MembersScope {
  const bowling = leagueSport(league) === 'bowling';
  return {
    where: league.kind === 'torneo' ? 'el torneo' : 'la liga',
    bowling,
    bowlingLeague: bowling && league.kind !== 'torneo',
    chosen,
    kind: league.kind,
  };
}

/** Un trozo de texto; `strong` va en negrita (los nombres de los permisos). */
export interface TextPart {
  text: string;
  strong?: boolean;
}

/** La línea de arriba de la lista: quién es qué y quién nombra a quién. */
export function membersIntro(s: MembersScope, isOwner: boolean): TextPart[] {
  return [
    { text: 'Todos son jugadores, menos quien entró solo para anotar. ' },
    { text: 'Admin', strong: true },
    { text: ` maneja ${s.where}; ` },
    { text: 'Anotador', strong: true },
    { text: ` solo anota los juegos${s.bowlingLeague ? ' de los torneos' : ''}` },
    ...(s.chosen ? [{ text: '; ' }, { text: 'Diseña insignias', strong: true }, { text: ` crea y da las insignias de ${s.where}` }] : []),
    { text: `. ${isOwner ? 'Solo tú, como dueño, nombras admins. Tú y los admins nombran anotadores.' : 'Solo el dueño nombra admins. Tú puedes nombrar anotadores.'}` },
  ];
}

/** Quién mira la lista: su cuenta y si es el dueño o un admin de la liga. */
export interface MembersViewer {
  uid: string | null | undefined;
  isOwner: boolean;
  isAdmin: boolean;
}

/** Qué botones lleva cada cuenta para quien mira. */
export interface MemberRights {
  /** Sacar de la liga: el dueño saca a cualquiera; un admin solo a los que no tienen permisos (ni admin, ni anotador, ni diseña insignias). */
  canKick: boolean;
  /** Hacer o quitar admin (y «Diseña insignias»): solo el dueño. */
  canManage: boolean;
  /** Anotadores: el dueño a cualquiera menos a sí mismo; un admin, a los miembros (no a sí mismo ni a otro admin). */
  canScorer: boolean;
  /** Un admin puede dejar de serlo por su cuenta. */
  canStepDown: boolean;
}

export function memberRights(m: Pick<Member, 'uid' | 'role' | 'scorer' | 'badgeMaker'>, viewer: MembersViewer): MemberRights {
  const me = m.uid === viewer.uid;
  return {
    canKick: !me && m.role !== 'owner' && (viewer.isOwner || (m.role === 'member' && !m.scorer && !m.badgeMaker)),
    canManage: viewer.isOwner && m.role !== 'owner',
    canScorer: viewer.isOwner ? m.role !== 'owner' : viewer.isAdmin && !me && m.role === 'member',
    canStepDown: me && m.role === 'admin' && !viewer.isOwner,
  };
}

/** La marca de su jugador: «Jugador: Ana», «Solo anota» o «Su jugador se crea al abrir la liga». */
export function memberPlayerBadge(m: Pick<Member, 'playerId' | 'scorerOnly'>, playerName: string | undefined): { text: string; tone: 'ok' | 'neutral' } {
  if (m.playerId) return { text: `Jugador: ${playerName ?? '—'}`, tone: 'ok' };
  return { text: m.scorerOnly ? 'Solo anota' : 'Su jugador se crea al abrir la liga', tone: 'neutral' };
}

/** Los textos de los botones de una cuenta (y el de sacarla, que es solo un ícono). */
export function memberLabels(m: Pick<Member, 'name' | 'role' | 'scorer' | 'badgeMaker'>, s: Pick<MembersScope, 'where'>) {
  return {
    stepDown: 'Dejar de ser admin',
    admin: m.role === 'admin' ? 'Quitar admin' : 'Hacer admin',
    scorer: m.scorer ? 'Quitar anotador' : 'Hacer anotador',
    maker: m.badgeMaker ? 'Ya no diseña' : 'Diseña insignias',
    /** Lo que lee el lector de pantalla del botón de sacar. */
    kick: `Sacar a ${m.name}`,
    /** Lo que sale al dejar el puntero encima (la web). */
    kickTitle: `Sacar de ${s.where}`,
  };
}

/** Una pregunta antes de cambiar un permiso, y el aviso de después (`done`). */
export interface MemberConfirm {
  title: string;
  message: string;
  confirmText: string;
  danger: boolean;
  done: string;
}

/** Hacer admin a un miembro, o quitarle admin a un admin (o dejar de serlo uno mismo). `role`: cómo queda. */
export function adminConfirm(m: Pick<Member, 'name' | 'role' | 'uid'>, s: MembersScope, viewerUid: string | null | undefined): MemberConfirm & { role: 'admin' | 'member' } {
  const makeAdmin = m.role === 'member';
  return {
    role: makeAdmin ? 'admin' : 'member',
    title: makeAdmin ? `¿Hacer admin a ${m.name}?` : `¿Quitarle admin a ${m.name}?`,
    message: makeAdmin
      ? !s.bowlingLeague
        ? 'Podrá inscribir jugadores, armar equipos, anotar y aprobar juegos, e invitar. Los permisos los sigues manejando tú.'
        : 'Podrá crear torneos y prácticas, anotar y aprobar juegos, manejar jugadores e invitar. Los permisos los sigues manejando tú.'
      : m.uid === viewerUid
        ? `Vas a dejar de administrar ${s.where}; sigues como jugador. Para volver a ser admin, el dueño te lo tiene que dar.`
        : `Sigue en ${s.where} como jugador.`,
    confirmText: makeAdmin ? 'Hacer admin' : 'Quitar admin',
    danger: !makeAdmin,
    done: makeAdmin ? `${m.name} ahora es admin` : 'Listo',
  };
}

/**
 * Hacer anotador o quitárselo. Quien entró solo para anotar (sin jugador ni otro permiso) sale de la liga al quitarle
 * el permiso (removeConfirm lo dice). `make`: si queda como anotador.
 */
export function scorerConfirm(m: Pick<Member, 'name' | 'role' | 'scorer' | 'playerId' | 'scorerOnly' | 'badgeMaker'>, s: MembersScope): MemberConfirm & { make: boolean } {
  const make = !m.scorer;
  const out = !make && leavesOnRemove(m) ? removeConfirm(m, s.kind) : null;
  return {
    make,
    title: make ? `¿Hacer anotador a ${m.name}?` : `¿Quitarle anotador a ${m.name}?`,
    message: make
      ? s.bowling
        ? s.bowlingLeague
          ? 'Podrá anotar los juegos de los torneos de la liga (no las prácticas) y nada más. Sigue siendo jugador.'
          : 'Podrá anotar los juegos de los inscritos (a mano, por cuadros o con la foto) y nada más. Sigue siendo jugador.'
        : 'Podrá anotar los partidos, las tarjetas o los tiempos, y nada más. Sigue siendo jugador.'
      : (out?.message ?? `Ya no podrá anotar en ${s.where}.`),
    confirmText: make ? 'Hacer anotador' : 'Quitar anotador',
    danger: !make,
    done: make ? `${m.name} ahora es anotador` : (out?.done ?? 'Listo'),
  };
}

/** «Diseña insignias» (con la regla «Yo y los que yo elija»): darlo o quitarlo. `make`: si queda diseñando. */
export function makerConfirm(m: Pick<Member, 'name' | 'badgeMaker'>, s: Pick<MembersScope, 'where'>): MemberConfirm & { make: boolean } {
  const make = !m.badgeMaker;
  return {
    make,
    title: make ? `¿${m.name} diseña insignias?` : `¿Quitarle a ${m.name} el diseño de insignias?`,
    message: make ? 'Podrá crear las insignias de la liga y darlas. Solo tú puedes quitarlas.' : `Ya no podrá crear ni dar insignias de ${s.where}. Las que ya dio se quedan.`,
    confirmText: make ? 'Sí, que diseñe' : 'Quitar',
    danger: !make,
    done: make ? `${m.name} ahora diseña insignias` : 'Listo',
  };
}

/** Sacar a alguien de la liga. */
export function kickConfirm(m: Pick<Member, 'name'>, s: Pick<MembersScope, 'where'>): MemberConfirm {
  return {
    title: `¿Sacar a ${m.name} de ${s.where}?`,
    message: `Sus juegos se quedan; su cuenta deja de estar en ${s.where}. Si es privado, necesitará otra invitación para volver.`,
    confirmText: 'Sacar',
    danger: true,
    done: `${m.name} ya no está en ${s.where}`,
  };
}

/**
 * El nombre de la pestaña propia del deporte donde va su gente (natación: «Nadadores»; raqueta: «Parejas y niveles» o
 * «Jugadores y niveles»), el `own.peopleTab?.label` de useOwnTabs (src/components/organizer/Hub.tsx) sin cargar las
 * pantallas del deporte. null si el deporte no tiene (su gente va en Jugadores).
 */
export function peopleTabLabel(sport: string | null | undefined): string | null {
  return sportAdminTabs(sport).find((t) => PEOPLE_TABS.has(t.key))?.label ?? null;
}
