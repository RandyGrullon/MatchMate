// Edge Function esports-auth (Deno): «Conectar con Steam / Epic / Riot» (docs/esports.md §8.3). Aquí solo se arman
// las dependencias; toda la lógica (y sus pruebas) está en ./core.ts y los adaptadores en
// ../_shared/esports-providers.ts.
//
// Configuración (Supabase › Edge Functions), pasos en docs/CONFIGURAR-SUPABASE.md (paso 9b):
// - supabase/config.toml: [functions.esports-auth] verify_jwt = false (la vuelta del proveedor llega sin JWT; /start
//   valida el JWT aquí con auth.getClaims).
// - Secretos, todos opcionales: EPIC_CLIENT_ID + EPIC_CLIENT_SECRET («Conectar con Epic»: Rocket League y Fortnite),
//   RIOT_CLIENT_ID + RIOT_CLIENT_SECRET («Conectar con Riot», solo cuando Riot aprueba RSO), STEAM_WEB_API_KEY (solo el
//   nombre del perfil de Steam al conectar CS2; Steam OpenID no la necesita). Y los de siempre: SCAN_ALLOWED_ORIGINS
//   (orígenes de la app) y, en staging, APP_ORIGIN (a dónde vuelve).
// - URLs de vuelta: {SUPABASE_URL}/functions/v1/esports-auth/{steam|epic|riot}/callback.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createEsportsProviders, providerEnv } from '../_shared/esports-providers.ts';
import { appUrlFrom, handleAuthRequest, parseOrigins, type AuthDeps } from './core.ts';

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

const deps: AuthDeps = {
  allowedOrigins: parseOrigins(env('SCAN_ALLOWED_ORIGINS')),
  configError: !url ? 'falta SUPABASE_URL' : !secret ? 'falta la clave secreta' : null,
  supabaseUrl: url ?? '',
  appUrl: appUrlFrom(env('APP_ORIGIN')),
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

Deno.serve((req: Request) => handleAuthRequest(req, deps));
