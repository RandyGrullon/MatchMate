**MatchMate: marca, logo y animaciones de apertura por deporte**

Hice 3 conceptos de logo, cada uno con icono de 512×512 y logotipo horizontal de 960×240. Los probé en Chrome headless a 256, 48 y 32 px, en claro y oscuro, y con colores de acento personalizados (verde azulado y ámbar). Los seis SVG son XML válido.

**Cómo toman el color:** los SVG usan tres variables CSS. Cada una tiene un valor por defecto para claro y otro para oscuro:

| Variable | Claro | Oscuro |
|---|---|---|
| `--mm-accent` (fondo del icono y "Mate") | #4338ca | #8b8cf6 |
| `--mm-on-accent` (dibujo sobre el acento) | #fff | #0d0f15 |
| `--mm-text` (la palabra "Match") | #151822 | #eceef3 |

- **Siempre las tres juntas:** si la app cambia el acento, tiene que definir también `--mm-on-accent` y `--mm-text`. Si no, puede quedar un dibujo oscuro sobre un acento oscuro.
- **Blanco en modo oscuro no sirve:** blanco sobre #8b8cf6 da un contraste de 2,9:1, que es poco. Por eso en oscuro el dibujo es #0d0f15.
- **Favicon:** como archivo suelto cambia solo con el modo del sistema.
- **Zona segura:** los tres dibujos caben en la zona segura del icono de la app (radio 204,8). Para el icono "maskable" del manifest hay que usar `rx="0"`.

---

### Concepto 1: "Dúo" (el recomendado)
Dos compañeros se toman de la mano y forman la M: las piernas son los cuerpos, la V del centro son los brazos y los dos puntos son las cabezas. Es "match" y "mate" a la vez.

Icono:
```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="MatchMate"><style>.mm-t{fill:var(--mm-accent,#4338ca)}.mm-ts{stroke:var(--mm-accent,#4338ca)}.mm-i{fill:var(--mm-on-accent,#fff)}.mm-s{stroke:var(--mm-on-accent,#fff)}@media (prefers-color-scheme:dark){.mm-t{fill:var(--mm-accent,#8b8cf6)}.mm-ts{stroke:var(--mm-accent,#8b8cf6)}.mm-i{fill:var(--mm-on-accent,#0d0f15)}.mm-s{stroke:var(--mm-on-accent,#0d0f15)}}</style><rect class="mm-t" width="512" height="512" rx="112"/><path class="mm-s" d="M150 384V218L256 324L362 218V384" fill="none" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/><circle class="mm-i" cx="150" cy="138" r="36"/><circle class="mm-i" cx="362" cy="138" r="36"/></svg>
```
Logotipo:
```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 240" role="img" aria-label="MatchMate"><style>.mm-t{fill:var(--mm-accent,#4338ca)}.mm-ts{stroke:var(--mm-accent,#4338ca)}.mm-i{fill:var(--mm-on-accent,#fff)}.mm-s{stroke:var(--mm-on-accent,#fff)}.mm-w{fill:var(--mm-text,#151822)}.mm-a{fill:var(--mm-accent,#4338ca)}@media (prefers-color-scheme:dark){.mm-t{fill:var(--mm-accent,#8b8cf6)}.mm-ts{stroke:var(--mm-accent,#8b8cf6)}.mm-i{fill:var(--mm-on-accent,#0d0f15)}.mm-s{stroke:var(--mm-on-accent,#0d0f15)}.mm-w{fill:var(--mm-text,#eceef3)}.mm-a{fill:var(--mm-accent,#8b8cf6)}}</style><g transform="translate(24 24) scale(.375)"><rect class="mm-t" width="512" height="512" rx="112"/><path class="mm-s" d="M150 384V218L256 324L362 218V384" fill="none" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/><circle class="mm-i" cx="150" cy="138" r="36"/><circle class="mm-i" cx="362" cy="138" r="36"/></g><text x="244" y="161" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="118" font-weight="800" letter-spacing="-3"><tspan class="mm-w">Match</tspan><tspan class="mm-a">Mate</tspan></text></svg>
```
Versión de un solo color, para el icono pequeño de las notificaciones push y para usos en un color:
```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M150 384V218L256 324L362 218V384" fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/><circle cx="150" cy="138" r="36" fill="currentColor"/><circle cx="362" cy="138" r="36" fill="currentColor"/></svg>
```

---

### Concepto 2: "Costura"
La M es la costura de una pelota que une dos mitades, como dos compañeros que forman un equipo. Va girada −14° para que la pelota parezca en movimiento.

