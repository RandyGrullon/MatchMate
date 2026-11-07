/**
 * Lo que deciden y dicen las pantallas del creador de insignias (docs/insignias.md §5 y §6.2), sin pantalla: la lista
 * de Admin › Insignias, el estante de la liga, las del creador en la página del jugador, el editor y el detalle de un
 * diseño. Lo usan la web (MakerAdmin, MakerHost, MakerPanels, LeagueMadeBadges, BadgeEditor y DesignSheet) y la app
 * del teléfono (movil/src/components/badges/maker), así dicen y hacen lo mismo. Funciones puras, con pruebas en
 * view.test.ts.
 */
import {
  BADGE_MAKERS_OPTIONS,
  MAX_ACTIVE_DESIGNS,
  badgeMakersOf,
  type BadgeHolder,
  type DesignStatus,
  type LeagueBadge,
  type LeagueBadgesData,
  type LimitKind,
  type MadeAward,
} from '../../../lib/data/leagueBadges';
import type { League } from '../../../lib/types';
import { SPORT_FAMILY, type SportId } from '../../../sports/types';
import { BADGE_TEXT_MAX } from '../text';
import { LIMIT_INFO, blankDraft, dayText, draftFromBadge, templateDraft, type DesignDraft, type DraftErrors, type PeriodChoice } from './design';
import type { TemplateKey } from './templates';

// ---------- Lista de diseños y estante ----------

/** «1 la tiene», «3 la tienen» o «Nadie la tiene todavía» (las filas de la lista de diseños). */
export const designHoldersText = (n: number): string => (n ? (n === 1 ? '1 la tiene' : `${n} la tienen`) : 'Nadie la tiene todavía');

/** «Única · TEMP 2026 · 3 la tienen»: la línea de abajo de una fila de la lista. */
export const designRowSub = (b: Pick<LeagueBadge, 'limitKind' | 'periodText' | 'active'>): string =>
  `${LIMIT_INFO[b.limitKind].label}${b.periodText ? ` · ${b.periodText}` : ''} · ${designHoldersText(b.active)}`;

/** «Nadie todavía», «1 la tiene», «3 la tienen» (el estante de la liga). */
export const shelfHoldersText = (n: number): string => (n === 0 ? 'Nadie todavía' : n === 1 ? '1 la tiene' : `${n} la tienen`);

/** Los diseños por estado: activos, archivados y escondidos por moderación. */
export function designGroups(designs: readonly LeagueBadge[]): { active: LeagueBadge[]; archived: LeagueBadge[]; hidden: LeagueBadge[] } {
  return {
    active: designs.filter((d) => d.status === 'activa'),
    archived: designs.filter((d) => d.status === 'archivada'),
    hidden: designs.filter((d) => d.status === 'oculta'),
  };
}

/** «Activas (4 de 30)». */
export const activeTitle = (n: number): string => `Activas (${n} de ${MAX_ACTIVE_DESIGNS})`;

/** «Archivadas (2)». */
export const archivedTitle = (n: number): string => `Archivadas (${n})`;

export const FULL_DESIGNS_TEXT = 'Llegaste a 30 insignias activas. Archiva una para crear otra.';

/** «Diseña insignias propias…» de Admin › Insignias, con el nombre de la liga. */
export const makerIntro = (leagueName: string): string =>
  `Diseña insignias propias y dáselas a quien se las ganó, con cuenta o sin ella. No cuentan para las de MatchMate y siempre dicen que son de ${leagueName}.`;

/** Al pie de Admin › Insignias: «Las diseñan y las dan: {quiénes}. {cómo se cambia}». null sin regla conocida. */
export function policyLine(league: Pick<League, 'badgeMakers'>, isOwner: boolean): { who: string; text: string } | null {
  const policy = BADGE_MAKERS_OPTIONS.find((o) => o.value === badgeMakersOf(league));
  if (!policy) return null;
  return { who: policy.who, text: isOwner ? 'Lo cambias aquí arriba, en «¿Quién diseña y da insignias?».' : 'Lo decide el dueño.' };
}

