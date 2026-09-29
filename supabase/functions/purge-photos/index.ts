// Edge Function purge-photos (Deno): borra del bucket 'scoreboards' las fotos que ya no tienen fila (la cola
// private.storage_purge_queue y los archivos huérfanos). Aquí solo se arman las dependencias; la lógica y sus pruebas
// están en core.ts. Lo que comparte con send-push (secreto, clave secreta, API REST) sale de send-push/core.ts.
//
// - Sin verificar JWT: la llama pg_net una vez al día (cron 'mm-limpiar-fotos') con la cabecera x-cron-secret
//   (supabase/config.toml trae [functions.purge-photos] verify_jwt = false).
// - Secretos: CRON_SECRET (el mismo de send-push y de Vault 'cron_secret'). SUPABASE_URL y SUPABASE_SECRET_KEYS (o
//   SUPABASE_SERVICE_ROLE_KEY) los pone Supabase.
// Probar a mano: curl -X POST https://<ref>.supabase.co/functions/v1/purge-photos -H "x-cron-secret: <secreto>" -d '{}'
import { createRestClient, sameSecret, secretKey } from '../send-push/core.ts';
import { handlePurgeRequest } from './core.ts';

Deno.serve((req: Request) =>
  handlePurgeRequest(req, {
    env: (name) => Deno.env.get(name) ?? undefined,
    fetch: (input, init) => fetch(input, init),
    shared: { sameSecret, secretKey, createRestClient },
  }),
);
