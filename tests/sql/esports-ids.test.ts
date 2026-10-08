/**
 * Esports, los IDs de juego (20261008000100_esports.sql, docs/esports.md §6 y §9.5): la normalización
 * (private.esp_normalize_id, los mismos casos que gameIds.test.ts), la verificación de cada juego (private.esp_verify_kind
 * y private.esp_rank_verifiable, la tabla de catalog.ts), guardar (declarado y no exclusivo), la búsqueda de Riot
 * (esports-verify, solo service_role: vale 15 minutos y solo la propia; comprueba sin ser exclusiva y solo en LoL trae el
 * rango verificado), conectar la cuenta (esports-auth: el state de un uso; el login es lo único exclusivo y se lleva el
 * ID de la cuenta que lo tenía conectado, con el aviso de esports_id_moves, push y auditoría), los rangos (la escalera
 * de ranks.ts), cambiar o borrar el ID, lo que pide un torneo según el juego (sin_id, id_sin_comprobar, sin_rango), los
 * equipos con un ID declarado, quién lee qué y «Descargar mis datos». Cada prueba en su transacción.
 *
 * Mundo: el de fixture.ts más cuatro cuentas p1…p4 sin liga.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, SERVICE, TestDb, fails } from './harness';
import { makeWorld, type World } from './fixture';

let db: TestDb;
let w: World;
let p: string[];

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
  w = await makeWorld(db);
  p = [];
  for (let i = 1; i <= 4; i++) p.push(await db.createUser(`p${i}@x.com`, `Jugador ${i}`));
});
afterEach(async () => {
  await db.rollback();
});

type Json = Record<string, any>;

const norm = async (game: string, raw: string) =>
  (await db.admin<{ n: Json | null }>('select private.esp_normalize_id($1, $2) as n', [game, raw]))[0].n;
const save = (uid: string, game: string, id: string, platform = '', region = '') =>
  db.rpc<Json>(uid, 'esports_save_game_id', { p_game: game, p_id: id, p_platform: platform, p_region: region });
const confirm = (uid: string, game: string, lookup: string | null, platform = '') =>
  db.rpc<Json>(uid, 'esports_confirm_game_id', { p_game: game, p_platform: platform, p_lookup: lookup });
const setRanks = (uid: string, game: string, ranks: Json, platform = '') =>
  db.rpc(uid, 'esports_set_ranks', { p_game: game, p_platform: platform, p_ranks: ranks });
const row = async (uid: string, game: string, platform = '') =>
  (await db.admin<Json>('select * from public.esports_game_ids where user_id = $1 and game = $2 and platform = $3', [uid, game, platform]))[0];
/** Lo que guarda esports-verify después de buscar (solo service_role). */
const store = (user: string, game: string, id: string, o: { found?: boolean; ranks?: Json; external?: string | null; display?: string } = {}) =>
  db.rpc<string>(SERVICE, 'esports_store_lookup', {
    p_user: user, p_game: game, p_platform: '', p_id: id, p_found: o.found ?? true, p_display: o.display ?? 'Faker',
    p_external: o.external === undefined ? 'puuid-1' : o.external, p_ranks: o.ranks ?? {}, p_provider: 'riot',
  });
/** La vuelta de «Conectar con…» (esports-auth, solo service_role). */
const link = (user: string, game: string, provider: string, external: string, display: string) =>
  db.rpc<string>(SERVICE, 'esports_link_account', { p_user: user, p_game: game, p_provider: provider, p_external_id: external, p_display: display });
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [uid, `https://fcm.googleapis.com/fcm/send/${uid}`]);
const DAY = 864e5;
const future = (days = 7) => new Date(Date.now() + days * DAY).toISOString();
/** Un torneo suelto del organizador (w.u.org). */
const tourney = (game: string, mode: string, settings: Json = {}, entry: 'teams' | 'open' = 'open') =>
  db.rpc<{ leagueId: string; eventId: string }>(w.u.org, 'esports_create_tournament', {
    p_game: game, p_name: `Copa ${game}`, p_mode: mode, p_entry_type: entry, p_format: 'single_elim', p_starts_at: future(),
    p_max_entries: 8, p_settings: settings,
  });
const solo = (uid: string, eventId: string) => db.rpc<string>(uid, 'esports_register_solo', { p_event: eventId });

