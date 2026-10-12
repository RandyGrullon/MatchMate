/**
 * Lo puro de las pantallas de Equipos (docs/equipos-y-en-vivo.md §1; en la base `squads`): textos, quién puede hacer
 * qué, las pestañas, el estado de la pantalla de unirse y lo que dicen los avisos. Sin React ni backend: lo prueban
 * squads.test.ts y las pantallas lo usan tal cual.
 */
import type { MySquad, SquadDecision, SquadLeague, SquadLite, SquadMember, SquadPage, SquadRequestStatus, SquadRole } from '../../lib/data/squads';
import { squadErrorText } from '../../lib/data/squads';
import { BLOCKED_MESSAGE, isBlockedError } from '../../lib/backend/errors';
import { sportMeta } from '../../sports/registry';
import { SPORT_FAMILY, type SportId } from '../../sports/types';

// ---------- Palabras ----------

const num = (n: number) => n.toLocaleString('es-DO');

/** «1 miembro», «12 miembros». */
export const countWord = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
export const membersText = (n: number) => countWord(n, 'miembro', 'miembros');
export const followersText = (n: number) => countWord(n, 'seguidor', 'seguidores');

/** «Los Tigres [TGR]». */
export const squadTitle = (s: Pick<SquadLite, 'name' | 'tag'>) => (s.tag ? `${s.name} [${s.tag}]` : s.name);

/** «Fútbol», «Baloncesto» (lo que falta: «Otro deporte»). */
export const sportShort = (sport: string) => sportMeta(sport)?.short ?? 'Otro deporte';

export const ROLE_LABEL: Record<SquadRole, string> = { captain: 'Capitán', member: 'Miembro' };

/** «Fútbol · Santo Domingo · 12 miembros» (lo que falta no sale). */
export function squadLine(s: Pick<SquadLite, 'sport' | 'city' | 'members'>): string {
  return [sportShort(s.sport), s.city?.trim(), s.members > 0 ? membersText(s.members) : null].filter(Boolean).join(' · ');
}

/** Mis equipos: «Fútbol · 12 miembros · Capitán» (el miembro no dice su papel). */
export function mySquadLine(s: Pick<MySquad, 'sport' | 'members' | 'role'>): string {
  return [sportShort(s.sport), membersText(s.members), s.role === 'captain' ? ROLE_LABEL.captain : null].filter(Boolean).join(' · ');
}

/** La lupa: «Equipo · Fútbol · Santo Domingo · 12 miembros · Busca jugadores». */
export function squadResultLine(s: Pick<SquadLite, 'sport' | 'city' | 'members' | 'recruiting'>): string {
  return ['Equipo', squadLine(s), s.recruiting ? 'Busca jugadores' : null].filter(Boolean).join(' · ');
}

/** «Portero · #1», «#10», o su @usuario si no tiene ni posición ni número. */
export function memberLine(m: Pick<SquadMember, 'position' | 'jersey' | 'username'>): string {
  const parts = [m.position?.trim(), m.jersey != null ? `#${m.jersey}` : null].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return m.username ? `@${m.username}` : '';
}

/** El capitán primero; después por número (los que tienen) y por nombre. */
export function sortRoster<T extends Pick<SquadMember, 'role' | 'jersey' | 'name'>>(roster: readonly T[]): T[] {
  return [...roster].sort(
    (a, b) =>
      (a.role === 'captain' ? 0 : 1) - (b.role === 'captain' ? 0 : 1) ||
      (a.jersey ?? 1000) - (b.jersey ?? 1000) ||
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
  );
}

/** Yo › Mis equipos: el nombre si es uno, «A y B» si son dos, «3 equipos» si son más; sin ninguno, cómo empezar. */
export function myTeamsLine(names: readonly string[]): string {
  if (!names.length) return 'Crea tu equipo o únete a uno';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return countWord(names.length, 'equipo', 'equipos');
}

// ---------- La página del equipo ----------

export type SquadTab = 'plantilla' | 'muro' | 'ligas';
export const SQUAD_TABS: readonly { key: SquadTab; label: string }[] = [
  { key: 'plantilla', label: 'Plantilla' },
  { key: 'muro', label: 'Muro' },
  { key: 'ligas', label: 'Ligas' },
];
export const squadTab = (raw: string | null): SquadTab => (raw === 'muro' || raw === 'ligas' ? raw : 'plantilla');

export type SquadViewer = 'captain' | 'member' | 'none';
export const squadViewer = (s: Pick<SquadPage, 'isMember' | 'myRole'> | null | undefined): SquadViewer =>
  s?.myRole === 'captain' ? 'captain' : s?.isMember || s?.myRole === 'member' ? 'member' : 'none';

