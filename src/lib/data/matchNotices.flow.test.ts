/**
 * Avisos de partidos de la campana con la base de verdad (PGlite con las migraciones y la RLS): lo que lee
 * `fetchMatchNotices` para cada cuenta (mis partidos con mi lado y si puedo confirmar, el último cambio de hora del
 * historial, los reclamos del organizador, los retos y la ronda de la noche) y los avisos que salen de ahí.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toIsoDate } from '../format';
import { buildMatchNotices } from '../notifications';
import type { Backend } from '../backend/types';
import type { League } from '../types';
import { rpc } from './client';
import { createLeague, fetchLeaguesByIds, joinLeague } from './leagues';
import { fetchMatchNotices, matchLeagueItems, resetMatchNoticesForTests, type MatchNoticeFeed } from './matchNotices';
import { MATCH_LIST_COLUMNS, createMatches, postponeMatch, rescheduleMatch, resetMatchesForTests } from './matches';
import { fetchMyMemberships } from './members';
import { createPlayer, fetchPlayers } from './players';
import { createSeasonTeam } from './seasonTeams';
import { stamped } from './stamp';
import { openWorld, type TestWorld } from './testkit';

const DAY = 86400_000;

let w: TestWorld;
const ids: Record<string, string> = {};
let lid: string;
let fid: string;
const p: Record<string, string> = {};
const m: Record<string, string> = {};
let night: string;
let ladder: string;
let challenge: string;
let reads: string[] = [];

/** Anota qué tablas y columnas se leen (para ver que releer solo baja lo que cambió). */
function counting(base: Backend): Backend {
  return {
    get mode() {
      return base.mode;
    },
    get auth() {
      return base.auth;
    },
    get storage() {
      return base.storage;
    },
    select: (q) => {
      reads.push(`${q.table}:${q.columns ?? '*'}`);
      return base.select(q);
    },
    rpc: (fn, args) => base.rpc(fn, args),
    subscribe: (t, cb) => base.subscribe(t, cb),
    invoke: (fn, body) => base.invoke(fn, body),
    online: () => base.online(),
  };
}

const input = (name: string, sport: string) => ({
  name,
  kind: 'liga' as const,
  visibility: 'public' as const,
  venue: 'Club',
  schedule: '',
  seasonStart: '',
  seasonEnd: '',
  contactName: '',
  contactPhone: '',
  requirePhoto: false,
  sport,
});

/** Lo que la campana lee y arma para la cuenta que entró. */
async function noticesOf(email: string) {
  const uid = await w.as(email);
  const leagues = stamped<League[]>(await fetchLeaguesByIds([lid, fid]));
  const items = matchLeagueItems(await fetchMyMemberships(uid), leagues);
  const feed = stamped<MatchNoticeFeed>(await fetchMatchNotices(uid, items));
  return { feed, notices: buildMatchNotices(feed, leagues, Date.now()) };
}

const side = (n: 1 | 2, ...players: string[]) => ({ side: n, players: players.map((playerId) => ({ playerId })) });

