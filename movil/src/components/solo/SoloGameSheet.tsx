import { useState } from 'react';
import { Modal, Pressable, Switch, View } from 'react-native';
import { CloudUpload, Grid3x3, Plus, Target, Trash2 } from 'lucide-react-native';
import {
  SOLO_MAX_GAMES,
  SOLO_NOTE_MAX,
  SOLO_VENUE_MAX,
  deleteSoloSession,
  saveSoloSession,
  soloErrorText,
  soloMinDate,
  type SoloSession,
} from '@mm/lib/data/solo';
import { ballsByGame, ballsChanged, commonBall, compactBalls, keepBalls, knownBalls, lastBall, sameBall, type GameBall } from '@mm/lib/balls';
import { queuedGameBalls, rememberBall, useMyBallGames } from '@mm/lib/data/balls';
import { getUserId } from '@mm/lib/data/client';
import { uuidv7 } from '@mm/lib/db/ids';
import { isValidScore } from '@mm/lib/stats';
import { useBallChoice } from '@mm/components/balls/choice';
import { clearGameDraft, clearGameDrafts, gameKey, soloPlace } from '@mm/components/frames/draftMemory';
import { framesMode } from '@mm/components/frames/editorLogic';
import { SOLO_DATE_HINT, initialSlots, slotGame, slotsToGames, soloGamesHint, soloSheetChanged, type SoloSheetValues } from '@mm/components/solo/logic';
import { AllGamesBall, GameBallChip } from '@/components/balls/GameBall';
import { ScoreEntry } from '@/components/bowling/ScoreEditor';
import { DateStepper } from '@/components/DateStepper';
import { confirmAsync, toast } from '@/components/feedback';
import { Button, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Hoja para anotar o cambiar un juego suelto (SoloGameSheet de la web, con su misma lógica): la fecha (hoy si es nuevo),
 * la bolera (con las que ya puso), de 1 a 10 juegos (el total o, con «cuadros»/«pines», tiro por tiro), la bola de cada
 * juego, una nota y si sale en el perfil. «Guardar» va por la cola (sin señal queda en el teléfono y sale solo).
 * «Borrar» pregunta antes, y cerrarla con algo cambiado también. Se monta abierta: cada vez empieza de lo guardado.
 */
export function SoloGameSheet({ session, venues, today, onClose }: { session: SoloSession | null; venues: readonly string[]; today: string; onClose: () => void }) {
  const c = useColors();
  const [start] = useState<SoloSheetValues & { id: string }>(() => ({
    id: session?.id ?? uuidv7(),
    date: session?.playedOn ?? today,
    venue: session?.venue ?? '',
    note: session?.note ?? '',
    shared: session?.shared ?? true,
    slots: initialSlots(session),
  }));
  const [date, setDate] = useState(start.date);
  const [venue, setVenue] = useState(start.venue);
  const [note, setNote] = useState(start.note);
  const [shared, setShared] = useState(start.shared);
  const [slots, setSlots] = useState(start.slots);
  const [framesFor, setFramesFor] = useState<number | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [venueFocus, setVenueFocus] = useState(false);

  // Con qué bola tiró cada juego (lo mismo que la web: las del servidor con lo de la cola encima; null = no se sabe).
  const choice = useBallChoice();
  const tagged = useMyBallGames(session?.id ?? null, !!session && choice.balls.length > 0);
  const serverHad = !session
    ? {}
    : choice.balls.length
      ? !tagged.loading && !tagged.error
        ? ballsByGame(tagged.data, 'solo', session.id)
        : choice.noBallsAtStart
          ? {}
          : null
      : choice.loaded
        ? {}
        : null;
  const queued = session ? queuedGameBalls('solo', session.id) : null;
  const known = session ? knownBalls(session.scores.length, serverHad, queued) : {};
  const ballsReady = known != null;
  const showBalls = choice.canPick && ballsReady;
  const ballsUnread = choice.canPick && !ballsReady && !!tagged.error;
  const [picked, setPicked] = useState<Record<number, string | null>>({});
  const [bulk, setBulk] = useState<string | null | undefined>(undefined);
  // Eligió la bola de un juego o la de todos (la de todos reemplaza la que eligió en cada uno). El React Compiler la
  // deja siempre igual (los botones de las bolas no se vuelven a dibujar con cada tecla).
  const pickBall = (game: number | 'all', id: string | null) => {
    if (game === 'all') {
      setBulk(id);
      setPicked({});
    } else setPicked((p) => ({ ...p, [game]: id }));
  };

  const { values, frames } = slots;
  const games = slotsToGames(values, frames);
  const minDate = soloMinDate(today);
  const dateOk = !!date && date >= minDate && date <= today;
  const canSave = games.scores.length > 0 && !games.invalid && dateOk && !busy;
  const dirty = soloSheetChanged(start, { date, venue, note, shared, slots }) || Object.keys(picked).length > 0 || bulk !== undefined;
  const had = known ?? {};
  const auto = session ? commonBall(Object.values(had)) : choice.auto;
  const ballOf = (i: number): string | null =>
    i in picked ? picked[i] : bulk !== undefined ? bulk : i in had ? had[i] : session && i < session.scores.length ? null : auto;
  const scored = values.flatMap((v, i) => (v.trim() ? [i] : []));
  const allBall = sameBall((scored.length ? scored : values.map((_, i) => i)).map(ballOf));
  const byPins = framesMode() === 'pines';
  const hint = soloGamesHint(games, dateOk, byPins);
  // Lo anotado por cuadros queda en el teléfono hasta «Guardar», «Borrar» o «Salir» (la misma memoria de la web).
  const memoryBase = soloPlace(getUserId(), session?.id);
  const forgetGames = () => clearGameDrafts(memoryBase);
  const venueSuggestions = venueFocus ? venues.filter((v) => v !== venue && v.toLowerCase().includes(venue.trim().toLowerCase())).slice(0, 6) : [];

  async function close() {
    if (dirty && !busy) {
      const ok = await confirmAsync({ title: '¿Salir sin guardar?', message: 'Se pierde lo que anotaste en este juego.', confirmText: 'Salir', danger: true });
      if (!ok) return;
      forgetGames();
    }
    onClose();
  }

  function setValue(i: number, v: string) {
    // Si cambia el total a mano, los cuadros de ese juego ya no valen (tampoco lo que quedó a medias).
    clearGameDraft(gameKey(memoryBase, i));
    setSlots((s) => {
      const nextFrames = { ...s.frames };
      delete nextFrames[i];
      return { values: s.values.map((x, j) => (j === i ? v : x)), frames: nextFrames };
    });
  }

  function addSlot() {
    setSlots((s) => (s.values.length >= SOLO_MAX_GAMES ? s : { ...s, values: [...s.values, ''] }));
  }

  function ballsToSave(): Record<string, GameBall> | undefined {
    if (!session) {
      const out = compactBalls(values, Object.fromEntries(values.map((_, i) => [i, ballOf(i)])));
      return Object.values(out).some(Boolean) ? out : undefined;
    }
    if (known == null) return keepBalls(values, session.scores.length) ?? undefined;
    const out = compactBalls(values, Object.fromEntries(values.map((_, i) => [i, ballOf(i)])));
    return queued || ballsChanged(out, known) ? out : undefined;
  }

  async function save() {
    if (!canSave) return;
    setBusy('save');
    try {
      const balls = ballsToSave();
      await saveSoloSession({ id: start.id, playedOn: date, venue, note, scores: games.scores, frames: games.frames, shared, balls }, today);
      const changed = Object.keys(picked)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((i) => (picked[i] !== (had[i] ?? null) ? [picked[i]] : []));
      rememberBall(lastBall(!session ? Object.values(balls ?? {}) : bulk !== undefined ? [bulk] : changed));
      forgetGames();
      toast(session ? 'Juego guardado' : 'Juego anotado');
      onClose();
    } catch (e) {
      toast(soloErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!session || busy) return;
    const ok = await confirmAsync({ title: '¿Borrar este juego suelto?', message: 'Se borran sus juegos y sus me gusta. No se puede deshacer.', confirmText: 'Borrar', danger: true });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteSoloSession(session);
      forgetGames();
      toast('Juego borrado');
      onClose();
    } catch (e) {
      toast(soloErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      open
      onClose={() => void close()}
      title={session ? 'Juego suelto' : 'Anotar juego suelto'}
      subtitle="Boliche sin liga ni torneo"
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {session && (
            <Button variant="ghost" icon={<Trash2 size={20} color={c.danger} />} loading={busy === 'delete'} disabled={!!busy} onPress={() => void remove()}>
              <Txt tone="danger" style={{ fontFamily: font.semibold }}>
                Borrar
              </Txt>
            </Button>
          )}
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="xl" full loading={busy === 'save'} disabled={!canSave} onPress={() => void save()}>
              Guardar
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 20 }}>
        {session?.pending && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <CloudUpload size={16} color={c.accent} />
            <Txt tone="accent" variant="meta" style={{ flex: 1 }}>
              Guardado en este teléfono: sale solo cuando haya señal.
            </Txt>
          </View>
        )}

        <Field label="Fecha" hint={dateOk ? undefined : SOLO_DATE_HINT} error={!dateOk}>
          <DateStepper value={date} min={minDate} max={today} onChange={setDate} />
        </Field>
        <Field label="Bolera">
          <Input
            value={venue}
            onChangeText={setVenue}
            maxLength={SOLO_VENUE_MAX}
            placeholder="Dónde jugaste"
            autoComplete="off"
            onFocus={() => setVenueFocus(true)}
            onBlur={() => setTimeout(() => setVenueFocus(false), 150)}
          />
          {venueSuggestions.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {venueSuggestions.map((v) => (
                <Pressable key={v} accessibilityRole="button" onPress={() => setVenue(v)} style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.surface2 }}>
                  <Txt style={{ fontSize: 14 }}>{v}</Txt>
                </Pressable>
              ))}
            </View>
          )}
        </Field>

        {showBalls ? (
          <AllGamesBall balls={choice.balls} value={allBall} onPick={pickBall} />
        ) : (
          ballsUnread && (
            <Txt tone="muted" style={{ fontSize: 12 }}>
              Sin señal no se ven las bolas de estos juegos (se quedan como estaban). Ábrelo con señal para cambiarlas.
            </Txt>
          )
        )}

        <View style={{ gap: 8 }}>
          <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
            Tus juegos
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {values.map((v, i) => {
              const bad = !!v.trim() && !isValidScore(Number(v));
              return (
                <View
                  key={i}
                  style={{
                    width: '31%',
                    borderRadius: 16,
                    backgroundColor: c.surface2,
                    paddingHorizontal: 6,
                    paddingTop: 10,
                    paddingBottom: 4,
                    gap: 2,
                    borderWidth: bad || frames[i] ? 1.5 : 0,
                    borderColor: bad ? c.danger : c.accent,
                  }}
                >
                  <Txt tone="muted" style={{ fontSize: 13, fontFamily: font.medium, paddingHorizontal: 6 }}>{`Juego ${i + 1}`}</Txt>
                  <Input
                    accessibilityLabel={`Juego ${i + 1}`}
                    keyboardType="number-pad"
                    maxLength={3}
                    value={v}
                    placeholder="–"
                    onChangeText={(t) => setValue(i, t.replace(/[^\d]/g, ''))}
                    invalid={bad}
                    style={{ height: 44, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 6, fontSize: 26, fontFamily: font.bold, color: bad ? c.danger : c.fg }}
                  />
                  {showBalls && <GameBallChip game={i} balls={choice.balls} value={ballOf(i)} onPick={pickBall} />}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Anotar el juego ${i + 1} ${byPins ? 'pino por pino' : 'por cuadros'}`}
                    onPress={() => setFramesFor(i)}
                    style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 }}
                  >
                    {byPins ? <Target size={14} color={frames[i] ? c.accent : c.fg2} /> : <Grid3x3 size={14} color={frames[i] ? c.accent : c.fg2} />}
                    <Txt style={{ fontSize: 13, fontFamily: font.semibold, color: frames[i] ? c.accent : c.fg2 }}>{byPins ? 'pines' : 'cuadros'}</Txt>
                  </Pressable>
                </View>
              );
            })}
            {values.length < SOLO_MAX_GAMES && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Agregar otro juego"
                onPress={addSlot}
                style={{ width: '31%', minHeight: 104, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', justifyContent: 'center', gap: 4 }}
              >
                <Plus size={24} color={c.muted} />
                <Txt tone="muted" variant="meta" style={{ fontFamily: font.semibold }}>
                  Juego
                </Txt>
              </Pressable>
            )}
          </View>
          <Txt tone={hint.bad ? 'danger' : 'muted'} style={{ fontSize: 12 }} accessibilityLiveRegion="polite">
            {hint.text}
          </Txt>
        </View>

        <Field label="Nota (opcional)">
          <Input multiline numberOfLines={2} value={note} onChangeText={setNote} maxLength={SOLO_NOTE_MAX} placeholder="Con quién jugaste, cómo te fue…" style={{ minHeight: 72, textAlignVertical: 'top', paddingTop: 12 }} />
        </Field>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: c.surface2, paddingVertical: 8, paddingLeft: 16, paddingRight: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyStrong">Que salga en mi perfil</Txt>
            <Txt tone="muted" style={{ fontSize: 14 }}>
              {shared ? 'Lo ven quienes te siguen.' : 'Solo lo ves tú (igual cuenta en tu promedio).'}
            </Txt>
          </View>
          <Switch accessibilityLabel="Que salga en mi perfil" value={shared} onValueChange={setShared} trackColor={{ true: c.accent, false: c.muted }} />
        </View>
      </View>

      {/* Anotar un juego tiro por tiro: el editor de la app encima de la hoja («Listo» lo pasa a su casilla). */}
      <Modal visible={framesFor != null} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setFramesFor(null)}>
        {framesFor != null && (
          <View style={{ flex: 1, backgroundColor: c.bg }}>
            <ScoreEntry
              key={framesFor}
              title={`Juego ${framesFor + 1}`}
              subtitle="Juego suelto"
              memoryKey={gameKey(memoryBase, framesFor)}
              stored={slotGame(start.slots, framesFor)}
              initial={slotGame(slots, framesFor)}
              ball={showBalls ? { balls: choice.balls, start: ballOf(framesFor), game: framesFor } : null}
              saveText="Listo"
              onClose={() => setFramesFor(null)}
              onSave={(value, ball) => {
                const i = framesFor;
                setSlots((s) => {
                  const nextFrames = { ...s.frames };
                  if (value.frames) nextFrames[i] = value.frames;
                  else delete nextFrames[i];
                  return { values: s.values.map((x, j) => (j === i ? String(value.score) : x)), frames: nextFrames };
                });
                if (showBalls && ball !== undefined) setPicked((p) => ({ ...p, [i]: ball }));
                setFramesFor(null);
              }}
            />
          </View>
        )}
      </Modal>
    </Sheet>
  );
}
