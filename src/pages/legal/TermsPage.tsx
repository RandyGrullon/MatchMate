import { Link } from 'react-router';
import { ScrollText } from 'lucide-react';
import { Bullets, ContactEmail, LegalDoc, type LegalSection } from './LegalDoc';
import { PRIVACY_PATH } from './legal';

const privacyLink = (hash = '') => (
  <Link to={`${PRIVACY_PATH}${hash}`} className="font-medium text-accent underline underline-offset-2">
    Política de privacidad
  </Link>
);

/** Términos de uso (BORRADOR para revisar con un abogado de República Dominicana). */
export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'acuerdo',
    title: 'El acuerdo',
    body: (
      <p>
        Al crear una cuenta o usar MatchMate aceptas estos términos y la {privacyLink()}. Si no estás de acuerdo, no uses la app.
      </p>
    ),
  },
  {
    id: 'quien',
    title: 'Quién puede usar MatchMate',
    body: (
      <Bullets
        items={[
          'Solo los mayores de 18 años pueden tener cuenta.',
          'Una cuenta por persona, con tu nombre de verdad.',
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
          horarios, aprueban los resultados y responden por su liga. Quien anota a un menor responde por tener el permiso de su tutor.
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
      <Bullets
        items={[
          'Anotar resultados falsos o hacer trampa.',
          'Molestar, amenazar, insultar o discriminar a otros.',
          'Nombres, comentarios o fotos ofensivos, sexuales o ilegales.',
          'Subir fotos de personas: solo la pantalla del marcador.',
          'Usar los datos de otros sin su permiso.',
          'Entrar donde no te toca, intentar romper la app o abusar de ella con programas.',
          'Usar la app para mandar publicidad que nadie pidió.',
        ]}
      />
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
    title: 'Fotos y lectura con IA',
    body: (
      <p>
        La lectura automática de las fotos puede equivocarse: un admin revisa los números antes de que cuenten. Las fotos las lee la IA de
        Google en su plan gratis, como explica la {privacyLink('#fotos')}.
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
        Si cambiamos algo importante, te avisamos en la app antes. Si sigues usándola después, aceptas los cambios. Para cualquier duda,
        escríbenos a <ContactEmail />.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Términos de uso"
      icon={<ScrollText className="size-6" />}
      lead="Las reglas para usar MatchMate: quién puede tener cuenta, qué no se permite y qué pasa con tus ligas."
      sections={TERMS_SECTIONS}
    />
  );
}
