/**
 * Lo que no es pantalla de las piezas de la liga (src/components/league): quién se puede elegir al unirse, los
 * avisos que salen en el inicio, las zonas horarias del formulario, las reglas de «Liga con menores» y el orden de
 * las pestañas del Admin. Funciones puras, con pruebas en logic.test.ts.
 */
import { normalizeName } from '../../lib/stats';
import type { LeagueKind, Player, Visibility } from '../../lib/types';
import { sportMeta, type UnitPair } from '../../sports/registry';

// ---------- «¿Quién eres?» ----------

/** Jugadores que alguien puede decir que es al unirse: sin cuenta y no menores (los que la base deja vincular), por nombre. */
export function freePlayers(players: readonly Player[]): Player[] {
  return players.filter((p) => !p.uid && !p.isMinor).sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
}

/**
 * El jugador que parece ser la cuenta: el único con su mismo nombre (sin acentos, mayúsculas ni signos). Con
 * ninguno o con varios iguales no se adivina (null): que la persona elija.
 */
export function guessPlayer(players: readonly Pick<Player, 'id' | 'name'>[], name: string | null | undefined): string | null {
  const mine = normalizeName(name ?? '');
  if (!mine) return null;
  const same = players.filter((p) => normalizeName(p.name) === mine);
  return same.length === 1 ? same[0].id : null;
}

/** Busca por nombre sin fijarse en acentos ni mayúsculas (cada palabra escrita tiene que estar). */
export function searchPlayers<T extends Pick<Player, 'name'>>(players: readonly T[], q: string): T[] {
  const words = normalizeName(q).split(' ').filter(Boolean);
  if (!words.length) return [...players];
  return players.filter((p) => {
    const n = normalizeName(p.name);
    return words.every((w) => n.includes(w));
  });
}

/** Con cuántos jugadores libres vale la pena el buscador. */
export const PICKER_SEARCH_FROM = 8;

/** Lo que useJoinFlow necesita saber de a qué liga se une (el resto de JoinTarget es para la pantalla). */
export interface JoinStepTarget {
  lid: string;
  prefer?: string | null;
  next?: string;
  signUp?: boolean;
}

/**
 * El paso siguiente de «Unirme» (el mismo desde todas partes): sin cuenta, `login` (a entrar o crear la cuenta y
 * volver a `next`); si ya dijo quién es (`prefer`), `join` con ese sin preguntar; si todavía no se leyeron los
 * jugadores, `load`; si la liga tiene jugadores sin cuenta, `ask` («¿Quién eres?», con el que parece ser marcado);
 * si no, `join` como alguien nuevo (null).
 */
export type JoinStep =
  | { step: 'login'; url: string }
  | { step: 'join'; choice: string | null }
  | { step: 'load' }
  | { step: 'ask'; free: Player[]; initial: string | null };

export function joinStep(t: JoinStepTarget, players: readonly Player[] | undefined, me: { signedIn: boolean; name?: string | null }): JoinStep {
  if (!me.signedIn) return { step: 'login', url: `/login?${t.signUp ? 'modo=registro&' : ''}next=${encodeURIComponent(t.next ?? `/l/${t.lid}`)}` };
  if (t.prefer) return { step: 'join', choice: t.prefer };
  if (!players) return { step: 'load' };
  const free = freePlayers(players);
  if (!free.length) return { step: 'join', choice: null };
  return { step: 'ask', free, initial: guessPlayer(free, me.name) };
}

// ---------- Inicio de la liga ----------

/** ¿La ruta es el inicio de la liga (`/l/<id>`)? Ahí van la portada, el aviso y los datos de la liga. */
export function isLeagueHome(pathname: string, base: string): boolean {
  return pathname === base || pathname === `${base}/`;
}

/** Cómo se llama la gente de la liga: nadadores en natación, jugadores en lo demás. */
export function peopleWord(sport: string | null | undefined): UnitPair {
  const side = sportMeta(sport)?.units.side;
  return side?.[0] === 'nadador' ? side : ['jugador', 'jugadores'];
}

/** «1 jugador», «12 nadadores». */
export const countLabel = (n: number, [one, many]: UnitPair) => `${n} ${n === 1 ? one : many}`;

/** Unirse o unirte, liga o torneo: «Unirme a la liga» / «Unirme al torneo». */
export const joinLabel = (kind: LeagueKind | undefined) => (kind === 'torneo' ? 'Unirme al torneo' : 'Unirme a la liga');

// ---------- Avisos a toda la liga ----------

export interface NoticeLike {
  id: string;
  sentAt: string;
}

/** Cuántas horas sale un aviso arriba en el inicio de la liga. */
export const NOTICE_HOURS = 48;

