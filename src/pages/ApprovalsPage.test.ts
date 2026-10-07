/**
 * Organizar › Aprobar juegos dibujado sin navegador (renderToString): «Por aprobar · 2 con foto» y «Aprobar todo»
 * arriba, cada envío con su foto, «Juego 2 · 181», Rechazar y Aprobar; sin foto (cuando la liga la exige) se marca; y
 * mientras «Aprobar todo» corre, su ruedita y los botones de cada envío esperan.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../components/feedback';
import { LeagueContext, type LeagueCtx } from '../lib/league';
import type { BowlingEvent, League, Player, Submission } from '../lib/types';

const data = vi.hoisted(() => ({
  subs: [] as Partial<Submission>[],
  events: [] as Partial<BowlingEvent>[],
  players: [] as Partial<Player>[],
}));
vi.mock('../lib/data', async (orig) => ({
  ...(await orig<typeof import('../lib/data')>()),
  useSubmissions: () => ({ data: data.subs, loading: false, error: null }),
  useEvents: () => ({ data: data.events, loading: false, error: null }),
  usePlayers: () => ({ data: data.players, loading: false, error: null }),
  useAllEntries: () => ({ data: [], loading: false, error: null }),
}));
vi.mock('../lib/photos', async (orig) => ({
  ...(await orig<typeof import('../lib/photos')>()),
  usePhoto: (_lid: string, id: string | null) => ({ data: id ? { url: `blob:${id}` } : null, loading: false, error: null }),
}));

// La acción que espera (useBusy) en toda la pantalla; null = la de verdad.
const busy = vi.hoisted(() => ({ key: null as string | null }));
vi.mock('../components/busy', async (orig) => {
  const real = await orig<typeof import('../components/busy')>();
  return {
    ...real,
    useBusy: () => {
      const b = real.useBusy();
      const key = busy.key;
      return key == null ? b : { ...b, busy: key, isBusy: (k?: string) => (k === undefined ? true : k === key) };
    },
  };
});

const { default: ApprovalsPage } = await import('./ApprovalsPage');

const league = (requirePhoto: boolean): League =>
  ({ id: 'L1', name: 'Liga de los martes', kind: 'liga', visibility: 'public', sport: 'bowling', requirePhoto }) as unknown as League;
const ctx = (requirePhoto = true): LeagueCtx => ({
  lid: 'L1',
  league: league(requirePhoto),
  member: null,
  isAdmin: true,
  isOwner: true,
  isScorer: false,
  canScore: true,
  myPlayerId: 'p0',
  base: '/l/L1',
});
const render = (value = ctx()) =>
  renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value }, h(ApprovalsPage)))));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const at = (ms: number) => ({ toMillis: () => ms }) as Submission['createdAt'];

beforeEach(() => {
  busy.key = null;
  data.events = [{ id: 'E1', type: 'practica', name: 'Práctica de hoy', date: '2026-10-07', games: 3 }];
  data.players = [
    { id: 'p2', name: 'Sofía Rodríguez' },
    { id: 'p4', name: 'Carmen Díaz' },
  ];
  data.subs = [
    { id: 's2', playerId: 'p4', eventId: 'E1', scores: [null, null, 199], scanned: null, photoId: 'f2', status: 'pendiente', createdAt: at(2) },
    { id: 's1', playerId: 'p2', eventId: 'E1', scores: [null, 181], scanned: null, photoId: 'f1', status: 'pendiente', createdAt: at(1) },
  ];
});

describe('Organizar › Aprobar juegos', () => {
  it('como el diseño: «Por aprobar · 2 con foto», «Aprobar todo» y cada envío con su foto, juego, Rechazar y Aprobar', () => {
    const out = render();
    const t = text(out);
    expect(t).toContain('Por aprobar · 2 con foto');
    expect(t).toContain('Aprobar todo');
    // Lo más viejo primero.
    expect(t).toMatch(/Sofía R\. Juego 2 · 181 Rechazar Aprobar Carmen D\. Juego 3 · 199 Rechazar Aprobar/);
    expect(out).toContain('src="blob:f1"');
    expect(out).toContain('aria-label="Aprobar 1 juego de Sofía Rodríguez"');
    expect(out).toContain('aria-label="Rechazar el envío de Carmen Díaz"');
    expect(out).toContain('aria-label="Sofía Rodríguez: ver la foto y los juegos"');
    expect(out).toContain('aria-expanded="false"');
    // Cerrado: sin la tabla para corregir (se abre al tocar el envío).
    expect(t).not.toContain('Guardar desde el juego');
  });

  it('uno solo, sin foto y la liga la exige: se marca y no hay «Aprobar todo»', () => {
    data.subs = [{ ...data.subs[1], photoId: null }];
    const t = text(render());
    expect(t).toContain('Por aprobar · 1 sin foto');
    expect(t).not.toContain('Aprobar todo');
    expect(t).toContain('Sofía R. Sin foto · Juego 2 · 181');
  });

  it('sin envíos: «Nada por aprobar»', () => {
    data.subs = [];
    expect(text(render())).toContain('Nada por aprobar');
  });

  it('mientras «Aprobar todo» corre: su ruedita, y los botones de cada envío esperan', () => {
    busy.key = 'todo';
    const out = render();
    const buttons = out.match(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g) ?? [];
    const all = buttons.find((b) => b.includes('Aprobar todo'));
    expect(all).toContain('animate-spin');
    expect(all).toContain('disabled=""');
    const rows = buttons.filter((b) => /aria-label="(Aprobar \d|Rechazar el envío)/.test(b));
    expect(rows).toHaveLength(4);
    for (const b of rows) expect(b).toContain('disabled=""');
  });
});
