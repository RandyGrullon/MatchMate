import { createPost, type Post, type PostVisibility, type SharedGame } from '../../lib/data/posts';
import type { CompressedImage } from '../../lib/image';
import type { ComposerTarget } from './postFormat';

/**
 * Lo que hace «Publicar» en la hoja para publicar (Composer.tsx), sin React ni navegador: así lo usa también la app del
 * teléfono (movil/src/components/social/Composer.tsx) con los mismos lugares del borrador y el mismo error de un juego
 * que ya no se puede compartir.
 */

/** El equipo donde se publica (su muro: siempre para todos, sale a quien sigue el equipo). */
export interface ComposerSquad {
  id: string;
  name: string;
}

/** El lugar del borrador: el juego que se comparte (`juego:<tipo>:<id>`), el equipo (`equipo:<id>`), la liga o el feed. */
export const draftPlace = (league: { id: string } | null | undefined, squad: { id: string } | null | undefined, game?: SharedGame | null) =>
  game ? `juego:${game.kind}:${game.id}` : squad ? `equipo:${squad.id}` : league?.id;

/** Al compartir un juego que ya no se puede (se borró, ya no lo ves o cambió): lo que dice la hoja. */
export const GAME_GONE = 'Ese juego ya no se puede compartir.';

/** El error de la base dice que el juego que se comparte ya no se puede (no existe, inválido o no se encontró). */
export function isGameGone(e: unknown): boolean {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  const kind = e && typeof e === 'object' ? (e as { kind?: unknown }).kind : undefined;
  return code === 'no_existe' || code === 'invalido' || kind === 'not_found';
}

/**
 * Lo que hace «Publicar»: en el muro de un equipo, siempre para todos; si no, en la liga elegida (o la del juego) o en
 * el perfil, con el juego que se comparte si lleva.
 */
export function sendComposer(o: {
  text: string;
  photo: CompressedImage | null;
  squad: ComposerSquad | null;
  target: ComposerTarget | null;
  audience: PostVisibility;
  game?: SharedGame | null;
}): Promise<Post> {
  if (o.squad) return createPost({ text: o.text, photo: o.photo, squadId: o.squad.id, leagueId: null, visibility: 'public' });
  return createPost({ text: o.text, photo: o.photo, leagueId: o.target?.id ?? null, visibility: o.audience, ...(o.game ? { game: o.game } : {}) });
}
