import { describe, expect, it } from 'vitest';
import {
  divisionLabel,
  GAME_IDS,
  LADDERS,
  RL_MMR_MIN,
  RL_MMR_SEASON,
  rankKeyFor,
  rankKeysOf,
  rankLabel,
  rankOrdinal,
  rlRankFromMmr,
  validateRank,
  validateRankMap,
} from '.';

describe('escaleras', () => {
  it('cada juego tiene su escalera de la forma de §2.5', () => {
    for (const id of GAME_IDS) expect(LADDERS[id]).toBeDefined();
    expect(LADDERS.cs2).toEqual({ kind: 'number', label: 'CS Rating', min: 0, max: 40000 });
    expect(LADDERS.clash_royale).toEqual({ kind: 'number', label: 'trofeos', min: 0, max: 15000 });
    expect(LADDERS.tekken8).toEqual({ kind: 'text' });
    expect(LADDERS.smash).toEqual({ kind: 'text' });
    expect(LADDERS.nba_2k).toEqual({ kind: 'text' });
    const rl = LADDERS.rocket_league;
    expect(rl.kind === 'tiers' && rl.perMode).toBe(true);
    expect(rl.kind === 'tiers' && rl.divWord).toBe('División');
    for (const id of GAME_IDS) {
      const l = LADDERS[id];
      if (l.kind !== 'tiers') continue;
      if (id !== 'rocket_league') expect(l.perMode).toBe(false), expect(l.divWord).toBe('');
      const ids = l.tiers.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const t of l.tiers) expect(t.id).toMatch(/^[a-z0-9_]{1,24}$/);
    }
  });

  it('los ids y divisiones de cada escalera', () => {
    const tiers = (id: (typeof GAME_IDS)[number]) => {
      const l = LADDERS[id];
      return l.kind === 'tiers' ? l.tiers.map((t) => `${t.id}:${t.divs}${t.divs ? t.order[0] : ''}`) : [];
    };
    expect(tiers('valorant')).toEqual(['iron:3a', 'bronze:3a', 'silver:3a', 'gold:3a', 'platinum:3a', 'diamond:3a', 'ascendant:3a', 'immortal:3a', 'radiant:0']);
    expect(tiers('lol')).toEqual(['iron:4d', 'bronze:4d', 'silver:4d', 'gold:4d', 'platinum:4d', 'emerald:4d', 'diamond:4d', 'master:0', 'grandmaster:0', 'challenger:0']);
    expect(tiers('mlbb')).toEqual([
      'warrior:3d',
      'elite:3d',
      'master:4d',
      'grandmaster:5d',
      'epic:5d',
      'legend:5d',
      'mythic:0',
      'mythical_honor:0',
      'mythical_glory:0',
      'mythical_immortal:0',
    ]);
    expect(tiers('rocket_league')).toHaveLength(22);
    expect(tiers('rocket_league')[0]).toBe('bronze1:4a');
    expect(tiers('rocket_league').slice(-2)).toEqual(['gc3:4a', 'ssl:0']);
    expect(tiers('free_fire')).toEqual(['bronze:3a', 'silver:3a', 'gold:4a', 'platinum:4a', 'diamond:4a', 'heroic:0', 'master:0', 'grandmaster:0']);
    expect(tiers('fortnite')).toEqual(['bronze:3a', 'silver:3a', 'gold:3a', 'platinum:3a', 'diamond:3a', 'elite:0', 'champion:0', 'unreal:0']);
    expect(tiers('warzone')).toEqual(['bronze:3a', 'silver:3a', 'gold:3a', 'platinum:3a', 'diamond:3a', 'crimson:3a', 'iridescent:0', 'top250:0']);
    expect(tiers('pubg_mobile')).toEqual([
      'bronze:5d',
      'silver:5d',
      'gold:5d',
      'platinum:5d',
      'diamond:5d',
      'crown:5d',
      'ace:0',
      'ace_master:0',
      'ace_dominator:0',
      'conqueror:0',
    ]);
    expect(tiers('ea_fc')).toEqual(['d10:0', 'd9:0', 'd8:0', 'd7:0', 'd6:0', 'd5:0', 'd4:0', 'd3:0', 'd2:0', 'd1:0', 'elite:0']);
    expect(tiers('sf6')).toEqual(['rookie:5a', 'iron:5a', 'bronze:5a', 'silver:5a', 'gold:5a', 'platinum:5a', 'diamond:5a', 'master:0']);
  });

  it('rankKeyFor: Rocket League por modo, el resto main', () => {
    expect(rankKeyFor('rocket_league', '1v1')).toBe('1v1');
    expect(rankKeyFor('rocket_league', '3v3')).toBe('3v3');
    expect(rankKeyFor('valorant', '5v5')).toBe('main');
    expect(rankKeyFor('free_fire', 'squad')).toBe('main');
    expect(rankKeysOf('rocket_league')).toEqual(['1v1', '2v2', '3v3']);
    expect(rankKeysOf('lol')).toEqual(['main']);
  });
});

