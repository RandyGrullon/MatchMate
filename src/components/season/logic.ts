/**
 * Lo que no es pantalla de cerrar y empezar temporadas (Admin › Temporada, /l/:lid/temporadas y el selector de las
 * tablas): de qué temporada es cada partido y cada equipo, la tabla final que se guarda al cerrar (una «foto» que
 * cada deporte llena igual y que se dibuja igual para todos), los premios que se proponen y los datos de la
 * temporada nueva. Funciones puras, con pruebas en logic.test.ts. Los tipos de la temporada: src/lib/seasons.ts.
 */
import { addDays, localParts } from '../../pages/sports/racket/logic/time';
import { inSeason, sortSeasons, type AwardKind, type Season } from '../../lib/seasons';

type SeasonRange = Pick<Season, 'startsOn' | 'endsOn' | 'status'>;

// ---------- De qué temporada es cada cosa ----------

type When = string | number | { toMillis(): number } | null | undefined;

const isoOf = (v: When): string | null => {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  const ms = typeof v === 'number' ? v : v.toMillis();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

/**
 * Día de un partido para la temporada ('YYYY-MM-DD' en la zona de la liga): su hora programada o, sin hora, cuándo
 * se creó (la misma regla que la base).
 */
export function matchDay(m: { scheduledAt: string | null; createdAt?: When }, tz?: string | null): string | null {
  return localParts(m.scheduledAt ?? isoOf(m.createdAt), tz)?.date ?? null;
}

/** Los partidos de esa temporada (sin temporada: todos). Uno sin día (recién creado en el teléfono) va en la activa. */
export function seasonMatches<M extends { scheduledAt: string | null; createdAt?: When }>(
  matches: readonly M[],
  season: SeasonRange | null | undefined,
  tz?: string | null,
): M[] {
  if (!season) return [...matches];
  return matches.filter((m) => {
    const day = matchDay(m, tz);
    return day ? inSeason(season, day) : season.status === 'active';
  });
}

/**
 * Los equipos de temporada de esa temporada. En la de ahora también los que no dicen de cuál son (parejas de
 * raqueta, o datos guardados en el teléfono antes de las temporadas).
 */
export function teamsOfSeason<T extends { seasonId?: string | null }>(teams: readonly T[], season: Pick<Season, 'id'> | null | undefined, current: boolean): T[] {
  if (!season) return [...teams];
  return teams.filter((t) => (t.seasonId ? t.seasonId === season.id : current));
}

/**
 * Los equipos de una temporada que no es la de ahora: los suyos y los que jugaron sus partidos (`matches`, los de
 * esa temporada). Las temporadas de años de antes de las temporadas (la base las armó solas, sin tabla guardada) no
 * tienen equipos propios: sus partidos son de los equipos de entonces, que quedaron en la temporada de ahora.
 */
export function pastSeasonTeams<T extends { id: string; seasonId?: string | null }>(
  teams: readonly T[],
  season: Pick<Season, 'id'>,
  matches: readonly { sides: readonly { teamId?: string | null }[] }[],
): T[] {
  const played = new Set(matches.flatMap((m) => m.sides.map((s) => s.teamId ?? '')).filter(Boolean));
  return teams.filter((t) => t.seasonId === season.id || played.has(t.id));
}

// ---------- La tabla que se guarda al cerrar ----------

/** Columna de una tabla guardada (la última es la principal: puntos, promedio…). */
export interface SnapshotColumn {
  label: string;
  /** Nombre completo (lectores de pantalla y tooltip). */
  title?: string;
  /** Se esconde en el teléfono. */
  wide?: boolean;
}

export interface SnapshotRow {
  rank: number;
  name: string;
  /** A quién es (para proponer los premios): equipo o pareja, o jugador. */
  teamId?: string | null;
  playerId?: string | null;
  values: (string | number)[];
}

export interface SnapshotTable {
  key: string;
  title: string;
  /** «Equipo», «Pareja», «Jugador», «Club». */
  nameLabel: string;
  columns: SnapshotColumn[];
  rows: SnapshotRow[];
  note?: string;
}

/** Lo que se guarda en seasons.standings al cerrar: las tablas de la temporada tal como se veían. */
export interface SeasonSnapshot {
  v: 1;
  sport: string;
  /** ISO: cuándo se calculó. */
  at: string;
  tables: SnapshotTable[];
}

/** Una persona o un equipo al que se le puede dar un premio. */
export interface Awardee {
  id: string;
  name: string;
}

/**
 * La tabla de la temporada que arma cada deporte para cerrarla (SportScreens.useSeasonTable): la foto que se guarda
 * y a quién se le pueden dar premios (equipos o parejas, y jugadores). `suggested`: premios fuera del podio que el
 * deporte sabe calcular (el boliche, el más mejorado); se proponen y el admin los puede cambiar. `podium`: el podio
 * que propone el deporte en vez del de la primera tabla (el cuadro del torneo relámpago); null = la primera tabla no
 * sirve para el podio (hay una por grupo) y el admin lo elige.
 */
export interface SeasonTableResult {
  loading: boolean;
  snapshot: SeasonSnapshot;
  teams: Awardee[];
  players: Awardee[];
  suggested?: SuggestedAwards;
  podium?: Podium | null;
}

/** Premios fuera del podio que se proponen al cerrar ('' o sin clave = ninguno). */
export type SuggestedAwards = Partial<Record<'mvp' | 'mas_mejorado' | 'fair_play', AwardRef>>;

/** Campeón, subcampeón y tercero ('' = nadie). */
export type Podium = [AwardRef, AwardRef, AwardRef];

/** Por nombre, sin repetir. */
export function awardees(list: readonly Awardee[]): Awardee[] {
  const seen = new Map<string, Awardee>();
  for (const a of list) if (a.id && !seen.has(a.id)) seen.set(a.id, a);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'es') || a.id.localeCompare(b.id));
}

