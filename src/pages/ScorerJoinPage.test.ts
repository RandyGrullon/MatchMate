/**
 * El link para anotar (/anotar/<código>) dibujado sin navegador (renderToString) con datos de mentira: sin sesión (los
 * links de entrar o crear la cuenta vuelven aquí con ?entrar=1), con sesión («Entrar para anotar»), el link que ya no
 * sirve (vencido, lleno, quitado, que no existe, muchos intentos, o no para esta cuenta) y quien ya anota (va directo
 * al torneo: <Navigate> de mentira que dice a dónde). Y lo que hace «Entrar para anotar» (enterWithLink) con cada
 * respuesta de joinAsScorer.
 */
import { createElement as h, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from '../lib/backend/types';
import type { ScorerJoinResult, ScorerLinkInfo, ScorerLinkPreview } from '../lib/data/scorers';
import { FeedbackProvider } from '../components/feedback';

const state = vi.hoisted(() => ({
  auth: { user: null as { uid: string } | null, loading: false },
}));

vi.mock('../lib/auth', () => ({ useAuth: () => state.auth }));
vi.mock('../components/Shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
// <Navigate> no se mueve sin navegador: el de mentira deja escrito a dónde iba.
vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  const { createElement } = await import('react');
  return { ...actual, Navigate: ({ to }: { to: string }) => createElement('i', { 'data-navigate': to }) };
});

const { default: ScorerJoinPage, ScorerJoinView, enterWithLink } = await import('./ScorerJoinPage');

const info = (extra: Partial<ScorerLinkInfo> = {}): ScorerLinkInfo => ({
  status: 'ok',
  leagueId: 'l1',
  name: 'Liga de los martes',
  sport: 'bowling',
  kind: 'liga',
  visibility: 'private',
  logoPath: null,
  scope: 'evento',
  refId: 'e1',
  title: 'Copa Aniversario',
  path: '/l/l1/e/e1',
  expiresAt: '2026-10-06T15:00:00Z',
  member: false,
  canScore: false,
  ...extra,
});

const view = (preview: ScorerLinkPreview, signedIn: boolean, extra: Record<string, unknown> = {}) =>
  renderToString(
    h(
      MemoryRouter,
      { initialEntries: ['/anotar/ABCDEFGH23'] },
      h(FeedbackProvider, null, h(ScorerJoinView, { code: 'ABCDEFGH23', preview, signedIn, onEnter: () => undefined, ...extra })),
    ),
  );
/** Texto visible (sin etiquetas), para buscar frases. */
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

beforeEach(() => {
  state.auth = { user: null, loading: false };
});

describe('/anotar/<código>', () => {
  it('mientras carga (la página pide el link al abrirse)', () => {
    const out = renderToString(
      h(MemoryRouter, { initialEntries: ['/anotar/abcdefgh23'] }, h(FeedbackProvider, null, h(Routes, null, h(Route, { path: '/anotar/:code', element: h(ScorerJoinPage) })))),
    );
    expect(out).toContain('role="status"');
  });

  it('sin sesión: el torneo y los links de entrar vuelven aquí con ?entrar=1', () => {
    const out = view(info(), false);
    const t = text(out);
    expect(t).toContain('Te invitaron a anotar');
    expect(t).toContain('Liga de los martes');
    expect(t).toContain('en Copa Aniversario');
    expect(t).toContain('Boliche');
    expect(t).toContain('Liga privada');
    expect(t).toContain('Anotas los resultados. No te inscribe como jugador.');
    expect(t).toContain('Podrás anotar en los torneos de esta liga (no en las prácticas).');
    expect(t).toContain('El link vence el');
    expect(t).toContain('Crear cuenta y entrar a anotar');
    expect(t).toContain('Ya tengo cuenta');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2Fanotar%2FABCDEFGH23%3Fentrar%3D1"');
    expect(out).toContain('href="/login?next=%2Fanotar%2FABCDEFGH23%3Fentrar%3D1"');
    expect(t).not.toContain('Entrar para anotar');
  });

  it('un torneo sin liga: sin la línea de «esta liga» ni «en …» si es el mismo nombre', () => {
    const t = text(view(info({ kind: 'torneo', name: 'Copa', title: 'Copa', visibility: 'public' }), false));
    expect(t).toContain('Torneo');
    expect(t).not.toContain('en Copa');
    expect(t).not.toContain('Podrás anotar');
  });

  it('con sesión: «Entrar para anotar»', () => {
    const t = text(view(info(), true));
    expect(t).toContain('Entrar para anotar');
    expect(t).not.toContain('Crear cuenta');
  });

  it('entrando solo (volvió de /login): la carga', () => {
    expect(view(info(), true, { entering: true })).toContain('Entrando para anotar');
  });

  it('con sesión y ya anota: va al torneo (no enseña la tarjeta)', () => {
    const out = view(info({ canScore: true, member: true }), true);
    expect(out).toContain('data-navigate="/l/l1/e/e1"');
    expect(text(out)).not.toContain('Entrar para anotar');
    expect(text(out)).not.toContain('Te invitaron a anotar');
    // Sin sesión no se sabe si anota: la tarjeta.
    expect(view(info({ canScore: true }), false)).not.toContain('data-navigate');
  });

  it('a quien un admin quitó: el link ya no le sirve', () => {
    const t = text(view({ status: 'removed' }, true));
    expect(t).toContain('Este link ya no te sirve');
    expect(t).toContain('Un admin te quitó el permiso de anotar. Si fue un error, pídele que te vuelva a invitar.');
    expect(t).not.toContain('Entrar para anotar');
  });

  it('vencido, lleno, quitado, que no existe o muchos intentos', () => {
    expect(text(view({ status: 'expired' }, true))).toContain('Este link venció');
    expect(text(view({ status: 'full' }, false))).toContain('Este link ya se usó todas las veces');
    expect(text(view({ status: 'revoked' }, false))).toContain('Este link ya no sirve');
    expect(text(view({ status: 'closed' }, false))).toContain('Este link ya no sirve');
    const none = text(view(null, false));
    expect(none).toContain('Este link no sirve');
    expect(none).toContain('El código no existe. Pídele el link a quien organiza.');
    expect(none).toContain('Ver ligas');
    expect(text(view({ status: 'rate_limited' }, false))).toContain('Demasiados intentos');
  });
});

