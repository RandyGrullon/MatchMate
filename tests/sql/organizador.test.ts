/**
 * Organizador (20260929000600_organizador.sql): ligas públicas que invitan a entrar y el tope de ligas nuevas por
 * cuenta, los pendientes del admin, juntar jugadores repetidos, menores en todos los deportes y suspender un día.
 * Las pistas del boliche están en pistas.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ANON, DENIED, INVALID, TestDb, fails } from './harness';
import { entry, event, league, makeWorld, member, player, type World } from './fixture';

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

type Json = Record<string, any>;
const TZ = 'America/Santo_Domingo';

/** Hoy (más n días) en la zona de las ligas, 'YYYY-MM-DD'. */
const day = async (n = 0) =>
  (await db.admin<{ d: string }>(`select ((now() at time zone '${TZ}')::date + $1::integer)::text as d`, [n]))[0].d;
const phone = (uid: string) =>
  db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'BPclave', 'secreto')`, [
    uid,
    `https://fcm.googleapis.com/fcm/send/${uid}`,
  ]);
const feed = (who: string, args: Record<string, unknown> = {}) => db.rpc<Json[]>(who, 'public_leagues_feed', args);
const ids = (items: Json[], only: string[]) => items.map((x) => x.id as string).filter((id) => only.includes(id));

/** Evento de cualquier tipo (noche de americano, jornada, encuentro de natación…). */
async function anyEvent(lid: string, type: string, date: string, name = ''): Promise<string> {
  const rows = await db.admin<{ id: string }>('insert into public.events (league_id, type, name, date) values ($1, $2, $3, $4) returning id', [
    lid,
    type,
    name,
    date,
  ]);
  return rows[0].id;
}

/** Partido de una liga de partidos (lados «Rojos» y «Azules»), a esa hora local ('YYYY-MM-DD HH:MM') o sin hora. */
async function match(lid: string, at: string | null, status = 'scheduled', extra: { event?: string; leaseMinutes?: number } = {}) {
  const rows = await db.admin<{ id: string }>(
    `insert into public.matches (league_id, event_id, scheduled_at, status, lease_until)
     values ($1, $2, $3::timestamp at time zone '${TZ}', $4, now() + make_interval(mins => $5)) returning id`,
    [lid, extra.event ?? null, at, status, extra.leaseMinutes ?? null],
  );
  await db.admin(`insert into public.match_sides (match_id, side, league_id, label) values ($1, 1, $2, 'Rojos'), ($1, 2, $2, 'Azules')`, [
    rows[0].id,
    lid,
  ]);
  return rows[0].id;
}

// =====================================================================
// C8. Ligas públicas
// =====================================================================

