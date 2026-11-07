/**
 * Partidos de todos (Feed.tsx de la web, con su misma agrupación: feedGroups de view.ts): en vivo, por confirmar,
 * próximos y resultados. Arriba se filtra: «Todos | Míos» y, en los deportes con noches de puntos, liga y torneos o
 * noches.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Swords } from 'lucide-react-native';
import { awaitingConfirmation, useMatches, type Match } from '@mm/lib/data/matches';
import { useWithPendingPoints } from '@mm/lib/data/racket';
import { useLeagueCtx } from '@mm/lib/league';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { isPointsMatch } from '@mm/pages/sports/racket/logic/results';
import { useMySide } from '@mm/pages/sports/racket/match/side';
import { hasNights, useRacket } from '@mm/pages/sports/racket/sport';
import { feedGroups, type FeedFilter } from '@mm/pages/sports/racket/view';
import { MatchCard } from '../match/MatchCard';
import { Button, Empty, LoadError, Segmented, SectionHeader, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';
import { matchRoute } from './RacketHome';

const PAGE = 20;

export function RacketFeed({ initial = 'todos' }: { initial?: FeedFilter }) {
  const c = useColors();
  const { lid, league, myPlayerId } = useLeagueCtx();
  const { sport, ext } = useRacket();
  const q = useMatches({ lid });
  const all = useWithPendingPoints(lid, q.data);
  const mySideOf = useMySide();
  const now = useNow().getTime();
  const [filter, setFilter] = useState<FeedFilter>(myPlayerId || initial !== 'mios' ? initial : 'todos');
  const [shown, setShown] = useState(PAGE);
  const pro = useIsPro();
  const groups = useMemo(() => feedGroups(all, filter, mySideOf, now), [all, filter, mySideOf, now]);

  if (q.error) return <LoadError error={q.error} />;
  const toConfirmMine = all.filter((m) => mySideOf(m) !== null && awaitingConfirmation(m, now)).length;
  const filters = [
    { key: 'todos' as FeedFilter, label: 'Todos' },
    ...(myPlayerId ? [{ key: 'mios' as FeedFilter, label: toConfirmMine ? `Míos (${toConfirmMine})` : 'Míos' }] : []),
    ...(hasNights(sport)
      ? [
          { key: 'sets' as FeedFilter, label: 'Liga y torneos' },
          { key: 'noches' as FeedFilter, label: ext.words?.nights ?? 'Noches' },
        ]
      : []),
  ];
  const pick = (k: FeedFilter) => {
    setFilter(k);
    setShown(PAGE);
  };
  const list = (ms: Match[]) => (
    <View style={{ gap: 10 }}>
      {ms.map((m) => (
        <MatchCard key={m.id} match={m} mySide={mySideOf(m)} onPress={() => router.push(matchRoute(lid, m.id))} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} tz={league.tz} now={now} />
      ))}
    </View>
  );
  const empty = !groups.live.length && !groups.toConfirm.length && !groups.upcoming.length && !groups.results.length;

  return (
    <View style={{ gap: 20 }}>
      {/* En Pro, el título más chico (text-title-pro de la web). */}
      <Txt variant="title" style={pro ? { fontSize: 28, lineHeight: 34 } : undefined}>
        Partidos
      </Txt>
      {filters.length > 1 &&
        (filters.length <= 3 ? (
          <Segmented<FeedFilter> label="Qué partidos ver" value={filter} onChange={pick} options={filters} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {filters.map((f) => (
              <Button key={f.key} variant={f.key === filter ? 'soft' : 'quiet'} onPress={() => pick(f.key)}>
                {f.label}
              </Button>
            ))}
          </ScrollView>
        ))}
      {q.loading && !all.length ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <LogoSpinner size={32} label="Cargando partidos" />
        </View>
      ) : empty ? (
        <Empty
          icon={<Swords size={28} color={c.accent} />}
          title="Todavía no hay partidos"
          text={filter === 'mios' ? 'Cuando te toque jugar, tus partidos salen aquí.' : hasNights(sport) ? 'Los partidos de las ligas, torneos y noches salen aquí.' : 'Los partidos de las ligas y torneos salen aquí.'}
        />
      ) : (
        <>
          {groups.live.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title="En vivo" />
              {list(groups.live)}
            </View>
          )}
          {groups.toConfirm.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Por confirmar" />
              {list(groups.toConfirm)}
            </View>
          )}
          {groups.upcoming.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Próximos" />
              {list(groups.upcoming.slice(0, shown))}
            </View>
          )}
          {groups.results.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Resultados" />
              {list(groups.results.slice(0, shown))}
            </View>
          )}
          {(groups.results.length > shown || groups.upcoming.length > shown) && (
            <Button size="lg" full onPress={() => setShown(shown + PAGE)}>
              Ver más
            </Button>
          )}
        </>
      )}
    </View>
  );
}
