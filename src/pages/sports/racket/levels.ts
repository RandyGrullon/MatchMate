import { select, rpc, invalidate, useLive, type Live } from '../../../lib/data/client';
import { tags } from '../../../lib/data/keys';
import { setPlayerLevel, usePlayerLevels } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import type { RacketSport } from '../../../sports/racket';
import { useRacket } from './sport';

/**
 * Nivel manual de cada jugador según el deporte, guardado en players.attrs:
 * - pádel: `level` (Playtomic 0–7; lo lee también src/lib/data/racket.ts);
 * - tenis: `ntrp` (NTRP 1.5–7.0, de medio en medio; la base acepta de 1.0 a 7.0);
 * - pickleball: `dupr` (DUPR 2.000–8.000).
 * Sirve para sembrar torneos, armar las cajas del primer mes, la ronda 1 del mexicano y mostrarlo en el perfil.
 */

export interface LevelScale {
  /** Clave en players.attrs. */
  key: 'level' | 'ntrp' | 'dupr';
  /** «Nivel», «NTRP», «DUPR». */
  label: string;
  min: number;
  max: number;
  /** Decimales que se guardan (pádel 1, tenis 2, DUPR 3). */
  decimals: number;
  placeholder: string;
  hint: string;
}

export const LEVEL_SCALES: Readonly<Record<RacketSport, LevelScale>> = {
  padel: {
    key: 'level',
    label: 'Nivel',
    min: 0,
    max: 7,
    decimals: 1,
    placeholder: '0–7',
    hint: 'Nivel de 0 a 7 (como Playtomic). Sirve para la ronda 1 del mexicano, las cajas del primer mes y para sembrar los torneos.',
  },
  tennis: {
    key: 'ntrp',
    label: 'NTRP',
    min: 1,
    max: 7,
    decimals: 2,
    placeholder: '1.5–7.0',
    hint: 'NTRP de 1.5 a 7.0 (3.0 principiante avanzado, 4.0 intermedio, 5.0 avanzado). Sirve para las cajas del primer mes y para sembrar los torneos.',
  },
  pickleball: {
    key: 'dupr',
    label: 'DUPR',
    min: 2,
    max: 8,
    decimals: 3,
    placeholder: '2.0–8.0',
    hint: 'DUPR de 2.000 a 8.000 (como sale en la app de DUPR). Sirve para las cajas del primer mes y para sembrar los torneos.',
  },
};

export const levelScale = (sport: RacketSport): LevelScale => LEVEL_SCALES[sport] ?? LEVEL_SCALES.padel;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const round = (v: number, decimals: number) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

/** Nivel guardado en attrs con esa escala (null si no tiene o no sirve). */
export function readLevel(attrs: unknown, scale: LevelScale): number | null {
  const v = isObj(attrs) ? attrs[scale.key] : null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(scale.max, Math.max(scale.min, v));
}

/** Lo que escribió el admin: número dentro de la escala (con coma o punto), '' = quitar, o 'invalido'. */
export function parseLevelInput(raw: string, scale: LevelScale): number | null | 'invalido' {
  const t = raw.trim().replace(',', '.');
  if (!t) return null;
  if (!/^\d{1,2}(\.\d+)?$/.test(t)) return 'invalido';
  const v = Number(t);
  if (!Number.isFinite(v) || v < scale.min || v > scale.max) return 'invalido';
  return round(v, scale.decimals);
}

/** 4.5 → «4.5»; 3.752 → «3.752»; 4 → «4.0» en NTRP y DUPR. */
export function formatLevel(v: number, scale: LevelScale): string {
  const r = round(v, scale.decimals);
  if (scale.key === 'level') return String(r);
  const s = String(r);
  return s.includes('.') ? s : `${s}.0`;
}

/** «NTRP 4.5», «DUPR 3.752», «Nivel 4.5». */
export const levelText = (v: number, scale: LevelScale) => `${scale.label} ${formatLevel(v, scale)}`;

export const levelKeys = {
  league: (lid: string, key: string) => `racket:lvl:${key}:${lid}`,
};

export async function fetchSportLevels(lid: string, scale: LevelScale): Promise<Record<string, number>> {
  const rows = await select<{ id: string; attrs: unknown }>({ table: 'players', columns: 'id,attrs', filters: [{ col: 'league_id', op: 'eq', value: lid }] });
  const out: Record<string, number> = {};
  for (const r of rows) {
    const l = readLevel(r.attrs, scale);
    if (l !== null) out[r.id] = l;
  }
  return out;
}

/** Nivel de cada jugador de la liga en la escala del deporte (id → número). */
export function useSportLevels(lid: string | undefined, sport: RacketSport): Live<Record<string, number>> {
  const scale = levelScale(sport);
  const padel = scale.key === 'level';
  // El pádel usa la lectura de siempre (la comparte con la capa de datos); tenis y pickleball, la suya.
  const old = usePlayerLevels(padel ? lid : undefined);
  const mine = useLive<Record<string, number>>(
    !padel && lid ? levelKeys.league(lid, scale.key) : null,
    !padel && lid ? { kind: 'racketSportLevels', lid } : null,
    () => fetchSportLevels(lid!, scale),
    { initial: {}, tags: lid ? [tags.league(lid), tags.players(lid)] : [] },
  );
  return padel ? old : mine;
}

/** Niveles de la liga de la pantalla, con su escala. */
export function useLevels(): { levels: Record<string, number>; scale: LevelScale; loading: boolean } {
  const { lid } = useLeagueCtx();
  const { sport } = useRacket();
  const q = useSportLevels(lid, sport);
  return { levels: q.data, scale: levelScale(sport), loading: q.loading };
}

/** Admin: pone (o quita, con null) el nivel de un jugador en la escala del deporte. Conserva lo demás de attrs. */
export async function setLevel(lid: string, playerId: string, sport: RacketSport, value: number | null) {
  const scale = levelScale(sport);
  if (scale.key === 'level') return setPlayerLevel(lid, playerId, value);
  const rows = await select<{ id: string; attrs: unknown }>({ table: 'players', columns: 'id,attrs', filters: [{ col: 'id', op: 'eq', value: playerId }] });
  const attrs: Record<string, unknown> = isObj(rows[0]?.attrs) ? { ...(rows[0].attrs as Record<string, unknown>) } : {};
  if (value === null) delete attrs[scale.key];
  else attrs[scale.key] = round(Math.min(scale.max, Math.max(scale.min, value)), scale.decimals);
  await rpc('update_player', { p_player: playerId, p_patch: { attrs } });
  invalidate(tags.players(lid));
}
