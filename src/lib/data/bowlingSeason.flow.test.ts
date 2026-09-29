import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildGameContexts, gameMarks, rankingRows, readBowlingSnapshot } from '../bowlingSeason';
import { toIsoDate } from '../format';
import { NO_PHOTO } from '../types';
import { fetchAgenda, joinAgendaItem } from './agenda';
import { fetchBowlingGameContext } from './bowlingContext';
import { currentOutbox, rpc } from './client';
import { createEvent } from './events';
import { createLeague, joinLeague } from './leagues';
import { fetchMembership } from './members';
import { fetchEffectiveAverages, fetchPlayers } from './players';
import { fetchLeagueSeasons } from './seasons';
import { openWorld, type TestWorld } from './testkit';
import type { Entry } from '../types';

/**
 * Boliche por temporada y «¿Dónde juego esta semana?» con la base de verdad (PGlite + RLS): las temporadas que lee
 * el ranking, el promedio del handicap por temporada, el contexto de las marcas de cada juego (el mismo que calcula
 * el teléfono) y apuntarse desde la agenda.
 */

let w: TestWorld;
let lid: string;
let rosa: string;
let ana: string;
let anaPlayer: string;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

const practice = (date: string, games = 3) => ({
  type: 'practica' as const,
  name: '',
  date,
  games,
  hcpBase: 0,
  hcpPercent: 0,
  individualRankBy: 'scratch' as const,
  teamRankBy: 'scratch' as const,
  categoryCuts: [200, 175, 160] as [number, number, number],
  teamSize: 0,
  announcement: '',
});

/** Juegos que cuentan (sin foto: la liga no la exige) de Ana en ese evento. */
async function played(eventId: string, scores: number[], average = 0): Promise<string> {
  const [row] = await q<{ id: string }>(
    `insert into public.entries (league_id, event_id, player_id, average, scores, photos) values ($1, $2, $3, $4, $5, $6) returning id`,
    [lid, eventId, anaPlayer, average, scores, scores.map(() => NO_PHOTO)],
  );
  return row.id;
}

/** Tope de cada prueba: la base en memoria es lenta cuando corren todas juntas. */
const SLOW = 60_000;

const inDays = (n: number) => toIsoDate(new Date(Date.now() + n * 86_400_000));

beforeAll(async () => {
  w = await openWorld();
  rosa = await w.signUp('rosa@x.com', 'Rosa Dueña');
  ana = await w.signUp('ana@x.com', 'Ana Pérez');
  await w.signUp('luis@x.com', 'Luis Gómez');
  await w.as('rosa@x.com');
  lid = await createLeague(
    { uid: rosa, name: 'Rosa' },
    {
      name: 'Liga Abierta',
      kind: 'liga',
      visibility: 'public',
      venue: 'Bowling Center',
      schedule: 'Martes 7:00 pm',
      seasonStart: '2025-01-01',
      seasonEnd: '2025-12-20',
      contactName: 'Rosa',
      contactPhone: '18095551234',
      requirePhoto: false,
    },
  );
  await w.as('ana@x.com');
  anaPlayer = (await joinLeague(lid, { uid: ana, name: 'Ana' }, null))!;
  await w.as('rosa@x.com');
}, 120_000);

afterAll(async () => {
  await w.close();
});

