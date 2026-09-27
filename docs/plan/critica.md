**Correcciones del crítico de completitud (revisé BowlingX 29334d1 y MatchMate f03af51 sin modificar nada)**

**Fase 0A**
1. [Alta] **Claves de Supabase.** Los proyectos nuevos ya no traen las claves `anon` ni `service_role`, y Supabase las retira a fines de 2026.
   - Usar `sb_publishable_…` (VITE_SUPABASE_PUBLISHABLE_KEY) y `sb_secret_…`.
   - Hay que corregir el .env.example, Vercel y los secretos de GitHub.
   - En las Edge Functions, `verify_jwt` no autentica con las claves nuevas. Poner `verify_jwt=false` y validar el JWT del usuario dentro de la función (`auth.getClaims` o `@supabase/server`).
   - pg_net manda la clave secreta en la cabecera `apikey`, no en `Authorization: Bearer`.
   - Esto también corrige «verify_jwt activado» de scan-bowling en 0C.
2. [Alta] **Las cuotas gratis son de la organización y no hay segunda gracia.**
   - Egress 5 GB, Realtime 2 M, Storage 1 GB y las invocaciones se cuentan por organización.
   - Si staging se pasa, tras la gracia todos los proyectos de la organización (también prod) responden 402 hasta el ciclo siguiente.
   - Poner staging en otra organización gratis (verificar que el límite de 2 proyectos lo permite).
   - Ensayar fotos y migración con una muestra pequeña.
3. [Alta] **Escalada de privilegios.** Si existe la política «el usuario edita su perfil», cualquiera puede ponerse `profiles.is_superadmin = true`.
   - Dar permiso de UPDATE solo sobre `name`, o mover el superadmin a `private.superadmins`.
   - Lo mismo aplica a:
     - `leagues.has_minors`: solo se puede subir; bajarlo lo hace solo el superadmin y sin menores en la liga;
     - `players.user_id`: solo por RPC claim;
     - `entries.average` y `handicap_override`: solo el admin.
4. [Alta] **Privilegios por defecto de Supabase.**
   - Toda función en `public` nace ejecutable por anon y authenticated.
   - Toda tabla nace con GRANT ALL.
   - Las vistas saltan la RLS si no tienen `security_invoker`.
   - Primera migración: `alter default privileges in schema public revoke execute on functions from public, anon, authenticated`, más GRANT explícito por cada RPC.
   - Prueba SQL que recorre pg_proc y pg_class y falla si encuentra:
     - una función security definer que anon puede ejecutar y no está en la lista;
     - una tabla sin RLS;
     - una vista sin `security_invoker`.
5. [Alta] **`league_id` copiado y confiado al cliente.** event_rsvps, entries, match_players, live_states, swim_*, reactions y photos tienen `league_id` sin FK, y la RLS filtra por esa columna.
   - Así alguien puede insertar el league_id de su liga con el event_id de otra liga.
   - Usar FK compuestas (event_id, league_id) → events(id, league_id), con `unique(id, league_id)` en la tabla padre, o un trigger BEFORE que copie el valor del padre.
   - Lo mismo con (player_id, league_id) en submissions, entries y team_players.
6. [Media] **`comments (like reactions … excluding constraints)` sale sin PK, sin FK y sin CHECK.** Quedan comentarios sin cascada al borrar y sin tombstones. Crear la tabla de forma explícita.
7. [Media] **Tablas que se sincronizan sin lo necesario.**
   - team_players, match_sides, match_players, suggestions (su campo `read` cambia) y photos no tienen `updated_at` o `league_id`.
   - tombstones no tiene índice.
   - Regla: toda tabla sincronizada lleva league_id, updated_at e índice (league_id, updated_at). tombstones lleva índice (league_id, deleted_at).
8. [Media] **No crear ya matches, match_* ni swim_*.** Se diseñan antes de conocer el deporte y agregan superficie de RLS que hay que probar sin usarla. Cada fase trae su migración.
   - `sport` como texto con FK a `sport_status` en lugar de enum, para agregar softbol y voleibol sin ALTER TYPE.
