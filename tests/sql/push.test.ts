/**
 * Push (20260926001200_push.sql): los recordatorios en SQL comparados con src/lib/reminders.ts (las dos versiones
 * con las mismas fechas, horas y horarios), la cola de envío, permisos, limpieza y send-push de punta a punta
 * (la base de verdad + «teléfonos» que descifran lo que les llega).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dueReminders, eventStart, localNow, reminderTtl } from '../../src/lib/reminders';
import { parseSchedule } from '../../src/lib/schedule';
import { handleRequest } from '../../supabase/functions/send-push/core';
import { b64urlEncode, createPushSender, decryptPayload, generateVapidKeys } from '../../supabase/functions/send-push/webpush';
import { ANON, DENIED, SERVICE, TestDb, fails } from './harness';

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.open();
});
afterAll(async () => {
  await db.pg.close();
});
beforeEach(async () => {
  await db.begin();
});
afterEach(async () => {
  await db.rollback();
});

/** Horarios como los escribe la app (formatSchedule) y como los escribe la gente a mano. */
const SCHEDULES = [
  'Martes · 7:00 pm',
  'Martes y jueves · 7:00 pm',
  'Lunes, miércoles y viernes · 6:30 pm',
  'Martes · 10:00 am',
  'Sábado · 9:00 am',
  'Domingo · 3:00 pm',
  'Miércoles · 11:45 am',
  'Martes · 12:00 pm',
  'Martes · 12:30 am',
  '',
  'Martes 7:00',
  'Martes 19:00',
  'Martes 13:00',
  'Martes 23:59',
  'Martes 0:30',
  'martes 7pm',
  'MARTES 7 PM',
  'Sábados 9 am',
  'sabados 9:30 a 11:30 am',
  'Domingos 8:15 p. m.',
  'Miércoles 6:45pm',
  'Jueves 7:00 a 9:00 pm',
  'Martes y jueves de 7:00 a 9:00',
  'Martes 7:00 hasta 9:00 p m',
  'Viernes 25:00',
  'Viernes 7:75 pm',
  'Todos los días 7 pm',
  '7:00 pm',
  'Martes 12 am',
  'Lunes 5:00 a.m.',
  'Martes 7',
  'Martes a las 7',
  'Martes 7:00 pm',
  'Martes · 7:00 pm',
  'Martes 8:00 PM y jueves 9:00 PM',
  'martess 7 pm',
  'amartes 7pm',
  'Martes7pm',
  'Lunes-Viernes 6pm',
  'Martes 7:00 pmx',
  'Martes 7:00 pm.',
  'Martes 7 p.m',
  'Martes 7 a. m.',
  'Mañanas 7 am',
  'Sábado 9 am',
  'Martes 123:45 pm',
  'Martes 7:00 p',
];

/** Lunes 28 de septiembre de 2026 al domingo 4 de octubre. */
const WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

const shiftDate = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

