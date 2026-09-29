/**
 * Perfil global (/perfil): los números de aquí (promedio, puntaje, mejor serie) son del boliche. Una cuenta que
 * juega pádel, golf o baloncesto no ve esos números en cero: ve sus ligas con un link a «Mis números» de cada una.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { queryClient } from '../lib/data/client';
import type { SoloSession } from '../lib/data/solo';
import type { League, Member } from '../lib/types';
import { GlobalStats, ProfileStats, splitBySport } from './GlobalStats';

const league = (id: string, name: string, sport?: string, kind: League['kind'] = 'liga'): League => ({
  id,
  name,
  kind,
  visibility: 'private',
  ownerUid: 'o',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  ...(sport ? { sport } : {}),
});
const member = (lid: string, playerId: string | null = `p-${lid}`): Member => ({ id: `${lid}_u1`, leagueId: lid, uid: 'u1', name: 'Ana', role: 'member', playerId });

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const render = (memberships: Member[], leagues: League[]) =>
  renderToString(h(MemoryRouter, null, h(ProfileStats, { memberships, leagues })));

afterEach(() => queryClient.invalidateAll());

describe('perfil global por deporte', () => {
  const leagues = [
    league('bol', 'Liga Norte', 'bowling'),
    league('vieja', 'Liga de BowlingX'), // sin deporte = boliche
    league('pad', 'Pádel Club', 'padel'),
    league('golf', 'Golf del Club', 'golf', 'torneo'),
  ];

  it('separa las membresías del boliche de las ligas de otros deportes', () => {
    const { bowling, others } = splitBySport([member('golf'), member('bol'), member('pad'), member('vieja'), member('borrada')], leagues);
    expect(bowling.map((m) => m.leagueId)).toEqual(['bol', 'vieja', 'borrada']);
    // En el orden de los deportes del registro (pádel antes que golf).
    expect(others).toEqual([
      { lid: 'pad', name: 'Pádel Club', sport: 'padel', kind: 'liga' },
      { lid: 'golf', name: 'Golf del Club', sport: 'golf', kind: 'torneo' },
    ]);
  });

  it('solo otros deportes: sin números del boliche, con un link al perfil de cada liga', () => {
    const html = render([member('pad'), member('golf')], leagues);
    const t = text(html);
    expect(t).not.toContain('Promedio global');
    expect(t).not.toContain('Mejor serie');
    expect(t).not.toContain('puntaje y tu promedio');
    expect(t).toContain('Mis ligas');
    expect(t).toContain('Pádel Club');
    expect(t).toContain('Golf del Club');
    expect(html).toContain('href="/l/pad/perfil"');
    expect(html).toContain('href="/l/golf/perfil"');
  });

  it('boliche y otros deportes: los números del boliche y, aparte, las otras ligas', () => {
    queryClient.setQueryData('across:bol:p-bol', [{ lid: 'bol', playerId: 'p-bol', entries: [], events: [] }]);
    const html = render([member('bol'), member('pad')], leagues);
    const t = text(html);
    expect(t).toContain('Mis estadísticas de boliche');
    expect(t).toContain('Promedio global');
    expect(t).toContain('Otros deportes');
    expect(html).toContain('href="/l/pad/perfil"');
    // «Por liga» del boliche no incluye la de pádel (no tiene promedio).
    expect(html.match(/href="\/l\/pad\/perfil"/g)).toHaveLength(1);
    expect(html).toContain('href="/l/bol/perfil"');
  });

  it('solo boliche: como siempre', () => {
    queryClient.setQueryData('across:bol:p-bol', [{ lid: 'bol', playerId: 'p-bol', entries: [], events: [] }]);
    const t = text(render([member('bol')], leagues));
    expect(t).toContain('Mis estadísticas');
    expect(t).not.toContain('de boliche');
    expect(t).toContain('Promedio global');
    expect(t).not.toContain('Otros deportes');
  });
});

describe('perfil global con juegos sueltos', () => {
  const solo = (id: string, playedOn: string, scores: number[], venue = ''): SoloSession => ({
    id,
    userId: 'u1',
    playedOn,
    venue,
    note: '',
    scores,
    frames: null,
    shared: true,
    createdAt: null,
    updatedAt: null,
    likes: 0,
    likedByMe: false,
  });
  const renderStats = (memberships: Member[], leagues: League[], sessions: SoloSession[]) =>
    renderToString(h(MemoryRouter, null, h(GlobalStats, { memberships, leagues, solo: sessions })));

  it('solo juegos sueltos: los números, su fila en «Por liga» y cada año (sin ligas, torneos ni prácticas)', () => {
    const html = renderStats([], [], [solo('b', '2026-09-20', [210, 180, 190], 'Bolera Norte'), solo('a', '2025-12-01', [150])]);
    const t = text(html);
    expect(t).toContain('Promedio global');
    expect(t).toContain('Juegos sueltos');
    expect(html).toContain('href="/juegos-sueltos"');
    expect(t).toContain('4 juegos · puntaje 730 · mejor 210');
    expect(t).toContain('4 juegos sueltos');
    expect(t).not.toMatch(/\d+ ligas?\b/);
    expect(t).not.toContain('torneos');
    // Por año: 2026 con 3 juegos (promedio 193) y 2025 con 1.
    expect(t).toContain('2026 3 193 210');
    expect(t).toContain('2025 1 150 150');
    // La gráfica con los sueltos (del más viejo al más nuevo).
    expect(t).toContain('Últimos 4 juegos');
  });

  it('liga y juegos sueltos: suman juntos, pero la fila de la liga sigue con lo suyo', () => {
    queryClient.setQueryData('across:bol:p-bol', [
      {
        lid: 'bol',
        playerId: 'p-bol',
        entries: [{ id: 'en1', eventId: 'ev1', playerId: 'p-bol', teamId: null, average: 0, handicapOverride: null, scores: [200, 100], photos: ['sin-foto', 'sin-foto'] }],
        events: [{ id: 'ev1', type: 'practica', name: '', date: '2026-09-15', games: 2, hcpBase: 0, hcpPercent: 0, teams: {}, playerCount: 1 }],
      },
    ]);
    const t = text(renderStats([member('bol')], [league('bol', 'Liga Norte', 'bowling')], [solo('b', '2026-09-20', [210, 180, 190])]));
    expect(t).toContain('Liga Norte');
    expect(t).toContain('2 juegos · puntaje 300 · mejor 200');
    expect(t).toContain('3 juegos · puntaje 580 · mejor 210');
    // 2026: los 5 juegos juntos (880 / 5 = 176).
    expect(t).toContain('2026 5 176 210');
    expect(t).toContain('1 liga');
  });

  it('sin ligas ni juegos sueltos: invita a anotar uno', () => {
    const html = renderStats([], [], []);
    expect(text(html)).toContain('anota un juego suelto');
    expect(html).toContain('href="/juegos-sueltos"');
  });
});
