/**
 * Insignias, el creador de la liga (20260929001120_insignias_creador.sql, docs/insignias.md §5): quién diseña y da
 * (política de la liga y «Diseña insignias»), los diseños (largos, íconos, filtro de texto, bloqueo después de darse,
 * 30 activos y 100 en total, 20 guardados por hora), dar (nunca a uno mismo, cupos Única/Selecta/Abierta por periodo y
 * división, por equipo, 15 por jugador al año, 60 por liga en 30 días, 60 por cuenta por hora, push), deshacer y
 * retirar, quién ve qué (RLS y columnas privadas), el perfil público (6 cuentas y 14 días), reportes y moderación,
 * fusiones de jugadores y ligas con menores.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { league, makeWorld, member, player, type World } from './fixture';
import { BADGE_ICON_KEYS } from '../../src/badges/visual/icons';

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

type Json = Record<string, unknown>;
interface Design {
  id: string;
  leagueId: string;
  name: string;
  description: string;
  shape: string;
  palette: string;
  color: string | null;
  icon: string;
  topText: string;
  periodText: string;
  template: string | null;
  limitKind: string;
  byTeam: boolean;
  status: string;
  given: number;
  active: number;
  locked: boolean;
}
interface GivenAward {
  id: string;
  playerId: string;
  teamId: string | null;
  period: string;
  division: string;
  note: string;
}
interface LeagueAward {
  id: string;
  badgeId: string;
  leagueId: string;
  leagueName: string;
  sport: string;
  playerId: string;
  period: string;
  division: string;
  hidden: boolean;
  note: string | null;
  seenAt: string | null;
  badge: Json;
}
interface Holder {
  id: string;
  playerId: string;
  playerName: string;
  hidden: boolean;
  revokedAt: string | null;
  note: string | null;
  awardedBy: string | null;
  awardedByName: string | null;
  revokeReason: string | null;
  canUndo: boolean;
}

const NEW_RPC = [
  'admin_badge_reports',
  'admin_blocked_terms',
  'admin_resolve_badge_reports',
  'archive_league_badge',
  'award_league_badge',
  'delete_league_badge',
  'hide_league_badge',
  'league_badge_holders',
  'mark_league_badges_seen',
  'report_badge',
  'report_league_badge',
  'revoke_league_badge_award',
  'save_league_badge',
  'set_badge_policy',
  'set_league_badge_hidden',
  'set_member_badge_maker',
];

const CAMPEON = { name: 'Campeón', shape: 'shield', palette: 'oro', icon: 'trophy', limit_kind: 'unica', period_text: 'TEMP 2026' };

/** Guarda un diseño (nuevo con p_id null). */
const save = (who: string, lid: string, design: Json, id: string | null = null) =>
  db.rpc<Design>(who, 'save_league_badge', { p_league: lid, p_id: id, p_design: design });
/** Crea un diseño con lo de CAMPEON más `extra`; devuelve su id. */
const makeDesign = async (who: string, lid: string, extra: Json = {}) => (await save(who, lid, { ...CAMPEON, ...extra })).id;
/** Da una insignia. */
const give = (who: string, badge: string, players: string[], extra: Json = {}) =>
  db.rpc<{ awards: GivenAward[]; notified: number }>(who, 'award_league_badge', { p_badge: badge, p_players: players, ...extra });
const giveOne = async (who: string, badge: string, pid: string, extra: Json = {}) => (await give(who, badge, [pid], extra)).awards[0].id;
const holders = (who: string, badge: string) =>
  db.rpc<{ badge: Design & { openReports?: number }; canGive: boolean; awards: Holder[] }>(who, 'league_badge_holders', { p_badge: badge });
const profile = (who: string, target: string) =>
  db.rpc<{ leagueAwards: LeagueAward[]; leagueTruncated: boolean } | null>(who, 'profile_badges', { p_user: target });
const awardRow = async (id: string) =>
  (
    await db.admin<Json>(
      `select id, player_id, team_id, period, division, note, awarded_by, revoked_by, revoke_reason, hidden,
              revoked_at is not null as revoked, seen_at is not null as seen
         from public.league_badge_awards where id = $1`,
      [id],
    )
  )[0];
const designIds = async (who: string) => (await db.as<{ id: string }>(who, 'select id from public.league_badges order by id')).map((r) => r.id);
const awardIds = async (who: string) => (await db.as<{ id: string }>(who, 'select id from public.league_badge_awards order by id')).map((r) => r.id);
const sorted = (ids: string[]) => [...ids].sort();
let phoneN = 0;
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/creador-${++phoneN}`,
  ]);
const pushes = (uid: string) =>
  db.admin<{ title: string; body: string; url: string; tag: string }>('select title, body, url, tag from public.push_outbox where user_id = $1 order by id', [
    uid,
  ]);
const textOk = async (t: string) => (await db.admin<{ ok: boolean }>('select private.badge_text_ok($1) as ok', [t]))[0].ok;
/** n jugadores sin cuenta en la liga. */
const guests = async (lid: string, n: number, prefix = 'J') =>
  (await db.admin<{ id: string }>(`insert into public.players (league_id, name) select $1, $2 || i from generate_series(1, $3) i returning id`, [lid, prefix, n])).map(
    (r) => r.id,
  );
/** Diseños crudos (como superusuario, sin límite de ritmo). */
const rawDesigns = (lid: string, n: number, status = 'activa') =>
  db.admin(`insert into public.league_badges (league_id, name, shape, palette, icon, status) select $1, 'Diseño ' || i, 'hex', 'oro', 'star', $3 from generate_series(1, $2) i`, [
    lid,
    n,
    status,
  ]);
/** Otorgamientos crudos de un diseño a un jugador, con periodos p1…pn. */
const rawAwards = (badge: string, lid: string, pid: string, n: number, opts: { by?: string | null; ago?: string; revoked?: boolean; prefix?: string } = {}) =>
  db.admin(
    `insert into public.league_badge_awards (badge_id, league_id, player_id, period, awarded_by, awarded_at, revoked_at)
     select $1, $2, $3, $4 || i, $5, now() - $6::interval, case when $7 then now() end from generate_series(1, $8) i`,
    [badge, lid, pid, opts.prefix ?? 'p', opts.by ?? null, opts.ago ?? '0 seconds', opts.revoked ?? false, n],
  );

/** Liga privada con menores de org, con luis (adulto con cuenta) y un menor. */
async function kidsLeague() {
  const kids = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', hasMinors: true, requirePhoto: false });
  await member(db, kids, w.u.org, 'owner', 'org');
  await member(db, kids, w.u.luis, 'member', 'luis');
  const luis = await player(db, kids, 'Luis', w.u.luis);
  const [{ id: kid }] = await db.admin<{ id: string }>(`insert into public.players (league_id, name, is_minor) values ($1, 'Nene', true) returning id`, [kids]);
  return { kids, luis, kid };
}

describe('permisos', () => {
  it('las RPC nuevas: solo con sesión, security definer y pasan por require_uid (o require_super)', async () => {
    const rows = await db.admin<{ fn: string; definer: boolean; anon: boolean; auth: boolean; uid: boolean }>(
      `select p.proname as fn, p.prosecdef as definer, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              (p.prosrc like '%private.require_uid()%' or p.prosrc like '%private.require_super()%') as uid
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = any ($1) order by 1`,
      [NEW_RPC],
    );
    expect(rows).toEqual(NEW_RPC.map((fn) => ({ fn, definer: true, anon: false, auth: true, uid: true })));
    await fails(db.rpc(ANON, 'league_badge_holders', { p_badge: w.priv }), '42501');
    await fails(db.rpc(ANON, 'save_league_badge', { p_league: w.pub, p_id: null, p_design: CAMPEON }), '42501');
    for (const sql of ['select private.can_badges($1)', 'select private.league_badges_public($1)', 'select private.badge_text_ok($1::text)']) {
      await fails(db.as(w.u.org, sql, [w.priv]), '42501');
    }
  });

  it('las tablas tienen RLS, nadie escribe directo y lo privado de un otorgamiento no se lee directo', async () => {
    const rls = await db.admin<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('league_badges', 'league_badge_awards') order by 1`,
    );
    expect(rls).toEqual(['league_badge_awards', 'league_badges'].map((relname) => ({ relname, rls: true })));
    const badge = await makeDesign(w.u.org, w.priv);
    const id = await giveOne(w.u.org, badge, w.p.luis, { p_note: 'Por tu 279' });
    for (const who of [w.u.luis, w.u.org, w.u.dios]) {
      await fails(db.as(who, `update public.league_badges set name = 'Otra' where id = $1`, [badge]), '42501');
      await fails(db.as(who, `delete from public.league_badge_awards where id = $1`, [id]), '42501');
      await fails(db.as(who, `insert into public.league_badges (league_id, name, shape, palette, icon) values ($1, 'Xyz', 'hex', 'oro', 'star')`, [w.priv]), '42501');
      await fails(db.as(who, `update public.leagues set badge_makers = 'owner' where id = $1`, [w.priv]), '42501');
      await fails(db.as(who, `update public.league_members set badge_maker = true where league_id = $1`, [w.priv]), '42501');
      // Nota, quién la dio y el motivo del retiro: solo por RPC (tampoco con *).
      for (const col of ['note', 'awarded_by', 'revoked_by', 'revoke_reason', 'seen_at', '*']) {
        await fails(db.as(who, `select ${col} from public.league_badge_awards`), '42501');
      }
    }
    expect(await db.asUser(w.u.ana, 'select id, player_id, period, hidden from public.league_badge_awards')).toEqual([
      { id, player_id: w.p.luis, period: 'TEMP 2026', hidden: false },
    ]);
  });

  it('la política de la liga: admins (por defecto), solo el dueño, o los elegidos', async () => {
    expect(await db.admin('select badge_makers from public.leagues where id = $1', [w.priv])).toEqual([{ badge_makers: 'admins' }]);
    const can = async (who: string) => {
      try {
        await makeDesign(who, w.priv, { name: `Prueba ${Math.random().toString(36).slice(2, 8)}` });
        return true;
      } catch (e) {
        expect((e as Error).message).toBe('no_permitido');
        return false;
      }
    };
    // 'admins': dueño, admins y superadmin; un miembro no (aunque esté marcado).
    await db.rpc(w.u.org, 'set_member_badge_maker', { p_league: w.priv, p_user: w.u.luis, p_on: true });
    expect([await can(w.u.org), await can(w.u.sofi), await can(w.u.luis), await can(w.u.ana), await can(w.u.otro), await can(w.u.dios)]).toEqual([
      true, true, false, false, false, true,
    ]);
    // 'owner': solo el dueño (y el superadmin).
    expect(await db.rpc(w.u.org, 'set_badge_policy', { p_league: w.priv, p_policy: 'owner' })).toBe('owner');
    expect([await can(w.u.org), await can(w.u.sofi), await can(w.u.luis), await can(w.u.dios)]).toEqual([true, false, false, true]);
    // 'chosen': el dueño y los marcados (un admin sin marca, no).
    await db.rpc(w.u.org, 'set_badge_policy', { p_league: w.priv, p_policy: 'chosen' });
    expect([await can(w.u.org), await can(w.u.sofi), await can(w.u.luis), await can(w.u.ana)]).toEqual([true, false, true, false]);
    await db.rpc(w.u.org, 'set_member_badge_maker', { p_league: w.priv, p_user: w.u.sofi, p_on: true });
    await db.rpc(w.u.org, 'set_member_badge_maker', { p_league: w.priv, p_user: w.u.luis, p_on: false });
    expect([await can(w.u.sofi), await can(w.u.luis)]).toEqual([true, false]);
    // Solo el dueño cambia la política y las marcas.
    await fails(db.rpc(w.u.sofi, 'set_badge_policy', { p_league: w.priv, p_policy: 'admins' }), DENIED);
    await fails(db.rpc(w.u.sofi, 'set_member_badge_maker', { p_league: w.priv, p_user: w.u.ana, p_on: true }), DENIED);
    await fails(db.rpc(w.u.org, 'set_badge_policy', { p_league: w.priv, p_policy: 'todos' }), 'invalido');
    await fails(db.rpc(w.u.org, 'set_badge_policy', { p_league: '00000000-0000-0000-0000-000000000000', p_policy: 'owner' }), 'no_existe');
    await fails(db.rpc(w.u.org, 'set_member_badge_maker', { p_league: w.priv, p_user: w.u.extra, p_on: true }), 'no_existe');
    expect(await db.rpc(w.u.dios, 'set_badge_policy', { p_league: w.priv, p_policy: 'admins' })).toBe('admins');
    // La vista de membresías lo dice.
    expect(await db.asUser(w.u.sofi, 'select badge_maker from public.memberships where league_id = $1 and user_id = $2', [w.priv, w.u.sofi])).toEqual([
      { badge_maker: true },
    ]);
  });

  it('remove_member: un admin no saca a quien diseña insignias (el dueño sí)', async () => {
    await db.rpc(w.u.org, 'set_member_badge_maker', { p_league: w.priv, p_user: w.u.ana, p_on: true });
    await fails(db.rpc(w.u.sofi, 'remove_member', { p_league: w.priv, p_user: w.u.ana }), DENIED);
    await db.rpc(w.u.sofi, 'remove_member', { p_league: w.priv, p_user: w.u.luis });
    await db.rpc(w.u.org, 'remove_member', { p_league: w.priv, p_user: w.u.ana });
    expect(await db.count('public.league_members', 'league_id = $1 and user_id = any ($2)', [w.priv, [w.u.ana, w.u.luis]])).toBe(0);
  });
});

