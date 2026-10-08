/**
 * Las piezas del rediseño «Calma y foco» que comparten las pantallas de raqueta (frame.tsx, bits.tsx, night/parts.tsx,
 * court/parts.tsx) y el modo cancha (src/court): la cabecera con «‹ atrás», el título y «•••»; «Usar Pro» para quien
 * organiza en Lite; la tabla corta con «Tú»; lo largo cerrado en «Cómo se desempata»; los sí o no grandes; el sorteo de la
 * cancha y el retiro en una hoja; y la barra de abajo de la cancha con solo Deshacer y Terminar.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Share2, Trash2 } from 'lucide-react';
import { FeedbackProvider } from '../../../components/feedback';
import { CourtLayout, type CourtController } from '../../../court';
import { LeagueContext, type LeagueCtx } from '../../../lib/league';
import type { League } from '../../../lib/types';
import { FinePrint, RankRows, ToggleRow } from './bits';
import { RetireSheet, SetupChoice, retireItem } from './court/parts';
import { ScreenHead, useOrganizePro } from './frame';
import { FirstRound } from './night/parts';

const mode = vi.hoisted(() => ({ pro: true }));
vi.mock('../../../lib/useMode', async (orig) => ({
  ...(await orig<typeof import('../../../lib/useMode')>()),
  useIsPro: () => mode.pro,
  useMode: () => ({ mode: mode.pro ? 'pro' : 'lite', isPro: mode.pro, setMode: async () => 'local', suggestedPro: false }),
}));
afterEach(() => {
  mode.pro = true;
});

const league = { id: 'L', name: 'Pádel del Club', sport: 'padel', tz: 'America/Santo_Domingo', seasonStart: '', seasonEnd: '' } as unknown as League;
const ctx = { lid: 'L', league, member: null, isAdmin: true, isOwner: true, isScorer: false, canScore: true, myPlayerId: null, base: '/l/L' } as unknown as LeagueCtx;
const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(LeagueContext.Provider, { value: ctx }, el))));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('la cabecera (ScreenHead)', () => {
  it('«‹ Pádel del Club», el título, «● Ronda 1 de 7 · …» y «•••» (con opciones)', () => {
    const html = render(
      h(ScreenHead, {
        back: { label: 'Pádel del Club', fallback: '/l/L' },
        title: 'Americano del jueves',
        status: { text: 'Ronda 1 de 7', live: true },
        meta: 'Jue 8 oct · 7:00 pm',
        menu: [
          { key: 'compartir', icon: Share2, label: 'Compartir la tabla', onClick: () => undefined },
          { key: 'borrar', icon: Trash2, label: 'Borrar', onClick: () => undefined, danger: true },
        ],
      }),
    );
    const t = text(html);
    expect(t).toContain('Pádel del Club');
    expect(t).toContain('Americano del jueves');
    expect(t).toContain('Ronda 1 de 7 · Jue 8 oct · 7:00 pm');
    expect(html).toContain('aria-label="Más opciones"');
    // El título grande de Pro (en Lite, el de 32 px).
    expect(html).toContain('text-title-pro');
    mode.pro = false;
    expect(render(h(ScreenHead, { back: null, title: 'X' }))).toContain('text-title');
  });

  it('sin opciones ni atrás no hay barra (un torneo sin liga puesto en el inicio)', () => {
    const html = render(h(ScreenHead, { back: null, title: 'Torneo de octubre' }));
    expect(html).not.toContain('Más opciones');
    expect(text(html)).toContain('Torneo de octubre');
  });
});

describe('«Usar Pro» para quien organiza en Lite', () => {
  function Probe({ on }: { on: boolean }) {
    const item = useOrganizePro(on, { id: 'x', title: 'Organizas esta noche', text: 'Las rondas se arman en Pro', menu: 'Rondas y marcadores' });
    return h('p', null, item ? `${item.label} · ${item.hint}` : 'nada');
  }
  it('en Lite devuelve la opción de «•••»; en Pro, o si no organiza, nada', () => {
    mode.pro = false;
    expect(text(render(h(Probe, { on: true })))).toContain('Rondas y marcadores · Está en Pro · Usar Pro');
    expect(text(render(h(Probe, { on: false })))).toContain('nada');
    mode.pro = true;
    expect(text(render(h(Probe, { on: true })))).toContain('nada');
  });
});

describe('piezas chicas', () => {
  it('la tabla corta: puesto, nombre, «Tú» en tu fila y el número grande', () => {
    const html = render(
      h(RankRows, {
        rows: [
          { id: 'a', rank: 1 },
          { id: 'b', rank: 2 },
        ],
        nameOf: (id: string) => (id === 'a' ? 'Ana' : 'Luis'),
        value: (id: string) => (id === 'a' ? 30 : 22),
        sub: () => '3 partidos',
        highlight: ['b'],
      }),
    );
    const t = text(html);
    expect(t).toMatch(/1 Ana 3 partidos 30/);
    expect(t).toMatch(/2 Luis Tú 3 partidos 22/);
    expect(html).toContain('mm-row-me');
  });

  it('lo largo se cierra en «Cómo se desempata» (pero está en la página)', () => {
    const html = render(h(FinePrint, null, 'Desempates: puntos, dif. de sets…'));
    expect(html).toContain('<details');
    expect(text(html)).toContain('Cómo se desempata');
    expect(text(html)).toContain('Desempates: puntos');
  });

  it('un sí o no grande con su casilla', () => {
    const html = render(h(ToggleRow, { checked: true, onChange: () => undefined, label: 'Ida y vuelta', hint: 'Dos veces contra cada rival' }));
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
    expect(text(html)).toContain('Ida y vuelta Dos veces contra cada rival');
  });

  it('antes de la ronda 1: quien organiza ve UN botón, «Empezar ronda 1»; los demás, que todavía no empieza', () => {
    const org = text(render(h(FirstRound, { organize: true, summary: '8 jugadores en 2 canchas', problem: null, busy: false, onStart: () => undefined, onPlayers: () => undefined })));
    expect(org).toContain('Todo listo para la ronda 1');
    expect(org).toContain('Empezar ronda 1');
    const other = text(render(h(FirstRound, { organize: false, summary: '', problem: null, busy: false, onStart: () => undefined, onPlayers: () => undefined })));
    expect(other).toContain('Todavía no empieza');
    expect(other).not.toContain('Empezar ronda 1');
  });
});

describe('la cancha', () => {
  it('el sorteo: dos opciones grandes, la elegida marcada', () => {
    const html = render(
      h(SetupChoice<number>, {
        label: '¿Quién saca primero?',
        value: 2,
        onChange: () => undefined,
        options: [
          { value: 1, text: 'Ana / Luis' },
          { value: 2, text: 'Rosa / Pedro' },
        ],
      }),
    );
    expect(html).toContain('role="radiogroup"');
    expect(html.indexOf('aria-checked="true"')).toBeGreaterThan(html.indexOf('Ana / Luis'));
  });

  it('el retiro: una hoja con «Se retira …» de cada lado', () => {
    const t = text(render(h(RetireSheet, { open: true, onClose: () => undefined, labels: ['Ana', 'Rosa'], note: 'Gana el otro lado', onRetire: () => undefined })));
    expect(t).toContain('¿Quién se retira?');
    expect(t).toContain('Se retira Ana');
    expect(t).toContain('Se retira Rosa');
  });

  it('la barra de abajo: Deshacer y Terminar (grandes); el retiro y suspender, en «•••» de arriba', () => {
    const court = {
      ready: true,
      snapshot: { config: {}, events: [], seq: 0 },
      state: {},
      over: false,
      winner: null,
      summary: '0-0',
      score: null,
      canUndo: false,
      lease: { kind: 'mine' },
      readOnly: false,
      unsent: 0,
      conflict: false,
      error: null,
      start: () => undefined,
      apply: () => null,
      undo: () => false,
      claim: async () => null,
      finish: async () => 'sent',
      suspend: async () => undefined,
      flush: () => undefined,
    } as unknown as CourtController<unknown, unknown, unknown>;
    const html = render(h(CourtLayout, { title: 'Cancha 2', onExit: () => undefined, court, more: [retireItem(() => undefined)], children: h('div', null, 'toques') }));
    const i = html.lastIndexOf('pb-safe');
    const bar = html.slice(i);
    expect(bar.match(/<button/g)).toHaveLength(2);
    expect(bar).toContain('Deshacer');
    expect(bar).toContain('Terminar');
    expect(html.slice(0, i)).toContain('aria-label="Más opciones"');
    expect(html.slice(0, i)).toContain('aria-label="Salir del modo cancha"');
  });
});
