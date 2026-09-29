/**
 * Consola › Insignias: lo que no es pantalla. La corrida en seco del historial contra la rareza objetivo del catálogo
 * (§1.7.9 y §3.5), la rareza real (badge_stats), los nombres de los trabajos del motor y cómo se ve lo reportado.
 * Funciones puras (pruebas en badgesModel.test.ts).
 */
import { badgeDef, levelNameOf, nameOf, rarityOf } from '../../badges/catalog';
import type { BadgeDef, Level, Rarity } from '../../badges/types';
import type { BadgeLook } from '../../badges/visual';
import { fillBadgeText, lookOf, textVars, type AwardLike } from '../../components/badges/logic';
import { designLook } from '../../components/badges/maker/look';
import type { BadgeStat } from '../../lib/data/badges';
import type { BadgeReport, DryRunRow } from '../../lib/data/badgeAdmin';
import { isSportId, sportMeta } from '../../sports/registry';

// ---------- Rareza (§1.7.9) ----------

/** Rango de cada rareza, en % de las cuentas activas del deporte: [desde, hasta). */
export const RARITY_RANGE: Readonly<Record<Rarity, readonly [number, number]>> = {
  C: [40, Infinity],
  PC: [15, 40],
  R: [5, 15],
  E: [1, 5],
  L: [0, 1],
};

export const RARITY_NAME: Readonly<Record<Rarity, string>> = { C: 'Común', PC: 'Poco común', R: 'Rara', E: 'Épica', L: 'Legendaria' };
const ORDER: readonly Rarity[] = ['C', 'PC', 'R', 'E', 'L'];

/** Menos de estas cuentas en la base: la rareza no dice nada todavía (la app dice «Nueva», §3.8). */
export const MIN_BASE = 50;

/** La rareza de un porcentaje. */
export function rarityOfPct(pct: number): Rarity {
  for (const r of ORDER) if (pct >= RARITY_RANGE[r][0]) return r;
  return 'L';
}

/** Cómo quedó frente a lo estimado: 0 = en su rango; > 0 = más común de lo pensado (sale fácil); < 0 = más rara. */
export function rarityDrift(target: Rarity, measured: Rarity): number {
  return ORDER.indexOf(target) - ORDER.indexOf(measured);
}

export type RarityVerdict = 'ok' | 'facil' | 'dificil' | 'poca_base' | 'sin_meta';

export interface RarityRow {
  key: string;
  sport: string;
  level: number;
  name: string;
  levelName: string;
  holders: number;
  base: number;
  pct: number | null;
  /** La estimada en el catálogo (null: 'cerrada' o sin meta). */
  target: Rarity | null;
  measured: Rarity | null;
  drift: number;
  verdict: RarityVerdict;
}

const sportArg = (s: string) => (isSportId(s) ? s : undefined);

/** Una fila de rareza (corrida en seco o badge_stats) contra la meta del catálogo; null si la key no existe. */
export function rarityRow(r: { key: string; sport: string; level: number; holders: number; base: number; pct: number | null }): RarityRow | null {
  const def = badgeDef(r.key);
  if (!def) return null;
  const level = Math.max(0, Math.min(5, Math.trunc(r.level))) as Level;
  const sport = sportArg(r.sport);
  const t = rarityOf(def, level, sport);
  const target = t && t !== 'cerrada' ? t : null;
  const pct = r.pct ?? (r.base > 0 ? Math.round((1000 * r.holders) / r.base) / 10 : null);
  const measured = pct === null ? null : rarityOfPct(pct);
  const drift = target && measured ? rarityDrift(target, measured) : 0;
  const verdict: RarityVerdict = !target ? 'sin_meta' : r.base < MIN_BASE ? 'poca_base' : drift > 0 ? 'facil' : drift < 0 ? 'dificil' : 'ok';
  return {
    key: r.key,
    sport: r.sport,
    level,
    name: nameOf(def, { sport }),
    levelName: levelNameOf(def, level, { sport }),
    holders: r.holders,
    base: r.base,
    pct,
    target,
    measured,
    drift,
    verdict,
  };
}