describe('private.esp_normalize_id (los casos de gameIds.test.ts)', () => {
  const ok = (display: string, normalized: string) => ({ display, normalized });
  const CASES: [string, string, { display: string; normalized: string } | null][] = [
    // riot: se parte en el último #, juntar espacios, solo ASCII baja.
    ['valorant', 'Nombre#LAN', ok('Nombre#LAN', 'nombre#lan')],
    ['lol', '  Mi   Nombre#LAN1 ', ok('Mi Nombre#LAN1', 'mi nombre#lan1')],
    ['valorant', 'Ab#cd#TAG', ok('Ab#cd#TAG', 'ab#cd#tag')],
    ['valorant', 'Ñandú#LAN', ok('Ñandú#LAN', 'Ñandú#lan')],
    ['valorant', 'ÑANDÚ#LAN', ok('ÑANDÚ#LAN', 'ÑandÚ#lan')],
    ['valorant', 'Nombre', null],
    ['valorant', 'Ab#LAN', null],
    ['valorant', 'Nombre#LA', null],
    ['valorant', 'Nombre#LAN123', null],
    ['valorant', 'Nombre#LA-N', null],
    ['valorant', 'A'.repeat(17) + '#LAN', null],
    // steam: SteamID64 o código de amigo (la cuenta 1…4294967295, sin ceros adelante).
    ['cs2', '76561197960287930', ok('76561197960287930', '22202')],
    ['cs2', '22202', ok('22202', '22202')],
    ['cs2', '7656 1197 9602 87930', ok('76561197960287930', '22202')],
    ['cs2', '0022202', ok('0022202', '22202')],
    ['cs2', '4294967295', ok('4294967295', '4294967295')],
    ['cs2', '4294967296', null],
    ['cs2', '12345678901', null],
    ['cs2', '12345678901234567', null],
    ['cs2', 'abc', null],
    ['cs2', '0', null],
    // mlbb: ID y zona.
    ['mlbb', '12345678(1234)', ok('12345678 (1234)', '12345678:1234')],
    ['mlbb', '12345678 1234', ok('12345678 (1234)', '12345678:1234')],
    ['mlbb', '12345678 ( 1234 )', ok('12345678 (1234)', '12345678:1234')],
    ['mlbb', '1234 (12)', null],
    ['mlbb', '12345678 (123456)', null],
    // epic: juntar espacios, 3–16, sin #.
    ['rocket_league', 'Rocket  Man', ok('Rocket Man', 'rocket man')],
    ['fortnite', 'NinjaDR', ok('NinjaDR', 'ninjadr')],
    ['fortnite', 'ab', null],
    ['fortnite', 'Ninja#1', null],
    // ea.
    ['ea_fc', 'Pro_Player.10', ok('Pro_Player.10', 'pro_player.10')],
    ['ea_fc', 'abc', null],
    ['ea_fc', 'pro player', null],
    // console (NBA 2K; la plataforma se revisa aparte).
    ['nba_2k', 'King  James23', ok('King James23', 'king james23')],
    ['nba_2k', 'KJ', null],
    // buckler (SF6): 10 dígitos.
    ['sf6', '1234 567 890', ok('1234567890', '1234567890')],
    ['sf6', '123456789', null],
    // tekken: tres grupos de 4, con o sin guiones.
    ['tekken8', 'Ab12-cD34-eF56', ok('Ab12-cD34-eF56', 'ab12cd34ef56')],
    ['tekken8', 'Ab12cD34eF56', ok('Ab12-cD34-eF56', 'ab12cd34ef56')],
    ['tekken8', 'Ab12 cD34 eF56', ok('Ab12-cD34-eF56', 'ab12cd34ef56')],
    ['tekken8', 'Ab12-cD34-eF5', null],
    // nintendo (Smash): SW, guiones y espacios fuera.
    ['smash', 'SW-1234-5678-9012', ok('SW-1234-5678-9012', '123456789012')],
    ['smash', 'sw 1234 5678 9012', ok('SW-1234-5678-9012', '123456789012')],
    ['smash', '123456789012', ok('SW-1234-5678-9012', '123456789012')],
    ['smash', 'SW-1234-5678-901', null],
    // cr (Clash Royale): sin # y en mayúsculas.
    ['clash_royale', '#2pp', ok('#2PP', '2pp')],
    ['clash_royale', ' 2PYLQGR ', ok('#2PYLQGR', '2pylqgr')],
    ['clash_royale', '#2PA', null],
    ['clash_royale', '#2P', null],
    // digits: Free Fire 6–12, PUBG Mobile 5–12.
    ['free_fire', '123 456 789', ok('123456789', '123456789')],
    ['free_fire', '12345', null],
    ['pubg_mobile', '12345', ok('12345', '12345')],
    ['pubg_mobile', '1234567890123', null],
    // activision (Warzone): Nombre#1234567.
    ['warzone', 'Ghost  Rider#1234567', ok('Ghost Rider#1234567', 'ghost rider#1234567')],
    ['warzone', 'Gh#1234', ok('Gh#1234', 'gh#1234')],
    ['warzone', 'Ghost#123', null],
    ['warzone', 'G#1234', null],
    // vacío.
    ['valorant', '   ', null],
    ['nba_2k', '', null],
  ];

  it.each(CASES)('%s «%s»', async (game, raw, expected) => {
    expect(await norm(game, raw)).toEqual(expected);
  });

  it('lo normalizado nunca lleva A–Z y mide 2–40; la plataforma y la región son del juego', async () => {
    const samples: [string, string][] = [
      ['valorant', 'ABC DEF#XYZ'], ['cs2', '76561197960287930'], ['mlbb', '12345678 1234'], ['rocket_league', 'ROCKET'],
      ['ea_fc', 'ABCD'], ['nba_2k', 'ABC'], ['sf6', '1234567890'], ['tekken8', 'ABCD-EFGH-IJKL'], ['smash', 'SW-1234-5678-9012'],
      ['clash_royale', '#2PY'], ['free_fire', '123456'], ['warzone', 'ABC#1234'],
    ];
    for (const [g, raw] of samples) {
      const n = (await norm(g, raw))!;
      expect(n, `${g} ${raw}`).not.toBeNull();
      expect(n.normalized).not.toMatch(/[A-Z]/);
      expect(n.normalized.length).toBeGreaterThanOrEqual(2);
      expect(n.normalized.length).toBeLessThanOrEqual(40);
    }
    const r = await db.admin<Json>(
      `select private.esp_platform_ok('nba_2k', 'psn') as a, private.esp_platform_ok('nba_2k', '') as b, private.esp_platform_ok('nba_2k', 'ps5') as c,
              private.esp_platform_ok('valorant', '') as d, private.esp_platform_ok('valorant', 'psn') as e,
              private.esp_region_ok('free_fire', 'sa') as f, private.esp_region_ok('free_fire', 'us') as g, private.esp_region_ok('lol', 'la1') as h,
              private.esp_region_ok('valorant', 'la1') as i, private.esp_region_ok('cs2', '') as j`,
    );
    expect(r).toEqual([{ a: true, b: false, c: false, d: true, e: false, f: true, g: false, h: true, i: false, j: true }]);
  });
});

describe('la verificación de cada juego (la tabla de catalog.ts)', () => {
  // [juego, verify.kind, verify.rank]
  const TABLE: [string, string, boolean][] = [
    ['valorant', 'lookup', false], ['cs2', 'login', false], ['lol', 'lookup', true], ['mlbb', 'none', false],
    ['rocket_league', 'login', false], ['ea_fc', 'none', false], ['nba_2k', 'none', false], ['sf6', 'none', false],
    ['tekken8', 'none', false], ['smash', 'none', false], ['clash_royale', 'none', false], ['free_fire', 'none', false],
    ['fortnite', 'login', false], ['warzone', 'none', false], ['pubg_mobile', 'none', false],
  ];

  it('private.esp_verify_kind y private.esp_rank_verifiable: los 15 juegos (y uno que no existe)', async () => {
    const r = await db.admin<{ game: string; kind: string | null; rank: boolean; link: string | null }>(
      `select g as game, private.esp_verify_kind(g) as kind, private.esp_rank_verifiable(g) as rank, private.esp_link_provider(g) as link
         from unnest($1::text[]) with ordinality as x (g, n) order by n`,
      [[...TABLE.map((t) => t[0]), 'tetris']],
    );
    expect(r.map((x) => [x.game, x.kind, x.rank])).toEqual([...TABLE, ['tetris', null, false]]);
    // «Conectar con…» solo en los de login y los de búsqueda (Riot con RSO).
    expect(r.filter((x) => x.link !== null).map((x) => x.game).sort()).toEqual(['cs2', 'fortnite', 'lol', 'rocket_league', 'valorant']);
  });
});

