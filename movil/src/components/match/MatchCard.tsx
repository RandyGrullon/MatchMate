/**
 * Un partido (como MatchCard de la web, src/components/match/MatchCard.tsx, con su misma lógica: format.ts): arriba la
 * ronda, la cancha y la hora con el estado («● En vivo», «● Por confirmar», «Final»); debajo los dos lados con el
 * marcador por set (o el total). El ganador va en negrita con copa; el lado propio, en acento suave.
 */
import { Pressable, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import type { Match } from '@mm/lib/data/matches';
import { autoConfirmText, roundLabel, scoreColumns, sideName, statusInfo, whenText, type Tone } from '@mm/components/match/format';
import type { Side } from '@mm/sports/types';
import { useNow } from '@mm/lib/useNow';
import { Txt } from '../ui';
import { useColors } from '@/theme/theme';

export function MatchStatus({ label, tone, live }: { label: string; tone: Tone; live?: boolean }) {
  const c = useColors();
  const color = live ? c.accent : tone === 'warn' ? c.warn : tone === 'danger' ? c.danger : c.muted;
  const dot = live || tone === 'warn';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
      <Txt variant="small" style={{ color, fontWeight: '600' }}>
        {label}
      </Txt>
    </View>
  );
}

export function MatchCard({
  match: m,
  onPress,
  mySide,
  roundWord = 'Ronda',
  tz,
  now: nowProp,
}: {
  match: Match;
  onPress?: () => void;
  mySide?: Side | null;
  /** «Jornada» / «Ronda». */
  roundWord?: string;
  tz?: string;
  now?: number;
}) {
  const c = useColors();
  const ticking = useNow().getTime();
  const now = nowProp ?? ticking;
  const status = statusInfo(m, now);
  const cols = scoreColumns(m.score);
  const when = whenText(m.scheduledAt, tz, true);
  const meta = [m.stage || roundLabel(m.round, roundWord), m.court, when].filter(Boolean);
  const pendingText = autoConfirmText(m, now);
  const walkover = m.status === 'walkover';
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: pressed ? c.surface2 : c.surface, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 14, gap: 8 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt variant="small" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {meta.join(' · ')}
        </Txt>
        {m.pending && <MatchStatus label="Por enviar" tone="neutral" />}
        {m.status !== 'scheduled' && <MatchStatus label={status.label} tone={status.tone} live={status.live} />}
      </View>
      <View style={{ gap: 2 }}>
        {m.sides.map((s, i) => {
          const won = m.winner === s.side;
          const absent = walkover && (m.walkoverSide === s.side || m.walkoverSide === 0);
          const mine = mySide === s.side;
          return (
            <View key={s.side} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 12, marginHorizontal: -10, paddingHorizontal: 10, backgroundColor: mine ? c.accentSoft : 'transparent' }}>
              <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15.5, fontWeight: won ? '700' : m.winner ? '500' : '600', color: won || !m.winner ? c.fg : c.muted }}>
                {sideName(s)}
                {absent && <Txt variant="small" tone="muted">{' (no vino)'}</Txt>}
              </Txt>
              {won && <Trophy size={16} color={c.gold} accessibilityLabel="Ganó" />}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {cols.map((col, j) => {
                  const v = i === 0 ? col.a : col.b;
                  const other = i === 0 ? col.b : col.a;
                  return (
                    <Txt key={j} style={{ width: 24, textAlign: 'right', fontSize: 19, lineHeight: 22, fontWeight: v > other ? '700' : '500', color: v > other ? c.fg : c.muted }}>
                      {v}
                      {col.tb && v < other ? <Txt style={{ fontSize: 10 }}>{col.tb}</Txt> : null}
                    </Txt>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
      {(pendingText || (m.status === 'disputed' && m.disputeNote) || (m.note && m.status !== 'live')) && (
        <View style={{ gap: 2 }}>
          {!!pendingText && (
            <Txt variant="small" tone="muted">
              {pendingText}
            </Txt>
          )}
          {m.status === 'disputed' && !!m.disputeNote && (
            <Txt variant="small" tone="danger">
              Reclamo: {m.disputeNote}
            </Txt>
          )}
          {!!m.note && m.status !== 'live' && (
            <Txt variant="small" tone="muted">
              {m.note}
            </Txt>
          )}
        </View>
      )}
    </Pressable>
  );
}
