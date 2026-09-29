/**
 * La hoja de invitar dibujada sin navegador (renderToString) con la búsqueda de mentira: quién la ve, las personas
 * que sigo, las tarjetas (elegida, en la liga, invitada; en un torneo), lo que sale según la búsqueda, el botón de
 * enviar y el link para compartir (miembro, admin con y sin código).
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeopleLive, PersonHit } from '../../lib/data/people';
import type { League } from '../../lib/types';

const state = vi.hoisted(() => ({
  people: { data: [], loading: false, error: null, settled: true, query: '' } as PeopleLive,
  calls: [] as [string, string | null | undefined][],
}));

vi.mock('../../lib/data/people', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/people')>()),
  usePeople: (query: string, lid?: string | null) => {
    state.calls.push([query, lid]);
    return state.people;
  },
}));
vi.mock('../../lib/data/invites', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/invites')>()),
  sendInvites: vi.fn(),
}));
vi.mock('../../lib/data/leagues', async (orig) => ({
  ...(await orig<typeof import('../../lib/data/leagues')>()),
  getInviteCode: vi.fn(() => Promise.resolve('ABC123')),
}));
vi.mock('../feedback', () => ({ useFeedback: () => ({ toast: () => undefined }) }));

const { InviteSheet, PeopleList, PersonTile, SendBar, ShareRow } = await import('./InviteSheet');

const league = (extra: Partial<League> = {}) =>
  ({ id: 'l1', name: 'Liga de los martes', kind: 'liga', visibility: 'public', sport: 'padel', ...extra }) as League;

const hit = (id: string, name: string, extra: Partial<PersonHit> = {}): PersonHit => ({
  id,
  name,
  username: name.toLowerCase(),
  isFollowing: true,
  followsYou: false,
  inLeague: false,
  invited: false,
  ...extra,
});

const FOLLOWING = [hit('a', 'Ana'), hit('b', 'Beto', { inLeague: true }), hit('c', 'Carla', { invited: true })];

const inRouter = (el: ReactElement) => renderToString(h(MemoryRouter, null, el));
const sheet = (extra: Record<string, unknown> = {}) =>
  inRouter(h(InviteSheet, { league: league(), lid: 'l1', isAdmin: false, member: true, open: true, onClose: () => undefined, ...extra }));
/** Texto visible (sin etiquetas), para buscar frases. */
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const NONE: ReadonlyMap<string, PersonHit> = new Map();

