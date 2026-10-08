import { describe, expect, it } from 'vitest';
import {
  buildSeriesScore,
  defaultSettings,
  gameWinner,
  needed,
  parseSeriesScore,
  seriesRules,
  seriesScoreOk,
  seriesText,
  seriesWinner,
  validateGame,
  validateSeries,
  walkoverScore,
  type BestOf,
  type GameId,
  type GameRecord,
  type SeriesRules,
} from '.';

const R = (game: GameId, bestOf: BestOf, extra: Partial<SeriesRules> = {}): SeriesRules => ({ game, bestOf, draws: false, ...extra });
/** Marcador «13-11» → { a: 13, b: 11 }. */
const g = (a: number, b: number, more: Partial<GameRecord> = {}): GameRecord => ({ a, b, ...more });
const finalOk = (rules: SeriesRules, games: GameRecord[]) => validateSeries(rules, games, { final: true }).length === 0;
const liveOk = (rules: SeriesRules, games: GameRecord[]) => validateSeries(rules, games, { final: false }).length === 0;

describe('la tabla de §3.2 (las mismas filas que esp_series_ok)', () => {
  const rows: { name: string; rules: SeriesRules; games: GameRecord[]; final: boolean; winner?: 1 | 2 | null }[] = [
    { name: 'VALORANT Bo1 13-11', rules: R('valorant', 1), games: [g(13, 11)], final: true, winner: 1 },
    { name: 'VALORANT Bo1 13-12', rules: R('valorant', 1), games: [g(13, 12)], final: false },
    { name: 'VALORANT Bo1 14-12', rules: R('valorant', 1), games: [g(14, 12)], final: true, winner: 1 },
    { name: 'VALORANT Bo1 15-13', rules: R('valorant', 1), games: [g(15, 13)], final: true, winner: 1 },
    { name: 'VALORANT Bo1 20-18', rules: R('valorant', 1), games: [g(18, 20)], final: true, winner: 2 },
    { name: 'VALORANT Bo1 14-11', rules: R('valorant', 1), games: [g(14, 11)], final: false },
    { name: 'VALORANT Bo1 15-12', rules: R('valorant', 1), games: [g(15, 12)], final: false },
    { name: 'CS2 Bo1 13-11', rules: R('cs2', 1), games: [g(13, 11)], final: true, winner: 1 },
    { name: 'CS2 Bo1 16-14', rules: R('cs2', 1), games: [g(16, 14)], final: true, winner: 1 },
    { name: 'CS2 Bo1 16-12', rules: R('cs2', 1), games: [g(12, 16)], final: true, winner: 2 },
    { name: 'CS2 Bo1 19-17', rules: R('cs2', 1), games: [g(19, 17)], final: true, winner: 1 },
    { name: 'CS2 Bo1 13-12', rules: R('cs2', 1), games: [g(13, 12)], final: false },
    { name: 'CS2 Bo1 16-11', rules: R('cs2', 1), games: [g(16, 11)], final: false },
    { name: 'CS2 Bo1 17-15', rules: R('cs2', 1), games: [g(17, 15)], final: false },
    { name: 'CS2 Bo1 15-13', rules: R('cs2', 1), games: [g(15, 13)], final: false },
    { name: 'VALORANT Bo3 2-1', rules: R('valorant', 3), games: [g(13, 9), g(7, 13), g(13, 11)], final: true, winner: 1 },
    { name: 'VALORANT Bo3 sobra el 3.º', rules: R('valorant', 3), games: [g(13, 9), g(13, 7), g(13, 11)], final: false },
    { name: 'LoL Bo3', rules: R('lol', 3), games: [{ w: 1, a: 10, b: 25 }, { w: 2 }, { w: 1 }], final: true, winner: 1 },
    {
      name: 'Rocket League Bo5 3-2',
      rules: R('rocket_league', 5),
      games: [g(3, 2, { ot: true }), g(1, 4), g(2, 0), g(0, 1), g(4, 3, { ot: true })],
      final: true,
      winner: 1,
    },
    { name: 'Rocket League Bo5 3-1 ot', rules: R('rocket_league', 5), games: [g(3, 1, { ot: true })], final: false },
    { name: 'Rocket League Bo5 2-2', rules: R('rocket_league', 5), games: [g(2, 2)], final: false },
    { name: 'FC Bo1 liga con empates 2-2', rules: R('ea_fc', 1, { draws: true }), games: [g(2, 2)], final: true, winner: null },
    { name: 'FC Bo1 eliminatoria 2-2', rules: R('ea_fc', 1), games: [g(2, 2)], final: false },
    { name: 'FC Bo1 eliminatoria 2-2 pen 4-3', rules: R('ea_fc', 1), games: [g(2, 2, { pa: 4, pb: 3 })], final: true, winner: 1 },
    { name: 'FC Bo1 3-1 pen 4-3', rules: R('ea_fc', 1), games: [g(3, 1, { pa: 4, pb: 3 })], final: false },
    { name: 'NBA 2K Bo1 98-91', rules: R('nba_2k', 1), games: [g(98, 91)], final: true, winner: 1 },
    { name: 'SF6 Bo3 (rtw 2)', rules: R('sf6', 3, { roundsToWin: 2 }), games: [{ w: 1, a: 2, b: 1 }, { w: 2, a: 0, b: 2 }, { w: 1, a: 2, b: 0 }], final: true, winner: 1 },
    { name: 'SF6 Bo3 w1 3-1', rules: R('sf6', 3, { roundsToWin: 2 }), games: [{ w: 1, a: 3, b: 1 }], final: false },
    { name: 'TEKKEN 8 Bo3 (rtw 3)', rules: R('tekken8', 3, { roundsToWin: 3 }), games: [{ w: 2, a: 1, b: 3 }, { w: 2, a: 2, b: 3 }], final: true, winner: 2 },
    { name: 'Smash Bo3 (3 vidas)', rules: R('smash', 3, { stocks: 3 }), games: [{ w: 1, a: 2, b: 0 }, { w: 1, a: 1, b: 0 }], final: true, winner: 1 },
    { name: 'Smash Bo3 w1 0-1', rules: R('smash', 3, { stocks: 3 }), games: [{ w: 1, a: 0, b: 1 }], final: false },
    { name: 'Clash Royale Bo3', rules: R('clash_royale', 3), games: [{ w: 1, a: 3, b: 1 }, { w: 2, a: 1, b: 1 }, { w: 1, a: 2, b: 0 }], final: true, winner: 1 },
    { name: 'Clash Royale Bo3 w2 2-1', rules: R('clash_royale', 3), games: [{ w: 2, a: 2, b: 1 }], final: false },
  ];

  for (const row of rows) {
    it(`${row.name}: ${row.final ? 'final válido' : 'no es un final válido'}`, () => {
      expect(finalOk(row.rules, row.games)).toBe(row.final);
      if (row.final) {
        expect(seriesWinner(row.rules, row.games)).toBe(row.winner);
        const score = buildSeriesScore(row.rules, row.games);
        expect(seriesScoreOk(row.rules, score, true, row.winner ?? null)).toBe(true);
        // Con otro ganador, la base lo rechaza.
        if (row.winner) expect(seriesScoreOk(row.rules, score, true, row.winner === 1 ? 2 : 1)).toBe(false);
      }
    });
  }

  it('VALORANT Bo3 13-9: final no; en vivo sí', () => {
    const rules = R('valorant', 3);
    expect(validateSeries(rules, [g(13, 9)], { final: true })).toEqual(['Faltan juegos: nadie llegó a 2.']);
    expect(liveOk(rules, [g(13, 9)])).toBe(true);
    expect(seriesWinner(rules, [g(13, 9)])).toBeUndefined();
    const score = buildSeriesScore(rules, [g(13, 9)]);
    expect(seriesScoreOk(rules, score, false, null)).toBe(true);
    expect(seriesScoreOk(rules, score, true, 1)).toBe(false);
  });

  it('W.O. del lado 2 al mejor de 3', () => {
    const rules = R('valorant', 3);
    const wo = walkoverScore(rules, 2);
    expect(wo).toEqual({ text: 'W.O.', wo: true, sides: [2, 0], totals: { maps: [2, 0], points: [0, 0] }, games: [], bestOf: 3 });
    expect(walkoverScore(rules, 1).sides).toEqual([0, 2]);
    expect(walkoverScore(rules, 0).sides).toEqual([0, 0]);
    expect(walkoverScore(R('rocket_league', 7), 2).sides).toEqual([4, 0]);
    expect(seriesScoreOk(rules, wo, false, 1, 2)).toBe(true);
    expect(seriesScoreOk(rules, wo, false, 1, 1)).toBe(false);
    expect(seriesScoreOk(rules, { ...wo, sides: [1, 0], totals: { maps: [1, 0], points: [0, 0] } }, false, 1)).toBe(false);
    expect(seriesScoreOk(rules, { ...wo, games: [g(13, 0)] }, false, 1)).toBe(false);
  });
});

