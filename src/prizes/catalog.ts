/**
 * Qué premia cada competencia (docs/premios-torneo.md §5), sin pantalla: las categorías que admite (la gemela de
 * private.prize_allowed), el título de cada lugar (la gemela de private.prize_slot_title), los nombres de los lugares
 * y la cinta por defecto. Cada deporte arma su `PrizeComp` (el boliche con `bowlingComp`) y todo lo demás es común.
 */
import { MONTH_ABBR } from '../badges/visual/period';
import { cleanBadgeText, badgeTextProblem } from '../components/badges/text';
import type { PrizeCategory, PrizeKind, PrizePlace, PrizeScope } from '../lib/data/prizes';
import { PRIZE_LABEL_MAX } from '../lib/data/prizes';
import { individualRule, teamRule } from '../lib/stats';
import type { BowlingEvent, RankBy } from '../lib/types';

/** Las reglas del torneo del boliche que deciden los títulos y el orden. */
export interface BowlingPrizeRules {
  type: string;
  hcpPercent: number;
  individualRankBy?: RankBy | null;
  teamRankBy?: RankBy | null;
  /** El evento tiene equipos (o jugadores por equipo): se premia también a los equipos. */
  hasTeams: boolean;
}

/** El torneo de raqueta por categorías: si se juega en dobles (parejas) y sus categorías. */
export interface RacketPrizeRules {
  doubles: boolean;
  categories: readonly { id: string; name: string }[];
}

/** Una competencia que admite premios, como la ve la pantalla. */
export interface PrizeComp {
  lid: string;
  scope: PrizeScope;
  /** El evento, el torneo de golf o el playoff. */
  refId: string;
  kind: PrizeKind;
  /** El deporte de la liga (colores de las insignias y plantillas). */
  sport: string;
  /** Para mostrar: «Torneo Aniversario». */
  name: string;
  /** Día de la competencia ('YYYY-MM-DD'): la cinta por defecto es su mes. */
  date: string | null;
  bowling?: BowlingPrizeRules;
  racket?: RacketPrizeRules;
}

/** Una categoría premiada de una competencia: una sección de «Elegir premios». */
export interface PrizeCategoryDef {
  category: PrizeCategory;
  division: string;
  /** Lo que se copia a la insignia («Categoría A», «Gross»); '' general. */
  label: string;
  /** «Equipos (scratch)», «Parejas · Categoría A»… */
  title: string;
}

/** «1.er lugar», «2.º lugar», «3.er lugar» (private.prize_place_label). */
export const PLACE_LABEL: Readonly<Record<PrizePlace, string>> = { 1: '1.er lugar', 2: '2.º lugar', 3: '3.er lugar' };

// ---------- Boliche ----------

/** «scratch» o «handicap» (la pantalla del boliche escribe «handicap» sin tilde en todas partes). */
export const rankWord = (rule: RankBy): string => (rule === 'hcp' ? 'handicap' : 'scratch');

/** «Equipos (scratch)» o «Individual (handicap)», con la regla EFECTIVA. */
export const bowlingTitle = (category: 'equipo' | 'individual', rule: RankBy): string =>
  `${category === 'equipo' ? 'Equipos' : 'Individual'} (${rankWord(rule)})`;

/**
 * La regla del boliche en palabras, con los valores elegidos (el formulario del torneo y «Elegir premios»): «Los premios
 * siguen esta regla: Equipos por scratch, Individual con handicap.» y, con 0 % de handicap, lo que queda por scratch.
 */
export function bowlingRuleText(r: { individualRankBy?: RankBy | null; teamRankBy?: RankBy | null; hcpPercent: number }): { rule: string; note: string | null } {
  const ind = r.individualRankBy ?? 'hcp';
  const team = r.teamRankBy ?? 'scratch';
  const how = (x: RankBy) => (x === 'hcp' ? 'con handicap' : 'por scratch');
  let note: string | null = null;
  if (!(r.hcpPercent > 0)) {
    if (ind === 'hcp' && team === 'hcp') note = 'Con 0 % de handicap, todo queda por scratch.';
    else if (ind === 'hcp') note = 'Con 0 % de handicap, el individual queda por scratch.';
    else if (team === 'hcp') note = 'Con 0 % de handicap, los equipos quedan por scratch.';
  }
  return { rule: `Los premios siguen esta regla: Equipos ${how(team)}, Individual ${how(ind)}.`, note };
}

/** Las reglas de premios de un evento del boliche. */
export function bowlingRules(event: Pick<BowlingEvent, 'type' | 'hcpPercent' | 'individualRankBy' | 'teamRankBy' | 'teams' | 'teamSize'>): BowlingPrizeRules {
  return {
    type: event.type,
    hcpPercent: event.hcpPercent,
    individualRankBy: event.individualRankBy ?? null,
    teamRankBy: event.teamRankBy ?? null,
    hasTeams: (event.teamSize ?? 0) > 0 || Object.keys(event.teams ?? {}).length > 0,
  };
}

/** «Torneo del 12 oct»: el nombre de una competencia sin nombre, como private.prize_comp_name (sin el año). */
export function unnamedComp(word: string, date: string | null | undefined): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(date ?? '');
  const month = m ? Number(m[1]) : 0;
  return m && month >= 1 && month <= 12 ? `${word} del ${Number(m[2])} ${MONTH_ABBR[month - 1].toLowerCase()}` : word;
}