export type SquadMenuKey = 'edit' | 'logo' | 'leave' | 'delete';

/**
 * El menú «•••»: el capitán edita, cambia el logo, «Salir» (si hay más gente: primero pasa la capitanía; solo, borra el
 * equipo) y borra el equipo; un miembro sale; quien no es miembro, nada.
 */
export function squadMenu(viewer: SquadViewer, members: number): SquadMenuKey[] {
  if (viewer === 'captain') return members > 1 ? ['edit', 'logo', 'leave', 'delete'] : ['edit', 'logo', 'delete'];
  if (viewer === 'member') return ['leave'];
  return [];
}

export type MemberActionKey = 'edit' | 'make_captain' | 'remove';

/** Lo que el capitán hace con alguien de la plantilla: posición y número (también los suyos), la capitanía y sacarlo. */
export function memberActions(viewer: SquadViewer, target: Pick<SquadMember, 'role' | 'isMe'>): MemberActionKey[] {
  if (viewer !== 'captain') return [];
  if (target.isMe || target.role === 'captain') return ['edit'];
  return ['edit', 'make_captain', 'remove'];
}

/** El número de la camiseta escrito: '' = sin número; null si no sirve (0 a 99). */
export function parseJersey(raw: string): number | null | 'invalid' {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{1,2}$/.test(t)) return 'invalid';
  return Number(t);
}

export const POSITION_MAX = 20;

// ---------- Ligas ----------

/** Solo los deportes de equipo (fútbol, futsal, baloncesto) inscriben equipos en ligas. */
export function canEnterLeagues(sport: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPORT_FAMILY, sport) && SPORT_FAMILY[sport as SportId] === 'team';
}

/** Lo que se dice en los demás deportes. */
export const leaguesSoonText = (sport: string) => `Pronto podrás inscribir equipos de ${sportMeta(sport)?.lower ?? 'este deporte'}.`;

export const LEAGUE_STATUS_TEXT: Record<SquadRequestStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aceptado',
  rejected: 'Rechazado',
  withdrawn: 'Retirada',
};
export const LEAGUE_STATUS_TONE: Record<SquadRequestStatus, 'warn' | 'ok' | 'danger' | 'neutral'> = {
  pending: 'warn',
  approved: 'ok',
  rejected: 'danger',
  withdrawn: 'neutral',
};

/** Las ligas que se muestran (las retiradas no): aceptadas, pendientes y rechazadas, en ese orden. */
export function shownLeagues<T extends Pick<SquadLeague, 'status' | 'name'>>(leagues: readonly T[]): T[] {
  const order: Record<SquadRequestStatus, number> = { approved: 0, pending: 1, rejected: 2, withdrawn: 3 };
  return leagues.filter((l) => l.status !== 'withdrawn').sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, 'es'));
}

/** Las ligas donde ya está o ya pidió (no se pide dos veces): id → estado. */
export function takenLeagues(leagues: readonly Pick<SquadLeague, 'leagueId' | 'status'>[]): Map<string, 'pending' | 'approved'> {
  const out = new Map<string, 'pending' | 'approved'>();
  for (const l of leagues) if (l.status === 'pending' || l.status === 'approved') out.set(l.leagueId, l.status);
  return out;
}

/** Lo que se puede elegir al inscribir: del mismo deporte, públicas o de las que ya soy miembro. */
export function leagueChoices<T extends { sport: string; visibility: string; isMember?: boolean }>(leagues: readonly T[], sport: string): T[] {
  return leagues.filter((l) => l.sport === sport && (l.visibility === 'public' || !!l.isMember));
}

/** «Entró con 8 jugadores (2 ya estaban en otro equipo)». */
export function decisionText(d: SquadDecision): string {
  const added = d.added ?? 0;
  const skipped = d.skipped ?? 0;
  const base = added ? `Entró con ${countWord(added, 'jugador', 'jugadores')}` : 'Entró sin jugadores nuevos';
  return skipped ? `${base} (${skipped} ya ${skipped === 1 ? 'estaba' : 'estaban'} en otro equipo)` : base;
}

/** Lo de «Pasar miembros nuevos»: «Entraron 2 jugadores (1 ya estaba en otro equipo)» o «Ya estaban todos». */
export function syncText(r: { added: number; skipped: number }): string {
  if (!r.added && !r.skipped) return 'Ya estaban todos en la liga';
  const base = r.added ? `${r.added === 1 ? 'Entró' : 'Entraron'} ${countWord(r.added, 'jugador', 'jugadores')}` : 'No entró nadie nuevo';
  return r.skipped ? `${base} (${r.skipped} ya ${r.skipped === 1 ? 'estaba' : 'estaban'} en otro equipo)` : base;
}

