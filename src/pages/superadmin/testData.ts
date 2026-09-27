/**
 * Datos de prueba de la consola (resumen, series, cuentas, ligas…) para las pruebas de las funciones y de
 * las pantallas. No es un archivo de prueba: lo importan los *.test.ts.
 */
import type {
  AdminAuditEntry,
  AdminLeague,
  AdminOverview,
  AdminScanStats,
  AdminSeriesPoint,
  AdminSystem,
  AdminUser,
  AdminUserDetail,
} from '../../lib/data/admin';
import { MB } from './format';

export const NOW = Date.parse('2026-09-27T15:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

export function overview(patch: { [K in keyof AdminOverview]?: Partial<AdminOverview[K]> } = {}): AdminOverview {
  const base: AdminOverview = {
    generatedAt: daysAgo(0),
    users: { total: 1240, new7d: 35, new30d: 120, active7d: 410, active30d: 780, superadmins: 2, blocked: 0, unconfirmed: 14 },
    leagues: {
      total: 64,
      public: 40,
      private: 24,
      tournaments: 12,
      withMinors: 5,
      new30d: 9,
      active7d: 31,
      bySport: [
        { sport: 'bowling', leagues: 30, players: 620, active7d: 18 },
        { sport: 'padel', leagues: 20, players: 310, active7d: 9 },
        { sport: 'basketball', leagues: 14, players: 200, active7d: 4 },
      ],
    },
    activity: { events7d: 48, matches7d: 130, entries7d: 900, submissionsPending: 6, photos7d: 210 },
    storage: { dbBytes: 120 * MB, photosBytes: 300 * MB, photos: 4200 },
    scan: { today: 40, dailyLimit: 500, perUserLimit: 20 },
    push: { subscriptions: 530, queued: 3, sent24h: 800, failed24h: 0 },
  };
  const out = { ...base } as AdminOverview;
  for (const k of Object.keys(patch) as (keyof AdminOverview)[]) {
    const v = patch[k];
    if (v && typeof v === 'object') (out as unknown as Record<string, unknown>)[k] = { ...(base[k] as object), ...(v as object) };
  }
  return out;
}

/** Serie de `days` días que termina hoy; `f(i)` da el valor del día i (0 = el más viejo). */
export function series(days: number, f: (i: number) => number = (i) => i): AdminSeriesPoint[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(NOW - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const v = f(i);
    return { day: d, signups: v, activeUsers: v * 3, events: v, matches: v * 2, entries: v * 5, scans: v };
  });
}

export const users: AdminUser[] = [
  {
    id: 'u-me',
    email: 'yo@matchmate.do',
    name: 'Randy Dueño',
    createdAt: daysAgo(300),
    lastSeenAt: daysAgo(0),
    lastSignInAt: daysAgo(1),
    confirmed: true,
    provider: 'google',
    superadmin: true,
    blockedAt: null,
    blockedReason: null,
    leagues: 3,
    ownedLeagues: 2,
  },
  {
    id: 'u-ana',
    email: 'ana@correo.do',
    name: 'Ana Pérez',
    createdAt: daysAgo(40),
    lastSeenAt: daysAgo(2),
    lastSignInAt: daysAgo(2),
    confirmed: true,
    provider: 'email',
    superadmin: false,
    blockedAt: null,
    blockedReason: null,
    leagues: 1,
    ownedLeagues: 0,
  },
  {
    id: 'u-luis',
    email: '=HYPERLINK("x")',
    name: 'Luis "El Tigre", Soto',
    createdAt: daysAgo(90),
    lastSeenAt: daysAgo(60),
    lastSignInAt: null,
    confirmed: false,
    provider: null,
    superadmin: false,
    blockedAt: daysAgo(5),
    blockedReason: 'Anotaciones falsas',
    leagues: 0,
    ownedLeagues: 0,
  },
];

