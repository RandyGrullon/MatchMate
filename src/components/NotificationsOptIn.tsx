import { useState } from 'react';
import { Bell, BellOff, BellRing, CheckCircle2, Smartphone } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { enableNotifications, isStandalone, notificationsSupported, notifyState, type NotifyState } from '../lib/push';
import { useFeedback } from './feedback';
import { Button, Card } from './ui';

const LATER_KEY = 'bowlingx:avisos-despues';
/** Si dijo "ahora no", se vuelve a ofrecer después de estos días. */
const LATER_DAYS = 14;

function askedRecently(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(LATER_KEY) ?? 0) < LATER_DAYS * 86400_000;
  } catch {
    return false;
  }
}

const WHAT =
  'Recordatorios de tus prácticas y torneos (el día antes, el mismo día y, si la liga tiene hora, poco antes de empezar), aunque la app esté cerrada. Con la app abierta o en segundo plano, también felicitaciones, comentarios y cuando aprueben tus juegos.';

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
    if (next.state === 'granted' && next.subscribed) toast('Notificaciones activadas');
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
  const [hidden, setHidden] = useState(askedRecently);
  if (!user || hidden || !isStandalone() || state !== 'default') return null;

  function later() {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now()));
    } catch {
      // sin almacenamiento
    }
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
          <p className="text-sm text-muted">{WHAT}</p>
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
  const installed = isStandalone();
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Bell className="size-5 text-accent" /> Notificaciones
        </h2>
        <p className="text-sm text-muted">{WHAT}</p>
      </div>
      {state === 'granted' ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-ok">
          <CheckCircle2 className="size-4" /> Activadas en este teléfono
        </p>
      ) : state === 'denied' ? (
        <p className="flex items-start gap-1.5 text-sm text-warn">
          <BellOff className="mt-0.5 size-4 shrink-0" /> Están bloqueadas. Actívalas en los ajustes del teléfono (Notificaciones › BowlingX).
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
