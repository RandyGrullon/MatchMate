import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Bell, CheckCheck, ChevronLeft, Inbox } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { filterNotices, groupNotices, isNoticeFilter, NOTICE_FILTERS, type Notice, type NoticeFilter } from '../lib/notifications';
import { useIsPro } from '../lib/useMode';
import { useNow } from '../lib/useNow';
import { isSportId, sportMeta, sportsOf } from '../sports/registry';
import { SportIcon } from './sports/SportBits';
import { useNotifications } from '../components/Notifications';
import { NoticeSlot } from '../components/NoticeSlot';
import { PushOptInNotice } from '../components/NotificationsOptIn';
import { useCurrentSport } from '../components/notifications/bridge';
import { FilterChips, type ChipItem } from '../components/notifications/FilterChips';
import { InvitesCard } from '../components/notifications/InvitesCard';
import { NoticeList, NoticeListSkeleton } from '../components/notifications/NoticeList';
import { AppShell } from '../components/Shell';
import { linkButton } from '../components/cuenta/kit';
import { Button, Card, Loading, LoadError, cx } from '../components/ui';

/** `?deporte=todos`: todos los deportes aunque la app esté en uno. */
const ALL_SPORTS = 'todos';

const FILTER_EMPTY: Record<NoticeFilter, string> = {
  todo: 'avisos',
  partidos: 'avisos de partidos ni resultados',
  ligas: 'avisos de tus ligas',
  social: 'avisos sociales',
  admin: 'avisos de admin',
};

/** «‹ Hoy»: a Avisos se llega con la campana de Hoy, y atrás dice a dónde vuelve (sin cuenta, «‹ Inicio»). */
function BackToHoy({ label = 'Hoy' }: { label?: string }) {
  return (
    <Link
      to="/"
      className="-ml-1.5 inline-flex h-11 items-center gap-0.5 rounded-xl pr-2 text-body font-[550] text-accent transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <ChevronLeft aria-hidden="true" className="size-6" />
      {label}
    </Link>
  );
}

/**
 * Cuando no hay nada que mostrar: una tarjeta tranquila (sin el borde punteado de antes) con el ícono en el color del
 * deporte, una frase y, si hace falta, un botón.
 */
function EmptyCard({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 pt-8 pb-7 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        {icon}
      </span>
      <p className="mt-4 text-card-title-pro">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-meta text-muted">{children}</div>}
      {action && <div className="mt-5 w-full max-w-xs">{action}</div>}
    </Card>
  );
}

/** Arriba de Avisos: «‹ Hoy» y, a la derecha, lo que se hace con toda la lista. */
function TopBar({ back, children }: { back?: string; children?: ReactNode }) {
  return (
    <div className="-mt-2 mb-1 flex min-h-13 items-center justify-between gap-3">
      <BackToHoy label={back} />
      {children}
    </div>
  );
}

/**
 * Avisos (la campana de Hoy): todo lo que pasa en las ligas de la cuenta (partidos y resultados, torneos y prácticas,
 * me gusta, comentarios y seguidores, lo que falta por aprobar), del más nuevo al más viejo, por Hoy, Esta semana y
 * Antes. Se filtra por tipo (`?ver=`) y, con ligas de varios deportes, por deporte (`?deporte=`; si la app está en un
 * deporte, arranca en ese). Tocar un aviso lleva a lo suyo y lo marca leído. Sale de la copia del teléfono: sin
 * señal se ve lo último que llegó. Arriba, «‹ Hoy», el único aviso de la pantalla (instalar la app o activar las
 * notificaciones) y las invitaciones a ligas que faltan por responder (con Aceptar y Rechazar ahí mismo).
 */
