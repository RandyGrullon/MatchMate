/**
 * El texto de los Términos de uso y la Política de privacidad (BORRADOR para revisar con un abogado de República
 * Dominicana), sin React: lo pintan TermsPage.tsx y PrivacyPage.tsx de la web (con LegalDoc.tsx) y las pantallas de la
 * app del teléfono (movil/src/app/terminos.tsx y privacidad.tsx). Un solo texto para los dos lados.
 *
 * La privacidad dice qué guarda la app de verdad (supabase/migrations, las Edge Functions y el teléfono), según la
 * Constitución (arts. 44 y 70), la Ley 172-13 de protección de datos personales, la Ley 136-03 (menores) y la Ley 53-07
 * (autoridades). Si cambia un texto, se cambia aquí, se sube TERMS_VERSION o PRIVACY_VERSION en src/lib/legal.ts (con lo
 * que cambió) y la misma fecha en private.legal_versions().
 */
import { LEGAL_CONTACT, LEGAL_DOCS, legalDate, type LegalDocKey } from '../../lib/legal';

/**
 * Un pedazo de un renglón: texto; un dato que falta llenar (se ve marcado: `isPlaceholder`); el correo de contacto (un
 * link para escribir); negritas; o un link a la otra página legal (con su sección: `hash` = '#fotos').
 */
export type LegalInline = string | { fill: string } | { email: true } | { bold: string } | { link: LegalDocKey; text: string; hash?: string };

/** Un renglón: solo texto o varios pedazos. */
export type LegalText = string | readonly LegalInline[];

/** Un párrafo, una lista con viñetas o un subtítulo dentro de una sección. */
export type LegalBlock = { p: LegalText } | { list: readonly LegalText[] } | { sub: string };

export interface LegalSectionText {
  /** Ancla (#id): el aviso de las fotos lleva a #fotos, Configuración a #derechos… */
  id: string;
  title: string;
  blocks: readonly LegalBlock[];
}

export interface LegalDocText {
  doc: LegalDocKey;
  /** Lo que se lee debajo del título. */
  lead: string;
  sections: readonly LegalSectionText[];
}

const EMAIL = { email: true } as const;
const privacyLink = (hash?: string): LegalInline => ({ link: 'privacidad', text: 'Política de privacidad', ...(hash ? { hash } : {}) });

// ---------- Términos de uso ----------

