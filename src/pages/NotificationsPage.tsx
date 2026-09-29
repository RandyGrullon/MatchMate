import { useCallback, useEffect, useMemo } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Bell, CheckCheck, Inbox, LogIn } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { filterNotices, groupNotices, isNoticeFilter, NOTICE_FILTERS, type Notice, type NoticeFilter } from '../lib/notifications';
import { useNow } from '../lib/useNow';
import { isSportId, sportMeta, sportsOf } from '../sports/registry';
import { SportIcon } from './sports/SportBits';
import { useNotifications } from '../components/Notifications';
import { PushOptInCard } from '../components/NotificationsOptIn';
import { useCurrentSport } from '../components/notifications/bridge';
import { FilterChips, type ChipItem } from '../components/notifications/FilterChips';
import { InvitesCard } from '../components/notifications/InvitesCard';
import { NoticeList, NoticeListSkeleton } from '../components/notifications/NoticeList';
import { AppShell } from '../components/Shell';
import { Button, Empty, Loading, LoadError } from '../components/ui';

/** `?deporte=todos`: todos los deportes aunque la app esté en uno. */
const ALL_SPORTS = 'todos';

const FILTER_EMPTY: Record<NoticeFilter, string> = {
  todo: 'avisos',
  partidos: 'avisos de partidos ni resultados',
  ligas: 'avisos de tus ligas',
  social: 'avisos sociales',
  admin: 'avisos de admin',
};

/**
 * Avisos: todo lo que pasa en las ligas de la cuenta (partidos y resultados, torneos y prácticas, me gusta,
 * comentarios y seguidores, lo que falta por aprobar), del más nuevo al más viejo, por Hoy, Esta semana y Antes.
 * Se filtra por tipo (`?ver=`) y, con ligas de varios deportes, por deporte (`?deporte=`; si la app está en un
 * deporte, arranca en ese). Tocar un aviso lleva a lo suyo y lo marca leído. Sale de la copia del teléfono: sin
 * señal se ve lo último que llegó. Arriba de todo, las invitaciones a ligas que faltan por responder (con
 * Aceptar y Rechazar ahí mismo).
 */
export default function NotificationsPage() {
  const auth = useAuth();
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
        <div className="flex flex-col gap-5">
          <h1 className="text-2xl font-bold tracking-tight">Avisos</h1>
          <Empty icon={<Bell className="size-8" />} title="Entra para ver tus avisos">
            Tus partidos, resultados, torneos y quién le dio me gusta a tus juegos, todo en un solo sitio.
            <div className="mt-4 flex justify-center">
              <Link
                to={`/login?next=${next}`}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm transition hover:brightness-110 active:scale-[0.97]"
              >
                <LogIn className="size-4" /> Entrar
              </Link>
            </div>
          </Empty>
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
      <Empty icon={<Bell className="size-8" />} title="No tienes avisos">
        {emptyText}
      </Empty>
    );
  else if (!shown.length)
    content = (
      <Empty icon={<Inbox className="size-8" />} title="Nada por aquí">
        {`No tienes ${FILTER_EMPTY[filter]}${sportName ? ` de ${sportMeta(sport)?.lower ?? sportName}` : ''} por ahora.`}
        {filtered && (
          <div className="mt-4 flex justify-center">
            <Button
              className="h-11"
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
          </div>
        )}
      </Empty>
    );
  else content = <NoticeList groups={groups} now={now} isUnread={isUnread} showSport={manySports} onOpen={onOpen} />;

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Avisos</h1>
            {subtitle && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                {sport && <SportIcon sport={sport} className="size-4 shrink-0" />}
                <span className="min-w-0">{subtitle}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => markAllRead(filtered ? shownUnread : undefined)}
            disabled={!shownUnread.length}
            className="-mr-2 inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium whitespace-nowrap text-accent transition hover:bg-accent-soft active:scale-[0.97] disabled:pointer-events-none disabled:text-muted disabled:opacity-60"
          >
            <CheckCheck className="size-4" />
            Marcar todo como leído
          </button>
        </div>

        <PushOptInCard />

        <InvitesCard uid={auth.user.uid} now={now} />

        <div className="flex flex-col">
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