describe('ligas públicas que invitan a entrar', () => {
  /** Ligas públicas con distinta actividad, miembros y fechas. */
  async function publicWorld() {
    const today = await day();
    // Las ligas del mundo traen la temporada fija de 2026: que sigan vivas cualquier día, para que solo cuente si son públicas.
    await db.admin(`update public.leagues set season_end = $3::date + 60 where id in ($1, $2)`, [w.pub, w.priv, today]);
    const mk = async (name: string, kind: 'liga' | 'torneo' = 'liga', sport = 'bowling') => {
      const id = await league(db, w.u.otro, { name, visibility: 'public', kind, requirePhoto: false, sport });
      await db.admin(`update public.leagues set season_start = $2::date - 60, season_end = $2::date + 60 where id = $1`, [id, today]);
      await member(db, id, w.u.otro, 'owner', 'otro');
      return id;
    };
    const activa = await mk('Alfa Activa');
    const pAlfa = await player(db, activa, 'Alfa Uno');
    const e = await event(db, activa, 'practica', await day(-3));
    await entry(db, activa, e, pAlfa, [190], ['sin-foto']);
    const grande = await mk('Beta Grande');
    await member(db, grande, w.u.luis, 'member', 'luis');
    await member(db, grande, w.u.ana, 'member', 'ana');
    const nueva = await mk('Charlie Nueva');
    await db.admin(`update public.leagues set created_at = now() + interval '1 minute' where id = $1`, [nueva]);
    const vieja = await mk('Delta Terminada');
    await db.admin(`update public.leagues set season_end = $2::date - 1 where id = $1`, [vieja, today]);
    const torneoViejo = await mk('Eco Torneo Viejo', 'torneo');
    await event(db, torneoViejo, 'torneo', await day(-8));
    const torneoReciente = await mk('Foxtrot Torneo Reciente', 'torneo');
    await event(db, torneoReciente, 'torneo', await day(-6));
    await db.admin(`update public.leagues set season_end = $2::date - 6 where id in ($1, $3)`, [torneoViejo, today, torneoReciente]);
    const padel = await mk('Golf Pádel', 'liga', 'padel');
    return { today, activa, grande, nueva, vieja, torneoViejo, torneoReciente, padel };
  }

  it('solo públicas sin menores y vivas, las más activas primero (después más miembros y más nuevas); también sin cuenta', async () => {
    const x = await publicWorld();
    const mine = [x.activa, x.grande, x.nueva, x.vieja, x.torneoViejo, x.torneoReciente, x.padel, w.priv];
    for (const who of [ANON, w.u.extra]) {
      const items = await feed(who, { p_limit: 50 });
      // La terminada, el torneo de hace 8 días y la privada no salen. Actividad: la activa (un juego y un evento), el torneo
      // de hace 6 días (su evento); después la de 3 miembros y la más nueva.
      expect(ids(items, mine)).toEqual([x.activa, x.torneoReciente, x.grande, x.nueva, x.padel]);
    }
    // Ligas de menores nunca (son privadas por regla) y la privada tampoco para sus miembros.
    expect(ids(await feed(w.u.org, { p_limit: 50 }), [w.priv])).toEqual([]);
  });

  it('cada liga trae lo que hace falta para la línea «24 jugadores · juega el martes»', async () => {
    const x = await publicWorld();
    const next = await day(3);
    const ev = await event(db, x.activa, 'torneo', next, 3, 'Copa');
    await db.admin(`update public.events set start_time = '19:30' where id = $1`, [ev]);
    await player(db, x.activa, 'Alfa Dos');
    const item = (await feed(ANON, { p_query: 'alfa' }))[0];
    expect(item).toMatchObject({
      id: x.activa,
      name: 'Alfa Activa',
      sport: 'bowling',
      kind: 'liga',
      venue: 'Bolera',
      schedule: 'Martes 7 pm',
      members: 1,
      players: 2,
      nextEventDate: next,
      seasonEnd: await day(60),
    });
    // Juegos + el evento de hace 3 días.
    expect(item.activity).toBe(2);
    const at = await db.admin<{ ok: boolean }>(`select $1::timestamptz = ($2::date + time '19:30') at time zone '${TZ}' as ok`, [
      item.nextEventAt,
      next,
    ]);
    expect(at).toEqual([{ ok: true }]);
    expect(item.lastActivityAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Un partido programado antes que el próximo evento también cuenta como lo próximo.
    const tomorrow = await day(1);
    await match(x.padel, `${tomorrow} 20:00`);
    const p = (await feed(ANON, { p_sport: 'padel' }))[0];
    expect(p).toMatchObject({ id: x.padel, nextEventDate: tomorrow, activity: 0 });
  });

  it('busca por nombre o lugar (sin acentos), filtra por deporte y pagina', async () => {
    const x = await publicWorld();
    const mine = [x.activa, x.grande, x.nueva, x.torneoReciente, x.padel, w.pub];
    expect(ids(await feed(ANON, { p_query: 'ÁLFA  act' }), mine)).toEqual([x.activa]);
    expect(ids(await feed(ANON, { p_query: 'bolera', p_limit: 50 }), mine)).toHaveLength(6);
    expect(ids(await feed(ANON, { p_query: 'no existe nada así' }), mine)).toEqual([]);
    expect(ids(await feed(ANON, { p_sport: 'padel', p_limit: 50 }), mine)).toEqual([x.padel]);
    expect(ids(await feed(ANON, { p_sport: 'bowling', p_limit: 50 }), mine)).not.toContain(x.padel);
    const all = ids(await feed(ANON, { p_limit: 50 }), mine);
    const a = await feed(ANON, { p_limit: 2 });
    const b = await feed(ANON, { p_limit: 2, p_offset: 2 });
    expect(a).toHaveLength(2);
    expect([...a, ...b].map((i) => i.id)).toEqual((await feed(ANON, { p_limit: 4 })).map((i) => i.id));
    expect(all.length).toBe(6);
  });

  it('sin cuenta tiene un límite suave por IP; con cuenta no', async () => {
    await db.admin(`insert into private.rate_limits (key, window_start, hits) values ('feed:ip:anon', now(), 120)`);
    await fails(feed(ANON), 'rate_limited');
    expect(Array.isArray(await feed(w.u.extra))).toBe(true);
    // Cada llamada sin cuenta cuenta.
    await db.admin(`delete from private.rate_limits`);
    await feed(ANON);
    await feed(ANON);
    expect(await db.admin('select hits from private.rate_limits where key = $1', ['feed:ip:anon'])).toEqual([{ hits: 2 }]);
  });
});

describe('tope de ligas y torneos nuevos por cuenta', () => {
  const create = (uid: string, name: string) => db.rpc<Json>(uid, 'create_league', { p_name: name });

  it('5 por día (también torneos); crear y borrar no libera el cupo; el superadmin no tiene tope', async () => {
    for (let i = 1; i <= 4; i++) await create(w.u.nuevo, `Liga ${i}`);
    const t = await db.rpc<Json>(w.u.nuevo, 'create_tournament', { p_name: 'Copa', p_date: await day(10) });
    await fails(create(w.u.nuevo, 'Liga 6'), 'rate_limited');
    await fails(db.rpc(w.u.nuevo, 'create_tournament', { p_name: 'Copa 2', p_date: await day(10) }), 'rate_limited');
    expect(await db.count('public.leagues', 'owner_id = $1', [w.u.nuevo])).toBe(5);
    await db.rpc(w.u.nuevo, 'delete_league', { p_league: t.league_id });
    await fails(create(w.u.nuevo, 'Liga 7'), 'rate_limited');
    // Otra cuenta tiene su propio cupo.
    await create(w.u.otra, 'La de otra');
    for (let i = 1; i <= 7; i++) await create(w.u.dios, `Del superadmin ${i}`);
    // Pasado un día, puede otra vez.
    await db.admin(`update private.league_creations set created_at = now() - interval '25 hours' where user_id = $1`, [w.u.nuevo]);
    await create(w.u.nuevo, 'Liga de mañana');
  });

  it('20 cada 30 días; lo de hace más de 30 días ya no cuenta', async () => {
    await db.admin(
      `insert into private.league_creations (user_id, league_id, created_at)
       select $1, gen_random_uuid(), now() - make_interval(days => 2 + g % 27) from generate_series(1, 20) g`,
      [w.u.nuevo],
    );
    // El de 30 días dice que es el del mes (no «prueba mañana»).
    await fails(create(w.u.nuevo, 'Una más'), 'rate_limited: mes');
    await db.admin(`update private.league_creations set created_at = now() - interval '31 days' where user_id = $1`, [w.u.nuevo]);
    await create(w.u.nuevo, 'Ahora sí');
    // Los viejos se limpiaron.
    expect(await db.count('private.league_creations', 'user_id = $1', [w.u.nuevo])).toBe(1);
  });

  it('sin sesión (service_role: el importador de BowlingX, SQL) no cuenta ni se frena', async () => {
    for (let i = 1; i <= 25; i++) {
      await db.asService(`insert into public.leagues (name, owner_id) values ($1, $2)`, [`Importada ${i}`, w.u.nuevo]);
    }
    expect(await db.count('private.league_creations')).toBe(0);
    await create(w.u.nuevo, 'La suya');
    expect(await db.count('public.leagues', 'owner_id = $1', [w.u.nuevo])).toBe(26);
  });
});

// =====================================================================
// C9. Pendientes
// =====================================================================

describe('pendientes del organizador', () => {
  it('envíos por aprobar y reclamos, con su enlace, y los primeros pasos de una liga nueva', async () => {
    const sub = await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_event: w.e.e1, p_scores: [180, 200] });
    const claim = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: w.p.pedro, p_note: 'Soy yo' });
    const r = await db.rpc<Json>(w.u.org, 'league_pending', { p_league: w.priv });
    const base = `/l/${w.priv}`;
    expect(r.submissions).toMatchObject({
      count: 1,
      url: `${base}/admin?tab=aprobar`,
      items: [{ id: sub, playerId: w.p.luis, playerName: 'Luis', eventId: w.e.e1, date: '2026-09-22', games: 2, hasPhoto: false }],
    });
    expect(r.claims).toMatchObject({
      count: 1,
      url: `${base}/admin?tab=reclamos`,
      items: [{ id: claim, playerId: w.p.pedro, playerName: 'Pedro', claimantName: 'ana', note: 'Soy yo' }],
    });
    expect(r.disputes).toMatchObject({ count: 0, items: [] });
    expect(r.overdue).toMatchObject({ count: 0, items: [] });
    expect(r.waitlists).toMatchObject({ count: 0, items: [] });
    expect(r.total).toBe(2);
    // La liga del mundo es nueva y ya hizo todo: miembros, jugadores, evento y un juego.
    expect(r.checklist).toMatchObject({ complete: true, done: 4, total: 4 });
    expect(r.checklist.steps.map((s: Json) => [s.key, s.done])).toEqual([
      ['invite', true],
      ['players', true],
      ['schedule', true],
      ['result', true],
    ]);
    // El superadmin y un admin también; un miembro no, ni sin cuenta.
    expect((await db.rpc<Json>(w.u.sofi, 'league_pending', { p_league: w.priv })).total).toBe(2);
    expect((await db.rpc<Json>(w.u.dios, 'league_pending', { p_league: w.priv })).total).toBe(2);
    await fails(db.rpc(w.u.luis, 'league_pending', { p_league: w.priv }), DENIED);
    await fails(db.rpc(ANON, 'league_pending', { p_league: w.priv }), '42501');
    await fails(db.rpc(w.u.dios, 'league_pending', { p_league: randomUUID() }), 'no_existe');
  });

  it('primeros pasos: una liga recién creada empieza sin nada hecho; pasados 30 días ya no salen', async () => {
    const lid = (await db.rpc<Json>(w.u.nuevo, 'create_league', { p_name: 'Recién hecha', p_sport: 'bowling' })).league_id;
    let r = await db.rpc<Json>(w.u.nuevo, 'league_pending', { p_league: lid });
    expect(r.total).toBe(0);
    expect(r.checklist).toMatchObject({ complete: false, done: 0, total: 4 });
    expect(r.checklist.steps[0]).toMatchObject({ key: 'invite', label: 'Invita a alguien a la liga', url: `/l/${lid}/admin?tab=miembros` });
    await db.rpc(w.u.nuevo, 'create_player', { p_league: lid, p_name: 'Pepe' });
    await db.rpc(w.u.nuevo, 'create_event', { p_league: lid, p_type: 'practica', p_date: await day() });
    r = await db.rpc<Json>(w.u.nuevo, 'league_pending', { p_league: lid });
    expect(r.checklist.steps.map((s: Json) => s.done)).toEqual([false, true, true, false]);
    await db.admin(`update public.leagues set created_at = now() - interval '31 days' where id = $1`, [lid]);
    expect((await db.rpc<Json>(w.u.nuevo, 'league_pending', { p_league: lid })).checklist).toBeNull();
  });

  it('partidos reclamados, partidos cuya hora pasó sin resultado y listas de espera', async () => {
    const lid = await league(db, w.u.org, { name: 'Pádel', visibility: 'private', sport: 'padel', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    const disputed = await match(lid, `${await day(-2)} 19:00`, 'disputed');
    await db.admin(`update public.matches set disputed_at = now(), dispute_note = 'Fue 6-4' where id = $1`, [disputed]);
    const late = await match(lid, null);
    await db.admin(`update public.matches set scheduled_at = now() - interval '5 hours' where id = $1`, [late]);
    const liveNow = await match(lid, null, 'live', { leaseMinutes: 5 });
    const soon = await match(lid, null);
    await db.admin(`update public.matches set scheduled_at = now() - interval '5 hours' where id = $1`, [liveNow]);
    await db.admin(`update public.matches set scheduled_at = now() - interval '1 hour' where id = $1`, [soon]);
    await match(lid, `${await day(-3)} 19:00`, 'confirmed');
    const night = await anyEvent(lid, 'americano', await day(2));
    const past = await anyEvent(lid, 'americano', await day(-2));
    for (const [ev, n] of [
      [night, 3],
      [past, 1],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const p = await player(db, lid, `Espera ${ev.slice(0, 4)} ${i}`);
        await db.admin(`insert into public.event_signups (event_id, league_id, entrant_id, player_id, status) values ($1, $2, $3, $3, 'wait')`, [
          ev,
          lid,
          p,
        ]);
      }
    }
    const r = await db.rpc<Json>(w.u.org, 'league_pending', { p_league: lid });
    expect(r.disputes).toMatchObject({
      count: 1,
      items: [{ id: disputed, label: 'Rojos vs Azules', sides: ['Rojos', 'Azules'], note: 'Fue 6-4', url: `/l/${lid}/juegos?partido=${disputed}` }],
    });
    // Sin resultado: el de hace 5 horas; el que está en juego con su anotador y el de hace 1 hora todavía no.
    expect(r.overdue).toMatchObject({ count: 1, items: [{ id: late, status: 'scheduled' }] });
    expect(r.waitlists).toMatchObject({ count: 1, items: [{ eventId: night, waiting: 3, date: await day(2), url: `/l/${lid}/e/${night}` }] });
    expect(r.submissions.count + r.claims.count).toBe(0);
    expect(r.total).toBe(3);
    // Se le venció el turno al anotador: también cuenta.
    await db.admin(`update public.matches set lease_until = now() - interval '1 minute' where id = $1`, [liveNow]);
    expect((await db.rpc<Json>(w.u.org, 'league_pending', { p_league: lid })).overdue.count).toBe(2);
  });

  it('muestra hasta 5 de cada cosa, lo más viejo primero, y cuenta todo', async () => {
    const subs: string[] = [];
    for (let i = 0; i < 7; i++) {
      subs.push(await db.rpc<string>(w.u.luis, 'submit_games', { p_op_id: randomUUID(), p_league: w.priv, p_date: await day(-i), p_scores: [100 + i] }));
      await db.admin(`update public.submissions set created_at = now() - make_interval(mins => $2) where id = $1`, [subs[i], 60 - i]);
    }
    const r = await db.rpc<Json>(w.u.org, 'league_pending', { p_league: w.priv });
    expect(r.submissions.count).toBe(7);
    expect(r.submissions.items.map((s: Json) => s.id)).toEqual(subs.slice(0, 5));
  });
});

