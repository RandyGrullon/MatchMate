# send-push

Manda los avisos push (recordatorios de prácticas y torneos) que la base deja en `push_outbox`. Reemplaza al
GitHub Actions de BowlingX (`recordatorios.yml`), que GitHub apaga tras 60 días sin cambios.

```
pg_cron cada 15 min ─► private.cron_reminders()
                         ├─ private.enqueue_due_reminders(now())  → reminders_sent + push_outbox (1 fila por teléfono)
                         └─ si hay cola: pg_net ─► send-push (x-cron-secret)
send-push ─► claim_push_batch(50) ─► Web Push (10 a la vez) ─► finish_push_batch(resultados)
                                                                 └─ si queda cola: pg_net ─► send-push (otro lote)
```

| Archivo | Qué es |
|---|---|
| `index.ts` | Entrada de Deno: solo arma las dependencias. |
| `core.ts` | La lógica (secreto, lotes, qué hacer con cada respuesta, API REST). Sin imports. |
| `webpush.ts` | Web Push con Web Crypto: cifrado RFC 8291 (aes128gcm) y firma VAPID RFC 8292. Sin imports ni librerías. |

Pruebas: `src/lib/pushSend.test.ts` y `src/lib/pushWebpush.test.ts` (Vitest; incluye el vector del RFC 8291) y
`tests/sql/push.test.ts` (de punta a punta con la base: cron → cola → send-push → «teléfono» que descifra).

## Poner en marcha (una vez por proyecto: staging y producción)

Paso a paso para el dueño: `docs/CONFIGURAR-SUPABASE.md`, pasos 9 y 10. En resumen:

1. **Claves VAPID nuevas** (nunca las de BowlingX):
   ```sh
   npx web-push generate-vapid-keys
   ```
   - La pública va en la app: `VITE_VAPID_PUBLIC_KEY` (`.env.local` y Vercel) — ver `src/lib/pushKey.ts`.
   - Las dos van en los secretos de la función (abajo). La privada nunca va en el código.
2. **Secreto del cron**: una cadena al azar de 32 letras o más (por ejemplo `openssl rand -hex 32`).
3. **Secretos de la función**:
   ```sh
   supabase secrets set CRON_SECRET=<secreto> VAPID_PUBLIC_KEY=<pública> VAPID_PRIVATE_KEY=<privada> VAPID_SUBJECT=mailto:<correo>
   ```
   `SUPABASE_URL` y `SUPABASE_SECRET_KEYS` (o `SUPABASE_SERVICE_ROLE_KEY` con las claves viejas) los pone Supabase.
4. **Vault** (SQL Editor del proyecto):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<el mismo secreto del paso 2>', 'cron_secret');
   ```
5. **Desplegar** sin verificar JWT (la llama pg_net con `x-cron-secret`, no con una sesión): `supabase/config.toml`
   ya trae `[functions.send-push] verify_jwt = false`, así que basta `supabase functions deploy --project-ref <ref>`.
6. Las migraciones `20260926001200_push.sql` y `20260926001300_cron_supabase.sql` programan todo. Para ver que
   corre: `select * from cron.job;` y `select * from cron.job_run_details order by start_time desc limit 20;`.

## Respuestas y registro

- `401` sin el secreto; `503` si falta configuración (`CRON_SECRET`, claves VAPID); `502` si no pudo leer o
  guardar la cola.
- `200 {claimed, sent, gone, retry, failed, expired, remaining, chained, pinged}`.
- En el registro solo van números (nunca direcciones de teléfonos, nombres ni textos).

Qué pasa con cada respuesta del servicio de push: 2xx enviado; 404/410 se borra el teléfono; 429, 5xx o sin
respuesta se reintenta (hasta 5 veces, con 3 minutos de espera como mínimo); otro 4xx no se reintenta y 3 seguidos
borran el teléfono. Un aviso vencido (su TTL llega hasta la hora del evento) no se manda.

Probar a mano (con el secreto):
```sh
curl -X POST https://<ref>.supabase.co/functions/v1/send-push -H "x-cron-secret: <secreto>" -d '{}'
```
