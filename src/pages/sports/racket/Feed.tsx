import { useMemo, useState } from 'react';
import { Swords } from 'lucide-react';
import { awaitingConfirmation, useMatches, type Match } from '../../../lib/data/matches';
import { useWithPendingPoints } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { MatchCard } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { Button, Empty, ListSkeleton, LoadError, Segmented } from '../../../components/ui';
import { Chips, Section } from './bits';
import { isPointsMatch } from './logic/results';
import { MatchDetail, useMatchParam, useMySide } from './match/MatchDetail';
import { hasNights, useRacket } from './sport';
import { feedGroups, type FeedFilter } from './view';

type Filter = FeedFilter;

const PAGE = 20;

/**
 * Partidos de todos (rediseño «Calma y foco»: «‹ Pádel de los jueves» lo pone LeagueShell): el título y, debajo, en
 * vivo, por confirmar, próximos y resultados. Arriba se filtra: «Todos | Míos» (y, en los deportes con noches de puntos,
 * liga y torneos o noches). `?partido=<id>` abre el partido (el push «Tienes un resultado por confirmar» llega aquí).
 */
export default function RacketFeed() {
  const { lid, league, myPlayerId } = useLeagueCtx();
  const { sport, ext } = useRacket();
  const param = useMatchParam();
  const q = useMatches({ lid });
  const all = useWithPendingPoints(lid, q.data);
  const mySideOf = useMySide();
  const now = useNow().getTime();
  const [filter, setFilter] = useState<Filter>('todos');
  const [shown, setShown] = useState(PAGE);
  const pro = useIsPro();

  const groups = useMemo(() => feedGroups(all, filter, mySideOf, now), [all, filter, mySideOf, now]);

  if (param.id) return <MatchDetail matchId={param.id} onBack={param.close} backLabel="Partidos" shellBar />;
  if (q.error) return <LoadError error={q.error} />;

  const card = (m: Match) => <MatchCard key={m.id} match={m} mySide={mySideOf(m)} onClick={() => param.open(m.id)} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} tz={league.tz} now={now} />;
  const empty = !groups.live.length && !groups.toConfirm.length && !groups.upcoming.length && !groups.results.length;
  const toConfirmMine = all.filter((m) => mySideOf(m) !== null && awaitingConfirmation(m, now)).length;
  // Sin noches de puntos, «Liga y torneos» es lo mismo que «Todos»: sale solo con noches.
  const filters = [
    { key: 'todos' as Filter, label: 'Todos' },
    ...(myPlayerId ? [{ key: 'mios' as Filter, label: 'Míos', count: toConfirmMine }] : []),
    ...(hasNights(sport)
      ? [
          { key: 'sets' as Filter, label: 'Liga y torneos' },
          { key: 'noches' as Filter, label: ext.words?.nights ?? 'Noches' },
        ]
      : []),
  ];
  const pick = (k: Filter) => {
    setFilter(k);
    setShown(PAGE);
  };
  const grid = (list: Match[]) => <div className="grid gap-2.5 sm:grid-cols-2">{list.map(card)}</div>;

  return (
    <div className="flex flex-col px-2">
      <h1 className={pro ? 'text-title-pro' : 'text-title'}>Partidos</h1>
      {filters.length > 1 && (
        <div className="mt-4">
          {filters.length <= 3 ? (
            <Segmented
              full
              label="Qué partidos ver"
              options={filters.map((f) => ({ key: f.key, label: f.count ? `${f.label} (${f.count})` : f.label }))}
              value={filter}
              onChange={pick}
            />
          ) : (
            <Chips items={filters} value={filter} onChange={pick} />
          )}
        </div>
      )}
      <div className="mt-[26px] flex flex-col gap-[30px]">
        {q.loading && !all.length ? (
          <ListSkeleton rows={4} />
        ) : empty ? (
          <Empty icon={<Swords className="size-8" />} title="Todavía no hay partidos">
            {filter === 'mios' ? 'Cuando te toque jugar, tus partidos salen aquí.' : hasNights(sport) ? 'Los partidos de las ligas, torneos y noches salen aquí.' : 'Los partidos de las ligas y torneos salen aquí.'}
          </Empty>
        ) : (
          <>
            {groups.live.length > 0 && <Section title="En vivo">{grid(groups.live)}</Section>}
            {groups.toConfirm.length > 0 && <Section title="Por confirmar">{grid(groups.toConfirm)}</Section>}
            {groups.upcoming.length > 0 && <Section title="Próximos">{grid(groups.upcoming.slice(0, shown))}</Section>}
            {groups.results.length > 0 && <Section title="Resultados">{grid(groups.results.slice(0, shown))}</Section>}
            {(groups.results.length > shown || groups.upcoming.length > shown) && (
              <Button variant="quiet" size="lg" className="w-full" onClick={() => setShown(shown + PAGE)}>
                Ver más
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
