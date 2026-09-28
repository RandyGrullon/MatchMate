/**
 * Avisos por push de todos los deportes (20260927001200_avisos.sql): el recordatorio de partido de raqueta y de
 * equipos (con la convocatoria), el del pádel de antes (ahora match_reminders solo del pádel), los de las rondas
 * de golf, los encuentros de natación y las noches de americano, y el aviso de reclamo a los organizadores. Cada
 * prueba en su transacción.
 *
 * Horas en Santo Domingo (UTC−4, sin horario de verano): 2026-10-08 es jueves.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DENIED, SERVICE, TestDb, fails } from './harness';
import { event, league, makeWorld, member, player, type World } from './fixture';
import { DEMO_COURSE } from '../../src/sports/golf/demo';

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

let subs = 0;
async function subscribe(...uids: string[]) {
  for (const uid of uids) {
    await db.admin(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'k', 'a')`, [
      uid,
      `https://fcm.googleapis.com/fcm/send/avisos-${uid}-${subs++}`,
    ]);
  }
}

interface Push {
  user_id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  ttl: number;
  urgency: string;
}

const pushes = (tag: string) =>
  db.admin<Push>('select user_id, title, body, url, tag, ttl, urgency from public.push_outbox where tag = $1 order by created_at, id', [tag]);
const allPushes = () => db.admin<Push>('select user_id, title, body, url, tag, ttl, urgency from public.push_outbox order by id');
const clearPushes = () => db.admin('delete from public.push_outbox');
/** Lo que recibió cada cuenta: { uid: [título, texto] }. */
const byUser = (rows: Push[]) => Object.fromEntries(rows.map((r) => [r.user_id, [r.title, r.body]]));

const matchReminders = async (now: string, sports: string[] | null = null) =>
  (await db.admin<{ n: number }>('select private.match_reminders($1, $2) as n', [now, sports]))[0].n;
const eventReminders = async (now: string) => (await db.admin<{ n: number }>('select private.event_reminders($1) as n', [now]))[0].n;

/** Liga de un deporte con dueño org y admin sofi; luis, ana y otra son miembros con jugador. pedro sin cuenta. */
async function club(sport: string, name: string) {
  const lid = await league(db, w.u.org, { name, visibility: 'private', sport, requirePhoto: false });
  await member(db, lid, w.u.org, 'owner', 'org');
  await member(db, lid, w.u.sofi, 'admin', 'sofi');
  await member(db, lid, w.u.luis, 'member', 'luis');
  await member(db, lid, w.u.ana, 'member', 'ana');
  await member(db, lid, w.u.otra, 'member', 'otra');
  const p = {
    luis: await player(db, lid, 'Luis', w.u.luis),
    ana: await player(db, lid, 'Ana', w.u.ana),
    otra: await player(db, lid, 'Otra', w.u.otra),
    pedro: await player(db, lid, 'Pedro'),
  };
  return { lid, p };
}

const single = (n: 1 | 2, playerId: string) => ({ side: n, players: [{ player_id: playerId }] });