describe('guardar (declarado y no exclusivo)', () => {
  it('guardar → pendiente y declarado; otra cuenta puede declarar el mismo ID; confirmar sin búsqueda no; lo que no sirve: invalido', async () => {
    expect(await save(p[0], 'valorant', '  Juan   Pérez#LAN ', '', 'latam')).toEqual({ status: 'pendiente', idDisplay: 'Juan Pérez#LAN', idNormalized: 'juan pérez#lan' });
    expect(await row(p[0], 'valorant')).toMatchObject({ status: 'pendiente', ownership: 'declarado', rank_source: 'declarado', region: 'latam' });
    // Otra cuenta declara el mismo ID (con otras mayúsculas y espacios): nadie se adueña de un ID que no puede probar.
    expect(await save(p[1], 'valorant', 'JUAN Pérez#lan')).toEqual({ status: 'pendiente', idDisplay: 'JUAN Pérez#lan', idNormalized: 'juan pérez#lan' });
    expect(await db.count('public.esports_game_ids', `game = 'valorant' and id_normalized = 'juan pérez#lan'`)).toBe(2);
    // Lo mismo en un juego sin verificación.
    await save(p[0], 'clash_royale', '#2PP');
    await save(p[1], 'clash_royale', '2pp');
    expect(await db.count('public.esports_game_ids', `game = 'clash_royale' and id_normalized = '2pp'`)).toBe(2);
    // Confirmar solo con una búsqueda (sin p_lookup: invalido); sin fila: no_existe.
    await fails(confirm(p[0], 'valorant', null), INVALID);
    await fails(confirm(p[0], 'clash_royale', null), INVALID);
    await fails(confirm(p[2], 'valorant', null), 'no_existe');
    // Lo que no sirve: el ID, la región o la plataforma que no son del juego; NBA 2K sin plataforma.
    await fails(save(p[2], 'valorant', 'Juan'), INVALID);
    await fails(save(p[2], 'valorant', 'Juan#LAN', '', 'la1'), INVALID);
    await fails(save(p[2], 'valorant', 'Juan#LAN', 'psn'), INVALID);
    await fails(save(p[2], 'nba_2k', 'KingJames23'), INVALID);
    await fails(save(p[2], 'tetris', 'X'), INVALID);
    // NBA 2K: una fila por plataforma.
    await save(p[2], 'nba_2k', 'KingJames23', 'psn');
    await save(p[2], 'nba_2k', 'KingJames23', 'xbox');
    expect(await db.count('public.esports_game_ids', `user_id = $1 and game = 'nba_2k'`, [p[2]])).toBe(2);
    expect((await db.rpc<Json[]>(p[2], 'esports_my_game_ids')).map((g) => g.platform)).toEqual(['psn', 'xbox']);
  });

  it('rangos declarados: la escalera del juego (división si el tier tiene, MMR solo en Rocket League, la clave del modo)', async () => {
    await save(p[0], 'valorant', 'Rango#LAN');
    await setRanks(p[0], 'valorant', { main: { tier: 'diamond', div: 2 } });
    await setRanks(p[0], 'valorant', { main: { tier: 'radiant' } });
    for (const bad of [
      { main: { tier: 'diamond' } },
      { main: { tier: 'diamond', div: 4 } },
      { main: { tier: 'radiant', div: 1 } },
      { main: { tier: 'mythic' } },
      { main: { tier: 'gold', div: 1, mmr: 900 } },
      { '2v2': { tier: 'gold', div: 1 } },
      { main: { value: 1200 } },
      { main: { tier: 'gold', div: null } },
    ]) {
      await fails(setRanks(p[0], 'valorant', bad), INVALID).catch((e) => Promise.reject(new Error(`${JSON.stringify(bad)}: ${e.message}`)));
    }
    await save(p[0], 'rocket_league', 'Rango RL');
    await setRanks(p[0], 'rocket_league', { '2v2': { tier: 'gc2', div: 3, mmr: 1650 }, '3v3': { tier: 'ssl' } });
    await fails(setRanks(p[0], 'rocket_league', { main: { tier: 'gc2', div: 3 } }), INVALID);
    await fails(setRanks(p[0], 'rocket_league', { '2v2': { tier: 'gc2', div: 5 } }), INVALID);
    await fails(setRanks(p[0], 'rocket_league', { '2v2': { tier: 'gc2', div: 1, mmr: 3001 } }), INVALID);
    await save(p[0], 'cs2', '22202');
    await setRanks(p[0], 'cs2', { main: { value: 18000 } });
    await fails(setRanks(p[0], 'cs2', { main: { value: 40001 } }), INVALID);
    await save(p[0], 'tekken8', 'Ab12-cD34-eF56');
    await setRanks(p[0], 'tekken8', { main: { text: 'Tekken King' } });
    await fails(setRanks(p[0], 'tekken8', { main: { text: '   ' } }), INVALID);
    expect(await row(p[0], 'tekken8')).toMatchObject({ ranks: { main: { text: 'Tekken King' } }, rank_source: 'declarado', status: 'pendiente' });
    // Sin fila: no_existe.
    await fails(setRanks(p[1], 'valorant', { main: { tier: 'gold', div: 1 } }), 'no_existe');
  });

  it('cambiar el ID comprobado lo deja declarado (sin lo comprobado); en una inscripción aprobada de un torneo en curso: cerrado', async () => {
    await save(p[0], 'lol', 'Faker#KR1', '', 'kr');
    expect(await confirm(p[0], 'lol', await store(p[0], 'lol', 'Faker#KR1', { ranks: { main: { tier: 'gold', div: 2 } } }))).toEqual({
      status: 'confirmado', rankSource: 'verificado', ownership: 'busqueda',
    });
    // Mismo ID con otras mayúsculas: solo cambia cómo se ve (sigue comprobado).
    expect(await save(p[0], 'lol', 'FAKER#kr1', '', 'kr')).toEqual({ status: 'confirmado', idDisplay: 'FAKER#kr1', idNormalized: 'faker#kr1' });
    expect(await save(p[0], 'lol', 'Otro#KR1')).toMatchObject({ status: 'pendiente', idNormalized: 'otro#kr1' });
    expect(await row(p[0], 'lol')).toMatchObject({
      status: 'pendiente', ownership: 'declarado', rank_source: 'declarado', verified_at: null, confirmed_at: null, external_id: null,
      lookup_name: null, region: '', ranks: { main: { tier: 'gold', div: 2 } },
    });
    // Inscrito y aprobado en un torneo en curso de Rocket League (con el ID declarado): no cambia ni se borra.
    await save(p[0], 'rocket_league', 'Mi Epic');
    const t = await tourney('rocket_league', '1v1', { autoApprove: true });
    await solo(p[0], t.eventId);
    await fails(db.rpc(p[0], 'esports_delete_game_id', { p_game: 'rocket_league' }), 'cerrado');
    await db.rpc(w.u.org, 'esports_set_status', { p_event: t.eventId, p_status: 'live' });
    await fails(save(p[0], 'rocket_league', 'Tercer Epic'), 'cerrado');
    // Otro juego sí.
    await save(p[0], 'fortnite', 'Mi Fortnite');
    await db.rpc(p[0], 'esports_delete_game_id', { p_game: 'fortnite' });
    expect(await row(p[0], 'fortnite')).toBeUndefined();
  });

  it('20 cambios por día', async () => {
    for (let i = 0; i < 20; i++) await save(p[0], 'fortnite', `Nombre ${String(i).padStart(2, '0')}`);
    await fails(save(p[0], 'fortnite', 'Nombre 99'), 'rate_limited');
    // El mismo ID (solo la forma de escribirlo) no cuenta.
    await save(p[0], 'fortnite', 'NOMBRE 19');
  });
});