/** Los avisos que salen en el inicio: de las últimas `hours` horas, sin los que la persona cerró, el más nuevo primero. */
export function recentNotices<T extends NoticeLike>(list: readonly T[], now: number, dismissed: ReadonlySet<string> = new Set(), hours = NOTICE_HOURS, max = 2): T[] {
  const from = now - hours * 3_600_000;
  return list
    .filter((a) => !dismissed.has(a.id))
    .filter((a) => {
      const t = Date.parse(a.sentAt);
      return Number.isFinite(t) && t >= from && t <= now + 5 * 60_000;
    })
    .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))
    .slice(0, max);
}

/**
 * Textos listos para el aviso («Se suspende por lluvia»…): lo más común en RD. El lugar sale con el nombre del
 * deporte (cancha, pista, piscina, campo).
 */
export function announceTemplates(sport: string | null | undefined): string[] {
  const where: Record<string, string> = { bowling: 'pista', golf: 'hora de salida', swimming: 'piscina' };
  const place = where[sport ?? 'bowling'] ?? 'cancha';
  return ['Hoy se suspende por lluvia.', 'Hoy se suspende: no hay luz en el lugar.', `Cambio de ${place}: `, 'Empezamos 30 minutos más tarde.'];
}

/** A cuántos les llega el aviso, en palabras («a 5 de 12 miembros»). `others` = los miembros menos quien lo manda. */
export function reachLine(reach: number, others: number): string {
  if (!reach) return 'Nadie tiene los avisos activados todavía: igual sale 2 días en el inicio.';
  const of = Math.max(others, reach);
  return `Le llega al teléfono a ${reach} de ${of} ${of === 1 ? 'miembro' : 'miembros'} (los que activaron los avisos).`;
}

/** Cuántos avisos le quedan hoy a la liga. */
export const noticesLeft = (r: { sentToday: number; dailyLimit: number } | null | undefined) =>
  r ? Math.max(0, r.dailyLimit - r.sentToday) : null;

// ---------- Zona horaria ----------

export const DEFAULT_TZ = 'America/Santo_Domingo';

