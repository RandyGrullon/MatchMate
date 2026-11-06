import { View } from 'react-native';
import { Redirect } from 'expo-router';
import type { CalendarItem, NextMatchInfo } from '@mm/lib/calendar';
import type { Match } from '@mm/lib/data/matches';
import type { LiveMatchItem } from '@mm/lib/live';
import type { League } from '@mm/lib/types';
import { toIsoDate } from '@mm/lib/format';
import { IdleCard, LiveMatchesCard, NextMatchCard, NextUpCard, UpNext } from '@/components/home/Activity';
import { Screen, SectionHeader } from '@/components/ui';

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
};
const TODAY = day(0);
const LEAGUE = { id: 'prueba', name: 'Liga de Ejemplo', sport: 'padel', kind: 'liga', venue: 'Club de Ejemplo' } as unknown as League;
const item = (n: number, over: Partial<CalendarItem>): CalendarItem => ({
  key: `k${n}`,
  kind: 'event',
  date: day(n),
  lid: 'prueba',
  leagueName: 'Liga de Ejemplo',
  sport: 'bowling',
  type: 'practica',
  name: 'Práctica',
  time: '7:00 pm',
  minutes: 19 * 60,
  eventId: `e${n}`,
  playerId: 'p1',
  going: false,
  href: '/l/prueba',
  matchId: null,
  ...over,
});
const UPCOMING = [
  item(1, { going: true }),
  item(3, { kind: 'match', sport: 'padel', type: 'partido', name: 'vs. Otra / Nuevo', eventId: null, matchId: 'm1', detail: 'Jornada 3 · Cancha 2' }),
  item(6, { type: 'torneo', name: 'Torneo de Ejemplo' }),
];
const MATCH = { id: 'm1', leagueId: 'prueba' } as unknown as Match;
const NEXT: NextMatchInfo<Match> = {
  match: MATCH,
  league: LEAGUE,
  sport: 'padel',
  href: '/l/prueba',
  title: 'vs. Otra / Nuevo',
  detail: 'Jornada 3 · Cancha 2',
  date: TODAY,
  dayLabel: 'Hoy',
  time: '8:00 pm',
  minutesLeft: 45,
  more: 2,
} as NextMatchInfo<Match>;
const LIVE: LiveMatchItem<Match>[] = [
  { match: MATCH, league: LEAGUE, sport: 'padel', href: '/l/prueba', mine: true, title: 'Ana / Luis vs. Otra / Nuevo', score: '6-4 3-2', detail: 'Cancha 2' },
];

/**
 * Solo en desarrollo: las tarjetas de Hoy con datos ficticios (en la vista previa web, sin cuenta): partidos en vivo,
 * tu próximo partido, lo próximo con «Voy», «Nada programado» y «Lo que viene». En la app publicada lleva a Hoy.
 */
export default function DevHoy() {
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen>
      <SectionHeader title="En vivo" />
      <LiveMatchesCard items={LIVE} />
      <SectionHeader title="Tu próximo partido" />
      <NextMatchCard next={NEXT} />
      <SectionHeader title="Lo próximo" />
      <View style={{ gap: 14 }}>
        <NextUpCard item={item(0, { eventId: null })} today={TODAY} />
        <NextUpCard item={item(2, {})} today={TODAY} />
        <IdleCard />
      </View>
      <UpNext items={UPCOMING} today={TODAY} showLeague />
    </Screen>
  );
}