describe('boliche por temporada (PGlite + RLS)', () => {
  let e2026: string;
  let ev2026: string;

  it('temporada 2025 con 6 juegos de Ana; al cerrarla se guarda el ranking y el campeón', async () => {
    const a = await createEvent(lid, practice('2025-03-04'));
    const b = await createEvent(lid, practice('2025-04-01'));
    const e1 = await played(a, [170, 180, 190]);
    const e2 = await played(b, [180, 180, 180]);
    const [first] = await fetchLeagueSeasons(lid);
    expect(first).toMatchObject({ status: 'active', startsOn: '2025-01-01', awards: [], playoffs: [] });

    const entries: Entry[] = (await q<{ id: string; event_id: string; scores: number[]; photos: string[] }>(
      'select id, event_id, scores, photos from public.entries where id = any($1)',
      [[e1, e2]],
    )).map((r) => ({ id: r.id, eventId: r.event_id, playerId: anaPlayer, teamId: null, average: 0, handicapOverride: null, scores: r.scores, photos: r.photos }));
    const rows = rankingRows(entries, await fetchPlayers(lid));
    expect(rows).toEqual([expect.objectContaining({ playerId: anaPlayer, average: 180, games: 6, high: 190 })]);
    // La tabla como la guarda Admin › Temporada (src/components/season/logic.ts).
    const standings = {
      v: 1,
      sport: 'bowling',
      at: new Date().toISOString(),
      tables: [
        {
          key: 'promedio',
          title: 'Promedio',
          nameLabel: 'Jugador',
          columns: [{ label: 'Juegos' }, { label: 'Máx' }, { label: 'Prom.' }],
          rows: rows.map((r, i) => ({ rank: i + 1, name: r.name, playerId: r.playerId, values: [r.games, r.high, r.average] })),
        },
      ],
    };
    await rpc('close_season', { p_season: first.id, p_standings: standings, p_awards: [{ kind: 'campeon', player_id: anaPlayer }] });
    // Se cerró en diciembre de 2025 (la prueba corre después): la nueva empieza después de ese día.
    await q(`update public.seasons set ends_on = '2025-12-20', closed_at = '2025-12-20T22:00:00Z' where id = $1`, [first.id]);
    await rpc('start_season', { p_league: lid, p_name: 'Temporada 2026', p_starts_on: '2026-01-10', p_ends_on: null, p_copy_teams: false });

    const seasons = await fetchLeagueSeasons(lid);
    expect(seasons.map((s) => [s.name, s.status])).toEqual([
      ['Temporada 2026', 'active'],
      [first.name, 'closed'],
    ]);
    const closed = seasons[1];
    expect(closed.endsOn).toBe('2025-12-20');
    expect(closed.awards).toEqual([expect.objectContaining({ kind: 'campeon', name: expect.stringMatching(/Ana/), playerId: anaPlayer })]);
    // La tabla guardada se lee igual que se mandó.
    expect(readBowlingSnapshot(closed.standings)).toEqual({
      covers: ['promedio'],
      rows: [{ ...rows[0], pins: 0, series: 0, events: 0 }],
    });
  }, SLOW);

  it('el promedio del handicap: sin 6 juegos en la temporada, el de la anterior; con 6, el suyo', async () => {
    ev2026 = await createEvent(lid, practice('2026-02-03'));
    e2026 = await played(ev2026, [230, 200, 210], 180);
    const torneo = await createEvent(lid, practice('2026-03-03'));
    const ana0 = { id: anaPlayer, averageOverride: 150 };
    // 3 juegos en 2026: manda 2025 (180), no el fijo.
    expect((await fetchEffectiveAverages(lid, [ana0], { date: '2026-03-03', eventId: torneo })).get(anaPlayer)).toBe(180);
    // Sin fecha, como antes: el fijo.
    expect((await fetchEffectiveAverages(lid, [ana0])).get(anaPlayer)).toBe(150);
    const ev = await createEvent(lid, practice('2026-02-17'));
    await played(ev, [200, 200, 200]);
    expect((await fetchEffectiveAverages(lid, [ana0], { date: '2026-03-03', eventId: torneo })).get(anaPlayer)).toBe(206);
  }, SLOW);

  it('las marcas de cada juego: la base manda lo mismo que calcula el teléfono', async () => {
    const ctx = await fetchBowlingGameContext([e2026]);
    expect(ctx[e2026]).toMatchObject({
      playerId: anaPlayer,
      leagueId: lid,
      averageOverride: null,
      // El promedio congelado al inscribirse (el mismo `frozen` que usa la pantalla del evento).
      average: 180,
      before: { games: 6, high: 190 },
      season: { games: 0, pins: 0 },
      prevSeason: { games: 6, pins: 1080 },
    });
    const all = await q<{ id: string; event_id: string; scores: number[]; photos: string[]; date: string }>(
      `select en.id, en.event_id, en.scores, en.photos, to_char(e.date, 'YYYY-MM-DD') as date
         from public.entries en join public.events e on e.id = en.event_id where en.player_id = $1`,
      [anaPlayer],
    );
    const local = buildGameContexts(
      all.map((r) => ({ date: r.date, entry: { id: r.id, eventId: r.event_id, playerId: anaPlayer, teamId: null, average: 0, handicapOverride: null, scores: r.scores, photos: r.photos } })),
      await fetchLeagueSeasons(lid),
      null,
    );
    const { entryId: _e, playerId: _p, leagueId: _l, seasonId: _s, average: _a, ...server } = ctx[e2026];
    expect({ ...server, prevSeason: { games: server.prevSeason!.games, pins: server.prevSeason!.pins } }).toEqual(local.get(e2026));
    // 230: récord (antes, 190) y +50 sobre su promedio de la temporada anterior (180).
    expect(gameMarks([230, 200, 210], [true, true, true], ctx[e2026])).toEqual([
      { record: true, over: 50 },
      { record: false, over: 20 },
      { record: false, over: 30 },
    ]);
  }, SLOW);
});

describe('¿Dónde juego esta semana? (PGlite + RLS)', () => {
  it('la práctica de una liga pública sale con «Voy»; Luis se apunta sin ser miembro', async () => {
    const date = inDays(3);
    const eventId = await createEvent(lid, practice(date));
    const uid = await w.as('luis@x.com');
    expect(await fetchMembership(lid, uid)).toBeNull();
    const before = await fetchAgenda();
    const item = before.items.find((i) => i.eventId === eventId)!;
    expect(item).toMatchObject({ leagueId: lid, leagueName: 'Liga Abierta', sport: 'bowling', join: 'rsvp', date, mine: false, url: `/l/${lid}/e/${eventId}` });

    expect(await joinAgendaItem(item, { uid, name: 'Luis' })).toEqual({ kind: 'going' });
    await currentOutbox()?.idle();
    expect((await fetchMembership(lid, uid))?.role).toBe('member');
    const after = await fetchAgenda({ sport: 'bowling' });
    expect(after.items.find((i) => i.eventId === eventId)).toMatchObject({ mine: true, taken: 1 });
    // Otro deporte: no sale.
    expect((await fetchAgenda({ sport: 'golf' })).items.some((i) => i.eventId === eventId)).toBe(false);
  }, SLOW);
});