beforeEach(() => {
  state.people = { data: FOLLOWING, loading: false, error: null, settled: true, query: '' };
  state.calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('quién ve la hoja', () => {
  it('cerrada, nada (ni busca)', () => {
    expect(sheet({ open: false })).toBe('');
    expect(state.calls).toEqual([]);
  });

  it('un miembro de una liga privada no puede invitar: nada', () => {
    expect(sheet({ league: league({ visibility: 'private' }) })).toBe('');
    expect(sheet({ member: false })).toBe('');
  });

  it('el admin, también en una privada; el torneo dice «al torneo»', () => {
    expect(text(sheet({ league: league({ visibility: 'private' }), isAdmin: true }))).toContain('Invitar a la liga');
    expect(text(sheet({ league: league({ kind: 'torneo' }) }))).toContain('Invitar al torneo');
  });
});

describe('la hoja abierta', () => {
  it('busca en esa liga (para saber quién ya está o ya tiene invitación), con el nombre de la liga debajo del título', () => {
    const html = sheet();
    expect(state.calls[0]).toEqual(['', 'l1']);
    expect(html).toContain('placeholder="Busca por nombre o @usuario"');
    expect(html).toContain('type="search"');
    expect(text(html)).toContain('Invitar a la liga Liga de los martes');
  });

  it('sin buscar: «Personas que sigues» en tarjetas de 4 (5 en la computadora)', () => {
    const html = sheet();
    expect(text(html)).toContain('Personas que sigues');
    expect(html).toContain('grid grid-cols-4 gap-2 sm:grid-cols-5');
    expect(html.match(/rounded-full bg-accent-soft font-semibold text-accent size-14/g)).toHaveLength(3);
    expect(html).toMatch(/class="line-clamp-1 w-full text-xs font-medium[^"]*">Ana</);
    expect(html).toMatch(/class="w-full truncate text-\[11px\] text-muted">@ana</);
  });

  it('quien ya está en la liga o ya tiene invitación: marcado y sin poder tocarlo', () => {
    const html = sheet();
    expect(html).toMatch(/<button type="button" disabled="" aria-label="Beto, @beto, ya está en la liga"/);
    expect(html).toMatch(/<button type="button" disabled="" aria-label="Carla, @carla, ya tiene invitación"/);
    expect(text(html)).toContain('En la liga');
    expect(text(html)).toContain('Invitado');
    // Solo Ana se puede elegir (y todavía no está elegida).
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-pressed="true"');
  });

  it('no sigo a nadie: cómo buscarlos', () => {
    state.people = { ...state.people, data: [] };
    const out = text(sheet());
    expect(out).toContain('Aún no sigues a nadie');
    expect(out).toContain('Búscalos por su nombre o @usuario arriba.');
    expect(out).not.toContain('Personas que sigues');
  });

  it('mientras llega la lista: tarjetas de mentira', () => {
    state.people = { ...state.people, data: [], loading: true };
    const html = sheet();
    expect(html.match(/class="skeleton size-14 rounded-full"/g)).toHaveLength(8);
    expect(text(html)).not.toContain('Aún no sigues a nadie');
  });

  it('sin nada elegido, abajo solo el link (sin botón de enviar)', () => {
    const out = text(sheet());
    expect(out).not.toContain('Enviar invitación');
    expect(out).toContain('Copiar enlace');
    expect(out).toContain('WhatsApp');
  });
});

describe('lo que sale según la búsqueda', () => {
  const list = (view: Parameters<typeof PeopleList>[0]['view'], extra: Record<string, unknown> = {}) =>
    renderToString(h(PeopleList, { view, query: 'zzz', people: FOLLOWING, selected: NONE, onToggle: () => undefined, ...extra }));

  it('lo encontrado: las mismas tarjetas, sin el título de las que sigo', () => {
    const html = list('results');
    expect(html).toContain('grid grid-cols-4 gap-2 sm:grid-cols-5');
    expect(text(html)).not.toContain('Personas que sigues');
    expect(text(html)).toContain('Ana');
  });

  it('mientras espera a que deje de escribir, la lista de antes se ve más clara', () => {
    expect(list('results', { settled: false })).toMatch(/class="grid grid-cols-4 gap-2 sm:grid-cols-5 opacity-70[^"]*" aria-busy="true"/);
  });

  it('nadie, una letra y el error', () => {
    expect(text(list('none'))).toContain('No encontramos a nadie con «zzz»');
    expect(text(list('short'))).toContain('Escribe al menos 2 letras.');
    expect(text(list('error', { error: new Error('Failed to fetch') }))).toContain('Reintentar');
  });
});

describe('las tarjetas', () => {
  it('elegida: anillo y marca del color de la liga', () => {
    const html = renderToString(h(PersonTile, { hit: hit('a', 'Ana'), selected: true, onToggle: () => undefined }));
    expect(html).toContain('aria-pressed="true"');
    expect(html).toMatch(/class="[^"]*border-accent bg-accent-soft\/60 ring-2 ring-accent/);
    expect(html).toContain('rounded-full bg-accent text-accent-fg');
    const off = renderToString(h(PersonTile, { hit: hit('a', 'Ana'), selected: false, onToggle: () => undefined }));
    expect(off).toContain('aria-pressed="false"');
    expect(off).not.toContain('ring-accent');
  });

  it('sin @usuario todavía (guardado de antes), solo el nombre', () => {
    const html = renderToString(h(PersonTile, { hit: hit('a', 'Ana', { username: '' }), selected: false, onToggle: () => undefined }));
    expect(html).not.toContain('@');
    expect(html).toContain('aria-label="Ana"');
  });

  it('elegida que pasó a «Invitado» (otro la invitó mientras tanto): se puede soltar', () => {
    const html = renderToString(h(PersonTile, { hit: hit('c', 'Carla', { invited: true }), selected: true, onToggle: () => undefined }));
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-pressed="true"');
    expect(text(html)).toContain('Invitado');
  });

  it('en un torneo: «En el torneo» (también para el lector de pantalla)', () => {
    const html = renderToString(h(PersonTile, { hit: hit('b', 'Beto', { inLeague: true }), selected: false, onToggle: () => undefined, kind: 'torneo' }));
    expect(text(html)).toContain('En el torneo');
    expect(html).toContain('aria-label="Beto, @beto, ya está en el torneo"');
    const out = text(sheet({ league: league({ kind: 'torneo' }) }));
    expect(out).toContain('En el torneo');
    expect(out).not.toContain('En la liga');
  });
});

describe('enviar', () => {
  const bar = (people: PersonHit[], sending = false) =>
    renderToString(h(SendBar, { people, sending, onSend: () => undefined, onClear: () => undefined }));

  it('una persona: «Enviar invitación»; varias: «Enviar a N personas», con a quiénes va', () => {
    const one = text(bar([hit('a', 'Ana')]));
    expect(one).toContain('Enviar invitación');
    expect(one).toContain('Ana');
    const three = text(bar([hit('a', 'Ana'), hit('d', 'Dani'), hit('e', 'Eva')]));
    expect(three).toContain('Enviar a 3 personas');
    expect(three).toContain('Ana, Dani y Eva');
    expect(three).toContain('Quitar');
  });

  it('enviando: el botón gira y no se puede tocar', () => {
    const html = bar([hit('a', 'Ana')], true);
    expect(html).toContain('animate-spin');
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/class="[^"]*h-12 w-full[^"]*"/);
  });
});