describe('partidos de raqueta: «Partido hoy a las 8:00 pm, Cancha 2»', () => {
  it('el día antes (12 pm a 9 pm) y el mismo día (3 horas a 10 minutos antes), una vez cada uno', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis, w.u.ana, w.u.otra);
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ court: 'Cancha 2', scheduled_at: '2026-10-09T00:00:00Z', sides: [single(1, c.p.luis), single(2, c.p.ana)] }],
    });
    const tag = `partido:${id}`;

    // Martes 9:30 pm: faltan dos días. Miércoles 9:30 pm: ya es de noche.
    expect(await matchReminders('2026-10-07T01:30:00Z')).toBe(0);
    expect(await matchReminders('2026-10-08T01:30:00Z')).toBe(0);
    // Miércoles 4:00 pm: el día antes.
    expect(await matchReminders('2026-10-07T20:00:00Z')).toBe(1);
    const before = await pushes(tag);
    expect(byUser(before)).toEqual({
      [w.u.luis]: ['Partido mañana a las 8:00 pm, Cancha 2', 'Luis contra Ana · Tenis Club'],
      [w.u.ana]: ['Partido mañana a las 8:00 pm, Cancha 2', 'Luis contra Ana · Tenis Club'],
    });
    expect(before[0]).toMatchObject({ url: `/l/${c.lid}/juegos?partido=${id}`, urgency: 'high', ttl: 6 * 3600 });
    expect(await matchReminders('2026-10-07T23:00:00Z')).toBe(0);

    // Jueves 4:30 pm: todavía no (más de 3 horas). 5:00 pm: sí. 7:55 pm: ya no se manda otra vez.
    expect(await matchReminders('2026-10-08T20:30:00Z')).toBe(0);
    await clearPushes();
    expect(await matchReminders('2026-10-08T21:00:00Z')).toBe(1);
    const today = await pushes(tag);
    expect(byUser(today)).toEqual({
      [w.u.luis]: ['Partido hoy a las 8:00 pm, Cancha 2', 'Luis contra Ana · Tenis Club'],
      [w.u.ana]: ['Partido hoy a las 8:00 pm, Cancha 2', 'Luis contra Ana · Tenis Club'],
    });
    // El aviso dura hasta que empieza.
    expect(today[0].ttl).toBe(3 * 3600);
    expect(await matchReminders('2026-10-08T23:55:00Z')).toBe(0);
  });

  it('si lo reprograman vuelve a salir; terminado, aplazado o a 10 minutos, no', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis);
    const [id, late] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [
        { court: 'Central', scheduled_at: '2026-10-09T00:00:00Z', sides: [single(1, c.p.luis), single(2, c.p.pedro)] },
        { scheduled_at: '2026-10-08T21:05:00Z', sides: [single(1, c.p.luis), single(2, c.p.ana)] },
      ],
    });
    expect(await matchReminders('2026-10-08T21:00:00Z')).toBe(1);
    expect((await pushes(`partido:${late}`)).length).toBe(0);
    await db.rpc(w.u.sofi, 'reschedule_match', { p_match: id, p_scheduled_at: '2026-10-08T23:30:00Z' });
    await clearPushes();
    expect(await matchReminders('2026-10-08T21:00:00Z')).toBe(1);
    expect(byUser(await pushes(`partido:${id}`))).toEqual({ [w.u.luis]: ['Partido hoy a las 7:30 pm, Central', 'Luis contra Pedro · Tenis Club'] });
    await db.rpc(w.u.sofi, 'reschedule_match', { p_match: id, p_scheduled_at: '2026-10-08T23:45:00Z' });
    await db.rpc(w.u.sofi, 'postpone_match', { p_match: id });
    expect(await matchReminders('2026-10-08T21:00:00Z')).toBe(0);
  });

  it('temprano: nunca antes de las 7:00 am; sin cancha, sin coma', async () => {
    const c = await club('pickleball', 'Pickle RD');
    await subscribe(w.u.ana);
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ format: 'sets', scheduled_at: '2026-10-08T11:30:00Z', sides: [single(1, c.p.ana), single(2, c.p.otra)] }],
    });
    // 6:00 am (dentro de las 3 horas, pero muy temprano) y 7:05 am.
    expect(await matchReminders('2026-10-08T10:00:00Z')).toBe(0);
    expect(await matchReminders('2026-10-08T11:05:00Z')).toBe(1);
    expect(byUser(await pushes(`partido:${id}`))).toEqual({ [w.u.ana]: ['Partido hoy a las 7:30 am', 'Ana contra Otra · Pickle RD'] });
  });

  it('el reto de la escalera y la fase del torneo se dicen', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis);
    const [reto, semi] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [
        { stage: 'Reto', court: 'Cancha 1', scheduled_at: '2026-10-08T22:00:00Z', sides: [single(1, c.p.luis), single(2, c.p.ana)] },
        { stage: 'Semifinal', scheduled_at: '2026-10-08T23:00:00Z', sides: [single(1, c.p.otra), single(2, c.p.luis)] },
      ],
    });
    expect(await matchReminders('2026-10-08T21:00:00Z')).toBe(2);
    expect(byUser(await pushes(`partido:${reto}`))).toEqual({ [w.u.luis]: ['Reto hoy a las 6:00 pm, Cancha 1', 'Luis contra Ana · Tenis Club'] });
    expect(byUser(await pushes(`partido:${semi}`))).toEqual({ [w.u.luis]: ['Partido hoy a las 7:00 pm', 'Semifinal · Otra contra Luis · Tenis Club'] });
  });

  it('quien se salió de la liga ya no recibe (aunque su jugador siga en el partido)', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis, w.u.ana);
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ scheduled_at: '2026-10-09T00:00:00Z', sides: [single(1, c.p.luis), single(2, c.p.ana)] }],
    });
    await db.rpc(w.u.ana, 'leave_league', { p_league: c.lid });
    expect(await matchReminders('2026-10-08T21:00:00Z')).toBe(1);
    expect(Object.keys(byUser(await pushes(`partido:${id}`)))).toEqual([w.u.luis]);
  });

  it('pareja: los de la pareja (aunque no estén en el partido); la ronda de un americano no (la avisa la ronda)', async () => {
    const c = await club('padel', 'Pádel Club');
    await subscribe(w.u.luis, w.u.ana, w.u.otra);
    const pair = await db.rpc<string>(w.u.sofi, 'create_season_team', {
      p_league: c.lid,
      p_name: 'Ana / Otra',
      p_players: [{ player_id: c.p.ana }, { player_id: c.p.otra }],
    });
    const [id, points] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [
        { format: 'sets', court: 'Cancha 2', scheduled_at: '2026-10-09T00:00:00Z', sides: [{ side: 1, players: [{ player_id: c.p.luis }, { player_id: c.p.pedro }] }, { side: 2, team_id: pair }] },
        { format: 'americano', court: 'Cancha 1', scheduled_at: '2026-10-09T00:00:00Z', sides: [single(1, c.p.luis), single(2, c.p.ana)] },
      ],
    });
    expect(await matchReminders('2026-10-08T21:00:00Z')).toBe(1);
    expect(Object.keys(byUser(await pushes(`partido:${id}`))).sort()).toEqual([w.u.luis, w.u.ana, w.u.otra].sort());
    expect(await pushes(`partido:${points}`)).toEqual([]);
  });
});

