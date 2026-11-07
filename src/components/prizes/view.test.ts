/**
 * Lo que deciden las piezas de «Premios del torneo» (view.ts, gate.ts y screens.ts), con datos de mentira: la tarjeta,
 * «Elegir premios», «Entregar premios» y lo de cada deporte.
 */
import { describe, expect, it } from 'vitest';
import type { LeagueBadge } from '../../lib/data/leagueBadges';
import type { PrizeSlot, TournamentPrize } from '../../lib/data/prizes';
import type { SlotPlan } from '../../prizes/award';
import type { PrizeCategoryDef } from '../../prizes/catalog';
import { noPrizes, prizesHidden } from './gate';
import {
  bowlingNameOf,
  bowlingWarnings,
  categoryPrizeOf,
  categoryPrizeVerb,
  golfCompName,
  golfLastDate,
  golfReady,
  golfWaitText,
  nightReady,
  nightWarnings,
  pendingWarning,
  teamNamesOf,
  teamReportNames,
} from './screens';
import {
  adminBarView,
  awardButtonLabel,
  awardNames,
  cardHidden,
  currentLine,
  nameJoiner,
  periodCheck,
  placeOfKey,
  removeHint,
  ruleLine,
  saveStep,
  slotFieldId,
  soloWinner,
  toggleRow,
  unitTitle,
  winnerPlayerName,
  winnerShortLine,
} from './view';

const design = (id: string, template: string | null, over: Partial<LeagueBadge> = {}): LeagueBadge => ({
  id,
  leagueId: 'L1',
  name: `Insignia ${id}`,
  description: '',
  shape: 'shield',
  palette: 'oro',
  color: null,
  icon: 'trophy',
  topText: '',
  periodText: '',
  template,
  limitKind: 'unica',
  byTeam: false,
  status: 'activa',
  createdBy: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '',
  given: 0,
  active: 0,
  locked: false,
  openReports: null,
  ...over,
});

const slot = (id: string, over: Partial<PrizeSlot> = {}): PrizeSlot => ({
  id,
  category: 'individual',
  division: '',
  label: '',
  place: 1,
  badgeId: 'B1',
  title: '',
  winners: [],
  verified: false,
  deliveredAt: null,
  deliveredBy: null,
  editableUntil: null,
  updatedAt: '',
  ...over,
});
const prize = (slots: PrizeSlot[]): TournamentPrize => ({ id: 'Z1', leagueId: 'L1', scope: 'evento', refId: 'E1', period: 'OCT 2026', closedAt: null, closedBy: null, createdAt: '', updatedAt: '', slots });
const names: Record<string, string> = { p1: 'Jugador Uno', p2: 'Jugadora Dos', p3: 'Jugador Tres' };
const nameOf = (id: string) => names[id] ?? 'Jugador';

describe('si se ve la tarjeta', () => {
  it('una liga con menores: solo sus miembros', () => {
    expect(prizesHidden({ league: { hasMinors: true }, member: null })).toBe(true);
    expect(prizesHidden({ league: { hasMinors: true }, member: {} })).toBe(false);
    expect(prizesHidden({ league: {}, member: null })).toBe(false);
  });
  it('sin premios: solo quien los elige (y si se pudieron leer)', () => {
    expect(noPrizes({ data: null, error: null }, true)).toBe(false);
    expect(noPrizes({ data: null, error: null }, false)).toBe(true);
    expect(noPrizes({ data: null, error: new Error('x') }, true)).toBe(true);
    expect(noPrizes({ data: prize([]), error: null }, false)).toBe(false);
    expect(cardHidden({ state: 'sin_premios', sections: [] }, false)).toBe(true);
    expect(cardHidden({ state: 'sin_premios', sections: [] }, true)).toBe(false);
    expect(cardHidden({ state: 'elegidos', sections: [] }, true)).toBe(true);
  });
});

describe('las filas de la tarjeta', () => {
  it('«Por ahora…» solo sin entregar', () => {
    const units = [{ ref: 't:a', name: 'Equipo Uno', teamId: 'a', players: [], detail: '1 158' }, { ref: 'p:p2', name: 'Jugadora Dos', teamId: null, players: [] }];
    expect(currentLine({ delivered: false, current: { status: 'listo', units } })).toEqual({ text: 'Por ahora: Equipo Uno (1 158) · Jugadora Dos', truncate: true });
    expect(currentLine({ delivered: false, current: { status: 'vacio', units: [] } })).toEqual({ text: 'Por ahora, nadie en este lugar.', truncate: false });
    expect(currentLine({ delivered: true, current: { status: 'listo', units } })).toBeNull();
    expect(currentLine({ delivered: false, current: { status: 'sin_resultado', units: [] } })).toBeNull();
  });
  it('los ganadores: un jugador solo con su nombre guardado; muchos, en una línea', () => {
    const solo = { ref: 'p:p1', name: 'Jugador Uno (antes)', teamId: null, players: ['p1'] };
    const team = { ref: 't:a', name: 'Equipo Uno', teamId: 'a', players: ['p1', 'p2'] };
    expect(soloWinner(solo)).toBe(true);
    expect(soloWinner(team)).toBe(false);
    expect(soloWinner({ ref: 'c:x', teamId: null, players: ['p1'] })).toBe(false);
    expect(winnerPlayerName(solo, 'p1', nameOf)).toBe('Jugador Uno (antes)');
    expect(winnerPlayerName(team, 'p1', nameOf)).toBe('Jugador Uno');
    expect(winnerShortLine(team, nameOf)).toBeNull();
    const big = { ...team, players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] };
    expect(winnerShortLine(big, nameOf)).toBe('Jugador Uno, Jugadora Dos, Jugador Tres, Jugador, Jugador y 2 más');
    expect([0, 1, 2].map((i) => nameJoiner(i, 3))).toEqual(['', ', ', ' y ']);
  });
});

