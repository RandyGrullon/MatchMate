// Edge Function insignias (Deno): el motor de las insignias automáticas (docs/insignias.md §3.1). Aquí solo se arman
// las dependencias; la lógica y sus pruebas están en core.ts. El motor es _shared/badges-engine.gen.js: src/badges
// empaquetado en un solo archivo sin imports (`pnpm badges:bundle`; src/badges/bundle.test.ts avisa si quedó viejo).
//
// - Sin verificar JWT: la llama pg_net con la cabecera x-cron-secret (supabase/config.toml trae
//   [functions.insignias] verify_jwt = false).
// - Secretos: CRON_SECRET (el mismo de send-push y de Vault 'cron_secret'). SUPABASE_URL y SUPABASE_SECRET_KEYS (o
//   SUPABASE_SERVICE_ROLE_KEY) los pone Supabase.
// Pasos completos: README.md de esta carpeta.
import { handleRequest } from './core.ts';
import { SOURCE_HASH, evaluateJob } from '../_shared/badges-engine.gen.js';

Deno.serve((req: Request) =>
  handleRequest(req, {
    env: (name) => Deno.env.get(name) ?? undefined,
    fetch: (input, init) => fetch(input, init),
    evaluate: (job, snapshot, now) => evaluateJob(job, snapshot, now),
    engine: SOURCE_HASH,
  }),
);
