/**
 * La lista de la página de avisos dibujada sin navegador (renderToString): grupos, el punto de lo sin leer, la liga
 * con su deporte y a dónde lleva cada aviso.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { groupNotices, type Notice } from '../../lib/notifications';
import { FilterChips } from './FilterChips';
import { NoticeIcon } from './NoticeIcon';
import { NoticeList, NoticeListSkeleton } from './NoticeList';

const now = new Date(2026, 8, 25, 12).getTime();
const HOUR = 3600_000;

const notice = (id: string, extra: Partial<Notice> = {}): Notice => ({
  id,
  kind: 'por-confirmar',
  category: 'partidos',
  title: 'Tienes un resultado por confirmar',
  body: 'Pedro / Rosa anotó 6-4 6-3.',
  lid: 'mm',
  leagueName: 'Pádel Club',
  leagueKind: 'liga',
  private: true,
  sport: 'padel',
  to: '/l/mm/juegos?partido=a',
  time: now - HOUR,
  ...extra,
});

const html = (el: ReactElement) => renderToString(h(MemoryRouter, null, el));

describe('lista de avisos', () => {
  const items = [
    notice('a'),
    notice('b', { kind: 'torneo', category: 'ligas', title: 'Nuevo torneo: Copa', sport: 'bowling', leagueName: 'Liga Norte', private: false, to: '/l/l1/e/t', time: now - 3 * 24 * HOUR }),
    notice('c', { kind: 'social', category: 'social', icon: 'follow', title: 'Ana te empezó a seguir', body: '', lid: '', leagueName: '', sport: null, to: '/perfil/ana', time: now - 30 * 24 * HOUR }),
  ];

  it('por grupos, con a dónde lleva cada uno, cuándo y el punto de lo sin leer', () => {
    const out = html(
      h(NoticeList, { groups: groupNotices(items, now), now, isUnread: (n: Notice) => n.id === 'a', showSport: true, onOpen: () => undefined }),
    );
    expect(out.indexOf('Hoy')).toBeLessThan(out.indexOf('Esta semana'));
    expect(out.indexOf('Esta semana')).toBeLessThan(out.indexOf('Antes'));
    expect(out).toContain('href="/l/mm/juegos?partido=a"');
    expect(out).toContain('href="/perfil/ana"');
    expect(out).toContain('hace 1 h');
    expect(out).toContain('hace 3 días');
    // Un solo aviso sin leer: un solo punto y su texto para lectores de pantalla.
    expect(out.match(/data-unread=""/g)).toHaveLength(1);
    expect(out).toContain('Sin leer: ');
    // La liga, con su candado si es privada; el de seguir no tiene liga.
    expect(out).toContain('Pádel Club');
    expect(out).toContain('aria-label="Privada"');
    expect(out.match(/aria-label="Privada"/g)).toHaveLength(1);
  });

  it('con un solo deporte no dibuja el ícono del deporte en cada aviso', () => {
    const one = html(h(NoticeList, { groups: groupNotices([items[0]], now), now, isUnread: () => false, showSport: false, onOpen: () => undefined }));
    const many = html(h(NoticeList, { groups: groupNotices([items[0]], now), now, isUnread: () => false, showSport: true, onOpen: () => undefined }));
    expect(many.length).toBeGreaterThan(one.length);
    expect(one).not.toContain('data-unread');
  });

  it('el esqueleto mientras carga, y los íconos de cada tipo', () => {
    expect(html(h(NoticeListSkeleton, { rows: 3 }))).toContain('aria-busy="true"');
    const like = renderToString(h(NoticeIcon, { kind: 'social', icon: 'like' }));
    const follow = renderToString(h(NoticeIcon, { kind: 'social', icon: 'follow' }));
    expect(like).toContain('bg-danger-soft');
    expect(follow).toContain('bg-accent-soft');
    expect(renderToString(h(NoticeIcon, { kind: 'reclamo' }))).toContain('bg-danger-soft');
  });

  it('los filtros: el activo marcado y lo sin leer de cada uno', () => {
    const out = renderToString(
      h(FilterChips<'todo' | 'social'>, {
        label: 'Filtrar',
        value: 'social',
        onChange: () => undefined,
        items: [
          { key: 'todo', label: 'Todo', count: 0 },
          { key: 'social', label: 'Social', count: 120 },
        ],
      }),
    );
    expect(out).toContain('aria-pressed="true"');
    expect(out).toContain('aria-pressed="false"');
    expect(out).toContain('99+');
    expect(out).toContain('h-11');
  });
});
