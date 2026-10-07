/**
 * Perfil global (Yo › «Por liga y temporada», /perfil?tab=estadisticas): los números de aquí (promedio, puntaje, por
 * liga y por año) son del boliche. Una cuenta que juega pádel, golf o baloncesto no ve esos números en cero: ve sus
 * ligas con un link a «Mis números» de cada una. Lo que suma (bowlingNumbers) también lo usa Yo arriba.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { queryClient } from '../lib/data/client';
import type { SoloSession } from '../lib/data/solo';
import type { League, Member } from '../lib/types';
import type { BowlingEvent, Entry } from '../lib/types';
import { bowlingNumbers, GlobalStats, ProfileStats, splitBySport } from './GlobalStats';

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
    expect(t).toContain('Boliche, todo junto');
    expect(t).toContain('Puntaje total');
    expect(t).toContain('Otros deportes');
    expect(html).toContain('href="/l/pad/perfil"');
    // «Por liga» del boliche no incluye la de pádel (no tiene promedio).
    expect(html.match(/href="\/l\/pad\/perfil"/g)).toHaveLength(1);
    expect(html).toContain('href="/l/bol/perfil"');
  });

  it('solo boliche: como siempre', () => {
    queryClient.setQueryData('across:bol:p-bol', [{ lid: 'bol', playerId: 'p-bol', entries: [], events: [] }]);
    const t = text(render([member('bol')], leagues));
    expect(t).toContain('Todo junto');
    expect(t).not.toContain('Boliche, todo junto');
    expect(t).toContain('Puntaje total');
    expect(t).toContain('Por liga');
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
    expect(t).toContain('Puntaje total');
    expect(t).toContain('730');
    expect(t).toContain('Juegos sueltos');
    expect(html).toContain('href="/juegos-sueltos"');
    expect(t).toContain('4 juegos · puntaje 730 · mejor 210');
    expect(t).toContain('4 juegos sueltos');
    expect(t).not.toMatch(/\d+ ligas?\b/);
    expect(t).not.toContain('torneos');
    // Por año: 2026 con 3 juegos (promedio 193) y 2025 con 1.
    expect(t).toContain('2026 3 193 210');
    expect(t).toContain('2025 1 150 150');
    // La gráfica y los tiros ya no van aquí: están arriba en Yo.
    expect(t).not.toContain('Últimos 4 juegos');
    expect(t).not.toContain('Por cuadros');
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

  it('con cuadros: los juegos que cuentan y sus cuadros (los que cuadran con el puntaje) para la tendencia y los tiros de Yo', () => {
    const perfect = { rolls: Array.from({ length: 12 }, () => 10) };
    const s = { ...solo('b', '2026-09-20', [300, 290, 200]), frames: { '0': perfect, '1': perfect } };
    const n = bowlingNumbers({ across: [], links: [], names: new Map(), solo: [solo('a', '2026-08-01', [150]), s], today: '2026-10-07' });
    expect(n.games.map((g) => g.score)).toEqual([150, 300, 290, 200]);
    // El 290 no cuadra con 12 strikes: solo cuenta el 300.
    expect(n.frames).toHaveLength(1);
    expect(n.games[1].label).toMatch(/^Juego suelto · J1 · 20 /);
    expect(n.solo?.games).toBe(4);
  });

  it('sin ligas ni juegos sueltos: invita a anotar uno', () => {
    const html = renderStats([], [], []);
    expect(text(html)).toContain('anota un juego suelto');
    expect(html).toContain('href="/juegos-sueltos"');
  });
});

describe('lo que suma Yo (bowlingNumbers)', () => {
  const ev = (id: string, date: string, extra: Partial<BowlingEvent> = {}): BowlingEvent => ({
    id,
    type: 'practica',
    name: '',
    date,
    games: 3,
    hcpBase: 0,
    hcpPercent: 0,
    teams: {},
    playerCount: 1,
    ...extra,
  });
  const en = (eventId: string, scores: (number | null)[], photos: (string | null)[], extra: Partial<Entry> = {}): Entry =>
    ({ id: `en-${eventId}`, eventId, playerId: 'p', teamId: null, average: 0, handicapOverride: null, scores, photos, ...extra }) as Entry;
  const names = new Map([['bol', 'Liga Norte']]);

  it('asistencia: desde el primer evento al que fue hasta hoy (el de hoy solo si ya jugó); lo por aprobar no cuenta', () => {
    const events = [ev('e0', '2026-09-08'), ev('e1', '2026-09-15'), ev('e2', '2026-09-22'), ev('e3', '2026-09-29'), ev('e4', '2026-10-06'), ev('e5', '2026-10-07'), ev('e6', '2026-10-13')];
    const entries = [
      en('e1', [190, 200], ['f', 'f']),
      // Fue, pero sus juegos están por aprobar: no cuenta como asistencia.
      en('e2', [180], [null]),
      en('e4', [210], ['f']),
    ];
    const n = bowlingNumbers({ across: [{ lid: 'bol', entries, events }], links: [{ lid: 'bol' }], names, solo: [], today: '2026-10-07' });
    // e1..e4 (hoy, e5, todavía no juega; e0 fue antes de que llegara; e6 no ha pasado).
    expect(n.attended).toBe(2);
    expect(n.held).toBe(4);
    expect(n.all.games).toBe(3);
    expect(n.all.pending).toBe(1);
    expect(n.practices).toBe(2);
    expect(n.tournaments).toBe(0);
    expect(n.perLeague).toEqual([{ lid: 'bol', name: 'Liga Norte', stats: expect.objectContaining({ games: 3, autoAverage: 200 }) }]);
  });

  it('el handicap del último torneo con handicap en que está inscrito (con su promedio de ahora si entró sin promedio)', () => {
    const events = [ev('e1', '2026-09-15'), ev('t1', '2026-10-24', { type: 'torneo', hcpBase: 220, hcpPercent: 80 })];
    const base = { across: [], links: [{ lid: 'bol' }], names, solo: [], today: '2026-10-07' };
    const inscrito = bowlingNumbers({ ...base, across: [{ lid: 'bol', events, entries: [en('e1', [180, 190, 200], ['f', 'f', 'f']), en('t1', [], [])] }] });
    // (220 - 190) * 80% = 24.
    expect(inscrito.hcp).toBe(24);
    const fijo = bowlingNumbers({ ...base, across: [{ lid: 'bol', events, entries: [en('t1', [], [], { handicapOverride: 10, average: 150 })] }] });
    expect(fijo.hcp).toBe(10);
    expect(bowlingNumbers({ ...base, across: [{ lid: 'bol', events, entries: [en('e1', [180], ['f'])] }] }).hcp).toBeNull();
  });
});
