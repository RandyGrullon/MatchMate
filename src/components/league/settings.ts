/**
 * Lo que no es pantalla de Organizar › Ajustes de la liga (SettingsPanel, LogoCard, EditLeagueModal y LeagueConfigModal
 * de src/pages/AdminPage.tsx, el formulario de los datos —LeagueForm de src/components/LeagueFormModal.tsx—, las
 * transmisiones en vivo y la invitación): qué datos salen y cómo se leen, las filas de la configuración, los textos que
 * se arman, lo que se pregunta antes de borrar o quitar y cómo quedan los datos al guardar. La usan la web y la app del
 * teléfono (movil/src/components/leagueSettings). Funciones puras, con pruebas en settings.test.ts.
 */
import type { LeagueInput } from '../../lib/data/leagues';
import { formatDate, venueLabel } from '../../lib/format';
import { whatsappUrl } from '../../lib/league';
import { formatSchedule, isCanonicalSchedule, parseSchedule } from '../../lib/schedule';
import type { League, LeagueKind, Visibility } from '../../lib/types';
import { leagueSport, sportMeta } from '../../sports/registry';
import { defaultSeason } from '../create/logic';
import { DEFAULT_TZ, tzLabel, tzOffset, withMinors } from './logic';

type Kind = LeagueKind | null | undefined;
const torneoOf = (kind: Kind) => kind === 'torneo';

/** «el torneo» o «la liga». */
export const leagueNoun = (kind: Kind) => (torneoOf(kind) ? 'el torneo' : 'la liga');

/** El título de los datos (la tarjeta de Ajustes y el formulario de editar): «Datos de la liga» o «Datos del torneo». */
export const leagueDataTitle = (kind: Kind) => (torneoOf(kind) ? 'Datos del torneo' : 'Datos de la liga');

/** La marca de quién la ve: «Privada» o «Pública». */
export const visibilityLabel = (v: Visibility) => (v === 'private' ? 'Privada' : 'Pública');

/** ¿La liga lleva foto del marcador? (solo el boliche). */
export const leaguePhotos = (league: Pick<League, 'id' | 'sport'>) => sportMeta(leagueSport(league))?.photos ?? false;

// ---------- Los datos (la tarjeta de arriba) ----------

/** Lo que sale cuando un dato está vacío. */
export const EMPTY_DETAIL = 'Sin definir';

export type DetailKey = 'venue' | 'schedule' | 'season' | 'contact' | 'photo' | 'tz' | 'minors';

export interface SettingsDetail {
  key: DetailKey;
  label: string;
  /** Vacío = «Sin definir». */
  value: string;
  /** El contacto con WhatsApp: su link (wa.me). */
  href?: string;
}

/**
 * Los datos de la liga en el orden de la tarjeta: lugar, cuándo juegan y la temporada (no en un torneo suelto), el
 * contacto (con su WhatsApp), la foto del marcador (solo el boliche), la zona horaria con su hora («GMT-4») y si es con
 * menores. `at`: el momento de la hora de la zona; `fmt`: cómo se escribe una fecha.
 */