describe('la búsqueda de Riot (esports-verify, solo service_role)', () => {
  it('esports_begin_lookup normaliza y cuenta, solo en LoL y VALORANT (el 21.º en la hora: rate_limited; un ID malo: invalido)', async () => {
    await fails(db.rpc(p[0], 'esports_begin_lookup', { p_user: p[0], p_game: 'lol', p_id: 'Nombre#LAN' }), '42501');
    await fails(db.rpc(ANON, 'esports_begin_lookup', { p_user: p[0], p_game: 'lol', p_id: 'Nombre#LAN' }), '42501');
    expect(await db.rpc(SERVICE, 'esports_begin_lookup', { p_user: p[0], p_game: 'lol', p_id: ' Mi  Nombre#LAN ' })).toEqual({ ok: true, display: 'Mi Nombre#LAN', normalized: 'mi nombre#lan' });
    expect(await db.rpc(SERVICE, 'esports_begin_lookup', { p_user: p[0], p_game: 'lol', p_id: 'Nombre' })).toEqual({ ok: false, reason: 'invalido' });
    // Los juegos sin búsqueda (login o solo declarado) no buscan.
    for (const [game, id] of [['cs2', '22202'], ['fortnite', 'Ninja'], ['clash_royale', '#2PP'], ['tetris', 'x']]) {
      expect(await db.rpc(SERVICE, 'esports_begin_lookup', { p_user: p[0], p_game: game, p_id: id }), game).toEqual({ ok: false, reason: 'invalido' });
    }
    expect((await db.rpc<Json>(SERVICE, 'esports_begin_lookup', { p_user: p[0], p_game: 'valorant', p_id: 'Nombre#LAN' })).ok).toBe(true);
    for (let i = 0; i < 18; i++) await db.rpc(SERVICE, 'esports_begin_lookup', { p_user: p[0], p_game: 'lol', p_id: 'Nombre#LAN' });
    expect(await db.rpc(SERVICE, 'esports_begin_lookup', { p_user: p[0], p_game: 'lol', p_id: 'Nombre#LAN' })).toEqual({ ok: false, reason: 'rate_limited' });
    // Otra cuenta tiene sus propias 20.
    expect((await db.rpc<Json>(SERVICE, 'esports_begin_lookup', { p_user: p[1], p_game: 'lol', p_id: 'Nombre#LAN' })).ok).toBe(true);
  });

  it('LoL: confirmar con una búsqueda propia, fresca (15 min), del mismo ID y que lo encontró → comprobado y con el rango verificado', async () => {
    await save(p[0], 'lol', 'Faker#KR1', '', 'kr');
    await setRanks(p[0], 'lol', { main: { tier: 'iron', div: 4 } });
    const ranks = { main: { tier: 'gold', div: 2 } };
    await fails(db.rpc(p[0], 'esports_store_lookup', { p_user: p[0], p_game: 'lol', p_platform: '', p_id: 'Faker#KR1', p_found: true, p_display: 'x', p_external: null, p_ranks: {}, p_provider: 'riot' }), '42501');
    const other = await store(p[1], 'lol', 'Faker#KR1', { ranks });
    await fails(confirm(p[0], 'lol', other), INVALID);
    const otherId = await store(p[0], 'lol', 'Otro#KR1', { ranks });
    await fails(confirm(p[0], 'lol', otherId), INVALID);
    const notFound = await store(p[0], 'lol', 'Faker#KR1', { found: false });
    await fails(confirm(p[0], 'lol', notFound), INVALID);
    const old = await store(p[0], 'lol', 'faker#kr1', { ranks });
    await db.admin(`update private.esports_lookups set created_at = now() - interval '16 minutes' where id = $1`, [old]);
    await fails(confirm(p[0], 'lol', old), INVALID);
    const good = await store(p[0], 'lol', 'FAKER#kr1', { ranks });
    expect(await confirm(p[0], 'lol', good)).toEqual({ status: 'confirmado', rankSource: 'verificado', ownership: 'busqueda' });
    const r = await row(p[0], 'lol');
    expect(r).toMatchObject({ status: 'confirmado', ownership: 'busqueda', lookup_name: 'Faker', external_id: 'puuid-1', ranks, rank_source: 'verificado' });
    expect(r.verified_at).not.toBeNull();
    expect(r.confirmed_at).not.toBeNull();
    // Rangos declarados después: quedan declarados (y sin verified_at); sigue comprobado.
    await setRanks(p[0], 'lol', { main: { tier: 'platinum', div: 1 } });
    expect(await row(p[0], 'lol')).toMatchObject({ status: 'confirmado', ownership: 'busqueda', rank_source: 'declarado', verified_at: null });
    // Una búsqueda sin rango (sin clasificar) comprueba sin tocar el rango.
    expect(await confirm(p[0], 'lol', await store(p[0], 'lol', 'Faker#KR1'))).toEqual({ status: 'confirmado', rankSource: 'declarado', ownership: 'busqueda' });
    // Rangos que no sirven o que no existen en la escalera se guardan como {}; un ID que no sirve no se guarda.
    const junk = await store(p[0], 'lol', 'Faker#KR1', { ranks: { main: { tier: 'GOLD!' } } });
    const notLol = await store(p[0], 'lol', 'Faker#KR1', { ranks: { main: { tier: 'radiant' } } });
    expect((await db.admin<Json>('select id, ranks from private.esports_lookups where id = any ($1)', [[junk, notLol]])).map((x) => x.ranks)).toEqual([{}, {}]);
    await fails(store(p[0], 'lol', 'Faker'), INVALID);
    // Solo de los juegos con búsqueda.
    await fails(store(p[0], 'cs2', '22202'), INVALID);
    await fails(store(p[0], 'clash_royale', '#2PP'), INVALID);
    // Las búsquedas de más de un día de esa cuenta se borran solas.
    await db.admin(`update private.esports_lookups set created_at = now() - interval '2 days' where id = any ($1)`, [[other, otherId]]);
    await store(p[0], 'lol', 'Faker#KR1');
    expect(await db.count('private.esports_lookups', 'id = $1', [otherId])).toBe(0);
    expect(await db.count('private.esports_lookups', 'id = $1', [other])).toBe(1);
  });

  it('VALORANT: la búsqueda solo dice que existe (no guarda rangos); queda comprobado con su rango declarado', async () => {
    await save(p[0], 'valorant', 'Tenz#NA1');
    await setRanks(p[0], 'valorant', { main: { tier: 'radiant' } });
    const l = await store(p[0], 'valorant', 'Tenz#NA1', { ranks: { main: { tier: 'immortal', div: 3 } }, display: 'Tenz' });
    expect((await db.admin<Json>('select ranks from private.esports_lookups where id = $1', [l]))[0].ranks).toEqual({});
    expect(await confirm(p[0], 'valorant', l)).toEqual({ status: 'confirmado', rankSource: 'declarado', ownership: 'busqueda' });
    expect(await row(p[0], 'valorant')).toMatchObject({ ranks: { main: { tier: 'radiant' } }, rank_source: 'declarado', verified_at: null, lookup_name: 'Tenz' });
  });

  it('una búsqueda no es exclusiva: dos cuentas comprueban el mismo Riot ID; si otra lo tiene conectado (login): id_tomado', async () => {
    for (const u of [p[0], p[1]]) {
      await save(u, 'lol', 'Faker#KR1');
      expect((await confirm(u, 'lol', await store(u, 'lol', 'Faker#KR1'))).ownership).toBe('busqueda');
    }
    // p3 lo conecta con Riot (RSO): las búsquedas de los otros no se tocan, pero ya no lo vuelven a comprobar.
    expect(await link(p[2], 'lol', 'riot', 'puuid-1', 'Faker#KR1')).toBe('ok');
    expect(await row(p[0], 'lol')).toMatchObject({ status: 'confirmado', ownership: 'busqueda' });
    expect(await row(p[1], 'lol')).toMatchObject({ status: 'confirmado', ownership: 'busqueda' });
    await fails(confirm(p[0], 'lol', await store(p[0], 'lol', 'Faker#KR1')), 'id_tomado');
    // Tampoco con otro nombre si la búsqueda da la misma cuenta de Riot (el puuid del conectado).
    await save(p[3], 'lol', 'Renombrado#KR1');
    await fails(confirm(p[3], 'lol', await store(p[3], 'lol', 'Renombrado#KR1', { external: 'puuid-1' })), 'id_tomado');
    // Ni declararlo.
    await fails(save(p[3], 'lol', 'faker#kr1'), 'id_tomado');
  });
});