/** Las últimas que se dieron (sin retirar, sin ocultar y de un diseño que se ve), con su diseño. */
export function recentAwards(awards: readonly MadeAward[], designs: readonly LeagueBadge[], limit = 5): { award: MadeAward; design: LeagueBadge }[] {
  const byId = new Map(designs.map((d) => [d.id, d] as const));
  const out: { award: MadeAward; design: LeagueBadge }[] = [];
  for (const a of awards) {
    const d = byId.get(a.badgeId);
    if (a.revokedAt || a.hidden || !d || d.status === 'oculta') continue;
    out.push({ award: a, design: d });
    if (out.length >= limit) break;
  }
  return out;
}

/** Hay algo para «Las últimas que se dieron». */
export const hasGiven = (awards: readonly MadeAward[]) => awards.some((a) => !a.revokedAt);

/** Las del creador de un jugador: una por diseño (×N si se la dieron varias veces), la más nueva arriba. */
export function playerMadeTiles(data: LeagueBadgesData, playerId: string): { badge: LeagueBadge; period: string; count: number }[] {
  const byId = new Map(data.designs.map((d) => [d.id, d] as const));
  const tiles = new Map<string, { badge: LeagueBadge; period: string; count: number }>();
  for (const a of data.awards) {
    const d = byId.get(a.badgeId);
    if (a.playerId !== playerId || a.revokedAt || a.hidden || !d || d.status === 'oculta') continue;
    const t = tiles.get(d.id);
    if (t) t.count++;
    else tiles.set(d.id, { badge: d, period: a.period, count: 1 });
  }
  return [...tiles.values()];
}

/** En una liga con menores, las insignias de la liga las ven solo los miembros. */
export const madeHidden = (league: Pick<League, 'hasMinors'>, member: unknown): boolean => !!league.hasMinors && !member;

/**
 * ¿Sale el estante «Insignias de la liga» en la portada? Con diseños activos; sin ellos, solo para los miembros
 * elegidos que no son admins (su única puerta al creador: los admins lo tienen en Admin › Insignias). Nada mientras
 * carga la primera vez.
 */
export function shelfShown(o: { hidden: boolean; loading: boolean; designs: readonly LeagueBadge[]; can: boolean; isAdmin: boolean }): boolean {
  if (o.hidden || (o.loading && !o.designs.length)) return false;
  return o.designs.some((d) => d.status === 'activa') || (o.can && !o.isAdmin);
}

/** ¿Salen las del creador en la página del jugador? Solo si tiene alguna vigente y sin ocultar. */
export const playerMadeShown = (hidden: boolean, awards: readonly MadeAward[], playerId: string): boolean =>
  !hidden && awards.some((a) => a.playerId === playerId && !a.revokedAt && !a.hidden);

// ---------- Editor ----------

/** Qué abre el editor: una nueva (con o sin plantilla), cambiar una guardada o hacer una copia («Duplicar»). */
export type EditorMode = { kind: 'new'; template?: TemplateKey | null } | { kind: 'edit'; badge: LeagueBadge } | { kind: 'copy'; badge: LeagueBadge };

export const LIMITS: readonly LimitKind[] = ['unica', 'selecta', 'abierta'];

/** «Nueva insignia», «Cambiar la insignia» o «Copia de la insignia». */
export const editorTitle = (mode: EditorMode | null): string => (mode?.kind === 'edit' ? 'Cambiar la insignia' : mode?.kind === 'copy' ? 'Copia de la insignia' : 'Nueva insignia');

/** Una clave por lo que se abrió (el formulario arranca de cero al cambiar). */
export const editorKey = (mode: EditorMode): string => (mode.kind === 'new' ? `new-${mode.template ?? ''}` : `${mode.kind}-${mode.badge.id}`);

