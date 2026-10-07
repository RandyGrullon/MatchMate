/**
 * Lo que no es pantalla de Organizar (Pro): las filas de «Por hacer» (solo lo que tiene algo) y de «La liga» (lo que se
 * configura, las 9 pestañas de antes agrupadas), sus líneas en palabras, el título de cada pantalla de
 * `/l/:lid/admin?tab=…` y qué liga se muestra. Funciones puras, con pruebas en hubLogic.test.ts. La pantalla está en
 * Hub.tsx y src/pages/OrganizePage.tsx.
 */
import type { LeaguePending } from '../../lib/data/organizer';
import { parseDate, toIsoDate } from '../../lib/format';
import type { LeagueCtx } from '../../lib/league';
import type { League, Member } from '../../lib/types';
import { leagueSport } from '../../sports/registry';
import { checklistSteps, pendingLine, pendingSections, type PendingKey, type PendingSectionView } from './logic';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «sábado 24 oct» (con el mes en letras: nunca «MAR 24», que se lee como marzo). */
export function dayShort(iso: string): string {
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** «1 sep – 15 dic» ('' sin las dos fechas). */
export function seasonRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '';
  const a = parseDate(start);
  const b = parseDate(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`;
}

/**
 * El horario como va en una línea después de las fechas: «Martes · 7:30 pm» → «martes 7:30 pm» (el día en minúscula y
 * sin otro punto en medio). Si no empieza con un día, igual.
 */
export function scheduleWords(schedule: string | null | undefined): string {
  const s = (schedule ?? '').replace(/\s+/g, ' ').trim();
  const m = /^([^\s·,]+)\s*(?:[·,]\s*)?(.*)$/.exec(s);
  const day = m?.[1].toLowerCase() ?? '';
  if (!m || !(DAYS.includes(day) || DAYS.includes(day.replace(/s$/, '')))) return s;
  return [day, m[2]].filter(Boolean).join(' ');
}

/** «Sofía Rodríguez» → «Sofía». */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** «Pedro Gómez» → «Pedro G.» (en filas angostas). */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? name;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/** Un envío por aprobar, para las líneas de Organizar. */
export interface ApproveSummary {
  name: string;
  scores: readonly (number | null)[];
  hasPhoto: boolean;
}

/** «2 con foto», «2 sin foto» o «1 con foto, 1 sin foto». */
export function photosLine(subs: readonly Pick<ApproveSummary, 'hasPhoto'>[]): string {
  const withPhoto = subs.filter((s) => s.hasPhoto).length;
  const without = subs.length - withPhoto;
  if (!without) return `${withPhoto} con foto`;
  if (!withPhoto) return `${without} sin foto`;
  return `${withPhoto} con foto, ${without} sin foto`;
}

/** «Sofía 181 · Carmen 199 · con foto» (hasta 2 nombres y «y 2 más»; la foto: «con foto», «sin foto» o «1 sin foto»). */
export function approveLine(subs: readonly ApproveSummary[]): string {
  if (!subs.length) return '';
  const who = subs.slice(0, 2).map((s) => [firstName(s.name), s.scores.filter((x): x is number => x != null).join(', ')].filter(Boolean).join(' '));
  const more = subs.length > 2 ? ` y ${subs.length - 2} más` : '';
  const without = subs.filter((s) => !s.hasPhoto).length;
  const photo = !without ? 'con foto' : without === subs.length ? 'sin foto' : `${without} sin foto`;
  return `${who.join(' · ')}${more} · ${photo}`;
}

/** Los juegos de un envío como van a quedar: «Juego 2 · 181» o «J1 187 · J2 210» (`start`: desde qué juego se guarda). */
export function gamesLine(values: readonly string[], start: number): string {
  const games = values.map((v, k) => ({ slot: start + k + 1, v: v.trim() })).filter((g) => g.v !== '');
  if (!games.length) return 'Sin juegos';
  if (games.length === 1) return `Juego ${games[0].slot} · ${games[0].v}`;
  return games.map((g) => `J${g.slot} ${g.v}`).join(' · ');
}

/** Días hacia adelante en que un torneo con equipos por armar sale en «Por hacer». */
export const TEAMS_AHEAD_DAYS = 30;

/** Los torneos que vienen (hasta 30 días) con equipos de 2 o más y ningún equipo armado, el más cercano primero. */
export function teamsToBuild(
  events: readonly { id: string; type: string; name?: string | null; date: string; teamSize?: number; teams?: Record<string, unknown> | null }[],
  today: string,
): { id: string; name: string; date: string }[] {
  const until = parseDate(today);
  until.setDate(until.getDate() + TEAMS_AHEAD_DAYS);
  const last = toIsoDate(until);
  return events
    .filter((e) => e.type === 'torneo' && e.date >= today && e.date <= last && (e.teamSize ?? 0) > 1 && !Object.keys(e.teams ?? {}).length)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ id: e.id, name: e.name?.trim() || 'Torneo', date: e.date }));
}

/** Qué es cada fila de «Por hacer». */
export type ToDoKind = 'aprobar' | 'disputes' | 'overdue' | 'reclamos' | 'buzon' | 'waitlists' | 'reportes' | 'confirmar' | 'equipos' | 'paso';

export interface ToDoItem {
  key: string;
  kind: ToDoKind;
  title: string;
  subtitle: string;
  /** El número del globo (0 = sin globo: lleva chevron). */
  count: number;
  to: string;
}

export interface ToDoInput {
  lid: string;
  kind?: string | null;
  /** league_pending (null mientras carga o sin permiso). */
  pending: LeaguePending | null;
  /** Envíos por aprobar en vivo (boliche); null si no aplica (los otros deportes confirman en sus partidos). */
  submissions: readonly ApproveSummary[] | null;
  /** Reclamos de jugadores por revisar, en vivo (null: lo de league_pending). */
  claims: number | null;
  /** Notas del buzón sin leer, la más nueva primero. */
  suggestions: readonly { text: string }[];
  /** Reportes abiertos (comentarios, avisos o juegos). */
  reports: number;
  /** Hazañas por confirmar (aval de insignias). */
  reviews: number;
  /** Torneos con los equipos por armar. */
  teams: readonly { id: string; name: string; date: string }[];
  /** Donde se agregan jugadores en este deporte, si no es «Jugadores» (los primeros pasos llevan ahí). */
  playersTab?: string | null;
  now?: number;
}

/** El primero de una sección, y cuántos más («Tigres vs Águilas y 2 más»). */
const firstOf = (s: PendingSectionView) => {
  const t = s.items[0]?.title ?? '';
  return t && s.count > 1 ? `${t} y ${s.count - 1} más` : t;
};

/** Con uno solo, directo a él; con varios, a la lista. */
const targetOf = (s: PendingSectionView) => (s.count === 1 && s.items[0] ? s.items[0].url : s.url);

/**
 * «Por hacer» de Organizar: solo lo que tiene algo, en el orden en que conviene atenderlo (lo que frena a los jugadores
 * primero). Cada fila con su número y a dónde lleva; los torneos por armar y los primeros pasos llevan chevron.
 */
export function toDoItems(input: ToDoInput): ToDoItem[] {
  const { lid, pending: p } = input;
  const admin = `/l/${lid}/admin`;
  const out: ToDoItem[] = [];
  const subs = input.submissions;
  const approvals = subs ? subs.length : (p?.submissions.count ?? 0);
  if (approvals > 0) {
    out.push({
      key: 'aprobar',
      kind: 'aprobar',
      title: 'Aprobar juegos',
      subtitle: subs ? approveLine(subs) : plural(approvals, 'juego por aprobar', 'juegos por aprobar'),
      count: approvals,
      to: `${admin}?tab=aprobar`,
    });
  }
  const sections = p ? pendingSections(p, input.now ?? Date.now()) : [];
  const sec = (k: PendingKey) => sections.find((s) => s.key === k);
  const disputes = sec('disputes');
  if (disputes) out.push({ key: 'disputes', kind: 'disputes', title: 'Resultados reclamados', subtitle: firstOf(disputes), count: disputes.count, to: targetOf(disputes) });
  const overdue = sec('overdue');
  if (overdue) out.push({ key: 'overdue', kind: 'overdue', title: 'Partidos sin resultado', subtitle: firstOf(overdue), count: overdue.count, to: targetOf(overdue) });
  const claims = input.claims ?? p?.claims.count ?? 0;
  if (claims > 0) {
    const c = p?.claims.items[0];
    out.push({
      key: 'reclamos',
      kind: 'reclamos',
      title: 'Reclamos de jugadores',
      subtitle: c && claims === 1 ? `${c.claimantName} dice que es ${c.playerName}` : plural(claims, 'cuenta dice ser un jugador', 'cuentas dicen ser un jugador'),
      count: claims,
      to: `${admin}?tab=reclamos`,
    });
  }
  if (input.suggestions.length) {
    const text = input.suggestions[0].text.replace(/\s+/g, ' ').trim();
    const n = input.suggestions.length;
    out.push({ key: 'buzon', kind: 'buzon', title: 'Buzón', subtitle: text ? `«${text}»` : plural(n, 'nota nueva', 'notas nuevas'), count: n, to: `${admin}?tab=buzon` });
  }
  const waitlists = sec('waitlists');
  if (waitlists) {
    const w = p?.waitlists.items[0];
    out.push({
      key: 'waitlists',
      kind: 'waitlists',
      title: 'Listas de espera',
      subtitle: w ? `${w.name} · ${w.waiting} en espera${waitlists.count > 1 ? ` y ${waitlists.count - 1} más` : ''}` : '',
      count: waitlists.count,
      to: targetOf(waitlists),
    });
  }
  if (input.reports > 0)
    out.push({ key: 'reportes', kind: 'reportes', title: 'Reportes', subtitle: plural(input.reports, 'cosa reportada por revisar', 'cosas reportadas por revisar'), count: input.reports, to: `${admin}?tab=reportes` });
  if (input.reviews > 0)
    out.push({ key: 'confirmar', kind: 'confirmar', title: 'Insignias por confirmar', subtitle: plural(input.reviews, 'hazaña por confirmar', 'hazañas por confirmar'), count: input.reviews, to: `${admin}?tab=confirmar` });
  for (const t of input.teams) out.push({ key: `equipos:${t.id}`, kind: 'equipos', title: t.name, subtitle: `Armar equipos · ${dayShort(t.date)}`, count: 0, to: `/l/${lid}/e/${t.id}?tab=equipos` });
  const c = p?.checklist;
  if (c && !c.complete) {
    const label = input.kind === 'torneo' ? 'Tu torneo nuevo' : 'Primeros pasos';
    for (const s of checklistSteps(c, lid, { playersTab: input.playersTab ?? null }).filter((s) => !s.done)) {
      out.push({ key: `paso:${s.key}`, kind: 'paso', title: s.label, subtitle: `${label} · ${c.done} de ${c.total}`, count: 0, to: s.url });
    }
  }
  return out;
}

/**
 * Lo que espera en una liga en una línea (la hoja de ligas): «2 juegos por aprobar · 1 nota en el buzón» (hasta 3 cosas
 * y «y más»); sin nada pendiente y con la liga nueva, «Primeros pasos: 2 de 4»; '' si no hay nada.
 */
export function toDoLine(p: LeaguePending | null | undefined, extra: { notes: number; reports: number; reviews: number }): string {
  const base = p ? pendingLine({ ...p, checklist: null }) : '';
  const parts = [
    ...(base ? base.replace(/ y más$/, '').split(' · ') : []),
    extra.notes ? plural(extra.notes, 'nota en el buzón', 'notas en el buzón') : '',
    extra.reports ? plural(extra.reports, 'reporte', 'reportes') : '',
    extra.reviews ? plural(extra.reviews, 'insignia por confirmar', 'insignias por confirmar') : '',
  ].filter(Boolean);
  if (parts.length) return parts.length > 3 ? `${parts.slice(0, 3).join(' · ')} y más` : parts.join(' · ');
  return p ? pendingLine(p) : '';
}

/** Lo que suman los globos de «Por hacer» (lo que espera por el organizador en esa liga). */
export const toDoTotal = (items: readonly Pick<ToDoItem, 'count'>[]) => items.reduce((n, i) => n + i.count, 0);

/** Qué es cada fila de «La liga». */
export type LeagueRowKind = 'own' | 'gente' | 'temporada' | 'anotadores' | 'avisar' | 'insignias' | 'ajustes' | 'buzon' | 'reportes';

export interface LeagueRowItem {
  key: string;
  kind: LeagueRowKind;
  title: string;
  subtitle?: string;
  /** La pantalla de Organizar (`?tab=`); sin ella, la fila abre una hoja (Anotadores). */
  tab?: string;
}

export interface LeagueRowsInput {
  kind?: string | null;
  /** Lleva foto del marcador (boliche). */
  photos: boolean;
  schedule?: string | null;
  seasonStart?: string | null;
  seasonEnd?: string | null;
  /** Jugadores de la lista y cuántos tienen cuenta (null mientras cargan). */
  players: number | null;
  accounts: number | null;
  members: number | null;
  /** Pestañas propias del deporte (Equipos, Campos, Nadadores, Parejas…): van primero. */
  own: readonly { key: string; label: string }[];
  /** El deporte maneja a su gente en su pestaña: «Jugadores y miembros» pasa a «Miembros». */
  playersMerged: boolean;
  /** El buzón ya sale en «Por hacer» (con notas nuevas). */
  buzonInToDo: boolean;
  /** Hubo reportes y ninguno está abierto (los abiertos salen en «Por hacer»). */
  reportsTab: boolean;
}

/**
 * «La liga» de Organizar: lo que se configura, cada cosa en su fila. Lo propio del deporte va primero; el buzón y los
 * reportes, al final, solo cuando no salen ya en «Por hacer» (así siempre se llega a ellos).
 */
export function leagueRows(input: LeagueRowsInput): LeagueRowItem[] {
  const torneo = input.kind === 'torneo';
  const rows: LeagueRowItem[] = input.own.map((t) => ({ key: `own:${t.key}`, kind: 'own', title: t.label, tab: t.key }));
  const players = input.players != null ? plural(input.players, 'jugador', 'jugadores') : '';
  const accounts = input.players != null && input.accounts != null ? `${input.accounts} con cuenta` : '';
  rows.push(
    input.playersMerged
      ? {
          key: 'gente',
          kind: 'gente',
          title: 'Miembros',
          subtitle: input.members != null ? `${plural(input.members, 'miembro', 'miembros')} · permisos y cuentas` : 'Permisos y cuentas',
          tab: 'miembros',
        }
      : { key: 'gente', kind: 'gente', title: 'Jugadores y miembros', subtitle: [players, accounts].filter(Boolean).join(' · ') || undefined, tab: 'jugadores' },
  );
  rows.push(
    torneo
      ? { key: 'temporada', kind: 'temporada', title: 'Fechas', subtitle: 'Suspender o mover un día', tab: 'temporada' }
      : {
          key: 'temporada',
          kind: 'temporada',
          title: 'Temporada y fechas',
          subtitle: [seasonRange(input.seasonStart, input.seasonEnd), scheduleWords(input.schedule)].filter(Boolean).join(' · ') || 'Cerrar la temporada o suspender un día',
          tab: 'temporada',
        },
  );
  rows.push({ key: 'anotadores', kind: 'anotadores', title: 'Anotadores', subtitle: 'Quién anota por otros' });
  rows.push({ key: 'avisar', kind: 'avisar', title: torneo ? 'Avisar a todo el torneo' : 'Avisar a toda la liga', tab: 'avisar' });
  rows.push({ key: 'insignias', kind: 'insignias', title: 'Insignias', tab: 'insignias' });
  rows.push({
    key: 'ajustes',
    kind: 'ajustes',
    title: torneo ? 'Ajustes del torneo' : 'Ajustes de la liga',
    subtitle: input.photos ? 'Foto del marcador, logo, invitar' : 'Datos, logo, invitar',
    tab: 'liga',
  });
  if (!input.buzonInToDo) rows.push({ key: 'buzon', kind: 'buzon', title: 'Buzón', subtitle: 'Las notas que dejan los jugadores', tab: 'buzon' });
  if (input.reportsTab) rows.push({ key: 'reportes', kind: 'reportes', title: 'Reportes', subtitle: 'Lo que se reportó y cómo quedó', tab: 'reportes' });
  return rows;
}

/** El título de cada pantalla de Organizar (`/l/:lid/admin?tab=…`); null = no es una de las generales. */
export function adminScreenTitle(tab: string, kind?: string | null): string | null {
  const torneo = kind === 'torneo';
  switch (tab) {
    case 'jugadores':
    case 'miembros':
    case 'reclamos':
      return 'Jugadores y miembros';
    case 'aprobar':
      return 'Aprobar juegos';
    case 'buzon':
      return 'Buzón';
    case 'temporada':
      return torneo ? 'Fechas' : 'Temporada y fechas';
    case 'avisar':
      return torneo ? 'Avisar a todo el torneo' : 'Avisar a toda la liga';
    case 'insignias':
      return 'Insignias';
    case 'confirmar':
      return 'Insignias por confirmar';
    case 'reportes':
      return 'Reportes';
    case 'liga':
      return torneo ? 'Ajustes del torneo' : 'Ajustes de la liga';
    default:
      return null;
  }
}

/**
 * Qué liga muestra Organizar: la pedida (`?liga=`) si la organizas (el superadmin, cualquiera); si no, la última que
 * miraste; si no, la primera que organizas. null = no organizas ninguna.
 */
export function pickOrganizeLeague(organized: readonly string[], requested: string | null, remembered: string | null, isSuper: boolean): string | null {
  if (requested && (isSuper || organized.includes(requested))) return requested;
  if (remembered && organized.includes(remembered)) return remembered;
  return organized[0] ?? null;
}

/** La dirección del inicio de Organizar con esa liga elegida. */
export const organizeUrl = (lid: string) => `/organizar?liga=${encodeURIComponent(lid)}`;

/**
 * Lo que la cuenta puede en esa liga, igual que adentro de la liga (src/components/LeagueShell.tsx): dueño (o
 * superadmin), admin, anotador (en boliche, solo en los torneos sin liga) y su jugador.
 */
export function leagueOf(lid: string, league: League, member: Member | null, isSuper: boolean): LeagueCtx {
  const isOwner = isSuper || member?.role === 'owner';
  const isAdmin = isOwner || member?.role === 'admin';
  const isScorer = (league.kind === 'torneo' || leagueSport(league) !== 'bowling') && member?.scorer === true;
  return {
    lid,
    league,
    member,
    isOwner,
    isAdmin,
    isScorer,
    canScore: isAdmin || isScorer,
    scorerOnly: member?.scorerOnly === true && !member.playerId,
    myPlayerId: member?.playerId ?? null,
    base: `/l/${lid}`,
  };
}