describe('VALORANT: 13 y prórroga por 2 desde 12-12', () => {
  const rules = R('valorant', 1);
  const v = (a: number, b: number) => validateGame(rules, g(a, b), 0);
  it('bordes', () => {
    expect(v(13, 0)).toBeNull();
    expect(v(11, 13)).toBeNull();
    expect(v(13, 12)).toBe('Mapa 1: en VALORANT se gana con 13 (o por 2 desde 12-12).');
    expect(v(12, 12)).toBe('Mapa 1: en VALORANT se gana con 13 (o por 2 desde 12-12).');
    expect(v(14, 12)).toBeNull();
    expect(v(14, 13)).not.toBeNull();
    expect(v(16, 13)).not.toBeNull();
    expect(v(30, 28)).toBeNull();
    expect(v(12, 10)).not.toBeNull();
    expect(v(100, 98)).toBe('Mapa 1: revisa el marcador.');
  });
  it('w tiene que coincidir; el índice cuenta desde 0', () => {
    expect(validateGame(rules, { a: 13, b: 5, w: 1 }, 1)).toBeNull();
    expect(validateGame(rules, { a: 13, b: 5, w: 2 }, 1)).toBe('Mapa 2: en VALORANT se gana con 13 (o por 2 desde 12-12).');
    expect(validateGame(rules, { a: 13, b: 5, w: null }, 0)).toBeNull();
  });
  it('mapas: ids de la lista; claves de más, ot o penales: inválido', () => {
    expect(validateGame(rules, { a: 13, b: 5, map: 'ascent' }, 0)).toBeNull();
    expect(validateGame(rules, { a: 13, b: 5, map: 'Ascent' }, 0)).toBe('Mapa 1: revisa el marcador.');
    expect(validateGame(rules, { a: 13, b: 5, map: '' }, 0)).toBe('Mapa 1: revisa el marcador.');
    expect(validateGame(rules, { a: 13, b: 5, ot: true }, 0)).toBe('Mapa 1: revisa el marcador.');
    expect(validateGame(rules, { a: 13, b: 5, pa: 1, pb: 0 }, 0)).toBe('Mapa 1: revisa el marcador.');
    expect(validateGame(rules, { a: 13, b: 5, x: 1 } as GameRecord, 0)).toBe('Mapa 1: revisa el marcador.');
    expect(validateGame(rules, { a: 13.5, b: 5 }, 0)).toBe('Mapa 1: revisa el marcador.');
    expect(validateGame(rules, { a: 13 }, 0)).toBe('Mapa 1: revisa el marcador.');
    expect(validateGame(rules, {}, 0)).toBe('Mapa 1: en VALORANT se gana con 13 (o por 2 desde 12-12).');
  });
});