export function settingsDetails(league: League, opts: { at?: Date; fmt?: (iso: string) => string } = {}): SettingsDetail[] {
  const fmt = opts.fmt ?? formatDate;
  const torneo = torneoOf(league.kind);
  const season = league.seasonStart && league.seasonEnd ? `${fmt(league.seasonStart)} – ${fmt(league.seasonEnd)}` : '';
  const contact = [league.contactName, league.contactPhone].filter(Boolean).join(' · ');
  const tz = league.tz || DEFAULT_TZ;
  const offset = tzOffset(tz, opts.at);
  const out: SettingsDetail[] = [{ key: 'venue', label: venueLabel(league.sport), value: league.venue ?? '' }];
  if (!torneo) {
    out.push({ key: 'schedule', label: 'Cuándo juegan', value: league.schedule ?? '' });
    out.push({ key: 'season', label: 'Temporada', value: season });
  }
  out.push({ key: 'contact', label: 'Contacto', value: contact, ...(contact && league.contactPhone ? { href: whatsappUrl(league.contactPhone) } : {}) });
  if (leaguePhotos(league)) {
    out.push({ key: 'photo', label: 'Foto del marcador', value: league.requirePhoto !== false ? 'Obligatoria para que cuente' : 'Opcional' });
  }
  out.push({ key: 'tz', label: 'Zona horaria', value: `${tzLabel(tz)}${offset ? ` (${offset})` : ''}` });
  out.push({ key: 'minors', label: torneo ? 'Torneo con menores' : 'Liga con menores', value: league.hasMinors ? 'Sí: privada, sin fotos ni comentarios' : 'No' });
  return out;
}

// ---------- Respaldo y borrar (la fila de abajo y su hoja) ----------

/** La fila de abajo: «Respaldo y borrar la liga» (dueño o superadmin) o «Respaldo de la liga». */
export function configRowTitle(kind: Kind, canDelete: boolean): string {
  const torneo = torneoOf(kind);
  if (canDelete) return torneo ? 'Respaldo y borrar el torneo' : 'Respaldo y borrar la liga';
  return torneo ? 'Respaldo del torneo' : 'Respaldo de la liga';
}

/** Su línea: «Descargar los datos, fotos viejas, borrar la liga» (las fotos, solo donde hay foto del marcador). */
export function configRowSubtitle(kind: Kind, photos: boolean, canDelete: boolean): string {
  return ['Descargar los datos', photos ? 'fotos viejas' : '', canDelete ? (torneoOf(kind) ? 'borrar el torneo' : 'borrar la liga') : ''].filter(Boolean).join(', ');
}

/** El título de la hoja: «Configuración de la liga» o «Configuración del torneo». */
export const configTitle = (kind: Kind) => (torneoOf(kind) ? 'Configuración del torneo' : 'Configuración de la liga');

export type ConfigKey = 'backup' | 'photos' | 'delete';

export interface ConfigRowItem {
  key: ConfigKey;
  title: string;
  text: string;
  /** El botón de la fila. */
  action: string;
  danger?: boolean;
}

/** Las filas de la hoja: el respaldo, las fotos viejas (boliche) y borrar (dueño o superadmin). */
export function configRows({ kind, bowling, canDelete }: { kind: Kind; bowling: boolean; canDelete: boolean }): ConfigRowItem[] {
  const out: ConfigRowItem[] = [
    {
      key: 'backup',
      title: 'Respaldo',
      text: bowling
        ? 'Descarga todos los datos (jugadores, eventos, juegos y miembros) en un archivo. Las fotos no entran.'
        : 'Descarga todos los datos (jugadores, eventos, partidos, resultados y miembros) en un archivo.',
      action: 'Descargar',
    },
  ];
  if (bowling) {
    out.push({
      key: 'photos',
      title: 'Fotos viejas',
      text: 'Borra las fotos de hace más de un año para no llenar el espacio gratis. Los juegos siguen contando.',
      action: 'Borrar',
    });
  }
  if (canDelete) {
    out.push({
      key: 'delete',
      title: torneoOf(kind) ? 'Borrar el torneo' : 'Borrar la liga',
      text: 'Se borra todo y no se puede deshacer. Descarga el respaldo antes.',
      action: 'Borrar',
      danger: true,
    });
  }
  return out;
}

/** Lo que dice al bajar el respaldo. */
export const backupDoneText = (c: { players: number; events: number; entries: number }) =>
  `Respaldo descargado: ${c.players} jugadores, ${c.events} eventos, ${c.entries} participaciones`;

export const BACKUP_ERROR_TEXT = 'No se pudo hacer el respaldo. Intenta de nuevo.';

