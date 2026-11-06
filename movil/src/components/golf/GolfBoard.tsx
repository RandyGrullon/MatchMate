import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { ListOrdered } from 'lucide-react-native';
import type { GolfCardDoc, GolfRoundFull } from '@mm/lib/data/golf';
import { useLeagueCtx } from '@mm/lib/league';
import { modeCompetition, roundBoard, thruText, toParText, type BoardRow } from '@mm/pages/sports/golf/logic';
import { Card, Empty, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * El leaderboard de la ronda (GolfBoard de la web, Lite): puesto, nombre con «Tú», los hoyos jugados y el número grande
 * de lo oficial (golpes contra el par o puntos Stableford). Sin puesto: «No terminó», «Descalificado» o «Recogió».
 * Las filas salen de roundBoard (src/pages/sports/golf/logic.ts), las mismas de la web.
 */
export function GolfBoard({ round, cards, nameOf }: { round: GolfRoundFull; cards: GolfCardDoc[]; nameOf: (playerId: string) => string }) {
  const c = useColors();
  const { myPlayerId } = useLeagueCtx();
  const comp = modeCompetition(round.competition, 'official');
  const stableford = comp.format === 'stableford';
  const net = comp.basis === 'net';
  const rows: BoardRow[] = useMemo(() => roundBoard(round, cards, comp), [round, cards, comp]);
  if (!cards.length) {
    return <Empty icon={<ListOrdered size={28} color={c.accent} />} title="Todavía no hay inscritos" text="Cuando se inscriban y empiecen a anotar, aquí sale el leaderboard en vivo." />;
  }
  const status = (r: BoardRow) => (r.unfinished ? 'No terminó' : r.dq ? (r.card?.dq ? 'Descalificado' : 'Recogió') : null);
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      {rows.map((r, i) => {
        const me = r.id === myPlayerId;
        const s = status(r);
        const main = stableford ? `${r.points}` : toParText(net ? r.netToPar : r.toPar);
        return (
          <View
            key={r.id}
            accessible
            accessibilityLabel={`${r.rank ?? '–'}. ${nameOf(r.id)}${me ? ' (tú)' : ''}: ${s ?? `${main}${stableford ? ' puntos' : ''}, hoyos ${thruText(r.thru, round.holes)}`}`}
            style={[styles.row, { backgroundColor: me ? c.accentSoft : 'transparent' }, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}
          >
            <Txt style={{ width: 22, textAlign: 'center', fontFamily: font.bold, color: r.rank != null ? (me ? c.accent : c.muted) : c.faint }}>{r.rank ?? '–'}</Txt>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {nameOf(r.id)}
                {me ? <Txt tone="accent" style={{ fontSize: 13 }}>{'  Tú'}</Txt> : null}
              </Txt>
              <Txt variant="meta" tone="muted">
                {s ?? `Hoyos ${thruText(r.thru, round.holes)}`}
              </Txt>
            </View>
            <Txt style={{ fontFamily: font.bold, fontSize: 22, fontVariant: ['tabular-nums'], color: s ? c.faint : c.fg }}>{s ? '–' : main}</Txt>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 10 },
});
