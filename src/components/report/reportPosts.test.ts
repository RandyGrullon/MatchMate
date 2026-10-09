/**
 * Reportes de la red social: una publicación y un comentario de una publicación como tipos nuevos (lo que manda la base
 * a los tipos, a dónde lleva «Ver» y cómo se ven en las listas y en la hoja de «Reportar»). Sin navegador.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { REPORT_KIND_LABEL, REPORT_KIND_THIS, REPORT_KINDS, reportTargetUrl, toReport } from '../../lib/data/reports';
import { FeedbackProvider } from '../feedback';

vi.mock('../../lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/auth')>()),
  useAuth: () => ({ user: { uid: 'u-me', email: null, displayName: 'Yo' }, profile: null, isSuper: true, loading: false, recovering: false }),
}));

let ReportItem: typeof import('./ReportItem').ReportItem;
let ReportModal: typeof import('./ReportModal').default;

beforeAll(async () => {
  if (typeof navigator === 'undefined') vi.stubGlobal('navigator', { onLine: true, userAgent: 'node' });
  ({ ReportItem } = await import('./ReportItem'));
  ({ default: ReportModal } = await import('./ReportModal'));
}, 120_000);

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const raw = (kind: string, target: Record<string, unknown> | null, targetId = 'P1') => ({
  id: 'r1',
  kind,
  targetId,
  leagueId: null,
  leagueName: null,
  reason: 'spam',
  note: null,
  status: 'open',
  createdAt: '2026-10-09T13:00:00.000Z',
  sameTarget: 1,
  target,
});

describe('reportes de publicaciones', () => {
  it('los tipos nuevos se leen como tales (no caen en «comentario»)', () => {
    expect(REPORT_KINDS).toContain('post');
    expect(REPORT_KINDS).toContain('post_comment');
    expect(toReport(raw('post', null)).kind).toBe('post');
    expect(toReport(raw('post_comment', null)).kind).toBe('post_comment');
    expect(REPORT_KIND_LABEL.post).toBe('Publicación');
    expect(REPORT_KIND_THIS.post).toBe('esta publicación');
    expect(REPORT_KIND_THIS.post_comment).toBe('este comentario');
  });

  it('«Ver»: lo que dice la base; si no, la publicación (o la del comentario, si viene); borrado, nada', () => {
    expect(reportTargetUrl(toReport(raw('post', { title: 'Publicación de Ana', text: 'hola' })))).toBe('/p/P1');
    expect(reportTargetUrl(toReport(raw('post', { title: 'x', url: '/p/OTRA' })))).toBe('/p/OTRA');
    expect(reportTargetUrl(toReport(raw('post_comment', { title: 'Comentario de Luis', text: 'feo', postId: 'P9' }, 'C1')))).toBe('/p/P9');
    expect(reportTargetUrl(toReport(raw('post_comment', { title: 'Comentario de Luis', text: 'feo' }, 'C1')))).toBeNull();
    expect(reportTargetUrl(toReport(raw('post', null)))).toBeNull();
  });

  it('en la lista: el tipo, el texto y el link a la publicación', () => {
    const post = render(h(ReportItem, { report: toReport(raw('post', { title: 'Publicación de Ana', text: 'Compra aquí' })) }));
    expect(text(post)).toContain('Publicación');
    expect(text(post)).toContain('Compra aquí');
    expect(post).toContain('href="/p/P1"');
    const comment = render(h(ReportItem, { report: toReport(raw('post_comment', { title: 'Comentario de Luis', text: 'Eres malo' }, 'C1')) }));
    expect(text(comment)).toContain('Comentario de publicación');
    expect(text(comment)).toContain('Eres malo');
    expect(comment).not.toContain('href="/p/');
  });

  it('la hoja de «Reportar»: el título y quién lo revisa (MatchMate y, si es de una liga, sus admins)', () => {
    const t = text(render(h(ReportModal, { kind: 'post', targetId: 'P1', onClose: () => undefined })));
    expect(t).toContain('Reportar esta publicación');
    expect(t).toContain('Lo revisa el equipo de MatchMate y, si es de una liga, sus admins (sin saber quién lo reportó).');
    expect(text(render(h(ReportModal, { kind: 'post_comment', targetId: 'C1', onClose: () => undefined })))).toContain('Reportar este comentario');
  });
});