describe('partidos de equipos: la convocatoria', () => {
  it('toda la plantilla de los dos equipos; «Voy» ya no pregunta, «No voy» no recibe', async () => {
    const c = await club('football', 'Liga de Fútbol');
    await member(db, c.lid, w.u.nuevo, 'member', 'nuevo');
    await member(db, c.lid, w.u.extra, 'member', 'extra');
    const pNuevo = await player(db, c.lid, 'Nuevo', w.u.nuevo);
    const pExtra = await player(db, c.lid, 'Extra', w.u.extra);
    await subscribe(w.u.luis, w.u.ana, w.u.otra, w.u.nuevo, w.u.extra, w.u.sofi);
    const tigres = await db.rpc<string>(w.u.sofi, 'create_season_team', {
      p_league: c.lid,
      p_name: 'Tigres',
      p_players: [{ player_id: c.p.luis, role: 'captain' }, { player_id: c.p.ana }, { player_id: c.p.otra }],
    });
    const leones = await db.rpc<string>(w.u.sofi, 'create_season_team', {
      p_league: c.lid,
      p_name: 'Leones',
      p_players: [{ player_id: pNuevo, role: 'delegate' }, { player_id: pExtra }, { player_id: c.p.pedro }],
    });
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ stage: 'Semifinal', court: 'Campo 1', scheduled_at: '2026-10-09T00:00:00Z', sides: [{ side: 1, team_id: tigres }, { side: 2, team_id: leones }] }],
    });
    await db.rpc(w.u.ana, 'set_match_rsvp', { p_match: id, p_status: 'yes' });
    await db.rpc(w.u.otra, 'set_match_rsvp', { p_match: id, p_status: 'no' });
    await db.rpc(w.u.extra, 'set_match_rsvp', { p_match: id, p_status: 'maybe' });

    expect(await matchReminders('2026-10-07T20:00:00Z')).toBe(1);
    const ask = 'Semifinal · Tigres contra Leones · Liga de Fútbol. ¿Vas? Márcalo en la convocatoria.';
    const title = 'Partido mañana a las 8:00 pm, Campo 1';
    expect(byUser(await pushes(`partido:${id}`))).toEqual({
      [w.u.luis]: [title, ask],
      [w.u.ana]: [title, 'Semifinal · Tigres contra Leones · Liga de Fútbol. ¡Nos vemos en la cancha!'],
      [w.u.nuevo]: [title, ask],
      [w.u.extra]: [title, ask],
    });
  });
});