beforeAll(async () => {
  w = await openWorld();
  ids.ana = await w.signUp('ana@x.com', 'Ana');
  ids.luis = await w.signUp('luis@x.com', 'Luis');
  ids.pepe = await w.signUp('pepe@x.com', 'Pepe');
  ids.rosa = await w.signUp('rosa@x.com', 'Rosa');
  // Pádel y fútbol están en beta: solo el superadmin crea la liga.
  await w.makeSuper(ids.rosa);
  lid = await createLeague({ uid: ids.rosa, name: 'Rosa' }, input('Pádel del jueves', 'padel'));
  fid = await createLeague({ uid: ids.rosa, name: 'Rosa' }, input('Liga de Fútbol', 'football'));
  for (const who of ['ana', 'luis', 'pepe'] as const) {
    await w.as(`${who}@x.com`);
    await joinLeague(lid, { uid: ids[who], name: who }, null);
    await joinLeague(fid, { uid: ids[who], name: who }, null);
  }

  await w.as('rosa@x.com');
  for (const x of await fetchPlayers(lid)) if (x.uid) p[Object.keys(ids).find((k) => ids[k] === x.uid)!] = x.id;
  p.x = await createPlayer(lid, 'Xavier', null);
  p.y = await createPlayer(lid, 'Yoli', null);
  const fp: Record<string, string> = {};
  for (const x of await fetchPlayers(fid)) if (x.uid) fp[Object.keys(ids).find((k) => ids[k] === x.uid)!] = x.id;

  const now = Date.now();
  [m.propuesto, m.reclamado, m.movido, m.aplazado] = await createMatches(lid, [
    { format: 'sets', scheduledAt: new Date(now - DAY).toISOString(), sides: [side(1, p.ana), side(2, p.luis)] },
    { format: 'sets', scheduledAt: new Date(now - DAY).toISOString(), sides: [side(1, p.ana), side(2, p.luis)] },
    { format: 'sets', court: 'Cancha 1', scheduledAt: new Date(now + 3 * DAY).toISOString(), sides: [side(1, p.ana), side(2, p.luis)] },
    { format: 'sets', scheduledAt: new Date(now + 5 * DAY).toISOString(), sides: [side(1, p.ana), side(2, p.luis)] },
  ]);
  await rescheduleMatch(lid, m.movido, new Date(now + 4 * DAY).toISOString(), { court: 'Cancha 2', note: 'Lluvia' });
  await postponeMatch(lid, m.aplazado, 'Se fue la luz');

  // Noche de americano de hoy: ronda 1 publicada, Rosa descansa.
  night = await rpc<string>('create_event', {
    p_league: lid,
    p_type: 'americano',
    p_date: toIsoDate(new Date()),
    p_start_time: '19:00',
    p_name: 'Americano de hoy',
    p_config: { format: 'americano', players: [p.ana, p.x, p.luis, p.y, p.rosa], courts: ['Cancha 1'], points: { mode: 'total', target: 24 } },
  });
  [m.ronda] = await rpc<string[]>('save_night_round', {
    p_event: night,
    p_round: 1,
    p_matches: [{ court: 'Cancha 1', sides: [{ side: 1, players: [{ player_id: p.ana }, { player_id: p.x }] }, { side: 2, players: [{ player_id: p.luis }, { player_id: p.y }] }] }],
    p_rests: [p.rosa],
  });

  // Escalera: Luis 1.º, Ana 2.ª.
  ladder = await rpc<string>('create_event', {
    p_league: lid,
    p_type: 'escalera',
    p_date: toIsoDate(new Date()),
    p_name: 'Escalera',
    p_config: { format: 'escalera', acceptDays: 3, playDays: 7 },
  });
  await rpc('set_ladder', { p_event: ladder, p_entrants: [p.luis, p.ana] });

  // Fútbol: Tigres (capitana Ana) contra Leones (capitán Pepe; Luis juega).
  const tigres = await createSeasonTeam(fid, { name: 'Tigres', players: [{ playerId: fp.ana, role: 'captain' }] });
  const leones = await createSeasonTeam(fid, { name: 'Leones', players: [{ playerId: fp.pepe, role: 'captain' }, { playerId: fp.luis }] });
  [m.futbol] = await createMatches(fid, [{ scheduledAt: new Date(now - DAY).toISOString(), sides: [{ side: 1, teamId: tigres }, { side: 2, teamId: leones }] }]);

  // Ana anota dos resultados (uno se lo reclaman) y reta a Luis; Luis anota uno.
  await w.as('luis@x.com');
  await rpc('finish_match', { p_match: m.propuesto, p_score: { text: '4-6 3-6', sides: [0, 2] }, p_winner: 2 });
  await w.as('ana@x.com');
  await rpc('finish_match', { p_match: m.reclamado, p_score: { text: '6-4 6-3', sides: [2, 0] }, p_winner: 1 });
  await rpc('finish_match', { p_match: m.futbol, p_score: { text: '2-1', sides: [2, 1] }, p_winner: 1 });
  challenge = await rpc<string>('create_challenge', { p_event: ladder, p_challenged: p.luis });
  await w.as('luis@x.com');
  await rpc('dispute_result', { p_match: m.reclamado, p_note: 'Fue 6-4 4-6 10-8' });
  w.use(counting(w.b));
}, 180_000);

afterAll(async () => {
  resetMatchesForTests();
  resetMatchNoticesForTests();
  await w.close();
});

