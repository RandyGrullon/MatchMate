import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toIsoDate } from '../format';
import type { BowlingEvent, LiveScore } from '../types';
import { currentOutbox, fetchLive, queryClient, setDataUser } from './client';
import { createEvent, fetchEvent, setRsvp } from './events';
import { keys } from './keys';
import { createLeague, fetchLeague, getInviteCode, joinLeague } from './leagues';
import { fetchEventLive, publishLiveScores } from './liveScores';
import { fetchMyMemberships, removeMember } from './members';
import { fetchSubmissions, submitGames } from './submissions';
import type { Wire } from './stamp';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './testkit';

vi.mock('../photos', async () => {
  const { fakeUpload } = await import('./testPhotos');
  const { getBackend } = await import('../backend');
  return {
    uploadScoreboardPhoto: vi.fn((lid: string, img: { width: number; height: number }, photoId?: string) => fakeUpload(getBackend, lid, img, photoId)),
    usePhoto: () => ({ data: null, loading: false, error: null }),
  };
});

const today = toIsoDate(new Date());
let w: TestWorld;
let net: FlakyBackend;
let lid: string;
let practice: string;
let anaId: string;
let rosaId: string;
let anaPlayer: string;

const outbox = () => currentOutbox()!;

beforeAll(async () => {
  w = await openWorld();
  anaId = await w.signUp('ana@x.com', 'Ana');
  rosaId = await w.signUp('rosa@x.com', 'Rosa');
  lid = await createLeague(
    { uid: rosaId, name: 'Rosa' },
    { name: 'Liga', kind: 'liga', visibility: 'private', venue: '', schedule: '', seasonStart: '', seasonEnd: '', contactName: '', contactPhone: '', requirePhoto: true },
  );
  practice = await createEvent(lid, {
    type: 'practica',
    name: '',
    date: today,
    games: 3,
    hcpBase: 0,
    hcpPercent: 0,
    individualRankBy: 'scratch',
    teamRankBy: 'scratch',
    categoryCuts: [200, 175, 160],
    teamSize: 0,
    announcement: '',
  });
  const code = (await getInviteCode(lid))!;
  await w.as('ana@x.com');
  anaPlayer = (await joinLeague(lid, { uid: anaId, name: 'Ana' }, code))!;
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
  await w.close();
});

const liveVersion = async () =>
  (await w.b.db.query<{ version: number; state: unknown }>(`select version, state from public.live_states where event_id = $1 and player_id = $2`, [practice, anaPlayer])).rows[0];

