/**
 * Rangos por juego (docs/esports.md §2.5): escaleras como datos, una etiqueta legible y un ordinal comparable para
 * sembrar y balancear. Rocket League lleva rango por modo (1v1/2v2/3v3) y un MMR opcional que se pasa a rango con la
 * tabla de la temporada (`data/rocketLeagueMmr.ts`). La base solo revisa la forma (`esp_ranks_ok`); aquí, que el
 * rango exista.
 */
import { GAMES, type GameId, type Mode } from './catalog';
import { RL_MMR_MIN } from './data/rocketLeagueMmr';

export type RankValue = { tier: string; div?: number; mmr?: number } | { value: number } | { text: string };
/** Clave 'main', o el modo en los juegos con rango por modo (Rocket League: '1v1' | '2v2' | '3v3'). */
export type RankMap = Partial<Record<'main' | '1v1' | '2v2' | '3v3', RankValue>>;
/** 'verificado' solo sale de una búsqueda de LoL (`canVerifyRank`); el resto, 'declarado'. */
export type RankSource = 'declarado' | 'verificado';
export type RankKey = 'main' | '1v1' | '2v2' | '3v3';

export const RANK_SOURCE_LABEL: Record<RankSource, string> = {
  declarado: 'Declarado',
  verificado: 'Verificado',
};

export type Ladder =
  | { kind: 'tiers'; perMode: boolean; tiers: readonly { id: string; label: string; divs: 0 | 3 | 4 | 5; order: 'asc' | 'desc' }[]; divWord: string }
  | { kind: 'number'; label: string; min: number; max: number }
  | { kind: 'text' };

type Tier = { id: string; label: string; divs: 0 | 3 | 4 | 5; order: 'asc' | 'desc' };

/** [id, label] con las mismas divisiones. */
const group = (divs: 0 | 3 | 4 | 5, order: 'asc' | 'desc', ...pairs: [string, string][]): Tier[] => pairs.map(([id, label]) => ({ id, label, divs, order }));
const tiers = (...groups: Tier[][]): Ladder => ({ kind: 'tiers', perMode: false, tiers: groups.flat(), divWord: '' });

const RL_TIERS: Tier[] = [
  ...group(4, 'asc', ['bronze1', 'Bronce I'], ['bronze2', 'Bronce II'], ['bronze3', 'Bronce III']),
  ...group(4, 'asc', ['silver1', 'Plata I'], ['silver2', 'Plata II'], ['silver3', 'Plata III']),
  ...group(4, 'asc', ['gold1', 'Oro I'], ['gold2', 'Oro II'], ['gold3', 'Oro III']),
  ...group(4, 'asc', ['platinum1', 'Platino I'], ['platinum2', 'Platino II'], ['platinum3', 'Platino III']),
  ...group(4, 'asc', ['diamond1', 'Diamante I'], ['diamond2', 'Diamante II'], ['diamond3', 'Diamante III']),
  ...group(4, 'asc', ['champion1', 'Campeón I'], ['champion2', 'Campeón II'], ['champion3', 'Campeón III']),
  ...group(4, 'asc', ['gc1', 'Gran Campeón I'], ['gc2', 'Gran Campeón II'], ['gc3', 'Gran Campeón III']),
  ...group(0, 'asc', ['ssl', 'Supersonic Legend']),
];