Icono:
```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="MatchMate"><style>.mm-t{fill:var(--mm-accent,#4338ca)}.mm-ts{stroke:var(--mm-accent,#4338ca)}.mm-i{fill:var(--mm-on-accent,#fff)}.mm-s{stroke:var(--mm-on-accent,#fff)}@media (prefers-color-scheme:dark){.mm-t{fill:var(--mm-accent,#8b8cf6)}.mm-ts{stroke:var(--mm-accent,#8b8cf6)}.mm-i{fill:var(--mm-on-accent,#0d0f15)}.mm-s{stroke:var(--mm-on-accent,#0d0f15)}}</style><rect class="mm-t" width="512" height="512" rx="112"/><circle class="mm-i" cx="256" cy="256" r="172"/><path class="mm-ts" d="M196 446C148 380 148 240 184 160L256 284L328 160C364 240 364 380 316 446" fill="none" stroke-width="34" stroke-linejoin="round" transform="rotate(-14 256 256)"/></svg>
```
Logotipo:
```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 240" role="img" aria-label="MatchMate"><style>.mm-t{fill:var(--mm-accent,#4338ca)}.mm-ts{stroke:var(--mm-accent,#4338ca)}.mm-i{fill:var(--mm-on-accent,#fff)}.mm-s{stroke:var(--mm-on-accent,#fff)}.mm-w{fill:var(--mm-text,#151822)}.mm-a{fill:var(--mm-accent,#4338ca)}@media (prefers-color-scheme:dark){.mm-t{fill:var(--mm-accent,#8b8cf6)}.mm-ts{stroke:var(--mm-accent,#8b8cf6)}.mm-i{fill:var(--mm-on-accent,#0d0f15)}.mm-s{stroke:var(--mm-on-accent,#0d0f15)}.mm-w{fill:var(--mm-text,#eceef3)}.mm-a{fill:var(--mm-accent,#8b8cf6)}}</style><g transform="translate(24 24) scale(.375)"><rect class="mm-t" width="512" height="512" rx="112"/><circle class="mm-i" cx="256" cy="256" r="172"/><path class="mm-ts" d="M196 446C148 380 148 240 184 160L256 284L328 160C364 240 364 380 316 446" fill="none" stroke-width="34" stroke-linejoin="round" transform="rotate(-14 256 256)"/></g><text x="244" y="161" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="118" font-weight="800" letter-spacing="-3"><tspan class="mm-w">Match</tspan><tspan class="mm-a">Mate</tspan></text></svg>
```

---

### Concepto 3: "Jaque"
Juega con "jaque mate" → "Match Mate": la M termina en un check (✓), que también es la partida confirmada por el rival, una de las funciones clave de la app.

Icono:
```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="MatchMate"><style>.mm-t{fill:var(--mm-accent,#4338ca)}.mm-ts{stroke:var(--mm-accent,#4338ca)}.mm-i{fill:var(--mm-on-accent,#fff)}.mm-s{stroke:var(--mm-on-accent,#fff)}@media (prefers-color-scheme:dark){.mm-t{fill:var(--mm-accent,#8b8cf6)}.mm-ts{stroke:var(--mm-accent,#8b8cf6)}.mm-i{fill:var(--mm-on-accent,#0d0f15)}.mm-s{stroke:var(--mm-on-accent,#0d0f15)}}</style><rect class="mm-t" width="512" height="512" rx="112"/><path class="mm-s" d="M158 362V206L234 312L382 124M346 170V362" fill="none" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></svg>
```
Logotipo:
```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 240" role="img" aria-label="MatchMate"><style>.mm-t{fill:var(--mm-accent,#4338ca)}.mm-ts{stroke:var(--mm-accent,#4338ca)}.mm-i{fill:var(--mm-on-accent,#fff)}.mm-s{stroke:var(--mm-on-accent,#fff)}.mm-w{fill:var(--mm-text,#151822)}.mm-a{fill:var(--mm-accent,#4338ca)}@media (prefers-color-scheme:dark){.mm-t{fill:var(--mm-accent,#8b8cf6)}.mm-ts{stroke:var(--mm-accent,#8b8cf6)}.mm-i{fill:var(--mm-on-accent,#0d0f15)}.mm-s{stroke:var(--mm-on-accent,#0d0f15)}.mm-w{fill:var(--mm-text,#eceef3)}.mm-a{fill:var(--mm-accent,#8b8cf6)}}</style><g transform="translate(24 24) scale(.375)"><rect class="mm-t" width="512" height="512" rx="112"/><path class="mm-s" d="M158 362V206L234 312L382 124M346 170V362" fill="none" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></g><text x="244" y="161" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="118" font-weight="800" letter-spacing="-3"><tspan class="mm-w">Match</tspan><tspan class="mm-a">Mate</tspan></text></svg>
```

---

### Por qué recomiendo "Dúo"
1. **Cuenta el nombre completo:** la M es la partida y las dos figuras son los compañeros. Se entiende sin explicarlo.
2. **Es el más claro en tamaño pequeño:** son solo 3 formas con buen contraste y se leen bien a 48 y 32 px. "Costura" pierde la M a 32 px y además recuerda al símbolo del metro. "Jaque" se parece a una app de tareas.
3. **Sirve como sistema:** en la animación de cada deporte, una "cabeza" se convierte en la pelota de ese deporte. También sirve para avatares y pantallas vacías.
4. **Es fácil de animar:** la M es un solo trazo que se puede "dibujar", y los dos círculos aparecen con un pequeño rebote.
5. **Es cálido y cercano,** algo que conviene en ligas de amigos, familias y ligas con menores, que son privadas.

