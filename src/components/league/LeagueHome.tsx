import type { ReactNode } from 'react';
import { useLeagueCtx } from '../../lib/league';
import { sportLeagueTour, type LeagueTabNames } from '../../lib/tours';
import { LeagueBadgeAwards } from '../badges/LeagueBadges';
import { LeagueMadeBadges } from '../badges/maker/LeagueMadeBadges';
import { ClaimBanner } from '../claims/ClaimBanner';
import { SuggestionBox } from '../SuggestionBox';
import { Tour } from '../Tour';
import { LeagueNotices } from './Announce';
import { LeagueCover } from './LeagueCover';
import { JoinLeagueCard, LeagueInfoCard } from './LeagueInfo';

/**
 * Lo común del inicio de cualquier liga, alrededor de la pantalla del deporte (LeagueShell lo pone solo en el
 * inicio, `/l/<id>`):
 * - todas (también el boliche): el aviso del admin de los últimos 2 días; para los miembros, «Mi reclamo» (pidió
 *   ser un jugador sin cuenta y espera al admin) o «¿Ya jugabas en esta liga? Busca tu nombre» (src/components/claims);
 *   «Premios de {mes}» (días 3 a 9) y «Campeones» al cerrar la temporada (src/components/badges), y después de la
 *   pantalla del deporte «Insignias de la liga», las del creador (src/components/badges/maker);
 * - los otros deportes: la portada (escena, color, nombre, lugar, cuántos son e «Invitar»); para quien mira una
 *   liga pública sin ser miembro, «Unirme» con los datos de la liga y «¿Quién eres?»; para los miembros, los datos
 *   de la liga al final (lugar, horario, WhatsApp), el buzón de sugerencias y el tour de su liga.
 * El boliche ya tiene todo eso en su pantalla (LeagueHomePage).
 */
export function LeagueHomeFrame({ bowling, tabs, children }: { bowling: boolean; tabs: LeagueTabNames; children: ReactNode }) {
  const { league, member, lid } = useLeagueCtx();
  const observer = !member && league.visibility === 'public';
  return (
    <div className="flex flex-col gap-5">
      {!bowling && <LeagueCover />}
      <LeagueNotices key={lid} />
      {member && <ClaimBanner key={`reclamo-${lid}`} />}
      <LeagueBadgeAwards key={`insignias-${lid}`} />
      {!bowling && observer && <JoinLeagueCard />}
      {children}
      <LeagueMadeBadges key={`creador-${lid}`} />
      {!bowling && !observer && <LeagueInfoCard />}
      {!bowling && <SuggestionBox />}
      {!bowling && <Tour name={`liga-${league.sport ?? 'otro'}`} steps={sportLeagueTour(tabs)} when={!!member} />}
    </div>
  );
}
