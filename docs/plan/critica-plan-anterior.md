**Correcciones al plan multideporte (crítica de completitud)**

**Transversal / calendario**
1. **(Todas) El calendario no cuadra.** 71–92 días-persona son unos 14–18 semanas de desarrollo puro, sin contar lo siguiente:
   - la Puerta 0 (2 semanas);
   - la Puerta B (4 semanas o más de raqueta en uso, y bloquea el inicio de la Fase 4);
   - 8 pilotos que dependen de noches reales;
   - los arreglos después de cada piloto, que no están presupuestados.
   Corrección: sumar un 15–20 % de margen por fase para esos arreglos y decir "6–9 meses de calendario", no "4–5".
2. **(1) La Fase 1 está subestimada.** 10–12 días no alcanzan para todo lo que trae: modo cancha, turno de anotador, matches + summaries + reglas + ~15 pruebas, generadores, pantalla del organizador, asistente de 3 pasos, importar miembros, Mis partidos, campana, perfil, escritor Excel genérico, tarjeta para compartir y simulador. Corrección: 14–18 días, o pasar el Excel genérico, importar miembros y el perfil de pádel a la Fase 2.
3. **(6) Golf: falta presupuestar la extracción que se dejó para después.** Al "envolver" en la Fase 0 quedan fijos en 0–300 y "más alto gana":
   - ApprovalsPage, SubmitGamesModal y ScanModal;
   - LiveBoard/liveRows;
   - MyGamesPanel, ScoreChart y GameChips.
   Corrección: +3–5 días en golf. Natación reutiliza ese trabajo, así que el golf debe ir antes que la natación, como ya está.

**Fase 0**
4. **Datos y privacidad de menores desde ya, no en la Fase 7.** Pickleball, tenis, fútbol y baloncesto juveniles pueden aparecer antes. Hace falta:
   - edad mínima para crear cuenta;
   - textos legales para la RD (Ley 172-13 de datos y Ley 136-03 de menores);
   - regla general: una liga con menores es siempre privada, sin fotos ni social, y en las tarjetas compartidas va el nombre con la inicial.
5. **Trampa de lectura en `players`.** Hoy `allow read: if canRead(lid)`, y en una liga pública lo lee cualquiera, aun sin login. Poner `anioNacimiento` y `sexo` en `Player.sportData` los hace públicos. Firestore no filtra por campo. Corrección: guardarlos en una subcolección solo para admin (`leagues/{lid}/private/{pid}`) y dejar en público solo la categoría ya calculada.
6. **Copias y borrados en cascada.** `backup.ts` tiene `LEAGUE_COLLECTIONS` fijo en `players/events/entries/submissions/reactions/comments/suggestions`, y `deleteEvent` borra solo `entries/submissions/photos/reactions/comments/live` (data.ts:963). Hay que agregar:
   - matches, summaries, teams y courses;
   - lo que pasa con un jugador borrado que aparece en `sides`: guardar su nombre copiado en matches y summaries, lo que además ahorra leer `players`.
7. **La entrega no incluye los índices.** El dueño pega las reglas en la consola, pero `firestore.indexes.json` también hay que desplegarlo o crearlo, y un índice tarda minutos en construirse. Corrección: agregar el paso "índices antes del push" y la salida de respaldo ante `failed-precondition` que ya existe.
8. **El medidor de lecturas cuenta mal si solo suma documentos recibidos.** Debe contar:
   - solo las instantáneas que vienen del servidor (`!metadata.fromCache`);
   - una lectura por cada consulta vacía;
   - la relectura completa de cada listener que vuelve después de más de 30 min en segundo plano (vence el resume token).
   Esto último le pega mucho a los espectadores y a los teléfonos de anotador.
9. **La Puerta S (almacenamiento) va en la Puerta A, no en golf.** Con el cálculo anterior de 1 GiB en ~15 meses, el límite llega dentro del plazo del plan. Hay que medir el uso ya y fijar la retención de `deleteOldPhotos`.
10. **Números decimales en las reglas.** El SDK de JS manda 12.0 como entero, así que un Index de golf 12.0 fallaría con `is float`. Usar siempre `is number` para los decimales (Index, niveles NTRP, Playtomic y DUPR).