---

### Animaciones de apertura por deporte
Todas siguen el mismo patrón que BowlingX:
- **Formato:** svg de 220×120, unos 1,5 s en total, y la palabra "Match**Mate**" aparece a los 0,75 s.
- **Colores:** el objeto principal usa `var(--accent)`. Las piezas blancas llevan borde #8e96a8 en claro y #c9ccd6 en oscuro, y hay una línea de suelo como la de la pista.
- **Técnica:** `transform-box: fill-box`. Para los arcos se anidan dos grupos: el de fuera mueve en X de forma lineal y el de dentro sube y baja en Y.
- **Movimiento reducido:** con `prefers-reduced-motion`, `#splash * { animation: none !important }`. Por eso el estado sin animar tiene que ser una imagen final que se vea bien, por ejemplo la pelota ya dentro del arco. Nada puede depender de una animación para esconderse.
- **Qué animación sale:** el script en línea de `index.html` lee `localStorage` (`mm:sport`, el último deporte usado) y copia la escena de ese deporte desde un `<template>`. Son unos 10 × 1–1,5 KB.

| Deporte | Movimiento | Elementos SVG clave |
|---|---|---|
| **Boliche (se queda igual)** | La bola entra girando desde la izquierda (0,7 s) y a los 0,55–0,65 s los 3 pinos salen volando. | `.ball` (círculo de acento con 3 agujeros), 3 `.pin` (silueta blanca con franja roja), `.lane` |
| **Pádel** | La pala gira desde atrás y golpea la pelota; la pelota rebota en el cristal del fondo, que destella al impacto, y vuelve al centro. El rebote en la pared es lo típico del pádel. | `.racket` (cabeza ovalada con rejilla de agujeros y mango corto), `.ball` (acento), `.glass` (rectángulo translúcido a la derecha), `.floor` |
| **Tenis** | La pelota cruza la red en arco, da un bote al otro lado (se aplasta un instante y deja una sombra) y sale de la escena. | `.net` (poste, cinta y líneas de malla), `.ball` (acento con dos curvas blancas de costura), `.shadow` (elipse), `.baseline` |
| **Pickleball** | Una pelota perforada pasa suave sobre la red baja desde la paleta y cae en la zona de no volea ("kitchen"), que se ilumina un momento. | `.paddle` (rectángulo redondeado y mango), `.ball` (acento con 6 puntos blancos), `.net` baja, `.kitchen` (rectángulo de acento al 12 % que parpadea) |
| **Baloncesto** | La pelota entra en arco al aro y pasa limpia; la malla se estira hacia abajo y vuelve. | `.backboard`, `.rim` en dos mitades (la de atrás detrás de la pelota y la de delante encima, para dar profundidad), `.net` (trapecio de líneas), `.ball` (acento con costuras) |
| **Fútbol (campo)** | La pelota entra girando al arco y la red se infla hacia atrás; la pelota se queda dentro. | `.goal` (postes y travesaño), `.net` (rejilla anclada a la derecha), `.ball` (blanca con pentágono de acento), `.grass` (línea con matas) |
| **Futsal** | Una pelota más pesada rueda por el suelo con dos botes cortos; una suela la frena, la arrastra un poco atrás y luego la patea a un arco pequeño (proporción 3×2) que destella. | `.court` (línea y arco del círculo central), `.sole` (silueta de zapatilla), `.ball` (acento con hexágonos), `.goal` pequeño |
| **Golf** | La pelota rueda frenando por el green hasta el hoyo y cae dentro, recortada por el borde del hoyo; la bandera ondea. | `.green` (elipse de acento al 15 %), `.cup` (elipse oscura con `clipPath`), `.flag` (asta y banderín de acento), `.ball` (blanca con borde y hoyuelos) |
| **Natación** | El nadador cruza el carril con dos brazadas mientras las olas se desplazan, y toca la pared; la placa de llegada destella y aparece un cronómetro. | `.waves` (2 ondas desplazándose), `.lane-rope` (fila de círculos), `.swimmer` (gorro de acento y brazo en arco que gira sobre el hombro), `.wall` y `.pad` |
| **MatchMate genérica** | El logo Dúo se arma solo: la M se dibuja en 0,6 s, las dos cabezas aparecen con un rebote a los 0,55 y 0,65 s y la V del centro late como un choque de manos. En la versión de cada deporte, la cabeza derecha cae como la pelota de ese deporte. | `rect` (fondo de acento), `path.m` con `pathLength="1"` para animar el trazo, `circle.h1` y `circle.h2`, `.word` |

Las pruebas de color de los tres conceptos están en `C:\Users\rgrullon\AppData\Local\Temp\claude\C--Users-rgrullon-code-bowlinx\e5adfd6f-c11f-41aa-855f-e746f25e0b80\scratchpad\mm\` (`view-light.png`, `view-dark.png`, `inline.png`), junto con los seis SVG y `gen.mjs`, el script que los genera.