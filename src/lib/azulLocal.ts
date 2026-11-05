import { RESPONSE_HASH_FIELDS, azulHash, type AzulConfig } from '../../supabase/functions/azul-pay/core';

/**
 * Pagar con Azul en el modo local (PGlite, sin Supabase ni Azul): la Edge Function azul-pay la hace
 * src/lib/backend/local.ts con esta configuración, y en vez de la Página de Pagos de Azul se abre el simulador de la
 * app (src/pages/dev/AzulSimulatorPage.tsx, `/dev/azul`), que firma su respuesta con la misma clave. Así se prueba el
 * camino completo (formulario firmado, vuelta, firma revisada, promoción activa) sin cobrar nada. Nada de esto sirve
 * fuera del modo local: la clave es de mentira y Azul no la conoce.
 */
export const LOCAL_AZUL_URL = '/dev/azul';
export const LOCAL_AZUL_KEY = 'clave-local-de-prueba-0000000000';

export function localAzulConfig(origin: string): AzulConfig {
  return {
    merchantId: '00000000000',
    merchantName: 'MatchMate (prueba local)',
    merchantType: 'ECommerce',
    currencyCode: '$',
    authKey: LOCAL_AZUL_KEY,
    env: 'pruebas',
    appUrl: origin,
    itbisPct: 18,
  };
}

/** Lo que firma Azul al volver (aprobado o declinado), con la clave de prueba del modo local. */
export async function simulatedAzulResponse(fields: Record<string, string>, approve: boolean, now = new Date()): Promise<Record<string, string>> {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const p: Record<string, string> = {
    OrderNumber: fields.OrderNumber ?? '',
    Amount: fields.Amount ?? '',
    ITBIS: fields.ITBIS ?? '',
    AuthorizationCode: approve ? `L${stamp.slice(-5)}` : '',
    DateTime: stamp,
    ResponseCode: 'ISO8583',
    IsoCode: approve ? '00' : '51',
    ResponseMessage: approve ? 'APROBADA' : 'DECLINADA',
    ErrorDescription: '',
    RRN: `${stamp}${(fields.OrderNumber ?? '').padStart(6, '0')}`,
    AzulOrderId: `9${(fields.OrderNumber ?? '').padStart(7, '0')}`,
  };
  p.AuthHash = await azulHash(RESPONSE_HASH_FIELDS.map((f) => p[f]).join('') + LOCAL_AZUL_KEY, LOCAL_AZUL_KEY);
  return p;
}

/** Junta la URL de vuelta con la respuesta (la de Azul no lleva query; si lleva, se agrega con &). */
export function withQuery(url: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${q}`;
}
