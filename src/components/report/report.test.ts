/**
 * Reportes en el cliente: lo que manda la base a los tipos (src/lib/data/reports.ts), los errores en palabras, el
 * botón «Reportar» (no sale en lo propio), el modal con los motivos y cómo se ve un reporte en las listas. Sin
 * navegador (renderToString).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from '../../lib/backend/types';
import { isReportClosedError, REPORT_REASONS, reportErrorText, toReport, toReportPage, type Report } from '../../lib/data/reports';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({ uid: 'u-me' as string | null }));

vi.mock('../../lib/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/auth')>();
  return {
    ...real,
    useAuth: () => ({
      user: state.uid ? { uid: state.uid, email: 'yo@x.com', displayName: 'Yo' } : null,
      profile: null,
      isSuper: false,
      loading: false,
      recovering: false,
    }),
  };
});

let ReportButton: typeof import('./ReportButton').ReportButton;
let ReportModal: typeof import('./ReportModal').default;
let ReportItem: typeof import('./ReportItem').ReportItem;
let resolvedText: typeof import('./ReportItem').resolvedText;

beforeAll(async () => {
  if (typeof navigator === 'undefined') vi.stubGlobal('navigator', { onLine: true, userAgent: 'node' });
  ({ ReportButton } = await import('./ReportButton'));
  ({ default: ReportModal } = await import('./ReportModal'));
  ({ ReportItem, resolvedText } = await import('./ReportItem'));
}, 120_000);

beforeEach(() => {
  state.uid = 'u-me';
});

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const NOW = Date.parse('2026-09-29T15:00:00.000Z');

const raw = {
  id: 'r1',
  kind: 'comment',
  targetId: 'c1',
  leagueId: 'l1',
  leagueName: 'Liga del Martes',
  reason: 'acoso',
  note: 'Siempre lo mismo',
  status: 'open',
  createdAt: '2026-09-29T13:00:00.000Z',
  handledAt: null,
  handledByName: null,
  actionNote: null,
  reporterId: 'u-ana',
  reporterName: 'Ana Pérez',
  sameTarget: 2,
  target: {
    title: 'Comentario de Luis',
    text: 'Eres malísimo',
    userId: 'u-luis',
    userName: 'Luis',
    leagueId: 'l1',
    url: '/l/l1/juegos?juego=e1&evento=ev1',
    leagueName: 'Liga del Martes',
    sport: 'bowling',
  },
};

describe('de la base a los tipos', () => {
  it('un reporte completo', () => {
    const r = toReport(raw);
    expect(r).toMatchObject({ id: 'r1', kind: 'comment', reason: 'acoso', status: 'open', sameTarget: 2, reporterName: 'Ana Pérez' });
    expect(r.target).toMatchObject({ title: 'Comentario de Luis', text: 'Eres malísimo', url: '/l/l1/juegos?juego=e1&evento=ev1', userId: 'u-luis' });
  });

  it('lo raro no rompe: tipos desconocidos, lo reportado borrado, links que no son de la app', () => {
    const r = toReport({ ...raw, kind: 'foto', reason: 'feo', status: 'x', sameTarget: '3', target: null });
    expect(r).toMatchObject({ kind: 'comment', reason: 'otro', status: 'open', sameTarget: 3, target: null });
    const evil = toReport({ ...raw, target: { ...raw.target, url: '//otro.com' } });
    expect(evil.target?.url).toBeNull();
    const league = toReport({ ...raw, kind: 'league', target: { title: 'Liga X', kind: 'torneo', members: 4, events: 2, userId: 'u-o', userName: 'Org' } });
    expect(league.target).toMatchObject({ leagueKind: 'torneo', members: 4, events: 2 });
    expect(toReportPage(null)).toEqual({ rows: [], total: 0, open: 0, all: 0 });
    expect(toReportPage({ rows: [raw], total: 1, open: 1, all: 5 }).rows[0].id).toBe('r1');
  });

  it('seis motivos, sin repetir', () => {
    expect(REPORT_REASONS.map((r) => r.key).sort()).toEqual(['acoso', 'falso', 'menores', 'ofensivo', 'otro', 'spam']);
  });
});

describe('errores en palabras', () => {
  it('los códigos de la base', () => {
    expect(reportErrorText(new BackendError('rate_limited', 'rate_limited'))).toContain('10 reportes hoy');
    expect(reportErrorText(new BackendError('no_existe', 'not_found'))).toBe('Eso ya no existe o no lo puedes ver.');
    expect(reportErrorText(new BackendError('invalido', 'validation'))).toContain('No puedes reportar algo tuyo');
    // Otro ya lo cerró (resolve_report): no es «algo tuyo».
    expect(reportErrorText(new BackendError('cerrado', 'validation', 'P0001'))).toBe('Alguien más ya lo cerró. Mira cómo quedó en «Cerrados».');
    expect(isReportClosedError(new BackendError('cerrado', 'validation', 'P0001'))).toBe(true);
    expect(isReportClosedError(new BackendError('invalido', 'validation', 'P0001'))).toBe(false);
    expect(reportErrorText(new BackendError('Failed to fetch', 'network'))).toContain('Sin conexión');
    expect(reportErrorText(new Error('algo'))).toBe('No se pudo. Prueba otra vez.');
  });
});

describe('botón «Reportar»', () => {
  it('solo la bandera con su nombre (44 px); o con texto', () => {
    const icon = render(h(ReportButton, { kind: 'comment', targetId: 'c1', ownerId: 'u-luis' }));
    expect(icon).toContain('aria-label="Reportar este comentario"');
    expect(icon).toContain('size-11');
    const t = text(render(h(ReportButton, { kind: 'league', targetId: 'l1', variant: 'text' })));
    expect(t).toContain('Reportar esta liga');
  });

  it('lo propio no se reporta: el botón no sale', () => {
    expect(render(h(ReportButton, { kind: 'user', targetId: 'u-me', ownerId: 'u-me' }))).not.toContain('Reportar');
    // Sin cuenta sí sale (lleva a entrar).
    state.uid = null;
    expect(render(h(ReportButton, { kind: 'user', targetId: 'u-me', ownerId: 'u-me' }))).toContain('Reportar esta cuenta');
  });
});

describe('modal «Reportar»', () => {
  it('los motivos, la nota opcional y a quién le llega', () => {
    const out = text(render(h(ReportModal, { kind: 'game', targetId: 'g1', onClose: () => undefined })));
    expect(out).toContain('Reportar este juego');
    for (const r of REPORT_REASONS) expect(out).toContain(r.label);
    expect(out).toContain('Nota (opcional)');
    expect(out).toContain('0/500');
    expect(out).toContain('y los admins de la liga (sin saber quién lo reportó)');
    expect(out).toContain('Enviar reporte');
    // Una cuenta reportada: solo el equipo de MatchMate.
    expect(text(render(h(ReportModal, { kind: 'user', targetId: 'u1', onClose: () => undefined })))).not.toContain('admins de la liga');
  });
});

describe('un reporte en la lista', () => {
  const item = (r: Report, showReporter = false) => render(h('ol', null, h(ReportItem, { report: r, showReporter, now: NOW })));

  it('abierto: motivo, qué y de qué liga, lo reportado con link, la nota, cuántos hay y quién (solo superadmin)', () => {
    const r = toReport(raw);
    const html = item(r, true);
    const out = text(html);
    expect(out).toContain('Acoso o amenazas');
    expect(out).toContain('Comentario · Liga del Martes');
    expect(out).toContain('hace 2 h');
    expect(out).toContain('Comentario de Luis');
    expect(out).toContain('Eres malísimo');
    expect(out).toContain('«Siempre lo mismo»');
    expect(out).toContain('2 reportes abiertos de esto');
    expect(out).toContain('Lo reportó Ana Pérez');
    expect(html).toContain('href="/l/l1/juegos?juego=e1&amp;evento=ev1"');
    expect(html).toContain('href="/superadmin/cuentas?u=u-ana"');
    // Un admin de liga no sabe quién reportó.
    expect(text(item(r))).not.toContain('Ana');
  });

  it('lo reportado se borró y el reporte está cerrado', () => {
    const r = toReport({ ...raw, target: null, status: 'actioned', handledByName: 'Randy', handledAt: '2026-09-29T14:30:00.000Z', actionNote: 'Se borró el comentario.', reporterId: null, reporterName: null });
    const out = text(item(r, true));
    expect(out).toContain('Ya no existe (se borró).');
    expect(out).toContain('Atendido por Randy · hace 30 min: «Se borró el comentario.»');
    expect(out).toContain('Lo reportó una cuenta borrada');
    expect(out).not.toContain('reportes abiertos');
    expect(resolvedText({ status: 'dismissed', handledByName: null, handledAt: null })).toBe('Descartado');
    expect(resolvedText({ status: 'open', handledByName: null, handledAt: null })).toBeNull();
  });
});
