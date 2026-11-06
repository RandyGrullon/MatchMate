/**
 * Lo puro de anotar una serie de esports, mapa por mapa o juego por juego (docs/esports.md §12.8): qué palabra se usa,
 * el mapa vacío para la regla del juego, lo que se limpia al cambiar el marcador, las fichas de rondas y vidas, el
 * detalle de la serie («Mapa 1 · Ascent · 13-9») y el aviso al enviar. Sin React: lo usan la hoja del partido de la web
 * (MatchSheet + GameRow) y la del teléfono.
 */
import type { FinishResult } from '../../../../lib/data/matches';
import { GAMES, type GameRecord, type SeriesRules, type SeriesScore } from '../../../../sports/esports';

/** «Mapa» o «Juego» (singular de `mapsWord`). */
export function gameWord(rules: Pick<SeriesRules, 'game'>): string {
  return GAMES[rules.game].mapsWord === 'mapas' ? 'Mapa' : GAMES[rules.game].mapsWord === 'partidas' ? 'Partida' : 'Juego';
}

/** Un mapa o juego vacío para la regla del juego. */
export function emptyGame(rules: Pick<SeriesRules, 'game'>): GameRecord {
  switch (GAMES[rules.game].scoring) {
    case 'val':
    case 'cs':
    case 'goals_ot':
    case 'goals_pen':
    case 'points':
    case 'crowns':
      return { a: 0, b: 0 };
    default:
      return {};
  }
}

/**
 * Lo que ya no aplica se va solo al cambiar el marcador: la prórroga de Rocket League si dejó de ser por 1 y los penales
 * del FC si dejó de ser empate (si no, el error no se podría arreglar: su campo ya no se ve).
 */
export function tidyGame(rules: Pick<SeriesRules, 'game'>, g: GameRecord): GameRecord {
  const scoring = GAMES[rules.game].scoring;
  const next = { ...g };
  const scored = typeof next.a === 'number' && typeof next.b === 'number';
  if (scoring === 'goals_ot' && next.ot && (!scored || Math.abs(next.a! - next.b!) !== 1)) delete next.ot;
  if (scoring === 'goals_pen' && scored && next.a !== next.b) {
    delete next.pa;
    delete next.pb;
  }
  return next;
}

/** Sin las claves vacías (la base no acepta otras ni `undefined`). */
export function cleanGame(g: GameRecord): GameRecord {
  const out: GameRecord = {};
  if (g.w === 1 || g.w === 2) out.w = g.w;
  if (typeof g.a === 'number') out.a = g.a;
  if (typeof g.b === 'number') out.b = g.b;
  if (typeof g.pa === 'number') out.pa = g.pa;
  if (typeof g.pb === 'number') out.pb = g.pb;
  if (g.ot === true) out.ot = true;
  if (g.map) out.map = g.map;
  return out;
}

/** Al cambiar quién ganó, el detalle (rondas o vidas) se da vuelta para que siga siendo del ganador. */
export function swapFor(g: GameRecord, w: 1 | 2): Partial<GameRecord> {
  if (g.w && g.w !== w && typeof g.a === 'number' && typeof g.b === 'number') return { w, a: g.b, b: g.a };
  return { w };
}

/** Rocket League: el marcador quedó por 1 (se puede marcar «Prórroga (gol de oro)»). */
export const isCloseGame = (g: GameRecord) => typeof g.a === 'number' && typeof g.b === 'number' && Math.abs(g.a - g.b) === 1;

/** EA SPORTS FC: empate en goles y, si no se pusieron penales, empate de verdad. */
export function penaltyState(g: GameRecord): { tied: boolean; draw: boolean } {
  const tied = typeof g.a === 'number' && g.a === g.b;
  return { tied, draw: tied && g.pa == null && g.pb == null };
}

type Chip = { key: string; label: string };

/** SF6 y TEKKEN 8: a cuántas rondas se gana el juego. */
export const roundsToWinOf = (rules: Pick<SeriesRules, 'game' | 'roundsToWin'>) => rules.roundsToWin ?? GAMES[rules.game].roundsToWin?.default ?? 2;