export default function NotificationsPage() {
  const auth = useAuth();
  const pro = useIsPro();
  const location = useLocation();
  const {
    items,
    isUnread,
    markRead,
    markAllRead,
    markSeen,
    loading,
    error,
    emptyText,
    feeds,
    leagues,
  } = useNotifications();
  const now = useNow().getTime();
  const [params, setParams] = useSearchParams();
  // El deporte en el que está la app (si es uno que esta versión conoce).
  const picked = useCurrentSport();
  const current = picked && isSportId(picked) ? picked : null;

  // Estando aquí, lo que llega ya se vio: el número de la campana se quita (los puntos siguen).
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  // Los deportes de sus ligas y el de la app aunque no tenga ligas de él (así se ve que no hay avisos de ese).
  const sports = useMemo(() => {
    const own = sportsOf(leagues);
    if (!current || own.includes(current)) return own;
    const order = (x: string) => sportMeta(x)?.order ?? Number.MAX_SAFE_INTEGER;
    return [...own, current].sort((a, b) => order(a) - order(b));
  }, [leagues, current]);
  const rawFilter = params.get('ver');
  const filter: NoticeFilter = isNoticeFilter(rawFilter) ? rawFilter : 'todo';
  const rawSport = params.get('deporte');
  const sport = rawSport === ALL_SPORTS ? null : rawSport && sports.includes(rawSport) ? rawSport : current;
  const manySports = sports.length > 1;

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Admin solo si organiza alguna liga (o le llegó algo de admin).
  const isAdmin = feeds.some((f) => f.isAdmin) || items.some((n) => n.category === 'admin');
  const bySport = useMemo(() => filterNotices(items, 'todo', sport), [items, sport]);
  const filterItems: ChipItem<NoticeFilter>[] = NOTICE_FILTERS.filter((f) => f.id !== 'admin' || isAdmin || filter === 'admin').map((f) => ({
    key: f.id,
    label: f.label,
    count: filterNotices(bySport, f.id, null).filter(isUnread).length,
  }));
  const sportItems: ChipItem<string>[] = [
    { key: ALL_SPORTS, label: 'Todos' },
    ...sports.map((s) => ({
      key: s,
      label: sportMeta(s)?.short ?? 'Otro deporte',
      icon: <SportIcon sport={s} className="size-4" />,
      count: filterNotices(items, filter, s).filter((n) => n.sport === s && isUnread(n)).length,
    })),
  ];

  const shown = useMemo(() => filterNotices(bySport, filter, null), [bySport, filter]);
  const groups = useMemo(() => groupNotices(shown, now), [shown, now]);
  const onOpen = useCallback((n: Notice) => markRead(n), [markRead]);

  if (auth.loading) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }

  if (!auth.user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return (
      <AppShell>
        <div className="flex flex-col gap-5 px-2">
          <div>
            <TopBar back="Inicio" />
            <h1 className="text-title">Avisos</h1>
          </div>
          <EmptyCard
            icon={<Bell className="size-7" />}
            title="Entra para ver tus avisos"
            action={
              <Link to={`/login?next=${next}`} className={linkButton('primary', 'w-full')}>
                Entrar
              </Link>
            }
          >
            Tus partidos, resultados y torneos, en un solo sitio.
          </EmptyCard>
        </div>
      </AppShell>
    );
  }

  const sportName = sport ? (sportMeta(sport)?.short ?? null) : null;
  const filtered = filter !== 'todo' || !!sport;
  // Lo sin leer de lo que se ve (con un filtro, «Marcar todo como leído» marca solo eso).
  const shownUnread = shown.filter(isUnread);
  const status = shownUnread.length ? `${shownUnread.length} sin leer` : shown.length ? 'Estás al día' : '';
  const subtitle = [sportName, status].filter(Boolean).join(' · ');

  let content;
  if (loading) content = <NoticeListSkeleton />;
  else if (error && !items.length) content = <LoadError error={error} />;
  else if (!items.length)
    content = (
      <EmptyCard icon={<Bell className="size-7" />} title="No tienes avisos">
        {emptyText}
      </EmptyCard>
    );
  else if (!shown.length)
    content = (
      <EmptyCard
        icon={<Inbox className="size-7" />}
        title="Nada por aquí"
        action={
          filtered && (
            <Button
              variant="quiet"
              size="lg"
              className="w-full"
              onClick={() =>
                setParams(
                  (p) => {
                    const next = new URLSearchParams(p);
                    next.delete('ver');
                    // Si la app está en un deporte, «todo» incluye los demás deportes.
                    if (current) next.set('deporte', ALL_SPORTS);
                    else next.delete('deporte');
                    return next;
                  },
                  { replace: true },
                )
              }
            >
              Ver todos los avisos
            </Button>
          )
        }
      >
        {`No tienes ${FILTER_EMPTY[filter]}${sportName ? ` de ${sportMeta(sport)?.lower ?? sportName}` : ''} por ahora.`}
      </EmptyCard>
    );
  else content = <NoticeList groups={groups} now={now} isUnread={isUnread} showSport={manySports} onOpen={onOpen} />;

  return (
    <AppShell>
      {/* 24 px a los lados, como Hoy, Ligas y Yo. */}
      <div className="flex flex-col gap-4 px-2">
        <div className="min-w-0">
          <TopBar>
            <button
              type="button"
              onClick={() => markAllRead(filtered ? shownUnread : undefined)}
              disabled={!shownUnread.length}
              className={cx(
                // Se ve de 36 px (como las píldoras del diseño) y se toca en 44.
                "relative inline-flex h-9 min-w-0 shrink items-center gap-1.5 rounded-full bg-surface-2 px-[13px] text-sm font-semibold whitespace-nowrap text-fg transition after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] active:scale-[0.97]",
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:pointer-events-none disabled:text-muted disabled:opacity-60',
              )}
            >
              <CheckCheck aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">Marcar todo como leído</span>
            </button>
          </TopBar>
          <h1 className={pro ? 'text-title-pro' : 'text-title'}>Avisos</h1>
          {subtitle && (
            <p className="mt-1.5 flex items-center gap-1.5 text-meta text-muted">
              {sport && <SportIcon sport={sport} className="size-4 shrink-0" />}
              <span className="min-w-0">{subtitle}</span>
            </p>
          )}
        </div>

        {/* El único aviso de la pantalla: instalar la app o cómo activar las notificaciones del teléfono. */}
        <PushOptInNotice />
        <NoticeSlot />

        <InvitesCard uid={auth.user.uid} now={now} />

        {/* Los filtros se deslizan de borde a borde y empiezan alineados con el título (24 px). */}
        <div className="-mx-2 flex flex-col [&>div]:px-6">
          <FilterChips label="Filtrar avisos por tipo" items={filterItems} value={filter} onChange={(f) => setParam('ver', f === 'todo' ? null : f)} />
          {manySports && (
            <FilterChips
              label="Filtrar avisos por deporte"
              items={sportItems}
              value={sport ?? ALL_SPORTS}
              onChange={(s) => setParam('deporte', s === ALL_SPORTS ? (current ? ALL_SPORTS : null) : s)}
            />
          )}
        </div>

        {content}
      </div>
    </AppShell>
  );
}
