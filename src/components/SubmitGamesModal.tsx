import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Grid3x3, Plus, Send, Sparkles, Target, WifiOff } from 'lucide-react';
import { ballForGame, sameBall, submissionBalls } from '../lib/balls';
import { setSubmissionScan, submitGames } from '../lib/data';
import { getUserId } from '../lib/data/client';
import { clearSent, draftCount, latestDraft, loadDraft, restoreDraft, saveDraft } from '../lib/draft';
import { eventTitle, parseDate, toIsoDate } from '../lib/format';
import type { CompressedImage } from '../lib/image';
import { useLeagueCtx } from '../lib/league';
import { rowFor } from '../lib/scan-result';
import { cancelScan, scanDone, startScan, useScanJob, waitingText } from '../lib/scanJobs';
import { isValidScore } from '../lib/stats';
import type { BowlingEvent, Entry, GameFrames, Player } from '../lib/types';
import { AllGamesBall, GameBallChip, GameBallSelect, useBallChoice } from './balls/BallPicker';
import { useFeedback } from './feedback';
import { clearGameDraft, gameKey, moveGameDrafts, myGamesPlace } from './frames/draftMemory';
import { framesMode } from './frames/FrameEditor';
import { ScoreEntryModal } from './frames/ScoreEntryModal';
import { PhotoPicker } from './PhotoPicker';
import { PhotoView } from './PhotoModal';
import { Button, Field, Input, Modal, Select, Spinner, cx } from './ui';

/** Opción para subir juegos de un día sin evento creado. */
const BY_DATE = '__fecha__';
/** Cuánto se espera la respuesta del servidor antes de dar el envío por guardado (sin señal). */
const OFFLINE_WAIT_MS = 6000;

/** set_game_balls anota la bola hasta el juego 10 (claves 0 a 9): de ahí en adelante no se elige ni se manda. */
const BALL_GAMES = 10;

/** Juegos del borrador con al menos los del evento (J1…Jn). */
function padded(values: string[] | undefined, games = 3): string[] {
  return Array.from({ length: Math.max(games, values?.length ?? 0) }, (_, i) => values?.[i] ?? '');
}

/**
 * Las bolas al elegir la de un juego: ese juego queda con la elegida; los que siguen y ya tienen pinos se quedan con la
 * bola que mostraban (la heredaban: no cambian solos). Los vacíos, y los que no mostraban ninguna, la heredan como siempre.
 */
export function pickGameBall(
  balls: Readonly<Record<string, string | null>>,
  game: number,
  id: string | null,
  values: readonly string[],
  auto: string | null,
): Record<string, string | null> {
  const out = { ...balls };
  values.forEach((v, j) => {
    if (j <= game || v.trim() === '' || balls[String(j)] !== undefined) return;
    const had = ballForGame(balls, j, auto);
    if (had) out[String(j)] = had;
  });
  out[String(game)] = id;
  return out;
}

