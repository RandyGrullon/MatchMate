import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CalendarDays, CheckCircle2, Globe, Inbox, Lightbulb, Lock, Megaphone, MessageCircle, PartyPopper, Trophy, XCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ensurePlayer, isJoining, useLeagueFeeds, useLeaguesByIds, useMyMemberships, type LeagueFeed } from '../lib/data';
import { parseDate, toIsoDate } from '../lib/format';
import { buildNotices, relativeTime, type Notice, type NoticeKind } from '../lib/notifications';
import { notifyState, showSystemNotification, subscribePush } from '../lib/push';
import type { League } from '../lib/types';
import { Button, Empty, Modal, cx } from './ui';

interface NoticesState {
  items: Notice[];
  /** Avisos más nuevos que la última vez que se abrió la campana. */
  unread: number;
  /** Momento de la última vez que se abrieron (para marcar los nuevos). */
  seenAt: number;
  markAllRead: () => void;
  /** Lo que pasa en cada liga de la cuenta (también lo usa "En juego ahora"). */
  feeds: LeagueFeed[];
  leagues: League[];
  /** Abre la lista de avisos (hay una sola en toda la app). */
  openNotifications: () => void;
  listOpen: boolean;
}

const Ctx = createContext<NoticesState>({
  items: [],
  unread: 0,
  seenAt: 0,
  markAllRead: () => undefined,
  feeds: [],
  leagues: [],
  openNotifications: () => undefined,
  listOpen: false,
});

const seenKey = (uid: string) => `bowlingx:avisos-vistos:${uid}`;

function readSeen(uid: string | undefined): number {
  if (!uid) return 0;
  try {
    return Number(localStorage.getItem(seenKey(uid))) || 0;
  } catch {
    return 0;
  }
}

/** Membresías a las que ya se les intentó crear el jugador en esta sesión. */
const backfilled = new Set<string>();

/** Avisos de todas las ligas de la cuenta (se calculan de lo que pasa en cada liga; no se guardan aparte). */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const memberships = useMyMemberships(user?.uid);
  // Cada cuenta juega con su propia cuenta: a quien se unió antes sin jugador (o al dueño de una liga
  // vieja) se le crea el suyo, una vez. Al unirse ahora se crea en el momento.
  useEffect(() => {
    if (!user) return;
    for (const m of memberships.data) {
      if (m.playerId || m.uid !== user.uid || isJoining(m.leagueId) || backfilled.has(m.id)) continue;
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
  const [seenAt, setSeenAt] = useState(() => readSeen(user?.uid));
  useEffect(() => setSeenAt(readSeen(user?.uid)), [user?.uid]);

  const items = useMemo(() => buildNotices(feeds.data, leagues.data, today, Date.now()), [feeds.data, leagues.data, today]);
  const unread = items.filter((n) => n.time > seenAt).length;
  useSystemNotifications(user?.uid, items, !feeds.loading && !leagues.loading);

  // Visto hasta el aviso más nuevo (hora del servidor, no el reloj del teléfono, que puede ir adelantado).
  const newest = items.reduce((m, n) => Math.max(m, n.time), 0);
  const markAllRead = useCallback(() => {
    if (!user) return;
    // Nunca hacia atrás (si se marcó leída una sugerencia, lo ya visto no vuelve a salir como nuevo).
    const seen = Math.max(seenAt, newest || Date.now());
    setSeenAt(seen);
    try {
      localStorage.setItem(seenKey(user.uid), String(seen));
    } catch {
      // sin almacenamiento: se vuelven a ver como nuevos al recargar
    }
  }, [user, newest, seenAt]);

  // La lista va una sola vez aquí (no dentro de la barra, que se esconde según el tamaño de la pantalla:
  // un modal ahí se trababa al girar el teléfono).
  const [listOpen, setListOpen] = useState(false);
  // Lo que era nuevo al abrir se sigue marcando mientras la lista está abierta.
  const [newSince, setNewSince] = useState(0);
  const openNotifications = useCallback(() => {
    setNewSince(seenAt);
    setListOpen(true);
    markAllRead();
  }, [seenAt, markAllRead]);

  const value = useMemo(
    () => ({
      items: user ? items : [],
      unread: user ? unread : 0,
      seenAt,
      markAllRead,
      feeds: user ? feeds.data : [],
      leagues: user ? leagues.data : [],
      openNotifications,
      listOpen,
    }),
    [user, items, unread, seenAt, markAllRead, feeds.data, leagues.data, openNotifications, listOpen],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <NotificationsList open={listOpen && !!user} onClose={() => setListOpen(false)} items={items} newSince={newSince} />
    </Ctx.Provider>
  );
}

export const useNotifications = () => useContext(Ctx);

/** Avisos que también salen como notificación del teléfono (los de las prácticas los mandan los recordatorios). */
const PHONE_KINDS = new Set<NoticeKind>(['torneo', 'aprobado', 'rechazado', 'por-aprobar', 'reaccion', 'comentario', 'sugerencia']);

/**
 * Con permiso de notificaciones: el teléfono queda suscrito a los recordatorios (push) y, mientras la app
 * está en segundo plano, los avisos nuevos salen como notificación del teléfono (máximo 3 de una vez).
 */
function useSystemNotifications(uid: string | undefined, items: Notice[], ready: boolean) {
  useEffect(() => {
    if (uid && notifyState() === 'granted') subscribePush(uid).catch(() => undefined);
  }, [uid]);

  const key = uid ? `bowlingx:avisos-telefono:${uid}` : null;
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
      fresh.slice(0, 3).forEach((n) => void showSystemNotification(n.title, `${n.leagueName} · ${n.body}`, n.to, n.id));
    }
    save(Math.max(last, ...fresh.map((n) => n.time)));
  }, [key, items, ready]);
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

