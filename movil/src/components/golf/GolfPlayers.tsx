import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Signature, UserPlus, Users } from 'lucide-react-native';
import { handicapFor, isValidIndex, MAX_INDEX, MIN_INDEX } from '@mm/sports/golf/course';
import { pendingGolfSign, registerGolf, setGolfIndex, unregisterGolf, useGolfIndexes, type GolfCardDoc, type GolfRoundFull } from '@mm/lib/data/golf';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import type { Player } from '@mm/lib/types';
import { hcpText, holesDone, indexInput, indexText, isComplete, parseIndex } from '@mm/pages/sports/golf/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { Badge, Button, Card, ChoiceRow, Empty, Field, Input, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/** De dónde sale el handicap (HcpExplain de la web): Index → handicap de campo → handicap de juego. */
function hcpLine(round: GolfRoundFull, teeId: string, index: number | null): string | null {
  if (index == null) return 'Sin Index: juega con handicap 0 (en neto cuenta como bruto).';
  try {
    const info = handicapFor(index, round.course, teeId, { nine: round.nine, allowance: round.competition.allowance });
    return `Index ${indexText(index)} (no oficial) → handicap de campo ${hcpText(info.courseHcpRounded)} → handicap de juego ${hcpText(info.playingHcp)} (${info.allowance} %)${info.holes === 9 ? ', a 9 hoyos' : ''}${info.estimated ? '. Rating de 9 hoyos estimado.' : '.'}`;
  } catch {
    return null;
  }
}

/** La salida (tees) para elegir (TeeSelect de la web). */
function TeePicker({ round, value, onChange, disabled }: { round: GolfRoundFull; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <Card padded={false}>
      {round.course.tees.map((t) => (
        <ChoiceRow key={t.id} title={t.name} subtitle={`${t.rating} / ${t.slope} · par ${t.par}`} selected={t.id === value} onPress={() => !disabled && onChange(t.id)} />
      ))}
    </Card>
  );
}

/** Inscribirme: salida e Index (el del perfil, que se puede cambiar). El Index queda congelado en la tarjeta. */
function RegisterCard({ round, playerId }: { round: GolfRoundFull; playerId: string }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const indexes = useGolfIndexes(lid);
  const saved = indexes.data[playerId]?.index ?? null;
  const [tee, setTee] = useState(round.course.tees[0]?.id ?? '');
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = text ?? indexInput(saved);
  const index = parseIndex(shown);
  const bad = index != null && !isValidIndex(index);

  async function go() {
    if (bad || busy) return;
    setBusy(true);
    try {
      await registerGolf(lid, round.eventId, { teeId: tee, index });
      if (index !== saved) await setGolfIndex(lid, playerId, index);
      toast('Inscrito en la ronda');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const line = !bad ? hcpLine(round, tee, index) : null;
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ gap: 4 }}>
        <Txt variant="cardTitle">Inscríbete en la ronda</Txt>
        <Txt variant="meta" tone="muted">
          Tu salida y tu Index: con eso sale tu handicap de juego.
        </Txt>
      </View>
      <Field label="Salida (tees)">
        <TeePicker round={round} value={tee} onChange={setTee} />
      </Field>
      <Field label="Handicap Index (no oficial)" hint="El de FEDOGOLF o GHIN. Plus: +1.2. Vacío = sin Index." error={bad}>
        <Input keyboardType="numbers-and-punctuation" value={shown} onChangeText={setText} placeholder="Ej.: 14.2" invalid={bad} />
      </Field>
      {bad ? (
        <Txt tone="danger" style={{ fontSize: 12 }}>{`El Index va de +${Math.abs(MIN_INDEX)} a ${MAX_INDEX}.`}</Txt>
      ) : line ? (
        <Txt tone="muted" style={{ fontSize: 12 }}>
          {line}
        </Txt>
      ) : null}
      <Button variant="primary" size="xl" full icon={<UserPlus size={20} color={c.accentFg} />} onPress={() => void go()} loading={busy} disabled={bad || !tee}>
        Inscribirme
      </Button>
    </Card>
  );
}

