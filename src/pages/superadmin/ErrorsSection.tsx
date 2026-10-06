import { Link } from 'react-router';
import { Bug, CheckCircle2, Copy, Smartphone, Trash2, Users } from 'lucide-react';
import { useBusy } from '../../components/busy';
import { useFeedback } from '../../components/feedback';
import { Badge, Button, Card, Empty } from '../../components/ui';
import {
  CLIENT_ERROR_DAYS,
  CLIENT_ERROR_KINDS,
  clearClientErrors,
  useAdminClientErrors,
  type AdminClientError,
} from '../../lib/data/admin';
import type { ClientErrorKind } from '../../lib/errorReport';
import { ErrorRetry, FilterChips, Pager, SearchBox, SectionHeader, Segmented, TableSkeleton } from './bits';
import { fmtDateTime, fmtNum, plural, relativeTime } from './format';
import { PAGE_SIZES, copyText, intParam, useRun, useSearchState, useSearchText } from './hooks';
import { CLIENT_ERROR_KIND_HELP, CLIENT_ERROR_KIND_LABEL, clientErrorTone, describeUa } from './model';
import { sectionMeta } from './sections';

type KindFilter = 'all' | ClientErrorKind;
const isKind = (v: string): v is ClientErrorKind => (CLIENT_ERROR_KINDS as readonly string[]).includes(v);
const DAY_OPTIONS = CLIENT_ERROR_DAYS.map((d) => ({ value: String(d), label: d === 1 ? '24 horas' : `${d} días` }));

/**
 * Errores: lo que falla en los teléfonos (src/lib/errorReport.ts), agrupado por error, lo más reciente primero.
 * Cada grupo dice cuántas veces, a cuántas cuentas, en qué pantalla, ruta, versión y teléfono, con la pila para
 * buscarlo en el código. «Ya se arregló» borra el grupo (queda en la auditoría).
 */
