import { describe, expect, it } from 'vitest';
import { BLOCKED_MESSAGE } from './backend/errors';
import { BackendError } from './backend/types';
import { uuidv7 } from './db/ids';
import { LOGO_SIDE, logoCrop } from './image';
import { isLogoPathOf, LOGO_BUCKET, logoErrorText, logoPath } from './logos';

/** Lo que exigen el CHECK de leagues.logo_path, set_league_logo y la política de subir (con el punto escapado). */
const dbPattern = (lid: string) => new RegExp(`^${lid}/[0-9a-f-]{36}\\.(webp|jpg|png)$`);

describe('logo de la liga: la ruta', () => {
  const lid = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

  it('va en el bucket público logos, en la carpeta de la liga, con un id nuevo y la extensión del tipo', () => {
    expect(LOGO_BUCKET).toBe('logos');
    const id = uuidv7();
    const webp = logoPath(lid, id, 'image/webp');
    expect(webp).toBe(`${lid}/${id}.webp`);
    expect(logoPath(lid, id, 'image/jpeg')).toBe(`${lid}/${id}.jpg`);
    expect(webp).toMatch(dbPattern(lid));
    expect(logoPath(lid, id, 'image/jpeg')).toMatch(dbPattern(lid));
  });

  it('siempre en minúsculas (la base compara con id::text)', () => {
    const path = logoPath(lid.toUpperCase(), 'ABCDEF01-2345-7678-89AB-CDEF01234567', 'image/webp');
    expect(path).toBe(`${lid}/abcdef01-2345-7678-89ab-cdef01234567.webp`);
    expect(path).toMatch(dbPattern(lid));
  });

  it('reconoce la ruta de un logo de esa liga (y no la de otra ni una rara)', () => {
    const id = uuidv7();
    expect(isLogoPathOf(lid, `${lid}/${id}.webp`)).toBe(true);
    expect(isLogoPathOf(lid, `${lid}/${id}.png`)).toBe(true);
    expect(isLogoPathOf(lid.toUpperCase(), `${lid}/${id}.jpg`)).toBe(true);
    expect(isLogoPathOf(lid, `${uuidv7()}/${id}.webp`)).toBe(false);
    expect(isLogoPathOf(lid, `${lid}/${id}.gif`)).toBe(false);
    expect(isLogoPathOf(lid, `${lid}/logo.webp`)).toBe(false);
    expect(isLogoPathOf(lid, `${lid}/${id}xwebp`)).toBe(false);
    expect(isLogoPathOf(lid, `${lid}/sub/${id}.webp`)).toBe(false);
    expect(isLogoPathOf(lid, null)).toBe(false);
    expect(isLogoPathOf(lid, '')).toBe(false);
  });
});

describe('logo de la liga: el recorte', () => {
  it('toma el cuadrado del centro de una foto acostada', () => {
    expect(logoCrop(1200, 800)).toEqual({ sx: 200, sy: 0, crop: 800, side: LOGO_SIDE });
  });

  it('y de una parada', () => {
    expect(logoCrop(600, 1000)).toEqual({ sx: 0, sy: 200, crop: 600, side: 256 });
  });

  it('una cuadrada entera; con lados impares, sin medios píxeles', () => {
    expect(logoCrop(512, 512)).toEqual({ sx: 0, sy: 0, crop: 512, side: 256 });
    expect(logoCrop(301, 200)).toEqual({ sx: 50, sy: 0, crop: 200, side: 256 });
  });

  it('siempre sale de 256 × 256 (también si la imagen es más chica), o del lado pedido', () => {
    expect(logoCrop(64, 48).side).toBe(256);
    expect(logoCrop(64, 48)).toMatchObject({ sx: 8, sy: 0, crop: 48 });
    expect(logoCrop(1000, 1000, 128).side).toBe(128);
  });

  it('una imagen vacía no rompe la cuenta', () => {
    expect(logoCrop(0, 0)).toEqual({ sx: 0, sy: 0, crop: 1, side: 256 });
  });
});

describe('logo de la liga: los errores en palabras simples', () => {
  it('cada caso', () => {
    expect(logoErrorText(new BackendError('No se pudo abrir esa imagen.', 'validation', 'imagen'))).toBe(
      'No se pudo abrir esa imagen. Prueba con otra (JPG, PNG o WebP).',
    );
    expect(logoErrorText(new BackendError('rate_limited', 'rate_limited', 'P0001'))).toBe('Cambiaste el logo muchas veces hoy. Prueba mañana.');
    expect(logoErrorText(new BackendError('no_permitido', 'permission', 'P0001'))).toBe('Solo el dueño o un admin puede cambiar el logo de la liga.');
    expect(logoErrorText(new BackendError('new row violates row-level security policy', 'permission', '403'), 'torneo')).toBe(
      'Solo el dueño o un admin puede cambiar el logo del torneo.',
    );
    expect(logoErrorText(new BackendError('no_existe', 'not_found', 'P0001'))).toBe('Esa liga ya no existe.');
    expect(logoErrorText(new BackendError('no_existe', 'not_found', 'P0001'), 'torneo')).toBe('Ese torneo ya no existe.');
    expect(logoErrorText(new BackendError('Failed to fetch', 'network'))).toBe('Sin conexión. Prueba otra vez cuando tengas señal.');
    expect(logoErrorText(new BackendError('bloqueada', 'permission', 'bloqueada'))).toBe(BLOCKED_MESSAGE);
    expect(logoErrorText(new Error('algo raro'))).toBe('No se pudo cambiar el logo. Prueba otra vez.');
  });
});
