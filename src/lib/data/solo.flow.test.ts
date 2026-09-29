import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from '../db/ids';
import { toIsoDate } from '../format';
import { currentOutbox, queryClient, remember, rpc } from './client';
import { fetchProfileGames } from './profileGames';
import { SOLO_GROUP, deleteSoloSession, fetchSoloSessions, saveSoloSession, soloKeys, type SoloSession } from './solo';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

/**
 * Juegos sueltos contra la base de verdad (PGlite con las migraciones): ana anota, cambia y borra (también sin
 * señal: se ve de una y sale solo al volver); luis ve solo los que ana comparte.
 */

let w: TestWorld;
let net: FlakyBackend;
let ana: string;
let luis: string;

const today = toIsoDate(new Date());
const outbox = () => currentOutbox()!;
const ids = (list: SoloSession[]) => list.map((s) => s.id);

beforeAll(async () => {
  w = await openWorld();
  luis = await w.signUp('luis@x.com', 'luis');
  ana = await w.signUp('ana@x.com', 'ana');
  net = flaky(w.b);
  w.use(net);
}, 120_000);

beforeEach(() => {
  net.offline = false;
  net.rpcDown = false;
  net.dropReplies = 0;
  net.calls = [];
});

afterAll(async () => {
  await w?.close();
});

