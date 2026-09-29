import { describe, expect, it } from 'vitest';
import { snapMeet, snapSwimEntry, snapSwimEvent } from '../testkit';
import { isOfficialMeet, isW1, isW2, personalBestSteps, swimActivity, swimContext, swimsOf, w1GroupSizes } from './swim';

const USERS: Record<string, string | null> = { s1: 'u1', s2: 'u2', s3: null, s4: 'u4' };
const userOf = (p: string) => USERS[p] ?? null;

describe('W1 y W2 (§1.7.5)', () => {
  const meet = snapMeet('m1');

  it('W1: ok con tiempo, encuentro finalizado y no lo anotó el propio nadador', () => {
    expect(isW1(snapSwimEntry('x', 'm1', 'ev', 's1', 6800), meet, 'u1')).toBe(true);
    expect(isW1(snapSwimEntry('x', 'm1', 'ev', 's1', 6800, { recorded_by: 'u1' }), meet, 'u1')).toBe(false);
    expect(isW1(snapSwimEntry('x', 'm1', 'ev', 's1', 6800), snapMeet('m1', { finalized_at: null }), 'u1')).toBe(false);
    expect(isW1(snapSwimEntry('x', 'm1', 'ev', 's1', 6800, { status: 'dq' }), meet, 'u1')).toBe(false);
    expect(isW1(snapSwimEntry('x', 'm1', 'ev', 's1', null), meet, 'u1')).toBe(false);
    // Sin cuenta, cualquiera que anote vale.
    expect(isW1(snapSwimEntry('x', 'm1', 'ev', 's3', 6800, { recorded_by: null }), meet, null)).toBe(true);
  });

  it('W2: el grupo (sexo de la prueba y edad) tiene al menos N nadadores W1', () => {
    const ctx = swimContext([snapSwimEvent('ev', 'm1')], [meet], userOf);
    const entries = [
      snapSwimEntry('a', 'm1', 'ev', 's1', 6800),
      snapSwimEntry('b', 'm1', 'ev', 's2', 6900),
      snapSwimEntry('c', 'm1', 'ev', 's3', 7000),
      snapSwimEntry('d', 'm1', 'ev', 's4', 6500, { age_group: '13-14' }),
      snapSwimEntry('e', 'm1', 'ev', 's5', null, { status: 'dns' }),
    ];
    const sizes = w1GroupSizes(entries, ctx);
    expect(Object.fromEntries(sizes)).toEqual({ 'ev|F|11-12': 3, 'ev|F|13-14': 1 });
    expect(isW2(entries[0], ctx, sizes, 3)).toBe(true);
    expect(isW2(entries[3], ctx, sizes, 3)).toBe(false);
  });
});

describe('actividad y marcas personales', () => {
  it('ok, dq y dnf cuentan (dns no); un día por encuentro; oficial en encuentro y torneo', () => {
    const ctx = {
      ...swimContext([snapSwimEvent('e1', 'm1'), snapSwimEvent('e2', 'm1', { stroke: 'espalda' }), snapSwimEvent('e3', 'm2')], [snapMeet('m1'), snapMeet('m2')], userOf),
      dateOf: (e: string) => (e === 'm1' ? '2026-10-03' : '2026-10-10'),
      typeOf: (e: string) => (e === 'm1' ? 'encuentro' : 'control'),
    };
    const acts = swimActivity(
      [
        snapSwimEntry('a', 'm1', 'e1', 's1', 6800),
        snapSwimEntry('b', 'm1', 'e2', 's1', null, { status: 'dnf' }),
        snapSwimEntry('c', 'm1', 'e1', 's2', null, { status: 'dns' }),
        snapSwimEntry('d', 'm2', 'e3', 's2', 7000, { status: 'dq' }),
      ],
      ctx,
    );
    expect(acts.map((a) => [a.player_id, a.date, a.official])).toEqual([
      ['s1', '2026-10-03', true],
      ['s2', '2026-10-10', false],
    ]);
    expect([isOfficialMeet('torneo'), isOfficialMeet('control')]).toEqual([true, false]);
  });

  it('pasos de la marca personal: la primera vez no es marca; 25 m y 50 m van aparte', () => {
    const meets = ['m1', 'm2', 'm3', 'm4'].map((id) => snapMeet(id));
    const events = [
      snapSwimEvent('v1', 'm1'),
      snapSwimEvent('v2', 'm2'),
      snapSwimEvent('v3', 'm3'),
      snapSwimEvent('v4', 'm4', { pool: 50 }),
    ];
    const dates: Record<string, string> = { m1: '2026-09-01', m2: '2026-09-10', m3: '2026-10-06', m4: '2026-10-07' };
    const ctx = { ...swimContext(events, meets, userOf), dateOf: (e: string) => dates[e] ?? null };
    const swims = swimsOf(
      [
        snapSwimEntry('a', 'm1', 'v1', 's1', 7000),
        snapSwimEntry('b', 'm2', 'v2', 's1', 6900),
        snapSwimEntry('c', 'm3', 'v3', 's1', 6950),
        snapSwimEntry('d', 'm4', 'v4', 's1', 6000),
        snapSwimEntry('e', 'm3', 'v3', 's1', 6800, { recorded_by: 'u1' }),
      ],
      ctx,
    );
    expect(swims.map((s) => s.entryId)).toEqual(['a', 'b', 'c', 'd']);
    expect(personalBestSteps(swims)).toEqual([{ key: 'libre-100-25', date: '2026-09-10', time: 6900, pct: 1.43, previousDate: '2026-09-01', eventId: 'm2' }]);
  });
});
