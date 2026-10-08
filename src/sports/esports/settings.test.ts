import { describe, expect, it } from 'vitest';
import {
  canVerifyId,
  canVerifyRank,
  defaultSettings,
  ENTRY_LABEL,
  entryTypesFor,
  FORMAT_LABEL,
  formatsFor,
  GAME_IDS,
  GAMES,
  maxEntries,
  normalizeVerifyFlags,
  validateSettings,
  type Format,
} from '.';

describe('defaultSettings', () => {
  it('los de §3.6', () => {
    expect(defaultSettings('valorant', '5v5', 'double_elim')).toEqual({
      subs: 2,
      autoApprove: false,
      requireConfirmedId: false,
      requireVerifiedRank: false,
      seeding: 'random',
      bestOf: { groups: 1, playoffs: 3, final: 5 },
      thirdPlace: false,
      bracketReset: true,
      groups: 2,
      perGroup: 2,
      playoffs: 'single',
      doubleRoundRobin: false,
      draws: false,
      platform: '',
    });
  });

  it('lo propio de cada juego', () => {
    expect(defaultSettings('ea_fc', '1v1', 'round_robin').draws).toBe(true);
    expect(defaultSettings('ea_fc', '1v1', 'round_robin').subs).toBe(0);
    expect(defaultSettings('rocket_league', '3v3', 'single_elim').subs).toBe(1);
    expect(defaultSettings('rocket_league', '2v2', 'single_elim').subs).toBe(1);
    expect(defaultSettings('rocket_league', '1v1', 'single_elim').subs).toBe(0);
    expect(defaultSettings('rocket_league', '3v3', 'single_elim').bestOf).toEqual({ groups: 5, playoffs: 5, final: 7 });
    expect(defaultSettings('sf6', '1v1', 'single_elim').roundsToWin).toBe(2);
    expect(defaultSettings('tekken8', '1v1', 'single_elim').roundsToWin).toBe(3);
    expect(defaultSettings('smash', '1v1', 'single_elim').stocks).toBe(3);
    expect(defaultSettings('valorant', '5v5', 'single_elim')).not.toHaveProperty('roundsToWin');
    expect(defaultSettings('valorant', '5v5', 'single_elim')).not.toHaveProperty('stocks');
    expect(defaultSettings('valorant', '5v5', 'single_elim')).not.toHaveProperty('br');
    const ff = defaultSettings('free_fire', 'squad', 'br');
    expect(ff.bestOf).toEqual({ groups: 1, playoffs: 1, final: 1 });
    expect(ff.br).toEqual({ placementPoints: [12, 9, 8, 7, 6, 5, 4, 3, 2, 1], killPoints: 1, rounds: 1, gamesPerRound: 4 });
    expect(ff.subs).toBe(1);
    // Copia: cambiarla no toca el catálogo.
    ff.br!.placementPoints[0] = 99;
    expect(GAMES.free_fire.br!.placementPoints[0]).toBe(12);
    expect(defaultSettings('fortnite', 'solo', 'br').subs).toBe(0);
  });

  it('los ajustes por defecto son válidos (salvo la plataforma de NBA 2K, que hay que elegir)', () => {
    for (const game of GAME_IDS) {
      for (const mode of GAMES[game].modes) {
        for (const format of formatsFor(game)) {
          const cap = Math.min(maxEntries(game, mode, format), 16);
          for (const entry of entryTypesFor(game, mode)) {
            const s = defaultSettings(game, mode, format);
            const errors = validateSettings(game, mode, format, entry, cap, s);
            if (game === 'nba_2k') {
              expect(errors).toEqual(['Elige la plataforma.']);
              expect(validateSettings(game, mode, format, entry, cap, { ...s, platform: 'psn' })).toEqual([]);
            } else expect(errors, `${game} ${mode} ${format} ${entry}`).toEqual([]);
          }
        }
      }
    }
  });
});

