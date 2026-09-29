/**
 * «Elegir premios» sin pantalla (docs/premios-torneo.md §6.2): las secciones (una por categoría que premia la
 * competencia), lo que viene marcado, los diseños que se ofrecen en cada lugar (arriba los de plantilla del podio) y lo
 * que se manda a `set_tournament_prizes` (el conjunto completo). Funciones puras con pruebas en setup.test.ts.
 */
import type { LeagueBadge } from '../lib/data/leagueBadges';
import { MAX_PRIZE_SLOTS, PRIZE_PLACES, slotDelivered, slotKeyOf, type PrizePlace, type PrizeSlotInput, type TournamentPrize } from '../lib/data/prizes';
import { PLACE_LABEL, prizeCategories, prizeTitle, type PrizeCategoryDef, type PrizeComp } from './catalog';

/** La plantilla del creador de cada lugar del podio. */
export type PodiumTemplate = 'champion' | 'runner_up' | 'third_place';
export const PLACE_TEMPLATE: Readonly<Record<PrizePlace, PodiumTemplate>> = { 1: 'champion', 2: 'runner_up', 3: 'third_place' };
/** «Campeón», «Subcampeón», «Tercer lugar» (los nombres de las plantillas). */
export const TEMPLATE_LABEL: Readonly<Record<PodiumTemplate, string>> = { champion: 'Campeón', runner_up: 'Subcampeón', third_place: 'Tercer lugar' };

/** Un lugar de «Elegir premios»: si va y con qué diseño. */
export interface SetupRow {
  on: boolean;
  badgeId: string | null;
}

export type SetupRows = Record<string, SetupRow>;

/** Las secciones: las categorías que premia la competencia más las que ya tienen lugares guardados (en su orden). */
export function setupSections(comp: PrizeComp, prize: Pick<TournamentPrize, 'slots'> | null): PrizeCategoryDef[] {
  const out = prizeCategories(comp);
  for (const s of prize?.slots ?? []) {
    if (!out.some((d) => d.category === s.category && d.division === s.division)) {
      out.push({ category: s.category, division: s.division, label: s.label, title: s.title || prizeTitle(s, comp) });
    }
  }
  return out;
}

/** El diseño de plantilla que se usa para un lugar: activo, el de sin cinta primero (sirve para todos los torneos), el más nuevo. */
export function templateDesign(designs: readonly LeagueBadge[], key: PodiumTemplate): LeagueBadge | null {
  const list = designs.filter((d) => d.status === 'activa' && d.template === key);
  list.sort((a, b) => Number(!!a.periodText) - Number(!!b.periodText) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return list[0] ?? null;
}

/** Lo que viene marcado: lo guardado; sin premios, el 1.er lugar de cada categoría con «Campeón» (si existe). */
export function initialRows(sections: readonly PrizeCategoryDef[], prize: Pick<TournamentPrize, 'slots'> | null, designs: readonly LeagueBadge[]): SetupRows {
  const rows: SetupRows = {};
  const champion = templateDesign(designs, 'champion');
  for (const sec of sections) {
    for (const place of PRIZE_PLACES) {
      const key = slotKeyOf({ category: sec.category, division: sec.division, place });
      const saved = prize?.slots.find((s) => slotKeyOf(s) === key);
      rows[key] = saved ? { on: true, badgeId: saved.badgeId } : { on: !prize && place === 1, badgeId: !prize && place === 1 ? (champion?.id ?? null) : null };
    }
  }
  return rows;
}

/** Los diseños que se ofrecen para un lugar: activos, arriba la plantilla de ese lugar y las otras del podio. */
export function designsForPlace(designs: readonly LeagueBadge[], place: PrizePlace): LeagueBadge[] {
  const order: string[] = [PLACE_TEMPLATE[place], ...Object.values(PLACE_TEMPLATE).filter((t) => t !== PLACE_TEMPLATE[place])];
  const rank = (d: LeagueBadge) => {
    const i = d.template ? order.indexOf(d.template) : -1;
    return i === -1 ? order.length : i;
  };
  return designs.filter((d) => d.status === 'activa').sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'es'));
}

/**
 * Los lugares entregados (con ganadores hoy): no cambian de diseño ni se apagan (primero se quitan en «Entregar»). Uno
 * que se quitó entero vuelve a cambiarse, como en la base (set_tournament_prizes solo frena con insignias vigentes).
 */
export const deliveredKeys = (prize: Pick<TournamentPrize, 'slots'> | null): Set<string> =>
  new Set((prize?.slots ?? []).filter(slotDelivered).map((s) => slotKeyOf(s)));

/** Lo que falta para guardar: un lugar prendido sin insignia («Elige la insignia del 1.er lugar de Equipos (scratch).»). */
export function setupProblem(sections: readonly PrizeCategoryDef[], rows: SetupRows): string | null {
  for (const sec of sections) {
    for (const place of PRIZE_PLACES) {
      const r = rows[slotKeyOf({ category: sec.category, division: sec.division, place })];
      if (r?.on && !r.badgeId) return `Elige la insignia del ${PLACE_LABEL[place]} de ${sec.title}.`;
    }
  }
  const n = Object.values(rows).filter((r) => r.on && r.badgeId).length;
  if (n > MAX_PRIZE_SLOTS) return `Son muchos lugares: hasta ${MAX_PRIZE_SLOTS} por torneo.`;
  return null;
}

/**
 * El conjunto completo para `set_tournament_prizes`. Un lugar que ya existía manda su división de siempre (así no
 * cambia sin querer si la categoría se renombró); uno nuevo deja que la base ponga la suya.
 */
export function setupPayload(sections: readonly PrizeCategoryDef[], rows: SetupRows, prize: Pick<TournamentPrize, 'slots'> | null): PrizeSlotInput[] {
  const out: PrizeSlotInput[] = [];
  for (const sec of sections) {
    for (const place of PRIZE_PLACES) {
      const key = slotKeyOf({ category: sec.category, division: sec.division, place });
      const r = rows[key];
      if (!r?.on || !r.badgeId) continue;
      const saved = prize?.slots.find((s) => slotKeyOf(s) === key);
      out.push({ category: sec.category, division: sec.division, place, badgeId: r.badgeId, ...(saved ? { label: saved.label } : {}) });
    }
  }
  return out;
}

/** «Usar Campeón, Subcampeón y Tercer lugar»: los tres lugares de cada sección con esos diseños (lo entregado no se toca). */
export function withPodiumTemplates(
  sections: readonly PrizeCategoryDef[],
  rows: SetupRows,
  ids: Readonly<Record<PodiumTemplate, string>>,
  delivered: ReadonlySet<string> = new Set(),
): SetupRows {
  const next = { ...rows };
  for (const sec of sections) {
    for (const place of PRIZE_PLACES) {
      const key = slotKeyOf({ category: sec.category, division: sec.division, place });
      if (delivered.has(key)) continue;
      next[key] = { on: true, badgeId: ids[PLACE_TEMPLATE[place]] };
    }
  }
  return next;
}
