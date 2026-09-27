import { useMemo, useState } from 'react';
import { Swords } from 'lucide-react';
import { awaitingConfirmation, hasResult, useMatches, type Match } from '../../../lib/data/matches';
import { useWithPendingPoints } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { MatchCard } from '../../../components/match';
import { Button, Empty, ListSkeleton, LoadError } from '../../../components/ui';
import { Chips, Section } from './bits';
import { isPointsMatch, matchTime } from './logic/results';
import { MatchDetail, useMatchParam, useMySide } from './match/MatchDetail';
import { hasNights, useRacket } from './sport';

type Filter = 'todos' | 'mios' | 'sets' | 'noches';

const PAGE = 20;

/**
 * Partidos de todos (pestaña «Partidos»): en vivo, por confirmar, próximos y resultados. `?partido=<id>` abre el
 * partido (el push «Tienes un resultado por confirmar» llega aquí).
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

  const groups = useMemo(() => {
    const list = all.filter((m) => {
      if (filter === 'mios') return mySideOf(m) !== null;
      if (filter === 'sets') return !isPointsMatch(m);
      if (filter === 'noches') return isPointsMatch(m);
      return true;
    });
    const live = list.filter((m) => m.status === 'live');
    const toConfirm = list.filter((m) => awaitingConfirmation(m, now) || m.status === 'disputed');
    const upcoming = list
      .filter((m) => m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended')
      .sort((a, b) => matchTime(a) - matchTime(b));
    const results = list.filter((m) => hasResult(m) && !toConfirm.includes(m)).sort((a, b) => matchTime(b) - matchTime(a));
    return { live, toConfirm, upcoming, results };
  }, [all, filter, mySideOf, now]);

  if (param.id) return <MatchDetail matchId={param.id} onBack={param.close} />;
  if (q.error) return <LoadError error={q.error} />;

  const card = (m: Match) => <MatchCard key={m.id} match={m} mySide={mySideOf(m)} onClick={() => param.open(m.id)} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} tz={league.tz} now={now} />;
  const empty = !groups.live.length && !groups.toConfirm.length && !groups.upcoming.length && !groups.results.length;

  return (
    <div className="flex flex-col gap-5">
      <Chips
        items={[
          { key: 'todos', label: 'Todos' },
          ...(myPlayerId ? [{ key: 'mios' as const, label: 'Míos', count: all.filter((m) => mySideOf(m) !== null && awaitingConfirmation(m, now)).length }] : []),
          { key: 'sets', label: 'Liga y torneos' },
          ...(hasNights(sport) ? [{ key: 'noches' as const, label: ext.words?.nights ?? 'Noches' }] : []),
        ]}
        value={filter}
        onChange={(k) => {
          setFilter(k);
          setShown(PAGE);
        }}
      />
      {q.loading && !all.length ? (
        <ListSkeleton rows={4} />
      ) : empty ? (
        <Empty icon={<Swords className="size-8" />} title="Todavía no hay partidos">
          {filter === 'mios' ? 'Cuando te toque jugar, tus partidos salen aquí.' : hasNights(sport) ? 'Los partidos de las ligas, torneos y noches salen aquí.' : 'Los partidos de las ligas y torneos salen aquí.'}
        </Empty>
      ) : (
        <>
          {groups.live.length > 0 && (
            <Section title="En vivo">
              <div className="grid gap-2 sm:grid-cols-2">{groups.live.map(card)}</div>
            </Section>
          )}
          {groups.toConfirm.length > 0 && (
            <Section title="Por confirmar">
              <div className="grid gap-2 sm:grid-cols-2">{groups.toConfirm.map(card)}</div>
            </Section>
          )}
          {groups.upcoming.length > 0 && (
            <Section title="Próximos">
              <div className="grid gap-2 sm:grid-cols-2">{groups.upcoming.slice(0, shown).map(card)}</div>
            </Section>
          )}
          {groups.results.length > 0 && (
            <Section title="Resultados">
              <div className="grid gap-2 sm:grid-cols-2">{groups.results.slice(0, shown).map(card)}</div>
            </Section>
          )}
          {(groups.results.length > shown || groups.upcoming.length > shown) && (
            <Button className="h-11 self-center" onClick={() => setShown(shown + PAGE)}>
              Ver más
            </Button>
          )}
        </>
      )}
    </div>
  );
}
