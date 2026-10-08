import { describe, expect, it } from 'vitest';
import {
  ALL_MODES,
  canVerifyId,
  canVerifyRank,
  GAME_IDS,
  GAME_KIND_LABEL,
  GAMES,
  gameMeta,
  gamesOfKind,
  isGameId,
  isIndividualMode,
  maxEntries,
  minEntries,
  modeLabel,
  modeOk,
  modeSize,
  LINK_PROVIDER_NAME,
  rosterLimits,
  teamMaxMembers,
  verifyKind,
  type GameId,
  type LinkProvider,
  type VerifyKind,
} from '.';

/** Contraste WCAG contra blanco. */
function contrastWithWhite(hex: string): number {
  const ch = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  return 1.05 / (L + 0.05);
}

describe('catálogo de juegos', () => {
  it('tiene los 15 juegos en el orden de §2.1', () => {
    expect(GAME_IDS).toEqual([
      'valorant',
      'cs2',
      'lol',
      'mlbb',
      'rocket_league',
      'ea_fc',
      'nba_2k',
      'sf6',
      'tekken8',
      'smash',
      'clash_royale',
      'free_fire',
      'fortnite',
      'warzone',
      'pubg_mobile',
    ]);
    expect(Object.keys(GAMES).sort()).toEqual(GAME_IDS.slice().sort());
    for (const id of GAME_IDS) expect(GAMES[id].id).toBe(id);
  });

  it('agrupa por kind en el orden de las listas', () => {
    expect(gamesOfKind('team').map((g) => g.id)).toEqual(['valorant', 'cs2', 'lol', 'mlbb', 'rocket_league']);
    expect(gamesOfKind('duel').map((g) => g.id)).toEqual(['ea_fc', 'nba_2k', 'sf6', 'tekken8', 'smash', 'clash_royale']);
    expect(gamesOfKind('br').map((g) => g.id)).toEqual(['free_fire', 'fortnite', 'warzone', 'pubg_mobile']);
    expect(GAME_KIND_LABEL).toEqual({ team: 'Por equipos', duel: '1 contra 1', br: 'Battle royale' });
  });

  it('cada color tiene contraste ≥ 4.5 con blanco y todos son distintos', () => {
    const colors = GAME_IDS.map((id) => GAMES[id].color);
    for (const c of colors) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastWithWhite(c), c).toBeGreaterThanOrEqual(4.5);
    }
    expect(new Set(colors).size).toBe(15);
  });

  it('monogramas de 2 a 4 y distintos; nombres y blurbs', () => {
    const monos = GAME_IDS.map((id) => GAMES[id].mono);
    for (const m of monos) expect(m.length).toBeGreaterThanOrEqual(2), expect(m.length).toBeLessThanOrEqual(4);
    expect(new Set(monos).size).toBe(15);
    expect(GAMES.valorant.blurb).toBe('5 contra 5 · mapas a 13 rondas');
    expect(GAMES.cs2.blurb).toBe('5 contra 5 · mapas a 13 (MR12)');
    expect(GAMES.rocket_league.blurb).toBe('Por goles · 1v1, 2v2 o 3v3');
    expect(GAMES.smash.blurb).toBe('1 contra 1 · por vidas');
    for (const id of ['free_fire', 'fortnite', 'warzone', 'pubg_mobile'] as GameId[]) expect(GAMES[id].blurb).toBe('Battle royale · puesto + kills');
  });

  it('defaultMode está en los modos; los duelos solo tienen 1v1', () => {
    for (const id of GAME_IDS) {
      const g = GAMES[id];
      expect(g.modes).toContain(g.defaultMode);
      for (const m of g.modes) expect(ALL_MODES).toContain(m);
      if (g.kind === 'duel') expect(g.modes).toEqual(['1v1']);
    }
    expect(GAMES.rocket_league.modes).toEqual(['1v1', '2v2', '3v3']);
    expect(GAMES.rocket_league.defaultMode).toBe('3v3');
    expect(GAMES.fortnite.defaultMode).toBe('duo');
    expect(GAMES.warzone.defaultMode).toBe('trio');
  });

  it('el mejor de por defecto está dentro de los permitidos; BR sin series', () => {
    for (const id of GAME_IDS) {
      const g = GAMES[id];
      if (g.kind === 'br') {
        expect(g.bestOf).toEqual([]);
        expect(g.defaultBestOf).toBeNull();
        expect(g.scoring).toBe('br');
        continue;
      }
      expect(g.defaultBestOf).not.toBeNull();
      for (const bo of Object.values(g.defaultBestOf!)) expect(g.bestOf).toContain(bo);
    }
    expect(GAMES.rocket_league.defaultBestOf).toEqual({ groups: 5, playoffs: 5, final: 7 });
    expect(GAMES.ea_fc.bestOf).toEqual([1, 3]);
    expect(GAMES.mlbb.bestOf).toEqual([1, 3, 5, 7]);
  });

  it('lobby y br solo en battle royale, con los números de §2.1', () => {
    for (const id of GAME_IDS) {
      const g = GAMES[id];
      if (g.kind === 'br') {
        expect(g.lobby).toBeDefined();
        expect(g.br).toBeDefined();
        for (const m of g.modes) expect(g.lobby![m]).toBeGreaterThan(1);
      } else {
        expect(g.lobby).toBeUndefined();
        expect(g.br).toBeUndefined();
      }
    }
    expect(GAMES.free_fire.lobby).toEqual({ solo: 48, duo: 24, squad: 12 });
    expect(GAMES.warzone.lobby).toEqual({ solo: 100, duo: 75, trio: 50, quad: 37 });
    expect(GAMES.free_fire.br).toEqual({ placementPoints: [12, 9, 8, 7, 6, 5, 4, 3, 2, 1], killPoints: 1 });
    expect(GAMES.fortnite.br!.placementPoints).toHaveLength(15);
    expect(GAMES.pubg_mobile.br!.placementPoints).toEqual([10, 6, 5, 4, 3, 2, 1, 1]);
  });

  it('las reglas propias de cada juego', () => {
    expect(GAMES.valorant.scoring).toBe('val');
    expect(GAMES.cs2.scoring).toBe('cs');
    expect(GAMES.lol.scoring).toBe('win');
    expect(GAMES.mlbb.scoring).toBe('win');
    expect(GAMES.rocket_league.scoring).toBe('goals_ot');
    expect(GAMES.ea_fc.scoring).toBe('goals_pen');
    expect(GAMES.nba_2k.scoring).toBe('points');
    expect(GAMES.sf6.roundsToWin).toEqual({ default: 2, options: [2] });
    expect(GAMES.tekken8.roundsToWin).toEqual({ default: 3, options: [2, 3] });
    expect(GAMES.smash.stocks).toEqual({ default: 3, min: 1, max: 5 });
    expect(GAMES.clash_royale.scoring).toBe('crowns');
    expect(GAMES.valorant.maps.map((m) => m.id)).toContain('corrode');
    expect(GAMES.cs2.maps.find((m) => m.id === 'dust2')?.name).toBe('Dust II');
    for (const id of GAME_IDS) {
      if (id !== 'valorant' && id !== 'cs2') expect(GAMES[id].maps).toEqual([]);
      for (const m of GAMES[id].maps) expect(m.id).toMatch(/^[a-z0-9_]{1,24}$/);
    }
  });

  it('IDs: plataformas y regiones', () => {
    expect(GAMES.valorant.idInfo.kind).toBe('riot');
    expect(GAMES.valorant.idInfo.defaultRegion).toBe('latam');
    expect(GAMES.lol.idInfo.defaultRegion).toBe('la1');
    expect(GAMES.nba_2k.idInfo.platforms.map((p) => p.id)).toEqual(['psn', 'xbox', 'steam', 'switch']);
    for (const id of GAME_IDS) {
      const info = GAMES[id].idInfo;
      if (id !== 'nba_2k') expect(info.platforms).toEqual([]);
      if (info.regions.length && info.defaultRegion) expect(info.regions.map((r) => r.id)).toContain(info.defaultRegion);
      for (const r of info.regions) expect(r.id).toMatch(/^[a-z0-9]{0,8}$/);
      // Sin código de prueba ni capturas.
      expect(info).not.toHaveProperty('proofHint');
      expect(GAMES[id]).not.toHaveProperty('autoCode');
    }
  });

  it('verificación solo donde es automática (la misma tabla que esp_verify_kind y esp_rank_verifiable)', () => {
    const table: Record<GameId, [VerifyKind, LinkProvider | null, boolean, boolean]> = {
      valorant: ['lookup', 'riot', true, false],
      cs2: ['login', 'steam', false, false],
      lol: ['lookup', 'riot', true, true],
      mlbb: ['none', null, false, false],
      rocket_league: ['login', 'epic', false, false],
      ea_fc: ['none', null, false, false],
      nba_2k: ['none', null, false, false],
      sf6: ['none', null, false, false],
      tekken8: ['none', null, false, false],
      smash: ['none', null, false, false],
      clash_royale: ['none', null, false, false],
      free_fire: ['none', null, false, false],
      fortnite: ['login', 'epic', false, false],
      warzone: ['none', null, false, false],
      pubg_mobile: ['none', null, false, false],
    };
    for (const id of GAME_IDS) {
      const [kind, link, lookup, rank] = table[id];
      expect([GAMES[id].verify, GAMES[id].link, GAMES[id].lookup], id).toEqual([{ kind, rank }, link, lookup]);
      expect(verifyKind(id), id).toBe(kind);
      expect(canVerifyId(id), id).toBe(kind !== 'none');
      expect(canVerifyRank(id), id).toBe(rank);
    }
    expect(GAME_IDS.filter((id) => GAMES[id].lookup)).toEqual(['valorant', 'lol']);
    expect(GAME_IDS.filter(canVerifyRank)).toEqual(['lol']);
    expect(GAME_IDS.filter((id) => verifyKind(id) === 'login')).toEqual(['cs2', 'rocket_league', 'fortnite']);
    expect(GAME_IDS.filter((id) => !canVerifyId(id))).toHaveLength(10);
    // Un juego que esta versión no conoce: sin verificación.
    expect(verifyKind('tetris' as GameId)).toBe('none');
    expect(canVerifyId('tetris' as GameId)).toBe(false);
    expect(canVerifyRank('tetris' as GameId)).toBe(false);
    expect(LINK_PROVIDER_NAME).toEqual({ steam: 'Steam', epic: 'Epic', riot: 'Riot' });
  });

  it('isGameId y gameMeta', () => {
    expect(isGameId('valorant')).toBe(true);
    expect(isGameId('toString')).toBe(false);
    expect(isGameId(3)).toBe(false);
    expect(gameMeta('cs2')?.name).toBe('Counter-Strike 2');
    expect(gameMeta('nope')).toBeNull();
    expect(gameMeta(null)).toBeNull();
    expect(gameMeta(undefined)).toBeNull();
  });

  it('modos: tamaño, individual y texto', () => {
    expect(modeSize('1v1')).toBe(1);
    expect(modeSize('solo')).toBe(1);
    expect(modeSize('duo')).toBe(2);
    expect(modeSize('trio')).toBe(3);
    expect(modeSize('squad')).toBe(4);
    expect(modeSize('quad')).toBe(4);
    expect(modeSize('5v5')).toBe(5);
    expect(isIndividualMode('1v1')).toBe(true);
    expect(isIndividualMode('solo')).toBe(true);
    expect(isIndividualMode('2v2')).toBe(false);
    expect(modeLabel('5v5')).toBe('5 contra 5');
    expect(modeLabel('squad')).toBe('Escuadras');
    expect(modeLabel('quad')).toBe('Escuadras');
    expect(modeLabel('duo')).toBe('Dúos');
    expect(modeOk('rocket_league', '2v2')).toBe(true);
    expect(modeOk('valorant', '3v3')).toBe(false);
  });

  it('rosterLimits y el máximo del equipo', () => {
    expect(rosterLimits('valorant', '5v5')).toEqual({ min: 5, max: 7, subsMax: 2 });
    expect(rosterLimits('valorant', '5v5', 1)).toEqual({ min: 5, max: 6, subsMax: 2 });
    expect(rosterLimits('valorant', '5v5', 9)).toEqual({ min: 5, max: 7, subsMax: 2 });
    expect(rosterLimits('valorant', '5v5', -3)).toEqual({ min: 5, max: 5, subsMax: 2 });
    expect(rosterLimits('rocket_league', '1v1')).toEqual({ min: 1, max: 1, subsMax: 0 });
    expect(rosterLimits('rocket_league', '3v3')).toEqual({ min: 3, max: 5, subsMax: 2 });
    expect(rosterLimits('warzone', 'trio')).toEqual({ min: 3, max: 4, subsMax: 1 });
    expect(rosterLimits('ea_fc', '1v1', 2)).toEqual({ min: 1, max: 1, subsMax: 0 });
    expect(teamMaxMembers('valorant')).toBe(7);
    expect(teamMaxMembers('rocket_league')).toBe(5);
    expect(teamMaxMembers('free_fire')).toBe(5);
    expect(teamMaxMembers('warzone')).toBe(5);
  });

  it('cupos por formato', () => {
    expect(maxEntries('free_fire', 'squad', 'br')).toBe(12);
    expect(maxEntries('fortnite', 'trio', 'br')).toBe(33);
    expect(maxEntries('valorant', '5v5', 'round_robin')).toBe(20);
    expect(maxEntries('valorant', '5v5', 'double_elim')).toBe(128);
    expect(maxEntries('ea_fc', '1v1', 'single_elim')).toBe(128);
    expect(minEntries('double_elim')).toBe(4);
    expect(minEntries('groups_playoffs')).toBe(4);
    expect(minEntries('round_robin')).toBe(3);
    expect(minEntries('single_elim')).toBe(2);
    expect(minEntries('br')).toBe(2);
  });
});
