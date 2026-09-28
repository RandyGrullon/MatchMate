import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Medal } from 'lucide-react';
import { useSwimSeason } from '../../../lib/data/swimming';
import { formatDate } from '../../../lib/format';
import { ShareButton, medalPointsShare } from '../../../components/share';
import { Badge, Card, Empty, ListSkeleton, LoadError } from '../../../components/ui';
import { ClubTag, PageHead, clubMap, meetTitle, useSwim } from './bits';
import { seasonTable } from './logic';
import { ClubPointsCard } from './ResultsPanel';

const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/** Puntos por club de la temporada: la suma de cada encuentro (el control de marcas no cuenta). */
export default function SwimStandings() {
  const { lid, base, clubs, league } = useSwim();
  const season = useSwimSeason(lid);
  const years = useMemo(() => [...new Set(season.data.meets.map((m) => m.date.slice(0, 4)))].sort().reverse(), [season.data.meets]);
  const [year, setYear] = useState<string | null>(null);
  const shownYear = year ?? years[0] ?? String(new Date().getFullYear());
  const table = useMemo(() => seasonTable(season.data, shownYear), [season.data, shownYear]);
  const byId = useMemo(() => clubMap(clubs.data), [clubs.data]);

  // Imagen de los puntos de la temporada para mandar al grupo.
  const shareCard = () =>
    medalPointsShare({
      title: league.name,
      subtitle: `Puntos de la temporada ${shownYear}`,
      rows: table.clubs.map((c) => ({ ...c, id: c.clubId })),
      who: (id) => byId.get(id) ?? { name: '(club borrado)' },
      note: `Suma de ${table.meets.length} ${table.meets.length === 1 ? 'encuentro' : 'encuentros'}. El control de marcas no cuenta.`,
    });

  return (
    <div className="flex flex-col gap-5">
      <PageHead icon={<Medal className="size-5" />} title="Puntos de la temporada" sub="Suma de los puntos por club de cada encuentro.">
        {years.length > 1 && (
          <select
            value={shownYear}
            onChange={(e) => setYear(e.target.value)}
            className="h-9 rounded-xl border border-line bg-surface px-2 text-sm font-medium"
            aria-label="Temporada"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
        {!season.loading && table.clubs.length > 0 && <ShareButton variant="ghost" size="md" iconOnly label="Compartir los puntos" card={shareCard} />}
      </PageHead>

      {season.error ? (
        <LoadError error={season.error} />
      ) : season.loading ? (
        <ListSkeleton rows={4} />
      ) : !table.clubs.length ? (
        <Empty icon={<Medal className="size-8" />} title="Todavía no hay puntos">
          Salen de los resultados de los encuentros de la temporada {shownYear}. Los nadadores tienen que tener club.
        </Empty>
      ) : (
        <>
          <ClubPointsCard rows={table.clubs} clubs={byId} title={`Clubes · ${shownYear}`} />
          <Card className="overflow-hidden">
            <h2 className="border-b border-line px-4 py-2.5 font-semibold">Por encuentro</h2>
            <div className="divide-y divide-line">
              {table.meets.map((m) => {
                const rows = table.clubs.filter((c) => c.byMeet[m.id] != null).sort((a, b) => b.byMeet[m.id] - a.byMeet[m.id]);
                return (
                  <Link key={m.id} to={`${base}/e/${m.id}?ver=puntos`} className="block px-4 py-3 transition hover:bg-surface-2">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-medium">{meetTitle(m)}</p>
                      <span className="text-xs text-muted">{formatDate(m.date)}</span>
                      {!m.finalizedAt && <Badge tone="warn">Provisional</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {rows.map((c) => (
                        <span key={c.clubId} className="inline-flex items-center gap-1 text-xs">
                          <ClubTag club={byId.get(c.clubId)} short />
                          <span className="font-semibold tabular-nums">{pts(c.byMeet[m.id])}</span>
                        </span>
                      ))}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
