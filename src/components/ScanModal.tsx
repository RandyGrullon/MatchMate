import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Plus, ScanLine, Sparkles, Trash2 } from 'lucide-react';
import { ballsByGame, knownBalls, lastBall, type Ball } from '../lib/balls';
import { fetchEffectiveAverages, saveVerifiedGames, type VerifiedWrite } from '../lib/data';
import { ballAddedHere, queueGameBalls, queuedBallsByGame, rememberBall, useMyBallGames } from '../lib/data/balls';
import type { CompressedImage } from '../lib/image';
import { useLeagueCtx } from '../lib/league';
import { scanBallUpdate, scanGameBall } from '../lib/scanBalls';
import { ScanError } from '../lib/scan-result';
import { cancelScan, scanDone, startScan, useScanJob } from '../lib/scanJobs';
import { bestMatch, firstFreeSlot, isValidScore, slots } from '../lib/stats';
import type { BowlingEvent, Entry, Player } from '../lib/types';
import { GameBallChip, useBallChoice } from './balls/BallPicker';
import { useBusy } from './busy';
import { useAction, useFeedback } from './feedback';
import { PhotoPicker } from './PhotoPicker';
import { PhotoView } from './PhotoModal';
import { Badge, Button, Card, Modal, Select, Spinner, cx } from './ui';
import { PRIVACY_PATH } from '../pages/legal/legal';

interface RowDraft {
  key: string;
  /** Nombre leído en la pantalla (null = fila agregada a mano). */
  screenName: string | null;
  screenHcp: number | null;
  /** Total que muestra la pantalla y si la suma leída cuadra con él. */
  screenTotal: number | null;
  matchesTotal: boolean | null;
  playerId: string;
  start: number;
  values: string[];
  include: boolean;
}

let rowSeq = 0;

/**
 * Admin: sube la foto del marcador, la IA lee los juegos, se emparejan con los jugadores
 * y al guardar esos juegos quedan verificados (cuentan en estadísticas).
 */
