import { Link } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { Bullets, ContactEmail, Fill, LegalDoc, Sub, type LegalSection } from './LegalDoc';
import { LEGAL_CONTACT, TERMS_PATH } from './legal';

/**
 * Política de privacidad (BORRADOR para revisar con un abogado): Ley 172-13 de protección de datos personales y
 * Ley 136-03 (menores). Dice qué guarda la app de verdad: supabase/migrations, las Edge Functions y el teléfono.
 * Si cambia lo que se guarda, se cambia aquí también.
 */
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'resumen',
    title: 'En pocas palabras',
    body: (
      <Bullets
        items={[
          'Guardamos lo necesario para que tu liga funcione: tu nombre, tu correo y tus resultados.',
          'No vendemos tus datos, no mostramos anuncios y no te rastreamos.',
          'Las cuentas son solo para mayores de 18 años. Los menores juegan sin cuenta, en ligas que lleva un adulto y con el permiso de su mamá, su papá o su tutor.',
          'Las fotos del marcador las lee la inteligencia artificial de Google en su plan gratis, y Google puede usarlas para mejorar sus productos.',
          'Puedes bajar tus datos y borrar tu cuenta cuando quieras, desde Configuración.',
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
          MatchMate es una app para organizar ligas y torneos de boliche, pádel, tenis, pickleball, baloncesto, fútbol, golf y natación. El
          responsable de tus datos es <Fill>{LEGAL_CONTACT.responsible}</Fill>, en {LEGAL_CONTACT.place}.
        </p>
        <p>
          Seguimos la Ley 172-13 sobre protección de datos personales y la Ley 136-03, Código para la protección de los derechos de los niños,
          niñas y adolescentes. Para cualquier cosa sobre tus datos, escríbenos a <ContactEmail />.
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
          ]}
        />
        <Sub>Lo que haces en tus ligas</Sub>
        <Bullets
          items={[
            'Las ligas y torneos en los que estás y tu papel (dueño, admin, anotador o jugador).',
            'Tu jugador y sus resultados: juegos, partidos, tarjetas de golf, tiempos de natación, estadísticas y tablas.',
            'Los «voy» a los eventos, tus comentarios y reacciones.',
            'Las sugerencias al admin, que son anónimas: no guardamos quién las mandó.',
          ]}
        />
        <Sub>Lo que anota el admin de tu liga</Sub>
        <Bullets
          items={[
            'Jugadores sin cuenta: su nombre y, si hace falta, su promedio o nivel.',
            'Para los menores: el año de nacimiento y el sexo (para las categorías), el nombre del tutor, y quién dio el permiso y cuándo. Esto solo lo ven los admins de esa liga.',
          ]}
        />
        <Sub>Lo del teléfono</Sub>
        <Bullets
          items={[
            'Si activas los avisos: la dirección de avisos de tu navegador (no tu número de teléfono).',
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
            'Para mandarte los avisos que tú activaste (recordatorios, resultados por confirmar, anuncios de tu liga).',
            'Para cuidar la app: topes contra abusos y bloquear cuentas que hacen trampa.',
            'Para arreglar errores y saber, en números generales, cuánta gente usa la app.',
          ]}
        />
        <p>
          No usamos tus datos para publicidad y no se los vendemos a nadie. Los usamos porque nos diste tu permiso al crear la cuenta (lo
          retiras borrándola) y porque hacen falta para darte el servicio que pediste.
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
          'Los admins de tu liga ven los datos de los jugadores de esa liga, aprueban resultados y pueden sacar a alguien.',
          'Tu correo lo ves tú y el equipo de MatchMate (el superadmin), que puede ver cuentas y ligas para dar soporte y cuidar la app. Lo que hace desde su consola queda anotado.',
          'Las ligas con menores siempre son privadas.',
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
              <b>Gmail</b>: los correos de la app (confirmar la cuenta y cambiar la contraseña).
            </>,
          ]}
        />
        <p>
          Estos servicios están fuera de la República Dominicana, sobre todo en Estados Unidos. Al usar MatchMate aceptas que tus datos se
          guarden y se procesen allá, con ellos, solo para lo que dice esta política.
        </p>
      </>
    ),
  },
  {
    id: 'fotos',
    title: 'Fotos del marcador y la IA de Google',
    body: (
      <>
        <Bullets
          items={[
            'Solo en el boliche: una foto de la pantalla de la bolera para leer los números.',
            'La foto se achica en tu teléfono y se guarda en la liga como comprobante del resultado. La ven los miembros de la liga.',
            'Para leerla, la app se la manda a Gemini, la inteligencia artificial de Google, en su plan gratis. En ese plan Google puede guardar lo que recibe, usarlo para mejorar sus productos, y personas de Google pueden revisarlo.',
            'Por eso: toma la foto solo a la pantalla del marcador. Sin caras, sin personas y sin nada personal.',
            'La lectura solo propone los números: un admin los revisa antes de que cuenten.',
            'En las ligas con menores no se suben fotos.',
            'Las fotos se quedan mientras exista la liga. El admin puede borrar las viejas cuando quiera, y se borran si se borra la liga.',
          ]}
        />
        <p>El logo de una liga o torneo es distinto: es una imagen pública que puede ver cualquiera que tenga el link, aunque no tenga cuenta.</p>
      </>
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
            'El admin que lo anota confirma que tiene el permiso de su mamá, su papá o su tutor, y la app guarda quién lo anotó y cuándo.',
            'Esas ligas son privadas, no tienen fotos, comentarios ni reacciones, y guardan lo mínimo: el nombre, el año de nacimiento y el sexo si hacen falta para las categorías, y el nombre del tutor.',
          ]}
        />
        <p>
          La mamá, el papá o el tutor puede pedir ver, corregir o borrar los datos del menor al admin de la liga o escribiéndonos a{' '}
          <ContactEmail />. Si nos enteramos de que un menor tiene cuenta, la borramos.
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
          'Al borrarla se borran al momento tu perfil, tu correo, tus ligas, comentarios, reacciones, avisos, los días de uso y los errores que mandó tu teléfono.',
          'Tus resultados se quedan en la liga, a nombre de tu jugador pero ya sin tu cuenta: son parte de las tablas y la historia de esa liga. Si quieres que se borren o se cambie el nombre, pídeselo al admin de la liga o escríbenos.',
          'Lo que anota la consola del equipo se queda, pero sin tu nombre ni tu correo.',
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
        <p>La Ley 172-13 te da derecho a ver tus datos, corregirlos, borrarlos y oponerte a que se usen. Así se hace:</p>
        <Bullets
          items={[
            <>
              <b>Ver y llevarte tus datos</b>: Configuración › Tus datos › «Descargar mis datos». Es un archivo con todo lo de tu cuenta.
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
          Para todo lo demás, escríbenos a <ContactEmail /> y te respondemos lo antes posible. Si no quedas conforme, puedes ir a los
          tribunales con una acción de hábeas data (artículo 70 de la Constitución).
        </p>
      </>
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
        <p>Ningún sistema es 100 % seguro. Si pasa algo que afecte tus datos, te avisamos.</p>
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
        Si cambiamos algo importante, te avisamos en la app antes. La fecha de arriba dice cuándo fue la última vez. Lee también los{' '}
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
      title="Política de privacidad"
      icon={<ShieldCheck className="size-6" />}
      lead="Qué datos guarda MatchMate, para qué, quién los ve y cómo los bajas o los borras."
      sections={PRIVACY_SECTIONS}
    />
  );
}
