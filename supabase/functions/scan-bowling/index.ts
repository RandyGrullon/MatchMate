// Edge Function scan-bowling (Deno): lee la pantalla de la bolera con la Gemini API gratis.
// Aquí solo se arman las dependencias; toda la lógica (y sus pruebas) está en ../_shared/scan-core.ts.
//
// Configuración (Supabase › Edge Functions):
// - supabase/config.toml: [functions.scan-bowling] verify_jwt = false. Con las claves nuevas (sb_publishable /
//   sb_secret) el gateway no valida el JWT: se valida aquí con auth.getClaims (crítica 1).
// - Secretos: GEMINI_API_KEY (auth key de Google AI Studio, proyecto de Google solo de MatchMate) y
//   SCAN_ALLOWED_ORIGINS (orígenes exactos de la app separados por coma, p. ej.
//   `https://matchmate.app,http://localhost:5173`). Opcionales: SCAN_MODELS (por defecto
//   gemini-3.5-flash-lite,gemini-3.1-flash-lite), SCAN_MODEL_RPM (12) y SCAN_TIMEOUT_MS (20000, máximo).
// - SUPABASE_URL y SUPABASE_SECRET_KEYS los pone Supabase (SUPABASE_SERVICE_ROLE_KEY si el proyecto aún usa las
//   claves viejas).
// - Región: la capa gratis de Gemini no funciona desde la UE, el Reino Unido ni Suiza. La app invoca con
//   `region: 'us-east-1'` (x-region) para que corra en us-east-1.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleScanRequest, scanConfig, type ScanDeps } from '../_shared/scan-core.ts';

const env = (name: string) => Deno.env.get(name) ?? undefined;

/** La clave secreta: la nueva (`SUPABASE_SECRET_KEYS`, JSON por nombre) o la vieja service_role. */
function secretKey(): string {
  const keys = env('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      const key = parsed.default ?? Object.values(parsed)[0];
      if (key) return key;
    } catch {
      // Sigue con la vieja.
    }
  }
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!legacy) throw new Error('scan-bowling: falta la clave secreta de Supabase');
  return legacy;
}

const admin = createClient(env('SUPABASE_URL')!, secretKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const deps: ScanDeps = {
  ...scanConfig(env),
  fetch: (url, init) => fetch(url, init),
  getClaims: async (token) => {
    const { data, error } = await admin.auth.getClaims(token);
    return { data: data ? { claims: data.claims as unknown as Record<string, unknown> } : null, error };
  },
  rpc: async (fn, args) => {
    const { data, error } = await admin.rpc(fn, args);
    return { data, error };
  },
  log: (message, extra) => console.warn(message, extra ?? ''),
};

Deno.serve((req) => handleScanRequest(req, deps));
