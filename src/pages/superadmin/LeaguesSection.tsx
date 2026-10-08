import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowDownUp, ArrowRightLeft, Download, ExternalLink, Globe, MoreHorizontal, Trash2, Trophy, UserRound } from 'lucide-react';
import { Card, ListRow, RowIcon, Sheet } from '../../components/ui';
import { useAdminLeagues, type AdminLeague, type AdminLeagueSort } from '../../lib/data/admin';
import type { LeagueKind, Visibility } from '../../lib/types';
import { SPORT_IDS, isSportId, sportMeta } from '../../sports/registry';
import { SportIcon } from '../sports/SportBits';
import { EmptyCard, ErrorRetry, FilterChips, MenuList, Pager, Pill, PillSelect, RoundButton, SearchBox, SectionHeader, Segmented, TD, TH, TableSkeleton, type MenuItem } from './bits';
import { LEAGUE_CSV_COLUMNS, csvFileName, downloadText, toCsv } from './csv';
import { fmtDate, fmtDateTime, fmtNum, plural, relativeTime } from './format';
import { PAGE_SIZES, intParam, useSearchState, useSearchText } from './hooks';
import { DeleteLeagueModal, TransferLeagueModal } from './LeagueActions';
import { sectionMeta } from './sections';

export const LEAGUE_SORTS: readonly { key: AdminLeagueSort; label: string }[] = [
  { key: 'activity', label: 'Más actividad' },
  { key: 'name', label: 'Nombre' },
  { key: 'created', label: 'Más nuevas' },
  { key: 'members', label: 'Más miembros' },
];
const isSort = (v: string): v is AdminLeagueSort => LEAGUE_SORTS.some((x) => x.key === v);

type KindFilter = 'all' | LeagueKind;
type VisFilter = 'all' | Visibility;

/** Lo que se dice de una liga en su fila: deporte, torneo, privada y con menores (en ámbar: hay que cuidarla). */
function LeagueTags({ l }: { l: AdminLeague }) {
  const parts = [sportMeta(l.sport)?.short ?? 'Otro deporte', l.kind === 'torneo' ? 'Torneo' : null, l.visibility === 'private' ? 'Privada' : 'Pública'].filter(Boolean);
  return (
    <>
      {parts.join(' · ')}
      {l.hasMinors && (
        <>
          {' · '}
          <span className="font-semibold text-warn">Con menores</span>
        </>
      )}
    </>
  );
}

/** El menú «•••» de una liga: abrirla, ver a su dueño, pasarla a otro dueño y (al final, en rojo) borrarla. */
export function leagueMenuItems(l: Pick<AdminLeague, 'id' | 'ownerId' | 'ownerName' | 'kind'>, on: { move: () => void; remove: () => void }): MenuItem[] {
  const what = l.kind === 'torneo' ? 'el torneo' : 'la liga';
  return [
    { key: 'abrir', icon: ExternalLink, label: `Abrir ${what}`, to: `/l/${l.id}` },
    { key: 'dueno', icon: UserRound, label: 'Ver al dueño', hint: l.ownerName, to: `/superadmin/cuentas?u=${encodeURIComponent(l.ownerId)}` },
    { key: 'pasar', icon: ArrowRightLeft, label: 'Pasar a otro dueño', hint: `${l.ownerName} queda de admin`, onClick: on.move },
    { key: 'borrar', icon: Trash2, label: `Borrar ${what}`, onClick: on.remove, danger: true },
  ];
}

const VIS_OPTIONS: readonly { key: VisFilter; label: string; short: string }[] = [
  { key: 'all', label: 'Públicas y privadas', short: 'Todas' },
  { key: 'public', label: 'Solo públicas', short: 'Públicas' },
  { key: 'private', label: 'Solo privadas', short: 'Privadas' },
];