**Fase 1 (pádel: Americano y Mexicano)**
11. **Con 10 jugadores (o cualquier N ≡ 2 mod 4) es imposible que todos jueguen con todos.** Además, 12 jugadores serían 11 rondas y 16 serían 15 (varias horas). Corrección: calendario "balanceado parcial" con N rondas elegidas. Las pruebas deben verificar que no se repite compañero antes de agotar los posibles y que los descansos se reparten, no "todos con todos".
12. **Descansos.**
    - En el Mexicano, si siempre descansa "el último", el mismo jugador se queda atascado. Debe descansar quien menos haya descansado.
    - El Americano también necesita la regla del promedio (o normalizar por partidos jugados) cuando hay descansos.
    - La regla es "si no es múltiplo de 4", no "si son impares".
13. **Chocan el turno de anotador y el modo sin señal.** Un anotador sin señal no puede renovar `leaseUntil`. Otro toma el control, y al volver la señal sus escrituras en cola las rechazan las reglas (`request.time > leaseUntil`): el SDK las descarta y el marcador del teléfono "retrocede". Corrección:
    - que no se pueda tomar el control solo porque venció el tiempo; solo el admin, con confirmación;
    - renovar el turno aprovechando las publicaciones con tope, sin escrituras aparte (cada renovación le cuesta una lectura a cada espectador);
    - guardar la lista de jugadas del teléfono y avisar "otro anotador tomó el control".
14. **Retomar en otro teléfono.** El documento del partido debe tener el estado completo para retomar (sets, juegos, sacador, lado y orden de saque), no solo lo que se muestra. Así, si el teléfono se queda sin batería, otro sigue desde la última publicación. Agregar el estado "suspendido con marcador parcial" (lluvia o luz en canchas abiertas), además de "aplazado".
15. **Resumen compartido entre canchas.** Escribir siempre con `update()` sobre campos con punto (`r.{mid}`), nunca `setDoc` sobre el resumen, porque borraría las claves de otras canchas al sincronizar sin señal. Las reglas necesitan:
    - `request.resource.data.r.diff(resource.data.r).affectedKeys().hasOnly([mid])`, a nivel anidado;
    - un caso de `create` cuando el resumen todavía no existe.
16. **"Mis partidos" con `array-contains playerIds` no sirve entre ligas.** Los jugadores son documentos por liga, con ids distintos (ensurePlayer, claimPlayer y linkAccountToPlayer). Corrección: un campo `uids[]` en matches, mantenido al vincular o desvincular una cuenta, más una regla de collection group `match /{path=**}/matches/{mid}` con `leagueId` en el documento. La otra opción es una consulta por liga, que suma listeners a `useLeagueFeeds`.
17. **"Te toca la cancha 2" no puede ser push en tiempo real.** No hay servidor, y el cron de GitHub se atrasa entre 5 y 30 minutos o más. Solo funciona en la campana con la app abierta, y en iOS el push exige tener la PWA instalada. Hay que decir esto en el alcance.
18. **Antes de empezar el partido falta:** el sorteo, quién saca primero, el orden de saque dentro de cada pareja y el lado inicial. En punto de oro o Star Point, mostrar "la pareja receptora elige lado". También falta "corregir marcador" (el admin fija juegos y sets) para errores que no son la última jugada.

**Fase 2 (pádel: liga y torneo)**
19. **Identidad de pareja.** Una tabla por parejas necesita un id estable de pareja (una colección `pairs` o `teams`) ya en la Fase 2, no en la Fase 4. Falta también la regla de suplente: el sustituto puede jugar, los puntos van a la pareja y las estadísticas al individuo.
20. **El cierre a las 48 h no necesita escritura.** Si es una escritura, el partido queda "propuesto" hasta que alguien abra la app, y exige reglas complejas para personas que no juegan. Corrección: calcularlo al leer (propuesto con más de 48 h cuenta como final en la tabla) y que el admin o el rival lo cierre formalmente cuando quiera.
21. **Desempate con 3 o más empatados.** La minitabla se tiene que volver a aplicar de forma recursiva sobre los que siguen empatados. Los retiros deben contar juegos y sets según una regla definida (por ejemplo, completar el set al ganador).

**Fase 3 (tenis y pickleball)**
22. **Pickleball: el motor debe seguir la posición de cada jugador (derecha o izquierda), no un "sacador 1" fijo.** El sacador 1 es quien está a la derecha cuando cambia el saque. En conteo por rally, el lado del saque sale de la paridad del puntaje. El round robin social combina el calendario del Americano con juegos a 11 de pickleball, no con la "suma de puntos".
23. **Verificar el orden de desempate de USA Pickleball** (sección 12, round robin), porque varía según empaten 2 o 3 equipos. El plan pone la diferencia total antes de la diferencia entre los empatados; confirmarlo antes de fijar el valor por defecto.