/** El borrador con el que arranca el editor. */
export function editorDraft(mode: EditorMode, sport: string | null | undefined, kind: string | null | undefined, choices: readonly PeriodChoice[]): DesignDraft {
  if (mode.kind === 'new') return mode.template ? templateDraft(mode.template, sport, kind) : blankDraft();
  return { ...draftFromBadge(mode.badge, choices) };
}

/**
 * Los avisos que se ven: el del nombre no sale mientras se escriben las primeras letras («C» todavía no es un error);
 * sale al intentar guardar, o si ya tiene 3 o más y algo no está bien (muy largo, un texto que no se puede usar). Lo
 * demás, al escribir. El contador de letras guía mientras tanto.
 */
export function shownErrors(errors: DraftErrors, draft: Pick<DesignDraft, 'name'>, tried: boolean): DraftErrors {
  return tried || draft.name.trim().length >= BADGE_TEXT_MAX.nameMin ? errors : { ...errors, name: undefined };
}

/** Elegir una plantilla no borra lo que ya se escribió: el nombre y la descripción propios se quedan. */
export function withTemplate(current: DesignDraft, template: DesignDraft): DesignDraft {
  return {
    ...template,
    name: current.name.trim() ? current.name : template.name,
    description: current.description.trim() ? current.description : template.description,
  };
}

const familyOf = (sport: string | null | undefined) => (sport && Object.hasOwn(SPORT_FAMILY, sport) ? SPORT_FAMILY[sport as SportId] : null);

/** «Por pareja» en raqueta; «Por equipo» en los demás. */
export const teamWord = (sport: string | null | undefined): string => (familyOf(sport) === 'racket' ? 'Por pareja' : 'Por equipo');

export const BY_TEAM_HINT = 'Se da al equipo o la pareja completa (cuenta como 1)';
export const LOCKED_TEXT = 'Esta insignia ya se dio: solo puedes cambiar la descripción. Duplícala para hacer otra versión.';
export const ADJUSTED_TEXT = 'Ajustamos el tono para que se lea bien.';

/** Lo que cambia al tocar un chip de «Periodo o texto de abajo»: «Torneo» pone «TORNEO» arriba si está vacío. */
export function periodChipPatch(c: Pick<PeriodChoice, 'mode'>, draft: Pick<DesignDraft, 'topText'>): Partial<DesignDraft> {
  return c.mode === 'torneo' && !draft.topText.trim() ? { periodMode: c.mode, periodFree: '', topText: 'TORNEO' } : { periodMode: c.mode, periodFree: '' };
}

/** «Liga de Ejemplo · TEMP 2026»: lo de abajo del nombre en la vista previa. */
export const previewSub = (leagueName: string, period: string | null | undefined): string => `${leagueName}${period ? ` · ${period}` : ''}`;

// ---------- Detalle de un diseño ----------

/** Lo que pide un motivo: quitar o deshacer (privado), reportar (para el superadmin) o esconder (moderación). */
export type Asking = { kind: 'quitar'; holder: BadgeHolder; undo: boolean } | { kind: 'reportar' } | { kind: 'esconder' };

/**
 * ¿Es deshacer lo propio (y no quitar)? Solo el dueño quita lo de otros; los demás solo deshacen lo que dieron (quien
 * no es admin no ve quién la dio: si la puede deshacer, es suya).
 */
export const undoes = (h: Pick<BadgeHolder, 'awardedBy'>, me: string | null, owner: boolean): boolean => h.awardedBy === me || !owner;

/** «Quién la tiene»: vigentes primero; las retiradas (solo admins) al final. */
export const sortHolders = (holders: readonly BadgeHolder[]): BadgeHolder[] => [...holders].sort((a, b) => Number(!!a.revokedAt) - Number(!!b.revokedAt));

