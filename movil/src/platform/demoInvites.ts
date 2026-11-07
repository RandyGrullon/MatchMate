/**
 * Solo en la demostración en memoria (demoBackend.ts, /dev/empresa): «Invitar personas» de Ajustes de la liga en las
 * ligas ficticias (demoLeague.ts). Contesta invite_to_league de src/lib/data/invites.ts con la misma forma que la base
 * ({ sent, results: [{ userId, status }] }: 'member' si ya está en la liga, 'pending' si ya tiene invitación, 'sent' la
 * nueva). Buscar personas (search_people) es de demoScorers.ts; `demoLeagueInvited` da las invitadas aquí para que su
 * marca «Invitado» las cuente. Se guarda en sessionStorage y se borra al salir de la demostración (forgetDemoInvites).
 * Todos los datos son ficticios.
 */
import { BackendError, type BackendErrorKind } from '@mm/lib/backend/types';
import { INVITE_MAX } from '@mm/lib/data/invites';

type Row = Record<string, unknown>;
/** Las filas de una tabla de las ligas ficticias por debajo de esta capa, sin filtrar. */
type Read = (table: string) => Row[];

const KEY = 'mm-demo-invitar';

interface State {
  /** Las cuentas invitadas a cada liga (`<liga>` → ids). */
  invited: Record<string, string[]>;
}

function load(): State {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return { invited: {}, ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    // sin sessionStorage: nadie invitado
  }
  return { invited: {} };
}

function save(s: State) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sin sessionStorage: sigue en memoria hasta recargar
  }
}

export function forgetDemoInvites() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // sin sessionStorage
  }
}

/** Las cuentas invitadas a la liga desde «Invitar personas» (para la marca «Invitado» de search_people). */
export const demoLeagueInvited = (lid: string): readonly string[] => load().invited[lid] ?? [];

const fail = (message: string, kind: BackendErrorKind, code: string | null = null): never => {
  throw new BackendError(message, kind, code);
};

/** invite_to_league. Devuelve `undefined` si la función no es suya. */
export function invitesRpc(uid: string, fn: string, a: Record<string, unknown>, read: Read): unknown {
  if (fn !== 'invite_to_league') return undefined;
  const lid = String(a.p_league ?? '');
  const league = read('leagues').find((l) => l.id === lid);
  if (!league) return fail('no_existe', 'not_found', 'no_existe');
  const members = read('memberships').filter((m) => m.league_id === lid);
  const me = members.find((m) => m.user_id === uid);
  const admin = league.owner_id === uid || ['owner', 'admin'].includes(String(me?.role));
  // Un miembro invita solo a una liga pública (como canInviteTo).
  if (!admin && !(me && league.visibility === 'public')) return fail('no_permitido', 'permission', 'no_permitido');
  const ids = [...new Set((Array.isArray(a.p_users) ? a.p_users : []).map(String).filter(Boolean))];
  if (!ids.length || ids.length > INVITE_MAX) return fail('invalido', 'validation', 'invalido');
  const s = load();
  const invited = new Set(s.invited[lid] ?? []);
  const results = ids.map((id) => {
    if (members.some((m) => m.user_id === id)) return { userId: id, status: 'member' };
    if (invited.has(id)) return { userId: id, status: 'pending' };
    invited.add(id);
    return { userId: id, status: 'sent' };
  });
  s.invited[lid] = [...invited];
  save(s);
  return { sent: results.filter((r) => r.status === 'sent').length, results };
}
