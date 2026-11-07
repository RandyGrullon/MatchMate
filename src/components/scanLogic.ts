import { useCallback, useEffect, useRef, useState } from 'react';
import { ballsByGame, knownBalls, type Ball } from '../lib/balls';
import { ballAddedHere, queuedBallsByGame, useMyBallGames } from '../lib/data/balls';
import type { ScanRow } from '../lib/scan-result';
import { scanBallUpdate, scanGameBall } from '../lib/scanBalls';
import { bestMatch, firstFreeSlot, isValidScore, slots } from '../lib/stats';
import type { BowlingEvent, Entry, Player } from '../lib/types';
import { useBallChoice } from './balls/choice';

/**
 * Verificar juegos con la foto del marcador (ScanModal de la web y la hoja de la Planilla de la app del teléfono), sin
 * pantallas: las filas que se leyeron (emparejadas con los jugadores), las filas a mano, lo que falta para guardar, los
 * juegos que se guardan y la bola de cada juego de quien verifica si también juega (useOwnBalls).
 */

/** Una fila de la hoja: lo leído de la pantalla (o una a mano) con el jugador elegido y desde qué juego van. */
export interface RowDraft {
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
/** Una clave nueva para una fila (no se repite mientras la app está abierta). */
export const nextScanRowKey = () => `r${rowSeq++}`;

/** Fila a mano: arranca en el primer juego sin verificar, con lo que ya estaba anotado como borrador. */
export function manualScanRow(entry: Pick<Entry, 'scores' | 'photos'> | null, games: number, playerId = '', key = nextScanRowKey()): RowDraft {
  const start = firstFreeSlot(entry, games, 1);
  const draft = slots(entry?.scores, games, null).slice(start);
  return {
    key,
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

/**
 * Lo leído de la foto, emparejado: cada fila con el jugador que más se parece (primero los del evento, después los demás
 * de la liga, que se inscriben al guardar), sin repetir. Si solo hay una fila y se abrió desde un jugador, es él. Con un
 * jugador elegido, solo su fila va marcada (si hay una sola, también).
 */
export function scanRowsFrom(
  found: readonly ScanRow[],
  {
    participants,
    others,
    entryOf,
    games,
    focusPlayerId,
  }: {
    participants: readonly Player[];
    others: readonly Player[];
    entryOf: (playerId: string) => Pick<Entry, 'scores' | 'photos'> | null;
    games: number;
    focusPlayerId?: string | null;
  },
): RowDraft[] {
  const used = new Set<string>();
  return found.map((r) => {
    const match = bestMatch(r.name, participants.filter((p) => !used.has(p.id))) ?? bestMatch(r.name, others.filter((p) => !used.has(p.id)));
    let playerId = match?.id ?? '';
    if (!playerId && found.length === 1 && focusPlayerId) playerId = focusPlayerId;
    if (playerId) used.add(playerId);
    const count = Math.min(r.games.length, games);
    return {
      key: nextScanRowKey(),
      screenName: r.name,
      screenHcp: r.handicap,
      screenTotal: r.total,
      matchesTotal: r.matchesTotal,
      playerId,
      start: firstFreeSlot(entryOf(playerId), games, count),
      values: r.games.map((g) => (g == null ? '' : String(g))),
      include: !focusPlayerId || playerId === focusPlayerId || found.length === 1,
    };
  });
}

/**
 * Otro jugador en una fila: la leída se queda con sus juegos y empieza en el primer hueco de ese jugador; la de a mano se
 * vuelve a armar con lo que él ya tenía anotado.
 */
export function retargetScanRow(row: RowDraft, playerId: string, entry: Pick<Entry, 'scores' | 'photos'> | null, games: number): RowDraft {
  return row.screenName
    ? { ...row, playerId, start: firstFreeSlot(entry, games, Math.min(row.values.length, games)) }
    : { ...manualScanRow(entry, games, playerId), key: row.key };
}

/** Lo que falta para guardar (de las filas marcadas): el jugador de cada una, sin repetir, y juegos de 0 a 300. */
export function scanProblems(rows: readonly RowDraft[]): string[] {
  const included = rows.filter((r) => r.include);
  const duplicated = included.filter((r, i) => r.playerId && included.findIndex((x) => x.playerId === r.playerId) !== i);
  const problems: string[] = [];
  if (included.some((r) => !r.playerId)) problems.push('Elige el jugador de cada fila marcada.');
  if (duplicated.length) problems.push('Hay un jugador repetido en dos filas.');
  if (included.some((r) => r.values.some((v) => v.trim() !== '' && !isValidScore(Number(v))))) problems.push('Los juegos van de 0 a 300.');
  return problems;
}

/** Los juegos de la fila que se guardan (juego del evento → pinos): los escritos que caben en el evento. */
export function scanValuesOf(r: Pick<RowDraft, 'values' | 'start'>, games: number): Record<number, number> {
  const values: Record<number, number> = {};
  r.values.forEach((v, k) => {
    if (v.trim() !== '' && r.start + k < games) values[r.start + k] = Number(v);
  });
  return values;
}

/** Cuántos juegos se guardan (los de las filas marcadas que caben en el evento). */
export const scanGamesToSave = (rows: readonly RowDraft[], games: number): number =>
  rows.filter((r) => r.include).reduce((n, r) => n + Object.keys(scanValuesOf(r, games)).length, 0);

/** «Guardar 3 juegos» (el botón) y «3 juegos aprobados» (el aviso al guardar). */
export const scanSaveLabel = (n: number) => `Guardar ${n ? `${n} ${n === 1 ? 'juego' : 'juegos'}` : ''}`.trim();
export const scanSavedText = (n: number) => `${n} ${n === 1 ? 'juego aprobado' : 'juegos aprobados'}`;

/** Los textos de la hoja (los mismos de la web). */
export const SCAN_TITLE = 'Verificar juegos con foto';
export const SCAN_NO_PHOTO_NOTE = 'Sin foto los juegos quedan como borrador (vista previa) y no cuentan en promedio ni clasificación.';
export const SCAN_PRIVACY_NOTE =
  'La foto la lee la IA de Google (Gemini, plan gratis), y Google puede usarla para mejorar sus productos. Toma solo la pantalla del marcador, sin personas.';
export const SCAN_READING = 'Leyendo la foto con IA…';
export const SCAN_REVIEW = 'Revisa lo leído antes de guardar.';
export const SCAN_FAILED = 'No se pudo escanear la foto.';
export const scanErrorText = (message: string) => `${message} Puedes anotar los juegos a mano mirando la foto; la foto queda como comprobante.`;
export const SCAN_OWN_BALLS = 'Son tus juegos: debajo de cada uno, anota con qué bola lo tiraste.';
export const SCAN_ENROLLS = 'Se inscribe en el evento al guardar';

/** «Leído: Ana · Hcp 12 · ✓ cuadra con el total 560» (o «Fila manual»). */
export function scanReadLine(r: Pick<RowDraft, 'screenName' | 'screenHcp' | 'matchesTotal' | 'screenTotal'>): { read: string | null; check: { ok: boolean; text: string } | null } {
  if (!r.screenName) return { read: null, check: null };
  return {
    read: `${r.screenName}${r.screenHcp != null ? ` · Hcp ${r.screenHcp}` : ''}`,
    check:
      r.matchesTotal === true
        ? { ok: true, text: `✓ cuadra con el total ${r.screenTotal}` }
        : r.matchesTotal === false
          ? { ok: false, text: `⚠ la suma no cuadra con el total ${r.screenTotal}: revisa` }
          : null,
  };
}

/** Lo que dice cada juego de una fila: «J3» (o «fuera» si no cabe), si es distinto de lo anotado y si reemplaza uno verificado. */
export function scanGameCells(row: Pick<RowDraft, 'start' | 'values'>, games: number, entry: Pick<Entry, 'scores' | 'photos'> | null) {
  const draft = slots(entry?.scores, games, null);
  const verified = slots(entry?.photos, games, null);
  return row.values.map((v, k) => {
    const slot = row.start + k;
    const out = slot >= games;
    const typed = out ? null : draft[slot];
    return {
      slot,
      out,
      label: out ? 'fuera' : `J${slot + 1}`,
      /** «anotado 180»: lo que ya tenía y es distinto de lo leído. */
      differs: typed != null && v.trim() !== '' && Number(v) !== typed ? `anotado ${typed}` : null,
      replaces: !out && !!verified[slot],
    };
  });
}

// ---------- La bola de quien verifica ----------

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
