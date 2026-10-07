/**
 * Organizar de una liga dibujado sin navegador (renderToString) con datos de mentira: «Por hacer» (solo lo que tiene
 * algo, con su número) y «La liga» (cada fila a su pantalla de `/l/:lid/admin?tab=…`), en boliche, en otro deporte y en
 * un torneo; y la ficha y la hoja para cambiar de liga.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toLeaguePending, type LeaguePending } from '../../lib/data/organizer';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League, Member, Player, Submission } from '../../lib/types';
import { FeedbackProvider } from '../feedback';

const data = vi.hoisted(() => ({
  subs: [] as Partial<Submission>[],
  players: [] as Partial<Player>[],
  members: [] as Partial<Member>[],
  pending: null as LeaguePending | null,
  claims: 0,
  suggestions: [] as { id: string; text: string; read: boolean }[],
  events: [] as Record<string, unknown>[],
  reports: { open: 0, all: 0 },
  reviews: [] as { leagueId: string }[],
  screens: null as null | { adminTabs: { key: string; label: string; Component: () => null }[] },
  asked: [] as unknown[],
}));

vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' }, loading: false, isSuper: false }) }));
vi.mock('../../lib/data', async (orig) => ({
  ...(await orig<typeof import('../../lib/data')>()),
  useSubmissions: (lid?: string) => {
    data.asked.push(['subs', lid ?? null]);
    return { data: lid ? data.subs : [], loading: false, error: null };
  },
  usePlayers: (lid?: string) => ({ data: lid ? data.players : [], loading: false, error: null }),
  useLeagueMembers: (lid?: string) => ({ data: lid ? data.members : [], loading: false, error: null }),
}));
vi.mock('../../lib/data/organizer', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/organizer')>()),
  useLeaguePending: (lid: string | null) => ({ data: lid ? data.pending : null, loading: false, error: null }),
}));
vi.mock('../claims/data', () => ({ usePendingClaimCount: (lid: string | null) => (lid ? data.claims : 0) }));
vi.mock('../Notifications', () => ({
  useNotifications: () => ({ feeds: [{ lid: 'L1', suggestions: data.suggestions, events: data.events }] }),
}));
vi.mock('../../lib/data/reports', () => ({ useReportCounts: () => ({ data: data.reports, loading: false, error: null }) }));
vi.mock('../../lib/data/badges', () => ({ useBadgeNotices: () => ({ data: { reviews: data.reviews }, loading: false, error: null }) }));
vi.mock('../../sports/screens', async (orig) => ({
  ...(await orig<typeof import('../../sports/screens')>()),
  useSportScreens: (sport: string | null) => (sport ? data.screens : null),
}));
vi.mock('../home/LeagueCard', () => ({ LeagueLogo: ({ children }: { children: ReactNode }) => children }));

const { OrganizeHub } = await import('./Hub');
const { LeaguePickerChip, LeaguePickerSheet } = await import('./LeaguePicker');

const league = (over: Partial<League> = {}): League => ({
  id: 'L1',
  name: 'Liga de los martes',
  kind: 'liga',
  visibility: 'public',
  ownerUid: 'u1',
  venue: 'Bolera Sambil',
  schedule: 'Martes · 7:30 pm',
  seasonStart: '2026-09-01',
  seasonEnd: '2026-12-15',
  contactName: '',
  contactPhone: '',
  requirePhoto: true,
  sport: 'bowling',
  ...over,
});

const ctx = (over: Partial<League> = {}): LeagueCtx => ({
  lid: 'L1',
  league: league(over),
  member: { id: 'L1_u1', leagueId: 'L1', uid: 'u1', name: 'Ana Pérez', role: 'owner', playerId: 'p0' },
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: 'p0',
  base: '/l/L1',
});

const render = (value: LeagueCtx) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value }, h(OrganizeHub)))));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const empty = (url: string) => ({ count: 0, url, items: [] });
const pendingOf = (over: Record<string, unknown> = {}) =>
  toLeaguePending(
    {
      submissions: empty('/l/L1/admin?tab=aprobar'),
      disputes: empty('/l/L1/juegos'),
      overdue: empty('/l/L1/juegos'),
      claims: empty('/l/L1/admin?tab=reclamos'),
      waitlists: empty('/l/L1'),
      checklist: null,
      ...over,
    },
    'L1',
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T16:00:00.000Z'));
  data.players = [
    { id: 'p0', name: 'Ana Pérez' },
    { id: 'p1', name: 'Luis Martínez' },
    { id: 'p2', name: 'Sofía Rodríguez' },
    { id: 'p3', name: 'Pedro Gómez' },
    { id: 'p4', name: 'Carmen Díaz' },
    { id: 'p5', name: 'José Ramírez' },
  ];
  data.members = [{ id: 'L1_u1', uid: 'u1', name: 'Ana Pérez', role: 'owner', playerId: 'p0' }];
  data.subs = [
    { id: 's1', playerId: 'p2', scores: [null, 181], photoId: 'f1', createdAt: { toMillis: () => 1 } as Submission['createdAt'] },
    { id: 's2', playerId: 'p4', scores: [null, null, 199], photoId: 'f2', createdAt: { toMillis: () => 2 } as Submission['createdAt'] },
  ];
  data.pending = pendingOf({ submissions: { count: 2, url: '/l/L1/admin?tab=aprobar', items: [] } });
  data.claims = 0;
  data.suggestions = [{ id: 'n1', text: '¿Podemos jugar a las 8?', read: false }];
  data.events = [{ id: 'T1', type: 'torneo', name: 'Copa de octubre', date: '2026-10-24', teamSize: 3, teams: {} }];
  data.reports = { open: 0, all: 0 };
  data.reviews = [];
  data.screens = null;
  data.asked.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Organizar › Por hacer', () => {
  it('como el diseño: aprobar (con los nombres y los juegos), el buzón y el torneo por armar, con sus números', () => {
    const out = render(ctx());
    const t = text(out);
    expect(t).toContain('Por hacer');
    expect(t).toMatch(/Aprobar juegos Sofía 181 · Carmen 199 · con foto 2 Buzón «¿Podemos jugar a las 8\?» 1 Copa de octubre Armar equipos · sábado 24 oct/);
    expect(out).toContain('href="/l/L1/admin?tab=aprobar"');
    expect(out).toContain('aria-label="Aprobar juegos: 2"');
    expect(out).toContain('href="/l/L1/admin?tab=buzon"');
    expect(out).toContain('href="/l/L1/e/T1?tab=equipos"');
    // Aprobar va en ámbar (lo único «por aprobar»); el resto, gris.
    expect(out).toMatch(/bg-warn-soft text-warn[^>]*><svg[^>]*lucide-clipboard-check/);
    // El buzón con notas nuevas ya no se repite en «La liga».
    expect(t.match(/Buzón/g)).toHaveLength(1);
  });

  it('sin nada pendiente, «Por hacer» no sale y el buzón queda en «La liga»', () => {
    data.subs = [];
    data.pending = pendingOf();
    data.suggestions = [];
    data.events = [];
    const t = text(render(ctx()));
    expect(t).not.toContain('Por hacer');
    expect(t).toContain('Buzón Las notas que dejan los jugadores');
  });
});

describe('Organizar › La liga', () => {
  it('boliche: cada fila a su pantalla, con los datos de la liga', () => {
    const out = render(ctx());
    const t = text(out);
    expect(t).toContain('La liga');
    expect(t).toContain('Jugadores y miembros 6 jugadores · 1 con cuenta');
    expect(t).toContain('Temporada y fechas 1 sep – 15 dic · martes 7:30 pm');
    expect(t).toContain('Anotadores Quién anota por otros');
    expect(t).toContain('Ajustes de la liga Foto del marcador, logo, invitar');
    for (const tab of ['jugadores', 'temporada', 'avisar', 'insignias', 'liga']) expect(out).toContain(`href="/l/L1/admin?tab=${tab}"`);
    // Anotadores abre su hoja aquí mismo (un botón, no un link).
    expect(out).toMatch(/<button[^>]*aria-label="Anotadores: Quién anota por otros"/);
    expect(t.indexOf('Jugadores y miembros')).toBeLessThan(t.indexOf('Ajustes de la liga'));
  });

  it('otro deporte: lo suyo primero, «Miembros» si maneja a su gente, y sin «Aprobar juegos» (confirma en sus partidos)', () => {
    data.screens = { adminTabs: [{ key: 'parejas', label: 'Parejas y niveles', Component: () => null }] };
    const out = render(ctx({ sport: 'padel' }));
    const t = text(out);
    expect(t).not.toContain('Aprobar juegos');
    expect(data.asked).toContainEqual(['subs', null]);
    expect(t.indexOf('Parejas y niveles')).toBeLessThan(t.indexOf('Miembros'));
    expect(out).toContain('href="/l/L1/admin?tab=parejas"');
    expect(out).toContain('href="/l/L1/admin?tab=miembros"');
    expect(t).not.toContain('Jugadores y miembros');
    expect(t).toContain('Ajustes de la liga Datos, logo, invitar');
  });

  it('un torneo suelto: «El torneo», Fechas y sus nombres', () => {
    const t = text(render(ctx({ kind: 'torneo' })));
    expect(t).toContain('El torneo');
    expect(t).toContain('Fechas Suspender o mover un día');
    expect(t).toContain('Avisar a todo el torneo');
    expect(t).toContain('Ajustes del torneo');
  });

  it('los reportes: abiertos en «Por hacer»; si ya se revisaron, una fila al final', () => {
    data.reports = { open: 2, all: 3 };
    let t = text(render(ctx()));
    expect(t).toContain('Reportes 2 cosas reportadas por revisar 2');
    expect(t.match(/Reportes/g)).toHaveLength(1);
    data.reports = { open: 0, all: 3 };
    t = text(render(ctx()));
    expect(t).toContain('Reportes Lo que se reportó y cómo quedó');
  });
});

describe('la ficha y la hoja de ligas', () => {
  it('la ficha dice la liga y abre la hoja; la hoja, cada liga con lo que espera', () => {
    const chip = renderToString(h(LeaguePickerChip, { league: league(), onOpen: () => undefined }));
    expect(text(chip)).toContain('Liga de los martes');
    expect(chip).toContain('aria-label="Liga de los martes: cambiar de liga"');
    expect(chip).toContain('aria-haspopup="dialog"');
    const sheet = renderToString(
      h(LeaguePickerSheet, {
        open: true,
        onClose: () => undefined,
        leagues: [league(), league({ id: 'L2', name: 'Copa del club', kind: 'torneo' })],
        current: 'L1',
        onPick: () => undefined,
        onCreate: () => undefined,
      }),
    );
    const t = text(sheet);
    expect(t).toContain('Lo que organizas');
    // Lo mismo que suma «Por hacer»: 2 juegos por aprobar y 1 nota en el buzón.
    expect(t).toContain('Liga de los martes 2 juegos por aprobar · 1 nota en el buzón 3');
    expect(sheet).toContain('aria-label="Liga de los martes: 3 pendientes"');
    expect(t).toContain('Crear una liga o un torneo');
  });
});