**Fase 4 (baloncesto)**
24. **El desempate FIBA está mal resumido.** Lo que recuerdo del Apéndice D (verificar contra el reglamento): puntos de tabla entre los empatados → diferencia de puntos entre ellos → puntos a favor entre ellos → diferencia general → puntos a favor generales. El 20-0 del forfeit sí es correcto (Art. 20), así que se puede quitar ese riesgo del plan. Falta el "default" (Art. 21): si el equipo que gana iba abajo, queda 2-0, y el que pierde recibe 1 punto.
25. **Faltas por tipo.**
    - Botón de falta: personal, ofensiva, técnica y antideportiva. La ofensiva cuenta como falta de equipo pero no da tiros libres.
    - Expulsión: con 5 faltas, pero también con 2 técnicas, 2 antideportivas o 1 de cada una.
    - Faltan la flecha de posesión alterna y las técnicas del entrenador.
26. **"Partidos jugados" y "promedio de puntos" necesitan saber quién estuvo presente en cada partido.** Sin alineaciones, agregar una lista rápida de "presentes" que confirma el anotador. La convocatoria (Voy) no basta.

**Fase 5 (fútbol)**
27. **Falta en el acta y en el modelo:**
    - autogol (suma al equipo, no a un jugador);
    - penales guardados aparte del marcador (no cuentan en goles ni en la tabla);
    - minuto con añadido (45+2);
    - portero por partido y lado: sin eso no se pueden calcular las vallas invictas por jugador.
28. **Disciplina.** La suspensión se cumple en el próximo partido que el equipo juegue de verdad, no en la "próxima jornada": aplazados y jornadas de descanso con número impar de equipos. Las amarillas de una doble amarilla normalmente no suman a la acumulación: debe ser configurable. Para avisar de un suspendido convocado hace falta la lista de presentes del punto 26.
29. **Futsal: verificar la tanda de penales de 2025-26.** La investigación dice que pasó de 3 a 5, lo que parece al revés. Hacerlo configurable (3 o 5). No hay tiempos muertos en la prórroga.

**Fase 6 (golf)**
30. **Fórmulas del WHS.**
    - Con 9 hoyos: (Index/2) × Slope/113 + (Rating9 − Par9). Esto falta en el plan.
    - Con Index "plus" (negativo), se devuelven golpes empezando por el SI 18.
    - Redondeo según el Apéndice C: no redondear el handicap de campo antes de aplicar el %; 0,5 sube.
31. **Salida por inscripción, no por evento.** Cada jugador puede salir de tees distintos (caballeros o damas), con su propio rating y slope, y ajuste si el par es distinto. El evento no puede guardar una sola salida.
32. **Torneo de varias rondas.** Si "una ronda es un evento", hace falta un agrupador del torneo para sumar las rondas en el leaderboard.
33. **"Recogió".** En stroke play, no terminar un hoyo descalifica (Regla 3.3c); solo vale en Stableford. Si no, ofrecer el formato "máximo por hoyo" (Regla 21.2). La regla 1–20 debe representarlo en `detail`, no con 0. En shotgun, el countback usa los hoyos 10–18 sin importar dónde se empezó.
34. **Anotador por grupo.** Con 5 grupos hacen falta 5 anotadores de liga. Es mejor dejar que un inscrito del mismo grupo escriba las tarjetas de su grupo en ese evento (campo `grupo` en la inscripción).

**Fase 7 (natación)**
35. **El "cronómetro compartido" entre varios teléfonos sin señal es imposible.** Cada teléfono debe arrancar el suyo con la señal de salida, rotulado como no oficial, o un solo teléfono por serie. El teclado mm:ss.hh desde cronómetros físicos queda como forma principal.
36. **Relevos.** Los puntos "×2 en relevos" no caben en inscripciones por jugador: o se agrega una inscripción de relevo (4 nadadores y un tiempo), o los relevos salen de la v1 y también de la fórmula de puntos.
37. **Reglas de puestos y series.**
    - En un empate, los puntos de los puestos empatados se suman y se reparten.
    - Mínimo 3 nadadores en la primera serie.
    - En finales por tiempo, las series mezclan categorías y el puesto se calcula por categoría.

**Técnico general**
38. **Pantallas sin conexión.** Workbox precachea todos los `.js` (`globPatterns`), así que las pantallas de cada deporte cargadas con `import()` funcionan sin señal. A cambio, cada usuario del boliche las descarga en la caché. Hay que medir el tamaño de esa caché con datos móviles, además del límite de +2 % del paquete inicial.