describe('el aviso del pádel de antes', () => {
  it('padel_match_reminders es el de todos, solo del pádel, con las mismas marcas', async () => {
    const padel = await club('padel', 'Pádel Club');
    const tennis = await club('tennis', 'Tenis Club');
    await subscribe(w.u.luis);
    const [p] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: padel.lid,
      p_matches: [{ format: 'sets', court: 'Cancha 2', scheduled_at: '2026-10-09T00:00:00Z', sides: [single(1, padel.p.luis), single(2, padel.p.ana)] }],
    });
    const [t] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: tennis.lid,
      p_matches: [{ scheduled_at: '2026-10-09T00:00:00Z', sides: [single(1, tennis.p.luis), single(2, tennis.p.ana)] }],
    });
    expect(await db.admin('select private.padel_match_reminders($1) as n', ['2026-10-08T21:00:00Z'])).toEqual([{ n: 1 }]);
    expect((await allPushes()).map((r) => r.tag)).toEqual([`partido:${p}`]);
    // El de todos no lo repite; el tenis sale ahora.
    expect(await matchReminders('2026-10-08T21:00:00Z')).toBe(1);
    expect((await allPushes()).map((r) => r.tag)).toEqual([`partido:${p}`, `partido:${t}`]);
  });
});

describe('golf: rondas', () => {
  async function golf() {
    const lid = await league(db, w.u.org, { name: 'Golf del Club', visibility: 'private', sport: 'golf', requirePhoto: false });
    await member(db, lid, w.u.org, 'owner', 'org');
    await member(db, lid, w.u.sofi, 'admin', 'sofi');
    await member(db, lid, w.u.luis, 'member', 'luis');
    await member(db, lid, w.u.ana, 'member', 'ana');
    await member(db, lid, w.u.extra, 'member', 'extra');
    const p = { luis: await player(db, lid, 'Luis', w.u.luis), ana: await player(db, lid, 'Ana', w.u.ana), extra: await player(db, lid, 'Extra', w.u.extra) };
    const course = await db.rpc<string>(w.u.sofi, 'golf_save_course', {
      p_league: lid,
      p_name: 'Campo de ejemplo',
      p_holes: DEMO_COURSE.holes.map((h) => ({ par: h.par, si: h.si })),
      p_tees: JSON.parse(JSON.stringify(DEMO_COURSE.tees)),
    });
    return { lid, p, course };
  }

  it('el día antes a todos (inscritos con su grupo y hoyo; los demás, a inscribirse); el mismo día solo los inscritos', async () => {
    const g = await golf();
    await subscribe(w.u.luis, w.u.ana, w.u.extra);
    // Sábado 10 a las 7:30 am, salida simultánea.
    const round = await db.rpc<string>(w.u.sofi, 'golf_create_round', {
      p_league: g.lid,
      p_date: '2026-10-10',
      p_course: g.course,
      p_start_time: '07:30',
      p_shotgun: true,
    });
    const cardLuis = await db.rpc<string>(w.u.luis, 'golf_register', { p_event: round });
    await db.rpc<string>(w.u.sofi, 'golf_register', { p_event: round, p_player: g.p.ana });
    await db.rpc(w.u.sofi, 'golf_set_groups', { p_event: round, p_groups: [{ card_id: cardLuis, group_no: 3, start_hole: 10 }] });
    const tag = `recordatorio:${round}`;

    // Viernes 2:00 pm.
    expect(await eventReminders('2026-10-09T18:00:00Z')).toBe(1);
    expect(byUser(await pushes(tag))).toEqual({
      [w.u.luis]: ['Mañana juegas a las 7:30 am', 'Campo de ejemplo · Golf del Club. Grupo 3, sales por el hoyo 10. ¡Buen juego!'],
      [w.u.ana]: ['Mañana juegas a las 7:30 am', 'Campo de ejemplo · Golf del Club. ¡Buen juego!'],
      [w.u.extra]: ['Mañana hay ronda a las 7:30 am', 'Campo de ejemplo · Golf del Club. ¿Juegas? Inscríbete en la app.'],
    });
    expect((await pushes(tag))[0]).toMatchObject({ url: `/l/${g.lid}/e/${round}`, urgency: 'high' });
    expect(await eventReminders('2026-10-09T20:00:00Z')).toBe(0);

    // Sábado 6:30 am: muy temprano; 7:00 am: sí, solo a los inscritos.
    await clearPushes();
    expect(await eventReminders('2026-10-10T10:30:00Z')).toBe(0);
    expect(await eventReminders('2026-10-10T11:00:00Z')).toBe(1);
    expect(byUser(await pushes(tag))).toEqual({
      [w.u.luis]: ['Hoy juegas a las 7:30 am', 'Campo de ejemplo · Golf del Club. Grupo 3, sales por el hoyo 10. Anota hoyo por hoyo en la app.'],
      [w.u.ana]: ['Hoy juegas a las 7:30 am', 'Campo de ejemplo · Golf del Club. Anota hoyo por hoyo en la app.'],
    });
  });

  it('ronda cerrada: nada; sin hora usa el horario de la liga', async () => {
    const g = await golf();
    await subscribe(w.u.luis);
    await db.admin(`update public.leagues set schedule = 'Sábados 8:00 am' where id = $1`, [g.lid]);
    const closed = await db.rpc<string>(w.u.sofi, 'golf_create_round', { p_league: g.lid, p_date: '2026-10-10', p_course: g.course, p_name: 'Mensual' });
    await db.rpc(w.u.sofi, 'golf_close_round', { p_event: closed });
    const open = await db.rpc<string>(w.u.sofi, 'golf_create_round', { p_league: g.lid, p_date: '2026-10-10', p_course: g.course, p_name: 'Copa del Club' });
    expect(await eventReminders('2026-10-09T18:00:00Z')).toBe(1);
    expect(byUser(await pushes(`recordatorio:${open}`))).toEqual({
      [w.u.luis]: ['Mañana hay ronda a las 8:00 am', 'Copa del Club · Campo de ejemplo · Golf del Club. ¿Juegas? Inscríbete en la app.'],
    });
    expect(await pushes(`recordatorio:${closed}`)).toEqual([]);
  });
});