const kindOf = (e: unknown) => (e && typeof e === 'object' ? (e as { kind?: unknown }).kind : undefined);
/** El código corto de la base: 'invalido: nota' → 'invalido'. */
const codeOf = (e: unknown) => (e instanceof Error ? (e.message.trim().split(/[\s:]/)[0] ?? '') : '');

/** El error al pedir entrar a una liga o retirar la solicitud (capitán). */
export function requestErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const code = codeOf(e);
  if (code === 'duplicado' || kindOf(e) === 'conflict') return 'Ya pediste entrar a esa liga (o el equipo ya está en ella).';
  if (code === 'invalido') return 'Esa liga no acepta este equipo: tiene que ser de su deporte y sin menores.';
  if (code === 'cerrado') return 'Esa solicitud ya se decidió.';
  if (kindOf(e) === 'not_found') return 'Esa liga no está disponible: tiene que ser pública o una donde ya juegas.';
  if (kindOf(e) === 'permission') return 'Solo el capitán puede inscribir el equipo.';
  return squadErrorText(e);
}

/** El error al pasar los miembros nuevos a una liga. */
export function syncErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  if (kindOf(e) === 'not_found') return 'El equipo ya no está en esa liga.';
  return squadErrorText(e);
}

/** El error al cambiar a alguien de la plantilla (posición, número, capitanía, sacarlo). */
export function memberErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  if (codeOf(e) === 'duplicado') return 'Ese número ya lo tiene otro del equipo.';
  if (kindOf(e) === 'not_found') return 'Esa persona ya no está en el equipo.';
  return squadErrorText(e);
}

/** El error al aceptar o rechazar a un equipo (admins de la liga). */
export function adminErrorText(e: unknown): string {
  if (isBlockedError(e)) return BLOCKED_MESSAGE;
  const code = codeOf(e);
  if (code === 'cerrado') return 'Esa solicitud ya se decidió.';
  if (code === 'invalido') return 'Ya no se puede aceptar a este equipo.';
  if (kindOf(e) === 'permission') return 'Solo los admins de la liga pueden hacer eso.';
  if (kindOf(e) === 'not_found') return 'Esa solicitud ya no está.';
  return squadErrorText(e);
}

// ---------- Unirse con el código ----------

export const CODE_LENGTH = 8;

/** El código mientras se escribe: mayúsculas, solo letras y números, hasta 8. */
export const cleanCode = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);

export type SquadJoinState = 'loading' | 'dead' | 'signin' | 'member' | 'ready';

/** La pantalla de unirse: leyendo, el código no sirve, sin cuenta, ya estás o «Unirme». */
export function squadJoinState(o: {
  preview: Pick<SquadLite, 'id'> | null | undefined;
  signedIn: boolean;
  loading: boolean;
  mySquadIds: ReadonlySet<string>;
}): SquadJoinState {
  if (o.preview === undefined || o.loading) return 'loading';
  if (!o.preview) return 'dead';
  if (!o.signedIn) return 'signin';
  if (o.mySquadIds.has(o.preview.id)) return 'member';
  return 'ready';
}

/** «Únete a Los Tigres (Fútbol) en MatchMate». */
export const squadShareText = (s: Pick<SquadLite, 'name' | 'sport'>) => `Únete a ${s.name} (${sportShort(s.sport)}) en MatchMate`;

// ---------- Colores ----------

/** Los colores para elegir (además del del deporte, que va primero y es el de entrada). */
export const SQUAD_COLORS: readonly { hex: string; name: string }[] = [
  { hex: '#dc2626', name: 'Rojo' },
  { hex: '#ea580c', name: 'Naranja' },
  { hex: '#ca8a04', name: 'Dorado' },
  { hex: '#16a34a', name: 'Verde' },
  { hex: '#0891b2', name: 'Turquesa' },
  { hex: '#2563eb', name: 'Azul' },
  { hex: '#7c3aed', name: 'Morado' },
  { hex: '#db2777', name: 'Rosado' },
  { hex: '#1f2937', name: 'Negro' },
];

/** Un color '#rrggbb' (en minúsculas) o null si no sirve. */
export function validColor(c: string | null | undefined): string | null {
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : null;
}

// ---------- Crear ----------

/** El deporte que sale marcado al crear: el pedido, el deporte en que estás o el primero que se puede (nunca esports). */
export function defaultSquadSport(creatable: readonly string[], ...wanted: (string | null | undefined)[]): string | null {
  const ok = creatable.filter((s) => s !== 'esports');
  for (const w of wanted) if (w && ok.includes(w)) return w;
  return ok[0] ?? null;
}
