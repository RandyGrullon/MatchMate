import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ListOrdered } from 'lucide-react-native';
import { useGolfTournament, type GolfCardDoc, type GolfRoundFull } from '@mm/lib/data/golf';
import { useLeagueCtx } from '@mm/lib/league';
import { useIsPro } from '@mm/lib/useMode';
import { golfBoardShare } from '@mm/components/share/golf';
import { boardColumns, boardFootnote, boardLiteLine, boardProNote, boardShareSubtitle, boardStatus, boardThru } from '@mm/pages/sports/golf/board';
import { boardModes, modeCompetition, modeLabel, roundBoard, toParText, tournamentBoard, type BoardMode, type BoardRow } from '@mm/pages/sports/golf/logic';
import { Initials } from '@/components/esports/bits';
import { ShareIconButton } from '@/components/swimming/ShareImage';
import { TuTag } from '@/components/swimming/parts';
import { PillPick } from '@/components/team/standings/parts';
import { Card, Empty, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { CardReview } from './CardReview';

/** Golpes contra el par con su color (ToPar de la web): bajo par en verde, par en el color del deporte. */
function ToPar({ value, size }: { value: number | null | undefined; size: number }) {
  const c = useColors();
  return <Txt style={{ fontFamily: font.bold, fontSize: size, fontVariant: ['tabular-nums'], color: value != null && value < 0 ? c.ok : value === 0 ? c.accent : c.fg }}>{toParText(value)}</Txt>;
}

/** El puesto (o «–» sin puesto: no terminó, recogió o descalificado). */
function Pos({ rank, me }: { rank: number | null; me: boolean }) {
  const c = useColors();
  return <Txt style={{ width: 22, textAlign: 'center', fontSize: 15, fontFamily: font.semibold, fontVariant: ['tabular-nums'], color: rank != null ? (me ? c.accent : c.muted) : c.faint }}>{rank ?? '–'}</Txt>;
}

/**
 * Leaderboard en vivo de la ronda (o del torneo), con los hoyos jugados de cada quien (GolfBoard de la web, con las filas
 * de roundBoard y tournamentBoard de logic.ts y lo que dice cada una de board.ts, los mismos de la web); tocar un jugador
 * abre su tarjeta.
 * - Lite: la lista tranquila (puesto, iniciales, nombre con «Tú», hoyos jugados y el número grande de lo oficial).
 * - Pro: «Stableford ▾» para mirarlo también en neto, bruto o Stableford, y la tabla con las columnas (lo que ordena,
 *   Hoyos y Bruto) y el desempate en una línea.
 * Con un torneo de varias rondas, «Ronda 1 | Torneo». Compartir manda la imagen al grupo.
 */
export function GolfBoard({ round, cards, nameOf }: { round: GolfRoundFull; cards: GolfCardDoc[]; nameOf: (playerId: string) => string }) {
  const c = useColors();
  const { lid, league, myPlayerId } = useLeagueCtx();
  const pro = useIsPro();
  const [picked, setMode] = useState<BoardMode>('official');
  const [scope, setScope] = useState<'ronda' | 'torneo'>('ronda');
  const [open, setOpen] = useState<{ card: GolfCardDoc; round: GolfRoundFull } | null>(null);
  const tournament = useGolfTournament(lid, round.tournamentId);
  const multi = !!round.tournamentId && tournament.data.rounds.length > 1;
  // Lite ve lo oficial (los otros modos son de Pro).
  const mode: BoardMode = pro ? picked : 'official';
  const comp = modeCompetition(round.competition, mode);
  const stableford = comp.format === 'stableford';
  const net = comp.basis === 'net';
  const whole = multi && scope === 'torneo';

  const rows: BoardRow[] = useMemo(() => {
    if (whole) {
      // Esta ronda con lo último (también lo del teléfono) y las otras como vienen del servidor.
      const others = tournament.data.cards.filter((x) => x.eventId !== round.eventId);
      const rounds = tournament.data.rounds.map((r) => (r.eventId === round.eventId ? round : r));
      return tournamentBoard(rounds, [...others, ...cards], comp);
    }
    return roundBoard(round, cards, comp);
  }, [whole, tournament.data, round, cards, comp]);

  if (!cards.length) {
    return <Empty icon={<ListOrdered size={28} color={c.accent} />} title="Todavía no hay inscritos" text="Cuando se inscriban y empiecen a anotar, aquí sale el leaderboard en vivo." />;
  }

  const roundsOf = whole ? tournament.data.rounds : [round];
  const holes = roundsOf.reduce((a, r) => a + r.holes, 0);
  const shown = { whole, stableford, net, holes, roundHoles: round.holes };
  const heads = boardColumns(shown);
  const openCard = (r: BoardRow) => r.card && setOpen({ card: r.card, round: roundsOf.find((x) => x.eventId === r.card!.eventId) ?? round });
  const th = { fontSize: 12, fontFamily: font.semibold, letterSpacing: 0.7, textTransform: 'uppercase' as const, color: c.muted };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          {multi && (
            <Segmented<'ronda' | 'torneo'>
              label="Qué leaderboard ver"
              options={[
                { key: 'ronda', label: `Ronda ${round.roundNo ?? ''}`.trim() },
                { key: 'torneo', label: 'Torneo' },
              ]}
              value={scope}
              onChange={setScope}
            />
          )}
          {pro ? (
            <PillPick label="Cómo ver el leaderboard" options={boardModes(round.competition).map((m) => ({ key: m, label: modeLabel(round.competition, m) }))} value={mode} onChange={setMode} />
          ) : (
            !multi && (
              <Txt variant="meta" tone="fg2" style={{ marginHorizontal: 4, fontFamily: font.semibold }}>
                {modeLabel(round.competition, 'official')}
              </Txt>
            )
          )}
        </View>
        <ShareIconButton
          round
          label="Compartir el leaderboard"
          path={`/l/${lid}/e/${round.eventId}?tab=leaderboard`}
          card={() =>
            golfBoardShare({
              title: league.name,
              subtitle: boardShareSubtitle({ whole, rounds: tournament.data.rounds.length, roundNo: round.roundNo, courseName: round.courseName, mode: modeLabel(round.competition, mode) }),
              rows,
              nameOf,
              stableford,
              net,
              holes: whole ? holes : round.holes,
              total: whole,
              statusOf: (r) => boardStatus(r) ?? undefined,
            })
          }
        />
      </View>

      {pro ? (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <View style={[styles.proRow, { minHeight: 0, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
            <Txt style={[th, { width: 24 }]}>#</Txt>
            <Txt style={[th, { flex: 1 }]}>Jugador</Txt>
            <Txt style={[th, styles.main]}>{heads.main}</Txt>
            <Txt style={[th, styles.cell]} accessibilityLabel="Hoyos jugados">
              Hoyos
            </Txt>
            <Txt style={[th, styles.main]}>Bruto</Txt>
          </View>
          {rows.map((r, i) => {
            const me = !!myPlayerId && r.id === myPlayerId;
            const note = boardProNote(r, shown);
            const thru = boardThru(r, whole, holes, round.holes);
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={`${r.rank ?? '–'}. ${nameOf(r.id)}${me ? ' (tú)' : ''}: ${stableford ? `${r.points} puntos` : toParText(net ? r.netToPar : r.toPar)}, hoyos ${thru}, bruto ${r.gross ?? '–'}${note ? `. ${note}` : ''}`}
                accessibilityState={{ disabled: !r.card }}
                disabled={!r.card}
                onPress={() => openCard(r)}
                style={({ pressed }) => [
                  styles.proRow,
                  { backgroundColor: pressed ? c.surface2 : me ? c.accentSoft : 'transparent' },
                  i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null,
                ]}
              >
                <Txt style={{ width: 24, fontSize: 15, fontFamily: font.semibold, color: r.rank != null ? (me ? c.accent : c.muted) : c.faint, fontVariant: ['tabular-nums'] }}>{r.rank ?? '–'}</Txt>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontFamily: font.semibold }}>
                      {nameOf(r.id)}
                    </Txt>
                    {me && <TuTag />}
                  </View>
                  {!!note && (
                    <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
                      {note}
                    </Txt>
                  )}
                </View>
                <View style={styles.mainBox}>{stableford ? <Txt style={{ fontFamily: font.bold, fontSize: 18, fontVariant: ['tabular-nums'] }}>{r.points}</Txt> : <ToPar value={net ? r.netToPar : r.toPar} size={18} />}</View>
                <Txt tone="muted" style={[styles.cell, { fontSize: 14, fontVariant: ['tabular-nums'] }]}>
                  {thru}
                </Txt>
                <Txt style={[styles.main, { fontSize: 14, fontVariant: ['tabular-nums'] }]}>{r.gross ?? '–'}</Txt>
              </Pressable>
            );
          })}
        </Card>
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {rows.map((r, i) => {
            const me = !!myPlayerId && r.id === myPlayerId;
            return (
              <Pressable
                key={r.id}
                accessibilityRole={r.card ? 'button' : undefined}
                accessibilityLabel={`${nameOf(r.id)}: ver su tarjeta`}
                disabled={!r.card}
                onPress={() => openCard(r)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? c.surface2 : me ? c.accentSoft : 'transparent' },
                  i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null,
                ]}
              >
                <Pos rank={r.rank} me={me} />
                <Initials name={nameOf(r.id)} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {nameOf(r.id)}
                    </Txt>
                    {me && <TuTag />}
                  </View>
                  <Txt variant="meta" tone="muted" numberOfLines={1}>
                    {boardLiteLine(r, shown)}
                  </Txt>
                </View>
                {stableford ? (
                  <Txt style={{ fontFamily: font.bold, fontSize: 22, fontVariant: ['tabular-nums'] }}>
                    {r.points}
                    <Txt tone="muted" style={{ fontSize: 14, fontFamily: font.medium }}>
                      {' pts'}
                    </Txt>
                  </Txt>
                ) : (
                  <ToPar value={net ? r.netToPar : r.toPar} size={22} />
                )}
              </Pressable>
            );
          })}
        </Card>
      )}
      <Txt tone="muted" style={{ marginHorizontal: 4, fontSize: 12.5, lineHeight: 17.5 }}>
        {boardFootnote(pro, shown)}
      </Txt>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? nameOf(open.card.playerId) : ''}>
        {open && <CardReview round={open.round} card={open.card} />}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 10 },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 16, paddingVertical: 8 },
  main: { width: 52, textAlign: 'right' },
  mainBox: { width: 52, alignItems: 'flex-end' },
  cell: { width: 48, textAlign: 'right' },
});
