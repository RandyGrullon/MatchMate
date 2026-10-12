import { UserRound } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { usePlayers } from '../../lib/data/players';
import { useLeagueCtx } from '../../lib/league';
import { Card, ListRow, RowIcon, cx } from '../ui';

/** A dónde lleva el perfil completo de un jugador de la liga: el tuyo a Yo, el de otro a su perfil; null sin cuenta o menor. */
export function playerAccountPath(player: { uid?: string | null; isMinor?: boolean } | null | undefined, me: string | null | undefined): string | null {
  if (!player?.uid || player.isMinor) return null;
  return player.uid === me ? '/perfil' : `/u/${encodeURIComponent(player.uid)}`;
}

/**
 * Debajo de la página de un jugador en cualquier liga (`/l/:lid/j/:playerId`, LeagueShell): «Ver su perfil» (o «Ver mi
 * perfil completo») lleva a su perfil de la app, donde salen todas sus ligas, equipos y publicaciones. Solo si el
 * jugador tiene cuenta y no es menor; en una liga con menores, solo para sus miembros.
 */
export function PlayerAccountLink({ playerId, className }: { playerId: string; className?: string }) {
  const { lid, league, member } = useLeagueCtx();
  const me = useAuth().user?.uid ?? null;
  const hide = !!league.hasMinors && !member;
  const players = usePlayers(hide ? undefined : lid);
  const player = players.data.find((p) => p.id === playerId);
  const to = hide ? null : playerAccountPath(player, me);
  if (!to) return null;
  const mine = to === '/perfil';
  return (
    <Card className={cx('mt-[26px] overflow-hidden', className)}>
      <ListRow
        to={to}
        leading={
          <RowIcon tone="accent">
            <UserRound className="size-5" />
          </RowIcon>
        }
        title={mine ? 'Ver mi perfil completo' : 'Ver su perfil'}
        subtitle={mine ? 'Todas tus ligas, equipos y publicaciones' : `Todo lo de ${player?.name.trim().split(/\s+/)[0] || 'este jugador'}: ligas, equipos y publicaciones`}
      />
    </Card>
  );
}