describe('conectar la cuenta (esports-auth, solo service_role)', () => {
  it('esports_link_begin / esports_link_take: el proveedor del juego, un uso, 10 minutos', async () => {
    await fails(db.rpc(p[0], 'esports_link_begin', { p_user: p[0], p_provider: 'steam', p_game: 'cs2' }), '42501');
    await fails(db.rpc(SERVICE, 'esports_link_begin', { p_user: p[0], p_provider: 'steam', p_game: 'valorant' }), INVALID);
    await fails(db.rpc(SERVICE, 'esports_link_begin', { p_user: p[0], p_provider: 'epic', p_game: 'clash_royale' }), INVALID);
    const state = await db.rpc<string>(SERVICE, 'esports_link_begin', { p_user: p[0], p_provider: 'steam', p_game: 'cs2' });
    await fails(db.rpc(p[0], 'esports_link_take', { p_state: state }), '42501');
    expect(await db.rpc(SERVICE, 'esports_link_take', { p_state: state })).toEqual({ userId: p[0], provider: 'steam', game: 'cs2' });
    expect(await db.rpc(SERVICE, 'esports_link_take', { p_state: state })).toBeNull();
    const old = await db.rpc<string>(SERVICE, 'esports_link_begin', { p_user: p[0], p_provider: 'epic', p_game: 'fortnite' });
    await db.admin(`update private.esports_link_states set created_at = now() - interval '11 minutes' where state = $1`, [old]);
    expect(await db.rpc(SERVICE, 'esports_link_take', { p_state: old })).toBeNull();
    for (let i = 0; i < 8; i++) await db.rpc(SERVICE, 'esports_link_begin', { p_user: p[0], p_provider: 'riot', p_game: 'lol' });
    await fails(db.rpc(SERVICE, 'esports_link_begin', { p_user: p[0], p_provider: 'riot', p_game: 'lol' }), 'rate_limited');
  });

  it('esports_link_account: queda confirmado con login; los IDs declarados de otras cuentas no se tocan (ni push ni aviso)', async () => {
    await phone(p[1]);
    await save(p[1], 'cs2', '22202');
    await setRanks(p[1], 'cs2', { main: { value: 15000 } });
    await fails(db.rpc(p[0], 'esports_link_account', { p_user: p[0], p_game: 'cs2', p_provider: 'steam', p_external_id: '76561197960287930', p_display: 'Yo' }), '42501');
    await fails(link(p[0], 'cs2', 'epic', 'x', 'Yo'), INVALID);
    await fails(link(p[0], 'cs2', 'steam', '123', 'Yo'), INVALID);
    await fails(link(p[0], 'clash_royale', 'epic', 'x', '#2PP'), INVALID);
    expect(await link(p[0], 'cs2', 'steam', '76561197960287930', 'Yo en Steam')).toBe('ok');
    expect(await row(p[0], 'cs2')).toMatchObject({ id_display: '22202', id_normalized: '22202', status: 'confirmado', ownership: 'login', external_id: '76561197960287930', lookup_name: 'Yo en Steam' });
    expect(await row(p[1], 'cs2')).toMatchObject({ status: 'pendiente', ownership: 'declarado', id_normalized: '22202', ranks: { main: { value: 15000 } } });
    expect(await db.count('public.push_outbox', 'user_id = $1', [p[1]])).toBe(0);
    expect(await db.count('public.esports_id_moves')).toBe(0);
    expect(await db.count('public.admin_audit', `action = 'esports_id_login'`)).toBe(0);
    // Epic y Riot: el nombre que dio el proveedor.
    expect(await link(p[0], 'fortnite', 'epic', 'acc-9', 'Ninja  Uno')).toBe('ok');
    expect(await row(p[0], 'fortnite')).toMatchObject({ id_display: 'Ninja Uno', id_normalized: 'ninja uno', ownership: 'login', external_id: 'acc-9' });
    expect(await link(p[0], 'valorant', 'riot', 'puuid-9', 'Tenz#NA1')).toBe('ok');
    expect(await row(p[0], 'valorant')).toMatchObject({ id_display: 'Tenz#NA1', id_normalized: 'tenz#na1', ownership: 'login' });
  });

  it('un login nuevo se lleva el ID de la cuenta que lo tenía conectado: su fila se borra, le queda el aviso, el push y la auditoría', async () => {
    await phone(p[1]);
    expect(await link(p[1], 'cs2', 'steam', '76561197960287930', 'Antes')).toBe('ok');
    await setRanks(p[1], 'cs2', { main: { value: 12000 } });
    expect(await link(p[0], 'cs2', 'steam', '76561197960287930', 'Ahora')).toBe('ok');
    expect(await row(p[1], 'cs2')).toBeUndefined();
    expect(await row(p[0], 'cs2')).toMatchObject({ id_normalized: '22202', ownership: 'login', status: 'confirmado', lookup_name: 'Ahora' });
    expect(await db.admin<Json>('select user_id, game, platform, id_display, provider, seen_at from public.esports_id_moves')).toEqual([
      { user_id: p[1], game: 'cs2', platform: '', id_display: '22202', provider: 'steam', seen_at: null },
    ]);
    expect(await db.admin<Json>('select title, body, url, tag from public.push_outbox where user_id = $1', [p[1]])).toEqual([
      {
        title: 'Tu ID 22202 de Counter-Strike 2 pasó a otra cuenta',
        body: 'Alguien entró con esa cuenta de Steam en otra cuenta de MatchMate.',
        url: '/esports/mi-id?juego=cs2',
        tag: `esports-id:login:${p[1]}`,
      },
    ]);
    expect(await db.admin<Json>(`select action, target_type, target_id, detail from public.admin_audit where action = 'esports_id_login'`)).toEqual([
      { action: 'esports_id_login', target_type: 'user', target_id: p[1], detail: { game: 'cs2', idDisplay: '22202', by: p[0], provider: 'steam' } },
    ]);
    // Lo ve en la app hasta cerrarlo.
    const moves = await db.rpc<Json[]>(p[1], 'esports_my_id_moves');
    expect(moves).toEqual([{ id: expect.any(String), game: 'cs2', platform: '', idDisplay: '22202', provider: 'steam', createdAt: expect.stringMatching(/Z$/) }]);
    // Por la cuenta externa también (Epic: cambió el nombre visible, la misma cuenta): el login nuevo gana.
    expect(await link(p[2], 'fortnite', 'epic', 'acc-1', 'Ninja Uno')).toBe('ok');
    expect(await link(p[3], 'fortnite', 'epic', 'acc-1', 'Ninja Dos')).toBe('ok');
    expect(await row(p[2], 'fortnite')).toBeUndefined();
    expect(await row(p[3], 'fortnite')).toMatchObject({ id_display: 'Ninja Dos', external_id: 'acc-1', ownership: 'login' });
    expect((await db.rpc<Json[]>(p[2], 'esports_my_id_moves')).map((m) => [m.game, m.idDisplay, m.provider])).toEqual([['fortnite', 'Ninja Uno', 'epic']]);
    // Volver a conectarlo uno mismo no avisa a nadie.
    expect(await link(p[0], 'cs2', 'steam', '76561197960287930', 'Otra vez')).toBe('ok');
    expect(await db.count('public.esports_id_moves')).toBe(2);
  });

  it('el ID conectado no se edita (invalido) y otra cuenta no lo declara (id_tomado); se quita y se vuelve a conectar', async () => {
    expect(await link(p[0], 'cs2', 'steam', '76561197960287930', 'Yo')).toBe('ok');
    await fails(save(p[0], 'cs2', '33333'), INVALID);
    await fails(save(p[1], 'cs2', '22202'), 'id_tomado');
    // El SteamID64 es la misma cuenta (22202).
    await fails(save(p[1], 'cs2', '76561197960287930'), 'id_tomado');
    // Otro ID, sí.
    expect((await save(p[1], 'cs2', '33333')).status).toBe('pendiente');
    await db.rpc(p[0], 'esports_delete_game_id', { p_game: 'cs2' });
    expect((await save(p[1], 'cs2', '22202')).status).toBe('pendiente');
    // Conectar otro ID de Riot deja declarado el rango verificado del anterior; el mismo ID lo conserva.
    await save(p[2], 'lol', 'Faker#KR1');
    await confirm(p[2], 'lol', await store(p[2], 'lol', 'Faker#KR1', { ranks: { main: { tier: 'gold', div: 2 } } }));
    expect(await link(p[2], 'lol', 'riot', 'puuid-1', 'faker#KR1')).toBe('ok');
    expect(await row(p[2], 'lol')).toMatchObject({ ownership: 'login', rank_source: 'verificado', ranks: { main: { tier: 'gold', div: 2 } } });
    expect(await link(p[2], 'lol', 'riot', 'puuid-2', 'Otro#KR1')).toBe('ok');
    expect(await row(p[2], 'lol')).toMatchObject({ ownership: 'login', id_normalized: 'otro#kr1', rank_source: 'declarado', verified_at: null });
    // Una búsqueda sobre el conectado lo deja conectado (con el rango de LoL verificado).
    expect(await confirm(p[2], 'lol', await store(p[2], 'lol', 'Otro#KR1', { external: 'puuid-2', ranks: { main: { tier: 'master' } } }))).toEqual({
      status: 'confirmado', rankSource: 'verificado', ownership: 'login',
    });
  });
});