describe('etiquetas', () => {
  it('como se lee en cada juego', () => {
    expect(rankLabel('valorant', { tier: 'diamond', div: 2 })).toBe('Diamante 2');
    expect(rankLabel('valorant', { tier: 'radiant' })).toBe('Radiante');
    expect(rankLabel('lol', { tier: 'gold', div: 4 })).toBe('Oro IV');
    expect(rankLabel('lol', { tier: 'challenger' })).toBe('Retador');
    expect(rankLabel('rocket_league', { tier: 'gc2', div: 3 })).toBe('Gran Campeón II · Div. III');
    expect(rankLabel('rocket_league', { tier: 'ssl' })).toBe('Supersonic Legend');
    expect(rankLabel('cs2', { value: 1245 })).toBe('1.245 CS Rating');
    expect(rankLabel('cs2', { value: 980 })).toBe('980 CS Rating');
    expect(rankLabel('clash_royale', { value: 7320 })).toBe('7.320 trofeos');
    expect(rankLabel('pubg_mobile', { tier: 'crown', div: 5 })).toBe('Corona V');
    expect(rankLabel('sf6', { tier: 'gold', div: 3 })).toBe('Oro ★3');
    expect(rankLabel('ea_fc', { tier: 'd3' })).toBe('División 3');
    expect(rankLabel('tekken8', { text: 'Tekken King' })).toBe('Tekken King');
    expect(rankLabel('valorant', null)).toBe('');
    expect(rankLabel('valorant', undefined)).toBe('');
    expect(rankLabel('valorant', { tier: 'unknown' })).toBe('unknown');
  });

  it('divisionLabel', () => {
    expect(divisionLabel('valorant', 3)).toBe('3');
    expect(divisionLabel('sf6', 5)).toBe('★5');
    expect(divisionLabel('lol', 2)).toBe('II');
    expect(divisionLabel('rocket_league', 4)).toBe('IV');
  });
});