describe('diseños', () => {
  it('crear y editar: largos, formas, colores, íconos; los textos quedan limpios', async () => {
    const d = await save(w.u.sofi, w.priv, { ...CAMPEON, name: '  Campeona   del  año ', description: 'Primera\nen la  temporada', top_text: 'CAMPEONA', template: 'champion' });
    expect(d).toMatchObject({
      leagueId: w.priv, name: 'Campeona del año', description: 'Primera en la temporada', shape: 'shield', palette: 'oro', color: null,
      icon: 'trophy', topText: 'CAMPEONA', periodText: 'TEMP 2026', template: 'champion', limitKind: 'unica', byTeam: false,
      status: 'activa', given: 0, active: 0, locked: false,
    });
    expect(await db.admin('select created_by from public.league_badges where id = $1', [d.id])).toEqual([{ created_by: w.u.sofi }]);
    // Editar: solo lo que viene. «Otro color» lleva hex (queda en minúsculas); un metal lo quita.
    expect(await save(w.u.org, w.priv, { palette: 'color', color: '#FACC15' }, d.id)).toMatchObject({ palette: 'color', color: '#facc15', name: 'Campeona del año' });
    expect(await save(w.u.org, w.priv, { palette: 'plata' }, d.id)).toMatchObject({ palette: 'plata', color: null });
    // Un id nuevo del teléfono crea con ese id (reintentar lo deja igual).
    const mine = '11111111-2222-4333-8444-555555555555';
    expect((await save(w.u.org, w.priv, CAMPEON, mine)).id).toBe(mine);
    expect((await save(w.u.org, w.priv, CAMPEON, mine)).id).toBe(mine);
    await fails(save(w.u.otro, w.pub, CAMPEON, mine), 'no_existe');
    const bad: Json[] = [
      { ...CAMPEON, name: 'AB' },
      { ...CAMPEON, name: 'X'.repeat(29) },
      { ...CAMPEON, name: 42 },
      { ...CAMPEON, description: 'x'.repeat(141) },
      { ...CAMPEON, top_text: 'X'.repeat(15) },
      { ...CAMPEON, period_text: 'TEMPORADA 26' },
      { ...CAMPEON, shape: 'triangle' },
      { ...CAMPEON, palette: 'cobre' },
      { ...CAMPEON, palette: 'color' },
      { ...CAMPEON, palette: 'color', color: 'rojo' },
      { ...CAMPEON, icon: 'dollar-sign' },
      { ...CAMPEON, icon: null },
      { ...CAMPEON, template: 'Campeón' },
      { ...CAMPEON, limit_kind: 'doble' },
      { ...CAMPEON, status: 'oculta' },
      { ...CAMPEON, by_team: 'si' },
      { ...CAMPEON, rarity: 'rara' },
      { name: 'Sin forma', palette: 'oro', icon: 'star' },
    ];
    for (const design of bad) await fails(save(w.u.org, w.priv, design), 'invalido');
    await fails(db.rpc(w.u.org, 'save_league_badge', { p_league: w.priv, p_id: null, p_design: [] }), 'invalido');
    // Por equipo: solo en deportes de equipo y parejas.
    await fails(save(w.u.org, w.priv, { ...CAMPEON, by_team: true }), 'invalido');
    const fut = await league(db, w.u.org, { name: 'Fútbol', visibility: 'private', sport: 'football', requirePhoto: false });
    await member(db, fut, w.u.org, 'owner', 'org');
    expect(await save(w.u.org, fut, { ...CAMPEON, by_team: true })).toMatchObject({ byTeam: true });
    await fails(save(w.u.org, '00000000-0000-0000-0000-000000000000', CAMPEON), 'no_existe');
  });

  it('los 52 íconos curados son los de src/badges/visual/icons.ts', async () => {
    expect(BADGE_ICON_KEYS).toHaveLength(52);
    for (const key of BADGE_ICON_KEYS) {
      expect(await db.admin('select private.badge_icon_ok($1) as ok', [key]), key).toEqual([{ ok: true }]);
    }
    const [{ n }] = await db.admin<{ n: number }>(
      `select count(*)::int as n from pg_proc p, regexp_matches(p.prosrc, '''[a-z0-9-]+''', 'g') where p.proname = 'badge_icon_ok'`,
    );
    expect(n).toBe(52);
    expect(await db.admin(`select private.badge_icon_ok('dollar-sign') as a, private.badge_icon_ok(null) as b`)).toEqual([{ a: false, b: false }]);
  });

  it('el filtro de texto: caracteres, enlaces, teléfonos, repeticiones y palabras bloqueadas', async () => {
    for (const t of ['', 'Campeón', 'Ñoño del año', '¡Qué jugada!', '¿Quién? (Cat. A) + "B" & #1 / 2', "D'León", 'TEMP 26/27', 'Temporada 2025-2026', 'Por tu 279 en la final', 'Club de los 1000', 'Cigua palmera', 'www', 'Montones de strikes']) {
      expect(await textOk(t), t).toBe(true);
    }
    for (const t of ['Campeón 🏆', 'Línea rara', 'a_b', 'mi@correo', 'http://x', 'Ve a www.x', 'liga.com', 'algo.do', 'Mira liga.com/x', '8095551234', '809-555-1234', '(809) 555-1234', '555 1234', 'Goool!!!!', 'Siiiii', 'AAAA']) {
      expect(await textOk(t), t).toBe(false);
    }
    // La lista base viene cargada: insultos de aquí y de afuera, sin tocar palabras sanas que los contienen.
    for (const t of ['Hijo de puta', 'Pendejo', 'Mamagu3v0', 'Put0s', 'C o m e m i e r d a', 'Pinga', 'Cabrón del año', 'Nazi']) {
      expect(await textOk(t), t).toBe(false);
    }
    for (const t of ['La disputa', 'Ridículo', 'Singapur', 'Computadora', 'Pingüino', 'Perrazo']) expect(await textOk(t), t).toBe(true);
    await db.admin('delete from private.blocked_terms');
    // Palabras: en cualquier parte (con leetspeak y separadores) o solo enteras.
    const terms = await db.rpc<{ term: string; whole: boolean }[]>(w.u.dios, 'admin_blocked_terms', { p_add: ['Grosero', 'gr0s3r0'] });
    expect(terms).toEqual([{ term: 'grosero', whole: false, createdAt: expect.any(String) }]);
    await db.rpc(w.u.dios, 'admin_blocked_terms', { p_add: ['tonto'], p_whole: true });
    for (const t of ['Grosero', 'Súper grosero', 'g.r.o.s.e.r.o', 'G r 0 s 3 r 0', 'Supergrosero', 'El Tonto', 'Los t0nt0s', 'T-O-N-T-O']) {
      expect(await textOk(t), t).toBe(false);
    }
    for (const t of ['Montones', 'Tontería no', 'Groso']) expect(await textOk(t), t).toBe(true);
    // En las RPC: «Ese texto no se puede usar.» (nunca repite la palabra).
    await fails(save(w.u.org, w.priv, { ...CAMPEON, name: 'Premio Grosero' }), 'texto_bloqueado');
    await fails(save(w.u.org, w.priv, { ...CAMPEON, description: 'Llama al 809-555-1234' }), 'texto_bloqueado');
    await fails(save(w.u.org, w.priv, { ...CAMPEON, top_text: '🏆' }), 'texto_bloqueado');
    const badge = await makeDesign(w.u.org, w.priv);
    await fails(give(w.u.org, badge, [w.p.luis], { p_note: 'Mira liga.com' }), 'texto_bloqueado');
    await fails(give(w.u.org, badge, [w.p.luis], { p_division: 'El tonto' }), 'texto_bloqueado');
    // Quitar una palabra; las listas solo las maneja el superadmin (y queda en la auditoría).
    expect(await db.rpc(w.u.dios, 'admin_blocked_terms', { p_remove: ['GROSERO'] })).toEqual([{ term: 'tonto', whole: true, createdAt: expect.any(String) }]);
    expect(await textOk('Grosero')).toBe(true);
    await fails(db.rpc(w.u.org, 'admin_blocked_terms', {}), DENIED);
    await fails(db.rpc(w.u.dios, 'admin_blocked_terms', { p_add: ['x'] }), 'invalido');
    expect(await db.count('public.admin_audit', `action = 'blocked_terms'`)).toBe(3);
  });

  it('límites: 30 activos, 100 en total y 20 guardados por hora por cuenta', async () => {
    await rawDesigns(w.priv, 29);
    const last = await makeDesign(w.u.org, w.priv);
    await fails(makeDesign(w.u.org, w.priv), 'limite: activas');
    // Archivada sí se crea; activarla con 30 activos, no.
    const archived = (await save(w.u.org, w.priv, { ...CAMPEON, status: 'archivada' })).id;
    await fails(db.rpc(w.u.org, 'archive_league_badge', { p_id: archived, p_archived: false }), 'limite: activas');
    await fails(save(w.u.org, w.priv, { status: 'activa' }, archived), 'limite: activas');
    expect(await db.rpc(w.u.org, 'archive_league_badge', { p_id: last, p_archived: true })).toBe('archivada');
    expect(await db.rpc(w.u.org, 'archive_league_badge', { p_id: archived, p_archived: false })).toBe('activa');
    // 100 contando archivados.
    await rawDesigns(w.priv, 68, 'archivada');
    expect(await db.count('public.league_badges', 'league_id = $1', [w.priv])).toBe(99);
    await save(w.u.sofi, w.priv, { ...CAMPEON, status: 'archivada' });
    await fails(save(w.u.sofi, w.priv, { ...CAMPEON, status: 'archivada' }), 'limite: total');
    // Ritmo: 20 guardados por hora por cuenta (org ya lleva 2 que salieron bien; los que fallan no cuentan).
    for (let i = 0; i < 18; i++) await save(w.u.org, w.priv, { description: `Versión ${i}` }, last);
    await fails(save(w.u.org, w.priv, { description: 'Una más' }, last), 'rate_limited');
    await save(w.u.sofi, w.priv, { description: 'Otra cuenta' }, last);
  });

  it('un diseño que ya se dio queda bloqueado: solo cambian la descripción y el estado; no se borra', async () => {
    const badge = await makeDesign(w.u.org, w.priv);
    const unused = await makeDesign(w.u.org, w.priv, { name: 'Sin usar' });
    const id = await giveOne(w.u.org, badge, w.p.luis);
    for (const change of [{ name: 'Insulto' }, { icon: 'star' }, { palette: 'plata' }, { limit_kind: 'abierta' }, { period_text: 'TEMP 2027' }, { top_text: 'X' }, { template: 'mvp' }]) {
      await fails(save(w.u.org, w.priv, change, badge), 'ya_dada');
    }
    // Lo mismo que ya tenía (el editor manda todo) sí pasa.
    expect(await save(w.u.org, w.priv, { ...CAMPEON, description: 'Primero en la tabla' }, badge)).toMatchObject({
      description: 'Primero en la tabla', given: 1, active: 1, locked: true,
    });
    expect(await save(w.u.org, w.priv, { status: 'archivada' }, badge)).toMatchObject({ status: 'archivada' });
    await fails(db.rpc(w.u.org, 'delete_league_badge', { p_id: badge }), 'ya_dada');
    // Retirada también cuenta como dada.
    await db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: id });
    await fails(save(w.u.org, w.priv, { name: 'Otro nombre' }, badge), 'ya_dada');
    // La que nunca se dio se borra (tombstone); sin permiso, no.
    await fails(db.rpc(w.u.luis, 'delete_league_badge', { p_id: unused }), DENIED);
    await db.rpc(w.u.sofi, 'delete_league_badge', { p_id: unused });
    expect(await db.admin(`select row_key, league_id from public.tombstones where tbl = 'league_badges'`)).toEqual([{ row_key: unused, league_id: w.priv }]);
    await fails(db.rpc(w.u.sofi, 'delete_league_badge', { p_id: unused }), 'no_existe');
    await fails(db.rpc(w.u.luis, 'archive_league_badge', { p_id: badge, p_archived: false }), DENIED);
    await fails(db.rpc(w.u.org, 'archive_league_badge', { p_id: badge, p_archived: null }), 'invalido');
  });
});

