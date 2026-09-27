import { describe, expect, it } from 'vitest';
import { dueReminders, localNow, reminderTtl } from './reminders';

// 2026-09-29 es martes.
const practica = { date: '2026-09-29', type: 'practica' as const, name: '' };
const liga = { name: 'Liga Norte', schedule: 'Martes · 7:00 pm' };
const at = (h: number, m = 0) => h * 60 + m;
const slots = (today: string, minutes: number, league = liga, ev = practica) => dueReminders(ev, league, today, minutes).map((r) => r.slot);

describe('recordatorios: 3 avisos por práctica', () => {
  it('el lunes a las 12 pm: "mañana tienes práctica"', () => {
    expect(slots('2026-09-28', at(11, 59))).toEqual([]);
    expect(slots('2026-09-28', at(12))).toEqual(['dia-antes']);
    expect(slots('2026-09-28', at(20, 59))).toEqual(['dia-antes']);
    // De noche no se molesta.
    expect(slots('2026-09-28', at(21))).toEqual([]);
    const [r] = dueReminders(practica, liga, '2026-09-28', at(12));
    expect(r.title).toBe('Recuerda: mañana es la práctica');
    expect(r.body).toBe('Liga Norte · martes a las 7:00 pm. ¿Vas? Confírmalo en la app.');
  });

  it('el martes a las 12 pm: "hoy es la práctica"; de 5:45 a 6:50 pm: "a las 7 empieza"', () => {
    expect(slots('2026-09-29', at(11, 30))).toEqual([]);
    expect(slots('2026-09-29', at(12))).toEqual(['mismo-dia']);
    expect(slots('2026-09-29', at(17, 44))).toEqual(['mismo-dia']);
    expect(slots('2026-09-29', at(17, 45))).toEqual(['una-hora']);
    expect(slots('2026-09-29', at(18, 49))).toEqual(['una-hora']);
    expect(slots('2026-09-29', at(18, 50))).toEqual([]);
    expect(slots('2026-09-29', at(19))).toEqual([]);
    const [r] = dueReminders(practica, liga, '2026-09-29', at(18));
    expect([r.title, r.body]).toEqual(['A las 7:00 pm empieza la práctica', 'Liga Norte. Anota tus juegos en la app mientras juegas.']);
  });

  it('una liga temprano (10 am): el del mismo día sale a las 7 am', () => {
    const temprano = { name: 'Madrugadores', schedule: 'Martes · 10:00 am' };
    expect(slots('2026-09-29', at(6, 59), temprano)).toEqual([]);
    expect(slots('2026-09-29', at(7), temprano)).toEqual(['mismo-dia']);
    expect(slots('2026-09-29', at(8, 44), temprano)).toEqual(['mismo-dia']);
    expect(slots('2026-09-29', at(8, 45), temprano)).toEqual(['una-hora']);
  });

  it('sin hora, o un evento en otro día que el de la liga: dos avisos (día antes y mismo día)', () => {
    const sinHora = { name: 'Liga', schedule: '' };
    expect(slots('2026-09-28', at(12), sinHora)).toEqual(['dia-antes']);
    expect(slots('2026-09-29', at(12), sinHora)).toEqual(['mismo-dia']);
    expect(slots('2026-09-29', at(17, 59), sinHora)).toEqual(['mismo-dia']);
    expect(slots('2026-09-29', at(18), sinHora)).toEqual([]);
    const sabado = { date: '2026-10-03', type: 'torneo' as const, name: 'Copa' };
    expect(dueReminders(sabado, liga, '2026-10-03', at(12)).map((r) => [r.slot, r.title])).toEqual([['mismo-dia', 'Hoy es el torneo Copa']]);
  });

  it('una hora sin am/pm ("7:00") no se adivina: se toma como sin hora; "19:00" sí', () => {
    const dudosa = { name: 'Liga', schedule: 'Martes 7:00' };
    expect(slots('2026-09-29', at(17, 45), dudosa)).toEqual(['mismo-dia']);
    expect(slots('2026-09-29', at(6, 30), dudosa)).toEqual([]);
    const militar = { name: 'Liga', schedule: 'Martes 19:00' };
    expect(slots('2026-09-29', at(18), militar)).toEqual(['una-hora']);
  });

  it('el aviso no se guarda más allá de la hora de la práctica', () => {
    expect(reminderTtl(practica, liga, '2026-09-29', at(18))).toBe(60 * 60);
    expect(reminderTtl(practica, liga, '2026-09-29', at(12))).toBe(6 * 3600);
    expect(reminderTtl(practica, liga, '2026-09-28', at(12))).toBe(6 * 3600);
    expect(reminderTtl(practica, liga, '2026-09-29', at(18, 59))).toBe(60);
    expect(reminderTtl(practica, { schedule: '' }, '2026-09-29', at(20))).toBe(4 * 3600);
  });

  it('la hora local de la liga', () => {
    // 16:30 UTC = 12:30 pm en Santo Domingo (UTC-4).
    expect(localNow(new Date(Date.UTC(2026, 8, 28, 16, 30)), 'America/Santo_Domingo')).toEqual({ today: '2026-09-28', minutes: at(12, 30) });
  });
});
