/**
 * Clave pública VAPID de las notificaciones push (es pública: va en la app), de VITE_VAPID_PUBLIC_KEY.
 *
 * MatchMate usa un par nuevo, nunca el de BowlingX: el dueño lo genera una vez (`npx web-push generate-vapid-keys`)
 * y pone la pública en VITE_VAPID_PUBLIC_KEY (.env.local y Vercel) y en el secreto VAPID_PUBLIC_KEY de la Edge
 * Function send-push. La privada va SOLO en los secretos de send-push (VAPID_PRIVATE_KEY), nunca en el código.
 * Sin la clave (desarrollo, demo local) no hay push: la app sigue avisando mientras está abierta.
 */
export function vapidPublicKey(): string {
  return String(import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim();
}

/** Hay clave (65 bytes en base64url = 87 letras): se puede suscribir el teléfono a los recordatorios. */
export const pushConfigured = () => /^[A-Za-z0-9_-]{87}$/.test(vapidPublicKey());

/**
 * Servicios de push de los teléfonos y navegadores (Chrome/Android, Safari/iPhone, Firefox, Edge).
 * Solo se guardan y se usan direcciones de estos (la misma lista está en el CHECK de push_subscriptions).
 */
export const PUSH_ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
