/**
 * Natación (Fase 7): encuentros, pruebas, clubes, nadadores (menores sin cuenta y sus datos privados),
 * inscripciones, hoja de series, resultados por serie (op_id), cierre del encuentro, league_id verificado
 * y que la base calcula categorías y pruebas válidas igual que el motor (src/sports/swimming).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';
import {
  CCCAN_AGE_GROUPS,
  SWIM_DISTANCES,
  SWIM_STROKES,
  ageGroupOf,
  mastersAgeGroups,
  seedHeats,
  validateSwimEvent,
  type PoolLength,
} from '../../src/sports/swimming';

let db: TestDb;
let w: World;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
});
afterEach(async () => {
  await db.rollback();
});

const THIS_YEAR = new Date().getFullYear();
/** Año de nacimiento para tener `age` años este año. */
const born = (age: number) => THIS_YEAR - age;

interface Swim {
  lid: string;
  pLuis: string;
  clubA: string;
  clubB: string;
}

/**
 * Liga de natación: dueño org, admin sofi, luis miembro con jugador y entrenador de «Delfines», ana
 * cronometrista (anotador) sin jugador. Clubes Delfines (luis) y Tiburones.
 */
async function swimLeague(opts: { minors?: boolean; visibility?: 'public' | 'private' } = {}): Promise<Swim> {
  const lid = await league(db, w.u.org, {
    name: 'Club Acuático',
    visibility: opts.visibility ?? 'private',
    requirePhoto: false,
    sport: 'swimming',
    hasMinors: opts.minors ?? true,
  });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.ana, 'member', 'ana', true);
  const pLuis = await player(db, lid, 'Luis', w.u.luis);
  const clubA = await db.rpc<string>(w.u.org, 'swim_save_club', { p_league: lid, p_name: 'Delfines', p_short: 'DEL', p_coach: w.u.luis });
  const clubB = await db.rpc<string>(w.u.sofi, 'swim_save_club', { p_league: lid, p_name: 'Tiburones', p_color: '#0055ff' });
  return { lid, pLuis, clubA, clubB };
}

async function meet(s: Swim, extra: Record<string, unknown> = {}): Promise<string> {
  return db.rpc<string>(w.u.org, 'swim_create_meet', { p_league: s.lid, p_date: `${THIS_YEAR}-10-10`, p_name: 'Copa Delfín', ...extra });
}

async function kid(s: Swim, name: string, age: number, sex: 'F' | 'M', club: string | null, who = w.u.org): Promise<string> {
  return db.rpc<string>(who, 'swim_register_swimmer', {
    p_league: s.lid,
    p_name: name,
    p_club: club,
    p_is_minor: true,
    p_birth_year: born(age),
    p_sex: sex,
    p_consent: true,
    p_guardian_name: 'Mamá',
  });
}