describe('CS2: MR12 y prórroga MR3', () => {
  const rules = R('cs2', 1);
  const v = (a: number, b: number) => validateGame(rules, g(a, b), 0);
  it('regulación y prórrogas a 16, 19, 22…', () => {
    for (const [a, b] of [
      [13, 0],
      [13, 11],
      [16, 12],
      [16, 15],
      [19, 15],
      [19, 18],
      [22, 21],
      [25, 21],
    ]) {
      expect(v(a, b), `${a}-${b}`).toBeNull();
    }
    for (const [a, b] of [
      [13, 12],
      [14, 12],
      [16, 11],
      [16, 16],
      [17, 15],
      [18, 15],
      [19, 14],
      [22, 17],
      [15, 13],
    ]) {
      expect(v(a, b), `${a}-${b}`).toBe('Mapa 1: en CS2 se gana con 13, o en prórroga a 16, 19, 22…');
    }
  });
  it('mapas de CS2', () => {
    expect(validateGame(rules, { a: 13, b: 3, map: 'dust2' }, 0)).toBeNull();
  });
});

describe('LoL y MLBB: por juegos, kills opcionales', () => {
  const rules = R('mlbb', 7);
  it('w obligatorio; las kills no se comparan con w', () => {
    expect(validateGame(rules, { w: 2, a: 30, b: 5 }, 0)).toBeNull();
    expect(validateGame(rules, { w: 1 }, 0)).toBeNull();
    expect(validateGame(rules, { a: 10, b: 5 }, 2)).toBe('Juego 3: elige quién ganó.');
    expect(validateGame(rules, { w: 1, a: 201, b: 0 }, 0)).toBe('Juego 1: revisa el marcador.');
    expect(validateGame(rules, { w: 1, a: 3 }, 0)).toBe('Juego 1: revisa el marcador.');
    expect(validateGame(rules, { w: 3 as 1 }, 0)).toBe('Juego 1: revisa el marcador.');
  });
  it('Bo7 a 4', () => {
    const games: GameRecord[] = [{ w: 1 }, { w: 2 }, { w: 1 }, { w: 2 }, { w: 1 }, { w: 2 }, { w: 2 }];
    expect(needed(7)).toBe(4);
    expect(finalOk(rules, games)).toBe(true);
    expect(seriesWinner(rules, games)).toBe(2);
    expect(buildSeriesScore(rules, games).text).toBe('3-4');
    expect(finalOk(rules, games.slice(0, 6))).toBe(false);
  });
  it('el texto no lleva las kills', () => {
    const lol = R('lol', 1);
    expect(seriesText(lol, buildSeriesScore(lol, [{ w: 1, a: 20, b: 3 }]))).toBe('1-0');
    expect(buildSeriesScore(lol, [{ w: 1, a: 10, b: 25 }]).totals.points).toEqual([10, 25]);
  });
});