describe('dar', () => {
  it('nadie se la da a sí mismo (tampoco el dueño ni el superadmin)', async () => {
    const badge = await makeDesign(w.u.org, w.priv, { limit_kind: 'abierta' });
    const orgP = await player(db, w.priv, 'Org', w.u.org);
    const sofiP = await player(db, w.priv, 'Sofi', w.u.sofi);
    await member(db, w.priv, w.u.dios, 'member', 'dios');
    const diosP = await player(db, w.priv, 'Dios', w.u.dios);
    await fails(give(w.u.org, badge, [orgP]), 'a_si_mismo');
    await fails(give(w.u.org, badge, [w.p.luis, orgP]), 'a_si_mismo');
    await fails(give(w.u.sofi, badge, [sofiP]), 'a_si_mismo');
    await fails(give(w.u.dios, badge, [diosP]), 'a_si_mismo');
    expect(await db.count('public.league_badge_awards')).toBe(0);
    // Otro con permiso sí: el dueño de una liga de uno no puede fabricarse un «Campeón».
    await give(w.u.sofi, badge, [orgP]);
    await give(w.u.org, badge, [sofiP, diosP]);
    expect(await db.count('public.league_badge_awards')).toBe(3);
  });

  it('tampoco dándosela a un jugador sin cuenta que después reclama o vincula: se retira; el aval que se dio a sí mismo vuelve a revisión', async () => {
    const badge = await makeDesign(w.u.org, w.priv, { limit_kind: 'abierta' });
    // sofi (admin) le da «Campeón» a Juan, sin cuenta, y después dice que es ella: su reclamo se aprueba al instante.
    const juan = await player(db, w.priv, 'Juan');
    const self = await giveOne(w.u.sofi, badge, juan);
    const byOther = await giveOne(w.u.org, badge, juan, { p_period: 'TEMP 2025' });
    await db.rpc(w.u.sofi, 'request_player_claim', { p_player: juan });
    expect(await db.admin('select user_id from public.players where id = $1', [juan])).toEqual([{ user_id: w.u.sofi }]);
    expect(await awardRow(self)).toMatchObject({ revoked: true, revoked_by: null, revoke_reason: 'Se la dio la misma cuenta' });
    expect(await awardRow(byOther)).toMatchObject({ revoked: false });
    expect((await profile(w.u.sofi, w.u.sofi))!.leagueAwards.map((x) => x.id)).toEqual([byOther]);
    // link_account_to_player con su propia cuenta: igual.
    const pepe = await player(db, w.priv, 'Pepe');
    const own = await giveOne(w.u.org, badge, pepe);
    await db.rpc(w.u.org, 'link_account_to_player', { p_player: pepe, p_user: w.u.org });
    expect(await awardRow(own)).toMatchObject({ revoked: true });
    // Un aval: ana (admin) confirma el 300 de Tito, sin cuenta, y después lo reclama: vuelve a revisión para otro.
    await db.admin(`update public.league_members set role = 'admin' where league_id = $1 and user_id = $2`, [w.priv, w.u.ana]);
    const tito = await player(db, w.priv, 'Tito');
    const [{ id: feat }] = await db.admin<{ id: string }>(
      `insert into public.badge_awards (badge_key, sport, level, period_key, player_id, league_id, status)
       values ('bowling_perfect_game', 'bowling', 0, 'g:z:0', $1, $2, 'en_revision') returning id`,
      [tito, w.priv],
    );
    expect(await db.rpc(w.u.ana, 'review_badge', { p_award: feat, p_ok: true })).toBe('firme');
    await db.rpc(w.u.ana, 'request_player_claim', { p_player: tito });
    const back = (await db.admin<{ status: string; firm_at: string | null; context: Json }>('select status, firm_at, context from public.badge_awards where id = $1', [feat]))[0];
    expect(back).toMatchObject({ status: 'en_revision', firm_at: null });
    expect(back.context).not.toHaveProperty('review');
    // Otro la puede confirmar; ella ya no (es su jugador).
    await fails(db.rpc(w.u.ana, 'review_badge', { p_award: feat, p_ok: true }), DENIED);
    expect(await db.rpc(w.u.org, 'review_badge', { p_award: feat, p_ok: true })).toBe('firme');
  });

  it('cupos por insignia, periodo y división: Única 1, Selecta 3, Abierta 20; ya la tiene: duplicado', async () => {
    const anaP = await player(db, w.priv, 'Ana', w.u.ana);
    const unica = await makeDesign(w.u.org, w.priv);
    const first = await give(w.u.org, unica, [w.p.luis], { p_note: '  Por tu 279  en la final ' });
    expect(first.awards).toEqual([
      expect.objectContaining({ playerId: w.p.luis, teamId: null, period: 'TEMP 2026', division: '', note: 'Por tu 279 en la final', awardedBy: w.u.org, hidden: false, revokedAt: null }),
    ]);
    await fails(give(w.u.org, unica, [w.p.pedro]), 'cupo_lleno');
    await fails(give(w.u.org, unica, [w.p.luis]), 'duplicado');
    // Otro periodo u otra división: otro cupo.
    await give(w.u.org, unica, [w.p.pedro], { p_period: 'TEMP 2027' });
    await give(w.u.org, unica, [w.p.pedro], { p_division: 'Cat. A' });
    await fails(give(w.u.org, unica, [anaP], { p_division: 'Cat. A' }), 'cupo_lleno');
    // Periodo y división se comparan sin mayúsculas, tildes ni signos: el cupo no se esquiva con «temp 2026.» o «cat a».
    await fails(give(w.u.org, unica, [anaP], { p_period: 'temp 2026.' }), 'cupo_lleno');
    await fails(give(w.u.org, unica, [anaP], { p_division: 'cat a' }), 'cupo_lleno');
    await fails(give(w.u.org, unica, [w.p.luis], { p_period: 'Temp-2026' }), 'duplicado');
    // Retirada deja el cupo libre.
    await db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: first.awards[0].id });
    await give(w.u.org, unica, [anaP]);

    const selecta = await makeDesign(w.u.org, w.priv, { name: 'Juego limpio', limit_kind: 'selecta' });
    await fails(give(w.u.org, selecta, [w.p.luis, w.p.pedro, anaP, (await guests(w.priv, 1))[0]]), 'cupo_lleno');
    await give(w.u.org, selecta, [w.p.luis, w.p.pedro, w.p.luis]);
    await give(w.u.org, selecta, [anaP]);
    await fails(give(w.u.org, selecta, [(await guests(w.priv, 1, 'K'))[0]]), 'cupo_lleno');

    const abierta = await makeDesign(w.u.org, w.priv, { name: 'Asistencia perfecta', limit_kind: 'abierta' });
    const many = await guests(w.priv, 21, 'A');
    await give(w.u.org, abierta, many.slice(0, 20));
    await fails(give(w.u.org, abierta, [many[20]]), 'cupo_lleno');
    expect(await db.count('public.league_badge_awards', 'badge_id = $1', [abierta])).toBe(20);
  });

  it('por equipo: se da a la plantilla y el equipo cuenta 1', async () => {
    const fut = await league(db, w.u.org, { name: 'Fútbol', visibility: 'private', sport: 'football', requirePhoto: false });
    await member(db, fut, w.u.org, 'owner', 'org');
    const ps = await guests(fut, 12, 'F');
    const team = (name: string, members: string[]) =>
      db.rpc<string>(w.u.org, 'create_season_team', { p_league: fut, p_name: name, p_players: members.map((player_id) => ({ player_id })) });
    const [a, b, c, d] = [await team('Tigres', ps.slice(0, 3)), await team('Leones', ps.slice(3, 6)), await team('Águilas', ps.slice(6, 9)), await team('Toros', ps.slice(9, 12))];
    const badge = await makeDesign(w.u.org, fut, { name: 'Juego limpio', limit_kind: 'selecta', by_team: true });
    const given = await give(w.u.org, badge, ps.slice(0, 2), { p_team: a });
    expect(given.awards.map((x) => x.teamId)).toEqual([a, a]);
    // El que faltó del mismo equipo no gasta cupo.
    await give(w.u.org, badge, [ps[2]], { p_team: a });
    await give(w.u.org, badge, ps.slice(3, 6), { p_team: b });
    await give(w.u.org, badge, ps.slice(6, 9), { p_team: c });
    await fails(give(w.u.org, badge, ps.slice(9, 12), { p_team: d }), 'cupo_lleno');
    // Solo su plantilla; el equipo es obligatorio y de la liga.
    await fails(give(w.u.org, badge, [ps[0]], { p_team: d, p_period: 'TEMP 2027' }), 'invalido');
    await fails(give(w.u.org, badge, [ps[9]], { p_period: 'TEMP 2027' }), 'invalido');
    const otherTeam = await db.admin<{ id: string }>(`insert into public.teams (league_id, event_id, name) values ($1, $2, 'Equipo') returning id`, [w.priv, w.e.e1]);
    await fails(give(w.u.org, badge, [ps[9]], { p_team: otherTeam[0].id, p_period: 'TEMP 2027' }), 'no_existe');
    // Sin by_team no lleva equipo.
    const solo = await makeDesign(w.u.org, fut, { name: 'Goleador' });
    await fails(give(w.u.org, solo, [ps[0]], { p_team: a }), 'invalido');
    // Borrar el equipo deja el otorgamiento (sin equipo).
    await db.admin('delete from public.teams where id = $1', [a]);
    expect(await db.admin('select count(*)::int as n, count(team_id)::int as t from public.league_badge_awards where badge_id = $1 and player_id = any ($2)', [badge, ps.slice(0, 3)])).toEqual([{ n: 3, t: 0 }]);
  });

  it('15 vigentes por jugador, liga y año; 60 por liga en 30 días; 60 por cuenta por hora', async () => {
    const anaP = await player(db, w.priv, 'Ana', w.u.ana);
    const bulk = await makeDesign(w.u.org, w.priv, { name: 'Montón', limit_kind: 'abierta' });
    const badge = await makeDesign(w.u.org, w.priv, { name: 'Otra', limit_kind: 'abierta' });
    // Jugador: las del año pasado y las retiradas no cuentan.
    await rawAwards(bulk, w.priv, w.p.luis, 14, { prefix: 'a' });
    await rawAwards(bulk, w.priv, w.p.luis, 5, { prefix: 'v', ago: '400 days' });
    await rawAwards(bulk, w.priv, w.p.luis, 5, { prefix: 'r', revoked: true });
    await give(w.u.org, badge, [w.p.luis]);
    await fails(give(w.u.org, badge, [w.p.luis, w.p.pedro], { p_period: 'OTRA' }), 'limite: jugador');
    await db.admin(`update public.league_badge_awards set revoked_at = now() where player_id = $1 and period = 'a1'`, [w.p.luis]);
    await give(w.u.org, badge, [w.p.luis], { p_period: 'OTRA' });

    // Liga: 60 en 30 días (también las retiradas; las de hace más de 30 días no).
    const n30 = await db.count('public.league_badge_awards', `league_id = $1 and awarded_at > now() - interval '30 days'`, [w.priv]);
    await rawAwards(bulk, w.priv, w.p.pedro, 58 - n30, { prefix: 'q', revoked: true });
    await rawAwards(bulk, w.priv, w.p.pedro, 10, { prefix: 'z', revoked: true, ago: '31 days' });
    await fails(give(w.u.sofi, badge, [w.p.pedro, anaP, (await guests(w.priv, 1))[0]]), 'limite: liga');
    await give(w.u.sofi, badge, [w.p.pedro, anaP]);
    await fails(give(w.u.sofi, badge, [(await guests(w.priv, 1, 'L'))[0]]), 'limite: liga');

    // Cuenta: 60 por hora en todas sus ligas (también las retiradas; las de hace 2 h no).
    const other = await league(db, w.u.otro, { name: 'Otra liga', visibility: 'private' });
    await member(db, other, w.u.otro, 'owner', 'otro');
    const otherBadge = (await db.admin<{ id: string }>(`insert into public.league_badges (league_id, name, shape, palette, icon) values ($1, 'Otra', 'hex', 'oro', 'star') returning id`, [other]))[0].id;
    const [otherP] = await guests(other, 1, 'O');
    await rawAwards(otherBadge, other, otherP, 58, { by: w.u.otro, revoked: true, prefix: 'h' });
    await rawAwards(otherBadge, other, otherP, 20, { by: w.u.otro, revoked: true, prefix: 'o', ago: '2 hours' });
    const three = await guests(w.pub, 3, 'P');
    const otroBadge = await makeDesign(w.u.otro, w.pub, { name: 'Del dueño', limit_kind: 'abierta' });
    await fails(give(w.u.otro, otroBadge, three.slice(0, 3)), 'rate_limited');
    await give(w.u.otro, otroBadge, three.slice(0, 2));
    await fails(give(w.u.otro, otroBadge, [three[2]]), 'rate_limited');
  });

  it('otras reglas: diseño activo, jugadores de la liga, 1–30, largos y el periodo del diseño', async () => {
    const badge = await makeDesign(w.u.org, w.priv, { limit_kind: 'abierta' });
    await fails(give(w.u.luis, badge, [w.p.pedro]), DENIED);
    await fails(give(w.u.otro, badge, [w.p.pedro]), DENIED);
    await fails(give(w.u.org, badge, [w.p.p1]), 'no_existe');
    await fails(give(w.u.org, '00000000-0000-0000-0000-000000000000', [w.p.pedro]), 'no_existe');
    await fails(give(w.u.org, badge, []), 'invalido');
    await fails(db.rpc(w.u.org, 'award_league_badge', { p_badge: badge, p_players: null }), 'invalido');
    await fails(give(w.u.org, badge, await guests(w.priv, 31)), 'invalido');
    await fails(give(w.u.org, badge, [w.p.pedro], { p_period: 'TEMPORADA 26' }), 'invalido');
    await fails(give(w.u.org, badge, [w.p.pedro], { p_division: 'x'.repeat(17) }), 'invalido');
    await fails(give(w.u.org, badge, [w.p.pedro], { p_note: 'x'.repeat(141) }), INVALID);
    // Sin periodo: el del diseño; '' = sin periodo.
    expect((await give(w.u.org, badge, [w.p.pedro])).awards[0].period).toBe('TEMP 2026');
    expect((await give(w.u.org, badge, [w.p.pedro], { p_period: '' })).awards[0].period).toBe('');
    await db.rpc(w.u.org, 'archive_league_badge', { p_id: badge, p_archived: true });
    await fails(give(w.u.org, badge, [w.p.luis]), 'no_activa');
  });

  it('push al jugador con cuenta: «¡Tienes una insignia nueva!» (sin avisar, cuenta bloqueada o liga con menores: no)', async () => {
    await phone(w.u.luis);
    await phone(w.u.ana);
    const anaP = await player(db, w.priv, 'Ana', w.u.ana);
    const badge = await makeDesign(w.u.org, w.priv, { limit_kind: 'abierta' });
    const r = await give(w.u.sofi, badge, [w.p.luis, w.p.pedro]);
    expect(r.notified).toBe(1);
    const luisAward = r.awards[0].id;
    expect(await pushes(w.u.luis)).toEqual([
      {
        title: '¡Tienes una insignia nueva!',
        body: 'Liga del Banco te dio “Campeón · TEMP 2026”. Tócala para verla.',
        url: `/u/${w.u.luis}?tab=insignias`,
        tag: `insignia:${luisAward}`,
      },
    ]);
    // Sin periodo, sin el punto.
    await give(w.u.sofi, badge, [anaP], { p_period: '' });
    expect((await pushes(w.u.ana))[0].body).toBe('Liga del Banco te dio “Campeón”. Tócala para verla.');
    // «Avisarle» apagado, o cuenta bloqueada: nada.
    expect((await give(w.u.sofi, badge, [w.p.luis], { p_period: 'X1', p_notify: false })).notified).toBe(0);
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    expect((await give(w.u.sofi, badge, [w.p.luis], { p_period: 'X2' })).notified).toBe(0);
    expect(await pushes(w.u.luis)).toHaveLength(1);
    // Deshacer antes de que salga: el push se quita de la cola.
    await db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: luisAward });
    expect(await pushes(w.u.luis)).toEqual([]);
    // Liga con menores: sin push para nadie.
    const { kids, luis: kidsLuis, kid } = await kidsLeague();
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.luis });
    const kb = await makeDesign(w.u.org, kids, { limit_kind: 'abierta' });
    expect((await give(w.u.org, kb, [kidsLuis, kid])).notified).toBe(0);
    expect(await pushes(w.u.luis)).toEqual([]);
  });
});