export default function ErrorsSection() {
  const s = useSearchState();
  const daysRaw = intParam(s.get('d'), 7, CLIENT_ERROR_DAYS);
  const kindRaw = s.get('t');
  const kind: KindFilter = isKind(kindRaw) ? kindRaw : 'all';
  const page = Math.max(0, intParam(s.get('p'), 1) - 1);
  const pageSize = intParam(s.get('n'), 25, PAGE_SIZES);
  const search = s.get('q');
  const [text, setText] = useSearchText(s);
  const errors = useAdminClientErrors(true, { days: daysRaw, search: search || undefined, kind: kind === 'all' ? undefined : kind, page, pageSize });
  const { rows, total, hits, users } = errors.data;
  const run = useRun();
  const { confirm } = useFeedback();
  const clearing = useBusy();

  async function clearAll() {
    const ok = await confirm({
      title: '¿Borrar todos los errores?',
      message: 'Se borran todos los reportes guardados (de todos los días), no solo los de esta lista. Queda anotado en la auditoría.',
      confirmText: 'Borrar todos',
      danger: true,
    });
    if (ok) await clearing.run('all', () => run(() => clearClientErrors(null), 'Errores borrados'));
  }

  return (
    <>
      <SectionHeader
        title="Errores"
        hint={sectionMeta('errores').hint}
        actions={
          rows.length > 0 && (
            <Button variant="ghost" icon={<Trash2 className="size-4" />} loading={clearing.isBusy()} onClick={clearAll} className="text-danger max-sm:min-h-11">
              Borrar todos
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBox label="Buscar errores por mensaje, pantalla o ruta" placeholder="Buscar en el mensaje, la pantalla o la ruta" value={text} onChange={setText} />
          <Segmented
            label="Desde cuándo"
            options={DAY_OPTIONS}
            value={String(daysRaw)}
            onChange={(v) => s.patch({ d: v === '7' ? null : v, p: null })}
          />
        </div>
        <FilterChips
          label="Tipo de error"
          items={[
            { key: 'all' as KindFilter, label: 'Todos' },
            ...CLIENT_ERROR_KINDS.map((k) => ({ key: k as KindFilter, label: CLIENT_ERROR_KIND_LABEL[k] })),
          ]}
          value={kind}
          onChange={(k) => s.patch({ t: k === 'all' ? null : k, p: null })}
        />
        {kind !== 'all' && <p className="text-xs text-muted">{CLIENT_ERROR_KIND_HELP[kind]}</p>}
      </div>

      {errors.error && !rows.length ? (
        <ErrorRetry error={errors.error} />
      ) : errors.loading && !rows.length ? (
        <TableSkeleton rows={6} cols={4} />
      ) : !rows.length ? (
        <Empty icon={search ? <Bug className="size-8" /> : <CheckCircle2 className="size-8" />} title={search ? `Nada con «${search}»` : 'Sin errores en estos días'}>
          {search || kind !== 'all'
            ? 'Prueba con otra búsqueda o quita el filtro.'
            : 'Cuando algo falle en un teléfono, aparece aquí con la pantalla, el teléfono y cuántas veces pasó.'}
        </Empty>
      ) : (
        <>
          <p className="text-sm text-muted" aria-live="polite">
            {plural(hits, 'vez', 'veces')} · {plural(total, 'error distinto', 'errores distintos')} · {plural(users, 'cuenta', 'cuentas')}
          </p>
          <Card className={errors.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <ol className="divide-y divide-line">
              {rows.map((e) => (
                <ErrorRow key={e.fingerprint} e={e} />
              ))}
            </ol>
          </Card>
        </>
      )}

      {(total > 0 || page > 0) && (
        <Pager
          page={page}
          pageSize={pageSize}
          total={total}
          noun="errores"
          onPage={(p) => s.patch({ p: p > 0 ? p + 1 : null })}
          onPageSize={(n) => s.patch({ n: n === 25 ? null : n, p: null })}
        />
      )}
    </>
  );
}

function ErrorRow({ e }: { e: AdminClientError }) {
  const run = useRun();
  const { confirm, toast } = useFeedback();
  const busy = useBusy<'fixed' | 'copy'>();

  async function fixed() {
    const ok = await confirm({
      title: '¿Ya se arregló?',
      message: `Se borran los ${plural(e.reports, 'reporte', 'reportes')} de este error. Si vuelve a pasar, aparece otra vez.`,
      confirmText: 'Borrar el error',
    });
    if (!ok) return;
    await busy.run('fixed', () => run(() => clearClientErrors(e.fingerprint), 'Error borrado'));
  }

  async function copy() {
    const text = [e.message, e.component && `Pantalla: ${e.component}`, e.route && `Ruta: ${e.route}`, e.appVersion && `Versión: ${e.appVersion}`, e.ua, e.stack]
      .filter(Boolean)
      .join('\n');
    const ok = await busy.run('copy', () => copyText(text));
    if (ok === undefined) return;
    toast(ok ? 'Copiado para pegarlo donde lo vayas a arreglar' : 'No se pudo copiar', ok ? 'ok' : 'error');
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={clientErrorTone(e.kind)}>{CLIENT_ERROR_KIND_LABEL[e.kind]}</Badge>
        {e.component && <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">{e.component}</span>}
        <time dateTime={e.lastAt} title={fmtDateTime(e.lastAt)} className="ml-auto text-xs text-muted">
          {relativeTime(e.lastAt)}
        </time>
      </div>
      <p className="text-sm font-medium break-words">{e.message}</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="font-medium text-fg tabular-nums">{plural(e.hits, 'vez', 'veces')}</span>
        <span className="flex items-center gap-1">
          <Users className="size-3.5" aria-hidden="true" /> {plural(e.users, 'cuenta', 'cuentas')}
        </span>
        <span className="flex items-center gap-1">
          <Smartphone className="size-3.5" aria-hidden="true" /> {describeUa(e.ua)}
        </span>
        {e.versions.length > 0 && <span>Versión {e.versions.join(', ')}</span>}
      </p>
      {e.routes.length > 0 && (
        <p className="flex flex-wrap gap-1.5 text-xs">
          {e.routes.map((r) => (
            <code key={r} className="rounded bg-surface-2 px-1.5 py-0.5 break-all">
              {r}
            </code>
          ))}
        </p>
      )}
      <details>
        <summary className="inline-flex min-h-9 cursor-pointer items-center text-xs font-medium text-accent select-none">Ver detalle</summary>
        <div className="mt-1 flex flex-col gap-2 text-xs">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted">Primera vez</dt>
            <dd>{fmtDateTime(e.firstAt)}</dd>
            <dt className="text-muted">Última vez</dt>
            <dd>{fmtDateTime(e.lastAt)}</dd>
            <dt className="text-muted">Reportes</dt>
            <dd className="tabular-nums">{fmtNum(e.reports)}</dd>
            <dt className="text-muted">Último</dt>
            <dd>
              {e.userId ? (
                <Link to={`/superadmin/cuentas?u=${encodeURIComponent(e.userId)}`} className="font-medium text-accent hover:underline">
                  {e.userName ?? 'Cuenta'}
                </Link>
              ) : (
                'Cuenta borrada'
              )}
              {e.route ? ` en ${e.route}` : ''}
            </dd>
            <dt className="text-muted">Teléfono</dt>
            <dd className="break-all">{e.ua ?? 'No se sabe'}</dd>
            <dt className="text-muted">Huella</dt>
            <dd className="font-mono break-all">{e.fingerprint}</dd>
          </dl>
          {e.stack && <pre className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-2.5 font-mono leading-relaxed whitespace-pre-wrap break-all">{e.stack}</pre>}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" icon={<Copy className="size-3.5" />} loading={busy.isBusy('copy')} disabled={busy.isBusy()} onClick={copy} className="max-sm:h-11">
          Copiar
        </Button>
        <Button size="sm" variant="ghost" icon={<CheckCircle2 className="size-3.5" />} onClick={fixed} loading={busy.isBusy('fixed')} disabled={busy.isBusy()} className="max-sm:h-11">
          Ya se arregló
        </Button>
      </div>
    </li>
  );
}
