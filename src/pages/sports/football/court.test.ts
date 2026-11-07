import { describe, expect, it } from 'vitest';
import { football, footballConfig, type FootballState } from '../../../sports/team/football';
import { benchFor, finishText, goalSheetTitle, nextKicker, parseElapsed, periodEndLabel, periodEndNext, pickableIds, sameGoal, sideIds, subsMax } from './court';

const FIELD = footballConfig('football');

describe('acta digital de fútbol', () => {
  it('los de un lado: la cancha, el banco y al final los que salieron o fueron expulsados', () => {
    let s: FootballState = football.init(FIELD);
    s = football.apply(s, { type: 'lineup', side: 1, players: ['a', 'b'] });
    s = football.apply(s, { type: 'card', side: 1, player: 'b', card: 'red', at: 1 });
    const jersey: Record<string, number> = { a: 9, b: 1, c: 5 };
    const ids = sideIds(s, 1, ['a', 'b', 'c'], (id) => jersey[id] ?? null, (id) => id);
    expect(ids).toEqual(['a', 'c', 'b']);
    expect(pickableIds(s, 1, ids)).toEqual(['a']);
    expect(pickableIds(s, 1, ids, { onlyAvailable: false })).toEqual(['a', 'c']);
    expect(benchFor(s, FIELD, { side: 1, playerId: 'a' }, ids)).toEqual(['c']);
  });

  it('cambios, penales, fin del tiempo y lo que sigue', () => {
    expect(subsMax(FIELD, 1)).toBe(FIELD.subs.max);
    expect(subsMax({ subs: { max: null, reentry: true, extraTimeBonus: 1 } }, 3)).toBeNull();
    expect(nextKicker([], null)).toBeNull();
    expect(nextKicker([], 2)).toBe(2);
    expect(nextKicker([{ side: 2 }], null)).toBe(1);
    expect(nextKicker([{ side: 2 }, { side: 1 }], null)).toBe(2);
    expect(periodEndLabel(1)).toBe('Fin del 1.er tiempo');
    expect(periodEndLabel(4)).toBe('Fin de la prórroga 2');
    expect(periodEndNext({ period: 1, score: [0, 0] }, FIELD)).toBe('half');
    expect(periodEndNext({ period: 2, score: [1, 1] }, { extraTime: true, shootout: true })).toBe('extra_time');
    expect(periodEndNext({ period: 2, score: [1, 1] }, { extraTime: false, shootout: true })).toBe('shootout');
    expect(periodEndNext({ period: 2, score: [2, 1] }, { extraTime: true, shootout: true })).toBe('final');
  });

  it('textos del gol y del final', () => {
    const names = ['Equipo Uno', 'Equipo Dos'] as const;
    const who = () => '#9 Jugador Uno';
    expect(goalSheetTitle({ side: 1, at: 1, step: 'scorer' }, names, who, '23')).toBe("¡Gol de Equipo Uno! (23') ¿Quién marcó?");
    expect(goalSheetTitle({ side: 1, at: 1, step: 'own' }, names, who, null)).toBe('Autogol: ¿de quién de Equipo Dos?');
    expect(goalSheetTitle({ side: 2, at: 1, step: 'assist', scorer: 'x' }, names, who, null)).toBe('¿Quién asistió a #9 Jugador Uno?');
    expect(finishText({ score: [1, 1] }, [4, 3], 1, names)).toBe('1-1 (pen. 4-3) · Gana Equipo Uno');
    expect(finishText({ score: [0, 0] }, null, null, names)).toBe('0-0 · Empate');
    expect(sameGoal({ type: 'goal', side: 1, at: 5 }, 1, 5)).toBe(true);
    expect(sameGoal({ type: 'goal', side: 2, at: 5 }, 1, 5)).toBe(false);
    expect(parseElapsed('23:00')).toBe(1_380_000);
    expect(parseElapsed('x')).toBeNull();
  });
});
