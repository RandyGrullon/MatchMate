/**
 * Reclamos de jugadores (pantallas): la lógica de src/components/claims/logic.ts, «¿Quién eres?» con el pedido
 * pendiente y los avisos de la campana (claimNotices → GenericNotice → buildNotices).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { asGenericNotice, claimNotices, type PlayerClaim } from '../../lib/data/claims';
import { buildNotices } from '../../lib/notifications';
import type { League } from '../../lib/types';
import { WhoAreYouList, joinClaimMessage as fromWho } from '../league/WhoAreYou';
import { EMPTY_HISTORY, ago, bannerState, historyText, historyTotal, joinClaimMessage, pendingCount, pendingFor, statusLabel } from './logic';

const NOW = Date.parse('2026-09-28T15:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const DAY = 86400_000;

const claim = (id: string, extra: Partial<PlayerClaim> = {}): PlayerClaim => ({
  id,
  leagueId: 'l1',
  playerId: `p-${id}`,
  userId: 'u-ana',
  status: 'pending',
  note: null,
  claimantName: 'Ana Pérez',
  playerName: 'Ana P.',
  requestedAt: iso(2 * DAY),
  changedAt: iso(2 * DAY),
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  ...extra,
});

describe('lo que jugó un jugador', () => {
  it('sin nada: «Todavía no ha jugado»', () => {
    expect(historyText(EMPTY_HISTORY)).toBe('Todavía no ha jugado');
    expect(historyTotal(EMPTY_HISTORY)).toBe(0);
  });
  it('solo lo que tiene, en singular o plural', () => {
    expect(historyText({ entries: 12, matches: 1, golfCards: 0, swims: 0 })).toBe('12 eventos con juegos · 1 partido');
    expect(historyText({ entries: 0, matches: 0, golfCards: 1, swims: 3 })).toBe('1 tarjeta de golf · 3 pruebas de natación');
    expect(historyTotal({ entries: 1, matches: 2, golfCards: 3, swims: 4 })).toBe(10);
  });
});

describe('pedidos del admin', () => {
  const list = [claim('a'), claim('b', { status: 'approved' }), claim('c', { userId: 'u-admin' }), claim('d', { playerId: 'p-x' })];
  it('cuenta los pendientes (sin los propios)', () => {
    expect(pendingCount(list)).toBe(3);
    expect(pendingCount(list, 'u-admin')).toBe(2);
    expect(pendingCount([])).toBe(0);
  });
  it('el pendiente de un jugador', () => {
    expect(pendingFor(list, 'p-x')?.id).toBe('d');
    expect(pendingFor(list, 'p-b')).toBeNull();
    expect(pendingFor(list, 'nadie')).toBeNull();
  });
  it('la marca de cada estado', () => {
    expect(statusLabel({ status: 'pending' })).toEqual({ text: 'Pendiente de aprobación', tone: 'warn' });
    expect(statusLabel({ status: 'approved' }).tone).toBe('ok');
    expect(statusLabel({ status: 'rejected' }).tone).toBe('danger');
    expect(statusLabel({ status: 'cancelled' }).text).toBe('Cancelado');
  });
  it('hace cuánto', () => {
    expect(ago(iso(20_000), NOW)).toBe('hace un momento');
    expect(ago(iso(5 * 60_000), NOW)).toBe('hace 5 min');
    expect(ago(iso(3 * 3600_000), NOW)).toBe('hace 3 h');
    expect(ago(iso(DAY + 1000), NOW)).toBe('hace 1 día');
    expect(ago(iso(4 * DAY), NOW)).toBe('hace 4 días');
    expect(ago(null, NOW)).toBe('');
    expect(ago('no es fecha', NOW)).toBe('');
  });
});

describe('inicio de la liga: «Mi reclamo» o «Busca tu nombre»', () => {
  const none = () => false;
  const base = { ownHistory: EMPTY_HISTORY, freeCount: 3, dismissed: none, now: NOW };
  it('pendiente: siempre se muestra (con cancelar)', () => {
    const c = claim('a');
    expect(bannerState({ ...base, claim: c, ownHistory: { ...EMPTY_HISTORY, entries: 5 } })).toEqual({ kind: 'pending', claim: c });
  });
  it('rechazado: una semana, hasta que lo cierre', () => {
    const c = claim('a', { status: 'rejected', decidedAt: iso(2 * DAY) });
    expect(bannerState({ ...base, claim: c }).kind).toBe('rejected');
    expect(bannerState({ ...base, claim: c, dismissed: (k) => k === 'rechazo:a' }).kind).toBe('search');
    expect(bannerState({ ...base, claim: { ...c, decidedAt: iso(9 * DAY) } }).kind).toBe('search');
  });
  it('aprobado: nada', () => {
    expect(bannerState({ ...base, claim: claim('a', { status: 'approved', decidedAt: iso(DAY) }) }).kind).toBe('none');
  });
  it('sin pedido: «Busca tu nombre» solo si su jugador no tiene nada y hay jugadores sin cuenta', () => {
    expect(bannerState({ ...base, claim: null }).kind).toBe('search');
    expect(bannerState({ ...base, claim: null, ownHistory: { ...EMPTY_HISTORY, matches: 1 } }).kind).toBe('none');
    expect(bannerState({ ...base, claim: null, ownHistory: null }).kind).toBe('none');
    expect(bannerState({ ...base, claim: null, freeCount: 0 }).kind).toBe('none');
    expect(bannerState({ ...base, claim: null, dismissed: (k) => k === 'buscar' }).kind).toBe('none');
  });
});

describe('«¿Quién eres?» con el pedido', () => {
  it('el toast al unirse', () => {
    expect(joinClaimMessage(null, null, 'p1', null)).toBeNull();
    expect(joinClaimMessage('p1', 'Beto', 'p1', null)).toBe('Listo: ahora eres Beto.');
    expect(joinClaimMessage('p1', 'Beto', 'propio', 'c1')).toMatch(/^Pediste ser Beto\. Queda pendiente de aprobación del admin/);
    expect(joinClaimMessage('p1', 'Beto', 'propio')).toMatch(/pendiente de aprobación/);
    expect(joinClaimMessage('p1', 'Beto', 'propio', null)).toMatch(/^Beto ya tiene cuenta o alguien más lo pidió/);
    expect(fromWho).toBe(joinClaimMessage);
  });
  it('elegir uno avisa que lo aprueba el admin; el ya pedido lleva «Pendiente de aprobación»', () => {
    const players = [
      { id: 'a', name: 'Ana P.' },
      { id: 'b', name: 'Beto' },
    ];
    const none = renderToString(h(WhoAreYouList, { players, value: null, onChange: () => {} }));
    expect(none).toContain('cuando el admin lo apruebe');
    expect(none).not.toContain('Pendiente de aprobación');
    const picked = renderToString(h(WhoAreYouList, { players, value: 'b', onChange: () => {} }));
    expect(picked).toContain('Queda pendiente de aprobación del admin');
    const waiting = renderToString(h(WhoAreYouList, { players, value: 'a', onChange: () => {}, pending: 'a' }));
    expect(waiting).toContain('Pendiente de aprobación');
    expect(waiting).not.toContain('Queda pendiente de aprobación del admin');
  });
});

describe('avisos de la campana', () => {
  const league = { id: 'l1', name: 'Liga Martes', kind: 'liga', visibility: 'public', sport: 'padel' } as unknown as League;
  const toGeneric = (uid: string, leagueClaims: PlayerClaim[], myClaims: PlayerClaim[]) =>
    claimNotices({ uid, leagueClaims, myClaims, now: NOW }).map((n) => ({
      ...asGenericNotice(n),
      category: n.kind === 'claim-request' ? ('admin' as const) : ('ligas' as const),
    }));

  it('al admin: por aprobar, en Admin, lleva a Admin › Reclamos con el nombre y el deporte de la liga', () => {
    const [n] = buildNotices([], [league], '2026-09-28', NOW, null, toGeneric('u-admin', [claim('a')], []));
    expect(n).toMatchObject({
      id: 'reclamo:a',
      title: 'Ana Pérez dice que es Ana P.',
      category: 'admin',
      to: '/l/l1/admin?tab=reclamos',
      leagueName: 'Liga Martes',
      sport: 'padel',
    });
  });
  it('a quien pidió: aprobado o rechazado, en Mis ligas', () => {
    const mine = [
      claim('a', { status: 'approved', decidedAt: iso(DAY) }),
      claim('b', { status: 'rejected', decidedAt: iso(2 * DAY), decisionNote: 'No eres tú' }),
      claim('c', { status: 'rejected', decidedAt: iso(20 * DAY) }),
    ];
    const list = buildNotices([], [league], '2026-09-28', NOW, null, toGeneric('u-ana', [], mine));
    expect(list.map((n) => [n.id, n.category, n.to])).toEqual([
      ['reclamo-ok:a', 'ligas', '/l/l1'],
      ['reclamo-no:b', 'ligas', '/l/l1'],
    ]);
    expect(list[1].body).toBe('No eres tú');
  });
  it('una categoría que no existe queda en Social', () => {
    const bad = { ...toGeneric('u-admin', [claim('a')], [])[0], category: 'toString' as never };
    expect(buildNotices([], [league], '2026-09-28', NOW, null, [bad])[0].category).toBe('social');
  });
});
