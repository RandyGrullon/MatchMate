import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEvent } from './events';
import { fetchMyInvites, respondInvite } from './invites';
import { createLeague, joinLeague } from './leagues';
import { fetchMembership } from './members';
import {
  createScorerLink,
  fetchScorerAccess,
  getScorerLinkPreview,
  inviteScorers,
  joinAsScorer,
  linkFor,
  playToo,
  revokeScorerLink,
  rotateScorerLink,
  setScorer,
  type ScorerTarget,
} from './scorers';
import { openWorld, type TestWorld } from './testkit';

/**
 * Anotadores contra la base de verdad (PGlite con las migraciones): rosa es dueña de una liga privada de boliche con
 * un torneo. Crea el link para anotar y ana entra con él (queda anotadora sin jugador); a beto lo invita por su
 * @usuario, acepta y después dice «También juego»; carla ya es miembro y la nombra directo. Quitarle el permiso a
 * quien entró solo para anotar la saca de la liga.
 */

let w: TestWorld;
let rosa: string;
let ana: string;
let beto: string;
let carla: string;
let lid: string;
let torneo: string;
let target: ScorerTarget;

beforeAll(async () => {
  w = await openWorld();
  ana = await w.signUp('ana@x.com', 'Ana Pérez');
  beto = await w.signUp('beto@x.com', 'Beto Gómez');
  carla = await w.signUp('carla@x.com', 'Carla');
  rosa = await w.signUp('rosa@x.com', 'Rosa Dueña');
  lid = await createLeague(
    { uid: rosa, name: 'Rosa' },
    {
      name: 'Liga de los martes',
      kind: 'liga',
      visibility: 'private',
      venue: 'Bolera',
      schedule: 'Martes 7:00 pm',
      seasonStart: '',
      seasonEnd: '',
      contactName: 'Rosa',
      contactPhone: '18095551234',
      requirePhoto: false,
    },
  );
  torneo = await createEvent(lid, {
    type: 'torneo',
    name: 'Copa Aniversario',
    date: '2026-10-10',
    games: 3,
    hcpBase: 0,
    hcpPercent: 0,
    individualRankBy: 'scratch',
    teamRankBy: 'scratch',
    categoryCuts: [200, 175, 160],
    teamSize: 0,
    announcement: '',
  });
  target = { scope: 'evento', refId: torneo, title: 'Copa Aniversario' };
  // Carla entra a la liga con el código (con su jugador).
  const [{ invite_code: code }] = (await w.b.db.query<{ invite_code: string }>('select invite_code from public.league_secrets where league_id = $1', [lid])).rows;
  await w.as('carla@x.com');
  await joinLeague(lid, { uid: carla, name: 'Carla' }, code);
  await w.as('rosa@x.com');
}, 120_000);

afterAll(async () => {
  await w?.close();
});

