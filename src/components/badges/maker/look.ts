/**
 * Cómo se ve un diseño del creador (docs/insignias.md §4.2 y §5.4): su forma, su metal o su color («Color de la liga»
 * es el del deporte; «Otro color», el que eligió la liga, ajustado para que se lea), su ícono, el texto de arriba y la
 * cinta, con la pestaña «LIGA» y sin puntos de nivel. Liviano (sin el catálogo): lo usan el editor, la liga y el perfil
 * (`leagueLookOf` de ../logic.ts).
 */
import { MONTH_ABBR, SHAPE_ORDER, TIER_ORDER, badgePaletteFrom, makeLook, periodRibbon, type BadgeLook, type BadgeShape, type BadgeTier, type PeriodRibbon } from '../../../badges/visual';
import type { LeagueBadgeDesign } from '../../../lib/data/badges';
import { isSportId } from '../../../sports/registry';
import { sportColor } from '../../share/palette';

type DesignLookInput = Pick<LeagueBadgeDesign, 'shape' | 'palette' | 'color' | 'icon' | 'topText' | 'periodText'>;

const isMetal = (p: string): p is BadgeTier => (TIER_ORDER as readonly string[]).includes(p);

/** El color propio del diseño (null si es un metal): el elegido, o el del deporte con «Color de la liga». */
export function designColor(d: Pick<LeagueBadgeDesign, 'palette' | 'color'>, sport: string | null | undefined): string | null {
  if (isMetal(d.palette)) return null;
  if (d.palette === 'color' && d.color) return d.color;
  return sportColor(sport);
}

/** Hubo que cambiar el tono del color para que se lea: el editor dice «Ajustamos el tono para que se lea bien». */
export function colorAdjusted(d: Pick<LeagueBadgeDesign, 'palette' | 'color'>, sport: string | null | undefined): boolean {
  const c = designColor(d, sport);
  return c ? (badgePaletteFrom(c)?.adjusted ?? false) : false;
}

/**
 * La cinta de un texto del creador (§4.5): los periodos que ofrece el editor tienen su forma corta de las oficiales
 * («OCT 2026» → «OCT 26», «TEMP 2026» → «T 2026», «TEMP 26/27» → «T 26/27»); un texto libre usa la larga si cabe en
 * 7 y si no va sin texto a 64 px.
 */
export function ribbonOfText(text: string): PeriodRibbon | null {
  const t = text.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!t) return null;
  const month = /^([A-Z]{3}) (\d{4})$/.exec(t);
  const mi = month ? MONTH_ABBR.indexOf(month[1] as (typeof MONTH_ABBR)[number]) : -1;
  if (month && mi >= 0) {
    const r = periodRibbon({ kind: 'month', year: Number(month[2]), month: mi + 1 });
    return { long: r.long, short: r.short };
  }
  const season = /^TEMP (\d{4}|\d{2}\/\d{2})$/.exec(t);
  if (season) return { long: t, short: `T ${season[1]}` };
  const r = periodRibbon({ kind: 'custom', text: t });
  return { long: r.long, short: r.short };
}

/**
 * El dibujo de un diseño. `period`: el periodo del otorgamiento (con el que se dio: «TEMP 2027»); sin él, el texto
 * de abajo del diseño.
 */
export function designLook(d: DesignLookInput, sport: string | null | undefined, period?: string | null): BadgeLook {
  const custom = designColor(d, sport);
  const tier: BadgeLook['tier'] = isMetal(d.palette) ? d.palette : { custom: custom ?? sportColor(sport) };
  const ribbon = ribbonOfText(period ?? d.periodText);
  return makeLook({
    shape: (SHAPE_ORDER as readonly string[]).includes(d.shape) ? (d.shape as BadgeShape) : 'hex',
    tier,
    sport: isSportId(sport) ? sport : null,
    icon: d.icon,
    period: ribbon,
    top: d.topText.trim() || undefined,
    pips: 0,
    origin: 'liga',
  });
}