export const TERMS_TEXT: LegalDocText = {
  doc: 'terminos',
  lead: 'Las reglas para usar MatchMate: quién puede tener cuenta, qué no se permite y qué pasa con tus ligas.',
  sections: [
    {
      id: 'acuerdo',
      title: 'El acuerdo',
      blocks: [
        { p: ['Estos términos son un acuerdo entre tú y ', { fill: LEGAL_CONTACT.responsible }, ' (', { fill: LEGAL_CONTACT.taxId }, '), responsable de MatchMate.'] },
        {
          p: [
            'Al crear una cuenta o usar MatchMate aceptas estos términos y la ',
            privacyLink(),
            '. Guardamos qué versión aceptaste y cuándo. Si no estás de acuerdo, no uses la app.',
          ],
        },
      ],
    },
    {
      id: 'quien',
      title: 'Quién puede usar MatchMate',
      blocks: [
        {
          list: [
            'Solo los mayores de 18 años pueden tener cuenta.',
            'Una cuenta por persona, con tu nombre de verdad. No te hagas pasar por otra persona.',
            'Los menores participan solo como jugadores sin cuenta, en ligas «con menores» que lleva un adulto, con el permiso de su mamá, su papá o su tutor (Ley 136-03).',
          ],
        },
      ],
    },
    {
      id: 'cuenta',
      title: 'Tu cuenta',
      blocks: [{ list: ['Cuida tu contraseña: lo que se haga con tu cuenta es tu responsabilidad.', 'Si alguien entró sin tu permiso, cambia la contraseña y avísanos.'] }],
    },
    {
      id: 'ligas',
      title: 'Las ligas y sus organizadores',
      blocks: [
        {
          p: 'MatchMate es una herramienta: no organiza los eventos. El dueño y los admins de cada liga deciden quién entra, las reglas y los horarios, aprueban los resultados y responden por su liga. En su liga pueden sacar a alguien, corregir resultados y borrar comentarios. Quien anota a un menor responde por tener el permiso de su tutor y por los datos que anota.',
        },
        {
          p: 'MatchMate no responde por premios, cuotas, pagos, lesiones, peleas entre jugadores ni por lo que pase en las canchas, boleras, campos o piscinas.',
        },
      ],
    },
    {
      id: 'reglas',
      title: 'Lo que no se permite',
      blocks: [
        {
          list: [
            'Anotar resultados falsos o hacer trampa.',
            'Molestar, amenazar, insultar o discriminar a otros.',
            'Nombres, publicaciones, comentarios, avisos o imágenes ofensivos, sexuales o ilegales.',
            'Publicar datos de otras personas (teléfono, dirección, fotos) sin su permiso, o cualquier cosa sobre un menor fuera de lo que pide su liga.',
            'Usar la app para mandar publicidad que nadie pidió.',
            'Entrar donde no te toca, usar la cuenta de otro, intentar romper la app o abusar de ella con programas.',
          ],
        },
        {
          p: 'Algunas de estas cosas, además, pueden ser delito según la Ley 53-07 sobre crímenes y delitos de alta tecnología (por ejemplo, entrar sin permiso a una cuenta o hacerte pasar por otra persona).',
        },
      ],
    },
    {
      id: 'contenido',
      title: 'Lo que publicas',
      blocks: [
        {
          p: 'Lo que anotas y escribes sigue siendo tuyo. Nos das permiso para guardarlo y mostrarlo en tu liga, según sea pública o privada, mientras haga falta para el servicio. Los resultados son parte de la historia de la liga: se quedan aunque salgas de ella o borres tu cuenta (ya sin tu cuenta).',
        },
      ],
    },
    {
      id: 'fotos',
      title: 'Fotos, logos y nombres',
      blocks: [
        {
          list: [
            'Las fotos del marcador son solo de la pantalla: sin personas.',
            'Si subes un logo o una imagen de tu liga o equipo, donde la app lo permita, tiene que ser tuyo o tener el permiso de su dueño. No uses marcas de otros sin permiso.',
            'Los nombres de ligas, equipos y jugadores no pueden ser ofensivos ni hacerse pasar por otro.',
            [
              'La lectura automática de las fotos puede equivocarse: un admin revisa los números antes de que cuenten. Las fotos las lee la IA de Google en su plan gratis, como explica la ',
              privacyLink('#fotos'),
              '.',
            ],
          ],
        },
      ],
    },
    {
      id: 'reportes',
      title: 'Reportar y moderar',
      blocks: [
        {
          list: [
            'Si ves algo que no cumple estas reglas (un comentario, un aviso, un juego, una liga o una cuenta), toca la bandera («Reportar») que tiene al lado.',
            'Lo revisa el equipo de MatchMate y, si es un comentario, un aviso, un juego o una publicación de una liga, también sus admins (menos el admin del que es lo reportado). No le decimos a nadie quién lo reportó.',
            'Podemos descartar el reporte, borrar lo reportado, bloquear la cuenta o borrar la liga. Reportar a propósito algo que cumple las reglas también es abuso.',
          ],
        },
        { p: 'Si alguien está en peligro, llama primero al 911.' },
      ],
    },
    {
      id: 'avisos',
      title: 'Avisos al teléfono',
      blocks: [
        {
          p: [
            'Los avisos llegan solo si los activas. El admin de tu liga puede mandar avisos a su liga (unos pocos al día) y MatchMate manda anuncios de la app de vez en cuando. Los apagas cuando quieras. Qué se guarda para mandarlos lo explica la ',
            privacyLink('#avisos'),
            '.',
          ],
        },
      ],
    },
    {
      id: 'gratis',
      title: 'Una app gratis',
      blocks: [
        {
          p: 'MatchMate es gratis y usa los planes gratis de sus proveedores. Por eso puede tener topes (fotos por día, avisos), pausas o cambios, y podemos cambiar o quitar funciones. Hacemos copias de seguridad, pero no podemos garantizar que la app funcione siempre ni que nunca se pierda información. La app se ofrece como está.',
        },
      ],
    },
    {
      id: 'bloqueo',
      title: 'Cuentas bloqueadas',
      blocks: [
        {
          p: [
            'Si alguien no cumple estos términos, podemos bloquear su cuenta (puede ver, pero no anotar ni escribir) o borrar lo que publicó. Si crees que fue un error, escríbenos a ',
            EMAIL,
            '.',
          ],
        },
      ],
    },
    {
      id: 'salir',
      title: 'Salir y borrar tu cuenta',
      blocks: [
        {
          p: [
            'Puedes salir de una liga o borrar tu cuenta cuando quieras, desde Configuración. Si eres dueño de ligas, primero se las pasas a otro miembro o las borras. Lo que pasa con tus datos lo explica la ',
            privacyLink('#tiempo'),
            '.',
          ],
        },
      ],
    },
    {
      id: 'responsabilidad',
      title: 'Hasta dónde respondemos',
      blocks: [
        {
          p: 'Hasta donde lo permita la ley, MatchMate no responde por daños indirectos ni por la pérdida de datos o de oportunidades por usar la app o no poder usarla. Nada de esto te quita los derechos que te da la ley dominicana, como la Ley 358-05 de protección al consumidor cuando aplique.',
        },
      ],
    },
    {
      id: 'ley',
      title: 'Ley y tribunales',
      blocks: [{ p: 'Estos términos se rigen por las leyes de la República Dominicana. Cualquier conflicto se resuelve en los tribunales de Santo Domingo.' }],
    },
    {
      id: 'cambios',
      title: 'Cambios',
      blocks: [
        {
          p: 'Cada versión lleva su fecha (arriba). Si cambiamos algo importante, al entrar a la app te mostramos qué cambió y te pedimos aceptarlo antes de seguir. Si no estás de acuerdo, puedes salir o borrar tu cuenta.',
        },
      ],
    },
    {
      id: 'contacto',
      title: 'Contacto',
      blocks: [{ p: ['Para cualquier duda, reclamo o aviso sobre estos términos, escríbenos a ', EMAIL, '.'] }],
    },
  ],
};

