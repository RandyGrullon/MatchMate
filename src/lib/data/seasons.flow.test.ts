/**
 * Temporadas y playoffs con la base de verdad (PGlite con las migraciones y la RLS): la liga nace con su temporada y
 * sus equipos quedan en ella; el playoff arma la llave, programa los juegos y pasa al ganador; al cerrar la
 * temporada se guardan la tabla y los premios (y el campeón sale en league_champions); la nueva copia los equipos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { awardsArg, initialAwards, makeSnapshot, parseSnapshot, snapshotTable, teamsOfSeason } from '../../components/season/logic';
import { playoffBracket } from '../../pages/sports/team/playoffs';
import { addDays, todayIn } from '../../pages/sports/racket/logic/time';
import { createLeague } from './leagues';
import { adminCorrectResult, fetchLeagueMatches, resetMatchesForTests } from './matches';
import { createPlayoffs, deletePlayoffs, fetchPlayoffs, syncPlayoffs } from './playoffs';
import { closeSeason, startSeason } from './seasonAdmin';
import { fetchLeagueChampions, fetchLeagueSeasons } from './seasons';
import { createSeasonTeam, fetchSeasonTeams } from './seasonTeams';
import { openWorld, type TestWorld } from './testkit';

let w: TestWorld;
let lid: string;
const t: Record<'a' | 'b' | 'c' | 'd', string> = { a: '', b: '', c: '', d: '' };

beforeAll(async () => {
  w = await openWorld();
  const rosa = await w.signUp('rosa@x.com', 'Rosa');
  // El baloncesto está en beta: solo el superadmin crea la liga.
  await w.makeSuper(rosa);
  lid = await createLeague(
    { uid: rosa, name: 'Rosa' },
    {
      name: 'Baloncesto del barrio',
      kind: 'liga',
      visibility: 'public',
      venue: 'Cancha',
      schedule: '',
      seasonStart: '',
      seasonEnd: '',
      contactName: '',
      contactPhone: '',
      requirePhoto: false,
      sport: 'basketball',
    },
  );
  t.a = await createSeasonTeam(lid, { name: 'Águilas' });
  t.b = await createSeasonTeam(lid, { name: 'Búhos' });
  t.c = await createSeasonTeam(lid, { name: 'Cóndores' });
  t.d = await createSeasonTeam(lid, { name: 'Delfines' });
}, 120_000);

afterAll(async () => {
  resetMatchesForTests();
  await w.close();
});

/** Los juegos del playoff (lista fresca: sin la lectura incremental de las pruebas anteriores). */
async function playoffGames() {
  resetMatchesForTests();
  return (await fetchLeagueMatches(lid)).filter((m) => m.seriesId);
}

