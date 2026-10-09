import { describe, expect, it } from 'vitest';
import { BackendError } from '../backend/types';
import { belongsTo, cleanPostText, optimisticPostLikes, POST_TEXT_MAX, postProblem, socialErrorText, type Post } from './posts';
import { leagueQuery } from './leagueSocial';

const post = (extra: Partial<Post> = {}): Post => ({
  id: 'p1',
  author: { id: 'u-ana', name: 'Ana', username: 'ana', avatar: null },
  text: 'Hola',
  photo: null,
  league: null,
  sport: null,
  visibility: 'public',
  at: '2026-10-09T10:00:00.000Z',
  likes: 0,
  likedByMe: false,
  comments: 0,
  isMine: true,
  canDelete: true,
  ...extra,
});

describe('texto de una publicación', () => {
  it('sin espacios alrededor, sin espacios al final de cada línea y con una sola línea en blanco seguida', () => {
    expect(cleanPostText('  hola  \r\n\r\n\r\n\r\nmundo \t\n')).toBe('hola\n\nmundo');
  });

  it('qué le falta: texto o foto, el largo y la liga según a quién le sale', () => {
    expect(postProblem({ text: '   ', photo: null, visibility: 'public' })).toBe('Escribe algo o agrega una foto.');
    expect(postProblem({ text: 'x'.repeat(POST_TEXT_MAX + 1), visibility: 'public' })).toMatch(/1000/);
    expect(postProblem({ text: 'hola', visibility: 'league' })).toBe('Elige la liga.');
    expect(postProblem({ text: 'hola', visibility: 'followers', leagueId: 'L1' })).toMatch(/liga/);
    expect(postProblem({ text: '', photo: { data: 'data:image/webp;base64,', width: 1, height: 1, scan: '' }, visibility: 'public' })).toBeNull();
    expect(postProblem({ text: 'hola', visibility: 'league', leagueId: 'L1' })).toBeNull();
  });
});

describe('dónde sale una publicación nueva', () => {
  it('Siguiendo y mis publicaciones siempre; Descubrir solo si es pública; la liga solo la suya', () => {
    const p = post({ visibility: 'league', league: { id: 'L1', name: 'Liga', sport: 'padel' } });
    expect(belongsTo(p, { kind: 'posts', status: 'feed:following' })).toBe(true);
    expect(belongsTo(p, { kind: 'posts', status: 'feed:discover' })).toBe(false);
    expect(belongsTo(post(), { kind: 'posts', status: 'feed:discover' })).toBe(true);
    expect(belongsTo(p, { kind: 'posts', status: 'user', id: 'u-ana' })).toBe(true);
    expect(belongsTo(p, { kind: 'posts', status: 'user', id: 'u-otra' })).toBe(false);
    expect(belongsTo(p, { kind: 'posts', status: 'league', lid: 'L1' })).toBe(true);
    expect(belongsTo(p, { kind: 'posts', status: 'league', lid: 'L2' })).toBe(false);
    expect(belongsTo(post(), { kind: 'posts', status: 'league', lid: 'L1' })).toBe(false);
  });
});

describe('me gusta al momento', () => {
  it('suma o resta uno solo si cambia, sin bajar de 0', () => {
    expect(optimisticPostLikes({ likes: 2, likedByMe: false }, true)).toEqual({ likes: 3, likedByMe: true });
    expect(optimisticPostLikes({ likes: 3, likedByMe: true }, true)).toEqual({ likes: 3, likedByMe: true });
    expect(optimisticPostLikes({ likes: 0, likedByMe: true }, false)).toEqual({ likes: 0, likedByMe: false });
  });
});

describe('mensajes de error', () => {
  it('palabras prohibidas, muy rápido, sin señal, ya no está y los de validación propios', () => {
    expect(socialErrorText(new BackendError('palabras', 'validation', 'P0001'))).toMatch(/palabras que no se permiten/);
    expect(socialErrorText(new BackendError('rate_limited', 'rate_limited', 'P0001'))).toMatch(/muy rápido/);
    expect(socialErrorText(new BackendError('Failed to fetch', 'network'))).toMatch(/Sin conexión/);
    expect(socialErrorText(new BackendError('no_existe', 'not_found', 'P0001'))).toMatch(/ya no está/);
    expect(socialErrorText(new BackendError('Elige la liga.', 'validation', 'invalido'))).toBe('Elige la liga.');
    expect(socialErrorText(new BackendError('invalido: texto', 'validation', 'P0001'), 'No se pudo.')).toBe('No se pudo.');
  });
});

describe('buscar ligas', () => {
  it('sin espacios de más, en minúsculas y hasta 60 letras', () => {
    expect(leagueQuery('  Liga   DEL  Este ')).toBe('liga del este');
    expect(leagueQuery('x'.repeat(80))).toHaveLength(60);
  });
});
