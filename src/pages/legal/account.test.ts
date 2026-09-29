/**
 * La cuenta y sus datos desde la app (src/pages/legal/account.ts, la marca de 18 años de auth.tsx y aceptar los
 * términos de src/lib/data/legal.ts): de lo que manda la base al plan de borrado, los mensajes, y de punta a punta
 * con la base de verdad y el borrado del modo local (el manejador `delete-account` de src/lib/backend/local.ts).
 */
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BLOCKED_MESSAGE } from '../../lib/backend/errors';
import { BackendError } from '../../lib/backend/types';
import { confirmAdult, fetchProfile, rememberAdultForGoogle, takeAdultPending } from '../../lib/auth';
import { transferLeague } from '../../lib/data/admin';
import { backend, rpc } from '../../lib/data/client';
import { acceptLegal, fetchLegalAccepted, isLegalVersionMismatch, legalErrorMessage, legalMismatchText } from '../../lib/data/legal';
import { createLeague, joinLeague } from '../../lib/data/leagues';
import { reportContent } from '../../lib/data/reports';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../lib/legal';
import { openWorld, type TestWorld } from '../../lib/data/testkit';
import { accountErrorMessage, deleteMyAccount, DELETE_WORD, fetchDeletePlan, fetchMyData, myDataFileName, toDeletePlan } from './account';

describe('de la base al plan', () => {
  it('lee lo que manda prepare_delete_account sin romperse', () => {
    const plan = toDeletePlan({
      canDelete: false,
      blockers: ['owned_leagues', 'raro'],
      ownedLeagues: [
        { id: 'l1', name: 'Liga', sport: 'padel', kind: 'torneo', memberCount: '1', members: [{ userId: 'u2', name: 'Beto', role: 'admin' }, { name: 'sin id' }] },
        null,
      ],
      summary: { leagues: '2', players: 1 },
    });
    expect(plan).toEqual({
      canDelete: false,
      blockers: ['owned_leagues'],
      ownedLeagues: [
        { id: 'l1', name: 'Liga', sport: 'padel', kind: 'torneo', memberCount: 2, members: [{ userId: 'u2', name: 'Beto', role: 'admin' }] },
        { id: '', name: '', sport: '', kind: 'liga', memberCount: 0, members: [] },
      ],
      summary: { leagues: 2, players: 1, comments: 0, reactions: 0, devices: 0 },
    });
    // «Se puede» solo con la marca de la base y sin nada pendiente.
    expect(toDeletePlan({ canDelete: true, blockers: [], ownedLeagues: [] }).canDelete).toBe(true);
    expect(toDeletePlan({ canDelete: true, blockers: ['last_superadmin'] }).canDelete).toBe(false);
    expect(toDeletePlan({ canDelete: true, ownedLeagues: [{ id: 'x' }] }).canDelete).toBe(false);
    expect(toDeletePlan(null)).toMatchObject({ canDelete: false, blockers: [], ownedLeagues: [] });
  });

  it('nombre del archivo y mensajes en palabras sencillas', () => {
    expect(myDataFileName(new Date(2026, 8, 5, 10))).toBe('matchmate-mis-datos-2026-09-05.json');
    expect(DELETE_WORD).toBe('BORRAR');
    expect(accountErrorMessage(new BackendError('Primero pasa…', 'conflict', 'tiene_ligas'))).toBe('Primero pasa…');
    expect(accountErrorMessage(new BackendError('El borrado de cuentas no está configurado', 'network', 'config'))).toBe('El borrado de cuentas no está configurado');
    expect(accountErrorMessage(new BackendError(BLOCKED_MESSAGE, 'permission', 'bloqueada'))).toBe(BLOCKED_MESSAGE);
    expect(accountErrorMessage(new BackendError('rate_limited', 'rate_limited', 'P0001'))).toMatch(/varias veces/);
    expect(accountErrorMessage(new BackendError('Failed to fetch', 'network'))).toMatch(/Sin conexión/);
    expect(accountErrorMessage(new Error('x'))).toBe('No se pudo completar. Intenta de nuevo.');
  });

  it('registro con Google: la casilla marcada antes de ir vale una vez, por 1 hora y solo para la cuenta nueva', () => {
    const store = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    // La cuenta que crea la base al volver de Google (un minuto después de marcar la casilla).
    const fresh = new Date(1_000 + 60_000).toISOString();
    expect(takeAdultPending(fresh)).toBe(false);
    rememberAdultForGoogle(1_000);
    expect(takeAdultPending(fresh, 1_000 + 59 * 60_000)).toBe(true);
    expect(takeAdultPending(fresh, 1_000 + 60_000)).toBe(false);
    rememberAdultForGoogle(1_000);
    expect(takeAdultPending(fresh, 1_000 + 61 * 60_000)).toBe(false);
    // Otra cuenta que ya existía (entra otra persona en el mismo teléfono): no, y la marca se gasta.
    rememberAdultForGoogle(Date.parse('2026-09-29T12:00:00Z'));
    expect(takeAdultPending('2026-01-01T00:00:00.000Z', Date.parse('2026-09-29T12:10:00Z'))).toBe(false);
    expect(takeAdultPending('2026-09-29T12:01:00.000Z', Date.parse('2026-09-29T12:10:00Z'))).toBe(false);
  });
});