describe('deshacer y retirar', () => {
  it('quien la dio deshace en 24 h; después (o si pierde el permiso) solo el dueño; sin rastro público', async () => {
    const badge = await makeDesign(w.u.org, w.priv, { limit_kind: 'abierta' });
    const a = await giveOne(w.u.sofi, badge, w.p.luis);
    await fails(db.rpc(w.u.ana, 'revoke_league_badge_award', { p_award: a }), DENIED);
    await fails(db.rpc(w.u.luis, 'revoke_league_badge_award', { p_award: a }), DENIED);
    await fails(db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: a, p_reason: 'x'.repeat(141) }), 'invalido');
    await db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: a });
    expect(await awardRow(a)).toMatchObject({ revoked: true, revoked_by: w.u.sofi, revoke_reason: null });
    // Ya retirada: nada.
    await db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: a });

    const b = await giveOne(w.u.sofi, badge, w.p.pedro);
    await db.admin(`update public.league_badge_awards set awarded_at = now() - interval '25 hours' where id = $1`, [b]);
    await fails(db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: b }), DENIED);
    const c = await giveOne(w.u.sofi, badge, w.p.pedro, { p_period: 'OTRA' });
    await db.rpc(w.u.org, 'set_badge_policy', { p_league: w.priv, p_policy: 'owner' });
    await fails(db.rpc(w.u.sofi, 'revoke_league_badge_award', { p_award: c }), DENIED);
    // El dueño, cuando sea y con motivo privado.
    await db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: b, p_reason: '  Se equivocó  de jugador ' });
    expect(await awardRow(b)).toMatchObject({ revoked: true, revoked_by: w.u.org, revoke_reason: 'Se equivocó de jugador' });
    // El superadmin también (con auditoría).
    await db.rpc(w.u.dios, 'revoke_league_badge_award', { p_award: c });
    expect(await db.admin(`select actor_id, target_id, detail ->> 'award' as award from public.admin_audit where action = 'revoke_league_badge'`)).toEqual([
      { actor_id: w.u.dios, target_id: w.priv, award: c },
    ]);
    // Retiradas: solo las ven los admins (con el motivo por league_badge_holders).
    expect(await awardIds(w.u.luis)).toEqual([]);
    expect(await awardIds(w.u.ana)).toEqual([]);
    expect(await awardIds(w.u.sofi)).toEqual(sorted([a, b, c]));
    const h = await holders(w.u.sofi, badge);
    expect(h.awards.find((x) => x.id === b)).toMatchObject({ revokeReason: 'Se equivocó de jugador', canUndo: false });
    expect((await holders(w.u.ana, badge)).awards).toEqual([]);
    await fails(db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: '00000000-0000-0000-0000-000000000000' }), 'no_existe');
  });
});