// =====================================================================
// C12. Juntar jugadores repetidos
// =====================================================================

describe('juntar jugadores repetidos', () => {
  const merge = (uid: string, keep: string, drop: string, lid = w.priv) =>
    db.rpc<Json>(uid, 'merge_league_players', { p_league: lid, p_keep: keep, p_drop: drop });
  const exists = async (pid: string) => (await db.count('public.players', 'id = $1', [pid])) === 1;

  it('dos sin cuenta: todo pasa al que queda, el otro se borra y queda en la auditoría', async () => {
    const dup = await player(db, w.priv, 'Pedro P.');
    const e2 = await event(db, w.priv, 'practica', '2026-09-15');
    const en = await entry(db, w.priv, e2, dup, [170], ['sin-foto']);
    await db.admin(`insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3)`, [w.e.e1, dup, w.priv]);
    expect(await merge(w.u.sofi, w.p.pedro, dup)).toEqual({ playerId: w.p.pedro, removedId: dup, userId: null });
    expect(await exists(dup)).toBe(false);
    expect(await db.admin('select player_id from public.entries where id = $1', [en])).toEqual([{ player_id: w.p.pedro }]);
    expect(await db.count('public.event_rsvps', 'player_id = $1', [w.p.pedro])).toBe(1);
    expect(await db.admin(`select action, target_type, target_id, actor_id, detail from public.admin_audit where action = 'merge_players'`)).toEqual([
      {
        action: 'merge_players',
        target_type: 'league',
        target_id: w.priv,
        actor_id: w.u.sofi,
        detail: { keep: w.p.pedro, drop: dup, keepName: 'Pedro', dropName: 'Pedro P.', userId: null },
      },
    ]);
  });

  it('si solo el que se va tiene cuenta, la cuenta pasa al que queda', async () => {
    const old = await player(db, w.priv, 'Luis Viejo');
    const e2 = await event(db, w.priv, 'practica', '2026-09-15');
    await entry(db, w.priv, e2, old, [160], ['sin-foto']);
    const r = await merge(w.u.org, old, w.p.luis);
    expect(r).toEqual({ playerId: old, removedId: w.p.luis, userId: w.u.luis });
    expect(await exists(w.p.luis)).toBe(false);
    expect(await db.admin('select user_id from public.players where id = $1', [old])).toEqual([{ user_id: w.u.luis }]);
    expect(await db.admin('select player_id from public.entries where id = $1', [w.e1Luis])).toEqual([{ player_id: old }]);
    expect(await db.admin('select player_id from public.memberships where league_id = $1 and user_id = $2', [w.priv, w.u.luis])).toEqual([
      { player_id: old },
    ]);
    // El que queda con cuenta y el que se va sin cuenta: la cuenta se queda.
    expect(await merge(w.u.org, old, w.p.pedro)).toEqual({ playerId: old, removedId: w.p.pedro, userId: w.u.luis });
  });

  it('si chocan: «conflicto: …» y no cambia nada; el adelanto lo dice antes', async () => {
    const dup = await player(db, w.priv, 'Luis 2');
    await entry(db, w.priv, w.e.e1, dup, [120], ['sin-foto']);
    const pre = await db.rpc<Json>(w.u.org, 'merge_league_players_preview', { p_league: w.priv, p_keep: dup, p_drop: w.p.luis });
    expect(pre).toMatchObject({
      canMerge: false,
      reason: null,
      moveAccount: true,
      conflicts: [{ what: 'entries', label: 'Juegos en el mismo evento', count: 1 }],
      keep: { id: dup, name: 'Luis 2', userId: null, isMinor: false },
      drop: { id: w.p.luis, name: 'Luis', userId: w.u.luis, isMinor: false },
    });
    const err = await fails(merge(w.u.org, dup, w.p.luis));
    expect(err.message).toBe('conflicto: Juegos en el mismo evento (1)');
    expect(await exists(w.p.luis)).toBe(true);
    expect(await db.count('public.admin_audit')).toBe(0);
    const ok = await db.rpc<Json>(w.u.org, 'merge_league_players_preview', { p_league: w.priv, p_keep: w.p.pedro, p_drop: dup });
    expect(ok).toMatchObject({ canMerge: true, reason: null, moveAccount: false, conflicts: [] });
  });

  it('los dos con cuenta, o un menor con una cuenta: invalido', async () => {
    const pAna = await db.rpc<string>(w.u.ana, 'ensure_my_player', { p_league: w.priv });
    expect((await db.rpc<Json>(w.u.org, 'merge_league_players_preview', { p_league: w.priv, p_keep: pAna, p_drop: w.p.luis })).reason).toBe(
      'dos_cuentas',
    );
    await fails(merge(w.u.org, pAna, w.p.luis), INVALID);
    await fails(merge(w.u.org, w.p.luis, w.p.luis), INVALID);
    const lid = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, lid, w.u.org, 'owner', 'org');
    await member(db, lid, w.u.luis, 'member', 'luis');
    const withAccount = await player(db, lid, 'Luis', w.u.luis);
    const kid = await db.rpc<string>(w.u.org, 'create_player', { p_league: lid, p_name: 'Nene', p_is_minor: true, p_guardian_name: 'Mamá', p_consent: true });
    expect((await db.rpc<Json>(w.u.org, 'merge_league_players_preview', { p_league: lid, p_keep: kid, p_drop: withAccount })).reason).toBe(
      'menor_con_cuenta',
    );
    await fails(merge(w.u.org, kid, withAccount, lid), INVALID);
    await fails(merge(w.u.org, withAccount, kid, lid), INVALID);
  });

  it('un menor repetido: el que queda es menor, con el tutor y el permiso', async () => {
    const lid = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, lid, w.u.org, 'owner', 'org');
    const kid = await db.rpc<string>(w.u.org, 'create_player', {
      p_league: lid,
      p_name: 'Nene',
      p_is_minor: true,
      p_guardian_name: 'Mamá',
      p_guardian_phone: '8095551234',
      p_consent: true,
    });
    const dup = await player(db, lid, 'Nene Pérez');
    await merge(w.u.org, dup, kid, lid);
    expect(await db.admin('select is_minor, user_id from public.players where id = $1', [dup])).toEqual([{ is_minor: true, user_id: null }]);
    expect(await db.admin('select guardian_name, guardian_phone, consent_by from public.player_private where player_id = $1', [dup])).toEqual([
      { guardian_name: 'Mamá', guardian_phone: '8095551234', consent_by: w.u.org },
    ]);
  });

  it('el reclamo pendiente del que se va pasa al que queda', async () => {
    const dup = await player(db, w.priv, 'Pedrito');
    const claim = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: dup });
    await merge(w.u.org, w.p.pedro, dup);
    expect(await db.admin('select player_id, status, player_name from public.player_claims where id = $1', [claim])).toEqual([
      { player_id: w.p.pedro, status: 'pending', player_name: 'Pedro' },
    ]);
  });

  it('lo que le falte al que queda (promedio fijo, atributos del deporte) sale del otro; lo suyo gana', async () => {
    const dup = await player(db, w.priv, 'Pedro P.');
    await db.admin(`update public.players set average_override = 185, attrs = '{"mano": "zurda", "bola": 14}' where id = $1`, [dup]);
    await db.admin(`update public.players set attrs = '{"bola": 15}' where id = $1`, [w.p.pedro]);
    await merge(w.u.org, w.p.pedro, dup);
    expect(await db.admin('select average_override, attrs from public.players where id = $1', [w.p.pedro])).toEqual([
      { average_override: 185, attrs: { mano: 'zurda', bola: 15 } },
    ]);
    const dup2 = await player(db, w.priv, 'Pedro 3');
    await db.admin(`update public.players set average_override = 150, attrs = '{"mano": "derecha"}' where id = $1`, [dup2]);
    await merge(w.u.org, w.p.pedro, dup2);
    expect(await db.admin('select average_override, attrs from public.players where id = $1', [w.p.pedro])).toEqual([
      { average_override: 185, attrs: { mano: 'zurda', bola: 15 } },
    ]);
  });

  it('un menor no se queda con un reclamo pendiente: al juntar (o al marcarlo menor) el reclamo se rechaza', async () => {
    const lid = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true });
    await member(db, lid, w.u.org, 'owner', 'org');
    await member(db, lid, w.u.ana, 'member', 'ana');
    await member(db, lid, w.u.luis, 'member', 'luis');
    const minor = (name: string) =>
      db.rpc<string>(w.u.org, 'create_player', { p_league: lid, p_name: name, p_is_minor: true, p_guardian_name: 'Mamá', p_consent: true });
    const claim = (id: string) => db.admin('select player_id, status, decision_note from public.player_claims where id = $1', [id]);
    const rejected = (pid: string) => [{ player_id: pid, status: 'rejected', decision_note: 'Es menor de edad: un menor no queda con una cuenta.' }];
    // El que queda es menor y alguien había pedido ser el que se va.
    const kid = await minor('Nene');
    const dup = await player(db, lid, 'Nene 2');
    const c1 = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: dup });
    await merge(w.u.org, kid, dup, lid);
    expect(await claim(c1)).toEqual(rejected(kid));
    // El que queda tenía un pedido y el que se va es menor: el que queda pasa a menor y su pedido se rechaza.
    const adult = await player(db, lid, 'Nena');
    const c2 = await db.rpc<string>(w.u.luis, 'request_player_claim', { p_player: adult });
    await merge(w.u.org, adult, await minor('Nena 2'), lid);
    expect(await claim(c2)).toEqual(rejected(adult));
    expect((await db.rpc<Json>(w.u.org, 'league_pending', { p_league: lid })).claims.count).toBe(0);
    // Marcarlo menor después.
    const juan = await player(db, lid, 'Juanito');
    const c3 = await db.rpc<string>(w.u.ana, 'request_player_claim', { p_player: juan });
    await db.rpc(w.u.org, 'set_player_minor', { p_player: juan, p_is_minor: true, p_guardian_name: 'Abuela', p_consent: true });
    expect(await claim(c3)).toEqual(rejected(juan));
  });

  it('solo el admin de esa liga, con jugadores de esa liga', async () => {
    const dup = await player(db, w.priv, 'Pedro 2');
    await fails(merge(w.u.luis, w.p.pedro, dup), DENIED);
    await fails(merge(w.u.otro, w.p.pedro, dup), DENIED);
    await fails(db.rpc(w.u.luis, 'merge_league_players_preview', { p_league: w.priv, p_keep: w.p.pedro, p_drop: dup }), DENIED);
    await fails(merge(w.u.org, w.p.pedro, w.p.p1), 'no_existe');
    await fails(merge(w.u.otro, w.p.p1, w.p.pedro, w.pub), 'no_existe');
    await fails(db.rpc(ANON, 'merge_league_players', { p_league: w.priv, p_keep: w.p.pedro, p_drop: dup }), '42501');
    // El superadmin sí.
    await merge(w.u.dios, w.p.pedro, dup);
  });
});

