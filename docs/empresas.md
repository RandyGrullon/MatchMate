# Empresas: canchas y espacios deportivos

Para quien tiene canchas, boleras, piscinas o cualquier espacio donde se juega. La empresa publica sus espacios en
MatchMate. Los jugadores los encuentran en **Dónde jugar** (`/canchas`) con sus fotos, precio, horario y WhatsApp. La
empresa puede pedir que un espacio salga **destacado** (primero en la búsqueda) y enlazar los torneos que se juegan en
él. Así la app cobra: las promociones y, más adelante, una comisión de lo que la empresa cobre por la app.

## Una cuenta, dos modos

- Cualquier cuenta registra **una** empresa (`/empresa` › «Registrar mi empresa») sin perder su cuenta de jugador:
  sus ligas, juegos y perfil siguen igual.
- El modo se guarda en la cuenta (`profiles.account_mode`: `'player'`, `'business'` o null = jugador) y se cambia
  cuando quiera: en Mi empresa («Usar la app como jugador» / «Modo empresa») y desde Configuración › Mi empresa.
- **En modo empresa** la app solo muestra lo suyo:
  - la barra es Mi empresa · Social · Yo (Yo es la Configuración de la cuenta);
  - el inicio (`/`) lleva al panel.
  - Lo de los jugadores (Hoy, Ligas) sigue abriendo por su link, pero ya no está en la barra.
- Al registrar la empresa la app pasa sola a modo empresa. Al borrarla, vuelve a jugador.

## Lo que se guarda (20261105000100_empresas.sql)

| Tabla | Qué es |
|---|---|
| `businesses` | La empresa: nombre, ciudad, teléfono/WhatsApp, correo, RNC o cédula (no se muestra), dirección y descripción. `status`: `pending` (en revisión), `approved`, `rejected` o `suspended`, con `status_note` (el motivo, que ve la empresa). `commission_pct`: la comisión de la app (10 % de entrada). `user_id`: la cuenta dueña (una por cuenta). |
| `venues` | Un espacio: deporte, nombre, ciudad, dirección, `details` (lo que pide su deporte), precio por hora (RD$), horario, teléfono propio (si no, el de la empresa) y `active` (sale en Dónde jugar). Hasta 30 por empresa. |
| `venue_photos` | Sus fotos (hasta 8 por espacio; la primera es la portada), en el bucket público `venues`. |
| `venue_promotions` | Destacar un espacio: `requested` (lo pidió la empresa), `active` (con fechas y lo que pagó), `rejected` o `cancelled`. |
| `leagues.venue_id` | El torneo o la liga que se juega en ese espacio (para la ficha y la comisión). |

- **Nada se lee directo:** la RLS está activada, sin políticas, y todo pasa por RPC.
- **Lo que pide cada deporte** (`details`) está en `src/lib/venues/fields.ts`. Por ejemplo, pádel lleva canchas,
  paredes, superficie, techada e iluminación. Boliche: pistas, zapatos, barandas y pro shop. Fútbol: campos,
  formato (5, 7 u 11) y grama. Golf: hoyos y par. Natación: largo, carriles y climatizada.
  La base solo revisa la forma y el tamaño; la app revisa el resto.

## Quién ve qué

- **Dónde jugar** (`search_venues`, `venue_detail`, también sin cuenta) solo muestra empresas aprobadas, espacios
  activos y dueños sin bloquear. Los destacados salen primero.
- La dueña y el superadmin ven la ficha aunque la empresa esté en revisión.
- **Una empresa nueva queda en revisión** hasta que el superadmin la aprueba en la consola (Empresas): así no aparecen
  canchas falsas. Mientras, ya puede agregar sus espacios y fotos.
  - Si la rechazan, corrige sus datos y vuelve a revisión sola.
  - Una suspendida no sale en la app y no puede subir fotos.

## Monetización

- **Destacar un espacio:**
  - La empresa lo pide desde el espacio (7, 15 o 30 días y una nota).
  - El superadmin le escribe para el pago y lo activa en la consola con lo que pagó.
  - Sale primero hasta la fecha de fin; también se puede dar una directa o terminarla antes.
  - La consola suma lo pagado por empresa.
- **Comisión:** cada empresa tiene su porcentaje (consola › Empresas › la empresa). Por ahora solo se anota, junto con
  los torneos que se juegan en sus espacios: todavía no hay cobros en la app (inscripciones con pago, reservas).
- **Falta:** elegir con quién cobrar (Azul, CardNet, Stripe…). Con eso, el pago de la promoción se hace en la app y se
  activa solo; también se puede cobrar la inscripción de un torneo y separar la comisión.

## La consola (superadmin)

Sección **Empresas** (`/superadmin/empresas`), con su número en el menú (las que esperan revisión y las promociones
pedidas). Una lista por estado y búsqueda, y el detalle de cada empresa:

- su dueño y sus datos;
- **revisión:** aprobar, rechazar o suspender, con el motivo;
- **comisión;**
- **espacios**, con «Destacar» directo;
- **promociones:** activar con lo pagado y los días, rechazar o terminar;
- **torneos** que se juegan en sus espacios.

Todo queda en la auditoría (`target_type = 'business'`).

## Fotos

- **Cómo se suben:** la app las achica en el teléfono (`compressShowcase`: hasta 1600 px y 450 kB, WebP o JPEG). Las
  sube a `venues/<cuenta>/<id>.webp|jpg` y después las enlaza con `add_venue_photo`. Si la base no las acepta, se
  borran.
- **Cuándo se borran:** lo que deja de usarse va a la cola de Storage y lo borra `purge-photos`. Eso pasa al quitar una
  foto o al borrar el espacio, la empresa o la cuenta.
- **El bucket** y sus políticas están en `20261105000110_empresas_supabase.sql`, solo en Supabase. Es público para
  leer. Para subir hay que tener empresa no suspendida, y solo en la carpeta propia.

## Cuenta borrada y mis datos

- **Borrar la cuenta** borra su empresa con sus espacios y fotos (en cascada). Las fotos van a la cola de Storage.
- **Descargar mis datos** trae la empresa (`tables.businesses`).

## Pruebas

- `tests/sql/empresas.test.ts`: registro y modo, espacios y fotos, lo público, destacar, la consola, permisos, la cuenta
  borrada y las políticas del bucket.
- `src/lib/venues/fields.test.ts`: los campos por deporte.
- `src/lib/data/business.test.ts`: subir fotos y los textos.
- Las listas de `tests/sql/seguridad.test.ts` y `consola.test.ts`.
- `src/components/Shell.test.ts`: la barra en modo empresa.

## Pendiente

- Cobrar en la app: elegir pasarela (ver Monetización).
- Los Términos y la Política de privacidad tienen que decir que las empresas publican datos y fotos públicas de sus
  espacios y que la app cobra por destacar. Cambiar la versión obliga a aceptar de nuevo (src/lib/legal.ts).
- La app del teléfono (`movil/`): Mi empresa y Dónde jugar (la lógica ya está en `src/lib/data/business.ts`).
- Personal de la empresa (más de una cuenta por empresa) y reservas de canchas por hora.
