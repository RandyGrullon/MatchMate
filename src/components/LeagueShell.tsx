import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router';
import {
  CalendarDays,
  Flag,
  ListOrdered,
  Lock,
  Medal,
  MessageCircleHeart,
  Shirt,
  Swords,
  Target,
  Timer,
  Trophy,
  Users,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLeague, useMembership } from '../lib/data';
import { setActiveSport } from '../lib/sportContext';
import { rememberLeagueSport } from '../lib/splash';
import type { LeagueTabNames } from '../lib/tours';
import { leagueSport, sportMeta } from '../sports/registry';
import { dispatchLeague, useSportScreens } from '../sports/screens';
import { InviteSheet } from './invite/InviteSheet';
import { canInviteTo, inviteTitle } from './invite/logic';
import { LeagueContext, rememberLeague, type LeagueCtx } from '../lib/league';
import { AppFrame, AppShell } from './Shell';
import { Empty, Loading, PageSkeleton } from './ui';
import { LeaguePlayerBadges, playerPageId } from './badges/LeagueBadges';
import { LeaguePlayerMadeBadges } from './badges/maker/LeagueMadeBadges';
import { LeagueHomeFrame } from './league/LeagueHome';
import { ROW_ICONS, type LeagueRowDef } from './league/home/LeagueSections';
import { LeagueHomeActions } from './league/home/LeagueSocialActions';
import { InvitePill, LeagueBarProvider, LeagueTopBar, ShellBackBar } from './league/home/LeagueTopBar';
import { OWN_BAR, OWN_BAR_BOWLING, leagueBar } from './league/home/logic';
import { useLeagueToDo } from './league/home/useLeagueData';
import { SportTheme } from './league/SportTheme';
import { useIsPro } from './mode';

// Pantallas de los deportes que todavía no tienen las suyas (se bajan solo si hacen falta).
const SportComingSoon = lazy(() => import('../pages/sports/SportComingSoon'));
const UpdateAppScreen = lazy(() => import('../pages/sports/UpdateAppScreen'));

/** Iconos de las secciones según el deporte: cada liga se reconoce también por sus secciones. */
function tabIcons(sport: string, standalone: boolean): { home: LucideIcon; feed: LucideIcon; standings: LucideIcon; profile: LucideIcon } {
  const meta = sportMeta(sport);
  const family = meta?.family;
  if (sport === 'bowling') return { home: standalone ? Trophy : CalendarDays, feed: MessageCircleHeart, standings: Medal, profile: Target };
  return {
    home: standalone ? Trophy : sport === 'golf' ? Flag : sport === 'swimming' ? Waves : CalendarDays,
    feed: Swords,
    standings: family === 'series' ? Medal : ListOrdered,
    profile: family === 'team' ? Shirt : sport === 'swimming' ? Timer : sport === 'golf' ? Flag : Target,
  };
}

/**
 * Marco de lo que pasa dentro de una liga (rediseño «Calma y foco»: sin pestañas ni encabezado doble). Arriba de cada
 * pantalla, una barra que dice a dónde vuelve (src/components/league/home/LeagueTopBar.tsx): en el inicio «‹ Ligas» con
 * «Muro» (ligas sin menores), «Seguir» (quien no es miembro, src/components/league/home/LeagueSocialActions.tsx) e
 * «Invitar» (si la cuenta puede: abre la hoja de invitar, src/components/invite); adentro «‹ Liga de los martes» (la
 * práctica, Organizar y la página de un jugador traen la suya). Lo que eran pestañas son secciones y filas del inicio
 * (boliche: src/pages/LeagueHomePage.tsx; los otros deportes: filas debajo de su pantalla, LeagueHomeFrame); las rutas
 * siguen iguales. Abajo, la barra de la app (Hoy · Ligas · Yo, y Organizar en Pro). Dentro de la liga todo toma el
 * color de su deporte (el boliche, el de la app).
 *
 * Es uno de los dos puntos de desvío por deporte (el otro es EventPage): el boliche ve sus pantallas de
 * siempre; un deporte sin pantallas todavía, «Pronto»; uno que esta versión no conoce, «Actualiza la app».
 */
