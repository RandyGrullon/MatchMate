import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { FilePenLine, ScrollText, ShieldCheck } from 'lucide-react';
import { BackBar } from '../../components/cuenta/kit';
import { AppShell } from '../../components/Shell';
import { Card, ListRow, RowIcon, cx } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import type { LegalDocKey } from '../../lib/legal';
import { LEGAL_CONTACT, LEGAL_DOCS, LEGAL_DRAFT, isPlaceholder, legalDate, PRIVACY_PATH, TERMS_PATH } from './legal';

export interface LegalSection {
  /** Ancla (#id): el aviso de las fotos lleva a #fotos, Configuración a #derechos… */
  id: string;
  title: string;
  body: ReactNode;
}

/** Un dato que falta llenar (se ve marcado; la consola › Legal los lista). */
export function Fill({ children }: { children: string }) {
  if (!isPlaceholder(children)) return <>{children}</>;
  return <mark className="rounded bg-warn-soft px-1 text-warn">{children}</mark>;
}

/** El correo de contacto (link si ya está lleno). */
export function ContactEmail() {
  const email = LEGAL_CONTACT.email;
  if (isPlaceholder(email)) return <Fill>{email}</Fill>;
  return (
    <a href={`mailto:${email}`} className="font-medium text-accent underline underline-offset-2">
      {email}
    </a>
  );
}

/** Lista con viñetas del texto legal. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-muted">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

/** Subtítulo dentro de una sección. */
export function Sub({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 font-semibold text-fg">{children}</h3>;
}

/**
 * Página de un texto legal, rediseño «Calma y foco»: «‹ Volver» (a la pantalla de antes: Entrar, Configuración, la
 * pregunta de los términos…; si se entró directo, a Hoy), el ícono y el título, la versión y desde cuándo rige, el índice
 * con anclas en una tarjeta y las secciones con su título de sección. Se lee sin cuenta (y sin haber dicho «tengo 18 años
 * o más» ni aceptado la versión nueva). El aviso de borrador (falta la revisión de un abogado) solo lo ve el superadmin.
 */
export function LegalDoc({ doc, icon, lead, sections }: { doc: LegalDocKey; icon: ReactNode; lead: ReactNode; sections: LegalSection[] }) {
  const { hash, key } = useLocation();
  const navigate = useNavigate();
  const { isSuper } = useAuth();
  const { title, version, effective } = LEGAL_DOCS[doc];
  // Se llegó con un link de la app: «Volver» regresa a esa pantalla. Directo (un link de afuera): a Hoy.
  const fromApp = key !== 'default';

  // El router no baja solo a la sección del link (#fotos): se hace aquí, cuando ya está dibujada.
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!id) {
      window.scrollTo({ top: 0 });
      return;
    }
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <AppShell>
      <article className="flex flex-col px-2">
        <BackBar
          to="/"
          label="Volver"
          replace={!fromApp}
          onClick={(e) => {
            if (!fromApp) return;
            e.preventDefault();
            navigate(-1);
          }}
          className="-mt-2 mb-1"
        />
        <header>
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            {icon}
          </span>
          <h1 className="mt-4 text-title">{title}</h1>
          <p className="mt-1.5 text-meta text-muted">
            Versión {legalDate(version)} · vigente desde {legalDate(effective)}
          </p>
          {LEGAL_DRAFT && isSuper && (
            <div role="note" className="mt-4 flex gap-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">
              <FilePenLine className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>
                <b>Borrador.</b> Pendiente: revisión por un abogado dominicano. Lo marcado en amarillo falta por completar (la lista está
                en la consola › Legal). Solo tú ves este aviso.
              </p>
            </div>
          )}
          <div className="mt-4 text-body text-fg-2">{lead}</div>
        </header>

        <Card className="mt-6 px-5 pt-4 pb-3">
          <nav aria-label="Contenido">
            <h2 className="mb-1 text-sm font-[650] text-fg-2">Contenido</h2>
            <ol className="grid list-decimal gap-x-6 pl-5 text-meta marker:text-faint sm:grid-cols-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="inline-flex min-h-11 items-center font-[550] text-accent hover:underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </Card>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="mt-[30px] scroll-mt-24">
            <h2 id={`${s.id}-t`} className="mx-1 mb-3 text-section">
              {i + 1}. {s.title}
            </h2>
            <div className={cx('mx-1 flex flex-col gap-2.5 text-[15.5px] leading-relaxed text-fg')}>{s.body}</div>
          </section>
        ))}

        <footer className="mt-[30px]">
          <p className="mx-1 mb-3 text-meta text-muted">
            ¿Preguntas? Escríbenos a <ContactEmail />.
          </p>
          <Card className="overflow-hidden">
            <ListRow
              leading={
                <RowIcon>
                  <ShieldCheck className="size-5" />
                </RowIcon>
              }
              title="Política de privacidad"
              to={PRIVACY_PATH}
            />
            <ListRow
              leading={
                <RowIcon>
                  <ScrollText className="size-5" />
                </RowIcon>
              }
              title="Términos de uso"
              to={TERMS_PATH}
            />
          </Card>
        </footer>
      </article>
    </AppShell>
  );
}
