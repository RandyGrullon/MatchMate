import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CircleHelp, Globe, Lock, MapPin, Share2, Trophy, Users } from 'lucide-react';
import { getInviteCode } from '../../lib/data/leagues';
import { usePlayers } from '../../lib/data/players';
import { useLeagueCtx } from '../../lib/league';
import { sportMeta } from '../../sports/registry';
import { useFeedback } from '../feedback';
import { inviteUrl } from '../InviteCard';
import { shareLink } from '../share';
import { SportSplash } from '../splash/SportSplash';
import { Button } from '../ui';
import { countLabel, peopleWord } from './logic';

/**
 * Portada de la liga (arriba en su inicio): la escena y el color del deporte, el nombre, el lugar y cuántos son, y
 * «Invitar» (el admin manda el link de invitación; en una liga pública, cualquier miembro manda el de la liga).
 * Así una liga de pádel y una de fútbol no se ven iguales.
 */
export function LeagueCover() {
  const { lid, league, member, isAdmin, base } = useLeagueCtx();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const players = usePlayers(lid);
  const [sharing, setSharing] = useState(false);
  const meta = sportMeta(league.sport);
  const Icon = meta?.icon ?? CircleHelp;
  const torneo = league.kind === 'torneo';
  const isPublic = league.visibility === 'public';
  const canInvite = isAdmin || (!!member && isPublic);
  const count = players.data.length;

  async function invite() {
    setSharing(true);
    try {
      let url: string;
      if (isAdmin) {
        const code = await getInviteCode(lid).catch(() => null);
        if (!code) {
          // Todavía no hay código: se crea en Admin › Liga.
          navigate(`${base}/admin?tab=liga`);
          return;
        }
        url = inviteUrl(code);
      } else {
        url = `${location.origin}${base}`;
      }
      const copied = await shareLink(url, `${league.name} · MatchMate`);
      if (copied) toast('Link copiado: pégalo en WhatsApp');
    } finally {
      setSharing(false);
    }
  }

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
              <Button size="sm" icon={<Share2 className="size-4" />} loading={sharing} onClick={invite}>
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
    </section>
  );
}
