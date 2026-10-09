import type { ReactNode } from 'react';
import type { LeagueHit } from '../../lib/data/leagueSocial';
import type { PublicLeague } from '../../lib/data/leagues';
import type { PersonHit } from '../../lib/data/people';
import { leagueSport, sportMeta } from '../../sports/registry';
import { Avatar } from '../Avatar';
import { LeagueTile } from '../ligas/LigasRows';
import { FollowButton } from '../social/FollowButton';
import { LeagueFollowButton } from '../social/LeagueFollowButton';
import { atUsername } from '../social/socialFormat';
import { userPath } from '../social/UserLink';
import { Badge, Card, ListRow } from '../ui';

/**
 * Las filas de la lupa (/buscar): una persona con cuenta (su foto o iniciales, nombre, «@usuario · Te sigue» y Seguir)
 * y una liga (su logo o el ícono del deporte en su color, nombre, «Liga · Pádel · Club Naco · 12 miembros» y «Tu liga»
 * o Seguir). Toda la fila abre el perfil o la liga.
 */

/** Un vacío corto dentro de una tarjeta: el ícono, qué pasa y una línea. */
export function Quiet({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-5 py-8 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent [&>svg]:size-7">
        {icon}
      </span>
      <h2 className="mt-4 text-section">{title}</h2>
      {children && <p className="mt-1.5 max-w-sm text-meta text-muted">{children}</p>}
    </Card>
  );
}

/** Una persona: foto (o iniciales), nombre, «@usuario · Te sigue» (toda la fila abre su perfil) y Seguir al lado. */
export function PersonRow({ hit }: { hit: PersonHit }) {
  const name = hit.name || 'Jugador';
  const handle = atUsername(hit.username);
  return (
    <ListRow
      to={userPath(hit.id)}
      leading={<Avatar name={name} photo={hit.avatar} className="size-10 text-sm" />}
      title={name}
      subtitle={[handle, hit.followsYou && 'Te sigue'].filter(Boolean).join(' · ') || undefined}
      trailing={<FollowButton userId={hit.id} name={hit.name} following={hit.isFollowing} followsYou={hit.followsYou} size="sm" className="rounded-full!" />}
    />
  );
}

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

/**
 * Una liga: su cuadro (logo, o el ícono del deporte en su color), el nombre y su línea; a la derecha «Tu liga» si es
 * miembro o, si es pública, Seguir / Siguiendo (sus publicaciones salen en Social). Toda la fila abre la liga.
 */
export function LeagueResultRow({ league: l }: { league: LeagueResult }) {
  const trailing = l.isMember ? (
    <Badge tone="accent">{l.kind === 'torneo' ? 'Tu torneo' : 'Tu liga'}</Badge>
  ) : l.visibility === 'public' ? (
    <LeagueFollowButton leagueId={l.id} name={l.name} following={l.isFollowing} size="sm" className="rounded-full!" />
  ) : null;
  return (
    <ListRow
      to={`/l/${l.id}`}
      leading={<LeagueTile league={{ id: l.id, sport: l.sport, kind: l.kind, logoPath: l.logo }} dense />}
      title={l.name}
      subtitle={leagueResultLine(l) || undefined}
      trailing={trailing}
    />
  );
}
