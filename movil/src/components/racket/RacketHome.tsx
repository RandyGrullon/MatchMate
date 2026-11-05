/**
 * Inicio de la liga de raqueta (Home.tsx de la web, con su misma lógica): lo que está en vivo, mis próximos partidos, y
 * las noches, ligas y torneos en «Próximas fechas» y «Anteriores», como filas con su fecha. Crear un evento («Nuevo»),
 * por ahora en la web. Un torneo sin liga con un solo evento abre directo.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMatches, type Match } from '@mm/lib/data/matches';
import { useRacketEvents, useWithPendingPoints, type RacketEvent } from '@mm/lib/data/racket';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { isNightType, parseNightConfig } from '@mm/pages/sports/racket/logic/night';
import { isPointsMatch, matchTime } from '@mm/pages/sports/racket/logic/results';
import { addDays, timeLabel, todayIn } from '@mm/pages/sports/racket/logic/time';
import { useMySide } from '@mm/pages/sports/racket/match/side';
import { useRacket } from '@mm/pages/sports/racket/sport';
import { eventLine, eventTypeInfo } from '@mm/pages/sports/racket/view';
import { DateBlock } from '../DateBlock';
import { MatchCard } from '../match/MatchCard';
import { Button, Card, Divider, ListRow, LoadError, SectionHeader, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { RacketEventBody } from './RacketEvent';

export const matchRoute = (lid: string, matchId: string) => ({ pathname: '/l/[lid]/partido/[matchId]' as const, params: { lid, matchId } });

export function RacketHome() {
  const c = useColors();
  const { lid, isAdmin, league, myPlayerId } = useLeagueCtx();
  const { side, doubles, ext } = useRacket();
  const events = useRacketEvents(lid);
  const q = useMatches({ lid });
  const matches = useWithPendingPoints(lid, q.data);
  const mySideOf = useMySide();
  const now = useNow().getTime();
  const today = todayIn(league.tz);

  const { upcoming, past } = useMemo(() => {
    const list = events.data;
    // Una noche que sigue abierta pasada la medianoche sigue arriba.
    const yesterday = addDays(today, -1);
    const openNight = (e: RacketEvent) =>
      isNightType(e.type) &&
      e.date >= yesterday &&
      (() => {
        const cfg = parseNightConfig(e.config, e.type);
        return !cfg.closed && cfg.round > 0;
      })();
    const up = list.filter((e) => e.date >= today || openNight(e)).sort((a, b) => a.date.localeCompare(b.date));
    return { upcoming: up, past: list.filter((e) => !up.includes(e)) };
  }, [events.data, today]);

  const live = matches.filter((m) => m.status === 'live').slice(0, 6);
  const mine = myPlayerId
    ? matches
        .filter((m) => (m.status === 'scheduled' || m.status === 'suspended' || m.status === 'postponed') && mySideOf(m) !== null)
        .sort((a, b) => matchTime(a) - matchTime(b))
        .slice(0, 4)
    : [];

  if (league.kind === 'torneo' && events.data.length === 1) return <RacketEventBody eventId={events.data[0].id} />;
  if (events.error) return <LoadError error={events.error} />;

  const matchList = (list: Match[]) => (
    <View style={{ gap: 10 }}>
      {list.map((m) => (
        <MatchCard key={m.id} match={m} mySide={mySideOf(m)} onPress={() => router.push(matchRoute(lid, m.id))} tz={league.tz} now={now} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} />
      ))}
    </View>
  );
  const loading = events.loading && !events.data.length;
  const empty = !loading && !upcoming.length;
  const createText = ext.templates?.length
    ? `Crea ${[...(ext.hideTemplates?.includes('americano') ? [] : ['un americano']), ...ext.templates.map((t) => t.title.toLowerCase())].slice(0, 3).join(', ')} o un torneo.`
    : 'Crea un americano para esta noche, una liga de parejas o un torneo.';

  return (
    <View style={{ gap: 24 }}>
      {live.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="En vivo" />
          {matchList(live)}
        </View>
      )}
      {mine.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Mis próximos partidos" />
          {matchList(mine)}
        </View>
      )}
      <View style={{ gap: 10 }}>
        <SectionHeader
          title="Próximas fechas"
          action={
            isAdmin && !empty ? (
              <Txt variant="bodyStrong" tone="accent" onPress={() => void openOnWeb(`/l/${lid}`)}>
                Nuevo
              </Txt>
            ) : undefined
          }
        />
        {loading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <LogoSpinner size={32} label="Cargando fechas" />
          </View>
        ) : upcoming.length ? (
          <EventList events={upcoming} today={today} side={side} doubles={doubles} />
        ) : (
          <Card style={{ gap: 12 }}>
            <Txt variant="cardTitle">No hay nada próximo</Txt>
            <Txt variant="meta" tone="muted">
              {isAdmin ? createText : 'Cuando el admin cree lo próximo, sale aquí.'}
            </Txt>
            {isAdmin && (
              <Button variant="primary" size="lg" icon={<Plus size={20} color={c.accentFg} />} onPress={() => void openOnWeb(`/l/${lid}`)}>
                Nuevo
              </Button>
            )}
          </Card>
        )}
      </View>
      {past.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Anteriores" />
          <EventList events={past} today={today} side={side} doubles={doubles} />
        </View>
      )}
    </View>
  );
}

/** Las noches, ligas y torneos como filas con su fecha; el de hoy dice «Hoy» en el color del deporte. */
function EventList({ events, today, side, doubles }: { events: RacketEvent[]; today: string; side: readonly [string, string]; doubles: boolean }) {
  const { lid } = useLeagueCtx();
  const { ext } = useRacket();
  return (
    <Card padded={false}>
      {events.map((e, i) => {
        const custom = ext.eventInfo?.(e, side) ?? null;
        const label = custom?.label ?? eventTypeInfo(e.type, doubles).label;
        const line = [label, e.startTime ? timeLabel(e.startTime) : null, custom?.line ?? eventLine(e, side, today)].filter(Boolean).join(' · ');
        return (
          <View key={e.id}>
            {i > 0 && <Divider inset={78} />}
            <ListRow
              icon={<DateBlock date={e.date} />}
              title={e.name || label}
              subtitle={`${e.date === today ? 'Hoy · ' : ''}${line}`}
              onPress={() => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId: e.id } })}
            />
          </View>
        );
      })}
    </Card>
  );
}
