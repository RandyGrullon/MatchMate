import { Link } from 'react-router';
import { ScrollText } from 'lucide-react';
import { Bullets, ContactEmail, Fill, LegalDoc, type LegalSection } from './LegalDoc';
import { LEGAL_CONTACT, PRIVACY_PATH } from './legal';

const privacyLink = (hash = '') => (
  <Link to={`${PRIVACY_PATH}${hash}`} className="font-medium text-accent underline underline-offset-2">
    Política de privacidad
  </Link>
);

/**
 * Términos de uso (BORRADOR para revisar con un abogado de República Dominicana). Si cambian, se sube TERMS_VERSION
 * en src/lib/legal.ts (con lo que cambió) y la misma fecha en private.legal_versions().
 */
export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'acuerdo',
    title: 'El acuerdo',
    body: (
      <>
        <p>
          Estos términos son un acuerdo entre tú y <Fill>{LEGAL_CONTACT.responsible}</Fill> (<Fill>{LEGAL_CONTACT.taxId}</Fill>), responsable
          de MatchMate.
        </p>
        <p>
          Al crear una cuenta o usar MatchMate aceptas estos términos y la {privacyLink()}. Guardamos qué versión aceptaste y cuándo. Si no estás
          de acuerdo, no uses la app.
        </p>
      </>
    ),
  },
  {
    id: 'quien',
    title: 'Quién puede usar MatchMate',
    body: (
      <Bullets
        items={[
          'Solo los mayores de 18 años pueden tener cuenta.',
          'Una cuenta por persona, con tu nombre de verdad. No te hagas pasar por otra persona.',
          'Los menores participan solo como jugadores sin cuenta, en ligas «con menores» que lleva un adulto, con el permiso de su mamá, su papá o su tutor (Ley 136-03).',
        ]}
      />
    ),
  },
  {
    id: 'cuenta',
    title: 'Tu cuenta',
    body: (
      <Bullets
        items={[
          'Cuida tu contraseña: lo que se haga con tu cuenta es tu responsabilidad.',
          'Si alguien entró sin tu permiso, cambia la contraseña y avísanos.',
        ]}
      />
    ),
  },
  {
    id: 'ligas',
    title: 'Las ligas y sus organizadores',
    body: (
      <>
        <p>
          MatchMate es una herramienta: no organiza los eventos. El dueño y los admins de cada liga deciden quién entra, las reglas y los
          horarios, aprueban los resultados y responden por su liga. En su liga pueden sacar a alguien, corregir resultados y borrar comentarios.
          Quien anota a un menor responde por tener el permiso de su tutor y por los datos que anota.
        </p>
        <p>
          MatchMate no responde por premios, cuotas, pagos, lesiones, peleas entre jugadores ni por lo que pase en las canchas, boleras, campos
          o piscinas.
        </p>
      </>
    ),
  },
  {
    id: 'reglas',
    title: 'Lo que no se permite',
    body: (
      <>
        <Bullets
          items={[
            'Anotar resultados falsos o hacer trampa.',
            'Molestar, amenazar, insultar o discriminar a otros.',
            'Nombres, comentarios, avisos o imágenes ofensivos, sexuales o ilegales.',
            'Publicar datos de otras personas (teléfono, dirección, fotos) sin su permiso, o cualquier cosa sobre un menor fuera de lo que pide su liga.',
            'Usar la app para mandar publicidad que nadie pidió.',
            'Entrar donde no te toca, usar la cuenta de otro, intentar romper la app o abusar de ella con programas.',
          ]}
        />
        <p>
          Algunas de estas cosas, además, pueden ser delito según la Ley 53-07 sobre crímenes y delitos de alta tecnología (por ejemplo, entrar
          sin permiso a una cuenta o hacerte pasar por otra persona).
        </p>
      </>
    ),
  },
  {
    id: 'contenido',
    title: 'Lo que publicas',
    body: (
      <p>
        Lo que anotas y escribes sigue siendo tuyo. Nos das permiso para guardarlo y mostrarlo en tu liga, según sea pública o privada, mientras
        haga falta para el servicio. Los resultados son parte de la historia de la liga: se quedan aunque salgas de ella o borres tu cuenta (ya
        sin tu cuenta).
      </p>
    ),
  },
  {
    id: 'fotos',
    title: 'Fotos, logos y nombres',
    body: (
      <Bullets
        items={[
          'Las fotos del marcador son solo de la pantalla: sin personas.',
          'Si subes un logo o una imagen de tu liga o equipo, donde la app lo permita, tiene que ser tuyo o tener el permiso de su dueño. No uses marcas de otros sin permiso.',
          'Los nombres de ligas, equipos y jugadores no pueden ser ofensivos ni hacerse pasar por otro.',
          <>
            La lectura automática de las fotos puede equivocarse: un admin revisa los números antes de que cuenten. Las fotos las lee la IA de
            Google en su plan gratis, como explica la {privacyLink('#fotos')}.
          </>,
        ]}
      />
    ),
  },
  {
    id: 'reportes',
    title: 'Reportar y moderar',
    body: (
      <>
        <Bullets
          items={[
            'Si ves algo que no cumple estas reglas (un comentario, un aviso, un juego, una liga o una cuenta), toca la bandera («Reportar») que tiene al lado.',
            'Lo revisa el equipo de MatchMate y, si es un comentario, un aviso o un juego de una liga, también sus admins (menos el admin del que es lo reportado). No le decimos a nadie quién lo reportó.',
            'Podemos descartar el reporte, borrar lo reportado, bloquear la cuenta o borrar la liga. Reportar a propósito algo que cumple las reglas también es abuso.',
          ]}
        />
        <p>Si alguien está en peligro, llama primero al 911.</p>
      </>
    ),
  },
  {
    id: 'avisos',
    title: 'Avisos al teléfono',
    body: (
      <p>
        Los avisos llegan solo si los activas. El admin de tu liga puede mandar avisos a su liga (unos pocos al día) y MatchMate manda anuncios
        de la app de vez en cuando. Los apagas cuando quieras. Qué se guarda para mandarlos lo explica la {privacyLink('#avisos')}.
      </p>
    ),
  },
  {
    id: 'gratis',
    title: 'Una app gratis',
    body: (
      <p>
        MatchMate es gratis y usa los planes gratis de sus proveedores. Por eso puede tener topes (fotos por día, avisos), pausas o cambios, y
        podemos cambiar o quitar funciones. Hacemos copias de seguridad, pero no podemos garantizar que la app funcione siempre ni que nunca se
        pierda información. La app se ofrece como está.
      </p>
    ),
  },
  {
    id: 'bloqueo',
    title: 'Cuentas bloqueadas',
    body: (
      <p>
        Si alguien no cumple estos términos, podemos bloquear su cuenta (puede ver, pero no anotar ni escribir) o borrar lo que publicó. Si crees
        que fue un error, escríbenos a <ContactEmail />.
      </p>
    ),
  },
  {
    id: 'salir',
    title: 'Salir y borrar tu cuenta',
    body: (
      <p>
        Puedes salir de una liga o borrar tu cuenta cuando quieras, desde Configuración. Si eres dueño de ligas, primero se las pasas a otro
        miembro o las borras. Lo que pasa con tus datos lo explica la {privacyLink('#tiempo')}.
      </p>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Hasta dónde respondemos',
    body: (
      <p>
        Hasta donde lo permita la ley, MatchMate no responde por daños indirectos ni por la pérdida de datos o de oportunidades por usar la app
        o no poder usarla. Nada de esto te quita los derechos que te da la ley dominicana, como la Ley 358-05 de protección al consumidor
        cuando aplique.
      </p>
    ),
  },
  {
    id: 'ley',
    title: 'Ley y tribunales',
    body: <p>Estos términos se rigen por las leyes de la República Dominicana. Cualquier conflicto se resuelve en los tribunales de Santo Domingo.</p>,
  },
  {
    id: 'cambios',
    title: 'Cambios',
    body: (
      <p>
        Cada versión lleva su fecha (arriba). Si cambiamos algo importante, al entrar a la app te mostramos qué cambió y te pedimos aceptarlo
        antes de seguir. Si no estás de acuerdo, puedes salir o borrar tu cuenta.
      </p>
    ),
  },
  {
    id: 'contacto',
    title: 'Contacto',
    body: (
      <p>
        Para cualquier duda, reclamo o aviso sobre estos términos, escríbenos a <ContactEmail />.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      doc="terminos"
      icon={<ScrollText className="size-6" />}
      lead="Las reglas para usar MatchMate: quién puede tener cuenta, qué no se permite y qué pasa con tus ligas."
      sections={TERMS_SECTIONS}
    />
  );
}
