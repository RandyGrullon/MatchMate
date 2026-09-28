import { describe, expect, it } from 'vitest';
import { resultShare, type ShareMatch } from './match';

const NOW = Date.parse('2026-09-27T20:00:00Z');

const match = (over: Partial<ShareMatch> = {}): ShareMatch => ({
  status: 'confirmed',
  score: { text: '6-4 3-6 7-6(5)' },
  winner: 1,
  walkoverSide: null,
  round: 3,
  court: 'Cancha 2',
  stage: '',
  proposedAt: null,
  scheduledAt: '2026-09-24T23:00:00Z',
  sides: [
    { side: 1, label: 'Ana / Luis' },
    { side: 2, label: 'Rosa / Pedro' },
  ],
  ...over,
});

describe('tarjeta de un partido para compartir', () => {
  it('por sets: un número por set, negrita al que ganó el set y el tie-break al que lo perdió', () => {
    const spec = resultShare(match(), { title: 'Liga del jueves', roundWord: 'Jornada', tz: 'America/Santo_Domingo', now: NOW });
    expect(spec.kind).toBe('result');
    expect(spec.big).toBe(false);
    expect(spec.status).toEqual({ label: 'Final', tone: 'accent' });
    expect(spec.subtitle).toMatch(/^Jornada 3 · Cancha 2 · .+/);
    const [a, b] = spec.sides;
    expect(a).toMatchObject({ name: 'Ana / Luis', winner: true });
    expect(b).toMatchObject({ name: 'Rosa / Pedro', winner: false });
    expect(a.cells).toEqual([
      { text: '6', strong: true },
      { text: '3', strong: false },
      { text: '7', strong: true },
    ]);
    expect(b.cells).toEqual([
      { text: '4', strong: false },
      { text: '6', strong: true },
      { text: '6', strong: false, sup: '5' },
    ]);
    expect(spec.note).toBeUndefined();
    // El texto que acompaña la imagen es el de siempre (sin el link, que se le pone al compartir).
    expect(spec.caption).toBe('Liga del jueves · Jornada 3 · Cancha 2\nGana Ana / Luis 6-4 3-6 7-6(5) a Rosa / Pedro');
  });

  it('un solo marcador (baloncesto, fútbol): números grandes, negrita al que ganó', () => {
    const spec = resultShare(match({ score: { text: '72-78' }, winner: 2, court: '', round: null, stage: 'Final', scheduledAt: null }), {
      title: 'Liga de baloncesto',
      sideExtra: (s) => ({ dot: s === 1 ? '#ff0000' : '#0000ff' }),
      now: NOW,
    });
    expect(spec.big).toBe(true);
    expect(spec.subtitle).toBe('Final');
    expect(spec.sides[0]).toMatchObject({ dot: '#ff0000', winner: false, cells: [{ text: '72', strong: false }] });
    expect(spec.sides[1]).toMatchObject({ dot: '#0000ff', winner: true, cells: [{ text: '78', strong: true }] });
  });

  it('los penales y la prórroga salen como nota, no como otra columna', () => {
    const spec = resultShare(match({ score: { text: '2-2 (pen. 4-3)' }, winner: 1 }), { title: 'Copa', now: NOW });
    expect(spec.big).toBe(true);
    expect(spec.sides[0].cells).toEqual([{ text: '2', strong: true }]);
    expect(spec.sides[1].cells).toEqual([{ text: '2', strong: false }]);
    expect(spec.note).toBe('Penales 4-3');
    expect(resultShare(match({ score: { text: '3-2 (pr.)' } }), { title: 'Copa', now: NOW }).note).toBe('Con prórroga');
  });

  it('sin texto usa los números del marcador', () => {
    const spec = resultShare(match({ score: { sides: [24, 18] }, winner: 1 }), { title: 'Americano', now: NOW });
    expect(spec.sides.map((s) => s.cells[0].text)).toEqual(['24', '18']);
  });

  it('W.O.: el que no vino dice «No se presentó» y sin marcador', () => {
    const spec = resultShare(match({ status: 'walkover', walkoverSide: 2, winner: 1, score: null }), { title: 'Liga', now: NOW });
    expect(spec.status?.label).toBe('W.O.');
    expect(spec.sides[0].sub).toBeUndefined();
    expect(spec.sides[1].sub).toBe('No se presentó');
    expect(spec.sides.every((s) => s.cells.length === 0)).toBe(true);
    const both = resultShare(match({ status: 'walkover', walkoverSide: 0, winner: null, score: null }), { title: 'Liga', now: NOW });
    expect(both.sides.map((s) => s.sub)).toEqual(['No se presentó', 'No se presentó']);
  });

  it('por confirmar y en vivo llevan su estado; sin nombre, «Por definir»', () => {
    const pending = resultShare(match({ status: 'finished', proposedAt: new Date(NOW - 3600_000).toISOString() }), { title: 'Liga', now: NOW });
    expect(pending.status).toEqual({ label: 'Por confirmar', tone: 'warn' });
    const live = resultShare(match({ status: 'live', winner: null, sides: [{ side: 1, label: '' }] }), { title: 'Liga', now: NOW });
    expect(live.status?.label).toBe('En vivo');
    expect(live.sides.map((s) => s.name)).toEqual(['Por definir', 'Por definir']);
  });
});
