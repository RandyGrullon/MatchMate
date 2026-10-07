import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ListOrdered, Medal, Moon, Users } from 'lucide-react';
import { useLeagueCtx } from '../../../lib/league';
import { StandingsTable, type StandingsColumn } from '../../../components/match';
import { ShareButton, standingsShare, type ShareTableSpec } from '../../../components/share';
import { ClosedSeasonView, SeasonBar, useStandingsSeason } from '../../../components/season/SeasonView';
import { SEASON_PARAM } from '../../../components/season/SeasonSelect';
import { Card, Empty, ListSkeleton, LoadError, Position, Segmented, cx } from '../../../components/ui';
import { useIsPro } from '../../../components/mode';
import { Chips, racketColumns } from './bits';
import { fmtPoints } from './logic/night';
import { MODALITY_LABEL, type Modality } from './logic/modality';
import { seasonPlayerTable, winPct } from './logic/results';
import { rankingNote, tiebreakText } from './logic/tiebreaks';
import { useRacketSeason } from './seasonTable';
import { hasNights, useRacket } from './sport';

type Tab = 'parejas' | 'ranking' | 'noches';

/**
 * Tabla de la temporada: las tablas de las ligas de parejas (y de los grupos de los torneos), el ranking
 * individual con los partidos a sets y las noches de americano y mexicano. Arriba, el título «Tabla» (como la del
 * boliche) y qué tabla se ve en un segmentado (Parejas | Ranking | Noches, `?ver=`); debajo, la temporada
 * (?temporada=): la activa con los partidos de sus fechas; una cerrada muestra sus premios y la tabla que se guardó al
 * cerrarla.
 */