9. [Media] **Trigger de perfil en `auth.users`.** Si falla (nombre de Google vacío o de más de 60 caracteres), el registro completo falla con «Database error saving new user».
   - Usar coalesce(full_name, parte del correo antes de la @) y left(…, 60), con una prueba.
   - `leagues.owner_id` sin ON DELETE impide borrar la cuenta de un dueño: hace falta un flujo para traspasar la liga.
10. [Media] **Menores.**
    - El CHECK no basta: un trigger debe exigir `has_minors = true` para agregar un jugador con `is_minor` e impedir apagarlo mientras haya menores.
    - Guardar el consentimiento del padre o tutor (quién lo registró y cuándo).
    - Faltan «Eliminar mi cuenta» y «Exportar mis datos» (Ley 172-13): 1 día.
11. [Media] **Google OAuth.** Por el redirect de Supabase, Google muestra «continuar a xxxx.supabase.co», que parece phishing (el dominio propio de Supabase es de pago).
    - Vía principal: Google Identity Services más `signInWithIdToken` con nonce. El redirect queda de respaldo.
    - La verificación de marca en Google pide política de privacidad y el dominio verificado (se puede con una meta etiqueta en matchmate.vercel.app).
12. [Media] **SMTP.** Brevo reemplaza los remitentes gratis (@gmail) y no permite autenticar dominios gratis, así que sin dominio propio no sirve.
    - Usar Gmail con contraseña de aplicación: exige verificación en 2 pasos y da unos 500 correos al día.
    - Probar la entrega en Gmail, Outlook e iCloud.
    - Activar «Confirm email».
    - Poner Cloudflare Turnstile (gratis) en el registro y en recuperar contraseña, para que no quemen el cupo de correo.
13. [Media] **Pruebas en PGlite.**
    - PGlite corre como superusuario, así que la RLS no se aplica y las pruebas salen verdes aunque estén mal.
    - No tiene auth, storage, realtime, pg_cron, pg_net ni vault.
    - Hay que crear los roles anon y authenticated, hacer `set role` y poner stubs.
    - La puerta de salida es pgTAP con `supabase start`. Las políticas de Storage y de realtime.messages solo se prueban ahí.
14. [Media] **Minutos de CI.** Un repo privado tiene 2.000 min/mes gratis.
    - Con pushes frecuentes a main, `supabase start` (descarga de Docker de 3–6 min) más e2e en cada push más el respaldo diario se pasan.
    - En cada push: typecheck, unitarias, PGlite y build.
    - pgTAP y e2e: nightly o con filtro por rutas.
15. [Baja] **Nombre y hosting.**
    - Ya existe «MatchMate Tennis» (productos y canchas de tenis) y apps parecidas como «Padel Mates». Revisar ONAPI y las tiendas antes de hacer los iconos.
    - Vercel Hobby prohíbe el uso comercial y no despliega repos de una organización. Dejar el repo en la cuenta personal; si algún día se cobra, pasar a Cloudflare Pages.

**Fase 0B**
16. [Alta] **El cursor por `updated_at` pierde filas.** `now()` es la hora de inicio de la transacción: una transacción que confirma tarde queda con un updated_at anterior al cursor ya leído.
    - Usar como cursor el máximo updated_at que devuelve el servidor, menos una ventana de solapamiento de unos 2 minutos, con un merge que no duplica.
    - Nunca usar la hora del teléfono.
17. [Alta] **Perder el acceso no se ve como un borrado.** Si sacan a alguien de la liga, la liga pasa a privada o se borra, la RLS oculta las filas y también sus tombstones.
    - Resultado: datos privados y una «liga fantasma» en el teléfono.
    - En cada sincronización, comparar la lista de ligas legibles (por RPC) y purgar lo local de las que ya no están.
18. [Alta] **Cola: errores definitivos contra errores que se reintentan.**
    - Una operación creada sin señal puede ser rechazada al enviarse: evento cerrado, rol quitado, liga borrada o `rate_limited`.
    - 42501, P0001 y los 4xx son definitivos. Van a una lista visible de «no se pudo enviar» (copiar o descartar) y no bloquean el resto de la cola: orden por colapse_key o por liga, no una fila global.