/** «TEMP 2026 · Cat. A · Equipo Uno · 4 oct 2026». */
export const holderSub = (h: Pick<BadgeHolder, 'period' | 'division' | 'teamName' | 'awardedAt'>, tz?: string): string =>
  [h.period, h.division, h.teamName, dayText(h.awardedAt, tz)].filter(Boolean).join(' · ');

/** «Retirada · 4 oct 2026 · motivo». */
export const revokedLine = (h: Pick<BadgeHolder, 'revokedAt' | 'revokeReason'>, tz?: string): string =>
  `Retirada · ${dayText(h.revokedAt, tz)}${h.revokeReason ? ` · ${h.revokeReason}` : ''}`;

/** «Quién la tiene (3)»: con la lista, las vigentes; mientras llega, las del diseño. */
export function holdersHeading(awards: readonly Pick<BadgeHolder, 'revokedAt'>[] | null, active: number): string {
  if (awards) return `Quién la tiene (${awards.filter((a) => !a.revokedAt).length})`;
  return active ? `Quién la tiene (${active})` : 'Quién la tiene';
}

/** Sin cuenta: cuántos la tienen y que entre para ver quiénes. */
export const signedOutHolders = (active: number): string =>
  active ? `${active === 1 ? 'La tiene 1 jugador' : `La tienen ${active} jugadores`}. Entra a tu cuenta para ver quiénes.` : 'Todavía nadie la tiene.';

export const NOBODY_TEXT = 'Todavía nadie la tiene.';

/** «1 reporte», «3 reportes». */
export const reportsText = (n: number): string => (n === 1 ? '1 reporte' : `${n} reportes`);

export const HIDDEN_NOTE = 'El equipo de MatchMate la escondió: nadie de la liga la ve ni la puede dar. Solo la ven los admins.';

/** Los botones del detalle, en su orden. */
export type DesignAction = 'dar' | 'editar' | 'duplicar' | 'archivar' | 'borrar' | 'esconder' | 'reportar';

/**
 * Qué botones salen en el detalle: quien diseña da (activa), cambia, duplica, archiva o activa y borra (si nunca se
 * dio, ya con la lista cargada); el superadmin esconde; los miembros reportan. Un diseño escondido solo lo toca el
 * superadmin.
 */
export function designActions(o: {
  maker: boolean;
  status: DesignStatus;
  canGive: boolean;
  canEdit: boolean;
  canDuplicate: boolean;
  /** La lista de quién la tiene llegó y dice que nunca se dio. */
  neverGiven: boolean;
  isSuper: boolean;
  member: boolean;
}): DesignAction[] {
  const hidden = o.status === 'oculta';
  const out: DesignAction[] = [];
  if (o.maker && !hidden) {
    if (o.status === 'activa' && o.canGive) out.push('dar');
    if (o.canEdit) out.push('editar');
    if (o.canDuplicate) out.push('duplicar');
    out.push('archivar');
    if (o.neverGiven) out.push('borrar');
  }
  if (o.isSuper) out.push('esconder');
  if (o.member && !hidden) out.push('reportar');
  return out;
}

/** El texto de cada botón del detalle. */
export function designActionLabel(a: DesignAction, b: Pick<LeagueBadge, 'locked' | 'status'>): string {
  switch (a) {
    case 'dar':
      return 'Dar insignia';
    case 'editar':
      return b.locked ? 'Cambiar descripción' : 'Cambiar';
    case 'duplicar':
      return 'Duplicar';
    case 'archivar':
      return b.status === 'activa' ? 'Archivar' : 'Activar';
    case 'borrar':
      return 'Borrar';
    case 'esconder':
      return b.status === 'oculta' ? 'Dejar de esconder' : 'Esconder (moderación)';
    case 'reportar':
      return 'Reportar';
  }
}

/** ¿Archivar «Campeón»? (activar no pregunta). */
export const archiveConfirm = (name: string) => ({
  title: `¿Archivar “${name}”?`,
  message: 'Deja de salir para dar. Quienes ya la tienen la conservan. La puedes activar otra vez cuando quieras.',
  confirmText: 'Archivar',
});