describe('quién ve qué', () => {
  it('diseños: quien ve la liga; los escondidos por el superadmin, solo sus admins', async () => {
    const priv = await makeDesign(w.u.org, w.priv);
    const pub = await makeDesign(w.u.otro, w.pub);
    expect(await designIds(w.u.ana)).toEqual(sorted([priv, pub]));
    expect(await designIds(w.u.extra)).toEqual([pub]);
    expect(await designIds(ANON)).toEqual([pub]);
    expect(await db.rpc(w.u.dios, 'hide_league_badge', { p_id: priv, p_hidden: true, p_note: 'Texto ofensivo' })).toBe('oculta');
    expect(await designIds(w.u.ana)).toEqual([pub]);
    expect(await designIds(w.u.luis)).toEqual([pub]);
    expect(await designIds(w.u.sofi)).toEqual(sorted([priv, pub]));
    expect(await designIds(w.u.dios)).toEqual(sorted([priv, pub]));
    await fails(holders(w.u.ana, priv), 'no_existe');
    expect((await holders(w.u.sofi, priv)).canGive).toBe(false);
    await fails(holders(w.u.extra, (await makeDesign(w.u.org, w.priv, { name: 'Otra' }))), 'no_existe');
  });

  it('otorgamientos: vigentes y no ocultos; el jugador ve los suyos ocultos; nota y quién la dio por league_badge_holders', async () => {
    const badge = await makeDesign(w.u.org, w.priv, { limit_kind: 'abierta' });
    const [luisA, pedroA] = (await give(w.u.sofi, badge, [w.p.luis, w.p.pedro], { p_note: 'Bien jugado' })).awards.map((x) => x.id);
    await db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: luisA, p_hidden: true });
    expect(await awardIds(w.u.luis)).toEqual(sorted([luisA, pedroA]));
    expect(await awardIds(w.u.ana)).toEqual([pedroA]);
    expect(await awardIds(w.u.org)).toEqual(sorted([luisA, pedroA]));
    expect(await awardIds(w.u.extra)).toEqual([]);
    // Liga pública: también sin cuenta.
    const pb = await makeDesign(w.u.otro, w.pub);
    const p1A = await giveOne(w.u.otro, pb, w.p.p1);
    expect(await awardIds(ANON)).toEqual([p1A]);

    const byAdmin = await holders(w.u.org, badge);
    expect(byAdmin.canGive).toBe(true);
    expect(byAdmin.badge).toMatchObject({ id: badge, given: 2, active: 2, locked: true, openReports: 0 });
    expect(byAdmin.awards.find((x) => x.id === luisA)).toMatchObject({
      playerName: 'Luis', hidden: true, note: 'Bien jugado', awardedBy: w.u.sofi, awardedByName: 'sofi', canUndo: true,
    });
    const byLuis = await holders(w.u.luis, badge);
    expect(byLuis.canGive).toBe(false);
    expect(byLuis.badge).not.toHaveProperty('openReports');
    expect(byLuis.awards.map((x) => [x.id, x.note, x.awardedBy, x.canUndo])).toEqual(
      expect.arrayContaining([
        [luisA, 'Bien jugado', null, false],
        [pedroA, null, null, false],
      ]),
    );
    expect((await holders(w.u.ana, badge)).awards.map((x) => x.id)).toEqual([pedroA]);
    // Quien la dio puede deshacer en 24 h.
    expect((await holders(w.u.sofi, badge)).awards.every((x) => x.canUndo)).toBe(true);
  });

  it('ocultar y ver: solo el jugador (o el superadmin, con auditoría); los avisos de las nuevas', async () => {
    const badge = await makeDesign(w.u.org, w.priv, { limit_kind: 'abierta' });
    const [luisA, pedroA] = (await give(w.u.org, badge, [w.p.luis, w.p.pedro], { p_note: 'Gracias' })).awards.map((x) => x.id);
    await fails(db.rpc(w.u.org, 'set_league_badge_hidden', { p_award: luisA, p_hidden: true }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: pedroA, p_hidden: true }), DENIED);
    await fails(db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: luisA, p_hidden: null }), 'invalido');
    await fails(db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: '00000000-0000-0000-0000-000000000000', p_hidden: true }), 'no_existe');
    expect(await db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: luisA, p_hidden: true })).toBe(true);
    expect(await db.rpc(w.u.dios, 'set_league_badge_hidden', { p_award: pedroA, p_hidden: true })).toBe(true);
    expect(await db.count('public.admin_audit', `action = 'hide_league_badge_award'`)).toBe(1);

    const n = await db.rpc<{ leagueAwards: LeagueAward[]; leagueUnseen: number; awards: unknown[] }>(w.u.luis, 'badge_notices', {});
    expect(n.leagueUnseen).toBe(1);
    expect(n.leagueAwards).toEqual([
      expect.objectContaining({ id: luisA, badgeId: badge, leagueName: 'Liga del Banco', sport: 'bowling', period: 'TEMP 2026', note: 'Gracias', hidden: true, seenAt: null }),
    ]);
    expect(n.leagueAwards[0].badge).toEqual({
      id: badge, name: 'Campeón', description: '', shape: 'shield', palette: 'oro', color: null, icon: 'trophy', topText: '',
      periodText: 'TEMP 2026', template: null, limitKind: 'abierta', byTeam: false, status: 'activa',
    });
    expect(await db.rpc(w.u.luis, 'mark_league_badges_seen', { p_ids: [luisA, pedroA] })).toBe(1);
    expect(await db.rpc(w.u.luis, 'mark_league_badges_seen', { p_ids: [luisA] })).toBe(0);
    expect((await awardRow(luisA)).seen).toBe(true);
    expect((await db.rpc<{ leagueUnseen: number }>(w.u.luis, 'badge_notices', {})).leagueUnseen).toBe(0);
    await fails(db.rpc(w.u.luis, 'mark_league_badges_seen', { p_ids: null }), 'invalido');
    await fails(db.rpc(w.u.luis, 'mark_league_badges_seen', { p_ids: Array.from({ length: 51 }, () => luisA) }), 'invalido');
  });
});

