import type { Notice } from './notices';

/**
 * Los avisos de la app que antes eran carteles apilados (el de instalar flotando sobre la barra, «¿Te avisamos?» en el
 * Home, la tarjeta de la página de avisos): ahora cada uno es un aviso del NoticeSlot (uno por pantalla, se cierra y
 * se recuerda). Aquí va lo que dicen (sin React, para probarlo); quién los propone está en PwaPrompts y
 * NotificationsOptIn.
 */

/** Si dijo que no (la X), se vuelve a ofrecer después de estos días (lo mismo que antes «Ahora no»). */
export const PROMPT_SNOOZE_DAYS = 14;

/** Instalar la app: en Android con el botón «Instalar»; en iPhone, cómo hacerlo (no hay botón que lo haga). */
export function installNotice(how: 'prompt' | 'ios', handlers: { install?: () => unknown; onDismiss?: () => void } = {}): Notice {
  const base = { kind: 'install' as const, title: 'Instala MatchMate', snoozeDays: PROMPT_SNOOZE_DAYS, onDismiss: handlers.onDismiss };
  return how === 'prompt'
    ? { ...base, id: 'instalar', text: 'Se abre como una app, más rápido y sin conexión', action: { label: 'Instalar', onClick: handlers.install } }
    : { ...base, id: 'instalar-iphone', text: 'Toca Compartir y luego «Agregar a inicio»' };
}

/**
 * Permitir los avisos del teléfono (con la app instalada y sin haber dicho que sí o que no): «¿Te avisamos?» con
 * «Activar». Sale en cualquier pantalla con su NoticeSlot (Hoy, Avisos…), no solo en el Home.
 */
export function pushNotice(handlers: { enable?: () => unknown; onDismiss?: () => void } = {}): Notice {
  return {
    id: 'permitir-avisos',
    kind: 'push',
    title: '¿Te avisamos?',
    text: 'Tus fechas y resultados, aunque la app esté cerrada',
    action: { label: 'Activar', onClick: handlers.enable },
    snoozeDays: PROMPT_SNOOZE_DAYS,
    onDismiss: handlers.onDismiss,
  };
}

/** Cómo están las notificaciones del teléfono, para la página de avisos. */
export type PushPageState = 'ask' | 'denied' | 'install';

/**
 * La página de avisos, arriba: si las notificaciones del teléfono no están activas, cómo activarlas o por qué no se
 * puede (bloqueadas, o falta instalar la app). Con su propio id: cerrarla ahí no esconde el de las otras pantallas.
 */
export function pushPageNotice(state: PushPageState, handlers: { enable?: () => unknown; onDismiss?: () => void } = {}): Notice {
  const base = { kind: 'push' as const, snoozeDays: PROMPT_SNOOZE_DAYS, onDismiss: handlers.onDismiss };
  if (state === 'denied')
    return { ...base, id: 'avisos-bloqueados', title: 'Las notificaciones están bloqueadas', text: 'Actívalas en los ajustes del teléfono' };
  if (state === 'install')
    return { ...base, id: 'avisos-instalar', title: 'Recibe los avisos en tu teléfono', text: 'Instala la app y ábrela desde el ícono' };
  return {
    ...base,
    id: 'avisos-pagina',
    title: 'Activa las notificaciones',
    text: 'Te avisamos aunque la app esté cerrada',
    action: { label: 'Activar', onClick: handlers.enable },
  };
}
