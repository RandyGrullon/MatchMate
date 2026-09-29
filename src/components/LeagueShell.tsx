import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Flag,
  Globe,
  ListOrdered,
  Lock,
  Medal,
  MessageCircleHeart,
  Plus,
  Settings2,
  Share2,
  Shirt,
  Swords,
  Target,
  Timer,
  Trophy,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLeague, useLeaguesByIds, useMembership, useMyMemberships, useSubmissions } from '../lib/data';
import { setActiveSport } from '../lib/sportContext';
import { rememberSport } from '../lib/splash';
import type { LeagueTabNames } from '../lib/tours';
import { leagueSport, sportMeta, sportsOf } from '../sports/registry';
import { dispatchLeague, useSportScreens } from '../sports/screens';
import { SportBadge } from '../pages/sports/SportBits';
import { usePendingClaimCount } from './claims/data';
import { LeagueLogo } from './home/LeagueCard';
import { useNotifications } from './Notifications';
import { useCreateMenu } from './CreateMenu';
import { InviteSheet } from './invite/InviteSheet';
import { canInviteTo, inviteTitle } from './invite/logic';
import { LeagueContext, rememberLeague, type LeagueCtx } from '../lib/league';
import { AppFrame, AppShell } from './Shell';
import { Empty, Loading, Modal, PageSkeleton, cx } from './ui';
import { LeagueHomeFrame } from './league/LeagueHome';
import { isLeagueHome } from './league/logic';
import { SportTheme } from './league/SportTheme';

// Pantallas de los deportes que todavía no tienen las suyas (se bajan solo si hacen falta).
const SportComingSoon = lazy(() => import('../pages/sports/SportComingSoon'));
const UpdateAppScreen = lazy(() => import('../pages/sports/UpdateAppScreen'));

/** Iconos de las pestañas según el deporte: cada liga se reconoce también por sus pestañas. */
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
 * Marco de lo que pasa dentro de una liga: arriba el nombre (toca para cambiar de liga), al lado «Invitar» (si la
 * cuenta puede: abre la hoja de invitar, src/components/invite) y sus
 * pestañas (Calendario · Juegos · Ranking · Mis juegos · Admin); abajo, la barra de la app (Home · Eventos · Perfil).
 * Dentro de la liga todo toma el color de su deporte (el boliche, el de la app) y el inicio lleva lo común de
 * todas las ligas (portada, aviso del admin, «Unirme», datos y buzón: src/components/league/LeagueHome.tsx).
 *
 * Es uno de los dos puntos de desvío por deporte (el otro es EventPage): el boliche ve sus pantallas de
 * siempre; un deporte sin pantallas todavía, «Pronto»; uno que esta versión no conoce, «Actualiza la app».
 */