describe('Rocket League: gol de oro', () => {
  const rules = R('rocket_league', 5);
  it('sin empates; ot solo por 1', () => {
    expect(validateGame(rules, g(1, 0, { ot: true }), 0)).toBeNull();
    expect(validateGame(rules, g(5, 4, { ot: true }), 0)).toBeNull();
    expect(validateGame(rules, g(5, 0, { ot: false }), 0)).toBeNull();
    expect(validateGame(rules, g(3, 1, { ot: true }), 0)).toBe('Juego 1: no hay empates; la prórroga es a gol de oro (por 1).');
    expect(validateGame(rules, g(0, 0), 0)).toBe('Juego 1: no hay empates; la prórroga es a gol de oro (por 1).');
    expect(validateGame(rules, { a: 1, b: 0, ot: 'sí' } as unknown as GameRecord, 0)).toBe('Juego 1: revisa el marcador.');
    expect(validateGame(rules, { a: 1, b: 0, map: 'DFH Stadium' }, 0)).toBeNull();
    expect(validateGame(rules, { a: 1, b: 0, map: 'x'.repeat(25) }, 0)).toBe('Juego 1: revisa el marcador.');
  });
  it('textos', () => {
    const bo1 = R('rocket_league', 1);
    expect(buildSeriesScore(bo1, [g(3, 2, { ot: true })]).text).toBe('3-2 (prórroga)');
    expect(buildSeriesScore(bo1, [g(3, 2)]).text).toBe('3-2');
    const games = [g(3, 2), g(1, 4), g(2, 1), g(4, 3, { ot: true })];
    expect(buildSeriesScore(R('rocket_league', 7), games).text).toBe('3-1 (3-2 1-4 2-1 4-3 prórroga)');
  });
  it('Bo7 en la final', () => {
    const r7 = R('rocket_league', 7);
    expect(finalOk(r7, [g(1, 0), g(1, 0), g(1, 0), g(1, 0)])).toBe(true);
    expect(validateSeries(r7, [g(1, 0), g(1, 0), g(1, 0), g(1, 0), g(0, 1)], { final: true })).toEqual(['Sobra el juego 5: la serie ya terminó.']);
  });
});