/** Las fotos de hace más de esto (meses) son las «fotos viejas». */
export const OLD_PHOTOS_MONTHS = 12;

export const FREE_PHOTOS_CONFIRM = {
  title: 'Borrar fotos de hace más de un año',
  message: 'Los juegos siguen contando; solo deja de verse la foto. Sirve para no llenar el espacio gratis.',
  confirmText: 'Borrar fotos',
  danger: true,
} as const;

/** Lo que dice al borrar las fotos viejas. */
export const freedPhotosText = (n: number) => (n ? `${n} fotos borradas` : 'No hay fotos de hace más de un año');

/** ¿Borrar la liga? Con lo que se borra (el boliche tiene juegos y fotos; los demás, partidos y resultados). */
export function deleteLeagueConfirm(name: string, bowling: boolean) {
  return {
    title: `¿Borrar ${name}?`,
    message: bowling
      ? 'Se borran sus torneos, prácticas, jugadores, juegos, fotos, miembros e invitación. No se puede deshacer; descarga el respaldo antes.'
      : 'Se borran sus eventos, partidos, jugadores, resultados, miembros e invitación. No se puede deshacer; descarga el respaldo antes.',
    confirmText: 'Borrar todo',
    danger: true,
  } as const;
}

export const DELETED_TEXT = 'Borrado';

// ---------- El logo ----------

/** La línea del logo: dónde sale, y que es una imagen pública. */
export const logoHint = (has: boolean, kind: Kind) =>
  `${has ? 'Sale' : 'Si subes uno, sale'} en la lista de ligas, en las invitaciones y arriba en ${leagueNoun(kind)}. Es una imagen pública.`;

/** El botón del logo: «Subir logo», «Cambiar» o, subiendo, «Subiendo…». */
export const logoButtonLabel = (uploading: boolean, has: boolean) => (uploading ? 'Subiendo…' : has ? 'Cambiar' : 'Subir logo');

/** Lo que dice al subirlo. */
export const logoDoneText = (had: boolean) => (had ? 'Logo cambiado' : 'Logo listo');

export const LOGO_REMOVED_TEXT = 'Logo quitado';

/** ¿Quitar el logo? Vuelve el ícono del deporte. */
export const removeLogoConfirm = (kind: Kind) =>
  ({
    title: '¿Quitar el logo?',
    message: `${torneoOf(kind) ? 'El torneo' : 'La liga'} vuelve a mostrar el ícono del deporte. Puedes subir otro cuando quieras.`,
    confirmText: 'Quitar',
    danger: true,
  }) as const;

// ---------- Transmisiones en vivo ----------

/** Lo que explica «Transmisiones en vivo» (en el boliche transmiten solo los admins, como start_stream). */
export function liveExplain(league: Pick<League, 'id' | 'sport' | 'kind'>): string {
  const who = leagueSport(league) === 'bowling' ? 'Los admins' : 'Los admins y anotadores';
  return `${who} podrán poner el link de YouTube, Twitch, Facebook, Kick, Instagram o TikTok de un partido; sale arriba en ${leagueNoun(league.kind)} y avisa a los miembros y seguidores.`;
}

/** Lo que dice al prenderlas o apagarlas. */
export const liveToggleText = (on: boolean) => (on ? 'Transmisiones en vivo activadas' : 'Transmisiones en vivo apagadas');

// ---------- La invitación ----------

/** La línea de «Invitar a la liga»: quién entra. */
export const inviteCardText = (visibility: Visibility) =>
  visibility === 'private' ? 'Es privada: solo entra quien tenga el link, el QR o el código.' : 'Es pública: cualquiera puede unirse; el link los lleva directo.';

export const RENEW_CODE_CONFIRM = {
  title: 'Cambiar el código',
  message: 'El link, el QR y el código actuales dejan de servir. Quienes ya están en la liga siguen en ella.',
  confirmText: 'Cambiar',
} as const;