// =====================================================================
// C13. Menores en todos los deportes
// =====================================================================

describe('menores en todos los deportes', () => {
  async function minorsLeague(sport = 'basketball') {
    const lid = await league(db, w.u.org, { name: 'Escuelita', visibility: 'private', requirePhoto: false, hasMinors: true, sport });
    await member(db, lid, w.u.org, 'owner', 'org');
    await member(db, lid, w.u.luis, 'member', 'luis');
    return lid;
  }
  const add = (lid: string, extra: Record<string, unknown>) => db.rpc<string>(w.u.org, 'create_player', { p_league: lid, p_name: 'Nene', ...extra });
  const priv = (pid: string) =>
    db.admin('select guardian_name, guardian_phone, consent_by, consent_at is not null as consent from public.player_private where player_id = $1', [pid]);

  it('agregar un menor pide el tutor y su permiso; queda solo para los admins', async () => {
    const lid = await minorsLeague();
    await fails(add(lid, { p_is_minor: true, p_guardian_name: 'Mamá' }), INVALID);
    await fails(add(lid, { p_is_minor: true, p_consent: true }), INVALID);
    await fails(add(lid, { p_is_minor: true, p_guardian_name: '  ', p_consent: true }), INVALID);
    await fails(add(lid, { p_is_minor: true, p_guardian_name: 'Mamá', p_guardian_phone: 'llámame', p_consent: true }), INVALID);
    await fails(add(lid, { p_is_minor: true, p_guardian_name: 'x'.repeat(61), p_consent: true }), INVALID);
    // En una liga sin menores, nunca.
    await fails(add(w.priv, { p_is_minor: true, p_guardian_name: 'Mamá', p_consent: true }), INVALID);
    const kid = await add(lid, { p_is_minor: true, p_guardian_name: ' Mamá ', p_guardian_phone: '(809) 555-1234', p_consent: true });
    expect(await db.admin('select is_minor, user_id from public.players where id = $1', [kid])).toEqual([{ is_minor: true, user_id: null }]);
    expect(await priv(kid)).toEqual([{ guardian_name: 'Mamá', guardian_phone: '8095551234', consent_by: w.u.org, consent: true }]);
    expect(await db.asUser(w.u.luis, 'select player_id from public.player_private')).toEqual([]);
    expect(await db.asUser(w.u.org, 'select guardian_phone from public.player_private')).toEqual([{ guardian_phone: '8095551234' }]);
    // Sin teléfono también vale.
    const kid2 = await add(lid, { p_is_minor: true, p_guardian_name: 'Papá', p_consent: true, p_name: 'Nena' });
    expect(await priv(kid2)).toEqual([{ guardian_name: 'Papá', guardian_phone: null, consent_by: w.u.org, consent: true }]);
  });

  it('a un jugador que no es menor no se le guardan datos del tutor; lo de siempre sigue igual', async () => {
    const lid = await minorsLeague('padel');
    const adult = await add(lid, { p_guardian_name: 'Nadie', p_guardian_phone: '8090000000', p_consent: true, p_name: 'Adulto' });
    expect(await priv(adult)).toEqual([]);
    const pid = randomUUID();
    expect(await db.rpc(w.u.org, 'create_player', { p_league: w.priv, p_name: 'Con promedio', p_average_override: 170, p_id: pid })).toBe(pid);
    expect(await db.admin('select average_override, is_minor from public.players where id = $1', [pid])).toEqual([{ average_override: 170, is_minor: false }]);
    await fails(db.rpc(w.u.luis, 'create_player', { p_league: w.priv, p_name: 'X' }), DENIED);
  });

  it('update_player ya no marca a nadie como menor (eso pide el tutor): quitar la marca sigue igual', async () => {
    const lid = await minorsLeague();
    const p = await player(db, lid, 'Juanito');
    await fails(db.rpc(w.u.org, 'update_player', { p_player: p, p_patch: { is_minor: true } }), INVALID);
    expect(await db.admin('select is_minor from public.players where id = $1', [p])).toEqual([{ is_minor: false }]);
    expect(await priv(p)).toEqual([]);
    const kid = await add(lid, { p_is_minor: true, p_guardian_name: 'Mamá', p_consent: true });
    // Ya era menor: no cambia nada ni escribe otro permiso.
    await db.rpc(w.u.org, 'update_player', { p_player: kid, p_patch: { is_minor: true, name: 'Nene P.' } });
    expect(await db.admin('select name, is_minor from public.players where id = $1', [kid])).toEqual([{ name: 'Nene P.', is_minor: true }]);
    await db.rpc(w.u.org, 'update_player', { p_player: kid, p_patch: { is_minor: false } });
    expect(await db.admin('select is_minor from public.players where id = $1', [kid])).toEqual([{ is_minor: false }]);
  });

  it('marcar después que es menor (o que ya no lo es)', async () => {
    const lid = await minorsLeague('football');
    const p = await player(db, lid, 'Juanito');
    await fails(db.rpc(w.u.org, 'set_player_minor', { p_player: p, p_is_minor: true, p_guardian_name: 'Abuela' }), INVALID);
    await db.rpc(w.u.org, 'set_player_minor', { p_player: p, p_is_minor: true, p_guardian_name: 'Abuela', p_guardian_phone: '+18095550000', p_consent: true });
    expect(await db.admin('select is_minor from public.players where id = $1', [p])).toEqual([{ is_minor: true }]);
    expect(await priv(p)).toEqual([{ guardian_name: 'Abuela', guardian_phone: '+18095550000', consent_by: w.u.org, consent: true }]);
    // Un menor no se reclama.
    await fails(db.rpc(w.u.luis, 'request_player_claim', { p_player: p }), INVALID);
    await db.rpc(w.u.org, 'set_player_minor', { p_player: p, p_is_minor: false });
    expect(await db.admin('select is_minor from public.players where id = $1', [p])).toEqual([{ is_minor: false }]);
    // Con cuenta, o en una liga sin menores: no.
    const withAccount = await player(db, lid, 'Luis', w.u.luis);
    await fails(db.rpc(w.u.org, 'set_player_minor', { p_player: withAccount, p_is_minor: true, p_guardian_name: 'X', p_consent: true }), INVALID);
    await fails(db.rpc(w.u.org, 'set_player_minor', { p_player: w.p.pedro, p_is_minor: true, p_guardian_name: 'X', p_consent: true }), INVALID);
    await fails(db.rpc(w.u.luis, 'set_player_minor', { p_player: p, p_is_minor: true, p_guardian_name: 'X', p_consent: true }), DENIED);
    await fails(db.rpc(w.u.org, 'set_player_minor', { p_player: randomUUID(), p_is_minor: true }), 'no_existe');
  });
});