describe('natación: encuentros', () => {
  it('a todos los miembros el día antes y el mismo día; cerrado, nada', async () => {
    const c = await club('swimming', 'Natación Club');
    await subscribe(w.u.luis, w.u.sofi);
    const meet = await db.rpc<string>(w.u.sofi, 'swim_create_meet', { p_league: c.lid, p_date: '2026-10-11', p_name: 'Copa Delfines', p_start_time: '08:00' });
    const tag = `recordatorio:${meet}`;
    // Sábado 12:00 pm.
    expect(await eventReminders('2026-10-10T16:00:00Z')).toBe(1);
    const before = await pushes(tag);
    expect(before.map((r) => r.user_id).sort()).toEqual([w.u.luis, w.u.sofi].sort());
    expect(before[0]).toMatchObject({
      title: 'Mañana es el encuentro Copa Delfines',
      body: 'Natación Club · domingo a las 8:00 am. Mira las pruebas y las series en la app.',
    });
    // Domingo 7:00 am.
    await clearPushes();
    expect(await eventReminders('2026-10-11T11:00:00Z')).toBe(1);
    expect((await pushes(tag))[0]).toMatchObject({
      title: 'Hoy es el encuentro Copa Delfines',
      body: 'Natación Club a las 8:00 am. Llega temprano para el calentamiento. ¡Suerte!',
    });

    const control = await db.rpc<string>(w.u.sofi, 'swim_create_meet', { p_league: c.lid, p_date: '2026-10-12', p_type: 'control' });
    const done = await db.rpc<string>(w.u.sofi, 'swim_create_meet', { p_league: c.lid, p_date: '2026-10-12', p_name: 'Cerrado' });
    await db.rpc(w.u.sofi, 'swim_finalize_meet', { p_meet: done });
    expect(await eventReminders('2026-10-11T17:00:00Z')).toBe(1);
    // Sin hora (el horario de la liga es de martes): sin «a las».
    expect((await pushes(`recordatorio:${control}`))[0]).toMatchObject({
      title: 'Mañana es el control de marcas',
      body: 'Natación Club · lunes. Mira las pruebas y las series en la app.',
    });
    expect(await pushes(`recordatorio:${done}`)).toEqual([]);
  });
});