describe('ordinal', () => {
  it('escalera de tiers: índice × 10 + d', () => {
    // VALORANT asc: Hierro 1 = 0, Hierro 3 = 2, Bronce 1 = 10, Radiante = 80.
    expect(rankOrdinal('valorant', { tier: 'iron', div: 1 })).toBe(0);
    expect(rankOrdinal('valorant', { tier: 'iron', div: 3 })).toBe(2);
    expect(rankOrdinal('valorant', { tier: 'bronze', div: 1 })).toBe(10);
    expect(rankOrdinal('valorant', { tier: 'radiant' })).toBe(80);
    // LoL desc: IV es la más baja (d = 0), I la más alta (d = 3).
    expect(rankOrdinal('lol', { tier: 'gold', div: 4 })).toBe(30);
    expect(rankOrdinal('lol', { tier: 'gold', div: 1 })).toBe(33);
    expect(rankOrdinal('lol', { tier: 'master' })).toBe(70);
    // PUBG desc con 5: V = 0, I = 4.
    expect(rankOrdinal('pubg_mobile', { tier: 'crown', div: 5 })).toBe(50);
    expect(rankOrdinal('pubg_mobile', { tier: 'crown', div: 1 })).toBe(54);
    // Rocket League: Bronce I div. I = 0; SSL = 210.
    expect(rankOrdinal('rocket_league', { tier: 'bronze1', div: 1 })).toBe(0);
    expect(rankOrdinal('rocket_league', { tier: 'gc3', div: 4 })).toBe(203);
    expect(rankOrdinal('rocket_league', { tier: 'ssl' })).toBe(210);
    expect(rankOrdinal('ea_fc', { tier: 'd10' })).toBe(0);
    expect(rankOrdinal('ea_fc', { tier: 'elite' })).toBe(100);
  });

  it('mayor = mejor dentro del mismo juego', () => {
    const order = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond'].flatMap((t) => [4, 3, 2, 1].map((div) => rankOrdinal('lol', { tier: t, div })!));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
    expect(rankOrdinal('lol', { tier: 'master' })!).toBeGreaterThan(rankOrdinal('lol', { tier: 'diamond', div: 1 })!);
  });

  it('numérica: el número; texto o desconocido: null', () => {
    expect(rankOrdinal('cs2', { value: 15000 })).toBe(15000);
    expect(rankOrdinal('clash_royale', { value: 0 })).toBe(0);
    expect(rankOrdinal('smash', { text: 'Elite' })).toBeNull();
    expect(rankOrdinal('valorant', { tier: 'nope' })).toBeNull();
    expect(rankOrdinal('valorant', null)).toBeNull();
    expect(rankOrdinal('cs2', { tier: 'gold' })).toBeNull();
  });
});

describe('validateRank', () => {
  it('acepta rangos buenos', () => {
    expect(validateRank('valorant', 'main', { tier: 'diamond', div: 2 })).toBeNull();
    expect(validateRank('valorant', 'main', { tier: 'radiant' })).toBeNull();
    expect(validateRank('lol', 'main', { tier: 'emerald', div: 4 })).toBeNull();
    expect(validateRank('rocket_league', '2v2', { tier: 'champion1', div: 3, mmr: 1130 })).toBeNull();
    expect(validateRank('rocket_league', '1v1', { tier: 'ssl', mmr: -100 })).toBeNull();
    expect(validateRank('cs2', 'main', { value: 40000 })).toBeNull();
    expect(validateRank('clash_royale', 'main', { value: 0 })).toBeNull();
    expect(validateRank('nba_2k', 'main', { text: 'Superstar' })).toBeNull();
    expect(validateRank('mlbb', 'main', { tier: 'legend', div: 5 })).toBeNull();
  });

  it('rechaza con mensaje en español', () => {
    expect(validateRank('valorant', '3v3', { tier: 'gold', div: 1 })).toBe('VALORANT no tiene rango para ese modo.');
    expect(validateRank('rocket_league', 'main', { tier: 'gold1', div: 1 })).toBe('Rocket League no tiene rango para ese modo.');
    expect(validateRank('valorant', 'main', null)).toBe('Elige tu rango.');
    expect(validateRank('valorant', 'main', { tier: 'mythic' })).toBe('Ese rango no existe en VALORANT.');
    expect(validateRank('valorant', 'main', { tier: 'gold' })).toBe('Elige la división.');
    expect(validateRank('valorant', 'main', { tier: 'gold', div: 4 })).toBe('La división va de 1 a 3.');
    expect(validateRank('valorant', 'main', { tier: 'gold', div: 1.5 })).toBe('La división va de 1 a 3.');
    expect(validateRank('valorant', 'main', { tier: 'radiant', div: 1 })).toBe('Radiante no tiene división.');
    expect(validateRank('valorant', 'main', { tier: 'gold', div: 1, mmr: 50 })).toBe('VALORANT no lleva MMR.');
    expect(validateRank('rocket_league', '3v3', { tier: 'gold1', div: 1, mmr: 3001 })).toBe('El MMR va de −100 a 3000.');
    expect(validateRank('valorant', 'main', { tier: 'gold', div: 1, extra: 1 })).toBe('Elige tu rango.');
    expect(validateRank('cs2', 'main', { value: 40001 })).toBe('CS Rating: de 0 a 40.000.');
    expect(validateRank('clash_royale', 'main', { value: -1 })).toBe('Trofeos: de 0 a 15.000.');
    expect(validateRank('cs2', 'main', { tier: 'gold' })).toBe('CS Rating: de 0 a 40.000.');
    expect(validateRank('smash', 'main', { text: '' })).toBe('Escribe tu rango (hasta 24 letras).');
    expect(validateRank('smash', 'main', { text: 'x'.repeat(25) })).toBe('Escribe tu rango (hasta 24 letras).');
    expect(validateRank('smash', 'main', { value: 3 })).toBe('Escribe tu rango.');
  });

  it('validateRankMap revisa cada clave', () => {
    expect(validateRankMap('rocket_league', { '1v1': { tier: 'gold1', div: 2 }, '3v3': { tier: 'ssl' } })).toBeNull();
    expect(validateRankMap('rocket_league', { '3v3': { tier: 'gold4', div: 1 } })).toBe('Ese rango no existe en Rocket League.');
    expect(validateRankMap('valorant', {})).toBeNull();
    expect(validateRankMap('valorant', [])).toBe('Elige tu rango.');
  });
});

