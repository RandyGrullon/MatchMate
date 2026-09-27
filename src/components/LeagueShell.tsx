import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { CalendarDays, Check, ChevronDown, Globe, Lock, Medal, MessageCircleHeart, Plus, Settings2, Target, Trophy } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLeague, useLeaguesByIds, useMembership, useMyMemberships, useSubmissions } from '../lib/data';
import { useNotifications } from './Notifications';
import { useCreateMenu } from './CreateMenu';
import { LeagueContext, rememberLeague, type LeagueCtx } from '../lib/league';
import { AppFrame, AppShell } from './Shell';
import { Empty, Loading, Modal, cx } from './ui';

/**
 * Marco de lo que pasa dentro de una liga: arriba el nombre (toca para cambiar de liga) y sus
 * pestañas (Calendario · Juegos · Ranking · Mis juegos · Admin); abajo, la barra de la app (Home · Eventos · Perfil).
 */
export default function LeagueShell() {
  const { lid } = useParams();
  const { user, isSuper, loading: authLoading } = useAuth();
  const league = useLeague(lid);
  const membership = useMembership(lid, user?.uid);
  const [switching, setSwitching] = useState(false);

  const ctx = useMemo<LeagueCtx | null>(() => {
    if (!lid || !league.data) return null;
    const member = membership.data;
    const isOwner = isSuper || member?.role === 'owner';
    const isAdmin = isOwner || member?.role === 'admin';
    const isScorer = league.data.kind === 'torneo' && member?.scorer === true;
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

  const pending = useSubmissions(ctx?.isAdmin ? lid : undefined, 'pendiente').data.length;
  const newNotes = useNotifications().feeds.find((f) => f.lid === lid)?.suggestions.length ?? 0;

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

  const base = ctx.base;
  const standalone = ctx.league.kind === 'torneo';
  const tabs = [
    standalone
      ? { to: base, label: 'Torneo', icon: Trophy, end: true, tour: 'tab-calendario' }
      : { to: base, label: 'Calendario', icon: CalendarDays, end: true, tour: 'tab-calendario' },
    // Los juegos de todos, para felicitar y comentar.
    { to: `${base}/juegos`, label: 'Juegos', icon: MessageCircleHeart, tour: 'tab-juegos' },
    ...(standalone ? [] : [{ to: `${base}/ranking`, label: 'Ranking', icon: Medal, tour: 'tab-ranking' }]),
    { to: `${base}/perfil`, label: 'Mis juegos', icon: Target, tour: 'tab-perfil' },
    ...(ctx.isAdmin ? [{ to: `${base}/admin`, label: 'Admin', icon: Settings2, count: pending + newNotes, tour: 'tab-admin' }] : []),
  ];

  return (
    <LeagueContext.Provider value={ctx}>
      <AppFrame
        wide
        middle={
          <button
            type="button"
            onClick={() => setSwitching(true)}
            className="flex min-w-0 items-center gap-1 rounded-xl px-2 py-1.5 text-left font-semibold hover:bg-surface-2"
            aria-label={`${ctx.league.name}: cambiar de liga`}
            data-tour="cambiar-liga"
          >
            <span className="truncate">{ctx.league.name}</span>
            <ChevronDown className="size-4 shrink-0 text-muted" />
          </button>
        }
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
        <Outlet />
      </AppFrame>
      <LeagueSwitcher open={switching} onClose={() => setSwitching(false)} current={ctx.lid} />
    </LeagueContext.Provider>
  );
}

function LeagueSwitcher({ open, onClose, current }: { open: boolean; onClose: () => void; current: string }) {
  const create = useCreateMenu();
  const { user } = useAuth();
  const memberships = useMyMemberships(open ? user?.uid : undefined);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
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
            {l.kind === 'torneo' ? (
              <Trophy className="size-4 text-muted" />
            ) : l.visibility === 'private' ? (
              <Lock className="size-4 text-muted" />
            ) : (
              <Globe className="size-4 text-muted" />
            )}
            <span className="flex-1 truncate font-medium">{l.name}</span>
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
