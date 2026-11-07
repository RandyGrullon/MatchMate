import { photosLine } from '../components/organizer/hubLogic';
import { eventTitle, formatDate } from '../lib/format';
import { rowFor, type ScanRow } from '../lib/scan-result';
import { waitingText, type ScanJobState } from '../lib/scanJobs';
import { firstFreeSlot, isValidScore, slots } from '../lib/stats';
import type { BowlingEvent, Entry, League, Player, Submission } from '../lib/types';

/*
 * Organizar › Aprobar juegos sin nada de la pantalla: lo usan ApprovalsPage.tsx de la web y la pantalla de aprobar de la
 * app del teléfono (movil/src/app/l/[lid]/aprobar.tsx). Qué envío está listo, cómo quedan sus juegos, los textos de
 * «Aprobar todo» y lo que se ve de la lectura de la foto con IA.
 */

/** Tiempo en que el teléfono del jugador todavía puede estar leyendo la foto después de enviarla. */
export const FRESH_MS = 5 * 60_000;

/** Sin envíos por aprobar. */
export const EMPTY_TITLE = 'Nada por aprobar';
export const EMPTY_TEXT = 'Cuando un jugador envíe sus juegos, salen aquí con su foto. Al aprobarlos cuentan en la tabla.';
/** Debajo de la lista. */
export const LIST_HINT = 'Toca un envío para ver la foto, lo que leyó la IA y corregir un juego antes de aprobarlo.';

const juegos = (n: number) => (n === 1 ? 'juego' : 'juegos');

// ---------- La lista ----------

/** Los envíos, el más viejo primero. */
export function sortSubmissions<T extends Pick<Submission, 'createdAt'>>(subs: readonly T[]): T[] {
  return [...subs].sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0));
}

/** De más de un evento (o fecha): cada envío dice de cuál es. */
export function showEventOf(subs: readonly Pick<Submission, 'eventId' | 'date'>[]): boolean {
  return new Set(subs.map((s) => s.eventId ?? `fecha:${s.date ?? ''}`)).size > 1;
}

/** El encabezado de la lista: «Por aprobar · 2 con foto». */
export function listTitle(subs: readonly Pick<Submission, 'photoId'>[]): string {
  return `Por aprobar · ${photosLine(subs.map((s) => ({ hasPhoto: !!s.photoId })))}`;
}

/**
 * El evento donde cae el envío. Envío por fecha: va a la práctica de ese día si ya existe (si no, se crea al aprobar y
 * aquí no hay evento).
 */
export function targetEvent(sub: Pick<Submission, 'eventId' | 'date'>, events: readonly BowlingEvent[]): BowlingEvent | undefined {
  return sub.eventId ? events.find((e) => e.id === sub.eventId) : events.find((e) => e.type === 'practica' && e.date === sub.date);
}

// ---------- Un envío ----------

/** Un juego del envío por posición (J1, J2...): lo que anotó y lo que leyó la IA. */
export interface GameRow {
  typed: number | null;
  scanned: number | null;
}

export function gameRows(sub: Pick<Submission, 'scores' | 'scanned'>): GameRow[] {
  const typed = sub.scores ?? [];
  const scanned = sub.scanned ?? [];
  return Array.from({ length: Math.max(typed.length, scanned.length) }, (_, i) => ({ typed: typed[i] ?? null, scanned: scanned[i] ?? null }));
}

/** Lo que se propone guardar: lo leído por la IA y, si no hay, lo anotado. */
export function proposalOf(rows: readonly GameRow[]): string[] {
  return rows.map((r) => String(r.scanned ?? r.typed ?? ''));
}

/** Lo anotado y lo leído no coinciden. */
export const isMismatch = (r: GameRow) => r.typed != null && r.scanned != null && r.typed !== r.scanned;

/** Juegos del evento destino (una práctica nueva por fecha tiene al menos 3, o los que subió). */
export function targetGames(event: Pick<BowlingEvent, 'games'> | null | undefined, count: number): number {
  return event?.games ?? Math.max(3, count);
}

/**
 * Desde qué juego se guarda. Envío de un evento: cada juego va en su lugar (J2 es el J2; un juego vacío es que no lo
 * mandó). Por fecha (práctica sin crear o ya creada), se buscan los primeros juegos libres.
 */
export function defaultStart(sub: Pick<Submission, 'eventId'>, entry: Pick<Entry, 'scores' | 'photos'> | null, games: number, count: number): number {
  return sub.eventId ? 0 : firstFreeSlot(entry, games, count);
}

/** Lo que se aprueba con lo que tiene puesto ahora. */
export interface ApprovalDraft {
  /** Algún número escrito no vale (0–300). */
  invalid: boolean;
  /** Los juegos que se guardan (los que caben en el evento). */
  toSave: number;
  /** Juego del evento (desde 0) → pinos. */
  values: Record<number, number>;
}