describe('pedir ID confirmado y rango verificado según el juego', () => {
  it('apagados por defecto en todos los juegos', () => {
    for (const game of GAME_IDS) {
      const s = defaultSettings(game, GAMES[game].defaultMode, formatsFor(game)[0]);
      expect([s.requireConfirmedId, s.requireVerifiedRank], game).toEqual([false, false]);
    }
  });

  it('normalizeVerifyFlags: el ID solo si el juego lo comprueba; el rango solo en LoL', () => {
    const on = { requireConfirmedId: true, requireVerifiedRank: true };
    expect(normalizeVerifyFlags('lol', on)).toBe(on);
    expect(normalizeVerifyFlags('valorant', on)).toEqual({ requireConfirmedId: true, requireVerifiedRank: false });
    expect(normalizeVerifyFlags('cs2', on)).toEqual({ requireConfirmedId: true, requireVerifiedRank: false });
    expect(normalizeVerifyFlags('rocket_league', on)).toEqual({ requireConfirmedId: true, requireVerifiedRank: false });
    expect(normalizeVerifyFlags('mlbb', on)).toEqual({ requireConfirmedId: false, requireVerifiedRank: false });
    expect(normalizeVerifyFlags('clash_royale', on)).toEqual({ requireConfirmedId: false, requireVerifiedRank: false });
    for (const game of GAME_IDS) {
      expect(normalizeVerifyFlags(game, on), game).toEqual({ requireConfirmedId: canVerifyId(game), requireVerifiedRank: canVerifyRank(game) });
    }
    // Lo demás queda igual (en una copia); si no cambia nada, los mismos.
    const s = { ...defaultSettings('ea_fc', '1v1', 'single_elim'), requireConfirmedId: true };
    expect(normalizeVerifyFlags('ea_fc', s)).toEqual({ ...s, requireConfirmedId: false });
    expect(s.requireConfirmedId).toBe(true);
    const off = defaultSettings('lol', '5v5', 'single_elim');
    expect(normalizeVerifyFlags('lol', off)).toBe(off);
  });

  it('pedirlos en un juego que no los comprueba no es un error (no cuentan)', () => {
    const s = { ...defaultSettings('mlbb', '5v5', 'single_elim'), requireConfirmedId: true, requireVerifiedRank: true };
    expect(validateSettings('mlbb', '5v5', 'single_elim', 'teams', 16, s)).toEqual([]);
    expect(validateSettings('mlbb', '5v5', 'single_elim', 'teams', 16, { ...s, requireConfirmedId: 'sí' })).toEqual(['«Pedir ID confirmado» tiene que ser sí o no.']);
  });
});

