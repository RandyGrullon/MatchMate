/**
 * Los avisos de la liga en la demostración (/dev/empresa › Entrar a la demostración), en memoria y en sessionStorage:
 * uno de hace unas horas (sale arriba en el inicio de la Liga de Ejemplo) y uno viejo (solo en el historial), y las RPC
 * de Organizar › Avisar (a cuántos les llega y mandar uno, hasta 3 por día). Datos de mentira.
 */
import { BackendError } from '@mm/lib/backend/types';
import { uuidv7 } from '@mm/lib/db/ids';

type Row = Record<string, unknown>;

const KEY = 'mm-demo-avisos';
const HOUR = 3_600_000;
const DAILY = 3;
/** Miembros de la liga ficticia y cuántos tienen los avisos activados. */
const MEMBERS = 3;
const REACH = 1;

const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

function seed(leagueId: string): Row[] {
  return [
    { id: '00000000-0000-7000-8000-0000000a7002', league_id: leagueId, body: 'Hoy se juega en las pistas 7 y 8.', author_name: 'Juan Pérez', recipients: 1, created_at: iso(-5 * HOUR) },
    { id: '00000000-0000-7000-8000-0000000a7001', league_id: leagueId, body: 'Empezamos 30 minutos más tarde.', author_name: 'Juan Pérez', recipients: 0, created_at: iso(-80 * HOUR) },
  ];
}

function load(leagueId: string): Row[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Row[];
  } catch {
    // sin sessionStorage: los de fábrica
  }
  return seed(leagueId);
}

function save(rows: Row[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    // sin sessionStorage
  }
}

export function forgetDemoAnnounce() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** La tabla `league_announcements` de la liga ficticia, la más nueva primero (la demo no ordena). */
export function announceTables(leagueId: string): Record<string, Row[]> {
  return { league_announcements: [...load(leagueId)].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) };
}

const sentToday = (rows: Row[]) => rows.filter((r) => Date.now() - Date.parse(String(r.created_at)) < 24 * HOUR).length;

/** `league_announce_reach` y `league_announce` de la liga ficticia; undefined si no es de los avisos. */
export function announceRpc(leagueId: string, fn: string, a: Record<string, unknown>): unknown {
  if (fn !== 'league_announce_reach' && fn !== 'league_announce') return undefined;
  if (a.p_league !== leagueId) return undefined;
  const rows = load(leagueId);
  if (fn === 'league_announce_reach') return { members: MEMBERS, reach: REACH, sentToday: sentToday(rows), dailyLimit: DAILY };
  if (sentToday(rows) >= DAILY) throw new BackendError('Ya se mandaron los avisos de hoy.', 'rate_limited', 'rate_limited');
  save([{ id: uuidv7(), league_id: leagueId, body: String(a.p_body ?? ''), author_name: 'Juan Pérez', recipients: REACH, created_at: new Date().toISOString() }, ...rows]);
  return REACH;
}