export const archivedToast = (archived: boolean) => (archived ? 'Insignia archivada' : 'Insignia activa otra vez');

/** ¿Borrar «Campeón»? (solo una que nunca se dio). */
export const deleteConfirm = (name: string) => ({
  title: `¿Borrar “${name}”?`,
  message: 'Nunca se dio, así que se borra del todo. No se puede deshacer.',
  confirmText: 'Borrar',
  danger: true,
});

export const DELETED_TOAST = 'Insignia borrada';
export const mineHiddenToast = (wasHidden: boolean) => (wasHidden ? 'Ya sale en tu perfil' : 'Ya no sale en tu perfil');
export const revokedToast = (undo: boolean, playerName: string) => (undo ? 'Deshecho' : `Se la quitamos a ${playerName}`);
export const REPORTED_TOAST = 'Gracias: el equipo de MatchMate la va a revisar';
export const hiddenToast = (wasHidden: boolean) => (wasHidden ? 'La liga la puede activar otra vez' : 'Escondida: la liga ya no la ve ni la puede dar');

/** «Deshacer» o «Quitar» al lado de quien la tiene. */
export const holderUndoLabel = (h: Pick<BadgeHolder, 'awardedBy'>, me: string | null, owner: boolean) => (undoes(h, me, owner) ? 'Deshacer' : 'Quitar');
export const mineToggleLabel = (hidden: boolean) => (hidden ? 'Mostrar en mi perfil' : 'Ocultar de mi perfil');

/** El largo máximo del motivo (la nota de moderación llega a 200). */
export const reasonMax = (asking: Asking | null): number => (asking?.kind === 'esconder' ? 200 : BADGE_TEXT_MAX.reason);

/** Los textos de la ventana del motivo: quitar o deshacer, reportar o esconder. */
export function reasonCopy(asking: Asking | null, badge: Pick<LeagueBadge, 'name' | 'status'>): { title: string; text: string; label: string; button: string } {
  if (asking?.kind === 'quitar')
    return {
      title: asking.undo ? `¿Deshacer “${badge.name}” de ${asking.holder.playerName}?` : `¿Quitarle “${badge.name}” a ${asking.holder.playerName}?`,
      text: 'Se le quita de su perfil. No se le manda notificación.',
      label: 'Motivo (privado, opcional)',
      button: asking.undo ? 'Deshacer' : 'Quitar',
    };
  if (asking?.kind === 'reportar')
    return {
      title: `Reportar “${badge.name}”`,
      text: 'Le llega al equipo de MatchMate, que la revisa. Máximo 5 reportes por día.',
      label: '¿Qué tiene de malo? (opcional)',
      button: 'Reportar',
    };
  const hidden = badge.status === 'oculta';
  return {
    title: hidden ? `¿Dejar de esconder “${badge.name}”?` : `¿Esconder “${badge.name}”?`,
    text: hidden
      ? 'Queda archivada: la liga la puede volver a activar. Queda en la auditoría.'
      : 'Nadie de la liga la ve ni la puede dar, y sale de los perfiles. Cierra sus reportes. Queda en la auditoría.',
    label: 'Nota (opcional)',
    button: hidden ? 'Dejar de esconder' : 'Esconder',
  };
}

/** Una clave por lo que se pregunta (la ventana del motivo arranca vacía al cambiar). */
export const askingKey = (asking: Asking | null): string => (asking ? `${asking.kind}-${asking.kind === 'quitar' ? asking.holder.id : ''}` : 'cerrado');

/** Los otorgamientos que salieron de un premio del torneo (ids): «Premio del torneo» en «Quién la tiene». */
export const prizeAwardIds = (awards: readonly MadeAward[]): Set<string> => new Set(awards.filter((a) => a.prizeSlotId).map((a) => a.id));
