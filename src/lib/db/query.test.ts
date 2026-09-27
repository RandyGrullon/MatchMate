import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendError } from '../backend/types';
import { createFakeBackend } from './fakeBackend';
import { createQueryClient, realtimeStatus, tagsForMessage, watchTopic, type QueryClient, type QueryClientOptions, type QueryOptions } from './query';

/** setImmediate de Node (los relojes falsos de estas pruebas no lo tocan; IndexedDB falso lo usa). */
const nextTask = (globalThis as unknown as { setImmediate: (cb: () => void) => void }).setImmediate;
const clients: QueryClient[] = [];
function make(opts: QueryClientOptions = {}): QueryClient {
  const c = createQueryClient({ listenWindow: false, ...opts });
  clients.push(c);
  return c;
}

/** Deja correr promesas y tareas (IndexedDB falso) sin mover los relojes falsos. */
async function tick(times = 5) {
  for (let i = 0; i < times; i++) await new Promise<void>((r) => nextTask(r));
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

/** Una «pantalla» sin React: se registra y guarda cada estado que ve. */
function screen<T>(client: QueryClient, key: string, fetcher: () => Promise<T>, opts: QueryOptions<T> = {}) {
  const seen: unknown[] = [];
  const stop = client.observe(key, fetcher, opts, () => seen.push(client.getState(key)));
  return { seen, stop, state: () => client.getState<T>(key) };
}

const offline = () => new BackendError('Sin señal', 'network');

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
  for (const c of clients.splice(0)) c.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('caché de consultas', () => {
  it('varias pantallas que piden lo mismo comparten una sola consulta', async () => {
    const c = make({ persistence: 'none' });
    const d = deferred<string[]>();
    const fetcher = vi.fn(() => d.promise);
    const a = screen(c, 'players:L1', fetcher, { initial: [] });
    screen(c, 'players:L1', fetcher, { initial: [] });
    const direct = c.fetchQuery('players:L1', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a.state()).toEqual({ data: [], loading: true, error: null, fromCache: false });
    d.resolve(['Ana']);
    await expect(direct).resolves.toEqual(['Ana']);
    expect(a.state()).toEqual({ data: ['Ana'], loading: false, error: null, fromCache: false });
    expect(a.seen.at(-1)).toBe(a.state()); // el mismo objeto mientras no cambie (useSyncExternalStore)
    expect(c.getQueryData('players:L1')).toEqual(['Ana']);
  });

  it('lo fresco no se vuelve a pedir; lo viejo se muestra mientras se actualiza', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const c = make({ persistence: 'none' });
    let version = 1;
    const fetcher = vi.fn(async () => version++);
    const first = screen(c, 'k', fetcher, { staleMs: 5_000 });
    await tick();
    first.stop();
    expect(first.state().data).toBe(1);

    await vi.advanceTimersByTimeAsync(4_000);
    const second = screen(c, 'k', fetcher, { staleMs: 5_000 });
    expect(fetcher).toHaveBeenCalledTimes(1); // todavía fresco
    second.stop();

    await vi.advanceTimersByTimeAsync(1_000);
    const third = screen(c, 'k', fetcher, { staleMs: 5_000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(third.state()).toMatchObject({ data: 1, loading: false }); // se ve lo de antes mientras llega lo nuevo
    await tick();
    expect(third.state()).toMatchObject({ data: 2, loading: false });
  });

  it('invalidar una etiqueta vuelve a pedir lo que está en pantalla; lo demás, cuando se vuelva a abrir', async () => {
    const c = make({ persistence: 'none' });
    const calls: Record<string, number> = { events: 0, players: 0, other: 0 };
    const f = (name: string) => async () => ++calls[name];
    const events = screen(c, 'events:L1', f('events'), { tags: ['league:L1'], staleMs: 60_000 });
    const players = screen(c, 'players:L1', f('players'), { tags: ['league:L1'], staleMs: 60_000 });
    screen(c, 'other:L2', f('other'), { tags: ['league:L2'], staleMs: 60_000 });
    await tick();
    players.stop(); // esta pantalla se cerró

    c.invalidate('league:L1');
    await tick();
    expect(calls).toEqual({ events: 2, players: 1, other: 1 });
    expect(events.state().data).toBe(2);

    screen(c, 'players:L1', f('players'), { tags: ['league:L1'], staleMs: 60_000 });
    await tick();
    expect(calls.players).toBe(2); // estaba invalidada aunque siguiera «fresca»

    c.invalidateAll();
    await tick();
    expect(calls).toEqual({ events: 3, players: 3, other: 2 });
  });

  it('invalidar con una consulta en vuelo la repite al terminar (la respuesta podía ser vieja)', async () => {
    const c = make({ persistence: 'none' });
    const d = deferred<string>();
    const fetcher = vi.fn().mockReturnValueOnce(d.promise).mockResolvedValue('nuevo');
    const s = screen(c, 'k', fetcher, { tags: ['t'] });
    c.invalidate('t');
    expect(fetcher).toHaveBeenCalledTimes(1);
    d.resolve('viejo');
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(s.state().data).toBe('nuevo');
  });

  it('cambio optimista: se ve enseguida y una respuesta que salió antes no lo pisa', async () => {
    const c = make({ persistence: 'none' });
    const d = deferred<string[]>();
    const fetcher = vi.fn().mockReturnValueOnce(d.promise).mockResolvedValue(['Ana', 'Luis']);
    const s = screen(c, 'players:L1', fetcher, { initial: [] });
    const prev = c.setQueryData<string[]>('players:L1', (old) => [...(old ?? []), 'Luis']);
    expect(prev).toBeUndefined();
    expect(s.state()).toEqual({ data: ['Luis'], loading: false, error: null, fromCache: false });
    d.resolve(['Ana']); // salió antes del cambio
    await tick();
    expect(s.state().data).toEqual(['Luis']);
    c.invalidateKey('players:L1'); // el servidor confirmó: se pide de nuevo
    await tick();
    expect(s.state().data).toEqual(['Ana', 'Luis']);
    // deshacer devuelve lo anterior
    expect(c.setQueryData('players:L1', ['Ana'])).toEqual(['Ana', 'Luis']);
  });

  it('un error definitivo se muestra (como onSnapshot) y deja lo inicial', async () => {
    const c = make({ persistence: 'none' });
    let fail = false;
    const fetcher = async () => {
      if (fail) throw new BackendError('No tienes permiso', 'permission', '42501');
      return ['x'];
    };
    const s = screen(c, 'k', fetcher, { initial: [] as string[] });
    await tick();
    expect(s.state().data).toEqual(['x']);
    fail = true;
    c.invalidateKey('k');
    await tick();
    expect(s.state()).toMatchObject({ data: [], loading: false, fromCache: false });
    expect(s.state().error?.message).toBe('No tienes permiso');
  });

  it('sin señal: sin nada guardado muestra el error; con algo cargado lo sigue mostrando sin error', async () => {
    const c = make({ persistence: 'none' });
    const s = screen(c, 'a', async () => Promise.reject(offline()), { initial: null });
    await tick();
    expect(s.state()).toMatchObject({ data: null, loading: false, fromCache: false });
    expect(s.state().error?.message).toBe('Sin señal');

    let online = true;
    const t = screen(c, 'b', async () => (online ? 'dato' : Promise.reject(offline())));
    await tick();
    online = false;
    c.invalidateKey('b');
    await tick();
    expect(t.state()).toEqual({ data: 'dato', loading: false, error: null, fromCache: false });
  });

  it('vuelve a pedir cada pollMs mientras la pantalla está abierta', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const c = make({ persistence: 'none' });
    const fetcher = vi.fn(async () => 'x');
    const s = screen(c, 'live:e1', fetcher, { pollMs: 1_000 });
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    s.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('al volver a la app pide lo viejo y al volver la señal lo que falló (eventos de la ventana)', async () => {
    const win = new EventTarget();
    vi.stubGlobal('window', win);
    const c = createQueryClient({ persistence: 'none', defaultStaleMs: 0 });
    clients.push(c);
    let online = false;
    const fetcher = vi.fn(async () => (online ? 'ok' : Promise.reject(offline())));
    const s = screen(c, 'k', fetcher);
    await tick();
    expect(s.state().error).not.toBeNull();
    online = true;
    win.dispatchEvent(new Event('online'));
    await tick();
    expect(s.state()).toEqual({ data: 'ok', loading: false, error: null, fromCache: false });
    win.dispatchEvent(new Event('focus'));
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe('copia guardada en el teléfono', () => {
  it('después de recargar sin señal se ve lo último (fromCache) y se actualiza al volver la señal', async () => {
    const user = () => 'cuenta-1';
    const first = make({ userKey: user });
    await first.ready;
    await first.fetchQuery('events:L1', async () => [{ id: 'e1' }], { tags: ['league:L1'] });
    await first.whenPersisted();
    first.dispose();

    const second = make({ userKey: user });
    await second.ready;
    expect(second.getState('events:L1', [])).toEqual({ data: [{ id: 'e1' }], loading: false, error: null, fromCache: true });

    let online = false;
    const fetcher = vi.fn(async () => (online ? [{ id: 'e1' }, { id: 'e2' }] : Promise.reject(offline())));
    const s = screen(second, 'events:L1', fetcher, { initial: [] });
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(1); // lo guardado siempre se confirma con el servidor
    expect(s.state()).toEqual({ data: [{ id: 'e1' }], loading: false, error: null, fromCache: true });

    online = true;
    second.onReconnect();
    await tick();
    expect(s.state()).toEqual({ data: [{ id: 'e1' }, { id: 'e2' }], loading: false, error: null, fromCache: false });

    // Las etiquetas también se guardan.
    second.invalidate('league:L1');
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('si la pantalla pidió antes de cargar la copia y falló sin señal, la copia la reemplaza', async () => {
    const first = make({ userKey: () => 'c' });
    await first.fetchQuery('k', async () => 'guardado');
    await first.whenPersisted();
    first.dispose();

    const second = make({ userKey: () => 'c' });
    const s = screen(second, 'k', async () => Promise.reject(offline()), { initial: 'nada' });
    await second.ready;
    await tick();
    expect(s.state()).toEqual({ data: 'guardado', loading: false, error: null, fromCache: true });
  });

  it('cada cuenta ve solo su copia; al cambiar de cuenta se vacía y se carga la otra', async () => {
    let who: string | null = 'ana';
    const c = make({ userKey: () => who });
    await c.ready;
    await c.fetchQuery('me', async () => 'datos de Ana');
    await c.whenPersisted();

    const other = make({ userKey: () => 'luis' });
    await other.ready;
    expect(other.getQueryData('me')).toBeUndefined();

    let calls = 0;
    const s = screen(c, 'me', async () => `pedido ${++calls} por ${who}`, { staleMs: 60_000 });
    who = 'luis';
    await c.userChanged();
    await tick();
    expect(s.state().data).toBe('pedido 1 por luis');
    expect(s.state().fromCache).toBe(false);

    s.stop();
    who = 'ana';
    await c.userChanged();
    expect(c.getQueryData('me')).toBe('datos de Ana'); // su copia volvió
  });

  it('al salir se puede borrar la copia de la cuenta', async () => {
    let who: string | null = 'ana';
    const c = make({ userKey: () => who, clearOnSignOut: true });
    await c.fetchQuery('me', async () => 'secreto');
    await c.whenPersisted();
    who = null;
    await c.userChanged();
    await c.whenPersisted();
    c.dispose();

    const again = make({ userKey: () => 'ana' });
    await again.ready;
    expect(again.getQueryData('me')).toBeUndefined();
  });

  it('perder el acceso borra la copia guardada', async () => {
    const first = make({ userKey: () => 'c' });
    let allowed = true;
    const fetcher = async () => {
      if (!allowed) throw new BackendError('No tienes acceso', 'permission', '42501');
      return 'privado';
    };
    const s = screen(first, 'league:L9', fetcher);
    await tick();
    await first.whenPersisted();
    allowed = false;
    first.invalidateKey('league:L9');
    await tick();
    expect(s.state().error?.message).toBe('No tienes acceso');
    await first.whenPersisted();
    first.dispose();

    const second = make({ userKey: () => 'c' });
    await second.ready;
    expect(second.getQueryData('league:L9')).toBeUndefined();
  });

  it('persist: false no guarda en el teléfono', async () => {
    const first = make({ userKey: () => 'c' });
    await first.fetchQuery('profiles', async () => ['correo@x.com'], { persist: false });
    await first.whenPersisted();
    first.dispose();
    const second = make({ userKey: () => 'c' });
    await second.ready;
    expect(second.getQueryData('profiles')).toBeUndefined();
  });
});

describe('useQuery (React)', () => {
  it('devuelve la forma de Live<T> más fromCache', () => {
    const c = make({ persistence: 'none' });
    c.setQueryData('players:L2', ['Ana']);
    const seen: unknown[] = [];
    function Screen({ k }: { k: string | null }) {
      seen.push(c.useQuery<string[]>(k, async () => ['x'], { initial: [] }));
      return null;
    }
    renderToString(createElement(Screen, { k: 'players:L1' }));
    renderToString(createElement(Screen, { k: 'players:L2' }));
    renderToString(createElement(Screen, { k: null }));
    expect(seen).toEqual([
      { data: [], loading: true, error: null, fromCache: false },
      { data: ['Ana'], loading: false, error: null, fromCache: false },
      { data: [], loading: false, error: null, fromCache: false },
    ]);
  });
});

describe('tiempo real con consulta de respaldo', () => {
  it('entrega los mensajes del tema', () => {
    const be = createFakeBackend();
    const got: unknown[] = [];
    const modes: string[] = [];
    const w = watchTopic(be, 'event:e1', (m) => got.push(m.payload), { onMode: (m) => modes.push(m) });
    be.push('event:e1', { event: 'live', payload: { score: 1 } });
    be.push('event:e1', { event: 'mm:status', payload: { status: 'SUBSCRIBED' } }); // no llega a la pantalla
    expect(got).toEqual([{ score: 1 }]);
    expect(w.mode()).toBe('realtime');
    w.stop();
    be.push('event:e1', { event: 'live', payload: { score: 2 } });
    expect(got).toHaveLength(1);
    expect(be.listeners.get('event:e1')?.size).toBe(0);
    expect(modes).toEqual(['realtime']);
  });

  it('si el canal falla, consulta cada 15–20 s y más tarde vuelve a tiempo real', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const be = createFakeBackend();
    const polls: number[] = [];
    const got: unknown[] = [];
    const w = watchTopic(be, 'event:e1', (m) => got.push(m.payload), { onPoll: () => polls.push(Date.now()), random: () => 0 });
    const start = Date.now();
    be.push('event:e1', { event: 'mm:status', payload: { status: 'CHANNEL_ERROR' } });
    expect(w.mode()).toBe('polling');
    expect(polls).toEqual([start]); // se pone al día enseguida
    expect(be.listeners.get('event:e1')?.size).toBe(0); // soltó el canal
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(polls.map((t) => t - start)).toEqual([0, 15_000, 30_000]);

    await vi.advanceTimersByTimeAsync(30_000); // al minuto prueba tiempo real otra vez
    expect(be.subscribeCalls).toHaveLength(2);
    expect(w.mode()).toBe('realtime');
    const before = polls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(polls.length).toBe(before); // ya no consulta
    be.push('event:e1', { event: 'live', payload: 'ok' });
    expect(got).toEqual(['ok']);
    w.stop();
  });

  it('con too_many_connections consulta y espera más para volver a probar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const be = createFakeBackend();
    let polls = 0;
    const w = watchTopic(be, 'event:e1', () => {}, { onPoll: () => polls++, random: () => 1 });
    be.push('event:e1', { event: 'system', payload: { status: 'error', message: 'too_many_connections' } });
    expect(w.mode()).toBe('polling');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(polls).toBe(4); // enseguida + cada 20 s (azar al máximo)
    expect(be.subscribeCalls).toHaveLength(1); // todavía no vuelve a probar
    await vi.advanceTimersByTimeAsync(240_000);
    expect(be.subscribeCalls).toHaveLength(2);
    expect(w.mode()).toBe('realtime');
    w.stop();
  });

  it('si subscribe lanza, consulta; solo consulta si se pide (visitantes)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const be = createFakeBackend();
    be.subscribeError = new Error('Realtime: too many connections');
    let polls = 0;
    const w = watchTopic(be, 'event:e1', () => {}, { onPoll: () => polls++, random: () => 0 });
    expect(w.mode()).toBe('polling');
    expect(polls).toBe(1);
    w.stop();

    const visitor = createFakeBackend();
    let visitorPolls = 0;
    const v = watchTopic(visitor, 'event:e1', () => {}, { onPoll: () => visitorPolls++, pollOnly: true, random: () => 0 });
    expect(v.mode()).toBe('polling');
    expect(visitor.subscribeCalls).toHaveLength(0);
    expect(visitorPolls).toBe(0); // la pantalla ya cargó al abrir
    await vi.advanceTimersByTimeAsync(15_000);
    expect(visitorPolls).toBe(1);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(visitor.subscribeCalls).toHaveLength(0);
    v.stop();
  });

  it('si la pantalla pasa oculta más de 60 s se desconecta, y al volver se reconecta y se pone al día', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    vi.stubGlobal('document', doc);
    const be = createFakeBackend();
    let polls = 0;
    const w = watchTopic(be, 'event:e1', () => {}, { onPoll: () => polls++ });
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(w.mode()).toBe('realtime');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(w.mode()).toBe('off');
    expect(be.listeners.get('event:e1')?.size).toBe(0);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(w.mode()).toBe('realtime');
    expect(be.subscribeCalls).toHaveLength(2);
    expect(polls).toBe(1);
    w.stop();
  });

  it('lee los estados del canal', () => {
    expect(realtimeStatus({ event: 'mm:status', payload: { status: 'SUBSCRIBED' } })).toBe('ok');
    expect(realtimeStatus({ event: 'mm:status', payload: { status: 'TIMED_OUT' } })).toBe('failed');
    expect(realtimeStatus({ event: 'mm:status', payload: { status: 'CHANNEL_ERROR', message: 'too_many_connections' } })).toBe('too_many');
    expect(realtimeStatus({ event: 'system', payload: { status: 'ok', message: 'Subscribed to PostgreSQL' } })).toBe('ok');
    expect(realtimeStatus({ event: 'system', payload: { extension: 'postgres_changes' } })).toBe('ignore');
    expect(realtimeStatus({ event: 'live', payload: { status: 'CHANNEL_ERROR' } })).toBeNull();
  });

  it('los mensajes invalidan etiquetas: payload.tags o el mapa por evento', async () => {
    expect(tagsForMessage({ event: 'entries', payload: { tags: ['event:e1', 7] } })).toEqual(['event:e1']);
    const map = { live: ['live:e1'], entries: (p: unknown) => [`league:${(p as { league_id: string }).league_id}`], '*': ['todo'] };
    expect(tagsForMessage({ event: 'entries', payload: { league_id: 'L1', tags: ['event:e1'] } }, map)).toEqual(['event:e1', 'league:L1', 'todo']);

    const c = make({ persistence: 'none' });
    let calls = 0;
    screen(c, 'live:e1:rows', async () => ++calls, { tags: ['live:e1'], staleMs: 60_000 });
    await tick();
    const onMessage = c.messageInvalidator({ live: ['live:e1'] });
    onMessage({ event: 'live', payload: {} });
    await tick();
    expect(calls).toBe(2);
    expect(c.invalidateFromMessage({ event: 'otro', payload: { tags: ['live:e1'] } })).toEqual(['live:e1']);
    await tick();
    expect(calls).toBe(3);
  });
});
