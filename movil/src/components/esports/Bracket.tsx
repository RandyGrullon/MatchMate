/**
 * El cuadro de un torneo de esports (EsportsBracket de la web, con su misma lógica: bracket/sections.ts): columnas por
 * ronda que se deslizan de lado dentro de su caja, ganadores arriba y perdedores abajo con su título, la gran final y el
 * reinicio al final (o el 3.er lugar) y el campeón. Cada partido es una tarjeta chica con los dos lados (el nombre o de
 * dónde viene: «Ganador W1-2»), la serie («2-1») y su estado; se toca para abrir el partido.
 */
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import type { Match } from '@mm/lib/data/matches';
import { statusInfo } from '@mm/components/match/format';
import { parseSeriesScore, type ResolvedMatch } from '@mm/sports/esports';
import { cellScores } from '@mm/pages/sports/esports/logic';
import { cellLabel, cellWinnerSide, sections } from '@mm/pages/sports/esports/bracket/sections';
import { MatchStatus } from '../match/MatchCard';
import { Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export function EsportsBracket({
  matches,
  nameOf,
  seedOf,
  matchOf,
  champion,
  onOpen,
  highlight,
}: {
  matches: readonly ResolvedMatch[];
  nameOf: (entryId: string) => string;
  seedOf?: (entryId: string) => number | null;
  matchOf?: (key: string) => Match | undefined;
  champion?: string | null;
  onOpen?: (m: Match) => void;
  highlight?: ReadonlySet<string>;
}) {
  const c = useColors();
  const parts = sections(matches);
  if (!parts.length) return null;
  const head = { fontSize: 11, fontFamily: font.bold, letterSpacing: 0.7, color: c.muted } as const;
  return (
    <View style={{ gap: 24 }}>
      {parts.map((p) => (
        <View key={p.key} accessibilityLabel={p.title} style={{ gap: 10 }}>
          {parts.length > 1 && <Txt style={[head, { fontSize: 13, marginHorizontal: 4 }]}>{p.title.toUpperCase()}</Txt>}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityHint="Se desliza de lado" style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
            {p.columns.map((col) => (
              <View key={col.key} style={{ width: 208 }}>
                <Txt numberOfLines={1} style={[head, { textAlign: 'center', marginBottom: 8 }]}>
                  {col.title.toUpperCase()}
                </Txt>
                <View style={{ flex: 1, justifyContent: 'space-around', gap: 12 }}>
                  {col.matches.map((m) => (
                    <Cell key={m.key} m={m} nameOf={nameOf} seedOf={seedOf} match={matchOf?.(m.key)} onOpen={onOpen} highlight={highlight} />
                  ))}
                </View>
              </View>
            ))}
            {p.final && <ChampionCell name={champion ? nameOf(champion) : null} />}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

function Cell({
  m,
  nameOf,
  seedOf,
  match,
  onOpen,
  highlight,
}: {
  m: ResolvedMatch;
  nameOf: (id: string) => string;
  seedOf?: (id: string) => number | null;
  match?: Match;
  onOpen?: (m: Match) => void;
  highlight?: ReadonlySet<string>;
}) {
  const c = useColors();
  const nums = cellScores(parseSeriesScore(match?.score));
  const voided = match?.status === 'void';
  const winnerSide = cellWinnerSide(match);
  const status = match ? statusInfo(match) : null;
  // «Final» ya se ve en el marcador y el ganador en negrita: solo se dice lo que espera o cambia algo.
  const showStatus = !!match && match.status !== 'scheduled' && status?.label !== 'Final';
  const line = (i: 0 | 1) => {
    const id = m.known[i];
    const won = winnerSide === i + 1;
    const lost = winnerSide !== null && !won;
    const seed = id && seedOf ? seedOf(id) : null;
    return (
      <View
        key={i}
        style={[
          { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 12, paddingVertical: 6 },
          i === 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
          !!id && highlight?.has(id) && { backgroundColor: c.accentSoft },
        ]}
      >
        {seed != null && <Txt style={{ width: 16, textAlign: 'right', fontSize: 11, fontFamily: font.semibold, color: c.faint }}>{seed}</Txt>}
        <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontFamily: !id ? font.medium : won ? font.bold : lost ? font.medium : font.semibold, color: !id || lost ? c.muted : c.fg }}>
          {cellLabel(m, i, nameOf)}
        </Txt>
        {nums && <Txt style={{ width: 24, textAlign: 'right', fontSize: 15, fontFamily: won ? font.bold : font.medium, color: won ? c.fg : c.muted }}>{nums[i]}</Txt>}
      </View>
    );
  };
  const body = (
    <>
      {line(0)}
      {line(1)}
      {(voided || showStatus) && (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingHorizontal: 12, paddingVertical: 4 }}>
          {voided ? (
            <Txt tone="muted" style={{ fontSize: 12 }}>
              {match?.note || 'No hizo falta'}
            </Txt>
          ) : (
            status && <MatchStatus label={status.label} tone={status.tone} live={status.live} />
          )}
        </View>
      )}
    </>
  );
  const box = { borderRadius: 18, overflow: 'hidden' as const, backgroundColor: c.surface, opacity: voided ? 0.6 : 1 };
  if (match && onOpen) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${m.stage || m.key}: ${cellLabel(m, 0, nameOf)} contra ${cellLabel(m, 1, nameOf)}`}
        onPress={() => onOpen(match)}
        style={({ pressed }) => [box, pressed && { transform: [{ scale: 0.98 }] }]}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={box}>{body}</View>;
}

function ChampionCell({ name }: { name: string | null }) {
  const c = useColors();
  return (
    <View style={{ width: 144, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: name ? c.accentSoft : c.surface2 }}>
        <Trophy size={28} color={name ? c.gold : c.faint} />
      </View>
      <Txt style={{ fontSize: 11, fontFamily: font.bold, letterSpacing: 0.7, color: c.muted }}>CAMPEÓN</Txt>
      <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold, color: name ? c.fg : c.muted }}>
        {name ?? 'Por definir'}
      </Txt>
    </View>
  );
}
