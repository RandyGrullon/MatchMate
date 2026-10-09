/**
 * Avisos de las publicaciones en la campana: los me gusta y los comentarios de `social_notices` pasan por la lista de
 * avisos con su ícono (corazón o globo), en el filtro Social, y llevan a la publicación (`/p/<id>`).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { buildSocialNotices } from '../../lib/data/follows';
import { buildNotices, groupNotices } from '../../lib/notifications';
import { NoticeIcon } from './NoticeIcon';
import { NoticeList } from './NoticeList';

const NOW = Date.parse('2026-10-09T15:00:00.000Z');

const social = buildSocialNotices([
  { kind: 'post_like', at: '2026-10-09T12:00:00.000Z', userId: 'u-ana', name: 'Ana', postId: 'P1' },
  { kind: 'post_like', at: '2026-10-09T13:00:00.000Z', userId: 'u-luis', name: 'Luis', postId: 'P1' },
  { kind: 'post_comment', at: '2026-10-09T14:00:00.000Z', userId: 'u-sofi', name: 'Sofi', postId: 'P1', text: '¡Qué partidazo!' },
]);

describe('avisos de publicaciones', () => {
  it('pasan a la lista con su ícono, en Social y llevan a la publicación', () => {
    const items = buildNotices([], [], '2026-10-09', NOW, null, social);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: 'social', category: 'social', icon: 'comment', to: '/p/P1', title: 'Sofi comentó tu publicación', body: '«¡Qué partidazo!»' });
    expect(items[1]).toMatchObject({ kind: 'social', category: 'social', icon: 'like', to: '/p/P1', title: 'A Luis y Ana les gustó tu publicación' });
  });

  it('el globo para un comentario y el corazón para un me gusta', () => {
    expect(renderToString(h(NoticeIcon, { kind: 'social', icon: 'comment' }))).toContain('lucide-message-circle');
    expect(renderToString(h(NoticeIcon, { kind: 'social', icon: 'like' }))).toContain('lucide-heart');
  });

  it('en la página de avisos, cada uno abre su publicación', () => {
    const items = buildNotices([], [], '2026-10-09', NOW, null, social);
    const html = renderToString(h(MemoryRouter, null, h(NoticeList, { groups: groupNotices(items, NOW), isUnread: () => true, now: NOW, showSport: false, onOpen: () => undefined })));
    expect(html.match(/href="\/p\/P1"/g)).toHaveLength(2);
    expect(html).toContain('Sofi comentó tu publicación');
  });
});