describe('el link para anotar (capa de datos)', () => {
  let code = '';

  it('el admin lo crea (crear dos veces da el mismo) y sale en la hoja', async () => {
    await w.as('rosa@x.com');
    const link = await createScorerLink(lid, target);
    expect(link.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(link).toMatchObject({ scope: 'evento', refId: torneo, title: 'Copa Aniversario', path: `/l/${lid}/e/${torneo}`, status: 'ok', uses: 0, maxUses: 20 });
    expect((await createScorerLink(lid, target)).code).toBe(link.code);
    expect(linkFor((await fetchScorerAccess(lid)).links, target)?.id).toBe(link.id);
    code = link.code;
  });

  it('quien no es de la liga (privada) lo ve y entra: anotadora sin jugador', async () => {
    await w.as('ana@x.com');
    const preview = await getScorerLinkPreview(code.toLowerCase());
    expect(preview).toMatchObject({ status: 'ok', leagueId: lid, name: 'Liga de los martes', sport: 'bowling', title: 'Copa Aniversario', member: false, canScore: false });
    const r = await joinAsScorer(code);
    expect(r).toEqual({ status: 'joined', leagueId: lid, scope: 'evento', refId: torneo, title: 'Copa Aniversario', path: `/l/${lid}/e/${torneo}` });
    const m = await fetchMembership(lid, ana);
    expect(m).toMatchObject({ role: 'member', scorer: true, scorerOnly: true, playerId: null });
    // Ya anota: la pantalla la lleva directo.
    expect(await getScorerLinkPreview(code)).toMatchObject({ member: true, canScore: true });
    expect(await joinAsScorer(code)).toMatchObject({ status: 'already' });
  });

  it('un código que no existe: null', async () => {
    await w.as('beto@x.com');
    expect(await getScorerLinkPreview('ZZZZZZZZZZ')).toBeNull();
    expect(await joinAsScorer('ZZZZZZZZZZ')).toBeNull();
  });

  it('cambiarlo deja el viejo sin servir; quitarlo lo saca de la hoja', async () => {
    await w.as('rosa@x.com');
    const [old] = (await fetchScorerAccess(lid)).links;
    expect(old.uses).toBe(1);
    const next = await rotateScorerLink(lid, old);
    expect(next.code).not.toBe(old.code);
    expect(next.uses).toBe(0);
    await w.as('beto@x.com');
    expect(await getScorerLinkPreview(old.code)).toEqual({ status: 'revoked' });
    await w.as('rosa@x.com');
    await revokeScorerLink(lid, next);
    expect((await fetchScorerAccess(lid)).links).toEqual([]);
  });
});

describe('invitar a anotar y nombrar (capa de datos)', () => {
  it('a quien no es de la liga le llega una invitación de anotador; al aceptarla anota sin jugador', async () => {
    await w.as('rosa@x.com');
    const res = await inviteScorers(lid, [beto, carla], target);
    expect(res.results).toEqual([
      { userId: beto, status: 'sent' },
      { userId: carla, status: 'member' },
    ]);
    const access = await fetchScorerAccess(lid);
    expect(access.invites).toHaveLength(1);
    expect(access.invites[0]).toMatchObject({ user: { id: beto, name: 'Beto Gómez' }, asPlayer: false, title: 'Copa Aniversario' });

    await w.as('beto@x.com');
    const [inv] = await fetchMyInvites();
    expect(inv.scorer).toEqual({ title: 'Copa Aniversario', scope: 'evento', refId: torneo, path: `/l/${lid}/e/${torneo}`, asPlayer: false });
    const r = await respondInvite(inv.id, true);
    expect(r).toMatchObject({ status: 'accepted', joined: true, playerId: null, scorer: { title: 'Copa Aniversario', path: `/l/${lid}/e/${torneo}` } });
    expect(await fetchMembership(lid, beto)).toMatchObject({ scorer: true, scorerOnly: true, playerId: null });
  });

  it('«También juego»: le crea su jugador y deja de ser «solo anota»', async () => {
    await w.as('beto@x.com');
    const player = await playToo(lid);
    expect(player).toBeTruthy();
    const m = await fetchMembership(lid, beto);
    expect(m?.playerId).toBe(player);
    expect(m?.scorerOnly).toBeUndefined();
    expect(m?.scorer).toBe(true);
  });

  it('a un miembro se le da directo; quitárselo lo deja como jugador', async () => {
    await w.as('rosa@x.com');
    await setScorer({ leagueId: lid, uid: carla }, true, target);
    expect(await fetchMembership(lid, carla)).toMatchObject({ scorer: true });
    await setScorer({ leagueId: lid, uid: carla }, false, target);
    const m = await fetchMembership(lid, carla);
    expect(m?.scorer).toBe(false);
    expect(m?.playerId).toBeTruthy();
  });

  it('quitarle el permiso a quien entró solo para anotar la saca de la liga', async () => {
    await w.as('rosa@x.com');
    await setScorer({ leagueId: lid, uid: ana }, false, target);
    expect(await fetchMembership(lid, ana)).toBeNull();
  });
});
