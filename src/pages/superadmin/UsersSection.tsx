import { ChevronRight, Download, Users } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Card, ListRow } from '../../components/ui';
import { useAdminOverview, useAdminUsers, type AdminOverview, type AdminUser, type AdminUserFilter } from '../../lib/data/admin';
import { EmptyCard, ErrorRetry, FilterChips, Pager, Pill, SearchBox, SectionHeader, TD, TH, TableSkeleton } from './bits';
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
          <Pill
            icon={<Download className="size-4" />}
            disabled={!rows.length}
            onClick={() => downloadText(csvFileName('cuentas'), toCsv(rows, USER_CSV_COLUMNS))}
            label="Bajar en CSV las cuentas de esta página"
          >
            CSV
          </Pill>
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
        <EmptyCard icon={<Users className="size-8" />} title={search ? `Nada con «${search}»` : 'No hay cuentas con este filtro'}>
          {search || filter !== 'all' ? 'Prueba con otra búsqueda o quita el filtro.' : 'Todavía nadie se ha registrado.'}
        </EmptyCard>
      ) : (
        <Card className={users.loading ? 'overflow-hidden opacity-60 transition-opacity' : 'overflow-hidden transition-opacity'}>
          {/* Computadora: tabla. */}
          <table className="hidden w-full text-[15px] md:table">
            <caption className="sr-only">Cuentas, página {page + 1}</caption>
            <thead className="border-b border-line text-left">
              <tr>
                <th scope="col" className={`${TH} w-[38%] pl-5`}>
                  Cuenta
                </th>
                <th scope="col" className={TH}>
                  Alta
                </th>
                <th scope="col" className={TH}>
                  Última vez
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Ligas
                </th>
                <th scope="col" className={TH}>
                  Estado
                </th>
                <th scope="col" className="w-10 px-2">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((u) => (
                <tr key={u.id} className="cursor-pointer transition hover:bg-surface-2/60" onClick={() => open(u)}>
                  <td className={`${TD} max-w-0 pl-5`}>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} className="size-9 text-xs" />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            open(u);
                          }}
                          className="block max-w-full truncate text-left font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {u.name}
                        </button>
                        <div className="truncate text-[13px] text-muted">{u.email ?? 'Sin correo'}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-muted`} title={fmtDateTime(u.createdAt)}>
                    {fmtDate(u.createdAt)}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-muted`} title={fmtDateTime(u.lastSeenAt)}>
                    {relativeTime(u.lastSeenAt)}
                  </td>
                  <td className={`${TD} num text-right font-semibold whitespace-nowrap`}>
                    {fmtNum(u.leagues)}
                    {u.ownedLeagues > 0 && <span className="block text-xs font-normal text-muted">dueño de {fmtNum(u.ownedLeagues)}</span>}
                  </td>
                  <td className={TD}>
                    <UserBadges u={u} me={me} />
                  </td>
                  <td className="px-2 text-faint">
                    <ChevronRight className="size-5" aria-hidden="true" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Teléfono: filas (toda la fila abre el detalle). */}
          <div className="md:hidden">
            {rows.map((u) => (
              <ListRow
                key={u.id}
                dense
                leading={<Avatar name={u.name} className="size-10 text-sm" />}
                title={u.name}
                subtitle={
                  <>
                    <span className="block truncate">{u.email ?? 'Sin correo'}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <UserBadges u={u} me={me} />
                      <span>
                        {fmtNum(u.leagues)} {u.leagues === 1 ? 'liga' : 'ligas'} · {relativeTime(u.lastSeenAt)}
                      </span>
                    </span>
                  </>
                }
                onClick={() => open(u)}
              />
            ))}
          </div>
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
