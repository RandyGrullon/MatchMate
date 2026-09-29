import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { GameMarkBadges, MarksLine } from '../components/event/GameMarks';
import { MostImprovedCard, seasonRangeLabel } from './RankingPage';

const render = (node: ReactNode) => renderToString(h(MemoryRouter, null, node));
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

describe('ranking por temporada', () => {
  it('las fechas de la temporada: en curso, con fin previsto o cerrada', () => {
    expect(seasonRangeLabel({ startsOn: '2026-01-10', endsOn: null, status: 'active' })).toMatch(/– en curso$/);
    expect(seasonRangeLabel({ startsOn: '2026-01-10', endsOn: '2026-12-15', status: 'active' })).toMatch(/– hasta el /);
    expect(seasonRangeLabel({ startsOn: '2025-01-01', endsOn: '2025-12-20', status: 'closed' })).not.toMatch(/hasta|en curso/);
  });

  it('más mejorado: quién, de cuánto a cuánto y cuánto subió', () => {
    const t = text(
      render(
        h(MostImprovedCard, {
          list: [
            { playerId: 'p1', name: 'Ana', current: 200, previous: 180, delta: 20, games: 6, previousGames: 10 },
            { playerId: 'p2', name: 'Luis', current: 170, previous: 162, delta: 8, games: 9, previousGames: 7 },
          ],
          season: { name: 'Temporada 2026' },
          previous: { name: 'Temporada 2025' },
          base: '/l/x',
        }),
      ),
    );
    expect(t).toContain('Más mejorado');
    expect(t).toContain('Ana');
    expect(t).toContain('180 → 200');
    expect(t).toContain('+20');
    expect(t).toContain('Promedio de Temporada 2026 contra Temporada 2025');
  });
});

describe('marcas de los juegos', () => {
  it('«Récord personal» y «+18 sobre tu promedio» (o «su» en el de otro)', () => {
    const mine = text(render(h(GameMarkBadges, { mark: { record: true, over: 18 } })));
    expect(mine).toContain('Récord personal');
    expect(mine).toContain('+18 sobre tu promedio');
    expect(text(render(h(GameMarkBadges, { mark: { record: false, over: 22 }, mine: false })))).toContain('+22 sobre su promedio');
    expect(render(h(GameMarkBadges, { mark: { record: false, over: null } }))).toBe('');
    expect(text(render(h(MarksLine, { marks: [null, { record: true, over: null }] })))).toContain('Récord personal');
    expect(render(h(MarksLine, { marks: null }))).toBe('');
  });
});
