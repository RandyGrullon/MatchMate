/**
 * Clave pública VAPID de las notificaciones push (es pública: va en la app).
 * La privada NO va en el código: es un secreto del envío programado (GitHub Actions, VAPID_PRIVATE_KEY).
 */
export const VAPID_PUBLIC_KEY = 'BIQdP6vz6HHBgHgeNfSu12KN_LId4N6h1ISmFobGUoUGqaGOYqAYhvitoxVLVOha8EQkGNLvI3i1tY45vW3i_lY';

/**
 * Servicios de push de los teléfonos y navegadores (Chrome/Android, Safari/iPhone, Firefox, Edge).
 * Solo se guardan y se usan direcciones de estos (la misma lista está en las reglas de Firestore).
 */
export const PUSH_ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
