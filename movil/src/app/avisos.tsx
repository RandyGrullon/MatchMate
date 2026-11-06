import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Bell, CheckCheck, Inbox } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { filterNotices, groupNotices, isNoticeFilter, NOTICE_FILTERS, type Notice, type NoticeFilter } from '@mm/lib/notifications';
import { useNow } from '@mm/lib/useNow';
import { isSportId, sportMeta, sportsOf } from '@mm/sports/registry';
import { useNotifications } from '@mm/components/notifications/provider';
import { useCurrentSport } from '@mm/components/notifications/bridge';
import { InvitesCard } from '@/components/notifications/InvitesCard';
import { Chips, NoticeGroups, type ChipItem } from '@/components/notifications/NoticeList';
import { BackBar, Button, Empty, LoadError, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** «Todos» los deportes aunque la app esté en uno (`?deporte=todos` en la web). */
const ALL_SPORTS = 'todos';

const FILTER_EMPTY: Record<NoticeFilter, string> = {
  todo: 'avisos',
  partidos: 'avisos de partidos ni resultados',
  ligas: 'avisos de tus ligas',
  social: 'avisos sociales',
  admin: 'avisos de admin',
};

/**
 * Avisos (la campana de Hoy; NotificationsPage de la web): todo lo que pasa en las ligas de la cuenta, del más nuevo
 * al más viejo por Hoy, Esta semana y Antes, con los mismos filtros por tipo y por deporte, las invitaciones sin
 * responder arriba y «Marcar todo como leído». Tocar un aviso lo marca leído y abre lo suyo. Los avisos los calcula el
 * mismo proveedor de la web (src/components/notifications/provider.tsx).
 */
export default function NoticesScreen() {
  const auth = useAuth();
  const c = useColors();
  const params = useLocalSearchParams<{ ver?: string; deporte?: string }>();
  const { items, isUnread, markRead, markAllRead, markSeen, loading, error, emptyText, feeds, leagues } = useNotifications();
  const now = useNow().getTime();
  const picked = useCurrentSport();
  const current = picked && isSportId(picked) ? picked : null;
  const [filter, setFilter] = useState<NoticeFilter>(() => (isNoticeFilter(params.ver ?? null) ? (params.ver as NoticeFilter) : 'todo'));
  const [sportParam, setSportParam] = useState<string | null>(params.deporte ?? null);

  // Estando aquí, lo que llega ya se vio: el número de la campana se quita (los puntos siguen).
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  // Los deportes de sus ligas y el de la app aunque no tenga ligas de él.
  const sports = useMemo(() => {
    const own = sportsOf(leagues);
    if (!current || own.includes(current)) return own;
    const order = (x: string) => sportMeta(x)?.order ?? Number.MAX_SAFE_INTEGER;
    return [...own, current].sort((a, b) => order(a) - order(b));
  }, [leagues, current]);
  const sport = sportParam === ALL_SPORTS ? null : sportParam && sports.includes(sportParam) ? sportParam : current;
  const manySports = sports.length > 1;

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
    ...sports.map((s) => {
      const Icon = sportMeta(s)?.icon;
      const on = (sport ?? ALL_SPORTS) === s;
      return {
        key: s,
        label: sportMeta(s)?.short ?? 'Otro deporte',
        icon: Icon ? <Icon size={16} color={on ? c.accentFg : c.fg} /> : undefined,
        count: filterNotices(items, filter, s).filter((n) => n.sport === s && isUnread(n)).length,
      };
    }),
  ];

  const shown = useMemo(() => filterNotices(bySport, filter, null), [bySport, filter]);
  const groups = useMemo(() => groupNotices(shown, now), [shown, now]);
  const onOpen = useCallback((n: Notice) => markRead(n), [markRead]);

  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <Screen>
        <BackBar label="Inicio" />
        <Txt variant="title">Avisos</Txt>
        <Empty
          icon={<Bell size={28} color={c.accent} />}
          title="Entra para ver tus avisos"
          text="Tus partidos, resultados y torneos, en un solo sitio."
          action={
            <Button variant="primary" full onPress={() => router.push('/login')}>
              Entrar
            </Button>
          }
        />
      </Screen>
    );
  }

  const sportName = sport ? (sportMeta(sport)?.short ?? null) : null;
  const filtered = filter !== 'todo' || !!sport;
  // Lo sin leer de lo que se ve (con un filtro, «Marcar todo como leído» marca solo eso).
  const shownUnread = shown.filter(isUnread);
  const status = shownUnread.length ? `${shownUnread.length} sin leer` : shown.length ? 'Estás al día' : '';
  const subtitle = [sportName, status].filter(Boolean).join(' · ');

  let content;
  if (loading) content = <Loading label="Cargando avisos" />;
  else if (error && !items.length) content = <LoadError error={error} />;
  else if (!items.length) content = <Empty icon={<Bell size={28} color={c.accent} />} title="No tienes avisos" text={emptyText} />;
  else if (!shown.length)
    content = (
      <Empty
        icon={<Inbox size={28} color={c.accent} />}
        title="Nada por aquí"
        text={`No tienes ${FILTER_EMPTY[filter]}${sportName ? ` de ${sportMeta(sport)?.lower ?? sportName}` : ''} por ahora.`}
        action={
          filtered ? (
            <Button
              full
              onPress={() => {
                setFilter('todo');
                // Si la app está en un deporte, «todo» incluye los demás deportes.
                setSportParam(current ? ALL_SPORTS : null);
              }}
            >
              Ver todos los avisos
            </Button>
          ) : undefined
        }
      />
    );
  else content = <NoticeGroups groups={groups} now={now} isUnread={isUnread} showSport={manySports} onOpen={onOpen} />;

  return (
    <Screen>
      <BackBar
        label="Hoy"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !shownUnread.length }}
            disabled={!shownUnread.length}
            onPress={() => markAllRead(filtered ? shownUnread : undefined)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: 18, paddingHorizontal: 13, backgroundColor: c.surface2, opacity: shownUnread.length ? 1 : 0.6 }}
          >
            <CheckCheck size={16} color={shownUnread.length ? c.fg : c.muted} />
            <Txt style={{ fontFamily: font.semibold, fontSize: 14, color: shownUnread.length ? c.fg : c.muted }}>Marcar todo como leído</Txt>
          </Pressable>
        }
      />
      <View style={{ gap: 6 }}>
        <Txt variant="title" accessibilityRole="header">
          Avisos
        </Txt>
        {!!subtitle && (
          <Txt variant="meta" tone="muted">
            {subtitle}
          </Txt>
        )}
      </View>
      <InvitesCard uid={auth.user.uid} now={now} />
      <View style={{ gap: 4 }}>
        <Chips label="Filtrar avisos por tipo" items={filterItems} value={filter} onChange={setFilter} />
        {manySports && (
          <Chips
            label="Filtrar avisos por deporte"
            items={sportItems}
            value={sport ?? ALL_SPORTS}
            onChange={(s) => setSportParam(s === ALL_SPORTS ? (current ? ALL_SPORTS : null) : s)}
          />
        )}
      </View>
      {content}
    </Screen>
  );
}
