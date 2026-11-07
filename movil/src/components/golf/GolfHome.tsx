import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Flag, LandPlot, PencilLine } from 'lucide-react-native';
import { useEvents } from '@mm/lib/data';
import { useGolfCourses, useGolfEvent, useGolfRounds, useGolfTournaments, type GolfRoundDoc } from '@mm/lib/data/golf';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { eventLabel, toIsoDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { formatTime } from '@mm/lib/schedule';
import { currentSeason } from '@mm/lib/seasons';
import type { BowlingEvent } from '@mm/lib/types';
import { useNow } from '@mm/lib/useNow';
import { scoreRound } from '@mm/sports/golf/scoring';
import { weekdayLabel } from '@mm/components/home/logic';
import { groupOrder, mergeCard, nextGroupHole, useCourtLog } from '@mm/pages/sports/golf/courtLog';
import { golfNow, meritTop, scoreText } from '@mm/pages/sports/golf/home';
import { cardHoles, formatLabel, golfRoundOf, holesDone, isComplete, nineLabel, startIndex } from '@mm/pages/sports/golf/logic';
import { useGolfMerit } from '@mm/pages/sports/golf/seasonTable';
import { GolfEventBody } from './GolfEvent';
import { RoundForm } from './RoundForm';
import { SectionAdd, openCourses, openGolfer, openRound } from './parts';
import { DateBlock } from '@/components/DateBlock';
import { Button, Card, Empty, ListRow, LoadError, Loading, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Resultados que se ven antes de «Ver las N» (ShowMore de la web). */
const SHOWN = 3;

/**
 * Inicio de la liga de golf (GolfHome de la web, Lite): la ronda de hoy una sola vez, con lo tuyo en una línea y UN
 * botón («Seguir en el hoyo 8», «Inscribirme»); el orden de mérito (los 3 de arriba, con tu lugar) y «Ver toda»;
 * «Próximas rondas» (para el admin, «+ Nueva»; sin nada próximo, «Nueva ronda o torneo») y «Resultados». Sin campo
 * todavía, primero «Agregar el campo» (Organizar › Campos). Un torneo sin liga con una sola ronda abre la ronda.
 */
export function GolfHome() {
  const c = useColors();
  const { lid, isAdmin, league } = useLeagueCtx();
  const events = useEvents(lid);
  const rounds = useGolfRounds(lid);
  const courses = useGolfCourses(lid);
  const tournaments = useGolfTournaments(lid);
  const today = toIsoDate(useNow());
  const [allPast, setAllPast] = useState(false);
  const [creating, setCreating] = useState(false);
  const byEvent = useMemo(() => new Map(rounds.data.map((r) => [r.eventId, r] as const)), [rounds.data]);
  if (events.error) return <LoadError error={events.error} />;
  if (events.loading && !events.data.length) return <Loading label="Cargando las rondas" />;
  const upcoming = events.data.filter((e) => e.date >= today && !byEvent.get(e.id)?.closed).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.data.filter((e) => !upcoming.includes(e)).sort((a, b) => b.date.localeCompare(a.date));
  const tournamentName = (id: string | null) => (id ? tournaments.data.find((t) => t.id === id)?.name : null);
  const now = upcoming.find((e) => e.date === today) ?? null;
  const next = upcoming.filter((e) => e !== now);
  const noCourse = isAdmin && !courses.loading && !courses.data.length;
  const canCreate = isAdmin && courses.data.length > 0;

  // Un torneo sin liga con una sola ronda muestra la ronda directo.
  if (league.kind === 'torneo' && events.data.length === 1) return <GolfEventBody eventId={events.data[0].id} embedded />;

  return (
    <View style={{ gap: 26 }}>
      {now && <TodayRound event={now} />}
      {noCourse && (
        <Empty
          icon={<LandPlot size={28} color={c.accent} />}
          title="Primero, el campo"
          text="El par y el SI de cada hoyo, y el rating y slope de cada salida."
          action={
            <Button variant="primary" size="lg" icon={<LandPlot size={20} color={c.accentFg} />} onPress={() => openCourses(lid)}>
              Agregar el campo
            </Button>
          }
        />
      )}
      <MeritTop />
      <View style={{ gap: 10 }}>
        <SectionHeader title="Próximas rondas" action={canCreate && (next.length > 0 || now) ? <SectionAdd label="Nueva" onPress={() => setCreating(true)} /> : undefined} />
        {next.length ? (
          <RoundList events={next} byEvent={byEvent} today={today} tournamentName={tournamentName} />
        ) : now ? (
          <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
            No hay más rondas por ahora.
          </Txt>
        ) : (
          <Empty
            icon={<Flag size={28} color={c.accent} />}
            title="No hay rondas próximas"
            text={isAdmin ? 'Crea la próxima ronda o un torneo de varias rondas.' : 'Cuando el admin cree la próxima ronda, sale aquí para inscribirte.'}
            action={
              canCreate ? (
                <Button variant="primary" size="lg" icon={<PencilLine size={20} color={c.accentFg} />} onPress={() => setCreating(true)}>
                  Nueva ronda o torneo
                </Button>
              ) : undefined
            }
          />
        )}
      </View>
      {past.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Resultados" />
          <RoundList events={allPast ? past : past.slice(0, SHOWN)} byEvent={byEvent} today={today} tournamentName={tournamentName} />
          {past.length > SHOWN && <Button onPress={() => setAllPast((v) => !v)}>{allPast ? 'Ver menos' : `Ver las ${past.length} rondas`}</Button>}
        </View>
      )}
      {isAdmin && <RoundForm open={creating} onClose={() => setCreating(false)} />}
    </View>
  );
}

/** La ronda de hoy (TodayRound de la web): «En juego ahora · 6 jugando», el nombre, lo tuyo y UN botón. */
function TodayRound({ event }: { event: BowlingEvent }) {
  const c = useColors();
  const { lid, isAdmin, member, myPlayerId } = useLeagueCtx();
  const golf = useGolfEvent(lid, event.id);
  const [log] = useCourtLog(event.id);
  const round = golf.data.round;
  const cards = useMemo(() => golf.data.cards.map((x) => mergeCard(x, log)), [golf.data.cards, log]);
  const card = myPlayerId ? (cards.find((x) => x.playerId === myPlayerId) ?? null) : null;
  const playing = cards.filter((x) => holesDone(x) > 0).length;
  const title = eventLabel({ type: event.type, name: event.name, date: event.date }, 'golf');
  const start = event.startTime ? formatTime(event.startTime.slice(0, 5)) : '';
  const when = playing ? 'En juego ahora' : start ? `Hoy · sale a las ${start}` : 'Hoy';
  let state = null;
  if (round && card) {
    const order = groupOrder(card.strokes.length, startIndex(round, card.startHole));
    const nx = nextGroupHole([card], order);
    state = {
      holes: holesDone(card),
      complete: isComplete(card),
      signed: card.signed,
      score: scoreText(scoreRound(golfRoundOf(round, card), round.competition), round.competition),
      nextHole: nx != null ? (cardHoles(round, card.teeId)[nx]?.number ?? nx + 1) : null,
    };
  }
  const { line, action } = golfNow({ mine: state, hasCourse: !!round, staff: isAdmin || !!member?.scorer, member: !!member });
  const ready = !golf.loading || !!round;
  return (
    <Card style={{ gap: 12, backgroundColor: c.accentSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
          <Txt tone="accent" numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 14 }}>
            {when}
          </Txt>
        </View>
        {cards.length > 0 && <Txt tone="fg2" style={{ fontSize: 14 }}>{playing ? `${playing} jugando` : `${cards.length} inscritos`}</Txt>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}: cómo van`} onPress={() => openRound(lid, event.id)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Txt numberOfLines={1} style={{ flex: 1, fontFamily: font.bold, fontSize: 21 }}>
            {title}
          </Txt>
          <ChevronRight size={20} color={c.accent} />
        </View>
        {ready && (
          <Txt tone="fg2" style={{ fontSize: 14.5, marginTop: 3 }}>
            {line}
          </Txt>
        )}
      </Pressable>
      {ready && action && (
        <Button variant="primary" size="xl" full onPress={() => openRound(lid, event.id, action.tab)}>
          {action.label}
        </Button>
      )}
    </Card>
  );
}

/** Las rondas como filas con su fecha: cuándo, el campo y el formato, y cuántos van. */
function RoundList({
  events,
  byEvent,
  today,
  tournamentName,
}: {
  events: readonly BowlingEvent[];
  byEvent: Map<string, GolfRoundDoc>;
  today: string;
  tournamentName: (id: string | null) => string | null | undefined;
}) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const oneCourse = new Set([...byEvent.values()].map((r) => r.courseId)).size <= 1;
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {events.map((e, i) => {
        const r = byEvent.get(e.id);
        const t = tournamentName(r?.tournamentId ?? null);
        const name = eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf');
        const ahead = e.date >= today;
        const time = ahead && e.startTime ? formatTime(e.startTime.slice(0, 5)) : '';
        const line = [
          ahead ? weekdayLabel(e.date, today) : null,
          time || null,
          t && !name.startsWith(t) ? t : null,
          r ? [oneCourse ? null : r.courseName, r.nine === 'all' ? null : nineLabel(r.nine, r.holes), formatLabel(r.competition)].filter(Boolean).join(' · ') : 'Falta elegir el campo',
          ahead && e.playerCount ? `${e.playerCount} inscritos` : null,
          !ahead && r && !r.closed ? 'sin cerrar' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <View key={e.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
            <ListRow icon={<DateBlock date={e.date} />} title={name} subtitle={line} onPress={() => openRound(lid, e.id)} />
          </View>
        );
      })}
    </Card>
  );
}

/** «Orden de mérito · Ver toda»: los 3 de arriba de la temporada de ahora (tu fila resaltada). */
function MeritTop() {
  const c = useColors();
  const { lid, myPlayerId } = useLeagueCtx();
  const seasons = useLeagueSeasons(lid);
  const { merit, players } = useGolfMerit(currentSeason(seasons.data));
  const rows = useMemo(() => meritTop(merit, myPlayerId), [merit, myPlayerId]);
  if (!rows.length) return null;
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title="Orden de mérito"
        action={
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/l/[lid]/tabla', params: { lid } })} hitSlop={8}>
            <Txt tone="accent" variant="bodyStrong">
              Ver toda
            </Txt>
          </Pressable>
        }
      />
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {rows.map(({ row, me }, i) => (
          <View key={row.id} style={[{ backgroundColor: me ? c.accentSoft : 'transparent' }, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
            <ListRow
              chevron={false}
              icon={<Txt style={{ width: 22, textAlign: 'center', fontFamily: font.bold, color: me ? c.accent : c.muted }}>{row.rank}</Txt>}
              title={`${nameOf(row.id)}${me ? ' · Tú' : ''}`}
              right={<Txt style={{ fontFamily: font.bold, fontSize: 20 }}>{row.points.toLocaleString('es-DO')}</Txt>}
              onPress={() => openGolfer(lid, row.id)}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}
