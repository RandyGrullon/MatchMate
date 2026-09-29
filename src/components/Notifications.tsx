import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { Bell } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ensurePlayer, isJoining, useLeagueFeeds, useLeaguesByIds, useMyMemberships, type LeagueFeed } from '../lib/data';
import { useMatchNotices } from '../lib/data/matchNotices';
import { parseDate, toIsoDate } from '../lib/format';
import {
  EMPTY_READ_STATE,
  badgeCount,
  buildNotices,
  emptyNoticesText,
  isNoticeUnread,
  loadReadState,
  markAllNoticesRead,
  markNoticeRead,
  markNoticesRead,
  markNoticesSeen,
  saveReadState,
  unreadCount,
  type Notice,
  type NoticeKind,
  type NoticeReadState,
} from '../lib/notifications';
import { notifyState, showSystemNotification, subscribePush } from '../lib/push';
import type { League } from '../lib/types';
import { sportsOf } from '../sports/registry';
import { useSocialNotices } from './notifications/bridge';
import { cx } from './ui';

/** Ruta de la página de avisos. */
export const NOTIFICATIONS_PATH = '/avisos';

interface NoticesState {
  items: Notice[];
  /**
   * El número rojo de la campana: lo sin leer que llegó después de la última vez que se entró a Avisos (al
   * entrar se quita; los puntos de lo sin leer siguen hasta abrir cada aviso o «Marcar todo como leído»).
   */
  unread: number;
  /** Todo lo sin leer (los puntos de la página). */
  unreadTotal: number;
  /** Última vez que se entró a la página (hora del aviso más nuevo que se vio). */
  seenAt: number;
  isUnread: (n: Notice) => boolean;
  /** Abrió un aviso: queda leído. */
  markRead: (n: Notice) => void;
  /** Todo leído; con `only`, solo esos (lo que se ve con un filtro). */
  markAllRead: (only?: readonly Notice[]) => void;
  /** Está viendo la página: el número de la campana se quita. */
  markSeen: () => void;
  /** Todavía no hay nada (primera carga sin copia en el teléfono). */
  loading: boolean;
  /** No se pudieron leer las ligas de la cuenta (y no hay copia). */
  error: Error | null;
  /** De qué avisamos aquí, según los deportes de la cuenta (para la página vacía). */
  emptyText: string;
  /** Lo que pasa en cada liga de la cuenta (también lo usan "En juego ahora", el calendario y el admin). */
  feeds: LeagueFeed[];
  leagues: League[];
  /** Lleva a la página de avisos. */
  openNotifications: () => void;
}

const Ctx = createContext<NoticesState>({
  items: [],
  unread: 0,
  unreadTotal: 0,
  seenAt: 0,
  isUnread: () => false,
  markRead: () => undefined,
  markAllRead: () => undefined,
  markSeen: () => undefined,
  loading: false,
  error: null,
  emptyText: '',
  feeds: [],
  leagues: [],
  openNotifications: () => undefined,
});

/** Membresías a las que ya se les intentó crear el jugador en esta sesión. */
const backfilled = new Set<string>();

