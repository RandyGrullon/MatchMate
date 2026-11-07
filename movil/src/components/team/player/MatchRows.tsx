/**
 * Los partidos de equipos como filas (MatchRow, MatchRows y StatTiles de TeamUi.tsx en la web): el bloque de la fecha
 * («OCT / 10»), «● Tigres vs. ● Leones» y debajo cuándo y qué jornada; con resultado, qué pasó («Ganó Tigres») y el
 * marcador al final («72–65»); en vivo, «● En vivo». La fila de tu equipo va en acento suave. Y los números de un jugador
 * en una tarjeta, de 2 en 2 (en Pro, de 4 en 4). Los textos salen de src/pages/sports/team/view.ts, los mismos de la web.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarClock, ChevronRight } from 'lucide-react-native';
import { hasResult, type Match } from '@mm/lib/data/matches';
import { dayKey, roundLabel } from '@mm/components/match/format';
import { sideNames } from '@mm/pages/sports/team/lists';
import { rosterSide } from '@mm/pages/sports/team/logic';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { resultLine, rowWhen, scoreShort, todayIn } from '@mm/pages/sports/team/view';
import { DateBlock } from '../../DateBlock';
import { Card, Divider, Txt } from '../../ui';
import { TeamDot } from '../TeamBits';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** «● Tigres vs. ● Leones» con el color de cada equipo. */
export function VsTitle({ tl, match: m, size = 16 }: { tl: Pick<TeamLeague, 'teamOf'>; match: Pick<Match, 'sides'>; size?: number }) {
  const names = sideNames(tl, m);
  const side = (i: 0 | 1) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minWidth: 0 }}>
      <TeamDot team={tl.teamOf(m.sides[i].teamId)} size={10} />
      <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: size, fontFamily: font.semibold }}>
        {names[i]}
      </Txt>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6 }}>
      {side(0)}
      <Txt tone="muted" style={{ fontSize: size }}>
        vs.
      </Txt>
      {side(1)}
    </View>
  );
}

/** Un partido como fila (dentro de una tarjeta sin relleno). Tocarla abre el partido. */
export function MatchRow({
  tl,
  match: m,
  now,
  roundWord = 'Jornada',
  court,
  round = true,
  mine,
}: {
  tl: TeamLeague;
  match: Match;
  now: number;
  roundWord?: string;
  court?: boolean;
  round?: boolean;
  /** Es de mi equipo (por defecto: lo dice la plantilla). */
  mine?: boolean;
}) {
  const c = useColors();
  const today = todayIn(tl.tz, now);
  const names = sideNames(tl, m);
  const day = dayKey(m.scheduledAt, tl.tz);
  const live = m.status === 'live' || m.status === 'suspended';
  const result = hasResult(m) || m.status === 'void' ? resultLine(m, names, now) : null;
  const me = mine ?? rosterSide(m, tl.allTeams.data, tl.myPlayerId) !== null;
  const meta = rowWhen(m, tl.tz, today, roundWord, court, round);
  const value = hasResult(m) || live ? scoreShort(m) : null;
  const roundText = round && (m.stage || m.round != null) ? ` · ${m.stage || roundLabel(m.round, roundWord)}` : '';
  let subtitle: ReactNode;
  if (live) {
    subtitle = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
        <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
          {m.status === 'suspended' ? 'Suspendido' : 'En vivo'}
        </Txt>
      </View>
    );
  } else if (result) {
    subtitle = (
      <Txt variant="meta" tone="muted" numberOfLines={2}>
        <Txt variant="meta" tone={m.status === 'disputed' ? 'danger' : result.includes('por confirmar') ? 'warn' : 'muted'}>
          {result}
        </Txt>
        {roundText}
      </Txt>
    );
  } else {
    subtitle = (
      <Txt variant="meta" tone="muted" numberOfLines={2}>
        {meta}
      </Txt>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${names[0]} contra ${names[1]}${result ? `: ${result}` : ''}`}
      onPress={() => router.push({ pathname: '/l/[lid]/partido/[matchId]', params: { lid: tl.lid, matchId: m.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : me ? c.accentSoft : 'transparent' }]}
    >
      {day ? (
        <DateBlock date={day} />
      ) : (
        <View style={{ width: 50, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
          <CalendarClock size={20} color={c.accent} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <VsTitle tl={tl} match={m} />
        {subtitle}
      </View>
      {value ? <Txt style={{ fontSize: 19, fontFamily: font.bold }}>{value}</Txt> : <ChevronRight size={18} color={c.faint} />}
    </Pressable>
  );
}

/** Lista de partidos como filas en una tarjeta. `highlight={false}`: sin resaltar los de tu equipo. */
export function MatchRows({ tl, matches, now, roundWord, court, round, highlight = true }: { tl: TeamLeague; matches: readonly Match[]; now: number; roundWord?: string; court?: boolean; round?: boolean; highlight?: boolean }) {
  return (
    <Card padded={false}>
      {matches.map((m, i) => (
        <View key={m.id}>
          {i > 0 && <Divider inset={78} />}
          <MatchRow tl={tl} match={m} now={now} roundWord={roundWord} court={court} round={round} mine={highlight ? undefined : false} />
        </View>
      ))}
    </Card>
  );
}

/**
 * Los números de un jugador en una tarjeta (StatTiles de la web): de 2 en 2 con el número grande y qué es debajo; en Pro
 * (`dense`), de 4 en 4 y más chicos (caben todos).
 */
export function StatTiles({ items, dense }: { items: readonly { label: string; value: string | number }[]; dense?: boolean }) {
  const c = useColors();
  const cols = dense ? 4 : 2;
  return (
    <Card padded={false} style={{ flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden' }}>
      {items.map((it, i) => (
        <View
          key={it.label}
          accessible={dense}
          accessibilityLabel={dense ? `${it.label}: ${it.value}` : undefined}
          style={{
            width: dense ? '25%' : '50%',
            paddingHorizontal: dense ? 12 : 18,
            paddingVertical: dense ? 14 : 16,
            borderLeftWidth: i % cols !== 0 ? StyleSheet.hairlineWidth : 0,
            borderTopWidth: i >= cols ? StyleSheet.hairlineWidth : 0,
            borderColor: c.line,
          }}
        >
          {dense ? <Txt style={{ fontSize: 24, lineHeight: 26, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{String(it.value)}</Txt> : <Txt variant="stat">{String(it.value)}</Txt>}
          <Txt variant="meta" tone="muted" numberOfLines={1} style={dense ? { marginTop: 6, fontSize: 12.5 } : { marginTop: 6 }}>
            {it.label}
          </Txt>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingHorizontal: 16, paddingVertical: 10 },
});