describe('avisos de partidos con la base de verdad', () => {
  it('Ana: por confirmar, su resultado reclamado, cambio de hora, aplazado y su cancha en la ronda', async () => {
    const { feed, notices } = await noticesOf('ana@x.com');
    expect(feed.adminLeagues).toEqual([]);
    expect(feed.disputes).toEqual([]);
    const mine = new Map(feed.mine.map((x) => [x.id, x]));
    expect(mine.get(m.propuesto)).toMatchObject({ status: 'finished', mySide: 1, proposedSide: 2, canAnswer: true });
    expect(mine.get(m.movido)?.change).toMatchObject({ a: 'reschedule', toCourt: 'Cancha 2', fromCourt: 'Cancha 1', note: 'Lluvia' });
    expect(mine.get(m.aplazado)).toMatchObject({ status: 'postponed', change: { a: 'postpone', note: 'Se fue la luz' } });
    // Sin cambios de hora: el historial no se baja.
    expect(mine.get(m.propuesto)?.change).toBeNull();
    expect(feed.nights).toEqual([expect.objectContaining({ eventId: night, round: 1, rests: [p.rosa] })]);
    expect(feed.challenges).toEqual([expect.objectContaining({ id: challenge, status: 'pending', eventId: ladder })]);

    expect(notices.map((n) => [n.kind, n.title]).sort()).toEqual(
      [
        ['aplazado', 'Aplazaron tu partido'],
        ['cambio-hora', 'Cambiaron la fecha de tu partido'],
        ['por-confirmar', 'Tienes un resultado por confirmar'],
        ['reclamo', 'Reclamaron tu resultado'],
        ['ronda', 'Ronda 1: te toca la Cancha 1'],
      ].sort(),
    );
    const byKind = Object.fromEntries(notices.map((n) => [n.kind, n]));
    expect(byKind['por-confirmar']).toMatchObject({ id: `confirmar:${m.propuesto}`, to: `/l/${lid}/juegos?partido=${m.propuesto}`, leagueName: 'Pádel del jueves' });
    expect(byKind['por-confirmar'].body).toMatch(/^Luis anotó 4-6 3-6\. Confírmalo o reclama en las próximas 4[78] h\.$/);
    expect(byKind.reclamo.body).toBe('Ana contra Luis: 6-4 6-3. «Fue 6-4 4-6 10-8». El organizador lo va a revisar.');
    expect(byKind.ronda).toMatchObject({ body: 'Ana / Xavier contra Luis / Yoli · Americano de hoy', to: `/l/${lid}/e/${night}?partido=${m.ronda}` });
  });

  it('Luis: lo retaron y juega la ronda; el resultado de fútbol no lo confirma él (no es capitán)', async () => {
    const { feed, notices } = await noticesOf('luis@x.com');
    expect(feed.mine.find((x) => x.id === m.futbol)).toMatchObject({ status: 'finished', mySide: 2, canAnswer: false });
    expect(notices.map((n) => n.kind).sort()).toEqual(['aplazado', 'cambio-hora', 'reto', 'ronda']);
    const reto = notices.find((n) => n.kind === 'reto')!;
    expect(reto).toMatchObject({ id: `reto:${challenge}`, title: 'Te retaron en la escalera', to: `/l/${lid}/e/${ladder}` });
    expect(reto.body).toMatch(/^Ana \(puesto 2\) te retó\. Tienes hasta el .+ para aceptar\.$/);
  });

  it('Pepe (capitán del otro equipo) sí tiene el resultado por confirmar', async () => {
    const { notices } = await noticesOf('pepe@x.com');
    expect(notices.map((n) => [n.kind, n.leagueName, n.to])).toEqual([['por-confirmar', 'Liga de Fútbol', `/l/${fid}/juegos?partido=${m.futbol}`]]);
    expect(notices[0].body).toMatch(/^Tigres anotó 2-1\./);
  });

  it('Rosa (organizadora): el reclamo por resolver y que descansa en la ronda', async () => {
    const { feed, notices } = await noticesOf('rosa@x.com');
    expect(feed.adminLeagues.sort()).toEqual([lid, fid].sort());
    expect(feed.disputes.map((x) => x.id)).toEqual([m.reclamado]);
    expect(notices.map((n) => [n.kind, n.title]).sort()).toEqual(
      [
        ['reclamo', 'Reclamaron un resultado'],
        ['ronda', 'Ronda 1: descansas'],
      ].sort(),
    );
    expect(notices.find((n) => n.kind === 'reclamo')).toMatchObject({ to: `/l/${lid}/juegos?partido=${m.reclamado}` });
  });

  it('releer baja solo lo que cambió: sin cambios, solo `id, version`', async () => {
    await noticesOf('ana@x.com');
    reads = [];
    await noticesOf('ana@x.com');
    const matchReads = reads.filter((r) => r.startsWith('matches:') || r.startsWith('match_sides:'));
    expect(matchReads.length).toBeGreaterThan(0);
    expect(matchReads.every((r) => r === 'matches:id,version')).toBe(true);
    // Un cambio de hora: ese partido completo, con sus lados y su historial.
    await w.as('rosa@x.com');
    await rescheduleMatch(lid, m.movido, new Date(Date.now() + 6 * DAY).toISOString(), { note: 'Otra vez lluvia' });
    reads = [];
    const { feed, notices } = await noticesOf('ana@x.com');
    expect(reads.filter((r) => r === `matches:${MATCH_LIST_COLUMNS}`)).toHaveLength(1);
    expect(reads).toContain('match_sides:match_id,side,team_id,label,seed');
    expect(reads).toContain('matches:id,history');
    expect(feed.mine.find((x) => x.id === m.movido)?.change).toMatchObject({ note: 'Otra vez lluvia', fromCourt: 'Cancha 2' });
    expect(notices.find((n) => n.id === `hora:${m.movido}`)?.body).toContain('«Otra vez lluvia».');
  });

  it('al resolver el reclamo, deja de salir', async () => {
    await w.as('rosa@x.com');
    await rpc('resolve_dispute', { p_match: m.reclamado });
    const { notices } = await noticesOf('rosa@x.com');
    expect(notices.map((n) => n.kind)).toEqual(['ronda']);
    expect((await noticesOf('ana@x.com')).notices.some((n) => n.kind === 'reclamo')).toBe(false);
  });
});
