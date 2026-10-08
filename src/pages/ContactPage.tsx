import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Copy, Mail, Send } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { AppShell } from '../components/Shell';
import { useFeedback } from '../components/feedback';
import { BusyIcon, useBusy } from '../components/busy';
import { copyText } from '../components/share/actions';
import { BackBar, BigField, BigInput, BigSelect, BigTextarea } from '../components/cuenta/kit';
import { Button, Card, RowIcon, SectionHeader, cx } from '../components/ui';
import { LEGAL_CONTACT, PRIVACY_PATH } from './legal/legal';

/** El correo de MatchMate (lo lee el equipo): el mismo que dicen la privacidad y los términos (src/lib/legal.ts). */
export const CONTACT_EMAIL: string = LEGAL_CONTACT.email;

export const CONTACT_REASONS = ['Tengo una duda', 'Algo no funciona', 'Una idea para la app', 'Quiero usarla en mi liga', 'Otro'] as const;
export type ContactReason = (typeof CONTACT_REASONS)[number];

/** Hasta dónde se escribe: los links mailto muy largos no los abren todas las apps de correo. */
export const CONTACT_MAX = 1500;

export interface ContactDraft {
  name: string;
  email: string;
  reason: string;
  message: string;
}

/**
 * El link que abre la app de correo con todo listo: para CONTACT_EMAIL, el asunto «MatchMate · <motivo>» y en el
 * cuerpo el mensaje, el nombre y el correo para responder (si lo puso). Nada pasa por la app ni se guarda.
 */
export function contactMailto(d: ContactDraft): string {
  const reason = (CONTACT_REASONS as readonly string[]).includes(d.reason) ? d.reason : 'Otro';
  const lines = [d.message.trim().slice(0, CONTACT_MAX), '', '--', `Nombre: ${d.name.trim() || 'Sin nombre'}`];
  if (d.email.trim()) lines.push(`Correo para responder: ${d.email.trim()}`);
  const subject = `MatchMate · ${reason}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\r\n'))}`;
}

const FAQ: readonly { q: string; a: ReactNode }[] = [
  {
    q: '¿Cuánto cuesta?',
    a: 'Nada: MatchMate es gratis. Crear ligas y torneos, invitar a tu gente, anotar juegos y ver tus estadísticas no cuesta.',
  },
  {
    q: '¿Cómo creo una liga?',
    a: 'Crea tu cuenta y ve a Ligas › Crear o unirme. Eliges el deporte, le pones nombre y listo; después invitas a tu gente con un link o un código.',
  },
  {
    q: '¿Cómo me uno a una liga?',
    a: 'Abre el link que te pasó quien la maneja, o ve a Ligas › Crear o unirme y pon el código. Las ligas abiertas están en Ligas › Buscar ligas abiertas.',
  },
  {
    q: '¿Qué pasa con mis datos?',
    a: (
      <>
        Guardamos solo lo necesario para que tu liga funcione. No vendemos tus datos, y puedes bajarlos o borrar tu cuenta cuando quieras.{' '}
        <Link to={PRIVACY_PATH} className="font-medium text-accent underline underline-offset-2">
          Lee la política de privacidad
        </Link>
        .
      </>
    ),
  },
];

/** Las filas de arriba (el correo y copiarlo): como ListRow, pero una es un link mailto y la otra da vueltas al copiar. */
const rowClass = 'mm-row relative flex min-h-row w-full items-center gap-3.5 py-2.5 pr-[18px] pl-5 text-left';

/**
 * Contáctanos (/contacto; sin cuenta, en la barra de abajo; con cuenta, desde Configuración con «‹ Configuración»),
 * rediseño «Calma y foco»: el título, el correo de MatchMate en filas (escribir y copiar), el formulario que arma el
 * correo y abre la app de correo (no hay servidor: nada se manda ni se guarda desde aquí) y las preguntas frecuentes.
 */
