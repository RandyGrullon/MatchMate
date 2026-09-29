import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronDown, Copy, Mail, MessageCircle, Send } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { AppShell } from '../components/Shell';
import { useFeedback } from '../components/feedback';
import { copyText } from '../components/share/actions';
import { Button, Card, Field, Input, Select, Textarea } from '../components/ui';
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
    a: 'Crea tu cuenta y toca el botón + de abajo (Crear). Eliges el deporte, le pones nombre y listo; después invitas a tu gente con un link o un código.',
  },
  {
    q: '¿Cómo me uno a una liga?',
    a: 'Abre el link que te pasó quien la maneja, o toca + y pon el código de invitación. Las ligas públicas las encuentras en el Home de su deporte.',
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

/**
 * Contáctanos (/contacto, en la barra de quien no tiene cuenta en lugar de «Eventos»): el correo de MatchMate (link y
 * copiar), un formulario que arma el correo y abre la app de correo (no hay servidor: nada se manda ni se guarda
 * desde aquí) y unas preguntas frecuentes.
 */
export default function ContactPage() {
  const auth = useAuth();
  const { toast } = useFeedback();
  const [name, setName] = useState(() => (auth.user ? displayName(auth) : ''));
  const [email, setEmail] = useState(() => auth.user?.email ?? '');
  const [reason, setReason] = useState<ContactReason>(CONTACT_REASONS[0]);
  const [message, setMessage] = useState('');
  const ready = name.trim() !== '' && message.trim() !== '';

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
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <MessageCircle className="size-6 text-accent" aria-hidden="true" /> Contáctanos
          </h1>
          <p className="text-sm text-muted">¿Una duda, algo que no funciona o una idea? Escríbenos y te respondemos.</p>
        </header>

        <Card className="flex flex-col gap-3 p-4">
          {/* Toda la fila (ícono, «Nuestro correo» y la dirección) abre el correo: un blanco cómodo para el dedo. */}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="group -m-1 flex min-h-11 items-center gap-3 rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Mail className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted">Nuestro correo</span>
              <span className="block truncate font-semibold text-accent underline-offset-2 group-hover:underline">{CONTACT_EMAIL}</span>
            </span>
          </a>
          <Button onClick={copy} icon={<Copy className="size-4" />} className="self-start max-sm:h-11">
            Copiar correo
          </Button>
        </Card>

        <Card className="p-4">
          <form onSubmit={write} className="flex flex-col gap-4">
            <h2 className="font-semibold">Escríbenos desde aquí</h2>
            <Field label="Nombre">
              <Input required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="max-sm:h-11" />
            </Field>
            <Field label="Tu correo (opcional)" hint="Para responderte, si no escribes desde ese mismo correo.">
              <Input type="email" maxLength={120} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="max-sm:h-11" />
            </Field>
            <Field label="Motivo">
              <Select value={reason} onChange={(e) => setReason(e.target.value as ContactReason)} className="max-sm:h-11">
                {CONTACT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mensaje" hint={message.length > CONTACT_MAX - 100 ? `${message.length} de ${CONTACT_MAX} letras.` : undefined}>
              <Textarea required rows={5} maxLength={CONTACT_MAX} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Cuéntanos" />
            </Field>
            <Button type="submit" variant="primary" disabled={!ready} icon={<Send className="size-4" />} className="max-sm:h-11">
              Escribir el correo
            </Button>
            <p className="text-center text-xs text-muted">Se abre tu app de correo con el mensaje listo.</p>
          </form>
        </Card>

        <section className="flex flex-col gap-2" aria-labelledby="contacto-faq">
          <h2 id="contacto-faq" className="text-lg font-bold tracking-tight">
            Preguntas frecuentes
          </h2>
          <Card className="divide-y divide-line overflow-hidden">
            {FAQ.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{f.q}</span>
                  <ChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="px-4 pb-4 text-sm text-muted">{f.a}</p>
              </details>
            ))}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
