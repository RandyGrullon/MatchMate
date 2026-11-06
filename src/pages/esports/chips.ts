/**
 * Lo puro de las piezas chicas de esports (docs/esports.md §11.4): el texto y el tono del rango, del ID, del estado de
 * una inscripción y de la fase del torneo, las letras del monograma y del círculo de un equipo sin logo. Sin React: lo
 * dibujan src/components/esports/bits.tsx (la web) y movil/src/components/esports/bits.tsx (el teléfono).
 */
import { OWNERSHIP_LABEL, PHASE_TEXT, RANK_SOURCE_LABEL, rankLabel, type GameId, type IdStatus, type Ownership, type Phase, type RankSource, type RankValue } from '../../sports/esports';
import type { EntryStatus } from '../../lib/data/esports';

export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger';

/** Tamaño de las letras del monograma (en el dibujo de 48 × 48) según cuántas son: «FC» grande, «MLBB» más chico. */
export const monoFontSize = (mono: string): number => (mono.length <= 2 ? 21 : mono.length === 3 ? 16 : 12.5);

/** «{rango} · Verificado» solo si salió verificado (la búsqueda de LoL); si no, «{rango} · Declarado». */
const rankSourceText = (source: RankSource): string => (source === 'verificado' ? RANK_SOURCE_LABEL.verificado : RANK_SOURCE_LABEL.declarado);

/** El texto del chip de rango: «Diamante 2 · Verificado», «Oro IV · Declarado» (sin fuente, solo el rango). '' si no hay rango. */
export function rankChipText(game: GameId, rank: RankValue | null | undefined, source?: RankSource): string {
  if (!rank) return '';
  const label = rankLabel(game, rank).trim();
  if (!label) return '';
  return source ? `${label} · ${rankSourceText(source)}` : label;
}

/** El tono del chip de rango: verde si salió verificado. */
export const rankChipTone = (source?: RankSource): ChipTone => (source === 'verificado' ? 'ok' : 'neutral');

/**
 * De dónde sale el ID para el chip: `ownership` manda («login», «busqueda», «declarado»); sin él, por el estado (uno
 * confirmado sin más datos se comprobó con la búsqueda).
 */
export const chipOwnership = (ownership?: Ownership, status?: IdStatus): Ownership =>
  ownership === 'login' || ownership === 'busqueda' || ownership === 'declarado' ? ownership : status === 'confirmado' ? 'busqueda' : 'declarado';

/** «Cuenta conectada» (entró con Epic, Steam o Riot), «Comprobado» (la búsqueda de Riot lo encontró) o «Declarado». */
export function idChipText(ownership?: Ownership, status?: IdStatus): string {
  return OWNERSHIP_LABEL[chipOwnership(ownership, status)];
}

/** «Cuenta conectada» y «Comprobado» en verde, «Declarado» neutro. */
export const idChipTone = (ownership?: Ownership, status?: IdStatus): ChipTone => (chipOwnership(ownership, status) === 'declarado' ? 'neutral' : 'ok');

export const ENTRY_TEXT: Readonly<Record<EntryStatus, string>> = {
  pending: 'Por aprobar',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  withdrawn: 'Se retiró',
  assigned: 'En un equipo',
};
export const ENTRY_TONE: Readonly<Record<EntryStatus, ChipTone>> = { pending: 'warn', approved: 'ok', rejected: 'danger', withdrawn: 'neutral', assigned: 'neutral' };

/** El texto del estado de una inscripción («Check-in hecho» si ya lo hizo un aprobado). */
export const entryStatusText = (status: EntryStatus, checkedIn?: boolean): string => (status === 'approved' && checkedIn ? 'Check-in hecho' : ENTRY_TEXT[status]);

/** El tono de cada fase del torneo: lo abierto en verde, el check-in en ámbar, en curso en el color del deporte. */
export const PHASE_TONE: Readonly<Record<Phase, ChipTone>> = {
  soon: 'neutral',
  registration: 'ok',
  checkin: 'warn',
  closed: 'neutral',
  live: 'accent',
  finished: 'neutral',
  cancelled: 'danger',
};

/** «Inscripción abierta», «Check-in abierto», «En curso», «Terminado»… */
export const phaseText = (phase: Phase): string => PHASE_TEXT[phase];

/**
 * Lo que no es letra ni número. Se arma al cargar (y no como literal): así un motor de JavaScript sin `\p{…}` no falla
 * al leer el archivo; en ese caso quedan las letras latinas (con tildes) y los números.
 */
const NOT_ALNUM: RegExp = (() => {
  try {
    return new RegExp('[^\\p{L}\\p{N}]+', 'gu');
  } catch {
    return /[^0-9A-Za-zÀ-ÖØ-öø-ÿ]+/g;
  }
})();

/** Lo que va en el círculo sin logo: el tag («TGR») o, sin tag, las dos primeras letras del nombre. */
export function teamInitials(name: string, tag: string): string {
  const t = tag.trim().toUpperCase();
  if (t) return t.slice(0, 5);
  const letters = name.trim().replace(NOT_ALNUM, '');
  return letters.slice(0, 2).toUpperCase() || '?';
}

/** Tamaño de las letras del círculo (en el dibujo de 40 × 40) según cuántas son. */
export const initialsSize = (text: string) => (text.length <= 2 ? 15 : text.length === 3 ? 12.5 : text.length === 4 ? 10.5 : 9);

/** Las iniciales de un inscrito individual (los equipos usan el logo): dos palabras, o «?». */
export const entryInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
