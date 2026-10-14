/**
 * La práctica abierta (docs/boliche-equipos-practicas-bolas.md §2) con un backend de mentira: `open_practice` con sus
 * argumentos, lo que se vuelve a leer, el «cerrado» de la base en palabras y el botón de la tarjeta (abrir y llevar a
 * anotar o a la planilla).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setBackendForTests } from '../backend';
import { mapDbError } from '../backend/errors';
import { BackendError, type Backend, type SelectQuery } from '../backend/types';
import { queryClient } from './client';
import { isPracticeClosed, openPractice, PRACTICE_CLOSED_TEXT } from './events';

const { goToPractice, openPracticeErrorText } = await import('../../components/home/TodayCard');
const { reason } = await import('../../components/OutboxIndicator');

interface Fake extends Backend {
  rpcs: { fn: string; args?: Record<string, unknown> }[];
  answers: Record<string, unknown>;
}

function fakeBackend(): Fake {
  const f: Fake = {
    mode: 'supabase',
    rpcs: [],
    answers: {},
    auth: {} as Backend['auth'],
    async select<T>(_q: SelectQuery) {
      return [] as T[];
    },
    async rpc<T>(fn: string, args?: Record<string, unknown>) {
      f.rpcs.push({ fn, args });
      const a = f.answers[fn];
      if (a instanceof Error) throw a;
      return (a ?? null) as T;
    },
    subscribe: () => () => undefined,
    storage: {
      upload: async () => undefined,
      signedUrl: async () => '',
      publicUrl: async () => '',
      remove: async () => undefined,
    },
    async invoke<T>() {
      return null as T;
    },
    online: () => true,
  };
  return f;
}

/** Lo que diría la base con `raise exception 'cerrado' using errcode = 'P0001'`. */
const closed = () => mapDbError({ code: 'P0001', message: 'cerrado' });

describe('abrir la práctica del día (open_practice)', () => {
  let f: Fake;
  beforeEach(() => {
    f = fakeBackend();
    setBackendForTests(f);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => setBackendForTests(null));

  it('manda la liga y la fecha (sin fecha, la de hoy en la liga), devuelve el evento y vuelve a leer la liga y la campana', async () => {
    const spy = vi.spyOn(queryClient, 'invalidate');
    f.answers.open_practice = 'E9';
    expect(await openPractice('L1', '2026-10-13')).toBe('E9');
    expect(await openPractice('L1')).toBe('E9');
    expect(f.rpcs).toEqual([
      { fn: 'open_practice', args: { p_league: 'L1', p_date: '2026-10-13' } },
      { fn: 'open_practice', args: { p_league: 'L1', p_date: null } },
    ]);
    expect(spy.mock.calls.slice(0, 3).map(([t]) => t)).toEqual(['events:L1', 'event:E9', 'feeds']);
  });

  it('sin evento de vuelta, falla (no lleva a ningún lado)', async () => {
    await expect(openPractice('L1', '2026-10-13')).rejects.toThrow();
  });

  it('«cerrado» de la base: antes de la hora, o ya cerró', async () => {
    f.answers.open_practice = closed();
    const err = await openPractice('L1', '2026-10-11').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendError);
    expect(isPracticeClosed(err)).toBe(true);
    expect(openPracticeErrorText(err, false)).toBe(`${PRACTICE_CLOSED_TEXT}.`);
    expect(openPracticeErrorText(err, true)).toBe('La práctica todavía no empieza. Intenta de nuevo a la hora de la liga.');
  });

  it('los otros errores, en palabras', () => {
    expect(openPracticeErrorText(mapDbError({ code: 'P0001', message: 'no_permitido' }), true)).toBe('Solo los jugadores de la liga anotan en su práctica.');
    expect(openPracticeErrorText(new BackendError('Failed to fetch', 'network'), true)).toBe('Sin señal: para abrir la práctica hace falta conexión. Intenta de nuevo.');
  });

  it('la tarjeta: abre y lleva a la hoja de anotar (o a la planilla); si falla, no lleva a ningún lado', async () => {
    f.answers.open_practice = 'E9';
    const went: string[] = [];
    expect(await goToPractice('L1', '2026-10-13', false, (to) => went.push(to))).toBe('/l/L1/e/E9?anotar=1');
    expect(await goToPractice('L1', '2026-10-13', true, (to) => went.push(to))).toBe('/l/L1/e/E9?tab=juegos');
    f.answers.open_practice = closed();
    await expect(goToPractice('L1', '2026-10-12', false, (to) => went.push(to))).rejects.toThrow('cerrado');
    expect(went).toEqual(['/l/L1/e/E9?anotar=1', '/l/L1/e/E9?tab=juegos']);
  });
});

describe('«cerrado» en una práctica', () => {
  it('el error o su mensaje (lo que guarda la cola)', () => {
    expect(isPracticeClosed(closed())).toBe(true);
    expect(isPracticeClosed('cerrado')).toBe(true);
    expect(isPracticeClosed(' cerrado: práctica ')).toBe(true);
    expect(isPracticeClosed(new Error('invalido: juegos'))).toBe(false);
    expect(isPracticeClosed(null)).toBe(false);
    expect(isPracticeClosed(undefined)).toBe(false);
  });

  it('la cola sin señal: lo de una práctica que la base rechazó por cerrada, en palabras (lo demás, como siempre)', () => {
    const failed = (fn: string) => ({ fn, lastError: 'cerrado', errorKind: 'validation' as const, errorCode: 'P0001' });
    for (const fn of ['submit_games', 'add_practice_game', 'publish_live'])
      expect(reason(failed(fn))).toBe(`${PRACTICE_CLOSED_TEXT}: cópialo y pídele al admin que lo anote.`);
    expect(reason(failed('save_game'))).toBe('El servidor no lo aceptó (dato no válido o ya está cerrado).');
  });
});
