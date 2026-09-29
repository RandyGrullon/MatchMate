/**
 * Por dónde se llega a los juegos sueltos y cómo se ven afuera, dibujado sin navegador (renderToString): la tarjeta
 * del perfil y del inicio (kind 'solo'), «Juego suelto» en la portada del boliche y la opción del menú Crear.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { gameSummary, type ProfileGame } from '../../lib/data/profileGames';
import { SoloOption } from '../CreateMenu';
import { FeedbackProvider } from '../feedback';
import { SportHero } from '../home/SportHero';
import { GameCard } from '../social/GameCard';

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const solo = (extra: Partial<Extract<ProfileGame, { kind: 'solo' }>> = {}): ProfileGame => ({
  key: 'j:s1',
  kind: 'solo',
  id: 's1',
  playerId: null,
  userId: 'u1',
  userName: 'Ana Pérez',
  leagueId: null,
  leagueName: null,
  sport: 'bowling',
  eventId: null,
  eventName: 'Juego suelto',
  eventType: null,
  eventDate: '2026-09-27',
  at: '2026-09-27T16:00:00.000Z',
  url: null,
  likes: 4,
  likedByMe: false,
  detail: { title: 'Juego suelto', venue: 'Bolera Norte', scores: [210, 180, 190], series: 580, high: 210 },
  ...extra,
});

describe('tarjeta de un juego suelto', () => {
  it('en el perfil: «Juego suelto», la bolera, el boliche, los juegos, la serie y el me gusta; sin «Ver» si no es mío', () => {
    const out = render(h(GameCard, { game: solo(), today: '2026-09-28' }));
    const t = text(out);
    expect(t).toContain('Juego suelto');
    expect(t).toContain('Bolera Norte');
    expect(t).toContain('Boliche');
    for (const v of ['210', '180', '190', '580']) expect(t).toContain(v);
    expect(t).toContain('Serie · alto 210');
    expect(t).toContain('ayer');
    expect(out).toContain('aria-pressed="false"');
    expect(t).not.toContain('Ver');
  });

  it('en el inicio: quién, y «Juego suelto · bolera»', () => {
    const t = text(render(h(GameCard, { game: solo(), showUser: true, today: '2026-09-28' })));
    expect(t).toContain('Ana Pérez');
    expect(t).toContain('Juego suelto · Bolera Norte');
  });

  it('el dueño tiene «Ver» (abre el juego en /juegos-sueltos)', () => {
    const out = render(h(GameCard, { game: solo({ url: '/juegos-sueltos?juego=s1' }), today: '2026-09-28' }));
    expect(out).toContain('href="/juegos-sueltos?juego=s1"');
    expect(text(out)).toContain('Ver');
  });

  it('sin bolera ni serie: el juego solo', () => {
    const g = solo({ detail: { title: 'Juego suelto', venue: null, scores: [150], series: 150, high: 150 } });
    const t = text(render(h(GameCard, { game: g, today: '2026-09-28' })));
    expect(t).toContain('Pinos');
    expect(gameSummary(g)).toBe('150 pinos');
    expect(gameSummary(solo())).toBe('Serie 580 · alto 210');
  });
});

describe('entradas', () => {
  const hero = (sport: 'bowling' | 'padel', canCreate = true, signedIn = true) =>
    render(h(SportHero, { sport, status: 'open', mine: 0, publicCount: 0, signedIn, canCreate, onCreate: () => undefined }));

  it('la portada del boliche trae «Juego suelto» (también sin cuenta o sin poder crear); la de pádel no', () => {
    for (const out of [hero('bowling'), hero('bowling', false), hero('bowling', true, false)]) {
      expect(out).toContain('href="/juegos-sueltos?nuevo=1"');
      expect(text(out)).toContain('Juego suelto');
    }
    expect(hero('padel')).not.toContain('juegos-sueltos');
    expect(text(hero('bowling'))).toContain('Crear liga de boliche');
  });

  it('el menú Crear: «Anotar un juego suelto»', () => {
    const t = text(render(h(SoloOption, { onClick: () => undefined })));
    expect(t).toContain('Anotar un juego suelto');
    expect(t).toContain('Boliche sin liga ni torneo: tus juegos y tu promedio');
  });
});
