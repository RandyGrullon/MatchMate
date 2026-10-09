/**
 * Piezas de las publicaciones: los textos (links, primera línea, hueco de la foto, a quién le sale), la tarjeta (autor,
 * texto con links, liga, foto, me gusta, comentarios y menú), la lista por páginas, la hoja para publicar y los
 * comentarios. Se pintan con renderToString (sin navegador).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paged } from '../../lib/data/follows';
import { POST_TEXT_MAX, type Post, type PostComment } from '../../lib/data/posts';
import { POST_BUCKET, primePublicUrl } from '../../lib/publicImages';
import { FeedbackProvider } from '../feedback';

const state = vi.hoisted(() => ({
  auth: { user: { uid: 'u-me' } as { uid: string } | null, profile: { name: 'Yo Mismo' }, loading: false },
}));

vi.mock('../../lib/auth', async (orig) => ({ ...(await orig<typeof import('../../lib/auth')>()), useAuth: () => state.auth }));
// Las ligas de la cuenta (la hoja recibe las suyas por props en las pruebas).
vi.mock('../home/useHomeData', () => ({ useMyLeagues: () => ({ all: [], loading: false, error: null }) }));
vi.mock('../../lib/data/follows', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/follows')>()),
  usePublicProfile: () => ({ data: null, loading: false, error: null }),
}));

const { audienceHint, audienceOptions, defaultAudience, firstLine, isLongText, linkify, photoRatio, postPath, postShareUrl, postSnippet, safeHref, visibilityHint } =
  await import('./postFormat');
const { PostCard } = await import('./PostCard');
const { PostList } = await import('./PostList');
const { ComposerCard, ComposerForm, draftKey } = await import('./Composer');
const { contentMenuKeys, shortName } = await import('./PostMenu');
const { CommentList } = await import('./Comments');

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const post = (extra: Partial<Post> = {}): Post => ({
  id: 'p1',
  author: { id: 'u-ana', name: 'Ana Pérez', username: 'anaperez', avatar: null },
  text: 'Hola',
  photo: null,
  league: null,
  sport: null,
  visibility: 'public',
  at: new Date(Date.now() - 5 * 60_000).toISOString(),
  likes: 0,
  likedByMe: false,
  comments: 0,
  isMine: false,
  canDelete: false,
  ...extra,
});

const paged = <T,>(extra: Partial<Paged<T>> = {}): Paged<T> => ({
  data: [],
  loading: false,
  error: null,
  hasMore: false,
  loadingMore: false,
  moreError: null,
  loadMore: async () => undefined,
  refresh: () => undefined,
  ...extra,
});

beforeEach(() => {
  state.auth = { user: { uid: 'u-me' }, profile: { name: 'Yo Mismo' }, loading: false };
});

describe('textos de una publicación', () => {
  it('los links: solo http y https, sin el punto o el paréntesis que cierra la frase', () => {
    expect(linkify('mira https://x.com/a?b=1. ¡bien!')).toEqual([
      { kind: 'text', text: 'mira ' },
      { kind: 'link', text: 'https://x.com/a?b=1', href: 'https://x.com/a?b=1' },
      { kind: 'text', text: '. ¡bien!' },
    ]);
    expect(linkify('(ver http://ejemplo.do)')).toEqual([
      { kind: 'text', text: '(ver ' },
      { kind: 'link', text: 'http://ejemplo.do', href: 'http://ejemplo.do/' },
      { kind: 'text', text: ')' },
    ]);
    // Un paréntesis que abrió dentro del link sí es del link.
    expect(linkify('https://es.wikipedia.org/wiki/Pádel_(deporte)')[0]).toMatchObject({ kind: 'link', text: 'https://es.wikipedia.org/wiki/Pádel_(deporte)' });
    expect(linkify('javascript:alert(1) y ftp://x.com')).toEqual([{ kind: 'text', text: 'javascript:alert(1) y ftp://x.com' }]);
    expect(linkify('')).toEqual([]);
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://x.com')).toBe('https://x.com/');
  });

  it('primera línea, texto largo, hueco de la foto y la fila corta', () => {
    expect(firstLine('\n  \nHola equipo  \nsegunda')).toBe('Hola equipo');
    expect(firstLine('x'.repeat(200), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(isLongText('a\n'.repeat(9))).toBe(true);
    expect(isLongText('corto')).toBe(false);
    expect(photoRatio(1200, 800)).toBe(1.5);
    expect(photoRatio(800, 4000)).toBe(0.8);
    expect(photoRatio(4000, 500)).toBe(1.91);
    expect(photoRatio(null, null)).toBeCloseTo(4 / 3);
    expect(postSnippet({ text: '', photo: { path: 'u/p.webp', w: 1, h: 1 } })).toBe('📷 Foto');
    expect(postSnippet({ text: '¡Ganamos!\nfoto abajo', photo: null })).toBe('¡Ganamos!');
    expect(postPath('a b')).toBe('/p/a%20b');
    expect(postShareUrl('p1', 'https://matchmate.do')).toBe('https://matchmate.do/p/p1');
  });

  it('a quién le sale: perfil (Todos · Seguidores), liga pública (Todos · Solo la liga) y privada (solo la liga)', () => {
    expect(audienceOptions(null)).toEqual(['public', 'followers']);
    expect(audienceOptions({ visibility: 'public' })).toEqual(['public', 'league']);
    expect(audienceOptions({ visibility: 'private' })).toEqual(['league']);
    expect(defaultAudience({ visibility: 'private' })).toBe('league');
    expect(defaultAudience(null)).toBe('public');
    expect(visibilityHint('public')).toBeNull();
    expect(visibilityHint('followers')).toBe('Seguidores');
    expect(visibilityHint('league')).toBe('Solo la liga');
    expect(audienceHint('public', true)).toMatch(/sigue la liga/);
  });
});

describe('PostCard', () => {
  it('autor, @usuario, hace cuánto, texto con links seguros y abre la publicación', () => {
    const html = render(h(PostCard, { post: post({ text: 'Jugamos hoy\nmira https://x.com/foto' }) }));
    const t = text(html);
    expect(t).toContain('Ana Pérez');
    expect(t).toContain('@anaperez');
    expect(t).toContain('hace 5 min');
    expect(html).toContain('href="/u/u-ana"');
    expect(html).toContain('href="/p/p1"');
    expect(html).toContain('whitespace-pre-line');
    expect(html).toMatch(/<a href="https:\/\/x\.com\/foto" target="_blank" rel="noopener noreferrer nofollow"/);
    // Sin liga ni pista de a quién le sale (es para todos).
    expect(t).not.toContain('Seguidores');
    expect(t).not.toContain('Solo la liga');
  });

  it('el texto no se pinta como HTML', () => {
    const html = render(h(PostCard, { post: post({ text: '<img src=x onerror=alert(1)>' }) }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('la liga con su link (salvo en el muro) y la pista de a quién le sale', () => {
    const p = post({ league: { id: 'L1', name: 'Pádel del Club', sport: 'padel' }, visibility: 'league' });
    const html = render(h(PostCard, { post: p }));
    expect(html).toContain('href="/l/L1"');
    expect(text(html)).toContain('Pádel del Club');
    expect(text(html)).toContain('Solo la liga');
    const wall = render(h(PostCard, { post: p, hideLeague: true }));
    expect(wall).not.toContain('href="/l/L1"');
    expect(text(render(h(PostCard, { post: post({ visibility: 'followers' }) })))).toContain('Seguidores');
  });

  it('la foto: el hueco con su tamaño mientras llega y la foto cuando ya se sabe la URL', () => {
    const waiting = render(h(PostCard, { post: post({ photo: { path: 'u-ana/p1.webp', w: 1200, h: 800 } }) }));
    expect(waiting).toContain('data-photo="cargando"');
    expect(waiting).toContain('aspect-ratio:1.5');
    primePublicUrl(POST_BUCKET, 'u-ana/p2.webp', 'https://cdn.test/p2.webp');
    const ready = render(h(PostCard, { post: post({ id: 'p2', text: '', photo: { path: 'u-ana/p2.webp', w: 800, h: 800 } }) }));
    expect(ready).toContain('src="https://cdn.test/p2.webp"');
    expect(ready).toContain('alt="Foto de Ana Pérez"');
    expect(ready).toContain('Ver la foto en grande');
  });

  it('me gusta (vacío o lleno), comentarios y compartir', () => {
    const off = render(h(PostCard, { post: post({ likes: 3 }) }));
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('Me gusta (3 me gusta)');
    expect(off).toContain('aria-label="Comentar"');
    expect(off).toContain('Compartir publicación');
    const on = render(h(PostCard, { post: post({ likes: 1, likedByMe: true, comments: 4 }) }));
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('fill-current');
    expect(on).toContain('aria-label="Comentarios (4)"');
  });

  it('el menú «⋯»: reportar y bloquear si no es tuya; borrar si puedes', () => {
    expect(contentMenuKeys({ isMine: false, canDelete: false })).toEqual(['reportar', 'bloquear']);
    expect(contentMenuKeys({ isMine: true, canDelete: true })).toEqual(['borrar']);
    // Admin de la liga o superadmin: de otro, y la puede borrar.
    expect(contentMenuKeys({ isMine: false, canDelete: true })).toEqual(['reportar', 'bloquear', 'borrar']);
    expect(contentMenuKeys({ isMine: true, canDelete: false })).toEqual([]);
    expect(shortName('  Ana Pérez ')).toBe('Ana');
    expect(render(h(PostCard, { post: post() }))).toContain('Más opciones de la publicación');
  });

  it('en su pantalla: el texto entero y la hora sin link', () => {
    const long = 'línea\n'.repeat(12);
    const feed = render(h(PostCard, { post: post({ text: long }) }));
    expect(feed).toContain('line-clamp-8');
    expect(text(feed)).toContain('Ver más');
    const detail = render(h(PostCard, { post: post({ text: long }), detail: true, onComment: () => undefined }));
    expect(detail).not.toContain('line-clamp-8');
    expect(text(detail)).not.toContain('Ver más');
    expect(detail).not.toContain('href="/p/p1"');
  });
});

describe('PostList', () => {
  it('cargando, error, vacía y con publicaciones', () => {
    expect(render(h(PostList, { list: paged<Post>({ loading: true }) }))).toContain('Cargando publicaciones');
    const err = render(h(PostList, { list: paged<Post>({ error: new Error('red') }) }));
    expect(text(err)).toContain('No se pudieron cargar los datos');
    expect(text(err)).toContain('Reintentar');
    expect(text(render(h(PostList, { list: paged<Post>(), empty: h('p', null, 'Nada todavía') })))).toContain('Nada todavía');
    const two = render(h(PostList, { list: paged<Post>({ data: [post(), post({ id: 'p9', text: 'Otra' })], hasMore: true }) }));
    expect(two.match(/data-post="/g)).toHaveLength(2);
    expect(text(two)).toContain('Ver más');
    const failed = render(h(PostList, { list: paged<Post>({ data: [post()], hasMore: true, moreError: new Error('x') }) }));
    expect(text(failed)).toContain('No se pudieron cargar más');
  });

  it('una lista que se está volviendo a leer sigue mostrando lo que tenía', () => {
    const html = render(h(PostList, { list: paged<Post>({ data: [post()], loading: true }) }));
    expect(html).toContain('data-post="p1"');
    expect(html).not.toContain('Cargando publicaciones');
  });
});

describe('publicar', () => {
  const base = { uid: 'u-me', onClose: () => undefined };
  const publish = (html: string) => html.match(/<button(?:(?!<button).)*?>Publicar<\/span><\/button>/s)?.[0] ?? '';

  it('sin texto ni foto, «Publicar» apagado (sin regaños); con texto, listo', () => {
    const empty = render(h(ComposerForm, { ...base, fixedLeague: null, leagues: [], initialText: '' }));
    expect(publish(empty)).toContain('disabled=""');
    expect(text(empty)).not.toContain('Escribe algo o agrega una foto');
    const ready = render(h(ComposerForm, { ...base, fixedLeague: null, leagues: [], initialText: '¡Ganamos 6-4!' }));
    expect(publish(ready)).not.toContain('disabled=""');
  });

  it('muy largo: el contador en rojo, lo dice y no deja publicar', () => {
    const html = render(h(ComposerForm, { ...base, fixedLeague: null, leagues: [], initialText: 'x'.repeat(POST_TEXT_MAX + 5) }));
    expect(text(html)).toContain(`${POST_TEXT_MAX + 5}/${POST_TEXT_MAX}`);
    expect(text(html)).toContain(`Usa ${POST_TEXT_MAX} caracteres o menos.`);
    expect(publish(html)).toContain('disabled=""');
    // Lejos del tope no hay contador.
    expect(text(render(h(ComposerForm, { ...base, fixedLeague: null, leagues: [], initialText: 'hola' })))).not.toContain(`/${POST_TEXT_MAX}`);
  });

  it('en tu perfil: «Todos» o «Seguidores» y «Publicar en» con tus ligas', () => {
    const html = render(
      h(ComposerForm, { ...base, fixedLeague: null, leagues: [{ id: 'L1', name: 'Pádel del Club', sport: 'padel', visibility: 'public' }], initialText: 'hola' }),
    );
    const t = text(html);
    expect(t).toContain('Nueva publicación');
    expect(t).toContain('Publicar en');
    expect(t).toContain('Mi perfil');
    expect(t).toContain('Pádel del Club');
    expect(t).toContain('Todos');
    expect(t).toContain('Seguidores');
    expect(t).not.toContain('Solo la liga');
    expect(t).toContain('La ve cualquiera con cuenta.');
  });

  it('en una liga privada: solo la liga; en una pública: todos o solo la liga', () => {
    const priv = text(render(h(ComposerForm, { ...base, fixedLeague: { id: 'L2', name: 'Liga cerrada', sport: 'bowling', visibility: 'private' }, leagues: [], initialText: 'hola' })));
    expect(priv).toContain('Publicar en la liga');
    expect(priv).toContain('Solo la liga');
    expect(priv).not.toContain('Seguidores');
    expect(priv).not.toContain('Mi perfil');
    expect(priv).toContain('La ven solo los miembros de la liga.');
    const pub = render(h(ComposerForm, { ...base, fixedLeague: { id: 'L1', name: 'Abierta', sport: 'padel', visibility: 'public' }, leagues: [], initialText: 'hola' }));
    expect(text(pub)).toContain('Todos');
    expect(text(pub)).toContain('Solo la liga');
    expect(pub).toMatch(/aria-checked="true"[^>]*>(?:<svg[^]*?<\/svg>)?Todos/);
  });

  it('la tarjeta: tu foto y «¿Qué jugaste hoy?»; sin cuenta no sale', () => {
    const html = render(h(ComposerCard, {}));
    expect(text(html)).toContain('¿Qué jugaste hoy?');
    expect(html).toContain('Publicar una foto');
    expect(text(render(h(ComposerCard, { placeholder: '¿Qué pasó en la liga?' })))).toContain('¿Qué pasó en la liga?');
    state.auth = { user: null, profile: { name: '' }, loading: false };
    const out = render(h(ComposerCard, {}));
    expect(text(out)).not.toContain('¿Qué jugaste hoy?');
    expect(out).not.toContain('Publicar una foto');
  });

  it('el borrador va por cuenta y por lugar', () => {
    expect(draftKey('u1', null)).toBe('mm:publicar:u1:feed');
    expect(draftKey('u1', 'L1')).toBe('mm:publicar:u1:L1');
    expect(draftKey(null, 'L1')).toBeNull();
  });
});

describe('comentarios', () => {
  const comment = (extra: Partial<PostComment> = {}): PostComment => ({
    id: 'c1',
    postId: 'p1',
    author: { id: 'u-luis', name: 'Luis', username: 'luis', avatar: null },
    text: '¡Qué juegazo!',
    at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    isMine: false,
    canDelete: false,
    ...extra,
  });

  it('globos con nombre (Tú si es tuyo), hace cuánto y menú; vacío y cargando', () => {
    const html = render(h(CommentList, { list: paged<PostComment>({ data: [comment(), comment({ id: 'c2', isMine: true, canDelete: true, text: 'Gracias' })] }) }));
    const t = text(html);
    expect(t).toContain('Luis');
    expect(t).toContain('¡Qué juegazo!');
    expect(t).toContain('hace 2 h');
    expect(t).toContain('Tú');
    expect(t).toContain('Gracias');
    expect(html.match(/Más opciones del comentario/g)).toHaveLength(2);
    expect(text(render(h(CommentList, { list: paged<PostComment>() })))).toContain('Todavía no hay comentarios');
    expect(render(h(CommentList, { list: paged<PostComment>({ loading: true }) }))).toContain('Cargando comentarios');
  });
});