export function approvalDraft(values: readonly string[], start: number, games: number): ApprovalDraft {
  const map: Record<number, number> = {};
  let toSave = 0;
  values.forEach((v, k) => {
    if (v.trim() !== '' && start + k < games) {
      map[start + k] = Number(v);
      toSave++;
    }
  });
  return { invalid: values.some((v) => v.trim() !== '' && !isValidScore(Number(v))), toSave, values: map };
}

/** La liga exige foto pero el jugador lo envió sin ella: el admin decide si lo acepta. */
export function isUnverified(sub: Pick<Submission, 'photoId'>, league: Pick<League, 'requirePhoto'>): boolean {
  return !sub.photoId && league.requirePhoto !== false;
}

/** Envío de un jugador o evento que ya no existe (se descarta). */
export function isGone(sub: Pick<Submission, 'date'>, event: BowlingEvent | undefined, player: Player | undefined): boolean {
  return (!event && !sub.date) || !player;
}

/**
 * Si «Aprobar todo» lo toma (con lo que tiene puesto ahora). Sin foto (cuando la liga la exige) o con algo mal escrito,
 * se queda para revisarlo uno por uno.
 */
export function isReady(s: { gone: boolean; invalid: boolean; toSave: number; unverified: boolean }): boolean {
  return !s.gone && !s.invalid && s.toSave > 0 && !s.unverified;
}

/** Llegó lo que leyó la IA (con el envío abierto) y no coincide con lo que se va a guardar. */
export function readDiffers(lateRead: boolean, proposal: readonly string[], values: readonly string[]): boolean {
  return lateRead && proposal.some((v, k) => (values[k] ?? '') !== v);
}

/** Un juego de la línea del envío: su número de juego (desde 1) y lo que se guarda. */
export interface GamePart {
  slot: number;
  v: string;
}

/** Cómo quedan los juegos del envío: vacío es «Sin juegos»; uno, «Juego 2 · 181»; más, «J1 187 · J2 210». */
export function gamesLine(values: readonly string[], start: number): GamePart[] {
  return values.map((v, k) => ({ slot: start + k + 1, v: v.trim() })).filter((g) => g.v !== '');
}

/** Una fila de la tabla «Juego · Anotó · Leyó la IA · Se guarda». */
export interface TableRow extends GameRow {
  /** Juego del evento (desde 0). */
  slot: number;
  /** No cabe en el evento («fuera»). */
  outside: boolean;
  /** Ese juego ya estaba verificado: lo aprobado lo reemplaza. */
  replaces: boolean;
  mismatch: boolean;
}

export function tableRows(rows: readonly GameRow[], start: number, games: number, entry: Pick<Entry, 'photos'> | null): TableRow[] {
  const verified = slots(entry?.photos, games, null);
  return rows.map((r, k) => {
    const slot = start + k;
    return { ...r, slot, outside: slot >= games, replaces: slot < games && !!verified[slot], mismatch: isMismatch(r) };
  });
}

/** De qué evento es (cuando hay de más de uno): el evento o la fecha. */
export function eventLine(event: BowlingEvent | undefined, date: string | null | undefined): string {
  return event ? eventTitle(event) : formatDate(date ?? '');
}

/** Dónde cae al abrirlo: el evento o «Práctica 12 oct · se crea al aprobar». */
export function whereText(event: BowlingEvent | undefined, date: string | null | undefined): string {
  return event ? eventTitle(event) : `Práctica ${formatDate(date ?? '')} · se crea al aprobar`;
}

/** « · enviado 7/11/26 3:15 p. m.» (lo que va detrás de dónde cae). */
export function sentText(ms: number): string {
  return ` · enviado ${new Date(ms).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' })}`;
}

/** No tenía participación en el evento. */
export const notInEventText = (name: string) => `${name} no estaba en este evento: se inscribe al aprobar.`;

/** Para el lector de pantalla del botón Aprobar. */
export const approveLabel = (n: number, name: string) => `Aprobar ${n} ${juegos(n)} de ${name}`;

/** El aviso al aprobar uno. */
export const approvedText = (n: number, name: string) => `Aprobado: ${n} ${juegos(n)} de ${name}`;

// ---------- «Aprobar todo» ----------

/** La pregunta antes de «Aprobar todo»: cuántos envíos, cuántos juegos y cuántos quedan para revisar uno por uno. */
export function approveAllPrompt(ready: number, games: number, left: number): { title: string; message: string; confirmText: string } {
  return {
    title: ready === 1 ? '¿Aprobar el envío?' : `¿Aprobar los ${ready} envíos?`,
    message: `Se guardan ${games} ${juegos(games)} como están ahora y ${games === 1 ? 'cuenta' : 'cuentan'} en la tabla.${
      left ? ` ${left === 1 ? 'Uno queda' : `${left} quedan`} para que ${left === 1 ? 'lo revises' : 'los revises'} uno por uno (sin foto o con algo por corregir).` : ''
    }`,
    confirmText: 'Aprobar todo',
  };
}

