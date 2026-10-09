import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchProfile } from '../auth';
import { queryClient, remember } from './client';
import { setFollowing } from './follows';
import {
  cancelInvite,
  fetchInviteDetails,
  fetchMyInvites,
  inviteErrorText,
  inviteKeys,
  inviteNotices,
  inviteTags,
  inviteResultSummary,
  respondInvite,
  sendInvites,
  type LeagueInvite,
} from './invites';
import { createLeague, joinLeague } from './leagues';
import { fetchMembership } from './members';
import { checkUsername, fetchPeople, peopleSearchKey, setUsername, usernameErrorText, type PersonHit } from './people';
import { openWorld, type TestWorld } from './testkit';
import { watchTopicFor } from './topics';

/**
 * @usuario, buscar personas e invitaciones contra la base de verdad (PGlite con las migraciones): rosa es dueña de
 * una liga pública de boliche; ana es miembro e invita; beto acepta, carla rechaza, dani acepta diciendo quién es
 * y a eva se la retiran.
 */

let w: TestWorld;
let rosa: string;
let ana: string;
let beto: string;
let carla: string;
let dani: string;
let eva: string;
let lid: string;
let privada: string;
let pedro: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

const leagueInput = (name: string, visibility: 'public' | 'private') => ({
  name,
  kind: 'liga' as const,
  visibility,
  venue: 'Bolera',
  schedule: 'Martes 7:00 pm',
  seasonStart: '',
  seasonEnd: '',
  contactName: 'Rosa',
  contactPhone: '18095551234',
  requirePhoto: false,
});