// =====================================================================
// C14. Suspender un día
// =====================================================================

describe('suspender un día', () => {
  /** Liga de pádel con partidos y noches ese día, y lo de otros días. */
  async function padelDay() {
    const lid = await league(db, w.u.org, { name: 'Pádel Club', visibility: 'private', sport: 'padel', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    await member(db, lid, w.u.luis, 'member', 'luis');
    const d = await day(2);
    const jornada = await anyEvent(lid, 'liga', d, 'Jornada 3');
    const noche = await anyEvent(lid, 'americano', d, 'Americano');
    const m = {
      programado: await match(lid, `${d} 19:00`, 'scheduled', { event: jornada }),
      aplazado: await match(lid, `${d} 20:30`, 'postponed'),
      enJuego: await match(lid, `${d} 18:00`, 'live'),
      jugado: await match(lid, `${d} 17:00`, 'confirmed'),
      anulado: await match(lid, `${d} 16:00`, 'void'),
      otroDia: await match(lid, `${await day(3)} 19:00`),
      // A las 11 pm del día anterior en la zona de la liga (ya es ese día en UTC): no es de ese día.
      nocheAntes: await match(lid, `${await day(1)} 23:00`),
    };
    return { lid, d, jornada, noche, m };
  }
  const when = async (id: string) =>
    (await db.admin<{ d: string; t: string; status: string }>(
      `select (scheduled_at at time zone '${TZ}')::date::text as d, to_char(scheduled_at at time zone '${TZ}', 'HH24:MI') as t, status
         from public.matches where id = $1`,
      [id],
    ))[0];

  it('el adelanto cuenta lo que cambiaría, sin cambiar nada', async () => {
    const x = await padelDay();
    const r = await db.rpc<Json>(w.u.org, 'suspend_day_preview', { p_league: x.lid, p_date: x.d });
    expect(r.date).toBe(x.d);
    expect(r.matches.map((m: Json) => [m.id, m.status, m.locked, m.reason])).toEqual([
      [x.m.jugado, 'confirmed', true, 'con_resultado'],
      [x.m.enJuego, 'live', true, 'en_juego'],
      [x.m.programado, 'scheduled', false, null],
      [x.m.aplazado, 'postponed', false, null],
    ]);
    expect(r.matches[2]).toMatchObject({ label: 'Rojos vs Azules', sub: 'racket' });
    expect(r.events).toHaveLength(2);
    expect(r.events.find((e: Json) => e.id === x.jornada)).toMatchObject({ label: 'Jornada 3', sub: 'event', locked: false, content: true });
    expect(r.events.find((e: Json) => e.id === x.noche)).toMatchObject({ sub: 'event', locked: false, content: false });
    expect(r.counts).toEqual({ matches: 2, bowlingEvents: 0, golfRounds: 0, swimMeets: 0, otherEvents: 2, locked: 2 });
    expect(r.withNewDate).toEqual({ matches: 2, events: 2 });
    expect(r.withoutDate).toEqual({ postponed: 1, cancelled: 1, kept: 1 });
    expect((await when(x.m.programado)).d).toBe(x.d);
    await fails(db.rpc(w.u.luis, 'suspend_day_preview', { p_league: x.lid, p_date: x.d }), DENIED);
  });

  it('con nueva fecha: los partidos pasan a ese día a la misma hora, los eventos también, y sale un aviso', async () => {
    const x = await padelDay();
    await phone(w.u.luis);
    const nd = await day(9);
    const r = await db.rpc<Json>(w.u.org, 'suspend_day', { p_league: x.lid, p_date: x.d, p_reason: ' Lluvia. ', p_new_date: nd });
    const names = (await db.admin<{ a: string; b: string }>('select private.org_day($1::date) as a, private.org_day($2::date) as b', [x.d, nd]))[0];
    const body = `Se suspende el ${names.a}: Lluvia. Nueva fecha: ${names.b}.`;
    expect(r).toEqual({
      date: x.d,
      newDate: nd,
      matches: { moved: 2, postponed: 0 },
      events: { moved: 2, cancelled: 0, kept: 0 },
      locked: 2,
      announced: true,
      skipped: null,
      recipients: 1,
      body,
    });
    expect(await when(x.m.programado)).toEqual({ d: nd, t: '19:00', status: 'scheduled' });
    expect(await when(x.m.aplazado)).toEqual({ d: nd, t: '20:30', status: 'scheduled' });
    expect(await when(x.m.enJuego)).toEqual({ d: x.d, t: '18:00', status: 'live' });
    expect(await when(x.m.jugado)).toEqual({ d: x.d, t: '17:00', status: 'confirmed' });
    expect((await when(x.m.nocheAntes)).status).toBe('scheduled');
    expect(await db.admin(`select history -> -1 ->> 'a' as a, history -> -1 ->> 'note' as note, note as n from public.matches where id = $1`, [x.m.programado])).toEqual([
      { a: 'reschedule', note: 'Lluvia', n: 'Lluvia' },
    ]);
    expect(await db.admin('select date::text as d from public.events where id in ($1, $2)', [x.jornada, x.noche])).toEqual([{ d: nd }, { d: nd }]);
    // UN aviso a la liga (con la historia de avisos).
    expect(await db.admin('select body, sent_by, recipients from public.league_announcements where league_id = $1', [x.lid])).toEqual([
      { body, sent_by: w.u.org, recipients: 1 },
    ]);
    expect(await db.admin('select user_id, title, body from public.push_outbox')).toEqual([{ user_id: w.u.luis, title: 'Pádel Club', body }]);
    // Otra vez lo mismo (doble toque): ya no hay nada de ese día ni se repite el aviso.
    const again = await db.rpc<Json>(w.u.org, 'suspend_day', { p_league: x.lid, p_date: x.d, p_reason: 'Lluvia', p_new_date: nd });
    expect(again).toMatchObject({ matches: { moved: 0, postponed: 0 }, events: { moved: 0 }, announced: false, skipped: 'nada', recipients: 0 });
    expect(await db.count('public.league_announcements', 'league_id = $1', [x.lid])).toBe(1);
  });

  it('sin fecha: los partidos quedan aplazados y los eventos vacíos se cancelan; lo que tiene inscritos se queda', async () => {
    const x = await padelDay();
    const r = await db.rpc<Json>(w.u.org, 'suspend_day', { p_league: x.lid, p_date: x.d, p_reason: 'No hay luz' });
    expect(r).toMatchObject({
      newDate: null,
      matches: { moved: 0, postponed: 1 },
      events: { moved: 0, cancelled: 1, kept: 1 },
      locked: 2,
      announced: true,
      recipients: 0,
    });
    expect(r.body).toMatch(/^Se suspende el \S+ \d+ de \S+: No hay luz\. La nueva fecha se avisará\.$/);
    expect(await when(x.m.programado)).toEqual({ d: x.d, t: '19:00', status: 'postponed' });
    expect(await db.admin(`select history -> -1 ->> 'a' as a, history -> -1 ->> 'from' as f from public.matches where id = $1`, [x.m.programado])).toEqual([
      { a: 'postpone', f: 'scheduled' },
    ]);
    expect((await when(x.m.aplazado)).status).toBe('postponed');
    expect(await db.count('public.events', 'id = $1', [x.noche])).toBe(0);
    expect(await db.count('public.events', 'id = $1', [x.jornada])).toBe(1);
  });

  it('boliche y natación: se mueven o se cancelan; lo que ya tiene resultados no se toca', async () => {
    const d = await day(1);
    const prac = await event(db, w.priv, 'practica', d);
    const tour = await event(db, w.priv, 'torneo', d, 3, 'Copa');
    await entry(db, w.priv, tour, w.p.pedro, [null, null, null], [null, null, null]);
    const played = await event(db, w.priv, 'practica', d, 3, 'Jugada');
    await entry(db, w.priv, played, w.p.luis, [180], ['sin-foto']);
    let pre = await db.rpc<Json>(w.u.org, 'suspend_day_preview', { p_league: w.priv, p_date: d });
    expect(pre.counts).toEqual({ matches: 0, bowlingEvents: 2, golfRounds: 0, swimMeets: 0, otherEvents: 0, locked: 1 });
    expect(pre.events.find((e: Json) => e.id === prac)).toMatchObject({ label: expect.stringMatching(/^Práctica del /), sub: 'bowling' });
    expect(pre.withoutDate).toEqual({ postponed: 0, cancelled: 1, kept: 1 });
    const r = await db.rpc<Json>(w.u.sofi, 'suspend_day', { p_league: w.priv, p_date: d, p_reason: 'La bolera cerró' });
    expect(r.events).toEqual({ moved: 0, cancelled: 1, kept: 1 });
    expect(await db.count('public.events', 'id = any ($1)', [[prac, tour, played]])).toBe(2);

    const swim = await league(db, w.u.org, { name: 'Natación', visibility: 'private', sport: 'swimming', requirePhoto: false });
    await member(db, swim, w.u.org, 'owner', 'org');
    const meet = await anyEvent(swim, 'encuentro', d, 'Encuentro');
    pre = await db.rpc<Json>(w.u.org, 'suspend_day_preview', { p_league: swim, p_date: d });
    expect(pre.counts).toMatchObject({ swimMeets: 1 });
    await db.rpc(w.u.org, 'suspend_day', { p_league: swim, p_date: d, p_reason: 'Piscina en arreglo', p_new_date: await day(8) });
    expect(await db.admin('select date::text as d from public.events where id = $1', [meet])).toEqual([{ d: await day(8) }]);
  });

  it('sin fecha no borra un evento con algo adentro (voy, pistas, programa, escalera); juegos por aprobar no se tocan', async () => {
    const d = await day(1);
    const conEnvio = await event(db, w.priv, 'practica', d, 3, 'Con envío');
    await db.admin(`insert into public.submissions (league_id, player_id, event_id, scores) values ($1, $2, $3, '{180}')`, [w.priv, w.p.luis, conEnvio]);
    const conVoy = await event(db, w.priv, 'practica', d, 3, 'Con voy');
    await db.admin('insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3)', [conVoy, w.p.pedro, w.priv]);
    const conPistas = await event(db, w.priv, 'torneo', d, 3, 'Con pistas');
    await db.admin('insert into public.event_lanes (event_id, player_id, league_id, lane) values ($1, $2, $3, 7)', [conPistas, w.p.pedro, w.priv]);
    const vacio = await event(db, w.priv, 'practica', d, 3, 'Vacío');
    const nadieVa = await event(db, w.priv, 'practica', d, 3, 'Nadie va');
    await db.admin('insert into public.event_rsvps (event_id, player_id, league_id, going) values ($1, $2, $3, false)', [nadieVa, w.p.pedro, w.priv]);
    const pre = await db.rpc<Json>(w.u.org, 'suspend_day_preview', { p_league: w.priv, p_date: d });
    const ev = (id: string) => pre.events.find((e: Json) => e.id === id);
    expect(ev(conEnvio)).toMatchObject({ locked: true, reason: 'con_resultado' });
    expect(ev(conVoy)).toMatchObject({ locked: false, content: true });
    expect(ev(conPistas)).toMatchObject({ locked: false, content: true });
    expect(ev(vacio)).toMatchObject({ locked: false, content: false });
    expect(ev(nadieVa)).toMatchObject({ locked: false, content: false });
    expect(pre.withoutDate).toEqual({ postponed: 0, cancelled: 2, kept: 2 });
    const r = await db.rpc<Json>(w.u.org, 'suspend_day', { p_league: w.priv, p_date: d, p_reason: 'Lluvia' });
    expect(r.events).toEqual({ moved: 0, cancelled: 2, kept: 2 });
    expect(await db.count('public.events', 'id = any ($1)', [[conEnvio, conVoy, conPistas]])).toBe(3);
    expect(await db.count('public.submissions', 'event_id = $1', [conEnvio])).toBe(1);

    // Natación: el programa del encuentro. Pádel: una escalera con sus puestos.
    const swim = await league(db, w.u.org, { name: 'Natación', visibility: 'private', sport: 'swimming', requirePhoto: false });
    await member(db, swim, w.u.org, 'owner', 'org');
    const meet = await anyEvent(swim, 'encuentro', d, 'Encuentro');
    await db.admin(`insert into public.swim_events (league_id, event_id, num, distance, stroke, pool, gender) values ($1, $2, 1, 50, 'libre', 25, 'X')`, [
      swim,
      meet,
    ]);
    expect((await db.rpc<Json>(w.u.org, 'suspend_day', { p_league: swim, p_date: d, p_reason: 'Lluvia' })).events).toEqual({ moved: 0, cancelled: 0, kept: 1 });
    const padel = await league(db, w.u.org, { name: 'Pádel', visibility: 'private', sport: 'padel', requirePhoto: false });
    await member(db, padel, w.u.org, 'owner', 'org');
    const ladder = await anyEvent(padel, 'escalera', d, 'Escalera');
    const pa = await player(db, padel, 'Ana');
    await db.admin('insert into public.ladder_rungs (event_id, league_id, entrant_id, player_id, position) values ($1, $2, $3, $3, 1)', [ladder, padel, pa]);
    expect((await db.rpc<Json>(w.u.org, 'suspend_day', { p_league: padel, p_date: d, p_reason: 'Lluvia' })).events).toEqual({ moved: 0, cancelled: 0, kept: 1 });
    expect(await db.count('public.events', 'id = any ($1)', [[meet, ladder]])).toBe(2);
  });

  it('los retos de la escalera de ese día no vencen por la suspensión: su plazo para jugar se alarga', async () => {
    const x = await padelDay();
    const a = await player(db, x.lid, 'Ana');
    const b = await player(db, x.lid, 'Beto');
    const ev = await db.rpc<string>(w.u.org, 'create_event', {
      p_league: x.lid,
      p_type: 'escalera',
      p_date: await day(0),
      p_name: 'Escalera',
      p_config: { format: 'escalera', maxUp: 3, acceptDays: 3, playDays: 7 },
    });
    await db.rpc(w.u.org, 'set_ladder', { p_event: ev, p_entrants: [a, b] });
    const ch = await db.rpc<string>(w.u.org, 'create_challenge', { p_event: ev, p_challenged: a, p_challenger: b });
    const at = (await db.admin<{ t: string }>(`select (($1::date + time '21:00') at time zone '${TZ}')::text as t`, [x.d]))[0].t;
    await db.rpc(w.u.org, 'accept_challenge', { p_challenge: ch, p_scheduled_at: at });
    // El plazo vencía esa misma noche.
    await db.admin(`update public.ladder_challenges set play_by = ($2::date + time '23:00') at time zone '${TZ}' where id = $1`, [ch, x.d]);
    const check = async (sql: string, params: unknown[] = []) =>
      (await db.admin<{ ok: boolean }>(`select ${sql} as ok from public.ladder_challenges c join public.matches m on m.id = c.match_id where c.id = $1`, [ch, ...params]))[0]
        .ok;
    // Sin fecha: aplazado, y otra vez los 7 días de la escalera desde hoy.
    await db.rpc(w.u.org, 'suspend_day', { p_league: x.lid, p_date: x.d, p_reason: 'Lluvia' });
    expect(await check(`m.status = 'postponed' and c.play_by >= now() + interval '7 days' - interval '1 minute'`)).toBe(true);
    await db.admin(`update public.ladder_challenges set play_by = now() + interval '1 hour' where id = $1`, [ch]);
    // Con fecha: hasta un día después de la nueva hora.
    const nd = await day(20);
    await db.rpc(w.u.org, 'suspend_day', { p_league: x.lid, p_date: x.d, p_reason: 'Lluvia otra vez', p_new_date: nd });
    expect(
      await check(`m.status = 'scheduled' and c.play_by = m.scheduled_at + interval '1 day' and (m.scheduled_at at time zone '${TZ}')::date = $2::date`, [nd]),
    ).toBe(true);
    // El cron no lo cierra.
    await db.admin('select private.ladder_expire_all()');
    expect((await db.admin<{ status: string }>('select status from public.ladder_challenges where id = $1', [ch]))[0].status).toBe('accepted');
  });

  it('si no cambia nada no sale el aviso; el mismo aviso seguido tampoco', async () => {
    const d = await day(1);
    const tour = await event(db, w.priv, 'torneo', d, 3, 'Copa');
    await entry(db, w.priv, tour, w.p.pedro, [null, null, null], [null, null, null]);
    const suspend = () => db.rpc<Json>(w.u.org, 'suspend_day', { p_league: w.priv, p_date: d, p_reason: 'Lluvia' });
    expect(await suspend()).toMatchObject({ events: { cancelled: 0, kept: 1 }, announced: false, skipped: 'nada', recipients: 0 });
    expect(await db.count('public.league_announcements', 'league_id = $1', [w.priv])).toBe(0);
    await event(db, w.priv, 'practica', d);
    expect(await suspend()).toMatchObject({ events: { cancelled: 1, kept: 1 }, announced: true, skipped: null });
    await event(db, w.priv, 'practica', d);
    expect(await suspend()).toMatchObject({ events: { cancelled: 1, kept: 1 }, announced: false, skipped: 'duplicado' });
    expect(await db.count('public.league_announcements', 'league_id = $1', [w.priv])).toBe(1);
  });

  it('valida el motivo y la fecha; solo el admin; si ya se mandaron los avisos del día, suspende igual', async () => {
    const x = await padelDay();
    const call = (uid: string, extra: Record<string, unknown>) =>
      db.rpc<Json>(uid, 'suspend_day', { p_league: x.lid, p_date: x.d, p_reason: 'Lluvia', ...extra });
    await fails(call(w.u.org, { p_reason: '' }), INVALID);
    await fails(call(w.u.org, { p_reason: ' ... ' }), INVALID);
    await fails(call(w.u.org, { p_reason: 'x'.repeat(91) }), INVALID);
    await fails(call(w.u.org, { p_reason: 'a\tb' }), INVALID);
    await fails(call(w.u.org, { p_new_date: x.d }), INVALID);
    await fails(call(w.u.org, { p_new_date: await day(-1) }), INVALID);
    await fails(call(w.u.org, { p_date: null }), INVALID);
    await fails(call(w.u.luis, {}), DENIED);
    await fails(call(w.u.otro, {}), DENIED);
    await fails(db.rpc(ANON, 'suspend_day', { p_league: x.lid, p_date: x.d, p_reason: 'x' }), '42501');
    // El motivo más largo cabe en el aviso (hasta 180).
    for (let i = 0; i < 3; i++) await db.rpc(w.u.org, 'league_announce', { p_league: x.lid, p_body: `Aviso ${i}` });
    const r = await call(w.u.org, { p_reason: 'x'.repeat(90), p_new_date: await day(30) });
    expect(r).toMatchObject({ matches: { moved: 2 }, announced: false, skipped: 'limite' });
    expect(r.body.length).toBeLessThanOrEqual(180);
  });

  it('nombres de los días en español', async () => {
    expect(await db.admin(`select private.org_day('2026-09-29') as a, private.org_day('2027-01-03') as b`)).toEqual([
      { a: 'martes 29 de septiembre', b: 'domingo 3 de enero' },
    ]);
  });
});