/** Lo que dice al crear o cambiar el código. */
export const renewDoneText = (had: boolean) => (had ? 'Código nuevo listo' : 'Invitación creada');

// ---------- El formulario de los datos (LeagueForm) ----------

/** Los datos de una liga como los llena el formulario (vacíos donde no hay nada). */
export const leagueInput = (l: League): LeagueInput => ({
  name: l.name,
  kind: l.kind ?? 'liga',
  visibility: l.visibility,
  venue: l.venue ?? '',
  schedule: l.schedule ?? '',
  seasonStart: l.seasonStart ?? '',
  seasonEnd: l.seasonEnd ?? '',
  contactName: l.contactName ?? '',
  contactPhone: l.contactPhone ?? '',
  requirePhoto: l.requirePhoto ?? true,
  hasMinors: !!l.hasMinors,
  tz: l.tz || DEFAULT_TZ,
});

/** Lo que cambia con «Liga con menores» (lo explica el formulario antes de activarla). */
export const MINORS_RULES = [
  'La liga queda privada: solo entra quien tenga la invitación.',
  'Los menores no tienen cuenta: los registra un admin, con el permiso de su papá, mamá o tutor.',
  'Su año de nacimiento y sus datos solo los ven los admins; los demás ven su nombre y su categoría.',
  'Sin fotos, sin «Me gusta» y sin comentarios en toda la liga.',
  'Sin link para anotar: a cada anotador se le invita por su @usuario. Quien entró con un link solo para anotar sale de la liga.',
] as const;

export const leagueNameLabel = (torneo: boolean) => (torneo ? 'Nombre del torneo' : 'Nombre de la liga');
export const leagueNamePlaceholder = (torneo: boolean) => (torneo ? 'Copa de verano' : 'Liga de los martes');
export const whoCanSeeLabel = (torneo: boolean) => `¿Quién puede ${torneo ? 'verlo' : 'verla'}?`;
export const PRIVATE_CHOICE_TEXT = 'Solo con invitación (link, QR o código).';
/** «Pública»: con menores no se puede. */
export const publicChoiceText = (minors: boolean, torneo: boolean) =>
  minors ? 'Con menores no se puede.' : torneo ? 'Cualquiera lo ve y se une.' : 'Cualquiera la ve y se une.';

/** «Exigir foto del marcador»: qué pasa con la foto obligatoria o sin ella. */
export const requirePhotoText = (on: boolean) =>
  on
    ? 'Un juego cuenta en promedios y clasificaciones cuando se verifica con la foto. Si un jugador lo envía sin foto, el admin decide si lo acepta.'
    : 'Los juegos que anota un admin cuentan de una; los que suben los jugadores igual se aprueban.';

export const TZ_HINT = 'Con esta hora salen los recordatorios, los avisos y el «hoy» de la liga.';

export const minorsTitle = (torneo: boolean) => (torneo ? 'Torneo con menores' : 'Liga con menores');
export const MINORS_BLURB = 'Para clubes con niños y jóvenes: natación, escuelitas, juveniles.';
export const MINORS_OFF_TEXT = 'Al activarla queda privada, sin fotos ni comentarios, y a los menores los registra un admin (no tienen cuenta).';

/** La nota de abajo de «Liga con menores»: ya activada (bloqueada), el superadmin la puede apagar, o no tiene vuelta. */
export function minorsNote({ on, locked, canTurnOff }: { on: boolean; locked: boolean; canTurnOff: boolean }): string | null {
  if (locked) return 'Ya está activada. Solo el equipo de MatchMate la puede apagar, y solo si no queda ningún menor.';
  if (canTurnOff) return 'Como superadmin la puedes apagar, solo si no queda ningún menor en la liga.';
  return on ? 'Una vez guardada, no la puedes apagar tú.' : null;
}