describe('solo en ligas de natación', () => {
  it('encuentros y clubes no existen en otras ligas; los eventos son encuentro, control o torneo', async () => {
    await fails(db.rpc(w.u.org, 'swim_create_meet', { p_league: w.priv, p_date: '2026-10-10' }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_save_club', { p_league: w.priv, p_name: 'X' }), INVALID);
    await fails(db.admin(`insert into public.swim_clubs (league_id, name) values ($1, 'X')`, [w.priv]), INVALID);
    const s = await swimLeague();
    await fails(db.rpc(w.u.org, 'create_event', { p_league: s.lid, p_type: 'practica', p_date: '2026-10-10' }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_create_meet', { p_league: s.lid, p_date: '2026-10-10', p_type: 'torneo' }), INVALID);
    // Un evento creado por la RPC general también trae su configuración, con las reglas de la liga.
    await db.admin(`update public.leagues set rules = $2 where id = $1`, [s.lid, { pool: 50, lanes: 8, points: [9, 7, 6, 5, 4, 3, 2, 1], ageGroups: 'masters' }]);
    const e = await db.rpc<string>(w.u.org, 'create_event', { p_league: s.lid, p_type: 'control', p_date: '2026-10-10' });
    expect(await db.admin('select pool, lanes, points, age_groups from public.swim_meets where event_id = $1', [e])).toEqual([
      { pool: 50, lanes: 8, points: [9, 7, 6, 5, 4, 3, 2, 1], age_groups: 'masters' },
    ]);
    // Reglas que no sirven: los valores de siempre.
    await db.admin(`update public.leagues set rules = $2 where id = $1`, [s.lid, { pool: 30, lanes: 'x', points: [] }]);
    const e2 = await meet(s);
    expect(await db.admin('select pool, lanes, points, age_groups from public.swim_meets where event_id = $1', [e2])).toEqual([
      { pool: 25, lanes: 6, points: [6, 4, 3, 2, 1], age_groups: 'cccan' },
    ]);
  });
});

describe('encuentro y pruebas', () => {
  it('solo el admin crea el encuentro y sus pruebas; pruebas que no existen no entran', async () => {
    const s = await swimLeague();
    await fails(db.rpc(w.u.luis, 'swim_create_meet', { p_league: s.lid, p_date: '2026-10-10' }), DENIED);
    await fails(db.rpc(ANON, 'swim_create_meet', { p_league: s.lid, p_date: '2026-10-10' }), DENIED);
    await fails(db.rpc(w.u.org, 'swim_create_meet', { p_league: s.lid, p_date: '2026-10-10', p_pool: 30 }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_create_meet', { p_league: s.lid, p_date: '2026-10-10', p_points: [] }), INVALID);
    const m = await meet(s, { p_lanes: 8, p_points: [9, 7, 6, 5, 4, 3, 2, 1] });
    expect(await db.admin('select type, name from public.events where id = $1', [m])).toEqual([{ type: 'encuentro', name: 'Copa Delfín' }]);

    const ids = await db.rpc<string[]>(w.u.sofi, 'swim_save_events', {
      p_meet: m,
      p_events: [
        { distance: 50, stroke: 'libre', gender: 'F', age_groups: ['9-10', '11-12'] },
        { distance: 100, stroke: 'combinado', gender: 'X', age_groups: [] },
        { distance: 200, stroke: 'espalda', gender: 'M', age_groups: ['13-14'] },
      ],
    });
    expect(ids).toHaveLength(3);
    expect(await db.admin('select num, distance, stroke, pool, gender, age_groups from public.swim_events where event_id = $1 order by num', [m])).toEqual([
      { num: 1, distance: 50, stroke: 'libre', pool: 25, gender: 'F', age_groups: ['9-10', '11-12'] },
      { num: 2, distance: 100, stroke: 'combinado', pool: 25, gender: 'X', age_groups: [] },
      { num: 3, distance: 200, stroke: 'espalda', pool: 25, gender: 'M', age_groups: ['13-14'] },
    ]);
    await fails(db.rpc(w.u.luis, 'swim_save_events', { p_meet: m, p_events: [{ distance: 50, stroke: 'libre', gender: 'F' }] }), DENIED);
    const bad = [
      { distance: 300, stroke: 'libre', gender: 'F' },
      { distance: 400, stroke: 'espalda', gender: 'F' },
      { distance: 50, stroke: 'crol', gender: 'F' },
      { distance: 50, stroke: 'libre', gender: 'Z' },
      { distance: 50, stroke: 'libre', gender: 'F', age_groups: ['19-20'] },
      { distance: 50, stroke: 'libre', gender: 'F', age_groups: ['m25-29'] },
      { distance: 50, stroke: 'libre', gender: 'F', age_groups: ['9-10', '9-10'] },
      { distance: 50, stroke: 'libre', gender: 'F', extra: 1 },
    ];
    for (const ev of bad) await fails(db.rpc(w.u.org, 'swim_save_events', { p_meet: m, p_events: [ev] }), INVALID);
    // Número repetido en el programa.
    await fails(db.rpc(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ num: 1, distance: 50, stroke: 'pecho', gender: 'F' }] }), ['23505']);
    // Intercambiar dos números en la misma llamada sí.
    await db.rpc(w.u.org, 'swim_save_events', {
      p_meet: m,
      p_events: [
        { id: ids[0], num: 2, distance: 50, stroke: 'libre', gender: 'F', age_groups: ['9-10', '11-12'] },
        { id: ids[1], num: 1, distance: 100, stroke: 'combinado', gender: 'X' },
      ],
    });
    expect((await db.admin<{ id: string }>('select id from public.swim_events where event_id = $1 order by num', [m])).map((r) => r.id)).toEqual([
      ids[1],
      ids[0],
      ids[2],
    ]);
    // Una prueba de otro encuentro no se toca desde este.
    const m2 = await meet(s);
    await fails(db.rpc(w.u.org, 'swim_save_events', { p_meet: m2, p_events: [{ id: ids[0], distance: 50, stroke: 'libre', gender: 'F' }] }), 'no_existe');
  });

  it('piscina de 50: sin 25 m ni 100 combinado; con tiempos ya no cambia la piscina', async () => {
    const s = await swimLeague();
    const m = await meet(s, { p_pool: 50 });
    await fails(db.rpc(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 25, stroke: 'libre', gender: 'F' }] }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 100, stroke: 'combinado', gender: 'F' }] }), INVALID);
    const [ev] = await db.rpc<string[]>(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 1500, stroke: 'libre', gender: 'X' }] });
    // Cambiar a 25 m arrastra las pruebas.
    await db.rpc(w.u.org, 'swim_update_meet', { p_meet: m, p_patch: { pool: 25 } });
    expect(await db.admin('select pool from public.swim_events where id = $1', [ev])).toEqual([{ pool: 25 }]);
    await fails(db.rpc(w.u.org, 'swim_update_meet', { p_meet: m, p_patch: { color: 'x' } }), INVALID);
    await fails(db.rpc(w.u.luis, 'swim_update_meet', { p_meet: m, p_patch: { lanes: 8 } }), DENIED);
    const p = await kid(s, 'Ana', 12, 'F', s.clubA);
    await db.rpc(w.u.org, 'swim_enter', { p_swim_event: ev, p_entries: [{ player_id: p, seed_cs: null }] });
    const [en] = await db.admin<{ id: string }>('select id from public.swim_entries where swim_event_id = $1', [ev]);
    await db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes: [{ entry_id: en.id, heat: 1, lane: 6 }] }] });
    await fails(db.rpc(w.u.org, 'swim_update_meet', { p_meet: m, p_patch: { lanes: 4 } }), INVALID);
    await db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: [{ entry_id: en.id, time_cs: 120000, status: 'ok' }] });
    await fails(db.rpc(w.u.org, 'swim_update_meet', { p_meet: m, p_patch: { pool: 50 } }), INVALID);
    // Con tiempos, la prueba tampoco cambia de distancia ni de estilo.
    await fails(db.rpc(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ id: ev, distance: 800, stroke: 'libre', gender: 'X' }] }), INVALID);
  });

  it('cambiar el esquema de categorías recalcula las de los inscritos', async () => {
    const s = await swimLeague({ minors: false });
    const m = await meet(s);
    const [ev] = await db.rpc<string[]>(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 50, stroke: 'libre', gender: 'X' }] });
    const adult = await db.rpc<string>(w.u.org, 'swim_register_swimmer', { p_league: s.lid, p_name: 'Máster', p_birth_year: 1980, p_sex: 'M' });
    await db.rpc(w.u.org, 'swim_enter', { p_swim_event: ev, p_entries: [{ player_id: adult, seed_cs: 3200 }] });
    expect(await db.admin('select age_group from public.swim_entries where player_id = $1', [adult])).toEqual([{ age_group: '18+' }]);
    await db.rpc(w.u.org, 'swim_update_meet', { p_meet: m, p_patch: { age_groups: 'masters' } });
    const age = THIS_YEAR - 1980;
    expect(await db.admin('select age_group from public.swim_entries where player_id = $1', [adult])).toEqual([
      { age_group: ageGroupOf(age, mastersAgeGroups())?.id ?? null },
    ]);
    // Una prueba con categorías de otro esquema impide cambiarlo.
    await db.rpc(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 100, stroke: 'libre', gender: 'X', age_groups: ['m40-44'] }] });
    await fails(db.rpc(w.u.org, 'swim_update_meet', { p_meet: m, p_patch: { age_groups: 'cccan' } }), INVALID);
  });
});