export const LADDERS: Readonly<Record<GameId, Ladder>> = {
  valorant: tiers(
    group(
      3,
      'asc',
      ['iron', 'Hierro'],
      ['bronze', 'Bronce'],
      ['silver', 'Plata'],
      ['gold', 'Oro'],
      ['platinum', 'Platino'],
      ['diamond', 'Diamante'],
      ['ascendant', 'Ascendente'],
      ['immortal', 'Inmortal'],
    ),
    group(0, 'asc', ['radiant', 'Radiante']),
  ),
  cs2: { kind: 'number', label: 'CS Rating', min: 0, max: 40000 },
  lol: tiers(
    group(4, 'desc', ['iron', 'Hierro'], ['bronze', 'Bronce'], ['silver', 'Plata'], ['gold', 'Oro'], ['platinum', 'Platino'], ['emerald', 'Esmeralda'], ['diamond', 'Diamante']),
    group(0, 'asc', ['master', 'Maestro'], ['grandmaster', 'Gran Maestro'], ['challenger', 'Retador']),
  ),
  mlbb: tiers(
    group(3, 'desc', ['warrior', 'Guerrero'], ['elite', 'Élite']),
    group(4, 'desc', ['master', 'Maestro']),
    group(5, 'desc', ['grandmaster', 'Gran Maestro'], ['epic', 'Épico'], ['legend', 'Leyenda']),
    group(0, 'asc', ['mythic', 'Mítico'], ['mythical_honor', 'Honor Mítico'], ['mythical_glory', 'Gloria Mítica'], ['mythical_immortal', 'Inmortal Mítico']),
  ),
  rocket_league: { kind: 'tiers', perMode: true, tiers: RL_TIERS, divWord: 'División' },
  ea_fc: tiers(
    group(
      0,
      'asc',
      ['d10', 'División 10'],
      ['d9', 'División 9'],
      ['d8', 'División 8'],
      ['d7', 'División 7'],
      ['d6', 'División 6'],
      ['d5', 'División 5'],
      ['d4', 'División 4'],
      ['d3', 'División 3'],
      ['d2', 'División 2'],
      ['d1', 'División 1'],
      ['elite', 'Élite'],
    ),
  ),
  nba_2k: { kind: 'text' },
  sf6: tiers(
    group(5, 'asc', ['rookie', 'Novato'], ['iron', 'Hierro'], ['bronze', 'Bronce'], ['silver', 'Plata'], ['gold', 'Oro'], ['platinum', 'Platino'], ['diamond', 'Diamante']),
    group(0, 'asc', ['master', 'Master']),
  ),
  tekken8: { kind: 'text' },
  smash: { kind: 'text' },
  clash_royale: { kind: 'number', label: 'trofeos', min: 0, max: 15000 },
  free_fire: tiers(
    group(3, 'asc', ['bronze', 'Bronce'], ['silver', 'Plata']),
    group(4, 'asc', ['gold', 'Oro'], ['platinum', 'Platino'], ['diamond', 'Diamante']),
    group(0, 'asc', ['heroic', 'Heroico'], ['master', 'Maestro'], ['grandmaster', 'Gran Maestro']),
  ),
  fortnite: tiers(
    group(3, 'asc', ['bronze', 'Bronce'], ['silver', 'Plata'], ['gold', 'Oro'], ['platinum', 'Platino'], ['diamond', 'Diamante']),
    group(0, 'asc', ['elite', 'Élite'], ['champion', 'Campeón'], ['unreal', 'Unreal']),
  ),
  warzone: tiers(
    group(3, 'asc', ['bronze', 'Bronce'], ['silver', 'Plata'], ['gold', 'Oro'], ['platinum', 'Platino'], ['diamond', 'Diamante'], ['crimson', 'Carmesí']),
    group(0, 'asc', ['iridescent', 'Iridiscente'], ['top250', 'Top 250']),
  ),
  pubg_mobile: tiers(
    group(5, 'desc', ['bronze', 'Bronce'], ['silver', 'Plata'], ['gold', 'Oro'], ['platinum', 'Platino'], ['diamond', 'Diamante'], ['crown', 'Corona']),
    group(0, 'asc', ['ace', 'As'], ['ace_master', 'As Maestro'], ['ace_dominator', 'As Dominador'], ['conqueror', 'Conquistador']),
  ),
};

/** Cómo se escribe la división pegada al rango: VALORANT «Diamante 2», SF6 «Oro ★3», el resto en romanos «Oro IV». */
const DIV_STYLE: Partial<Record<GameId, 'num' | 'star'>> = { valorant: 'num', sf6: 'star' };

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

/** RL → el modo; el resto 'main'. */
export function rankKeyFor(game: GameId, mode: Mode): 'main' | '1v1' | '2v2' | '3v3' {
  const ladder = LADDERS[game];
  if (ladder.kind === 'tiers' && ladder.perMode && (mode === '1v1' || mode === '2v2' || mode === '3v3')) return mode;
  return 'main';
}

/** Las claves de rango que tiene el juego (RL: los tres modos; el resto 'main'). */
export function rankKeysOf(game: GameId): RankKey[] {
  const ladder = LADDERS[game];
  return ladder.kind === 'tiers' && ladder.perMode ? ['1v1', '2v2', '3v3'] : ['main'];
}

