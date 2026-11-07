/**
 * «Compartir» una insignia (docs/insignias.md §4.9) sin pantalla: la tarjeta de la imagen (badgeShare), su marco (el
 * deporte, su color y la fecha), el nombre del archivo y el texto con el link. Salió de BadgeSheet.tsx y UnlockModal.tsx
 * de la web para que la app del teléfono arme la misma imagen (allá se pinta con canvas; en la app, la hoja de la imagen
 * la pasa de SVG a PNG). Funciones puras, con pruebas en share.test.ts.
 */
import type { BadgeStat } from '../../lib/data/badges';
import { badgeShare } from '../share/badge';
import { shareFileName } from '../share/actions';
import { shareCaption, type CardFrame, type ShareCard } from '../share/cards';
import { shareFrame } from '../share/frame';
import { leagueShareInputOf, shareInputOf, statFor, type UnlockItem } from './logic';
import type { SheetSubject } from './sheet';

/** Lo que abre la hoja de la imagen. */
export interface BadgeSharing {
  card: ShareCard;
  frame: CardFrame;
  /** El link que va con la imagen. */
  url?: string;
  filename: string;
  /** El texto que va con la imagen (con el link). */
  caption: string;
}

function sharing(card: ShareCard, sport: string | null, url: string | undefined, fileParts: readonly string[], now: Date): BadgeSharing {
  return { card, frame: shareFrame(sport, url, undefined, now), url, filename: shareFileName(['insignia', ...fileParts], now), caption: shareCaption(card, url) };
}

/**
 * «Compartir» en el detalle de una insignia (BadgeSheet): la ganada (con su rareza; «Liga … premió a …» si la comparte
 * un admin para anunciarla) o la que dio la liga. null si lo abierto no se comparte (una bloqueada).
 */
export function sheetSharing(
  subject: SheetSubject | null,
  o: {
    /** Quién la ganó (sale en la tarjeta). */
    playerName: string;
    stats?: readonly BadgeStat[];
    /** El link que va con la imagen. */
    url?: string;
    /** Tu vitrina. */
    own?: boolean;
    /** Puede compartir sin las acciones del dueño (su propio jugador en la liga). */
    mayShare?: boolean;
    /** Un admin de la liga la comparte para anunciarla. */
    announce?: boolean;
    now?: Date;
  },
): BadgeSharing | null {
  const now = o.now ?? new Date();
  if (subject?.kind === 'award') {
    const v = subject.tile.top;
    const card = badgeShare(shareInputOf(v, o.playerName, statFor(o.stats ?? [], v.award), !!o.announce && !o.own && !o.mayShare));
    return sharing(card, v.award.sport === 'all' ? null : v.award.sport, o.url, [v.name, o.playerName], now);
  }
  if (subject?.kind === 'league') {
    const v = subject.tile.top;
    return sharing(badgeShare(leagueShareInputOf(v, o.playerName)), v.award.sport, o.url, [v.name, o.playerName], now);
  }
  return null;
}

/** El link de «Compartir» en el aviso al ganar: tu perfil (o, sin cuenta, la pantalla en la que se está). */
export const unlockShareLink = (origin: string | null | undefined, uid: string | null | undefined, here?: string): string | undefined =>
  uid && origin ? `${origin}/u/${uid}` : here;

/** «Compartir» en el aviso al ganar (UnlockModal): la insignia que se ve, con tu nombre. */
export function unlockSharing(item: UnlockItem, o: { name: string; url?: string; now?: Date }): BadgeSharing {
  const now = o.now ?? new Date();
  const input = item.kind === 'app' ? shareInputOf(item.view, o.name) : leagueShareInputOf(item.view, o.name);
  const sport = item.kind === 'app' ? (item.view.award.sport === 'all' ? null : item.view.award.sport) : item.view.award.sport;
  return sharing(badgeShare(input), sport, o.url, [input.name, o.name], now);
}