describe('con la base de verdad', () => {
  let w: TestWorld;
  let ana: string;
  let beto: string;
  let lid: string;
  const leagueInput = { name: 'Liga de Ana', kind: 'liga' as const, visibility: 'public' as const, venue: '', schedule: '', seasonStart: '', seasonEnd: '', contactName: '', contactPhone: '', requirePhoto: false };

  beforeAll(async () => {
    w = await openWorld();
    beto = await w.signUp('beto@x.com', 'Beto');
    ana = await w.signUp('ana@x.com', 'Ana');
    lid = await createLeague({ uid: ana, name: 'Ana' }, leagueInput);
    await w.as('beto@x.com');
    await joinLeague(lid, { uid: beto, name: 'Beto' }, null);
  }, 120_000);

  afterAll(async () => {
    await w.close();
  });

  it('«tengo 18 años o más»: el perfil trae la marca y confirmarla la guarda una vez', async () => {
    await w.as('beto@x.com');
    expect((await fetchProfile(beto))?.adultConfirmedAt).toBeNull();
    await confirmAdult(beto);
    const at = (await fetchProfile(beto))?.adultConfirmedAt;
    expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await confirmAdult(beto);
    expect((await fetchProfile(beto))?.adultConfirmedAt).toBe(at);
  });

  it('términos: si la base tiene otras versiones la app lo reconoce (LegalGate deja seguir); con las vigentes se guarda', async () => {
    await w.as('beto@x.com');
    // Como si la app se hubiera publicado antes que la migración: la base no conoce estas fechas.
    const err = await rpc('accept_legal', { p_terms: '2099-01-01', p_privacy: '2099-01-01' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isLegalVersionMismatch(err)).toBe(true);
    expect(legalMismatchText()).toContain(`términos ${TERMS_VERSION}, privacidad ${PRIVACY_VERSION}`);
    // Lo demás no se confunde con eso y sale en palabras simples.
    for (const e of [new BackendError(BLOCKED_MESSAGE, 'permission', 'bloqueada'), new BackendError('Failed to fetch', 'network'), new Error('x')]) {
      expect(isLegalVersionMismatch(e)).toBe(false);
    }
    expect(legalErrorMessage(new BackendError('Failed to fetch', 'network'))).toMatch(/Sin conexión/);
    expect(legalErrorMessage(new BackendError(BLOCKED_MESSAGE, 'permission', 'bloqueada'))).toBe(BLOCKED_MESSAGE);
    expect(await fetchLegalAccepted(beto)).toEqual({ terms: null, privacy: null });
    await acceptLegal(beto);
    expect(await fetchLegalAccepted(beto)).toEqual({ terms: TERMS_VERSION, privacy: PRIVACY_VERSION });
  });

  it('bajar mis datos: su cuenta, sus ligas, su jugador y sus reportes', async () => {
    await w.as('beto@x.com');
    expect((await fetchMyData()).reports).toEqual([]);
    const rid = await reportContent({ kind: 'league', targetId: lid, reason: 'spam', note: 'Solo anuncios' });
    const d = await fetchMyData();
    expect(d.format).toBe('matchmate-mis-datos');
    expect(d.account).toMatchObject({ id: beto, email: 'beto@x.com' });
    expect((d.leagues as { leagueId: string }[]).map((l) => l.leagueId)).toEqual([lid]);
    expect(d.players).toHaveLength(1);
    // Los reportes no tienen user_id (export_my_data no los ve): los trae my_reports, sin quién los atendió.
    expect(d.reports).toEqual([expect.objectContaining({ id: rid, kind: 'league', targetId: lid, reason: 'spam', note: 'Solo anuncios', status: 'open' })]);
    expect(JSON.stringify(d.reports)).not.toMatch(/handledBy|reporter|targetOwner/);
  });

  it('borrar: la dueña primero pasa su liga; sin la palabra no se borra; después sí y se cierra la sesión', async () => {
    await w.as('ana@x.com');
    const plan = await fetchDeletePlan();
    expect(plan.canDelete).toBe(false);
    expect(plan.ownedLeagues).toEqual([expect.objectContaining({ id: lid, name: 'Liga de Ana', memberCount: 1, members: [{ userId: beto, name: 'Beto', role: 'member' }] })]);
    // La Edge Function (aquí, el manejador local) revisa lo mismo.
    await expect(deleteMyAccount(ana)).rejects.toMatchObject({ kind: 'conflict', code: 'tiene_ligas' });
    await expect(backend().invoke('delete-account', { confirm: 'si' })).rejects.toMatchObject({ kind: 'validation', code: 'invalido' });

    await transferLeague(lid, beto);
    expect((await fetchDeletePlan()).canDelete).toBe(true);
    const events: string[] = [];
    const off = backend().auth.onChange((e) => events.push(e));
    await deleteMyAccount(ana);
    off();
    expect(events).toContain('SIGNED_OUT');
    expect(await backend().auth.getSession()).toBeNull();
    const { rows } = await w.b.db.query<{ n: number; owner: string }>(
      `select (select count(*)::int from public.profiles where id = $1) as n, (select owner_id::text from public.leagues where id = $2) as owner`,
      [ana, lid],
    );
    expect(rows).toEqual([{ n: 0, owner: beto }]);
    // Sin sesión ya no se puede.
    await expect(backend().invoke('delete-account', { confirm: DELETE_WORD })).rejects.toMatchObject({ kind: 'auth', code: 'sesion' });
  });
});