export default function ContactPage() {
  const auth = useAuth();
  const { toast } = useFeedback();
  const [name, setName] = useState(() => (auth.user ? displayName(auth) : ''));
  const [email, setEmail] = useState(() => auth.user?.email ?? '');
  const [reason, setReason] = useState<ContactReason>(CONTACT_REASONS[0]);
  const [message, setMessage] = useState('');
  const ready = name.trim() !== '' && message.trim() !== '';
  const copying = useBusy();
  // La sesión puede llegar después de abrir la pantalla: el nombre y el correo se llenan si siguen vacíos.
  const myName = auth.user ? displayName(auth) : '';
  const myEmail = auth.user?.email ?? '';
  useEffect(() => {
    if (myName) setName((n) => n || myName);
    if (myEmail) setEmail((e) => e || myEmail);
  }, [myName, myEmail]);

  async function copy() {
    if (await copyText(CONTACT_EMAIL)) toast('Correo copiado');
    else toast('No se pudo copiar. Mantén el dedo sobre el correo para copiarlo.', 'error');
  }

  function write(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    window.location.href = contactMailto({ name, email, reason, message });
  }

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        {auth.user ? <BackBar to="/cuenta" label="Configuración" className="-mt-2 mb-1" /> : null}
        <h1 className="text-title">Contáctanos</h1>
        <p className="mt-1.5 text-meta text-muted">¿Una duda, algo que no funciona o una idea? Te respondemos.</p>

        <Card className="mt-5 overflow-hidden">
          {/* Toda la fila (ícono, «Nuestro correo» y la dirección) abre el correo: un blanco cómodo para el dedo. */}
          <a href={`mailto:${CONTACT_EMAIL}`} className={cx(rowClass, 'transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent')}>
            <RowIcon tone="accent">
              <Mail className="size-5" />
            </RowIcon>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-muted">Nuestro correo</span>
              {/* Completo (en un teléfono angosto pasa al otro renglón antes de la @, no a mitad de «gmail.com»). */}
              <span className="block text-body font-semibold [overflow-wrap:anywhere] text-accent">
                {CONTACT_EMAIL.split('@')[0]}
                <wbr />@{CONTACT_EMAIL.split('@').slice(1).join('@')}
              </span>
            </span>
          </a>
          <button
            type="button"
            onClick={() => void copying.run('copiar', copy)}
            disabled={copying.isBusy()}
            aria-busy={copying.isBusy() || undefined}
            className={cx(rowClass, 'transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:opacity-80')}
          >
            <RowIcon>
              <BusyIcon busy={copying.isBusy()} icon={<Copy className="size-5" />} className="size-5" />
            </RowIcon>
            <span className="min-w-0 flex-1 text-body font-semibold">Copiar correo</span>
          </button>
        </Card>

        <section aria-labelledby="contacto-form" className="mt-[30px]">
          <SectionHeader id="contacto-form" title="Escríbenos desde aquí" />
          <Card className="p-5">
            <form onSubmit={write} className="flex flex-col gap-5">
              <BigField label="Nombre">
                <BigInput required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </BigField>
              <BigField label="Tu correo (opcional)" hint="Para responderte, si no escribes desde ese mismo correo.">
                <BigInput type="email" maxLength={120} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </BigField>
              <BigField label="Motivo">
                <BigSelect value={reason} onChange={(e) => setReason(e.target.value as ContactReason)}>
                  {CONTACT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </BigSelect>
              </BigField>
              <BigField label="Mensaje" hint={message.length > CONTACT_MAX - 100 ? `${message.length} de ${CONTACT_MAX} letras.` : undefined}>
                <BigTextarea required rows={5} maxLength={CONTACT_MAX} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Cuéntanos" />
              </BigField>
              <div className="flex flex-col gap-2">
                <Button type="submit" variant="primary" size="xl" disabled={!ready} icon={<Send className="size-5" />} className="w-full">
                  Escribir el correo
                </Button>
                <p className="text-center text-[13px] text-muted">Se abre tu app de correo con el mensaje listo.</p>
              </div>
            </form>
          </Card>
        </section>

        <section aria-labelledby="contacto-faq" className="mt-[30px]">
          <SectionHeader id="contacto-faq" title="Preguntas frecuentes" />
          <Card className="overflow-hidden">
            {FAQ.map((f) => (
              <details key={f.q} className="group mm-row relative">
                <summary className="flex min-h-row cursor-pointer list-none items-center gap-3 py-3 pr-[18px] pl-5 text-body font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{f.q}</span>
                  <ChevronDown className="size-5 shrink-0 text-faint transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="pr-[18px] pb-4 pl-5 text-meta text-fg-2">{f.a}</p>
              </details>
            ))}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