/** Encenderla en una liga que ya existe no tiene vuelta atrás para el admin: se confirma antes de guardar. */
export const needsMinorsConfirm = (creating: boolean, minors: boolean, initialHasMinors: boolean | undefined) => !creating && minors && !initialHasMinors;

export const minorsConfirm = (torneo: boolean) =>
  ({
    title: '¿Activar «Liga con menores»?',
    message: `${torneo ? 'El torneo queda privado' : 'La liga queda privada'}, sin fotos ni comentarios, y después no la puedes apagar tú. Los links para anotar dejan de servir y quien entró con uno solo para anotar sale ${torneo ? 'del torneo' : 'de la liga'}.`,
    confirmText: 'Activar y guardar',
  }) as const;

/** «Temporada con fechas»: apagada borra las fechas; prendida sin fechas arranca hoy y termina el 31 de diciembre. */
export function seasonToggle(form: LeagueInput, on: boolean, today: string): LeagueInput {
  if (!on) return { ...form, seasonStart: '', seasonEnd: '' };
  return form.seasonStart ? form : { ...form, ...defaultSeason(today) };
}

/**
 * Los datos para guardar (o crear): sin espacios de más, la temporada solo si está prendida, el teléfono solo con
 * dígitos y «+», sin foto obligatoria donde el deporte no lleva foto (`sportPhotos` false) y, con menores, privada y sin
 * foto. Sin `advanced` (un torneo nuevo) no van los menores ni la zona horaria (create_tournament no los recibe).
 */
export function leagueFormData(form: LeagueInput, opts: { hasSeason: boolean; sportPhotos: boolean | undefined; advanced?: boolean }): LeagueInput {
  const data = withMinors({
    ...form,
    requirePhoto: opts.sportPhotos === false ? false : form.requirePhoto,
    name: form.name.trim(),
    venue: form.venue.trim(),
    schedule: form.schedule.trim(),
    seasonStart: opts.hasSeason ? form.seasonStart : '',
    seasonEnd: opts.hasSeason ? form.seasonEnd : '',
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.replace(/[^\d+]/g, ''),
  });
  return opts.advanced === false ? { ...data, hasMinors: undefined, tz: undefined } : data;
}

/**
 * Lo que falta para poder guardar (la web lo marca con los campos obligatorios): el nombre y, con temporada, las dos
 * fechas en orden. null = se puede.
 */
export function leagueFormProblem(form: Pick<LeagueInput, 'name' | 'seasonStart' | 'seasonEnd'>, hasSeason: boolean): 'nombre' | 'fechas' | 'orden' | null {
  if (!form.name.trim()) return 'nombre';
  if (!hasSeason) return null;
  if (!form.seasonStart || !form.seasonEnd) return 'fechas';
  return form.seasonEnd < form.seasonStart ? 'orden' : null;
}

/** El aviso de las fechas de la temporada al revés (el mismo del asistente de crear). */
export const SEASON_ORDER_TEXT = 'La fecha de fin va después de la de inicio.';

// ---------- «Cuándo juegan» (SchedulePicker) ----------

/** Lo guardado para volver a editarlo: los días, la hora y el texto escrito a mano antes del selector (si no es el suyo). */
export function scheduleDraft(value: string): { days: number[]; time: string; legacy: string } {
  const parsed = parseSchedule(value);
  return { ...parsed, legacy: value.trim() && !isCanonicalSchedule(value) ? value.trim() : '' };
}

/** Días (0 = lunes) que quedan al tocar uno: lo quita si estaba, lo agrega si no. */
export const toggleDay = (days: readonly number[], d: number) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

/** La línea de abajo: lo que decía antes, cómo se va a ver o qué falta. */
export function scheduleHint(legacy: string, days: number[], time: string): string {
  const summary = formatSchedule(days, time);
  if (legacy) return `Ahora dice: “${legacy}”. Si eliges días u hora, se reemplaza.`;
  return summary ? `Se verá así: ${summary}` : 'Elige el día (o los días) y la hora.';
}
