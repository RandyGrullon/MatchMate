import { MAX_INDEX, MIN_INDEX, isValidIndex } from '../../sports/golf/course';
import type { RacketSport } from '../../sports/racket';
import { formatLevel, levelScale, parseLevelInput, readLevel, type LevelScale } from '../../pages/sports/racket/levels';
import { indexText } from '../../pages/sports/golf/logic';
import { BASKETBALL_POSITIONS } from '../../pages/sports/basketball/bits';
import { FOOTBALL_POSITIONS } from '../../pages/sports/football/bits';

/**
 * «Agregar jugador» según el deporte: qué números se piden al anotar a alguien sin cuenta y cómo se leen.
 * - boliche: promedio fijo (0–300), igual que siempre;
 * - pádel, tenis, pickleball: el nivel con la escala del deporte (0–7, NTRP, DUPR);
 * - golf: el Handicap Index (-10 a 54; «+1.2» es plus);
 * - baloncesto, fútbol, fútbol sala: posición y dorsal preferidos (players.attrs.team);
 * - natación: los nadadores se anotan en su pestaña (con las reglas de menores).
 */

export type StatKind = 'bowling' | 'racket' | 'golf' | 'team' | 'swimming' | 'plain';

const RACKET: ReadonlySet<string> = new Set(['padel', 'tennis', 'pickleball']);
const TEAM: ReadonlySet<string> = new Set(['basketball', 'football', 'futsal']);

export function statKind(sport: string | null | undefined): StatKind {
  const s = sport || 'bowling';
  if (s === 'bowling') return 'bowling';
  if (RACKET.has(s)) return 'racket';
  if (TEAM.has(s)) return 'team';
  if (s === 'golf') return 'golf';
  if (s === 'swimming') return 'swimming';
  return 'plain';
}

/** Escala del nivel del deporte de raqueta (pádel si no es de raqueta). */
export const racketScale = (sport: string): LevelScale => levelScale((RACKET.has(sport) ? sport : 'padel') as RacketSport);

/** Posiciones del deporte de equipo (las mismas de las plantillas). */
export function teamPositions(sport: string): readonly string[] {
  if (sport === 'basketball') return BASKETBALL_POSITIONS;
  if (sport === 'football' || sport === 'futsal') return FOOTBALL_POSITIONS;
  return [];
}

/** Lo que escribe el admin, tal cual (texto de cada campo). */
export interface StatDraft {
  average: string;
  level: string;
  index: string;
  position: string;
  jersey: string;
}

export const emptyDraft: StatDraft = { average: '', level: '', index: '', position: '', jersey: '' };

/** Lo que se guarda (null = no se puso). */
export interface PlayerStatsInput {
  averageOverride: number | null;
  level: number | null;
  index: number | null;
  position: string | null;
  jersey: number | null;
}

export const noStatsInput: PlayerStatsInput = { averageOverride: null, level: null, index: null, position: null, jersey: null };

export type Parsed = { ok: true; stats: PlayerStatsInput } | { ok: false; error: string };

const MAX_JERSEY = 99;

/** Promedio fijo del boliche: '' = automático; como siempre, se redondea y se deja entre 0 y 300. */
export function parseAverage(raw: string): number | null | 'invalido' {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) return 'invalido';
  return Math.min(300, Math.max(0, Math.round(n)));
}

/** Handicap Index: '12.4', '12,4', '+1.2' (plus = negativo); '' = sin Index. */
export function parseGolfIndex(raw: string): number | null | 'invalido' {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  const plus = t.startsWith('+');
  const body = plus ? t.slice(1) : t;
  if (!/^-?\d{1,2}(\.\d+)?$/.test(body)) return 'invalido';
  const n = Math.round((plus ? -Number(body) : Number(body)) * 10) / 10;
  return isValidIndex(n) ? n : 'invalido';
}

/** Dorsal: número entero de 0 a 99; '' = sin dorsal. */
export function parseJersey(raw: string): number | null | 'invalido' {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d{1,2}$/.test(t)) return 'invalido';
  const n = Number(t);
  return n <= MAX_JERSEY ? n : 'invalido';
}

/** Lee lo escrito para el deporte: solo cuentan los campos de ese deporte. */
export function parseStats(sport: string, draft: StatDraft): Parsed {
  const kind = statKind(sport);
  const stats: PlayerStatsInput = { ...noStatsInput };
  if (kind === 'bowling') {
    const a = parseAverage(draft.average);
    if (a === 'invalido') return { ok: false, error: 'El promedio va de 0 a 300.' };
    stats.averageOverride = a;
  } else if (kind === 'racket') {
    const scale = racketScale(sport);
    const l = parseLevelInput(draft.level, scale);
    if (l === 'invalido') return { ok: false, error: `El ${scale.label === 'Nivel' ? 'nivel' : scale.label} va de ${scale.min} a ${scale.max}.` };
    stats.level = l;
  } else if (kind === 'golf') {
    const i = parseGolfIndex(draft.index);
    if (i === 'invalido') return { ok: false, error: `El Index va de ${MIN_INDEX} (+${-MIN_INDEX}) a ${MAX_INDEX}.` };
    stats.index = i;
  } else if (kind === 'team') {
    const j = parseJersey(draft.jersey);
    if (j === 'invalido') return { ok: false, error: `El dorsal va de 0 a ${MAX_JERSEY}.` };
    stats.jersey = j;
    const p = draft.position.trim();
    stats.position = p ? p.slice(0, 30) : null;
  }
  return { ok: true, stats };
}