describe('recordatorios: el SQL da lo mismo que src/lib/reminders.ts', () => {
  it('parseSchedule y eventStart, para cada horario y cada día de la semana', async () => {
    const cases = SCHEDULES.flatMap((s) => WEEK.map((d) => ({ s, d })));
    const rows = await db.admin(
      `select c.i, p.days, p.hhmm, e.minutes, e.label
         from jsonb_to_recordset($1::jsonb) as c (i int, s text, d date)
        cross join lateral private.parse_schedule(c.s) p
        cross join lateral private.event_start(c.d, c.s) e
        order by c.i`,
      [JSON.stringify(cases.map((c, i) => ({ i, ...c })))],
    );
    const expected = cases.map(({ s, d }, i) => {
      const p = parseSchedule(s);
      const e = eventStart({ date: d }, { schedule: s });
      return { i, days: p.days, hhmm: p.time, minutes: e?.minutes ?? null, label: e?.label ?? null };
    });
    expect(rows).toEqual(expected);
    // Y la matriz no es trivial: hay horarios con y sin hora, y eventos en otro día.
    expect(expected.filter((e) => e.minutes !== null).length).toBeGreaterThan(40);
    expect(expected.filter((e) => e.minutes === null && e.hhmm !== '').length).toBeGreaterThan(40);
  });

  it('dueReminders y reminderTtl: cada horario, el día antes y el mismo día, minuto a minuto en los bordes', async () => {
    const names = ['', 'Copa', '  Copa Navidad  '];
    const cases: { i: number; date: string; type: string; name: string; schedule: string; today: string; minutes: number }[] = [];
    SCHEDULES.forEach((schedule, k) => {
      for (const date of ['2026-09-29', '2026-10-03']) {
        const start = eventStart({ date }, { schedule });
        // Cada 15 minutos y, alrededor de cada borde, el minuto antes, el del borde y el siguiente.
        const minutes = new Set<number>();
        for (let m = 0; m < 1440; m += 15) minutes.add(m);
        const borders = [7 * 60, 12 * 60, 18 * 60, 21 * 60];
        if (start) borders.push(start.minutes - 180, start.minutes - 75, start.minutes - 10, start.minutes);
        for (const b of borders) for (const m of [b - 1, b, b + 1]) if (m >= 0 && m < 1440) minutes.add(m);
        const type = k % 2 === 0 ? 'practica' : 'torneo';
        const name = names[k % names.length];
        for (const today of [shiftDate(date, -1), date]) {
          for (const m of minutes) cases.push({ i: cases.length, date, type, name, schedule, today, minutes: m });
        }
        // Otros días: nunca toca nada.
        for (const today of [shiftDate(date, -2), shiftDate(date, 1)]) cases.push({ i: cases.length, date, type, name, schedule, today, minutes: 12 * 60 });
      }
    });
    const payload = JSON.stringify(cases);
    const due = await db.admin<{ i: number; slot: string; title: string; body: string }>(
      `select c.i, d.slot, d.title, d.body
         from jsonb_to_recordset($1::jsonb) as c (i int, date date, type text, name text, schedule text, today date, minutes int)
        cross join lateral private.due_reminders(c.date, c.type, c.name, 'Liga Norte', c.schedule, c.today, c.minutes) d
        order by c.i, d.ord`,
      [payload],
    );
    const ttl = await db.admin<{ i: number; ttl: number }>(
      `select c.i, private.reminder_ttl(c.date, c.schedule, c.today, c.minutes) as ttl
         from jsonb_to_recordset($1::jsonb) as c (i int, date date, schedule text, today date, minutes int)
        order by c.i`,
      [payload],
    );
    const expectedDue = cases.flatMap((c) =>
      dueReminders({ date: c.date, type: c.type as 'practica' | 'torneo', name: c.name }, { name: 'Liga Norte', schedule: c.schedule }, c.today, c.minutes).map(
        (r) => ({ i: c.i, slot: r.slot, title: r.title, body: r.body }),
      ),
    );
    const expectedTtl = cases.map((c) => ({ i: c.i, ttl: reminderTtl({ date: c.date }, { schedule: c.schedule }, c.today, c.minutes) }));
    expect(due.length).toBe(expectedDue.length);
    expect(due).toEqual(expectedDue);
    expect(ttl).toEqual(expectedTtl);
    // Salen los tres tipos, con y sin nombre de torneo.
    const slots = new Set(expectedDue.map((r) => r.slot));
    expect([...slots].sort()).toEqual(['dia-antes', 'mismo-dia', 'una-hora']);
    expect(expectedDue.some((r) => r.title === 'Recuerda: mañana es el torneo Copa Navidad')).toBe(true);
    expect(cases.length).toBeGreaterThan(10000);
  });

  it('la fecha y el minuto en la zona de cada liga (también en los cambios de horario)', async () => {
    const zones = ['America/Santo_Domingo', 'America/New_York', 'Europe/Madrid', 'Asia/Kolkata', 'Asia/Kathmandu', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
    const instants = [
      Date.UTC(2026, 8, 28, 16, 30),
      Date.UTC(2026, 9, 25, 0, 59),
      Date.UTC(2026, 9, 25, 1, 0),
      Date.UTC(2026, 9, 25, 1, 30),
      Date.UTC(2026, 10, 1, 5, 59),
      Date.UTC(2026, 10, 1, 6, 0),
      Date.UTC(2026, 10, 1, 6, 30),
      Date.UTC(2026, 11, 31, 23, 45),
      Date.UTC(2027, 2, 14, 7, 0),
      Date.UTC(2027, 2, 28, 1, 15),
    ];
    const cases = zones.flatMap((tz) => instants.map((t) => ({ tz, at: new Date(t).toISOString() }))).map((c, i) => ({ i, ...c }));
    const rows = await db.admin<{ today: string; minutes: number }>(
      `select to_char((c.at at time zone c.tz)::date, 'YYYY-MM-DD') as today,
              (extract(hour from c.at at time zone c.tz) * 60 + extract(minute from c.at at time zone c.tz))::int as minutes
         from jsonb_to_recordset($1::jsonb) as c (i int, tz text, at timestamptz)
        order by c.i`,
      [JSON.stringify(cases)],
    );
    expect(rows).toEqual(cases.map((c) => localNow(new Date(c.at), c.tz)));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Datos: ligas, eventos y teléfonos armados como superusuario.
// ---------------------------------------------------------------------------------------------------------------

async function one(sql: string, params: unknown[] = []): Promise<string> {
  const rows = await db.admin<{ id: string }>(sql, params);
  return rows[0].id;
}

async function makeLeague(owner: string, name: string, schedule: string, tz: string): Promise<string> {
  const id = await one(
    `insert into public.leagues (sport, kind, visibility, name, owner_id, schedule, tz) values ('bowling', 'liga', 'private', $1, $2, $3, $4) returning id`,
    [name, owner, schedule, tz],
  );
  await join(id, owner, 'owner');
  return id;
}

async function join(league: string, uid: string, role: 'owner' | 'member' = 'member') {
  await db.admin('insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, $3, $4)', [league, uid, role, 'x']);
}

async function makeEvent(league: string, type: 'practica' | 'torneo', date: string, name = ''): Promise<string> {
  return one('insert into public.events (league_id, type, name, date, games) values ($1, $2, $3, $4, 3) returning id', [league, type, name, date]);
}

/** Teléfono con claves de mentira (para la cola; send-push de punta a punta usa claves de verdad). */
async function addPhone(uid: string, tag: string, updatedAt = '2026-09-01T00:00:00Z'): Promise<string> {
  return one(
    `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, updated_at) values ($1, $2, 'BPclave', 'secreto', $3) returning id`,
    [uid, `https://fcm.googleapis.com/fcm/send/${tag}`, updatedAt],
  );
}

interface OutboxRow {
  id: number;
  user_id: string;
  subscription_id: string | null;
  title: string;
  body: string;
  url: string;
  tag: string;
  ttl: number;
  urgency: string;
  attempts: number;
  sent_at: string | null;
  claimed_at: string | null;
  last_status: number | null;
}

const outbox = (where = 'true', params: unknown[] = []) => db.admin<OutboxRow>(`select * from public.push_outbox where ${where} order by id`, params);

describe('enqueue_due_reminders: el cron de BowlingX con la hora de cada liga', () => {
  it('cada 15 minutos durante una semana sale lo mismo que con reminders.ts, a los 5 teléfonos más nuevos de cada miembro', async () => {
    const u = {
      org: await db.createUser('org@x.com', 'org'),
      ana: await db.createUser('ana@x.com', 'ana'),
      luis: await db.createUser('luis@x.com', 'luis'),
      pepe: await db.createUser('pepe@x.com', 'pepe'),
      otro: await db.createUser('otro@x.com', 'otro'),
    };
    const leagues = [
      { name: 'Liga Norte', schedule: 'Martes · 7:00 pm', tz: 'America/Santo_Domingo', owner: u.org, members: [u.ana, u.luis, u.pepe] },
      { name: 'Liga Madrid', schedule: 'Martes · 8:00 pm', tz: 'Europe/Madrid', owner: u.otro, members: [] },
      { name: 'Liga Sin Hora', schedule: '', tz: 'America/New_York', owner: u.pepe, members: [u.luis] },
      { name: 'Liga Temprano', schedule: 'Sábados 9:30 am', tz: 'America/Santo_Domingo', owner: u.ana, members: [] },
    ];
    const ids = [];
    for (const l of leagues) {
      const id = await makeLeague(l.owner, l.name, l.schedule, l.tz);
      for (const m of l.members) await join(id, m);
      ids.push(id);
    }
    const events = [
      { league: 0, type: 'practica' as const, date: '2026-09-29', name: '' },
      { league: 0, type: 'torneo' as const, date: '2026-10-03', name: 'Copa' },
      { league: 0, type: 'practica' as const, date: '2026-09-30', name: '' },
      { league: 1, type: 'practica' as const, date: '2026-09-29', name: '' },
      { league: 2, type: 'torneo' as const, date: '2026-09-30', name: '  Abierto  ' },
      { league: 3, type: 'practica' as const, date: '2026-10-03', name: '' },
      // Pasado y lejano: nunca salen.
      { league: 0, type: 'practica' as const, date: '2026-09-22', name: '' },
      { league: 0, type: 'practica' as const, date: '2026-10-13', name: '' },
    ];
    const evIds: string[] = [];
    for (const e of events) evIds.push(await makeEvent(ids[e.league], e.type, e.date, e.name));

    // org 1 teléfono, ana 7 (solo los 5 más nuevos), luis 1, pepe ninguno, otro 1.
    await addPhone(u.org, 'org');
    const anaPhones: string[] = [];
    for (let k = 0; k < 7; k++) anaPhones.push(await addPhone(u.ana, `ana-${k}`, `2026-09-0${k + 1}T00:00:00Z`));
    await addPhone(u.luis, 'luis');
    await addPhone(u.otro, 'otro');
    const phonesOf = [7, 1, 1, 5];

    // Lo que haría el cron de BowlingX (scripts/push/recordatorios.ts) con reminders.ts, liga por liga.
    const ticks: number[] = [];
    for (let t = Date.UTC(2026, 8, 27, 12); t <= Date.UTC(2026, 9, 4, 6); t += 15 * 60_000) ticks.push(t);
    const done = new Set<string>();
    const expected: { t: number; tag: string; title: string; body: string; ttl: number; phones: number }[] = [];
    for (const t of ticks) {
      events.forEach((e, k) => {
        const l = leagues[e.league];
        const { today, minutes } = localNow(new Date(t), l.tz);
        if (e.date !== today && e.date !== shiftDate(today, 1)) return;
        const pending = dueReminders(e, l, today, minutes).filter((r) => !done.has(`${evIds[k]}:${r.slot}`));
        if (!pending.length) return;
        for (const r of pending) done.add(`${evIds[k]}:${r.slot}`);
        const r = pending[pending.length - 1];
        expected.push({ t, tag: `recordatorio:${evIds[k]}`, title: r.title, body: r.body, ttl: reminderTtl(e, l, today, minutes), phones: phonesOf[e.league] });
      });
    }

    const got: typeof expected = [];
    let last = 0;
    for (const t of ticks) {
      const [{ n }] = await db.admin<{ n: number }>('select private.enqueue_due_reminders($1) as n', [new Date(t).toISOString()]);
      const rows = await outbox('id > $1', [last]);
      const byTag = new Map<string, OutboxRow[]>();
      for (const r of rows) byTag.set(r.tag, [...(byTag.get(r.tag) ?? []), r]);
      expect(byTag.size).toBe(n);
      for (const [tag, group] of byTag) {
        const [first] = group;
        for (const r of group) expect([r.title, r.body, r.ttl, r.urgency, r.url]).toEqual([first.title, first.body, first.ttl, 'high', first.url]);
        const event = tag.slice('recordatorio:'.length);
        expect(first.url).toBe(`/l/${ids[events[evIds.indexOf(event)].league]}/e/${event}`);
        got.push({ t, tag, title: first.title, body: first.body, ttl: first.ttl, phones: group.length });
      }
      last = rows.length ? rows[rows.length - 1].id : last;
    }
    const sort = (a: (typeof expected)[number], b: (typeof expected)[number]) => a.t - b.t || a.tag.localeCompare(b.tag);
    expect(got.sort(sort)).toEqual(expected.sort(sort));
    // 6 eventos con recordatorios: el día antes, el mismo día y (con hora) el de «ya casi»: 3 + 2 + 2 + 3 + 2 + 3.
    expect(expected.length).toBe(15);
    expect(expected.map((e) => e.title)).toContain('A las 9:30 am empieza la práctica');
    expect(expected.map((e) => e.title)).toContain('Hoy es el torneo Abierto');
    // De ana, solo los 5 teléfonos más nuevos.
    const anaGot = await db.admin<{ subscription_id: string }>('select distinct subscription_id from public.push_outbox where user_id = $1', [u.ana]);
    expect(anaGot.map((r) => r.subscription_id).sort()).toEqual(anaPhones.slice(2).sort());
    // Cada uno una sola vez, aunque el cron corra de nuevo.
    const count = await db.count('public.push_outbox');
    for (const t of ticks.slice(0, 200)) await db.admin('select private.enqueue_due_reminders($1)', [new Date(t).toISOString()]);
    expect(await db.count('public.push_outbox')).toBe(count);
  });

  it('con el cron atrasado sale solo el que toca ahora; si mueven el evento a otro día, vuelve a avisar', async () => {
    const org = await db.createUser('org@x.com', 'org');
    await addPhone(org, 'org');
    const lid = await makeLeague(org, 'Liga Norte', 'Martes y jueves · 7:00 pm', 'America/Santo_Domingo');
    const eid = await makeEvent(lid, 'practica', '2026-09-29');
    const run = async (iso: string) => {
      await db.admin('select private.enqueue_due_reminders($1)', [iso]);
      return (await outbox()).map((r) => r.title);
    };
    // Lunes 12:05 pm en Santo Domingo (UTC-4).
    expect(await run('2026-09-28T16:05:00Z')).toEqual(['Recuerda: mañana es la práctica']);
    // El cron no corrió en todo el martes hasta las 6:00 pm: el del mismo día ya pasó; sale solo el de «ya casi».
    expect(await run('2026-09-29T22:00:00Z')).toEqual(['Recuerda: mañana es la práctica', 'A las 7:00 pm empieza la práctica']);
    expect(await run('2026-09-29T22:15:00Z')).toHaveLength(2);
    // La práctica pasa al jueves: el miércoles vuelve el aviso del día antes.
    await db.admin(`update public.events set date = '2026-10-01' where id = $1`, [eid]);
    expect(await run('2026-09-30T16:30:00Z')).toHaveLength(3);
    expect(await db.admin('select kind from public.reminders_sent where event_id = $1 order by kind', [eid])).toEqual([
      { kind: 'dia-antes@2026-09-29' },
      { kind: 'dia-antes@2026-10-01' },
      { kind: 'una-hora@2026-09-29' },
    ]);
  });

  it('cron_reminders encola y, sin pg_net ni Vault (PGlite), no llama a nadie', async () => {
    const org = await db.createUser('org@x.com', 'org');
    await addPhone(org, 'org');
    const lid = await makeLeague(org, 'Liga Norte', 'Martes · 7:00 pm', 'America/Santo_Domingo');
    await makeEvent(lid, 'practica', '2026-09-29');
    expect(await db.admin('select private.cron_reminders($1) as n', ['2026-09-28T16:05:00Z'])).toEqual([{ n: 1 }]);
    expect(await db.admin('select private.push_pending() as n, private.kick_send_push() as kicked')).toEqual([{ n: 1, kicked: false }]);
  });
});

describe('cola de envío', () => {
  it('una fila por cuenta se reparte en una por teléfono (los 5 más nuevos); sin teléfonos no queda nada', async () => {
    const ana = await db.createUser('ana@x.com', 'ana');
    const pepe = await db.createUser('pepe@x.com', 'pepe');
    const phones: string[] = [];
    for (let k = 0; k < 6; k++) phones.push(await addPhone(ana, `ana-${k}`, `2026-09-0${k + 1}T00:00:00Z`));
    await db.admin(`insert into public.push_outbox (user_id, title, body, ttl) values ($1, 'Hola', 'Texto', 600), ($2, 'Hola', 'Texto', 600)`, [ana, pepe]);
    const rows = await outbox();
    expect(rows.map((r) => r.subscription_id).sort()).toEqual(phones.slice(1).sort());
    expect(rows.every((r) => r.user_id === ana && r.title === 'Hola' && r.urgency === 'normal' && r.attempts === 0)).toBe(true);
    // Con el teléfono ya puesto, entra tal cual.
    await db.admin(`insert into public.push_outbox (user_id, subscription_id, title) values ($1, $2, 'Solo uno')`, [ana, phones[0]]);
    expect(await db.count('public.push_outbox', `title = 'Solo uno'`)).toBe(1);
  });

  it('claim_push_batch aparta el lote 3 minutos; finish_push_batch guarda lo que pasó con cada uno', async () => {
    const ana = await db.createUser('ana@x.com', 'ana');
    const luis = await db.createUser('luis@x.com', 'luis');
    const a1 = await addPhone(ana, 'a1', '2026-09-01T00:00:00Z');
    const a2 = await addPhone(ana, 'a2', '2026-09-02T00:00:00Z');
    const l1 = await addPhone(luis, 'l1');
    await db.admin(`insert into public.push_outbox (user_id, title, body, url, tag, ttl, urgency) values ($1, 'T', 'B', '/l/x', 'tag', 3600, 'high')`, [ana]);
    await db.admin(`insert into public.push_outbox (user_id, title, body, ttl) values ($1, 'T2', 'B2', 600), ($1, 'T3', null, 600)`, [luis]);
    expect(await db.admin('select private.push_pending() as n')).toEqual([{ n: 4 }]);

    const batch = await db.as<{ id: number; endpoint: string; title: string; ttl: number; urgency: string }>(SERVICE, 'select * from public.claim_push_batch(p_limit => 3)');
    expect(batch.map((m) => [m.endpoint, m.title, m.ttl, m.urgency])).toEqual([
      ['https://fcm.googleapis.com/fcm/send/a2', 'T', 3600, 'high'],
      ['https://fcm.googleapis.com/fcm/send/a1', 'T', 3600, 'high'],
      ['https://fcm.googleapis.com/fcm/send/l1', 'T2', 600, 'normal'],
    ]);
    expect(await db.as(SERVICE, 'select * from public.claim_push_batch()')).toHaveLength(1);
    expect(await db.as(SERVICE, 'select * from public.claim_push_batch()')).toEqual([]);
    expect(await db.admin('select private.push_pending() as n')).toEqual([{ n: 0 }]);

    const [{ r }] = await db.as<{ r: unknown }>(SERVICE, 'select public.finish_push_batch(p_results => $1::jsonb) as r', [
      JSON.stringify([
        { id: batch[0].id, outcome: 'sent', status: 201 },
        { id: batch[1].id, outcome: 'gone', status: 410 },
        { id: batch[2].id, outcome: 'retry', status: 503 },
      ]),
    ]);
    expect(r).toEqual({ remaining: 0, chained: false });
    const sent = await outbox('id = $1', [batch[0].id]);
    expect(sent[0]).toMatchObject({ attempts: 1, last_status: 201, claimed_at: null });
    expect(sent[0].sent_at).not.toBeNull();
    // 410: el teléfono a1 se borró (y lo suyo en la cola).
    expect(await db.count('public.push_subscriptions', 'id = $1', [a1])).toBe(0);
    expect(await db.count('public.push_outbox', 'id = $1', [batch[1].id])).toBe(0);
    expect(await db.count('public.push_subscriptions', 'id = any($1)', [[a2, l1]])).toBe(2);
    // 503: queda apartado (esa es la espera) y se toma otra vez después de 3 minutos.
    const retry = await outbox('id = $1', [batch[2].id]);
    expect(retry[0]).toMatchObject({ attempts: 1, last_status: 503, sent_at: null });
    await db.admin(`update public.push_outbox set claimed_at = now() - interval '4 minutes' where sent_at is null`);
    expect(await db.admin('select private.push_pending() as n')).toEqual([{ n: 2 }]);
    const again = await db.as<{ id: number }>(SERVICE, 'select id from public.claim_push_batch()');
    expect(again.map((m) => m.id)).toContain(batch[2].id);
    expect((await outbox('id = $1', [batch[2].id]))[0].attempts).toBe(2);
    // Después de 5 intentos no se toma más.
    await db.admin(`update public.push_outbox set attempts = 5, claimed_at = null where sent_at is null`);
    expect(await db.as(SERVICE, 'select * from public.claim_push_batch()')).toEqual([]);
  });

  it('3 rechazos seguidos borran el teléfono; uno que llega pone la cuenta en cero; lo vencido queda listo', async () => {
    const ana = await db.createUser('ana@x.com', 'ana');
    const phone = await addPhone(ana, 'a1');
    const fail = async (outcome: string) => {
      await db.admin(`insert into public.push_outbox (user_id, title, ttl) values ($1, 'T', 600)`, [ana]);
      const [m] = await db.as<{ id: number }>(SERVICE, 'select id from public.claim_push_batch(p_limit => 1)');
      await db.as(SERVICE, 'select public.finish_push_batch(p_results => $1::jsonb)', [JSON.stringify([{ id: m.id, outcome, status: outcome === 'failed' ? 403 : null }])]);
      return m.id;
    };
    const failCount = async () => (await db.admin<{ n: number }>('select fail_count as n from public.push_subscriptions where id = $1', [phone]))[0]?.n;
    const f1 = await fail('failed');
    expect(await failCount()).toBe(1);
    expect((await outbox('id = $1', [f1]))[0]).toMatchObject({ attempts: 5, last_status: 403, sent_at: null, claimed_at: null });
    await fail('failed');
    expect(await failCount()).toBe(2);
    await db.admin(`insert into public.push_outbox (user_id, title, ttl) values ($1, 'T', 600)`, [ana]);
    const [m] = await db.as<{ id: number }>(SERVICE, 'select id from public.claim_push_batch(p_limit => 1)');
    await db.as(SERVICE, 'select public.finish_push_batch(p_results => $1::jsonb)', [JSON.stringify([{ id: m.id, outcome: 'sent', status: 201 }])]);
    expect(await failCount()).toBe(0);
    const expired = await fail('expired');
    expect((await outbox('id = $1', [expired]))[0].sent_at).not.toBeNull();
    await fail('failed');
    await fail('failed');
    expect(await failCount()).toBe(2);
    await fail('failed');
    expect(await db.count('public.push_subscriptions')).toBe(0);
    expect(await db.count('public.push_outbox')).toBe(0);
    await fails(db.as(SERVICE, 'select public.finish_push_batch(p_results => $1::jsonb)', ['{"id": 1}']), 'invalido');
  });

  it('si el teléfono pasó a otra cuenta, lo que estaba en la cola para la anterior no se manda', async () => {
    const ana = await db.createUser('ana@x.com', 'ana');
    const luis = await db.createUser('luis@x.com', 'luis');
    await addPhone(ana, 'compartido');
    await db.admin(`insert into public.push_outbox (user_id, title, ttl) values ($1, 'Para ana', 600)`, [ana]);
    await db.rpc(luis, 'upsert_push_subscription', { p_endpoint: 'https://fcm.googleapis.com/fcm/send/compartido', p_p256dh: 'BPotra', p_auth: 'otro' });
    expect(await db.admin('select private.push_pending() as n')).toEqual([{ n: 0 }]);
    expect(await db.as(SERVICE, 'select * from public.claim_push_batch()')).toEqual([]);
  });

  it('nadie de la app toca la cola ni el cron; claim y finish solo con la clave secreta', async () => {
    const ana = await db.createUser('ana@x.com', 'ana');
    for (const who of [ana, ANON]) {
      await fails(db.as(who, 'select * from public.claim_push_batch()'), DENIED);
      await fails(db.as(who, `select public.finish_push_batch(p_results => '[]'::jsonb)`), DENIED);
      await fails(db.as(who, 'select private.enqueue_due_reminders(now())'), DENIED);
      await fails(db.as(who, 'select private.cleanup_old_rows(now())'), DENIED);
    }
    await fails(db.as(SERVICE, 'select private.enqueue_due_reminders(now())'), DENIED);
    await fails(db.as(SERVICE, 'select private.kick_send_push()'), DENIED);
    const rows = await db.admin<{ fn: string; anon: boolean; auth: boolean; service: boolean }>(
      `select n.nspname || '.' || p.proname as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('service_role', p.oid, 'execute') as service
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.proname in ('push_outbox_fanout', 'js_trim', 'js_spaces', 'js_plain', 'parse_schedule', 'format_time', 'event_start',
                            'due_reminders', 'reminder_ttl', 'enqueue_due_reminders', 'push_pending', 'kick_send_push', 'cron_reminders',
                            'cleanup_old_rows', 'claim_push_batch', 'finish_push_batch')
        order by 1`,
    );
    expect(rows).toHaveLength(16);
    for (const r of rows) expect([r.fn, r.anon, r.auth, r.service]).toEqual([r.fn, false, false, r.fn.startsWith('public.')]);
  });
});

describe('limpieza diaria', () => {
  it('borra lo viejo de cada tabla y deja lo reciente', async () => {
    const now = '2026-09-26T12:00:00Z';
    const ago = (days: number) => new Date(Date.parse(now) - days * 86400_000).toISOString();
    const org = await db.createUser('org@x.com', 'org');
    const lid = await makeLeague(org, 'Liga', 'Martes · 7:00 pm', 'America/Santo_Domingo');
    const eid = await makeEvent(lid, 'practica', '2026-09-22');
    const pid = await one('insert into public.players (league_id, name) values ($1, $2) returning id', [lid, 'Pedro']);
    const pid2 = await one('insert into public.players (league_id, name) values ($1, $2) returning id', [lid, 'Juan']);
    await db.admin(`insert into public.tombstones (tbl, row_key, league_id, deleted_at) values ('players', 'a', $1, $2), ('players', 'b', $1, $3)`, [lid, ago(61), ago(59)]);
    await db.admin(`insert into private.op_log (op_id, fn, created_at) values (gen_random_uuid(), 'save_game', $1), (gen_random_uuid(), 'save_game', $2)`, [ago(31), ago(29)]);
    await db.admin(
      `insert into public.live_states (event_id, subject_key, league_id, player_id, state, updated_at)
       values ($1, $3, $2, $4, '{"scores": [190]}', $5), ($1, $6, $2, $7, '{"scores": [150]}', $8)`,
      [eid, lid, `p:${pid}`, pid, ago(3), `p:${pid2}`, pid2, ago(1)],
    );
    await db.admin(`insert into private.rate_limits (key, window_start, hits) values ('a', $1, 1), ('b', $2, 1)`, [ago(2), ago(0.5)]);
    await db.admin(`insert into private.paces (user_id, league_id, kind, last_at) values ($1, $2, 'comment', $3), ($1, $2, 'suggestion', $4)`, [org, lid, ago(2), ago(0.5)]);
    await db.admin(`insert into public.reminders_sent (event_id, kind, sent_at) values ($1, 'dia-antes@x', $2), ($1, 'mismo-dia@x', $3)`, [eid, ago(9), ago(7)]);
    const phone = await addPhone(org, 'org');
    await db.admin(
      `insert into public.push_outbox (user_id, subscription_id, title, created_at, sent_at) values
         ($1, $2, 'enviado viejo', $3, $3), ($1, $2, 'enviado nuevo', $4, $4), ($1, $2, 'sin enviar viejo', $5, null), ($1, $2, 'sin enviar nuevo', $4, null)`,
      [org, phone, ago(3), ago(1), ago(2)],
    );
    const [{ r }] = await db.admin<{ r: Record<string, number> }>('select private.cleanup_old_rows($1) as r', [now]);
    expect(r).toEqual({ tombstones: 1, op_log: 1, live_states: 1, rate_limits: 1, paces: 1, reminders_sent: 1, push_outbox: 2 });
    expect(await db.admin(`select row_key from public.tombstones where tbl = 'players' order by 1`)).toEqual([{ row_key: 'b' }]);
    expect(await db.count('private.op_log')).toBe(1);
    expect(await db.admin('select player_id from public.live_states')).toEqual([{ player_id: pid2 }]);
    // Lo borrado de live_states queda en tombstones (la sincronización por cambios lo ve).
    expect(await db.count('public.tombstones', `tbl = 'live_states'`)).toBe(1);
    expect(await db.admin('select key from private.rate_limits')).toEqual([{ key: 'b' }]);
    expect(await db.admin('select kind from private.paces')).toEqual([{ kind: 'suggestion' }]);
    expect(await db.admin('select kind from public.reminders_sent')).toEqual([{ kind: 'mismo-dia@x' }]);
    expect((await outbox()).map((o) => o.title)).toEqual(['enviado nuevo', 'sin enviar nuevo']);
  });
});

describe('send-push de punta a punta', () => {
  it('cron → cola → send-push → cada teléfono recibe su aviso cifrado; el que ya no existe se borra', async () => {
    const vapid = { ...(await generateVapidKeys()), subject: 'mailto:dueno@matchmate.app' };
    // Teléfonos con claves de verdad, guardados como lo hace la app (upsert_push_subscription con su sesión).
    const ana = await db.createUser('ana@x.com', 'ana');
    const luis = await db.createUser('luis@x.com', 'luis');
    const phones = new Map<string, { privateKey: CryptoKey; p256dh: string; auth: string; dead: boolean; got: string[]; headers: Record<string, string>[] }>();
    const addRealPhone = async (uid: string, endpoint: string, dead = false) => {
      const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const p256dh = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
      const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
      phones.set(endpoint, { privateKey: pair.privateKey, p256dh, auth, dead, got: [], headers: [] });
      await db.rpc(uid, 'upsert_push_subscription', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_ua: 'Prueba' });
    };
    await addRealPhone(ana, 'https://fcm.googleapis.com/fcm/send/ana');
    await addRealPhone(luis, 'https://web.push.apple.com/luis');
    await addRealPhone(luis, 'https://updates.push.services.mozilla.com/wpush/v2/luis-viejo', true);
    const lid = await makeLeague(ana, 'Liga Norte', 'Martes · 7:00 pm', 'America/Santo_Domingo');
    await join(lid, luis);
    const eid = await makeEvent(lid, 'practica', '2026-09-29');

    // El cron del lunes a las 12:05 pm (Santo Domingo).
    expect(await db.admin('select private.cron_reminders($1) as n', ['2026-09-28T16:05:00Z'])).toEqual([{ n: 1 }]);

    // La API REST (PostgREST) contra esta base, y los servicios de push de los teléfonos.
    const rest: string[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = init?.headers as Record<string, string>;
      if (url.startsWith('https://proyecto.test/rest/v1/rpc/')) {
        expect(headers.apikey).toBe('sb_secret_prueba');
        const fn = url.slice('https://proyecto.test/rest/v1/rpc/'.length);
        const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        rest.push(fn);
        if (fn === 'claim_push_batch') return Response.json(await db.as(SERVICE, 'select * from public.claim_push_batch(p_limit => $1)', [args.p_limit]));
        if (fn === 'finish_push_batch') {
          const [{ r }] = await db.as<{ r: unknown }>(SERVICE, 'select public.finish_push_batch(p_results => $1::jsonb) as r', [JSON.stringify(args.p_results)]);
          return Response.json(r);
        }
        if (fn === 'ping') return Response.json((await db.as<{ r: string }>(SERVICE, 'select public.ping() as r'))[0].r);
        return new Response('{}', { status: 404 });
      }
      const phone = phones.get(url)!;
      if (phone.dead) return new Response('Gone', { status: 410 });
      phone.headers.push(headers);
      phone.got.push(await decryptPayload(init!.body as Uint8Array, phone.privateKey, phone.p256dh, phone.auth));
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const env: Record<string, string> = {
      CRON_SECRET: 'secreto-del-cron-de-prueba-0123456789',
      SUPABASE_URL: 'https://proyecto.test',
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_prueba' }),
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: vapid.subject,
    };
    const lines: string[] = [];
    const call = (body: unknown = {}) =>
      handleRequest(
        new Request('https://proyecto.test/functions/v1/send-push', { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET }, body: JSON.stringify(body) }),
        { env: (name) => env[name], fetch: fetchFn, createSender: (k, f) => createPushSender(k, f), log: (l) => lines.push(l) },
      );

    const res = await call({ ping: true });
    expect(await res.json()).toEqual({ claimed: 3, sent: 2, gone: 1, retry: 0, failed: 0, expired: 0, remaining: 0, chained: false, pinged: true });
    expect(rest).toEqual(['ping', 'claim_push_batch', 'finish_push_batch']);
    const expected = {
      title: 'Recuerda: mañana es la práctica',
      body: 'Liga Norte · martes a las 7:00 pm. ¿Vas? Confírmalo en la app.',
      url: `/l/${lid}/e/${eid}`,
      tag: `recordatorio:${eid}`,
    };
    for (const endpoint of ['https://fcm.googleapis.com/fcm/send/ana', 'https://web.push.apple.com/luis']) {
      const phone = phones.get(endpoint)!;
      expect(phone.got.map((g) => JSON.parse(g))).toEqual([expected]);
      // Hasta que empieza la práctica, máximo 6 horas; urgente.
      expect(phone.headers[0]).toMatchObject({ TTL: '21600', Urgency: 'high', 'Content-Encoding': 'aes128gcm' });
      expect(phone.headers[0].Authorization).toContain(`k=${vapid.publicKey}`);
    }
    // El teléfono viejo de luis (410) ya no está; lo enviado quedó listo.
    expect(await db.admin('select endpoint from public.push_subscriptions order by endpoint')).toEqual([
      { endpoint: 'https://fcm.googleapis.com/fcm/send/ana' },
      { endpoint: 'https://web.push.apple.com/luis' },
    ]);
    expect(await db.count('public.push_outbox', 'sent_at is not null and last_status = 201')).toBe(2);
    expect(await db.count('private.heartbeat')).toBe(1);
    expect(lines).toEqual(['send-push: 3 tomados · 2 enviados · 1 teléfonos borrados · 0 para reintentar · 0 rechazados · 0 vencidos · quedan 0']);

    // Nada más que mandar.
    expect(await (await call()).json()).toMatchObject({ claimed: 0 });
    expect(phones.get('https://fcm.googleapis.com/fcm/send/ana')!.got).toHaveLength(1);
  });
});
