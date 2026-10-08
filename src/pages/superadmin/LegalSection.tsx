import { AlertTriangle, CheckCircle2, FilePenLine, ScrollText, ShieldCheck } from 'lucide-react';
import { Badge, ListRow, RowIcon } from '../../components/ui';
import { useAdminLegalStats } from '../../lib/data/legal';
import { LEGAL_CHANGES, LEGAL_DOCS, LEGAL_DRAFT, LEGAL_PLACEHOLDERS, legalDate, type LegalDocKey } from '../../lib/legal';
import { PRIVACY_PATH, TERMS_PATH } from '../legal/legal';
import { DetailRow, ErrorRetry, KpiCard, KpiGrid, KpiSkeleton, Panel, SectionHeader, ToneIcon } from './bits';
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
        <div role="alert" className="flex gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>
            La app y la base tienen versiones distintas (base: términos {s.terms}, privacidad {s.privacy}). Nadie puede aceptar hasta que coincidan.
          </p>
        </div>
      )}

      {stats.error && !s ? (
        <ErrorRetry error={stats.error} />
      ) : !s ? (
        <KpiSkeleton n={4} />
      ) : (
        <KpiGrid>
          <KpiCard label="Aceptaron lo vigente" value={fmtNum(s.accepted)} note={`${fmtPct(ratio(s.accepted, s.accounts))} de ${fmtNum(s.accounts)} cuentas`} />
          <KpiCard label="Les falta aceptar" value={fmtNum(pending)} note="lo ven al entrar" />
          <KpiCard label="Nunca aceptaron" value={fmtNum(s.never)} note="cuentas de antes o de Google" />
          <KpiCard label="Aceptaron en 7 días" value={fmtNum(s.last7d)} />
        </KpiGrid>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Versiones vigentes" subtitle="Al cambiar una, cada cuenta la vuelve a aceptar" flush>
          {(['terminos', 'privacidad'] as const).map((d) => {
            const doc = LEGAL_DOCS[d];
            const n = s ? (d === 'terminos' ? s.acceptedTerms : s.acceptedPrivacy) : null;
            return (
              <ListRow
                key={d}
                dense
                leading={
                  <RowIcon>
                    <ScrollText className="size-5" />
                  </RowIcon>
                }
                title={doc.title}
                subtitle={
                  doc.version === doc.effective
                    ? `Versión vigente desde ${legalDate(doc.effective)}`
                    : `Versión ${legalDate(doc.version)} · vigente desde ${legalDate(doc.effective)}`
                }
                value={n != null ? fmtNum(n) : undefined}
                to={DOC_PATH[d]}
                ariaLabel={n != null ? `${doc.title}: ${fmtNum(n)} cuentas la aceptaron` : undefined}
              />
            );
          })}
          {s && s.byVersion.length > 0 && (
            <details className="px-5 pt-1 pb-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent select-none">Por versión</summary>
              <ul className="mt-1 flex flex-col gap-1.5 text-[13px]">
                {s.byVersion.map((v) => (
                  <li key={`${v.doc}:${v.version}`} className="flex justify-between gap-3">
                    <span>
                      {LEGAL_DOCS[v.doc].title} · {legalDate(v.version)}
                    </span>
                    <span className="num font-semibold">{fmtNum(v.accounts)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Panel>

        <Panel title="Lo que cambió en esta versión" subtitle="Lo ve quien aceptó una anterior, antes de aceptar">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] marker:text-faint">
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
        subtitle="Lo que está entre corchetes va en src/lib/legal.ts (LEGAL_CONTACT)"
        actions={LEGAL_DRAFT ? <Badge tone="warn">Borrador</Badge> : <Badge tone="ok">Revisado</Badge>}
        flush
      >
        {LEGAL_DRAFT && (
          <DetailRow
            leading={
              <ToneIcon tone="warn">
                <FilePenLine className="size-5" />
              </ToneIcon>
            }
            title="Pendiente: revisión por un abogado dominicano"
          >
            Leyes 172-13, 136-03, 53-07 y 358-05. Al aprobarlo: LEGAL_DRAFT = false.
          </DetailRow>
        )}
        {LEGAL_PLACEHOLDERS.map((p) => (
          <DetailRow
            key={p.text}
            leading={
              <ToneIcon tone="warn">
                <AlertTriangle className="size-5" />
              </ToneIcon>
            }
            title={<mark className="rounded bg-warn-soft px-1 text-warn">{p.text}</mark>}
          >
            <p>{p.what}</p>
            <p>Dónde: {p.where}</p>
          </DetailRow>
        ))}
        {!LEGAL_DRAFT && !LEGAL_PLACEHOLDERS.length && (
          <ListRow
            dense
            leading={
              <ToneIcon tone="ok">
                <CheckCircle2 className="size-5" />
              </ToneIcon>
            }
            title="Todo completo"
          />
        )}
        <p className="flex items-start gap-2 px-5 pt-2 pb-3.5 text-[13px] text-muted">
          <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden="true" />
          Al cambiar un texto, sube la versión en src/lib/legal.ts y en una migración nueva (private.legal_versions()).
        </p>
      </Panel>
    </>
  );
}