/** Topes para que la foto no pese (la base acepta hasta 256 KB). */
export const SNAPSHOT_MAX_TABLES = 8;
export const SNAPSHOT_MAX_ROWS = 60;

/** Una foto con esas tablas (sin las vacías; con los topes). */
export function makeSnapshot(sport: string, tables: readonly SnapshotTable[], now: number = Date.now()): SeasonSnapshot {
  return {
    v: 1,
    sport,
    at: new Date(now).toISOString(),
    tables: tables
      .filter((t) => t.rows.length > 0)
      .slice(0, SNAPSHOT_MAX_TABLES)
      .map((t) => ({ ...t, rows: t.rows.slice(0, SNAPSHOT_MAX_ROWS) })),
  };
}

/** Columna de una tabla que se guarda: cómo se llama y qué valor sale de cada fila. */
export interface SnapshotField<R> extends SnapshotColumn {
  value: (row: R) => string | number;
}

/** Con su puesto (los empatados en `value` comparten puesto), en el orden que vienen. */
export function withRank<T>(rows: readonly T[], value: (r: T) => number): (T & { rank: number })[] {
  const out: (T & { rank: number })[] = [];
  rows.forEach((r, i) => {
    const prev = out[i - 1];
    out.push({ ...r, rank: prev && value(rows[i - 1]) === value(r) ? prev.rank : i + 1 });
  });
  return out;
}

/** Filas de cualquier tabla del deporte → tabla guardada. `who` dice a quién es cada fila. */
export function snapshotTable<R extends { rank: number }>(
  meta: Omit<SnapshotTable, 'columns' | 'rows'>,
  rows: readonly R[],
  fields: readonly SnapshotField<R>[],
  who: (row: R) => { name: string; teamId?: string | null; playerId?: string | null },
): SnapshotTable {
  return {
    ...meta,
    columns: fields.map(({ label, title, wide }) => ({ label, ...(title ? { title } : {}), ...(wide ? { wide } : {}) })),
    rows: rows.map((r) => {
      const w = who(r);
      return {
        rank: r.rank,
        name: w.name,
        ...(w.teamId ? { teamId: w.teamId } : {}),
        ...(w.playerId ? { playerId: w.playerId } : {}),
        values: fields.map((f) => f.value(r)),
      };
    }),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 80): string | null => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);
const cell = (v: unknown): string | number => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? v.slice(0, 40) : '');