/** Jugador: anota sus juegos (vista previa local, por total o por cuadros), adjunta la foto y lo envía al admin. */
export function SubmitGamesModal({
  open,
  onClose,
  player,
  events,
  myEntries,
  preferEventId,
}: {
  open: boolean;
  onClose: () => void;
  player: Player;
  events: BowlingEvent[];
  myEntries: Entry[];
  /** Evento que se abre elegido (desde la pantalla del evento). */
  preferEventId?: string;
}) {
  const { lid, league, myPlayerId } = useLeagueCtx();
  const requirePhoto = league.requirePhoto !== false;
  const { toast, confirm } = useFeedback();

  const recent = useMemo(() => {
    const cutoff = Date.now() - 120 * 86400_000;
    return events.filter((e) => parseDate(e.date).getTime() >= cutoff || myEntries.some((m) => m.eventId === e.id) || e.id === preferEventId);
  }, [events, myEntries, preferEventId]);

  const today = toIsoDate(new Date());
  /** Con qué se abre: el evento pedido; si no, donde se quedó el último borrador; si no, el más reciente que ya se jugó (o por fecha). */
  function opening() {
    const preferred = preferEventId ? recent.find((e) => e.id === preferEventId) : undefined;
    const last = preferred ? null : latestDraft(lid, player.id);
    const ev =
      preferred ??
      (last?.eventId === BY_DATE ? undefined : (recent.find((e) => e.id === last?.eventId) ?? recent.find((e) => e.date <= today)));
    const id = ev?.id ?? BY_DATE;
    const d = loadDraft(lid, player.id, id);
    return { id, date: id === BY_DATE ? (d?.date ?? today) : today, values: padded(d?.values, ev?.games), frames: d?.frames ?? {}, balls: d?.balls ?? {} };
  }
  // Si ya se monta abierto, se dibuja de una vez con lo del borrador (no con los juegos vacíos hasta el efecto de abrir).
  const [first] = useState(() => (open ? opening() : null));
  const [eventId, setEventId] = useState(first?.id ?? '');
  const [date, setDate] = useState(first?.date ?? today);
  const [values, setValues] = useState<string[]>(first?.values ?? []);
  const [frames, setFrames] = useState<Record<string, GameFrames>>(first?.frames ?? {});
  // Con qué bola tiró cada juego (lo que eligió; null = sin bola). Va en el borrador y con el envío.
  const [balls, setBalls] = useState<Record<string, string | null>>(first?.balls ?? {});
  const choice = useBallChoice();
  // La bola sale solo en los juegos de la cuenta (set_game_balls anota los de quien entró) y con su lista de bolas leída,
  // aunque no tenga ninguna (la agrega ahí mismo). Sin señal y sin la lista en el teléfono no se sabe: no sale.
  const ballsOn = player.id === myPlayerId && choice.canPick;
  const ballPick = useRef<string | null>(null);
  // Lo de ahora para elegir desde los botones de las bolas: su onPick es siempre el mismo (no se redibujan con cada tecla).
  const now = useRef({ values, auto: choice.auto });
  now.current = { values, auto: choice.auto };
  const pickBall = useCallback((game: number | 'all', id: string | null) => {
    const { values: vs, auto } = now.current;
    setBalls((bs) => (game === 'all' ? Object.fromEntries(vs.map((_, i) => [String(i), id])) : pickGameBall(bs, game, id, vs, auto)));
  }, []);
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  // La foto se lee en segundo plano: se puede enviar sin esperar y lo leído se agrega al envío después.
  const [scanId, setScanId] = useState<string | null>(null);
  const job = useScanJob(scanId);
  const [rowIdx, setRowIdx] = useState<number | null>(null);
  // La lectura ya se usó (para no volver a llenar ni a elegir la fila cada vez que se dibuja).
  const applied = useRef<string | null>(null);
  // La lectura que quedó a cargo de agregarse al envío (esa no se cancela al cerrar).
  const handedOff = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const [framesFor, setFramesFor] = useState<number | null>(null);
  // El borrador se guarda solo después de cargarlo al abrir (si no, se guardaría lo de la vez anterior).
  const [loaded, setLoaded] = useState(false);
  // Lo que se cargó al abrir: mientras no se toque, no se publica en vivo (abrir no es anotar).
  // Una vez que el jugador cambia algo, todo lo que sigue se publica (aunque vuelva a lo de antes).
  const loadedValues = useRef('');
  const touched = useRef(false);

  const byDate = eventId === BY_DATE;
  const event = recent.find((e) => e.id === eventId);
  // Si ese día ya hay práctica o torneo, se avisa: el admin lo pondrá ahí.
  const sameDay = byDate ? events.find((e) => e.date === date) : undefined;

  useEffect(() => {
    if (!open) {
      setLoaded(false);
      // Se cerró sin enviar: la foto ya no se va a usar (no gasta el cupo gratis de la IA).
      if (scanId !== handedOff.current) cancelScan(scanId);
      return;
    }
    const o = opening();
    setEventId(o.id);
    setDate(o.date);
    setValues(o.values);
    setFrames(o.frames);
    setBalls(o.balls);
    loadedValues.current = `${o.id}:${o.values.join('|')}`;
    touched.current = false;
    setPhoto(null);
    setScanId(null);
    setRowIdx(null);
    applied.current = null;
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cada evento tiene su propio borrador en el teléfono.
  useEffect(() => {
    if (!open || !loaded || !eventId) return;
    saveDraft(
      lid,
      player.id,
      eventId,
      { date: eventId === BY_DATE ? date : undefined, values, frames, balls },
      { live: (touched.current ||= `${eventId}:${values.join('|')}` !== loadedValues.current) },
    );
  }, [open, loaded, eventId, date, values, frames, balls, lid, player.id]);

  // Lo que va anotando por cuadros queda en el teléfono aunque cierre esa hoja sin «Listo»: por cuenta, jugador, evento
  // (o «Otro día», sea cual sea la fecha: como el borrador) y juego. La misma que «Mis juegos» del evento (es el mismo
  // juego en el teléfono).
  const memoryPlace = (id: string) => myGamesPlace(getUserId(), lid, player.id, id);
  const memoryKey = (i: number) => gameKey(memoryPlace(eventId), i);

  function changeEvent(id: string) {
    const ev = recent.find((e) => e.id === id);
    const there = loadDraft(lid, player.id, id);
    if (draftCount(there) > 0) {
      // Ese evento ya tiene juegos en el teléfono: se muestran esos (los de aquí se quedan en su evento).
      setValues(padded(there!.values, ev?.games));
      setFrames(there!.frames ?? {});
      setBalls(there!.balls ?? {});
      loadedValues.current = `${id}:${padded(there!.values, ev?.games).join('|')}`;
    } else {
      // Lo anotado se pasa al evento elegido (se había elegido mal el evento), también lo que quedó a medias en cuadros.
      saveDraft(lid, player.id, eventId, null);
      moveGameDrafts(memoryPlace(eventId), memoryPlace(id));
      setValues((v) => Array.from({ length: ev?.games ?? Math.max(3, v.length) }, (_, i) => v[i] ?? ''));
    }
    setEventId(id);
  }

  function setValue(i: number, v: string) {
    setValues((vs) => vs.map((x, j) => (j === i ? v : x)));
    // Si cambia el total a mano, los cuadros de ese juego ya no valen (tampoco lo que quedó a medias en la hoja).
    clearGameDraft(memoryKey(i));
    setFrames((fs) => {
      if (!fs[i]) return fs;
      const next = { ...fs };
      delete next[i];
      return next;
    });
  }

  /** Otro juego (por fecha): con la bola del anterior, también si es «Sin bola» (eso no se hereda solo). */
  function addGame() {
    const n = values.length;
    setValues((v) => [...v, '']);
    setBalls((bs) => {
      const next = { ...bs };
      // Lo de un juego que ya no estaba (de otro evento con más juegos) no vale para este.
      delete next[String(n)];
      if (bs[String(n - 1)] === null) next[String(n)] = null;
      return next;
    });
  }

  const scanning = job?.status === 'leyendo' || job?.status === 'esperando';
  const rows = job?.status === 'listo' ? job.rows : [];
  const scanError =
    job?.status === 'error'
      ? `${job.message} Igual puedes enviarla; el admin la revisará.`
      : job?.status === 'listo' && rowIdx == null
        ? 'No encontramos tu nombre en la foto. Elige cuál fila eres.'
        : null;
  const scannedRow = rowIdx != null ? rows[rowIdx] ?? null : null;
  const scanned = scannedRow?.games ?? null;
  // Juegos por posición (J1, J2...): vacío = no lo jugó.
  const typed = values.map((v) => (v.trim() === '' ? null : Number(v)));
  while (typed.length && typed[typed.length - 1] == null) typed.pop();
  const hasTyped = typed.some((v) => v != null);
  const invalid = typed.some((v) => v != null && !isValidScore(v));
  const differs =
    scanned != null && hasTyped && Array.from({ length: Math.max(typed.length, scanned.length) }, (_, i) => (typed[i] ?? null) !== (scanned[i] ?? null)).some(Boolean);
  const showGames = (gs: (number | null)[]) => gs.map((g) => g ?? '–').join(' · ');
  const ballOf = (i: number) => ballForGame(balls, i, choice.auto);
  const withScore = typed.flatMap((v, i) => (v != null ? [i] : []));
  // La bola de «todos los juegos» (undefined: los juegos tienen bolas distintas).
  const allBall = sameBall((withScore.length ? withScore : values.map((_, i) => i)).map(ballOf));

  function onPicked(img: CompressedImage) {
    // Otra foto: la anterior ya no se usa.
    cancelScan(scanId);
    setPhoto(img);
    setRowIdx(null);
    // La lectura se cobra al cupo de la liga (y del evento, si ya se eligió).
    setScanId(startScan(img.scan, { leagueId: lid, eventId: byDate ? null : (event?.id ?? null) }));
  }

  // Cuando termina de leerse: se elige la fila del jugador y, si no había anotado nada, se llenan sus juegos.
  useEffect(() => {
    if (!scanId || job?.status !== 'listo' || applied.current === scanId) return;
    applied.current = scanId;
    const row = rowFor(player.name, job.rows);
    const idx = row ? job.rows.indexOf(row) : null;
    setRowIdx(idx);
    if (row && !hasTyped) {
      setValues((vs) => Array.from({ length: Math.max(vs.length, row.games.length) }, (_, i) => String(row.games[i] ?? '')));
      setFrames({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, job]);

  /** La foto se terminó de leer después de enviar: lo leído se agrega al envío para que el admin lo compare. */
  function attachWhenRead(subId: string, jobId: string, sentScores: (number | null)[]) {
    scanDone(jobId)
      .then(async (found) => {
        const row = rowFor(player.name, found);
        // Si no se sabe cuál fila es, el admin la elige al revisar.
        if (!row) return;
        await setSubmissionScan(lid, subId, row.games, row.name);
        const same =
          Array.from({ length: Math.max(sentScores.length, row.games.length) }, (_, i) => (sentScores[i] ?? null) === (row.games[i] ?? null)).every(Boolean);
        if (!same) toast(`La foto de tu envío dice ${showGames(row.games)}, distinto a lo que anotaste. El admin lo revisará.`, 'error');
      })
      .catch((e) => console.warn('[escaneo] no se agregó la lectura al envío', e));
  }

  async function send() {
    if (!event && !byDate) return;
    if (!photo && requirePhoto) {
      const ok = await confirm({
        title: '¿Enviar sin foto?',
        message:
          'Vas a enviar tu puntuación sin comprobación de imagen. El admin puede no aceptarla. ¿Deseas enviarla?',
        confirmText: 'Enviar sin foto',
      });
      if (!ok) return;
    }
    setSending(true);
    const draftId = eventId;
    const sent = { values: [...values], frames, balls, date: byDate ? date : undefined };
    try {
      const kept = Object.fromEntries(Object.entries(frames).filter(([i]) => typed[+i] != null));
      const { id: subId, sent: sending } = submitGames(lid, {
        playerId: player.id,
        eventId: byDate ? null : event!.id,
        date: byDate ? date : null,
        scores: typed,
        scanned,
        frames: Object.keys(kept).length ? kept : null,
        photo,
        balls: submissionBalls(typed.slice(0, BALL_GAMES), balls, choice.auto, ballsOn),
      });
      // La foto todavía se está leyendo: lo leído se agrega al envío cuando termine (aunque ya se cerró esto).
      if (photo && scanId && scanning) {
        handedOff.current = scanId;
        attachWhenRead(subId, scanId, [...typed]);
      }
      // Sin señal (común en la bolera) el envío queda guardado y sale solo al volver la conexión.
      const result = await Promise.race([
        sending.then(() => 'ok' as const),
        new Promise<'sin-senal'>((r) => setTimeout(() => r('sin-senal'), OFFLINE_WAIT_MS)),
      ]);
      clearSent(lid, player.id, draftId, sent.values);
      // Lo enviado ya no está a medias.
      typed.forEach((v, i) => v != null && clearGameDraft(memoryKey(i)));
      if (result === 'ok') {
        toast('Enviado. Un admin lo revisará.');
      } else {
        toast('Sin señal: tus juegos se envían solos cuando vuelva la conexión.');
        sending.catch((e) => {
          console.error(e);
          restoreDraft(lid, player.id, draftId, sent);
          toast('No se pudieron enviar tus juegos. Siguen en tu teléfono: vuelve a enviarlos.', 'error');
        });
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast('No se pudo enviar. Revisa tu conexión e intenta de nuevo.', 'error');
    } finally {
      setSending(false);
    }
  }

  const dateOk = !byDate || (/^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today);
  // El botón de cada juego abre por cuadros o pino por pino (la forma preferida; el total se escribe en la casilla).
  const byPins = framesMode() === 'pines';
  // No se espera a que se lea la foto: se comprueba sola en segundo plano.
  const canSend = (!!event || byDate) && dateOk && hasTyped && !invalid;

  return (
    <>
      <Modal
        open={open && framesFor == null}
        onClose={onClose}
        title="Subir mis juegos"
        footer={
          <>
            <Button onClick={onClose}>Cerrar</Button>
            <Button variant="primary" icon={<Send className="size-4" />} disabled={!canSend} loading={sending} onClick={send}>
              Enviar para aprobar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="¿Dónde jugaste?">
            <Select value={eventId} onChange={(e) => changeEvent(e.target.value)}>
              {recent.map((e) => (
                <option key={e.id} value={e.id}>
                  {eventTitle(e)}
                </option>
              ))}
              <option value={BY_DATE}>Otro día (elegir fecha)</option>
            </Select>
          </Field>
          {byDate && (
            <Field
              label="¿Qué día jugaste?"
              hint={
                sameDay
                  ? `Ese día hay ${eventTitle(sameDay)}; el admin pondrá tus juegos ahí.`
                  : 'El admin pondrá tus juegos en la práctica de ese día (se crea si no existe).'
              }
            >
              <Input type="date" max={today} required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}

          {ballsOn && <AllGamesBall balls={choice.balls} value={allBall} onPick={pickBall} today={today} />}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Tus juegos</span>
            <div className="flex flex-wrap gap-2">
              {values.map((v, i) => (
                <div key={i} className="flex w-16 flex-col items-center gap-1">
                  <span className="text-[11px] text-muted">J{i + 1}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={300}
                    value={v}
                    aria-label={`Juego ${i + 1}`}
                    onChange={(e) => setValue(i, e.target.value)}
                    className={cx(
                      'h-11 w-full rounded-lg border bg-surface text-center text-base font-semibold tabular-nums',
                      v.trim() && !isValidScore(Number(v)) ? 'border-danger text-danger' : frames[i] ? 'border-accent' : 'border-line',
                    )}
                  />
                  {ballsOn && i < BALL_GAMES && <GameBallChip game={i} balls={choice.balls} value={ballOf(i)} onPick={pickBall} today={today} />}
                  <button
                    type="button"
                    onClick={() => setFramesFor(i)}
                    aria-label={`Anotar el juego ${i + 1} ${byPins ? 'pino por pino' : 'por cuadros'}`}
                    className={cx(
                      'flex min-h-11 w-full items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium',
                      frames[i] ? 'text-accent' : 'text-muted hover:text-fg',
                    )}
                  >
                    {byPins ? <Target className="size-3" aria-hidden="true" /> : <Grid3x3 className="size-3" aria-hidden="true" />}
                    {byPins ? 'pines' : 'cuadros'}
                  </button>
                </div>
              ))}
              {byDate && values.length < 10 && (
                <button
                  type="button"
                  onClick={addGame}
                  className="mt-5 flex size-11 items-center justify-center rounded-lg border border-dashed border-line text-muted hover:text-fg"
                  aria-label="Agregar otro juego"
                >
                  <Plus className="size-4" />
                </button>
              )}
            </div>
            <span className="text-xs text-muted">
              Vista previa guardada en este teléfono.{' '}
              {requirePhoto
                ? 'Adjunta la foto del marcador para que el admin lo compruebe. Sin foto se puede enviar, pero quizá no lo acepte.'
                : 'La foto es opcional en esta liga; un admin lo aprueba.'}
            </span>
          </div>

          {!photo ? (
            <PhotoPicker onPicked={onPicked} label={requirePhoto ? 'Foto del marcador para verificar' : 'Foto para verificar (opcional)'} />
          ) : (
            <div className="flex flex-col gap-3">
              <PhotoView src={photo.data} />
              {scanning && (
                <div className="flex items-start gap-2 rounded-xl bg-accent-soft px-3 py-2.5 text-sm text-accent">
                  {job?.status === 'esperando' && job.motivo === 'sin-senal' ? (
                    <WifiOff className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <Spinner className="mt-0.5 shrink-0 text-accent" />
                  )}
                  <span>
                    {job?.status === 'esperando' ? waitingText(job.motivo) : 'Leyendo la foto…'}{' '}
                    {hasTyped
                      ? 'Puedes enviar ya: se comprueba sola y el admin verá lo que dice.'
                      : 'Tus juegos se llenan solos al leerla, o anótalos tú.'}
                  </span>
                </div>
              )}
              {scanError && (
                <div className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {scanError}
                </div>
              )}
              {rows.length > 1 && (
                <Field label="Tu fila en la foto">
                  <Select value={rowIdx ?? ''} onChange={(e) => setRowIdx(e.target.value === '' ? null : +e.target.value)}>
                    <option value="">— Elegir —</option>
                    {rows.map((r, i) => (
                      <option key={i} value={i}>
                        {r.name}: {showGames(r.games)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {scanned && (
                <div className={cx('flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5 text-sm', differs ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok')}>
                  {differs ? <Sparkles className="size-4" /> : <CheckCircle2 className="size-4" />}
                  <span>
                    La foto dice <b className="tabular-nums">{showGames(scanned)}</b>
                    {scannedRow?.matchesTotal === true && ` (cuadra con el total ${scannedRow.total})`}
                    {differs ? ', distinto a lo que anotaste.' : '. Coincide con lo que anotaste.'}
                  </span>
                  {differs && (
                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={() => {
                        setValues(Array.from({ length: Math.max(values.length, scanned.length) }, (_, i) => String(scanned[i] ?? '')));
                        setFrames({});
                      }}
                    >
                      Usar lo de la foto
                    </Button>
                  )}
                </div>
              )}
              <PhotoPicker compact label="Cambiar foto" onPicked={onPicked} />
            </div>
          )}
        </div>
      </Modal>
      <ScoreEntryModal
        open={framesFor != null}
        onClose={() => setFramesFor(null)}
        title={`Juego ${(framesFor ?? 0) + 1}`}
        resetKey={String(framesFor)}
        memoryKey={framesFor != null ? memoryKey(framesFor) : undefined}
        startMode={framesMode()}
        top={
          ballsOn && framesFor != null && framesFor < BALL_GAMES ? (
            <GameBallSelect key={framesFor} game={framesFor} balls={choice.balls} initial={ballOf(framesFor)} choice={ballPick} today={today} />
          ) : undefined
        }
        initial={{
          score: framesFor != null && values[framesFor]?.trim() ? Number(values[framesFor]) : null,
          frames: framesFor != null ? (frames[framesFor] ?? null) : null,
        }}
        saveText="Listo"
        onSave={(v) => {
          if (framesFor == null) return;
          const i = framesFor;
          setValues((vs) => vs.map((x, j) => (j === i ? (v.score == null ? '' : String(v.score)) : x)));
          setFrames((fs) => {
            const next = { ...fs };
            if (v.frames) next[i] = v.frames;
            else delete next[i];
            return next;
          });
          if (ballsOn && i < BALL_GAMES) setBalls((bs) => pickGameBall(bs, i, ballPick.current, values, choice.auto));
          setFramesFor(null);
        }}
      />
    </>
  );
}