/** Las zonas que salen en el formulario (las de los clubes que usan la app y sus vecinas). */
export const TIMEZONES: readonly { id: string; label: string }[] = [
  { id: 'America/Santo_Domingo', label: 'República Dominicana' },
  { id: 'America/Puerto_Rico', label: 'Puerto Rico' },
  { id: 'America/New_York', label: 'Nueva York y Miami' },
  { id: 'America/Chicago', label: 'Chicago y Texas' },
  { id: 'America/Los_Angeles', label: 'Los Ángeles' },
  { id: 'America/Havana', label: 'Cuba' },
  { id: 'America/Port-au-Prince', label: 'Haití' },
  { id: 'America/Mexico_City', label: 'México' },
  { id: 'America/Guatemala', label: 'Guatemala y Centroamérica' },
  { id: 'America/Panama', label: 'Panamá' },
  { id: 'America/Bogota', label: 'Colombia' },
  { id: 'America/Caracas', label: 'Venezuela' },
  { id: 'America/Lima', label: 'Perú' },
  { id: 'America/Santiago', label: 'Chile' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
  { id: 'Europe/Madrid', label: 'España' },
];

/** «GMT-4» de esa zona hoy (vacío si el teléfono no lo sabe). */
export function tzOffset(id: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
}

/** Nombre para mostrar: el de la lista o, si no está, el id con espacios («America/El Salvador»). */
export function tzLabel(id: string): string {
  return TIMEZONES.find((z) => z.id === id)?.label ?? id.replace(/_/g, ' ');
}

/** La zona del teléfono (null si no se sabe). */
export function deviceTz(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Las opciones del selector: la lista, más la que tiene la liga y la del teléfono si no están. */
export function timezoneOptions(current: string | null | undefined, device: string | null = deviceTz()): { id: string; label: string }[] {
  const out = [...TIMEZONES];
  for (const id of [current, device]) if (id && !out.some((z) => z.id === id)) out.push({ id, label: tzLabel(id) });
  return out;
}

// ---------- Liga con menores ----------

/** Lo que cambia en el formulario con «Liga con menores»: siempre privada y sin foto obligatoria (la base lo exige). */
export function withMinors<T extends { hasMinors?: boolean; visibility: Visibility; requirePhoto: boolean }>(form: T): T {
  return form.hasMinors ? { ...form, visibility: 'private', requirePhoto: false } : form;
}

/**
 * ¿Se puede tocar el interruptor? Encenderlo, siempre (lo decide el admin). Apagarlo después de guardado, solo el
 * superadmin (y la base exige que no quede ningún menor).
 */
export function minorsLocked(savedHasMinors: boolean | undefined, isSuper: boolean): boolean {
  return !!savedHasMinors && !isSuper;
}

// ---------- Pestañas del Admin ----------

/**
 * Pestañas del deporte que ya manejan a la gente de la liga (agregar y editar): con ellas sobra la general
 * «Jugadores» (natación: Nadadores; raqueta: Parejas y niveles, o Jugadores y niveles en tenis).
 */
export const PEOPLE_TABS: ReadonlySet<string> = new Set(['nadadores', 'parejas']);

export interface AdminTabLike {
  key: string;
}

/** Pestañas generales que van primero en todos los deportes: «Pendientes» (lo que espera por el admin). */
export const FIRST_TABS: ReadonlySet<string> = new Set(['pendientes']);

/**
 * El orden de las pestañas del Admin. Primero «Pendientes» (si viene), en todos los deportes, y abre ahí. Después,
 * el boliche como siempre (las generales). Los otros deportes: primero las suyas (la clave para arrancar: Equipos,
 * Campos, Nadadores, Parejas) y después las generales. Sin «Pendientes», abre en la primera. Una del deporte con la
 * misma clave que una general la reemplaza en su lugar. Si el deporte tiene su propia pestaña de gente, la general
 * «Jugadores» no sale (lo de vincular cuentas pasa a Miembros).
 */
export function arrangeAdminTabs<T extends AdminTabLike>(
  generic: readonly T[],
  sport: readonly T[],
  bowling: boolean,
): { tabs: T[]; defaultKey: string; playersMerged: boolean } {
  const replaced = generic.map((t) => sport.find((x) => x.key === t.key) ?? t);
  const first = replaced.filter((t) => FIRST_TABS.has(t.key));
  const rest = replaced.filter((t) => !FIRST_TABS.has(t.key));
  const own = sport.filter((x) => !generic.some((t) => t.key === x.key));
  if (bowling) {
    const tabs = [...first, ...rest, ...own];
    return { tabs, defaultKey: tabs[0]?.key ?? 'jugadores', playersMerged: false };
  }
  const playersMerged = own.some((t) => PEOPLE_TABS.has(t.key)) && !sport.some((x) => x.key === 'jugadores');
  const tabs = [...first, ...own, ...rest.filter((t) => !(playersMerged && t.key === 'jugadores'))];
  return { tabs, defaultKey: tabs[0]?.key ?? 'jugadores', playersMerged };
}

// ---------- Datos de la liga (lugar, horario, contacto) ----------

export type InfoKey = 'venue' | 'schedule' | 'season' | 'date' | 'contact';

export interface InfoRow {
  key: InfoKey;
  label: string;
  value: string;
  /** Solo el contacto: su WhatsApp (dígitos) si lo tiene. */
  phone?: string;
}

type InfoLeague = {
  sport?: string | null;
  kind?: LeagueKind;
  venue?: string;
  schedule?: string;
  seasonStart?: string;
  seasonEnd?: string;
  contactName?: string;
  contactPhone?: string;
};

/**
 * Lo que el organizador escribió al crear la liga, para quien la mira: el lugar (Club, Cancha, Piscina…), cuándo
 * juegan, la temporada (o la fecha del torneo) y el contacto. Solo lo que tiene algo.
 */
export function infoRows(l: InfoLeague, fmt: { date: (iso: string) => string; longDate: (iso: string) => string }): InfoRow[] {
  const rows: InfoRow[] = [];
  const torneo = l.kind === 'torneo';
  const venue = l.venue?.trim();
  if (venue) rows.push({ key: 'venue', label: sportMeta(l.sport || 'bowling')?.venue ?? 'Lugar', value: venue });
  const schedule = l.schedule?.trim();
  if (!torneo && schedule) rows.push({ key: 'schedule', label: 'Cuándo juegan', value: schedule });
  if (torneo && l.seasonStart) rows.push({ key: 'date', label: 'Fecha', value: fmt.longDate(l.seasonStart) });
  else if (!torneo && l.seasonStart && l.seasonEnd) rows.push({ key: 'season', label: 'Temporada', value: `${fmt.date(l.seasonStart)} – ${fmt.date(l.seasonEnd)}` });
  const name = l.contactName?.trim() ?? '';
  const phone = (l.contactPhone ?? '').replace(/[^\d+]/g, '');
  if (name || phone) rows.push({ key: 'contact', label: 'Contacto', value: name || phone, ...(phone.replace(/\D/g, '').length >= 7 ? { phone } : {}) });
  return rows;
}
