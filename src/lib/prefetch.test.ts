/**
 * Precarga sin señal: el plan (qué se trae de hoy y mañana) sin base, y con la base de verdad (PGlite con las
 * migraciones y la RLS) que lo precargado queda en la caché con la clave de la pantalla y se ve sin señal.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { myMatchesSince, zonedParts } from './calendar';
import { cachedQueries, queryClient } from './data/client';
import { createEvent } from './data/events';
import { keys } from './data/keys';
import { createLeague } from './data/leagues';
import {
  createMatches,
  fetchLiveMatches,
  fetchMatch,
  finishMatch,
  liveMatchesKey,
  matchKeys,
  myMatchesKey,
  publishMatch,
  resetMatchesForTests,
} from './data/matches';
import { fetchPlayers } from './data/players';
import { flaky, openWorld, type FlakyBackend, type TestWorld } from './data/testkit';
import {
  PREFETCH_EVERY_MS,
  PREFETCH_MAX_MATCHES,
  planPrefetch,
  prefetchDue,
  prefetchToday,
  runPrefetchTasks,
  type PrefetchMatch,
  type PrefetchTask,
} from './prefetch';

const TZ = 'America/Santo_Domingo';
// Martes 29 de septiembre, 6:00 pm en Santo Domingo.
const NOW = Date.parse('2026-09-29T22:00:00Z');
const leagues = [
  { id: 'fut', sport: 'football', tz: TZ },
  { id: 'pad', sport: 'padel', tz: TZ },
  { id: 'bol', sport: 'bowling', tz: TZ },
  { id: 'golf', sport: 'golf', tz: TZ },
  { id: 'nado', sport: 'swimming', tz: TZ },
];
const m = (id: string, leagueId: string, scheduledAt: string | null, extra: Partial<PrefetchMatch> = {}): PrefetchMatch => ({
  id,
  leagueId,
  eventId: null,
  scheduledAt,
  status: 'scheduled',
  ...extra,
});
const plan = (o: Partial<Parameters<typeof planPrefetch>[0]> = {}) =>
  planPrefetch({ uid: 'u1', leagues, events: [], matches: [], now: NOW, ...o }).map((t) => `${t.kind}:${t.key}`);

describe('qué se precarga', () => {
  it('tus partidos de hoy y mañana (en la hora de la liga) con la lista donde se abren, y lo de su liga', () => {
    expect(
      plan({
        matches: [
          m('hoy', 'fut', '2026-09-30T00:00:00Z'), // 8 pm del martes
          m('manana-tarde', 'pad', '2026-10-01T03:30:00Z', { eventId: 'liga-pad' }), // 11:30 pm del miércoles
          m('jueves', 'fut', '2026-10-01T14:00:00Z'),
          m('sin-fecha', 'fut', null),
          m('terminado', 'fut', '2026-09-29T20:00:00Z', { status: 'confirmed' }),
        ],
      }),
    ).toEqual([
      'match:match:hoy',
      'leagueMatches:matches:l:fut',
      'match:match:manana-tarde',
      'racketEvent:racket:event:liga-pad',
      'eventMatches:matches:e:liga-pad',
      'league:league:fut',
      'membership:member:fut:u1',
      'teamRules:trules:fut',
      'players:players:fut',
      'seasonTeams:steams:l:fut',
      'league:league:pad',
      'membership:member:pad:u1',
      'racketRules:racket:rules:pad',
      'players:players:pad',
      'seasonTeams:steams:l:pad',
    ]);
  });

  it('los en vivo y suspendidos van primero, de cualquier día; con tope', () => {
    const many = Array.from({ length: PREFETCH_MAX_MATCHES + 5 }, (_, i) => m(`p${String(i).padStart(2, '0')}`, 'pad', `2026-09-30T0${i % 3}:00:00Z`));
    const tasks = planPrefetch({
      uid: 'u1',
      leagues,
      events: [],
      matches: [...many, m('vivo', 'pad', '2026-09-20T00:00:00Z', { status: 'live' }), m('susp', 'pad', null, { status: 'suspended' })],
      now: NOW,
    }).filter((t) => t.kind === 'match');
    expect(tasks).toHaveLength(PREFETCH_MAX_MATCHES);
    expect(tasks.slice(0, 2).map((t) => t.id)).toEqual(['vivo', 'susp']);
  });

  it('los eventos de hoy y mañana con lo que abre su pantalla, según el deporte', () => {
    expect(
      plan({
        saveData: true,
        events: [
          { id: 'practica', lid: 'bol', date: '2026-09-29', type: 'practica' },
          { id: 'noche', lid: 'pad', date: '2026-09-30', type: 'americano' },
          { id: 'jornada', lid: 'fut', date: '2026-09-30', type: 'jornada' },
          { id: 'ronda', lid: 'golf', date: '2026-09-29', type: 'ronda' },
          { id: 'meet', lid: 'nado', date: '2026-09-30', type: 'encuentro' },
          { id: 'jueves', lid: 'bol', date: '2026-10-01', type: 'torneo' },
          { id: 'ajena', lid: 'otra', date: '2026-09-29', type: 'practica' },
        ],
      }),
    ).toEqual([
      'event:event:bol:practica',
      'eventEntries:entries:e:practica',
      'event:event:golf:ronda',
      'golfEvent:golf:event:ronda',
      'event:event:fut:jornada',
      'eventMatches:matches:e:jornada',
      'event:event:nado:meet',
      'racketEvent:racket:event:noche',
      'eventMatches:matches:e:noche',
      // Con «ahorro de datos»: la liga, tu membresía y las reglas (sin jugadores ni listas grandes).
      'league:league:bol',
      'membership:member:bol:u1',
      'league:league:golf',
      'membership:member:golf:u1',
      'league:league:fut',
      'membership:member:fut:u1',
      'teamRules:trules:fut',
      'league:league:nado',
      'membership:member:nado:u1',
      'league:league:pad',
      'membership:member:pad:u1',
      'racketRules:racket:rules:pad',
    ]);
  });

  it('«mañana» es el de la liga: en otra zona puede ser otro día', () => {
    // 6 pm en Santo Domingo = medianoche en Madrid: allá ya es miércoles 30 y «mañana» es el jueves 1.
    const madrid = [{ id: 'mad', sport: 'padel', tz: 'Europe/Madrid' }];
    const tasks = planPrefetch({ uid: 'u1', leagues: madrid, events: [{ id: 'jue', lid: 'mad', date: '2026-10-01', type: 'americano' }], matches: [], now: NOW });
    expect(tasks.some((t) => t.id === 'jue')).toBe(true);
    const santo = planPrefetch({ uid: 'u1', leagues, events: [{ id: 'jue', lid: 'pad', date: '2026-10-01', type: 'americano' }], matches: [], now: NOW });
    expect(santo).toEqual([]);
  });

  it('sin nada hoy ni mañana no se precarga nada', () => {
    expect(plan()).toEqual([]);
  });
});

describe('cuándo toca', () => {
  const day = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  it('la primera vez, cada hora y al cambiar el día', () => {
    const at = new Date(2026, 8, 29, 10, 0).getTime();
    expect(prefetchDue(null, at)).toBe(true);
    expect(prefetchDue({ at, day: day(at) }, at + 10 * 60_000)).toBe(false);
    expect(prefetchDue({ at, day: day(at) }, at + PREFETCH_EVERY_MS)).toBe(true);
    const late = new Date(2026, 8, 29, 23, 50).getTime();
    expect(prefetchDue({ at: late, day: day(late) }, late + 20 * 60_000)).toBe(true);
    // Reloj que se atrasó: se vuelve a precargar.
    expect(prefetchDue({ at, day: day(at) }, at - 60_000)).toBe(true);
  });
});

describe('correr las tareas', () => {
  const task = (id: string): PrefetchTask => ({ kind: 'match', key: id, lid: 'l', id });

  it('de a pocas a la vez, en orden, y una que falla no corta las demás', async () => {
    let running = 0;
    let most = 0;
    const order: string[] = [];
    const r = await runPrefetchTasks(
      ['a', 'b', 'c', 'd', 'e'].map(task),
      async (t) => {
        running++;
        most = Math.max(most, running);
        order.push(t.id!);
        await new Promise((res) => setTimeout(res, 5));
        running--;
        if (t.id === 'c') throw new Error('sin señal');
      },
      { concurrency: 2 },
    );
    expect(r).toEqual({ done: 4, failed: 1, stopped: false });
    expect(most).toBe(2);
    expect(order).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('para cuando se va la señal (o cambia la cuenta)', async () => {
    let online = true;
    const r = await runPrefetchTasks(
      ['a', 'b', 'c'].map(task),
      async () => {
        online = false;
      },
      { concurrency: 1, shouldStop: () => !online },
    );
    expect(r).toEqual({ done: 1, failed: 0, stopped: true });
  });
});

describe('precarga con la base de verdad', () => {
  let w: TestWorld;
  let net: FlakyBackend;
  let rosaId: string;
  let padel: string;
  let bowling: string;
  let mid: string;
  let practice: string;
  const now = Date.now();
  const today = zonedParts(new Date(now).toISOString(), TZ)!.date;

  beforeAll(async () => {
    w = await openWorld();
    rosaId = await w.signUp('rosa@x.com', 'Rosa');
    await w.signUp('ana@x.com', 'Ana');
    await w.makeSuper(rosaId);
    await w.as('rosa@x.com');
    const base = { kind: 'liga' as const, visibility: 'private' as const, venue: 'Club', schedule: '', seasonStart: '', seasonEnd: '', contactName: '', contactPhone: '', requirePhoto: false };
    padel = await createLeague({ uid: rosaId, name: 'Rosa' }, { ...base, name: 'Pádel del jueves', sport: 'padel' });
    bowling = await createLeague({ uid: rosaId, name: 'Rosa' }, { ...base, name: 'Liga Norte', sport: 'bowling' });
    const pRosa = (await fetchPlayers(padel)).find((p) => p.uid === rosaId)!.id;
    [mid] = await createMatches(padel, [
      {
        round: 1,
        court: 'Cancha 1',
        scheduledAt: new Date(now + 2 * 3_600_000).toISOString(),
        sides: [{ side: 1, players: [{ playerId: pRosa }] }, { side: 2, label: 'Por definir' }],
      },
    ]);
    practice = await createEvent(bowling, {
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
    net = flaky(w.b);
    w.use(net);
    // Lo que se leyó al crear no cuenta: al cambiar de cuenta y volver la caché queda vacía (como un teléfono que
    // nunca abrió nada; en las pruebas no hay copia en IndexedDB).
    await w.as('ana@x.com');
    await w.as('rosa@x.com');
    resetMatchesForTests();
  }, 120_000);

  afterAll(async () => {
    resetMatchesForTests();
    await w.close();
  });

  it('trae tu partido y el evento de hoy con la clave de su pantalla, y se ven sin señal', async () => {
    expect(queryClient.getQueryData(matchKeys.one(mid))).toBeUndefined();
    const r = await prefetchToday(rosaId, { now });
    expect(r.stopped).toBe(false);
    expect(r.failed).toBe(0);
    expect(r.done).toBe(r.tasks);

    // El partido completo (con las reglas copiadas: la cancha arranca sin señal) y la lista donde se abre.
    const one = queryClient.getQueryData<{ id: string; rules?: unknown }>(matchKeys.one(mid));
    expect(one).toMatchObject({ id: mid, rules: { match: { sport: 'padel' } } });
    expect(queryClient.getQueryData<{ id: string }[]>(matchKeys.league(padel))?.map((x) => x.id)).toEqual([mid]);
    // Registrado con el mismo tipo que useMatch (así la cola le pone encima lo pendiente).
    expect(cachedQueries('match').map((q) => q.key)).toContain(matchKeys.one(mid));
    // Mis partidos con la misma clave que el Home.
    expect(queryClient.getQueryData<{ id: string }[]>(myMatchesKey(rosaId, myMatchesSince(new Date(now))))?.map((x) => x.id)).toEqual([mid]);
    // La práctica de hoy con sus participaciones, la liga y la membresía.
    expect(queryClient.getQueryData<{ id: string }>(keys.event(bowling, practice))).toMatchObject({ id: practice, type: 'practica' });
    expect(queryClient.getQueryData(keys.eventEntries(practice))).toEqual([]);
    expect(queryClient.getQueryData<{ id: string }>(keys.league(bowling))).toMatchObject({ id: bowling });
    expect(queryClient.getQueryData<{ leagueId: string }>(keys.membership(padel, rosaId))).toMatchObject({ leagueId: padel });

    // Sin señal: lo precargado sale de la caché (la lectura directa falla).
    net.offline = true;
    try {
      await expect(fetchMatch(padel, mid)).rejects.toThrow();
      expect(queryClient.getQueryData(matchKeys.one(mid))).toBeDefined();
    } finally {
      net.offline = false;
    }
  });

  it('sin señal o con otra cuenta en la capa de datos no hace nada', async () => {
    net.offline = true;
    try {
      expect(await prefetchToday(rosaId, { now })).toEqual({ tasks: 0, done: 0, failed: 0, stopped: true });
    } finally {
      net.offline = false;
    }
    expect((await prefetchToday('otra-cuenta', { now })).stopped).toBe(true);
  });

  it('«En juego ahora» del Home: los partidos en vivo de tus ligas (en cualquier orden); al terminar ya no salen', async () => {
    expect(liveMatchesKey([padel, bowling])).toBe(liveMatchesKey([bowling, padel]));
    expect(await fetchLiveMatches([])).toEqual([]);
    expect(await fetchLiveMatches([padel, bowling])).toEqual([]);
    await publishMatch(padel, mid, { seq: 1, state: { v: 1, seq: 1 }, score: { text: '15-0' } }).done;
    const live = await fetchLiveMatches([bowling, padel]);
    expect(live.map((x) => [x.id, x.status, x.score?.text, x.sides[0].label])).toEqual([[mid, 'live', '15-0', 'Rosa']]);
    await finishMatch(padel, mid, { score: { text: '6-0 6-0', sides: [2, 0] }, winner: 1 });
    expect(await fetchLiveMatches([padel, bowling])).toEqual([]);
  });
});