describe('la barra de quien entrega', () => {
  const base = { tz: 'America/Santo_Domingo', canPick: true, canDeliver: true, isOwner: false, ready: true };
  it('sin entregar: «Entregar premios», apagado hasta que se pueda, con el porqué', () => {
    const v = adminBarView({ ...base, ready: false, waitText: 'Se entregan cuando termine el torneo', model: { state: 'elegidos', allDelivered: false, podiumChanged: false }, correction: { open: true, deadline: null, someExpired: false } });
    expect(v.award).toEqual({ label: 'Entregar premios', quiet: false, disabled: true });
    expect(v.change).toBe(true);
    expect(v.close).toBe(false);
    expect(v.wait).toBe('Se entregan cuando termine el torneo.');
    expect(v.notes).toEqual([]);
  });
  it('entregado: «Revisar premios», el plazo, cerrar y el aviso del podio', () => {
    const v = adminBarView({
      ...base,
      model: { state: 'entregados', allDelivered: true, podiumChanged: true },
      correction: { open: true, deadline: '2026-10-27T12:00:00Z', someExpired: false },
    });
    expect(v.award).toEqual({ label: 'Revisar premios', quiet: true, disabled: false });
    expect(v.notes).toEqual(['Puedes corregir hasta el 27 oct 2026.']);
    expect(v.close).toBe(true);
    expect(v.podiumWarning).toBe(true);
    expect(v.wait).toBeNull();
  });
  it('cerrados: solo el dueño corrige', () => {
    const closed = { model: { state: 'cerrados' as const, allDelivered: true, podiumChanged: true }, correction: { open: false, deadline: null, someExpired: true } };
    const admin = adminBarView({ ...base, ...closed });
    expect(admin.award).toBeNull();
    expect(admin.podiumWarning).toBe(false);
    expect(admin.change).toBe(false);
    expect(admin.notes).toEqual(['Solo el dueño puede corregirlos.']);
    expect(adminBarView({ ...base, ...closed, isOwner: true }).notes).toEqual(['Solo tú puedes corregirlos.']);
  });
});

describe('elegir premios', () => {
  const sections: PrizeCategoryDef[] = [{ category: 'individual', division: '', label: '', title: 'Individual (handicap)' }];
  it('la cinta y las claves', () => {
    expect(periodCheck(' oct 2026 ')).toEqual({ clean: 'OCT 2026', error: null });
    expect(periodCheck('TEMPORADA 2026').error).toBe('La cinta lleva hasta 10 letras.');
    expect(placeOfKey('individual||2')).toBe(2);
    expect(slotFieldId('equipo||1')).toBe('premio-equipo--1');
  });
  it('prender un lugar le pone la plantilla de ese lugar', () => {
    const designs = [design('B1', 'champion'), design('B2', 'runner_up')];
    expect(toggleRow({}, 'individual||2', true, designs)['individual||2']).toEqual({ on: true, badgeId: 'B2' });
    expect(toggleRow({ 'individual||2': { on: true, badgeId: 'B9' } }, 'individual||2', false, designs)['individual||2']).toEqual({ on: false, badgeId: 'B9' });
  });
  it('guardar: lo que falta, preguntar antes de quitar todo, o guardar', () => {
    expect(saveStep(sections, { 'individual||1': { on: true, badgeId: null } }, null, null)).toEqual({ kind: 'error', text: 'Elige la insignia del 1.er lugar de Individual (handicap).' });
    expect(saveStep(sections, {}, null, null)).toEqual({ kind: 'error', text: 'Prende al menos un lugar y elige su insignia.' });
    expect(saveStep(sections, {}, prize([slot('S1')]), null)).toEqual({ kind: 'confirm', slots: [] });
    expect(saveStep(sections, {}, null, 'La cinta lleva hasta 10 letras.').kind).toBe('error');
    expect(saveStep(sections, { 'individual||1': { on: true, badgeId: 'B1' } }, null, null)).toEqual({ kind: 'save', slots: [{ category: 'individual', division: '', place: 1, badgeId: 'B1' }] });
  });
  it('la regla del boliche', () => {
    expect(ruleLine({ kind: 'bowling', bowling: { type: 'torneo', hcpPercent: 80, hasTeams: true, individualRankBy: 'hcp', teamRankBy: 'scratch' } })).toBe(
      'Los premios siguen esta regla: Equipos por scratch, Individual con handicap.',
    );
    expect(ruleLine({ kind: 'golf' })).toBeNull();
  });
});

