import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { FilePenLine } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { AppShell } from '../../components/Shell';
import { Card, cx } from '../../components/ui';
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
 * Página de un texto legal: título, versión y desde cuándo rige, índice con anclas y las secciones. Se lee sin
 * cuenta (y sin haber dicho «tengo 18 años o más» ni aceptado la versión nueva). El aviso de borrador (falta la
 * revisión de un abogado) solo lo ve el superadmin.
 */
export function LegalDoc({ doc, icon, lead, sections }: { doc: LegalDocKey; icon: ReactNode; lead: ReactNode; sections: LegalSection[] }) {
  const { hash } = useLocation();
  const { isSuper } = useAuth();
  const { title, version, effective } = LEGAL_DOCS[doc];

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
      <article className="flex flex-col gap-5">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <BackLink fallback="/" className="-ml-2 flex size-11 items-center justify-center p-0" />
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <span className="text-accent" aria-hidden="true">
                {icon}
              </span>
              {title}
            </h1>
          </div>
          <p className="text-xs font-medium text-muted">
            Versión {legalDate(version)} · vigente desde {legalDate(effective)}
          </p>
          {LEGAL_DRAFT && isSuper && (
            <div role="note" className="flex gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
              <FilePenLine className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>
                <b>Borrador.</b> Pendiente: revisión por un abogado dominicano. Lo marcado en amarillo falta por completar (la lista está
                en la consola › Legal). Solo tú ves este aviso.
              </p>
            </div>
          )}
          <div className="text-sm text-muted">{lead}</div>
        </header>

        <Card className="p-4">
          <nav aria-label="Contenido">
            <h2 className="mb-2 text-sm font-semibold">Contenido</h2>
            <ol className="grid list-decimal gap-x-6 gap-y-0.5 pl-5 text-sm marker:text-muted sm:grid-cols-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="inline-flex min-h-9 items-center text-accent hover:underline">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </Card>

        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="scroll-mt-24">
            <h2 id={`${s.id}-t`} className="mb-2 text-lg font-bold tracking-tight">
              {i + 1}. {s.title}
            </h2>
            <div className={cx('flex flex-col gap-2.5 text-[15px] leading-relaxed text-fg/90')}>{s.body}</div>
          </section>
        ))}

        <footer className="mt-2 flex flex-col gap-2 border-t border-line pt-4 text-sm text-muted">
          <p>
            ¿Preguntas? Escríbenos a <ContactEmail />.
          </p>
          <p className="flex flex-wrap gap-x-4">
            <Link to={PRIVACY_PATH} className="inline-flex min-h-11 items-center font-medium text-accent">
              Política de privacidad
            </Link>
            <Link to={TERMS_PATH} className="inline-flex min-h-11 items-center font-medium text-accent">
              Términos de uso
            </Link>
          </p>
        </footer>
      </article>
    </AppShell>
  );
}