/** El aviso al terminar «Aprobar todo». */
export const approvedAllText = (saved: number, done: number) => `Aprobados: ${saved} ${juegos(saved)} de ${done} ${done === 1 ? 'jugador' : 'jugadores'}`;

// ---------- La lectura de la foto con IA ----------

/** Una lectura de la foto que pidió el admin: su id y si pidió elegir la fila. */
export interface AdminRead {
  jobId: string;
  pick: boolean;
}

/** Lecturas de fotos que pidió el admin, por envío (siguen aunque cambie de pantalla y vuelva). */
export const adminReads = new Map<string, AdminRead>();

/** Lo que dice la lectura de la foto (cada uno con su ícono en la pantalla). */
export type ReadingLine =
  | { kind: 'leyendo'; text: string }
  | { kind: 'esperando'; offline: boolean; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'guardando'; text: string }
  | { kind: 'elegir'; text: string }
  | { kind: 'fresca'; text: string }
  | { kind: 'sin-leer'; text: string };

export interface ReadingView {
  /** Ya está leída y el admin no pidió otra lectura: solo «Leer de nuevo o elegir otra fila» (si hay foto). */
  again: boolean;
  line: ReadingLine | null;
  /** Las filas de la foto para elegir (se pidió cambiar de fila o ninguna es la del jugador); null si no se elige. */
  choices: ScanRow[] | null;
  /** El botón de leer (null si no va). */
  button: 'Leer con IA' | 'Intentar de nuevo' | null;
}

/**
 * Lo que se ve de la lectura de la foto del envío. Recién enviado, puede que el teléfono del jugador todavía la esté
 * leyendo; si no llegó, el admin la lee aquí. Con lo leído ya puesto, se puede volver a leer o elegir otra fila.
 */
export function readingView(i: {
  job: ScanJobState | null;
  /** La lectura que pidió el admin (null si no pidió). */
  read: AdminRead | null;
  /** Guardando la fila leída en el envío. */
  saving: boolean;
  /** El envío ya tiene lo leído. */
  hasRead: boolean;
  /** Recién enviado (FRESH_MS). */
  fresh: boolean;
  /** Se tiene la foto (su URL) para leerla. */
  hasPhoto: boolean;
  name: string;
}): ReadingView {
  if (i.hasRead && !i.read) return { again: true, line: null, choices: null, button: null };
  const job = i.job;
  const found = job?.status === 'listo' ? job.rows : null;
  const match = found ? rowFor(i.name, found) : null;
  // Elegir la fila: si se pidió (cambiar fila) o si ninguna es la del jugador.
  const choices = found && (i.read?.pick || !match) ? found : null;
  const busy = job?.status === 'leyendo' || job?.status === 'esperando';
  let line: ReadingLine | null;
  if (job?.status === 'leyendo') line = { kind: 'leyendo', text: 'Leyendo la foto con IA…' };
  else if (job?.status === 'esperando') line = { kind: 'esperando', offline: job.motivo === 'sin-senal', text: waitingText(job.motivo) };
  else if (job?.status === 'error') line = { kind: 'error', text: `${job.message} Revísala tú.` };
  else if (i.saving && !choices) line = { kind: 'guardando', text: 'Guardando lo leído…' };
  else if (choices) line = { kind: 'elegir', text: i.read?.pick && match ? `¿Cuál fila de la foto es la de ${i.name}?` : `No encontramos a ${i.name} en la foto. ¿Cuál fila es?` };
  else if (i.hasRead) line = null;
  else if (i.fresh) line = { kind: 'fresca', text: `Puede que el teléfono de ${i.name} todavía esté leyendo la foto.` };
  else line = { kind: 'sin-leer', text: `La IA no leyó esta foto (no pudo o no encontró la fila de ${i.name}).` };
  const button = !busy && !i.saving && !choices && i.hasPhoto && (!i.hasRead || job?.status === 'error') ? (job?.status === 'error' ? 'Intentar de nuevo' : 'Leer con IA') : null;
  return { again: false, line, choices, button };
}

/**
 * Al terminar de leer: si se sabe cuál es su fila y no se pidió cambiarla, se pone sola (`apply`); si se pidió, se
 * propone la suya para elegir (`picked`, su posición); si no se sabe, el admin la elige (null).
 */
export function readOutcome(name: string, rows: ScanRow[], pick: boolean): { apply: ScanRow } | { picked: number } | null {
  const row = rowFor(name, rows);
  if (row && !pick) return { apply: row };
  if (row) return { picked: rows.indexOf(row) };
  return null;
}

/** Una fila de la foto para elegir: «Jugador Uno: 181 · 204 · –». */
export const scanRowLabel = (r: Pick<ScanRow, 'name' | 'games'>) => `${r.name}: ${r.games.map((g) => g ?? '–').join(' · ')}`;
