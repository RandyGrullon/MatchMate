# insignias

El motor de las insignias automáticas (docs/insignias.md §3.1). La base anota en `private.badge_queue` lo que hay que
revisar (resultados, eventos, meses, temporadas…); esta función toma esos trabajos, pide a la base los datos de cada
uno, corre el motor puro de `src/badges` y le devuelve a la base lo que hay que dar, retirar o avisar.

```
cambios en resultados ──trigger──▶ private.badge_queue ◀── mm-insignias-diario (04:30 UTC): private.badges_daily
pg_cron mm-insignias cada 10 min ─► private.cron_badges()
                                      ├─ avisos agrupados que ya tocan (push_outbox → send-push)
                                      └─ si hay trabajos vencidos: pg_net ─► insignias (x-cron-secret)
insignias ─► badge_claim(5) … hasta 25 ─► por trabajo: badge_snapshot ─► evaluateJob (motor) ─► badge_apply
                                                      (si algo falla: badge_fail, vuelve en 2^intentos minutos;
                                                       si no alcanzó a correr: badge_release, vuelve ya)
          └─► badge_finish: avisos y, si queda cola, pg_net ─► insignias (otra corrida)
```

| Archivo | Qué es |
|---|---|
| `index.ts` | Entrada de Deno: solo arma las dependencias. |
| `core.ts` | La lógica (secreto, tandas, foto → motor → aplicar, límites de tiempo y CPU, API REST). Sin imports. |
| `../_shared/badges-engine.gen.js` | El motor: `src/badges/edge.ts` y todo lo que importa en un solo ESM sin imports. **Generado** con `pnpm badges:bundle` (`scripts/badges/bundle.mjs`); no se edita a mano. Su `.d.ts` le da los tipos a Deno. |

Pruebas: `src/badges/edgeFunction.test.ts` (Vitest, base falsa: tandas, errores, cortes por tiempo y CPU),
`src/badges/bundle.test.ts` (el archivo generado está al día y da lo mismo que `src/badges`), `src/badges/edge.test.ts`
(nombres para el push) y `tests/sql/insignias-funcion.test.ts` (de punta a punta: la base de verdad en PGlite, esta
función y el motor empaquetado; y el cron contra un pg_cron de mentira).

## Cada vez que cambia el motor

Cualquier cambio en `src/badges` (o en los helpers de `src/lib` y `src/sports` que usa) cambia el hash de la cabecera
del motor empaquetado y `src/badges/bundle.test.ts` falla hasta que se genera otra vez:

```sh
pnpm badges:bundle            # escribe supabase/functions/_shared/badges-engine.gen.js y .d.ts
pnpm badges:bundle --check    # solo revisa (sale con 1 si está viejo)
```

Se sube el archivo generado con el cambio y se despliega la función otra vez (abajo, paso 4). La respuesta de cada
llamada trae `engine` (el hash): así se sabe qué versión del motor está corriendo.

## Poner en marcha (una vez por proyecto: staging y producción)

Usa lo mismo que `send-push` (su README y `docs/CONFIGURAR-SUPABASE.md`, pasos 9 y 10): si ya está andando, solo
faltan los pasos 3 y 4.

1. **Secreto del cron** (el mismo de send-push): `CRON_SECRET` en los secretos de las funciones
   (`supabase secrets set CRON_SECRET=<secreto>` o `supabase/functions/.env`). `SUPABASE_URL` y `SUPABASE_SECRET_KEYS`
   (o `SUPABASE_SERVICE_ROLE_KEY` con las claves viejas) los pone Supabase.
2. **Vault** (ya están si send-push funciona): `project_url` y `cron_secret` (el mismo valor que `CRON_SECRET`):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<el mismo secreto>', 'cron_secret');
   ```
3. **Migraciones**: `supabase db push` aplica `20260929001100`, `…1110`, `…1120`, `…1180` y `…1190_insignias_cron_supabase.sql`
   (esta programa `mm-insignias` y `mm-insignias-diario`).
4. **Desplegar** sin verificar JWT (la llama pg_net con `x-cron-secret`, no con una sesión): `supabase/config.toml` ya
   trae `[functions.insignias] verify_jwt = false`, así que basta
   `supabase functions deploy insignias --project-ref <ref>` (sube también `_shared/badges-engine.gen.js`).
5. **Ver que corre**: `select * from cron.job where jobname like 'mm-insignias%';`,
   `select * from cron.job_run_details order by start_time desc limit 20;` y los registros de la función en el panel.
   Trabajos que fallaron 5 veces: Consola › Insignias › Motor («Reintentar» o «Borrar»), o en SQL
   `select id, kind, ref, attempts, last_error from private.badge_queue where attempts >= 5;`.

La primera corrida sobre lo que ya existe (historial, §3.5) no la hace el cron: la pide el superadmin en Consola ›
Insignias › Motor («Correr en seco», que llama `badges_backfill`: un trabajo por liga y uno por cuenta), compara con
la rareza estimada y después «Correr de verdad».

## Respuestas y registro

- `401` sin el secreto; `405` si no es POST; `503` si falta configuración (`CRON_SECRET` de menos de 16 letras,
  `SUPABASE_URL` o la clave secreta); `502` si no pudo leer la cola o cerrar la corrida.
- `200 {claimed, applied, failed, gone, released, decisions, awarded, revoked, reviews, progress, notices, remaining,
  chained, stopped, engine}`: `gone` = el trabajo ya no existía; `released` = tomados que no alcanzaron a correr
  (vuelven a la cola ya con `badge_release`, sin gastar un intento); `stopped` = `'tiempo'` o `'cpu'` si cortó antes; `chained` = la base pidió otra corrida.
- En el registro van números, ids de trabajos, su tipo y el error del motor (nunca nombres ni datos de la foto).

Límites del plan gratis: 2 s de CPU y 150 s por llamada. La función corta a los 100 s o cuando el motor lleva ~1,2 s
de CPU (medida aparte de esperar la red) y la base la vuelve a llamar si queda cola. Un trabajo que solo, por su
tamaño, pasa los 2 s de CPU tumba la llamada: queda tomado 10 minutos, se reintenta y a los 5 intentos queda para el
superadmin con `last_error` vacío. El intento lo cuenta `badge_snapshot` (el que de verdad se probó), no `badge_claim`:
los demás de la tanda que no alcanzaron a correr no pierden intentos.

Probar a mano (con el secreto):
```sh
curl -X POST https://<ref>.supabase.co/functions/v1/insignias -H "x-cron-secret: <secreto>" -d '{"limit": 5}'
```