describe('noches de americano', () => {
  it('a los jugadores de la noche con cuenta; el mexicano y el round robin con su nombre', async () => {
    const c = await club('padel', 'Pádel Club');
    await subscribe(w.u.luis, w.u.ana, w.u.otra);
    const night = await db.rpc<string>(w.u.sofi, 'create_event', {
      p_league: c.lid,
      p_type: 'americano',
      p_date: '2026-10-08',
      p_start_time: '19:00',
      p_name: 'Americano del jueves',
      p_config: { format: 'americano', players: [c.p.luis, c.p.ana, c.p.pedro], courts: ['Cancha 1'], points: { mode: 'total', target: 24 } },
    });
    const tag = `recordatorio:${night}`;
    // Miércoles 1:00 pm.
    expect(await eventReminders('2026-10-07T17:00:00Z')).toBe(1);
    const dayBefore = ['Mañana hay americano a las 7:00 pm', 'Americano del jueves · Pádel Club · jueves. Si no puedes ir, avísale al organizador.'];
    expect(byUser(await pushes(tag))).toEqual({ [w.u.luis]: dayBefore, [w.u.ana]: dayBefore });
    // Jueves 12:00 pm.
    await clearPushes();
    expect(await eventReminders('2026-10-08T16:00:00Z')).toBe(1);
    const today = ['Hoy hay americano a las 7:00 pm', 'Americano del jueves · Pádel Club. En cada ronda te avisamos tu cancha.'];
    expect(byUser(await pushes(tag))).toEqual({ [w.u.luis]: today, [w.u.ana]: today });

    const mex = await db.rpc<string>(w.u.sofi, 'create_event', {
      p_league: c.lid,
      p_type: 'mexicano',
      p_date: '2026-10-09',
      p_config: { format: 'mexicano', players: [c.p.otra], courts: ['Cancha 1'], points: { mode: 'total', target: 24 } },
    });
    const pickle = await club('pickleball', 'Pickle RD');
    const rr = await db.rpc<string>(w.u.sofi, 'create_event', {
      p_league: pickle.lid,
      p_type: 'americano',
      p_date: '2026-10-09',
      p_start_time: '18:00',
      p_config: { format: 'americano', players: [pickle.p.luis], courts: ['Cancha 1'] },
    });
    expect(await eventReminders('2026-10-08T17:00:00Z')).toBe(2);
    expect(byUser(await pushes(`recordatorio:${mex}`))).toEqual({
      [w.u.otra]: ['Mañana hay mexicano', 'Pádel Club · viernes. Si no puedes ir, avísale al organizador.'],
    });
    expect(byUser(await pushes(`recordatorio:${rr}`))).toEqual({
      [w.u.luis]: ['Mañana hay round robin a las 6:00 pm', 'Pickle RD · viernes. Si no puedes ir, avísale al organizador.'],
    });
  });

  it('el boliche no pasa por aquí (tiene sus recordatorios de siempre)', async () => {
    await subscribe(w.u.luis);
    await event(db, w.priv, 'practica', '2026-10-09');
    expect(await eventReminders('2026-10-08T17:00:00Z')).toBe(0);
    expect(await matchReminders('2026-10-08T17:00:00Z')).toBe(0);
  });
});

