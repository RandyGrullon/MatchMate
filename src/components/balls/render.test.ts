/**
 * Mis bolas dibujadas sin navegador (renderToString): la fila de bolas de un juego al anotar (el botón de cada juego y
 * la hoja para elegirla, en picker.test.ts), el color y el ícono, la tarjeta de una bola con sus números y el aviso de
 * pulirla, la hoja para agregar o cambiar una (al anotar, la que se agrega queda elegida) y la página sin cuenta.
 */
import { createElement as h, createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ballStats, RESURFACE_EVERY, type Ball, type BallDraft, type BallGame } from '../../lib/balls';
import { BackendError } from '../../lib/backend/types';
import { FeedbackProvider } from '../feedback';
import { BallDot } from './BallDot';
import { BallIcon, GameBallSelect } from './BallPicker';
import { BallSheet, ballToDraft, saveBallSheet } from './BallSheet';
import { BallCard, BallStatsSection, statsForSection } from './BallStats';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const ball = (id: string, extra: Partial<Ball> = {}): Ball => ({
  id,
  name: 'Phaze II',
  brand: 'Storm',
  weight: 15,
  color: '#1d4ed8',
  cover: 'solida',
  drilledOn: '2026-01-10',
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  ...extra,
});

const games = (b: string, scores: number[], extra: Partial<BallGame> = {}): BallGame[] =>
  scores.map((score, i) => ({ ball: b, kind: 'solo', ref: `s${i}`, game: 0, date: '2026-09-20', score, frames: null, counted: true, ...extra }));

const noop = () => undefined;

describe('elegir la bola al anotar', () => {
  const balls = [ball('a'), ball('b', { name: 'Spare', weight: 14, color: '#f8fafc' }), ball('c', { name: 'Vieja', retired: true })];

  it('la de un juego, dentro de la hoja de anotar: el chip «Bola: …» y la fila de bolas dibujadas, con la del juego marcada', () => {
    const choice = createRef<string | null>() as { current: string | null };
    const out = renderToString(h(GameBallSelect, { balls, initial: 'a', choice }));
    expect(text(out)).toContain('Bola: Phaze II 15 lb');
    expect(out).toContain('role="radiogroup" aria-label="Bola de este juego"');
    expect(out).toContain('role="radio" aria-checked="true" aria-label="Phaze II (15 lb)"');
    expect(out).toContain('role="radio" aria-checked="false" aria-label="Sin bola"');
    expect(out).toContain('aria-label="Agregar bola"');
    expect(out).not.toContain('<option');
  });

  it('el color y el ícono', () => {
    expect(renderToString(h(BallDot, { color: '#111827', className: 'size-8' }))).toContain('background-color:#111827');
    expect(renderToString(h(BallDot, { color: null }))).toContain('border-dashed');
    expect(renderToString(h(BallIcon, {}))).toContain('<svg');
  });
});

describe('la tarjeta de una bola', () => {
  const card = (b: Ball, gs: BallGame[]) =>
    renderToString(
      h(MemoryRouter, null, h(BallCard, { stats: ballStats([b], gs)[0], onEdit: noop, onResurface: noop, onRetire: noop })),
    );

  it('sus números, cuántos juegos lleva sin pulir y las acciones', () => {
    const out = card(ball('a'), games('a', [200, 181, 150]));
    const t = text(out);
    expect(t).toContain('Phaze II');
    expect(t).toContain('15 lb · Storm · Reactiva sólida');
    expect(t).toContain('Juegos');
    expect(t).toContain('177');
    expect(t).toContain('200');
    expect(t).toContain('3 juegos sin pulir.');
    expect(t).toContain('La pulí hoy');
    expect(t).toContain('Retirar');
    expect(t).toContain('Último juego con ella');
    expect(out).toContain('aria-label="Editar la Phaze II"');
    expect(out).not.toContain('bg-warn-soft');
  });

  it('a los 60 juegos avisa que toca pulirla; lo por verificar se dice aparte', () => {
    const gs = [...games('a', Array(RESURFACE_EVERY).fill(180), { date: '2026-09-10' }), ...games('a', [190], { counted: false })];
    const out = card(ball('a', { resurfacedOn: '2026-09-01' }), gs);
    const t = text(out);
    expect(t).toContain(`Lleva ${RESURFACE_EVERY + 1} juegos desde la última pulida: ya le toca pulirla`);
    expect(t).toContain('La puliste el');
    expect(t).toContain('1 juego cuenta cuando se verifique.');
    expect(out).toContain('bg-warn-soft');
  });

  it('retirada: «Volver a usarla» y sin pulir', () => {
    const t = text(card(ball('a', { retired: true }), []));
    expect(t).toContain('retirada');
    expect(t).toContain('Volver a usarla');
    expect(t).not.toContain('La pulí hoy');
  });

  it('«Por bola»: sin sesión no sale; las retiradas sin juegos tampoco', () => {
    expect(renderToString(h(MemoryRouter, null, h(BallStatsSection)))).toBe('');
    const stats = statsForSection([ball('a'), ball('b', { retired: true }), ball('c', { retired: true })], games('c', [150]));
    expect(stats.map((s) => s.ball.id)).toEqual(['a', 'c']);
  });
});