describe('validateSettings: forma de cada clave (igual que esp_settings_ok)', () => {
  const base = defaultSettings('valorant', '5v5', 'single_elim');
  const v = (patch: Record<string, unknown>, game = 'valorant' as const) => validateSettings(game, '5v5', 'single_elim', 'teams', 16, { ...base, ...patch });

  it('claves desconocidas, suplentes, booleanos y siembra', () => {
    expect(v({ foo: 1 })).toEqual(['Ajuste desconocido: foo.']);
    expect(v({ subs: 3 })).toEqual(['Los suplentes van de 0 a 2.']);
    expect(v({ subs: -1 })).toEqual(['Los suplentes van de 0 a 2.']);
    expect(v({ subs: 1.5 })).toEqual(['Los suplentes van de 0 a 2.']);
    expect(v({ autoApprove: 'sí' })).toEqual(['«Aprobar solo» tiene que ser sí o no.']);
    expect(v({ draws: 1 })).toEqual(['«Empates» tiene que ser sí o no.']);
    expect(v({ seeding: 'elo' })).toEqual(['Elige cómo sembrar: a mano, al azar o por rango.']);
  });

  it('mejor de dentro de los del juego', () => {
    expect(v({ bestOf: { groups: 1, playoffs: 3, final: 7 } })).toEqual(['En VALORANT se juega al mejor de 1, 3 o 5.']);
    expect(v({ bestOf: { groups: 1, playoffs: 3 } })).toEqual(['En VALORANT se juega al mejor de 1, 3 o 5.']);
    expect(v({ bestOf: { groups: 1, playoffs: 3, final: 5, x: 1 } })).toEqual(['En VALORANT se juega al mejor de 1, 3 o 5.']);
    expect(v({ bestOf: 3 })).toEqual(['En VALORANT se juega al mejor de 1, 3 o 5.']);
    const fc = defaultSettings('ea_fc', '1v1', 'single_elim');
    expect(validateSettings('ea_fc', '1v1', 'single_elim', 'open', 8, { ...fc, bestOf: { groups: 1, playoffs: 1, final: 5 } })).toEqual([
      'En EA SPORTS FC se juega al mejor de 1 o 3.',
    ]);
  });

  it('grupos, clasificados y playoffs', () => {
    expect(v({ groups: 0 })).toEqual(['Los grupos van de 1 a 8.']);
    expect(v({ groups: 9 })).toEqual(['Los grupos van de 1 a 8.']);
    expect(v({ perGroup: 5 })).toEqual(['Los clasificados por grupo van de 1 a 4.']);
    expect(v({ playoffs: 'triple' })).toEqual(['Los playoffs son de eliminación simple o doble.']);
  });

  it('plataforma: obligatoria en NBA 2K, vacía en el resto', () => {
    expect(v({ platform: 'psn' })).toEqual(['VALORANT no lleva plataforma.']);
    const nba = defaultSettings('nba_2k', '1v1', 'single_elim');
    expect(validateSettings('nba_2k', '1v1', 'single_elim', 'open', 8, { ...nba, platform: 'xbox' })).toEqual([]);
    expect(validateSettings('nba_2k', '1v1', 'single_elim', 'open', 8, { ...nba, platform: 'ps5' })).toEqual(['Elige la plataforma.']);
    const { platform: _p, ...noPlatform } = nba;
    expect(validateSettings('nba_2k', '1v1', 'single_elim', 'open', 8, noPlatform)).toEqual(['Elige la plataforma.']);
  });

  it('rondas para ganar solo en juegos de pelea (SF6 solo 2); vidas solo en Smash', () => {
    expect(v({ roundsToWin: 2 })).toEqual(['VALORANT no lleva rondas para ganar.']);
    const sf6 = defaultSettings('sf6', '1v1', 'single_elim');
    expect(validateSettings('sf6', '1v1', 'single_elim', 'open', 8, { ...sf6, roundsToWin: 3 })).toEqual(['En Street Fighter 6 se gana con 2 rondas.']);
    const t8 = defaultSettings('tekken8', '1v1', 'single_elim');
    expect(validateSettings('tekken8', '1v1', 'single_elim', 'open', 8, { ...t8, roundsToWin: 2 })).toEqual([]);
    expect(validateSettings('tekken8', '1v1', 'single_elim', 'open', 8, { ...t8, roundsToWin: 4 })).toEqual(['Las rondas para ganar son 2 o 3.']);
    expect(v({ stocks: 3 })).toEqual(['VALORANT no lleva vidas.']);
    const smash = defaultSettings('smash', '1v1', 'single_elim');
    expect(validateSettings('smash', '1v1', 'single_elim', 'open', 8, { ...smash, stocks: 5 })).toEqual([]);
    expect(validateSettings('smash', '1v1', 'single_elim', 'open', 8, { ...smash, stocks: 6 })).toEqual(['Las vidas van de 1 a 5.']);
    expect(validateSettings('smash', '1v1', 'single_elim', 'open', 8, { ...smash, stocks: 0 })).toEqual(['Las vidas van de 1 a 5.']);
  });

  it('br solo en battle royale, con sus rangos', () => {
    expect(v({ br: { placementPoints: [1], killPoints: 1, rounds: 1, gamesPerRound: 1 } })).toEqual(['VALORANT no es battle royale.']);
    const ff = defaultSettings('free_fire', 'squad', 'br');
    const f = (br: unknown) => validateSettings('free_fire', 'squad', 'br', 'teams', 12, { ...ff, br });
    expect(f({ placementPoints: [10, 5], killPoints: 2, rounds: 10, gamesPerRound: 12 })).toEqual([]);
    expect(f({ placementPoints: [], killPoints: 1, rounds: 1, gamesPerRound: 4 })).toEqual(['Los puntos por puesto son de 1 a 100 números, cada uno de 0 a 100.']);
    expect(f({ placementPoints: [101], killPoints: 1, rounds: 1, gamesPerRound: 4 })).toEqual(['Los puntos por puesto son de 1 a 100 números, cada uno de 0 a 100.']);
    expect(f({ placementPoints: Array(101).fill(1), killPoints: 1, rounds: 1, gamesPerRound: 4 })).toEqual([
      'Los puntos por puesto son de 1 a 100 números, cada uno de 0 a 100.',
    ]);
    expect(f({ placementPoints: [1], killPoints: 11, rounds: 1, gamesPerRound: 4 })).toEqual(['Los puntos por kill van de 0 a 10.']);
    expect(f({ placementPoints: [1], killPoints: 1, rounds: 11, gamesPerRound: 4 })).toEqual(['Las rondas van de 1 a 10.']);
    expect(f({ placementPoints: [1], killPoints: 1, rounds: 1, gamesPerRound: 13 })).toEqual(['Las partidas por ronda van de 1 a 12.']);
    expect(f({ placementPoints: [1], killPoints: 1, rounds: 1, gamesPerRound: 4, x: 1 })).toEqual(['Ajuste desconocido: br.x.']);
    expect(f(null)).toEqual(['Faltan los puntos del battle royale.']);
  });

  it('las claves que faltan se aceptan (todas son opcionales en la base)', () => {
    expect(validateSettings('valorant', '5v5', 'single_elim', 'teams', 16, {})).toEqual([]);
    expect(validateSettings('valorant', '5v5', 'single_elim', 'teams', 16, null)).toEqual(['Faltan los ajustes del torneo.']);
  });

  it('suplentes según el modo', () => {
    const rl1 = defaultSettings('rocket_league', '1v1', 'single_elim');
    expect(validateSettings('rocket_league', '1v1', 'single_elim', 'open', 8, { ...rl1, subs: 1 })).toEqual(['En este modo no hay suplentes.']);
    const wz = defaultSettings('warzone', 'trio', 'br');
    expect(validateSettings('warzone', 'trio', 'br', 'teams', 50, { ...wz, subs: 2 })).toEqual(['Los suplentes van de 0 a 1.']);
  });
});

