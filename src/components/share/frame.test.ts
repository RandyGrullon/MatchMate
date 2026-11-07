/**
 * Lo que va alrededor de la imagen para compartir (frame.ts): la fecha corta, el deporte y su color, el nombre del
 * archivo y el texto con el link (los mismos de ShareButton y ShareImageModal).
 */
import { describe, expect, it } from 'vitest';
import type { ShareResultSpec } from './cards';
import { shareDate, shareFrame, shareImageName, shareImageOf } from './frame';
import { sportColor } from './palette';

const NOW = new Date('2026-11-06T15:00:00.000Z');

const card: ShareResultSpec = {
  kind: 'result',
  title: 'Liga de Ejemplo',
  subtitle: 'Jornada 3',
  sides: [
    { name: 'Jugador Uno', winner: true, cells: [{ text: '6' }] },
    { name: 'Jugadora Dos', cells: [{ text: '4' }] },
  ],
};

describe('el marco de la imagen', () => {
  it('la fecha corta sin puntos ni «de»', () => {
    expect(shareDate(NOW, 'America/Santo_Domingo')).toBe('6 nov 2026');
  });

  it('el deporte, su color, la fecha y el link', () => {
    expect(shareFrame('padel', 'https://matchmate.grullonb.com/l/x', 'America/Santo_Domingo', NOW)).toEqual({
      sportLabel: 'Pádel',
      color: sportColor('padel'),
      date: '6 nov 2026',
      link: 'https://matchmate.grullonb.com/l/x',
    });
    // Sin deporte conocido: MatchMate.
    expect(shareFrame(null, undefined, undefined, NOW).sportLabel).toBe('MatchMate');
  });

  it('el nombre del archivo según lo que es', () => {
    expect(shareImageName(card, NOW)).toBe('resultado-liga-de-ejemplo-jornada-3-2026-11-06.png');
    expect(shareImageName({ kind: 'table', title: 'Tabla', subtitle: undefined }, NOW)).toBe('tabla-tabla-2026-11-06.png');
  });

  it('todo junto, con el texto y el link', () => {
    const out = shareImageOf(card, { sport: 'padel', url: 'https://matchmate.grullonb.com/l/x', now: NOW });
    expect(out.caption).toBe('Liga de Ejemplo · Jornada 3\nhttps://matchmate.grullonb.com/l/x');
    expect(out.filename).toBe('resultado-liga-de-ejemplo-jornada-3-2026-11-06.png');
    expect(out.frame.sportLabel).toBe('Pádel');
  });
});
