import type { LeagueHit } from '../../lib/data/leagueSocial';
import type { PublicLeague } from '../../lib/data/leagues';
import { leagueSport, sportMeta } from '../../sports/registry';

/** Textos de las filas de la lupa (/buscar), sin React: los usan SearchRows.tsx y la app del teléfono. */

/** Lo que la fila necesita de una liga: lo de search_leagues y followed_leagues, o una pública del listado (sin cuenta). */
export type LeagueResult = Pick<LeagueHit, 'id' | 'name' | 'sport' | 'kind' | 'visibility' | 'venue' | 'logo' | 'members' | 'isMember' | 'isFollowing'>;

/** Una liga del listado público (sin cuenta: ni es miembro ni la sigue). */
export const fromPublicLeague = (l: PublicLeague): LeagueResult => ({
  id: l.id,
  name: l.name,
  sport: leagueSport(l),
  kind: l.kind === 'torneo' ? 'torneo' : 'liga',
  visibility: 'public',
  venue: l.venue?.trim() || null,
  logo: l.logoPath ?? null,
  members: l.members,
  isMember: false,
  isFollowing: false,
});

const membersLabel = (n: number) => (n > 0 ? `${n} ${n === 1 ? 'miembro' : 'miembros'}` : null);

/** «Liga · Pádel · Club Naco · 12 miembros» (lo que falta no sale). */
export function leagueResultLine(l: LeagueResult): string {
  return [l.kind === 'torneo' ? 'Torneo' : 'Liga', sportMeta(l.sport)?.short, l.venue?.trim(), membersLabel(l.members)].filter(Boolean).join(' · ');
}
