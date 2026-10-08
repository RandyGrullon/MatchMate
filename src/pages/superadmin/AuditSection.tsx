import { Link } from 'react-router';
import { ScrollText } from 'lucide-react';
import { Badge, Card } from '../../components/ui';
import { useAdminAudit, type AdminAuditEntry } from '../../lib/data/admin';
import { EmptyCard, ErrorRetry, Pager, PillSelect, SectionHeader, TableSkeleton } from './bits';
import { fmtDateTime, relativeTime } from './format';
import { PAGE_SIZES, intParam, useSearchState } from './hooks';
import { AUDIT_ACTIONS, TARGET_LABEL, auditActionLabel, auditSummary, auditTargetPath, auditTone } from './model';
import { sectionMeta } from './sections';

/** Auditoría: todo lo que se hizo desde la consola (y las acciones delicadas), de a páginas. */
export default function AuditSection() {
  const s = useSearchState();
  const action = s.get('accion');
  const page = Math.max(0, intParam(s.get('p'), 1) - 1);
  const pageSize = intParam(s.get('n'), 25, PAGE_SIZES);
  const audit = useAdminAudit(true, { action: action || undefined, page, pageSize });
  const { rows, total } = audit.data;
  // Una acción que no está en la lista (de una versión más nueva) igual se puede filtrar desde el link.
  const known = AUDIT_ACTIONS.some((a) => a.key === action);

  return (
    <>
      <SectionHeader title="Auditoría" hint={sectionMeta('auditoria').hint} />

      <div>
        <PillSelect
          label="Filtrar por acción"
          options={[{ key: '', label: 'Todas las acciones' }, ...AUDIT_ACTIONS, ...(action && !known ? [{ key: action, label: auditActionLabel(action) }] : [])]}
          value={action}
          onChange={(v) => s.patch({ accion: v || null, p: null })}
        />
      </div>

      {audit.error && !rows.length ? (
        <ErrorRetry error={audit.error} />
      ) : audit.loading && !rows.length ? (
        <TableSkeleton rows={8} cols={4} />
      ) : !rows.length ? (
        <EmptyCard icon={<ScrollText className="size-8" />} title={action ? 'Nada con esa acción todavía' : 'Todavía no hay nada en la auditoría'}>
          Cada cambio de la consola queda aquí, con quién y cuándo.
        </EmptyCard>
      ) : (
        <Card className={audit.loading ? 'overflow-hidden opacity-60 transition-opacity' : 'overflow-hidden transition-opacity'}>
          <ol>
            {rows.map((e) => (
              <AuditRow key={e.id} e={e} />
            ))}
          </ol>
        </Card>
      )}

      {(total > 0 || page > 0) && (
        <Pager
          page={page}
          pageSize={pageSize}
          total={total}
          noun="entradas"
          onPage={(p) => s.patch({ p: p > 0 ? p + 1 : null })}
          onPageSize={(n) => s.patch({ n: n === 25 ? null : n, p: null })}
        />
      )}
    </>
  );
}

function AuditRow({ e }: { e: AdminAuditEntry }) {
  const target = auditTargetPath(e);
  const detail = e.detail && Object.keys(e.detail).length ? JSON.stringify(e.detail, null, 2) : null;
  const targetText = `${TARGET_LABEL[e.targetType]}${e.targetId ? ` ${e.targetId.length > 12 ? `${e.targetId.slice(0, 8)}…` : e.targetId}` : ''}`;
  return (
    <li className="mm-row relative flex flex-col gap-1.5 py-3.5 pr-[18px] pl-5 sm:flex-row sm:gap-5">
      <div className="flex shrink-0 flex-row items-baseline gap-2 sm:w-36 sm:flex-col sm:gap-0.5">
        <time dateTime={e.at} title={fmtDateTime(e.at)} className="text-[15px] font-semibold">
          {relativeTime(e.at)}
        </time>
        <span className="num text-[13px] text-muted">{fmtDateTime(e.at)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={auditTone(e.action)}>{auditActionLabel(e.action)}</Badge>
          <span className="text-[15px]">{auditSummary(e)}</span>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted">
          <span>
            Quién:{' '}
            {e.actorId ? (
              <Link to={`/superadmin/cuentas?u=${encodeURIComponent(e.actorId)}`} className="font-medium text-fg hover:underline">
                {e.actorName ?? 'Cuenta'}
              </Link>
            ) : (
              <span className="font-medium text-fg">{e.actorName ?? 'El sistema'}</span>
            )}
          </span>
          <span>
            Sobre:{' '}
            {target ? (
              <Link to={target} className="font-medium text-fg hover:underline" title={e.targetId ?? undefined}>
                {targetText}
              </Link>
            ) : (
              <span className="font-medium text-fg" title={e.targetId ?? undefined}>
                {targetText}
              </span>
            )}
          </span>
        </p>
        {detail && (
          <details className="-mb-2">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent select-none">Ver detalle</summary>
            <pre className="mt-1 max-h-64 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{detail}</pre>
          </details>
        )}
      </div>
    </li>
  );
}
