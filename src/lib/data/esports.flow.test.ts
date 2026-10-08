/**
 * Esports con la base de verdad (PGlite con las migraciones y la RLS), de punta a punta: cada quien pone su ID de
 * Rocket League (queda declarado: con eso basta), se arman tres equipos (crear y unirse con el código), se crea un
 * torneo 2 contra 2 «Solo equipos» de eliminación simple, los capitanes inscriben a su plantilla, el organizador aprueba
 * (la base los materializa en la liga), siembra y arma el cuadro con el motor; un capitán anota la serie, el rival la
 * confirma y el ganador pasa solo a la final (el trigger del cuadro). Al final, «Pedir ID confirmado»: cuenta en Rocket
 * League (se comprueba conectando Epic) y no en EA SPORTS FC (sin verificación).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSeriesScore, defaultSettings, resolvePlan, singleEliminationPlan, type SeriesRules, type StagePlan } from '../../sports/esports';
import {
  createEsportsTournament,
  createStage,
  createTeam,
  decideEntry,
  entriesBySideTeam,
  esportsErrorText,
  fetchEntries,
  fetchHub,
  fetchMyEntries,
  fetchMyTeams,
  fetchStageLinks,
  fetchTeam,
  fetchTournament,
  joinTeam,
  keyResults,
  previewTeamCode,
  registerSolo,
  registerTeam,
  renewTeamCode,
  seriesInput,
  setSeeds,
  syncBracket,
} from './esports';
import { fetchMyGameIds, saveGameId } from './esportsIds';
import { confirmResult, fetchEventMatches, fetchMatch, finishMatch, resetMatchesForTests, type Match } from './matches';
import { openWorld, type TestWorld } from './testkit';

// Las RPC de esports llegan con 20261008000100_esports.sql: sin ella (otra rama), no hay nada que probar.
const migrations = import.meta.glob<string>('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });
const haveEsports = Object.values(migrations).some((sql) => sql.includes('function public.esports_create_stage'));

const GAME = 'rocket_league' as const;
const DAY = 86_400_000;

let w: TestWorld;
const uid: Record<string, string> = {};
const teams: Record<string, string> = {};
const entries: Record<string, string> = {};
let lid: string;
let eid: string;
let plan: StagePlan;

/** Crea la cuenta y pone su ID de Rocket League (Epic ID): queda declarado y con eso basta para equipos y torneos. */
async function player(email: string, name: string) {
  uid[name] = await w.signUp(email, name);
  expect(await saveGameId(GAME, `${name}RL`)).toEqual({ status: 'pendiente', idDisplay: `${name}RL` });
}

/** Lo que dice la base cuando algo no se puede (el código y, si viene, el detalle). */
async function failure(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('se esperaba un error');
}

