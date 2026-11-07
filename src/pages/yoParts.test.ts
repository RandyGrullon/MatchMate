/** Yo sin pantallas (yoParts.ts): las partes, las líneas de las filas y la de tu nombre. Datos ficticios. */
import { describe, expect, it } from 'vitest';
import { badgeLinkId, identityLine, mainLeagueId, postsLine, showsBowling, socialIsEmpty, socialLine, yoPart } from './yoParts';

describe('yoParts.ts', () => {
  it('yoPart: solo las cuatro partes de Yo', () => {
    expect(yoPart('juegos')).toBe('juegos');
    expect(yoPart('insignias')).toBe('insignias');
    expect(yoPart('otra')).toBeNull();
    expect(yoPart(undefined)).toBeNull();
  });

  it('las líneas: publicaciones, tu nombre y tus seguidores', () => {
    expect(postsLine(0)).toBe('Comparte cómo te fue');
    expect(postsLine(1)).toBe('1 publicación');
    const leagues = [
      { id: 'a', name: 'Liga de Ejemplo' },
      { id: 'b', name: 'Liga de los Jueves' },
    ];
    expect(identityLine('jugadoruno', leagues, 'b')).toBe('@jugadoruno · Liga de los Jueves y 1 más');
    expect(identityLine(null, [])).toBeNull();
    expect(socialLine({ followers: 1, following: 2, likesReceived: 0 })).toBe('1 seguidor · 2 siguiendo');
    expect(socialLine(null)).toBe('Buscar personas');
    expect(socialIsEmpty({ followers: 0, following: 0, likesReceived: 0 })).toBe(true);
    expect(socialIsEmpty({ followers: 0, following: 0, likesReceived: 3 })).toBe(false);
  });

  it('showsBowling: con boliche, con juegos sueltos o sin ligas de otro deporte', () => {
    expect(showsBowling(1, 2, 0)).toBe(true);
    expect(showsBowling(0, 0, 0)).toBe(true);
    expect(showsBowling(0, 1, 2)).toBe(true);
    expect(showsBowling(0, 1, 0)).toBe(false);
  });

  it('mainLeagueId y badgeLinkId', () => {
    expect(mainLeagueId({ status: 'loading' })).toBeNull();
    const stats = (games: number) => ({ games }) as never;
    const data = { perLeague: [{ lid: 'a', name: 'Liga de Ejemplo', stats: stats(0) }, { lid: 'b', name: 'Liga de los Jueves', stats: stats(4) }] } as never;
    expect(mainLeagueId({ status: 'ready', data })).toBe('b');
    expect(badgeLinkId('?tab=insignias&insignia=aw%201')).toBe('aw 1');
    expect(badgeLinkId('?tab=insignias')).toBeNull();
  });
});