describe('EA SPORTS FC: penales y empates', () => {
  it('penales solo con empate; con empate sin empates permitidos, pon los penales', () => {
    const ko = R('ea_fc', 1);
    expect(validateGame(ko, g(2, 2), 0)).toBe('Juego 1: con empate, pon los penales.');
    expect(validateGame(ko, g(2, 2, { pa: 3, pb: 3 }), 0)).toBe('Juego 1: con empate, pon los penales.');
    expect(validateGame(ko, g(3, 1, { pa: 4, pb: 3 }), 0)).toBe('Juego 1: los penales solo van con empate.');
    expect(validateGame(ko, g(2, 2, { pa: 4 }), 0)).toBe('Juego 1: revisa el marcador.');
    expect(validateGame(ko, g(31, 0), 0)).toBe('Juego 1: revisa el marcador.');
    expect(gameWinner(ko, g(2, 2, { pa: 3, pb: 5 }))).toBe(2);
    expect(gameWinner(ko, g(0, 1))).toBe(2);
  });
  it('empate permitido solo con draws y al mejor de 1', () => {
    const liga = R('ea_fc', 1, { draws: true });
    expect(validateGame(liga, g(1, 1), 0)).toBeNull();
    expect(validateGame(liga, g(1, 1, { w: 1 }), 0)).toBe('Juego 1: revisa el marcador.');
    expect(gameWinner(liga, g(1, 1))).toBeNull();
    expect(seriesWinner(liga, [g(1, 1)])).toBeNull();
    // Al mejor de 3 no hay empates aunque draws venga encendido.
    const bo3 = R('ea_fc', 3, { draws: true });
    expect(validateGame(bo3, g(1, 1), 0)).toBe('Juego 1: con empate, pon los penales.');
  });
  it('textos y totales', () => {
    const liga = R('ea_fc', 1, { draws: true });
    const draw = buildSeriesScore(liga, [g(2, 2)]);
    expect(draw.text).toBe('2-2');
    expect(draw.sides).toEqual([0, 0]);
    expect(draw.games[0]).toEqual({ a: 2, b: 2 });
    expect(seriesScoreOk(liga, draw, true, null)).toBe(true);
    expect(seriesScoreOk(liga, draw, true, 1)).toBe(false);
    const pens = buildSeriesScore(R('ea_fc', 1), [g(2, 2, { pa: 4, pb: 3 })]);
    expect(pens.text).toBe('2-2 (4-3 pen.)');
    expect(pens.sides).toEqual([1, 0]);
    expect(pens.games[0]).toEqual({ w: 1, a: 2, b: 2, pa: 4, pb: 3 });
    const bo3 = buildSeriesScore(R('ea_fc', 3), [g(1, 0), g(2, 2, { pa: 2, pb: 4 }), g(0, 3)]);
    expect(bo3.text).toBe('1-2 (1-0 2-2 (2-4 pen.) 0-3)');
    expect(bo3.totals.points).toEqual([3, 5]);
  });
});

