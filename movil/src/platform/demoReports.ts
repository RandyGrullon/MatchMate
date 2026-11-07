/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): Organizar › Reportes de «Liga de Ejemplo»
 * (demoLeague.ts). Contesta las RPC de src/lib/data/reports.ts para esa liga (list_reports, resolve_report y
 * delete_comment del comentario reportado), con la misma forma y las mismas reglas que la base
 * (20261009000100_red_social.sql: a los admins no se les dice quién reportó; un reporte cerrado no se decide otra vez,
 * 'cerrado'; decidir uno cierra los demás abiertos de lo mismo). De fábrica: dos reportes por revisar (un comentario y
 * un juego) y uno ya atendido. Se guarda en sessionStorage y se borra al salir de la demostración (forgetDemoReports).
 * Todos los datos son ficticios.
 */
import { BackendError } from '@mm/lib/backend/types';
import { DEMO_LEAGUE } from './demoLeague';

type Row = Record<string, unknown>;

const KEY = 'mm-demo-reportes';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Lo de «Liga de Ejemplo» (demoLeague.ts): la primera práctica pasada y el juego de Jugador Uno en ella.
const PAST_EVENT = '00000000-0000-7000-8000-00000000f0e2';
const ENTRY_ONE = '00000000-0000-7000-8000-0000000f5002';
/** El comentario reportado (ficticio: solo existe aquí). */
export const DEMO_REPORTED_COMMENT = '00000000-0000-7000-8000-0000000ae101';
const REPORT = (n: number) => `00000000-0000-7000-8000-0000000ae2${String(n).padStart(2, '0')}`;
const gamesUrl = `/l/${DEMO_LEAGUE}/juegos?juego=${ENTRY_ONE}&evento=${PAST_EVENT}`;

interface Stored {
  id: string;
  kind: string;
  targetId: string;
  reason: string;
  note: string | null;
  status: 'open' | 'dismissed' | 'actioned';
  createdAt: string;
  handledAt: string | null;
  handledByName: string | null;
  actionNote: string | null;
  /** Lo reportado (report_target); null = se borró. */
  target: Row | null;
}

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

function seed(): Stored[] {
  const base = { handledAt: null, handledByName: null, actionNote: null, status: 'open' as const };
  return [
    {
      ...base,
      id: REPORT(1),
      kind: 'comment',
      targetId: DEMO_REPORTED_COMMENT,
      reason: 'ofensivo',
      note: 'Nota de ejemplo: ese comentario no va.',
      createdAt: iso(-2 * HOUR),
      target: { title: 'Comentario de Jugadora Dos', text: 'Comentario de ejemplo que alguien reportó.', url: gamesUrl, userId: null, userName: 'Jugadora Dos', leagueId: DEMO_LEAGUE, leagueName: 'Liga de Ejemplo', sport: 'bowling' },
    },
    {
      ...base,
      id: REPORT(2),
      kind: 'game',
      targetId: ENTRY_ONE,
      reason: 'falso',
      note: null,
      createdAt: iso(-26 * HOUR),
      target: { title: 'Juego de Jugador Uno', text: '212 · 190 · 199', url: gamesUrl, userId: null, userName: 'Jugador Uno', leagueId: DEMO_LEAGUE, leagueName: 'Liga de Ejemplo', sport: 'bowling' },
    },
    {
      id: REPORT(3),
      kind: 'comment',
      targetId: '00000000-0000-7000-8000-0000000ae102',
      reason: 'spam',
      note: null,
      status: 'actioned',
      createdAt: iso(-5 * DAY),
      handledAt: iso(-4 * DAY),
      handledByName: 'Juan Pérez',
      actionNote: 'Hablé con la jugadora y lo borró.',
      target: null,
    },
  ];
}

function load(): Stored[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Stored[];
  } catch {
    // sin sessionStorage: lo de fábrica
  }
  return seed();
}

function save(rows: Stored[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoReports() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Un reporte como lo manda list_reports a un admin de la liga (sin quién lo reportó). */
function wire(r: Stored, all: readonly Stored[]): Row {
  const { target, ...rest } = r;
  return {
    ...rest,
    leagueId: DEMO_LEAGUE,
    leagueName: 'Liga de Ejemplo',
    reporterId: null,
    reporterName: null,
    sameTarget: all.filter((x) => x.kind === r.kind && x.targetId === r.targetId && x.status === 'open').length,
    target,
  };
}

/**
 * Las RPC de Reportes en «Liga de Ejemplo». undefined si no es de esta parte, la liga no es la ficticia o el reporte
 * (o el comentario) no es de aquí: sigue demoBackend como siempre.
 */
export function reportsRpc(_uid: string, fn: string, a: Record<string, unknown>): unknown {
  if (fn === 'list_reports') {
    if (a.p_league !== DEMO_LEAGUE) return undefined;
    const rows = load();
    const kind = typeof a.p_kind === 'string' && a.p_kind ? a.p_kind : null;
    const f = rows.filter((r) => !kind || r.kind === kind);
    const status = String(a.p_status ?? 'open');
    const s = f.filter((r) => (status === 'open' ? r.status === 'open' : status === 'closed' ? r.status !== 'open' : status === 'all' ? true : r.status === status));
    const limit = Math.min(100, Math.max(1, Number(a.p_limit) || 50));
    const offset = Math.max(0, Number(a.p_offset) || 0);
    const page = [...s].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(offset, offset + limit);
    return { rows: page.map((r) => wire(r, rows)), total: s.length, open: f.filter((r) => r.status === 'open').length, all: f.length };
  }
  if (fn === 'resolve_report') {
    const rows = load();
    const r = rows.find((x) => x.id === a.p_report);
    if (!r) return undefined;
    if (r.status !== 'open') throw new BackendError('cerrado: ya se decidió', 'conflict', 'cerrado');
    const status = a.p_status === 'actioned' ? 'actioned' : 'dismissed';
    const note = typeof a.p_note === 'string' && a.p_note.trim() ? a.p_note.trim().slice(0, 500) : null;
    // Cierra también los demás abiertos de lo mismo.
    for (const x of rows) {
      if (x.status === 'open' && x.kind === r.kind && x.targetId === r.targetId) {
        Object.assign(x, { status, handledAt: iso(), handledByName: 'Juan Pérez', actionNote: note });
      }
    }
    save(rows);
    return null;
  }
  if (fn === 'delete_comment') {
    const rows = load();
    if (!rows.some((x) => x.kind === 'comment' && x.targetId === a.p_comment)) return undefined;
    const existed = rows.some((x) => x.targetId === a.p_comment && x.target);
    for (const x of rows) if (x.targetId === a.p_comment) x.target = null;
    save(rows);
    return existed;
  }
  return undefined;
}
