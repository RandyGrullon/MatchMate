import { useMemo, useState } from 'react';
import { Medal } from 'lucide-react';
import { useSwimSeason } from '../../../lib/data/swimming';
import { inSeason } from '../../../lib/seasons';
import { useIsPro } from '../../../components/mode';
import { PillSelect } from '../../../components/ranking/parts';
import { ShareButton, medalPointsShare } from '../../../components/share';
import { ClosedSeasonView, SeasonBar, useStandingsSeason } from '../../../components/season/SeasonView';
import { Badge, Card, DateBlock, ListRow, ListSkeleton, LoadError, SectionHeader } from '../../../components/ui';
import { EmptyCard, ShowMore } from '../FieldChrome';
import { ClubTag, clubMap, meetTitle, useSwim } from './bits';
import { seasonTable } from './logic';
import { ClubPointsCard } from './ResultsPanel';

const pts = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

/**
 * Puntos por club de la temporada (rediseño «Calma y foco», como la Tabla del boliche): el título con compartir, la
 * temporada (?temporada=; sin temporadas, por año con «2026 ▾»), los clubes por puntos con sus medallas y lo que sumó cada
 * encuentro (el control de marcas no cuenta). Una temporada cerrada muestra sus premios y la tabla que se guardó al
 * cerrarla.
 */
export default function SwimStandings() {
  const { lid, base, clubs, league } = useSwim();
  const pro = useIsPro();
  const season = useSwimSeason(lid);
  const picked = useStandingsSeason();
  const sel = picked.selected;
  const years = useMemo(() => [...new Set(season.data.meets.map((m) => m.date.slice(0, 4)))].sort().reverse(), [season.data.meets]);
  const [year, setYear] = useState<string | null>(null);
  const shownYear = sel ? sel.name : (year ?? years[0] ?? String(new Date().getFullYear()));
  const table = useMemo(
    () => (sel ? seasonTable(season.data, undefined, (d) => inSeason(sel, d)) : seasonTable(season.data, shownYear)),
    [season.data, sel, shownYear],
  );
  const byId = useMemo(() => clubMap(clubs.data), [clubs.data]);

  // Imagen de los puntos de la temporada para mandar al grupo.
  const shareCard = () =>
    medalPointsShare({
      title: league.name,
      subtitle: sel ? `Puntos · ${shownYear}` : `Puntos de la temporada ${shownYear}`,
      rows: table.clubs.map((c) => ({ ...c, id: c.clubId })),
      who: (id) => byId.get(id) ?? { name: '(club borrado)' },
      note: `Suma de ${table.meets.length} ${table.meets.length === 1 ? 'encuentro' : 'encuentros'}. El control de marcas no cuenta.`,
    });

  return (
    <div className="flex flex-col px-2">
      <div className="mt-1 flex items-center justify-between gap-3">
        <h1 className={pro ? 'text-title-pro' : 'text-title'}>Puntos</h1>
        {!picked.closed && !season.loading && table.clubs.length > 0 && (
          <ShareButton
            variant="ghost"
            size="md"
            iconOnly
            label="Compartir los puntos"
            card={shareCard}
            className="relative shrink-0 rounded-full! bg-surface-2 text-fg-2 after:absolute after:-inset-0.5 after:content-['']"
          />
        )}
      </div>
      <p className="mt-1.5 text-meta text-muted">Lo que suma cada club en los encuentros de la temporada</p>
      {!sel && years.length > 1 && (
        <PillSelect className="mt-3 self-start" label="Temporada" options={years.map((y) => ({ key: y, label: y }))} value={shownYear} onChange={setYear} />
      )}
      <SeasonBar className="mt-3" seasons={picked.seasons} selected={sel} onChange={picked.setSelected} />

      <div className="mt-5">
        {picked.closed ? (
          <ClosedSeasonView season={picked.closed} />
        ) : season.error ? (
          <LoadError error={season.error} />
        ) : season.loading ? (
          <ListSkeleton rows={4} />
        ) : !table.clubs.length ? (
          <EmptyCard
            icon={<Medal className="size-5" />}
            title="Todavía no hay puntos"
            text={`Salen de los resultados de los encuentros de ${sel ? shownYear : `la temporada ${shownYear}`}. Los nadadores tienen que tener club.`}
          />
        ) : (
          <div className="flex flex-col gap-[30px]">
            <ClubPointsCard rows={table.clubs} clubs={byId} title="Clubes" />
            <section aria-labelledby="natacion-por-encuentro">
              <SectionHeader id="natacion-por-encuentro" title="Por encuentro" />
              <ShowMore
                items={table.meets}
                max={pro ? table.meets.length : 3}
                noun="encuentros"
                render={(shown) => (
                  <Card className="overflow-hidden">
                    {shown.map((m) => {
                      const rows = table.clubs.filter((c) => c.byMeet[m.id] != null).sort((a, b) => b.byMeet[m.id] - a.byMeet[m.id]);
                      return (
                        <ListRow
                          key={m.id}
                          to={`${base}/e/${m.id}?ver=puntos`}
                          leading={<DateBlock date={m.date} />}
                          title={
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{meetTitle(m)}</span>
                              {!m.finalizedAt && <Badge tone="warn">Provisional</Badge>}
                            </span>
                          }
                          subtitle={
                            <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                              {rows.map((c) => (
                                <span key={c.clubId} className="inline-flex items-center gap-1 text-xs">
                                  <ClubTag club={byId.get(c.clubId)} short />
                                  <span className="font-semibold text-fg tabular-nums">{pts(c.byMeet[m.id])}</span>
                                </span>
                              ))}
                            </span>
                          }
                        />
                      );
                    })}
                  </Card>
                )}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