describe('NBA 2K: por puntos', () => {
  const rules = R('nba_2k', 3);
  it('no hay empates; hasta 300', () => {
    expect(validateGame(rules, g(98, 91), 0)).toBeNull();
    expect(validateGame(rules, g(100, 100), 1)).toBe('Juego 2: no hay empates.');
    expect(validateGame(rules, g(301, 100), 0)).toBe('Juego 1: revisa el marcador.');
    expect(buildSeriesScore(R('nba_2k', 1), [g(98, 91)]).text).toBe('98-91');
    expect(buildSeriesScore(rules, [g(98, 91), g(80, 102), g(110, 99)]).text).toBe('2-1 (98-91 80-102 110-99)');
  });
});

describe('Juegos de pelea: rondas para ganar', () => {
  it('SF6 a 2 rondas', () => {
    const rules = R('sf6', 3, { roundsToWin: 2 });
    expect(validateGame(rules, { w: 2, a: 1, b: 2 }, 0)).toBeNull();
    expect(validateGame(rules, { w: 2 }, 0)).toBeNull();
    expect(validateGame(rules, { w: 1, a: 2, b: 2 }, 0)).toBe('Juego 1: quien gana tiene 2 rondas.');
    expect(validateGame(rules, { w: 1, a: 3, b: 1 }, 0)).toBe('Juego 1: quien gana tiene 2 rondas.');
    expect(validateGame(rules, { a: 2, b: 0 }, 0)).toBe('Juego 1: elige quién ganó.');
  });
  it('TEKKEN 8 a 3 (o a 2 si el torneo lo baja); sin roundsToWin, el del catálogo', () => {
    expect(validateGame(R('tekken8', 3), { w: 1, a: 3, b: 2 }, 0)).toBeNull();
    expect(validateGame(R('tekken8', 3), { w: 1, a: 2, b: 1 }, 0)).toBe('Juego 1: quien gana tiene 3 rondas.');
    expect(validateGame(R('tekken8', 3, { roundsToWin: 2 }), { w: 1, a: 2, b: 1 }, 0)).toBeNull();
    expect(buildSeriesScore(R('tekken8', 3), [{ w: 2, a: 1, b: 3 }, { w: 2, a: 2, b: 3 }]).text).toBe('0-2 (1-3 2-3)');
  });
  it('sin rondas el texto es solo la serie', () => {
    const rules = R('sf6', 3, { roundsToWin: 2 });
    expect(buildSeriesScore(rules, [{ w: 1 }, { w: 1, a: 2, b: 0 }]).text).toBe('2-0');
  });
});

describe('Smash: vidas', () => {
  it('quien gana tiene de 1 a stocks y el otro 0', () => {
    const rules = R('smash', 5, { stocks: 3 });
    expect(validateGame(rules, { w: 2, a: 0, b: 3 }, 0)).toBeNull();
    expect(validateGame(rules, { w: 2, a: 0, b: 4 }, 0)).toBe('Juego 1: quien gana tiene de 1 a 3 vidas y el otro 0.');
    expect(validateGame(rules, { w: 1, a: 1, b: 1 }, 0)).toBe('Juego 1: quien gana tiene de 1 a 3 vidas y el otro 0.');
    expect(validateGame(R('smash', 3, { stocks: 5 }), { w: 1, a: 5, b: 0 }, 0)).toBeNull();
    expect(validateGame(R('smash', 3), { w: 1, a: 4, b: 0 }, 0)).toBe('Juego 1: quien gana tiene de 1 a 3 vidas y el otro 0.');
  });
});

describe('Clash Royale: coronas', () => {
  const rules = R('clash_royale', 3);
  it('0–3 y quien gana tiene igual o más (desempate por vida de torres)', () => {
    expect(validateGame(rules, { w: 1, a: 1, b: 1 }, 0)).toBeNull();
    expect(validateGame(rules, { w: 2, a: 0, b: 3 }, 0)).toBeNull();
    expect(validateGame(rules, { w: 1, a: 4, b: 0 }, 0)).toBe('Juego 1: de 0 a 3 coronas, y quien gana tiene igual o más.');
    expect(validateGame(rules, { w: 1, a: 0, b: 1 }, 0)).toBe('Juego 1: de 0 a 3 coronas, y quien gana tiene igual o más.');
    expect(validateGame(rules, { w: 1 }, 0)).toBe('Juego 1: de 0 a 3 coronas, y quien gana tiene igual o más.');
    expect(validateGame(rules, { a: 3, b: 0 }, 0)).toBe('Juego 1: elige quién ganó.');
    expect(buildSeriesScore(R('clash_royale', 1), [{ w: 1, a: 2, b: 1 }]).text).toBe('2-1');
  });
});

