import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Minus, Plus, Undo2, X } from 'lucide-react-native';
import { bitCount, maxPossibleScore, maxPossibleWithHole, replaceRoll, scoreGame, standingMask, standingNow } from '@mm/lib/bowling';
import { ballDetail, ballForGame, draftBallsAfter, pickableBalls } from '@mm/lib/balls';
import { loadDraft, saveDraft } from '@mm/lib/draft';
import { isValidScore } from '@mm/lib/stats';
import { useBallChoice } from '@mm/components/balls/choice';
import { forgetAfterSave, gameKey, pendingDraft, rememberGame } from '@mm/components/frames/draftMemory';
import { editorValue, setPreferredMode, startState, type ScoreMode, type ScoreValue } from '@mm/components/frames/editorLogic';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { toast } from '../feedback';
import { Button, Input, Screen, Segmented, Txt } from '../ui';
import { FramesSheet } from './FramesSheet';
import { Keypad } from './Keypad';
import { PinDeck } from './PinDeck';

const pinos = (n: number) => (n === 1 ? '1 pino' : `${n} pinos`);

/**
 * Anotar un juego (la hoja de anotar de la web: src/components/frames/FrameEditor.tsx + ScoreEntryModal), con la misma
 * lógica compartida y las mismas 3 formas (recuerda la última):
 * - Pines: se tocan los pinos que cayeron en cada tiro.
 * - Teclado: cada tiro (solo se encienden las teclas que valen). Tocar un tiro de la hoja lo corrige; dejarlo
 *   presionado lo borra.
 * - Total: solo el puntaje final.
 * Arriba, la bola del juego (si la cuenta tiene bolas). Cada tiro queda en el teléfono (draftMemory): si se sale a
 * mitad, «Seguir mi juego N» sigue donde se dejó. Al guardar, el juego pasa a «Tus juegos» (src/lib/draft.ts).
 */
export function ScoreEditor({ lid, eventId, index, playerId, place }: { lid: string; eventId: string; index: number; playerId: string; place: string }) {
  const ballChoice = useBallChoice();
  // Lo guardado de ese juego en «Tus juegos» (o nada todavía).
  const initial = useMemo<ScoreValue>(() => {
    const d = loadDraft(lid, playerId, eventId);
    const typed = d?.values[index]?.trim();
    return { score: typed ? Number(typed) : null, frames: d?.frames?.[index] ?? null };
  }, [lid, playerId, eventId, index]);
  // La bola del juego: la que ya tenía (o la del juego anterior, o la última que usó).
  const startBall = ballChoice.canPick ? ballForGame(loadDraft(lid, playerId, eventId)?.balls, index, ballChoice.auto) : undefined;

  function save(value: { score: number; frames: ScoreValue['frames'] }, picked: string | null | undefined) {
    const d = loadDraft(lid, playerId, eventId);
    const count = Math.max(d?.values.length ?? 0, index + 1);
    const values = Array.from({ length: count }, (_, j) => d?.values[j] ?? '');
    values[index] = String(value.score);
    const frames = { ...(d?.frames ?? {}) };
    if (value.frames) frames[String(index)] = value.frames;
    else delete frames[String(index)];
    // La bola solo si salió arriba (con la lista de bolas leída): si no, la de ese juego no se toca.
    const balls = draftBallsAfter(d?.balls, index, value, picked);
    saveDraft(lid, playerId, eventId, { values, frames, balls, date: d?.date });
    toast(`Juego ${index + 1}: ${value.score}. Queda en tu teléfono hasta que lo envíes.`);
    router.back();
  }

  return (
    <ScoreEntry
      title={`Juego ${index + 1}`}
      memoryKey={gameKey(place, index)}
      initial={initial}
      ball={ballChoice.canPick ? { balls: ballChoice.balls, start: startBall ?? null, game: index } : null}
      onSave={save}
      onClose={() => router.back()}
    />
  );
}

/**
 * La pantalla de anotar un juego (ScoreEntryModal de la web), para cualquier lugar: el boliche de la liga (ScoreEditor)
 * y los juegos sueltos (con «Listo», que solo pasa el juego a su casilla). `stored`: lo que ya está guardado de ese juego
 * (si se pasa, lo anotado sigue en el teléfono después de guardar, hasta que el que la abrió lo borre).
 */