export default function LeagueShell() {
  const { lid } = useParams();
  const { user, isSuper, loading: authLoading } = useAuth();
  const league = useLeague(lid);
  const membership = useMembership(lid, user?.uid);
  const [inviting, setInviting] = useState(false);
  const pro = useIsPro();

  const ctx = useMemo<LeagueCtx | null>(() => {
    if (!lid || !league.data) return null;
    const member = membership.data;
    const isOwner = isSuper || member?.role === 'owner';
    const isAdmin = isOwner || member?.role === 'admin';
    // Anotadores: torneos de boliche y cualquier liga de otro deporte (golf, cronometristas, mesa anotadora). En una
    // liga de boliche la marca vale en sus torneos: cada evento lo mira con canScoreEvent (src/lib/league.tsx).
    const isScorer = (league.data.kind === 'torneo' || leagueSport(league.data) !== 'bowling') && member?.scorer === true;
    return {
      lid,
      league: league.data,
      member,
      isOwner,
      isAdmin,
      isScorer,
      canScore: isAdmin || isScorer,
      // Entró solo para anotar y sigue sin jugador: «Mis juegos» le ofrece «También juego».
      scorerOnly: member?.scorerOnly === true && !member.playerId,
      myPlayerId: member?.playerId ?? null,
      base: `/l/${lid}`,
    };
  }, [lid, league.data, membership.data, isSuper]);

  useEffect(() => {
    if (ctx && (ctx.member || ctx.league.visibility === 'public')) rememberLeague(ctx.lid);
  }, [ctx]);

  // Por deporte: qué pantallas lleva, y la animación con que abre la app la próxima vez.
  const sport = league.data ? dispatchLeague(league.data) : null;
  const sportId = sport && sport.kind !== 'unknown' ? sport.sport : null;
  useEffect(() => {
    if (!sportId) return;
    if (lid) rememberLeagueSport(lid, sportId);
    // Entrar a una liga te pone en su deporte (Home y Eventos pasan a ser de ese deporte; la app toma su color).
    setActiveSport(sportId);
  }, [lid, sportId]);
  const ready = sport?.kind === 'ready';
  const bowling = sportId === 'bowling';
  // Pantallas y nombres de las secciones del deporte (el boliche usa las de siempre).
  const screens = useSportScreens(ready && !bowling ? sportId : null);
  const { pathname } = useLocation();

  // Otro deporte, en Pro: lo que espera por quien organiza va en su fila «Organizas esta liga» (el boliche lo cuenta en
  // su pantalla). Antes era el número de la pestaña Admin.
  const toDo = useLeagueToDo(ctx?.isAdmin && pro && ready && !bowling ? (lid ?? null) : null, false);

  if (authLoading || league.loading || membership.loading) return <Loading />;
  if (!ctx) {
    // Privada sin ser miembro (sin permiso) o borrada.
    return (
      <AppShell>
        <Empty icon={<Lock className="size-8" />} title="No puedes ver esta liga">
          Es privada o ya no existe. Para entrar necesitas el link o el código de invitación que te comparta un admin.
          <div className="mt-4">
            <Link to="/ligas" className="font-medium text-accent">
              Ver mis ligas
            </Link>
          </div>
        </Empty>
      </AppShell>
    );
  }

  // «Invitar» (arriba a la derecha en el inicio): el admin a cualquiera de sus ligas; un miembro, solo a una pública.
  const canInvite = canInviteTo(ctx.league, ctx.isAdmin, !!ctx.member);
  const invite = (
    <InviteSheet league={ctx.league} lid={ctx.lid} isAdmin={ctx.isAdmin} member={!!ctx.member} open={inviting} onClose={() => setInviting(false)} />
  );
  // «‹ Ligas» arriba del inicio: cambiar de liga es volver a Ligas (ya no hay menú en el nombre). A la derecha, lo social
  // de la liga en todos los deportes («Muro» si no tiene menores y, a quien no es miembro, «Seguir») e «Invitar».
  const homeBar = (withInvite: boolean) => (
    <LeagueTopBar
      to="/ligas"
      label="Ligas"
      actions={<LeagueHomeActions invite={withInvite && canInvite && <InvitePill onClick={() => setInviting(true)} ariaLabel={inviteTitle(ctx.league.kind)} />} />}
    />
  );

  if (sport && sport.kind !== 'ready') {
    return (
      <LeagueContext.Provider value={ctx}>
        <SportTheme sport={sportId}>
          <AppFrame wide>
            {homeBar(true)}
            <Suspense fallback={<PageSkeleton />}>
              {sport.kind === 'unknown' ? (
                <UpdateAppScreen sport={sport.sport} leagueName={ctx.league.name} />
              ) : (
                <SportComingSoon sport={sport.sport} leagueName={ctx.league.name} kind={ctx.league.kind ?? 'liga'} />
              )}
            </Suspense>
          </AppFrame>
          {invite}
        </SportTheme>
      </LeagueContext.Provider>
    );
  }

  const base = ctx.base;
  const standalone = ctx.league.kind === 'torneo';
  // Otro deporte: los nombres de sus pestañas (y las que no tiene no salen).
  const names: LeagueTabNames = bowling
    ? { home: standalone ? 'Torneo' : 'Calendario', feed: 'Juegos', standings: standalone ? null : 'Ranking', profile: 'Mis juegos', admin: ctx.isAdmin }
    : {
        home: screens?.tabs?.home ?? (standalone ? 'Torneo' : 'Calendario'),
        feed: screens?.Feed ? (screens.tabs?.feed === undefined ? 'Partidos' : screens.tabs.feed) : null,
        standings: screens?.Standings ? (screens.tabs?.standings === undefined ? 'Tabla' : screens.tabs.standings) : null,
        profile: screens?.tabs?.profile ?? 'Mis partidos',
        admin: ctx.isAdmin,
      };
  const icons = tabIcons(sportId ?? 'bowling', standalone);
  // Otro deporte: lo que eran sus pestañas son filas debajo de su pantalla de inicio (el boliche arma las suyas).
  const rowIcon = (Icon: LucideIcon) => <Icon className="size-5" />;
  const sections: LeagueRowDef[] = bowling
    ? []
    : [
        // Los partidos de todos, para seguirlos y comentar.
        ...(names.feed ? [{ key: 'juegos', icon: rowIcon(icons.feed), title: names.feed, to: `${base}/juegos` }] : []),
        ...(names.standings ? [{ key: 'tabla', icon: rowIcon(icons.standings), title: names.standings, to: `${base}/ranking` }] : []),
        // Ligas de equipos: la llave de los playoffs de la temporada.
        ...(!standalone && screens?.Playoffs ? [{ key: 'playoffs', icon: rowIcon(Trophy), title: 'Playoffs', to: `${base}/playoffs` }] : []),
        { key: 'perfil', icon: rowIcon(icons.profile), title: names.profile, to: `${base}/perfil` },
        // Para quien organiza: lo del Admin que el deporte pone también en el inicio (raqueta: «Parejas y niveles»).
        ...(ctx.isAdmin
          ? (screens?.adminTabs ?? [])
              .filter((t) => t.homeRow)
              .map((t) => ({ key: `admin-${t.key}`, icon: rowIcon(t.icon ?? Users), title: t.label, to: `${base}/admin?tab=${t.key}` }))
          : []),
        // Pro: lo de la antigua pestaña Admin, con lo que espera (en Lite, el aviso «Organizas esta liga · Probar Pro»).
        ...(ctx.isAdmin && pro
          ? [
              {
                key: 'organizar',
                icon: ROW_ICONS.organize,
                title: standalone ? 'Organizas este torneo' : 'Organizas esta liga',
                subtitle: toDo.line || 'Gente, fechas y ajustes',
                to: `${base}/admin`,
                count: toDo.count,
                accent: true,
              },
            ]
          : []),
      ];
  const bar = leagueBar(pathname, base, bowling ? OWN_BAR_BOWLING : OWN_BAR);
  const home = bar === 'home';
  // Página de un jugador (del boliche o de un deporte que la tiene): sus insignias van al final.
  const badgesOf = bowling || screens?.Player ? playerPageId(pathname, base) : null;

  return (
    <LeagueContext.Provider value={ctx}>
      <SportTheme sport={sportId}>
        <AppFrame wide>
          <LeagueBarProvider>
            {/* «‹ Ligas» con «Invitar» en el inicio de cualquier liga (ya no hay portada con su propio «Invitar»). */}
            {home ? homeBar(true) : bar === 'back' && <ShellBackBar />}
            {home && !bowling ? (
              <LeagueHomeFrame sections={sections} pro={pro}>
                <Outlet />
              </LeagueHomeFrame>
            ) : badgesOf ? (
              <>
                <Outlet />
                <LeaguePlayerBadges key={badgesOf} playerId={badgesOf} />
                <LeaguePlayerMadeBadges key={`creador-${badgesOf}`} playerId={badgesOf} />
              </>
            ) : (
              <Outlet />
            )}
          </LeagueBarProvider>
        </AppFrame>
        {invite}
      </SportTheme>
    </LeagueContext.Provider>
  );
}