describe('«Entrar para anotar» (enterWithLink): lo que sigue según joinAsScorer', () => {
  const joined = (status: 'joined' | 'upgraded' | 'already', title = 'Copa Aniversario'): ScorerJoinResult => ({
    status,
    leagueId: 'l1',
    scope: 'evento',
    refId: 'e1',
    title,
    path: '/l/l1/e/e1',
  });
  const join = (r: ScorerJoinResult | Error) => vi.fn(async () => {
    if (r instanceof Error) throw r;
    return r;
  });

  it('entró: una sola llamada con el código, al torneo y con el aviso', async () => {
    const fn = join(joined('joined'));
    expect(await enterWithLink('ABCDEFGH23', info(), fn)).toEqual({ kind: 'go', path: '/l/l1/e/e1', toast: 'Ya puedes anotar en Copa Aniversario' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('ABCDEFGH23');
    expect(await enterWithLink('ABCDEFGH23', info(), join(joined('upgraded')))).toMatchObject({ toast: 'Ya puedes anotar en Copa Aniversario. Sigues jugando.' });
    // Ya anotaba: al torneo, sin aviso. Sin título en la respuesta: el del link.
    expect(await enterWithLink('ABCDEFGH23', info(), join(joined('already')))).toEqual({ kind: 'go', path: '/l/l1/e/e1', toast: null });
    expect(await enterWithLink('ABCDEFGH23', info(), join(joined('joined', '')))).toMatchObject({ toast: 'Ya puedes anotar en Copa Aniversario' });
  });

  it('el link dejó de servir mientras miraba, no sirve para esta cuenta o el código no existe: su vacío', async () => {
    for (const status of ['expired', 'full', 'revoked', 'closed', 'removed'] as const) {
      expect(await enterWithLink('ABCDEFGH23', info(), join({ status }))).toEqual({ kind: 'dead', preview: { status } });
    }
    expect(await enterWithLink('ABCDEFGH23', info(), join(null))).toEqual({ kind: 'dead', preview: null });
  });

  it('muchos intentos: el vacío de «Demasiados intentos»; otro error: el aviso, y la tarjeta sigue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await enterWithLink('ABCDEFGH23', info(), join(new BackendError('rate_limited', 'rate_limited', 'P0001')))).toEqual({
      kind: 'dead',
      preview: { status: 'rate_limited' },
    });
    expect(await enterWithLink('ABCDEFGH23', info(), join(new BackendError('Failed to fetch', 'network')))).toEqual({
      kind: 'error',
      message: 'Sin conexión. Prueba otra vez cuando tengas señal.',
    });
    expect(await enterWithLink('ABCDEFGH23', info(), join(new Error('boom')))).toEqual({ kind: 'error', message: 'No se pudo entrar. Prueba otra vez.' });
  });
});
