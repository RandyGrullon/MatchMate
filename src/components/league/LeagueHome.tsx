import type { ReactNode } from 'react';
import { useLeagueCtx } from '../../lib/league';
import { useLeaguePending } from '../../lib/data/organizer';
import { leagueSport } from '../../sports/registry';
import { LeagueBadgeAwards } from '../badges/LeagueBadges';
import { LeagueMadeBadges } from '../badges/maker/LeagueMadeBadges';
import { ClaimBanner } from '../claims/ClaimBanner';
import { useProSuggestion } from '../mode';
import { NoticeSlot, useNotice } from '../NoticeSlot';
import { pendingNotice } from '../organizer/Pending';
import { SuspendTodayCard } from '../organizer/SuspendDay';
import { ReportButton } from '../report/ReportButton';
import { ChampionsSection } from '../season/ChampionsSection';
import { SuggestionBox } from '../SuggestionBox';
import { cx } from '../ui';
import { LeagueNotices } from './Announce';
import { LeagueIdent, LeagueRows, type LeagueRowDef } from './home/LeagueSections';
import { JoinLeagueCard, LeagueInfoCard } from './LeagueInfo';

/**
 * El aviso del inicio de la liga (su NoticeSlot), para quien la organiza: en Lite, lo pendiente o los primeros pasos
 * (enlace a Organizar › Por hacer) y la sugerencia «Organizas esta liga · Probar Pro» (una sola vez). En Pro lo
 * pendiente va en el número de la fila «Organizas esta liga». Sale uno solo, el más importante (instalar la app o
 * permitir los avisos le ganan a la sugerencia y a la pista). A los demás no les pide nada.
 */
export function useLeagueHomeNotices(pro: boolean): void {
  const { lid, league, isAdmin, base } = useLeagueCtx();
  const p = useLeaguePending(isAdmin && !pro ? lid : null).data;
  useNotice(isAdmin && !pro && pendingNotice(p, lid, base, league.kind));
  useProSuggestion({
    title: league.kind === 'torneo' ? 'Organizas este torneo' : 'Organizas esta liga',
    // El boliche: «Aprueba juegos en Pro»; los otros deportes confirman resultados en sus partidos.
    text: leagueSport(league) === 'bowling' ? undefined : 'Resultados y ajustes en Pro',
    enabled: isAdmin,
  });
}

/**
 * Lo que sale arriba en el inicio de cualquier liga solo cuando hay algo: el aviso del admin de los últimos 2 días
 * («Se suspende por lluvia») y, para los miembros, «Mi reclamo» o «¿Ya jugabas en esta liga? Busca tu nombre»
 * (src/components/claims). Sin nada, no ocupa lugar.
 */
export function LeagueHomeTop({ className }: { className?: string }) {
  const { lid, member } = useLeagueCtx();
  return (
    <div className={cx('flex flex-col gap-3 empty:hidden', className)}>
      <LeagueNotices key={lid} />
      {member && <ClaimBanner key={`reclamo-${lid}`} />}
    </div>
  );
}

/**
 * Lo que sale abajo en el inicio de cualquier liga solo cuando hay algo: «Premios de {mes}» (días 3 a 9) y «Campeones
 * de {temporada}» al cerrarla (src/components/badges), «Campeones» de las temporadas cerradas (con «Temporadas»,
 * src/components/season), las «Insignias de la liga» del creador (src/components/badges/maker) y, para quien mira una
 * liga pública sin ser miembro, «Reportar esta liga».
 */
export function LeagueHomeBottom({ className }: { className?: string }) {
  const { lid, league, member } = useLeagueCtx();
  const observer = !member && league.visibility === 'public';
  return (
    <div className={cx('flex flex-col gap-5 empty:hidden', className)}>
      <LeagueBadgeAwards key={`insignias-${lid}`} />
      <ChampionsSection key={`campeones-${lid}`} />
      <LeagueMadeBadges key={`creador-${lid}`} />
      {observer && (
        <div className="flex justify-center">
          <ReportButton kind="league" targetId={lid} ownerId={league.ownerUid} variant="text" />
        </div>
      )}
    </div>
  );
}

/**
 * El inicio de una liga de otro deporte (el boliche arma el suyo en LeagueHomePage), alrededor de la pantalla del
 * deporte (LeagueShell lo pone solo en el inicio, `/l/<id>`), con la misma forma que la del boliche (`2-liga.png`): sin
 * pestañas ni portada, «‹ Ligas» e «Invitar» arriba (LeagueShell), el ícono y el nombre completo de la liga, y sus
 * secciones (Partidos, Tabla, Playoffs, Mi equipo… y en Pro «Organizas esta liga») como filas debajo de la pantalla
 * del deporte (`sections`).
 * - arriba: el ícono y el nombre con cuándo y dónde juegan (LeagueIdent), el aviso del admin y el reclamo; para quien
 *   mira una liga pública sin ser miembro, «Unirme» con los datos de la liga y «¿Quién eres?»; en Pro, a quien
 *   organiza, «Suspender» si hoy hay juego (src/components/organizer);
 * - abajo: las secciones (con el buzón de sugerencias para los jugadores), el aviso de la pantalla (NoticeSlot),
 *   premios, campeones e insignias, y para los miembros los datos de la liga (lugar, horario, WhatsApp).
 */
export function LeagueHomeFrame({ sections, pro, children }: { sections: readonly LeagueRowDef[]; pro: boolean; children: ReactNode }) {
  const { league, member, lid, isAdmin } = useLeagueCtx();
  const observer = !member && league.visibility === 'public';
  useLeagueHomeNotices(pro);
  return (
    <div className="flex flex-col px-2">
      <LeagueIdent className="mt-1" />
      <LeagueHomeTop className="mt-[22px]" />
      {pro && isAdmin && (
        <div className="mt-3.5 empty:hidden">
          <SuspendTodayCard key={`suspender-${lid}`} />
        </div>
      )}
      {observer && (
        <div className="mt-[22px]">
          <JoinLeagueCard />
        </div>
      )}
      <div className="mt-[22px]">{children}</div>
      <LeagueRows rows={sections} className="mt-[30px]">
        <SuggestionBox row />
      </LeagueRows>
      {/* El único aviso de la pantalla, al final de la liga (como una fila discreta). */}
      <NoticeSlot className="mt-4" />
      <LeagueHomeBottom className="mt-[30px]" />
      {!observer && (
        <div className="mt-[30px] empty:hidden">
          <LeagueInfoCard />
        </div>
      )}
    </div>
  );
}
