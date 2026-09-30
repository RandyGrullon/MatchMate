import { Link } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { Bullets, ContactEmail, Fill, LegalDoc, Sub, type LegalSection } from './LegalDoc';
import { LEGAL_CONTACT, TERMS_PATH } from './legal';

/**
 * Política de privacidad (BORRADOR para revisar con un abogado dominicano): Constitución (arts. 44 y 70), Ley 172-13
 * de protección de datos personales, Ley 136-03 (menores) y Ley 53-07 (autoridades). Dice qué guarda la app de
 * verdad: supabase/migrations, las Edge Functions y el teléfono. Si cambia lo que se guarda, se cambia aquí, se sube
 * PRIVACY_VERSION en src/lib/legal.ts (con lo que cambió) y la misma fecha en private.legal_versions().
 */
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'resumen',
    title: 'En pocas palabras',
    body: (
      <Bullets
        items={[
          'Guardamos lo necesario para que tus ligas funcionen: tu nombre, tu correo y tus resultados.',
          'No vendemos tus datos, no mostramos anuncios y no te rastreamos.',
          'Las cuentas son solo para mayores de 18 años. Los menores juegan sin cuenta, en ligas que lleva un adulto y con el permiso de su mamá, su papá o su tutor.',
          'Las fotos del marcador las lee la inteligencia artificial de Google en su plan gratis, y Google puede usarlas para mejorar sus productos.',
          'Puedes bajar tus datos y borrar tu cuenta cuando quieras, desde Configuración.',
          <>
            Para cualquier pregunta sobre tus datos, escríbenos a <ContactEmail />.
          </>,
        ]}
      />
    ),
  },
  {
    id: 'responsable',
    title: 'Quién cuida tus datos',
    body: (
      <>
        <p>
          MatchMate es una app para organizar ligas y torneos de boliche, pádel, tenis, pickleball, ping pong, baloncesto, fútbol, golf y natación. El
          responsable de tus datos es <Fill>{LEGAL_CONTACT.responsible}</Fill> (<Fill>{LEGAL_CONTACT.taxId}</Fill>), con domicilio en{' '}
          <Fill>{LEGAL_CONTACT.address}</Fill>, {LEGAL_CONTACT.place}.
        </p>
        <p>
          Tratamos tus datos según la Constitución dominicana (artículo 44, derecho a la intimidad, y artículo 70, hábeas data), la Ley 172-13
          sobre protección integral de los datos personales y, para los menores, la Ley 136-03, Código para la protección de los derechos de los
          niños, niñas y adolescentes.
        </p>
        <p>
          Para cualquier cosa sobre tus datos, escríbenos a <ContactEmail />.
        </p>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Qué datos guardamos',
    body: (
      <>
        <Sub>Tu cuenta</Sub>
        <Bullets
          items={[
            'Tu nombre y tu correo.',
            'Tu contraseña, guardada cifrada: nadie puede leerla, ni nosotros.',
            'Si entras con Google, Google nos pasa tu nombre y tu correo (nada más).',
            'La fecha en que confirmaste que tienes 18 años o más.',
            'Cuándo aceptaste los Términos de uso y esta política, qué versión y desde qué navegador.',
          ]}
        />
        <Sub>Lo que haces en tus ligas</Sub>
        <Bullets
          items={[
            'Las ligas y torneos en los que estás y tu papel (dueño, admin, anotador o jugador).',
            'Tu jugador y sus resultados: juegos, partidos, tarjetas de golf, tiempos de natación, estadísticas y tablas.',
            'Los «voy» a los eventos, tus comentarios, reacciones y «me gusta», a quién sigues y quién te sigue.',
            'Si pides ser un jugador que anotó el admin («ese soy yo»), tu pedido y tu nota.',
            'Los reportes que haces: qué reportaste, el motivo, tu nota y cuándo.',
            'Las sugerencias al admin, que son anónimas: no guardamos quién las mandó.',
          ]}
        />
        <Sub>Lo que anota el admin de tu liga</Sub>
        <Bullets
          items={[
            'Jugadores sin cuenta: su nombre y, si hace falta, su promedio, nivel o índice.',
            'Para los menores: el año de nacimiento y el sexo (para las categorías), el nombre del tutor, y quién dio el permiso y cuándo. Esto solo lo ven los admins de esa liga.',
          ]}
        />
        <Sub>Lo del teléfono</Sub>
        <Bullets
          items={[
            'Si activas los avisos: la dirección de avisos de tu navegador y el tipo de teléfono (no tu número de teléfono).',
            'La última vez que abriste la app y los días que la usaste, para saber cuánta gente la usa.',
            'Cuántas fotos leíste con IA cada día (hay un tope por persona).',
            'Los errores de la app: qué pantalla falló, el navegador y la versión de la app. Así sabemos qué arreglar.',
          ]}
        />
        <p>No pedimos tu cédula, tu dirección, tu número de teléfono ni tu ubicación. El teléfono de contacto de una liga lo pone su organizador, si quiere.</p>
      </>
    ),
  },
  {
    id: 'uso',
    title: 'Para qué los usamos',
    body: (
      <>
        <Bullets
          items={[
            'Para que funcionen las ligas: tablas, estadísticas, resultados en vivo y el historial.',
            'Para mandarte los avisos que tú activaste.',
            'Para cuidar la app y a su gente: revisar los reportes, poner topes contra abusos y bloquear cuentas que no cumplen los Términos.',
            'Para arreglar errores y saber, en números generales, cuánta gente usa la app.',
            'Para poder demostrar qué versión de los Términos y de esta política aceptaste.',
          ]}
        />
        <p>
          No usamos tus datos para publicidad y no se los vendemos a nadie. Los usamos con tu consentimiento, que das al crear la cuenta y al
          aceptar esta política (lo retiras borrando la cuenta), y porque hacen falta para darte el servicio que pediste.
        </p>
      </>
    ),
  },
  {
    id: 'quien-ve',
    title: 'Quién ve tus datos',
    body: (
      <Bullets
        items={[
          'Liga pública: cualquiera con el link ve los nombres de los jugadores, los resultados y las tablas. Nunca tu correo.',
          'Liga privada: solo sus miembros.',
          'Tu perfil (nombre, deportes, seguidores y juegos) lo ven las cuentas que comparten una liga contigo o que te siguen, y cualquier cuenta si juegas en una liga pública. Solo salen los juegos de ligas que esa persona puede ver, nunca los de ligas con menores.',
          'Los admins de tu liga ven los datos de los jugadores de esa liga, aprueban resultados, pueden sacar a alguien y borrar comentarios.',
          'Tu correo lo ves tú y el equipo de MatchMate (el superadmin), que puede ver cuentas y ligas para dar soporte y cuidar la app. Lo que hace desde su consola queda anotado.',
          'Las ligas con menores siempre son privadas.',
        ]}
      />
    ),
  },
  {
    id: 'reportes',
    title: 'Reportes',
    body: (
      <Bullets
        items={[
          'Si reportas algo (un comentario, un aviso, un juego, una liga o una cuenta), guardamos qué reportaste, el motivo, tu nota y cuándo.',
          'Lo revisa el equipo de MatchMate. Si es un comentario, un aviso o un juego de una liga, también los admins de esa liga, pero sin saber quién lo reportó (si lo reportado es de un admin, ese admin no lo ve). La persona reportada tampoco sabe quién fue.',
          'Queda anotado qué se hizo (descartado o atendido), quién y una nota. Si lo reportado no cumple los Términos, se puede borrar o bloquear la cuenta.',
          'Si borras tu cuenta, tus reportes quedan sin tu nombre, para que la revisión siga.',
        ]}
      />
    ),
  },
  {
    id: 'proveedores',
    title: 'Servicios que usamos',
    body: (
      <>
        <p>Para funcionar gratis, MatchMate usa estos servicios. Cada uno recibe solo lo que necesita para su parte:</p>
        <Bullets
          items={[
            <>
              <b>Supabase</b>: la base de datos, las cuentas, los archivos y las funciones del servidor. Servidores en Estados Unidos (Virginia).
            </>,
            <>
              <b>Vercel</b>: donde vive la página de la app.
            </>,
            <>
              <b>Google</b>: entrar con Google, la lectura de fotos con IA (Gemini) y los avisos en Android y Chrome.
            </>,
            <>
              <b>Apple, Mozilla y Microsoft</b>: los avisos en iPhone, Firefox y Windows. El aviso viaja cifrado.
            </>,
            <>
              <b>Cloudflare</b>: la casilla que comprueba que no eres un robot, cuando está activa.
            </>,
            <>
              <b>Gmail</b>: los correos de la app (confirmar la cuenta y cambiar la contraseña) y el correo de contacto.
            </>,
          ]}
        />
        <p>
          Estos servicios están fuera de la República Dominicana, sobre todo en Estados Unidos. Guardar y procesar tus datos allá es una
          transferencia internacional: la hacemos con tu consentimiento, que das al aceptar esta política, solo con estos servicios y solo para lo
          que dice esta política.
        </p>
      </>
    ),
  },
  {
    id: 'fotos',
    title: 'Fotos, logos y la IA de Google',
    body: (
      <Bullets
        items={[
          'Solo en el boliche: una foto de la pantalla de la bolera para leer los números.',
          'La foto se achica en tu teléfono y se guarda en la liga como comprobante del resultado. La ven los miembros de la liga.',
          'Para leerla, la app se la manda a Gemini, la inteligencia artificial de Google, en su plan gratis. En ese plan Google puede guardar lo que recibe, usarlo para mejorar sus productos, y personas de Google pueden revisarlo.',
          'Por eso: toma la foto solo a la pantalla del marcador. Sin caras, sin personas y sin nada personal.',
          'La lectura solo propone los números: un admin los revisa antes de que cuenten.',
          'Si subes un logo o una imagen de tu liga o equipo, donde la app lo permita, se ve junto a la liga igual que su nombre. Es una imagen pública: la puede ver cualquiera que tenga el link, aunque no tenga cuenta. Usa solo imágenes tuyas o con permiso, sin personas ni datos personales.',
          'En las ligas con menores no se suben fotos.',
          'Las fotos se quedan mientras exista la liga. El admin puede borrar las viejas cuando quiera, y se borran si se borra la liga.',
        ]}
      />
    ),
  },
  {
    id: 'avisos',
    title: 'Avisos al teléfono',
    body: (
      <Bullets
        items={[
          'Los avisos (notificaciones push) solo llegan a los teléfonos donde los activaste. Los apagas cuando quieras, en Configuración o en tu teléfono.',
          'Te pueden llegar recordatorios de tus eventos y partidos, resultados por confirmar, avisos del admin de tu liga, anuncios de MatchMate y cosas como «te empezó a seguir».',
          'Para mandarlos guardamos la dirección de avisos de tu navegador, sus claves y el tipo de teléfono. Esa dirección es de Google, Apple, Mozilla o Microsoft, que llevan el aviso cifrado.',
          'Si un teléfono deja de aceptarlos (por ejemplo, borraste la app), dejamos de mandarle y borramos su dirección.',
        ]}
      />
    ),
  },
  {
    id: 'menores',
    title: 'Menores de edad',
    body: (
      <>
        <Bullets
          items={[
            'Las cuentas de MatchMate son solo para mayores de 18 años. La primera vez que entras te preguntamos si tienes 18 años o más.',
            'Un menor puede aparecer como jugador solo en una liga marcada «con menores», que lleva un adulto. El menor no tiene cuenta ni correo en la app.',
            'El admin que lo anota confirma que tiene el permiso de su mamá, su papá o su tutor, y la app guarda quién lo anotó y cuándo. Ese admin responde por los datos que anota.',
            'Esas ligas son privadas, no tienen fotos, comentarios, reacciones ni perfil social, y guardan lo mínimo: el nombre, el año de nacimiento y el sexo si hacen falta para las categorías, y el nombre del tutor.',
          ]}
        />
        <p>
          La mamá, el papá o el tutor puede pedir ver, corregir o borrar los datos del menor al admin de la liga o escribiéndonos a{' '}
          <ContactEmail />. Si nos enteramos de que un menor tiene cuenta, la borramos. Si algo pone en riesgo a un menor, repórtalo con el
          motivo «Pone en riesgo a un menor».
        </p>
      </>
    ),
  },
  {
    id: 'tiempo',
    title: 'Cuánto tiempo los guardamos',
    body: (
      <Bullets
        items={[
          'Tu cuenta, hasta que la borres.',
          'Al borrarla se borran al momento tu perfil, tu correo, tus ligas, comentarios, reacciones, seguidores, avisos, los días de uso, la aceptación de los términos y los errores que mandó tu teléfono.',
          'Tus resultados se quedan en la liga, a nombre de tu jugador pero ya sin tu cuenta: son parte de las tablas y la historia de esa liga. Si quieres que se borren o se cambie el nombre, pídeselo al admin de la liga o escríbenos.',
          'Tus reportes se quedan sin tu nombre. Lo que anota la consola del equipo se queda, también sin tu nombre ni tu correo.',
          'Los errores de la app se borran a los 30 días.',
          'Las copias de seguridad duran 14 días: pasado ese tiempo, lo que borraste ya no está en ninguna.',
        ]}
      />
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    body: (
      <>
        <p>La Ley 172-13 te da derecho a saber qué datos tenemos, verlos, corregirlos, borrarlos y oponerte a que se usen. Así se hace:</p>
        <Bullets
          items={[
            <>
              <b>Ver y llevarte tus datos</b>: Configuración › Tus datos › «Descargar mis datos». Es un archivo con todo lo de tu cuenta,
              también los reportes que hiciste y cuándo aceptaste los términos.
            </>,
            <>
              <b>Corregir</b>: tu nombre se cambia en Configuración. Para un resultado, habla con el admin de tu liga.
            </>,
            <>
              <b>Borrar</b>: Configuración › Tus datos › «Borrar mi cuenta». Si tienes ligas a tu nombre, primero se las pasas a otro miembro o
              las borras.
            </>,
            <>
              <b>Oponerte o retirar tu permiso</b>: apaga los avisos cuando quieras. Para lo demás, borra la cuenta.
            </>,
          ]}
        />
        <p>
          Para todo lo demás, escríbenos a <ContactEmail /> desde el correo de tu cuenta. Te respondemos lo antes posible y dentro de los plazos
          de la Ley 172-13. Si no quedas conforme, puedes ir a los tribunales con una acción de hábeas data (artículo 70 de la Constitución).
        </p>
      </>
    ),
  },
  {
    id: 'autoridades',
    title: 'Si lo pide una autoridad',
    body: (
      <p>
        Solo entregamos datos a una autoridad cuando lo ordena un juez o lo exige la ley, por ejemplo en una investigación por la Ley 53-07
        sobre crímenes y delitos de alta tecnología. Entregamos solo lo que se pide y, si la ley lo permite, te avisamos.
      </p>
    ),
  },
  {
    id: 'seguridad',
    title: 'Cómo los cuidamos',
    body: (
      <>
        <Bullets
          items={[
            'La conexión va cifrada (HTTPS) y las contraseñas también.',
            'Cada quien solo puede leer lo que le toca: las reglas están en la misma base de datos.',
            'Las claves secretas nunca están en la app, y las copias de seguridad van cifradas.',
          ]}
        />
        <p>Ningún sistema es 100 % seguro. Si pasa algo que afecte tus datos, te avisamos lo antes posible y te decimos qué hacer.</p>
      </>
    ),
  },
  {
    id: 'telefono',
    title: 'Lo que se guarda en tu teléfono',
    body: (
      <p>
        Para que abra rápido y funcione sin señal, la app guarda en tu teléfono tu sesión, tus preferencias (tema y colores), una copia de lo
        que viste y lo que anotaste sin señal hasta que se envíe. No usamos cookies de publicidad ni de rastreo. Al borrar la cuenta, la app
        borra de ese teléfono lo que era de ella.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a esta política',
    body: (
      <p>
        Cada versión lleva su fecha (arriba). Si cambiamos algo importante, al entrar a la app te mostramos qué cambió y te pedimos aceptarlo
        antes de seguir, y guardamos qué versión aceptaste. Si no estás de acuerdo, puedes borrar tu cuenta. Lee también los{' '}
        <Link to={TERMS_PATH} className="font-medium text-accent underline underline-offset-2">
          Términos de uso
        </Link>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      doc="privacidad"
      icon={<ShieldCheck className="size-6" />}
      lead="Qué datos guarda MatchMate, para qué, quién los ve y cómo los bajas o los borras."
      sections={PRIVACY_SECTIONS}
    />
  );
}