/** Avisos de todas las ligas de la cuenta (se calculan de lo que pasa en cada liga; no se guardan aparte). */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const navigate = useNavigate();
  const memberships = useMyMemberships(uid);
  // Cada cuenta juega con su propia cuenta: a quien se unió antes sin jugador (o al dueño de una liga
  // vieja) se le crea el suyo, una vez. Al unirse ahora se crea en el momento. A quien entró solo para anotar
  // (link o invitación de anotador) no: su jugador lo pide él con «También juego».
  useEffect(() => {
    if (!user) return;
    for (const m of memberships.data) {
      if (m.playerId || m.scorerOnly || m.uid !== user.uid || isJoining(m.leagueId) || backfilled.has(m.id)) continue;
      backfilled.add(m.id);
      ensurePlayer(m.leagueId, m.uid, m.name).catch((e) => console.warn('[jugador] no se pudo crear', e));
    }
  }, [user, memberships.data]);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const today = useToday();
  // Desde ayer: el torneo de hoy y lo que viene.
  const since = useMemo(() => {
    const d = parseDate(today);
    d.setDate(d.getDate() - 1);
    return toIsoDate(d);
  }, [today]);
  const feeds = useLeagueFeeds(memberships.data, since);
  // Partidos (raqueta y equipos): por confirmar, reclamos, cambios de hora, rondas y retos. Nada si no juega esos deportes.
  const matchNotices = useMatchNotices(uid, memberships.data, leagues.data);
  // Seguidores y me gusta del perfil (avisos genéricos de la parte social).
  const social = useSocialNotices(uid);
  // Lo que vence con la hora (las 48 h para confirmar, el partido de hoy) se recalcula aunque no llegue nada nuevo.
  const tick = useTick(5 * 60_000);

  const items = useMemo(
    () => buildNotices(feeds.data, leagues.data, today, Date.now(), matchNotices.data, social),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick: volver a calcular con la hora nueva
    [feeds.data, leagues.data, today, matchNotices.data, social, tick],
  );
  useSystemNotifications(uid, items, !feeds.loading && !leagues.loading && !matchNotices.loading);
  const emptyText = useMemo(() => emptyNoticesText(sportsOf(leagues.data)), [leagues.data]);

  // Qué está leído (en este teléfono, por cuenta). Al cambiar de cuenta se lee el de la otra en el mismo render.
  const [box, setBox] = useState<{ uid: string | undefined; s: NoticeReadState }>(() => ({ uid, s: loadReadState(uid) }));
  let read = box.s;
  if (box.uid !== uid) {
    read = loadReadState(uid);
    setBox({ uid, s: read });
  }
  const update = useCallback((fn: (s: NoticeReadState) => NoticeReadState) => {
    setBox((b) => {
      if (!b.uid) return b;
      const next = fn(b.s);
      if (next === b.s) return b;
      saveReadState(b.uid, next);
      return { uid: b.uid, s: next };
    });
  }, []);
  const markRead = useCallback((n: Notice) => update((s) => markNoticeRead(s, n)), [update]);
  const markAllRead = useCallback(
    (only?: readonly Notice[]) => update((s) => (only ? markNoticesRead(s, only) : markAllNoticesRead(s, items, Date.now()))),
    [update, items],
  );
  const markSeen = useCallback(() => update((s) => markNoticesSeen(s, items)), [update, items]);
  const openNotifications = useCallback(() => navigate(NOTIFICATIONS_PATH), [navigate]);

  const state = user ? read : EMPTY_READ_STATE;
  const unread = user ? badgeCount(items, state) : 0;
  const unreadTotal = user ? unreadCount(items, state) : 0;
  const isUnread = useCallback((n: Notice) => isNoticeUnread(n, state), [state]);
  const loading = !!user && !items.length && (memberships.loading || leagues.loading || feeds.loading || matchNotices.loading);
  const error = user && !items.length ? (memberships.error ?? leagues.error ?? feeds.error ?? null) : null;

  const value = useMemo<NoticesState>(
    () => ({
      items: user ? items : [],
      unread,
      unreadTotal,
      seenAt: state.seenAt,
      isUnread,
      markRead,
      markAllRead,
      markSeen,
      loading,
      error,
      emptyText,
      feeds: user ? feeds.data : [],
      leagues: user ? leagues.data : [],
      openNotifications,
    }),
    [user, items, unread, unreadTotal, state.seenAt, isUnread, markRead, markAllRead, markSeen, loading, error, emptyText, feeds.data, leagues.data, openNotifications],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotifications = () => useContext(Ctx);

/**
 * Avisos que también salen como notificación del teléfono. Los de las prácticas y el partido de hoy no: los mandan
 * los recordatorios. Los de partidos usan el mismo tag que su push (confirmar:, reclamo:, ronda:, reto:), así el
 * teléfono reemplaza la notificación en vez de repetirla.
 */
const PHONE_KINDS = new Set<NoticeKind>([
  'torneo',
  'aprobado',
  'rechazado',
  'por-aprobar',
  'reaccion',
  'comentario',
  'sugerencia',
  'por-confirmar',
  'reclamo',
  'cambio-hora',
  'aplazado',
  'ronda',
  'reto',
  'social',
]);

/**
 * Con permiso de notificaciones: el teléfono queda suscrito a los recordatorios (push) y, mientras la app
 * está en segundo plano, los avisos nuevos salen como notificación del teléfono (máximo 3 de una vez).
 */
function useSystemNotifications(uid: string | undefined, items: Notice[], ready: boolean) {
  useEffect(() => {
    if (uid && notifyState() === 'granted') subscribePush(uid).catch(() => undefined);
  }, [uid]);

  const key = uid ? `mm:avisos-telefono:${uid}` : null;
  useEffect(() => {
    if (!key || !ready || notifyState() !== 'granted') return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(key) ?? 0);
    } catch {
      return;
    }
    const newest = items.reduce((m, n) => Math.max(m, n.time), 0);
    const save = (t: number) => {
      try {
        localStorage.setItem(key, String(t));
      } catch {
        // sin almacenamiento
      }
    };
    // La primera vez no se avisa lo viejo.
    if (!last) return save(newest || Date.now());
    const fresh = items.filter((n) => n.time > last && PHONE_KINDS.has(n.kind));
    if (!fresh.length) return;
    // Con la app a la vista basta la campana; en segundo plano, notificación del teléfono.
    if (document.visibilityState === 'hidden') {
      fresh
        .slice(0, 3)
        .forEach((n) => void showSystemNotification(n.title, [n.leagueName, n.body].filter(Boolean).join(' · '), n.to, n.id));
    }
    save(Math.max(last, ...fresh.map((n) => n.time)));
  }, [key, items, ready]);
}