export function ScanModal({
  open,
  onClose,
  event,
  entries,
  players,
  focusPlayerId,
}: {
  open: boolean;
  onClose: () => void;
  event: BowlingEvent;
  entries: Entry[];
  players: Player[];
  focusPlayerId?: string | null;
}) {
  const { lid, isAdmin, myPlayerId } = useLeagueCtx();
  const run = useAction();
  const { toast } = useFeedback();
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const job = useScanJob(scanId);
  // El admin está mirando: la lectura no espera señal ni reintenta; si falla, anota a mano mirando la foto.
  const scanning = job?.status === 'leyendo';
  const [scanError, setScanError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowDraft[]>([]);
  const saving = useBusy();
  // La lectura de la foto actual (si se elige otra o se cierra, lo que llegue de la anterior no se usa).
  const current = useRef<string | null>(null);
  // Si quien verifica también juega aquí: la bola de cada uno de sus juegos (solo en su fila).
  const ownBalls = useOwnBalls(open, event, entries, rows, myPlayerId);

  useEffect(() => {
    if (open) {
      setPhoto(null);
      setRows([]);
      setScanError(null);
      setScanId(null);
      current.current = null;
    } else {
      cancelScan(current.current);
    }
  }, [open]);

  const entryOf = (playerId: string) => entries.find((e) => e.playerId === playerId) ?? null;
  const participants = players.filter((p) => entries.some((e) => e.playerId === p.id));
  // Solo el admin inscribe jugadores nuevos al guardar; el anotador usa los que ya están.
  const others = isAdmin ? players.filter((p) => !entries.some((e) => e.playerId === p.id)) : [];

  /** Fila a mano: arranca en el primer juego sin verificar, con lo que ya estaba anotado como borrador. */
  function manualRow(playerId = ''): RowDraft {
    const entry = entryOf(playerId);
    const start = firstFreeSlot(entry, event.games, 1);
    const draft = slots(entry?.scores, event.games, null).slice(start);
    return {
      key: `r${rowSeq++}`,
      screenName: null,
      screenHcp: null,
      screenTotal: null,
      matchesTotal: null,
      playerId,
      start,
      values: draft.map((v) => (v == null ? '' : String(v))),
      include: true,
    };
  }

  async function onPicked(img: CompressedImage) {
    setPhoto(img);
    setRows([]);
    setScanError(null);
    cancelScan(current.current);
    const id = startScan(img.scan, { background: false, leagueId: lid, eventId: event.id });
    current.current = id;
    setScanId(id);
    try {
      const found = await scanDone(id);
      if (current.current !== id) return;
      const used = new Set<string>();
      const next = found.map((r) => {
        const match = bestMatch(r.name, participants.filter((p) => !used.has(p.id))) ?? bestMatch(r.name, others.filter((p) => !used.has(p.id)));
        let playerId = match?.id ?? '';
        if (!playerId && found.length === 1 && focusPlayerId) playerId = focusPlayerId;
        if (playerId) used.add(playerId);
        const count = Math.min(r.games.length, event.games);
        return {
          key: `r${rowSeq++}`,
          screenName: r.name,
          screenHcp: r.handicap,
          screenTotal: r.total,
          matchesTotal: r.matchesTotal,
          playerId,
          start: firstFreeSlot(entryOf(playerId), event.games, count),
          values: r.games.map((g) => (g == null ? '' : String(g))),
          include: !focusPlayerId || playerId === focusPlayerId || found.length === 1,
        };
      });
      setRows(next);
    } catch (e) {
      if (current.current !== id) return;
      setScanError(e instanceof ScanError ? e.message : 'No se pudo escanear la foto.');
      setRows([manualRow(focusPlayerId ?? '')]);
    }
  }

  const update = (key: string, patch: Partial<RowDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const included = rows.filter((r) => r.include);
  const duplicated = included.filter((r, i) => r.playerId && included.findIndex((x) => x.playerId === r.playerId) !== i);
  const problems: string[] = [];
  if (included.some((r) => !r.playerId)) problems.push('Elige el jugador de cada fila marcada.');
  if (duplicated.length) problems.push('Hay un jugador repetido en dos filas.');
  if (included.some((r) => r.values.some((v) => v.trim() !== '' && !isValidScore(Number(v))))) problems.push('Los juegos van de 0 a 300.');
  const gamesToSave = included.reduce(
    (n, r) => n + r.values.filter((v, k) => v.trim() !== '' && r.start + k < event.games).length,
    0,
  );

  /** Los juegos de la fila que se guardan (juego del evento → pinos): los escritos que caben en el evento. */
  function valuesOf(r: RowDraft): Record<number, number> {
    const values: Record<number, number> = {};
    r.values.forEach((v, k) => {
      if (v.trim() !== '' && r.start + k < event.games) values[r.start + k] = Number(v);
    });
    return values;
  }

  async function save() {
    if (!photo || problems.length || !gamesToSave) return;
    // Las bolas de sus juegos como se ven ahora: al guardar cambian sus puntajes y, con ellos, la que se pone sola.
    const mine = included.find((r) => r.key === ownBalls.row);
    const balls = mine ? ownBalls.update(valuesOf(mine)) : null;
    // Los promedios de los nuevos también se esperan: la ruedita sale desde el toque y se quita aunque fallen.
    const ok = await saving.run('guardar', async () => {
      const newcomers = included.filter((r) => !entryOf(r.playerId)).map((r) => players.find((p) => p.id === r.playerId)!);
      const averages = newcomers.length ? await fetchEffectiveAverages(lid, newcomers, { date: event.date, eventId: event.id }) : new Map<string, number>();
      const writes: VerifiedWrite[] = included.map((r) => ({
        entry: entryOf(r.playerId),
        playerId: r.playerId,
        average: averages.get(r.playerId) ?? 0,
        values: valuesOf(r),
      }));
      return run(() => saveVerifiedGames(lid, event, photo, writes));
    });
    if (ok) {
      // Sus juegos ya están guardados: la bola de cada uno va detrás, en la cola de la liga (solo las que cambian). La
      // que eligió se pone sola la próxima vez.
      if (balls) {
        queueGameBalls('event', event.id, balls, lid);
        rememberBall(lastBall(Object.values(balls)));
      }
      toast(`${gamesToSave} ${gamesToSave === 1 ? 'juego aprobado' : 'juegos aprobados'}`);
      onClose();
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <ScanLine className="size-5 text-accent" /> Verificar juegos con foto
        </span>
      }
      footer={
        photo && (
          <>
            <PhotoPicker compact label="Otra foto" onPicked={onPicked} />
            <Button onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={save} loading={saving.isBusy()} disabled={scanning || !!problems.length || !gamesToSave}>
              Guardar {gamesToSave ? `${gamesToSave} ${gamesToSave === 1 ? 'juego' : 'juegos'}` : ''}
            </Button>
          </>
        )
      }
    >
      {!photo ? (
        <div className="flex flex-col gap-3">
          <PhotoPicker onPicked={onPicked} />
          <p className="text-xs text-muted">
            Sin foto los juegos quedan como borrador (vista previa) y no cuentan en promedio ni clasificación.
          </p>
          {/* Aviso de privacidad: la foto la lee Google en su plan gratis (Ley 172-13: decir a quién va y para qué). */}
          <p className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span>
              La foto la lee la IA de Google (Gemini, plan gratis), y Google puede usarla para mejorar sus productos. Toma solo la pantalla del
              marcador, sin personas.{' '}
              <a href={`${PRIVACY_PATH}#fotos`} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline underline-offset-2">
                Más en Privacidad
              </a>
            </span>
          </p>
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <PhotoView src={photo.data} />
          <div className="flex flex-col gap-3">
            {scanning && (
              <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-3 text-sm text-accent">
                <Spinner className="text-accent" /> Leyendo la foto con IA…
              </div>
            )}
            {scanError && (
              <div className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {scanError} Puedes anotar los juegos a mano mirando la foto; la foto queda como comprobante.
                </span>
              </div>
            )}
            {!scanning && !scanError && rows.length > 0 && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <Sparkles className="size-4 text-accent" /> Revisa lo leído antes de guardar.
              </p>
            )}
            {rows.map((r) => {
              const entry = entryOf(r.playerId);
              return (
                <Card key={r.key} className={cx('flex flex-col gap-3 p-3', !r.include && 'opacity-55')}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={r.include}
                      onChange={(e) => update(r.key, { include: e.target.checked })}
                      aria-label="Incluir esta fila"
                    />
                    <span className="text-xs text-muted">
                      {r.screenName ? (
                        <>
                          Leído: <b className="text-fg">{r.screenName}</b>
                          {r.screenHcp != null && ` · Hcp ${r.screenHcp}`}
                          {r.matchesTotal === true && <span className="ml-1.5 text-ok">✓ cuadra con el total {r.screenTotal}</span>}
                          {r.matchesTotal === false && (
                            <span className="ml-1.5 text-warn">⚠ la suma no cuadra con el total {r.screenTotal}: revisa</span>
                          )}
                        </>
                      ) : (
                        'Fila manual'
                      )}
                    </span>
                    {!r.screenName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        aria-label="Quitar fila"
                        onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        icon={<Trash2 className="size-4" />}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Select
                      value={r.playerId}
                      onChange={(e) =>
                        r.screenName
                          ? update(r.key, {
                              playerId: e.target.value,
                              start: firstFreeSlot(entryOf(e.target.value), event.games, Math.min(r.values.length, event.games)),
                            })
                          : update(r.key, { ...manualRow(e.target.value), key: r.key })
                      }
                      aria-label="Jugador"
                      className={cx(!r.playerId && r.include && 'border-warn')}
                    >
                      <option value="">— Elegir jugador —</option>
                      <optgroup label="En este evento">
                        {participants.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                      {others.length > 0 && (
                        <optgroup label="Otros (se inscriben)">
                          {others.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Select>
                    <Select
                      value={r.start}
                      onChange={(e) => update(r.key, { start: +e.target.value })}
                      aria-label="Desde el juego"
                      className="w-auto"
                    >
                      {Array.from({ length: event.games }, (_, i) => (
                        <option key={i} value={i}>
                          Desde J{i + 1}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <ScanGames row={r} games={event.games} entry={entry} own={ownBalls} onValues={(values) => update(r.key, { values })} />
                  {r.playerId && !entry && <Badge tone="accent">Se inscribe en el evento al guardar</Badge>}
                </Card>
              );
            })}
            {!scanning && (
              <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setRows((rs) => [...rs, manualRow()])} className="self-start">
                Agregar fila a mano
              </Button>
            )}
            {problems.length > 0 && included.length > 0 && (
              <ul className="text-xs text-danger">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** La bola de los juegos de quien verifica (useOwnBalls). */
export interface OwnBalls {
  /**
   * La fila con sus juegos (su key), si se puede anotar la bola de cada uno; null si no: no juega aquí, no marcó su fila
   * o no se saben las bolas que ya tenían esos juegos (guardar podría pisarlas).
   */
  row: string | null;
  /** Todas las de la cuenta (también las retiradas). */
  balls: readonly Ball[];
  /** La bola que se ve en un juego del evento (desde 0). */
  ballOf: (game: number) => string | null;
  /** Eligió una para ese juego (siempre la misma función: el botón de la bola es `memo`). */
  onPick: (game: number | 'all', id: string | null) => void;
  /** Lo que va a la cola al guardar sus juegos (juego del evento → pinos); null si no cambia ninguna bola. */
  update: (values: Readonly<Record<number, number>>) => Record<string, string | null> | null;
}

/**
 * La bola de cada juego de la fila de quien verifica, si también juega aquí (`myPlayerId`): set_game_balls anota los de
 * la cuenta, así que nunca sale en la fila de otro. Lo elegido va por juego del evento y se olvida si esa fila cambia de
 * jugador. Solo si se saben las bolas que ya tenían esos juegos: las del servidor (o ninguna, si la cuenta no tenía bolas
 * al abrir) con lo que está en la cola encima (lo mismo que ve la hoja del evento).
 */
export function useOwnBalls(
  open: boolean,
  event: BowlingEvent,
  entries: readonly Entry[],
  rows: readonly Pick<RowDraft, 'key' | 'playerId' | 'include'>[],
  myPlayerId: string | null,
): OwnBalls {
  const choice = useBallChoice();
  // Su fila (la marcada, si está en dos).
  const mine = myPlayerId ? (rows.find((r) => r.include && r.playerId === myPlayerId) ?? rows.find((r) => r.playerId === myPlayerId)) : undefined;
  const mineKey = mine?.key ?? null;
  const [picked, setPicked] = useState<{ row: string; balls: Record<number, string | null> } | null>(null);
  // Otro jugador en esa fila (o se quitó): lo elegido se olvida, aunque después vuelva a ser suya.
  useEffect(() => {
    setPicked((p) => (p && p.row !== mineKey ? null : p));
  }, [mineKey]);
  // La cuenta no tenía bolas (ni retiradas) al abrir: sus juegos de aquí no tenían ninguna. Se fija en cada apertura (la
  // hoja vive con la pestaña): al agregar la primera aquí mismo no se vuelven a leer y lo elegido no se pierde.
  const noneAtOpen = useRef<boolean | null>(null);
  if (!open) noneAtOpen.current = null;
  else if (noneAtOpen.current == null && choice.canPick) noneAtOpen.current = choice.balls.length === 0;
  // Sin bolas al abrir (y las de ahora se agregaron aquí) no se piden: ninguno tenía bola. Si llega una de otro teléfono,
  // la lista del teléfono estaba vieja: se piden.
  const noneYet = noneAtOpen.current === true && choice.balls.every((b) => ballAddedHere(b.id));
  const evBalls = useMyBallGames(event.id, open && !!mine && noneAtOpen.current != null && !noneYet);
  const server = noneYet ? {} : !evBalls.loading && !evBalls.error ? ballsByGame(evBalls.data, 'event', event.id) : null;
  // null = no se sabe (sin la lista de bolas, o sin leer sus juegos y sin señal): la bola no sale ni se guarda.
  const had = noneAtOpen.current == null ? null : knownBalls(event.games, server, queuedBallsByGame('event', event.id));
  const row = mine?.include && had ? mine.key : null;
  const scored = slots(entries.find((e) => e.playerId === myPlayerId)?.scores, event.games, null);
  const own = picked && picked.row === mineKey ? picked.balls : {};
  const ballOf = (game: number) => scanGameBall(had ?? {}, own, game, scored[game] != null, choice.auto);
  const onPick = useCallback(
    (game: number | 'all', id: string | null) => {
      if (game === 'all' || !mineKey) return;
      setPicked((p) => ({ row: mineKey, balls: { ...(p?.row === mineKey ? p.balls : {}), [game]: id } }));
    },
    [mineKey],
  );
  return {
    row,
    balls: choice.balls,
    ballOf,
    onPick,
    update: (values) => (row && had ? scanBallUpdate(had, values, event.games, ballOf) : null),
  };
}

/**
 * Los juegos de una fila: el puntaje de cada juego del evento (desde «Desde J»; los que no caben, tachados) y, en la de
 * quien verifica (`own.row`), la bola de cada uno debajo.
 */
export function ScanGames({
  row,
  games,
  entry,
  own,
  onValues,
}: {
  row: Pick<RowDraft, 'key' | 'start' | 'values'>;
  games: number;
  entry: Entry | null;
  own?: OwnBalls | null;
  onValues: (values: string[]) => void;
}) {
  const draft = slots(entry?.scores, games, null);
  const verified = slots(entry?.photos, games, null);
  const ball = own && own.row === row.key ? own : null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {row.values.map((v, k) => {
          const slot = row.start + k;
          const out = slot >= games;
          const typed = out ? null : draft[slot];
          const differs = typed != null && v.trim() !== '' && Number(v) !== typed;
          return (
            <div key={k} className="flex w-16 flex-col items-center gap-1">
              <span className="text-[11px] text-muted">{out ? 'fuera' : `J${slot + 1}`}</span>
              <input
                type="number"
                inputMode="numeric"
                value={v}
                disabled={out}
                aria-label={`Juego ${slot + 1}`}
                onChange={(e) => onValues(row.values.map((x, j) => (j === k ? e.target.value : x)))}
                className={cx(
                  'h-10 w-full rounded-lg border bg-surface text-center font-semibold tabular-nums',
                  out ? 'border-line opacity-40 line-through' : differs ? 'border-warn' : 'border-line',
                )}
              />
              {ball && !out && <GameBallChip game={slot} balls={ball.balls} value={ball.ballOf(slot)} onPick={ball.onPick} />}
              {differs && <span className="text-[10px] text-warn">anotado {typed}</span>}
              {!out && verified[slot] && <span className="text-[10px] text-muted">reemplaza ✓</span>}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => onValues([...row.values, ''])}
          className="mt-5 flex size-10 items-center justify-center rounded-lg border border-dashed border-line text-muted hover:text-fg"
          aria-label="Agregar juego"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {ball && <p className="text-xs text-muted">Son tus juegos: debajo de cada uno, anota con qué bola lo tiraste.</p>}
    </>
  );
}
