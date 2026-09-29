import { describe, expect, it } from 'vitest';
import type { Season } from '../../../lib/seasons';
import { mkMatch } from './logic/testMatch';
import { racketSeasonMatches } from './seasonTable';

/**
 * De qué temporada es cada partido de raqueta (racketSeasonMatches): el día del evento (torneo, liga de parejas,
 * noches), el del partido en escaleras y cajas, y uno sin día en la activa. Una temporada cerrada no se lleva lo de
 * después de su cierre, ni la activa lo de antes de su inicio.
 */

type Range = Pick<Season, 'startsOn' | 'endsOn' | 'status'>;
const closed: Range = { startsOn: '2025-01-01', endsOn: '2025-12-31', status: 'closed' };
const active: Range = { startsOn: '2026-01-01', endsOn: '2026-06-30', status: 'active' };
const tz = 'America/Santo_Domingo';
const events = new Map([
  ['TOR25', { date: '2025-12-28', type: 'torneo' }],
  ['TOR26', { date: '2026-02-14', type: 'torneo' }],
  ['LAD', { date: '2025-11-20', type: 'escalera' }],
  ['BOX', { date: '2025-12-01', type: 'cajas' }],
]);

const matches = [
  // Torneo de diciembre con la final en enero: se queda entero en 2025 (el día del evento).
  mkMatch({ id: 'final25', eventId: 'TOR25', scheduledAt: '2026-01-04T20:00:00Z' }),
  mkMatch({ id: 'tor26', eventId: 'TOR26', scheduledAt: '2026-02-14T20:00:00Z' }),
  // Escalera creada en noviembre de 2025: cada reto por su propia fecha.
  mkMatch({ id: 'reto25', eventId: 'LAD', scheduledAt: '2025-12-10T23:00:00Z' }),
  mkMatch({ id: 'reto26', eventId: 'LAD', scheduledAt: '2026-03-10T23:00:00Z' }),
  // Cajas: sin fecha acordada, la del resultado confirmado; sin ninguna, la del evento.
  mkMatch({ id: 'caja26', eventId: 'BOX', confirmedAt: '2026-01-15T12:00:00Z' }),
  mkMatch({ id: 'cajaSinFecha', eventId: 'BOX' }),
  // Suelto sin fecha (recién creado): va en la activa.
  mkMatch({ id: 'suelto' }),
  // Suelto: las 02:00 UTC del 1 de enero todavía son el 31 de diciembre en Santo Domingo.
  mkMatch({ id: 'nochevieja', scheduledAt: '2026-01-01T02:00:00Z' }),
  // Después del fin previsto de la activa: la activa no tiene fin para contar juegos.
  mkMatch({ id: 'julio', scheduledAt: '2026-07-20T23:00:00Z' }),
];
const ids = (range: Range | null) => racketSeasonMatches(matches, range, events, tz).map((m) => m.id);

describe('partidos de raqueta por temporada', () => {
  it('una cerrada: lo de sus fechas (el torneo entero por su día; la escalera y las cajas por el de cada partido)', () => {
    expect(ids(closed)).toEqual(['final25', 'reto25', 'cajaSinFecha', 'nochevieja']);
  });

  it('la activa: lo de su inicio en adelante, y lo que todavía no tiene día', () => {
    expect(ids(active)).toEqual(['tor26', 'reto26', 'caja26', 'suelto', 'julio']);
  });

  it('una cerrada no se lleva lo que no tiene día; sin temporada, todo', () => {
    expect(ids(closed)).not.toContain('suelto');
    expect(ids(null)).toHaveLength(matches.length);
  });
});
