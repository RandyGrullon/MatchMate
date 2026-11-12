import { useLocalSearchParams } from 'expo-router';
import { Globe } from 'lucide-react-native';
import { GolfEventBody } from '@/components/golf/GolfEvent';
import { SwimEventBody } from '@/components/swimming/SwimEvent';
import { EsportsEventBody } from '@/components/esports/EsportsLeague';
import { leagueSport } from '@mm/sports/registry';
import { BackBar, Button, Empty, Loading, Screen } from '@/components/ui';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { TeamEventBody } from '@/components/team/TeamScreens';
import { RacketEventBody } from '@/components/racket/RacketEvent';
import { useLeague } from '@mm/lib/data';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { BowlingEventScreen } from '@/components/bowling/BowlingEvent';

/** El evento: el de raqueta (o el deporte que tenga sus pantallas en la app) o el del boliche. */
export default function EventScreen() {
  const { lid, eventId } = useLocalSearchParams<{ lid: string; eventId: string }>();
  const c = useColors();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  if (league.data && sportFamily(league.data) === 'racket') {
    return (
      <Screen>
        <LeagueScope lid={lid}>
          <BackBar label={league.data.name} fallback={`/l/${lid}`} />
          <RacketEventBody eventId={eventId} />
        </LeagueScope>
      </Screen>
    );
  }
  if (league.data && leagueSport(league.data) === 'golf') {
    return (
      <Screen>
        <LeagueScope lid={lid}>
          <GolfEventBody eventId={eventId} />
        </LeagueScope>
      </Screen>
    );
  }
  if (league.data && leagueSport(league.data) === 'swimming') {
    return (
      <Screen>
        <LeagueScope lid={lid}>
          <SwimEventBody eventId={eventId} />
        </LeagueScope>
      </Screen>
    );
  }
  // Un torneo de esports (trae su barra de atrás y su «•••»).
  if (league.data && leagueSport(league.data) === 'esports') {
    return (
      <Screen>
        <LeagueScope lid={lid}>
          <EsportsEventBody eventId={eventId} />
        </LeagueScope>
      </Screen>
    );
  }
  // Los eventos de equipos: el torneo relámpago (torneo suelto, con su barra y «•••») o la jornada especial.
  if (league.data && sportFamily(league.data) === 'team') {
    return (
      <Screen>
        <LeagueScope lid={lid}>
          <TeamEventBody eventId={eventId} />
        </LeagueScope>
      </Screen>
    );
  }
  // Un deporte que esta versión de la app todavía no conoce (uno nuevo de la web): la web. El boliche, aquí abajo.
  if (league.data && leagueSport(league.data) !== 'bowling') {
    return (
      <Screen>
        <BackBar label={league.data.name} fallback={`/l/${lid}`} />
        <Empty
          title={league.data.name}
          action={
            <Button icon={<Globe size={18} color={c.fg} />} onPress={() => openOnWeb(`/l/${lid}/e/${eventId}`)}>
              Abrir en la web
            </Button>
          }
        />
      </Screen>
    );
  }
  return <BowlingEventScreen lid={lid} eventId={eventId} />;
}