describe('temporadas y playoffs (con la base)', () => {
  it('la liga nace con su temporada activa y los equipos quedan en ella', async () => {
    const seasons = await fetchLeagueSeasons(lid);
    expect(seasons).toHaveLength(1);
    expect(seasons[0]).toMatchObject({ status: 'active', awards: [], playoffs: [] });
    expect(seasons[0].name).toMatch(/^Temporada \d{4}$/);
    const teams = await fetchSeasonTeams(lid);
    expect(teams.map((x) => x.seasonId)).toEqual(teams.map(() => seasons[0].id));
  }, 60_000);

  it('playoff: la llave, un juego por serie, el ganador pasa y el campeón queda en la temporada', async () => {
    const [season] = await fetchLeagueSeasons(lid);
    const id = await createPlayoffs(lid, season.id, [t.a, t.b, t.c, t.d], [1, 3]);
    const [po] = await fetchPlayoffs(lid);
    expect(po).toMatchObject({ id, seasonId: season.id, status: 'active', bestOf: [1, 3], seeds: [t.a, t.b, t.c, t.d] });
    // Siembra estándar: 1 contra 4 y 2 contra 3; los ganadores se ven en la final.
    expect(po.series.map((s) => [s.round, s.slot, s.teamA, s.teamB])).toEqual([
      [1, 1, t.a, t.d],
      [1, 2, t.b, t.c],
      [2, 1, null, null],
    ]);
    expect(playoffBracket(po).matches.map((m) => m.next?.key ?? null)).toEqual(['PO2-1', 'PO2-1', null]);

    let games = await playoffGames();
    expect(games.map((g) => g.bracketKey).sort()).toEqual(['PO1-1', 'PO1-2']);
    // Gana el local (el mejor sembrado) de cada semifinal.
    for (const g of games) await adminCorrectResult(lid, g.id, { score: { text: '70-60', sides: [70, 60] }, winner: 1 });
    const [afterSemis] = await fetchPlayoffs(lid);
    expect(afterSemis.series[2]).toMatchObject({ teamA: t.a, teamB: t.b, winsA: 0, winsB: 0 });
    games = await playoffGames();
    const final1 = games.find((g) => g.bracketKey === 'PO2-1')!;
    expect(final1.stage).toMatch(/^Final · Juego 1$/);
    expect(final1.sides.map((s) => s.teamId)).toEqual([t.a, t.b]);

    // Final al mejor de 3: Águilas gana dos.
    await adminCorrectResult(lid, final1.id, { score: { text: '80-75', sides: [80, 75] }, winner: 1 });
    const final2 = (await playoffGames()).find((g) => g.bracketKey === 'PO2-1' && g.id !== final1.id)!;
    // El segundo juego es en casa del otro.
    expect(final2.sides.map((s) => s.teamId)).toEqual([t.b, t.a]);
    await adminCorrectResult(lid, final2.id, { score: { text: '60-66', sides: [60, 66] }, winner: 2 });
    const [done] = await fetchPlayoffs(lid);
    expect(done).toMatchObject({ status: 'finished', winner: t.a });
    expect(done.series[2]).toMatchObject({ winsA: 2, winsB: 0, winner: t.a });
    expect(await syncPlayoffs(lid, done.id)).toBe(0);
    const [withChamp] = await fetchLeagueSeasons(lid);
    expect(withChamp.playoffs[0]).toMatchObject({ status: 'finished', champion: { teamId: t.a, name: 'Águilas' }, runnerUp: { teamId: t.b, name: 'Búhos' } });
  }, 120_000);

  it('cerrar con la tabla y los premios; corregir sin avisar; la nueva copia los equipos', async () => {
    const [season] = await fetchLeagueSeasons(lid);
    const snapshot = makeSnapshot('basketball', [
      snapshotTable(
        { key: 'tabla', title: 'Tabla', nameLabel: 'Equipo' },
        [
          { rank: 1, id: t.c, pts: 6 },
          { rank: 2, id: t.a, pts: 5 },
          { rank: 3, id: t.b, pts: 4 },
        ],
        [{ label: 'Pts', value: (r) => r.pts }],
        (r) => ({ name: r.id === t.a ? 'Águilas' : r.id === t.b ? 'Búhos' : 'Cóndores', teamId: r.id }),
      ),
    ]);
    // El campeón y el subcampeón salen de la final del playoff; el tercero, el mejor de la tabla que no llegó.
    const awards = initialAwards(snapshot, season);
    expect(awards.slice(0, 3).map((a) => a.ref)).toEqual([`t:${t.a}`, `t:${t.b}`, `t:${t.c}`]);
    await closeSeason(lid, season.id, snapshot, awardsArg(awards));

    const [closed] = await fetchLeagueSeasons(lid);
    expect(closed.status).toBe('closed');
    expect(closed.endsOn).toBe(todayIn('America/Santo_Domingo'));
    expect(parseSnapshot(closed.standings)).toEqual(snapshot);
    expect(closed.awards.map((a) => [a.kind, a.name])).toEqual([
      ['campeon', 'Águilas'],
      ['subcampeon', 'Búhos'],
      ['tercero', 'Cóndores'],
    ]);
    const [champ] = await fetchLeagueChampions(lid);
    expect(champ).toMatchObject({ seasonId: season.id, champion: { name: 'Águilas', teamId: t.a } });

    // Corregir: cambia los premios (con un «otro») y deja la tabla.
    await closeSeason(lid, season.id, snapshot, [
      { kind: 'campeon', team_id: t.a },
      { kind: 'otro', label: 'Mejor afición', team_id: t.d, note: 'Llenaron la cancha' },
    ]);
    const [fixed] = await fetchLeagueSeasons(lid);
    expect(fixed.awards.map((a) => [a.label, a.name, a.note])).toEqual([
      ['Campeón', 'Águilas', null],
      ['Mejor afición', 'Delfines', 'Llenaron la cancha'],
    ]);

    const tomorrow = addDays(todayIn('America/Santo_Domingo'), 1);
    const sid = await startSeason(lid, { name: 'Temporada nueva', startsOn: tomorrow, copyTeams: true });
    const seasons = await fetchLeagueSeasons(lid);
    expect(seasons.map((s) => [s.name, s.status])).toEqual([
      ['Temporada nueva', 'active'],
      [season.name, 'closed'],
    ]);
    const teams = await fetchSeasonTeams(lid);
    const fresh = teamsOfSeason(teams, { id: sid }, false);
    expect(fresh.map((x) => x.name).sort()).toEqual(['Búhos', 'Cóndores', 'Delfines', 'Águilas'].sort());
    expect(fresh.every((x) => !Object.values(t).includes(x.id))).toBe(true);
    // Con una activa no se puede empezar otra.
    await expect(startSeason(lid, { name: 'Otra', startsOn: addDays(tomorrow, 1) })).rejects.toThrow(/invalido/);
    // El playoff de la temporada cerrada se puede borrar (los juegos jugados se quedan sin serie).
    const [po] = await fetchPlayoffs(lid);
    await deletePlayoffs(lid, po.id);
    expect(await fetchPlayoffs(lid)).toEqual([]);
    expect((await playoffGames()).length).toBe(0);
    resetMatchesForTests();
    expect((await fetchLeagueMatches(lid)).filter((m) => m.bracketKey?.startsWith('PO')).length).toBe(4);
  }, 120_000);
});
