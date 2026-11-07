/**
 * Lo puro del partido de equipos (matchView.ts, lo comparten la web y la app): el «•••» del admin según el estado, las
 * filas del W.O., la línea del orden del marcador y los avisos de la convocatoria. Datos ficticios.
 */
import { describe, expect, it } from 'vitest';
import { adminMenuEntries, convocatoriaLine, flaggedCalled, resultHint, walkoverRows } from './matchView';

const keys = (status: Parameters<typeof adminMenuEntries>[0]['status'], scheduledAt: string | null = '2026-11-08T23:00:00.000Z') =>
  adminMenuEntries({ status, scheduledAt }, { official: null, first: 'Equipo Uno' }).map((e) => e.key);

describe('adminMenuEntries', () => {
  it('por jugar: anotador, reprogramar, aplazar, W.O., poner resultado, anular y borrar', () => {
    expect(keys('scheduled')).toEqual(['anotador', 'reprogramar', 'aplazar', 'wo', 'corregir', 'anular', 'borrar']);
  });
  it('sin fecha dice «Poner fecha»; con resultado, «Corregir resultado» y sin W.O.', () => {
    expect(adminMenuEntries({ status: 'postponed', scheduledAt: null }, { official: null, first: 'Equipo Uno' }).find((e) => e.key === 'reprogramar')?.label).toBe('Poner fecha');
    const done = adminMenuEntries({ status: 'confirmed', scheduledAt: null }, { official: null, first: 'Equipo Uno' });
    expect(done.map((e) => e.key)).toEqual(['corregir', 'anular', 'borrar']);
    expect(done[0].label).toBe('Corregir resultado');
  });
  it('en disputa trae «Decidir el reclamo»; anulado no trae anular', () => {
    expect(keys('disputed')).toContain('resolver');
    expect(keys('void')).not.toContain('anular');
  });
});

describe('textos del partido', () => {
  it('W.O. en el orden de la web', () => {
    expect(walkoverRows(['Equipo Uno', 'Equipo Dos'])).toEqual([
      { absent: 1, label: 'No vino Equipo Uno' },
      { absent: 2, label: 'No vino Equipo Dos' },
      { absent: 0, label: 'No vino ninguno' },
    ]);
  });
  it('el orden del marcador', () => {
    expect(resultHint(['Equipo Uno', 'Equipo Dos'])).toBe('Primero Equipo Uno, después Equipo Dos. Queda confirmado.');
  });
  it('convocatoria: los avisados entre los que van y la línea con los que no van', () => {
    const flags = new Map([['j2', 'Suspendido']]);
    expect(flaggedCalled({ yes: ['j1', 'j2'], maybe: ['j3'] }, flags)).toEqual(['j2']);
    expect(flaggedCalled({ yes: ['j1'], maybe: [] }, undefined)).toEqual([]);
    expect(convocatoriaLine('3 van · faltan 2', 0)).toBe('3 van · faltan 2');
    expect(convocatoriaLine('3 van', 1)).toBe('3 van · 1 no va');
    expect(convocatoriaLine('3 van', 2)).toBe('3 van · 2 no van');
  });
});
