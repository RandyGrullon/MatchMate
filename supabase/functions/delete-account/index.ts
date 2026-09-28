// Edge Function delete-account (Deno): borra la cuenta de quien la llama («Borrar mi cuenta» en Configuración).
// Aquí solo se arman las dependencias; toda la lógica (y sus pruebas) está en ./core.ts.
//
// Configuración (Supabase › Edge Functions), pasos en docs/CONFIGURAR-SUPABASE.md (paso 9):
// - supabase/config.toml: [functions.delete-account] verify_jwt = false. Con las claves nuevas (sb_publishable /
//   sb_secret) el gateway no valida el JWT: se valida aquí con auth.getClaims.
// - Secreto: SCAN_ALLOWED_ORIGINS (los orígenes de la app, el mismo de scan-bowling).
// - SUPABASE_URL, SUPABASE_SECRET_KEYS y SUPABASE_PUBLISHABLE_KEYS los pone Supabase (con las claves viejas:
//   SUPABASE_SERVICE_ROLE_KEY y SUPABASE_ANON_KEY).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleDeleteRequest, parseOrigins, type DeleteDeps } from './core.ts';

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
const configError = !url ? 'falta SUPABASE_URL' : !secret ? 'falta la clave secreta' : !publishable ? 'falta la clave publicable' : null;

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = url && secret ? createClient(url, secret, options) : null;

const deps: DeleteDeps = {
  allowedOrigins: parseOrigins(env('SCAN_ALLOWED_ORIGINS')),
  configError,
  getClaims: async (token) => {
    const { data, error } = await admin!.auth.getClaims(token);
    return { data: data ? { claims: data.claims as unknown as Record<string, unknown> } : null, error };
  },
  // Como la cuenta (su JWT): la misma revisión que ve la app, con require_uid (una cuenta bloqueada no pasa).
  prepare: async (token) => {
    const asUser = createClient(url!, publishable!, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await asUser.rpc('prepare_delete_account');
    return { data, error };
  },
  deleteUser: async (userId) => {
    const { error } = await admin!.auth.admin.deleteUser(userId);
    return { error: error ? { message: error.message, code: (error as { code?: string }).code, status: error.status, name: error.name } : null };
  },
  log: (message, extra) => console.warn(message, extra ?? ''),
};

Deno.serve((req: Request) => handleDeleteRequest(req, deps));
