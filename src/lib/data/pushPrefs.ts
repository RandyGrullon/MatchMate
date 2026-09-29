import { invalidate, queryClient, rpc } from './client';
import { keys, tags } from './keys';

/**
 * Qué avisos llegan al teléfono (profiles.push_prefs, 20260929000500_avisos_telefono.sql): cuatro categorías, todas
 * activas salvo las que la cuenta apagó. Valen para todos sus teléfonos: la base las revisa al encolar cada aviso (por
 * el principio de su tag). Lo que no es de ninguna (solicitudes de «soy este jugador», inscripciones, escalera, anuncios
 * de MatchMate) llega siempre.
 *
 * La cuenta las lee con su perfil (auth.tsx, `profile.pushPrefs`) y las cambia con set_push_prefs.
 */

export type PushCategory = 'resultados' | 'social' | 'recordatorios' | 'liga';

export type PushPrefs = Record<PushCategory, boolean>;

/** En el orden de Configuración › Notificaciones, con lo que entra en cada una. */
export const PUSH_CATEGORIES: readonly { key: PushCategory; label: string; hint: string }[] = [
  { key: 'resultados', label: 'Resultados', hint: 'Juegos aprobados o rechazados, resultados por confirmar, confirmados y reclamos.' },
  { key: 'social', label: 'Social', hint: 'Me gusta, felicitaciones, comentarios y quién empieza a seguirte.' },
  { key: 'recordatorios', label: 'Recordatorios', hint: 'Prácticas, partidos y torneos que vienen, y anotar tus juegos o el resultado después.' },
  { key: 'liga', label: 'Tus ligas', hint: 'Avisos de los admins de tus ligas.' },
];

export const ALL_PUSH_ON: PushPrefs = { resultados: true, social: true, recordatorios: true, liga: true };

/** Lo que guarda la base (solo las que cambió, `{social: false}`) → las cuatro. Falta una o no es false: activa. */
export function toPushPrefs(raw: unknown): PushPrefs {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    resultados: r.resultados !== false,
    social: r.social !== false,
    recordatorios: r.recordatorios !== false,
    liga: r.liga !== false,
  };
}

/**
 * Prende o apaga una categoría para todos los teléfonos de la cuenta (sin señal falla: no pasa por la cola, es un
 * ajuste que se ve al momento). Pone al día el perfil guardado y devuelve las cuatro como quedaron en la base.
 */
export async function setPushPref(uid: string, category: PushCategory, on: boolean): Promise<PushPrefs> {
  const prefs = toPushPrefs(await rpc('set_push_prefs', { p_prefs: { [category]: on } }));
  const key = keys.profile(uid);
  const cached = queryClient.getQueryData<{ pushPrefs?: PushPrefs } | null>(key);
  if (cached) queryClient.setQueryData(key, { ...cached, pushPrefs: prefs });
  invalidate(tags.profile(uid));
  return prefs;
}
