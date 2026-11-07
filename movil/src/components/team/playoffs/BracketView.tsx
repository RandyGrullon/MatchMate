/**
 * El cuadro de eliminación (BracketView de src/components/match en la web, con el mismo cuadro de
 * src/sports/formats/knockout): una columna por ronda (Cuartos, Semifinal, Final) que se desliza de lado, el partido
 * por el 3.er lugar aparte y el campeón. `scoreOf` pone el marcador de cada lado (los playoffs: las victorias de cada
 * equipo en la serie); sin él, el del partido de la base (`matchOf`, por `bracket_key`).
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { Trophy } from 'lucide-react-native';
import type { Match } from '@mm/lib/data/matches';
import { scoreColumns } from '@mm/components/match/format';
import { champion, roundName, type Bracket, type BracketMatch } from '@mm/sports/formats/knockout';
import { Txt } from '../../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type ScoreCell = string | number;

export function BracketView({
  bracket,
  nameOf,
  matchOf,
  scoreOf,
  highlight = [],
}: {
  bracket: Bracket;
  nameOf: (id: string) => string;
  matchOf?: (key: string) => Match | undefined;
  scoreOf?: (bm: BracketMatch) => readonly [ScoreCell, ScoreCell] | null;
  /** Ids resaltados (mi equipo). */
  highlight?: readonly string[];
}) {
  const c = useColors();
  const rounds = Array.from({ length: bracket.rounds }, (_, i) => i + 1);
  const third = bracket.matches.find((m) => m.thirdPlace);
  const champ = champion(bracket);
  const head = { fontSize: 11, fontFamily: font.bold, letterSpacing: 0.7, color: c.muted } as const;
  return (
    <View style={{ gap: 16 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityHint="Se desliza de lado" style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}>
        {rounds.map((r) => (
          <View key={r} style={{ width: 224 }}>
            <Txt numberOfLines={1} style={[head, { textAlign: 'center', marginBottom: 10 }]}>
              {roundName(r, bracket.rounds).toUpperCase()}
            </Txt>
            <View style={{ flex: 1, justifyContent: 'space-around', gap: 12 }}>
              {bracket.matches
                .filter((m) => m.round === r && !m.thirdPlace)
                .sort((a, b) => a.index - b.index)
                .map((m) => (
                  <Cell key={m.key} bm={m} nameOf={nameOf} match={matchOf?.(m.key)} score={scoreOf?.(m)} highlight={highlight} />
                ))}
            </View>
          </View>
        ))}
        <View style={{ width: 160, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: champ ? c.accentSoft : c.surface2 }}>
            <Trophy size={28} color={champ ? c.gold : c.faint} />
          </View>
          <Txt style={head}>CAMPEÓN</Txt>
          <Txt numberOfLines={2} style={{ fontSize: 15, fontFamily: font.semibold, textAlign: 'center', color: champ ? c.fg : c.muted }}>
            {champ ? nameOf(champ) : 'Por definir'}
          </Txt>
        </View>
      </ScrollView>
      {third && (
        <View style={{ width: 224, gap: 10 }}>
          <Txt style={head}>3.ER LUGAR</Txt>
          <Cell bm={third} nameOf={nameOf} match={matchOf?.(third.key)} score={scoreOf?.(third)} highlight={highlight} />
        </View>
      )}
    </View>
  );
}

function Cell({ bm, nameOf, match, score, highlight }: { bm: BracketMatch; nameOf: (id: string) => string; match?: Match; score?: readonly [ScoreCell, ScoreCell] | null; highlight: readonly string[] }) {
  const c = useColors();
  const cols: { a: ScoreCell | null; b: ScoreCell | null }[] = score ? [{ a: score[0], b: score[1] }] : scoreColumns(match?.score);
  const line = (id: string | null, seed: number | null, idx: 0 | 1) => {
    const won = !!id && bm.winner === id;
    const mine = !!id && highlight.includes(id);
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: mine ? c.accentSoft : 'transparent', borderBottomWidth: idx === 0 ? StyleSheet.hairlineWidth : 0, borderBottomColor: c.line }}>
        {seed != null && <Txt style={{ width: 16, textAlign: 'right', fontSize: 11, fontFamily: font.semibold, color: c.faint }}>{seed}</Txt>}
        <Txt
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontFamily: won ? font.bold : bm.winner || !id ? font.medium : font.semibold, color: !id || (bm.winner && !won) ? c.muted : c.fg }}
        >
          {id ? nameOf(id) : bm.bye && idx === 1 ? 'Pase directo' : 'Por definir'}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {cols.map((col, j) => (
            <Txt key={j} style={{ width: 16, textAlign: 'right', fontSize: 15, fontFamily: font.semibold }}>
              {String((idx === 0 ? col.a : col.b) ?? '')}
            </Txt>
          ))}
        </View>
      </View>
    );
  };
  return (
    <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: c.surface, opacity: bm.bye ? 0.6 : 1 }}>
      {line(bm.side1, bm.seed1, 0)}
      {line(bm.side2, bm.seed2, 1)}
    </View>
  );
}