// ---------- Política de privacidad ----------

export const PRIVACY_TEXT: LegalDocText = {
  doc: 'privacidad',
  lead: 'Qué datos guarda MatchMate, para qué, quién los ve y cómo los bajas o los borras.',
  sections: [
    {
      id: 'resumen',
      title: 'En pocas palabras',
      blocks: [
        {
          list: [
            'Guardamos lo necesario para que tus ligas funcionen: tu nombre, tu correo y tus resultados.',
            'No vendemos tus datos, no mostramos anuncios y no te rastreamos.',
            'Las cuentas son solo para mayores de 18 años. Los menores juegan sin cuenta, en ligas que lleva un adulto y con el permiso de su mamá, su papá o su tutor.',
            'Las fotos del marcador las lee la inteligencia artificial de Google en su plan gratis, y Google puede usarlas para mejorar sus productos.',
            'Puedes bajar tus datos y borrar tu cuenta cuando quieras, desde Configuración.',
            ['Para cualquier pregunta sobre tus datos, escríbenos a ', EMAIL, '.'],
          ],
        },
      ],
    },
    {
      id: 'responsable',
      title: 'Quién cuida tus datos',
      blocks: [
        {
          p: [
            'MatchMate es una app para organizar ligas y torneos de boliche, pádel, tenis, pickleball, ping pong, baloncesto, fútbol, golf, natación y esports. El responsable de tus datos es ',
            { fill: LEGAL_CONTACT.responsible },
            ' (',
            { fill: LEGAL_CONTACT.taxId },
            '), con domicilio en ',
            { fill: LEGAL_CONTACT.address },
            `, ${LEGAL_CONTACT.place}.`,
          ],
        },
        {
          p: 'Tratamos tus datos según la Constitución dominicana (artículo 44, derecho a la intimidad, y artículo 70, hábeas data), la Ley 172-13 sobre protección integral de los datos personales y, para los menores, la Ley 136-03, Código para la protección de los derechos de los niños, niñas y adolescentes.',
        },
        { p: ['Para cualquier cosa sobre tus datos, escríbenos a ', EMAIL, '.'] },
      ],
    },
    {
      id: 'datos',
      title: 'Qué datos guardamos',
      blocks: [
        { sub: 'Tu cuenta' },
        {
          list: [
            'Tu nombre y tu correo.',
            'Tu contraseña, guardada cifrada: nadie puede leerla, ni nosotros.',
            'Si entras con Google, Google nos pasa tu nombre y tu correo (nada más).',
            'La fecha en que confirmaste que tienes 18 años o más.',
            'Cuándo aceptaste los Términos de uso y esta política, qué versión y desde qué navegador.',
          ],
        },
        { sub: 'Lo que haces en tus ligas' },
        {
          list: [
            'Las ligas y torneos en los que estás y tu papel (dueño, admin, anotador o jugador).',
            'Tu jugador y sus resultados: juegos, partidos, tarjetas de golf, tiempos de natación, estadísticas y tablas.',
            'Los «voy» a los eventos, tus comentarios, reacciones y «me gusta», a quién sigues y quién te sigue.',
            'Si pides ser un jugador que anotó el admin («ese soy yo»), tu pedido y tu nota.',
            'Los reportes que haces: qué reportaste, el motivo, tu nota y cuándo.',
            'Las sugerencias al admin, que son anónimas: no guardamos quién las mandó.',
          ],
        },
        { sub: 'Lo que anota el admin de tu liga' },
        {
          list: [
            'Jugadores sin cuenta: su nombre y, si hace falta, su promedio, nivel o índice.',
            'Para los menores: el año de nacimiento y el sexo (para las categorías), el nombre del tutor, y quién dio el permiso y cuándo. Esto solo lo ven los admins de esa liga.',
          ],
        },
        { sub: 'Lo del teléfono' },
        {
          list: [
            'Si activas los avisos: la dirección de avisos de tu navegador y el tipo de teléfono (no tu número de teléfono).',
            'La última vez que abriste la app y los días que la usaste, para saber cuánta gente la usa.',
            'Cuántas fotos leíste con IA cada día (hay un tope por persona).',
            'Los errores de la app: qué pantalla falló, el navegador y la versión de la app. Así sabemos qué arreglar.',
          ],
        },
        { p: 'No pedimos tu cédula, tu dirección, tu número de teléfono ni tu ubicación. El teléfono de contacto de una liga lo pone su organizador, si quiere.' },
      ],
    },
    {
      id: 'uso',
      title: 'Para qué los usamos',
      blocks: [
        {
          list: [
            'Para que funcionen las ligas: tablas, estadísticas, resultados en vivo y el historial.',
            'Para mandarte los avisos que tú activaste.',
            'Para cuidar la app y a su gente: revisar los reportes, poner topes contra abusos y bloquear cuentas que no cumplen los Términos.',
            'Para arreglar errores y saber, en números generales, cuánta gente usa la app.',
            'Para poder demostrar qué versión de los Términos y de esta política aceptaste.',
          ],
        },
        {
          p: 'No usamos tus datos para publicidad y no se los vendemos a nadie. Los usamos con tu consentimiento, que das al crear la cuenta y al aceptar esta política (lo retiras borrando la cuenta), y porque hacen falta para darte el servicio que pediste.',
        },
      ],
    },
    {
      id: 'quien-ve',
      title: 'Quién ve tus datos',
      blocks: [
        {
          list: [
            'Liga pública: cualquiera con el link ve los nombres de los jugadores, los resultados y las tablas. Nunca tu correo.',
            'Liga privada: solo sus miembros.',
            'Tu perfil (nombre, deportes, seguidores y juegos) lo ven las cuentas que comparten una liga contigo o que te siguen, y cualquier cuenta si juegas en una liga pública. Solo salen los juegos de ligas que esa persona puede ver, nunca los de ligas con menores.',
            'Tus publicaciones las ve quien elijas al publicar: todas las cuentas, solo tus seguidores o solo los miembros de la liga donde publicas. Los comentarios y me gusta de una publicación los ve quien puede ver esa publicación.',
            'Tu foto de perfil, tu biografía y tu @usuario los ven las cuentas que entran a tu perfil o te encuentran con la lupa.',
            'Si bloqueas a alguien, deja de ver tu perfil y tus publicaciones, dejan de seguirse y no te encuentra al buscar.',
            'Los admins de tu liga ven los datos de los jugadores de esa liga, aprueban resultados, pueden sacar a alguien y borrar comentarios y publicaciones del muro de la liga.',
            'Tu correo lo ves tú y el equipo de MatchMate (el superadmin), que puede ver cuentas y ligas para dar soporte y cuidar la app. Lo que hace desde su consola queda anotado.',
            'Las ligas con menores siempre son privadas.',
          ],
        },
      ],
    },
    {
      id: 'reportes',
      title: 'Reportes',
      blocks: [
        {
          list: [
            'Si reportas algo (un comentario, un aviso, un juego, una liga o una cuenta), guardamos qué reportaste, el motivo, tu nota y cuándo.',
            'Lo revisa el equipo de MatchMate. Si es un comentario, un aviso, un juego o una publicación de una liga, también los admins de esa liga, pero sin saber quién lo reportó (si lo reportado es de un admin, ese admin no lo ve). La persona reportada tampoco sabe quién fue.',
            'Queda anotado qué se hizo (descartado o atendido), quién y una nota. Si lo reportado no cumple los Términos, se puede borrar o bloquear la cuenta.',
            'Si borras tu cuenta, tus reportes quedan sin tu nombre, para que la revisión siga.',
          ],
        },
      ],
    },
    {
      id: 'proveedores',
      title: 'Servicios que usamos',
      blocks: [
        { p: 'Para funcionar gratis, MatchMate usa estos servicios. Cada uno recibe solo lo que necesita para su parte:' },
        {
          list: [
            [{ bold: 'Supabase' }, ': la base de datos, las cuentas, los archivos y las funciones del servidor. Servidores en Estados Unidos (Virginia).'],
            [{ bold: 'Vercel' }, ': donde vive la página de la app.'],
            [{ bold: 'Google' }, ': entrar con Google, la lectura de fotos con IA (Gemini) y los avisos en Android y Chrome.'],
            [{ bold: 'Apple, Mozilla y Microsoft' }, ': los avisos en iPhone, Firefox y Windows. El aviso viaja cifrado.'],
            [{ bold: 'Cloudflare' }, ': la casilla que comprueba que no eres un robot, cuando está activa.'],
            [{ bold: 'Gmail' }, ': los correos de la app (confirmar la cuenta y cambiar la contraseña) y el correo de contacto.'],
          ],
        },
        {
          p: 'Estos servicios están fuera de la República Dominicana, sobre todo en Estados Unidos. Guardar y procesar tus datos allá es una transferencia internacional: la hacemos con tu consentimiento, que das al aceptar esta política, solo con estos servicios y solo para lo que dice esta política.',
        },
      ],
    },
    {
      id: 'fotos',
      title: 'Fotos, logos y la IA de Google',
      blocks: [
        {
          list: [
            'Solo en el boliche: una foto de la pantalla de la bolera para leer los números.',
            'La foto se achica en tu teléfono y se guarda en la liga como comprobante del resultado. La ven los miembros de la liga.',
            'Para leerla, la app se la manda a Gemini, la inteligencia artificial de Google, en su plan gratis. En ese plan Google puede guardar lo que recibe, usarlo para mejorar sus productos, y personas de Google pueden revisarlo.',
            'Por eso: toma la foto solo a la pantalla del marcador. Sin caras, sin personas y sin nada personal.',
            'La lectura solo propone los números: un admin los revisa antes de que cuenten.',
            'Si subes un logo o una imagen de tu liga o equipo, donde la app lo permita, se ve junto a la liga igual que su nombre. Es una imagen pública: la puede ver cualquiera que tenga el link, aunque no tenga cuenta. Usa solo imágenes tuyas o con permiso, sin personas ni datos personales.',
            'Tu foto de perfil y las fotos de tus publicaciones también se guardan como imágenes públicas: en la app solo salen a quien puede ver tu perfil o esa publicación, pero quien tenga el link de la imagen la puede abrir. Sube solo fotos tuyas o con permiso de quien sale en ellas.',
            'En las ligas con menores no se suben fotos.',
            'Las fotos se quedan mientras exista la liga. El admin puede borrar las viejas cuando quiera, y se borran si se borra la liga.',
          ],
        },
      ],
    },
    {
      id: 'avisos',
      title: 'Avisos al teléfono',
      blocks: [
        {
          list: [
            'Los avisos (notificaciones push) solo llegan a los teléfonos donde los activaste. Los apagas cuando quieras, en Configuración o en tu teléfono.',
            'Te pueden llegar recordatorios de tus eventos y partidos, resultados por confirmar, avisos del admin de tu liga, anuncios de MatchMate y cosas como «te empezó a seguir».',
            'Para mandarlos guardamos la dirección de avisos de tu navegador, sus claves y el tipo de teléfono. Esa dirección es de Google, Apple, Mozilla o Microsoft, que llevan el aviso cifrado.',
            'Si un teléfono deja de aceptarlos (por ejemplo, borraste la app), dejamos de mandarle y borramos su dirección.',
          ],
        },
      ],
    },
    {
      id: 'menores',
      title: 'Menores de edad',
      blocks: [
        {
          list: [
            'Las cuentas de MatchMate son solo para mayores de 18 años. La primera vez que entras te preguntamos si tienes 18 años o más.',
            'Un menor puede aparecer como jugador solo en una liga marcada «con menores», que lleva un adulto. El menor no tiene cuenta ni correo en la app.',
            'El admin que lo anota confirma que tiene el permiso de su mamá, su papá o su tutor, y la app guarda quién lo anotó y cuándo. Ese admin responde por los datos que anota.',
            'Esas ligas son privadas, no tienen fotos, comentarios, reacciones ni perfil social, y guardan lo mínimo: el nombre, el año de nacimiento y el sexo si hacen falta para las categorías, y el nombre del tutor.',
          ],
        },
        {
          p: [
            'La mamá, el papá o el tutor puede pedir ver, corregir o borrar los datos del menor al admin de la liga o escribiéndonos a ',
            EMAIL,
            '. Si nos enteramos de que un menor tiene cuenta, la borramos. Si algo pone en riesgo a un menor, repórtalo con el motivo «Pone en riesgo a un menor».',
          ],
        },
      ],
    },
    {
      id: 'tiempo',
      title: 'Cuánto tiempo los guardamos',
      blocks: [
        {
          list: [
            'Tu cuenta, hasta que la borres.',
            'Al borrarla se borran al momento tu perfil, tu correo, tus ligas, publicaciones, comentarios, reacciones, seguidores, bloqueos, avisos, los días de uso, la aceptación de los términos y los errores que mandó tu teléfono. Tu foto de perfil y las fotos de tus publicaciones se borran de Storage en el día.',
            'Tus resultados se quedan en la liga, a nombre de tu jugador pero ya sin tu cuenta: son parte de las tablas y la historia de esa liga. Si quieres que se borren o se cambie el nombre, pídeselo al admin de la liga o escríbenos.',
            'Tus reportes se quedan sin tu nombre. Lo que anota la consola del equipo se queda, también sin tu nombre ni tu correo.',
            'Los errores de la app se borran a los 30 días.',
            'Las copias de seguridad duran 14 días: pasado ese tiempo, lo que borraste ya no está en ninguna.',
          ],
        },
      ],
    },
    {
      id: 'derechos',
      title: 'Tus derechos',
      blocks: [
        { p: 'La Ley 172-13 te da derecho a saber qué datos tenemos, verlos, corregirlos, borrarlos y oponerte a que se usen. Así se hace:' },
        {
          list: [
            [
              { bold: 'Ver y llevarte tus datos' },
              ': Configuración › Tus datos › «Descargar mis datos». Es un archivo con todo lo de tu cuenta, también los reportes que hiciste y cuándo aceptaste los términos.',
            ],
            [{ bold: 'Corregir' }, ': tu nombre se cambia en Configuración. Para un resultado, habla con el admin de tu liga.'],
            [{ bold: 'Borrar' }, ': Configuración › Tus datos › «Borrar mi cuenta». Si tienes ligas a tu nombre, primero se las pasas a otro miembro o las borras.'],
            [{ bold: 'Oponerte o retirar tu permiso' }, ': apaga los avisos cuando quieras. Para lo demás, borra la cuenta.'],
          ],
        },
        {
          p: [
            'Para todo lo demás, escríbenos a ',
            EMAIL,
            ' desde el correo de tu cuenta. Te respondemos lo antes posible y dentro de los plazos de la Ley 172-13. Si no quedas conforme, puedes ir a los tribunales con una acción de hábeas data (artículo 70 de la Constitución).',
          ],
        },
      ],
    },
    {
      id: 'autoridades',
      title: 'Si lo pide una autoridad',
      blocks: [
        {
          p: 'Solo entregamos datos a una autoridad cuando lo ordena un juez o lo exige la ley, por ejemplo en una investigación por la Ley 53-07 sobre crímenes y delitos de alta tecnología. Entregamos solo lo que se pide y, si la ley lo permite, te avisamos.',
        },
      ],
    },
    {
      id: 'seguridad',
      title: 'Cómo los cuidamos',
      blocks: [
        {
          list: [
            'La conexión va cifrada (HTTPS) y las contraseñas también.',
            'Cada quien solo puede leer lo que le toca: las reglas están en la misma base de datos.',
            'Las claves secretas nunca están en la app, y las copias de seguridad van cifradas.',
          ],
        },
        { p: 'Ningún sistema es 100 % seguro. Si pasa algo que afecte tus datos, te avisamos lo antes posible y te decimos qué hacer.' },
      ],
    },
    {
      id: 'telefono',
      title: 'Lo que se guarda en tu teléfono',
      blocks: [
        {
          p: 'Para que abra rápido y funcione sin señal, la app guarda en tu teléfono tu sesión, tus preferencias (tema y colores), una copia de lo que viste y lo que anotaste sin señal hasta que se envíe. No usamos cookies de publicidad ni de rastreo. Al borrar la cuenta, la app borra de ese teléfono lo que era de ella.',
        },
      ],
    },
    {
      id: 'cambios',
      title: 'Cambios a esta política',
      blocks: [
        {
          p: [
            'Cada versión lleva su fecha (arriba). Si cambiamos algo importante, al entrar a la app te mostramos qué cambió y te pedimos aceptarlo antes de seguir, y guardamos qué versión aceptaste. Si no estás de acuerdo, puedes borrar tu cuenta. Lee también los ',
            { link: 'terminos', text: 'Términos de uso' },
            '.',
          ],
        },
      ],
    },
  ],
};