/** La foto guardada, revisada (lo que no se entiende se descarta; null si no hay nada que mostrar). */
export function parseSnapshot(raw: unknown): SeasonSnapshot | null {
  if (!isObj(raw) || !Array.isArray(raw.tables)) return null;
  const tables: SnapshotTable[] = [];
  raw.tables.forEach((t, i) => {
    if (!isObj(t) || !Array.isArray(t.columns) || !Array.isArray(t.rows)) return;
    const columns = t.columns.filter(isObj).map((c): SnapshotColumn => ({
      label: text(c.label, 12) ?? '',
      ...(text(c.title) ? { title: text(c.title)! } : {}),
      ...(c.wide === true ? { wide: true } : {}),
    }));
    const rows = t.rows.filter(isObj).map((r, k): SnapshotRow => ({
      rank: typeof r.rank === 'number' && Number.isFinite(r.rank) ? r.rank : k + 1,
      name: text(r.name) ?? '—',
      ...(text(r.teamId, 40) ? { teamId: text(r.teamId, 40) } : {}),
      ...(text(r.playerId, 40) ? { playerId: text(r.playerId, 40) } : {}),
      values: columns.map((_, j) => cell(Array.isArray(r.values) ? r.values[j] : undefined)),
    }));
    if (!rows.length) return;
    tables.push({
      key: text(t.key, 60) ?? `t${i}`,
      title: text(t.title) ?? 'Tabla',
      nameLabel: text(t.nameLabel, 20) ?? 'Nombre',
      columns,
      rows,
      ...(text(t.note, 300) ? { note: text(t.note, 300)! } : {}),
    });
  });
  if (!tables.length) return null;
  return { v: 1, sport: text(raw.sport, 20) ?? '', at: text(raw.at, 40) ?? '', tables };
}

// ---------- Premios ----------

export const AWARD_LABEL: Record<AwardKind, string> = {
  campeon: 'Campeón',
  subcampeon: 'Subcampeón',
  tercero: 'Tercer lugar',
  mvp: 'MVP',
  mas_mejorado: 'Más mejorado',
  fair_play: 'Fair play',
  otro: 'Otro premio',
};

/** A quién va un premio: 't:<equipo>' o 'p:<jugador>' ('' = a nadie). Así un solo selector sirve para los dos. */
export type AwardRef = string;

export const teamRef = (id: string): AwardRef => `t:${id}`;
export const playerRef = (id: string): AwardRef => `p:${id}`;

export function parseRef(ref: AwardRef | null | undefined): { teamId: string } | { playerId: string } | null {
  const m = /^([tp]):(.+)$/.exec(ref ?? '');
  if (!m) return null;
  return m[1] === 't' ? { teamId: m[2] } : { playerId: m[2] };
}

/** La fila de una tabla como destino de un premio (equipo antes que jugador). */
export const refOfRow = (r: Pick<SnapshotRow, 'teamId' | 'playerId'>): AwardRef => (r.teamId ? teamRef(r.teamId) : r.playerId ? playerRef(r.playerId) : '');

export interface AwardDraft {
  /** Clave estable para la lista de la pantalla. */
  key: string;
  kind: AwardKind;
  /** Solo 'otro': el nombre del premio («Mejor portero»). */
  label: string;
  ref: AwardRef;
  note: string;
}

const draft = (kind: AwardKind, ref: AwardRef = '', key: string = kind): AwardDraft => ({ key, kind, label: '', ref, note: '' });

/** Los de la primera tabla que tienen a quién darle un premio, en su orden. */
const tableRefs = (snapshot: SeasonSnapshot | null | undefined): AwardRef[] =>
  [...(snapshot?.tables[0]?.rows ?? [])].sort((a, b) => a.rank - b.rank).map(refOfRow).filter(Boolean);

/** Campeón, subcampeón y tercero de la primera tabla (los que tienen a quién darle el premio), en su orden. */
export function podiumRefs(snapshot: SeasonSnapshot | null | undefined): Podium {
  const rows = tableRefs(snapshot);
  return [rows[0] ?? '', rows[1] ?? '', rows[2] ?? ''];
}

/** Los premios de siempre, en el orden en que se muestran (los 'otro' van al final). */
const STANDARD_KINDS: AwardKind[] = ['campeon', 'subcampeon', 'tercero', 'mvp', 'mas_mejorado', 'fair_play'];

