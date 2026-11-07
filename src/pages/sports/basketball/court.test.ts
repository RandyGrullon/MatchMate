import { describe, expect, it } from 'vitest';
import { basketball, basketballConfig, type BasketballState } from '../../../sports/team/basketball';
import { courtPlayerIds, finishText, lastFoulText, parseRemaining, periodEndLabel, pointButtons } from './court';

const FIBA = basketballConfig('fiba');

describe('mesa anotadora de baloncesto', () => {
  it('el botón de fin del periodo y los puntos según el formato', () => {
    expect(periodEndLabel(FIBA, 2)).toBe('Fin del cuarto');
    expect(periodEndLabel(FIBA, 5)).toBe('Fin de la prórroga');
    expect(periodEndLabel(basketballConfig('halves'), 1)).toBe('Fin de la mitad');
    expect(periodEndLabel(basketballConfig('3x3'), 1)).toBe('Fin del tiempo');
    expect(pointButtons(FIBA)).toEqual([1, 2, 3]);
    expect(pointButtons(basketballConfig('3x3'))).toEqual([1, 2]);
  });

  it('los dorsales: los presentes (o la plantilla) y los que anotaron, por dorsal y nombre', () => {
    const s: BasketballState = basketball.init(FIBA);
    const jersey: Record<string, number | null> = { p1: 23, p2: 4, p9: null };
    const name: Record<string, string> = { p1: 'Jugador Uno', p2: 'Jugador Dos', p9: 'Jugador Nueve' };
    expect(courtPlayerIds(s, 1, ['p1', 'p2'], (id) => jersey[id] ?? null, (id) => name[id])).toEqual(['p2', 'p1']);
    const marked = { ...s, present: [['p1'], []] as [string[], string[]], players: [{ p9: s.players[0].p9 ?? ({} as never) }, {}] as BasketballState['players'] };
    expect(courtPlayerIds(marked, 1, ['p1', 'p2'], (id) => jersey[id] ?? null, (id) => name[id])).toEqual(['p1', 'p9']);
  });

  it('la línea de la última falta y el resumen', () => {
    const who = (side: 1 | 2, p?: string | null) => (p ? '#7 Jugador Uno' : side === 1 ? 'Equipo Uno' : 'Equipo Dos');
    expect(lastFoulText(null, who)).toBeNull();
    expect(lastFoulText({ side: 1, kind: 'personal', player: 'p1', teamFouls: 5, freeThrows: 2, possession: false, warning: false, out: null }, who)).toBe(
      'Falta personal de #7 Jugador Uno · 5.ª del equipo · bonus: 2 tiros libres',
    );
    expect(lastFoulText({ side: 2, kind: 'coach_technical', player: null, teamFouls: 1, freeThrows: 1, possession: false, warning: false, out: null }, who)).toContain('1 tiro libre');
    expect(finishText({ score: [78, 72] }, 1, ['Equipo Uno', 'Equipo Dos'])).toBe('78-72 · Gana Equipo Uno');
    expect(parseRemaining('2:00')).toBe(120_000);
    expect(parseRemaining('2.30')).toBe(150_000);
    expect(parseRemaining('dos')).toBeNull();
  });
});
