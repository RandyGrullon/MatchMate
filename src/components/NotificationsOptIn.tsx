import { useMemo, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Smartphone } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { PUSH_CATEGORIES, setPushPref, type PushCategory, type PushPrefs } from '../lib/data/pushPrefs';
import { notificationsText } from '../lib/notifications';
import { PROMPT_SNOOZE_DAYS, pushNotice, pushPageNotice, type PushPageState } from '../lib/prompts';
import { enableNotifications, isStandalone, notificationsSupported, notifyState, type NotifyState } from '../lib/push';
import { pushConfigured } from '../lib/pushKey';
import { sportsOf } from '../sports/registry';
import { BusyIcon } from './busy';
import { useAction, useFeedback } from './feedback';
import { useNotice } from './NoticeSlot';
import { useNotifications } from './Notifications';
import { Button, Card, cx } from './ui';

/** «Ahora no» de antes (y la X del aviso ahora): mientras esté reciente no se vuelve a ofrecer. */
const LATER_KEY = 'mm:avisos-despues';
/** El aviso de la página de avisos (aparte: cerrarlo ahí no esconde el de las otras pantallas, y al revés). */
const PAGE_LATER_KEY = 'mm:avisos-pagina-despues';
/** Si dijo "ahora no", se vuelve a ofrecer después de estos días. */
const LATER_DAYS = PROMPT_SNOOZE_DAYS;

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

/**
 * Con la app instalada y sin haber respondido, propone «¿Te avisamos? · Activar» al aviso de la pantalla (NoticeSlot):
 * sale en Hoy, en Avisos o donde haya uno, nunca apilado con otro. Va una sola vez en la raíz de la app (App.tsx); la X
 * lo pospone 14 días, igual que el «Ahora no» de antes. No dibuja nada.
 */
export function PushNotice() {
  const { user } = useAuth();
  const { state, enable } = useEnable();
  const [hidden, setHidden] = useState(askedRecently);
  const show = !!user && !hidden && isStandalone() && state === 'default';
  useNotice(
    show &&
      pushNotice({
        enable,
        onDismiss: () => {
          saveLater(LATER_KEY);
          setHidden(true);
        },
      }),
  );
  return null;
}

/**
 * Antes, la tarjeta «¿Te avisamos?» del Home. Ahora ese aviso lo propone PushNotice (una vez, para toda la app) y sale
 * en el NoticeSlot de la pantalla: esto ya no dibuja nada (queda para las pantallas que todavía lo montan).
 */
export function NotificationsPrompt(): null {
  return null;
}

/**
 * Qué te avisamos (Configuración › Notificaciones): un interruptor por categoría, para todos los teléfonos de la cuenta
 * (profiles.push_prefs). Cambia al tocar; si no se pudo guardar, vuelve a como estaba y lo dice. Sin las preferencias
 * en el perfil (copia vieja o base sin la migración) no se muestra.
 */
function PushPrefsList() {
  const { user, profile } = useAuth();
  const run = useAction();
  // Lo que se tocó y todavía no confirma la base (se ve al momento).
  const [pending, setPending] = useState<Partial<PushPrefs>>({});
  const saved = profile?.pushPrefs;
  if (!user || !saved) return null;
  const prefs: PushPrefs = { ...saved, ...pending };

  async function toggle(key: PushCategory) {
    if (!user || pending[key] !== undefined) return;
    setPending((p) => ({ ...p, [key]: !prefs[key] }));
    await run(() => setPushPref(user.uid, key, !prefs[key]));
    setPending((p) => {
      const next = { ...p };
      delete next[key];
      return next;
    });
  }

  return (
    <div className="flex flex-col border-t border-line pt-3">
      <p className="text-sm font-semibold">Qué te avisamos</p>
      <p className="text-xs text-muted">En todos tus teléfonos. Los anuncios de MatchMate y lo que espera tu respuesta (como «soy este jugador») llegan siempre.</p>
      <ul className="mt-1 divide-y divide-line">
        {PUSH_CATEGORIES.map((c) => {
          const on = prefs[c.key];
          const saving = pending[c.key] !== undefined;
          return (
            <li key={c.key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-busy={saving || undefined}
                onClick={() => void toggle(c.key)}
                className="flex min-h-14 w-full items-center gap-3 py-2 text-left transition active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{c.label}</span>
                  <span className="block text-xs text-muted">{c.hint}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cx('flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors', on ? 'bg-accent' : 'bg-surface-2 ring-1 ring-line ring-inset')}
                >
                  {/* Mientras se guarda, la ruedita en la bolita (se ve ya cambiado; si falla, vuelve). */}
                  <span className={cx('flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform', on && 'translate-x-5')}>
                    <BusyIcon busy={saving} className="size-3.5 text-accent" />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Configuración › Notificaciones: cómo están, cómo activarlas y qué te avisamos. */
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
      <PushPrefsList />
    </Card>
  );
}

/** Cómo están las notificaciones de este teléfono para la página de avisos (null = activas, nada que decir). */
export function pushPageState(state: NotifyState, supported: boolean, installed: boolean): PushPageState | null {
  if (state === 'granted') return null;
  if (state === 'denied') return 'denied';
  return supported && installed ? 'ask' : 'install';
}

/**
 * Página de avisos: si las notificaciones del teléfono no están activas, propone al aviso de la página cómo activarlas
 * (o por qué no se puede: bloqueadas, o falta instalar la app). La X lo esconde unos días. No dibuja nada: sale en el
 * NoticeSlot de la página (si hay algo más importante, como instalar, sale eso).
 */
export function PushOptInNotice() {
  const { user } = useAuth();
  const { state, enable } = useEnable();
  const [hidden, setHidden] = useState(() => askedRecently(PAGE_LATER_KEY));
  const look = user && !hidden ? pushPageState(state, notificationsSupported(), isStandalone()) : null;
  useNotice(
    look &&
      pushPageNotice(look, {
        enable,
        onDismiss: () => {
          saveLater(PAGE_LATER_KEY);
          setHidden(true);
        },
      }),
  );
  return null;
}