19. [Alta] **Sesión.** La rotación del refresh token detecta reusos: un corte a mitad de la renovación, o dos pestañas renovando, revoca la sesión en plena bolera.
    - Solo una pestaña renueva (navigator.locks).
    - La cola se guarda por user_id y no se borra al cerrar sesión; se envía si vuelve a entrar la misma cuenta, con el aviso «entra de nuevo para enviar N pendientes».
    - Después de cada TOKEN_REFRESHED hay que llamar a `realtime.setAuth()`, o el canal privado se cae.
20. [Media] **Esfuerzo subestimado.** Una réplica local más sincronización por cambios más cola optimista para 85 funciones y unas 40 pantallas es un motor local-first propio: cuesta unos 25–32 días, no 18–24.
    - Recorte recomendado: la cola solo en anotar, en vivo, «Voy» y +1 juego.
    - El resto lee en línea con TanStack Query persistido, sin réplica local.
21. [Media] **El modo consulta gasta egress.** Con 50 espectadores cada 15–20 s son unos 60 MB por evento; 10 ligas por semana suman unos 2,5 GB al mes, la mitad del cupo.
    - Crear una RPC `live_versions(event)` que devuelva solo las versiones, y bajar el estado solo si cambió.
22. [Media] **Scraping anónimo.** Lo público se puede descargar entero por REST y en Free no hay límite por IP.
    - Bajar max-rows de PostgREST (p. ej. 500).
    - Leer lo público por RPC paginadas.
    - `profiles` nunca legible por anon, porque tiene los correos.

**Fase 0C**
23. [Alta] **La cadena de modelos no cabe en una sola llamada.**
    - 4 modelos con 30 s de espera cada uno son unos 120 s, cerca del límite de 150 s.
    - Además, un pico de unas 20 fotos por minuto pasa el límite por minuto de Flash-Lite.
    - Espera de 20 s como máximo y 2 modelos por invocación; si no hay respuesta, devolver «reintentar» a scanJobs.
    - Un tope global por minuto y por modelo en consume_scan, no solo diario.
    - Mover consume_scan a `private` con `search_path=''`.
24. [Alta] **El panel de uso no puede ver egress, Realtime ni Storage desde Postgres.** Esos datos solo salen del dashboard o de la Management API, que pide un token personal con acceso a toda la cuenta y nunca debe ir en la app.
    - Una Action diaria en un repo privado con ese token guarda el uso en una tabla y avisa al 70 %.
    - Un interruptor `app_config.live_mode` (realtime / consulta / apagado) para degradar el en vivo antes de llegar a los 402.
25. [Alta] **Respaldos incompletos.** `supabase db dump` no trae los datos de auth (usuarios, identidades y hashes) ni los archivos de Storage.
    - Hacer un dump de datos de auth y public, y una copia del bucket aparte.
    - Cifrarlo con age antes de subirlo.
    - No hacer un commit diario en git, porque el repo crece sin fin: usar una rama huérfana sobrescrita o Releases con rotación de 14 días.
    - La prueba de restauración incluye iniciar sesión con un usuario restaurado.
26. [Media] **Las URLs firmadas cambian cada hora.** La caché del service worker, que guarda por URL, nunca acierta y la foto se vuelve a bajar. Usar la ruta sin el token como clave de caché.
    - purge-photos también debe borrar los objetos que no tengan fila en photos después de 24 h.
27. [Media] **Mantener despierto.** Los jobs de pg_cron probablemente no cuentan como actividad. El «mantener despierto» real es la llamada REST externa diaria.
    - Ponerla también para staging.
    - Alerta si falla 2 días seguidos.
28. [Media] **send-push.** `npm:web-push` usa el crypto de Node en Deno.
    - Medir la CPU por mensaje contra el límite de 2 s.
    - Probar primero `jsr:@negrel/webpush` (Web Crypto), con lotes de 50 que se encadenan por pg_net.
29. [Media] **Faltan registros de errores del cliente.** En Free los logs duran 1 día.
    - Usar una tabla `client_errors` con límite de ritmo, o Sentry gratis, antes del piloto.
    - Fase 0 con los faltantes (puntos 10, 12, 20, 24, 25 y 29): unos 55–72 días, no 46–63.