describe('cola sin conexión con la base de verdad', () => {
  it('en vivo: si se pierde la respuesta, se reenvía con el mismo op_id y la base no lo repite', async () => {
    net.dropReplies = 1;
    const sent = publishLiveScores(lid, practice, anaPlayer, ['150', '']);
    await vi.waitFor(() => expect(net.calls.filter((c) => c.fn === 'publish_live')).toHaveLength(1));
    await outbox().flush();
    await sent;
    const calls = net.calls.filter((c) => c.fn === 'publish_live');
    expect(calls).toHaveLength(2);
    expect(calls[0].args.p_op_id).toBe(calls[1].args.p_op_id);
    expect(await liveVersion()).toEqual({ version: 1, state: { scores: [150] } });
  });

  it('sin señal: se ve de una en pantalla, solo se manda el último estado y sale solo al volver', async () => {
    const key = keys.live(practice);
    await fetchLive<LiveScore[]>(key, { kind: 'live', lid, eventId: practice }, () => fetchEventLive(lid, practice), { initial: [] });
    net.offline = true;
    const a = publishLiveScores(lid, practice, anaPlayer, ['150', '170']);
    const b = publishLiveScores(lid, practice, anaPlayer, ['150', '170', '190']);
    // Colapso: una sola por enviar, y la caché ya muestra lo último.
    await vi.waitFor(() => expect(outbox().getSnapshot().pendingCount).toBe(1));
    const shown = queryClient.getQueryData<Wire<LiveScore>[]>(key)!;
    expect(shown.find((l) => l.playerId === anaPlayer)?.scores).toEqual([150, 170, 190]);
    expect(net.calls).toHaveLength(0);
    net.offline = false;
    await outbox().flush();
    await Promise.all([a, b]);
    expect(net.calls.filter((c) => c.fn === 'publish_live')).toHaveLength(1);
    expect(await liveVersion()).toEqual({ version: 2, state: { scores: [150, 170, 190] } });
  });

  it('«Voy» mientras el servidor no responde: la lectura muestra lo pendiente encima y luego llega', async () => {
    net.rpcDown = true;
    // Sin señal del todo, setRsvp no espera (queda en la cola).
    net.offline = true;
    await setRsvp(lid, practice, anaPlayer, true);
    net.offline = false;
    // Las lecturas funcionan pero la RPC no: la lectura del servidor viene sin el «voy» y se muestra con él.
    const shown = (await fetchEvent(lid, practice)) as Wire<BowlingEvent>;
    expect(shown.rsvp).toEqual({ [anaPlayer]: true });
    const server = await w.b.db.query('select 1 from public.event_rsvps where event_id = $1', [practice]);
    expect(server.rows).toHaveLength(0);
    net.rpcDown = false;
    await outbox().flush();
    await outbox().idle();
    expect((await w.b.db.query('select player_id from public.event_rsvps where event_id = $1', [practice])).rows).toEqual([{ player_id: anaPlayer }]);
  });

  it('envío con foto sin señal: la foto espera en el teléfono, se sube antes de la RPC y un reintento no duplica', async () => {
    const { uploadScoreboardPhoto } = await import('../photos');
    net.offline = true;
    const { id, sent } = submitGames(lid, {
      playerId: anaPlayer,
      eventId: practice,
      date: null,
      scores: [180, 190, 200],
      scanned: null,
      frames: null,
      photo: { data: 'data:image/webp;base64,AAAA', width: 640, height: 480, scan: '' },
    });
    await vi.waitFor(() => expect(outbox().getSnapshot().pendingCount).toBe(1));
    expect(uploadScoreboardPhoto).not.toHaveBeenCalled();
    // La pantalla del jugador ya lo ve como pendiente.
    net.offline = false;
    net.rpcDown = true;
    const listed = await fetchSubmissions({ kind: 'subs', lid, playerId: anaPlayer }, [{ col: 'player_id', op: 'eq', value: anaPlayer }]);
    expect(listed.find((s) => s.id === id)).toMatchObject({ status: 'pendiente', scores: [180, 190, 200] });
    net.rpcDown = false;
    // La base guarda el envío pero la respuesta se pierde: el reintento no vuelve a subir la foto ni duplica.
    net.dropReplies = 1;
    await outbox().flush();
    await outbox().flush();
    await sent;
    expect(uploadScoreboardPhoto).toHaveBeenCalledTimes(1);
    expect((await w.b.db.query('select 1 from public.submissions where player_id = $1 and event_id = $2', [anaPlayer, practice])).rows).toHaveLength(1);
    const [row] = (await w.b.db.query<{ photo_id: string | null; path: string }>(
      `select s.photo_id, p.path from public.submissions s join public.photos p on p.id = s.photo_id where s.id = $1`,
      [id],
    )).rows;
    expect(row.path).toBe(`${lid}/${row.photo_id}.webp`);
  });

  it('la cola es por cuenta: lo pendiente de Ana espera a que Ana vuelva a entrar', async () => {
    net.offline = true;
    void publishLiveScores(lid, practice, anaPlayer, ['100']).catch(() => undefined);
    await vi.waitFor(() => expect(outbox().getSnapshot().pendingCount).toBe(1));
    await w.as('rosa@x.com');
    expect(outbox().userId).toBe(rosaId);
    expect(outbox().getSnapshot().pendingCount).toBe(0);
    net.offline = false;
    await w.as('ana@x.com');
    await outbox().ready;
    await outbox().flush();
    await outbox().idle();
    expect((await liveVersion())?.state).toEqual({ scores: [100] });
  });

  it('perder el acceso: la liga deja de verse y lo encolado va a «no se pudo enviar»', async () => {
    await w.as('rosa@x.com');
    await removeMember({ leagueId: lid, uid: anaId });
    await w.as('ana@x.com');
    expect(await fetchLeague(lid)).toBeNull();
    expect(await fetchMyMemberships(anaId)).toEqual([]);
    const sent = publishLiveScores(lid, practice, anaPlayer, ['200']);
    await expect(sent).rejects.toMatchObject({ kind: 'permission' });
    const snap = outbox().getSnapshot();
    expect(snap.pendingCount).toBe(0);
    expect(snap.failed).toHaveLength(1);
    expect(snap.failed[0]).toMatchObject({ fn: 'publish_live', errorKind: 'permission' });
    await outbox().discard(snap.failed[0].opId);
    expect(outbox().getSnapshot().failed).toHaveLength(0);
  });

  it('sin sesión no hay cola: guardar pide entrar', async () => {
    await setDataUser(null);
    await expect(publishLiveScores(lid, practice, anaPlayer, ['1'])).rejects.toMatchObject({ kind: 'auth' });
    await w.as('ana@x.com');
  });
});
