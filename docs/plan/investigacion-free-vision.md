**Recomendación.** Usa como lector principal una Supabase Edge Function que llama a la Gemini API gratis con una "auth key" de AI Studio. La función encadena modelos gratis de Google: `gemini-3.5-flash-lite`, luego `gemini-3.1-flash-lite`, luego Gemma 4. Si Google no tiene cupo, pasa a Cloudflare Workers AI (plan gratis), y como último recurso queda la entrada manual que ya existe. Leer la foto en el teléfono no sirve como principal. Firebase AI Logic en Spark solo sirve como puente temporal.

## (a) Gemini API gratis desde una Edge Function (principal)
- **Sin tarjeta:** el nivel Free solo pide un proyecto activo, sin cuenta de facturación. Los límites son **por proyecto, no por key**, se ven en AI Studio y el cupo diario se reinicia a medianoche del Pacífico. Eso es 3:00–4:00 AM en RD, así que una noche de liga nunca cruza el reinicio ([rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)).
- **Cupo:** Google ya no publica los números. Lo reportado en septiembre 2026 es:
  - Flash-Lite 3.5 y 3.1: unas 500 peticiones al día cada uno, en cubos separados ([scriptbyai](https://www.scriptbyai.com/gemini-api-free-tier-limits/)). Otros sitios dicen 1.500 y 30 por minuto ([freellm](https://freellm.net/models/google-gemini/gemini-3-5-flash-lite)).
  - Flash 3.5–3.8: solo unas 20 al día.
  - Gemma 4 (`gemma-4-26b-a4b-it` y `-31b-it`) es gratis y acepta imágenes ([pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemma en la API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)). Se reportan unas 1.500 al día, sin verificar. Pedirle el JSON en el prompt en lugar de `responseSchema`.
- **RD sí está** en la lista de regiones ([available-regions](https://ai.google.dev/gemini-api/docs/available-regions)). Lo que cuenta es de dónde sale la llamada, o sea el servidor de la función. Desde la UE, Reino Unido o Suiza el nivel gratis da el error "User location is not supported… without a billing account" ([foro](https://discuss.ai.google.dev/t/400-user-location-is-not-supported-for-the-api-use-without-a-billing-account-linked-error/5255)). Por eso hay que fijar la función en **us-east-1** con `region: FunctionRegion.UsEast1` o `x-region` ([regional invocation](https://supabase.com/docs/guides/functions/regional-invocation)).
- **Keys en 2026:** la Gemini API rechaza las keys estándar sin restricciones, y desde el 28-may-2026 las keys nuevas de AI Studio son "auth keys", limitadas a Gemini. Se envían en el header `x-goog-api-key` y la key nunca va en el cliente ([api-key](https://ai.google.dev/gemini-api/docs/api-key), [Truffle](https://trufflesecurity.com/blog/google-fixes-the-gemini-api-key-privilege-escalation-issue)).
- **Términos del nivel gratis** ([terms](https://ai.google.dev/gemini-api/terms)):
  - Google puede usar las fotos para mejorar sus productos, con revisión humana.
  - Piden "no enviar información personal". Los nombres en la pantalla lo son en grado menor; hay que avisarlo en la política de privacidad.
  - **Solo mayores de 18**, y la app no puede estar dirigida a menores. Encaja con la regla de que no hay cuentas de menores; además hay que desactivar el escaneo en ligas con menores.
  - **UE, Reino Unido y Suiza solo pueden usar el nivel pago.** Importa si MatchMate llega a España por el pádel: ahí se apaga el escaneo con IA.
- **Límites de Supabase Free:** 500k invocaciones al mes, 2 s de CPU, 150 s de tiempo total y 256 MB ([limits](https://supabase.com/docs/guides/functions/limits)). Alcanza: la función solo reenvía el base64 que el cliente ya comprime (1600 px, ≤700 KB) y no decodifica la imagen.

## (b) Firebase AI Logic en un proyecto Spark solo para la IA
- Desde el **2-nov-2026** App Check es obligatorio y no se puede apagar ([AI Logic App Check](https://firebase.google.com/docs/ai-logic/app-check)).
- reCAPTCHA Enterprise **no necesita facturación**. Sin ella queda en el nivel Essentials: 10.000 verificaciones al mes por organización, sumando todos los sitios. Pasado eso da error 429 hasta el día 1 del mes siguiente ([billing](https://docs.cloud.google.com/recaptcha/docs/billing-information)). Con tokens de un solo uso, cada escaneo gasta una verificación, así que el techo es de unos 10.000 escaneos al mes, compartidos con BowlingX si están en la misma organización.
- Los términos de datos son los mismos que en (a).
- **Veredicto:** solo como plan B durante la migración. Mantiene dos sistemas de login: los usuarios de Supabase no existen en Firebase, así que no hay límite por usuario real, y se carga reCAPTCHA en cada escaneo. Eso va en contra de "todo a Supabase".

## (c) Leer la foto en el teléfono
No encontré ninguna prueba publicada sobre pantallas de boliche; lo de abajo es mi estimación a partir de datos generales.

| Opción | Descarga | Qué esperar |
|---|---|---|
| Tesseract.js | ~10 MB | Mala con fotos en ángulo, moiré y tablas. En recibos fotografiados, PaddleOCR saca 82% contra 58% de Tesseract ([codesota](https://www.codesota.com/ocr/paddleocr-vs-tesseract)) |
| PaddleOCR v5 (onnxruntime-web) | modelo "mobile" pequeño, hasta ~90 MB con el detector "server" ([monkt](https://huggingface.co/monkt/paddleocr-onnx)) | Da líneas de texto con su posición, pero habría que escribir un lector de tabla para cada sistema (QubicaAMF, Brunswick). Frágil |
| Florence-2-base-ft | ~225–275 MB ([archivos](https://huggingface.co/onnx-community/Florence-2-base-ft)) | Texto plano sin estructura |
| SmolVLM-256M | ~190 MB | Débil en tablas densas |
| Qwen3.5-0.8B | ~850 MB ([onnx-community](https://huggingface.co/onnx-community/Qwen3.5-0.8B-ONNX)) | El mejor de los pequeños en OCR, pero lento en un teléfono medio y con riesgo de quedarse sin memoria |
| Qwen3-VL-2B | ~1,2 GB | Igual, más pesado |
| Chrome Prompt API (Gemini Nano) | — | **No funciona en Android ni iOS** ([Chrome](https://developer.chrome.com/docs/ai/prompt-api)) |

- WebGPU llega a cerca del 70% de los móviles ([webo360](https://webo360solutions.com/blog/webgpu-browser-support/)).
- **Veredicto:** no sirve como principal. Le cuesta al jugador cientos de MB de datos prepago y batería, y ninguna opción se acerca al 32/32 de flash-lite.

## (d) Otras APIs gratis con visión

| Servicio | Gratis | Capacidad real | Veredicto |
|---|---|---|---|
| **Cloudflare Workers AI** | 10.000 "neurons" al día, se reinicia a las 00:00 UTC, que son las **8 PM en RD**, en plena noche de liga. Modelos con visión: llama-4-scout, mistral-small-3.1, gemma-3-12b, qwen3.8-27b ([modelos](https://developers.cloudflare.com/workers-ai/models/), [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/index.md)) | Unos 72–80 neurons por foto (~2k tokens de entrada, 300 de salida), así que **~125–140 escaneos al día** | **Mejor respaldo con otro proveedor** |
| Groq | Solo `qwen/qwen3.8-27b` tiene visión; cada imagen cuesta 2.048 tokens ([vision](https://console.groq.com/docs/vision)). 30 por minuto, 1.000 al día, 8K tokens por minuto, 200K al día | **~65 al día, 2–3 por minuto** (lo limitan los tokens) | Respaldo de emergencia |
| OpenRouter `:free` | 20 por minuto, **50 al día**. 1.000 al día solo tras comprar $10 de créditos una vez ([limits](https://openrouter.ai/docs/api-reference/limits)) | 50 al día | No es gratis de verdad |
| Mistral | El plan gratis Experiment se cambió por $10 al mes en créditos entre agosto y septiembre de 2026 ([agentdeals](https://agentdeals.dev/vendor/mistral-ai)) | — | Descartar |
| GitHub Models | Cerrado el 30-jul-2026 ([agentdeals issue](https://github.com/robhunter/agentdeals/issues/1672)) | — | Descartar |

## Diseño recomendado para la función `scan-bowling`
1. **Login obligatorio.** Dejar `verify_jwt = true` y sacar el `user.id` del token ([auth](https://supabase.com/docs/guides/functions/auth)). Luego una función `can_scan(user, event)`: que el usuario esté en el evento, que sea de boliche, que el evento esté abierto y que la liga no tenga menores.
2. **Validar la foto:** solo `image/jpeg` en base64 de ≤1 MB. CORS limitado al dominio de MatchMate.
3. **Límite por usuario hecho en Postgres,** gratis y sin Upstash. La tabla solo la toca el service_role:
```sql
create table scan_usage(user_id uuid references auth.users on delete cascade, day date, n int not null default 0,
  last_at timestamptz, primary key(user_id, day));
alter table scan_usage enable row level security; -- sin políticas
create function consume_scan(p_user uuid, p_daily int, p_gap_s int, p_global int) returns text
language plpgsql security definer set search_path=public as $$
declare d date := (now() at time zone 'America/Los_Angeles')::date; ok boolean;  -- mismo día que el cupo de Google
begin
  if (select coalesce(sum(n),0) from scan_usage where day=d) >= p_global then return 'global'; end if;
  insert into scan_usage values (p_user, d, 1, now())
  on conflict (user_id, day) do update set n=scan_usage.n+1, last_at=now()
    where scan_usage.n < p_daily and scan_usage.last_at < now() - make_interval(secs => p_gap_s)
  returning true into ok;
  return case when ok then 'ok' else 'user' end;
end $$;
revoke execute on function consume_scan from public, anon, authenticated;
```
   Valores sugeridos: 40 fotos al día por usuario, 8 s entre fotos y un tope global de 900 al día, por debajo del cupo de Google.
4. **Caché por foto.** Guardar el resultado con el SHA-256 del base64 durante 24 h. Reintentar la misma foto no gasta cupo.
5. **Cadena de modelos** llamando a `generativelanguage.googleapis.com/v1beta/models/{m}:generateContent` con `x-goog-api-key` y `AbortSignal.timeout(30000)`:
   - Si responde 429 o un error 5xx, pasa al siguiente modelo.
   - Si todo Google falla, va a Cloudflare con un token que solo sirva para Workers AI.
   - Una respuesta del respaldo solo se acepta sola si `matchesTotal` sale true. Si no, queda "por revisar" en las aprobaciones del admin.
   - Hay que volver a pasar las 32 fotos de prueba por 3.1 Flash-Lite, Gemma 4 y el modelo de Cloudflare antes de activarlos.
6. **Secretos:** `GEMINI_API_KEY` y `CF_AI_TOKEN` como secretos de Supabase, nunca como `VITE_*`. Proyecto de Google propio para MatchMate. Crear varios proyectos para multiplicar el cupo va contra los términos de Google APIs ([§2.d](https://developers.google.com/terms)).
7. **Cliente:** reusar la cola en segundo plano que ya existe (`scanJobs`), con reintentos cada vez más espaciados cuando la respuesta sea "sin cupo".

## Capacidad contra carga
- **Carga (tu ejemplo):** 10 ligas × 30 fotos = 300 escaneos si todas juegan la misma noche; con reintentos, unos 360. Si cada liga juega una vez por semana, son unos 1.300 al mes.
- **Picos:** puede haber unas 100 fotos en 5 minutos (≈20 por minuto) si todos los juegos terminan a la vez. Eso pasa del límite por minuto de un solo modelo. Lo absorben la cola y el reparto entre modelos con cupos separados.
- **Cupo gratis por día:**
  - Flash-Lite 3.5 + 3.1: **~1.000**, entre 2,8 y 3,3 veces la peor noche.
  - Con Gemma 4: unos 2.500, sin verificar.
  - Cloudflare suma unos 130 y Groq unos 65.
  - Supabase: unas 11.000 invocaciones al mes contra 500.000.
- **Techo aproximado:** unas 33 noches de liga el mismo día, o más de 100 ligas semanales repartidas en la semana.

## Dos cosas para BowlingX (solo informativo, no toqué nada)
- El segundo modelo actual, `gemini-3.8-flash`, tiene unas 20 fotos gratis al día; casi no sirve de respaldo. `gemini-3.1-flash-lite` sería mejor segundo modelo porque tiene su propio cupo de ~500.
- El código ya usa App Check con reCAPTCHA Enterprise y tokens de un solo uso. Antes del **2-nov-2026** hay que confirmar tres cosas: que `VITE_RECAPTCHA_SITE_KEY` esté puesta en Vercel producción, que App Check esté obligatorio en la consola de Firebase para AI Logic y que la protección contra reutilización de tokens esté activa. Y recordar el techo de 10.000 verificaciones al mes.

Archivos que leí (sin cambios): `C:\Users\rgrullon\code\bowlinx\src\lib\scan.ts`, `C:\Users\rgrullon\code\bowlinx\src\lib\scan-result.ts`, `C:\Users\rgrullon\code\bowlinx\src\lib\image.ts`

Otras fuentes: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [AI Logic quotas](https://firebase.google.com/docs/ai-logic/quotas), [Supabase rate limiting](https://supabase.com/docs/guides/functions/examples/rate-limiting), [Supabase pausa de proyectos inactivos](https://supabase.com/docs/guides/platform/free-project-pausing), [Groq rate limits](https://console.groq.com/docs/rate-limits), [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/index.md), [Malwarebytes sobre keys públicas usadas con Gemini](https://www.malwarebytes.com/blog/news/2026/02/public-google-api-keys-can-be-used-to-expose-gemini-ai-data), [mindfire sobre recortes del nivel gratis](https://www.mindfiretechnology.com/blog/archive/google-quietly-ruins-gemini-s-free-tier)