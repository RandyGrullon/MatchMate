import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowRight, CalendarClock } from 'lucide-react-native';
import { openPractice, setRsvp } from '@mm/lib/data/events';
import type { Match } from '@mm/lib/data/matches';
import { startsInText, type CalendarItem, type NextMatchInfo } from '@mm/lib/calendar';
import { isPlannedEvent, type LiveGame, type LiveMatchItem } from '@mm/lib/live';
import { formatTime } from '@mm/lib/schedule';
import { nextGameLabel, sheetPath, useNextGame, type NextGame } from '@mm/lib/useNextGame';
import { LATE_WHEN, lateTitle, openPracticeErrorText, todayTitle, upNextSubtitle, weekdayLabel } from '@mm/components/home/logic';
import { sportMeta } from '@mm/sports/registry';
import { DateBlock } from '@/components/DateBlock';
import { toast } from '@/components/feedback';
import { Badge, Button, Card, SectionHeader, Txt } from '@/components/ui';
import { useMyLane } from '@/components/bowling/LaneChip';
import { openLink } from '@/lib/links';
import { TodayCardPro } from './ProSections';
import { useColors } from '@/theme/theme';

/** Fechas que se ven en «Lo que viene» (UP_NEXT_SHOWN de la web). */
const UP_NEXT_SHOWN = 3;

/** ¿Se puede confirmar «Voy»? (prácticas del boliche ya creadas, con jugador; canRsvp de la web). */
export const canRsvp = (it: CalendarItem) => it.kind === 'event' && it.sport === 'bowling' && it.type === 'practica' && !!it.eventId && !!it.playerId;

async function toggleRsvp(it: CalendarItem, going: boolean) {
  try {
    await setRsvp(it.lid, it.eventId!, it.playerId!, going);
    toast(going ? 'Confirmado: vas' : 'Listo, ya no vas');
  } catch {
    toast('No se pudo guardar. Inténtalo otra vez.', 'error');
  }
}

/** Abre el editor del juego que toca o, si no, el evento (la hoja de anotar de la app). */
function openNext(lid: string, eventId: string, next: NextGame) {
  if (next.kind === 'anotar' || next.kind === 'medias') {
    router.push({ pathname: '/l/[lid]/e/[eventId]/anotar', params: { lid, eventId, juego: String(next.game) } });
    return;
  }
  router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId } });
}

/**
 * La práctica o el torneo de boliche que se juega hoy (TodayCard de la web): «En juego ahora» (o a qué hora empieza),
 * el título, liga · bolera y UN botón (useNextGame: «Seguir mi juego 3», «Anotar juego 1», «Enviar mis juegos»). La
 * práctica del horario sin evento se abre al tocar (openPractice). La de anoche: «Cierra hoy».
 */