/** Ligas y torneos de todos: buscar, filtrar, ordenar, abrir, pasar a otro dueño y borrar. */
export default function LeaguesSection() {
  const s = useSearchState();
  const [text, setText] = useSearchText(s);
  const search = s.get('q');
  const depRaw = s.get('dep');
  const sport = isSportId(depRaw) ? depRaw : null;
  const tipo = s.get('tipo');
  const kind: KindFilter = tipo === 'liga' || tipo === 'torneo' ? tipo : 'all';
  const visRaw = s.get('vis');
  const visibility: VisFilter = visRaw === 'public' || visRaw === 'private' ? visRaw : 'all';
  const sortRaw = s.get('orden', 'activity');
  const sort: AdminLeagueSort = isSort(sortRaw) ? sortRaw : 'activity';
  const page = Math.max(0, intParam(s.get('p'), 1) - 1);
  const pageSize = intParam(s.get('n'), 25, PAGE_SIZES);

  const leagues = useAdminLeagues(true, {
    search: search || undefined,
    sport: sport ?? undefined,
    kind: kind === 'all' ? undefined : kind,
    visibility: visibility === 'all' ? undefined : visibility,
    sort,
    page,
    pageSize,
  });
  const { rows, total } = leagues.data;
  const [menu, setMenu] = useState<AdminLeague | null>(null);
  const [moving, setMoving] = useState<AdminLeague | null>(null);
  const [deleting, setDeleting] = useState<AdminLeague | null>(null);
  const filtered = !!(search || sport || kind !== 'all' || visibility !== 'all');

  const more = (l: AdminLeague) => (
    <RoundButton label={`Más opciones de ${l.name}`} onClick={() => setMenu(l)} popup>
      <MoreHorizontal aria-hidden="true" strokeWidth={2.4} className="size-5" />
    </RoundButton>
  );

  return (
    <>
      <SectionHeader
        title="Ligas y torneos"
        hint={sectionMeta('ligas').hint}
        actions={
          <Pill
            icon={<Download className="size-4" />}
            disabled={!rows.length}
            onClick={() => downloadText(csvFileName('ligas'), toCsv(rows, LEAGUE_CSV_COLUMNS))}
            label="Bajar en CSV las ligas de esta página"
          >
            CSV
          </Pill>
        }
      />

      <div className="flex flex-col gap-3">
        <SearchBox label="Buscar ligas por nombre o dueño" placeholder="Buscar por nombre o dueño" value={text} onChange={setText} />
        <FilterChips
          label="Filtrar por deporte"
          items={[
            { key: 'todos', label: 'Todos' },
            ...SPORT_IDS.map((id) => ({ key: id as string, label: sportMeta(id)?.short ?? id, icon: <SportIcon sport={id} className="size-[18px]" /> })),
          ]}
          value={sport ?? 'todos'}
          onChange={(v) => s.patch({ dep: v === 'todos' || v === sport ? null : v, p: null })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Tipo"
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'liga', label: 'Ligas' },
              { value: 'torneo', label: 'Torneos' },
            ]}
            value={kind}
            onChange={(v) => s.patch({ tipo: v === 'all' ? null : v, p: null })}
          />
          <span className="flex flex-wrap items-center gap-2">
            <PillSelect
              label="Visibilidad"
              icon={<Globe aria-hidden="true" className="size-4 shrink-0" />}
              options={VIS_OPTIONS}
              value={visibility}
              onChange={(v) => s.patch({ vis: v === 'all' ? null : v, p: null })}
            />
            <PillSelect
              label="Ordenar"
              icon={<ArrowDownUp aria-hidden="true" className="size-4 shrink-0" />}
              options={LEAGUE_SORTS}
              value={sort}
              onChange={(v) => s.patch({ orden: v === 'activity' ? null : v, p: null })}
            />
          </span>
        </div>
      </div>

      {leagues.error && !rows.length ? (
        <ErrorRetry error={leagues.error} />
      ) : leagues.loading && !rows.length ? (
        <TableSkeleton rows={8} cols={6} />
      ) : !rows.length ? (
        <EmptyCard icon={<Trophy className="size-8" />} title={filtered ? 'No hay ligas con estos filtros' : 'Todavía no hay ligas'}>
          {filtered ? 'Prueba con otra búsqueda o quita los filtros.' : 'Cuando alguien cree una liga o un torneo, sale aquí.'}
        </EmptyCard>
      ) : (
        <Card className={leagues.loading ? 'overflow-hidden opacity-60 transition-opacity' : 'overflow-hidden transition-opacity'}>
          <table className="hidden w-full text-[15px] lg:table">
            <caption className="sr-only">Ligas y torneos, página {page + 1}</caption>
            <thead className="border-b border-line text-left">
              <tr>
                <th scope="col" className={`${TH} w-[32%] pl-5`}>
                  Liga
                </th>
                <th scope="col" className={`${TH} w-[22%]`}>
                  Dueño
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Miembros
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Jugadores
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Eventos
                </th>
                <th scope="col" className={TH}>
                  Actividad
                </th>
                <th scope="col" className="w-14 pr-4">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((l) => (
                <tr key={l.id} className="transition hover:bg-surface-2/60">
                  <td className={`${TD} max-w-0 pl-5`}>
                    <Link to={`/l/${l.id}`} className="block truncate font-semibold hover:underline">
                      {l.name}
                    </Link>
                    <span className="mt-0.5 block truncate text-[13px] text-muted">
                      <LeagueTags l={l} />
                    </span>
                  </td>
                  <td className={`${TD} max-w-0`}>
                    <Link to={`/superadmin/cuentas?u=${encodeURIComponent(l.ownerId)}`} className="block truncate hover:underline">
                      {l.ownerName}
                    </Link>
                    <span className="block truncate text-[13px] text-muted">{l.ownerEmail ?? ''}</span>
                  </td>
                  <td className={`${TD} num text-right font-semibold`}>{fmtNum(l.members)}</td>
                  <td className={`${TD} num text-right`}>{fmtNum(l.players)}</td>
                  <td className={`${TD} num text-right`}>{fmtNum(l.events)}</td>
                  <td className={`${TD} whitespace-nowrap`}>
                    <span title={fmtDateTime(l.lastActivityAt)}>{relativeTime(l.lastActivityAt)}</span>
                    <span className="block text-[13px] text-muted" title={fmtDateTime(l.createdAt)}>
                      creada {fmtDate(l.createdAt)}
                    </span>
                  </td>
                  <td className="pr-4 text-right">{more(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Teléfono y tableta: filas (la fila abre la liga; «•••», lo demás). */}
          <div className="lg:hidden">
            {rows.map((l) => (
              <ListRow
                key={l.id}
                dense
                leading={
                  <RowIcon>
                    <SportIcon sport={l.sport} className="size-5" />
                  </RowIcon>
                }
                title={l.name}
                subtitle={
                  <>
                    <span className="block truncate">
                      <LeagueTags l={l} />
                    </span>
                    <span className="block truncate">
                      {l.ownerName} · {plural(l.members, 'miembro', 'miembros')} · {relativeTime(l.lastActivityAt)}
                    </span>
                  </>
                }
                to={`/l/${l.id}`}
                trailing={more(l)}
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
          noun="ligas"
          onPage={(p) => s.patch({ p: p > 0 ? p + 1 : null })}
          onPageSize={(n) => s.patch({ n: n === 25 ? null : n, p: null })}
        />
      )}

      <Sheet
        open={menu != null}
        onClose={() => setMenu(null)}
        title={menu?.name ?? 'Liga'}
        subtitle={menu ? `${plural(menu.members, 'miembro', 'miembros')} · ${plural(menu.events, 'evento', 'eventos')}` : undefined}
      >
        {menu && <MenuList items={leagueMenuItems(menu, { move: () => setMoving(menu), remove: () => setDeleting(menu) })} onPick={() => setMenu(null)} />}
      </Sheet>
      <TransferLeagueModal league={moving} onClose={() => setMoving(null)} />
      <DeleteLeagueModal league={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
