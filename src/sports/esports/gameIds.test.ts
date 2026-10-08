import { describe, expect, it } from 'vitest';
import * as esports from '.';
import { GAME_IDS, idPlatforms, idRegions, normalizeGameId, OWNERSHIP_LABEL, RANK_SOURCE_LABEL, type GameId } from '.';

const ok = (game: GameId, raw: string, platform?: string) => normalizeGameId(game, raw, platform);

describe('normalizeGameId: los casos de §3.1 (los mismos que esp_normalize_id)', () => {
  it('riot: se parte en el último #, juntar espacios, solo ASCII baja', () => {
    expect(ok('valorant', 'Nombre#LAN')).toEqual({ display: 'Nombre#LAN', normalized: 'nombre#lan' });
    expect(ok('lol', '  Mi   Nombre#LAN1 ')).toEqual({ display: 'Mi Nombre#LAN1', normalized: 'mi nombre#lan1' });
    expect(ok('valorant', 'Ab#cd#TAG')).toEqual({ display: 'Ab#cd#TAG', normalized: 'ab#cd#tag' });
    expect(ok('valorant', 'Ñandú#LAN')).toEqual({ display: 'Ñandú#LAN', normalized: 'Ñandú#lan' });
    expect(ok('valorant', 'ÑANDÚ#LAN')).toEqual({ display: 'ÑANDÚ#LAN', normalized: 'ÑandÚ#lan' });
    expect(ok('valorant', 'Nombre')).toEqual({ error: 'Así no es un Riot ID: Nombre#LAN.' });
    expect(ok('valorant', 'Ab#LAN')).toEqual({ error: 'Así no es un Riot ID: Nombre#LAN.' });
    expect(ok('valorant', 'Nombre#LA')).toEqual({ error: 'Así no es un Riot ID: Nombre#LAN.' });
    expect(ok('valorant', 'Nombre#LAN123')).toEqual({ error: 'Así no es un Riot ID: Nombre#LAN.' });
    expect(ok('valorant', 'Nombre#LA-N')).toEqual({ error: 'Así no es un Riot ID: Nombre#LAN.' });
    expect(ok('valorant', 'A'.repeat(17) + '#LAN')).toEqual({ error: 'Así no es un Riot ID: Nombre#LAN.' });
  });

  it('steam: SteamID64 o código de amigo', () => {
    expect(ok('cs2', '76561197960287930')).toEqual({ display: '76561197960287930', normalized: '22202' });
    expect(ok('cs2', '22202')).toEqual({ display: '22202', normalized: '22202' });
    expect(ok('cs2', '7656 1197 9602 87930')).toEqual({ display: '76561197960287930', normalized: '22202' });
    expect(ok('cs2', '0022202')).toEqual({ display: '0022202', normalized: '22202' });
    expect(ok('cs2', '4294967295')).toEqual({ display: '4294967295', normalized: '4294967295' });
    expect(ok('cs2', '4294967296')).toEqual({ error: 'Así no es un Código de amigo de Steam: 22202.' });
    expect(ok('cs2', '12345678901')).toEqual({ error: 'Así no es un Código de amigo de Steam: 22202.' });
    expect(ok('cs2', '12345678901234567')).toEqual({ error: 'Así no es un Código de amigo de Steam: 22202.' });
    expect(ok('cs2', 'abc')).toEqual({ error: 'Así no es un Código de amigo de Steam: 22202.' });
    expect(ok('cs2', '0')).toEqual({ error: 'Así no es un Código de amigo de Steam: 22202.' });
  });

  it('mlbb: ID y zona', () => {
    expect(ok('mlbb', '12345678(1234)')).toEqual({ display: '12345678 (1234)', normalized: '12345678:1234' });
    expect(ok('mlbb', '12345678 1234')).toEqual({ display: '12345678 (1234)', normalized: '12345678:1234' });
    expect(ok('mlbb', '12345678 ( 1234 )')).toEqual({ display: '12345678 (1234)', normalized: '12345678:1234' });
    expect(ok('mlbb', '1234 (12)')).toEqual({ error: 'Así no es un ID y zona: 12345678 (1234).' });
    expect(ok('mlbb', '12345678 (123456)')).toEqual({ error: 'Así no es un ID y zona: 12345678 (1234).' });
  });

  it('epic: juntar espacios, 3–16, sin #', () => {
    expect(ok('rocket_league', 'Rocket  Man')).toEqual({ display: 'Rocket Man', normalized: 'rocket man' });
    expect(ok('fortnite', 'NinjaDR')).toEqual({ display: 'NinjaDR', normalized: 'ninjadr' });
    expect(ok('fortnite', 'ab')).toEqual({ error: 'Así no es un Epic ID: TuNombreEpic.' });
    expect(ok('fortnite', 'Ninja#1')).toEqual({ error: 'Así no es un Epic ID: TuNombreEpic.' });
  });

  it('ea', () => {
    expect(ok('ea_fc', 'Pro_Player.10')).toEqual({ display: 'Pro_Player.10', normalized: 'pro_player.10' });
    expect(ok('ea_fc', 'abc')).toEqual({ error: 'Así no es un EA ID: TuEAID.' });
    expect(ok('ea_fc', 'pro player')).toEqual({ error: 'Así no es un EA ID: TuEAID.' });
  });

  it('console (NBA 2K): plataforma obligatoria', () => {
    expect(ok('nba_2k', 'King  James23', 'psn')).toEqual({ display: 'King James23', normalized: 'king james23' });
    expect(ok('nba_2k', 'KingJames23')).toEqual({ error: 'Elige la plataforma.' });
    expect(ok('nba_2k', 'KingJames23', 'ps5')).toEqual({ error: 'Elige la plataforma.' });
    expect(ok('nba_2k', 'KJ', 'xbox')).toEqual({ error: 'Así no es un Usuario de la consola: TuUsuario.' });
  });

  it('buckler (SF6): 10 dígitos', () => {
    expect(ok('sf6', '1234 567 890')).toEqual({ display: '1234567890', normalized: '1234567890' });
    expect(ok('sf6', '123456789')).toEqual({ error: 'Así no es un User Code: 1234567890.' });
  });

  it('tekken: tres grupos de 4, con o sin guiones', () => {
    expect(ok('tekken8', 'Ab12-cD34-eF56')).toEqual({ display: 'Ab12-cD34-eF56', normalized: 'ab12cd34ef56' });
    expect(ok('tekken8', 'Ab12cD34eF56')).toEqual({ display: 'Ab12-cD34-eF56', normalized: 'ab12cd34ef56' });
    expect(ok('tekken8', 'Ab12 cD34 eF56')).toEqual({ display: 'Ab12-cD34-eF56', normalized: 'ab12cd34ef56' });
    expect(ok('tekken8', 'Ab12-cD34-eF5')).toEqual({ error: 'Así no es un TEKKEN ID: abcd-1234-efgh.' });
  });

  it('nintendo (Smash): SW, guiones y espacios fuera', () => {
    expect(ok('smash', 'SW-1234-5678-9012')).toEqual({ display: 'SW-1234-5678-9012', normalized: '123456789012' });
    expect(ok('smash', 'sw 1234 5678 9012')).toEqual({ display: 'SW-1234-5678-9012', normalized: '123456789012' });
    expect(ok('smash', '123456789012')).toEqual({ display: 'SW-1234-5678-9012', normalized: '123456789012' });
    expect(ok('smash', 'SW-1234-5678-901')).toEqual({ error: 'Así no es un Código de amigo: SW-1234-5678-9012.' });
  });

  it('cr (Clash Royale): sin # y en mayúsculas', () => {
    expect(ok('clash_royale', '#2pp')).toEqual({ display: '#2PP', normalized: '2pp' });
    expect(ok('clash_royale', ' 2PYLQGR ')).toEqual({ display: '#2PYLQGR', normalized: '2pylqgr' });
    expect(ok('clash_royale', '#2PA')).toEqual({ error: 'Así no es un Tag de jugador: #2PYLQGR.' });
    expect(ok('clash_royale', '#2P')).toEqual({ error: 'Así no es un Tag de jugador: #2PYLQGR.' });
  });

  it('digits: Free Fire 6–12, PUBG Mobile 5–12', () => {
    expect(ok('free_fire', '123 456 789')).toEqual({ display: '123456789', normalized: '123456789' });
    expect(ok('free_fire', '12345')).toEqual({ error: 'Así no es un ID de Free Fire: 123456789.' });
    expect(ok('pubg_mobile', '12345')).toEqual({ display: '12345', normalized: '12345' });
    expect(ok('pubg_mobile', '1234567890123')).toEqual({ error: 'Así no es un ID de personaje: 5123456789.' });
  });

  it('activision (Warzone): Nombre#1234567', () => {
    expect(ok('warzone', 'Ghost  Rider#1234567')).toEqual({ display: 'Ghost Rider#1234567', normalized: 'ghost rider#1234567' });
    expect(ok('warzone', 'Gh#1234')).toEqual({ display: 'Gh#1234', normalized: 'gh#1234' });
    expect(ok('warzone', 'Ghost#123')).toEqual({ error: 'Así no es un Activision ID: Nombre#1234567.' });
    expect(ok('warzone', 'G#1234')).toEqual({ error: 'Así no es un Activision ID: Nombre#1234567.' });
  });

  it('vacío: «Escribe tu …»', () => {
    for (const id of GAME_IDS) {
      const out = normalizeGameId(id, '   ', 'psn');
      expect(out).toHaveProperty('error');
      expect((out as { error: string }).error.startsWith('Escribe tu ')).toBe(true);
    }
    expect(ok('valorant', '')).toEqual({ error: 'Escribe tu Riot ID.' });
  });

  it('lo normalizado nunca lleva A–Z y mide 2–40', () => {
    const samples: [GameId, string, string?][] = [
      ['valorant', 'ABC DEF#XYZ'],
      ['cs2', '76561197960287930'],
      ['mlbb', '12345678 1234'],
      ['rocket_league', 'ROCKET'],
      ['ea_fc', 'ABCD'],
      ['nba_2k', 'ABC', 'switch'],
      ['sf6', '1234567890'],
      ['tekken8', 'ABCD-EFGH-IJKL'],
      ['smash', 'SW-1234-5678-9012'],
      ['clash_royale', '#ABC'.replace('A', '2').replace('B', 'P').replace('C', 'Y')],
      ['free_fire', '123456'],
      ['warzone', 'ABC#1234'],
    ];
    for (const [g, raw, p] of samples) {
      const out = normalizeGameId(g, raw, p);
      expect(out, `${g} ${raw}`).not.toHaveProperty('error');
      const n = (out as { normalized: string }).normalized;
      expect(n).not.toMatch(/[A-Z]/);
      expect(n.length).toBeGreaterThanOrEqual(2);
      expect(n.length).toBeLessThanOrEqual(40);
    }
  });
});

describe('plataformas, regiones y textos', () => {
  it('idPlatforms e idRegions', () => {
    expect(idPlatforms('nba_2k').map((p) => p.id)).toEqual(['psn', 'xbox', 'steam', 'switch']);
    expect(idPlatforms('valorant')).toEqual([]);
    expect(idRegions('valorant').map((r) => r.id)).toEqual(['latam', 'na', 'br', 'eu', 'ap', 'kr']);
    expect(idRegions('lol').map((r) => r.id)).toEqual(['la1', 'la2', 'na1', 'br1', 'euw1', 'eun1', 'kr', 'jp1', 'oc1']);
    expect(idRegions('free_fire').map((r) => r.id)).toEqual(['na', 'sa', 'br']);
    expect(idRegions('cs2')).toEqual([]);
  });

  it('etiquetas (sin código de prueba ni capturas)', () => {
    expect(OWNERSHIP_LABEL).toEqual({ declarado: 'Declarado', busqueda: 'Comprobado', login: 'Cuenta conectada' });
    expect(RANK_SOURCE_LABEL).toEqual({ declarado: 'Declarado', verificado: 'Verificado' });
    expect(esports).not.toHaveProperty('CHALLENGE_CODE');
  });
});
