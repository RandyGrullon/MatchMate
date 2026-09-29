/**
 * Consola › Insignias (§6.6): «Por revisar» (hazañas vencidas, reportes y palabras bloqueadas) y «Motor» (cola,
 * trabajos que ya no se toman, historial y rareza) se dibujan sin navegador con la capa de datos simulada, con datos
 * y vacías.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../../components/feedback';

const state = vi.hoisted(() => ({ empty: false }));

const live = <T>(data: T, empty: T) => ({ data: state.empty ? empty : data, loading: false, error: null });

vi.mock('../../lib/data/badgeAdmin', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/data/badgeAdmin')>();
  const reports = real.toBadgeReports({
    open: 2,
    rows: [
      {
        id: 1,
        kind: 'insignia',
        reason: 'Ese juego no pasó',
        createdAt: '2026-10-01T12:00:00.000Z',
        sameTarget: 3,
        leagueId: 'L1',
        leagueName: 'Liga Los Pinos',
        reporterName: 'Sofi',
        award: { id: 'a1', key: 'bowling_games', sport: 'bowling', level: 2, periodKey: '-', status: 'firme', playerName: 'Ana', context: {} },
      },
      {
        id: 2,
        kind: 'diseno',
        reason: '',
        createdAt: '2026-10-02T12:00:00.000Z',
        leagueId: 'L1',
        leagueName: 'Liga Los Pinos',
        design: { id: 'd1', leagueId: 'L1', name: 'Rey del chisme', shape: 'shield', palette: 'oro', icon: 'trophy', status: 'activa' },
      },
    ],
  });
  const engine = real.toBadgeEngine({
    queue: { pending: 12, due: 4, locked: 1, dead: 1, notices: 3, oldestDue: '2026-10-05T16:00:00.000Z' },
    byKind: [{ kind: 'historial', pending: 10, dead: 0 }, { kind: 'resultado', pending: 2, dead: 1 }],
    dead: [{ id: 77, kind: 'historial', leagueName: 'Liga Los Pinos', ref: 'league:L1', attempts: 5, lastError: null, runAfter: 'x', createdAt: '2026-10-01T12:00:00.000Z' }],
    backfill: [{ runId: 'r1', dryRun: true, pending: 10, dead: 0 }],
    runs: [{ runId: 'r1', at: '2026-10-05T12:00:00.000Z', badges: 2, holders: 90 }],
    dryRun: { runId: 'r1', rows: [{ key: 'debut', sport: 'bowling', level: 0, holders: 80, base: 100, pct: 80 }, { key: 'bowling_games', sport: 'bowling', level: 1, holders: 10, base: 100, pct: 10 }] },
    periods: [{ kind: 'mes', scope: 'L1', periodKey: '2026-09', doneAt: '2026-10-03T08:00:00.000Z', awarded: 4 }],
  });
  const done = async () => 0;
  return {
    ...real,
    useBadgeReports: () => live(reports, { open: 0, rows: [] }),
    useBlockedTerms: () => live([{ term: 'feo', whole: true, createdAt: 'x' }], []),
    useBadgeEngine: () =>
      live(engine, { queue: { pending: 0, due: 0, locked: 0, dead: 0, notices: 0, oldestDue: null }, byKind: [], dead: [], backfill: [], runs: [], dryRun: null, periods: [] }),
    dismissBadgeReports: done,
    superRevokeBadge: async () => undefined,
    editBlockedTerms: async () => [],
    badgeJobs: done,
    startBackfill: async () => ({ runId: 'r2', dryRun: true, jobs: 3, leagues: 1, accounts: 2 }),
  };
});

vi.mock('../../lib/data/badges', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/data/badges')>();
  const review = real.toBadgeReview({
    id: 'rv1',
    key: 'bowling_perfect_game',
    sport: 'bowling',
    level: 0,
    periodKey: 'g:e1:0',
    leagueId: 'L1',
    leagueName: 'Liga Los Pinos',
    playerId: 'p1',
    playerName: 'Luis',
    refs: ['entry:e1:0'],
    context: { v: 1 },
    awardedAt: '2026-09-10T12:00:00.000Z',
    overdue: true,
  })!;
  return {
    ...real,
    useBadgeNotices: () => live({ awards: [], unseen: 0, reviews: [review], leagueAwards: [] }, real.EMPTY_NOTICES),
    useBadgeStats: () => live([{ key: 'debut', sport: 'bowling', level: 0, holders: 60, base: 100, pct: 60, rarity: 'comun' as const }], []),
  };
});

let BadgesSection: typeof import('./BadgesSection').default;

beforeAll(async () => {
  if (typeof navigator === 'undefined') vi.stubGlobal('navigator', { onLine: true });
  BadgesSection = (await import('./BadgesSection')).default;
}, 120_000);

beforeEach(() => {
  state.empty = false;
});

const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const render = (url: string) => text(renderToString(h(MemoryRouter, { initialEntries: [url] }, h(FeedbackProvider, null, h(BadgesSection)))));

describe('consola › insignias', () => {
  it('por revisar: hazañas vencidas, reportes con sus acciones y palabras bloqueadas', () => {
    const out = render('/superadmin/insignias');
    for (const t of ['Por revisar', 'Motor', 'Galería', 'Hazañas por confirmar', 'de Luis', 'Más de 14 días', 'Confirmar', 'No se pudo confirmar']) expect(out, t).toContain(t);
    for (const t of ['Reportes', 'Abiertos (2)', '«Ese juego no pasó»', '3 reportes', 'de Ana', 'Sofi', 'Retirar por fraude', 'Rey del chisme', 'Esconder diseño', 'Dejarla', 'Ver la liga'])
      expect(out, t).toContain(t);
    for (const t of ['Palabras bloqueadas', 'feo', '(entera)', 'Solo la palabra entera', 'Bloquear']) expect(out, t).toContain(t);
  });

  it('motor: la cola, lo que ya no se toma, el historial y la rareza contra la meta', () => {
    const out = render('/superadmin/insignias?vista=motor');
    for (const t of ['En cola', '12', 'Ya tocan', 'Ya no se toman', 'Avisos por salir', 'Historial: 10', 'Resultado: 2 · 1 sin tomar']) expect(out, t).toContain(t);
    for (const t of ['Trabajos que ya no se toman', '#77 · 5 intentos', 'Sin error guardado', 'Reintentar', 'Borrar']) expect(out, t).toContain(t);
    for (const t of ['Historial (la primera corrida)', 'En seco', 'Quedan 10 trabajos', 'Correr en seco', 'Correr de verdad']) expect(out, t).toContain(t);
    for (const t of ['Corrida en seco', '80 de 100', 'Rareza real', '60 de 100', 'Últimos periodos que corrieron', '4 dadas']) expect(out, t).toContain(t);
    expect(out).toMatch(/en su rango/);
  });

  it('vacías: cada panel dice lo suyo', () => {
    state.empty = true;
    const review = render('/superadmin/insignias');
    expect(review).toContain('No hay hazañas esperando');
    expect(review).toContain('No hay reportes abiertos');
    expect(review).toContain('La lista está vacía');
    const motor = render('/superadmin/insignias?vista=motor');
    expect(motor).toContain('Ninguno. Todo lo que entra a la cola se está aplicando.');
    expect(motor).toContain('«Correr de verdad» se habilita después de una corrida en seco.');
    expect(motor).not.toContain('Corrida en seco');
  });

  it('galería: se descarga al abrirla', () => {
    expect(render('/superadmin/insignias?vista=galeria')).toContain('mm-spin');
  });
});