/** La división como se escribe en el juego: «2» (VALORANT), «★2» (SF6), «II» (el resto). */
export function divisionLabel(game: GameId, div: number): string {
  const style = DIV_STYLE[game];
  if (style === 'num') return String(div);
  if (style === 'star') return `★${div}`;
  return ROMAN[div] ?? String(div);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** 1245 → «1.245». */
function thousands(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Error del rango de una clave (null = bien). */
export function validateRank(game: GameId, key: string, r: unknown): string | null {
  const ladder = LADDERS[game];
  const name = GAMES[game].name;
  if (!(rankKeysOf(game) as string[]).includes(key)) return `${name} no tiene rango para ese modo.`;
  if (!isObj(r)) return 'Elige tu rango.';
  if (ladder.kind === 'text') {
    if (Object.keys(r).some((k) => k !== 'text') || typeof r.text !== 'string') return 'Escribe tu rango.';
    const len = [...r.text].length;
    if (!r.text.trim() || len < 1 || len > 24) return 'Escribe tu rango (hasta 24 letras).';
    return null;
  }
  if (ladder.kind === 'number') {
    if (Object.keys(r).some((k) => k !== 'value') || !isInt(r.value, ladder.min, ladder.max)) {
      const label = ladder.label.charAt(0).toUpperCase() + ladder.label.slice(1);
      return `${label}: de ${thousands(ladder.min)} a ${thousands(ladder.max)}.`;
    }
    return null;
  }
  if (Object.keys(r).some((k) => k !== 'tier' && k !== 'div' && k !== 'mmr')) return 'Elige tu rango.';
  if (typeof r.tier !== 'string') return 'Elige tu rango.';
  const tier = ladder.tiers.find((t) => t.id === r.tier);
  if (!tier) return `Ese rango no existe en ${name}.`;
  if (tier.divs === 0) {
    if (r.div !== undefined) return `${tier.label} no tiene división.`;
  } else if (r.div === undefined) return 'Elige la división.';
  else if (!isInt(r.div, 1, tier.divs)) return `La división va de 1 a ${tier.divs}.`;
  if (r.mmr !== undefined) {
    if (game !== 'rocket_league') return `${name} no lleva MMR.`;
    if (!isInt(r.mmr, -100, 3000)) return 'El MMR va de −100 a 3000.';
  }
  return null;
}

/** Error del primer rango que falle de un mapa de rangos (null = bien). */
export function validateRankMap(game: GameId, ranks: unknown): string | null {
  if (!isObj(ranks)) return 'Elige tu rango.';
  for (const [key, r] of Object.entries(ranks)) {
    const e = validateRank(game, key, r);
    if (e) return e;
  }
  return null;
}

/** «Diamante 2», «Oro IV», «Gran Campeón II · Div. III», «1.245 CS Rating», «7.320 trofeos»; '' sin rango. */
export function rankLabel(game: GameId, r: RankValue | null | undefined): string {
  if (!r || !isObj(r)) return '';
  const ladder = LADDERS[game];
  if ('text' in r && typeof r.text === 'string') return r.text;
  if ('value' in r && typeof r.value === 'number') return ladder.kind === 'number' ? `${thousands(r.value)} ${ladder.label}` : thousands(r.value);
  if ('tier' in r && typeof r.tier === 'string') {
    if (ladder.kind !== 'tiers') return r.tier;
    const tier = ladder.tiers.find((t) => t.id === r.tier);
    if (!tier) return r.tier;
    if (tier.divs === 0 || typeof r.div !== 'number') return tier.label;
    if (ladder.divWord) return `${tier.label} · Div. ${ROMAN[r.div] ?? r.div}`;
    return `${tier.label} ${divisionLabel(game, r.div)}`;
  }
  return '';
}

/**
 * Número comparable (mayor = mejor) para sembrar y balancear: en una escalera de tiers, `índice × 10 + d` (d = 0 sin
 * divisiones; `div − 1` si la 1 es la más baja; `divs − div` si la I es la más alta; sin división, la más baja); en
 * una numérica, el número; texto o rango desconocido, null. Solo se comparan rangos del mismo juego y la misma clave.
 */
export function rankOrdinal(game: GameId, r: RankValue | null | undefined): number | null {
  if (!r || !isObj(r)) return null;
  const ladder = LADDERS[game];
  if (ladder.kind === 'number') return 'value' in r && typeof r.value === 'number' && Number.isFinite(r.value) ? r.value : null;
  if (ladder.kind === 'text' || !('tier' in r)) return null;
  const idx = ladder.tiers.findIndex((t) => t.id === r.tier);
  if (idx < 0) return null;
  const tier = ladder.tiers[idx];
  let d = 0;
  if (tier.divs > 0 && typeof r.div === 'number' && Number.isInteger(r.div) && r.div >= 1 && r.div <= tier.divs) {
    d = tier.order === 'asc' ? r.div - 1 : tier.divs - r.div;
  }
  return idx * 10 + d;
}

/**
 * Rango de Rocket League para un MMR (§2.6): recorre las divisiones de la más alta (SSL) a la más baja y devuelve la
 * primera cuyo mínimo no supere el MMR. Debajo de todo, Bronce I división I. Es aproximado (temporada actual).
 */
export function rlRankFromMmr(mode: '1v1' | '2v2' | '3v3', mmr: number): { tier: string; div?: number } {
  const table = RL_MMR_MIN[mode];
  for (let t = RL_TIERS.length - 1; t >= 0; t--) {
    const tier = RL_TIERS[t];
    const mins = table[tier.id] ?? [];
    if (tier.divs === 0) {
      if (mins.length && mins[0] <= mmr) return { tier: tier.id };
      continue;
    }
    for (let d = mins.length; d >= 1; d--) if (mins[d - 1] <= mmr) return { tier: tier.id, div: d };
  }
  return { tier: 'bronze1', div: 1 };
}