describe('el link', () => {
  const row = (link: Parameters<typeof ShareRow>[0]['link'], extra: Record<string, unknown> = {}) =>
    renderToString(h(ShareRow, { link, leagueName: 'Liga de los martes', onCreate: () => undefined, ...extra }));

  it('un miembro de una liga pública manda el de la liga; WhatsApp abre aparte con el texto', () => {
    const html = row({ kind: 'url', url: 'https://matchmate.app/l/l1' });
    const wa = /<a href="([^"]+)" target="_blank" rel="noreferrer"/.exec(html)?.[1].replace(/&amp;/g, '&');
    expect(wa).toBe(`https://wa.me/?text=${encodeURIComponent('Únete a Liga de los martes en MatchMate: https://matchmate.app/l/l1')}`);
    expect(text(html)).toContain('Copiar enlace');
    expect(text(html)).toContain('O manda el link por WhatsApp o donde quieras.');
    expect(html).not.toContain('disabled=""');
  });

  it('en la hoja: el de la liga para el miembro', () => {
    expect(sheet()).toContain(encodeURIComponent('/l/l1'));
  });

  it('«Más» solo si el navegador tiene el menú de compartir', () => {
    expect(text(row({ kind: 'url', url: 'https://x/l/l1' }))).not.toContain('Más');
    vi.stubGlobal('navigator', { share: () => Promise.resolve() });
    expect(text(row({ kind: 'url', url: 'https://x/l/l1' }))).toContain('Más');
  });

  it('el admin, mientras se pide el código: los botones esperan', () => {
    const html = row({ kind: 'loading' });
    expect(html).not.toContain('wa.me');
    expect(html.match(/<button type="button" disabled=""/g)).toHaveLength(2);
    // En la hoja del admin, el código se pide al abrirla (sin el link de la liga mientras tanto).
    const open = inRouter(h(InviteSheet, { league: league({ visibility: 'private' }), lid: 'l1', isAdmin: true, member: true, open: true, onClose: () => undefined }));
    expect(open).not.toContain('wa.me');
    expect(open).not.toContain(encodeURIComponent('/l/l1'));
  });

  it('el admin con código: el link de invitación', () => {
    expect(row({ kind: 'url', url: 'https://matchmate.app/unirse/ABC123' })).toContain(encodeURIComponent('https://matchmate.app/unirse/ABC123'));
  });

  it('el admin sin código: un solo botón que lo crea (nada de copiar, WhatsApp o «Más» sin link)', () => {
    vi.stubGlobal('navigator', { share: () => Promise.resolve() });
    const html = row({ kind: 'none' });
    const t = text(html);
    expect(t).toContain('Todavía no hay link de invitación. Créalo para mandarlo por WhatsApp o donde quieras.');
    expect(t).toContain('Crear link de invitación');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain('wa.me');
    for (const label of ['Copiar enlace', 'Más']) expect(t).not.toContain(label);
    // Creándolo: el botón gira.
    expect(row({ kind: 'none' }, { creating: true })).toContain('animate-spin');
  });

  it('con el teclado abierto el link se esconde (mm-kb-hide) y queda el botón de enviar', () => {
    const html = sheet();
    expect(html).toMatch(/<div class="mm-kb-hide"><div class="flex flex-col gap-2"><p class="[^"]*">O manda el link/);
  });
});
