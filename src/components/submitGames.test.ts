/** «Enviar mis juegos» sin pantalla (submitGames.ts): los eventos de «¿Dónde jugaste?», con cuál se abre y «Otro día». */
import { describe, expect, it } from 'vitest';
import type { BowlingEvent } from '../lib/types';
import { BY_DATE, byDateCheck, byDateHint, openingEventId, padded, submitEventChoices } from './submitGames';

const ev = (id: string, date: string, type: 'practica' | 'torneo' = 'practica') => ({ id, date, type, name: '', games: 3 }) as unknown as BowlingEvent;
const NOW = new Date(2026, 10, 7, 12, 0).getTime();

describe('submitGames', () => {
  const events = [ev('hoy', '2026-11-07'), ev('ayer', '2026-11-06'), ev('vieja', '2026-11-01'), ev('antigua', '2026-01-02'), ev('copa', '2026-11-03', 'torneo')];

  it('«¿Dónde jugaste?»: lo reciente, sin las prácticas ya cerradas (el admin las ve todas)', () => {
    const ids = (isAdmin: boolean, mine: string[] = []) =>
      submitEventChoices({ events, myEntries: mine.map((eventId) => ({ eventId })), leagueToday: '2026-11-07', isAdmin, now: NOW }).map((e) => e.id);
    expect(ids(false)).toEqual(['hoy', 'ayer', 'copa']);
    expect(ids(true)).toEqual(['hoy', 'ayer', 'vieja', 'copa']);
    expect(ids(true, ['antigua'])).toEqual(['hoy', 'ayer', 'vieja', 'antigua', 'copa']);
  });

  it('se abre en el pedido, en el último borrador o en el más reciente ya jugado', () => {
    const recent = [ev('manana', '2026-11-08'), ev('hoy', '2026-11-07'), ev('ayer', '2026-11-06')];
    expect(openingEventId(recent, { preferEventId: 'ayer', lastDraftEventId: 'hoy', today: '2026-11-07' })).toBe('ayer');
    expect(openingEventId(recent, { lastDraftEventId: 'ayer', today: '2026-11-07' })).toBe('ayer');
    expect(openingEventId(recent, { lastDraftEventId: BY_DATE, today: '2026-11-07' })).toBe(BY_DATE);
    expect(openingEventId(recent, { today: '2026-11-07' })).toBe('hoy');
    expect(openingEventId([], { today: '2026-11-07' })).toBe(BY_DATE);
  });

  it('«Otro día»: hasta ayer para quien no es admin, y lo que ya hay ese día', () => {
    const base = { today: '2026-11-07', leagueToday: '2026-11-07', events };
    expect(byDateCheck({ ...base, date: '2026-11-06', isAdmin: false })).toMatchObject({ ok: true, closed: false });
    expect(byDateCheck({ ...base, date: '2026-11-04', isAdmin: false })).toMatchObject({ ok: false, closed: true });
    expect(byDateCheck({ ...base, date: '2026-11-04', isAdmin: true })).toMatchObject({ ok: true, closed: false });
    expect(byDateCheck({ ...base, date: '2026-11-09', isAdmin: true }).ok).toBe(false);
    expect(byDateCheck({ ...base, date: '2026-11-03', isAdmin: true }).sameDay?.id).toBe('copa');
    expect(byDateHint(true, null)).toBe('Ese día ya cerró: tú envías los juegos de hoy o de ayer. Para otro día, pídeselo al admin.');
    expect(byDateHint(false, 'Torneo 2026')).toBe('Ese día hay Torneo 2026; el admin pondrá tus juegos ahí.');
    expect(byDateHint(false, null)).toBe('El admin pondrá tus juegos en la práctica de ese día (se crea si no existe).');
  });

  it('los juegos del borrador, con al menos los del evento', () => {
    expect(padded(['180'], 3)).toEqual(['180', '', '']);
    expect(padded(['1', '2', '3', '4'], 3)).toHaveLength(4);
    expect(padded(undefined)).toEqual(['', '', '']);
  });
});
