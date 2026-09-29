/**
 * Consola del superadmin (src/lib/data/admin.ts): de lo que manda la base a los tipos del contrato, páginas,
 * rutas de anuncios, el error de cuenta bloqueada, touch_seen una vez al día, y todo de punta a punta con la
 * base de verdad (PGlite con las migraciones y la RLS).
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BLOCKED_MESSAGE, isBlockedError, mapDbError, toBackendError } from '../backend/errors';
import {
  adminDeleteLeague,
  blockUser,
  countAnnouncementRecipients,
  FREE_DB_BYTES,
  FREE_STORAGE_BYTES,
  STORAGE_ALERT_PCT,
  fetchAdminAudit,
  fetchAdminLeagues,
  fetchAdminOverview,
  fetchAdminScanStats,
  fetchAdminSeries,
  fetchAdminStorageUsage,
  fetchAdminSystem,
  fetchAdminUser,
  fetchAdminUsers,
  isAnnouncementUrl,
  pageArgs,
  seenKey,
  sendAnnouncement,
  setSportStatus,
  setUserSuperadmin,
  toAdminAuditEntry,
  toAdminLeague,
  toAdminOverview,
  toAdminScanStats,
  toAdminSeries,
  toAdminStorageUsage,
  toAdminSystem,
  toAdminUser,
  toAdminUserDetail,
  toPage,
  touchSeenDaily,
  transferLeague,
  unblockUser,
  useAdminOverview,
  useAdminUser,
  type AdminUserDetail,
} from './admin';
import { queryClient, rpc } from './client';
import { keys } from './keys';
import { createLeague, joinLeague } from './leagues';
import { openWorld, type TestWorld } from './testkit';

describe('de la base a los tipos', () => {
  it('resumen: números aunque lleguen como texto, null donde no se sabe, sin romperse con lo que falta', () => {
    const o = toAdminOverview({
      generatedAt: '2026-09-27T12:00:00.000Z',
      users: { total: '12', new7d: 3, active7d: null, superadmins: 1 },
      leagues: { total: 2, bySport: [{ sport: 'bowling', leagues: 2, players: '7', active7d: 1 }, null] },
      storage: { dbBytes: '1048576', photosBytes: null, photos: 4 },
      scan: { today: 5, dailyLimit: 900, perUserLimit: 40 },
    });
    expect(o).toEqual({
      generatedAt: '2026-09-27T12:00:00.000Z',
      users: { total: 12, new7d: 3, new30d: 0, active7d: 0, active30d: 0, superadmins: 1, blocked: 0, unconfirmed: 0 },
      leagues: {
        total: 2,
        public: 0,
        private: 0,
        tournaments: 0,
        withMinors: 0,
        new30d: 0,
        active7d: 0,
        bySport: [
          { sport: 'bowling', leagues: 2, players: 7, active7d: 1 },
          { sport: '', leagues: 0, players: 0, active7d: 0 },
        ],
      },
      activity: { events7d: 0, matches7d: 0, entries7d: 0, submissionsPending: 0, photos7d: 0 },
      storage: { dbBytes: 1048576, photosBytes: null, photos: 4 },
      scan: { today: 5, dailyLimit: 900, perUserLimit: 40 },
      push: { subscriptions: 0, queued: 0, sent24h: 0, failed24h: 0 },
    });
    expect(toAdminOverview(null)).toBeNull();
    expect(toAdminOverview('x')).toBeNull();
  });

  it('serie, cuentas, ligas y auditoría: tipos del contrato y valores conocidos', () => {
    expect(toAdminSeries([{ day: '2026-09-27', signups: 2, activeUsers: '3' }, 'x'])).toEqual([
      { day: '2026-09-27', signups: 2, activeUsers: 3, events: 0, matches: 0, entries: 0, scans: 0 },
      { day: '', signups: 0, activeUsers: 0, events: 0, matches: 0, entries: 0, scans: 0 },
    ]);
    expect(toAdminSeries(null)).toEqual([]);

    const user = toAdminUser({ id: 'u1', name: 'Ana', createdAt: '2026-01-01T00:00:00.000Z', confirmed: true, superadmin: 'true', leagues: 2 });
    expect(user).toEqual({
      id: 'u1',
      email: null,
      name: 'Ana',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: null,
      lastSignInAt: null,
      confirmed: true,
      provider: null,
      superadmin: true,
      blockedAt: null,
      blockedReason: null,
      leagues: 2,
      ownedLeagues: 0,
    });
    const detail = toAdminUserDetail({ id: 'u1', memberships: [{ leagueId: 'L', leagueName: 'Liga', sport: 'padel', kind: 'raro', role: 'owner', scorer: true }], adult: true });
    expect(detail?.memberships).toEqual([{ leagueId: 'L', leagueName: 'Liga', sport: 'padel', kind: 'liga', role: 'owner', scorer: true, joinedAt: null }]);
    expect(detail).toMatchObject({ pushDevices: 0, scansToday: 0, adult: true });
    expect(toAdminUserDetail(null)).toBeNull();

    expect(toAdminLeague({ id: 'L', kind: 'torneo', visibility: 'public', ownerName: null, members: '4' })).toMatchObject({
      kind: 'torneo',
      visibility: 'public',
      ownerName: '',
      ownerEmail: null,
      members: 4,
      lastActivityAt: null,
    });
    expect(toAdminLeague({ visibility: 'secreta' }).visibility).toBe('private');

    expect(toAdminAuditEntry({ id: '7', at: 'x', action: 'announce', targetType: 'raro', detail: [1] })).toEqual({
      id: 7,
      at: 'x',
      actorId: null,
      actorName: null,
      action: 'announce',
      targetType: 'app',
      targetId: null,
      detail: {},
    });
    // El total nunca es menor que las filas que llegaron.
    expect(toPage({ rows: [{ id: 'a' }], total: 0 }, toAdminUser).total).toBe(1);
    expect(toPage(null, toAdminUser)).toEqual({ rows: [], total: 0 });
  });

  it('sistema y lecturas de fotos: null donde el backend no lo tiene; el modo lo pone la app', () => {
    const s = toAdminSystem(
      {
        backend: 'supabase',
        migrations: [{ version: '20260927001100', name: 'consola' }],
        cron: null,
        push: { queued: '2' },
        sportStatus: [{ sport: 'padel', status: 'raro', leagues: 1 }],
      },
      'local',
    );
    expect(s).toEqual({
      backend: 'local',
      migrations: [{ version: '20260927001100', name: 'consola' }],
      lastHeartbeat: null,
      cron: null,
      push: { queued: 2, claimed: 0, failed24h: 0, oldestQueuedAt: null },
      sportStatus: [{ sport: 'padel', status: 'beta', leagues: 1 }],
    });
    expect(toAdminSystem({ backend: 'supabase' })?.backend).toBe('supabase');
    expect(toAdminSystem(null)).toBeNull();
    expect(toAdminScanStats({ days: [{ day: 'd', scans: 1 }], topUsers: [{ userId: 'u', name: null, scans: '3' }] })).toEqual({
      days: [{ day: 'd', scans: 1 }],
      models: [],
      topUsers: [{ userId: 'u', name: '', email: null, scans: 3 }],
      today: 0,
      dailyLimit: 0,
      perUserLimit: 0,
    });
  });

  it('espacio del plan gratis: números aunque lleguen como texto; sin topes, los del plan; sin porcentaje, de los bytes', () => {
    expect(
      toAdminStorageUsage({
        dbBytes: '52428800',
        dbLimit: 524288000,
        storageBytes: 805306368,
        storageLimit: '1073741824',
        dbPct: 10,
        storagePct: '75.0',
        lastAlertAt: '2026-09-27T12:00:00.000Z',
        purgePending: '4',
      }),
    ).toEqual({
      dbBytes: 52428800,
      dbLimit: 524288000,
      storageBytes: 805306368,
      storageLimit: 1073741824,
      dbPct: 10,
      storagePct: 75,
      lastAlertAt: '2026-09-27T12:00:00.000Z',
      purgePending: 4,
    });
    expect(toAdminStorageUsage({ dbBytes: 393216000, storageBytes: -5, dbPct: null, storagePct: 'x' })).toEqual({
      dbBytes: 393216000,
      dbLimit: FREE_DB_BYTES,
      storageBytes: 0,
      storageLimit: FREE_STORAGE_BYTES,
      dbPct: 75,
      storagePct: 0,
      lastAlertAt: null,
      purgePending: 0,
    });
    expect(toAdminStorageUsage(null)).toBeNull();
    expect(STORAGE_ALERT_PCT).toBe(70);
  });
});

describe('páginas y anuncios', () => {
  it('página desde 0 → límite y desde dónde (1–100)', () => {
    expect(pageArgs(0, 25)).toEqual({ p_limit: 25, p_offset: 0 });
    expect(pageArgs(2, 25)).toEqual({ p_limit: 25, p_offset: 50 });
    expect(pageArgs(-1, 500)).toEqual({ p_limit: 100, p_offset: 0 });
    expect(pageArgs(1.7, 0)).toEqual({ p_limit: 1, p_offset: 1 });
    expect(pageArgs(Number.NaN, Number.NaN)).toEqual({ p_limit: 25, p_offset: 0 });
  });

  it('ruta del anuncio: solo dentro de la app (igual que la base)', () => {
    for (const ok of ['', undefined, null, '/', '/l/abc', '/l/abc/e/1?x=1#y', '  /cuenta  ']) expect(isAnnouncementUrl(ok), String(ok)).toBe(true);
    for (const bad of ['https://otro.com', '//otro.com', '/\\otro.com', 'l/abc', '/l/a b', `/${'x'.repeat(200)}`, '/a\u0000b']) {
      expect(isAnnouncementUrl(bad), bad).toBe(false);
    }
  });
});

describe('cuenta bloqueada', () => {
  it("'bloqueada' (42501) sale en español, como permiso, con su código", () => {
    for (const code of ['42501', 'P0001']) {
      const e = mapDbError({ code, message: 'bloqueada' });
      expect(e).toMatchObject({ kind: 'permission', code: 'bloqueada', message: BLOCKED_MESSAGE, retryable: false });
      expect(isBlockedError(e)).toBe(true);
    }
    expect(BLOCKED_MESSAGE).toBe('Tu cuenta está bloqueada. Escríbele al equipo de MatchMate.');
    // PGlite trae el error con `code`; PostgREST con 403 y el cuerpo.
    expect(toBackendError(Object.assign(new Error('bloqueada'), { code: '42501' })).message).toBe(BLOCKED_MESSAGE);
    expect(mapDbError({ message: 'bloqueada', status: 403 }).code).toBe('bloqueada');
    // Lo demás sigue igual.
    expect(mapDbError({ code: '42501', message: 'no_permitido' })).toMatchObject({ kind: 'permission', code: '42501', message: 'no_permitido' });
    expect(isBlockedError(mapDbError({ code: '42501', message: 'no_permitido' }))).toBe(false);
    expect(isBlockedError(null)).toBe(false);
  });
});

describe('hooks', () => {
  it('sin permiso no piden nada; las horas se quedan como texto (no Stamp)', () => {
    const seen: unknown[] = [];
    const detail = { id: 'u9', name: 'Ana', createdAt: '2026-01-01T00:00:00.000Z', memberships: [] } as unknown as AdminUserDetail;
    queryClient.setQueryData(keys.adminUser('u9'), detail);
    function Screen() {
      seen.push(useAdminOverview(false));
      seen.push(useAdminUser(null));
      seen.push(useAdminUser('u9'));
      return null;
    }
    renderToString(createElement(Screen));
    expect(seen[0]).toEqual({ data: null, loading: false, error: null });
    expect(seen[1]).toEqual({ data: null, loading: false, error: null });
    expect(seen[2]).toEqual({ data: detail, loading: false, error: null });
    expect(typeof (seen[2] as { data: AdminUserDetail }).data.createdAt).toBe('string');
  });
});

describe('con la base de verdad', () => {
  let w: TestWorld;
  let jefe: string;
  let ana: string;
  let beto: string;
  let lid: string;

  const leagueInput = { name: 'Liga de Ana', kind: 'liga' as const, visibility: 'public' as const, venue: '', schedule: '', seasonStart: '', seasonEnd: '', contactName: '', contactPhone: '', requirePhoto: false };

  beforeAll(async () => {
    w = await openWorld();
    jefe = await w.signUp('jefe@x.com', 'Jefe');
    await w.makeSuper(jefe);
    beto = await w.signUp('beto@x.com', 'Beto');
    ana = await w.signUp('ana@x.com', 'Ana');
    lid = await createLeague({ uid: ana, name: 'Ana' }, leagueInput);
    await w.as('beto@x.com');
    await joinLeague(lid, { uid: beto, name: 'Beto' }, null);
  }, 120_000);

  afterAll(async () => {
    await w.close();
  });

  it('touch_seen: una vez al día por teléfono y cuenta; sin señal se intenta la próxima vez', async () => {
    await w.as('ana@x.com');
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const day1 = new Date(2026, 8, 27, 10);
    expect(await touchSeenDaily(ana, { storage, now: day1 })).toBe(true);
    expect(store.get(seenKey(ana))).toBe('2026-09-27');
    expect(seenKey(ana)).toBe(`mm:visto:${ana}`);
    expect(await touchSeenDaily(ana, { storage, now: new Date(2026, 8, 27, 23) })).toBe(false);
    expect(await touchSeenDaily(ana, { storage, now: new Date(2026, 8, 28, 1) })).toBe(true);
    const { rows } = await w.b.db.query<{ seen: boolean; days: number }>(
      `select last_seen_at is not null as seen, (select count(*)::int from private.daily_seen where user_id = $1) as days from public.profiles where id = $1`,
      [ana],
    );
    expect(rows).toEqual([{ seen: true, days: 1 }]);
    // Almacenamiento roto: avisa igual y no lanza.
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(await touchSeenDaily(ana, { storage: broken, now: day1 })).toBe(true);
  });

  it('quien no es superadmin no ve nada de la consola', async () => {
    await w.as('ana@x.com');
    await expect(fetchAdminOverview()).rejects.toMatchObject({ kind: 'permission' });
    await expect(fetchAdminUsers({ page: 0, pageSize: 10 })).rejects.toMatchObject({ kind: 'permission' });
    await expect(fetchAdminStorageUsage()).rejects.toMatchObject({ kind: 'permission' });
    await expect(blockUser(beto, 'x')).rejects.toMatchObject({ kind: 'permission' });
  });

  it('lecturas: resumen, series, cuentas (con páginas), detalle, ligas, sistema y fotos', async () => {
    await w.as('jefe@x.com');
    const o = await fetchAdminOverview();
    expect(o?.users).toMatchObject({ total: 3, superadmins: 1, blocked: 0, active7d: 1 });
    expect(o?.leagues).toMatchObject({ total: 1, public: 1 });
    expect(o?.generatedAt).toMatch(/Z$/);

    const series = await fetchAdminSeries(30);
    expect(series).toHaveLength(30);
    expect(series.at(-1)).toMatchObject({ signups: 3, activeUsers: 1 });

    const p0 = await fetchAdminUsers({ page: 0, pageSize: 2 });
    const p1 = await fetchAdminUsers({ page: 1, pageSize: 2 });
    expect([p0.total, p0.rows.length, p1.rows.length]).toEqual([3, 2, 1]);
    expect(new Set([...p0.rows, ...p1.rows].map((u) => u.id))).toEqual(new Set([jefe, ana, beto]));
    expect((await fetchAdminUsers({ search: '  ANA@ ', page: 0, pageSize: 10 })).rows.map((u) => u.name)).toEqual(['Ana']);
    expect((await fetchAdminUsers({ filter: 'super', page: 0, pageSize: 10 })).rows.map((u) => u.id)).toEqual([jefe]);

    const d = await fetchAdminUser(ana);
    expect(d).toMatchObject({ id: ana, email: 'ana@x.com', ownedLeagues: 1, leagues: 1, pushDevices: 0 });
    expect(d?.memberships).toEqual([expect.objectContaining({ leagueId: lid, leagueName: 'Liga de Ana', sport: 'bowling', kind: 'liga', role: 'owner' })]);
    expect(typeof d?.createdAt).toBe('string');

    const leagues = await fetchAdminLeagues({ sort: 'members', page: 0, pageSize: 10 });
    expect(leagues.total).toBe(1);
    expect(leagues.rows[0]).toMatchObject({ id: lid, ownerId: ana, ownerName: 'Ana', ownerEmail: 'ana@x.com', members: 2, players: 2 });
    expect((await fetchAdminLeagues({ kind: 'torneo', page: 0, pageSize: 10 })).total).toBe(0);

    const sys = await fetchAdminSystem();
    expect(sys).toMatchObject({ backend: 'local', migrations: null, cron: null });

    // Espacio: en local no hay Storage (0) y la base sí se mide; sin alertas ni fotos por quitar.
    const usage = await fetchAdminStorageUsage();
    expect(usage).toMatchObject({ dbLimit: FREE_DB_BYTES, storageBytes: 0, storageLimit: FREE_STORAGE_BYTES, storagePct: 0, lastAlertAt: null, purgePending: 0 });
    expect(usage!.dbBytes).toBeGreaterThanOrEqual(0);
    expect(usage!.dbPct).toBeCloseTo(Math.round((usage!.dbBytes * 1000) / FREE_DB_BYTES) / 10, 5);
    expect(sys?.sportStatus.find((s) => s.sport === 'bowling')).toEqual({ sport: 'bowling', status: 'open', leagues: 1 });

    const scan = await fetchAdminScanStats(30);
    expect(scan).toMatchObject({ today: 0, dailyLimit: 900, perUserLimit: 40, models: [], topUsers: [] });
    expect(scan?.days).toHaveLength(30);
  });

  it('acciones: bloquear (la cuenta ve el mensaje), desbloquear, deporte, superadmin, anuncio, traspasar y borrar; todo en la auditoría', async () => {
    await w.as('jefe@x.com');
    await blockUser(beto, '  spam  ');
    expect((await fetchAdminUser(beto))?.blockedReason).toBe('spam');
    await w.as('beto@x.com');
    const err = await rpc('rename_profile', { p_name: 'Beto 2' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'permission', code: 'bloqueada', message: BLOCKED_MESSAGE });
    expect(isBlockedError(err)).toBe(true);
    await w.as('jefe@x.com');
    await unblockUser(beto);
    await w.as('beto@x.com');
    await rpc('rename_profile', { p_name: 'Beto' });

    await w.as('jefe@x.com');
    // Todos los deportes están abiertos (20260929000300_sueltos_logos.sql): el superadmin pone uno en beta y lo abre.
    await setSportStatus('padel', 'beta');
    expect((await fetchAdminSystem())?.sportStatus.find((s) => s.sport === 'padel')?.status).toBe('beta');
    await setSportStatus('padel', 'open');
    await setUserSuperadmin(beto, true);
    expect((await fetchAdminUser(beto))?.superadmin).toBe(true);
    await setUserSuperadmin(beto, false);

    expect(await countAnnouncementRecipients({ kind: 'all' })).toBe(0);
    await w.b.db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://fcm.googleapis.com/fcm/send/ana', 'k', 'a')`, [ana]);
    expect(await countAnnouncementRecipients({ kind: 'league', leagueId: lid })).toBe(1);
    expect(await countAnnouncementRecipients({ kind: 'sport', sport: 'padel' })).toBe(0);
    expect(await sendAnnouncement({ title: ' Hola ', body: 'Ya hay pádel.', audience: { kind: 'admins' } })).toEqual({ recipients: 1 });
    await expect(sendAnnouncement({ title: 'x', body: 'y', url: 'https://otro.com', audience: { kind: 'all' } })).rejects.toMatchObject({ kind: 'validation' });
    const { rows: outbox } = await w.b.db.query<{ title: string; url: string }>('select title, url from public.push_outbox');
    expect(outbox).toEqual([{ title: 'Hola', url: '/' }]);

    await transferLeague(lid, beto);
    expect((await fetchAdminLeagues({ page: 0, pageSize: 10 })).rows[0]).toMatchObject({ ownerId: beto, ownerName: 'Beto' });
    await adminDeleteLeague(lid);
    expect((await fetchAdminLeagues({ page: 0, pageSize: 10 })).total).toBe(0);

    const log = await fetchAdminAudit({ page: 0, pageSize: 100 });
    expect(log.rows.map((r) => r.action)).toEqual([
      'delete_league',
      'transfer_league',
      'announce',
      'set_superadmin',
      'set_superadmin',
      'set_sport_status',
      'set_sport_status',
      'unblock_user',
      'block_user',
    ]);
    expect(log.rows.every((r) => r.actorId === jefe && r.actorName === 'Jefe')).toBe(true);
    expect((await fetchAdminAudit({ action: 'set_sport_status', page: 1, pageSize: 1 })).rows.map((r) => r.detail)).toEqual([{ from: 'open', to: 'beta' }]);
  });
});