/**
 * Los premios que se proponen al cerrar: el podio de la tabla, o el que proponga el deporte (`podium`: el cuadro
 * del torneo relámpago; null = ninguno, el admin lo elige). Si hubo playoff terminado, campeón y subcampeón salen
 * de su final y el tercero es el mejor de la tabla (o del podio del deporte) que no llegó a la final. MVP, más
 * mejorado y fair play con lo que proponga el deporte (`suggested`; si no, vacíos). Si la temporada ya estaba
 * cerrada (corregir), los que tenía, con los de siempre que le falten vacíos (así se pueden agregar).
 */
export function initialAwards(
  snapshot: SeasonSnapshot | null | undefined,
  season: Pick<Season, 'status' | 'awards' | 'playoffs'>,
  suggested?: SuggestedAwards | null,
  podium?: Podium | null,
): AwardDraft[] {
  if (season.status === 'closed' && season.awards.length) {
    const saved = season.awards.map((a, i) => ({
      key: a.kind === 'otro' || season.awards.findIndex((x) => x.kind === a.kind) !== i ? `${a.kind}-${i}` : a.kind,
      kind: a.kind,
      label: a.kind === 'otro' ? a.label : '',
      ref: a.teamId ? teamRef(a.teamId) : a.playerId ? playerRef(a.playerId) : '',
      note: a.note ?? '',
    }));
    return [
      ...STANDARD_KINDS.flatMap((k) => {
        const mine = saved.filter((a) => a.kind === k);
        return mine.length ? mine : [draft(k)];
      }),
      ...saved.filter((a) => a.kind === 'otro'),
    ];
  }
  const candidates = podium === undefined ? tableRefs(snapshot) : (podium ?? []).filter(Boolean);
  let [first, second, third]: Podium = podium === undefined ? podiumRefs(snapshot) : (podium ?? ['', '', '']);
  const final = season.playoffs.find((p) => p.status === 'finished' && p.champion);
  if (final?.champion) {
    first = teamRef(final.champion.teamId);
    second = final.runnerUp ? teamRef(final.runnerUp.teamId) : '';
    third = candidates.find((r) => r !== first && r !== second) ?? '';
  }
  return [
    draft('campeon', first),
    draft('subcampeon', second),
    draft('tercero', third),
    draft('mvp', suggested?.mvp ?? ''),
    draft('mas_mejorado', suggested?.mas_mejorado ?? ''),
    draft('fair_play', suggested?.fair_play ?? ''),
  ];
}

/** Lo que falta o sobra antes de guardar (null = listo). */
export function awardsProblem(drafts: readonly AwardDraft[]): string | null {
  const given = drafts.filter((d) => d.ref);
  if (drafts.some((d) => d.kind === 'otro' && d.ref && !d.label.trim())) return 'Ponle nombre al otro premio.';
  if (drafts.some((d) => d.kind === 'otro' && !d.ref && d.label.trim())) return `Elige a quién va «${drafts.find((d) => d.kind === 'otro' && !d.ref && d.label.trim())!.label.trim()}».`;
  const podium = given.filter((d) => d.kind === 'campeon' || d.kind === 'subcampeon' || d.kind === 'tercero').map((d) => d.ref);
  if (new Set(podium).size !== podium.length) return 'El mismo no puede estar dos veces en el podio.';
  if (given.filter((d) => d.kind === 'campeon').length > 1) return 'Solo puede haber un campeón.';
  if (drafts.some((d) => d.label.trim().length > 40)) return 'El nombre del premio es muy largo (hasta 40 letras).';
  if (drafts.some((d) => d.note.trim().length > 200)) return 'La nota es muy larga (hasta 200 letras).';
  return null;
}

/** Un premio como lo recibe close_season. */
export interface AwardArgLike {
  kind: AwardKind;
  label?: string;
  player_id?: string;
  team_id?: string;
  note?: string;
}

