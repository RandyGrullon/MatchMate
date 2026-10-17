import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Minus, Plus, Undo2, X } from 'lucide-react-native';
import { maxPossibleScore, scoreGame, standingNow } from '@mm/lib/bowling';
import { loadDraft, saveDraft } from '@mm/lib/draft';
import { isValidScore } from '@mm/lib/stats';
import { forgetAfterSave, gameKey, pendingDraft, rememberGame } from '@mm/components/frames/draftMemory';
import { editorValue, setPreferredMode, startState, type EditorWork, type ScoreMode, type ScoreValue } from '@mm/components/frames/editorLogic';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { toast } from '../feedback';
import { Button, Input, Screen, Segmented, Txt } from '../ui';
import { FramesSheet } from './FramesSheet';
import { Keypad } from './Keypad';

type Mode = Exclude<ScoreMode, 'pines'>;
const pinos = (n: number) => (n === 1 ? '1 pino' : `${n} pinos`);

/**
 * Anotar un juego (la hoja de anotar de la web: src/components/frames/FrameEditor.tsx + ScoreEntryModal), con la misma
 * lógica compartida: tiro por tiro con el teclado (solo se encienden las teclas que valen) o el puntaje final. Cada tiro
 * queda en el teléfono (draftMemory): si se sale a mitad, «Seguir mi juego N» sigue donde se dejó. Al guardar, el juego
 * pasa a «Tus juegos» (src/lib/draft.ts) y se publica en vivo para la liga. («Pines», tocando los pinos, llega después:
 * un juego que se empezó así se sigue con el teclado, con los mismos tiros.)
 */
export function ScoreEditor({ lid, eventId, index, playerId, place }: { lid: string; eventId: string; index: number; playerId: string; place: string }) {
  const c = useColors();
  const memoryKey = gameKey(place, index);
  // Lo guardado de ese juego en «Tus juegos» (o nada todavía).
  const initial = useMemo<ScoreValue>(() => {
    const d = loadDraft(lid, playerId, eventId);
    const typed = d?.values[index]?.trim();
    return { score: typed ? Number(typed) : null, frames: d?.frames?.[index] ?? null };
  }, [lid, playerId, eventId, index]);
  const resumed = useRef<EditorWork | null>(null);
  const [start] = useState(() => {
    const pending = pendingDraft(memoryKey, initial);
    resumed.current = pending?.work ?? null;
    return startState(initial, undefined, pending?.work ?? null);
  });
  const [mode, setMode] = useState<Mode>(start.mode === 'total' ? 'total' : 'teclado');
  const [rolls, setRolls] = useState<number[]>(start.rolls);
  const [masks, setMasks] = useState<(number | null)[]>(start.masks);
  const [total, setTotal] = useState(start.total);

  useEffect(() => {
    if (resumed.current) toast('Seguimos donde lo dejaste.');
  }, []);

  // Cada cambio queda en el teléfono (igual a lo guardado o vacío, se borra).
  useEffect(() => {
    rememberGame(memoryKey, { mode, rolls, masks, total, hole: null }, initial);
  }, [memoryKey, mode, rolls, masks, total, initial]);

  const value = editorValue(mode, { rolls, masks, total, hole: false }, initial);
  const game = scoreGame(rolls);
  const now = standingNow(rolls);
  const hasWork = rolls.length > 0 || total.trim() !== '';

  function roll(pins: number) {
    setRolls((r) => [...r, pins]);
    setMasks((m) => [...m, null]);
  }
  function undo() {
    setRolls((r) => r.slice(0, -1));
    setMasks((m) => m.slice(0, -1));
  }
  function pickMode(m: Mode) {
    setMode(m);
    setPreferredMode(m);
  }
  function close() {
    if (hasWork && !value.ready) toast('Guardado en tu teléfono: sigue cuando quieras.');
    router.back();
  }
  function save() {
    if (!value.ready || value.score == null) return;
    const d = loadDraft(lid, playerId, eventId);
    const count = Math.max(d?.values.length ?? 0, index + 1);
    const values = Array.from({ length: count }, (_, j) => d?.values[j] ?? '');
    values[index] = String(value.score);
    const frames = { ...(d?.frames ?? {}) };
    if (value.frames) frames[String(index)] = value.frames;
    else delete frames[String(index)];
    saveDraft(lid, playerId, eventId, { values, frames, balls: d?.balls, date: d?.date });
    forgetAfterSave(memoryKey, true);
    toast(`Juego ${index + 1}: ${value.score}. Queda en tu teléfono hasta que lo envíes.`);
    router.back();
  }

  const totalNum = total.trim() === '' ? null : Number(total);
  const totalInvalid = totalNum != null && !isValidScore(totalNum);
  const setTotalNum = (n: number) => setTotal(String(Math.min(300, Math.max(0, Math.round(n)))));

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar (lo anotado queda en tu teléfono)" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
            <X size={24} color={c.fg} />
          </Pressable>
          <Txt variant="section">Juego {index + 1}</Txt>
          <View style={{ width: 44 }} />
        </View>

        <Segmented<Mode>
          label="Forma de anotar"
          value={mode}
          onChange={pickMode}
          options={[
            { key: 'teclado', label: 'Teclado' },
            { key: 'total', label: 'Total' },
          ]}
        />

        {mode === 'teclado' ? (
          <>
            <Txt variant="meta" tone="muted">
              {now ? `Cuadro ${now.frame + 1} de 10 · tiro ${now.roll + 1}` : game.complete ? 'Juego completo' : ''}
            </Txt>
            <FramesSheet rolls={rolls} current={now ? now.frame : null} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Txt variant="meta" tone="muted">
                  Llevas
                </Txt>
                <Txt variant="stat">{game.score}</Txt>
              </View>
              {!game.complete && rolls.length > 0 && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt variant="meta" tone="muted">
                    Máx. posible
                  </Txt>
                  <Txt variant="cardTitle">{maxPossibleScore(rolls)}</Txt>
                </View>
              )}
            </View>
            <Txt style={{ textAlign: 'center', fontFamily: font.medium, color: c.fg2 }}>
              {now ? (now.fresh ? `${pinos(10)} en pie` : `Quedan ${pinos(now.standing)} en pie`) : 'Listo para guardar'}
            </Txt>
            <Keypad standing={now ? now.standing : -1} fresh={now?.fresh ?? false} onRoll={roll} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button size="xl" disabled={!rolls.length} icon={<Undo2 size={20} color={c.fg} />} onPress={undo} style={{ flex: 1 }}>
                Deshacer
              </Button>
              <Button
                variant="primary"
                size="xl"
                icon={<Check size={20} color={c.accentFg} />}
                disabled={!value.ready && !hasWork}
                onPress={value.ready ? save : close}
                style={{ flex: 1.4 }}
              >
                {value.ready ? `Guardar ${value.score}` : 'Guardar y salir'}
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
              {value.ready ? `Guardar ${value.score}` : 'Guardar'}
            </Button>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