describe('entregar premios', () => {
  const plan = (over: Partial<SlotPlan> = {}): SlotPlan => ({
    slot: slot('S1'),
    title: 'Individual',
    status: 'listo',
    verified: true,
    finished: true,
    units: [{ ref: 'p:p3', name: 'Jugador Nuevo', teamId: null, players: [{ id: 'p9', name: 'Jugador Nuevo' }] }],
    holders: [],
    withdrawn: [],
    selfBlocked: false,
    locked: false,
    tooMany: false,
    bracket: false,
    deliverable: true,
    ...over,
  });
  it('el botón, los nombres y a quién se le quita', () => {
    expect(awardButtonLabel([plan()])).toBe('Entregar');
    expect(awardButtonLabel([plan({ holders: ['p1'] })])).toBe('Corregir');
    expect(awardNames([{ id: 'p1', name: 'Jugador Uno' }], [plan()]).get('p9')).toBe('Jugador Nuevo');
    expect(removeHint(plan({ holders: ['p1', 'p2'] }), { on: false, players: {} }, nameOf)).toBe('Se le quita a Jugador Uno y Jugadora Dos.');
    expect(removeHint(plan({ holders: ['p1'] }), { on: true, players: {} }, nameOf)).toBeUndefined();
    expect(unitTitle({ name: '', players: [{ id: 'p1', name: 'Jugador Uno' }, { id: 'p2', name: 'Jugadora Dos' }] })).toBe('Jugador Uno y Jugadora Dos');
  });
});

describe('cada deporte', () => {
  it('boliche: juegos por verificar y jugadores borrados', () => {
    expect(pendingWarning(0)).toBeNull();
    expect(pendingWarning(1)).toBe('Hay 1 juego por verificar: puede cambiar el podio.');
    expect(bowlingWarnings(3)).toEqual(['Hay 3 juegos por verificar: pueden cambiar el podio.']);
    expect(bowlingNameOf([{ id: 'p1', name: 'Jugador Uno' }])('p0')).toBe('(jugador borrado)');
  });
  it('noches: desde su día, con aviso mientras no terminan', () => {
    expect(nightReady('2026-10-12', '2026-10-12')).toBe(true);
    expect(nightReady('2026-10-13', '2026-10-12')).toBe(false);
    expect(nightWarnings(false)).toEqual(['Todavía no termina: la tabla puede cambiar.']);
    expect(nightWarnings(true)).toEqual([]);
  });
  it('torneo de raqueta: el premio de la categoría', () => {
    const designs = [design('B1', 'champion'), design('B2', 'champion', { status: 'oculta' })];
    const p = prize([slot('S1', { division: 'A', badgeId: 'B1' }), slot('S2', { division: 'B', badgeId: 'B2' })]);
    expect(categoryPrizeOf(p, designs, 'A')?.design.id).toBe('B1');
    expect(categoryPrizeOf(p, designs, 'B')).toBeNull();
    expect(categoryPrizeOf(p, designs, 'C')).toBeNull();
    expect(categoryPrizeVerb({ deliveredAt: null })).toBe('Se lleva');
    expect(categoryPrizeVerb({ deliveredAt: '2026-10-12T00:00:00Z' })).toBe('Se llevó');
  });
  it('golf: la ronda suelta o el torneo entero', () => {
    const rounds = [
      { eventId: 'E1', closed: true },
      { eventId: 'E2', closed: false },
    ];
    expect(golfReady(null, [], { eventId: 'E1', closed: true })).toBe(true);
    expect(golfReady('T1', rounds, { eventId: 'E2', closed: false })).toBe(false);
    expect(golfReady('T1', rounds, { eventId: 'E2', closed: true })).toBe(true);
    expect(golfLastDate('T1', rounds, [{ id: 'E1', date: '2026-10-03' }, { id: 'E2', date: '2026-10-10' }, { id: 'X', date: '2026-12-01' }], '2026-10-03')).toBe('2026-10-10');
    expect(golfLastDate(null, rounds, [], '2026-10-03')).toBe('2026-10-03');
    expect(golfCompName('T1', 'Ronda 1', 'Torneo de Ejemplo')).toBe('Torneo de Ejemplo');
    expect(golfCompName(null, 'Ronda 1', 'Torneo de Ejemplo')).toBe('Ronda 1');
    expect(golfWaitText(true)).toBe('Se entregan cuando se cierren todas las rondas del torneo');
  });
  it('equipos: plantillas y equipos borrados', () => {
    const teamOf = (id: string) => (id === 'a' ? { name: 'Equipo Uno', roster: [{ playerId: 'p1' }, { playerId: 'p2' }] } : undefined);
    const n = teamNamesOf({ nameOf, teamOf });
    expect(n.rosterOf('a')).toEqual(['p1', 'p2']);
    expect(n.teamName('z')).toBe('(equipo borrado)');
    expect(teamReportNames({ nameOf, teamOf }).teamName('z')).toBeNull();
  });
});