describe('perfil (profile_badges)', () => {
  /** Liga pública de otro con luis jugando y `n` cuentas miembro en total (otro incluido), creada hace 15 días. */
  async function publicLeague(n: number) {
    const extra = [w.u.luis, w.u.ana, w.u.sofi, w.u.nuevo, w.u.otra].slice(0, n - 1);
    for (const u of extra) await member(db, w.pub, u, 'member', 'm');
    await db.admin(`update public.leagues set created_at = now() - interval '15 days' where id = $1`, [w.pub]);
    const luisP = await player(db, w.pub, 'Luis', w.u.luis);
    const badge = await makeDesign(w.u.otro, w.pub, { limit_kind: 'abierta' });
    const id = await giveOne(w.u.otro, badge, luisP, { p_note: 'Nota privada' });
    return { luisP, badge, id };
  }

  it('otra cuenta: solo de ligas con 6+ cuentas no bloqueadas, 14+ días, que ve y sin menores', async () => {
    const { id, badge } = await publicLeague(6);
    const seen = (await profile(w.u.extra, w.u.luis))!.leagueAwards;
    expect(seen.map((x) => x.id)).toEqual([id]);
    expect(seen[0]).toMatchObject({ leagueName: 'Liga Abierta', note: null, seenAt: null, badge: expect.objectContaining({ id: badge, name: 'Campeón' }) });
    // Una cuenta bloqueada no cuenta; una liga nueva tampoco.
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.otra, p_reason: 'x' });
    expect((await profile(w.u.extra, w.u.luis))!.leagueAwards).toEqual([]);
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.otra });
    await db.admin(`update public.leagues set created_at = now() - interval '13 days' where id = $1`, [w.pub]);
    expect((await profile(w.u.extra, w.u.luis))!.leagueAwards).toEqual([]);
    await db.admin(`update public.leagues set created_at = now() - interval '15 days' where id = $1`, [w.pub]);
    // Oculta por el jugador: no.
    await db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: id, p_hidden: true });
    expect((await profile(w.u.extra, w.u.luis))!.leagueAwards).toEqual([]);
    await db.rpc(w.u.luis, 'set_league_badge_hidden', { p_award: id, p_hidden: false });
    // Liga privada: solo quien es miembro.
    await db.admin(`update public.leagues set visibility = 'private' where id = $1`, [w.pub]);
    await member(db, w.priv, w.u.extra, 'member', 'extra');
    expect((await profile(w.u.extra, w.u.luis))!.leagueAwards).toEqual([]);
    expect((await profile(w.u.ana, w.u.luis))!.leagueAwards.map((x) => x.id)).toEqual([id]);
  });

  it('con menos de 6 cuentas solo se ve dentro de la liga; la propia las ve todas (con nota), menos las de un diseño escondido', async () => {
    const { id, badge } = await publicLeague(5);
    expect((await profile(w.u.extra, w.u.luis))!.leagueAwards).toEqual([]);
    expect((await profile(w.u.ana, w.u.luis))!.leagueAwards).toEqual([]);
    const { kids, luis: kidsLuis } = await kidsLeague();
    const kidsId = await giveOne(w.u.org, await makeDesign(w.u.org, kids), kidsLuis);
    const own = (await profile(w.u.luis, w.u.luis))!;
    expect(own.leagueAwards.map((x) => x.id)).toEqual(expect.arrayContaining([id, kidsId]));
    expect(own.leagueAwards.find((x) => x.id === id)).toMatchObject({ note: 'Nota privada', seenAt: null });
    expect(own.leagueTruncated).toBe(false);
    // Nunca cuentan en las oficiales.
    expect((own as unknown as { awards: unknown[] }).awards).toEqual([]);
    await db.rpc(w.u.dios, 'hide_league_badge', { p_id: badge, p_hidden: true });
    expect((await profile(w.u.luis, w.u.luis))!.leagueAwards.map((x) => x.id)).toEqual([kidsId]);
  });
});

