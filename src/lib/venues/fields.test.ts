import { describe, expect, it } from 'vitest';
import { SPORT_IDS } from '../../sports/registry';
import { cleanVenueDetails, venueDetailsLines, venueFields } from './fields';

describe('campos de un espacio según el deporte', () => {
  it('cada deporte de la app tiene sus campos, con claves únicas y lo obligatorio con sentido', () => {
    for (const sport of SPORT_IDS) {
      const fields = venueFields(sport);
      expect(fields.length, sport).toBeGreaterThan(0);
      expect(new Set(fields.map((f) => f.key)).size, sport).toBe(fields.length);
      expect(fields.some((f) => f.required), sport).toBe(true);
      for (const f of fields) if (f.kind === 'choice') expect(f.options?.length, `${sport}.${f.key}`).toBeGreaterThan(1);
    }
    expect(venueFields('curling')).toEqual([]);
  });

  it('limpia lo llenado: números en su rango, una opción válida, sí/no; lo vacío y lo ajeno se van', () => {
    expect(cleanVenueDetails('padel', { canchas: '6', paredes: 'cristal', superficie: '', techada: true, iluminacion: false, piscina: true })).toEqual({
      ok: true,
      details: { canchas: 6, paredes: 'cristal', techada: true },
    });
    expect(cleanVenueDetails('padel', { canchas: 0 })).toMatchObject({ ok: false, field: 'canchas' });
    expect(cleanVenueDetails('padel', { canchas: 2.5 })).toMatchObject({ ok: false, field: 'canchas' });
    expect(cleanVenueDetails('padel', { canchas: 41 })).toMatchObject({ ok: false, field: 'canchas', message: 'Canchas: un número de 1 a 40.' });
    expect(cleanVenueDetails('padel', { canchas: 2, paredes: 'vidrio' })).toMatchObject({ ok: false, field: 'paredes' });
    expect(cleanVenueDetails('padel', { canchas: 2, techada: 'sí' })).toMatchObject({ ok: false, field: 'techada' });
    expect(cleanVenueDetails('padel', {})).toMatchObject({ ok: false, field: 'canchas', message: 'Falta: canchas.' });
    expect(cleanVenueDetails('football', { campos: 1 })).toMatchObject({ ok: false, field: 'formato' });
    expect(cleanVenueDetails('golf', { hoyos: '18', par: 72 })).toEqual({ ok: true, details: { hoyos: '18', par: 72 } });
    expect(cleanVenueDetails('curling', { canchas: 1 })).toMatchObject({ ok: false, field: 'deporte' });
  });

  it('lo llenado en palabras para la ficha', () => {
    expect(venueDetailsLines('padel', { canchas: 6, paredes: 'cristal', superficie: 'cesped', techada: true, iluminacion: true })).toEqual([
      '6 canchas',
      'Cristal',
      'Césped artificial',
      'Techada',
      'Iluminación para jugar de noche',
    ]);
    expect(venueDetailsLines('bowling', { pistas: 1, zapatos: true })).toEqual(['1 pista', 'Alquiler de zapatos']);
    expect(venueDetailsLines('table_tennis', { mesas: 1 })).toEqual(['1 mesa']);
    expect(venueDetailsLines('esports', { estaciones: 1 })).toEqual(['1 estación de juego']);
    expect(venueDetailsLines('golf', { hoyos: '18', par: 72, practica: false })).toEqual(['18 hoyos', 'Par 72']);
    expect(venueDetailsLines('padel', { canchas: 'seis', paredes: 'vidrio', techada: 'sí' })).toEqual([]);
    expect(venueDetailsLines('padel', null)).toEqual([]);
  });
});
