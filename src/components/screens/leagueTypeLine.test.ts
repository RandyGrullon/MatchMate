import { describe, expect, it } from 'vitest';
import { leagueTypeLine } from './leagueTypeLine';

describe('leagueTypeLine', () => {
  it('el deporte y si es liga pública, privada o torneo', () => {
    expect(leagueTypeLine('bowling', 'liga', 'public')).toBe('Boliche · Liga pública');
    expect(leagueTypeLine('bowling', 'liga', 'private')).toBe('Boliche · Liga privada');
    expect(leagueTypeLine('bowling', 'torneo', 'public')).toBe('Boliche · Torneo');
    expect(leagueTypeLine('deporte-que-no-existe', 'liga', 'private')).toBe('Liga privada');
  });
});