describe('validateSeries', () => {
  it('largo y vacío', () => {
    const rules = R('valorant', 1);
    expect(validateSeries(rules, [], { final: true })).toEqual(['Faltan juegos: nadie llegó a 1.']);
    expect(validateSeries(rules, [], { final: false })).toEqual(['Faltan juegos: nadie llegó a 1.']);
    expect(validateSeries(rules, [g(13, 1), g(13, 2)], { final: false })).toEqual(['Al mejor de 1 se juegan como mucho 1.', 'Sobra el juego 2: la serie ya terminó.']);
  });
  it('junta los errores de cada mapa', () => {
    const rules = R('valorant', 3);
    expect(validateSeries(rules, [g(13, 12), g(13, 2), g(12, 12)], { final: true })).toEqual([
      'Mapa 1: en VALORANT se gana con 13 (o por 2 desde 12-12).',
      'Mapa 3: en VALORANT se gana con 13 (o por 2 desde 12-12).',
    ]);
  });
  it('en vivo se acepta a medias pero no lo que sobra', () => {
    const rules = R('cs2', 5);
    expect(liveOk(rules, [g(13, 1), g(1, 13), g(13, 1)])).toBe(true);
    expect(liveOk(rules, [g(13, 1), g(13, 1), g(13, 1), g(1, 13)])).toBe(false);
  });
});

