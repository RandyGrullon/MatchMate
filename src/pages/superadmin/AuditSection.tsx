import { Link } from 'react-router';
import { ScrollText } from 'lucide-react';
import { Badge, Card, Empty, Select } from '../../components/ui';
import { useAdminAudit, type AdminAuditEntry } from '../../lib/data/admin';
import { ErrorRetry, Pager, SectionHeader, TableSkeleton } from './bits';
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

      <label className="flex max-w-sm flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Filtrar por acción</span>
        <Select value={action} onChange={(e) => s.patch({ accion: e.target.value || null, p: null })} className="max-sm:h-11">
          <option value="">Todas las acciones</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
          {action && !known && <option value={action}>{auditActionLabel(action)}</option>}
        </Select>
      </label>

      {audit.error && !rows.length ? (
        <ErrorRetry error={audit.error} />
      ) : audit.loading && !rows.length ? (
        <TableSkeleton rows={8} cols={4} />
      ) : !rows.length ? (
        <Empty icon={<ScrollText className="size-8" />} title={action ? 'Nada con esa acción todavía' : 'Todavía no hay nada en la auditoría'}>
          Cada cambio hecho desde esta consola queda anotado aquí con quién y cuándo.
        </Empty>
      ) : (
        <Card className={audit.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <ol className="divide-y divide-line">
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
    <li className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:gap-4">
      <div className="flex shrink-0 flex-row items-center gap-2 sm:w-40 sm:flex-col sm:items-start sm:gap-0.5">
        <time dateTime={e.at} title={fmtDateTime(e.at)} className="text-sm font-medium">
          {relativeTime(e.at)}
        </time>
        <span className="text-xs text-muted tabular-nums">{fmtDateTime(e.at)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={auditTone(e.action)}>{auditActionLabel(e.action)}</Badge>
          <span className="text-sm">{auditSummary(e)}</span>
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
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
          <details className="mt-1.5">
            <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs font-medium text-accent select-none">Ver detalle</summary>
            <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-surface-2 p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{detail}</pre>
          </details>
        )}
      </div>
    </li>
  );
}
