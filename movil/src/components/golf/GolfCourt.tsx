import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHoldBadgeUnlock } from '@mm/components/badges/hold';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { Check, ChevronLeft, ChevronRight, CloudOff, Flag, Hand, Maximize, Minus, Plus, Send, Signature, Sun, Undo2, X } from 'lucide-react-native';
import { courtVars, useSunMode } from '@mm/court/device';
import { strokesReceived } from '@mm/sports/golf/course';
import { scoreRound } from '@mm/sports/golf/scoring';
import { pendingGolfSign, type GolfCardDoc, type GolfRoundFull } from '@mm/lib/data/golf';
import { currentOutbox, isOnline, sentOrQueued, useOutboxSnapshot } from '@mm/lib/data/client';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import {
  canWriteCard,
  groupHolesDone,
  groupOrder,
  holeDone,
  mergeCard,
  nextGroupHole,
  reconcile,
  sendPending,
  setHole,
  shouldPublish,
  unsentCount,
  useCourtLog,
  type CardWriter,
} from '@mm/pages/sports/golf/courtLog';
import { holeWord } from '@mm/pages/sports/golf/home';
import { cardHoles, golfRoundOf, hcpText, startIndex, toParText } from '@mm/pages/sports/golf/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { Badge, Button, Card, Empty, ListRow, RowIcon, Segmented, Sheet, Txt } from '@/components/ui';
import { ColorsOverride, useColors } from '@/theme/theme';
import { font, type Colors } from '@/theme/tokens';
import { SHEET_CLOSE_MS } from './parts';

const MAX_PUTT_CHIPS = 5;

/**
 * La tarjeta del grupo en el campo (GolfCourt de la web): un teléfono anota a los 1–4 jugadores del grupo. Arriba el hoyo
 * con su par y SI, las flechas y cuántos hoyos van («Ir al hoyo»); un − / + por jugador que arranca en el par, putts
 * opcionales y «Recogió». «Hoyo listo» pone el par a quien no se tocó y pasa al siguiente hoyo del grupo. Todo se guarda
 * en el teléfono al momento (courtLog.ts, el de la web: sirve sin señal) y sale por la cola cada 3 hoyos terminados o al
 * tocar «Enviar». Con la tarjeta abierta la pantalla no se apaga.
 *
 * «Modo campo» (FieldScreen de la web): la tarjeta en pantalla completa con modo sol (alto contraste, los colores de
 * courtVars de la web; se recuerda en el teléfono) y «Hoyo listo» siempre abajo. Las dos vistas leen la misma tarjeta
 * del teléfono (useCourtLog), así lo anotado en una se ve en la otra.
 */
export function GolfCourt(props: CourtProps) {
  const [field, setField] = useState(false);
  const [sun, setSun] = useSunMode();
  const exit = () => setField(false);
  return (
    <>
      <CourtView {...props} onField={() => setField(true)} />
      <Modal visible={field} animationType="slide" presentationStyle="fullScreen" onRequestClose={exit} statusBarTranslucent>
        <ColorsOverride dark={sun ? false : undefined} colors={sun ? SUN_COLORS : undefined}>
          {field && (
            <CourtView
              {...props}
              field={{ sun, setSun: (v) => setSun(v), exit }}
              // Firmar abre su hoja en la ronda: primero se sale del modo campo.
              onSign={(card) => {
                exit();
                setTimeout(() => props.onSign(card), SHEET_CLOSE_MS);
              }}
            />
          )}
        </ColorsOverride>
      </Modal>
    </>
  );
}

/** Los colores del modo sol: los de la web (courtVars), todo en blanco y negro con el acento en negro. */
const SUN_COLORS: Partial<Colors> = (() => {
  const v = courtVars(true);
  return {
    bg: v['--bg'],
    surface: v['--surface'],
    surface2: v['--surface-2'],
    fg: v['--fg'],
    muted: v['--muted'],
    line: v['--line'],
    accent: v['--accent'],
    accentFg: v['--accent-fg'],
    accentSoft: v['--accent-soft'],
    danger: v['--danger'],
    onDanger: v['--on-danger'],
    dangerSoft: v['--danger-soft'],
    warn: v['--warn'],
    warnSoft: v['--warn-soft'],
    ok: v['--ok'],
    okSoft: v['--ok-soft'],
  };
})();

