/**
 * Organizador del lado del teléfono (20260929000600_organizador.sql): el listado de ligas públicas, el tope de ligas
 * nuevas por cuenta, los menores en todos los deportes y «Juntar con…». Lo puro sin base; lo demás contra PGlite con
 * las migraciones (la RLS y las RPC de verdad).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addManyMinors } from '../../components/players/data';
import { saveErrorMessage } from '../../components/feedback';
import { BackendError } from '../backend/types';
import { LEAGUE_QUOTA_CODE, createLeague, fetchPublicLeagues, leagueQuotaError, toPublicLeague, type LeagueInput } from './leagues';
import {
  createPlayer,
  fetchGuardians,
  fetchPlayers,
  mergeBlockText,
  mergeConflictList,
  mergeErrorText,
  mergePlayers,
  previewMergePlayers,
  setPlayerMinor,
} from './players';
import { openWorld, type TestWorld } from './testkit';

describe('ligas públicas (sin base)', () => {
  it('toPublicLeague: la forma de una liga, con lo que trae el listado', () => {
    expect(
      toPublicLeague({
        id: 'L1',
        name: 'Liga del Naco',
        sport: 'padel',
        kind: 'liga',
        venue: null,
        schedule: 'Martes 7 pm',
        members: 12,
        players: 24,
        activity: 9,
        nextEventAt: '2026-09-29T23:00:00.000Z',
        nextEventDate: '2026-09-29',
        lastActivityAt: '2026-09-27T01:00:00.000Z',
        seasonEnd: null,
        createdAt: '2026-08-01T12:00:00.000Z',
      }),
    ).toEqual({
      id: 'L1',
      name: 'Liga del Naco',
      kind: 'liga',
      visibility: 'public',
      ownerUid: '',
      venue: '',
      schedule: 'Martes 7 pm',
      seasonStart: '',
      seasonEnd: '',
      contactName: '',
      contactPhone: '',
      requirePhoto: false,
      sport: 'padel',
      hasMinors: false,
      createdAt: '2026-08-01T12:00:00.000Z',
      // Sin logoPath (una base de antes de 20260929001000_sueltos_logos.sql): sin logo.
      logoPath: null,
      members: 12,
      players: 24,
      activity: 9,
      nextEventAt: '2026-09-29T23:00:00.000Z',
      nextEventDate: '2026-09-29',
      lastActivityAt: '2026-09-27T01:00:00.000Z',
    });
  });

  it('toPublicLeague: con logo, la ruta del bucket logos', () => {
    const path = 'L1/0199a1b2-c3d4-7e5f-8a9b-000000000001.webp';
    expect(
      toPublicLeague({
        id: 'L1',
        name: 'Liga del Naco',
        sport: 'padel',
        kind: 'liga',
        logoPath: path,
        venue: null,
        schedule: null,
        members: null,
        players: null,
        activity: null,
        nextEventAt: null,
        nextEventDate: null,
        lastActivityAt: null,
        seasonEnd: null,
        createdAt: null,
      }),
    ).toMatchObject({ id: 'L1', logoPath: path });
  });

  it('el tope de ligas nuevas sale con sus números; los demás errores quedan igual', () => {
    const quota = leagueQuotaError(new BackendError('rate_limited', 'rate_limited', 'P0001'));
    expect(quota).toMatchObject({ kind: 'rate_limited', code: LEAGUE_QUOTA_CODE });
    expect(saveErrorMessage(quota)).toBe('Llegaste al tope de 5 ligas y torneos nuevos por día. Prueba mañana.');
    // El de 30 días puede tardar más de un día: no dice «prueba mañana».
    const month = leagueQuotaError(new BackendError('rate_limited: mes', 'rate_limited', 'P0001'));
    expect(month).toMatchObject({ kind: 'rate_limited', code: LEAGUE_QUOTA_CODE });
    expect(saveErrorMessage(month)).toBe(
      'Llegaste al tope de 20 ligas y torneos nuevos en 30 días. Cada uno deja de contar a los 30 días de creado: prueba más adelante.',
    );
    const other = new BackendError('invalido', 'validation', 'P0001');
    expect(leagueQuotaError(other)).toBe(other);
    expect(saveErrorMessage(new BackendError('rate_limited', 'rate_limited', 'P0001'))).toBe('Muy seguido: espera un momento e intenta de nuevo.');
  });
});

describe('juntar jugadores (sin base)', () => {
  it('lo que choca, en una lista y en palabras', () => {
    const e = new BackendError('conflicto: Juegos en el mismo evento (2), Partidos donde juegan los dos (1)', 'conflict', 'P0001');
    expect(mergeConflictList(e)).toEqual(['Juegos en el mismo evento (2)', 'Partidos donde juegan los dos (1)']);
    expect(mergeErrorText(e)).toBe(
      'No se pueden juntar porque los dos jugaron lo mismo: Juegos en el mismo evento (2), Partidos donde juegan los dos (1). Quita lo repetido y junta otra vez.',
    );
    expect(mergeConflictList(new Error('invalido'))).toBeNull();
  });

  it('los demás errores y por qué no se pueden juntar', () => {
    expect(mergeErrorText(new BackendError('invalido', 'validation', 'P0001'))).toBe(
      'Esos dos no se pueden juntar (los dos tienen cuenta, o uno es menor y el otro tiene cuenta).',
    );
    expect(mergeErrorText(new BackendError('no_permitido', 'permission', '42501'))).toBe('Solo el dueño o un admin de la liga puede juntar jugadores.');
    expect(mergeErrorText(new BackendError('no_existe', 'not_found', 'P0001'))).toBe('Uno de los dos ya no está en la liga.');
    expect(mergeErrorText(new BackendError('Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.', 'permission', 'bloqueada'))).toBe(
      'Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.',
    );
    expect(mergeErrorText(null)).toBe('No se pudo juntar. Prueba otra vez.');
    expect(mergeBlockText('dos_cuentas', 'Ana', 'Ana P.')).toBe('Ana y Ana P. tienen cuenta cada uno: son dos personas distintas y no se pueden juntar.');
    expect(mergeBlockText('menor_con_cuenta', 'Ana', 'Ana P.')).toBe('Uno es menor de edad y el otro tiene cuenta: un menor no puede quedar con una cuenta.');
    expect(mergeBlockText(null, 'Ana', 'Ana P.')).toBeNull();
  });
});

describe('organizador contra la base (PGlite con las migraciones)', () => {
  let w: TestWorld;
  let org: string;
  let ana: string;
  let today: string;
  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await w.b.db.query<T>(sql, params)).rows;

  /** Liga (con su dueño) viva: la temporada empezó hace 60 días y termina en 60. */
  async function league(name: string, extra: { sport?: string; visibility?: 'public' | 'private'; hasMinors?: boolean; venue?: string } = {}) {
    const [{ id }] = await q<{ id: string }>(
      `insert into public.leagues (sport, kind, visibility, name, owner_id, venue, schedule, season_start, season_end, contact_name, contact_phone,
                                   require_photo, has_minors)
       values ($1, 'liga', $2, $3, $4, $5, 'Martes 7 pm', $6::date - 60, $6::date + 60, 'Org', '18095550000', false, $7) returning id`,
      [extra.sport ?? 'bowling', extra.visibility ?? 'public', name, org, extra.venue ?? 'Bolera', today, !!extra.hasMinors],
    );
    await q(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'owner', 'org')`, [id, org]);
    return id;
  }
  const event = async (lid: string, date: string) =>
    (await q<{ id: string }>(`insert into public.events (league_id, type, name, date, games) values ($1, 'practica', '', $2, 3) returning id`, [lid, date]))[0]
      .id;
  const plus = async (n: number) =>
    (await q<{ d: string }>(`select ((now() at time zone 'America/Santo_Domingo')::date + $1::integer)::text as d`, [n]))[0].d;

  beforeAll(async () => {
    w = await openWorld();
    org = await w.signUp('org@x.com', 'org');
    ana = await w.signUp('ana@x.com', 'ana');
    today = await plus(0);
    await w.as('org@x.com');
  }, 120_000);

  afterAll(async () => {
    await w?.close();
  });

  it('el listado: públicas vivas y sin menores, las más activas primero, con la próxima fecha; busca y filtra por deporte', async () => {
    const quiet = await league('Liga Tranquila');
    const busy = await league('Liga del Naco', { venue: 'Club Naco' });
    const padel = await league('Pádel Norte', { sport: 'padel' });
    await league('Liga Privada', { visibility: 'private' });
    await league('Liga Infantil', { visibility: 'private', hasMinors: true });
    const ended = await league('Liga Vieja');
    await q(`update public.leagues set season_end = $2::date - 1 where id = $1`, [ended, today]);
    await event(busy, await plus(-3));
    await event(busy, await plus(-10));
    const next = await plus(2);
    await event(busy, next);
    for (const n of ['Ana', 'Luis', 'Carla']) await q(`insert into public.players (league_id, name) values ($1, $2)`, [busy, n]);

    await w.as('ana@x.com');
    const all = await fetchPublicLeagues();
    const mine = all.filter((l) => [quiet, busy, padel, ended].includes(l.id)).map((l) => l.id);
    expect(mine[0]).toBe(busy);
    expect(mine).toContain(quiet);
    expect(mine).toContain(padel);
    expect(mine).not.toContain(ended);
    expect(all.map((l) => l.name)).not.toContain('Liga Privada');
    expect(all.map((l) => l.name)).not.toContain('Liga Infantil');
    const b = all.find((l) => l.id === busy)!;
    // El dueño también juega: sus tres jugadores anotados más el suyo si lo tiene (aquí solo los tres).
    expect(b).toMatchObject({ name: 'Liga del Naco', sport: 'bowling', visibility: 'public', venue: 'Club Naco', members: 1, players: 3, nextEventDate: next });
    expect(b.activity).toBeGreaterThanOrEqual(2);
    expect(b.nextEventAt).toBeTruthy();

    expect((await fetchPublicLeagues({ query: '  NACO ' })).map((l) => l.id)).toEqual([busy]);
    expect((await fetchPublicLeagues({ sport: 'padel' })).map((l) => l.id)).toEqual([padel]);
    expect(await fetchPublicLeagues({ query: 'no existe ninguna así' })).toEqual([]);
    expect((await fetchPublicLeagues({ limit: 1 })).length).toBe(1);
    await w.as('org@x.com');
  });

  it('tope de ligas nuevas: la sexta del día falla con el mensaje con los números', async () => {
    await w.signUp('crea@x.com', 'Crea Mucho');
    const input: LeagueInput = {
      name: 'Liga',
      kind: 'liga',
      visibility: 'private',
      venue: '',
      schedule: '',
      seasonStart: '',
      seasonEnd: '',
      contactName: '',
      contactPhone: '',
      requirePhoto: false,
    };
    for (let i = 1; i <= 5; i++) await createLeague({ uid: '', name: '' }, { ...input, name: `Liga ${i}` });
    const err = await createLeague({ uid: '', name: '' }, { ...input, name: 'Liga 6' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendError);
    expect(err).toMatchObject({ code: LEAGUE_QUOTA_CODE, kind: 'rate_limited' });
    expect(saveErrorMessage(err)).toBe('Llegaste al tope de 5 ligas y torneos nuevos por día. Prueba mañana.');
    await w.as('org@x.com');
  });

  it('menores: con tutor y permiso (el teléfono sin espacios ni guiones); solo los admins leen el tutor', async () => {
    const kids = await league('Escuelita', { visibility: 'private', hasMinors: true, sport: 'football' });
    const pepe = await createPlayer(kids, 'Pepe', null, { guardianName: ' Marta Díaz ', guardianPhone: '(809) 555-1234', consent: true });
    const coach = await createPlayer(kids, 'Entrenador', null);
    expect(await q('select is_minor from public.players where id = $1', [pepe])).toEqual([{ is_minor: true }]);
    expect((await fetchGuardians(kids))[pepe]).toMatchObject({ guardianName: 'Marta Díaz', guardianPhone: '8095551234' });
    expect((await fetchGuardians(kids))[pepe].consentAt).toBeTruthy();
    expect((await fetchGuardians(kids))[coach]).toBeUndefined();

    // Sin permiso o sin tutor no entra; en una liga sin menores tampoco.
    await expect(createPlayer(kids, 'Sin permiso', null, { guardianName: 'Marta', consent: false })).rejects.toMatchObject({ kind: 'validation' });
    await expect(createPlayer(kids, 'Sin tutor', null, { guardianName: '  ', consent: true })).rejects.toMatchObject({ kind: 'validation' });
    const adults = await league('Liga de adultos');
    await expect(createPlayer(adults, 'Niño', null, { guardianName: 'Marta', consent: true })).rejects.toMatchObject({ kind: 'validation' });

    // Varios a la vez, cada uno con su tutor.
    const many = await addManyMinors(
      kids,
      [
        { name: 'Luisito', guardianName: 'Carlos', guardianPhone: '8095550000' },
        { name: 'Anita', guardianName: 'Rosa', guardianPhone: '' },
      ],
      true,
    );
    expect(many).toEqual({ added: 2, failed: [] });
    const list = await fetchPlayers(kids);
    expect(list.filter((p) => p.isMinor).map((p) => p.name)).toEqual(['Anita', 'Luisito', 'Pepe']);

    // Marcar después (y desmarcar) al entrenador.
    await setPlayerMinor(kids, coach, { guardianName: 'Su mamá', consent: true });
    expect((await fetchPlayers(kids)).find((p) => p.id === coach)?.isMinor).toBe(true);
    expect((await fetchGuardians(kids))[coach]).toMatchObject({ guardianName: 'Su mamá', guardianPhone: null });
    await setPlayerMinor(kids, coach, null);
    expect((await fetchPlayers(kids)).find((p) => p.id === coach)?.isMinor).toBe(false);

    // Un miembro que no es admin no ve los datos del tutor.
    await q(`insert into public.league_members (league_id, user_id, role, display_name) values ($1, $2, 'member', 'ana')`, [kids, ana]);
    await w.as('ana@x.com');
    expect(await fetchGuardians(kids)).toEqual({});
    await w.as('org@x.com');
  });

  it('juntar: el adelanto, la cuenta que pasa al que queda y lo que choca', async () => {
    const lid = await league('Liga de los repetidos');
    const [a1, a2] = await Promise.all([createPlayer(lid, 'Ana Pérez', null), createPlayer(lid, 'Ana P.', null)]);

    const pre = await previewMergePlayers(lid, a1, a2);
    expect(pre).toMatchObject({ canMerge: true, reason: null, conflicts: [], moveAccount: false, keep: { id: a1, name: 'Ana Pérez' }, drop: { id: a2 } });
    expect(await mergePlayers(lid, a1, a2)).toEqual({ playerId: a1, removedId: a2, userId: null });
    expect((await fetchPlayers(lid)).map((p) => p.name)).not.toContain('Ana P.');

    // Ana se une (juega con su propio jugador) y el admin la junta con la que ya tenía anotada: la cuenta pasa.
    await w.as('ana@x.com');
    const joined = await w.b.rpc<{ player_id: string }>('join_league', { p_league: lid, p_prefer: null });
    await w.as('org@x.com');
    const own = joined.player_id;
    expect((await previewMergePlayers(lid, a1, own)).moveAccount).toBe(true);
    expect(await mergePlayers(lid, a1, own)).toEqual({ playerId: a1, removedId: own, userId: ana });
    expect(await q('select user_id from public.players where id = $1', [a1])).toEqual([{ user_id: ana }]);

    // Los dos jugaron el mismo evento: el adelanto lo dice y juntar falla con la lista, sin cambiar nada.
    const [b1, b2] = await Promise.all([createPlayer(lid, 'Beto', null), createPlayer(lid, 'Alberto', null)]);
    const ev = await event(lid, today);
    for (const pid of [b1, b2]) {
      await q(`insert into public.entries (league_id, event_id, player_id, scores, photos) values ($1, $2, $3, '{150}', '{null}')`, [lid, ev, pid]);
    }
    const blocked = await previewMergePlayers(lid, b1, b2);
    expect(blocked.canMerge).toBe(false);
    expect(blocked.conflicts).toEqual([{ what: 'entries', label: 'Juegos en el mismo evento', count: 1 }]);
    const err = await mergePlayers(lid, b1, b2).catch((e: unknown) => e);
    expect(mergeConflictList(err)).toEqual(['Juegos en el mismo evento (1)']);
    expect(mergeErrorText(err)).toContain('Juegos en el mismo evento (1)');
    expect((await fetchPlayers(lid)).map((p) => p.id)).toContain(b2);

    // Los dos con cuenta: el adelanto lo dice y juntar no se puede.
    const [c] = await q<{ id: string }>(`insert into public.players (league_id, name, user_id) values ($1, 'Otra Ana', $2) returning id`, [lid, org]);
    const two = await previewMergePlayers(lid, a1, c.id);
    expect(two).toMatchObject({ canMerge: false, reason: 'dos_cuentas' });
    await expect(mergePlayers(lid, a1, c.id)).rejects.toMatchObject({ kind: 'validation' });
  });
});