/** Las filas de una corrida en seco (o de la rareza real), lo más desviado primero. */
export function rarityRows(rows: readonly (DryRunRow | BadgeStat)[]): RarityRow[] {
  const out = rows.map(rarityRow).filter((r): r is RarityRow => r !== null);
  const weight = (r: RarityRow) => (r.verdict === 'facil' || r.verdict === 'dificil' ? 10 + Math.abs(r.drift) : r.verdict === 'ok' ? 1 : 0);
  return out.sort((a, b) => weight(b) - weight(a) || a.key.localeCompare(b.key) || a.sport.localeCompare(b.sport) || a.level - b.level);
}

export interface RaritySummary {
  total: number;
  ok: number;
  easy: number;
  hard: number;
  /** Con base chica o sin meta: no se juzga. */
  unjudged: number;
}

export function raritySummary(rows: readonly RarityRow[]): RaritySummary {
  const s: RaritySummary = { total: rows.length, ok: 0, easy: 0, hard: 0, unjudged: 0 };
  for (const r of rows) {
    if (r.verdict === 'ok') s.ok++;
    else if (r.verdict === 'facil') s.easy++;
    else if (r.verdict === 'dificil') s.hard++;
    else s.unjudged++;
  }
  return s;
}

/** «Más común de lo estimado» / «Más rara» / «En su rango» / «Base chica» / «Sin meta». */
export const VERDICT_LABEL: Readonly<Record<RarityVerdict, string>> = {
  ok: 'En su rango',
  facil: 'Sale muy fácil',
  dificil: 'Sale muy poco',
  poca_base: `Menos de ${MIN_BASE} cuentas`,
  sin_meta: 'Sin meta',
};

export const sportLabel = (s: string): string => (s === 'all' ? 'Cuenta' : (sportMeta(s)?.short ?? s));

// ---------- El motor ----------

/** Qué es cada trabajo de la cola (§3.3). */
export const JOB_KIND_LABEL: Readonly<Record<string, string>> = {
  resultado: 'Resultado',
  revisar: 'Corrección',
  evento: 'Evento cerrado',
  cajas: 'Mes de cajas',
  escalera: 'Mes de escalera',
  mes: 'Mes',
  anio: 'Año',
  temporada: 'Temporada',
  noche: 'Noche',
  cuenta: 'Cuenta',
  vinculo: 'Vínculo o reclamo',
  historial: 'Historial',
  aviso: 'Aviso',
};

export const jobKindLabel = (k: string): string => JOB_KIND_LABEL[k] ?? k;

/** El error del motor sin el ruido: la primera línea, hasta 160 letras. */
export function shortError(e: string | null | undefined): string {
  const line = (e ?? '').split('\n')[0].trim();
  return line.length > 160 ? `${line.slice(0, 159)}…` : line || 'Sin error guardado (la función se cortó: tiempo o CPU)';
}

// ---------- Lo reportado ----------

export interface ReportedView {
  look: BadgeLook;
  name: string;
  /** «Oro · de Ana» o «Diseño de la liga». */
  detail: string;
  def: BadgeDef | null;
}

/** Cómo se ve lo reportado: el diseño del creador o la insignia automática. null si no se puede dibujar. */
export function reportedView(r: BadgeReport): ReportedView | null {
  if (r.design) {
    const d = r.design;
    return { look: designLook(d, null), name: d.name, detail: d.status === 'oculta' ? 'Diseño de la liga · escondido' : 'Diseño de la liga', def: null };
  }
  const a = r.award;
  if (!a) return null;
  const def = badgeDef(a.key);
  if (!def) return null;
  const like: AwardLike = { key: a.key, sport: a.sport, level: a.level, periodKey: a.periodKey, context: a.context, leagueName: r.leagueName };
  const vars = textVars(def, like);
  const sport = sportArg(a.sport);
  const name = fillBadgeText(nameOf(def, { sport, alt: typeof a.context.alt === 'string' ? a.context.alt : null }), vars);
  const level = Math.max(0, Math.min(5, a.level)) as Level;
  const parts = [fillBadgeText(levelNameOf(def, level, { sport }), vars), a.playerName ? `de ${a.playerName}` : null, a.status === 'revocada' ? 'retirada' : null];
  return { look: lookOf(def, like), name, detail: parts.filter(Boolean).join(' · '), def };
}
