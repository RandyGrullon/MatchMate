import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPublisher, type Publisher } from './publisher';

let seq = 0;
let sent: number[] = [];
let pub: Publisher;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T23:00:00Z'));
  seq = 0;
  sent = [];
  pub = createPublisher({
    current: () => ({ seq, payload: seq }),
    send: (payload) => {
      sent.push(payload);
    },
  });
});
afterEach(() => {
  pub.dispose();
  vi.useRealTimers();
});

/** Una jugada: sube seq y avisa. */
const point = (milestone = false) => {
  seq++;
  pub.changed(milestone);
};

describe('publicación con tope', () => {
  it('la primera jugada publica ya; las demás, como mucho una vez por minuto (y solo la última)', () => {
    point();
    expect(sent).toEqual([1]);
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(2_000);
      point();
    }
    // 40 s después: nada más todavía.
    expect(sent).toEqual([1]);
    vi.advanceTimersByTime(20_000);
    expect(sent).toEqual([1, 21]);
    // Sin cambios no publica.
    vi.advanceTimersByTime(300_000);
    expect(sent).toEqual([1, 21]);
  });

  it('un hito publica enseguida, pero con al menos 3 s entre publicaciones', () => {
    point();
    vi.advanceTimersByTime(1_000);
    point(true);
    expect(sent).toEqual([1]);
    vi.advanceTimersByTime(1_999);
    expect(sent).toEqual([1]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([1, 2]);
    // Hito 10 s después: ya.
    vi.advanceTimersByTime(10_000);
    point(true);
    expect(sent).toEqual([1, 2, 3]);
  });

  it('un hito adelanta la publicación que esperaba el minuto', () => {
    point();
    vi.advanceTimersByTime(5_000);
    point();
    expect(pub.dueAt).toBe(Date.now() - 5_000 + 60_000);
    vi.advanceTimersByTime(5_000);
    point(true);
    expect(sent).toEqual([1, 3]);
    expect(pub.dueAt).toBeNull();
  });

  it('flush publica ya lo pendiente (terminar, segundo plano); sin nada pendiente no hace nada', () => {
    point();
    point();
    expect(pub.flush()).toBe(true);
    expect(sent).toEqual([1, 2]);
    expect(pub.flush()).toBe(false);
    expect(pub.sentSeq).toBe(2);
  });

  it('en pausa (otro anotador) no publica; al seguir, sí', () => {
    point();
    pub.pause();
    point(true);
    vi.advanceTimersByTime(120_000);
    expect(pub.flush()).toBe(false);
    expect(sent).toEqual([1]);
    pub.resume();
    point(true);
    expect(sent).toEqual([1, 3]);
  });

  it('lo que el servidor ya tiene no se vuelve a mandar; la respuesta llega a onSent', async () => {
    const results: [number, unknown][] = [];
    seq = 5;
    const p = createPublisher({
      current: () => ({ seq, payload: seq }),
      send: async (payload) => ({ ok: true, payload }),
      onSent: (s, r) => results.push([s, r]),
      sentSeq: 5,
    });
    p.changed(true);
    expect(p.flush()).toBe(false);
    seq = 6;
    p.changed(true);
    await vi.runAllTimersAsync();
    expect(results).toEqual([[6, { ok: true, payload: 6 }]]);
    p.dispose();
  });

  it('un error al mandar llega a onError y no rompe lo demás', async () => {
    const errors: number[] = [];
    const p = createPublisher({
      current: () => ({ seq, payload: seq }),
      send: () => {
        throw new Error('sin sesión');
      },
      onError: (s) => errors.push(s),
    });
    seq = 1;
    p.changed();
    expect(errors).toEqual([1]);
    p.dispose();
    seq = 2;
    p.changed(true);
    expect(errors).toEqual([1]);
  });
});
