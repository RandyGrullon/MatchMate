import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronLeft, ChevronRight, Repeat } from 'lucide-react-native';
import type { CalendarItem, CalendarMatch } from '@mm/lib/calendar';
import type { LeagueFeed } from '@mm/lib/data';
import { setRsvp } from '@mm/lib/data/events';
import { saveErrorMessage } from '@mm/lib/errorText';
import { parseDate } from '@mm/lib/format';
import { WEEKDAY_SHORT } from '@mm/lib/schedule';
import type { League } from '@mm/lib/types';
import { canRsvpRow, clampWeek, dayCellLabel, dayHeading, dotKind, MAX_WEEKS, rowSubtitle, weekEmptyText, weekRange, weekTitle, weekView } from '@mm/components/agenda/week';
import { toast } from '@/components/feedback';
import { Badge, Card, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { SportMark } from './SportMark';

/** Guarda «Voy» (o lo quita) con el aviso de la semana del Calendario (WeekAgenda de la web). Va por la cola sin señal. */
async function toggleRsvp(it: CalendarItem, going: boolean) {
  try {
    await setRsvp(it.lid, it.eventId!, it.playerId!, going);
    toast(going ? 'Confirmado: vas' : 'Listo');
  } catch (e) {
    toast(saveErrorMessage(e), 'error');
  }
}

/**
 * La semana (lunes a domingo) de mis ligas (WeekAgenda de la web, src/components/home/WeekAgenda.tsx, con su misma
 * lógica: src/components/agenda/week.ts): «Esta semana» con las flechas (hasta 8 semanas), los 7 días con sus
 * puntitos (tocar uno deja solo ese día) y debajo, por día, los eventos, mis partidos con fecha y, en el boliche, las
 * prácticas del horario aunque el admin todavía no las creó (con «Voy»). En la web, `showSport` pone el deporte a la
 * derecha solo en pantallas anchas: en el teléfono no sale (cada fila ya lleva su deporte en el cuadro).
 */
export function WeekAgenda({
  feeds,
  leagues,
  matches,
  today,
}: {
  feeds: readonly LeagueFeed[];
  leagues: readonly League[];
  matches: readonly CalendarMatch[];
  today: string;
  showSport?: boolean;
}) {
  const c = useColors();
  const [week, setWeek] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  if (!feeds.length && !matches.length) return null;

  const { from, days, items, byDay } = weekView(feeds, leagues, matches, today, week, day);
  const go = (delta: number) => {
    setWeek((w) => clampWeek(w + delta));
    setDay(null);
  };
  const dot = { match: c.ok, torneo: c.warn, otro: c.accent } as const;

  return (
    <View accessibilityLabel="Esta semana" style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: -6 }}>
        <Txt variant="meta" tone="muted" style={{ flex: 1, fontFamily: font.semibold }} accessibilityRole="header">
          {weekTitle(week)}
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Semana anterior"
          disabled={week === 0}
          onPress={() => go(-1)}
          style={({ pressed }) => [styles.nav, { opacity: week === 0 ? 0.3 : 1, backgroundColor: pressed ? c.surface2 : 'transparent' }]}
        >
          <ChevronLeft size={16} color={c.muted} />
        </Pressable>
        <Txt style={{ minWidth: 112, textAlign: 'center', fontSize: 12, fontFamily: font.medium, fontVariant: ['tabular-nums'] }}>{weekRange(from, week)}</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Semana siguiente"
          disabled={week === MAX_WEEKS - 1}
          onPress={() => go(1)}
          style={({ pressed }) => [styles.nav, { opacity: week === MAX_WEEKS - 1 ? 0.3 : 1, backgroundColor: pressed ? c.surface2 : 'transparent' }]}
        >
          <ChevronRight size={16} color={c.muted} />
        </Pressable>
      </View>

      <Card padded={false} style={{ overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
          {days.map((d, i) => {
            const mine = items.filter((it) => it.date === d);
            const past = d < today;
            const selected = day === d;
            const isToday = d === today;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={dayCellLabel(d, i, mine)}
                accessibilityState={{ selected, disabled: past || !mine.length }}
                disabled={past || !mine.length}
                onPress={() => setDay(selected ? null : d)}
                style={({ pressed }) => [
                  styles.day,
                  { backgroundColor: selected ? c.accent : isToday ? c.accentSoft : pressed ? c.surface2 : 'transparent', opacity: past ? 0.4 : 1 },
                ]}
              >
                <Txt style={{ fontSize: 10, fontFamily: font.medium, color: selected ? c.accentFg : c.muted }}>{WEEKDAY_SHORT[i]}</Txt>
                <Txt style={{ fontSize: 14, fontFamily: font.bold, fontVariant: ['tabular-nums'], color: selected ? c.accentFg : isToday ? c.accent : c.fg }}>
                  {parseDate(d).getDate()}
                </Txt>
                <View style={{ flexDirection: 'row', height: 6, gap: 2 }}>
                  {mine.slice(0, 3).map((it) => (
                    <View key={it.key} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selected ? c.accentFg : dot[dotKind(it)] }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {byDay.length === 0 ? (
          <Txt variant="meta" tone="muted" style={{ padding: 16 }}>
            {weekEmptyText(week)}
          </Txt>
        ) : (
          byDay.map((g, gi) => (
            <View key={g.date} style={[{ paddingBottom: 4 }, gi ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
              <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.semibold, paddingHorizontal: 16, paddingTop: 10 }}>
                {dayHeading(g.date, today)}
              </Txt>
              {g.items.map((it) => (
                <AgendaWeekRow key={it.key} item={it} />
              ))}
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

/**
 * Un evento o un partido de la semana (AgendaRow de WeekAgenda.tsx): el deporte en su cuadro (el torneo con el trofeo
 * chico), el nombre y la hora, la liga (y «según el horario» si el admin todavía no la creó), «En vivo» o «Suspendido» y
 * «Voy» en las prácticas del boliche. Tocarla abre el evento, la liga o el partido.
 */
function AgendaWeekRow({ item }: { item: CalendarItem }) {
  const c = useColors();
  const match = item.kind === 'match';
  const sub = rowSubtitle(item);
  const planned = !item.eventId && !match;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[item.name, item.time, sub, planned ? 'según el horario' : null].filter(Boolean).join(', ')}
        onPress={() => openLink(item.href)}
        style={({ pressed }) => [{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.7 : 1 }]}
      >
        <SportMark sport={item.sport} game={item.game} size="sm" torneo={item.type === 'torneo'} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt numberOfLines={1} style={{ fontSize: 14, fontFamily: font.semibold }}>
            {item.name}
            {!!item.time && <Txt style={{ fontSize: 14, color: c.muted }}>{` · ${item.time}`}</Txt>}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12, flexShrink: 1 }}>
              {sub}
            </Txt>
            {planned && (
              <>
                <Txt tone="muted" style={{ fontSize: 12 }}>
                  ·
                </Txt>
                <Repeat size={12} color={c.muted} />
                <Txt tone="muted" style={{ fontSize: 12 }}>
                  según el horario
                </Txt>
              </>
            )}
          </View>
        </View>
      </Pressable>
      {item.status === 'live' ? <Badge tone="ok">En vivo</Badge> : item.status === 'suspended' ? <Badge tone="warn">Suspendido</Badge> : null}
      {canRsvpRow(item) && <RsvpChip item={item} />}
    </View>
  );
}

/** «Voy» en el acento suave y «Vas ✓» en gris (RsvpButton de la web); mientras se guarda, la ruedita en su lugar. */
function RsvpChip({ item }: { item: CalendarItem }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const fg = item.going ? c.fg2 : c.accent;
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
      style={[styles.rsvp, { backgroundColor: item.going ? c.surface2 : c.accentSoft }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: busy ? 0 : 1 }}>
        <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: fg }}>{item.going ? 'Vas' : 'Voy'}</Txt>
        {item.going && <Check size={14} color={fg} strokeWidth={2.6} />}
      </View>
      {busy && <ActivityIndicator size="small" color={fg} style={StyleSheet.absoluteFill} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  day: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8 },
  rsvp: { height: 36, borderRadius: 18, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
});