/** Un número que cambia cada `every` ms mientras la app está a la vista (y al volver a ella). */
function useTick(every: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => document.visibilityState === 'visible' && setTick((t) => t + 1);
    const timer = setInterval(bump, every);
    document.addEventListener('visibilitychange', bump);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', bump);
    };
  }, [every]);
  return tick;
}

/**
 * La fecha de hoy, que cambia a medianoche aunque la app siga abierta (y al volver a ella):
 * así el torneo del día pasa a "¡Hoy es…!" sin esperar a que cambie algo en la liga.
 */
function useToday() {
  const [today, setToday] = useState(() => toIsoDate(new Date()));
  useEffect(() => {
    const refresh = () => setToday(toIsoDate(new Date()));
    const next = new Date();
    next.setHours(24, 0, 5, 0);
    const timer = setTimeout(refresh, next.getTime() - Date.now());
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [today]);
  return today;
}

/**
 * Botón de avisos: lleva a la página de avisos (/avisos), con el número de lo nuevo. `nav`: en la barra de abajo
 * del teléfono (ícono y nombre); si no, la campana de arriba (en la computadora).
 */
export function NotificationsBell({ variant = 'icon' }: { variant?: 'icon' | 'nav' }) {
  const { unread } = useNotifications();
  const badge = unread > 0 && (
    <span
      className="absolute -top-0.5 -right-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-on-danger ring-2 ring-surface"
      aria-hidden="true"
    >
      {unread > 9 ? '9+' : unread}
    </span>
  );
  const label = unread ? `Avisos: ${unread} ${unread === 1 ? 'nuevo' : 'nuevos'}` : 'Avisos';
  return variant === 'nav' ? (
    <NavLink
      to={NOTIFICATIONS_PATH}
      data-tour="campana"
      aria-label={label}
      className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition', isActive ? 'text-accent' : 'text-muted')}
    >
      <span className="relative">
        <Bell className="size-5" />
        {badge}
      </span>
      Avisos
    </NavLink>
  ) : (
    <NavLink
      to={NOTIFICATIONS_PATH}
      data-tour="campana"
      aria-label={label}
      title="Avisos"
      className={({ isActive }) =>
        cx(
          'relative inline-flex size-9 items-center justify-center rounded-xl transition hover:bg-surface-2 active:scale-95',
          isActive ? 'bg-accent-soft text-accent' : 'text-fg',
        )
      }
    >
      <Bell className="size-5" />
      {badge}
    </NavLink>
  );
}