interface CourtProps {
  round: GolfRoundFull;
  cards: GolfCardDoc[];
  nameOf: (playerId: string) => string;
  myCard: GolfCardDoc | null;
  staff: boolean;
  isAdmin: boolean;
  onSign: (card: GolfCardDoc) => void;
}

/** El modo campo abierto: el modo sol y salir. */
interface FieldMode {
  sun: boolean;
  setSun: (on: boolean) => void;
  exit: () => void;
}

function CourtView({ round, cards, nameOf, myCard, staff, isAdmin, onSign, field = null, onField }: CourtProps & { field?: FieldMode | null; onField?: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { lid } = useLeagueCtx();
  // El aviso de una insignia nueva espera a que se cierre esta pantalla.
  useHoldBadgeUnlock();
  const eventId = round.eventId;
  const [log, update] = useCourtLog(eventId);
  const [sending, setSending] = useState(false);
  const [picking, setPicking] = useState(false);
  useKeepAwake();
  useOutboxSnapshot();

  const who: CardWriter = useMemo(() => ({ isAdmin, staff, myCard }), [isAdmin, staff, myCard]);
  const writable = useCallback(
    (cardId: string) => {
      const x = cards.find((y) => y.id === cardId);
      return !!x && canWriteCard(x, who);
    },
    [cards, who],
  );

  // El servidor ya trae lo enviado: se limpia del teléfono.
  useEffect(() => {
    if (cards.length) update((l) => reconcile(l, cards, Date.now(), (x) => isAdmin || !x.signed));
  }, [cards, update, isAdmin]);

  const merged = useMemo(() => cards.map((x) => mergeCard(x, log)), [cards, log]);
  const scopes = useMemo(() => {
    if (staff) {
      const groups = [...new Set(cards.map((x) => x.groupNo).filter((g): g is number => g != null))].sort((a, b) => a - b);
      return [...groups.map((g) => ({ key: `g:${g}`, label: `Grupo ${g}` })), ...cards.filter((x) => x.groupNo == null).map((x) => ({ key: `c:${x.id}`, label: nameOf(x.playerId) }))];
    }
    if (!myCard) return [];
    return [myCard.groupNo != null ? { key: `g:${myCard.groupNo}`, label: `Grupo ${myCard.groupNo}` } : { key: `c:${myCard.id}`, label: 'Mi tarjeta' }];
  }, [staff, cards, myCard, nameOf]);
  const mine = myCard ? (myCard.groupNo != null ? `g:${myCard.groupNo}` : `c:${myCard.id}`) : null;
  const scope = log.scope && scopes.some((s) => s.key === log.scope) ? log.scope : mine && scopes.some((s) => s.key === mine) ? mine : (scopes[0]?.key ?? null);
  const inScope = useCallback((x: GolfCardDoc) => (scope?.startsWith('g:') ? x.groupNo === Number(scope.slice(2)) : x.id === scope?.slice(2)), [scope]);
  const group = useMemo(
    () => merged.filter(inScope).sort((a, b) => (a.id === myCard?.id ? -1 : b.id === myCard?.id ? 1 : nameOf(a.playerId).localeCompare(nameOf(b.playerId)))),
    [merged, inScope, myCard, nameOf],
  );
  const serverGroup = useMemo(() => cards.filter(inScope), [cards, inScope]);
  const n = group[0]?.strokes.length ?? round.holes;
  const order = useMemo(() => groupOrder(n, startIndex(round, group[0]?.startHole ?? 1)), [n, round, group]);
  const pendingHole = nextGroupHole(group, order);
  const current = log.hole != null && log.hole >= 0 && log.hole < n ? log.hole : (pendingHole ?? order[0] ?? 0);
  const unsent = unsentCount(log, writable);
  const doneCount = groupHolesDone(group, n);

  const publish = useCallback(() => {
    try {
      const wait = sendPending(lid, eventId, cards, who);
      if (!wait) {
        void currentOutbox()?.flush();
        return;
      }
      wait.catch((e: unknown) => toast(saveErrorMessage(e), 'error'));
      if (!isOnline()) return;
      setSending(true);
      void sentOrQueued(wait)
        .catch(() => undefined)
        .finally(() => setSending(false));
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  }, [cards, eventId, lid, who]);

  if (!scopes.length) {
    const empty = (
      <Empty
        icon={<Hand size={28} color={c.accent} />}
        title={staff ? 'Todavía no hay inscritos' : 'No llevas ninguna tarjeta'}
        text={staff ? 'Inscribe a los jugadores en «Jugadores».' : 'Inscríbete en la ronda (en «Jugadores») para anotar la de tu grupo.'}
      />
    );
    // En el modo campo (si se quedó sin tarjetas mientras estaba abierto), con su ✕ para salir.
    if (!field) return empty;
    return (
      <View style={{ flex: 1, gap: 16, padding: 12, paddingTop: insets.top + 8, backgroundColor: c.bg }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Salir del modo campo" onPress={field.exit} style={[styles.round, { backgroundColor: c.surface2 }]}>
          <X size={20} color={c.fg2} />
        </Pressable>
        {empty}
      </View>
    );
  }

  const holesOf = (x: GolfCardDoc) => cardHoles(round, x.teeId);
  const head = group[0] ? holesOf(group[0])[current] : null;
  const signing = (x: GolfCardDoc) => !x.signed && pendingGolfSign(lid, x.id);
  const canEdit = (x: GolfCardDoc) => isAdmin || (!x.signed && !signing(x));
  const set = (x: GolfCardDoc, value: { s: number | null; p: number | null; u: boolean }) => update((l) => setHole(l, x.id, current, value));
  const goTo = (i: number | null) => update((l) => ({ ...l, hole: i }));

  function finishHole() {
    const before = doneCount;
    let publishNow = false;
    update((l) => {
      let x = l;
      for (const card of group) {
        if (!canEdit(card) || holeDone(card, current)) continue;
        x = setHole(x, card.id, current, { s: holesOf(card)[current]?.par ?? 4, p: card.putts[current] ?? null, u: false });
      }
      const now = serverGroup.map((card) => mergeCard(card, x));
      publishNow = shouldPublish(before, groupHolesDone(now, n), n);
      return { ...x, hole: nextGroupHole(now, order, current) ?? current };
    });
    if (publishNow) publish();
  }

  const finished = pendingHole == null && group.length > 0;
  const step = (dir: 1 | -1) => {
    const pos = order.indexOf(current);
    goTo(order[(pos + dir + order.length) % order.length]);
  };
  const scopeLabel = scopes.find((x) => x.key === scope)?.label ?? '';
  const nextNum = (() => {
    const nx = nextGroupHole(
      group.map((x) => (holeDone(x, current) ? x : { ...x, strokes: x.strokes.map((v, i) => (i === current ? 1 : v)) })),
      order,
      current,
    );
    return nx != null && group[0] ? holesOf(group[0])[nx]?.number : null;
  })();
  const mineInGroup = myCard ? (group.find((x) => x.id === myCard.id) ?? null) : null;
  const canSignMine = !!mineInGroup && !mineInGroup.signed && !signing(mineInGroup);
  const holeNum = head?.number ?? current + 1;
  const pct = n ? Math.round((doneCount / n) * 100) : 0;

  const changeScope = (k: string) => update((l) => ({ ...l, scope: k, hole: null }));
  const chips =
    scopes.length > 1 ? <Segmented label="Qué grupo anotas" options={scopes.map((s) => ({ key: s.key, label: s.label }))} value={scope ?? ''} onChange={changeScope} /> : null;

  const holeCard = (
    <Card style={{ gap: field ? 8 : 12, paddingVertical: field ? 12 : 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Hoyo anterior" onPress={() => step(-1)} style={[styles.arrow, { backgroundColor: c.surface2 }]}>
          <ChevronLeft size={24} color={c.fg2} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Hoyo ${holeNum}, par ${head?.par ?? '–'}. Ir al hoyo`} onPress={() => setPicking(true)} style={{ flex: 1, alignItems: 'center' }}>
          <Txt style={{ color: c.accent, fontFamily: font.semibold, fontSize: 13, letterSpacing: 1 }}>HOYO</Txt>
          <Txt style={{ fontFamily: font.bold, fontSize: 44, lineHeight: 48 }}>{holeNum}</Txt>
          <Txt variant="meta" tone="fg2">
            Par <Txt variant="meta" style={{ fontFamily: font.bold }}>{head?.par ?? '–'}</Txt> · SI <Txt variant="meta" style={{ fontFamily: font.bold }}>{head?.si ?? '–'}</Txt>
          </Txt>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Hoyo siguiente" onPress={() => step(1)} style={[styles.arrow, { backgroundColor: c.surface2 }]}>
          <ChevronRight size={24} color={c.fg2} />
        </Pressable>
      </View>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt tone="muted" style={{ fontSize: 13 }}>{`${doneCount} de ${n} hoyos${scopes.length === 1 && scopeLabel ? ` · ${scopeLabel}` : ''}`}</Txt>
          <Pressable accessibilityRole="button" onPress={() => setPicking(true)} hitSlop={10}>
            <Txt tone="accent" style={{ fontSize: 13, fontFamily: font.semibold }}>
              Ir al hoyo
            </Txt>
          </Pressable>
        </View>
        <View style={[styles.track, { backgroundColor: `${c.accent}26` }]}>
          <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: c.accent }} />
        </View>
      </View>
    </Card>
  );

  const players = group.map((card) => {
    const holes = holesOf(card);
    const h = holes[current];
    const rec = strokesReceived(card.playingHcp, holes.map((x) => x.si))[current] ?? 0;
    const s = card.strokes[current];
    const picked = !!card.pickedUp[current];
    const shown = s ?? h?.par ?? 4;
    const score = scoreRound(golfRoundOf(round, card), round.competition);
    const editable = canEdit(card);
    const setStrokes = (v: number) => {
      const p = card.putts[current];
      set(card, { s: v, p: p != null && p < v ? p : null, u: false });
    };
    const pickUp = async () => {
      if (round.competition.format === 'stroke') {
        const ok = await confirmAsync({
          title: '¿Recogió la bola?',
          message: 'En stroke play no terminar un hoyo descalifica de la ronda (no hay total). Si fue un error, se deshace.',
          confirmText: 'Sí, recogió',
        });
        if (!ok) return;
      }
      set(card, { s: null, p: null, u: true });
    };
    const main = round.competition.format === 'stableford' ? `${score.points} pts` : toParText(round.competition.basis === 'net' ? score.netToPar : score.toPar);
    return (
      <Card key={card.id} style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {nameOf(card.playerId)}
              </Txt>
              {card.signed ? <Badge tone="ok">Firmada</Badge> : signing(card) ? <Badge tone="ok">Firmada · por enviar</Badge> : null}
              {h && group[0] && h.par !== holesOf(group[0])[current]?.par && <Badge>{`Par ${h.par}`}</Badge>}
            </View>
            <Txt tone="muted" style={{ fontSize: 13 }}>
              {`Hcp ${hcpText(card.playingHcp)}`}
              {rec > 0 && <Txt tone="accent" style={{ fontSize: 13 }}>{` · ${rec === 1 ? 'recibe 1 golpe aquí' : `recibe ${rec} golpes aquí`}`}</Txt>}
              {rec < 0 && ` · devuelve ${Math.abs(rec)} aquí`}
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Txt style={{ fontFamily: font.bold, fontSize: 20, fontVariant: ['tabular-nums'] }}>{main}</Txt>
            {!picked && (
              <Pressable accessibilityRole="button" disabled={!editable} onPress={() => void pickUp()} hitSlop={8}>
                <Txt tone="muted" style={{ fontSize: 13, fontFamily: font.semibold }}>
                  Recogió
                </Txt>
              </Pressable>
            )}
          </View>
        </View>

        {picked ? (
          <View style={[styles.picked, { backgroundColor: c.warnSoft }]}>
            <Txt style={{ color: c.warn, fontFamily: font.semibold, flex: 1 }}>Recogió en este hoyo</Txt>
            <Button disabled={!editable} icon={<Undo2 size={16} color={c.fg} />} onPress={() => set(card, { s: h?.par ?? 4, p: null, u: false })}>
              Deshacer
            </Button>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Un golpe menos a ${nameOf(card.playerId)}`}
              disabled={!editable || shown <= 1}
              onPress={() => setStrokes(Math.max(1, shown - 1))}
              style={[styles.key, { backgroundColor: c.surface2, opacity: !editable || shown <= 1 ? 0.4 : 1 }]}
            >
              <Minus size={24} color={c.fg} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${shown} golpes${s == null ? ', el par: toca para dejarlo' : ''}`}
              disabled={!editable}
              onPress={() => s == null && setStrokes(shown)}
              style={[styles.value, s == null ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.faint } : { backgroundColor: c.surface2 }]}
            >
              <Txt style={{ fontFamily: font.bold, fontSize: 30, lineHeight: 34, color: s == null ? c.muted : c.fg }}>{shown}</Txt>
              <Txt tone="muted" style={{ fontSize: 11 }}>
                {s == null ? 'par (toca para dejarlo)' : holeWord(s, h?.par ?? s)}
              </Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Un golpe más a ${nameOf(card.playerId)}`}
              disabled={!editable || shown >= 20}
              onPress={() => setStrokes(Math.min(20, shown + 1))}
              style={[styles.key, { backgroundColor: c.surface2, opacity: !editable || shown >= 20 ? 0.4 : 1 }]}
            >
              <Plus size={24} color={c.fg} />
            </Pressable>
          </View>
        )}

        {!picked && log.putts && (
          <View accessibilityLabel="Putts" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Txt tone="muted" style={{ fontSize: 13 }}>
              Putts
            </Txt>
            {Array.from({ length: MAX_PUTT_CHIPS }, (_, p) => {
              const active = card.putts[current] === p;
              return (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !editable || p >= shown }}
                  disabled={!editable || p >= shown}
                  onPress={() => set(card, { s: s ?? shown, p: active ? null : p, u: false })}
                  style={[styles.putt, { backgroundColor: active ? c.accent : c.surface2, opacity: !editable || p >= shown ? 0.4 : 1 }]}
                >
                  <Txt style={{ fontFamily: font.semibold, color: active ? c.accentFg : c.fg }}>{p}</Txt>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>
    );
  });

  const signMine =
    canSignMine && mineInGroup ? (
      <Button variant="primary" size="xl" full icon={<Signature size={20} color={c.accentFg} />} onPress={() => onSign(mineInGroup)}>
        Revisar y firmar mi tarjeta
      </Button>
    ) : null;

  const doneCard = finished ? (
    <Card style={{ alignItems: 'center', gap: 10, backgroundColor: c.accentSoft }}>
      <Txt variant="cardTitle" style={{ textAlign: 'center' }}>{`¡Terminaron los ${n} hoyos!`}</Txt>
      <Txt variant="meta" tone="fg2" style={{ textAlign: 'center' }}>
        Envía las tarjetas y que cada uno revise y firme la suya.
      </Txt>
      {!field && signMine}
    </Card>
  ) : null;

  const holeReady = !finished ? (
    <Button variant="primary" size="xl" full icon={<Check size={20} color={c.accentFg} />} onPress={finishHole}>
      {`Hoyo listo${nextNum ? ` → hoyo ${nextNum}` : ''}`}
    </Button>
  ) : null;

  const offline = !isOnline();
  const unsentText = unsent ? (unsent === 1 ? '1 hoyo por enviar' : `${unsent} hoyos por enviar`) : 'Todo enviado';
  const sendButton =
    unsent > 0 || sending ? (
      <Button loading={sending} icon={<Send size={16} color={c.fg} />} onPress={publish}>
        Enviar
      </Button>
    ) : null;
  const puttsRow = (
    <View style={styles.row}>
      <Flag size={20} color={c.accent} />
      <Txt variant="bodyStrong" style={{ flex: 1 }}>
        Anotar putts
      </Txt>
      <Switch accessibilityLabel="Anotar putts" value={log.putts} onValueChange={(v) => update((l) => ({ ...l, putts: v }))} trackColor={{ true: c.accent, false: c.surface2 }} />
    </View>
  );

  const picker = (
    <Sheet open={picking} onClose={() => setPicking(false)} title="Ir al hoyo" subtitle={`${doneCount} de ${n} hoyos listos`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: n }, (_, i) => {
          const all = group.every((x) => holeDone(x, i));
          const some = group.some((x) => holeDone(x, i));
          const num = group[0] ? holesOf(group[0])[i]?.number : i + 1;
          const on = i === current;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Hoyo ${num}${all ? ', listo' : some ? ', a medias' : ''}`}
              onPress={() => {
                goTo(i);
                setPicking(false);
              }}
              style={[
                styles.holeChip,
                on ? { backgroundColor: c.accent } : all ? { backgroundColor: c.accentSoft } : some ? { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.accent } : { backgroundColor: c.surface2 },
              ]}
            >
              <Txt style={{ fontFamily: font.bold, fontSize: 17, color: on ? c.accentFg : all || some ? c.accent : c.fg2 }}>{num}</Txt>
            </Pressable>
          );
        })}
      </View>
      <Txt tone="muted" style={{ fontSize: 13, marginTop: 10 }}>
        En color, los hoyos listos; punteados, los que van a medias.
      </Txt>
    </Sheet>
  );

  // El modo campo: arriba el hoyo; los jugadores se desplazan; «Hoyo listo» (o firmar) y lo que falta enviar, abajo.
  if (field) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[styles.fieldBar, { paddingTop: insets.top + 8, borderBottomColor: c.line }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Salir del modo campo" onPress={field.exit} style={[styles.round, { backgroundColor: c.surface2 }]}>
            <X size={20} color={c.fg2} />
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 4 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>
              {round.courseName || 'Tarjeta'}
            </Txt>
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
              {[scopeLabel, `${doneCount} de ${n} hoyos`].filter(Boolean).join(' · ')}
            </Txt>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={field.sun ? 'Quitar modo sol' : 'Modo sol (alto contraste)'}
            accessibilityState={{ selected: field.sun }}
            onPress={() => field.setSun(!field.sun)}
            style={[styles.round, { backgroundColor: field.sun ? c.accent : c.surface2 }]}
          >
            <Sun size={20} color={field.sun ? c.accentFg : c.fg2} />
          </Pressable>
        </View>
        <View style={{ gap: 10, paddingHorizontal: 12, paddingTop: 12 }}>
          {chips}
          {holeCard}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, padding: 12 }} keyboardShouldPersistTaps="handled">
          {players}
          {doneCard}
          <Card padded={false}>{puttsRow}</Card>
        </ScrollView>
        <View style={[styles.fieldFooter, { paddingBottom: Math.max(insets.bottom, 8), borderTopColor: c.line, backgroundColor: c.bg }]}>
          {finished ? signMine : holeReady}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              {offline && unsent > 0 && <CloudOff size={16} color={c.muted} />}
              <Txt style={{ fontSize: 13, color: unsent ? c.muted : c.ok }}>{unsentText}</Txt>
            </View>
            {sendButton}
          </View>
        </View>
        {picker}
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {onField && (
        <Card padded={false}>
          <ListRow
            icon={
              <RowIcon>
                <Maximize size={20} color={c.accent} />
              </RowIcon>
            }
            title="Modo campo"
            subtitle="Pantalla completa, siempre encendida y con modo sol"
            onPress={onField}
          />
        </Card>
      )}
      {chips}
      {holeCard}
      {players}
      {finished ? doneCard : holeReady}
      <Card padded={false}>
        <View style={styles.row}>
          {offline && unsent ? <CloudOff size={20} color={c.accent} /> : <Send size={20} color={unsent ? c.accent : c.muted} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyStrong" style={!unsent ? { color: c.ok } : undefined}>
              {unsentText}
            </Txt>
            <Txt tone="muted" style={{ fontSize: 13 }}>
              Guardado en tu teléfono · sale solo cada 3 hoyos
            </Txt>
          </View>
          {sendButton}
        </View>
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>{puttsRow}</View>
      </Card>
      {picker}
    </View>
  );
}

const styles = StyleSheet.create({
  arrow: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  key: { width: 58, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  value: { flex: 1, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  putt: { width: 40, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingVertical: 8, paddingLeft: 16, paddingRight: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingHorizontal: 16, paddingVertical: 10 },
  holeChip: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fieldBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  fieldFooter: { gap: 8, paddingHorizontal: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