async function until(ok: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('no llegó a tiempo');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** La invitación pendiente de esa cuenta (la lee como ella). */
async function inviteOf(email: string): Promise<LeagueInvite> {
  await w.as(email);
  const [inv] = await fetchMyInvites();
  if (!inv) throw new Error(`sin invitación: ${email}`);
  return inv;
}

beforeAll(async () => {
  w = await openWorld();
  beto = await w.signUp('beto@x.com', 'Beto Gómez');
  carla = await w.signUp('carla@x.com', 'Carla');
  dani = await w.signUp('dani@x.com', 'Dani');
  eva = await w.signUp('eva@x.com', 'Eva');
  ana = await w.signUp('ana@x.com', 'Ana Pérez');
  rosa = await w.signUp('rosa@x.com', 'Rosa Dueña');
  lid = await createLeague({ uid: rosa, name: 'Rosa' }, leagueInput('Liga de los martes', 'public'));
  privada = await createLeague({ uid: rosa, name: 'Rosa' }, leagueInput('Liga privada', 'private'));
  [{ id: pedro }] = await q<{ id: string }>(`insert into public.players (league_id, name) values ($1, 'Pedro') returning id`, [lid]);
  await w.as('ana@x.com');
  await joinLeague(lid, { uid: ana, name: 'Ana' }, null);
}, 120_000);

afterAll(async () => {
  await w?.close();
});

describe('@usuario (capa de datos)', () => {
  it('toda cuenta tiene uno (del nombre) y se puede cambiar', async () => {
    expect((await fetchProfile(ana))?.username).toBe('anaperez');
    expect(await checkUsername('@AnaPerez')).toBe('mine');
    expect(await checkUsername('admin')).toBe('reserved');
    expect(await checkUsername('betogomez')).toBe('taken');
    expect(await checkUsername('ana.p')).toBe('ok');

    // El perfil guardado cambia al momento.
    queryClient.setQueryData(`profile:${ana}`, await fetchProfile(ana));
    expect(await setUsername(ana, ' @Ana.P ')).toBe('ana.p');
    expect(queryClient.getQueryData<{ username: string }>(`profile:${ana}`)?.username).toBe('ana.p');
    expect((await fetchProfile(ana))?.username).toBe('ana.p');

    await w.as('beto@x.com');
    const taken = await setUsername(beto, 'ana.p').catch((e: unknown) => e);
    expect(usernameErrorText(taken)).toBe('Ese usuario ya lo tiene otra persona.');
    const reserved = await setUsername(beto, 'soporte').catch((e: unknown) => e);
    expect(usernameErrorText(reserved)).toBe('Ese usuario no está disponible.');
    await w.as('ana@x.com');
  });
});

describe('buscar personas (capa de datos)', () => {
  it('por @usuario y por nombre; con la liga dice quién ya está', async () => {
    const hits = await fetchPeople('@beto', lid);
    expect(hits).toEqual([{ id: beto, name: 'Beto Gómez', username: 'betogomez', isFollowing: false, followsYou: false, inLeague: false, invited: false, avatar: null }]);
    expect((await fetchPeople('dueña', lid)).map((h) => [h.id, h.inLeague])).toEqual([[rosa, true]]);
    // Nunca yo.
    expect(await fetchPeople('ana.p')).toEqual([]);
    // Vacío: a quién sigo (nadie todavía).
    expect(await fetchPeople('', lid)).toEqual([]);
  });

  it('seguir cambia la búsqueda guardada al momento y la lista de a quién sigo', async () => {
    const key = peopleSearchKey('beto', lid);
    remember(key, { kind: 'peopleSearch', lid, id: 'beto' });
    queryClient.setQueryData<PersonHit[]>(key, await fetchPeople('beto', lid));
    const p = setFollowing(beto, true);
    expect(queryClient.getQueryData<PersonHit[]>(key)?.[0]).toMatchObject({ id: beto, isFollowing: true });
    await p;
    expect((await fetchPeople('')).map((h) => [h.id, h.isFollowing])).toEqual([[beto, true]]);
  });

  it('en una liga donde no está, no se puede preguntar', async () => {
    await expect(fetchPeople('beto', privada)).rejects.toMatchObject({ kind: 'permission' });
  });
});

describe('invitaciones (capa de datos)', () => {
  it('un miembro invita a la liga pública: cada cuenta con su estado y la búsqueda cambia al momento', async () => {
    const key = peopleSearchKey('', lid);
    remember(key, { kind: 'peopleSearch', lid, id: '' });
    queryClient.setQueryData<PersonHit[]>(key, await fetchPeople('', lid));

    const res = await sendInvites(lid, [beto, rosa, carla, ana, beto, dani, eva]);
    expect(res).toEqual({
      sent: 4,
      results: [
        { userId: beto, status: 'sent' },
        { userId: rosa, status: 'member' },
        { userId: carla, status: 'sent' },
        { userId: ana, status: 'unavailable' },
        { userId: dani, status: 'sent' },
        { userId: eva, status: 'sent' },
      ],
    });
    expect(inviteResultSummary(res.results)).toBe('Invitación enviada a 4 personas · 1 ya está en la liga · 1 no está disponible');
    expect(queryClient.getQueryData<PersonHit[]>(key)?.find((h) => h.id === beto)).toMatchObject({ invited: true });
    expect((await fetchPeople('@beto', lid))[0]).toMatchObject({ invited: true, inLeague: false });
    // Otra vez: ya tiene una.
    expect((await sendInvites(lid, [beto])).results).toEqual([{ userId: beto, status: 'pending' }]);
    // A la liga privada solo invitan el dueño o un admin (ana ni es miembro).
    const denied = await sendInvites(privada, [beto]).catch((e: unknown) => e);
    expect(inviteErrorText(denied)).toBe('No tienes permiso para invitar a esta liga.');
  });

  it('la invitada la ve (lista, aviso y detalles) y acepta: entra a la liga con su jugador', async () => {
    const inv = await inviteOf('beto@x.com');
    expect(inv).toMatchObject({
      leagueId: lid,
      leagueName: 'Liga de los martes',
      sport: 'bowling',
      kind: 'liga',
      visibility: 'public',
      members: 2,
      invitedBy: { id: ana, name: 'Ana Pérez', username: 'ana.p' },
    });
    expect(inviteNotices([inv])[0]).toMatchObject({ title: 'Ana Pérez te invitó a Liga de los martes', url: `/invitacion/${inv.id}` });
    const details = await fetchInviteDetails(inv.id);
    expect(details).toMatchObject({
      id: inv.id,
      status: 'pending',
      mine: true,
      member: false,
      invitedBy: { id: ana, username: 'ana.p' },
      league: { id: lid, name: 'Liga de los martes', venue: 'Bolera', schedule: 'Martes 7:00 pm', seasonStart: '', members: 2 },
      players: [{ id: pedro, name: 'Pedro' }],
    });

    // Mis invitaciones guardadas: sale al momento.
    const key = inviteKeys.mine(beto);
    remember(key, { kind: 'invites:mine', id: beto });
    queryClient.setQueryData<LeagueInvite[]>(key, [inv]);
    const res = await respondInvite(inv.id, true);
    expect(res).toEqual({ status: 'accepted', leagueId: lid, joined: true, playerId: expect.any(String), claimId: null });
    expect(queryClient.getQueryData<LeagueInvite[]>(key)).toEqual([]);
    expect(await fetchMyInvites()).toEqual([]);
    expect(await fetchMembership(lid, beto)).toMatchObject({ role: 'member', playerId: res.playerId });
    expect(await fetchInviteDetails(inv.id)).toMatchObject({ status: 'accepted', member: true, players: [] });
    // Otra vez (en otro teléfono o desde Avisos): cómo quedó, sin decir que entró ahora (ni jugador ni reclamo).
    expect(await respondInvite(inv.id, true)).toEqual({ status: 'accepted', leagueId: lid, joined: false, playerId: null, claimId: null });
    expect(await respondInvite(inv.id, false)).toMatchObject({ status: 'accepted', leagueId: lid, joined: false });
    // Solo la invitada la ve.
    await w.as('carla@x.com');
    expect(await fetchInviteDetails(inv.id)).toBeNull();
  });

  it('rechazar: no se le puede volver a invitar en 7 días', async () => {
    const inv = await inviteOf('carla@x.com');
    expect(await respondInvite(inv.id, false)).toEqual({ status: 'declined', leagueId: lid, joined: false, playerId: null, claimId: null });
    expect(await fetchMyInvites()).toEqual([]);
    await w.as('ana@x.com');
    const again = await sendInvites(lid, [carla]);
    expect(again).toEqual({ sent: 0, results: [{ userId: carla, status: 'declined' }] });
    expect(inviteResultSummary(again.results)).toBe('La rechazó hace poco. Prueba en unos días.');
  });

  it('aceptar diciendo quién es: queda el reclamo para el admin', async () => {
    const inv = await inviteOf('dani@x.com');
    const res = await respondInvite(inv.id, true, pedro);
    expect(res).toMatchObject({ status: 'accepted', leagueId: lid, joined: true, claimId: expect.any(String) });
    const [claim] = await q<{ player_id: string; status: string }>(`select player_id, status from public.player_claims where id = $1`, [res.claimId]);
    expect(claim).toEqual({ player_id: pedro, status: 'pending' });
  });

  it('quien invitó la retira', async () => {
    const inv = await inviteOf('eva@x.com');
    await w.as('beto@x.com');
    await expect(cancelInvite(inv.id, lid)).rejects.toMatchObject({ kind: 'permission' });
    await w.as('ana@x.com');
    await cancelInvite(inv.id, lid);
    // Ya retirada: nada.
    await cancelInvite(inv.id, lid);
    await w.as('eva@x.com');
    expect(await fetchMyInvites()).toEqual([]);
    expect(await fetchInviteDetails(inv.id)).toMatchObject({ status: 'cancelled', players: [] });
  });

  it('tiempo real: la invitación nueva llega sola a la cuenta invitada', async () => {
    const fede = await w.signUp('fede@x.com', 'Fede');
    const key = inviteKeys.mine(fede);
    const list = () => queryClient.getQueryData<LeagueInvite[]>(key) ?? null;
    const stop = queryClient.observe(key, fetchMyInvites, { tags: [inviteTags.mine], initial: [], persist: false }, () => undefined);
    const release = watchTopicFor(`user:${fede}`);
    try {
      await until(() => list()?.length === 0);
      // Lo que hace invite_to_league desde el teléfono de ana.
      await q(`insert into public.league_invites (league_id, user_id, invited_by) values ($1, $2, $3)`, [lid, fede, ana]);
      await until(() => list()?.length === 1);
      expect(list()?.[0]).toMatchObject({ leagueId: lid, invitedBy: { id: ana } });
    } finally {
      release();
      stop();
    }
  });
});