describe('juegos sueltos (capa de datos)', () => {
  let first: string;

  it('anotar con señal: queda en el servidor con la bolera y la nota recortadas', async () => {
    first = await saveSoloSession({ playedOn: '2026-09-20', venue: ' Bolera Norte ', note: ' Con los panas ', scores: [180, 210, 150], shared: true }, today);
    const list = await fetchSoloSessions(null);
    expect(list).toEqual([
      expect.objectContaining({ id: first, userId: ana, playedOn: '2026-09-20', venue: 'Bolera Norte', note: 'Con los panas', scores: [180, 210, 150], shared: true, likes: 0 }),
    ]);
    // Con p_op_id (la cola), como las otras escrituras de cancha.
    expect(net.calls.find((c) => c.fn === 'save_solo_session')?.args.p_op_id).toEqual(expect.any(String));
  });

  it('cambiar: el mismo id, con cuadros de un juego', async () => {
    const rolls = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    await saveSoloSession({ id: first, playedOn: '2026-09-21', venue: 'Bolera Norte', note: '', scores: [300, 200], frames: { '0': { rolls } }, shared: true }, today);
    const [s] = await fetchSoloSessions(ana);
    expect(s).toMatchObject({ id: first, playedOn: '2026-09-21', note: '', scores: [300, 200], frames: { '0': { rolls } } });
  });

  it('lo que no vale no sale del teléfono', async () => {
    await expect(saveSoloSession({ playedOn: today, venue: '', note: '', scores: [301], shared: true }, today)).rejects.toThrow('Cada juego va de 0 a 300.');
    await expect(saveSoloSession({ playedOn: '2000-01-01', venue: '', note: '', scores: [100], shared: true }, today)).rejects.toThrow(/fecha/);
    expect(net.calls).toHaveLength(0);
  });

  it('sin señal: se ve de una en la lista y sale solo al volver', async () => {
    const key = soloKeys.list(ana);
    remember(key, { kind: 'solo', id: ana });
    queryClient.setQueryData<SoloSession[]>(key, await fetchSoloSessions(ana));
    net.offline = true;
    const id = await saveSoloSession({ playedOn: today, venue: 'Club Sur', note: '', scores: [190], shared: false }, today);
    const shown = queryClient.getQueryData<SoloSession[]>(key)!;
    expect(shown.find((s) => s.id === id)).toMatchObject({ venue: 'Club Sur', scores: [190], shared: false, pending: true, local: true });
    expect(net.calls.filter((c) => c.fn === 'save_solo_session')).toHaveLength(0);
    // Cambiarlo antes de que salga: solo se manda lo último.
    await saveSoloSession({ id, playedOn: today, venue: 'Club Sur', note: '', scores: [190, 205], shared: false }, today);
    expect(outbox().getSnapshot().pendingCount).toBe(1);
    expect(queryClient.getQueryData<SoloSession[]>(key)!.find((s) => s.id === id)?.scores).toEqual([190, 205]);
    net.offline = false;
    await outbox().flush();
    await outbox().idle();
    expect(net.calls.filter((c) => c.fn === 'save_solo_session')).toHaveLength(1);
    const server = await fetchSoloSessions(ana);
    expect(server.find((s) => s.id === id)).toMatchObject({ scores: [190, 205], shared: false });
    expect(server.find((s) => s.id === id)?.pending).toBeUndefined();
  });

  it('si se pierde la respuesta, se reenvía con el mismo op_id y no se repite', async () => {
    net.dropReplies = 1;
    const sent = saveSoloSession({ playedOn: '2026-09-02', venue: '', note: '', scores: [120], shared: true }, today);
    await outbox().flush();
    await outbox().idle();
    const id = await sent;
    const calls = net.calls.filter((c) => c.fn === 'save_solo_session');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(new Set(calls.map((c) => c.args.p_op_id)).size).toBe(1);
    expect((await fetchSoloSessions(ana)).filter((s) => s.id === id)).toHaveLength(1);
  });

  it('luis ve solo los que ana comparte (y en el perfil, como juego suelto sin link)', async () => {
    await w.as('luis@x.com');
    const mine = await fetchSoloSessions(ana);
    expect(mine.every((s) => s.shared)).toBe(true);
    expect(ids(mine)).toContain(first);
    expect(mine.map((s) => s.venue)).not.toContain('Club Sur');
    const games = await fetchProfileGames(ana);
    const solo = games.find((g) => g.kind === 'solo' && g.id === first);
    expect(solo).toMatchObject({ kind: 'solo', sport: 'bowling', leagueId: null, url: null, detail: { title: 'Juego suelto', scores: [300, 200], series: 500, high: 300 } });
    // Borrar el de otra cuenta: no.
    await expect(deleteSoloSession({ id: first })).rejects.toThrow();
    await w.as('ana@x.com');
    const own = await fetchProfileGames(ana);
    expect(own.find((g) => g.id === first)?.url).toBe(`/juegos-sueltos?juego=${first}`);
  });

  it('borrar: con señal se va del servidor y de la caché', async () => {
    const key = soloKeys.list(ana);
    remember(key, { kind: 'solo', id: ana });
    queryClient.setQueryData<SoloSession[]>(key, await fetchSoloSessions(ana));
    await deleteSoloSession({ id: first });
    expect(ids(queryClient.getQueryData<SoloSession[]>(key)!)).not.toContain(first);
    expect(ids(await fetchSoloSessions(ana))).not.toContain(first);
    // Otra vez: ya no está, queda borrado igual.
    await deleteSoloSession({ id: first });
  });

  it('borrar uno que nunca salió del teléfono no necesita señal', async () => {
    const key = soloKeys.list(ana);
    net.offline = true;
    const id = await saveSoloSession({ playedOn: today, venue: '', note: '', scores: [99], shared: true }, today);
    const local = queryClient.getQueryData<SoloSession[]>(key)!.find((s) => s.id === id)!;
    expect(local.local).toBe(true);
    await deleteSoloSession(local);
    expect(outbox().getSnapshot().pendingCount).toBe(0);
    expect(ids(queryClient.getQueryData<SoloSession[]>(key)!)).not.toContain(id);
    expect(net.calls.filter((c) => c.fn === 'delete_solo_session')).toHaveLength(0);
    net.offline = false;
    expect(ids(await fetchSoloSessions(ana))).not.toContain(id);
  });

  it('borrar uno cuyo guardado llegó pero la respuesta no: se borra también del servidor', async () => {
    const key = soloKeys.list(ana);
    remember(key, { kind: 'solo', id: ana });
    queryClient.setQueryData<SoloSession[]>(key, await fetchSoloSessions(ana));
    net.dropReplies = 1;
    const saving = saveSoloSession({ playedOn: today, venue: '', note: '', scores: [111], shared: true }, today).catch(() => null);
    // Llegó al servidor y la respuesta se perdió: vuelve a la cola a esperar su reintento (y en pantalla sigue «local»).
    await vi.waitFor(() => expect(outbox().listPending(SOLO_GROUP)).toEqual([expect.objectContaining({ status: 'pending', attempts: 1 })]));
    const local = queryClient.getQueryData<SoloSession[]>(key)!.find((s) => s.scores[0] === 111)!;
    expect(local).toMatchObject({ local: true, pending: true });
    expect(ids(await fetchSoloSessions(ana))).toContain(local.id);
    await deleteSoloSession(local);
    await saving;
    expect(net.calls.filter((c) => c.fn === 'delete_solo_session')).toHaveLength(1);
    expect(outbox().getSnapshot().pendingCount).toBe(0);
    expect(ids(await fetchSoloSessions(ana))).not.toContain(local.id);
  });

  it('lo mismo si se cambió antes del reintento (la cola reemplazó ese envío): sin señal no se da por borrado', async () => {
    const key = soloKeys.list(ana);
    remember(key, { kind: 'solo', id: ana });
    queryClient.setQueryData<SoloSession[]>(key, await fetchSoloSessions(ana));
    net.dropReplies = 1;
    const saving = saveSoloSession({ playedOn: today, venue: '', note: '', scores: [112], shared: true }, today).catch(() => null);
    await vi.waitFor(() => expect(outbox().listPending(SOLO_GROUP)).toEqual([expect.objectContaining({ status: 'pending', attempts: 1 })]));
    const id = queryClient.getQueryData<SoloSession[]>(key)!.find((s) => s.scores[0] === 112)!.id;
    // Sin señal lo cambia: el envío nuevo (que todavía no se intentó) reemplaza al que ya salió.
    net.offline = true;
    await saveSoloSession({ id, playedOn: today, venue: '', note: '', scores: [112, 150], shared: true }, today);
    expect(outbox().listPending(SOLO_GROUP)).toEqual([expect.objectContaining({ attempts: 0 })]);
    const local = queryClient.getQueryData<SoloSession[]>(key)!.find((s) => s.id === id)!;
    expect(local.local).toBe(true);
    // El servidor quizás lo tiene: sin señal, borrar lo dice en lugar de fingir que se borró.
    await expect(deleteSoloSession(local)).rejects.toMatchObject({ kind: 'network' });
    await saving;
    net.offline = false;
    expect(ids(await fetchSoloSessions(ana))).toContain(id);
    await deleteSoloSession({ id });
    expect(ids(await fetchSoloSessions(ana))).not.toContain(id);
  });

  it('un guardado viejo que llega después de borrarlo no lo revive', async () => {
    const id = await saveSoloSession({ playedOn: today, venue: '', note: '', scores: [133], shared: true }, today);
    await deleteSoloSession({ id });
    await expect(rpc('save_solo_session', { p_id: id, p_played_on: today, p_scores: [140], p_op_id: uuidv7() })).rejects.toMatchObject({
      kind: 'not_found',
    });
    expect(ids(await fetchSoloSessions(ana))).not.toContain(id);
  });

  it('por páginas: la lista entera aunque haya más de una', async () => {
    const all = await fetchSoloSessions(ana);
    expect(await fetchSoloSessions(ana, 1)).toEqual(all);
    expect(luis).toBeTruthy();
  });

  it('«Descargar mis datos» trae los juegos sueltos', async () => {
    const all = await fetchSoloSessions(ana);
    const data = await rpc<{ tables: Record<string, { id: string }[]> }>('export_my_data');
    expect(data.tables.solo_sessions?.map((s) => s.id).sort()).toEqual(ids(all).sort());
  });
});
