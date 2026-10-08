import { useState } from 'react';
import { Bell, BellOff, CalendarClock, CheckCircle2, ClipboardCheck, Heart, Smartphone, Trophy, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { PUSH_CATEGORIES, setPushPref, type PushCategory, type PushPrefs } from '../lib/data/pushPrefs';
import { PROMPT_SNOOZE_DAYS, pushNotice, pushPageNotice, type PushPageState } from '../lib/prompts';
import { enableNotifications, isStandalone, notificationsSupported, notifyState, type NotifyState } from '../lib/push';
import { pushConfigured } from '../lib/pushKey';
import { BusyIcon } from './busy';
import { useAction, useFeedback } from './feedback';
import { useNotice } from './NoticeSlot';
import { useIsPro } from '../lib/useMode';
import { Button, Card, ListRow, RowIcon, SectionHeader, cx } from './ui';

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
 * Lo que dice cada interruptor, en una línea (las de src/lib/data/pushPrefs.ts son de dos o tres en el teléfono). Si
 * aparece una categoría nueva sin texto aquí, sale el de la base.
 */
export const PUSH_SHORT_HINTS: Partial<Record<PushCategory, string>> = {
  resultados: 'Aprobados y por confirmar',
  social: 'Me gusta y seguidores',
  recordatorios: 'Lo que viene y anotar después',
  liga: 'Admins e invitaciones',
};

/** El ícono de cada interruptor (el mismo cuadro de 40 px de las filas). */
const PUSH_ICONS: Partial<Record<PushCategory, LucideIcon>> = {
  resultados: ClipboardCheck,
  social: Heart,
  recordatorios: CalendarClock,
  liga: Trophy,
};

/**
 * Qué te avisamos (Configuración › Notificaciones): un interruptor por categoría, para todos los teléfonos de la cuenta
 * (profiles.push_prefs), cada uno como una fila más de la tarjeta. Cambia al tocar; si no se pudo guardar, vuelve a
 * como estaba y lo dice. Sin las preferencias en el perfil (copia vieja o base sin la migración) no se muestra.
 */
function PushPrefsRows({ dense }: { dense: boolean }) {
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
    <>
      {PUSH_CATEGORIES.map((c) => {
        const on = prefs[c.key];
        const saving = pending[c.key] !== undefined;
        const Icon = PUSH_ICONS[c.key] ?? Bell;
        return (
          <button
            key={c.key}
            type="button"
            role="switch"
            aria-checked={on}
            aria-busy={saving || undefined}
            onClick={() => void toggle(c.key)}
            className={cx(
              // Como una fila de ListRow (mm-row: la línea de arriba sale sola), con el interruptor al final.
              'mm-row relative flex w-full items-center gap-3.5 pr-[18px] pl-5 text-left transition active:bg-surface-2',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
              dense ? 'min-h-row-pro py-2' : 'min-h-row py-2.5',
            )}
          >
            <RowIcon>
              <Icon className={dense ? 'size-[19px]' : 'size-5'} />
            </RowIcon>
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate font-semibold tracking-[-0.01em]', dense ? 'text-[15px]' : 'text-body')}>{c.label}</span>
              <span className={cx('mt-0.5 line-clamp-2 text-muted', dense ? 'text-[13px]' : 'text-sm')}>{PUSH_SHORT_HINTS[c.key] ?? c.hint}</span>
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
        );
      })}
    </>
  );
}

/**
 * Configuración › Notificaciones: la primera fila dice cómo están en este teléfono (con «Activar» si se puede) y debajo
 * va un interruptor por cada cosa que te avisamos. Una sola pista abajo.
 */
export function NotificationsCard({ className }: { className?: string }) {
  const { state, busy, enable } = useEnable();
  const { user, profile } = useAuth();
  const pro = useIsPro();
  const hasPrefs = !!user && !!profile?.pushPrefs;
  const installed = isStandalone();
  const canAsk = state === 'default' && notificationsSupported() && installed;
  const status =
    state === 'granted'
      ? 'Activadas'
      : state === 'denied'
        ? 'Bloqueadas: actívalas en los ajustes del teléfono'
        : canAsk
          ? 'Todavía no están activadas'
          : 'Instala la app para activarlas';
  const icon = pro ? 'size-[19px]' : 'size-5';
  return (
    <section aria-labelledby="cfg-avisos" className={className}>
      <SectionHeader id="cfg-avisos" title="Notificaciones" />
      <Card className="overflow-hidden">
        <ListRow
          dense={pro}
          leading={
            <RowIcon tone={state === 'granted' ? 'accent' : 'neutral'}>
              {state === 'granted' ? <Bell className={icon} /> : state === 'denied' ? <BellOff className={icon} /> : canAsk ? <Bell className={icon} /> : <Smartphone className={icon} />}
            </RowIcon>
          }
          title="En este teléfono"
          subtitle={
            state === 'granted' ? (
              <span className="inline-flex items-center gap-1 font-medium text-ok">
                <CheckCircle2 aria-hidden="true" className="size-4" /> {status}
              </span>
            ) : (
              status
            )
          }
          trailing={
            canAsk && (
              <Button variant="soft" size="lg" loading={busy} onClick={enable}>
                Activar
              </Button>
            )
          }
        />
        <PushPrefsRows dense={pro} />
      </Card>
      {hasPrefs && <p className="mx-1 mt-2.5 text-[13px] text-muted">Qué te avisamos, en todos tus teléfonos. Lo que espera tu respuesta llega siempre.</p>}
    </section>
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