/** Un torneo del boliche como competencia con premios (scope 'evento'). */
export function bowlingComp(lid: string, event: BowlingEvent, name?: string): PrizeComp {
  return {
    lid,
    scope: 'evento',
    refId: event.id,
    kind: 'bowling',
    sport: 'bowling',
    name: name?.trim() || event.name.trim() || unnamedComp('Torneo', event.date),
    date: event.date,
    bowling: bowlingRules(event),
  };
}

const ruleEvent = (b: BowlingPrizeRules) => ({
  type: b.type as BowlingEvent['type'],
  hcpPercent: b.hcpPercent,
  individualRankBy: b.individualRankBy ?? undefined,
  teamRankBy: b.teamRankBy ?? undefined,
});

// ---------- Todas ----------

/**
 * La división que la base copia a la insignia si no se manda una (private.prize_default_label): el nombre de la
 * categoría del torneo de raqueta (≤ 16; si no se puede usar, «Cat. <id>»), «Femenino»/«Masculino», «Gross»/«Neto».
 */
export function defaultLabel(comp: Pick<PrizeComp, 'kind' | 'racket'>, division: string): string {
  if (comp.kind === 'racket_tourney') {
    const name = comp.racket?.categories.find((c) => c.id === division)?.name;
    const v = cleanBadgeText([...cleanBadgeText(name)].slice(0, PRIZE_LABEL_MAX).join(''));
    return v && !badgeTextProblem(v) ? v : [...`Cat. ${division}`].slice(0, PRIZE_LABEL_MAX).join('');
  }
  if (comp.kind === 'swim') return division === 'F' ? 'Femenino' : division === 'M' ? 'Masculino' : '';
  if (comp.kind === 'golf') return division === 'gross' ? 'Gross' : division === 'neto' ? 'Neto' : '';
  return '';
}

/** El título de un lugar (o de una categoría): lo mismo que private.prize_slot_title. */
export function prizeTitle(slot: { category: PrizeCategory; division: string; label?: string | null }, comp: Pick<PrizeComp, 'kind' | 'bowling' | 'racket'>): string {
  switch (comp.kind) {
    case 'bowling': {
      const b = comp.bowling ?? { type: 'torneo', hcpPercent: 0, hasTeams: false };
      const ev = ruleEvent(b);
      return slot.category === 'equipo' ? bowlingTitle('equipo', teamRule(ev)) : bowlingTitle('individual', individualRule(ev));
    }
    case 'racket_tourney':
      return `${slot.category === 'pareja' ? 'Parejas' : 'Individual'} · ${slot.label || defaultLabel(comp, slot.division) || `Cat. ${slot.division}`}`;
    case 'racket_night':
      return 'Individual';
    case 'team_ko':
    case 'playoff':
      return 'Equipos';
    case 'golf':
      return slot.division === 'gross' ? 'Individual · Gross' : slot.division === 'neto' ? 'Individual · Neto' : 'Individual';
    case 'swim':
      if (slot.category === 'equipo') return 'Clubes';
      return slot.division === 'F' ? 'Individual · Femenino' : slot.division === 'M' ? 'Individual · Masculino' : 'Individual';
  }
}

const RACKET_DIVISION = /^[A-Za-z0-9]{1,6}$/;

/**
 * Las categorías que premia una competencia (la gemela de private.prize_allowed, en el orden de la base: equipos,
 * parejas, individual). Boliche: equipos (si hay equipos) e individual. Raqueta, torneo: una por categoría, pareja en
 * dobles e individual si no. Noches: individual. Relámpago y playoffs: equipos. Golf: individual (la competencia de la
 * ronda), gross y neto. Natación: clubes e individual (general, femenino y masculino).
 */
export function prizeCategories(comp: Pick<PrizeComp, 'kind' | 'bowling' | 'racket'>): PrizeCategoryDef[] {
  const def = (category: PrizeCategory, division = ''): PrizeCategoryDef => {
    const label = defaultLabel(comp, division);
    return { category, division, label, title: prizeTitle({ category, division, label }, comp) };
  };
  switch (comp.kind) {
    case 'bowling':
      return [...(comp.bowling?.hasTeams ? [def('equipo')] : []), def('individual')];
    case 'racket_tourney': {
      const seen = new Set<string>();
      const cat: PrizeCategory = comp.racket?.doubles ? 'pareja' : 'individual';
      return (comp.racket?.categories ?? [])
        .filter((c) => RACKET_DIVISION.test(c.id) && !seen.has(c.id) && !!seen.add(c.id))
        .map((c) => def(cat, c.id));
    }
    case 'racket_night':
      return [def('individual')];
    case 'team_ko':
    case 'playoff':
      return [def('equipo')];
    case 'golf':
      return [def('individual'), def('individual', 'gross'), def('individual', 'neto')];
    case 'swim':
      return [def('equipo'), def('individual'), def('individual', 'F'), def('individual', 'M')];
  }
}

/** La cinta por defecto: el mes de la competencia en mayúsculas («OCT 2026»), como private.prize_default_period. */
export function defaultPeriod(date: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '');
  const month = m ? Number(m[2]) : 0;
  return m && month >= 1 && month <= 12 ? `${MONTH_ABBR[month - 1]} ${m[1]}` : '';
}

/** «Campeón · OCT 2026 · Categoría A»: cómo se lee la insignia que se entrega. */
export const prizeBadgeText = (name: string, period: string, label?: string | null): string =>
  [name, period.trim(), (label ?? '').trim()].filter(Boolean).join(' · ');
