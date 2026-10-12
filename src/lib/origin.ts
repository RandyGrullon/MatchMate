/**
 * El dominio de la app: https://matchmate.grullonb.com. Los links que se comparten (invitar, QR, partidos, ligas,
 * transmisiones, equipos) salen siempre con él. La dirección vieja de Vercel sigue abriendo la app y sus QR impresos se
 * siguen leyendo, pero ya no se reparte.
 */
export const APP_ORIGIN = 'https://matchmate.grullonb.com';

/** Direcciones anteriores de producción (los QR y links que ya andan por ahí). */
export const OLD_ORIGINS: readonly string[] = ['https://matchmate-oficial.vercel.app'];

/**
 * El origen para los links que se comparten: en producción (en cualquiera de sus direcciones) el dominio de la app; en
 * desarrollo o en una vista previa, donde corre (para poder probar los links ahí mismo).
 */
export function shareOrigin(current: string | null = typeof location === 'undefined' ? null : location.origin): string {
  if (!current || current === APP_ORIGIN || OLD_ORIGINS.includes(current)) return APP_ORIGIN;
  return current;
}