/** Mi tarjeta en la ronda: salida, handicap, cambiar la salida antes de anotar, salirme y firmar. */
function MyCard({ round, card, onSign }: { round: GolfRoundFull; card: GolfCardDoc; onSign: (card: GolfCardDoc) => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const [busy, setBusy] = useState<'salida' | 'salir' | null>(null);
  const started = holesDone(card) > 0 || !!card.scoredAt;
  const signing = !card.signed && pendingGolfSign(lid, card.id);
  const locked = round.closed || card.signed || started;
  const tee = round.course.tees.find((t) => t.id === card.teeId);
  const line = hcpLine(round, card.teeId, card.hcpIndex);

  async function act(kind: 'salida' | 'salir', fn: () => Promise<unknown>, done: string) {
    setBusy(kind);
    try {
      await fn();
      toast(done);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="cardTitle">Mi tarjeta</Txt>
        {card.signed ? (
          <Badge tone="ok">Firmada</Badge>
        ) : signing ? (
          <Badge tone="ok">Firmada · por enviar</Badge>
        ) : isComplete(card) ? (
          <Badge tone="warn">Falta firmar</Badge>
        ) : (
          <Badge>{`${holesDone(card)} hoyos`}</Badge>
        )}
      </View>
      {locked ? (
        <View>
          <Txt variant="meta">
            <Txt variant="meta" tone="muted">
              {'Salida: '}
            </Txt>
            {tee ? `${tee.name} · ${tee.rating} / ${tee.slope} · par ${tee.par}` : card.teeId}
          </Txt>
          {!round.closed && !card.signed && (
            <Txt tone="muted" style={{ fontSize: 12 }}>
              Ya anotaste: la salida no cambia (pídeselo al admin).
            </Txt>
          )}
        </View>
      ) : (
        <Field label="Salida (tees)">
          <TeePicker
            round={round}
            value={card.teeId}
            disabled={!!busy}
            onChange={(teeId) => void act('salida', () => registerGolf(lid, round.eventId, { teeId }), 'Salida cambiada')}
          />
        </Field>
      )}
      {!!line && (
        <Txt tone="muted" style={{ fontSize: 12 }}>
          {line}
        </Txt>
      )}
      {!card.signed && !signing && isComplete(card) && !round.closed && (
        <Button variant="primary" size="xl" full icon={<Signature size={20} color={c.accentFg} />} onPress={() => onSign(card)}>
          Revisar y firmar
        </Button>
      )}
      {!locked && (
        <Button
          loading={busy === 'salir'}
          disabled={!!busy}
          onPress={async () => {
            if (await confirmAsync({ title: '¿Salirte de la ronda?', confirmText: 'Salirme', danger: true })) {
              await act('salir', () => unregisterGolf(lid, round.eventId, card.id), 'Saliste de la ronda');
            }
          }}
        >
          Salirme
        </Button>
      )}
    </Card>
  );
}

/**
 * Jugadores de la ronda (GolfPlayers de la web, Lite): inscribirme (con salida e Index) o mi tarjeta arriba, y los grupos
 * como filas («Grupo 1 · sale por el hoyo 1»). Inscribir a otros y armar grupos, en la web.
 */
export function GolfPlayers({ round, cards, players, onSign }: { round: GolfRoundFull; cards: GolfCardDoc[]; players: Player[]; onSign: (card: GolfCardDoc) => void }) {
  const c = useColors();
  const { isAdmin, myPlayerId } = useLeagueCtx();
  const nameOf = (pid: string) => players.find((p) => p.id === pid)?.name ?? '(jugador borrado)';
  const myCard = myPlayerId ? (cards.find((x) => x.playerId === myPlayerId) ?? null) : null;
  const open = !round.closed;
  const groups = useMemo(() => {
    const m = new Map<number | null, GolfCardDoc[]>();
    for (const x of cards) m.set(x.groupNo, [...(m.get(x.groupNo) ?? []), x]);
    return [...m.entries()].sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : a - b));
  }, [cards]);
  const teeName = (id: string) => round.course.tees.find((t) => t.id === id)?.name ?? id;
  const statusOf = (x: GolfCardDoc) =>
    x.dq ? <Badge tone="danger">Descalificado</Badge> : x.signed ? <Badge tone="ok">Firmada</Badge> : holesDone(x) ? <Badge>{isComplete(x) ? 'Sin firmar' : `${holesDone(x)} hoyos`}</Badge> : null;

  return (
    <View style={{ gap: 22 }}>
      {open && myPlayerId && !myCard && <RegisterCard round={round} playerId={myPlayerId} />}
      {myCard && <MyCard round={round} card={myCard} onSign={onSign} />}
      {!cards.length ? (
        <Empty
          icon={<Users size={28} color={c.accent} />}
          title="Nadie inscrito todavía"
          text={isAdmin ? 'Inscribe a los jugadores o comparte la ronda para que cada quien se inscriba.' : 'Inscríbete arriba con tu salida y tu Index.'}
        />
      ) : (
        groups.map(([g, list]) => (
          <View key={String(g)} style={{ gap: 8 }}>
            <SectionHeader
              title={g == null ? 'Sin grupo' : `Grupo ${g}`}
              action={
                g != null ? (
                  <Txt variant="meta" tone="muted">
                    {`sale por el hoyo ${list[0].startHole}`}
                  </Txt>
                ) : undefined
              }
            />
            <Card padded={false} style={{ overflow: 'hidden' }}>
              {[...list]
                .sort((a, b) => nameOf(a.playerId).localeCompare(nameOf(b.playerId)))
                .map((x, i) => {
                  const me = x.playerId === myPlayerId;
                  return (
                    <View key={x.id} style={[styles.row, { backgroundColor: me ? c.accentSoft : 'transparent' }, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>
                          {nameOf(x.playerId)}
                          {me ? <Txt tone="accent" style={{ fontSize: 13 }}>{'  Tú'}</Txt> : null}
                        </Txt>
                        <Txt variant="meta" tone="muted" numberOfLines={1}>{`${teeName(x.teeId)} · Index ${indexText(x.hcpIndex)} · Hcp ${hcpText(x.playingHcp)}`}</Txt>
                      </View>
                      {statusOf(x)}
                    </View>
                  );
                })}
            </Card>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 10 },
});