describe('la hoja de una bola', () => {
  const sheet = (b: Ball | null) =>
    renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(BallSheet, { ball: b, today: '2026-09-30', onClose: noop }))));

  it('nueva: 15 libras, azul, sin «Borrar»', () => {
    const out = sheet(null);
    const t = text(out);
    expect(t).toContain('Agregar bola');
    expect(t).toContain('Solo tú ves tus bolas');
    expect(out).toMatch(/<option value="15" selected="">15 lb<\/option>/);
    expect(out.match(/role="radio"/g)).toHaveLength(13);
    expect(out).toMatch(/role="radio" aria-checked="true" aria-label="Azul"/);
    expect(out).toContain('max="2026-09-30"');
    expect(t).not.toContain('Borrar');
    expect(t).toContain('cada 60 juegos');
  });

  it('una que existe: sus datos y «Borrar»', () => {
    const out = sheet(ball('a', { color: '#111827', weight: 14, resurfacedOn: '2026-09-01' }));
    const t = text(out);
    expect(out).toContain('value="Phaze II"');
    expect(out).toContain('value="Storm"');
    expect(out).toMatch(/<option value="14" selected="">14 lb<\/option>/);
    expect(out).toMatch(/<option value="solida" selected="">/);
    expect(out).toMatch(/role="radio" aria-checked="true" aria-label="Negro"/);
    expect(out).toContain('value="2026-09-01"');
    expect(t).toContain('Borrar');
  });

  it('al anotar (con `onSaved`, que recibe la nueva para elegirla) se ve igual', () => {
    const withSaved = renderToString(
      h(MemoryRouter, null, h(FeedbackProvider, null, h(BallSheet, { ball: null, today: '2026-09-30', onClose: noop, onSaved: noop }))),
    );
    expect(withSaved).toBe(sheet(null));
  });

  describe('«Guardar» (al anotar, «Agregar bola»)', () => {
    const draft: BallDraft = { ...ballToDraft(null), name: 'Nueva' };
    /** Lo que pasa, en orden. */
    const run = async (save: (d: BallDraft, today: string) => Promise<string>, d = draft) => {
      const log: string[] = [];
      const ok = await saveBallSheet(d, '2026-09-30', {
        toast: (m, tone) => log.push(`toast:${tone ?? 'ok'}:${m}`),
        onSaved: (id) => log.push(`elegida:${id}`),
        onClose: () => log.push('cerrar'),
        save,
      });
      return { ok, log };
    };

    it('la nueva queda elegida (su id, el que devuelve saveBall) y después se cierra la hoja', async () => {
      const save = vi.fn(async () => 'bola-nueva');
      const { ok, log } = await run(save);
      expect(ok).toBe(true);
      expect(save).toHaveBeenCalledWith(draft, '2026-09-30');
      expect(log).toEqual(['toast:ok:Bola agregada', 'elegida:bola-nueva', 'cerrar']);
    });

    it('cambiar una que ya existe dice «Bola guardada»', async () => {
      const { log } = await run(async () => 'a', { ...draft, id: 'a' });
      expect(log).toEqual(['toast:ok:Bola guardada', 'elegida:a', 'cerrar']);
    });

    it('sin señal (o con el cupo lleno): lo dice, no elige nada y la hoja sigue abierta', async () => {
      const offline = await run(async () => {
        throw new BackendError('Failed to fetch', 'network', 'network');
      });
      expect(offline.ok).toBe(false);
      expect(offline.log).toEqual(['toast:error:Sin conexión. Prueba otra vez cuando tengas señal.']);
      const full = await run(async () => {
        throw new Error('cupo_lleno');
      });
      expect(full.log).toEqual(['toast:error:Ya tienes 30 bolas: borra una que ya no uses para agregar otra.']);
    });
  });

  it('lo que se edita sale de la bola (o una nueva)', () => {
    expect(ballToDraft(null)).toEqual({ id: null, name: '', brand: '', weight: 15, color: '#1d4ed8', cover: null, drilledOn: null, resurfacedOn: null, retired: false });
    expect(ballToDraft(ball('a', { retired: true }))).toMatchObject({ id: 'a', name: 'Phaze II', cover: 'solida', retired: true });
  });
});
