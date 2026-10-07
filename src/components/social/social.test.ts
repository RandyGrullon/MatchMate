/**
 * Piezas del perfil social: la tarjeta de juego de cada deporte (con su me gusta), el link al perfil, el botón de
 * seguir y el resumen por deporte. Se pintan con renderToString (sin navegador).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ProfileGame, ProfileStats } from '../../lib/data/profileGames';
import { FeedbackProvider } from '../feedback';
import { FollowButton } from './FollowButton';
import { GameCard } from './GameCard';
import { LikeButton } from './LikeButton';
import { SportStats } from './SportStats';
import { UserLink, userPath } from './UserLink';

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const base = {
  key: 'k1',
  id: 'g1',
  playerId: 'p1',
  userId: 'u1',
  userName: 'Ana Pérez',
  leagueId: 'l1',
  leagueName: 'Liga del Club',
  eventId: 'e1',
  eventName: 'Jornada 3',
  eventType: 'torneo',
  eventDate: '2026-09-27',
  at: '2026-09-27T20:00:00Z',
  url: '/l/l1/juegos?juego=e1_p1',
  likes: 3,
  likedByMe: false,
};

const bowling: ProfileGame = { ...base, kind: 'bowling', sport: 'bowling', detail: { scores: [210, 180, 150], verified: [true, true, true], series: 540, high: 210 } };
const padel: ProfileGame = {
  ...base,
  key: 'm:g2:p1',
  id: 'g2',
  kind: 'match',
  sport: 'padel',
  detail: { side: 1, mine: 'Ana / Eva', opponent: 'Luis / Juan', score: '6-4 6-3', result: 'win', walkover: false, final: true },
};
const golf: ProfileGame = { ...base, id: 'g3', kind: 'golf', sport: 'golf', detail: { course: 'Teeth of the Dog', holes: 18, played: 18, gross: 82, playingHcp: 10 } };
const swim: ProfileGame = { ...base, id: 'g4', kind: 'swim', sport: 'swimming', detail: { distance: 50, stroke: 'libre', pool: 25, timeCs: 2845, status: 'ok', place: 2 } };

describe('GameCard', () => {
  it('boliche: los juegos, la serie y el me gusta', () => {
    const t = text(render(h(GameCard, { game: bowling, today: '2026-09-28' })));
    expect(t).toContain('210');
    expect(t).toContain('540');
    expect(t).toContain('Serie · alto 210');
    // Lo que cuenta no lleva marca (sin «Verificado»); lo que falta aprobar dice «Por aprobar».
    expect(t).not.toContain('Verificado');
    expect(t).not.toContain('Por aprobar');
    expect(t).toContain('ayer');
    expect(t).toContain('Boliche');
  });

  it('boliche con un juego por aprobar: «Por aprobar» (y ese juego más tenue)', () => {
    const pending: ProfileGame = { ...bowling, detail: { ...bowling.detail, verified: [true, false, true] } as typeof bowling.detail };
    const html = render(h(GameCard, { game: pending, today: '2026-09-28' }));
    expect(text(html)).toContain('Por aprobar');
    expect(html).toContain('Juego 2 (por aprobar)');
  });

  it('partido: resultado, lados y marcador', () => {
    const t = text(render(h(GameCard, { game: padel, today: '2026-09-28' })));
    expect(t).toContain('Ganó');
    expect(t).toContain('Ana / Eva');
    expect(t).toContain('Luis / Juan');
    expect(t).toContain('6-4 6-3');
    expect(t).toContain('Pádel');
  });

  it('golf y natación', () => {
    const g = text(render(h(GameCard, { game: golf, today: '2026-09-28' })));
    expect(g).toContain('82');
    expect(g).toContain('Teeth of the Dog');
    expect(g).toContain('18 hoyos · hcp 10');
    const s = text(render(h(GameCard, { game: swim, today: '2026-09-28' })));
    expect(s).toContain('50 m libre');
    expect(s).toContain('28.45');
    expect(s).toContain('2.º lugar');
  });

  it('con `showUser` lleva al perfil de quien jugó y abre el juego en su liga', () => {
    const html = render(h(GameCard, { game: padel, showUser: true, today: '2026-09-28' }));
    expect(html).toContain('href="/u/u1"');
    expect(html).toContain(`href="${padel.url.replace(/&/g, '&amp;')}"`);
    expect(text(html)).toContain('Ana Pérez');
    expect(text(html)).toContain('Liga del Club · Jornada 3');
  });
});

describe('LikeButton', () => {
  it('sin me gusta míos: corazón vacío con el número', () => {
    const html = render(h(LikeButton, { game: bowling }));
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('Me gusta (3 me gusta)');
    expect(text(html)).toContain('3');
  });
  it('ya le di me gusta: corazón lleno', () => {
    const html = render(h(LikeButton, { game: { ...bowling, likedByMe: true, likes: 1 } }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('fill-current');
    expect(html).toContain('Quitar me gusta (1 me gusta)');
  });
  it('sin me gusta de nadie dice «Me gusta»', () => {
    expect(text(render(h(LikeButton, { game: { ...bowling, likes: 0 } })))).toContain('Me gusta');
  });
});

describe('UserLink', () => {
  it('con cuenta lleva a /u/:id', () => {
    expect(userPath('a b')).toBe('/u/a%20b');
    const html = render(h(UserLink, { userId: 'u9', name: 'Luis' }));
    expect(html).toContain('href="/u/u9"');
    expect(text(html)).toContain('Luis');
  });
  it('sin cuenta es solo texto', () => {
    const html = render(h(UserLink, { userId: null, name: 'Jugador sin cuenta' }));
    expect(html).not.toContain('href=');
    expect(text(html)).toContain('Jugador sin cuenta');
  });
});

describe('FollowButton', () => {
  it('Seguir, Seguir también y Siguiendo', () => {
    expect(text(render(h(FollowButton, { userId: 'u2', following: false })))).toContain('Seguir');
    expect(text(render(h(FollowButton, { userId: 'u2', following: false, followsYou: true })))).toContain('Seguir también');
    const on = render(h(FollowButton, { userId: 'u2', following: true, name: 'Eva' }));
    expect(text(on)).toContain('Siguiendo');
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('Dejar de seguir a Eva');
  });
});

describe('SportStats', () => {
  const stats: ProfileStats = {
    bowling: { sessions: 2, series: [[200, 180], [150]] },
    matches: [{ sport: 'padel', played: 4, won: 3, lost: 1, drawn: 0 }],
    golf: { rounds: 2, best18: 80, avg18: 83.5, best9: null },
    swim: { results: 1, bests: [{ distance: 100, stroke: 'pecho', pool: 50, timeCs: 8012 }] },
  };

  it('un resumen por deporte', () => {
    const t = text(render(h(SportStats, { stats, loading: false, error: null })));
    expect(t).toContain('Promedio 176');
    expect(t).toContain('Mejor serie 380');
    expect(t).toContain('% ganados 75%');
    expect(t).toContain('Mejor (18 hoyos) 80');
    expect(t).toContain('Promedio (18) 83.5');
    expect(t).toContain('100 m pecho');
    expect(t).toContain('1:20.12');
  });

  it('en tu perfil el boliche no se repite', () => {
    const t = text(render(h(SportStats, { stats, loading: false, error: null, skipBowling: true })));
    expect(t).not.toContain('Mejor serie');
    expect(t).toContain('Pádel');
  });

  it('sin números: aviso vacío (o nada)', () => {
    const empty: ProfileStats = { bowling: null, matches: [], golf: null, swim: null };
    expect(text(render(h(SportStats, { stats: empty, loading: false, error: null })))).toContain('Sin números todavía');
    expect(renderToString(h(SportStats, { stats: empty, loading: false, error: null, emptyText: null }))).toBe('');
  });
});
