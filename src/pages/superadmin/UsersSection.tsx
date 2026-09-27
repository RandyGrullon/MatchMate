import { ChevronRight, Download, Users } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Button, Card, Empty } from '../../components/ui';
import { useAdminOverview, useAdminUsers, type AdminOverview, type AdminUser, type AdminUserFilter } from '../../lib/data/admin';
import { ErrorRetry, FilterChips, Pager, SearchBox, SectionHeader, TableSkeleton } from './bits';
import { USER_CSV_COLUMNS, csvFileName, downloadText, toCsv } from './csv';
import { fmtDate, fmtDateTime, fmtNum, relativeTime } from './format';
import { PAGE_SIZES, intParam, useSearchState, useSearchText } from './hooks';
import { USER_FILTERS, isUserFilter } from './model';
import { sectionMeta } from './sections';
import { UserBadges, UserDrawer } from './UserDetail';
import { useAuth } from '../../lib/auth';

/** Cuántas hay en cada filtro (del resumen general). */
function filterCount(o: AdminOverview | null, f: AdminUserFilter): number | null {
  if (!o) return null;
  switch (f) {
    case 'all':
      return o.users.total;
    case 'super':
      return o.users.superadmins;
    case 'blocked':
      return o.users.blocked;
    case 'unconfirmed':
      return o.users.unconfirmed;
    case 'inactive':
      return Math.max(0, o.users.total - o.users.active30d);
  }
}

/** Cuentas: buscar, filtrar, paginar, ver el detalle, nombrar superadmins, bloquear y bajar en CSV. */
export default function UsersSection() {
  const s = useSearchState();
  const fRaw = s.get('f', 'all');
  const filter: AdminUserFilter = isUserFilter(fRaw) ? fRaw : 'all';
  const page = Math.max(0, intParam(s.get('p'), 1) - 1);
  const pageSize = intParam(s.get('n'), 25, PAGE_SIZES);
  const search = s.get('q');
  const openId = s.get('u') || null;

  const [text, setText] = useSearchText(s);

  const users = useAdminUsers(true, { search: search || undefined, filter, page, pageSize });
  const overview = useAdminOverview(true).data;
  const { rows, total } = users.data;
  const me = useAuth().user?.uid;
  const open = (u: AdminUser) => s.patch({ u: u.id });

  return (
    <>
      <SectionHeader
        title="Cuentas"
        hint={sectionMeta('cuentas').hint}
        actions={
          <Button
            icon={<Download className="size-4" />}
            disabled={!rows.length}
            onClick={() => downloadText(csvFileName('cuentas'), toCsv(rows, USER_CSV_COLUMNS))}
            title="Baja en CSV las cuentas de esta página"
            className="max-sm:min-h-11"
          >
            Bajar CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <SearchBox label="Buscar cuentas por nombre o correo" placeholder="Buscar por nombre o correo" value={text} onChange={setText} />
        <FilterChips
          label="Filtrar cuentas"
          items={USER_FILTERS.map((f) => ({ ...f, count: filterCount(overview, f.key) }))}
          value={filter}
          onChange={(f) => s.patch({ f: f === 'all' ? null : f, p: null })}
        />
      </div>

      {users.error && !rows.length ? (
        <ErrorRetry error={users.error} />
      ) : users.loading && !rows.length ? (
        <TableSkeleton rows={8} cols={5} />
      ) : !rows.length ? (
        <Empty icon={<Users className="size-8" />} title={search ? `Nada con «${search}»` : 'No hay cuentas con este filtro'}>
          {search || filter !== 'all' ? 'Prueba con otra búsqueda o quita el filtro.' : 'Todavía nadie se ha registrado.'}
        </Empty>
      ) : (
        <Card className={users.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Computadora: tabla. */}
          <table className="hidden w-full text-sm md:table">
            <caption className="sr-only">Cuentas, página {page + 1}</caption>
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Cuenta
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Alta
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Última vez
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Ligas
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Estado
                </th>
                <th scope="col" className="w-10 px-2 py-2.5">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => (
                <tr key={u.id} className="cursor-pointer transition hover:bg-surface-2/60" onClick={() => open(u)}>
                  <td className="max-w-0 px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} className="size-8 text-xs" />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(u);
                          }}
                          className="block max-w-full truncate text-left font-medium hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {u.name}
                        </button>
                        <div className="truncate text-xs text-muted">{u.email ?? 'Sin correo'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted" title={fmtDateTime(u.createdAt)}>
                    {fmtDate(u.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted" title={fmtDateTime(u.lastSeenAt)}>
                    {relativeTime(u.lastSeenAt)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {fmtNum(u.leagues)}
                    {u.ownedLeagues > 0 && <span className="block text-xs text-muted">dueño de {fmtNum(u.ownedLeagues)}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <UserBadges u={u} me={me} />
                  </td>
                  <td className="px-2 py-2.5 text-muted">
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Teléfono: tarjetas. */}
          <ul className="divide-y divide-line md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => open(u)} className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition active:bg-surface-2">
                  <Avatar name={u.name} className="size-9 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted">{u.email ?? 'Sin correo'}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <UserBadges u={u} me={me} />
                      <span>
                        {fmtNum(u.leagues)} {u.leagues === 1 ? 'liga' : 'ligas'} · {relativeTime(u.lastSeenAt)}
                      </span>
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(total > 0 || page > 0) && (
        <Pager
          page={page}
          pageSize={pageSize}
          total={total}
          noun="cuentas"
          onPage={(p) => s.patch({ p: p > 0 ? p + 1 : null })}
          onPageSize={(n) => s.patch({ n: n === 25 ? null : n, p: null })}
        />
      )}

      <UserDrawer id={openId} onClose={() => s.patch({ u: null })} />
    </>
  );
}
