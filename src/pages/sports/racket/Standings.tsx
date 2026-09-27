import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ListOrdered, Medal, Moon, Users } from 'lucide-react';
import { useMatches, type Match } from '../../../lib/data/matches';
import { useRacketEvents, useWithPendingPoints, type RacketEvent } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import type { StandingRow } from '../../../sports/types';
import { StandingsTable, type StandingsColumn } from '../../../components/match';
import { Card, Empty, ListSkeleton, LoadError, Position, Tabs, cx } from '../../../components/ui';
import { Chips, racketColumns } from './bits';
import { parseLeagueConfig } from './logic/league';
import { fmtPoints } from './logic/night';
import { byModality, MODALITY_LABEL, type Modality } from './logic/modality';
import { inSeason, isSetsMatch, pairStandings, seasonDay, seasonNightTable, seasonPlayerTable, winPct } from './logic/results';
import { rankingNote, tiebreakText } from './logic/tiebreaks';
import { groupStage, groupTables, parseTourneyConfig } from './logic/tourney';
import { useNames } from './names';
import { hasNights, useRacket } from './sport';

type Tab = 'parejas' | 'ranking' | 'noches';

interface Competition {
  key: string;
  name: string;
  rows: StandingRow[];
}

/** Tablas de las ligas de parejas y de los grupos de los torneos. */
function competitions(sport: Parameters<typeof pairStandings>[0], events: readonly RacketEvent[], matches: readonly Match[], now: number): Competition[] {
  const out: Competition[] = [];
  for (const e of events) {
    const list = matches.filter((m) => m.eventId === e.id);
    if (e.type === 'liga') {
      const cfg = parseLeagueConfig(e.config, e.date);
      if (cfg.pairs.length && list.length) out.push({ key: e.id, name: e.name || 'Liga', rows: pairStandings(sport, cfg.pairs, list, { scheme: cfg.points, lotSeed: e.id, now }) });
    } else if (e.type === 'torneo') {
      const cfg = parseTourneyConfig(e.config);
      for (const c of cfg.categories) {
        groupTables(sport, c, list, { scheme: cfg.points, now }).forEach((rows, g) => out.push({ key: `${e.id}:${c.id}:${g}`, name: `${e.name || 'Torneo'} · ${groupStage(c, g)}`, rows }));
      }
    }
  }
  return out;
}

/**
 * Tabla de la temporada: las tablas de las ligas de parejas (y de los grupos de los torneos), el ranking
 * individual con los partidos a sets y las noches de americano y mexicano.
 */
export default function RacketStandings() {
  const { lid, base, league, myPlayerId } = useLeagueCtx();
  const { sport, doubles, ext } = useRacket();
  const names = useNames();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const now = useNow().getTime();
  const events = useRacketEvents(lid);
  const q = useMatches({ lid });
  const all = useWithPendingPoints(lid, q.data);
  const hasSeason = !!(league.seasonStart || league.seasonEnd);
  const [whole, setWhole] = useState(false);
  const nightsWord = ext.words?.nights ?? 'Noches';

  const eventDays = useMemo(() => new Map(events.data.map((e) => [e.id, { date: e.date, type: e.type }] as const)), [events.data]);
  const matches = useMemo(
    () => (whole || !hasSeason ? all : all.filter((m) => inSeason(league, seasonDay(m, eventDays, league.tz)))),
    [all, whole, hasSeason, league, eventDays],
  );
  const comps = useMemo(
    () => [...competitions(sport, events.data, matches, now), ...(ext.competitions?.(events.data, matches, now) ?? [])],
    [sport, events.data, matches, now, ext],
  );
  // Individual y dobles van por separado (tenis y pickleball pueden tener de los dos en la misma liga).
  const kinds = useMemo(() => byModality(matches.filter(isSetsMatch), names.rosterOf), [matches, names]);
  const split = kinds.individual.length > 0 && kinds.dobles.length > 0;
  const modo: Modality = search.get('modo') === 'dobles' ? 'dobles' : search.get('modo') === 'individual' ? 'individual' : kinds.dobles.length > kinds.individual.length ? 'dobles' : 'individual';
  const ranking = useMemo(
    () => seasonPlayerTable(split ? kinds[modo] : matches, { sport, rosterOf: names.rosterOf, lotSeed: lid, now }),
    [split, kinds, modo, matches, sport, names, lid, now],
  );
  const nights = useMemo(() => seasonNightTable(matches, { now }), [matches, now]);

  const tab: Tab = (search.get('ver') as Tab | null) ?? (comps.length ? 'parejas' : ranking.length ? 'ranking' : nights.length ? 'noches' : 'parejas');
  const compKey = search.get('tabla') ?? comps[0]?.key;
  const comp = comps.find((c) => c.key === compKey) ?? comps[0];
  const highlight = [...(myPlayerId ? [myPlayerId] : []), ...names.teamsOf(myPlayerId)];

  if (q.error) return <LoadError error={q.error} />;

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          { key: 'parejas' as Tab, label: doubles ? 'Parejas' : 'Ligas', icon: <Users className="size-4" /> },
          { key: 'ranking' as Tab, label: 'Ranking', icon: <Medal className="size-4" /> },
          ...(hasNights(sport) ? [{ key: 'noches' as Tab, label: nightsWord, icon: <Moon className="size-4" /> }] : []),
        ]}
        active={tab}
        onChange={(k) => setSearch({ ver: k }, { replace: true })}
      />
      {hasSeason && (
        <Chips
          items={[
            { key: 'temporada', label: 'Esta temporada' },
            { key: 'todo', label: 'Todo' },
          ]}
          value={whole ? 'todo' : 'temporada'}
          onChange={(k) => setWhole(k === 'todo')}
        />
      )}

      {q.loading && !all.length ? (
        <ListSkeleton rows={5} />
      ) : tab === 'parejas' ? (
        comps.length ? (
          <>
            {comps.length > 1 && <Chips items={comps.map((c) => ({ key: c.key, label: c.name }))} value={comp.key} onChange={(k) => setSearch({ ver: 'parejas', tabla: k }, { replace: true })} />}
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
              onChange={(k) => setSearch({ ver: 'ranking', modo: k }, { replace: true })}
            />
          )}
          <StandingsTable
            rows={ranking}
            nameOf={names.nameOf}
            columns={[
              ...racketColumns(sport).slice(0, 4),
              { key: 'pct', label: '% G', title: 'Porcentaje de victorias', value: (r) => `${winPct(r.won, r.played) ?? 0}%`, wide: true } satisfies StandingsColumn,
              racketColumns(sport)[6],
            ]}
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
