// Edge Function send-push (Deno): manda los avisos de push_outbox con Web Push. Aquí solo se arman las
// dependencias; la lógica y sus pruebas están en core.ts y webpush.ts (sin librerías: solo Web Crypto).
//
// - Sin verificar JWT: la llama pg_net con la cabecera x-cron-secret (supabase/config.toml ya trae
//   [functions.send-push] verify_jwt = false).
// - Secretos: CRON_SECRET (el mismo de Vault 'cron_secret'), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y
//   VAPID_SUBJECT (mailto:…). SUPABASE_URL y SUPABASE_SECRET_KEYS (o SUPABASE_SERVICE_ROLE_KEY) los pone Supabase.
// Pasos completos: README.md de esta carpeta.
import { handleRequest } from './core.ts';
import { createPushSender } from './webpush.ts';

Deno.serve((req: Request) =>
  handleRequest(req, {
    env: (name) => Deno.env.get(name) ?? undefined,
    fetch: (input, init) => fetch(input, init),
    createSender: (keys, fetchFn) => createPushSender(keys, fetchFn),
  }),
);
