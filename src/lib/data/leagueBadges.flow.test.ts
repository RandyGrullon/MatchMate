import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { badgeTextProblem } from '../../components/badges/text';
import { makerCode } from '../../components/badges/maker/design';
import { fetchLeague } from './leagues';
import { fetchLeagueMembers } from './members';
import {
  archiveLeagueBadge,
  awardLeagueBadge,
  deleteLeagueBadge,
  fetchBadgeHolders,
  fetchLeagueBadges,
  revokeLeagueBadgeAward,
  saveLeagueBadge,
  setBadgePolicy,
  setMemberBadgeMaker,
  type LeagueBadge,
} from './leagueBadges';
import { openWorld, type TestWorld } from './testkit';

/**
 * El creador de insignias contra la base de verdad (PGlite con las migraciones): liga de boliche de rosa (dueña),
 * con pedro de admin y ana y luis de miembros, más un jugador sin cuenta. Lo que mandan las pantallas llega a las RPC
 * de 20260929001120_insignias_creador.sql con los nombres y la forma que piden.
 */

let w: TestWorld;
let rosa: string;
let pedro: string;
let ana: string;
let luis: string;
let lid: string;
const pl: Record<string, string> = {};
let champion: LeagueBadge;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

/** El código corto con que falla una escritura (o null si no falla). */
async function code(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return makerCode(e) ?? (e instanceof Error ? e.message : String(e));
  }
}

beforeAll(async () => {
  w = await openWorld();
  rosa = await w.signUp('rosa@x.com', 'Rosa');
  pedro = await w.signUp('pedro@x.com', 'Pedro');
  ana = await w.signUp('ana@x.com', 'Ana');
  luis = await w.signUp('luis@x.com', 'Luis');
  [{ id: lid }] = await q<{ id: string }>(
    `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone, require_photo)
     values ('bowling', 'liga', 'private', 'Liga Los Pinos', $1, 'Bolera', 'Martes', '2026-01-01', '2026-12-31', 'Rosa', '18095550000', false) returning id`,
    [rosa],
  );
  await q(
    `insert into public.league_members (league_id, user_id, role, display_name)
     values ($1, $2, 'owner', 'Rosa'), ($1, $3, 'admin', 'Pedro'), ($1, $4, 'member', 'Ana'), ($1, $5, 'member', 'Luis')`,
    [lid, rosa, pedro, ana, luis],
  );
  for (const [k, name, uid] of [
    ['rosa', 'Rosa M.', rosa],
    ['pedro', 'Pedro A.', pedro],
    ['ana', 'Ana P.', ana],
    ['luis', 'Luis G.', luis],
    ['sin', 'Carlos (sin cuenta)', null],
  ] as const) {
    [{ id: pl[k] }] = await q<{ id: string }>(`insert into public.players (league_id, name, user_id) values ($1, $2, $3) returning id`, [lid, name, uid]);
  }
}, 120_000);

afterAll(async () => {
  await w?.close();
});