describe('reportes y moderación', () => {
  it('report_league_badge: miembros de la liga, uno abierto por cuenta y diseño, 5 por día (con report_badge)', async () => {
    const designs = [];
    for (let i = 0; i < 6; i++) designs.push(await makeDesign(i < 3 ? w.u.org : w.u.sofi, w.priv, { name: `Diseño ${i}` }));
    await db.rpc(w.u.ana, 'report_league_badge', { p_badge: designs[0], p_reason: ' Es una burla ' });
    await db.rpc(w.u.ana, 'report_league_badge', { p_badge: designs[0] });
    expect(await db.admin('select badge_id, league_id, user_id, reason from private.badge_reports')).toEqual([
      { badge_id: designs[0], league_id: w.priv, user_id: w.u.ana, reason: 'Es una burla' },
    ]);
    await fails(db.rpc(w.u.extra, 'report_league_badge', { p_badge: designs[1] }), DENIED);
    await fails(db.rpc(w.u.ana, 'report_league_badge', { p_badge: designs[1], p_reason: 'x'.repeat(141) }), 'invalido');
    await fails(db.rpc(w.u.ana, 'report_league_badge', { p_badge: '00000000-0000-0000-0000-000000000000' }), 'no_existe');
    // 5 por día por cuenta, sumando los de insignias automáticas.
    const official = (
      await db.admin<{ id: string }>(
        `insert into public.badge_awards (badge_key, sport, level, period_key, player_id, league_id, status) values ('bowling_club', 'bowling', 1, '-', $1, $2, 'firme') returning id`,
        [w.p.luis, w.priv],
      )
    )[0].id;
    await db.rpc(w.u.ana, 'report_badge', { p_award: official, p_reason: 'No jugó eso' });
    for (const d of designs.slice(1, 4)) await db.rpc(w.u.ana, 'report_league_badge', { p_badge: d });
    await fails(db.rpc(w.u.ana, 'report_league_badge', { p_badge: designs[4] }), 'rate_limited');
    await db.rpc(w.u.luis, 'report_league_badge', { p_badge: designs[4] });
    expect(await db.count('private.badge_reports')).toBe(6);
    // Escondido: ya no se reporta.
    await db.rpc(w.u.dios, 'hide_league_badge', { p_id: designs[5], p_hidden: true });
    await fails(db.rpc(w.u.luis, 'report_league_badge', { p_badge: designs[5] }), 'no_existe');
  });

  it('report_badge: de una liga, sus miembros; de cuenta, quien ve el perfil; solo las que se ven', async () => {
    const ins = (sql: string, params: unknown[]) => db.admin<{ id: string }>(sql, params).then((r) => r[0].id);
    const lg = await ins(`insert into public.badge_awards (badge_key, sport, level, period_key, player_id, league_id, status) values ('bowling_club', 'bowling', 1, '-', $1, $2, 'firme') returning id`, [w.p.luis, w.priv]);
    const acc = await ins(`insert into public.badge_awards (badge_key, sport, level, period_key, user_id, status) values ('month_streak', 'all', 1, '-', $1, 'firme') returning id`, [w.u.luis]);
    const hidden = await ins(`insert into public.badge_awards (badge_key, sport, level, period_key, user_id, status, hidden) values ('debut', 'all', 0, '-', $1, 'firme', true) returning id`, [w.u.luis]);
    await db.rpc(w.u.ana, 'report_badge', { p_award: lg });
    await fails(db.rpc(w.u.extra, 'report_badge', { p_award: lg }), DENIED);
    // De cuenta, quien ve el perfil: desde 20260929000200 cualquier cuenta con sesión ve a otra sin bloquear, aunque no
    // compartan liga (private.social_can_see). Con luis bloqueado, extra ya no lo ve: no.
    await db.rpc(w.u.dios, 'admin_block_user', { p_user: w.u.luis, p_reason: 'x' });
    await fails(db.rpc(w.u.extra, 'report_badge', { p_award: acc }), DENIED);
    await db.rpc(w.u.dios, 'admin_unblock_user', { p_user: w.u.luis });
    await db.rpc(w.u.extra, 'report_badge', { p_award: acc, p_reason: 'Raro' });
    await fails(db.rpc(w.u.extra, 'report_badge', { p_award: hidden }), 'no_existe');
    expect(await db.admin('select award_id, league_id, user_id from private.badge_reports order by id')).toEqual([
      { award_id: lg, league_id: w.priv, user_id: w.u.ana },
      { award_id: acc, league_id: null, user_id: w.u.extra },
    ]);
    // Retirarla (por fraude, o el motor) cierra sus reportes.
    await db.rpc(w.u.dios, 'super_revoke_badge', { p_award: lg });
    expect(await db.admin('select resolution, resolved_by from private.badge_reports where award_id = $1', [lg])).toEqual([{ resolution: 'retirada', resolved_by: w.u.dios }]);
  });

  it('el superadmin: la cola, esconder (con auditoría) y descartar', async () => {
    const d = await makeDesign(w.u.org, w.priv, { name: 'Burla' });
    await db.rpc(w.u.ana, 'report_league_badge', { p_badge: d, p_reason: 'Ofensiva' });
    await db.rpc(w.u.luis, 'report_league_badge', { p_badge: d });
    for (const who of [w.u.org, w.u.ana]) {
      await fails(db.rpc(who, 'admin_badge_reports', {}), DENIED);
      await fails(db.rpc(who, 'hide_league_badge', { p_id: d, p_hidden: true }), DENIED);
      await fails(db.rpc(who, 'admin_resolve_badge_reports', { p_ids: [1] }), DENIED);
    }
    const q = await db.rpc<{ open: number; rows: Json[] }>(w.u.dios, 'admin_badge_reports', {});
    expect(q.open).toBe(2);
    expect(q.rows[1]).toMatchObject({
      kind: 'diseno', reason: 'Ofensiva', reporterId: w.u.ana, reporterName: 'ana', leagueId: w.priv, leagueName: 'Liga del Banco', sameTarget: 2,
      resolvedAt: null, design: expect.objectContaining({ id: d, name: 'Burla', status: 'activa' }), award: null,
    });
    expect((await holders(w.u.org, d)).badge.openReports).toBe(2);
    // Esconder cierra los reportes del diseño y queda en la auditoría; la liga no lo puede tocar.
    expect(await db.rpc(w.u.dios, 'hide_league_badge', { p_id: d, p_hidden: true, p_note: 'Burla a un jugador' })).toBe('oculta');
    expect((await db.rpc<{ open: number }>(w.u.dios, 'admin_badge_reports', {})).open).toBe(0);
    expect((await db.rpc<{ rows: Json[] }>(w.u.dios, 'admin_badge_reports', { p_open: false })).rows.map((r) => r.resolution)).toEqual(['oculta', 'oculta']);
    expect(await db.admin(`select target_type, target_id, detail ->> 'note' as note from public.admin_audit where action = 'hide_league_badge'`)).toEqual([
      { target_type: 'league', target_id: w.priv, note: 'Burla a un jugador' },
    ]);
    await fails(save(w.u.org, w.priv, { description: 'Arreglada' }, d), DENIED);
    await fails(db.rpc(w.u.org, 'archive_league_badge', { p_id: d, p_archived: false }), DENIED);
    await fails(give(w.u.org, d, [w.p.pedro]), 'no_activa');
    // Dejar de esconder: queda archivado (la liga decide si lo activa).
    expect(await db.rpc(w.u.dios, 'hide_league_badge', { p_id: d, p_hidden: false })).toBe('archivada');
    expect(await db.rpc(w.u.org, 'archive_league_badge', { p_id: d, p_archived: false })).toBe('activa');
    // Descartar a mano.
    await db.rpc(w.u.ana, 'report_league_badge', { p_badge: d });
    const [{ id }] = await db.admin<{ id: number }>('select id from private.badge_reports where resolved_at is null');
    expect(await db.rpc(w.u.dios, 'admin_resolve_badge_reports', { p_ids: [id, id], p_note: 'Está bien' })).toBe(1);
    expect(await db.rpc(w.u.dios, 'admin_resolve_badge_reports', { p_ids: [id] })).toBe(0);
    expect(await db.admin('select resolution from private.badge_reports where id = $1', [id])).toEqual([{ resolution: 'descartado' }]);
    expect(await db.count('public.admin_audit', `action = 'resolve_badge_reports'`)).toBe(1);
  });
});

