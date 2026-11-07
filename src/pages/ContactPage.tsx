import { useEffect, useState, type FormEvent } from 'react';
import { ChevronDown, Copy, Mail, Send } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { AppShell } from '../components/Shell';
import { useFeedback } from '../components/feedback';
import { BusyIcon, useBusy } from '../components/busy';
import { copyText } from '../components/share/actions';
import { BackBar, BigField, BigInput, BigSelect, BigTextarea } from '../components/cuenta/kit';
import { Button, Card, RowIcon, SectionHeader, cx } from '../components/ui';
import { LegalRich } from './legal/LegalDoc';
import { CONTACT_EMAIL, CONTACT_FAQ, CONTACT_MAX, CONTACT_REASONS, contactMailto, contactMessageHint, contactReady, emailParts, type ContactReason } from './contactText';

// El correo, los motivos, el tope, el correo que se arma y las preguntas: contactText.ts (lo comparte la app del
// teléfono).
export { CONTACT_EMAIL, CONTACT_MAX, CONTACT_REASONS, contactMailto };
export type { ContactDraft, ContactReason } from './contactText';

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
  const ready = contactReady({ name, message });
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
                {emailParts(CONTACT_EMAIL)[0]}
                <wbr />
                {emailParts(CONTACT_EMAIL)[1]}
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
              <BigField label="Mensaje" hint={contactMessageHint(message.length)}>
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
            {CONTACT_FAQ.map((f) => (
              <details key={f.q} className="group mm-row relative">
                <summary className="flex min-h-row cursor-pointer list-none items-center gap-3 py-3 pr-[18px] pl-5 text-body font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{f.q}</span>
                  <ChevronDown className="size-5 shrink-0 text-faint transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="pr-[18px] pb-4 pl-5 text-meta text-fg-2">
                  <LegalRich text={f.a} />
                </p>
              </details>
            ))}
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
