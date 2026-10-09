import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { MessagesSquare } from 'lucide-react';
import { useLeagueSocial, type LeagueSocial } from '../../../lib/data/leagueSocial';
import { useLeagueCtx } from '../../../lib/league';
import type { League } from '../../../lib/types';
import { LeagueFollowButton } from '../../social/LeagueFollowButton';
import { compactCount } from '../../social/socialFormat';
import { cx } from '../../ui';

/**
 * Lo social de una liga arriba de su inicio, en la barra «‹ Ligas» de LeagueShell (la misma en todos los deportes):
 * «Muro» (las publicaciones de la liga, `/l/<id>/muro`) y, para quien no es miembro, «Seguir» (sus publicaciones
 * públicas salen en su Social). En una liga con menores lo social está apagado: ni muro ni seguir (docs/red-social.md).
 */

/** El muro va en las ligas sin menores. */
export const hasWall = (league: Pick<League, 'hasMinors'>): boolean => !league.hasMinors;

/**
 * «Seguir» la liga: nunca a sus miembros; a los demás (con sesión: sin ella `league_social` no llega), si la pueden seguir
 * (pública y sin menores) o si ya la siguen (para poder dejarla).
 */
export function showLeagueFollow(social: LeagueSocial | null | undefined, member: boolean): boolean {
  return !member && !!social && !social.isMember && (social.canFollow || social.following);
}

/** «Muro» con forma de píldora, como «Invitar» (se ve de 36 px y se toca en 44). */
export function WallPill({ to, className }: { to: string; className?: string }) {
  return (
    <Link
      to={to}
      title="Las publicaciones de la liga"
      className={cx(
        "relative inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-[13px] text-sm font-semibold whitespace-nowrap text-fg transition active:scale-[0.97] after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className,
      )}
    >
      <MessagesSquare aria-hidden="true" className="size-[17px]" />
      Muro
    </Link>
  );
}

/**
 * Lo de la derecha de la barra del inicio de la liga: «Muro», «Seguir» (con cuántos la siguen, si cabe) y lo que traiga
 * LeagueShell (`invite`: «Invitar»).
 */
export function LeagueHomeActions({ invite }: { invite?: ReactNode }) {
  const { lid, league, member, base } = useLeagueCtx();
  const wall = hasWall(league);
  // Solo hace falta para quien puede seguirla: una liga pública sin menores, sin ser miembro.
  const social = useLeagueSocial(wall && !member && league.visibility === 'public' ? lid : null).data;
  const follow = showLeagueFollow(social, !!member) && social ? social : null;
  return (
    <>
      {wall && <WallPill to={`${base}/muro`} />}
      {follow && (
        <>
          {follow.followers > 0 && (
            <span className="hidden text-sm whitespace-nowrap text-muted min-[430px]:inline">
              {compactCount(follow.followers)} {follow.followers === 1 ? 'seguidor' : 'seguidores'}
            </span>
          )}
          <LeagueFollowButton leagueId={lid} following={follow.following} name={league.name} size="sm" className="rounded-full!" />
        </>
      )}
      {invite}
    </>
  );
}
