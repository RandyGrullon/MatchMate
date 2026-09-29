import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, FilePenLine, ScrollText, ShieldCheck } from 'lucide-react';
import { Badge } from '../../components/ui';
import { useAdminLegalStats } from '../../lib/data/legal';
import { LEGAL_CHANGES, LEGAL_DOCS, LEGAL_DRAFT, LEGAL_PLACEHOLDERS, legalDate, type LegalDocKey } from '../../lib/legal';
import { PRIVACY_PATH, TERMS_PATH } from '../legal/legal';
import { ErrorRetry, KpiCard, KpiSkeleton, Panel, SectionHeader } from './bits';
import { fmtNum, fmtPct, ratio } from './format';
import { sectionMeta } from './sections';

const DOC_PATH: Record<LegalDocKey, string> = { terminos: TERMS_PATH, privacidad: PRIVACY_PATH };

/**
 * Legal: las versiones vigentes de los Términos de uso y la Política de privacidad (las de la app y las de la base
 * tienen que ser iguales), cuántas cuentas ya aceptaron lo vigente, lo que cambió y lo que falta completar en los
 * textos (datos del titular entre corchetes y la revisión de un abogado dominicano).
 */
export default function LegalSection() {
  const stats = useAdminLegalStats(true);
  const s = stats.data;
  const mismatch = !!s && (s.terms !== LEGAL_DOCS.terminos.version || s.privacy !== LEGAL_DOCS.privacidad.version);
  const pending = s ? Math.max(0, s.accounts - s.accepted) : 0;

  return (
    <>
      <SectionHeader title="Legal" hint={sectionMeta('legal').hint} />

      {s && mismatch && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            La app y la base tienen versiones distintas (base: términos {s.terms}, privacidad {s.privacy}). Nadie puede aceptar hasta que
            coincidan: falta la migración o la app nueva.
          </p>
        </div>
      )}

      {stats.error && !s ? (
        <ErrorRetry error={stats.error} />
      ) : !s ? (
        <KpiSkeleton n={4} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Aceptaron lo vigente" value={fmtNum(s.accepted)} note={`${fmtPct(ratio(s.accepted, s.accounts))} de ${fmtNum(s.accounts)} cuentas`} />
          <KpiCard label="Les falta aceptar" value={fmtNum(pending)} note="lo ven al entrar" />
          <KpiCard label="Nunca aceptaron" value={fmtNum(s.never)} note="cuentas de antes o de Google" />
          <KpiCard label="Aceptaron en 7 días" value={fmtNum(s.last7d)} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Versiones vigentes" subtitle="Cada cuenta acepta la versión de cada documento; al cambiarla, la vuelve a aceptar.">
          <ul className="flex flex-col divide-y divide-line">
            {(['terminos', 'privacidad'] as const).map((d) => {
              const doc = LEGAL_DOCS[d];
              const n = s ? (d === 'terminos' ? s.acceptedTerms : s.acceptedPrivacy) : null;
              return (
                <li key={d} className="flex items-center gap-3 py-2.5">
                  <ScrollText className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <Link to={DOC_PATH[d]} className="text-sm font-medium text-accent hover:underline">
                      {doc.title}
                    </Link>
                    <p className="text-xs text-muted">
                      Versión {legalDate(doc.version)} · vigente desde {legalDate(doc.effective)}
                    </p>
                  </div>
                  {n != null && <span className="shrink-0 text-sm tabular-nums">{fmtNum(n)} cuentas</span>}
                </li>
              );
            })}
          </ul>
          {s && s.byVersion.length > 0 && (
            <details className="mt-2">
              <summary className="inline-flex min-h-9 cursor-pointer items-center text-xs font-medium text-accent select-none">Por versión</summary>
              <ul className="mt-1 flex flex-col gap-1 text-xs">
                {s.byVersion.map((v) => (
                  <li key={`${v.doc}:${v.version}`} className="flex justify-between gap-3">
                    <span>
                      {LEGAL_DOCS[v.doc].title} · {legalDate(v.version)}
                    </span>
                    <span className="tabular-nums">{fmtNum(v.accounts)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Panel>

        <Panel title="Lo que cambió en esta versión" subtitle="Lo ve quien había aceptado una versión anterior, antes de aceptar.">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm marker:text-muted">
            {LEGAL_CHANGES.map((c) => (
              <li key={c.text}>
                <span className="text-muted">{LEGAL_DOCS[c.doc].title}: </span>
                {c.text}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        title="Falta completar"
        subtitle="Los textos no inventan datos: lo que está entre corchetes lo tienes que llenar en src/lib/legal.ts (LEGAL_CONTACT)."
        actions={LEGAL_DRAFT ? <Badge tone="warn">Borrador</Badge> : <Badge tone="ok">Revisado</Badge>}
      >
        <ul className="flex flex-col divide-y divide-line">
          {LEGAL_DRAFT && (
            <li className="flex gap-3 py-2.5">
              <FilePenLine className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
              <div className="min-w-0 text-sm">
                <p className="font-medium">Pendiente: revisión por un abogado dominicano</p>
                <p className="text-xs text-muted">
                  Ley 172-13 (datos personales), Ley 136-03 (menores), Ley 53-07 (alta tecnología) y Ley 358-05 (consumidor). Al aprobarlo:
                  LEGAL_DRAFT = false. Mientras tanto, solo tú ves el aviso de borrador en las páginas.
                </p>
              </div>
            </li>
          )}
          {LEGAL_PLACEHOLDERS.map((p) => (
            <li key={p.text} className="flex gap-3 py-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
              <div className="min-w-0 text-sm">
                <p>
                  <mark className="rounded bg-warn-soft px-1 text-warn">{p.text}</mark>
                </p>
                <p className="text-xs text-muted">{p.what}</p>
                <p className="text-xs text-muted">Dónde: {p.where}</p>
              </div>
            </li>
          ))}
          {!LEGAL_DRAFT && !LEGAL_PLACEHOLDERS.length && (
            <li className="flex items-center gap-2 py-2.5 text-sm text-ok">
              <CheckCircle2 className="size-4" aria-hidden="true" /> Todo completo.
            </li>
          )}
        </ul>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          Al cambiar un texto: sube la versión en src/lib/legal.ts (con lo que cambió) y la misma fecha en una migración nueva que redefine
          private.legal_versions(). Cada cuenta lo vuelve a aceptar al entrar.
        </p>
      </Panel>
    </>
  );
}
