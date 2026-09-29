import { describe, expect, it } from 'vitest';
import type { BowlingEvent } from '../lib/types';
import { bowlingComp, bowlingRuleText, bowlingTitle, defaultLabel, defaultPeriod, PLACE_LABEL, prizeBadgeText, prizeCategories, prizeTitle, unnamedComp, type PrizeComp } from './catalog';

const event: BowlingEvent = {
  id: 'E1',
  type: 'torneo',
  name: '',
  date: '2026-10-12',
  games: 3,
  hcpBase: 230,
  hcpPercent: 80,
  teams: {},
  playerCount: 0,
  teamSize: 3,
};

const comp = (kind: PrizeComp['kind'], over: Partial<PrizeComp> = {}): PrizeComp => ({
  lid: 'L1',
  scope: 'evento',
  refId: 'R1',
  kind,
  sport: 'bowling',
  name: 'Copa',
  date: '2026-10-12',
  ...over,
});

const list = (c: PrizeComp) => prizeCategories(c).map((d) => `${d.category}:${d.division}:${d.title}`);

describe('qué premia cada competencia (la gemela de private.prize_allowed)', () => {
  it('boliche: equipos (si hay equipos o jugadores por equipo) e individual, con la regla EFECTIVA en el título', () => {
    const c = bowlingComp('L1', event);
    expect(c).toMatchObject({ scope: 'evento', refId: 'E1', kind: 'bowling', name: 'Torneo del 12 oct', bowling: { hasTeams: true } });
    expect(list(c)).toEqual(['equipo::Equipos (scratch)', 'individual::Individual (handicap)']);
    expect(list(bowlingComp('L1', { ...event, teamSize: 0 }))).toEqual(['individual::Individual (handicap)']);
    expect(list(bowlingComp('L1', { ...event, teamSize: 0, teams: { t1: { name: 'A', order: 1 } } }))[0]).toBe('equipo::Equipos (scratch)');
    // Al revés, y con 0 % todo por scratch aunque la regla diga handicap.
    expect(list(bowlingComp('L1', { ...event, individualRankBy: 'scratch', teamRankBy: 'hcp' }))).toEqual(['equipo::Equipos (handicap)', 'individual::Individual (scratch)']);
    expect(list(bowlingComp('L1', { ...event, hcpPercent: 0, individualRankBy: 'hcp', teamRankBy: 'hcp' }))).toEqual(['equipo::Equipos (scratch)', 'individual::Individual (scratch)']);
    expect(bowlingComp('L1', { ...event, name: ' Aniversario ' }).name).toBe('Aniversario');
    expect([unnamedComp('Noche', '2026-01-05'), unnamedComp('Torneo', null)]).toEqual(['Noche del 5 ene', 'Torneo']);
  });

  it('raqueta: una categoría por categoría del torneo (pareja en dobles, individual si no); ids raros no', () => {
    const racket = { doubles: true, categories: [{ id: 'A', name: 'Categoría A' }, { id: 'B', name: '' }, { id: 'A', name: 'otra' }, { id: 'no válida', name: 'X' }] };
    expect(list(comp('racket_tourney', { racket }))).toEqual(['pareja:A:Parejas · Categoría A', 'pareja:B:Parejas · Cat. B']);
    expect(list(comp('racket_tourney', { racket: { ...racket, doubles: false } }))[0]).toBe('individual:A:Individual · Categoría A');
    expect(defaultLabel(comp('racket_tourney', { racket: { doubles: true, categories: [{ id: 'C', name: 'Una categoría larguísima' }] } }), 'C')).toBe('Una categoría la');
    expect(defaultLabel(comp('racket_tourney', { racket: { doubles: true, categories: [{ id: 'D', name: 'Llama 8095551234' }] } }), 'D')).toBe('Cat. D');
  });

  it('noches, relámpago, playoffs, golf y natación', () => {
    expect(list(comp('racket_night'))).toEqual(['individual::Individual']);
    expect(list(comp('team_ko'))).toEqual(['equipo::Equipos']);
    expect(list(comp('playoff', { scope: 'playoff' }))).toEqual(['equipo::Equipos']);
    expect(list(comp('golf'))).toEqual(['individual::Individual', 'individual:gross:Individual · Gross', 'individual:neto:Individual · Neto']);
    expect(list(comp('swim'))).toEqual(['equipo::Clubes', 'individual::Individual', 'individual:F:Individual · Femenino', 'individual:M:Individual · Masculino']);
    expect(prizeCategories(comp('golf')).map((d) => d.label)).toEqual(['', 'Gross', 'Neto']);
    expect(prizeCategories(comp('swim')).map((d) => d.label)).toEqual(['', '', 'Femenino', 'Masculino']);
  });

  it('prizeTitle de un lugar guardado (con su división)', () => {
    expect(prizeTitle({ category: 'pareja', division: 'A', label: 'Abierta' }, comp('racket_tourney'))).toBe('Parejas · Abierta');
    expect(prizeTitle({ category: 'individual', division: 'Z', label: '' }, comp('racket_tourney'))).toBe('Individual · Cat. Z');
    expect(prizeTitle({ category: 'equipo', division: '' }, comp('bowling'))).toBe('Equipos (scratch)');
    expect(bowlingTitle('individual', 'hcp')).toBe('Individual (handicap)');
  });
});

describe('textos', () => {
  it('lugares, cinta por defecto (el mes, como la base) y la insignia que se entrega', () => {
    expect(Object.values(PLACE_LABEL)).toEqual(['1.er lugar', '2.º lugar', '3.er lugar']);
    expect(defaultPeriod('2026-10-12')).toBe('OCT 2026');
    expect(defaultPeriod('2027-01-02')).toBe('ENE 2027');
    expect(defaultPeriod(null)).toBe('');
    expect(defaultPeriod('mañana')).toBe('');
    expect(prizeBadgeText('Campeón', 'OCT 2026', 'Cat. A')).toBe('Campeón · OCT 2026 · Cat. A');
    expect(prizeBadgeText('Campeón', '', '')).toBe('Campeón');
  });

  it('la regla del boliche en palabras (el formulario y «Elegir premios»)', () => {
    expect(bowlingRuleText({ hcpPercent: 80 })).toEqual({ rule: 'Los premios siguen esta regla: Equipos por scratch, Individual con handicap.', note: null });
    expect(bowlingRuleText({ hcpPercent: 80, individualRankBy: 'scratch', teamRankBy: 'hcp' }).rule).toBe('Los premios siguen esta regla: Equipos con handicap, Individual por scratch.');
    expect(bowlingRuleText({ hcpPercent: 0, individualRankBy: 'hcp', teamRankBy: 'scratch' }).note).toBe('Con 0 % de handicap, el individual queda por scratch.');
    expect(bowlingRuleText({ hcpPercent: 0, individualRankBy: 'scratch', teamRankBy: 'hcp' }).note).toBe('Con 0 % de handicap, los equipos quedan por scratch.');
    expect(bowlingRuleText({ hcpPercent: 0, individualRankBy: 'hcp', teamRankBy: 'hcp' }).note).toBe('Con 0 % de handicap, todo queda por scratch.');
    expect(bowlingRuleText({ hcpPercent: 0, individualRankBy: 'scratch', teamRankBy: 'scratch' }).note).toBeNull();
  });
});
