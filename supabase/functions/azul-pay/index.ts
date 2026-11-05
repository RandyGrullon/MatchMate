// Edge Function azul-pay (Deno): pagar con Azul para destacar un espacio. Aquí solo se arman las dependencias; toda
// la lógica (y sus pruebas) está en ./core.ts.
//
// Configuración (Supabase › Edge Functions › Secrets), pasos en docs/CONFIGURAR-SUPABASE.md (paso 9c):
// - supabase/config.toml: [functions.azul-pay] verify_jwt = false (el JWT se valida aquí con auth.getClaims; la
//   revisión de la vuelta de Azul no lleva JWT: la protege la firma).
// - Secretos que da Azul: AZUL_MERCHANT_ID, AZUL_MERCHANT_NAME, AZUL_AUTH_KEY (y AZUL_MERCHANT_TYPE /
//   AZUL_CURRENCY_CODE si Azul dice otro valor que 'ECommerce' / '$'). AZUL_ENV: 'pruebas' (por defecto) o
//   'produccion'. AZUL_ITBIS_PCT: el ITBIS que va dentro del precio (18 por defecto; 0 = exento).
// - SCAN_ALLOWED_ORIGINS (los orígenes de la app) y, en staging, APP_ORIGIN (a dónde vuelve Azul; el dominio tiene
//   que estar autorizado en Azul).
// - SUPABASE_URL, SUPABASE_SECRET_KEYS y SUPABASE_PUBLISHABLE_KEYS los pone Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handlePayRequest, parseOrigins, readAzulConfig, type PayDeps } from './core.ts';

const env = (name: string) => Deno.env.get(name) ?? undefined;

/** Una clave de Supabase: la nueva (`<NUEVA>` = JSON por nombre) o la vieja. */
function key(modern: string, legacy: string): string | null {
  const keys = env(modern);
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      const k = parsed.default ?? Object.values(parsed)[0];
      if (k) return k;
    } catch {
      // Sigue con la vieja.
    }
  }
  return env(legacy) ?? null;
}

const url = env('SUPABASE_URL');
const secret = key('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const publishable = key('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const azul = readAzulConfig(env);
const configError = !url
  ? 'falta SUPABASE_URL'
  : !secret
    ? 'falta la clave secreta'
    : !publishable
      ? 'falta la clave publicable'
      : 'error' in azul
        ? azul.error
        : null;

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = url && secret ? createClient(url, secret, options) : null;

const deps: PayDeps = {
  allowedOrigins: parseOrigins(env('SCAN_ALLOWED_ORIGINS')),
  config: 'config' in azul ? azul.config : null,
  configError,
  getClaims: async (token) => {
    const { data, error } = await admin!.auth.getClaims(token);
    return { data: data ? { claims: data.claims as unknown as Record<string, unknown> } : null, error };
  },
  // Como la cuenta (su JWT): require_uid, la dueña de la empresa y el precio de la base.
  begin: async (token, venueId, days) => {
    const asUser = createClient(url!, publishable!, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await asUser.rpc('begin_promotion_payment', { p_venue: venueId, p_days: days });
    return { data, error };
  },
  // Con la clave secreta: solo service_role ejecuta finish_payment.
  finish: async (order, status, amount, data) => {
    const res = await admin!.rpc('finish_payment', { p_order: order, p_status: status, p_amount: amount, p_data: data });
    return { data: res.data, error: res.error };
  },
  log: (message, extra) => console.warn(message, extra ?? ''),
};

Deno.serve((req: Request) => handlePayRequest(req, deps));