/** Las fichas de «Rondas (opcional)»: «2-0», «2-1» y «Sin detalle»; la elegida y lo que cambia al tocar una. */
export function fightChoices(rules: Pick<SeriesRules, 'game' | 'roundsToWin'>, g: GameRecord): { items: Chip[]; value: string; pick: (k: string) => Partial<GameRecord> } {
  const rtw = roundsToWinOf(rules);
  const items = [...Array.from({ length: rtw }, (_, i) => ({ key: `${rtw}-${i}`, label: `${rtw}-${i}` })), { key: 'none', label: 'Sin detalle' }];
  const value = g.w && typeof g.a === 'number' && typeof g.b === 'number' ? `${rtw}-${g.w === 1 ? g.b : g.a}` : 'none';
  const pick = (k: string): Partial<GameRecord> => {
    if (k === 'none') return { a: undefined, b: undefined };
    const lost = Number(k.split('-')[1]);
    return g.w === 1 ? { a: rtw, b: lost } : { a: lost, b: rtw };
  };
  return { items, value, pick };
}

/** Smash: las fichas de «Vidas que le quedaron (opcional)» (1…vidas y «Sin detalle»), la elegida y lo que cambia. */
export function stockChoices(rules: Pick<SeriesRules, 'game' | 'stocks'>, g: GameRecord): { items: Chip[]; value: string; pick: (k: string) => Partial<GameRecord> } {
  const top = rules.stocks ?? GAMES[rules.game].stocks?.default ?? 3;
  const left = g.w === 1 ? g.a : g.w === 2 ? g.b : undefined;
  const items = [...Array.from({ length: top }, (_, i) => ({ key: String(i + 1), label: String(i + 1) })), { key: 'none', label: 'Sin detalle' }];
  const pick = (k: string): Partial<GameRecord> => {
    if (k === 'none') return { a: undefined, b: undefined };
    const n = Number(k);
    return g.w === 1 ? { a: n, b: 0 } : { a: 0, b: n };
  };
  return { items, value: left == null ? 'none' : String(left), pick };
}

/**
 * El detalle de la serie, mapa por mapa (debajo del marcador grande): «Mapa 1», el mapa y «13-9», «Gana Tigres», con
 * «(prórroga)» y los penales. Sin juegos o en un W.O., nada.
 */
export function seriesLines(score: SeriesScore | null, rules: Pick<SeriesRules, 'game'>, names: readonly [string, string]): { label: string; map: string; result: string }[] {
  if (!score || score.wo || !score.games.length) return [];
  const meta = GAMES[rules.game];
  const word = meta.mapsWord === 'mapas' ? 'Mapa' : 'Juego';
  const mapName = (id: string | undefined) => (id ? (meta.maps.find((x) => x.id === id)?.name ?? id) : null);
  return score.games.map((g, i) => ({
    label: `${word} ${i + 1}`,
    map: mapName(g.map) ?? '',
    result:
      (typeof g.a === 'number' && typeof g.b === 'number' ? `${g.a}-${g.b}` : g.w ? `Gana ${names[g.w - 1]}` : '') +
      (g.ot ? ' (prórroga)' : '') +
      (typeof g.pa === 'number' && typeof g.pb === 'number' ? ` (${g.pa}-${g.pb} pen.)` : ''),
  }));
}

/** La línea de arriba de «Anotar resultado» (el capitán): «Mapa por mapa, con la regla de VALORANT. El rival lo confirma.» */
export function scoringHint(rules: Pick<SeriesRules, 'game'>): string {
  const word = gameWord(rules);
  return `${word} por ${word.toLowerCase()}, con la regla de ${GAMES[rules.game].name}. El rival lo confirma.`;
}

/** Lo que dice el aviso después de enviar el resultado (sin señal, otro teléfono primero, guardado o enviado). */
export function finishToast(out: FinishResult | undefined): { text: string; tone: 'ok' | 'error' } {
  if (!out) return { text: 'Guardado: se envía cuando vuelva la señal', tone: 'ok' };
  if (out.reason === 'stale') return { text: 'Otro teléfono anotó primero: revisa el resultado.', tone: 'error' };
  return { text: out.status === 'confirmed' ? 'Resultado guardado' : 'Resultado enviado: falta que el rival lo confirme', tone: 'ok' };
}