export function ScoreEntry({
  title,
  subtitle,
  memoryKey,
  initial,
  stored,
  ball,
  onSave,
  onClose,
  saveText = 'Guardar',
}: {
  title: string;
  subtitle?: string;
  memoryKey: string;
  initial: ScoreValue;
  stored?: ScoreValue;
  /** La bola del juego arriba (null = no sale): las de la cuenta y la que ya tenía. */
  ball: { balls: ReturnType<typeof useBallChoice>['balls']; start: string | null; game: number } | null;
  /** Con el juego completo. `picked`: la bola elegida (undefined si no salió la de arriba). */
  onSave: (value: { score: number; frames: ScoreValue['frames'] }, picked: string | null | undefined) => void;
  onClose: () => void;
  saveText?: string;
}) {
  const c = useColors();
  const saved = stored ?? initial;
  const [start] = useState(() => {
    const pending = pendingDraft(memoryKey, saved);
    return { ...startState(initial, undefined, pending?.work ?? null), resumed: !!pending?.work };
  });
  const [mode, setMode] = useState<ScoreMode>(start.mode);
  const [rolls, setRolls] = useState<number[]>(start.rolls);
  const [masks, setMasks] = useState<(number | null)[]>(start.masks);
  const [total, setTotal] = useState(start.total);
  const [knocked, setKnocked] = useState(0);
  // Teclado: tiro elegido para corregir (null = se anota al final) y si está vacío esperando el valor:
  // 'borrado' = lo borró dejándolo presionado; 'falta' = la corrección pide ese tiro.
  const [sel, setSel] = useState<number | null>(start.sel);
  const [hole, setHole] = useState<'borrado' | 'falta' | null>(start.hole);
  // La bola que eligió aquí (undefined = la que traía).
  const [pickedBall, setPickedBall] = useState<string | null | undefined>(undefined);
  const picked = pickedBall === undefined ? (ball?.start ?? null) : pickedBall;

  useEffect(() => {
    if (start.resumed) toast('Seguimos donde lo dejaste.');
  }, [start.resumed]);

  // Cada cambio queda en el teléfono (igual a lo guardado o vacío, se borra).
  useEffect(() => {
    rememberGame(memoryKey, { mode, rolls, masks, total, hole: hole && sel != null ? { roll: sel, kind: hole } : null }, saved);
  }, [memoryKey, mode, rolls, masks, total, hole, sel, saved]);

  const value = editorValue(mode, { rolls, masks, total, hole: !!hole }, initial);
  const game = scoreGame(rolls);
  const now = standingNow(rolls);
  const keyboard = mode === 'teclado';
  const hasWork = rolls.length > 0 || total.trim() !== '';
  const standing = standingMask(rolls, masks);
  // Tiro que se corrige: cuadro, número de tiro y qué se puede escribir ahí.
  const editing = sel != null ? game.frames.findIndex((f) => sel >= f.start && sel < f.start + f.rolls.length) : -1;
  const editRoll = editing >= 0 ? sel! - game.frames[editing].start + 1 : 0;
  const at = sel != null ? standingNow(rolls.slice(0, sel)) : now;
  const shownScore = hole && sel != null ? scoreGame(rolls.slice(0, sel)).score : game.score;
  const best = !rolls.length ? null : hole && sel != null ? maxPossibleWithHole(rolls, sel) : game.complete ? null : maxPossibleScore(rolls);
  const onlyTotal = rolls.length === 0 && initial.score != null && !initial.frames?.rolls?.length;
  const hint =
    keyboard && editing >= 0
      ? hole === 'borrado'
        ? `Borraste el tiro ${editRoll} del cuadro ${editing + 1}: escribe el correcto`
        : hole === 'falta'
          ? `Escribe el tiro ${editRoll} del cuadro ${editing + 1}`
          : `Escribe el tiro ${editRoll} · déjalo presionado para borrarlo`
      : keyboard && rolls.length > 0
        ? 'Toca un cuadro para corregirlo'
        : null;

  function endEdit() {
    setSel(null);
    setHole(null);
  }
  function push(pins: number, mask: number | null) {
    setRolls((r) => [...r, pins]);
    setMasks((m) => [...m, mask]);
    setKnocked(0);
  }
  /** Tecla del teclado: anota al final, o corrige el tiro elegido. */
  function typeRoll(pins: number) {
    if (sel == null) return push(pins, null);
    const r = replaceRoll(rolls, masks, sel, pins, null);
    setRolls(r.rolls);
    setMasks(r.extra);
    setSel(r.next);
    setHole(r.next != null ? 'falta' : null);
  }
  /** Tocar un tiro de la hoja: se elige para corregirlo (otra vez: se deja de corregir). */
  function selectRoll(i: number | null) {
    if (i == null || i === sel) return endEdit();
    setSel(i);
    setHole(null);
  }
  /** Dejar presionado un tiro: el último se quita; uno de en medio queda vacío para escribir el correcto. */
  function eraseRoll(i: number) {
    if (i === rolls.length - 1) {
      undo();
      endEdit();
      return;
    }
    setSel(i);
    setHole('borrado');
  }
  function undo() {
    setRolls((r) => r.slice(0, -1));
    setMasks((m) => m.slice(0, -1));
    setKnocked(0);
  }
  function pickMode(m: ScoreMode) {
    setPreferredMode(m);
    if (m === 'total' && game.complete && total.trim() === '') setTotal(String(game.score));
    setKnocked(0);
    endEdit();
    setMode(m);
  }
  function close() {
    if (hasWork && !value.ready) toast('Guardado en tu teléfono: sigue cuando quieras.');
    onClose();
  }
  function save() {
    if (!value.ready || value.score == null) return;
    forgetAfterSave(memoryKey, true, stored !== undefined);
    onSave({ score: value.score, frames: value.frames }, ball ? picked : undefined);
  }

  const totalNum = total.trim() === '' ? null : Number(total);
  const totalInvalid = totalNum != null && !isValidScore(totalNum);
  const setTotalNum = (n: number) => setTotal(String(Math.min(300, Math.max(0, Math.round(n)))));
  const saveLabel = value.ready ? `${saveText} ${value.score}` : 'Guardar y salir';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar (lo anotado queda en tu teléfono)" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
            <X size={24} color={c.fg} />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Txt variant="section">{title}</Txt>
            {!!subtitle && (
              <Txt variant="meta" tone="muted">
                {subtitle}
              </Txt>
            )}
          </View>
          <View style={{ width: 44 }} />
        </View>

        {ball && <BallRow balls={ball.balls} value={picked} initial={ball.start} onPick={setPickedBall} game={ball.game} />}

        <Segmented<ScoreMode>
          label="Forma de anotar"
          value={mode}
          onChange={pickMode}
          options={[
            { key: 'pines', label: 'Pines' },
            { key: 'teclado', label: 'Teclado' },
            { key: 'total', label: 'Total' },
          ]}
        />

        {mode !== 'total' ? (
          <>
            <Txt variant="meta" tone={keyboard && editing >= 0 ? 'accent' : 'muted'}>
              {keyboard && editing >= 0 ? `Corrigiendo el cuadro ${editing + 1}` : game.complete ? 'Juego completo' : now ? `Cuadro ${now.frame + 1} de 10 · tiro ${now.roll + 1}` : ''}
            </Txt>
            <FramesSheet
              rolls={rolls}
              current={sel == null && now ? now.frame : null}
              selected={keyboard ? sel : null}
              blank={keyboard && hole ? sel : null}
              onSelect={keyboard ? selectRoll : undefined}
              onLongPress={keyboard ? eraseRoll : undefined}
            />
            {onlyTotal ? (
              <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
                Este juego tiene <Txt variant="bodyStrong">{initial.score}</Txt> anotado solo con el total. Anota los tiros para agregarle los cuadros, o guárdalo así y se
                queda con el total.
              </Txt>
            ) : (
              !!hint && (
                <Txt variant="meta" tone={editing >= 0 ? 'accent' : 'muted'} style={{ textAlign: 'center' }}>
                  {hint}
                </Txt>
              )
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Txt variant="meta" tone="muted">
                  {game.complete && !hole ? 'Total' : 'Llevas'}
                </Txt>
                <Txt variant="stat">{shownScore}</Txt>
              </View>
              {best != null && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt variant="meta" tone="muted">
                    Máx. posible
                  </Txt>
                  <Txt variant="cardTitle">{best}</Txt>
                </View>
              )}
            </View>

            {keyboard ? (
              <>
                <Txt style={{ textAlign: 'center', fontFamily: font.medium, color: c.fg2 }}>
                  {!at ? 'Juego completo: ya puedes guardarlo' : at.fresh ? `${pinos(at.standing)} en pie` : `${at.standing === 1 ? 'Queda' : 'Quedan'} ${pinos(at.standing)} en pie`}
                </Txt>
                <Keypad standing={at ? at.standing : -1} fresh={at?.fresh ?? false} onRoll={typeRoll} />
              </>
            ) : (
              <>
                <Txt style={{ textAlign: 'center', fontFamily: font.medium, color: c.fg2 }}>
                  {!now ? 'Juego completo: ya puedes guardarlo' : knocked ? `${pinos(bitCount(knocked))} marcados` : 'Toca los pinos que cayeron'}
                </Txt>
                <PinDeck standing={standing} knocked={knocked} disabled={!now} onToggle={(bit) => setKnocked((k) => k ^ bit)} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PinKey big="0" small="Fallo" enabled={!!now} onPress={() => push(0, 0)} />
                  <PinKey big={now?.fresh === false ? '/' : 'X'} small={now?.fresh === false ? 'Spare' : 'Strike'} enabled={!!now} onPress={() => push(bitCount(standing), standing)} />
                  <PinKey
                    big={knocked ? String(bitCount(knocked)) : '✓'}
                    small="Anotar"
                    label={knocked ? `Anotar ${pinos(bitCount(knocked))}` : 'Anotar los pinos marcados'}
                    enabled={!!now && knocked !== 0}
                    accent
                    onPress={() => push(bitCount(knocked), knocked)}
                  />
                </View>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              {sel != null ? (
                <Button size="xl" icon={hole === 'borrado' ? <Undo2 size={20} color={c.fg} /> : <Check size={20} color={c.fg} />} onPress={endEdit} style={{ flex: 1 }}>
                  {hole === 'borrado' ? 'Deshacer' : hole === 'falta' ? 'Dejar en −' : 'Listo'}
                </Button>
              ) : (
                <Button size="xl" disabled={!rolls.length} icon={<Undo2 size={20} color={c.fg} />} onPress={undo} style={{ flex: 1 }}>
                  Deshacer
                </Button>
              )}
              <Button
                variant="primary"
                size="xl"
                icon={<Check size={20} color={c.accentFg} />}
                disabled={!value.ready && !hasWork}
                onPress={value.ready ? save : close}
                style={{ flex: 1.4 }}
              >
                {saveLabel}
              </Button>
            </View>
          </>
        ) : (
          <>
            <Txt style={{ textAlign: 'center' }} tone="fg2">
              Escribe el <Txt variant="bodyStrong">puntaje final</Txt>
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
              <Button size="xl" accessibilityLabel="Menos" icon={<Minus size={24} color={c.fg} />} onPress={() => setTotalNum((totalNum ?? 150) - 1)} />
              <Input
                accessibilityLabel="Puntaje del juego"
                keyboardType="number-pad"
                placeholder="0"
                value={total}
                maxLength={3}
                onChangeText={(t) => setTotal(t.replace(/[^\d]/g, ''))}
                invalid={totalInvalid}
                style={{ width: 150, height: 76, textAlign: 'center', fontSize: 40, fontFamily: font.bold }}
              />
              <Button size="xl" accessibilityLabel="Más" icon={<Plus size={24} color={c.fg} />} onPress={() => setTotalNum((totalNum ?? 150) + 1)} />
            </View>
            {totalInvalid && (
              <Txt variant="meta" tone="danger" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
                El puntaje va de 0 a 300.
              </Txt>
            )}
            <Button variant="primary" size="xl" full disabled={!value.ready} icon={<Check size={20} color={c.accentFg} />} onPress={save}>
              {value.ready ? `${saveText} ${value.score}` : saveText}
            </Button>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** Las teclas de abajo de los pines (Fallo, Strike o Spare, Anotar), como Key de la web. */
function PinKey({ big, small, label, enabled, accent, onPress }: { big: string; small: string; label?: string; enabled: boolean; accent?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? `${big} ${small}`}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        height: 64,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: accent && enabled ? c.accent : c.surface2,
        opacity: enabled ? (pressed ? 0.8 : 1) : 0.45,
      })}
    >
      <Txt style={{ fontFamily: font.bold, fontSize: 22, color: accent && enabled ? c.accentFg : c.fg }}>{big}</Txt>
      <Txt style={{ fontSize: 12, color: accent && enabled ? c.accentFg : c.muted }}>{small}</Txt>
    </Pressable>
  );
}

/**
 * La bola del juego (GameBallSelect de la web): «Sin bola» y las de la cuenta que no están retiradas (y la que ya tenía),
 * en una fila que se desliza de lado. Agregar una bola nueva todavía se hace en la web («Mis bolas»).
 */
function BallRow({
  balls,
  value,
  initial,
  onPick,
  game,
}: {
  balls: ReturnType<typeof useBallChoice>['balls'];
  value: string | null;
  initial: string | null;
  onPick: (id: string | null) => void;
  game: number;
}) {
  const c = useColors();
  const options = pickableBalls(balls, value, initial);
  if (!options.length && !value) return null;
  const chip = (id: string | null, title: string, detail: string | null) => {
    const on = value === id;
    return (
      <Pressable
        key={id ?? 'sin'}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={detail ? `${title}, ${detail}` : title}
        onPress={() => onPick(id)}
        style={{ borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: on ? c.accent : c.surface2, maxWidth: 200 }}
      >
        <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 14, color: on ? c.accentFg : c.fg }}>
          {title}
        </Txt>
        {!!detail && (
          <Txt numberOfLines={1} style={{ fontSize: 12, color: on ? c.accentFg : c.muted }}>
            {detail}
          </Txt>
        )}
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 6 }}>
      <Txt variant="meta" tone="muted">{`Bola del juego ${game + 1}`}</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" contentContainerStyle={{ gap: 8 }}>
        {chip(null, 'Sin bola', null)}
        {options.map((b) => chip(b.id, b.name, ballDetail(b)))}
      </ScrollView>
    </View>
  );
}