describe('creador de insignias (capa de datos)', () => {
  it('la dueña crea un diseño y los miembros lo ven (sin columnas privadas)', async () => {
    await w.as('rosa@x.com');
    champion = await saveLeagueBadge(lid, null, {
      template: 'champion',
      name: '  Campeón  ',
      description: 'Terminaste de primero en la temporada.',
      shape: 'shield',
      palette: 'oro',
      color: null,
      icon: 'trophy',
      top_text: '',
      period_text: 'TEMP 2026',
      limit_kind: 'unica',
      by_team: false,
    });
    expect(champion).toMatchObject({ leagueId: lid, name: 'Campeón', template: 'champion', limitKind: 'unica', given: 0, locked: false, status: 'activa' });

    await w.as('ana@x.com');
    const seen = await fetchLeagueBadges(lid);
    expect(seen.designs.map((d) => d.name)).toEqual(['Campeón']);
    expect(seen.awards).toEqual([]);
  });

  it('dar: con aviso a quien tiene cuenta; nunca a sí mismo; el cupo de la Única', async () => {
    // Ana tiene el aviso activado en un teléfono (sin teléfono, push_outbox_fanout no deja la fila).
    await q(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/ana', 'k', 'a')`, [ana]);
    await w.as('rosa@x.com');
    const res = await awardLeagueBadge({ badge: champion, players: [pl.ana], note: ' Por tu 279 ', notify: true });
    expect(res.notified).toBe(1);
    expect(res.awards).toEqual([expect.objectContaining({ playerId: pl.ana, period: 'TEMP 2026', division: '', note: 'Por tu 279' })]);
    const [push] = await q<{ tag: string; url: string; body: string }>(`select tag, url, body from public.push_outbox where tag like 'insignia:%'`);
    expect(push).toMatchObject({ tag: `insignia:${res.awards[0].id}`, url: `/u/${ana}?tab=insignias` });
    expect(push.body).toBe('Liga Los Pinos te dio “Campeón · TEMP 2026”. Tócala para verla.');

    expect(await code(awardLeagueBadge({ badge: champion, players: [pl.rosa], period: '2025' }))).toBe('a_si_mismo');
    expect(await code(awardLeagueBadge({ badge: champion, players: [pl.luis] }))).toBe('cupo_lleno');
    expect(await code(awardLeagueBadge({ badge: champion, players: [pl.ana] }))).toBe('duplicado');
    // Otra división es otro cupo; el jugador sin cuenta no recibe aviso.
    const other = await awardLeagueBadge({ badge: champion, players: [pl.sin], division: 'Cat. A' });
    expect(other).toMatchObject({ notified: 0, awards: [expect.objectContaining({ division: 'Cat. A' })] });
  });

  it('quién la tiene: los admins ven todo; el jugador, su nota; la lista pública, sin lo privado', async () => {
    await w.as('pedro@x.com');
    const admin = await fetchBadgeHolders(champion.id);
    expect(admin!.badge).toMatchObject({ given: 2, active: 2, locked: true, openReports: 0 });
    const ana1 = admin!.awards.find((a) => a.playerId === pl.ana)!;
    expect(ana1).toMatchObject({ playerName: 'Ana P.', userId: ana, note: 'Por tu 279', awardedBy: rosa, awardedByName: 'Rosa' });
    // Pedro no la dio y no es el dueño: no la puede deshacer.
    expect(ana1.canUndo).toBe(false);

    await w.as('ana@x.com');
    const mine = await fetchBadgeHolders(champion.id);
    expect(mine!.canGive).toBe(false);
    expect(mine!.awards.find((a) => a.playerId === pl.ana)).toMatchObject({ note: 'Por tu 279', awardedBy: null, awardedByName: null });
    expect(mine!.awards.find((a) => a.playerId === pl.sin)).toMatchObject({ note: null, userId: null });

    await w.as('luis@x.com');
    const list = await fetchLeagueBadges(lid);
    expect(list.awards.map((a) => a.playerId).sort()).toEqual([pl.ana, pl.sin].sort());
    expect(list.designs[0]).toMatchObject({ given: 2, active: 2, locked: true });
  });

  it('ya dada: solo cambia la descripción; no se borra (se archiva); archivada no se da', async () => {
    await w.as('rosa@x.com');
    expect(await code(saveLeagueBadge(lid, champion.id, { name: 'Campeona' }))).toBe('ya_dada');
    const saved = await saveLeagueBadge(lid, champion.id, { description: 'El título de la temporada.' });
    expect(saved).toMatchObject({ name: 'Campeón', description: 'El título de la temporada.', locked: true });
    expect(await code(deleteLeagueBadge(champion))).toBe('ya_dada');
    expect(await code(saveLeagueBadge(lid, null, { name: 'Mala', shape: 'hex', palette: 'oro', icon: 'trophy', description: 'visita www.x' }))).toBe('texto_bloqueado');

    const draft = await saveLeagueBadge(lid, null, { name: 'Borrador', shape: 'hex', palette: 'color', color: '#0D9488', icon: 'bird' });
    expect(draft).toMatchObject({ palette: 'color', color: '#0d9488' });
    await deleteLeagueBadge(draft);
    expect((await fetchLeagueBadges(lid)).designs.map((d) => d.name)).toEqual(['Campeón']);

    expect(await archiveLeagueBadge(champion, true)).toBe('archivada');
    expect(await code(awardLeagueBadge({ badge: champion, players: [pl.luis], period: '2025' }))).toBe('no_activa');
    expect(await archiveLeagueBadge(champion, false)).toBe('activa');
  });

  it('«Yo y los que yo elija»: el admin deja de poder; el miembro marcado diseña, da y deshace lo suyo', async () => {
    await w.as('rosa@x.com');
    expect(await setBadgePolicy(lid, 'chosen')).toBe('chosen');
    expect((await fetchLeague(lid))!.badgeMakers).toBe('chosen');
    await setMemberBadgeMaker({ leagueId: lid, uid: luis }, true);
    const members = await fetchLeagueMembers(lid);
    expect(members.find((m) => m.uid === luis)?.badgeMaker).toBe(true);
    expect(members.find((m) => m.uid === ana)?.badgeMaker).toBeUndefined();

    await w.as('pedro@x.com');
    expect(await code(saveLeagueBadge(lid, null, { name: 'De Pedro', shape: 'hex', palette: 'oro', icon: 'trophy' }))).toBe('no_permitido');

    await w.as('luis@x.com');
    const helper = await saveLeagueBadge(lid, null, { name: 'Mano amiga', shape: 'square', palette: 'bronce', icon: 'hand-heart', limit_kind: 'abierta' });
    const given = await awardLeagueBadge({ badge: helper, players: [pl.ana, pl.sin, pl.ana], period: '' });
    expect(given.awards.map((a) => a.playerId)).toEqual([pl.ana, pl.sin]);
    const holders = await fetchBadgeHolders(helper.id);
    expect(holders!.awards.every((a) => a.canUndo)).toBe(true);
    await revokeLeagueBadgeAward(lid, given.awards[1].id);
    expect((await fetchBadgeHolders(helper.id))!.awards.map((a) => a.playerId)).toEqual([pl.ana]);

    // El dueño quita lo que sea, con un motivo privado que ven los admins.
    await w.as('rosa@x.com');
    await revokeLeagueBadgeAward(lid, given.awards[0].id, 'Se dio por error');
    const after = await fetchBadgeHolders(helper.id);
    expect(after!.awards.find((a) => a.id === given.awards[0].id)).toMatchObject({ revokeReason: 'Se dio por error', canUndo: false });
    expect(after!.awards.find((a) => a.id === given.awards[0].id)!.revokedAt).toBeTruthy();
  });

  it('el filtro del teléfono dice lo mismo que la base (menos las palabras bloqueadas)', async () => {
    const samples = ['', 'Campeón', 'TEMP 26/27', '¡Ahí mismito!', 'Campeón 🏆', 'ana@x', 'http algo', 'liga.com', 'algo.do', 'Premio.dominicano', '809-555-1234', '5551234', 'Top 300 de 2026', 'Goooool', 'aáaA', '"Cigua" & Co.'];
    for (const s of samples) {
      const [{ ok }] = await q<{ ok: boolean }>('select private.badge_text_ok($1) as ok', [s]);
      expect(badgeTextProblem(s) === null, s).toBe(ok);
    }
  });
});
