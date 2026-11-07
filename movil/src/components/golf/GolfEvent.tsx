import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { Flag, Settings2, Signature, Trophy } from 'lucide-react-native';
import { useEvent, usePlayers } from '@mm/lib/data';
import { pendingGolfSign, queueGolfSign, useGolfEvent, useGolfTournaments, type GolfCardDoc } from '@mm/lib/data/golf';
import { sentOrQueued } from '@mm/lib/data/client';
import { streamFor, useLeagueStreams } from '@mm/lib/data/streams';
import { saveErrorMessage } from '@mm/lib/errorText';
import { eventLabel, toIsoDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { formatTime } from '@mm/lib/schedule';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { eventDay } from '@mm/components/event/eventDay';
import { liveHref } from '@mm/components/live/logic';
import { cardWire, markSent, mergeCard, sendPending, useCourtLog } from '@mm/pages/sports/golf/courtLog';
import { formatLabel, holesDone, isComplete, nineLabel } from '@mm/pages/sports/golf/logic';
import { toast } from '@/components/feedback';
import { BackBar, Button, Empty, LoadError, Loading, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { CardReview } from './CardReview';
import { GolfBoard } from './GolfBoard';
import { GolfCourt } from './GolfCourt';
import { GolfEventMenu } from './GolfEventMenu';
import { GolfPlayers } from './GolfPlayers';
import { RoundForm } from './RoundForm';
import { GolfPrizes } from '@/components/prizes/SportPrizes';
import { GolfReport } from '@/components/tournamentReport/SportReports';

type TabKey = 'tarjeta' | 'leaderboard' | 'jugadores';
const TAB_LABEL: Record<TabKey, string> = { tarjeta: 'Tarjeta', leaderboard: 'Leaderboard', jugadores: 'Jugadores' };

/**
 * Una ronda de golf (GolfEvent de la web): el título y una línea con el día, la hora, el campo (en Lite, si no es el de
 * siempre de la liga; en Pro, siempre), el formato y, en Pro, «salida simultánea» (y «En juego» o «Cerrada»), y las
 * partes de la ronda: Tarjeta (la del grupo, en el campo) · Leaderboard · Jugadores. Al
 * terminar, «Revisa y firma tu tarjeta». Abajo, el reporte (PDF o Excel) y los premios. «•••» (GolfEventMenu):
 * compartir, publicar tu tarjeta, transmitir y, para el admin, campo y formato, anotadores, cerrar la ronda y eliminarla.
 */
export function GolfEventBody({ eventId, embedded = false }: { eventId: string; embedded?: boolean }) {
  const c = useColors();
  const { lid, league, isAdmin, member, myPlayerId } = useLeagueCtx();
  const isPro = useIsPro();
  const params = useLocalSearchParams<{ tab?: string }>();
  const event = useEvent(lid, eventId);
  const golf = useGolfEvent(lid, eventId);
  const players = usePlayers(lid);
  const tournaments = useGolfTournaments(lid);
  const streams = useLeagueStreams(lid).data ?? [];
  const [log, updateLog] = useCourtLog(eventId);
  const [picked, setPicked] = useState<TabKey | null>(null);
  const [signing, setSigning] = useState<GolfCardDoc | null>(null);
  const [busy, setBusy] = useState(false);
  // «Campo y formato» (o «Elegir campo»), del admin.
  const [editing, setEditing] = useState(false);
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
  const stream = streamFor(streams, { eventId });

  const tabs: TabKey[] = round ? [...(!round.closed && (staff || myCard) ? ['tarjeta' as const] : []), 'leaderboard', 'jugadores'] : [];
  const fallback: TabKey =
    tabs.includes('tarjeta') && (ev.date === today || (myCard && holesDone(myCard) > 0)) ? 'tarjeta' : started || round?.closed ? 'leaderboard' : 'jugadores';
  const requested = (picked ?? params.tab) as TabKey | undefined;
  const tab: TabKey = requested && tabs.includes(requested) ? requested : tabs.includes(fallback) ? fallback : 'leaderboard';

  const meta = [
    eventDay(ev.date, today, isPro),
    ev.startTime ? formatTime(ev.startTime.slice(0, 5)) : null,
    // El campo, si no es el de siempre de la liga (o en Pro).
    round && (isPro || round.courseName !== league.venue) ? round.courseName : null,
    round ? (round.nine === 'all' ? formatLabel(round.competition) : `${nineLabel(round.nine, round.holes)} · ${formatLabel(round.competition)}`) : null,
    isPro && round?.shotgun ? 'salida simultánea' : null,
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
  // «•••»: arriba a la derecha (como portada de un torneo sin liga, junto al título).
  const more = (
    <GolfEventMenu
      eventId={eventId}
      event={ev}
      title={title}
      round={round}
      cards={cards}
      serverCards={golf.data.cards}
      myCard={myCard}
      embedded={embedded}
      onEdit={() => setEditing(true)}
    />
  );
  return (
    <View style={{ gap: 16 }}>
      {!embedded && <BackBar label={league.name} fallback={`/l/${lid}`} right={more} />}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
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
          {/* Si la ronda se está transmitiendo: «Ver en vivo» (LiveWatchPill de la web). */}
          {!embedded && stream && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Ver en vivo"
              onPress={() => router.push(liveHref(lid, stream.id) as Href)}
              style={({ pressed }) => [styles.live, { backgroundColor: c.danger, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.onDanger }} />
              <Txt style={{ fontSize: 14, fontFamily: font.bold, color: c.onDanger }}>Ver en vivo</Txt>
            </Pressable>
          )}
        </View>
        {embedded && more}
      </View>

      {!round ? (
        <Empty
          icon={<Flag size={28} color={c.accent} />}
          title="Esta ronda todavía no tiene campo"
          text={isAdmin ? 'Elige en qué campo y con qué formato se juega.' : 'El admin tiene que elegir el campo y el formato.'}
          action={
            isAdmin ? (
              <Button variant="primary" size="lg" icon={<Settings2 size={20} color={c.accentFg} />} onPress={() => setEditing(true)}>
                Elegir campo
              </Button>
            ) : undefined
          }
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
          {/* El reporte (la tarjeta para el admin al terminar; para todos, la fila) y los premios, debajo de las partes. */}
          <GolfReport eventId={eventId} name={ev.name} date={ev.date} title={title} round={round} cards={cards} nameOf={nameOf} loading={players.loading} />
          <GolfPrizes eventId={eventId} name={ev.name} date={ev.date} round={round} cards={golf.data.cards} tournamentName={tournament?.name} nameOf={nameOf} />
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
      {isAdmin && <RoundForm open={editing} onClose={() => setEditing(false)} edit={{ eventId, round, started }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  live: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 18, paddingHorizontal: 14, marginTop: 4 },
});
