import { describe, expect, it } from 'vitest';
import { buildLeagueSchedule, clashText, parseLeagueConfig, type ScheduleEntrant } from './league';
import { addDays, localParts, timeLabel, todayIn, zonedIso } from './time';
import { mkMatch } from './testMatch';

const TZ = 'America/Santo_Domingo';
const pairs = (n: number): ScheduleEntrant[] => Array.from({ length: n }, (_, i) => ({ id: `T${i + 1}`, players: [`a${i + 1}`, `b${i + 1}`], team: true }));

describe('horas de la liga', () => {
  it('fecha y hora de Santo Domingo ↔ UTC', () => {
    expect(zonedIso('2026-10-08', '20:00', TZ)).toBe('2026-10-09T00:00:00.000Z');
    expect(localParts('2026-10-09T00:00:00.000Z', TZ)).toEqual({ date: '2026-10-08', time: '20:00' });
    // Con cambio de horario (Nueva York en julio: UTC-4; en enero: UTC-5).
    expect(zonedIso('2026-07-01', '08:30', 'America/New_York')).toBe('2026-07-01T12:30:00.000Z');
    expect(zonedIso('2026-01-15', '08:30', 'America/New_York')).toBe('2026-01-15T13:30:00.000Z');
    expect(zonedIso('2026-10-08', 'luego', TZ)).toBeNull();
    // Zona desconocida: la de la RD.
    expect(zonedIso('2026-10-08', '20:00', 'Marte/Base')).toBe('2026-10-09T00:00:00.000Z');
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(timeLabel('20:05')).toBe('8:05 pm');
    expect(timeLabel('00:30')).toBe('12:30 am');
    expect(todayIn(TZ, Date.parse('2026-10-09T02:00:00Z'))).toBe('2026-10-08');
  });
});

describe('liga de parejas', () => {
  it('configuración saneada', () => {
    expect(parseLeagueConfig({ pairs: ['a', 'a', 'b'], times: ['20:00', 'tarde'], everyDays: 0 }, '2026-10-01')).toMatchObject({
      pairs: ['a', 'b'],
      times: ['20:00'],
      everyDays: 1,
      startDate: '2026-10-01',
      double: false,
      minutes: 90,
      points: 'standard',
    });
  });

  it('6 parejas de ida: 5 jornadas de 3 partidos, una por semana, cancha y hora en la zona de la liga', () => {
    const cfg = parseLeagueConfig({ pairs: pairs(6).map((p) => p.id), courts: ['Cancha 1', 'Cancha 2'], times: ['19:00', '20:30'], startDate: '2026-10-05' });
    const plan = buildLeagueSchedule(cfg, pairs(6), { eventId: 'E', tz: TZ });
    expect(plan.jornadas).toBe(5);
    expect(plan.drafts).toHaveLength(15);
    expect(plan.unassigned).toBe(0);
    expect(plan.clashes).toEqual([]);
    const j2 = plan.drafts.filter((d) => d.round === 2);
    expect(j2).toHaveLength(3);
    expect(new Set(j2.map((d) => d.scheduledAt))).toEqual(new Set(['2026-10-12T23:00:00.000Z', '2026-10-13T00:30:00.000Z']));
    expect(plan.drafts[0]).toMatchObject({
      eventId: 'E',
      format: 'sets',
      sides: [{ side: 1, teamId: expect.any(String), players: [{ playerId: expect.any(String) }, { playerId: expect.any(String) }] }, { side: 2 }],
    });
    // Todos contra todos: cada par una vez.
    const seen = new Set(plan.drafts.map((d) => [d.sides[0].teamId, d.sides[1].teamId].sort().join('-')));
    expect(seen.size).toBe(15);
  });

  it('ida y vuelta, impar (descansa uno por jornada) y sin canchas: sin hora', () => {
    const cfg = parseLeagueConfig({ pairs: pairs(5).map((p) => p.id), double: true, startDate: '2026-10-05', everyDays: 14 });
    const plan = buildLeagueSchedule(cfg, pairs(5), { tz: TZ });
    expect(plan.jornadas).toBe(10);
    expect(plan.drafts).toHaveLength(20);
    expect(plan.drafts.every((d) => d.scheduledAt === null && d.court === '')).toBe(true);
    expect(plan.fixtures.find((f) => f.round === 2)?.date).toBe('2026-10-19');
  });

  it('avisa choques: no caben en las canchas, o alguien ya juega a esa hora en otro evento', () => {
    const cfg = parseLeagueConfig({ pairs: pairs(4).map((p) => p.id), courts: ['Cancha 1'], times: ['19:00'], startDate: '2026-10-05', minutes: 90 });
    const plan = buildLeagueSchedule(cfg, pairs(4), { tz: TZ });
    expect(plan.unassigned).toBe(3);
    const busy = mkMatch({ a: ['a1', 'x'], b: ['y', 'z'], scheduledAt: '2026-10-05T23:30:00Z', court: 'Cancha 3', eventId: 'OTRO' });
    const withOther = buildLeagueSchedule(cfg, pairs(4), { tz: TZ, existing: [busy] });
    const clash = withOther.clashes.find((c) => c.kind === 'participant' && c.who === 'a1');
    expect(clash).toBeTruthy();
    expect(clashText(clash!, (id) => (id === 'a1' ? 'Ana' : id))).toBe('Ana tiene dos partidos a la misma hora.');
  });
});
