import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRightLeft, Baby, Download, ExternalLink, Globe, Lock, Trash2, Trophy } from 'lucide-react';
import { Badge, Button, Card, Empty, Select } from '../../components/ui';
import { useAdminLeagues, type AdminLeague, type AdminLeagueSort } from '../../lib/data/admin';
import type { LeagueKind, Visibility } from '../../lib/types';
import { SPORT_IDS, isSportId } from '../../sports/registry';
import { SportBadge, SportChips } from '../sports/SportBits';
import { ErrorRetry, Pager, SearchBox, SectionHeader, Segmented, TableSkeleton } from './bits';
import { LEAGUE_CSV_COLUMNS, csvFileName, downloadText, toCsv } from './csv';
import { fmtDate, fmtDateTime, fmtNum, relativeTime } from './format';
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

function LeagueBadges({ l }: { l: AdminLeague }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {l.kind === 'torneo' && <Badge tone="accent">Torneo</Badge>}
      {l.visibility === 'private' ? (
        <Badge tone="neutral">
          <Lock className="size-3" aria-hidden="true" />
          Privada
        </Badge>
      ) : (
        <Badge tone="neutral">
          <Globe className="size-3" aria-hidden="true" />
          Pública
        </Badge>
      )}
      {l.hasMinors && (
        <Badge tone="warn">
          <Baby className="size-3" aria-hidden="true" />
          Con menores
        </Badge>
      )}
    </span>
  );
}

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
  const [moving, setMoving] = useState<AdminLeague | null>(null);
  const [deleting, setDeleting] = useState<AdminLeague | null>(null);
  const filtered = !!(search || sport || kind !== 'all' || visibility !== 'all');

  const actions = (l: AdminLeague, big = false) => {
    const cls = big ? 'size-11' : '';
    return (
      <div className="flex items-center justify-end gap-1">
        <Link
          to={`/l/${l.id}`}
          aria-label={`Abrir ${l.name}`}
          title="Abrir"
          className={`inline-flex items-center justify-center rounded-xl text-fg transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent ${big ? 'size-11' : 'size-8'}`}
        >
          <ExternalLink className="size-4" />
        </Link>
        <Button
          size={big ? 'md' : 'sm'}
          variant="ghost"
          icon={<ArrowRightLeft className="size-4" />}
          aria-label={`Pasar ${l.name} a otro dueño`}
          title="Pasar a otro dueño"
          onClick={() => setMoving(l)}
          className={cls}
        />
        <Button
          size={big ? 'md' : 'sm'}
          variant="ghost"
          icon={<Trash2 className="size-4 text-danger" />}
          aria-label={`Borrar ${l.name}`}
          title="Borrar"
          onClick={() => setDeleting(l)}
          className={cls}
        />
      </div>
    );
  };

  return (
    <>
      <SectionHeader
        title="Ligas y torneos"
        hint={sectionMeta('ligas').hint}
        actions={
          <Button
            icon={<Download className="size-4" />}
            disabled={!rows.length}
            onClick={() => downloadText(csvFileName('ligas'), toCsv(rows, LEAGUE_CSV_COLUMNS))}
            title="Baja en CSV las ligas de esta página"
            className="max-sm:min-h-11"
          >
            Bajar CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchBox label="Buscar ligas por nombre o dueño" placeholder="Buscar por nombre o dueño" value={text} onChange={setText} />
          <label className="flex items-center gap-2 text-sm text-muted">
            <span className="shrink-0">Ordenar</span>
            <Select value={sort} onChange={(e) => s.patch({ orden: e.target.value === 'activity' ? null : e.target.value, p: null })} className="max-sm:h-11 sm:w-44">
              {LEAGUE_SORTS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <SportChips sports={SPORT_IDS} value={sport} onChange={(v) => s.patch({ dep: v, p: null })} />
        <div className="flex flex-wrap gap-2">
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
          <Segmented
            label="Visibilidad"
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'public', label: 'Públicas' },
              { value: 'private', label: 'Privadas' },
            ]}
            value={visibility}
            onChange={(v) => s.patch({ vis: v === 'all' ? null : v, p: null })}
          />
        </div>
      </div>

      {leagues.error && !rows.length ? (
        <ErrorRetry error={leagues.error} />
      ) : leagues.loading && !rows.length ? (
        <TableSkeleton rows={8} cols={6} />
      ) : !rows.length ? (
        <Empty icon={<Trophy className="size-8" />} title={filtered ? 'No hay ligas con estos filtros' : 'Todavía no hay ligas'}>
          {filtered ? 'Prueba con otra búsqueda o quita los filtros.' : 'Cuando alguien cree una liga o un torneo, sale aquí.'}
        </Empty>
      ) : (
        <Card className={leagues.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <table className="hidden w-full text-sm lg:table">
            <caption className="sr-only">Ligas y torneos, página {page + 1}</caption>
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Liga
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Dueño
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Miembros
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Jugadores
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  Eventos
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Actividad
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((l) => (
                <tr key={l.id} className="transition hover:bg-surface-2/60">
                  <td className="max-w-0 px-4 py-2.5">
                    <Link to={`/l/${l.id}`} className="block truncate font-medium hover:underline">
                      {l.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <SportBadge sport={l.sport} />
                      <LeagueBadges l={l} />
                    </span>
                  </td>
                  <td className="max-w-0 px-3 py-2.5">
                    <Link to={`/superadmin/cuentas?u=${encodeURIComponent(l.ownerId)}`} className="block truncate hover:underline">
                      {l.ownerName}
                    </Link>
                    <span className="block truncate text-xs text-muted">{l.ownerEmail ?? ''}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(l.members)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(l.players)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(l.events)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span title={fmtDateTime(l.lastActivityAt)}>{relativeTime(l.lastActivityAt)}</span>
                    <span className="block text-xs text-muted" title={fmtDateTime(l.createdAt)}>
                      creada {fmtDate(l.createdAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{actions(l)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="divide-y divide-line lg:hidden">
            {rows.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Link to={`/l/${l.id}`} className="block truncate font-medium hover:underline">
                      {l.name}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <SportBadge sport={l.sport} />
                      <LeagueBadges l={l} />
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted">
                  De{' '}
                  <Link to={`/superadmin/cuentas?u=${encodeURIComponent(l.ownerId)}`} className="font-medium text-fg hover:underline">
                    {l.ownerName}
                  </Link>{' '}
                  · {fmtNum(l.members)} miembros · {fmtNum(l.players)} jugadores · {fmtNum(l.events)} eventos
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted" title={fmtDateTime(l.lastActivityAt)}>
                    Actividad {relativeTime(l.lastActivityAt)}
                  </span>
                  {actions(l, true)}
                </div>
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
          noun="ligas"
          onPage={(p) => s.patch({ p: p > 0 ? p + 1 : null })}
          onPageSize={(n) => s.patch({ n: n === 25 ? null : n, p: null })}
        />
      )}

      <TransferLeagueModal league={moving} onClose={() => setMoving(null)} />
      <DeleteLeagueModal league={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
