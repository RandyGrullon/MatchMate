import { describe, expect, it } from 'vitest';
import type { PodiumUnit, PrizeSlot, SlotPodium, TournamentPodium, TournamentPrize } from '../lib/data/prizes';
import { changeOf, defaultPlayers, deliveredText, hasChanges, initialPicks, namesLine, payloadOf, planDelivery, planNotes, prizesGiven, togglePlayer, toggleSlot, unitLine } from './award';
import type { PrizeComp } from './catalog';

const bowling: Pick<PrizeComp, 'kind' | 'bowling'> = { kind: 'bowling', bowling: { type: 'torneo', hcpPercent: 80, hasTeams: true } };
const golf: Pick<PrizeComp, 'kind'> = { kind: 'golf' };
const teamKo: Pick<PrizeComp, 'kind'> = { kind: 'team_ko' };
const playoff: Pick<PrizeComp, 'kind'> = { kind: 'playoff' };

const slot = (id: string, category: PrizeSlot['category'], place: 1 | 2 | 3, over: Partial<PrizeSlot> = {}): PrizeSlot => ({
  id,
  category,
  division: '',
  label: '',
  place,
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

const unit = (ref: string, name: string, players: [string, string][], teamId: string | null = null): PodiumUnit => ({ ref, name, teamId, players: players.map(([id, n]) => ({ id, name: n })) });
const strikers = unit('t:T1', 'Los Strikers', [['ana', 'Ana'], ['luis', 'Luis'], ['pedro', 'Pedro']], 'T1');
const ana = unit('p:ana', 'Ana', [['ana', 'Ana']]);
const luis = unit('p:luis', 'Luis', [['luis', 'Luis']]);

const srv = (slotId: string, over: Partial<SlotPodium> = {}): SlotPodium => ({ slotId, verified: true, status: 'listo', finished: true, units: [], holders: [], withdrawn: [], ...over });
const prize = (slots: PrizeSlot[], over: Partial<TournamentPrize> = {}): TournamentPrize => ({
  id: 'Z1',
  leagueId: 'L1',
  scope: 'evento',
  refId: 'E1',
  period: 'OCT 2026',
  closedAt: null,
  closedBy: null,
  createdAt: '',
  updatedAt: '',
  slots,
  ...over,
});
const podium = (slots: SlotPodium[], verified = true): TournamentPodium => ({ prizeId: 'Z1', kind: verified ? 'bowling' : 'golf', verified, slots });

describe('entregar: el plan de cada lugar', () => {
  const p = prize([slot('S1', 'equipo', 1), slot('S2', 'individual', 1), slot('S3', 'individual', 2), slot('S4', 'individual', 3)]);
  const pod = podium([
    srv('S1', { units: [strikers] }),
    srv('S2', { units: [ana, luis] }),
    srv('S3', { status: 'vacio' }),
    srv('S4', { status: 'empate_multiple', units: [ana, luis, ana, luis] }),
  ]);

  it('boliche: el podio del servidor, con los títulos de la regla; empates, nadie y más de 3', () => {
    const plans = planDelivery(p, pod, { comp: bowling, myPlayers: ['ana'] });
    expect(plans.map((x) => [x.title, x.status, x.deliverable, x.selfBlocked])).toEqual([
      ['Equipos (scratch)', 'listo', true, false],
      ['Individual (handicap)', 'listo', true, false],
      ['Individual (handicap)', 'vacio', false, false],
      ['Individual (handicap)', 'empate_multiple', false, false],
    ]);
    // El admin que ganó se entrega su premio: con el orden del servidor no hay «a sí mismo».
    expect(plans[1].selfBlocked).toBe(false);
    expect(plans.map((x) => planNotes(x, plans).map((n) => n.text))).toEqual([
      [],
      ['Empate: se la llevan los dos.'],
      ['Nadie: empate en el 1.er lugar.'],
      ['Más de 3 empatados: no se entrega sola.'],
    ]);
  });

  it('una unidad con más de 100 jugadores (el tope de la base) no se entrega; con 100 sí', () => {
    const club = (n: number) => unit('c:C1', 'Delfines', Array.from({ length: n }, (_, i): [string, string] => [`s${i}`, `Nadador ${i}`]));
    const q = prize([slot('S1', 'equipo', 1)]);
    const [big] = planDelivery(q, podium([srv('S1', { units: [club(101)] })]), { comp: bowling });
    expect(big).toMatchObject({ status: 'listo', tooMany: true, deliverable: false });
    expect(planNotes(big, [big]).map((n) => n.text)).toEqual(['Son más de 100 jugadores: no se puede entregar.']);
    expect(payloadOf([big], initialPicks([big]))).toEqual([]);
    expect(planDelivery(q, podium([srv('S1', { units: [club(100)] })]), { comp: bowling })[0]).toMatchObject({ tooMany: false, deliverable: true });
  });

  it('marcados por defecto, desmarcar (siempre queda uno) y lo que se manda', () => {
    const plans = planDelivery(p, pod, { comp: bowling });
    let picks = initialPicks(plans);
    expect(picks.S1).toEqual({ on: true, players: { 't:T1': ['ana', 'luis', 'pedro'] } });
    expect(payloadOf(plans, picks)).toEqual([
      { slotId: 'S1', units: [{ ref: 't:T1', players: ['ana', 'luis', 'pedro'] }] },
      { slotId: 'S2', units: [{ ref: 'p:ana', players: ['ana'] }, { ref: 'p:luis', players: ['luis'] }] },
    ]);
    picks = togglePlayer(picks, 'S1', 't:T1', 'pedro');
    expect(picks.S1.players['t:T1']).toEqual(['ana', 'luis']);
    expect(togglePlayer(picks, 'S2', 'p:ana', 'ana')).toBe(picks);
    // Apagado sin nadie que lo tenga: no se manda.
    picks = toggleSlot(picks, plans[1], false);
    expect(payloadOf(plans, picks).map((s) => s.slotId)).toEqual(['S1']);
    expect(prizesGiven(plans, payloadOf(plans, picks))).toBe(1);
    expect(hasChanges(plans, payloadOf(plans, picks))).toBe(true);
  });

  it('corregir: lo desmarcado a mano por el dueño sale desmarcado; el cambio se ve (antes → ahora); apagar quita', () => {
    const q = prize([slot('S1', 'equipo', 1, { deliveredAt: '2026-10-12T20:00:00Z', editableUntil: '2026-10-26T20:00:00Z' }), slot('S2', 'individual', 1)]);
    const pd = podium([srv('S1', { units: [strikers], holders: [{ awardId: 'a1', playerId: 'ana', teamId: 'T1' }, { awardId: 'a2', playerId: 'luis', teamId: 'T1' }], withdrawn: ['pedro'] }), srv('S2', { status: 'vacio', holders: [{ awardId: 'a3', playerId: 'luis', teamId: null }] })]);
    const plans = planDelivery(q, pd, { comp: bowling, now: Date.parse('2026-10-13T00:00:00Z') });
    const picks = initialPicks(plans);
    expect(picks.S1.players['t:T1']).toEqual(['ana', 'luis']);
    let payload = payloadOf(plans, picks);
    // Ya lo tienen los mismos: no cambia; y al 1.º individual ya no le toca a nadie (se le quita a Luis).
    expect(payload).toEqual([
      { slotId: 'S1', units: [{ ref: 't:T1', players: ['ana', 'luis'] }] },
      { slotId: 'S2', units: [] },
    ]);
    expect(changeOf(plans[0], payload)).toEqual({ before: ['ana', 'luis'], after: ['ana', 'luis'], add: [], remove: [] });
    expect(changeOf(plans[1], payload)).toEqual({ before: ['luis'], after: [], add: [], remove: ['luis'] });
    // Volver a marcar a Pedro se lo da; apagar el lugar se lo quita a todos.
    payload = payloadOf(plans, togglePlayer(picks, 'S1', 't:T1', 'pedro'));
    expect(changeOf(plans[0], payload).add).toEqual(['pedro']);
    payload = payloadOf(plans, toggleSlot(picks, plans[0], false));
    expect(payload[0]).toEqual({ slotId: 'S1', units: [] });
  });

  it('cerrado para un admin (premios cerrados o 14 días): no se toca; el dueño sí', () => {
    const q = prize([slot('S1', 'equipo', 1, { deliveredAt: '2026-10-01T00:00:00Z', editableUntil: '2026-10-15T00:00:00Z' })]);
    const pd = podium([srv('S1', { units: [strikers], holders: [{ awardId: 'a1', playerId: 'ana', teamId: 'T1' }] })]);
    const late = Date.parse('2026-10-20T00:00:00Z');
    const admin = planDelivery(q, pd, { comp: bowling, now: late });
    expect(admin[0]).toMatchObject({ locked: true, deliverable: false });
    expect(planNotes(admin[0], admin)[0].text).toBe('Ya no se puede corregir: solo el dueño lo cambia.');
    expect(payloadOf(admin, initialPicks(admin))).toEqual([]);
    expect(planDelivery(q, pd, { comp: bowling, now: late, owner: true })[0]).toMatchObject({ locked: false, deliverable: true });
    expect(planDelivery(prize(q.slots, { closedAt: '2026-10-02T00:00:00Z' }), pd, { comp: bowling, now: Date.parse('2026-10-03T00:00:00Z') })[0].locked).toBe(true);
  });

  it('equipos con alineaciones: por defecto solo quienes jugaron (la plantilla, desmarcada); sin alineaciones, todos', () => {
    // Un campeón de fútbol: 2 jugaron en el cuadro, 2 de la plantilla no (y Rosa lo tiene de antes: sigue marcada).
    const champs: PodiumUnit = {
      ref: 't:T1',
      name: 'Los Leones',
      teamId: 'T1',
      players: [
        { id: 'ana', name: 'Ana', played: true },
        { id: 'luis', name: 'Luis', played: true },
        { id: 'pedro', name: 'Pedro', played: false },
        { id: 'rosa', name: 'Rosa', played: false },
      ],
    };
    const noLineup: PodiumUnit = { ...champs, ref: 't:T2', teamId: 'T2', players: champs.players.map((x) => ({ ...x, played: false })) };
    expect(defaultPlayers(champs)).toEqual(['ana', 'luis']);
    expect(defaultPlayers(noLineup)).toEqual(['ana', 'luis', 'pedro', 'rosa']);
    expect(defaultPlayers(strikers)).toEqual(['ana', 'luis', 'pedro']);
    const q = prize([slot('K1', 'equipo', 1), slot('K2', 'equipo', 2)]);
    const pd = podium([srv('K1', { units: [champs], holders: [{ awardId: 'a1', playerId: 'rosa', teamId: 'T1' }] }), srv('K2', { units: [noLineup] })]);
    const plans = planDelivery(q, pd, { comp: teamKo });
    const picks = initialPicks(plans);
    expect(picks.K1.players['t:T1']).toEqual(['ana', 'luis', 'rosa']);
    expect(picks.K2.players['t:T2']).toEqual(['ana', 'luis', 'pedro', 'rosa']);
    // Pedro (de la plantilla, no jugó) se marca a mano.
    expect(togglePlayer(picks, 'K1', 't:T1', 'pedro').K1.players['t:T1']).toEqual(['ana', 'luis', 'rosa', 'pedro']);
    // Apagar y prender: vuelven los de por defecto.
    const off = toggleSlot({ ...picks, K1: { on: false, players: {} } }, plans[0], true);
    expect(off.K1.players['t:T1']).toEqual(['ana', 'luis']);
  });

  it('el 3.º de un cuadro con dos unidades son los semifinalistas, no un empate', () => {
    const c = unit('t:C', 'Equipo C', [['c1', 'C1']], 'C');
    const d = unit('t:D', 'Equipo D', [['d1', 'D1']], 'D');
    const q = prize([slot('P3', 'equipo', 3)]);
    for (const comp of [playoff, { kind: 'racket_tourney' as const }]) {
      const plans = planDelivery(q, podium([srv('P3', { units: [c, d] })]), { comp });
      expect(plans[0].bracket).toBe(true);
      expect(planNotes(plans[0], plans).map((n) => n.text)).toEqual(['Se la llevan los dos semifinalistas.']);
    }
    const bowl = planDelivery(q, podium([srv('P3', { units: [c, d] })]), { comp: bowling });
    expect(planNotes(bowl[0], bowl).map((n) => n.text)).toEqual(['Empate: se la llevan los dos.']);
  });

  it('podio del teléfono (golf): lo arma el proveedor; quien entrega no se lo da a sí mismo; sin terminar, sin resultado', () => {
    const q = prize([slot('G1', 'individual', 1), slot('G2', 'individual', 2)]);
    const phone = (s: { place: number }) => (s.place === 1 ? { status: 'listo' as const, units: [ana] } : { status: 'listo' as const, units: [luis] });
    const pd = podium([srv('G1', { status: 'telefono', verified: false }), srv('G2', { status: 'telefono', verified: false })], false);
    const plans = planDelivery(q, pd, { comp: golf, phone, myPlayers: ['ana'] });
    expect(plans.map((x) => [x.title, x.status, x.selfBlocked, x.deliverable])).toEqual([
      ['Individual', 'listo', true, false],
      ['Individual', 'listo', false, true],
    ]);
    expect(planNotes(plans[0], plans)[0].text).toBe('Estás en este podio: lo entrega otro admin o el dueño.');
    expect(payloadOf(plans, initialPicks(plans))).toEqual([{ slotId: 'G2', units: [{ ref: 'p:luis', players: ['luis'] }] }]);
    // Sin proveedor (o sin terminar): sin resultado.
    const none = planDelivery(q, podium([srv('G1', { status: 'telefono', verified: false, finished: false })], false), { comp: golf });
    expect(none.map((x) => [x.status, x.deliverable])).toEqual([
      ['sin_resultado', false],
      ['sin_resultado', false],
    ]);
    expect(planNotes(none[0], none)[0].text).toBe('Todavía sin resultado final.');
  });
});

describe('textos de la entrega', () => {
  it('el aviso al terminar', () => {
    expect(deliveredText({ added: 8, revoked: 0, notified: 5 }, 3)).toBe('Entregaste 3 premios a 8 jugadores. Les avisamos.');
    expect(deliveredText({ added: 1, revoked: 0, notified: 0 }, 1)).toBe('Entregaste 1 premio a 1 jugador.');
    expect(deliveredText({ added: 1, revoked: 1, notified: 1 }, 1)).toBe('Corregiste los premios: 1 jugador lo recibe y a 1 se le quitó. Le avisamos.');
    expect(deliveredText({ added: 0, revoked: 2, notified: 0 }, 0)).toBe('Quitaste el premio a 2 jugadores.');
    expect(deliveredText({ added: 0, revoked: 0, notified: 0 }, 0)).toBe('No había nada que cambiar.');
  });

  it('nombres y quién ganó', () => {
    expect(namesLine(['Ana'])).toBe('Ana');
    expect(namesLine(['Ana', 'Luis', 'Pedro'])).toBe('Ana, Luis y Pedro');
    expect(namesLine(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C y 2 más');
    expect(unitLine(strikers)).toBe('Los Strikers · Ana, Luis y Pedro');
    expect(unitLine(ana)).toBe('Ana');
  });
});
