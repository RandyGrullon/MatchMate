import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, Send, Sparkles, WifiOff, X } from 'lucide-react-native';
import { submissionBalls } from '@mm/lib/balls';
import { clearSent, loadDraft, restoreDraft } from '@mm/lib/draft';
import { setSubmissionScan, submitGames } from '@mm/lib/data/submissions';
import { saveErrorMessage } from '@mm/lib/errorText';
import type { CompressedImage } from '@mm/lib/image';
import { rowFor } from '@mm/lib/scan-result';
import { cancelScan, scanDone, startScan, useScanJob, waitingText } from '@mm/lib/scanJobs';
import { isValidScore } from '@mm/lib/stats';
import { useBallChoice } from '@mm/components/balls/choice';
import { clearGameDraft, gameKey } from '@mm/components/frames/draftMemory';
import { confirmAsync, toast } from '@/components/feedback';
import { Button, Card, ChoiceRow, ErrorNote, Loading, Screen, Txt } from '@/components/ui';
import { pickPhoto, type PhotoSource } from '@/lib/pickImage';
import { useMyGames } from '@/lib/useMyGames';
import { useColors } from '@/theme/theme';

/** Cuánto se espera al servidor antes de decir «sin señal: se envía solo» (la cola lo sigue intentando). */
const QUEUED_AFTER_MS = 6000;
/** set_game_balls anota la bola hasta el juego 10 (BALL_GAMES de la web). */
const BALL_GAMES = 10;
const showGames = (gs: (number | null)[]) => gs.map((g) => g ?? '–').join(' · ');

/**
 * Enviar mis juegos (SubmitGamesModal de la web, para lo que ya está en el teléfono): los juegos, la foto del marcador
 * (cámara o galería) que se lee con la IA en segundo plano (src/lib/scanJobs.ts: no hace falta esperar para enviar) y
 * Enviar. Si la foto dice otra cosa, se avisa y se puede usar lo de la foto; lo leído va con el envío para que el admin
 * lo compare. Sin foto, en una liga que la pide, se pregunta antes.
 */