30. [Media, con fecha] **BowlingX, fuera del plan pero urgente.** Desde el 2 de noviembre de 2026 (en 5 semanas), Firebase AI Logic exige App Check.
    - scan.ts solo activa App Check si VITE_RECAPTCHA_SITE_KEY existe en Vercel producción; si no, la lectura de fotos de BowlingX puede caerse.
    - Su segundo modelo, gemini-3.8-flash, da unas 20 fotos al día; conviene cambiarlo por gemini-3.1-flash-lite.
    - Hay que decidirlo antes del 2 de noviembre.

**Fase 1**
31. [Media] **Si el teléfono del anotador muere,** la cancha se para mientras el organizador juega. Agregar «entregar el control» voluntario por QR desde el teléfono del anotador. No choca con la regla de «solo el admin transfiere».
32. [Baja] **Americano sin repetir compañero.** Ese calendario solo existe con n ≡ 0 o 1 (mod 4) jugadores (8, 9, 12, 13, 16). Con 10, 11 o 14, la prueba debe ser «minimiza las repeticiones»; si no, la prueba del plan siempre falla.

**Fase 4**
33. [Media] **Reloj de los espectadores.** Si avanzan el reloj con su hora local, se desfasan segundos o minutos. Calcular la diferencia con la hora del servidor (cabecera Date o una RPC now()) y enviar el inicio en hora del servidor.

**Fase 5**
34. [Media] **Roja en futsal.** «Uno menos hasta que le marquen» está mal.
    - Con 5 contra 4, si marca el que tiene 5, el otro completa.
    - Con 4 contra 4, un gol no cambia nada.
    - Si marca el que tiene menos, tampoco cambia nada.
    - Juego limpio FIFA: amarilla −1, roja por doble amarilla −3, roja directa −4, amarilla más roja directa −5 (no −1 y −3).

**Fase 6**
35. [Media] **«SI del 1 al 18 sin repetir» rompe los campos de 9 hoyos,** que usan 1–9 o solo impares o pares. Validar el SI como permutación según el número de hoyos, y repartir los golpes con el SI de 9 hoyos.

**Fase 7**
36. [Baja] **`time_ms` contra «entero en centésimas».** Elegir uno, por ejemplo `time_cs`, para no mezclar factores de 10.

**Fase 8**
37. [Alta] **BowlingX no verifica correos** (auth.tsx no llama a sendEmailVerification).
    - Importar a todos con `email_confirm = true` y la unión automática con Google permite tomar cuentas: quien registró un correo ajeno queda unido al Google del dueño real.
    - Importar con `email_confirm` igual al emailVerified del export (true para los de Google). Los no verificados confirman su correo al entrar por primera vez.
    - No migrar admin@admin.com como superadmin.
38. [Media] **Los CHECK nuevos rechazan datos viejos.**
    - BowlingX solo limita contactPhone a 20 caracteres, así que «809-555-1234» falla `^[0-9]{0,20}$`.
    - Los nombres vacíos o de más de 60 caracteres también fallan.
    - El transformador tiene que normalizar y reportar esos casos.
39. [Media] **El transformador envejece.** BowlingX sigue vivo 8–11 meses y recibe funciones con frecuencia.
    - Congelar su esquema, no solo sus funciones.
    - Correr la paridad cada mes en CI contra un export real anonimizado.

Fuentes:
- [Supabase: claves de API](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase: migrar a las claves nuevas](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Supabase: preguntas de facturación (gracia y 402)](https://supabase.com/docs/guides/platform/billing-faq)
- [Supabase: uso de egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
- [Brevo: autenticación de dominio](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [Brevo: requisitos de Gmail, Yahoo y Microsoft](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)
- [MatchMate Tennis](https://www.facebook.com/MatchMateTen/)

Archivos revisados:
- C:\Users\rgrullon\code\bowlinx\src\lib\auth.tsx
- C:\Users\rgrullon\code\bowlinx\src\lib\scan.ts
- C:\Users\rgrullon\code\bowlinx\src\lib\data.ts
- C:\Users\rgrullon\code\bowlinx\firestore.rules
- C:\Users\rgrullon\code\matchmate\package.json