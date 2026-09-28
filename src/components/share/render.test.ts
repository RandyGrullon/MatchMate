/**
 * Los botones «Compartir» se dibujan (en el servidor, sin navegador) y las pantallas arman bien su imagen:
 * el resultado de un partido y las pruebas de natación.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { POINTS_6_LANES } from '../../sports/swimming';
import type { Match } from '../../lib/data/matches';
import type { SwimClub, SwimEntry, SwimEventItem, SwimMeet } from '../../lib/data/swimming';
import { LeagueContext, type LeagueCtx } from '../../lib/league';
import type { League } from '../../lib/types';
import { FeedbackProvider } from '../feedback';
import { ShareResultCard } from '../match/ShareResultCard';
import { eventResults } from '../../pages/sports/swimming/logic';
import { raceShare } from '../../pages/sports/swimming/ResultsPanel';
import { ShareButton, shareDate, shareFrame } from './ShareButton';
import { sportColor } from './palette';

const league = (sport: string): League => ({
  id: 'L1',
  name: 'Liga del Club',
  kind: 'liga',
  visibility: 'private',
  ownerUid: 'u1',
  venue: '',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport,
  tz: 'America/Santo_Domingo',
});

const ctx = (sport: string): LeagueCtx => ({
  lid: 'L1',
  league: league(sport),
  member: null,
  isAdmin: false,
  isOwner: false,
  isScorer: false,
  canScore: false,
  myPlayerId: null,
  base: '/l/L1',
});

const inLeague = (sport: string, el: ReactElement) => renderToString(h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx(sport) }, el)));

describe('fecha y marco de la imagen', () => {
  it('la fecha corta en español, sin puntos ni «de»', () => {
    const d = new Date('2026-09-27T16:00:00Z');
    const s = shareDate(d, 'America/Santo_Domingo');
    expect(s).toMatch(/^27 sept? 2026$/);
    expect(shareDate(new Date('2026-01-01T02:00:00Z'), 'America/Santo_Domingo')).toMatch(/^31 dic 2025$/);
    // Una zona que no existe no rompe.
    expect(shareDate(d, 'Marte/Olympus')).toBe('2026-09-27');
  });

  it('el deporte con su nombre corto y su color; lo que no se conoce, la marca', () => {
    const now = new Date('2026-09-27T16:00:00Z');
    expect(shareFrame('futsal', 'https://m.do/l/x', 'America/Santo_Domingo', now)).toEqual({
      sportLabel: 'Fútbol sala',
      color: sportColor('futsal'),
      date: shareDate(now, 'America/Santo_Domingo'),
      link: 'https://m.do/l/x',
    });
    expect(shareFrame('ajedrez', undefined, undefined, now)).toMatchObject({ sportLabel: 'MatchMate', color: sportColor(null) });
  });
});

describe('botones', () => {
  it('«Compartir» con texto, o solo el icono con su nombre para el lector de pantalla', () => {
    const card = () => null;
    const text = renderToString(h(ShareButton, { card }));
    expect(text).toContain('Compartir');
    expect(text).not.toContain('aria-label');
    const icon = renderToString(h(ShareButton, { card, iconOnly: true, label: 'Compartir el ranking' }));
    expect(icon).toContain('aria-label="Compartir el ranking"');
    expect(icon).toContain('title="Compartir el ranking"');
    // Sin la imagen abierta no se dibuja la ventana.
    expect(icon).not.toContain('role="dialog"');
  });

  it('la tarjeta del resultado ofrece la imagen, WhatsApp y el texto', () => {
    const m = {
      id: 'm1',
      leagueId: 'L1',
      eventId: null,
      round: 2,
      stage: '',
      bracketKey: null,
      court: 'Cancha 1',
      scheduledAt: null,
      status: 'confirmed',
      format: 'bo3',
      requireConfirm: true,
      score: { text: '6-3 6-4' },
      winner: 1,
      walkoverSide: null,
      sides: [
        { side: 1, teamId: null, label: 'Ana / Luis', seed: null, players: [] },
        { side: 2, teamId: null, label: 'Rosa / Pedro', seed: null, players: [] },
      ],
    } as unknown as Match;
    const html = inLeague('padel', h(ShareResultCard, { match: m, title: 'Liga de pádel', roundWord: 'Jornada', url: 'https://m.do/l/L1/juegos?partido=m1' }));
    expect(html).toContain('Compartir imagen');
    expect(html).toContain('WhatsApp');
    expect(html).toContain('Gana Ana / Luis 6-3 6-4 a Rosa / Pedro');
    expect(html).toContain('https://wa.me/?text=');
  });
});

describe('natación: imagen de una prueba', () => {
  const meet: SwimMeet = {
    id: 'M1',
    type: 'encuentro',
    name: 'Copa Delfín',
    date: '2026-09-20',
    startTime: null,
    announcement: '',
    pool: 25,
    lanes: 6,
    points: POINTS_6_LANES,
    ageGroups: 'cccan',
    heatsPublishedAt: '2026-09-19T00:00:00Z',
    finalizedAt: null,
  };
  const ev: SwimEventItem = { id: 'e1', meetId: 'M1', num: 3, distance: 50, stroke: 'libre', pool: 25, gender: 'F', ageGroups: ['9-10'] };
  const entry = (id: string, playerId: string, clubId: string | null, time: number | null, status: SwimEntry['status'] = 'ok'): SwimEntry => ({
    id,
    meetId: 'M1',
    swimEventId: 'e1',
    playerId,
    clubId,
    ageGroup: '9-10',
    seed: null,
    heat: 1,
    lane: 1,
    time,
    status,
    resultAt: '2026-09-20T10:00:00Z',
  });
  const clubs = new Map<string, SwimClub>([['c1', { id: 'c1', name: 'Delfines', short: 'DEL', color: '#0ea5e9', coachId: null }]]);
  const names: Record<string, string> = { p1: 'Ana', p2: 'Rosa', p3: 'Luisa' };
  const entries = [entry('x1', 'p1', 'c1', 3245), entry('x2', 'p2', null, 3310), entry('x3', 'p3', 'c1', null, 'dq')];

  it('cada categoría con el puesto, el club, los puntos y el tiempo (DQ sin puesto y más claro)', () => {
    const groups = eventResults(ev, entries, meet.points);
    const spec = raceShare({ meet, clubs, name: (id) => names[id] }, ev, groups);
    expect(spec.title).toBe('Copa Delfín');
    expect(spec.subtitle).toBe('Prueba 3 · 50 m Libre · Femenino · 9-10');
    expect(spec.columns).toEqual([
      { label: 'Pts', optional: true },
      { label: 'Tiempo', strong: true },
    ]);
    expect(spec.sections).toHaveLength(1);
    expect(spec.sections[0].heading).toMatch(/^Femenino · /);
    expect(spec.sections[0].rows).toEqual([
      { rank: 1, name: 'Ana', sub: 'Delfines', dot: '#0ea5e9', dim: false, values: ['6', '32.45'] },
      { rank: 2, name: 'Rosa', dot: null, dim: false, values: ['4', '33.10'] },
      { rank: null, name: 'Luisa', sub: 'Delfines', dot: '#0ea5e9', dim: true, values: ['', 'DQ'] },
    ]);
    expect(spec.note).toMatch(/provisionales/);
    expect(spec.caption).toBe('Copa Delfín · 50 m Libre');
  });

  it('el control de marcas no da puntos: solo el tiempo; cerrado, sin la nota', () => {
    const control: SwimMeet = { ...meet, type: 'control', name: '', finalizedAt: '2026-09-21T00:00:00Z' };
    const spec = raceShare({ meet: control, clubs, name: (id) => names[id] }, ev, eventResults(ev, entries, control.points));
    expect(spec.title).toMatch(/^Control de marcas /);
    expect(spec.columns).toEqual([{ label: 'Tiempo', strong: true }]);
    expect(spec.sections[0].rows[0].values).toEqual(['32.45']);
    expect(spec.note).toBeUndefined();
  });
});
