import { afterEach, describe, expect, it, vi } from 'vitest';
import { DUO_M } from '../splash/brand';
import { buildScene, type CardFrame, type ShareTableSpec } from './cards';
import { canvasMeasure, paintScene, pathPoints, renderCardPng, type Ctx2D } from './paint';
import { estimateWidth } from './scene';

/** Contexto 2D de mentira: guarda lo que se pinta. */
function fakeCtx() {
  const calls: { op: string; args: unknown[]; fill?: unknown; font?: string; alpha?: number; align?: string }[] = [];
  const state = { fillStyle: '' as unknown, font: '', globalAlpha: 1, textAlign: 'start' };
  const rec =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args, fill: state.fillStyle, font: state.font, alpha: state.globalAlpha, align: state.textAlign });
    };
  const ctx = {
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v: unknown) {
      state.fillStyle = v;
    },
    get font() {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v;
    },
    get textAlign() {
      return state.textAlign;
    },
    set textAlign(v: string) {
      state.textAlign = v;
    },
    strokeStyle: '',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    save: rec('save'),
    restore: rec('restore'),
    scale: rec('scale'),
    translate: rec('translate'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    arc: rec('arc'),
    arcTo: rec('arcTo'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    fillRect: rec('fillRect'),
    fillText: rec('fillText'),
    measureText: vi.fn((t: string) => ({ width: t.length * 7 })),
  };
  return { ctx: ctx as unknown as Ctx2D, calls, measure: ctx.measureText };
}

const frame: CardFrame = { sportLabel: 'Golf', color: '#065f46', date: '27 sep 2026', link: 'https://matchmate.do/l/g/ranking' };
const spec: ShareTableSpec = {
  kind: 'table',
  title: 'Liga de golf',
  subtitle: 'Orden de mérito',
  columns: [{ label: 'Jugó' }, { label: 'Puntos', strong: true }],
  sections: [
    {
      rows: [
        { rank: 1, name: 'Ana', values: [3, 250] },
        { rank: 2, name: 'Luis', values: [3, 180] },
      ],
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('pintar en el canvas', () => {
  it('lee la M del logo como puntos', () => {
    expect(pathPoints(DUO_M)).toEqual([
      [150, 384],
      [150, 218],
      [256, 324],
      [362, 218],
      [362, 384],
    ]);
    expect(pathPoints('M0 0H10V20L5,5')).toEqual([
      [0, 0],
      [10, 0],
      [10, 20],
      [5, 5],
    ]);
  });

  it('pinta al doble: fondo del deporte, cada texto con su letra y el logo', () => {
    const scene = buildScene(spec, frame, estimateWidth);
    const { ctx, calls } = fakeCtx();
    paintScene(ctx, scene, 2);
    expect(calls[0].op).toBe('save');
    expect(calls[1]).toMatchObject({ op: 'scale', args: [2, 2] });
    expect(calls.find((c) => c.op === 'fillRect')).toMatchObject({ args: [0, 0, scene.width, scene.height], fill: frame.color });
    const painted = calls.filter((c) => c.op === 'fillText');
    const drawn = scene.nodes.filter((n) => n.t === 'text');
    expect(painted.map((c) => c.args[0])).toEqual(drawn.map((n) => n.text));
    const title = painted.find((c) => c.args[0] === 'Liga de golf');
    expect(title?.font).toMatch(/^800 26px Inter/);
    const pts = painted.find((c) => c.args[0] === 'Puntos');
    expect(pts?.align).toBe('right');
    // Los círculos claros de adorno van transparentes.
    expect(calls.some((c) => c.op === 'fill' && c.alpha! < 0.2)).toBe(true);
    // La M del logo (5 puntos) con trazo.
    expect(calls.filter((c) => c.op === 'lineTo').length).toBeGreaterThanOrEqual(4);
    expect(calls.some((c) => c.op === 'stroke')).toBe(true);
    // Todo lo que se guarda se restaura.
    expect(calls.filter((c) => c.op === 'save').length).toBe(calls.filter((c) => c.op === 'restore').length);
  });

  it('mide con el canvas una sola vez por texto', () => {
    const { ctx, measure } = fakeCtx();
    const m = canvasMeasure(ctx);
    expect(m('Ana', 16, 600)).toBe(21);
    expect(m('Ana', 16, 600)).toBe(21);
    expect(m('Ana', 12, 600)).toBe(21);
    expect(measure).toHaveBeenCalledTimes(2);
  });
});

describe('hacer el PNG', () => {
  it('canvas de 1080 de ancho y el alto según la tabla', async () => {
    const { ctx } = fakeCtx();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ctx),
      toBlob: vi.fn((cb: (b: Blob | null) => void, type: string) => cb(new Blob(['png'], { type }))),
    };
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    const blob = await renderCardPng(spec, frame);
    expect(blob.type).toBe('image/png');
    expect(canvas.width).toBe(1080);
    const scene = buildScene(spec, frame, canvasMeasure(ctx));
    expect(canvas.height).toBe(scene.height * 2);
  });

  it('sin canvas o si no sale el PNG, avisa con un error claro', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    await expect(renderCardPng(spec, frame)).rejects.toThrow('no puede hacer la imagen');
    const { ctx } = fakeCtx();
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob | null) => void) => cb(null) }) });
    await expect(renderCardPng(spec, frame)).rejects.toThrow('No se pudo hacer la imagen');
  });

  it('espera la letra de la app, pero no para siempre', async () => {
    vi.useFakeTimers();
    try {
      const { ctx } = fakeCtx();
      const canvas = { width: 0, height: 0, getContext: () => ctx, toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(['x'])) };
      const load = vi.fn(() => new Promise<never>(() => {}));
      vi.stubGlobal('document', { createElement: () => canvas, fonts: { load } });
      const done = renderCardPng(spec, frame);
      await vi.advanceTimersByTimeAsync(1500);
      await expect(done).resolves.toBeInstanceOf(Blob);
      expect(load).toHaveBeenCalledWith('700 16px Inter', expect.any(String));
    } finally {
      vi.useRealTimers();
    }
  });
});
