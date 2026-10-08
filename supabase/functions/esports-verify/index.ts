// Edge Function esports-verify (Deno): buscar un Riot ID en LoL y VALORANT con la API de Riot y decir qué está
// encendido (docs/esports.md §8.2). Aquí solo se arman las dependencias; toda la lógica (y sus pruebas) está en
// ./core.ts y los adaptadores en ../_shared/esports-providers.ts.
//
// Configuración (Supabase › Edge Functions), pasos en docs/CONFIGURAR-SUPABASE.md (paso 9b):
// - supabase/config.toml: [functions.esports-verify] verify_jwt = false. El JWT se valida aquí con auth.getClaims.
// - Secretos, todos opcionales: RIOT_API_KEY enciende la búsqueda de LoL y VALORANT. `providers` también dice si
//   «Conectar con…» está encendido (EPIC_CLIENT_ID + EPIC_CLIENT_SECRET, RIOT_CLIENT_ID + RIOT_CLIENT_SECRET; Steam
//   siempre). Y el de siempre: SCAN_ALLOWED_ORIGINS (los orígenes de la app).
// - SUPABASE_URL y SUPABASE_SECRET_KEYS los pone Supabase (con las claves viejas: SUPABASE_SERVICE_ROLE_KEY).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createEsportsProviders, providerEnv } from '../_shared/esports-providers.ts';
import { handleVerifyRequest, parseOrigins, type VerifyDeps } from './core.ts';

const env = (name: string) => Deno.env.get(name) ?? undefined;

/** La clave secreta: la nueva (`SUPABASE_SECRET_KEYS`, JSON por nombre) o la vieja service_role. */
function secretKey(): string | null {
  const keys = env('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      const k = parsed.default ?? Object.values(parsed)[0];
      if (k) return k;
    } catch {
      // Sigue con la vieja.
    }
  }
  return env('SUPABASE_SERVICE_ROLE_KEY') ?? null;
}

const url = env('SUPABASE_URL');
const secret = secretKey();
const admin = url && secret ? createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;

const deps: VerifyDeps = {
  allowedOrigins: parseOrigins(env('SCAN_ALLOWED_ORIGINS')),
  configError: !url ? 'falta SUPABASE_URL' : !secret ? 'falta la clave secreta' : null,
  getClaims: async (token) => {
    const { data, error } = await admin!.auth.getClaims(token);
    return { data: data ? { claims: data.claims as unknown as Record<string, unknown> } : null, error };
  },
  rpc: async (fn, args) => {
    const { data, error } = await admin!.rpc(fn, args);
    return { data, error };
  },
  providers: createEsportsProviders(providerEnv(env), (u, init) => fetch(u, init)),
  log: (message, extra) => console.warn(message, extra ?? ''),
};

Deno.serve((req: Request) => handleVerifyRequest(req, deps));
