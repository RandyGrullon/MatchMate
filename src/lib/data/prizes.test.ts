import { describe, expect, it } from 'vitest';
import { BackendError } from '../backend/types';
import {
  anyDelivered,
  canDeliverPrizes,
  canPickPrizes,
  compareSlots,
  deliveryBatches,
  editableUntil,
  prizeCode,
  prizeDeadline,
  prizeErrorText,
  podiumLoadErrorText,
  prizeOpen,
  slotDelivered,
  slotKeyOf,
  toDeliverResult,
  toTournamentPodium,
  toTournamentPrize,
} from './prizes';

describe('de la base a la pantalla', () => {
  it('una premiación de la RPC (camelCase) con sus lugares en el orden de la base', () => {
    const p = toTournamentPrize({
      id: 'Z1',
      leagueId: 'L1',
      scope: 'evento',
      refId: 'E1',
      period: 'OCT 2026',
      closedAt: null,
      slots: [
        { id: 'S3', category: 'individual', division: '', label: '', place: 2, badgeId: 'B2', title: 'Individual (handicap)', winners: [], verified: false, deliveredAt: null },
        { id: 'S1', category: 'equipo', division: '', label: '', place: 1, badgeId: 'B1', title: 'Equipos (scratch)', verified: true, deliveredAt: '2026-10-12T22:00:00.000Z', editableUntil: '2026-10-26T22:00:00.000Z', winners: [{ ref: 't:T1', name: 'Los Strikers', teamId: 'T1', players: ['p1', 'p2', 3] }, { ref: '' }] },
        { id: 'S2', category: 'individual', division: '', label: '', place: 1, badgeId: 'B1' },
        { id: 'S9', category: 'otra', place: 1, badgeId: 'B1' },
        { id: 'S8', category: 'individual', place: 4, badgeId: 'B1' },
      ],
    })!;
    expect(p).toMatchObject({ id: 'Z1', leagueId: 'L1', scope: 'evento', refId: 'E1', period: 'OCT 2026', closedAt: null });
    expect(p.slots.map((s) => s.id)).toEqual(['S1', 'S2', 'S3']);
    expect(p.slots[0]).toMatchObject({ verified: true, editableUntil: '2026-10-26T22:00:00.000Z', winners: [{ ref: 't:T1', name: 'Los Strikers', teamId: 'T1', players: ['p1', 'p2'] }] });
    expect(anyDelivered(p)).toBe(true);
    expect(toTournamentPrize({ id: 'Z1', leagueId: 'L1', scope: 'otro', refId: 'E1' })).toBeNull();
    expect(toTournamentPrize(null)).toBeNull();
  });

  it('una fila de la tabla (snake_case) con las filas de sus lugares aparte: el plazo sale de la primera entrega', () => {
    const p = toTournamentPrize(
      { id: 'Z1', league_id: 'L1', scope: 'playoff', event_id: null, golf_tournament_id: null, playoff_id: 'P1', period: '', closed_at: '2026-10-20T00:00:00Z', closed_by: 'u1' },
      [{ id: 'S1', prize_id: 'Z1', category: 'equipo', division: '', label: '', place: 1, badge_id: 'B1', winners: [], verified: true, delivered_at: '2026-10-12T00:00:00.000Z', delivered_by: 'u1' }],
    )!;
    expect(p).toMatchObject({ scope: 'playoff', refId: 'P1', closedAt: '2026-10-20T00:00:00Z', closedBy: 'u1' });
    expect(p.slots[0]).toMatchObject({ badgeId: 'B1', title: '', deliveredBy: 'u1', editableUntil: '2026-10-26T00:00:00.000Z' });
    expect(editableUntil({ deliveredAt: null })).toBeNull();
  });

  it('la vista previa y el resultado de entregar', () => {
    const pod = toTournamentPodium({
      prizeId: 'Z1',
      kind: 'bowling',
      verified: true,
      slots: [
        {
          slotId: 'S1',
          verified: true,
          status: 'listo',
          finished: true,
          units: [{ ref: 't:T1', name: ' Los Strikers ', teamId: 'T1', players: [{ id: 'p1', name: 'Ana', played: true }, { id: 'p2', name: '', played: 'x' }, { name: 'x' }] }],
          holders: [{ awardId: 'a1', playerId: 'p1', teamId: 'T1' }, { awardId: '' }],
          withdrawn: ['p2'],
        },
        { slotId: 'S2', status: 'raro' },
        { status: 'listo' },
      ],
    })!;
    expect(pod.slots).toHaveLength(2);
    expect(pod.slots[0]).toEqual({
      slotId: 'S1',
      verified: true,
      status: 'listo',
      finished: true,
      units: [{ ref: 't:T1', name: 'Los Strikers', teamId: 'T1', players: [{ id: 'p1', name: 'Ana', played: true }, { id: 'p2', name: 'Jugador' }] }],
      holders: [{ awardId: 'a1', playerId: 'p1', teamId: 'T1' }],
      withdrawn: ['p2'],
    });
    expect(pod.slots[1]).toMatchObject({ status: 'sin_resultado', finished: false, units: [] });
    expect(toTournamentPodium({ prizeId: 'Z1', kind: 'otro' })?.kind).toBeNull();
    expect(toDeliverResult({ added: 3, revoked: '1', unchanged: 2, notified: 1, prize: null })).toEqual({ added: 3, revoked: 1, unchanged: 2, notified: 1, prize: null });
    expect(toDeliverResult(null)).toEqual({ added: 0, revoked: 0, unchanged: 0, notified: 0, prize: null });
  });
});

