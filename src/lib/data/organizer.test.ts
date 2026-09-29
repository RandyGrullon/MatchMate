/**
 * El organizador contra la base de verdad (PGlite con las migraciones): los pendientes y los primeros pasos, suspender
 * un día y las pistas del boliche, por las mismas funciones que usan las pantallas.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { groupLanes, lanesPublished, lanesText } from '../lanes';
import { localNow } from '../reminders';
import { assignLanes, clearLanes, fetchEventLanes, publishLanes, setPlayerLane } from './lanes';
import { fetchLeaguePending, fetchSuspendPreview, pendingTotal, suspendDay, suspendable } from './organizer';
import { openWorld, type TestWorld } from './testkit';

let w: TestWorld;
let org: string;
let ana: string;
let lid: string;
let today: string;
const p: Record<'ana' | 'beto' | 'carla' | 'dani', string> = { ana: '', beto: '', carla: '', dani: '' };
let practice: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

/** 'YYYY-MM-DD' + n días. */
function plus(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

beforeAll(async () => {
  w = await openWorld();
  org = await w.signUp('org@x.com', 'Rosa');
  ana = await w.signUp('ana@x.com', 'Ana');
  today = localNow(new Date(), 'America/Santo_Domingo').today;
  [{ id: lid }] = await q<{ id: string }>(
    `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo)
     values ('bowling', 'liga', 'private', 'Liga de los martes', $1, 'Bolera', 'Martes', '2026-01-01', '2026-12-31', 'Rosa', '18095550000', false) returning id`,
    [org],
  );
  await q(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'owner', 'Rosa'), ($1, $3, 'member', 'Ana')`, [lid, org, ana]);
  for (const [k, name] of [['ana', 'Ana'], ['beto', 'Beto'], ['carla', 'Carla'], ['dani', 'Dani']] as const) {
    [{ id: p[k] }] = await q<{ id: string }>(`insert into public.players (league_id, name, user_id) values ($1, $2, $3) returning id`, [
      lid,
      name,
      k === 'ana' ? ana : null,
    ]);
  }
  // La práctica de hoy: Beto y Carla inscritos; Ana y Dani dijeron «voy».
  [{ id: practice }] = await q<{ id: string }>(`insert into public.events (league_id, type, date) values ($1, 'practica', $2) returning id`, [lid, today]);
  await q(`insert into public.entries (league_id, event_id, player_id, average) values ($1, $2, $3, 170), ($1, $2, $4, 190)`, [lid, practice, p.beto, p.carla]);
  await q(`insert into public.event_rsvps (event_id, player_id, league_id) values ($1, $2, $3), ($1, $4, $3)`, [practice, p.ana, lid, p.dani]);
  await w.as('org@x.com');
}, 120_000);

afterAll(async () => {
  await w?.close();
});

describe('pendientes', () => {
  it('liga nueva sin nada pendiente: los primeros pasos, con lo hecho marcado', async () => {
    const pending = await fetchLeaguePending(lid);
    expect(pending.total).toBe(0);
    expect(pendingTotal(pending, { submissions: 0, claims: 0 })).toBe(0);
    expect(pending.submissions.url).toBe(`/l/${lid}/admin?tab=aprobar`);
    expect(pending.checklist).toMatchObject({ complete: false, done: 3, total: 4 });
    expect(pending.checklist!.steps.map((s) => [s.key, s.done])).toEqual([
      ['invite', true],
      ['players', true],
      ['schedule', true],
      ['result', false],
    ]);
  });

  it('un reclamado de otro jugador sale con su nombre (y cuenta en el número)', async () => {
    const [{ id }] = await q<{ id: string }>(
      `insert into public.player_claims (league_id, player_id, user_id, claimant_name, player_name) values ($1, $2, $3, 'Ana', 'Dani') returning id`,
      [lid, p.dani, ana],
    );
    const pending = await fetchLeaguePending(lid);
    expect(pending.claims.count).toBe(1);
    expect(pending.claims.items[0]).toMatchObject({ id, playerName: 'Dani', claimantName: 'Ana' });
    expect(pending.total).toBe(1);
    await q(`delete from public.player_claims where id = $1`, [id]);
  });

  it('solo los admins', async () => {
    await w.as('ana@x.com');
    await expect(fetchLeaguePending(lid)).rejects.toMatchObject({ kind: 'permission' });
    await w.as('org@x.com');
  });
});

describe('pistas del boliche', () => {
  it('armar por promedio con el orden del teléfono, mover, publicar y borrar', async () => {
    const made = await assignLanes(practice, { lanes: [5, 6], perLane: 2, mode: 'promedio', order: [p.carla, p.beto, p.ana, p.dani] });
    expect(made.count).toBe(4);
    const names = new Map(Object.entries(p).map(([k, id]) => [id, k[0].toUpperCase() + k.slice(1)]));
    const nameOf = (id: string) => names.get(id) ?? '?';
    let rows = await fetchEventLanes(practice);
    expect(lanesText(groupLanes(rows, nameOf))).toBe('Pista 5: Carla, Beto\nPista 6: Ana, Dani');
    expect(lanesPublished(rows)).toBe(false);

    await setPlayerLane(practice, p.dani, 5);
    rows = await fetchEventLanes(practice);
    expect(lanesText(groupLanes(rows, nameOf))).toBe('Pista 5: Carla, Beto, Dani\nPista 6: Ana');

    // Solo Ana tiene cuenta: un aviso.
    expect(await publishLanes(practice)).toEqual({ players: 4, pushed: 1 });
    rows = await fetchEventLanes(practice);
    expect(lanesPublished(rows)).toBe(true);

    // Ana (jugadora) las ve, pero no las cambia.
    await w.as('ana@x.com');
    expect((await fetchEventLanes(practice)).find((r) => r.playerId === p.ana)?.lane).toBe(6);
    await expect(assignLanes(practice, { lanes: [1], perLane: 4, mode: 'azar' })).rejects.toMatchObject({ kind: 'permission' });
    await w.as('org@x.com');

    // No caben: 4 jugadores en una pista de 2.
    await expect(assignLanes(practice, { lanes: [1], perLane: 2, mode: 'azar' })).rejects.toMatchObject({ kind: 'validation' });
    expect(await clearLanes(practice)).toBe(4);
    expect(await fetchEventLanes(practice)).toEqual([]);
  });
});

describe('suspender un día', () => {
  it('sin nueva fecha: el evento vacío se cancela y sale UN aviso', async () => {
    const day = plus(today, 7);
    const [{ id: empty }] = await q<{ id: string }>(`insert into public.events (league_id, type, date) values ($1, 'practica', $2) returning id`, [lid, day]);
    const preview = await fetchSuspendPreview(lid, day);
    expect(suspendable(preview)).toBe(1);
    expect(preview.events).toMatchObject([{ id: empty, sub: 'bowling', locked: false, content: false }]);
    expect(preview.withoutDate).toEqual({ postponed: 0, cancelled: 1, kept: 0 });

    const r = await suspendDay(lid, day, 'Lluvia', null);
    expect(r.events).toEqual({ moved: 0, cancelled: 1, kept: 0 });
    expect(r.announced).toBe(true);
    expect(r.body).toMatch(/^Se suspende el .+: Lluvia\. La nueva fecha se avisará\.$/);
    expect(await q(`select id from public.events where id = $1`, [empty])).toEqual([]);
    expect(await q<{ n: number }>(`select count(*)::int as n from public.league_announcements where league_id = $1`, [lid])).toEqual([{ n: 1 }]);
  });

  it('con nueva fecha: la práctica de hoy (con inscritos) pasa a esa fecha', async () => {
    const to = plus(today, 3);
    const preview = await fetchSuspendPreview(lid, today);
    expect(preview.counts.bowlingEvents).toBe(1);
    expect(preview.withoutDate.kept).toBe(1);
    const r = await suspendDay(lid, today, 'No hay luz', to);
    expect(r.newDate).toBe(to);
    expect(r.events.moved).toBe(1);
    expect(await q(`select date::text as date from public.events where id = $1`, [practice])).toEqual([{ date: to }]);
    // La nueva fecha tiene que ser distinta del día y desde hoy.
    await expect(suspendDay(lid, to, 'Otra vez', to)).rejects.toMatchObject({ kind: 'validation' });
    expect(suspendable(await fetchSuspendPreview(lid, today))).toBe(0);
  });
});
