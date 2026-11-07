import { useMemo } from 'react';
import { useAuth } from '../../lib/auth';
import { useLeaguesByIds } from '../../lib/data/leagues';
import { useMyMemberships } from '../../lib/data/members';
import { sharedGameOf, type SharedGame } from '../../lib/data/posts';
import type { ProfileGame } from '../../lib/data/profileGames';
import type { League } from '../../lib/types';
import { leagueSport } from '../../sports/registry';
import type { ComposerTarget } from './postFormat';
import { gamePostText } from './shareGame';

/**
 * «Compartir en Social» en la tarjeta de un juego del perfil o del inicio (ShareToSocial.tsx en la web y
 * movil/src/components/social/GameCard.tsx en el teléfono), sin pantallas: si quien mira lo puede publicar, dónde va y
 * el texto que se sugiere.
 */

export interface GameShare {
  /** La liga del juego (null: un juego suelto, va al perfil). */
  league: ComposerTarget | null;
  game: SharedGame;
  text: string;
}

/**
 * Si quien mira (`uid`) puede compartir ese juego: uno suelto, solo su dueño (va al perfil); uno de liga, si es
 * miembro de esa liga (`memberOf`) y no tiene menores (va a la liga; `leagues`: las suyas que ya llegaron). null si no.
 */
export function gameShareOf(
  game: ProfileGame,
  uid: string | null | undefined,
  memberOf: readonly string[],
  leagues: readonly Pick<League, 'id' | 'name' | 'sport' | 'visibility' | 'hasMinors'>[],
): GameShare | null {
  if (!uid) return null;
  const mine = game.userId === uid;
  if (game.kind === 'solo') return mine ? { league: null, game: sharedGameOf(game), text: gamePostText(game, true) } : null;
  if (!game.leagueId || !memberOf.includes(game.leagueId)) return null;
  const l = leagues.find((x) => x.id === game.leagueId);
  if (!l || l.hasMinors) return null;
  return {
    league: { id: l.id, name: l.name, sport: leagueSport(l), visibility: l.visibility },
    game: sharedGameOf(game),
    text: gamePostText(game, mine),
  };
}

/** `gameShareOf` con la cuenta, sus ligas y esas ligas (las mismas consultas en la web y en el teléfono). */
export function useGameShare(game: ProfileGame): GameShare | null {
  const uid = useAuth().user?.uid ?? null;
  const solo = game.kind === 'solo';
  const memberships = useMyMemberships(!solo && uid ? uid : undefined);
  const ids = useMemo(() => memberships.data.map((m) => m.leagueId), [memberships.data]);
  const leagues = useLeaguesByIds(ids);
  return useMemo(() => gameShareOf(game, uid, ids, leagues.data), [game, uid, ids, leagues.data]);
}