export default function LeagueShell() {
  const { lid } = useParams();
  const { user, isSuper, loading: authLoading } = useAuth();
  const league = useLeague(lid);
  const membership = useMembership(lid, user?.uid);
  const [switching, setSwitching] = useState(false);
  const [inviting, setInviting] = useState(false);

  const ctx = useMemo<LeagueCtx | null>(() => {
    if (!lid || !league.data) return null;
    const member = membership.data;
    const isOwner = isSuper || member?.role === 'owner';
    const isAdmin = isOwner || member?.role === 'admin';
    // Anotadores: torneos de boliche y cualquier liga de otro deporte (golf, cronometristas, mesa anotadora).
    const isScorer = (league.data.kind === 'torneo' || leagueSport(league.data) !== 'bowling') && member?.scorer === true;
    return {
      lid,
      league: league.data,
      member,
      isOwner,
      isAdmin,
      isScorer,
      canScore: isAdmin || isScorer,
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
    rememberSport(sportId);
    // Entrar a una liga te pone en su deporte (Home y Eventos pasan a ser de ese deporte; la app toma su color).
    setActiveSport(sportId);
  }, [sportId]);
  const ready = sport?.kind === 'ready';
  const bowling = sportId === 'bowling';
  // Pantallas y nombres de pestañas del deporte (el boliche usa las de siempre).
  const screens = useSportScreens(ready && !bowling ? sportId : null);

  // Los envíos por aprobar son del boliche; los otros deportes confirman los resultados en sus partidos.
  const pending = useSubmissions(ctx?.isAdmin && ready && bowling ? lid : undefined, 'pendiente').data.length;
  const newNotes = useNotifications().feeds.find((f) => f.lid === lid)?.suggestions.length ?? 0;
  // Reclamos de jugadores sin cuenta por aprobar (todos los deportes).
  const claims = usePendingClaimCount(ctx?.isAdmin && ready ? lid : null, user?.uid);

  // La pestaña activa siempre a la vista (en el celular no caben todas).
  const tabsRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const box = tabsRef.current;
    const el = box?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!box || !el) return;
    const left = el.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + el.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: left - 16 });
  }, [pathname, ctx?.isAdmin]);

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

  const switcher = (
    <button
      type="button"
      onClick={() => setSwitching(true)}
      className="flex min-w-0 items-center gap-1 rounded-xl px-2 py-1.5 text-left font-semibold hover:bg-surface-2"
      aria-label={`${ctx.league.name}: cambiar de liga`}
      data-tour="cambiar-liga"
    >
      <LeagueLogo path={ctx.league.logoPath} className="mr-0.5 size-6 rounded-md" />
      <span className="truncate">{ctx.league.name}</span>
      <ChevronDown className="size-4 shrink-0 text-muted" />
    </button>
  );

  // Invitar (al lado del nombre): el admin a cualquiera de sus ligas; un miembro, solo a una pública.
  const canInvite = canInviteTo(ctx.league, ctx.isAdmin, !!ctx.member);
  const middle = (
    <div className="flex min-w-0 items-center gap-0.5">
      {switcher}
      {canInvite && (
        <button
          type="button"
          onClick={() => setInviting(true)}
          aria-label={inviteTitle(ctx.league.kind)}
          aria-haspopup="dialog"
          title={inviteTitle(ctx.league.kind)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95"
        >
          <Share2 className="size-5" />
        </button>
      )}
    </div>
  );
  const invite = (
    <InviteSheet league={ctx.league} lid={ctx.lid} isAdmin={ctx.isAdmin} member={!!ctx.member} open={inviting} onClose={() => setInviting(false)} />
  );

  if (sport && sport.kind !== 'ready') {
    return (
      <LeagueContext.Provider value={ctx}>
        <SportTheme sport={sportId}>
          <AppFrame wide middle={middle}>
            <Suspense fallback={<PageSkeleton />}>
              {sport.kind === 'unknown' ? (
                <UpdateAppScreen sport={sport.sport} leagueName={ctx.league.name} />
              ) : (
                <SportComingSoon sport={sport.sport} leagueName={ctx.league.name} kind={ctx.league.kind ?? 'liga'} />
              )}
            </Suspense>
          </AppFrame>
          <LeagueSwitcher open={switching} onClose={() => setSwitching(false)} current={ctx.lid} />
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
  const tabs = [
    { to: base, label: names.home, icon: icons.home, end: true, tour: 'tab-calendario' },
    // Los juegos de todos, para felicitar y comentar.
    ...(names.feed ? [{ to: `${base}/juegos`, label: names.feed, icon: icons.feed, tour: 'tab-juegos' }] : []),
    ...(names.standings ? [{ to: `${base}/ranking`, label: names.standings, icon: icons.standings, tour: 'tab-ranking' }] : []),
    { to: `${base}/perfil`, label: names.profile, icon: icons.profile, tour: 'tab-perfil' },
    ...(ctx.isAdmin ? [{ to: `${base}/admin`, label: 'Admin', icon: Settings2, count: pending + newNotes + claims, tour: 'tab-admin' }] : []),
  ];
  const home = isLeagueHome(pathname, base);

  return (
    <LeagueContext.Provider value={ctx}>
      <SportTheme sport={sportId}>
        <AppFrame
          wide
          middle={middle}
          subnav={
            <nav ref={tabsRef} className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4" aria-label="Secciones de la liga" data-tour="secciones">
              {tabs.map(({ to, label, icon: Icon, end, count, tour }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  data-tour={tour}
                  className={({ isActive }) =>
                    cx(
                      'flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition sm:px-3',
                      isActive ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
                    )
                  }
                >
                  <Icon className="size-4" />
                  {label}
                  {!!count && <span className="rounded-full bg-danger px-1.5 text-[11px] leading-4 font-bold text-on-danger">{count}</span>}
                </NavLink>
              ))}
              {/* Chrome no deja desplazar hasta el relleno derecho: este espacio deja ver entera la última pestaña. */}
              <span aria-hidden="true" className="w-3 shrink-0" />
            </nav>
          }
        >
          {home ? (
            <LeagueHomeFrame bowling={bowling} tabs={names}>
              <Outlet />
            </LeagueHomeFrame>
          ) : (
            <Outlet />
          )}
        </AppFrame>
        <LeagueSwitcher open={switching} onClose={() => setSwitching(false)} current={ctx.lid} />
        {invite}
      </SportTheme>
    </LeagueContext.Provider>
  );
}

function LeagueSwitcher({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const create = useCreateMenu();
  const { user } = useAuth();
  const memberships = useMyMemberships(open ? user?.uid : undefined);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  // El deporte de cada una, solo si tiene de más de uno.
  const multi = sportsOf(leagues.data).length > 1;
  return (
    <Modal open={open} onClose={onClose} title="Tus ligas y torneos">
      <div className="flex flex-col gap-1">
        {!user && <p className="px-1 py-2 text-sm text-muted">Entra con tu cuenta para ver tus ligas.</p>}
        {user && memberships.loading && <p className="px-1 py-2 text-sm text-muted">Cargando…</p>}
        {leagues.data.map((l) => (
          <Link
            key={l.id}
            to={`/l/${l.id}`}
            onClick={onClose}
            className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2', l.id === current && 'bg-accent-soft')}
          >
            {/* Su logo si tiene; si no, si es torneo, privada o pública. */}
            <span className="flex size-7 shrink-0 items-center justify-center" aria-hidden="true">
              <LeagueLogo path={l.logoPath} className="size-7 rounded-lg">
                {l.kind === 'torneo' ? (
                  <Trophy className="size-4 text-muted" />
                ) : l.visibility === 'private' ? (
                  <Lock className="size-4 text-muted" />
                ) : (
                  <Globe className="size-4 text-muted" />
                )}
              </LeagueLogo>
            </span>
            <span className="flex-1 truncate font-medium">{l.name}</span>
            {multi && <SportBadge sport={leagueSport(l)} />}
            {l.id === current && <Check className="size-4 text-accent" />}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => {
            onClose();
            create.openMenu();
          }}
          className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5 text-left text-sm font-medium text-accent hover:bg-surface-2"
        >
          <Plus className="size-4" /> Crear o unirme a otra liga
        </button>
      </div>
    </Modal>
  );
}