/** El texto de cada documento. */
export const LEGAL_TEXTS: Readonly<Record<LegalDocKey, LegalDocText>> = { terminos: TERMS_TEXT, privacidad: PRIVACY_TEXT };

// ---------- Lo de alrededor del texto (la página) ----------

/** «Versión 29 de septiembre de 2026 · vigente desde 29 de septiembre de 2026». */
export function legalVersionLine(doc: LegalDocKey): string {
  const { version, effective } = LEGAL_DOCS[doc];
  return `Versión ${legalDate(version)} · vigente desde ${legalDate(effective)}`;
}

/** El título del índice. */
export const LEGAL_TOC_TITLE = 'Contenido';

/** Lo de abajo del texto, antes de los links a las dos páginas. */
export const LEGAL_QUESTIONS: LegalText = ['¿Preguntas? Escríbenos a ', EMAIL, '.'];

/** El aviso de borrador (falta la revisión de un abogado): solo lo ve el superadmin. */
export const LEGAL_DRAFT_NOTE: LegalText = [
  { bold: 'Borrador.' },
  ' Pendiente: revisión por un abogado dominicano. Lo marcado en amarillo falta por completar (la lista está en la consola › Legal). Solo tú ves este aviso.',
];

/** Todo el texto de un renglón, sin marcas (para el lector de pantalla y las pruebas). */
export function plainLegalText(text: LegalText): string {
  if (typeof text === 'string') return text;
  return text
    .map((part) => {
      if (typeof part === 'string') return part;
      if ('fill' in part) return part.fill;
      if ('email' in part) return LEGAL_CONTACT.email;
      if ('bold' in part) return part.bold;
      return part.text;
    })
    .join('');
}

/** Las secciones que tiene un documento (las anclas que se pueden pedir: `/privacidad#fotos`). */
export const legalSectionIds = (doc: LegalDocKey): readonly string[] => LEGAL_TEXTS[doc].sections.map((s) => s.id);