describe('ayudas', () => {
  const slot = (deliveredAt: string | null) => ({ deliveredAt, editableUntil: editableUntil({ deliveredAt }) });

  it('abierta lugar por lugar: mientras quede uno sin entregar o en sus 14 días (o hasta cerrar); el próximo plazo', () => {
    const p = { closedAt: null, slots: [slot('2026-10-12T00:00:00Z'), slot('2026-10-05T00:00:00Z'), slot(null)] };
    expect(prizeDeadline(p)).toBe('2026-10-19T00:00:00.000Z');
    expect(prizeOpen(p, Date.parse('2026-10-18T00:00:00Z'))).toBe(true);
    // El lugar del 5 ya se venció, pero el del 12 sigue y el tercero no se entregó: se sigue entregando.
    expect(prizeOpen(p, Date.parse('2026-10-20T00:00:00Z'))).toBe(true);
    expect(prizeDeadline(p, Date.parse('2026-10-20T00:00:00Z'))).toBe('2026-10-26T00:00:00.000Z');
    // Sin nada por entregar y todo vencido: solo el dueño.
    expect(prizeOpen({ closedAt: null, slots: p.slots.slice(0, 2) }, Date.parse('2026-10-27T00:00:00Z'))).toBe(false);
    expect(prizeDeadline({ slots: p.slots.slice(0, 2) }, Date.parse('2026-10-27T00:00:00Z'))).toBeNull();
    // Solo un lugar sin entregar (después de que otro se venció): abierta.
    expect(prizeOpen({ closedAt: null, slots: [slot('2026-10-05T00:00:00Z'), slot(null)] }, Date.parse('2026-10-27T00:00:00Z'))).toBe(true);
    expect(prizeOpen({ ...p, closedAt: '2026-10-13T00:00:00Z' }, Date.parse('2026-10-14T00:00:00Z'))).toBe(false);
    expect(prizeDeadline({ slots: [slot(null)] })).toBeNull();
  });

  it('un lugar está entregado mientras tenga ganadores (uno que se quitó entero, no)', () => {
    const w = [{ ref: 'p:ana', name: 'Ana', teamId: null, players: ['ana'] }];
    expect(slotDelivered({ deliveredAt: '2026-10-12T00:00:00Z', winners: w })).toBe(true);
    expect(slotDelivered({ deliveredAt: '2026-10-12T00:00:00Z', winners: [] })).toBe(false);
    expect(slotDelivered({ deliveredAt: null, winners: [] })).toBe(false);
    expect(anyDelivered({ slots: [{ deliveredAt: '2026-10-12T00:00:00Z', winners: [] }] as never })).toBe(false);
  });

  it('clave y orden de los lugares', () => {
    expect(slotKeyOf({ category: 'pareja', division: 'A', place: 2 })).toBe('pareja|A|2');
    const list = [
      { category: 'individual' as const, division: 'M', place: 1 as const },
      { category: 'individual' as const, division: '', place: 2 as const },
      { category: 'pareja' as const, division: 'B', place: 1 as const },
      { category: 'equipo' as const, division: '', place: 3 as const },
    ];
    expect([...list].sort(compareSlots).map(slotKeyOf)).toEqual(['equipo||3', 'pareja|B|1', 'individual||2', 'individual|M|1']);
  });

  it('entregas en tandas de hasta 300 jugadores sin partir un lugar (repetidos cuentan uno)', () => {
    const ids = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${tag}${i}`);
    const slot = (id: string, ...units: string[][]) => ({ slotId: id, units: units.map((players, i) => ({ ref: `c:${id}${i}`, players })) });
    const club1 = slot('S1', ids('a', 100), ids('b', 60));
    const club2 = slot('S2', [...ids('c', 90), 'c0', 'c1']);
    const club3 = slot('S3', ids('d', 80));
    const quitar = slot('S4');
    const solo = slot('S5', ['e0']);
    const shape = (b: ReturnType<typeof deliveryBatches>) => b.map((x) => x.map((s) => s.slotId));
    // 160 + 90 = 250; con 80 más pasaría de 300: otra tanda. Quitar (0) y uno solo caben con el club 3.
    expect(shape(deliveryBatches([club1, club2, club3, quitar, solo]))).toEqual([['S1', 'S2'], ['S3', 'S4', 'S5']]);
    expect(shape(deliveryBatches([solo, quitar]))).toEqual([['S5', 'S4']]);
    expect(deliveryBatches([])).toEqual([[]]);
    // Un lugar solo nunca se parte, aunque pase del tope.
    expect(shape(deliveryBatches([club1, club2], 100))).toEqual([['S1'], ['S2']]);
  });

  it('permisos: elige quien diseña insignias; entrega también un admin', () => {
    const admin = { isOwner: false, isAdmin: true, member: { role: 'admin' as const, badgeMaker: false }, league: { badgeMakers: 'owner' as const } };
    expect([canPickPrizes(admin), canDeliverPrizes(admin)]).toEqual([false, true]);
    expect(canPickPrizes({ ...admin, league: { badgeMakers: 'admins' } })).toBe(true);
    const chosen = { isOwner: false, isAdmin: false, member: { role: 'member' as const, badgeMaker: true }, league: { badgeMakers: 'chosen' as const } };
    expect([canPickPrizes(chosen), canDeliverPrizes(chosen)]).toEqual([true, true]);
    const player = { ...chosen, member: { role: 'member' as const, badgeMaker: false } };
    expect([canPickPrizes(player), canDeliverPrizes(player)]).toEqual([false, false]);
  });

  it('los errores de las RPC en palabras (y lo demás con el de siempre)', () => {
    const fail = (msg: string, kind: ConstructorParameters<typeof BackendError>[1] = 'validation', code: string | null = 'P0001') => new BackendError(msg, kind, code);
    expect(prizeCode(fail('ya_entregado'))).toBe('ya_entregado');
    expect(prizeCode(fail('no_permitido', 'permission', '42501'))).toBe('no_permitido');
    expect(prizeCode(fail('rate_limited', 'rate_limited'))).toBe('rate_limited');
    expect(prizeCode(fail('Failed to fetch', 'network', null))).toBeNull();
    expect(prizeErrorText(fail('podio_cambio'))).toBe('El podio cambió mientras mirabas. Vuelve a cargarlo.');
    expect(prizeErrorText(fail('a_si_mismo'))).toBe('Estás en ese podio. Pídele a otro admin o al dueño que entregue ese premio.');
    expect(prizeErrorText(fail('sin_resultado'))).toBe('Todavía no hay resultado final para ese premio.');
    expect(prizeErrorText(fail('rate_limited', 'rate_limited'))).toBe('Demasiados cambios seguidos. Prueba en un rato.');
    expect(prizeErrorText(fail('x', 'network', null))).toBe('Sin conexión. Intenta de nuevo cuando vuelva la señal.');
    expect(prizeErrorText(fail('x', 'network', null), () => 'otro')).toBe('otro');
    // Cargar el podio es una lectura: nunca «No se pudo guardar».
    expect(podiumLoadErrorText(fail('boom', 'unknown', 'XX000'))).toBe('No se pudo cargar el podio. Intenta de nuevo.');
    expect(podiumLoadErrorText(fail('x', 'network', null))).toBe('Sin conexión. Intenta de nuevo cuando vuelva la señal.');
    expect(podiumLoadErrorText(fail('no_permitido', 'permission', '42501'))).toBe('No tienes permiso para esto.');
  });
});