describe.skipIf(!haveEsports)('esports con la base de verdad', () => {
  beforeAll(async () => {
    w = await openWorld();
    for (const name of ['Ana', 'Bea', 'Carl', 'Dani', 'Eva', 'Fede']) await player(`${name.toLowerCase()}@x.com`, name);
  }, 180_000);

  afterAll(async () => {
    resetMatchesForTests();
    await w?.close();
  });

  it('el ID: queda declarado (sin comprobar, no es exclusivo) y otra cuenta puede declarar el mismo', async () => {
    // Fede (la última cuenta que entró).
    expect(await fetchMyGameIds()).toMatchObject([{ userId: uid.Fede, game: GAME, idDisplay: 'FedeRL', status: 'pendiente', ownership: 'declarado', rankSource: 'declarado' }]);
    // Nadie se adueña de un ID declarado: Fede también puede poner el de Eva (y vuelve al suyo).
    expect(await saveGameId(GAME, 'EvaRL')).toMatchObject({ status: 'pendiente' });
    expect(await saveGameId(GAME, 'FedeRL')).toMatchObject({ status: 'pendiente' });
  });

  it('equipos: el capitán crea, los demás se unen con el código (y ven a qué equipo antes)', async () => {
    const pairs: [string, string, string, string][] = [
      ['Ana', 'Bea', 'Turbo', 'TRB'],
      ['Carl', 'Dani', 'Nitro', 'NTR'],
      ['Eva', 'Fede', 'Boost', 'bst'],
    ];
    for (const [captain, member, name, tag] of pairs) {
      await w.as(`${captain.toLowerCase()}@x.com`);
      const made = await createTeam({ game: GAME, name, tag });
      expect(made.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      teams[name] = made.teamId;
      // El código nuevo reemplaza al anterior.
      const code = name === 'Turbo' ? await renewTeamCode(made.teamId) : made.inviteCode;
      if (name === 'Turbo') expect(code).not.toBe(made.inviteCode);
      await w.as(`${member.toLowerCase()}@x.com`);
      expect(await previewTeamCode(code.toLowerCase())).toMatchObject({ teamId: made.teamId, game: GAME, name, tag: tag.toUpperCase(), memberCount: 1 });
      expect(await joinTeam(code)).toEqual({ teamId: made.teamId });
      // El código viejo de Turbo ya no sirve.
      if (name === 'Turbo') expect(await joinTeam(made.inviteCode)).toBeNull();
    }
    const turbo = await fetchTeam(teams.Turbo);
    expect(turbo?.team).toMatchObject({ name: 'Turbo', tag: 'TRB', game: GAME, captainId: uid.Ana, memberCount: 2 });
    expect(turbo?.members.map((m) => [m.displayName, m.role])).toEqual([
      ['Ana', 'captain'],
      ['Bea', 'member'],
    ]);
    // Fede (la última cuenta que entró) ve su equipo como miembro.
    expect((await fetchMyTeams(uid.Fede)).map((t) => [t.name, t.myRole])).toEqual([['Boost', 'member']]);
  });

  it('torneo: se crea suelto (su liga y su evento) y sale en la página del juego', async () => {
    await w.as('ana@x.com');
    const start = new Date(Date.now() + 2 * DAY).toISOString();
    const made = await createEsportsTournament({
      game: GAME,
      name: 'Copa Turbo',
      mode: '2v2',
      entryType: 'teams',
      format: 'single_elim',
      startsAt: start,
      registrationClosesAt: new Date(Date.now() + DAY).toISOString(),
      maxEntries: 8,
      settings: defaultSettings(GAME, '2v2', 'single_elim'),
      visibility: 'public',
      prizeText: 'Trofeo',
      announcement: 'Mapas estándar.',
    });
    lid = made.leagueId;
    eid = made.eventId;
    expect(made.inviteCode).toBeNull();
    expect(await fetchTournament(eid)).toMatchObject({
      eventId: eid,
      leagueId: lid,
      name: 'Copa Turbo',
      announcement: 'Mapas estándar.',
      game: GAME,
      mode: '2v2',
      entryType: 'teams',
      format: 'single_elim',
      status: 'registration',
      maxEntries: 8,
      prizeText: 'Trofeo',
    });
    const hub = await fetchHub(GAME);
    expect(hub.tournaments.map((t) => t.eventId)).toContain(eid);
    expect(hub.teams.map((t) => t.name).sort()).toEqual(['Boost', 'Nitro', 'Turbo']);
  });

  it('inscripción: cada capitán inscribe su plantilla; el organizador aprueba y la base los pone en la liga', async () => {
    for (const [captain, member, team] of [
      ['Ana', 'Bea', 'Turbo'],
      ['Carl', 'Dani', 'Nitro'],
      ['Eva', 'Fede', 'Boost'],
    ] as const) {
      await w.as(`${captain.toLowerCase()}@x.com`);
      entries[team] = await registerTeam(eid, teams[team], [{ userId: uid[member], role: 'member' }]);
    }
    let list = await fetchEntries(eid);
    expect(list.map((e) => [e.name, e.status, e.members.length])).toEqual(
      expect.arrayContaining([
        ['Turbo', 'pending', 2],
        ['Nitro', 'pending', 2],
        ['Boost', 'pending', 2],
      ]),
    );
    // Mis inscripciones (Fede, por la plantilla).
    expect((await fetchMyEntries()).map((e) => [e.tournament, e.entryName, e.role, e.entryStatus])).toEqual([['Copa Turbo', 'Boost', 'captain', 'pending']]);

    await w.as('ana@x.com');
    for (const team of ['Turbo', 'Nitro', 'Boost']) await decideEntry(entries[team], true);
    list = await fetchEntries(eid);
    expect(list.every((e) => e.status === 'approved' && !!e.sideTeamId)).toBe(true);
    await setSeeds(eid, [entries.Turbo, entries.Nitro, entries.Boost]);
    expect((await fetchEntries(eid)).map((e) => [e.name, e.seed])).toEqual([
      ['Turbo', 1],
      ['Nitro', 2],
      ['Boost', 3],
    ]);
  });

  it('el cuadro: el motor lo arma, la base crea los partidos y sus enlaces, y el torneo empieza', async () => {
    plan = singleEliminationPlan([entries.Turbo, entries.Nitro, entries.Boost], { thirdPlace: false, bestOf: 3, finalBestOf: 5 });
    const ids = await createStage(lid, eid, plan);
    expect(ids).toHaveLength(plan.matches.length);
    expect((await fetchTournament(eid))?.status).toBe('live');
    const links = await fetchStageLinks(eid);
    expect(links).toHaveLength(2);
    const matches = await fetchEventMatches(lid, eid);
    // Con 3, el 1.º pasa solo: la semifinal es la llave W1-2 (2.º contra 3.º) y la final, W2-1.
    expect(plan.matches.map((m) => m.key)).toEqual(['W1-2', 'W2-1']);
    const semi = matches.find((m) => m.bracketKey === 'W1-2')!;
    const final = matches.find((m) => m.bracketKey === 'W2-1')!;
    expect(links.find((l) => l.matchId === semi.id)).toMatchObject({ stage: 'bracket', part: 'W', bestOf: 3, winnerTo: final.id, winnerSide: 2 });
    // La semifinal es 2.º contra 3.º; Turbo (1.º) espera en la final.
    const bySide = entriesBySideTeam(await fetchEntries(eid));
    expect(semi.sides.map((s) => bySide.get(s.teamId!))).toEqual([entries.Nitro, entries.Boost]);
    expect(final.sides[0].teamId && bySide.get(final.sides[0].teamId)).toBe(entries.Turbo);
    expect(final.sides[1]).toMatchObject({ teamId: null, label: 'Ganador W1-2' });
    expect(semi.format).toBe(GAME);
  });

  it('una serie: el capitán la anota, el rival la confirma y el ganador pasa solo a la final', async () => {
    const before = await fetchEventMatches(lid, eid);
    const semi = before.find((m) => m.bracketKey === 'W1-2')!;
    const full = (await fetchMatch(lid, semi.id))!;
    const rules = full.rules as unknown as SeriesRules;
    expect(rules).toMatchObject({ game: GAME, bestOf: 3, draws: false });
    // Nitro gana 2-1: 3-1, 1-2 en prórroga (gol de oro) y 4-0.
    const score = buildSeriesScore(rules, [{ a: 3, b: 1 }, { a: 1, b: 2, ot: true }, { a: 4, b: 0 }]);
    expect(score.sides).toEqual([2, 1]);

    await w.as('carl@x.com');
    expect(await finishMatch(lid, semi.id, { score, winner: 1 })).toEqual({ ok: true, status: 'finished' });
    // Todavía nada en la final (falta que confirme el rival).
    let final = (await fetchEventMatches(lid, eid)).find((m) => m.bracketKey === 'W2-1')!;
    expect(final.sides[1].teamId).toBeNull();

    await w.as('eva@x.com');
    await confirmResult(lid, semi.id);
    // En la base, la final ya tiene a Nitro en el lado 2 (el trigger del cuadro).
    const sides = await w.b.db.query<{ side: number; label: string }>('select side, label from public.match_sides where match_id = $1 order by side', [final.id]);
    expect(sides.rows.map((r) => [r.side, r.label])).toEqual([
      [1, 'Turbo'],
      [2, 'Nitro'],
    ]);
    // Y las pantallas lo ven: la versión de la final sube, así la lista (que baja solo lo que cambió) la vuelve a leer.
    expect((await fetchMatch(lid, final.id))?.version).toBeGreaterThan(final.version);
    const after = await fetchEventMatches(lid, eid);
    final = after.find((m) => m.bracketKey === 'W2-1')!;
    const list = await fetchEntries(eid);
    const bySide = entriesBySideTeam(list);
    expect(bySide.get(final.sides[1].teamId!)).toBe(entries.Nitro);
    expect(final.sides[1].label).toBe('Nitro');

    // Lo mismo, visto por el motor: resultados por llave y quién juega cada partido.
    const links = await fetchStageLinks(eid);
    const results = keyResults(after as unknown as Match[], links, bySide, Date.now());
    expect(results).toEqual({ 'W1-2': { winner: entries.Nitro, loser: entries.Boost } });
    expect(resolvePlan(plan, results).find((m) => m.key === 'W2-1')?.known).toEqual([entries.Turbo, entries.Nitro]);
    const input = seriesInput(after.find((m) => m.id === semi.id) as unknown as Match, bySide);
    expect(input).toMatchObject({ side1: entries.Nitro, side2: entries.Boost, winner: 1, walkover: null });
    // Ya no queda nada por aplicar.
    expect(await syncBracket(eid)).toBe(0);
  });

  it('«Pedir ID confirmado»: en Rocket League frena al ID declarado; en EA SPORTS FC no cuenta (no se puede comprobar)', async () => {
    const start = new Date(Date.now() + 3 * DAY).toISOString();
    const closes = new Date(Date.now() + 2 * DAY).toISOString();
    await w.as('ana@x.com');
    const rl = await createEsportsTournament({
      game: GAME,
      name: 'Copa Epic',
      mode: '2v2',
      entryType: 'teams',
      format: 'single_elim',
      startsAt: start,
      registrationClosesAt: closes,
      maxEntries: 8,
      settings: { ...defaultSettings(GAME, '2v2', 'single_elim'), requireConfirmedId: true },
      visibility: 'public',
    });
    expect((await fetchTournament(rl.eventId))?.settings.requireConfirmedId).toBe(true);
    // Carl y Dani tienen su Epic ID declarado, no conectado: 'id_sin_comprobar' con el nombre del primero.
    await w.as('carl@x.com');
    const e = await failure(registerTeam(rl.eventId, teams.Nitro, [{ userId: uid.Dani, role: 'member' }]));
    expect(String((e as Error).message)).toMatch(/^id_sin_comprobar/);
    expect(esportsErrorText(e, GAME)).toMatch(/ID de Rocket League comprobado\.$/);

    await w.as('ana@x.com');
    const fc = await createEsportsTournament({
      game: 'ea_fc',
      name: 'Copa FC',
      mode: '1v1',
      entryType: 'open',
      format: 'single_elim',
      startsAt: start,
      registrationClosesAt: closes,
      maxEntries: 8,
      settings: { ...defaultSettings('ea_fc', '1v1', 'single_elim'), requireConfirmedId: true },
      visibility: 'public',
    });
    // En EA SPORTS FC no se puede comprobar el ID: la app lo ve apagado y la base no lo cuenta.
    expect((await fetchTournament(fc.eventId))?.settings.requireConfirmedId).toBe(false);
    await w.as('bea@x.com');
    await saveGameId('ea_fc', 'Bea_FC10');
    expect(await registerSolo(fc.eventId)).toMatch(/^[0-9a-f-]{36}$/);
    // Sin ID de ese juego: 'sin_id'.
    await w.as('carl@x.com');
    const noId = await failure(registerSolo(fc.eventId));
    expect(String((noId as Error).message)).toMatch(/^sin_id/);
    expect(esportsErrorText(noId, 'ea_fc')).toMatch(/ID de EA SPORTS FC\.$/);
  });
});