export default function SendGamesScreen() {
  const { lid, eventId } = useLocalSearchParams<{ lid: string; eventId: string }>();
  const c = useColors();
  const g = useMyGames(lid, eventId);
  const choice = useBallChoice();
  const playerId = g.playerId;
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const job = useScanJob(scanId);
  const [rowIdx, setRowIdx] = useState<number | null>(null);
  const [override, setOverride] = useState<(number | null)[] | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handedOff = useRef<string | null>(null);
  const applied = useRef<string | null>(null);

  // Se sale sin enviar: la foto ya no se va a usar (no gasta el cupo gratis de la IA).
  useEffect(
    () => () => {
      if (scanId && scanId !== handedOff.current) cancelScan(scanId);
    },
    [scanId],
  );

  const name = g.member.data?.name ?? '';
  // Cuando termina de leerse: la fila del jugador.
  useEffect(() => {
    if (!scanId || job?.status !== 'listo' || applied.current === scanId) return;
    applied.current = scanId;
    const row = rowFor(name, job.rows);
    setRowIdx(row ? job.rows.indexOf(row) : null);
  }, [scanId, job, name]);

  if (g.loading && !g.event.data) return <Loading label="Cargando el evento" />;
  const league = g.league.data;
  const draft = playerId ? loadDraft(lid, playerId, eventId) : null;
  if (!league || !playerId || !draft) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Txt variant="title">No hay juegos para enviar</Txt>
        <Button onPress={() => router.back()}>Volver</Button>
      </Screen>
    );
  }
  const requirePhoto = league.requirePhoto !== false;
  const fromDraft = draft.values.map((v) => (v.trim() ? Number(v) : null));
  const typed = [...(override ?? fromDraft)];
  while (typed.length && typed[typed.length - 1] == null) typed.pop();
  const invalid = typed.some((v) => v != null && !isValidScore(v));

  const scanning = job?.status === 'leyendo' || job?.status === 'esperando';
  const rows = job?.status === 'listo' ? job.rows : [];
  const scanError =
    job?.status === 'error'
      ? `${job.message} Igual puedes enviarla; el admin la revisará.`
      : job?.status === 'listo' && rowIdx == null
        ? 'No encontramos tu nombre en la foto. Elige cuál fila eres.'
        : null;
  const scannedRow = rowIdx != null ? (rows[rowIdx] ?? null) : null;
  const scanned = scannedRow?.games ?? null;
  const differs = scanned != null && Array.from({ length: Math.max(typed.length, scanned.length) }, (_, i) => (typed[i] ?? null) !== (scanned[i] ?? null)).some(Boolean);

  async function pick(source: PhotoSource) {
    const img = await pickPhoto(source, { scan: true });
    if (!img) return;
    // Otra foto: la anterior ya no se usa.
    cancelScan(scanId);
    setPhoto(img);
    setRowIdx(null);
    // La lectura se cobra al cupo de la liga y del evento.
    setScanId(startScan(img.scan, { leagueId: lid, eventId }));
  }

  /** La foto se terminó de leer después de enviar: lo leído se agrega al envío para que el admin lo compare. */
  function attachWhenRead(subId: string, jobId: string, sentScores: (number | null)[]) {
    scanDone(jobId)
      .then(async (found) => {
        const row = rowFor(name, found);
        if (!row) return;
        await setSubmissionScan(lid, subId, row.games, row.name);
        const same = Array.from({ length: Math.max(sentScores.length, row.games.length) }, (_, i) => (sentScores[i] ?? null) === (row.games[i] ?? null)).every(Boolean);
        if (!same) toast(`La foto de tu envío dice ${showGames(row.games)}, distinto a lo que anotaste. El admin lo revisará.`, 'error');
      })
      .catch((e) => console.warn('[escaneo] no se agregó la lectura al envío', e));
  }

  async function send() {
    if (sending || !typed.length || invalid || !playerId || !draft) return;
    if (!photo && requirePhoto) {
      const ok = await confirmAsync({
        title: '¿Enviar sin foto?',
        message: 'Vas a enviar tu puntuación sin comprobación de imagen. El admin puede no aceptarla. ¿Deseas enviarla?',
        confirmText: 'Enviar sin foto',
      });
      if (!ok) return;
    }
    setSending(true);
    setError(null);
    const values = [...draft.values];
    // Lo de la foto reemplaza lo anotado: los cuadros de esos juegos ya no valen.
    const frames = override ? null : draft.frames && Object.keys(draft.frames).length ? draft.frames : null;
    const kept = frames ? Object.fromEntries(Object.entries(frames).filter(([i]) => typed[+i] != null)) : null;
    const { id: subId, sent } = submitGames(lid, {
      playerId,
      eventId,
      date: null,
      scores: typed,
      scanned,
      frames: kept && Object.keys(kept).length ? kept : null,
      photo,
      balls: submissionBalls(typed.slice(0, BALL_GAMES), draft.balls, choice.auto, choice.canPick),
    });
    // La foto todavía se está leyendo: lo leído se agrega al envío cuando termine.
    if (photo && scanId && scanning) {
      handedOff.current = scanId;
      attachWhenRead(subId, scanId, [...typed]);
    } else if (scanId) handedOff.current = scanId;
    const result = await Promise.race([sent.then(() => 'ok' as const), new Promise<'cola'>((r) => setTimeout(() => r('cola'), QUEUED_AFTER_MS))]).catch((e: unknown) => e);
    setSending(false);
    if (result === 'ok' || result === 'cola') {
      clearSent(lid, playerId, eventId, values);
      values.forEach((v, i) => v.trim() && g.place && clearGameDraft(gameKey(g.place, i)));
      toast(result === 'ok' ? 'Enviado. Un admin lo revisará.' : 'Sin señal: tus juegos se envían solos cuando vuelva la conexión.');
      if (result === 'cola') {
        sent.catch((e: unknown) => {
          restoreDraft(lid, playerId, eventId, { values, frames: draft.frames, date: draft.date, balls: draft.balls });
          toast(`No se pudieron enviar: ${saveErrorMessage(e)} Tus juegos volvieron al teléfono.`, 'error');
        });
      }
      router.back();
    } else {
      setError(saveErrorMessage(result));
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sin enviar" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}>
          <X size={24} color={c.fg} />
        </Pressable>
        <Txt variant="section">Enviar mis juegos</Txt>
        <View style={{ width: 44 }} />
      </View>

      <Card style={{ gap: 8 }}>
        <Txt variant="cardTitle">{showGames(typed)}</Txt>
        <Txt variant="meta" tone="muted">
          {`Vista previa guardada en este teléfono. ${
            requirePhoto
              ? 'Adjunta la foto del marcador para que el admin lo compruebe. Sin foto se puede enviar, pero quizá no lo acepte.'
              : 'La foto es opcional en esta liga; un admin lo aprueba.'
          }`}
        </Txt>
      </Card>

      {!photo ? (
        <View style={{ gap: 8 }}>
          <Txt variant="bodyStrong">{requirePhoto ? 'Foto del marcador para verificar' : 'Foto para verificar (opcional)'}</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button size="xl" icon={<Camera size={20} color={c.fg} />} onPress={() => void pick('camera')} style={{ flex: 1 }}>
              Tomar foto
            </Button>
            <Button size="xl" icon={<ImagePlus size={20} color={c.fg} />} onPress={() => void pick('library')} style={{ flex: 1 }}>
              Galería
            </Button>
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Image
            source={{ uri: photo.data }}
            accessibilityLabel="Foto del marcador"
            style={{ width: '100%', aspectRatio: photo.width && photo.height ? photo.width / photo.height : 4 / 3, borderRadius: 16 }}
            contentFit="cover"
          />
          {scanning && (
            <View style={{ flexDirection: 'row', gap: 8, borderRadius: 12, padding: 12, backgroundColor: c.accentSoft }}>
              {job?.status === 'esperando' && job.motivo === 'sin-senal' ? <WifiOff size={16} color={c.accent} /> : <Sparkles size={16} color={c.accent} />}
              <Txt tone="accent" variant="meta" style={{ flex: 1 }}>
                {`${job?.status === 'esperando' ? waitingText(job.motivo) : 'Leyendo la foto…'} Puedes enviar ya: se comprueba sola y el admin verá lo que dice.`}
              </Txt>
            </View>
          )}
          {scanError && (
            <View style={{ flexDirection: 'row', gap: 8, borderRadius: 12, padding: 12, backgroundColor: c.warnSoft }}>
              <AlertTriangle size={16} color={c.warn} />
              <Txt variant="meta" style={{ flex: 1, color: c.warn }}>
                {scanError}
              </Txt>
            </View>
          )}
          {rows.length > 1 && (
            <View style={{ gap: 6 }}>
              <Txt variant="meta" tone="muted">
                Tu fila en la foto
              </Txt>
              <Card padded={false}>
                {rows.map((r, i) => (
                  <ChoiceRow key={i} title={r.name} subtitle={showGames(r.games)} selected={rowIdx === i} onPress={() => setRowIdx(i)} />
                ))}
              </Card>
            </View>
          )}
          {scanned && (
            <View style={{ gap: 8, borderRadius: 12, padding: 12, backgroundColor: differs ? c.warnSoft : c.okSoft }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {differs ? <Sparkles size={16} color={c.warn} /> : <CheckCircle2 size={16} color={c.ok} />}
                <Txt variant="meta" style={{ flex: 1, color: differs ? c.warn : c.ok }}>
                  {`La foto dice ${showGames(scanned)}${scannedRow?.matchesTotal === true ? ` (cuadra con el total ${scannedRow.total})` : ''}${
                    differs ? ', distinto a lo que anotaste.' : '. Coincide con lo que anotaste.'
                  }`}
                </Txt>
              </View>
              {differs && (
                <Button onPress={() => setOverride(Array.from({ length: Math.max(fromDraft.length, scanned.length) }, (_, i) => scanned[i] ?? null))}>Usar lo de la foto</Button>
              )}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button icon={<Camera size={18} color={c.fg} />} onPress={() => void pick('camera')} style={{ flex: 1 }}>
              Cambiar foto
            </Button>
            <Button icon={<ImagePlus size={18} color={c.fg} />} onPress={() => void pick('library')} style={{ flex: 1 }}>
              Galería
            </Button>
          </View>
        </View>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      <Button variant="primary" size="xl" full loading={sending} disabled={!typed.length || invalid} icon={<Send size={20} color={c.accentFg} />} onPress={() => void send()}>
        Enviar
      </Button>
    </Screen>
  );
}