const ICONS: Record<NoticeKind, { icon: ReactNode; tone: string }> = {
  torneo: { icon: <Megaphone className="size-5" />, tone: 'bg-accent-soft text-accent' },
  'torneo-hoy': { icon: <Trophy className="size-5" />, tone: 'bg-warn-soft text-warn' },
  practica: { icon: <CalendarDays className="size-5" />, tone: 'bg-accent-soft text-accent' },
  aprobado: { icon: <CheckCircle2 className="size-5" />, tone: 'bg-ok-soft text-ok' },
  rechazado: { icon: <XCircle className="size-5" />, tone: 'bg-danger-soft text-danger' },
  'por-aprobar': { icon: <Inbox className="size-5" />, tone: 'bg-warn-soft text-warn' },
  reaccion: { icon: <PartyPopper className="size-5" />, tone: 'bg-accent-soft text-accent' },
  comentario: { icon: <MessageCircle className="size-5" />, tone: 'bg-ok-soft text-ok' },
  sugerencia: { icon: <Lightbulb className="size-5" />, tone: 'bg-warn-soft text-warn' },
};

/**
 * Botón de avisos. `nav`: en la barra de abajo del teléfono (ícono y nombre); si no, la campana de arriba
 * (en la computadora). Los dos abren la misma lista.
 */
export function NotificationsBell({ variant = 'icon' }: { variant?: 'icon' | 'nav' }) {
  const { unread, openNotifications, listOpen } = useNotifications();
  const badge = unread > 0 && (
    <span className="absolute -top-0.5 -right-0.5 flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-4 font-bold text-on-danger ring-2 ring-surface">
      {unread > 9 ? '9+' : unread}
    </span>
  );
  const label = unread ? `Notificaciones: ${unread} nuevas` : 'Notificaciones';
  return variant === 'nav' ? (
    <button
      type="button"
      onClick={openNotifications}
      data-tour="campana"
      aria-label={label}
      className={cx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition', listOpen ? 'text-accent' : 'text-muted')}
    >
      <span className="relative">
        <Bell className="size-5" />
        {badge}
      </span>
      Notificaciones
    </button>
  ) : (
    <button
      type="button"
      onClick={openNotifications}
      data-tour="campana"
      aria-label={label}
      title="Notificaciones"
      className="relative inline-flex size-9 items-center justify-center rounded-xl text-fg transition hover:bg-surface-2 active:scale-95"
    >
      <Bell className="size-5" />
      {badge}
    </button>
  );
}

/** La lista de avisos. */
function NotificationsList({ open, onClose, items, newSince }: { open: boolean; onClose: () => void; items: Notice[]; newSince: number }) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [open]);

  function go(n: Notice) {
    onClose();
    navigate(n.to);
  }

  return (
    <Modal open={open} onClose={onClose} title="Notificaciones" footer={<Button onClick={onClose}>Cerrar</Button>}>
      {items.length === 0 ? (
        <Empty icon={<Bell className="size-8" />} title="No tienes avisos">
          Aquí te avisamos de torneos nuevos, prácticas de la semana y cuando aprueben tus juegos, con la liga de cada cosa.
        </Empty>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((n) => {
            const isNew = n.time > newSince;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => go(n)}
                  className={cx('flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-surface-2', isNew && 'bg-accent-soft/40')}
                >
                  <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', ICONS[n.kind].tone)}>{ICONS[n.kind].icon}</span>
                  <span className="min-w-0 flex-1">
                    {/* La liga en su propia línea, completa (sin cortar el nombre). */}
                    <span className="flex items-start gap-1 text-xs font-semibold break-words text-fg">
                      {n.private ? <Lock className="mt-0.5 size-3 shrink-0 text-muted" /> : <Globe className="mt-0.5 size-3 shrink-0 text-muted" />}
                      <span className="min-w-0">{n.leagueName}</span>
                    </span>
                    <span className="block text-[11px] text-muted">
                      {n.leagueKind === 'torneo' ? (n.private ? 'Torneo privado' : 'Torneo público') : n.private ? 'Liga privada' : 'Liga pública'} ·{' '}
                      {relativeTime(n.time, now)}
                    </span>
                    <span className="mt-1 block font-semibold">{n.title}</span>
                    <span className="block text-sm text-muted">{n.body}</span>
                  </span>
                  {isNew && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Nuevo" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