// ---------- Posición y dorsal preferidos (players.attrs.team) ----------

export interface TeamPrefs {
  position: string | null;
  jersey: number | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function readTeamPrefs(attrs: unknown): TeamPrefs {
  const t = isObj(attrs) ? attrs.team : null;
  if (!isObj(t)) return { position: null, jersey: null };
  const position = typeof t.position === 'string' && t.position.trim() ? t.position.trim() : null;
  const jersey = typeof t.jersey === 'number' && Number.isInteger(t.jersey) && t.jersey >= 0 && t.jersey <= MAX_JERSEY ? t.jersey : null;
  return { position, jersey };
}

/** attrs con la posición y el dorsal nuevos; lo demás de attrs se conserva. Sin nada, se quita `team`. */
export function withTeamPrefs(attrs: unknown, prefs: TeamPrefs): Record<string, unknown> {
  const out: Record<string, unknown> = isObj(attrs) ? { ...attrs } : {};
  const team: Record<string, unknown> = {};
  if (prefs.position) team.position = prefs.position;
  if (prefs.jersey != null) team.jersey = prefs.jersey;
  if (Object.keys(team).length) out.team = team;
  else delete out.team;
  return out;
}

// ---------- Lo que sale en la lista ----------

/** Texto corto con el número del deporte para la lista («NTRP 4.5», «Index 12.4», «Base · #7»); null = nada. */
export function statSummary(sport: string, attrs: unknown): string | null {
  const kind = statKind(sport);
  if (kind === 'racket') {
    const scale = racketScale(sport);
    const v = readLevel(attrs, scale);
    return v == null ? null : `${scale.label} ${formatLevel(v, scale)}`;
  }
  if (kind === 'golf') {
    const g = isObj(attrs) && isObj(attrs.golf) ? attrs.golf : null;
    return g && typeof g.index === 'number' ? `Index ${indexText(g.index)}` : null;
  }
  if (kind === 'team') {
    const { position, jersey } = readTeamPrefs(attrs);
    const parts = [position, jersey != null ? `#${jersey}` : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }
  return null;
}

/** Lo de attrs como texto para el formulario de editar (mismo formato que se escribe). */
export function draftFromAttrs(sport: string, attrs: unknown, averageOverride: number | null): StatDraft {
  const kind = statKind(sport);
  const d: StatDraft = { ...emptyDraft, average: averageOverride != null ? String(averageOverride) : '' };
  if (kind === 'racket') {
    const scale = racketScale(sport);
    const v = readLevel(attrs, scale);
    d.level = v == null ? '' : formatLevel(v, scale);
  } else if (kind === 'golf') {
    const g = isObj(attrs) && isObj(attrs.golf) ? attrs.golf : null;
    const v = g && typeof g.index === 'number' ? g.index : null;
    d.index = v == null ? '' : v < 0 ? `+${Math.abs(v)}` : String(v);
  } else if (kind === 'team') {
    const t = readTeamPrefs(attrs);
    d.position = t.position ?? '';
    d.jersey = t.jersey != null ? String(t.jersey) : '';
  }
  return d;
}

// ---------- «Agregar varios» ----------

export interface ManyNames {
  /** Nombres nuevos, en el orden escrito, sin repetir. */
  names: string[];
  /** Los que ya están en la liga (mismo nombre): no se agregan otra vez. */
  existing: string[];
  /** Repetidos dentro de lo escrito. */
  repeated: number;
}

const MAX_NAME = 60;
export const MAX_MANY = 60;

/** Un nombre por línea (también sirve pegar una lista con «1.», «-» o «•»); espacios de más fuera. */
export function parseManyNames(text: string, current: readonly string[] = []): ManyNames {
  const key = (s: string) => s.toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const have = new Set(current.map((n) => key(n.trim().replace(/\s+/g, ' '))));
  const seen = new Set<string>();
  const out: ManyNames = { names: [], existing: [], repeated: 0 };
  for (const line of text.split(/\r?\n/)) {
    const name = line
      .replace(/^\s*(?:\d{1,3}[.)-]|[-*•·])\s*/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_NAME);
    if (!name) continue;
    const k = key(name);
    if (seen.has(k)) {
      out.repeated++;
      continue;
    }
    seen.add(k);
    if (have.has(k)) out.existing.push(name);
    else out.names.push(name);
  }
  return out;
}
