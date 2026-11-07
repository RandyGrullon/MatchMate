import { ScrollView, StyleSheet, View } from 'react-native';
import type { GolfCardDoc, GolfRoundFull } from '@mm/lib/data/golf';
import { roundWhs, strokesReceived } from '@mm/sports/golf/course';
import { scoreRound } from '@mm/sports/golf/scoring';
import { cardHoles, formatLabel, golfRoundOf, hcpText, indexText, toParText } from '@mm/pages/sports/golf/logic';
import { Badge, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * La tarjeta de un jugador (CardModal + ScoreTable de la web): la salida, el Index y los handicaps, si está firmada (o
 * descalificado), hoyo, par y golpes por vuelta (los puntos son golpes de ventaja), y bruto, neto y Stableford. Va en la
 * hoja de «Firmar» y en la que abre una fila del leaderboard.
 */
export function CardReview({ round, card }: { round: GolfRoundFull; card: GolfCardDoc }) {
  const c = useColors();
  const holes = cardHoles(round, card.teeId);
  const received = strokesReceived(card.playingHcp, holes.map((h) => h.si));
  const score = scoreRound(golfRoundOf(round, card), round.competition);
  const tee = round.course.tees.find((t) => t.id === card.teeId);
  const halves = holes.length === 18 ? [holes.slice(0, 9), holes.slice(9)] : [holes];
  const sum = (xs: (number | null)[]) => (xs.every((x) => x == null) ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0));
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Badge tone="muted">{tee?.name ?? card.teeId}</Badge>
        <Badge tone="muted">{`Index ${indexText(card.hcpIndex)}`}</Badge>
        <Badge tone="muted">{`Hcp de campo ${hcpText(roundWhs(card.courseHcp))}`}</Badge>
        <Badge>{`Hcp de juego ${hcpText(card.playingHcp)}`}</Badge>
        {card.signed ? <Badge tone="ok">Firmada</Badge> : <Badge tone="warn">Sin firmar</Badge>}
        {card.dq && <Badge tone="danger">Descalificado</Badge>}
      </View>
      {halves.map((part, h) => {
        const offset = h * 9;
        const strokes = part.map((_, k) => card.strokes[offset + k]);
        return (
          <ScrollView key={h} horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {[
                { label: 'Hoyo', cells: part.map((x) => String(x.number)), total: h === 0 ? (halves.length > 1 ? 'Ida' : 'Total') : 'Vuelta' },
                { label: 'Par', cells: part.map((x) => String(x.par)), total: String(part.reduce((a, x) => a + x.par, 0)) },
                {
                  label: 'Golpes',
                  cells: part.map((_, k) => (card.pickedUp[offset + k] ? '×' : (card.strokes[offset + k] ?? '·').toString() + '•'.repeat(Math.max(0, received[offset + k] ?? 0)))),
                  total: String(sum(strokes) ?? '–'),
                },
              ].map((row, r) => (
                <View key={row.label} style={[styles.tr, r === 0 && { backgroundColor: c.surface2 }]}>
                  <Txt style={[styles.th, { color: c.muted }]}>{row.label}</Txt>
                  {row.cells.map((v, k) => (
                    <Txt key={k} style={[styles.td, r === 2 && { fontFamily: font.bold }]}>
                      {v}
                    </Txt>
                  ))}
                  <Txt style={[styles.td, { width: 52, fontFamily: font.bold }]}>{row.total}</Txt>
                </View>
              ))}
            </View>
          </ScrollView>
        );
      })}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[
          { label: 'Bruto', value: String(score.gross ?? '–'), sub: toParText(score.toPar) },
          { label: 'Neto', value: String(score.net ?? '–'), sub: toParText(score.netToPar) },
          ...(round.competition.format === 'stableford' ? [{ label: 'Stableford', value: String(score.points), sub: 'pts' }] : []),
        ].map((s) => (
          <View key={s.label} style={[styles.stat, { backgroundColor: c.surface2 }]}>
            <Txt tone="muted" style={{ fontSize: 12 }}>
              {s.label}
            </Txt>
            <Txt style={{ fontFamily: font.bold, fontSize: 24 }}>{s.value}</Txt>
            <Txt tone="muted" style={{ fontSize: 12 }}>
              {s.sub}
            </Txt>
          </View>
        ))}
      </View>
      <Txt tone="muted" style={{ fontSize: 12 }}>{`${formatLabel(round.competition)} · los puntos (•) son golpes de ventaja en ese hoyo.`}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 34 },
  th: { width: 64, paddingHorizontal: 6, fontSize: 12 },
  td: { width: 34, textAlign: 'center', fontSize: 14, fontVariant: ['tabular-nums'] },
  stat: { flex: 1, borderRadius: 14, padding: 10, alignItems: 'center' },
});
