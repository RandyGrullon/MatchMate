import { sportMeta } from '../../sports/registry';
import { shareFileName } from './actions';
import { shareCaption, type CardFrame, type ShareCard } from './cards';
import { sportColor } from './palette';

/**
 * Lo que va alrededor de la imagen para compartir (ShareButton.tsx y ShareImageModal.tsx en la web, y la hoja de la app
 * del teléfono), sin React ni navegador: el deporte, su color y la fecha de la imagen, el nombre del archivo y el texto
 * que va con ella (con el link).
 */

/** «27 sep 2026» en la zona de la liga. */
export function shareDate(date: Date, tz?: string): string {
  try {
    return new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'short', year: 'numeric', ...(tz ? { timeZone: tz } : {}) })
      .format(date)
      .replace(/\./g, '')
      .replace(/\bde\b\s*/g, '');
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Deporte, color y fecha de la imagen (de la liga en la que se está, o del deporte que se pase). */
export function shareFrame(sport: string | null | undefined, link: string | undefined, tz?: string, now: Date = new Date()): CardFrame {
  const meta = sportMeta(sport);
  return { sportLabel: meta?.short ?? 'MatchMate', color: sportColor(sport), date: shareDate(now, tz), link };
}

/** El nombre del archivo según lo que es: «resultado-…», «insignia-…» o «tabla-…». */
export function shareImageName(card: Pick<ShareCard, 'kind' | 'title' | 'subtitle'>, now: Date = new Date()): string {
  const kind = card.kind === 'result' ? 'resultado' : card.kind === 'badge' ? 'insignia' : 'tabla';
  return shareFileName([kind, card.title, card.subtitle], now);
}

/** Todo lo de la imagen de una tarjeta: el marco, el nombre del archivo y el texto con el link. */
export function shareImageOf(
  card: ShareCard,
  o: { sport: string | null | undefined; url?: string; tz?: string; now?: Date },
): { frame: CardFrame; filename: string; caption: string } {
  const now = o.now ?? new Date();
  return { frame: shareFrame(o.sport, o.url, o.tz, now), filename: shareImageName(card, now), caption: shareCaption(card, o.url) };
}