describe('reclamos: «Reclamaron un resultado»', () => {
  it('a los organizadores y a quien anotó; nunca a quien reclamó; una sola vez', async () => {
    const c = await club('tennis', 'Tenis Club');
    await subscribe(w.u.org, w.u.sofi, w.u.luis, w.u.ana);
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ stage: 'Final', scheduled_at: '2026-10-09T00:00:00Z', sides: [single(1, c.p.luis), single(2, c.p.ana)] }],
    });
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: { text: '6-4 6-3', sides: [2, 0] }, p_winner: 1 });
    expect(await pushes(`reclamo:${id}`)).toEqual([]);
    await db.rpc(w.u.ana, 'dispute_result', { p_match: id, p_note: 'Fue 6-4 4-6 10-8' });
    const rows = await pushes(`reclamo:${id}`);
    const what = 'Luis contra Ana: 6-4 6-3. «Fue 6-4 4-6 10-8».';
    expect(byUser(rows)).toEqual({
      [w.u.org]: ['Reclamaron un resultado', `${what} Resuélvelo en la app.`],
      [w.u.sofi]: ['Reclamaron un resultado', `${what} Resuélvelo en la app.`],
      [w.u.luis]: ['Reclamaron tu resultado', `${what} El organizador lo va a revisar.`],
    });
    expect(rows[0]).toMatchObject({ url: `/l/${c.lid}/juegos?partido=${id}`, ttl: 259200, urgency: 'normal' });

    // Resolverlo no vuelve a avisar; otro reclamo sin nota, sin comillas.
    await db.rpc(w.u.sofi, 'resolve_dispute', { p_match: id });
    expect((await pushes(`reclamo:${id}`)).length).toBe(3);
    const [other] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ sides: [single(1, c.p.ana), single(2, c.p.luis)] }],
    });
    await db.rpc(w.u.ana, 'finish_match', { p_match: other, p_score: { text: '6-0 6-0', sides: [2, 0] }, p_winner: 1 });
    await db.rpc(w.u.luis, 'dispute_result', { p_match: other });
    expect(byUser(await pushes(`reclamo:${other}`))[w.u.ana]).toEqual(['Reclamaron tu resultado', 'Ana contra Luis: 6-0 6-0. El organizador lo va a revisar.']);
  });

  it('si reclama una organizadora que también juega, a ella no le llega', async () => {
    const c = await club('padel', 'Pádel Club');
    const pSofi = await player(db, c.lid, 'Sofi', w.u.sofi);
    await subscribe(w.u.org, w.u.sofi, w.u.luis);
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ format: 'sets', sides: [single(1, pSofi), single(2, c.p.luis)] }],
    });
    await db.rpc(w.u.luis, 'finish_match', { p_match: id, p_score: { text: '6-4 6-4', sides: [0, 2] }, p_winner: 2 });
    await db.rpc(w.u.sofi, 'dispute_result', { p_match: id });
    expect(byUser(await pushes(`reclamo:${id}`))).toEqual({
      [w.u.org]: ['Reclamaron un resultado', 'Sofi contra Luis: 6-4 6-4. Resuélvelo en la app.'],
      [w.u.luis]: ['Reclamaron tu resultado', 'Sofi contra Luis: 6-4 6-4. El organizador lo va a revisar.'],
    });
  });
});

describe('la tarea de cada 15 minutos', () => {
  it('cron_match_reminders suma partidos y eventos, borra marcas viejas y sin pg_net no llama a nadie', async () => {
    const c = await club('padel', 'Pádel Club');
    await subscribe(w.u.luis);
    const [id] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ format: 'sets', scheduled_at: '2026-10-09T00:00:00Z', sides: [single(1, c.p.luis), single(2, c.p.ana)] }],
    });
    await db.rpc<string>(w.u.sofi, 'create_event', {
      p_league: c.lid,
      p_type: 'americano',
      p_date: '2026-10-08',
      p_start_time: '19:00',
      p_config: { format: 'americano', players: [c.p.luis], courts: ['Cancha 1'], points: { mode: 'total', target: 24 } },
    });
    const [old] = await db.rpc<string[]>(w.u.sofi, 'create_matches', {
      p_league: c.lid,
      p_matches: [{ format: 'sets', scheduled_at: '2026-08-01T00:00:00Z', sides: [single(1, c.p.luis), single(2, c.p.ana)] }],
    });
    await db.admin(`insert into private.match_reminders_sent (match_id, slot, scheduled_at, sent_at) values ($1, 'hoy', '2026-08-01T00:00:00Z', '2026-07-31T21:00:00Z')`, [old]);
    expect(await db.admin('select private.cron_match_reminders($1) as n', ['2026-10-08T21:00:00Z'])).toEqual([{ n: 2 }]);
    expect(await db.admin('select match_id from private.match_reminders_sent order by match_id')).toEqual([{ match_id: id }]);
    expect(await db.admin('select private.cron_match_reminders($1) as n', ['2026-10-08T21:05:00Z'])).toEqual([{ n: 0 }]);
  });

  it('nadie lo llama desde la app ni lee las marcas', async () => {
    for (const who of [w.u.sofi, w.u.dios, SERVICE]) {
      await fails(db.as(who, 'select private.match_reminders()'), DENIED);
      await fails(db.as(who, 'select private.event_reminders()'), DENIED);
      await fails(db.as(who, 'select private.cron_match_reminders()'), DENIED);
      await fails(db.as(who, 'select private.padel_match_reminders()'), DENIED);
    }
    await fails(db.as(w.u.dios, 'select * from private.match_reminders_sent'), DENIED);
  });
});
