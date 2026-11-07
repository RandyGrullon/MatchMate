/** El respaldo armado (lo que la web descarga y la app del teléfono comparte): el nombre y el JSON. */
import { describe, expect, it } from 'vitest';
import { backupFile, slug } from './backup';

describe('backupFile', () => {
  it('el nombre lleva la liga y el día; el JSON, la marca, la versión, cuándo y los datos', () => {
    const now = new Date(2026, 9, 12, 15, 30);
    const f = backupFile({ league: { id: 'L1', name: 'Liga de Ejemplo' }, players: [{ id: 'P1', name: 'Jugador Uno' }] }, slug('Liga de Ejemplo'), now);
    expect(f.name).toBe('matchmate-liga-de-ejemplo-2026-10-12.json');
    const data = JSON.parse(f.text) as Record<string, unknown>;
    expect(data).toMatchObject({ app: 'MatchMate', version: 2, exportedAt: now.toISOString(), players: [{ id: 'P1', name: 'Jugador Uno' }] });
  });

  it('el nombre sin tildes ni símbolos (y «liga» si no queda nada)', () => {
    expect(slug('Pádel  de los Jueves!')).toBe('padel-de-los-jueves');
    expect(slug('¡¿?!')).toBe('liga');
  });
});
