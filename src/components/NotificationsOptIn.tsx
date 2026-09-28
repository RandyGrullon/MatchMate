import { useMemo, useState } from 'react';
import { Bell, BellOff, BellRing, CheckCircle2, Smartphone, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { notificationsText } from '../lib/notifications';
import { enableNotifications, isStandalone, notificationsSupported, notifyState, type NotifyState } from '../lib/push';
import { pushConfigured } from '../lib/pushKey';
import { sportsOf } from '../sports/registry';
import { useFeedback } from './feedback';
import { useNotifications } from './Notifications';
import { Button, Card, cx } from './ui';

const LATER_KEY = 'mm:avisos-despues';
/** La tarjeta de la página de avisos (aparte: cerrarla ahí no esconde la del Home, y al revés). */
const PAGE_LATER_KEY = 'mm:avisos-pagina-despues';
/** Si dijo "ahora no", se vuelve a ofrecer después de estos días. */
const LATER_DAYS = 14;

function askedRecently(key = LATER_KEY): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(key) ?? 0) < LATER_DAYS * 86400_000;
  } catch {
    return false;
  }
}

function saveLater(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // sin almacenamiento
  }
}

/**
 * Qué avisamos, según los deportes de las ligas de la cuenta: «Partido hoy a las 8:00 pm, Cancha 2» y los
 * resultados por confirmar en los deportes de partidos, las rondas de golf, los encuentros de natación, las
 * prácticas y torneos del boliche (con solo boliche, el texto de siempre).
 */
function useWhat(): string {
  const { leagues } = useNotifications();
  return useMemo(() => notificationsText(sportsOf(leagues)), [leagues]);
}

function useEnable() {
  const { user } = useAuth();
  const { toast } = useFeedback();
  const [state, setState] = useState<NotifyState>(notifyState);
  const [busy, setBusy] = useState(false);
  async function enable() {
    if (!user) return;
    setBusy(true);
    const next = await enableNotifications(user.uid).catch(() => ({ state: notifyState(), subscribed: false }));
    setBusy(false);
    setState(next.state);
    // Sin clave de push (desarrollo o demo local) no hay recordatorios con la app cerrada: no es un error.
    if (next.state === 'granted' && (next.subscribed || !pushConfigured())) toast('Notificaciones activadas');
    else if (next.state === 'granted')
      toast('Notificaciones activadas, pero los recordatorios con la app cerrada no quedaron listos (¿sin señal?). Se reintenta solo al abrir la app.', 'error');
    else if (next.state === 'denied') toast('Las notificaciones quedaron bloqueadas. Puedes activarlas en los ajustes del teléfono.', 'error');
  }
  return { state, busy, enable };
}

/** Home: con la app instalada, ofrece activar las notificaciones (una vez; "ahora no" lo pospone). */
export function NotificationsPrompt() {
  const { user } = useAuth();
  const { state, busy, enable } = useEnable();
  const what = useWhat();
  const [hidden, setHidden] = useState(askedRecently);
  if (!user || hidden || !isStandalone() || state !== 'default') return null;

  function later() {
    saveLater(LATER_KEY);
    setHidden(true);
  }

  return (
    <Card className="animate-fade-up flex flex-col gap-3 border-accent/40 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <BellRing className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">¿Te avisamos?</p>
          <p className="text-sm text-muted">{what}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={later}>
          Ahora no
        </Button>
        <Button variant="primary" className="flex-1" icon={<Bell className="size-4" />} loading={busy} onClick={enable}>
          Activar
        </Button>
      </div>
    </Card>
  );
}

/** Configuración › Notificaciones: cómo están y cómo activarlas. */
export function NotificationsCard() {
  const { state, busy, enable } = useEnable();
  const what = useWhat();
  const installed = isStandalone();
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Bell className="size-5 text-accent" /> Notificaciones
        </h2>
        <p className="text-sm text-muted">{what}</p>
      </div>
      {state === 'granted' ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-ok">
          <CheckCircle2 className="size-4" /> Activadas en este teléfono
        </p>
      ) : state === 'denied' ? (
        <p className="flex items-start gap-1.5 text-sm text-warn">
          <BellOff className="mt-0.5 size-4 shrink-0" /> Están bloqueadas. Actívalas en los ajustes del teléfono (Notificaciones › MatchMate).
        </p>
      ) : !notificationsSupported() || !installed ? (
        <p className="flex items-start gap-1.5 text-sm text-muted">
          <Smartphone className="mt-0.5 size-4 shrink-0" /> Instala la app en tu teléfono (Agregar a la pantalla de inicio) y ábrela desde el ícono
          para activarlas.
        </p>
      ) : (
        <Button variant="primary" className="self-start" icon={<Bell className="size-4" />} loading={busy} onClick={enable}>
          Activar notificaciones
        </Button>
      )}
    </Card>
  );
}

/**
 * Página de avisos, arriba: si las notificaciones del teléfono no están activas, cómo activarlas (o por qué no se
 * puede: bloqueadas, o falta instalar la app). Con «Ahora no» o la X se esconde unos días.
 */
export function PushOptInCard() {
  const { user } = useAuth();
  const { state, busy, enable } = useEnable();
  const [hidden, setHidden] = useState(() => askedRecently(PAGE_LATER_KEY));
  if (!user || hidden || state === 'granted') return null;

  function later() {
    saveLater(PAGE_LATER_KEY);
    setHidden(true);
  }

  const canAsk = state === 'default' && notificationsSupported() && isStandalone();
  const look =
    state === 'denied'
      ? {
          icon: <BellOff className="size-5" />,
          tone: 'bg-warn-soft text-warn',
          title: 'Las notificaciones están bloqueadas',
          text: 'Para enterarte con la app cerrada, actívalas en los ajustes del teléfono (Notificaciones › MatchMate).',
        }
      : canAsk
        ? {
            icon: <BellRing className="size-5" />,
            tone: 'bg-accent-soft text-accent',
            title: 'Activa las notificaciones',
            text: 'Te avisamos en el teléfono de tus partidos, resultados por confirmar y torneos, aunque la app esté cerrada.',
          }
        : {
            icon: <Smartphone className="size-5" />,
            tone: 'bg-accent-soft text-accent',
            title: 'Recibe los avisos en tu teléfono',
            text: 'Instala la app (Agregar a la pantalla de inicio) y ábrela desde el ícono para activar las notificaciones.',
          };

  return (
    <Card className={cx('animate-fade-up flex flex-col gap-3 p-4', canAsk && 'border-accent/40')}>
      <div className="flex items-start gap-3">
        <div className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', look.tone)}>{look.icon}</div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{look.title}</p>
          <p className="text-sm text-muted">{look.text}</p>
        </div>
        {!canAsk && (
          <button
            type="button"
            onClick={later}
            aria-label="Cerrar"
            className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {canAsk && (
        <div className="flex gap-2">
          <Button className="h-11 flex-1" onClick={later}>
            Ahora no
          </Button>
          <Button variant="primary" className="h-11 flex-1" icon={<Bell className="size-4" />} loading={busy} onClick={enable}>
            Activar
          </Button>
        </div>
      )}
    </Card>
  );
}