describe('validateSettings: cruces (solo en el teléfono)', () => {
  it('modo, formato y entrada del juego', () => {
    const s = defaultSettings('valorant', '5v5', 'single_elim');
    expect(validateSettings('valorant', '3v3', 'single_elim', 'teams', 8, s)).toContain('VALORANT no se juega en 3 contra 3.');
    expect(validateSettings('valorant', '5v5', 'br', 'teams', 8, s)).toContain('«Battle royale» no es un formato de VALORANT.');
    const ff = defaultSettings('free_fire', 'squad', 'br');
    expect(validateSettings('free_fire', 'squad', 'single_elim', 'teams', 8, ff)).toContain('Free Fire es battle royale: el formato es «Battle royale».');
    const rl = defaultSettings('rocket_league', '1v1', 'single_elim');
    expect(validateSettings('rocket_league', '1v1', 'single_elim', 'teams', 8, rl)).toEqual(['En este modo cada quien se inscribe solo: la entrada es «Libre».']);
  });

  it('cupo dentro de los mínimos y máximos del formato', () => {
    const s = defaultSettings('valorant', '5v5', 'double_elim');
    expect(validateSettings('valorant', '5v5', 'double_elim', 'teams', 3, s)).toEqual(['Para doble eliminación hacen falta al menos 4.']);
    expect(validateSettings('valorant', '5v5', 'double_elim', 'teams', 129, s)).toEqual(['El cupo va de 4 a 128.']);
    expect(validateSettings('valorant', '5v5', 'round_robin', 'teams', 21, s)).toEqual(['El cupo va de 3 a 20.']);
    expect(validateSettings('valorant', '5v5', 'round_robin', 'teams', 2, s)).toEqual(['El cupo va de 3 a 20.']);
    expect(validateSettings('valorant', '5v5', 'single_elim', 'teams', 2, s)).toEqual([]);
    const ff = defaultSettings('free_fire', 'squad', 'br');
    expect(validateSettings('free_fire', 'squad', 'br', 'teams', 13, ff)).toEqual(['El cupo va de 2 a 12.']);
    expect(validateSettings('free_fire', 'solo', 'br', 'open', 48, { ...ff, subs: 0 })).toEqual([]);
  });

  it('grupos contra el cupo', () => {
    const s = defaultSettings('valorant', '5v5', 'groups_playoffs');
    const g = (patch: Record<string, unknown>, cap: number) => validateSettings('valorant', '5v5', 'groups_playoffs', 'teams', cap, { ...s, ...patch });
    expect(g({}, 8)).toEqual([]);
    expect(g({}, 5)).toEqual(['Cada grupo necesita al menos 3: con 2 grupos, el cupo tiene que ser de 6 o más.']);
    expect(g({ groups: 1, perGroup: 1 }, 8)).toEqual(['A los playoffs tienen que pasar al menos 2.']);
    expect(g({ groups: 8, perGroup: 4 }, 16)).toEqual(['Pasan 32 a los playoffs y el cupo es de 16.']);
    expect(g({ groups: 4, perGroup: 4 }, 20)).toEqual([]);
    expect(g({ groups: 4, perGroup: 4 }, 19)).toEqual(['Cada grupo necesita al menos 5: con 4 grupos, el cupo tiene que ser de 20 o más.']);
    expect(g({ groups: 1, perGroup: 2, playoffs: 'double' }, 8)).toEqual(['Para doble eliminación hacen falta al menos 4.']);
    expect(g({ groups: 2, perGroup: 2, playoffs: 'double' }, 8)).toEqual([]);
  });
});

describe('listas y textos', () => {
  it('formatos y entradas por juego', () => {
    expect(formatsFor('valorant')).toEqual(['single_elim', 'double_elim', 'groups_playoffs', 'round_robin']);
    expect(formatsFor('fortnite')).toEqual(['br']);
    expect(entryTypesFor('valorant', '5v5')).toEqual(['teams', 'open']);
    expect(entryTypesFor('rocket_league', '1v1')).toEqual(['open']);
    expect(entryTypesFor('ea_fc', '1v1')).toEqual(['open']);
    expect(entryTypesFor('pubg_mobile', 'solo')).toEqual(['open']);
    expect(entryTypesFor('pubg_mobile', 'squad')).toEqual(['teams', 'open']);
  });

  it('etiquetas', () => {
    expect(FORMAT_LABEL).toEqual({
      single_elim: 'Eliminación simple',
      double_elim: 'Doble eliminación',
      groups_playoffs: 'Grupos + playoffs',
      round_robin: 'Todos contra todos',
      br: 'Battle royale',
    } satisfies Record<Format, string>);
    expect(ENTRY_LABEL).toEqual({ teams: 'Solo equipos', open: 'Libre' });
  });
});
