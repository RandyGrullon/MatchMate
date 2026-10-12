import { describe, expect, it } from 'vitest';
import { GAMES } from './catalog';
import {
  GAME_PLATFORMS,
  defaultTournamentPlatform,
  idPlatforms,
  platformProblem,
  platformsText,
  tournamentPlatform,
  tournamentPlatformOptions,
} from './platforms';

describe('plataformas de los juegos', () => {
  it('cada juego del catálogo tiene sus plataformas', () => {
    for (const id of Object.keys(GAMES)) expect(GAME_PLATFORMS[id as keyof typeof GAME_PLATFORMS]?.length).toBeGreaterThan(0);
  });

  it('opciones y default del torneo: la única plataforma, o crossplay primero', () => {
    expect(tournamentPlatformOptions('valorant')).toEqual(['pc']);
    expect(defaultTournamentPlatform('valorant')).toBe('pc');
    expect(tournamentPlatformOptions('rocket_league')).toEqual(['crossplay', 'pc', 'playstation', 'xbox', 'switch']);
    expect(defaultTournamentPlatform('rocket_league')).toBe('crossplay');
    expect(defaultTournamentPlatform('ajedrez')).toBe('');
  });

  it('lo guardado: los valores viejos de NBA 2K y lo que no es de ese juego', () => {
    expect(tournamentPlatform('nba_2k', 'psn')).toBe('playstation');
    expect(tournamentPlatform('nba_2k', 'steam')).toBe('pc');
    expect(tournamentPlatform('nba_2k', 'switch')).toBe('switch');
    expect(tournamentPlatform('valorant', 'playstation')).toBe('pc');
    expect(tournamentPlatform('valorant', 'crossplay')).toBe('pc');
    expect(tournamentPlatform('fortnite', '')).toBe('crossplay');
  });

  it('dónde juega un ID: juego de una plataforma, clave de NBA 2K o lo que dijo', () => {
    expect(idPlatforms('cs2', { platform: '', platforms: [] })).toEqual(['pc']);
    expect(idPlatforms('nba_2k', { platform: 'psn', platforms: [] })).toEqual(['playstation']);
    expect(idPlatforms('rocket_league', { platform: '', platforms: ['xbox', 'pc', 'mobile'] })).toEqual(['xbox', 'pc']);
    expect(idPlatforms('rocket_league', null)).toEqual([]);
  });

  it('si el ID sirve para el torneo', () => {
    expect(platformProblem('rocket_league', 'crossplay', [])).toBeNull();
    expect(platformProblem('rocket_league', 'playstation', ['playstation', 'pc'])).toBeNull();
    expect(platformProblem('rocket_league', 'playstation', ['pc'])).toBe('otra_plataforma');
    expect(platformProblem('rocket_league', 'playstation', [])).toBe('sin_plataforma');
    expect(platformProblem('valorant', 'pc', [])).toBeNull();
  });

  it('en palabras', () => {
    expect(platformsText(['pc'])).toBe('PC');
    expect(platformsText(['playstation', 'xbox'])).toBe('PlayStation y Xbox');
    expect(platformsText(['pc', 'playstation', 'xbox'])).toBe('PC, PlayStation y Xbox');
  });
});