export const userDetail: AdminUserDetail = {
  ...users[1],
  memberships: [
    { leagueId: 'l1', leagueName: 'Liga del Martes', sport: 'bowling', kind: 'liga', role: 'admin', scorer: false, joinedAt: daysAgo(40) },
    { leagueId: 'l2', leagueName: 'Copa Pádel', sport: 'padel', kind: 'torneo', role: 'member', scorer: true, joinedAt: daysAgo(10) },
  ],
  pushDevices: 2,
  scansToday: 3,
  adult: true,
};

export const leagues: AdminLeague[] = [
  {
    id: 'l1',
    name: 'Liga del Martes',
    sport: 'bowling',
    kind: 'liga',
    visibility: 'public',
    hasMinors: true,
    ownerId: 'u-me',
    ownerName: 'Randy Dueño',
    ownerEmail: 'yo@matchmate.do',
    members: 24,
    players: 30,
    events: 18,
    lastActivityAt: daysAgo(1),
    createdAt: daysAgo(200),
  },
  {
    id: 'l2',
    name: 'Copa Pádel',
    sport: 'padel',
    kind: 'torneo',
    visibility: 'private',
    hasMinors: false,
    ownerId: 'u-ana',
    ownerName: 'Ana Pérez',
    ownerEmail: null,
    members: 8,
    players: 16,
    events: 2,
    lastActivityAt: null,
    createdAt: daysAgo(12),
  },
];

export const audit: AdminAuditEntry[] = [
  {
    id: 3,
    at: daysAgo(0),
    actorId: 'u-me',
    actorName: 'Randy Dueño',
    action: 'announce',
    targetType: 'app',
    targetId: null,
    detail: { title: 'Llegó el pádel', body: 'Ya puedes crear ligas de pádel.', recipients: 530, audience: { kind: 'all' } },
  },
  {
    id: 2,
    at: daysAgo(1),
    actorId: 'u-me',
    actorName: 'Randy Dueño',
    action: 'block_user',
    targetType: 'user',
    targetId: 'u-luis',
    detail: { name: 'Luis Soto', email: 'luis@correo.do', reason: 'Anotaciones falsas', already: false },
  },
  {
    id: 1,
    at: daysAgo(3),
    actorId: 'u-me',
    actorName: 'Randy Dueño',
    action: 'set_sport_status',
    targetType: 'sport',
    targetId: 'padel',
    detail: { from: 'beta', to: 'open' },
  },
];

export const system: AdminSystem = {
  backend: 'supabase',
  // La base las manda de la más nueva a la más vieja.
  migrations: [
    { version: '20260927001100', name: 'consola' },
    { version: '20260926000100', name: 'base' },
  ],
  lastHeartbeat: daysAgo(0.5),
  cron: [
    { job: 'mm-push-send', schedule: '* * * * *', lastRunAt: daysAgo(0.001), lastStatus: 'succeeded' },
    { job: 'mm-photos-purge', schedule: '0 4 * * *', lastRunAt: daysAgo(1), lastStatus: 'failed' },
  ],
  push: { queued: 3, claimed: 1, failed24h: 2, oldestQueuedAt: daysAgo(0.01) },
  sportStatus: [
    { sport: 'bowling', status: 'open', leagues: 30 },
    { sport: 'padel', status: 'beta', leagues: 20 },
    { sport: 'tennis', status: 'closed', leagues: 0 },
  ],
};

export const scan: AdminScanStats = {
  days: series(30, (i) => i % 7).map((p) => ({ day: p.day, scans: p.scans })),
  models: [
    { model: 'claude-haiku-4-5', today: 30, total: 900 },
    { model: 'claude-sonnet-4-5', today: 10, total: 120 },
  ],
  topUsers: [{ userId: 'u-ana', name: 'Ana Pérez', email: 'ana@correo.do', scans: 88 }],
  today: 420,
  dailyLimit: 500,
  perUserLimit: 20,
};
