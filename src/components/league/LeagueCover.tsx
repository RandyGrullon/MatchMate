import { useState } from 'react';
import { CircleHelp, Globe, Lock, MapPin, Share2, Trophy, Users } from 'lucide-react';
import { usePlayers } from '../../lib/data/players';
import { useLeagueCtx } from '../../lib/league';
import { sportMeta } from '../../sports/registry';
import { InviteSheet } from '../invite/InviteSheet';
import { canInviteTo } from '../invite/logic';
import { SportSplash } from '../splash/SportSplash';
import { Button } from '../ui';
import { countLabel, peopleWord } from './logic';

/**
 * Portada de la liga (arriba en su inicio): la escena y el color del deporte, el nombre, el lugar y cuántos son, y
 * «Invitar», que abre la hoja de invitar (personas de la app y el link: el admin manda el de invitación; en una
 * liga pública, cualquier miembro manda el de la liga). Así una liga de pádel y una de fútbol no se ven iguales.
 */
export function LeagueCover() {
  const { lid, league, member, isAdmin } = useLeagueCtx();
  const players = usePlayers(lid);
  const [inviting, setInviting] = useState(false);
  const meta = sportMeta(league.sport);
  const Icon = meta?.icon ?? CircleHelp;
  const torneo = league.kind === 'torneo';
  const isPublic = league.visibility === 'public';
  const canInvite = canInviteTo(league, isAdmin, !!member);
  const count = players.data.length;

  return (
    <section
      className="animate-fade-up relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-accent-soft via-accent-soft/60 to-surface"
      aria-label={`Portada de ${league.name}`}
      data-tour="portada"
    >
      <div className="flex items-center gap-2 py-3 pr-2 pl-4 sm:py-4 sm:pl-5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-accent">
            <Icon className="size-3.5" aria-hidden="true" />
            {meta?.label ?? 'Otro deporte'}
            <span className="text-muted" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-muted">
              {torneo ? <Trophy className="size-3" /> : isPublic ? <Globe className="size-3" /> : <Lock className="size-3" />}
              {torneo ? 'Torneo' : isPublic ? 'Liga pública' : 'Liga privada'}
            </span>
          </p>
          <h1 className="truncate text-lg leading-tight font-extrabold tracking-tight sm:text-xl">{league.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {league.venue && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{league.venue}</span>
              </span>
            )}
            {!players.loading && count > 0 && (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users className="size-3.5" />
                {countLabel(count, peopleWord(league.sport))}
              </span>
            )}
          </p>
          {canInvite && (
            <div className="mt-1.5">
              <Button size="sm" className="h-11" icon={<Share2 className="size-4" />} onClick={() => setInviting(true)} aria-haspopup="dialog">
                Invitar
              </Button>
            </div>
          )}
        </div>
        {meta && (
          // El ancho va por --sp-w (sin `width`): más chica en el teléfono para que quepa el nombre.
          <SportSplash scene={meta.scene} word={false} className="pointer-events-none -my-1 shrink-0 [--sp-w:104px] sm:[--sp-w:136px]" />
        )}
      </div>
      <InviteSheet league={league} lid={lid} isAdmin={isAdmin} member={!!member} open={inviting} onClose={() => setInviting(false)} />
    </section>
  );
}