/** Los premios para close_season (solo los que tienen a quién; en su orden). */
export function awardsArg(drafts: readonly AwardDraft[]): AwardArgLike[] {
  const out: AwardArgLike[] = [];
  for (const d of drafts) {
    const to = parseRef(d.ref);
    if (!to) continue;
    const a: AwardArgLike = { kind: d.kind };
    if ('teamId' in to) a.team_id = to.teamId;
    else a.player_id = to.playerId;
    if (d.kind === 'otro') a.label = d.label.trim();
    if (d.note.trim()) a.note = d.note.trim();
    out.push(a);
  }
  return out;
}

/** Un premio 'otro' más para la lista. */
export const newOtherAward = (n: number): AwardDraft => draft('otro', '', `otro-n${n}`);

// ---------- Temporada nueva ----------

export interface NewSeasonInput {
  name: string;
  startsOn: string;
  /** '' = sin fecha de fin. */
  endsOn: string;
  copyTeams: boolean;
}

const yearOf = (day: string) => day.slice(0, 4);

/** «Temporada 2027» (o «Temporada 2027 (2)» si ya hay una con ese nombre). */
export function seasonName(startsOn: string, seasons: readonly Pick<Season, 'name'>[]): string {
  const base = `Temporada ${yearOf(startsOn)}`;
  const taken = new Set(seasons.map((s) => s.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`.toLowerCase())) return `${base} (${n})`;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Cambiar cuándo empieza: el nombre propuesto sigue al año, mientras nadie lo haya cambiado a mano (`nameTouched`). */
export function withStartDate(input: NewSeasonInput, startsOn: string, seasons: readonly Pick<Season, 'name'>[], nameTouched: boolean): NewSeasonInput {
  return { ...input, startsOn, name: nameTouched || !DAY.test(startsOn) ? input.name : seasonName(startsOn, seasons) };
}

/** Lo que se propone para la temporada nueva: empieza hoy (o el día después de que terminó la anterior). */
export function newSeasonDefaults(seasons: readonly Season[], today: string, copyTeams = false): NewSeasonInput {
  const last = sortSeasons(seasons)[0];
  let startsOn = today;
  if (last) {
    if (last.endsOn && last.endsOn >= startsOn) startsOn = addDays(last.endsOn, 1);
    if (startsOn <= last.startsOn) startsOn = addDays(last.startsOn, 1);
  }
  return { name: seasonName(startsOn, seasons), startsOn, endsOn: '', copyTeams };
}

/** Lo que no sirve de la temporada nueva (null = se puede crear). Igual que start_season. */
export function newSeasonProblem(input: NewSeasonInput, seasons: readonly Season[]): string | null {
  const name = input.name.trim();
  if (!name) return 'Ponle nombre a la temporada.';
  if (name.length > 60) return 'El nombre es muy largo (hasta 60 letras).';
  if (seasons.some((s) => s.status === 'active')) return 'Primero cierra la temporada en curso.';
  if (!DAY.test(input.startsOn)) return 'Elige cuándo empieza.';
  if (input.endsOn && !DAY.test(input.endsOn)) return 'La fecha de fin no se entiende.';
  if (input.endsOn && input.endsOn < input.startsOn) return 'Termina antes de empezar.';
  // La anterior (cerrada) no se toca: la nueva empieza después de que terminó (sus juegos siguen siendo de ella).
  const last = sortSeasons(seasons)[0];
  if (last && input.startsOn <= (last.endsOn ?? last.startsOn)) {
    return last.endsOn
      ? `Tiene que empezar después del ${shortDay(last.endsOn)} (cuando terminó ${last.name}).`
      : `Tiene que empezar después del ${shortDay(last.startsOn)} (cuando empezó ${last.name}).`;
  }
  return null;
}

// ---------- Textos ----------

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «12 feb 2026». */
export function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]} ${y}`;
}

/** «12 feb 2026 – 30 nov 2026», «Desde 12 feb 2026» (en curso sin fecha de fin). */
export function seasonDates(s: Pick<Season, 'startsOn' | 'endsOn'>): string {
  return s.endsOn ? `${shortDay(s.startsOn)} – ${shortDay(s.endsOn)}` : `Desde ${shortDay(s.startsOn)}`;
}

/** El premio con su nombre para mostrar: «Campeón: Tigres». */
export const awardLine = (a: { label: string; name: string }) => `${a.label}: ${a.name}`;