describe('MMR de Rocket League', () => {
  it('los datos de la temporada', () => {
    expect(RL_MMR_SEASON).toBe('2026-10');
    for (const mode of ['1v1', '2v2', '3v3'] as const) {
      const t = RL_MMR_MIN[mode];
      expect(Object.keys(t)).toHaveLength(22);
      expect(t.ssl).toHaveLength(1);
      expect(t.bronze1[0]).toBe(-100);
      for (const [tier, mins] of Object.entries(t)) if (tier !== 'ssl') expect(mins).toHaveLength(4);
    }
    expect(RL_MMR_MIN['3v3'].ssl).toEqual([1868]);
    expect(RL_MMR_MIN['1v1'].champion3).toEqual([1100, 1120, 1100, 1100]);
  });

  it('los ejemplos de §2.6', () => {
    expect(rlRankFromMmr('3v3', 1900)).toEqual({ tier: 'ssl' });
    expect(rlRankFromMmr('3v3', 1650)).toEqual({ tier: 'gc2', div: 3 });
    expect(rlRankFromMmr('3v3', 1600)).toEqual({ tier: 'gc2', div: 2 });
    expect(rlRankFromMmr('3v3', 990)).toEqual({ tier: 'diamond3', div: 4 });
    expect(rlRankFromMmr('1v1', 1110)).toEqual({ tier: 'champion3', div: 4 });
    expect(rlRankFromMmr('2v2', 0)).toEqual({ tier: 'bronze1', div: 1 });
  });

  it('bordes', () => {
    expect(rlRankFromMmr('3v3', 1868)).toEqual({ tier: 'ssl' });
    expect(rlRankFromMmr('3v3', 1867)).toEqual({ tier: 'gc3', div: 4 });
    expect(rlRankFromMmr('2v2', -500)).toEqual({ tier: 'bronze1', div: 1 });
    expect(rlRankFromMmr('2v2', 3000)).toEqual({ tier: 'ssl' });
    expect(rlRankFromMmr('1v1', 1353)).toEqual({ tier: 'ssl' });
    expect(rlRankFromMmr('1v1', 155)).toEqual({ tier: 'bronze2', div: 1 });
    // Lo que da siempre es un rango válido de la escalera.
    for (const mode of ['1v1', '2v2', '3v3'] as const) {
      for (let mmr = -100; mmr <= 2100; mmr += 37) expect(validateRank('rocket_league', mode, rlRankFromMmr(mode, mmr))).toBeNull();
    }
  });
});