describe('nadadores menores', () => {
  it('sin cuenta, con consentimiento, año y sexo; solo en ligas con menores', async () => {
    const adults = await swimLeague({ minors: false });
    await fails(kid(adults, 'Nene', 10, 'M', adults.clubA), INVALID);
    const s = await swimLeague();
    const base = { p_league: s.lid, p_name: 'Nene', p_club: s.clubA, p_is_minor: true, p_birth_year: born(10), p_sex: 'M' };
    await fails(db.rpc(w.u.org, 'swim_register_swimmer', { ...base, p_consent: false }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_register_swimmer', { ...base, p_consent: true, p_birth_year: null }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_register_swimmer', { ...base, p_consent: true, p_sex: null }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_register_swimmer', { ...base, p_consent: true, p_sex: 'Z' }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_register_swimmer', { ...base, p_consent: true, p_birth_year: THIS_YEAR + 1 }), INVALID);
    const p = await kid(s, 'Nene', 11, 'M', s.clubA);
    expect(await db.admin('select is_minor, user_id from public.players where id = $1', [p])).toEqual([{ is_minor: true, user_id: null }]);
    expect(
      await db.admin('select birth_year, sex, guardian_name, consent_by, consent_at is not null as consent from public.player_private where player_id = $1', [p]),
    ).toEqual([{ birth_year: born(11), sex: 'M', guardian_name: 'Mamá', consent_by: w.u.org, consent: true }]);
    // En público, solo la categoría ya calculada.
    expect(await db.asUser(w.u.luis, 'select club_id, category, category_year from public.swim_swimmers where player_id = $1', [p])).toEqual([
      { club_id: s.clubA, category: '11-12', category_year: THIS_YEAR },
    ]);
    // Nadie reclama ni vincula a un menor.
    await db.admin(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'member', 'nuevo')`, [s.lid, w.u.nuevo]);
    await fails(db.rpc(w.u.nuevo, 'claim_player', { p_player: p }), INVALID);
    await fails(db.rpc(w.u.org, 'link_account_to_player', { p_player: p, p_user: w.u.nuevo }), INVALID);
    // Un menor no se queda sin año, sexo ni consentimiento.
    await fails(db.rpc(w.u.org, 'swim_update_swimmer', { p_player: p, p_patch: { birth_year: null } }), INVALID);
    await db.rpc(w.u.org, 'swim_update_swimmer', { p_player: p, p_patch: { birth_year: born(13), club_id: s.clubB, name: 'Nené' } });
    expect(await db.admin('select s.club_id, s.category, p.name from public.swim_swimmers s join public.players p on p.id = s.player_id where s.player_id = $1', [p])).toEqual([
      { club_id: s.clubB, category: '13-14', name: 'Nené' },
    ]);
    await fails(db.rpc(w.u.luis, 'swim_update_swimmer', { p_player: p, p_patch: { name: 'X' } }), DENIED);
    await fails(db.rpc(w.u.org, 'swim_update_swimmer', { p_player: p, p_patch: { is_minor: false } }), INVALID);
  });

  it('el año de nacimiento y el sexo no se ven fuera de los admins (ni en una liga pública de adultos)', async () => {
    const s = await swimLeague();
    const p = await kid(s, 'Nena', 9, 'F', s.clubA);
    expect(await db.asUser(w.u.org, 'select birth_year from public.player_private where player_id = $1', [p])).toHaveLength(1);
    expect(await db.asUser(w.u.luis, 'select birth_year from public.player_private where player_id = $1', [p])).toHaveLength(0);
    expect(await db.asUser(w.u.ana, 'select birth_year from public.player_private where player_id = $1', [p])).toHaveLength(0);
    await fails(db.asAnon('select birth_year from public.player_private'), DENIED);
    // Liga con menores: privada, así que alguien de fuera ni siquiera ve a los nadadores.
    expect(await db.asUser(w.u.extra, 'select player_id from public.swim_swimmers where league_id = $1', [s.lid])).toHaveLength(0);
    // Liga pública de adultos: se ven la categoría y el club, nunca el año ni el sexo.
    const pub = await swimLeague({ minors: false, visibility: 'public' });
    const a = await db.rpc<string>(w.u.org, 'swim_register_swimmer', { p_league: pub.lid, p_name: 'Adulta', p_birth_year: 1990, p_sex: 'F', p_club: pub.clubA });
    expect(await db.asAnon('select category from public.swim_swimmers where player_id = $1', [a])).toEqual([{ category: '18+' }]);
    expect(await db.asUser(w.u.extra, 'select player_id from public.player_private where player_id = $1', [a])).toHaveLength(0);
    const cols = await db.admin<{ column_name: string }>(
      `select column_name from information_schema.columns where table_schema = 'public' and table_name like 'swim\\_%' and column_name in ('birth_year', 'sex', 'guardian_name')`,
    );
    expect(cols).toEqual([]);
  });

  it('el entrenador registra e inscribe solo a los de su club (y no lee los datos privados)', async () => {
    const s = await swimLeague();
    const mine = await kid(s, 'Pez', 10, 'M', s.clubA, w.u.luis);
    await fails(kid(s, 'Ajeno', 10, 'M', s.clubB, w.u.luis), DENIED);
    await fails(kid(s, 'Sin club', 10, 'M', null, w.u.luis), DENIED);
    await fails(kid(s, 'X', 10, 'M', s.clubA, w.u.ana), DENIED);
    expect(await db.admin('select consent_by from public.player_private where player_id = $1', [mine])).toEqual([{ consent_by: w.u.luis }]);
    expect(await db.asUser(w.u.luis, 'select birth_year from public.player_private where player_id = $1', [mine])).toHaveLength(0);
    const other = await kid(s, 'Tiburoncito', 10, 'M', s.clubB);
    const m = await meet(s);
    const [ev] = await db.rpc<string[]>(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 50, stroke: 'libre', gender: 'M', age_groups: ['9-10'] }] });
    expect(await db.rpc(w.u.luis, 'swim_enter', { p_swim_event: ev, p_entries: [{ player_id: mine, seed_cs: 4512 }] })).toBe(1);
    await fails(db.rpc(w.u.luis, 'swim_enter', { p_swim_event: ev, p_entries: [{ player_id: other, seed_cs: null }] }), DENIED);
    await fails(db.rpc(w.u.ana, 'swim_enter', { p_swim_event: ev, p_entries: [{ player_id: mine, seed_cs: null }] }), DENIED);
    const [en] = await db.admin<{ id: string }>('select id from public.swim_entries where player_id = $1', [mine]);
    await fails(db.rpc(w.u.ana, 'swim_unenter', { p_entry: en.id }), DENIED);
    expect(await db.rpc(w.u.luis, 'swim_unenter', { p_entry: en.id })).toBe(true);
    expect(await db.rpc(w.u.luis, 'swim_unenter', { p_entry: en.id })).toBe(false);
    // Solo el admin maneja clubes.
    await fails(db.rpc(w.u.luis, 'swim_save_club', { p_league: s.lid, p_name: 'Mío' }), DENIED);
    await fails(db.rpc(w.u.luis, 'swim_delete_club', { p_club: s.clubB }), DENIED);
    // El entrenador tiene que ser miembro de la liga.
    await fails(db.rpc(w.u.org, 'swim_save_club', { p_league: s.lid, p_name: 'Otro', p_coach: w.u.extra }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_save_club', { p_league: s.lid, p_name: 'delfines' }), ['23505']);
  });
});

describe('inscripciones', () => {
  it('el sexo y la categoría tienen que ser los de la prueba; la siembra se puede cambiar', async () => {
    const s = await swimLeague();
    const m = await meet(s);
    const [girls, open, mixed] = await db.rpc<string[]>(w.u.org, 'swim_save_events', {
      p_meet: m,
      p_events: [
        { distance: 50, stroke: 'libre', gender: 'F', age_groups: ['11-12'] },
        { distance: 100, stroke: 'libre', gender: 'X' },
        { distance: 50, stroke: 'pecho', gender: 'X', age_groups: ['9-10'] },
      ],
    });
    const nena = await kid(s, 'Nena', 12, 'F', s.clubA);
    const nene = await kid(s, 'Nene', 12, 'M', s.clubB);
    const chica = await kid(s, 'Chica', 9, 'F', s.clubB);
    await fails(db.rpc(w.u.org, 'swim_enter', { p_swim_event: girls, p_entries: [{ player_id: nene, seed_cs: null }] }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_enter', { p_swim_event: girls, p_entries: [{ player_id: chica, seed_cs: null }] }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_enter', { p_swim_event: girls, p_entries: [{ player_id: nena, seed_cs: 12.5 }] }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_enter', { p_swim_event: girls, p_entries: [{ player_id: nena, seed_cs: '3000' }] }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_enter', { p_swim_event: girls, p_entries: [{ player_id: nena, seed_cs: 600000 }] }), INVALID);
    await fails(db.rpc(w.u.org, 'swim_enter', { p_swim_event: girls, p_entries: [{ player_id: w.p.pedro, seed_cs: null }] }), 'no_existe');
    expect(await db.rpc(w.u.org, 'swim_enter', { p_swim_event: girls, p_entries: [{ player_id: nena, seed_cs: 3650 }] })).toBe(1);
    expect(await db.rpc(w.u.org, 'swim_enter', { p_swim_event: mixed, p_entries: [{ player_id: chica, seed_cs: null }] })).toBe(1);
    expect(await db.rpc(w.u.org, 'swim_enter', { p_swim_event: open, p_entries: [{ player_id: nena }, { player_id: nene, seed_cs: 7000 }] })).toBe(2);
    expect(await db.admin('select club_id, age_group, seed_cs from public.swim_entries where swim_event_id = $1', [girls])).toEqual([
      { club_id: s.clubA, age_group: '11-12', seed_cs: 3650 },
    ]);
    // Volver a inscribir cambia la siembra (no duplica).
    expect(await db.rpc(w.u.org, 'swim_enter', { p_swim_event: girls, p_entries: [{ player_id: nena, seed_cs: 3599 }] })).toBe(1);
    expect(await db.count('public.swim_entries', 'swim_event_id = $1', [girls])).toBe(1);
    // El adulto con cuenta se inscribe solo, en pruebas abiertas (sin año no tiene categoría).
    expect(await db.rpc(w.u.luis, 'swim_enter', { p_swim_event: open, p_entries: [{ player_id: s.pLuis, seed_cs: 6400 }] })).toBe(1);
    await fails(db.rpc(w.u.luis, 'swim_enter', { p_swim_event: mixed, p_entries: [{ player_id: s.pLuis, seed_cs: null }] }), INVALID);
    // luis entrena a Delfines: a los de Tiburones no los inscribe.
    await fails(db.rpc(w.u.luis, 'swim_enter', { p_swim_event: open, p_entries: [{ player_id: chica, seed_cs: null }] }), DENIED);
    await fails(db.rpc(w.u.extra, 'swim_enter', { p_swim_event: open, p_entries: [{ player_id: s.pLuis, seed_cs: null }] }), DENIED);
    await fails(db.rpc(ANON, 'swim_enter', { p_swim_event: open, p_entries: [{ player_id: s.pLuis, seed_cs: null }] }), DENIED);
  });
});

describe('hoja de series y resultados', () => {
  async function heatSheet() {
    const s = await swimLeague();
    const m = await meet(s, { p_lanes: 4 });
    const [ev, ev2] = await db.rpc<string[]>(w.u.org, 'swim_save_events', {
      p_meet: m,
      p_events: [
        { distance: 50, stroke: 'libre', gender: 'X' },
        { distance: 100, stroke: 'libre', gender: 'X' },
      ],
    });
    const kids = [];
    for (let k = 0; k < 6; k++) kids.push(await kid(s, `Nadador ${k + 1}`, 10 + (k % 3), k % 2 ? 'M' : 'F', k % 2 ? s.clubA : s.clubB));
    await db.rpc(w.u.org, 'swim_enter', {
      p_swim_event: ev,
      p_entries: kids.map((p, k) => ({ player_id: p, seed_cs: k === 5 ? null : 3000 + k * 100 })),
    });
    await db.rpc(w.u.org, 'swim_enter', { p_swim_event: ev2, p_entries: [{ player_id: kids[0], seed_cs: null }] });
    const entries = await db.admin<{ id: string; seed_cs: number | null }>('select id, seed_cs from public.swim_entries where swim_event_id = $1 order by created_at, id', [ev]);
    // La hoja la arma el teléfono con el motor.
    const heats = seedHeats(entries.map((e) => ({ id: e.id, seed: e.seed_cs })), { lanes: 4 });
    const lanes = heats.flatMap((h) => h.lanes.map((l) => ({ entry_id: l.entryId, heat: h.n, lane: l.lane })));
    return { s, m, ev, ev2, kids, entries, heats, lanes };
  }

  it('publicar la hoja: solo el admin, carriles de la piscina, sin repetir', async () => {
    const { s, m, ev, ev2, lanes, heats } = await heatSheet();
    expect(heats.map((h) => h.lanes.length)).toEqual([3, 3]);
    await fails(db.rpc(w.u.luis, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes }] }), DENIED);
    await fails(db.rpc(w.u.ana, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes }] }), DENIED);
    await fails(db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes: [{ ...lanes[0], lane: 5 }] }] }), INVALID);
    await fails(
      db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes: [lanes[0], { ...lanes[1], heat: lanes[0].heat, lane: lanes[0].lane }] }] }),
      INVALID,
    );
    await fails(db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev2, lanes: [lanes[0]] }] }), INVALID);
    const other = await meet(s);
    await fails(db.rpc(w.u.org, 'swim_publish_heats', { p_meet: other, p_heats: [{ swim_event_id: ev, lanes }] }), 'no_existe');
    expect(await db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes }] })).toBe(6);
    expect(await db.admin('select heats_published_at is not null as published from public.swim_meets where event_id = $1', [m])).toEqual([{ published: true }]);
    // El más rápido (3000) va en la última serie, carril del centro.
    const fastest = await db.admin<{ heat: number; lane: number }>('select heat, lane from public.swim_entries where swim_event_id = $1 and seed_cs = 3000', [ev]);
    expect(fastest).toEqual([{ heat: 2, lane: 2 }]);
    // Volver a publicar la misma prueba (p. ej. con un carril movido) sirve mientras no tenga tiempos.
    // (4 carriles, 3 por serie: el carril 4 queda libre en las dos.)
    expect(lanes.some((l) => l.lane === 4)).toBe(false);
    const moved = lanes.map((l, k) => (k === 0 ? { ...l, lane: 4 } : l));
    expect(await db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes: moved }] })).toBe(6);
    expect(await db.admin('select lane from public.swim_entries where id = $1', [lanes[0].entry_id])).toEqual([{ lane: 4 }]);
  });

  it('resultados por serie: cronometrista o admin, una vez por op_id, solo carriles de esa serie', async () => {
    const { m, ev, lanes, entries } = await heatSheet();
    await db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes }] });
    const heat1 = lanes.filter((l) => l.heat === 1);
    const heat2 = lanes.filter((l) => l.heat === 2);
    const results = heat1.map((l, k) => ({ entry_id: l.entry_id, time_cs: 3500 + k * 50, status: 'ok' }));
    await fails(db.rpc(w.u.luis, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: results }), DENIED);
    await fails(db.rpc(ANON, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: results }), DENIED);
    await fails(db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: 2, p_results: results }), INVALID);
    await fails(db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: [{ ...results[0], status: 'dns' }] }), INVALID);
    await fails(db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: [{ ...results[0], status: 'tarde' }] }), INVALID);
    await fails(db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: [{ ...results[0], time_cs: 0 }] }), INVALID);
    const op = randomUUID();
    expect(await db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: results, p_op_id: op })).toBe(3);
    // El mismo op_id otra vez (se perdió la respuesta): devuelve lo mismo y no vuelve a escribir.
    const again = results.map((r) => ({ ...r, time_cs: 9999 }));
    expect(await db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: again, p_op_id: op })).toBe(3);
    expect((await db.admin<{ time_cs: number }>('select time_cs from public.swim_entries where swim_event_id = $1 and heat = 1 order by time_cs', [ev])).map((r) => r.time_cs)).toEqual([
      3500, 3550, 3600,
    ]);
    // El op_id de otra cuenta no sirve.
    await fails(db.rpc(w.u.org, 'swim_record_heat', { p_swim_event: ev, p_heat: 1, p_results: results, p_op_id: op }), 'duplicado');
    // DQ con tiempo, DNS sin tiempo; ok sin tiempo borra el resultado de ese carril.
    await db.rpc(w.u.org, 'swim_record_heat', {
      p_swim_event: ev,
      p_heat: 2,
      p_results: [
        { entry_id: heat2[0].entry_id, time_cs: 3100, status: 'dq' },
        { entry_id: heat2[1].entry_id, time_cs: null, status: 'dns' },
        { entry_id: heat2[2].entry_id, time_cs: 3000, status: 'ok' },
      ],
    });
    await db.rpc(w.u.org, 'swim_record_heat', { p_swim_event: ev, p_heat: 2, p_results: [{ entry_id: heat2[2].entry_id, time_cs: null, status: 'ok' }] });
    expect(await db.admin('select time_cs, status, result_at from public.swim_entries where id = $1', [heat2[2].entry_id])).toEqual([
      { time_cs: null, status: 'ok', result_at: null },
    ]);
    expect(await db.admin('select status, time_cs, recorded_by from public.swim_entries where id = $1', [heat2[0].entry_id])).toEqual([
      { status: 'dq', time_cs: 3100, recorded_by: w.u.org },
    ]);
    // Con tiempos ya no se vuelve a armar la prueba, ni se saca a quien nadó.
    await fails(db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes }] }), 'cerrado');
    await fails(db.rpc(w.u.org, 'swim_unenter', { p_entry: heat1[0].entry_id }), INVALID);
    // Ni se cambia su siembra (volver a inscribirlo no toca nada).
    const pid = (await db.admin<{ player_id: string }>('select player_id from public.swim_entries where id = $1', [heat1[0].entry_id]))[0].player_id;
    expect(await db.rpc(w.u.org, 'swim_enter', { p_swim_event: ev, p_entries: [{ player_id: pid, seed_cs: 1234 }] })).toBe(0);
    expect(entries.find((e) => e.id === heat1[0].entry_id)?.seed_cs).toEqual(
      (await db.admin<{ seed_cs: number | null }>('select seed_cs from public.swim_entries where id = $1', [heat1[0].entry_id]))[0].seed_cs,
    );
  });

  it('encuentro cerrado: nada cambia hasta volver a abrirlo', async () => {
    const { m, ev, ev2, lanes, kids } = await heatSheet();
    await db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes }] });
    await fails(db.rpc(w.u.luis, 'swim_finalize_meet', { p_meet: m }), DENIED);
    await db.rpc(w.u.sofi, 'swim_finalize_meet', { p_meet: m });
    const r = [{ entry_id: lanes[0].entry_id, time_cs: 3300, status: 'ok' }];
    await fails(db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: lanes[0].heat, p_results: r }), 'cerrado');
    await fails(db.rpc(w.u.org, 'swim_enter', { p_swim_event: ev2, p_entries: [{ player_id: kids[1], seed_cs: null }] }), 'cerrado');
    await fails(db.rpc(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 50, stroke: 'pecho', gender: 'X' }] }), 'cerrado');
    await fails(db.rpc(w.u.org, 'swim_delete_event', { p_swim_event: ev2 }), 'cerrado');
    await fails(db.rpc(w.u.org, 'swim_publish_heats', { p_meet: m, p_heats: [{ swim_event_id: ev, lanes }] }), 'cerrado');
    await fails(db.rpc(w.u.org, 'swim_update_meet', { p_meet: m, p_patch: { lanes: 8 } }), 'cerrado');
    await db.rpc(w.u.org, 'swim_finalize_meet', { p_meet: m, p_final: false });
    expect(await db.rpc(w.u.ana, 'swim_record_heat', { p_swim_event: ev, p_heat: lanes[0].heat, p_results: r })).toBe(1);
  });
});

describe('league_id verificado y borrados', () => {
  it('nadie mete la liga de otro en una prueba o una inscripción', async () => {
    const s = await swimLeague();
    const s2 = await swimLeague({ minors: false });
    const m = await meet(s);
    const [ev] = await db.rpc<string[]>(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 50, stroke: 'libre', gender: 'X' }] });
    const p = await kid(s, 'Nena', 10, 'F', s.clubA);
    await fails(
      db.admin(`insert into public.swim_events (league_id, event_id, num, distance, stroke, pool, gender) values ($1, $2, 9, 50, 'libre', 25, 'X')`, [s2.lid, m]),
      '23503',
    );
    await fails(db.admin(`insert into public.swim_entries (league_id, event_id, swim_event_id, player_id) values ($1, $2, $3, $4)`, [s2.lid, m, ev, p]), '23503');
    await fails(db.admin(`insert into public.swim_swimmers (player_id, league_id) values ($1, $2)`, [p, s2.lid]), ['23503', '23505']);
    // Un nadador de otra liga no entra.
    const p2 = await db.rpc<string>(w.u.org, 'swim_register_swimmer', { p_league: s2.lid, p_name: 'Adulto', p_birth_year: 1990, p_sex: 'M' });
    await fails(db.rpc(w.u.org, 'swim_enter', { p_swim_event: ev, p_entries: [{ player_id: p2, seed_cs: null }] }), 'no_existe');
    // Club de otra liga.
    await fails(db.rpc(w.u.org, 'swim_update_swimmer', { p_player: p, p_patch: { club_id: s2.clubA } }), INVALID);
  });

  it('borrar el encuentro o al nadador se lleva lo suyo y deja tombstones', async () => {
    const s = await swimLeague();
    const m = await meet(s);
    const [ev] = await db.rpc<string[]>(w.u.org, 'swim_save_events', { p_meet: m, p_events: [{ distance: 50, stroke: 'libre', gender: 'X' }] });
    const p = await kid(s, 'Nena', 10, 'F', s.clubA);
    const q = await kid(s, 'Nene', 10, 'M', s.clubA);
    await db.rpc(w.u.org, 'swim_enter', { p_swim_event: ev, p_entries: [{ player_id: p }, { player_id: q }] });
    await db.rpc(w.u.org, 'delete_player', { p_player: q });
    expect(await db.count('public.swim_entries', 'player_id = $1', [q])).toBe(0);
    expect(await db.count('public.swim_swimmers', 'player_id = $1', [q])).toBe(0);
    expect(await db.count('public.tombstones', `tbl = 'swim_swimmers' and row_key = $1`, [q])).toBe(1);
    await db.rpc(w.u.org, 'delete_event', { p_event: m });
    expect(await db.count('public.swim_meets', 'event_id = $1', [m])).toBe(0);
    expect(await db.count('public.swim_events', 'id = $1', [ev])).toBe(0);
    expect(await db.count('public.swim_entries', 'event_id = $1', [m])).toBe(0);
    expect(await db.count('public.tombstones', `tbl = 'swim_meets' and row_key = $1`, [m])).toBe(1);
    expect(await db.count('public.tombstones', `tbl = 'swim_events' and row_key = $1`, [ev])).toBe(1);
    // Borrar el club deja a sus nadadores sin club.
    await db.rpc(w.u.org, 'swim_delete_club', { p_club: s.clubA });
    expect(await db.admin('select club_id from public.swim_swimmers where player_id = $1', [p])).toEqual([{ club_id: null }]);
  });
});

describe('la base calcula igual que el motor', () => {
  it('categorías por edad (CCCAN y másters)', async () => {
    const ages = Array.from({ length: 106 }, (_, k) => k);
    for (const [scheme, groups] of [
      ['cccan', CCCAN_AGE_GROUPS],
      ['masters', mastersAgeGroups()],
    ] as const) {
      const rows = await db.admin<{ age: number; g: string | null }>(
        'select a as age, private.swim_age_group(a, $1) as g from unnest($2::int[]) a order by a',
        [scheme, ages],
      );
      expect(rows.map((r) => r.g)).toEqual(ages.map((a) => ageGroupOf(a, groups)?.id ?? null));
      const ids = await db.admin<{ ids: string[] }>('select private.swim_age_group_ids($1) as ids', [scheme]);
      expect(ids[0].ids).toEqual(groups.map((g) => g.id));
    }
  });

  it('pruebas que existen en cada piscina', async () => {
    const cases: { distance: number; stroke: string; pool: PoolLength }[] = [];
    for (const distance of [...SWIM_DISTANCES, 150, 300]) for (const stroke of SWIM_STROKES) for (const pool of [25, 50] as const) cases.push({ distance, stroke, pool });
    const rows = await db.admin<{ ok: boolean }>(
      'select private.swim_event_ok(d, s, p) as ok from unnest($1::int[], $2::text[], $3::int[]) with ordinality as t (d, s, p, n) order by n',
      [cases.map((c) => c.distance), cases.map((c) => c.stroke), cases.map((c) => c.pool)],
    );
    expect(rows.map((r) => r.ok)).toEqual(cases.map((c) => validateSwimEvent(c as Parameters<typeof validateSwimEvent>[0]).length === 0));
  });
});

describe('permisos de lo de natación', () => {
  it('RLS en todas, nada de escritura directa, RPC solo con sesión y search_path vacío', async () => {
    const noRls = await db.admin(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'swim\\_%' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(noRls).toEqual([]);
    const tables = await db.admin<{ t: string }>(`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'swim\\_%' and c.relkind = 'r' order by 1`);
    expect(tables.map((r) => r.t)).toEqual(['swim_clubs', 'swim_entries', 'swim_events', 'swim_meets', 'swim_swimmers']);
    for (const { t } of tables) {
      for (const who of [ANON, w.u.luis, w.u.dios]) {
        await fails(db.as(who, `insert into public.${t} default values`), '42501');
        await fails(db.as(who, `update public.${t} set updated_at = now()`), '42501');
        await fails(db.as(who, `delete from public.${t}`), '42501');
      }
    }
    const fns = await db.admin<{ fn: string; anon: boolean; auth: boolean; sp: boolean }>(
      `select n.nspname || '.' || p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              coalesce('search_path=""' = any (p.proconfig), false) as sp
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and p.proname like 'swim\\_%' order by 1`,
    );
    expect(fns.filter((f) => f.anon)).toEqual([]);
    expect(fns.filter((f) => !f.sp)).toEqual([]);
    expect(fns.filter((f) => f.auth).map((f) => f.fn)).toEqual(
      [
        'swim_create_meet', 'swim_delete_club', 'swim_delete_event', 'swim_enter', 'swim_finalize_meet', 'swim_publish_heats',
        'swim_record_heat', 'swim_register_swimmer', 'swim_save_club', 'swim_save_events', 'swim_unenter', 'swim_update_meet',
        'swim_update_swimmer',
      ].map((f) => `public.${f}`),
    );
  });
});
