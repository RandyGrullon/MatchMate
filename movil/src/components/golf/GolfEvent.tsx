import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Flag, Signature, Trophy } from 'lucide-react-native';
import { useEvent, usePlayers } from '@mm/lib/data';
import { pendingGolfSign, queueGolfSign, useGolfEvent, useGolfTournaments, type GolfCardDoc, type GolfRoundFull } from '@mm/lib/data/golf';
import { sentOrQueued } from '@mm/lib/data/client';
import { saveErrorMessage } from '@mm/lib/errorText';
import { eventLabel, toIsoDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { formatTime } from '@mm/lib/schedule';
import { useNow } from '@mm/lib/useNow';
import { roundWhs, strokesReceived } from '@mm/sports/golf/course';
import { scoreRound } from '@mm/sports/golf/scoring';
import { eventDay } from '@mm/components/event/eventDay';
import { cardWire, markSent, mergeCard, sendPending, useCourtLog } from '@mm/pages/sports/golf/courtLog';
import { cardHoles, formatLabel, golfRoundOf, hcpText, holesDone, indexText, isComplete, nineLabel, toParText } from '@mm/pages/sports/golf/logic';
import { toast } from '@/components/feedback';
import { Badge, BackBar, Button, Empty, LoadError, Loading, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { GolfBoard } from './GolfBoard';
import { GolfCourt } from './GolfCourt';
import { GolfPlayers } from './GolfPlayers';

type TabKey = 'tarjeta' | 'leaderboard' | 'jugadores';
const TAB_LABEL: Record<TabKey, string> = { tarjeta: 'Tarjeta', leaderboard: 'Leaderboard', jugadores: 'Jugadores' };

/**
 * Una ronda de golf (GolfEvent de la web, Lite): el título y una línea con el día, la hora, el campo y el formato (y «En
 * juego» o «Cerrada»), y las partes de la ronda: Tarjeta (la del grupo, en el campo) · Leaderboard · Jugadores. Al
 * terminar, «Revisa y firma tu tarjeta». Campo y formato, grupos, cerrar la ronda y el reporte, en la web.
 */
export function GolfEventBody({ eventId, embedded = false }: { eventId: string; embedded?: boolean }) {
  const c = useColors();
  const { lid, league, isAdmin, member, myPlayerId } = useLeagueCtx();
  const params = useLocalSearchParams<{ tab?: string }>();
  const event = useEvent(lid, eventId);
  const golf = useGolfEvent(lid, eventId);
  const players = usePlayers(lid);
  const tournaments = useGolfTournaments(lid);
  const [log, updateLog] = useCourtLog(eventId);
  const [picked, setPicked] = useState<TabKey | null>(null);
  const [signing, setSigning] = useState<GolfCardDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const today = toIsoDate(useNow());

  // Lo anotado en este teléfono se ve en todas las partes aunque no haya llegado al servidor.
  const cards = useMemo(() => golf.data.cards.map((x) => mergeCard(x, log)), [golf.data.cards, log]);
  const nameOf = useMemo(() => {
    const m = new Map(players.data.map((p) => [p.id, p.name] as const));
    return (pid: string) => m.get(pid) ?? '(jugador borrado)';
  }, [players.data]);

  const err = event.error ?? golf.error;
  if (err) return <LoadError error={err} />;
  if (event.loading || (golf.loading && !golf.data.round)) return <Loading label="Cargando la ronda" />;
  if (!event.data) return <Empty title="Esta ronda no existe" />;

  const ev = event.data;
  const round = golf.data.round;
  const myCard = myPlayerId ? (cards.find((x) => x.playerId === myPlayerId) ?? null) : null;
  const staff = isAdmin || !!member?.scorer;
  const started = cards.some((x) => holesDone(x) > 0);
  const tournament = round?.tournamentId ? tournaments.data.find((t) => t.id === round.tournamentId) : null;
  const title = eventLabel({ type: ev.type, name: ev.name, date: ev.date }, 'golf');

  const tabs: TabKey[] = round ? [...(!round.closed && (staff || myCard) ? ['tarjeta' as const] : []), 'leaderboard', 'jugadores'] : [];
  const fallback: TabKey =
    tabs.includes('tarjeta') && (ev.date === today || (myCard && holesDone(myCard) > 0)) ? 'tarjeta' : started || round?.closed ? 'leaderboard' : 'jugadores';
  const requested = (picked ?? params.tab) as TabKey | undefined;
  const tab: TabKey = requested && tabs.includes(requested) ? requested : tabs.includes(fallback) ? fallback : 'leaderboard';

  const meta = [
    eventDay(ev.date, today, false),
    ev.startTime ? formatTime(ev.startTime.slice(0, 5)) : null,
    round && round.courseName !== league.venue ? round.courseName : null,
    round ? (round.nine === 'all' ? formatLabel(round.competition) : `${nineLabel(round.nine, round.holes)} · ${formatLabel(round.competition)}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  async function sign(card: GolfCardDoc) {
    if (busy) return;
    setBusy(true);
    try {
      // Primero sale lo anotado que falte; la firma lleva además la tarjeta tal como se revisó.
      sendPending(lid, eventId, golf.data.cards, { isAdmin, staff, myCard })?.catch((e: unknown) => toast(saveErrorMessage(e), 'error'));
      const reviewed = { cardId: card.id, holes: cardWire(cards.find((x) => x.id === card.id) ?? card) };
      const { done } = queueGolfSign(lid, eventId, card.id, { holes: reviewed.holes });
      void done.then(() => updateLog((l) => markSent(l, [reviewed], Date.now()))).catch(() => undefined);
      await sentOrQueued(done);
      toast('Tarjeta firmada');
      setSigning(null);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const reviewed = signing ? (cards.find((x) => x.id === signing.id) ?? signing) : null;
  return (
    <View style={{ gap: 16 }}>
      {!embedded && <BackBar label={league.name} fallback={`/l/${lid}`} />}
      <View style={{ gap: 6 }}>
        {tournament && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Trophy size={16} color={c.accent} />
            <Txt tone="accent" variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14 }}>{`${tournament.name}${round?.roundNo ? ` · Ronda ${round.roundNo}` : ''}`}</Txt>
          </View>
        )}
        <Txt variant="title">{title}</Txt>
        <Txt variant="meta" tone="muted">
          {round?.closed ? (
            <Txt variant="meta" tone="fg2" style={{ fontFamily: font.semibold }}>
              {'Cerrada · '}
            </Txt>
          ) : started ? (
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
              {'En juego · '}
            </Txt>
          ) : null}
          {meta}
        </Txt>
      </View>

      {!round ? (
        <Empty
          icon={<Flag size={28} color={c.accent} />}
          title="Esta ronda todavía no tiene campo"
          text={isAdmin ? 'Elige en qué campo y con qué formato se juega.' : 'El admin tiene que elegir el campo y el formato.'}
        />
      ) : (
        <>
          {myCard && !myCard.signed && !pendingGolfSign(lid, myCard.id) && !round.closed && isComplete(myCard) && tab !== 'tarjeta' && (
            <Button variant="primary" size="xl" full icon={<Signature size={20} color={c.accentFg} />} onPress={() => setSigning(myCard)}>
              Terminaste: revisa y firma tu tarjeta
            </Button>
          )}
          <Segmented<TabKey> label="Partes de la ronda" options={tabs.map((k) => ({ key: k, label: TAB_LABEL[k] }))} value={tab} onChange={setPicked} />
          {tab === 'tarjeta' ? (
            <GolfCourt round={round} cards={golf.data.cards} nameOf={nameOf} myCard={myCard} staff={staff} isAdmin={isAdmin} onSign={setSigning} />
          ) : tab === 'leaderboard' ? (
            <GolfBoard round={round} cards={cards} nameOf={nameOf} />
          ) : (
            <GolfPlayers round={round} cards={cards} players={players.data} onSign={setSigning} />
          )}
          <Sheet
            open={!!reviewed}
            onClose={() => setSigning(null)}
            title={reviewed ? `Firmar: ${nameOf(reviewed.playerId)}` : ''}
            footer={
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button disabled={busy} onPress={() => setSigning(null)} style={{ flex: 1 }}>
                  Todavía no
                </Button>
                <Button variant="primary" loading={busy} icon={<Signature size={16} color={c.accentFg} />} onPress={() => reviewed && void sign(reviewed)} style={{ flex: 1.4 }}>
                  Firmo: está correcta
                </Button>
              </View>
            }
          >
            {reviewed && <CardReview round={round} card={reviewed} />}
          </Sheet>
        </>
      )}
    </View>
  );
}

/** La tarjeta para revisarla antes de firmar (CardModal + ScoreTable de la web): hoyo, par y golpes por vuelta. */
function CardReview({ round, card }: { round: GolfRoundFull; card: GolfCardDoc }) {
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
                  cells: part.map((_, k) => (card.pickedUp[offset + k] ? '×' : (card.strokes[offset + k] ?? '·').toString() + ('•'.repeat(Math.max(0, received[offset + k] ?? 0))))),
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