export default function RacketStandings() {
  const { lid, base, league, myPlayerId } = useLeagueCtx();
  const { sport, doubles, ext } = useRacket();
  const pro = useIsPro();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const picked = useStandingsSeason();
  const { q, all, matches, comps, kinds, split, nights, names, now } = useRacketSeason(picked.selected, sport, ext);
  const nightsWord = ext.words?.nights ?? 'Noches';
  // Cambiar de pestaña o de tabla no pierde la temporada elegida.
  const go = (p: Record<string, string>) => {
    const season = search.get(SEASON_PARAM);
    setSearch(season ? { ...p, [SEASON_PARAM]: season } : p, { replace: true });
  };
  const modo: Modality = search.get('modo') === 'dobles' ? 'dobles' : search.get('modo') === 'individual' ? 'individual' : kinds.dobles.length > kinds.individual.length ? 'dobles' : 'individual';
  const ranking = useMemo(
    () => seasonPlayerTable(split ? kinds[modo] : matches, { sport, rosterOf: names.rosterOf, lotSeed: lid, now }),
    [split, kinds, modo, matches, sport, names, lid, now],
  );
  const rankingColumns: StandingsColumn[] = useMemo(
    () => [
      ...racketColumns(sport).slice(0, 4),
      { key: 'pct', label: '% G', title: 'Porcentaje de victorias', value: (r) => `${winPct(r.won, r.played) ?? 0}%`, wide: true },
      racketColumns(sport)[6],
    ],
    [sport],
  );

  const tab: Tab = (search.get('ver') as Tab | null) ?? (comps.length ? 'parejas' : ranking.length ? 'ranking' : nights.length ? 'noches' : 'parejas');
  const compKey = search.get('tabla') ?? comps[0]?.key;
  const comp = comps.find((c) => c.key === compKey) ?? comps[0];
  const highlight = [...(myPlayerId ? [myPlayerId] : []), ...names.teamsOf(myPlayerId)];
  const scope = picked.seasons.length > 1 ? (picked.selected?.name ?? null) : null;

  // Imagen de la tabla que se ve (pestaña, tabla elegida y modalidad) para mandar al grupo.
  const shareCard = (): ShareTableSpec | null => {
    const subtitle = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
    if (tab === 'parejas') {
      if (!comp?.rows.length) return null;
      return standingsShare({
        title: league.name,
        subtitle: subtitle(comp.name, scope),
        sections: [{ rows: comp.rows }],
        columns: racketColumns(sport),
        nameOf: names.entrantName,
        nameLabel: doubles ? 'Pareja' : 'Jugador',
      });
    }
    if (tab === 'ranking') {
      if (!ranking.length) return null;
      return standingsShare({
        title: league.name,
        subtitle: subtitle('Ranking', split ? MODALITY_LABEL[modo] : null, scope),
        sections: [{ rows: ranking }],
        columns: rankingColumns,
        nameOf: names.nameOf,
        nameLabel: 'Jugador',
        note: rankingNote(sport),
      });
    }
    if (!nights.length) return null;
    return {
      kind: 'table',
      title: league.name,
      subtitle: subtitle(nightsWord, scope),
      nameLabel: 'Jugador',
      columns: [{ label: 'Noches' }, { label: 'PJ' }, { label: 'G' }, { label: 'Prom.', optional: true }, { label: 'Pts', strong: true }],
      sections: [{ rows: nights.map((r) => ({ rank: r.rank, name: names.nameOf(r.id), values: [r.nights, r.played, r.won, fmtPoints(r.avg), r.points] })) }],
    };
  };
  const canShare = tab === 'parejas' ? !!comp?.rows.length : tab === 'ranking' ? ranking.length > 0 : nights.length > 0;

  if (q.error) return <LoadError error={q.error} />;

  // Con el mismo margen que la Tabla del boliche (24 px); las tablas, de lado a lado.
  const title = <h1 className={cx('px-2', pro ? 'text-title-pro' : 'text-title')}>Tabla</h1>;

  if (picked.closed) {
    return (
      <div className="flex flex-col gap-4">
        {title}
        <SeasonBar seasons={picked.seasons} selected={picked.selected} onChange={picked.setSelected} />
        <ClosedSeasonView season={picked.closed} highlight={highlight} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {title}
      <div className="px-2">
        <Segmented
          full
          label="Qué tabla ver"
          options={[
            { key: 'parejas' as Tab, label: doubles ? 'Parejas' : 'Ligas', icon: <Users aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
            { key: 'ranking' as Tab, label: 'Ranking', icon: <Medal aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
            ...(hasNights(sport) ? [{ key: 'noches' as Tab, label: nightsWord, icon: <Moon aria-hidden="true" className="size-4 max-[359px]:hidden" /> }] : []),
          ]}
          value={tab}
          onChange={(k) => go({ ver: k })}
        />
      </div>
      <SeasonBar
        seasons={picked.seasons}
        selected={picked.selected}
        onChange={picked.setSelected}
        action={canShare ? <ShareButton className="shrink-0" card={shareCard} /> : undefined}
      />

      {q.loading && !all.length ? (
        <ListSkeleton rows={5} />
      ) : tab === 'parejas' ? (
        comps.length ? (
          <>
            {comps.length > 1 && <Chips items={comps.map((c) => ({ key: c.key, label: c.name }))} value={comp.key} onChange={(k) => go({ ver: 'parejas', tabla: k })} />}
            <StandingsTable rows={comp.rows} nameOf={names.entrantName} columns={racketColumns(sport)} highlight={highlight} />
            <p className="px-1 text-xs text-muted">{tiebreakText(sport)}</p>
          </>
        ) : (
          <Empty icon={<ListOrdered className="size-8" />} title="Sin tablas todavía">
            Cuando haya una liga de {doubles ? 'parejas' : 'jugadores'} o un torneo con grupos, su tabla sale aquí.
          </Empty>
        )
      ) : tab === 'ranking' ? (
        <>
          {split && (
            <Chips
              items={(['individual', 'dobles'] as const).map((k) => ({ key: k, label: MODALITY_LABEL[k] }))}
              value={modo}
              onChange={(k) => go({ ver: 'ranking', modo: k })}
            />
          )}
          <StandingsTable
            rows={ranking}
            nameOf={names.nameOf}
            columns={rankingColumns}
            highlight={myPlayerId ? [myPlayerId] : []}
            primary={['puntos']}
            onRow={(id) => navigate(`${base}/j/${id}`)}
            empty="Cuando se confirme el primer partido de liga o torneo, sale el ranking."
          />
          <p className="px-1 text-xs text-muted">
            {split ? `${MODALITY_LABEL[modo]}. ` : ''}
            {rankingNote(sport)}
          </p>
        </>
      ) : nights.length ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line">
                <th className="w-10 px-3 py-2 text-left font-medium">#</th>
                <th className="px-2 py-2 text-left font-medium">Jugador</th>
                <th className="px-2 py-2 text-right font-medium" title="Noches">
                  Noches
                </th>
                <th className="px-2 py-2 text-right font-medium" title="Partidos jugados">
                  PJ
                </th>
                <th className="px-2 py-2 text-right font-medium" title="Ganados">
                  G
                </th>
                <th className="hidden px-2 py-2 text-right font-medium sm:table-cell" title="Puntos por partido">
                  Prom.
                </th>
                <th className="px-3 py-2 text-right font-medium">Pts</th>
              </tr>
            </thead>
            <tbody>
              {nights.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`${base}/j/${r.id}`)}
                  className={cx('cursor-pointer border-b border-line last:border-0 hover:bg-surface-2/70', r.id === myPlayerId && 'bg-accent-soft/50')}
                >
                  <td className="px-3 py-2.5">
                    <Position pos={r.rank} />
                  </td>
                  <td className="px-2 py-2.5 font-medium">{names.nameOf(r.id)}</td>
                  <td className="px-2 py-2.5 text-right text-muted tabular-nums">{r.nights}</td>
                  <td className="px-2 py-2.5 text-right text-muted tabular-nums">{r.played}</td>
                  <td className="px-2 py-2.5 text-right text-muted tabular-nums">{r.won}</td>
                  <td className="hidden px-2 py-2.5 text-right text-muted tabular-nums sm:table-cell">{fmtPoints(r.avg)}</td>
                  <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Empty icon={<Moon className="size-8" />} title="Sin noches todavía">
          Los puntos de los americanos y mexicanos de la temporada salen aquí.
        </Empty>
      )}
    </div>
  );
}