describe('buildSeriesScore, texto y lectura', () => {
  it('totals.points es la suma de a y b; maps = sides; w puesto en cada mapa', () => {
    const rules = R('valorant', 3);
    const s = buildSeriesScore(rules, [g(13, 9, { map: 'bind' }), g(7, 13), g(13, 11)], ['0190f7a4-6b1e-7c1d-9a2b-3c4d5e6f7a8b']);
    expect(s).toEqual({
      text: '2-1 (13-9 7-13 13-11)',
      sides: [2, 1],
      totals: { maps: [2, 1], points: [33, 33] },
      games: [
        { w: 1, a: 13, b: 9, map: 'bind' },
        { w: 2, a: 7, b: 13 },
        { w: 1, a: 13, b: 11 },
      ],
      bestOf: 3,
      proof: ['0190f7a4-6b1e-7c1d-9a2b-3c4d5e6f7a8b'],
    });
    expect(seriesScoreOk(rules, s, true, 1)).toBe(true);
    expect(seriesScoreOk(rules, { ...s, totals: { maps: [2, 1], points: [33, 30] } }, true, 1)).toBe(false);
    expect(seriesScoreOk(rules, { ...s, sides: [2, 0] }, true, 1)).toBe(false);
    expect(seriesScoreOk(rules, { ...s, bestOf: 5 }, true, 1)).toBe(false);
    expect(seriesScoreOk(rules, { ...s, text: 'x'.repeat(81) }, true, 1)).toBe(false);
    expect(seriesScoreOk(rules, { ...s, proof: ['a', 'b', 'c', 'd'] }, true, 1)).toBe(false);
    expect(seriesScoreOk(rules, { ...s, extra: 1 }, true, 1)).toBe(false);
    expect(seriesScoreOk(rules, null, true, 1)).toBe(false);
  });

  it('el texto que no cabe en 80 queda solo con la serie', () => {
    const rules = R('rocket_league', 5);
    const long = [g(12345, 12344, { ot: true }), g(12344, 12345, { ot: true }), g(12345, 12344, { ot: true }), g(12344, 12345, { ot: true }), g(12345, 12344, { ot: true })];
    expect(seriesText(rules, { games: long, sides: [3, 2] })).toBe('3-2');
    expect(seriesText(rules, { games: [], sides: [0, 0] })).toBe('0-0');
    expect(seriesText(rules, { games: [], sides: [3, 0], wo: true })).toBe('W.O.');
  });

  it('VALORANT Bo1 da el marcador del mapa', () => {
    const rules = R('valorant', 1);
    expect(buildSeriesScore(rules, [g(13, 9)]).text).toBe('13-9');
    expect(buildSeriesScore(rules, [g(12, 14)]).text).toBe('12-14');
  });

  it('parseSeriesScore', () => {
    const rules = R('valorant', 3);
    const s = buildSeriesScore(rules, [g(13, 9), g(7, 13), g(13, 11)]);
    expect(parseSeriesScore(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSeriesScore(walkoverScore(rules, 1))).toEqual(walkoverScore(rules, 1));
    expect(parseSeriesScore({ text: '1-0', sides: [1, 0], games: [{ w: 1, a: 13, b: 3, junk: 1 }], bestOf: 1 })).toEqual({
      text: '1-0',
      sides: [1, 0],
      totals: { maps: [1, 0], points: [13, 3] },
      games: [{ w: 1, a: 13, b: 3 }],
      bestOf: 1,
    });
    expect(parseSeriesScore(null)).toBeNull();
    expect(parseSeriesScore({ text: '6-4', sides: [6, 4] })).toBeNull();
    expect(parseSeriesScore({ sides: [1, 0], games: [], bestOf: 2 })).toBeNull();
    expect(parseSeriesScore({ games: [], bestOf: 3 })).toBeNull();
  });
});

describe('seriesRules', () => {
  it('draws solo en FC al mejor de 1 en grupos o liga', () => {
    const fc = defaultSettings('ea_fc', '1v1', 'groups_playoffs');
    expect(seriesRules('ea_fc', fc, 1, 'groups')).toEqual({ game: 'ea_fc', bestOf: 1, draws: true });
    expect(seriesRules('ea_fc', fc, 1, 'league')).toEqual({ game: 'ea_fc', bestOf: 1, draws: true });
    expect(seriesRules('ea_fc', fc, 1, 'playoffs')).toEqual({ game: 'ea_fc', bestOf: 1, draws: false });
    expect(seriesRules('ea_fc', fc, 1, 'bracket')).toEqual({ game: 'ea_fc', bestOf: 1, draws: false });
    expect(seriesRules('ea_fc', fc, 3, 'groups')).toEqual({ game: 'ea_fc', bestOf: 3, draws: false });
    expect(seriesRules('ea_fc', { ...fc, draws: false }, 1, 'groups').draws).toBe(false);
    const val = defaultSettings('valorant', '5v5', 'round_robin');
    expect(seriesRules('valorant', { ...val, draws: true }, 1, 'league')).toEqual({ game: 'valorant', bestOf: 1, draws: false });
  });
  it('rondas para ganar y vidas, del torneo o del catálogo', () => {
    const t8 = defaultSettings('tekken8', '1v1', 'single_elim');
    expect(seriesRules('tekken8', t8, 3, 'bracket')).toEqual({ game: 'tekken8', bestOf: 3, draws: false, roundsToWin: 3 });
    expect(seriesRules('tekken8', { ...t8, roundsToWin: 2 }, 3, 'bracket').roundsToWin).toBe(2);
    const { roundsToWin: _r, ...noRtw } = t8;
    expect(seriesRules('tekken8', noRtw, 3, 'bracket').roundsToWin).toBe(3);
    const smash = defaultSettings('smash', '1v1', 'single_elim');
    expect(seriesRules('smash', { ...smash, stocks: 2 }, 5, 'bracket')).toEqual({ game: 'smash', bestOf: 5, draws: false, stocks: 2 });
    expect(seriesRules('valorant', { ...defaultSettings('valorant', '5v5', 'single_elim'), stocks: 3 }, 3, 'bracket')).toEqual({ game: 'valorant', bestOf: 3, draws: false });
  });
});