describe('«tu ID pasó a otra cuenta» (esports_my_id_moves y esports_seen_id_move)', () => {
  it('solo los suyos sin ver de los últimos 30 días, los más nuevos primero; cerrarlo lo marca visto; el de otro: no_existe', async () => {
    const add = async (uid: string, game: string, display: string, ago: string) =>
      (await db.admin<{ id: string }>(
        `insert into public.esports_id_moves (user_id, game, id_display, provider, created_at) values ($1, $2, $3, 'epic', now() - $4::interval) returning id`,
        [uid, game, display, ago],
      ))[0].id;
    const a = await add(p[0], 'fortnite', 'Viejo', '31 days');
    const b = await add(p[0], 'fortnite', 'Ayer', '1 day');
    const c = await add(p[0], 'rocket_league', 'Hoy', '1 hour');
    const d = await add(p[1], 'fortnite', 'De otro', '1 hour');
    expect((await db.rpc<Json[]>(p[0], 'esports_my_id_moves')).map((m) => m.id)).toEqual([c, b]);
    await db.rpc(p[0], 'esports_seen_id_move', { p_id: c });
    // Otra vez: no cambia nada.
    const seen = (await db.admin<Json>('select seen_at from public.esports_id_moves where id = $1', [c]))[0].seen_at;
    expect(seen).not.toBeNull();
    await db.rpc(p[0], 'esports_seen_id_move', { p_id: c });
    expect((await db.admin<Json>('select seen_at from public.esports_id_moves where id = $1', [c]))[0].seen_at).toEqual(seen);
    expect((await db.rpc<Json[]>(p[0], 'esports_my_id_moves')).map((m) => m.idDisplay)).toEqual(['Ayer']);
    await fails(db.rpc(p[0], 'esports_seen_id_move', { p_id: d }), 'no_existe');
    expect((await db.admin<Json>('select seen_at from public.esports_id_moves where id = $1', [d]))[0].seen_at).toBeNull();
    // Uno viejo también se puede cerrar.
    await db.rpc(p[0], 'esports_seen_id_move', { p_id: a });
    expect(await db.rpc(p[2], 'esports_my_id_moves')).toEqual([]);
    // Sin cuenta, no; nadie lee la tabla directo.
    await fails(db.rpc(ANON, 'esports_my_id_moves'), DENIED);
    await fails(db.rpc(ANON, 'esports_seen_id_move', { p_id: b }), DENIED);
    await fails(db.asUser(p[0], 'select id from public.esports_id_moves'), '42501');
    await fails(db.asUser(p[0], `update public.esports_id_moves set seen_at = now()`), '42501');
  });
});