describe('fusiones, menores y mis datos', () => {
  it('aprobar un reclamo con insignias de liga en los dos jugadores: queda la más vieja y la otra se retira con «fusión»', async () => {
    const { player_id: mine } = await db.rpc<{ player_id: string }>(w.u.nuevo, 'join_league', { p_code: 'ABCD2345' });
    const champ = await makeDesign(w.u.org, w.priv, { limit_kind: 'abierta' });
    const mvp = await makeDesign(w.u.org, w.priv, { name: 'MVP', limit_kind: 'abierta' });
    const oldOne = await giveOne(w.u.org, champ, w.p.pedro);
    const newOne = await giveOne(w.u.org, champ, mine);
    await db.admin(`update public.league_badge_awards set awarded_at = now() - interval '10 days' where id = $1`, [oldOne]);
    const other = await giveOne(w.u.org, champ, mine, { p_period: 'TEMP 2025' });
    const onlyMine = await giveOne(w.u.org, mvp, mine);

    const claim = await db.rpc<string>(w.u.nuevo, 'request_player_claim', { p_player: w.p.pedro });
    expect(await db.rpc(w.u.sofi, 'decide_player_claim', { p_claim: claim, p_approve: true })).toBe('approved');
    expect(await db.count('public.players', 'id = $1', [mine])).toBe(0);
    expect(await awardRow(oldOne)).toMatchObject({ player_id: w.p.pedro, revoked: false });
    expect(await awardRow(newOne)).toMatchObject({ player_id: w.p.pedro, revoked: true, revoke_reason: 'fusión', revoked_by: null });
    expect(await awardRow(other)).toMatchObject({ player_id: w.p.pedro, revoked: false });
    expect(await awardRow(onlyMine)).toMatchObject({ player_id: w.p.pedro, revoked: false });
    expect((await profile(w.u.nuevo, w.u.nuevo))!.leagueAwards.map((x) => x.id).sort()).toEqual(sorted([oldOne, other, onlyMine]));
  });

  const selfLinks = () => db.admin<{ player_id: string; user_id: string }>('select player_id, user_id from private.badge_self_links order by created_at, player_id');

  it('un admin que se vinculó él mismo reclama otro jugador: se aprueba y la marca queda en el reclamado (no frena el guardia)', async () => {
    const mine = await player(db, w.priv, 'Sofi vieja');
    await db.rpc(w.u.sofi, 'link_account_to_player', { p_player: mine, p_user: w.u.sofi });
    expect(await selfLinks()).toEqual([{ player_id: mine, user_id: w.u.sofi }]);
    const claim = await db.rpc<string>(w.u.sofi, 'request_player_claim', { p_player: w.p.pedro });
    expect(await db.admin('select status from public.player_claims where id = $1', [claim])).toEqual([{ status: 'approved' }]);
    expect(await db.count('public.players', 'id = $1', [mine])).toBe(0);
    expect(await db.admin('select user_id from public.players where id = $1', [w.p.pedro])).toEqual([{ user_id: w.u.sofi }]);
    expect(await selfLinks()).toEqual([{ player_id: w.p.pedro, user_id: w.u.sofi }]);
  });

  it('juntar duplicados con el jugador que un admin se vinculó como el que se va: se junta y la marca pasa al que queda', async () => {
    const mine = await player(db, w.priv, 'Sofi vieja');
    const keep = await player(db, w.priv, 'Sofi');
    await db.rpc(w.u.sofi, 'link_account_to_player', { p_player: mine, p_user: w.u.sofi });
    expect(await db.rpc(w.u.org, 'merge_league_players_preview', { p_league: w.priv, p_keep: keep, p_drop: mine })).toMatchObject({ canMerge: true });
    // Lo junta el dueño (no la misma cuenta): la marca del que queda sale de merge_badges, no del trigger del vínculo.
    expect(await db.rpc(w.u.org, 'merge_league_players', { p_league: w.priv, p_keep: keep, p_drop: mine })).toMatchObject({
      playerId: keep,
      removedId: mine,
      userId: w.u.sofi,
    });
    expect(await db.count('public.players', 'id = $1', [mine])).toBe(0);
    expect(await selfLinks()).toEqual([{ player_id: keep, user_id: w.u.sofi }]);
    expect(await db.admin('select private.badge_verified_only($1, $2) as v', [keep, w.u.sofi])).toEqual([{ v: true }]);
  });

  it('liga con menores: se diseña y se da igual, pero solo la ven sus miembros', async () => {
    const { kids, kid, luis: kidsLuis } = await kidsLeague();
    const badge = await makeDesign(w.u.org, kids, { limit_kind: 'abierta', name: 'Buen compañero' });
    const [kidA, luisA] = (await give(w.u.org, badge, [kid, kidsLuis])).awards.map((x) => x.id);
    expect(await awardIds(w.u.luis)).toEqual(sorted([kidA, luisA]));
    for (const who of [w.u.extra, w.u.sofi, ANON]) {
      expect(await awardIds(who)).toEqual([]);
      expect(await designIds(who)).toEqual([]);
    }
    expect((await profile(w.u.org, w.u.luis))!.leagueAwards).toEqual([]);
    expect((await profile(w.u.luis, w.u.luis))!.leagueAwards.map((x) => x.id)).toEqual([luisA]);
  });

  it('export_my_data trae las de sus jugadores; borrar el jugador se las lleva (tombstone)', async () => {
    const badge = await makeDesign(w.u.org, w.priv, { limit_kind: 'abierta' });
    const [luisA, pedroA] = (await give(w.u.org, badge, [w.p.luis, w.p.pedro])).awards.map((x) => x.id);
    // Una que le quitaron (con motivo privado): no sale, ni quién se la dio o se la quitó.
    const gone = await giveOne(w.u.org, badge, w.p.luis, { p_period: 'TEMP 2025' });
    await db.rpc(w.u.org, 'revoke_league_badge_award', { p_award: gone, p_reason: 'Motivo privado' });
    const d = await db.rpc<{ tables: Record<string, Json[]> }>(w.u.luis, 'export_my_data');
    expect(d.tables.league_badge_awards.map((x) => x.id)).toEqual([luisA]);
    for (const col of ['awarded_by', 'revoked_by', 'revoke_reason', 'revoked_at']) expect(d.tables.league_badge_awards[0]).not.toHaveProperty(col);
    expect(JSON.stringify(d)).not.toContain('Motivo privado');
    await db.rpc(w.u.org, 'delete_player', { p_player: w.p.pedro });
    expect(await db.count('public.league_badge_awards', 'id = $1', [pedroA])).toBe(0);
    expect(await db.count('public.tombstones', `tbl = 'league_badge_awards' and row_key = $1`, [pedroA])).toBe(1);
    // Borrar la liga se lleva todo sin romper la FK entre diseños y otorgamientos.
    await db.rpc(w.u.org, 'delete_league', { p_league: w.priv });
    expect(await db.count('public.league_badges')).toBe(0);
  });

  it('export_my_data trae en badgeReports los reportes de insignias que hizo la cuenta (private.badge_reports), sin quién los atendió', async () => {
    const design = await makeDesign(w.u.org, w.priv, { name: 'Burla' });
    const [{ id: official }] = await db.admin<{ id: string }>(
      `insert into public.badge_awards (badge_key, sport, level, period_key, player_id, league_id, status) values ('bowling_club', 'bowling', 1, '-', $1, $2, 'firme') returning id`,
      [w.p.luis, w.priv],
    );
    expect((await db.rpc<{ badgeReports: Json[] }>(w.u.ana, 'export_my_data')).badgeReports).toEqual([]);
    await db.rpc(w.u.ana, 'report_league_badge', { p_badge: design, p_reason: 'Es una burla' });
    await db.rpc(w.u.ana, 'report_badge', { p_award: official, p_reason: 'No jugó eso' });
    await db.rpc(w.u.sofi, 'report_league_badge', { p_badge: design, p_reason: 'De otra cuenta' });
    await db.admin(`update private.badge_reports set created_at = now() - interval '1 hour' where badge_id is not null`);
    const [mine] = await db.admin<{ id: string }>(`select id from private.badge_reports where award_id = $1`, [official]);
    await db.rpc(w.u.dios, 'admin_resolve_badge_reports', { p_ids: [Number(mine.id)] });

    const d = await db.rpc<{ badgeReports: Json[] }>(w.u.ana, 'export_my_data');
    expect(d.badgeReports).toEqual([
      expect.objectContaining({ kind: 'diseno', targetId: design, leagueId: w.priv, leagueName: 'Liga del Banco', reason: 'Es una burla', resolvedAt: null, resolution: null }),
      expect.objectContaining({ kind: 'insignia', targetId: official, leagueId: w.priv, reason: 'No jugó eso', resolution: 'descartado' }),
    ]);
    expect(d.badgeReports[1].resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    for (const r of d.badgeReports) {
      expect(r).not.toHaveProperty('resolvedBy');
      expect(r).not.toHaveProperty('userId');
    }
    const all = JSON.stringify(d);
    expect(all).not.toContain('De otra cuenta');
    expect(all).not.toContain(w.u.dios);
    // Nadie de la app llama la ayuda directo.
    await fails(db.as(w.u.ana, 'select private.my_badge_reports($1)', [w.u.sofi]), DENIED);
  });
});

describe('tiempo real', () => {
  it("avisa 'badges' (solo ids) a la liga y a la cuenta del jugador", async () => {
    // Los NOTIFY salen al confirmar: una base aparte, sin la transacción de cada prueba.
    const rt = await TestDb.open();
    try {
      const v = await makeWorld(rt);
      const msgs: { topic: string; event: string; payload: Json }[] = [];
      await rt.pg.listen('mm', (raw) => msgs.push(JSON.parse(raw)));
      const settle = async () => {
        await new Promise((r) => setTimeout(r, 50));
        return msgs.splice(0).filter((m) => m.event === 'badges');
      };
      const d = (await rt.rpc<Design>(v.u.org, 'save_league_badge', { p_league: v.priv, p_id: null, p_design: { ...CAMPEON, limit_kind: 'abierta' } })).id;
      expect(await settle()).toEqual([{ topic: `league:${v.priv}`, event: 'badges', payload: { op: 'insert', ids: [d], kind: 'diseno' } }]);
      const ids = (await rt.rpc<{ awards: GivenAward[] }>(v.u.org, 'award_league_badge', { p_badge: d, p_players: [v.p.luis, v.p.pedro] })).awards.map((x) => x.id);
      const given = await settle();
      expect(given).toHaveLength(2);
      expect(given).toEqual(
        expect.arrayContaining([
          { topic: `league:${v.priv}`, event: 'badges', payload: { op: 'insert', ids: expect.arrayContaining(ids), kind: 'liga' } },
          { topic: `user:${v.u.luis}`, event: 'badges', payload: { op: 'insert', ids: [ids[0]], kind: 'liga' } },
        ]),
      );
      // Que el jugador la vea solo avisa a su cuenta; retirarla, también a la liga.
      await rt.rpc(v.u.luis, 'mark_league_badges_seen', { p_ids: [ids[0]] });
      expect(await settle()).toEqual([{ topic: `user:${v.u.luis}`, event: 'badges', payload: { op: 'update', ids: [ids[0]], kind: 'liga' } }]);
      await rt.rpc(v.u.org, 'revoke_league_badge_award', { p_award: ids[1] });
      expect(await settle()).toEqual([{ topic: `league:${v.priv}`, event: 'badges', payload: { op: 'update', ids: [ids[1]], kind: 'liga' } }]);
    } finally {
      await rt.pg.close();
    }
  }, 60000);
});