export function TodayGameCard({ game, today, pro = false }: { game: LiveGame; today: string; pro?: boolean }) {
  const c = useColors();
  const { feed, league, event, info, late } = game;
  const planned = isPlannedEvent(event);
  const day = game.today ?? today;
  const mine = useNextGame(game, today);
  const [busy, setBusy] = useState(false);
  const lane = useMyLane(feed.lid, planned || late ? null : event.id, feed.playerId);
  const title = late ? lateTitle(mine?.next) : todayTitle(event, day);
  const when = late ? LATE_WHEN : info.startsSoon && info.startLabel ? `Empieza a las ${info.startLabel}` : 'En juego ahora';
  const start = late ? null : (info.startLabel ?? (event.startTime ? formatTime(event.startTime.slice(0, 5)) || null : null));
  // «Liga · bolera · 7:30 pm · Pista 7» (sin hora ni pista, lo que haya).
  const meta = [league.kind !== 'torneo' ? league.name : null, league.venue?.trim() || null, !info.startsSoon ? start : null, lane != null ? `Pista ${lane}` : null]
    .filter(Boolean)
    .join(' · ');

  // La de anoche ya no tiene nada que hacer: no ocupa Hoy.
  if (late && mine && !mine.loading && mine.next.kind === 'ver') return null;

  // `next`: lo que hace el botón (el principal o, en Pro, «Planilla»).
  async function act(next: NextGame) {
    if (planned && (next.kind === 'anotar' || next.kind === 'planilla')) {
      setBusy(true);
      try {
        const id = await openPractice(feed.lid, event.date);
        // Quien anota los de todos va a la planilla de la práctica que se acaba de abrir (goToPractice de la web).
        if (next.kind === 'planilla') openLink(sheetPath(feed.lid, id));
        else openNext(feed.lid, id, next);
      } catch (e) {
        toast(openPracticeErrorText(e, event.date === today), 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (next.kind === 'planilla' || next.kind === 'preparar') openLink(next.to);
    else openNext(feed.lid, event.id, next);
  }

  // Pro: la tarjeta más densa (J1 J2 J3 Serie, «Seguir juego 3» y «Planilla» al lado), en ProSections.tsx.
  if (pro) return <TodayCardPro game={game} title={title} lane={lane} mine={mine} busy={busy} onAct={(next) => void act(next)} />;

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.liveDot, { backgroundColor: c.accent }]} />
        <Txt variant="bodyStrong" tone="accent" style={{ fontSize: 14 }}>
          {when}
        </Txt>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${meta}`}
        onPress={() => (planned ? undefined : router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid: feed.lid, eventId: event.id } }))}
      >
        <Txt variant="cardTitle">{title}</Txt>
        {!!meta && (
          <Txt variant="meta" tone="muted" numberOfLines={1}>
            {meta}
          </Txt>
        )}
      </Pressable>
      {mine && (
        <Button variant="primary" size="xl" full loading={busy} disabled={busy} onPress={() => void act(mine.next)}>
          {nextGameLabel(mine.next)}
        </Button>
      )}
    </Card>
  );
}

/** Los partidos en vivo de tus ligas (LiveMatchesCard): el tuyo primero, con el marcador. */
export function LiveMatchesCard({ items }: { items: readonly LiveMatchItem<Match>[] }) {
  const c = useColors();
  if (!items.length) return null;
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
        <View style={[styles.liveDot, { backgroundColor: c.accent }]} />
        <Txt variant="bodyStrong" tone="accent" style={{ fontSize: 14 }}>
          En vivo
        </Txt>
      </View>
      {items.map((it, i) => (
        <Pressable
          key={it.match.id}
          accessibilityRole="button"
          accessibilityLabel={[it.title, it.score, it.league.name, it.detail, it.mine ? 'Tu partido' : null].filter(Boolean).join('. ')}
          onPress={() => openLink(it.href)}
          style={({ pressed }) => [
            styles.matchRow,
            { backgroundColor: pressed ? c.surface2 : 'transparent' },
            i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null,
          ]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
              {it.title}
            </Txt>
            <Txt variant="meta" tone="muted" numberOfLines={1}>
              {[it.league.name, it.detail].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            {!!it.score && (
              <Txt variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                {it.score}
              </Txt>
            )}
            {it.mine && <Badge>Tu partido</Badge>}
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

/** «Tienes 2 partidos más en los próximos 7 días». */
const moreText = (n: number) => `Tienes ${n} ${n === 1 ? 'partido más' : 'partidos más'} en los próximos 7 días.`;

/** «Tu próximo partido» (NextMatchCard de la web): contra quién, la liga, dónde, el día y la hora. */
export function NextMatchCard({ next }: { next: NextMatchInfo<Match> }) {
  const c = useColors();
  const soon = startsInText(next.minutesLeft);
  const where = [next.league.name, next.detail].filter(Boolean).join(' · ');
  const Icon = sportMeta(next.sport)?.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tu próximo partido: ${next.title}, ${next.dayLabel} a las ${next.time}, ${where}`}
      onPress={() => openLink(next.href)}
      style={({ pressed }) => [styles.nextMatch, { backgroundColor: c.surface, borderColor: c.accentSoft, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CalendarClock size={16} color={c.accent} />
        <Txt tone="accent" style={{ fontSize: 12, fontWeight: '500', flex: 1 }}>
          Tu próximo partido
        </Txt>
        {!!soon && <Badge tone={next.minutesLeft <= 60 ? 'warn' : 'accent'}>{soon}</Badge>}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={[styles.sportMark, { backgroundColor: c.accent }]}>{Icon ? <Icon size={20} color={c.accentFg} /> : null}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {next.title}
          </Txt>
          <Txt variant="meta" tone="muted" numberOfLines={1}>
            {where}
          </Txt>
        </View>
        <ArrowRight size={20} color={c.accent} />
      </View>
      <Txt variant="meta">
        <Txt variant="meta" style={{ fontWeight: '600' }}>
          {next.dayLabel}
        </Txt>
        {` · ${next.time}`}
      </Txt>
      {next.more > 0 && (
        <Txt tone="muted" style={{ fontSize: 12 }}>
          {moreText(next.more)}
        </Txt>
      )}
    </Pressable>
  );
}

/** «Voy» en grande (RsvpAction) o, ya confirmado, «Vas» en acento suave (tocarlo lo quita). */
function RsvpAction({ item }: { item: CalendarItem }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={item.going ? 'soft' : 'primary'}
      size="xl"
      full
      loading={busy}
      disabled={busy}
      accessibilityLabel={item.going ? 'Vas (toca si ya no vas)' : 'Voy'}
      onPress={async () => {
        setBusy(true);
        await toggleRsvp(item, !item.going);
        setBusy(false);
      }}
    >
      {item.going ? 'Vas' : 'Voy'}
    </Button>
  );
}

/** Lo próximo cuando hoy no hay juego (NextUpCard de la web): «Hoy juegas» o «Tu próxima práctica», con «Voy». */
export function NextUpCard({ item, today, anotar }: { item: CalendarItem; today: string; anotar?: ReactNode }) {
  const c = useColors();
  const isToday = item.date === today;
  const kind = item.type === 'torneo' ? 'torneo' : item.type === 'practica' || item.sport === 'bowling' ? 'práctica' : 'evento';
  const lead = isToday ? 'Hoy juegas' : 'Hoy no te toca jugar';
  const title = isToday ? todayTitle({ type: item.type, name: item.type === 'torneo' ? item.name : null, date: item.date }, today) : `Tu próxim${kind === 'práctica' ? 'a' : 'o'} ${kind}`;
  const line = [weekdayLabel(item.date, today), item.time].filter(Boolean).join(' · ');
  return (
    <Card style={{ gap: 12 }}>
      <View>
        <Txt variant="meta" tone="muted" style={{ fontWeight: '600' }}>
          {lead}
        </Txt>
        <Txt variant="cardTitle" numberOfLines={1} style={{ marginTop: 6 }}>
          {title}
        </Txt>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${line}. ${item.leagueName}`}
        onPress={() => openLink(item.href)}
        style={({ pressed }) => [styles.tile, { backgroundColor: c.surface2, opacity: pressed ? 0.8 : 1 }]}
      >
        <DateBlock date={item.date} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {item.type === 'torneo' && !isToday ? `${item.name} · ${line}` : line}
          </Txt>
          <Txt variant="meta" tone="muted" numberOfLines={1}>
            {item.leagueName}
          </Txt>
        </View>
      </Pressable>
      {canRsvp(item) && <RsvpAction item={item} />}
      {/* «Anotar un juego» o «Seguir mi juego N» (abajo, como la web). */}
      {anotar}
    </Card>
  );
}

/** Hoy no hay nada (IdleCard de la web). */
export function IdleCard({ anotar }: { anotar?: ReactNode } = {}) {
  return (
    <Card style={{ gap: 6 }}>
      <Txt variant="meta" tone="muted" style={{ fontWeight: '600' }}>
        Hoy no te toca jugar
      </Txt>
      <Txt variant="cardTitle">Nada programado</Txt>
      <Txt variant="meta" tone="muted">
        Cuando tu liga ponga la próxima fecha, sale aquí.
      </Txt>
      {anotar && <View style={{ marginTop: 6 }}>{anotar}</View>}
    </Card>
  );
}

/** «Lo que viene» (UpNext de la web): las próximas fechas, con «Voy» en las prácticas del boliche. */
export function UpNext({ items, today, showLeague, action }: { items: readonly CalendarItem[]; today: string; showLeague: boolean; action?: ReactNode }) {
  const c = useColors();
  const shown = items.slice(0, UP_NEXT_SHOWN);
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Lo que viene" action={action} />
      {shown.length === 0 ? (
        <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
          Nada más en los próximos 30 días.
        </Txt>
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {shown.map((it, i) => (
            <View key={it.key} style={[styles.upRow, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${it.name}, ${upNextSubtitle(it, today, true)}`}
                onPress={() => openLink(it.href)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}
              >
                <DateBlock date={it.date} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {it.name}
                  </Txt>
                  <Txt variant="meta" tone="muted" numberOfLines={2}>
                    {upNextSubtitle(it, today, showLeague)}
                  </Txt>
                </View>
              </Pressable>
              {canRsvp(it) ? (
                <SmallRsvp item={it} />
              ) : it.status === 'live' ? (
                <Badge>En vivo</Badge>
              ) : it.status === 'suspended' ? (
                <Badge tone="warn">Suspendido</Badge>
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

/** «Voy» en línea (RsvpButton de la web): en acento suave; ya confirmado, «Vas ✓» en gris. */
function SmallRsvp({ item }: { item: CalendarItem }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: item.going, busy }}
      accessibilityLabel={item.going ? 'Vas (toca si ya no vas)' : 'Voy'}
      disabled={busy}
      hitSlop={6}
      onPress={async () => {
        setBusy(true);
        await toggleRsvp(item, !item.going);
        setBusy(false);
      }}
      style={[styles.rsvp, { backgroundColor: item.going ? c.surface2 : c.accentSoft, opacity: busy ? 0.7 : 1 }]}
    >
      <Txt style={{ fontWeight: '600', fontSize: 14, color: item.going ? c.fg2 : c.accent }}>{item.going ? 'Vas ✓' : 'Voy'}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  nextMatch: { gap: 12, borderRadius: 18, borderWidth: 1, padding: 16 },
  sportMark: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tile: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 14 },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rsvp: { height: 36, borderRadius: 18, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
});