describe('lo que pide un torneo según el juego', () => {
  it('sin ID: sin_id; requireConfirmedId es false por defecto: un ID declarado basta', async () => {
    const t = await tourney('rocket_league', '1v1');
    await fails(solo(p[1], t.eventId), 'sin_id');
    await save(p[0], 'rocket_league', 'Declarado RL');
    await solo(p[0], t.eventId);
    expect(await db.admin('select gamer_tag, rank_source from public.esports_entry_members where event_id = $1', [t.eventId])).toEqual([
      { gamer_tag: 'Declarado RL', rank_source: 'declarado' },
    ]);
  });

  it('requireConfirmedId: en un juego de login sin conectar → id_sin_comprobar (con el nombre); conectado sí; en uno sin verificación no cuenta', async () => {
    const t = await tourney('rocket_league', '1v1', { requireConfirmedId: true });
    await save(p[0], 'rocket_league', 'Sin Conectar');
    const e = await fails(solo(p[0], t.eventId), 'id_sin_comprobar');
    expect((e as Json).detail).toBe('Jugador 1');
    await link(p[0], 'rocket_league', 'epic', 'acc-1', 'Conectado RL');
    await solo(p[0], t.eventId);
    // EA SPORTS FC no se comprueba: el ID declarado basta aunque lo pida.
    const fc = await tourney('ea_fc', '1v1', { requireConfirmedId: true });
    await save(p[1], 'ea_fc', 'Jugador_FC');
    await solo(p[1], fc.eventId);
    // LoL: comprobado con la búsqueda de Riot.
    const lol = await tourney('lol', '5v5', { requireConfirmedId: true });
    await save(p[2], 'lol', 'Faker#KR1');
    await fails(solo(p[2], lol.eventId), 'id_sin_comprobar');
    await confirm(p[2], 'lol', await store(p[2], 'lol', 'Faker#KR1'));
    expect(await db.admin<Json>('select kind from public.esports_entries where id = $1', [await solo(p[2], lol.eventId)])).toEqual([{ kind: 'free_agent' }]);
  });

  it('requireVerifiedRank: solo en LoL (sin_rango si el rango es declarado o no lo tiene); en los demás juegos no cuenta', async () => {
    const lol = await tourney('lol', '5v5', { requireVerifiedRank: true });
    await save(p[0], 'lol', 'Faker#KR1');
    await fails(solo(p[0], lol.eventId), 'sin_rango');
    await setRanks(p[0], 'lol', { main: { tier: 'gold', div: 2 } });
    await fails(solo(p[0], lol.eventId), 'sin_rango');
    // Comprobado pero sin clasificar: tampoco.
    await confirm(p[0], 'lol', await store(p[0], 'lol', 'Faker#KR1'));
    await fails(solo(p[0], lol.eventId), 'sin_rango');
    await confirm(p[0], 'lol', await store(p[0], 'lol', 'Faker#KR1', { ranks: { main: { tier: 'diamond', div: 1 } } }));
    await solo(p[0], lol.eventId);
    expect(await db.admin('select rank_source, ranks from public.esports_entry_members where event_id = $1', [lol.eventId])).toEqual([
      { rank_source: 'verificado', ranks: { main: { tier: 'diamond', div: 1 } } },
    ]);
    // VALORANT y Rocket League: el rango declarado basta (o ninguno).
    const val = await tourney('valorant', '5v5', { requireVerifiedRank: true });
    await save(p[1], 'valorant', 'Tenz#NA1');
    await solo(p[1], val.eventId);
    const rl = await tourney('rocket_league', '1v1', { requireVerifiedRank: true });
    await save(p[2], 'rocket_league', 'Rango RL');
    await setRanks(p[2], 'rocket_league', { '1v1': { tier: 'gold1', div: 2 } });
    await solo(p[2], rl.eventId);
  });

  it('equipos: crear y unirse con el ID declarado; sin ID: sin_id', async () => {
    await fails(db.rpc(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Sin ID', p_tag: 'SID' }), 'sin_id');
    await save(p[0], 'rocket_league', 'Capitan RL');
    const t = await db.rpc<{ teamId: string; inviteCode: string }>(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Declarados', p_tag: 'DEC' });
    await fails(db.rpc(p[1], 'esports_join_team', { p_code: t.inviteCode }), 'sin_id');
    // Un ID de otro juego no sirve.
    await save(p[1], 'fortnite', 'Otro Juego');
    await fails(db.rpc(p[1], 'esports_join_team', { p_code: t.inviteCode }), 'sin_id');
    await save(p[1], 'rocket_league', 'Miembro RL');
    expect(await db.rpc(p[1], 'esports_join_team', { p_code: t.inviteCode })).toEqual({ teamId: t.teamId });
    // Miembro de un equipo de ese juego: no borra su ID.
    await fails(db.rpc(p[1], 'esports_delete_game_id', { p_game: 'rocket_league' }), 'cerrado');
  });
});

describe('quién lee qué', () => {
  it('un visitante no lee la tabla; otra cuenta lee las columnas públicas (no external_id ni lo demás: 42501 por columna)', async () => {
    await save(p[0], 'lol', 'Faker#KR1');
    await confirm(p[0], 'lol', await store(p[0], 'lol', 'Faker#KR1'));
    await fails(db.asAnon('select user_id from public.esports_game_ids'), '42501');
    expect(await db.asUser(p[1], 'select user_id, game, id_display, status, rank_source, ownership from public.esports_game_ids')).toEqual([
      { user_id: p[0], game: 'lol', id_display: 'Faker#KR1', status: 'confirmado', rank_source: 'declarado', ownership: 'busqueda' },
    ]);
    for (const col of ['external_id', 'id_normalized', 'lookup_name', 'created_at', '*']) {
      await fails(db.asUser(p[1], `select ${col} from public.esports_game_ids`), '42501');
    }
    // Lo suyo completo, con esports_my_game_ids.
    const [mine] = await db.rpc<Json[]>(p[0], 'esports_my_game_ids');
    expect(Object.keys(mine).sort()).toEqual(
      ['userId', 'game', 'platform', 'region', 'idDisplay', 'idNormalized', 'status', 'ownership', 'externalId', 'ranks', 'rankSource',
        'lookupName', 'verifiedAt', 'confirmedAt', 'createdAt', 'updatedAt'].sort(),
    );
    expect(mine).toMatchObject({ userId: p[0], game: 'lol', idNormalized: 'faker#kr1', externalId: 'puuid-1', ownership: 'busqueda', status: 'confirmado' });
    expect(await db.rpc(p[1], 'esports_my_game_ids')).toEqual([]);
    await fails(db.rpc(ANON, 'esports_my_game_ids'), DENIED);
    // Nadie escribe directo.
    await fails(db.asUser(p[0], `update public.esports_game_ids set status = 'confirmado'`), '42501');
    await fails(db.asUser(p[0], 'select id from private.esports_lookups'), '42501');
  });

  it('los checks de la tabla: comprobado = búsqueda o login; sin código ni captura; un solo login por ID', async () => {
    const ins = (uid: string, status: string, ownership: string, rankSource = 'declarado', id = 'abc#lan', external: string | null = null) =>
      db.admin(
        `insert into public.esports_game_ids (user_id, game, id_display, id_normalized, status, ownership, rank_source, external_id)
         values ($1, 'valorant', $2, $2, $3, $4, $5, $6)`,
        [uid, id, status, ownership, rankSource, external],
      );
    await fails(ins(p[0], 'confirmado', 'declarado'), '23514');
    await fails(ins(p[0], 'pendiente', 'busqueda'), '23514');
    await fails(ins(p[0], 'pendiente', 'login'), '23514');
    await fails(ins(p[0], 'confirmado', 'codigo'), '23514');
    await fails(ins(p[0], 'pendiente', 'declarado', 'captura'), '23514');
    await ins(p[0], 'confirmado', 'login', 'declarado', 'abc#lan', 'puuid-1');
    await fails(ins(p[1], 'confirmado', 'login', 'declarado', 'abc#lan', 'puuid-2'), '23505');
    await fails(ins(p[1], 'confirmado', 'login', 'declarado', 'xyz#lan', 'puuid-1'), '23505');
    await ins(p[1], 'confirmado', 'busqueda', 'declarado', 'abc#lan', 'puuid-1');
    await ins(p[2], 'pendiente', 'declarado');
    const cols = await db.admin<{ c: string }>(
      `select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'esports_game_ids'`,
    );
    for (const gone of ['rank_proof', 'rank_note', 'verified_by']) expect(cols.map((x) => x.c), gone).not.toContain(gone);
  });

  it('sin reclamos ni capturas: no quedan la tabla, las RPC, las ayudas del bucket esports-proofs ni el target de la auditoría', async () => {
    const r = await db.admin<Json>(
      `select to_regclass('public.esports_id_appeals') as appeals,
              (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname in ('public', 'private')
                  and (p.proname like '%appeal%' or p.proname like '%rank_proof%' or p.proname like 'esp\\_%proof%'
                       or p.proname in ('esports_review_rank', 'esp_new_code', 'esp_person', 'esp_can_review_rank'))) as fns,
              (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'admin_audit_target_type_check') as audit`,
    );
    expect(r[0].appeals).toBeNull();
    expect(r[0].fns).toBe(0);
    expect(r[0].audit).not.toContain('esports_appeal');
  });
});

describe('Descargar mis datos', () => {
  it('export_my_data trae esportsIds, esportsTeams, esportsEntries y esportsIdMoves (sin reclamos)', async () => {
    await save(p[0], 'rocket_league', 'Exportador');
    const team = await db.rpc<Json>(p[0], 'esports_create_team', { p_game: 'rocket_league', p_name: 'Exportadores', p_tag: 'EXP' });
    const t = await tourney('rocket_league', '1v1');
    const entry = await solo(p[0], t.eventId);
    await link(p[0], 'fortnite', 'epic', 'acc-1', 'Mi Fortnite');
    await link(p[1], 'fortnite', 'epic', 'acc-1', 'Mi Fortnite');
    const d = await db.rpc<Json>(p[0], 'export_my_data');
    expect(d.esportsIds).toEqual([expect.objectContaining({ user_id: p[0], game: 'rocket_league', id_display: 'Exportador', status: 'pendiente', ownership: 'declarado' })]);
    expect(d.esportsTeams).toEqual([expect.objectContaining({ teamId: team.teamId, game: 'rocket_league', name: 'Exportadores', tag: 'EXP', role: 'captain' })]);
    expect(d.esportsEntries).toEqual([expect.objectContaining({ entry_id: entry, role: 'captain', gamer_tag: 'Exportador', tournament: 'Copa rocket_league', entryStatus: 'pending' })]);
    expect(d.esportsIdMoves).toEqual([
      { id: expect.any(String), game: 'fortnite', platform: '', idDisplay: 'Mi Fortnite', provider: 'epic', createdAt: expect.stringMatching(/Z$/), seenAt: null },
    ]);
    expect(d).not.toHaveProperty('esportsAppeals');
    // El que se quedó con el ID no tiene avisos.
    expect((await db.rpc<Json>(p[1], 'export_my_data')).esportsIdMoves).toEqual([]);
  });
});
