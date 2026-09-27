import { useSyncExternalStore } from 'react';
import { sportMeta } from '../../sports/registry';
import { BackendError } from '../backend/types';
import { uuidv7 } from '../db/ids';
import type { Invite, League, LeagueKind, Visibility } from '../types';
import { invalidate, rpc, select, useLive, type Live } from './client';
import { keys, sortedKey, tags } from './keys';
import { toLeague, type LeagueRow } from './rows';
import type { Wire } from './stamp';

// ---------- Lecturas ----------

export async function fetchLeague(lid: string): Promise<Wire<League> | null> {
  const rows = await select<LeagueRow>({ table: 'leagues', filters: [{ col: 'id', op: 'eq', value: lid }], limit: 1 });
  return rows[0] ? toLeague(rows[0]) : null;
}

const byName = (a: Wire<League>, b: Wire<League>) => a.name.localeCompare(b.name);

/** La liga (null si no existe o no se puede ver: privada sin ser miembro). */
export const useLeague = (lid: string | undefined): Live<League | null> =>
  useLive<League | null>(lid ? keys.league(lid) : null, lid ? { kind: 'league', lid } : null, () => fetchLeague(lid!), {
    initial: null,
    tags: lid ? [tags.league(lid), tags.leagues] : [],
  });

export const fetchPublicLeagues = async (): Promise<Wire<League>[]> =>
  (await select<LeagueRow>({ table: 'leagues', filters: [{ col: 'visibility', op: 'eq', value: 'public' }] })).map(toLeague).sort(byName);

export const usePublicLeagues = (): Live<League[]> =>
  useLive<League[]>(keys.publicLeagues, { kind: 'leagues' }, fetchPublicLeagues, { initial: [], tags: [tags.leagues] });

/** Todas las ligas (solo el superadmin puede listarlas). */
export const useAllLeagues = (enabled: boolean): Live<League[]> =>
  useLive<League[]>(
    enabled ? keys.allLeagues : null,
    { kind: 'leagues' },
    async () => (await select<LeagueRow>({ table: 'leagues' })).map(toLeague).sort(byName),
    { initial: [], tags: [tags.leagues] },
  );

export async function fetchLeaguesByIds(ids: readonly string[]): Promise<Wire<League>[]> {
  if (!ids.length) return [];
  const rows = await select<LeagueRow>({ table: 'leagues', filters: [{ col: 'id', op: 'in', value: [...new Set(ids)] }] });
  return rows.map(toLeague).sort(byName);
}

/** Varias ligas por id (las de mis membresías). Las que no existen o no se pueden ver se omiten. */
export function useLeaguesByIds(ids: string[]): Live<League[]> {
  const key = sortedKey(ids);
  return useLive<League[]>(key ? keys.leaguesByIds(ids) : null, { kind: 'leagues' }, () => fetchLeaguesByIds(key.split(',')), {
    initial: [],
    tags: [tags.leagues, ...ids.map(tags.league)],
  });
}

// ---------- Ligas ----------

export interface LeagueInput {
  name: string;
  kind: LeagueKind;
  visibility: Visibility;
  venue: string;
  schedule: string;
  seasonStart: string;
  seasonEnd: string;
  contactName: string;
  contactPhone: string;
  requirePhoto: boolean;
  /** Deporte (solo al crear; después no cambia). Por defecto boliche. */
  sport?: string;
  /** Liga con menores (siempre privada y sin foto obligatoria). */
  hasMinors?: boolean;
  /** Zona horaria IANA (por defecto America/Santo_Domingo). */
  tz?: string;
}

/** LeagueInput (parcial) → claves de la base para `update_league`. */
export function leaguePatch(patch: Partial<LeagueInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const map: [keyof LeagueInput, string, (v: never) => unknown][] = [
    ['name', 'name', (v: string) => v.trim()],
    ['kind', 'kind', (v: string) => v],
    ['visibility', 'visibility', (v: string) => v],
    ['venue', 'venue', (v: string) => v],
    ['schedule', 'schedule', (v: string) => v],
    ['seasonStart', 'season_start', (v: string) => v || null],
    ['seasonEnd', 'season_end', (v: string) => v || null],
    ['contactName', 'contact_name', (v: string) => v],
    ['contactPhone', 'contact_phone', (v: string) => v],
    ['requirePhoto', 'require_photo', (v: boolean) => v],
    ['hasMinors', 'has_minors', (v: boolean) => v],
    ['tz', 'tz', (v: string) => v],
  ];
  for (const [from, to, conv] of map) if (patch[from] !== undefined) out[to] = conv(patch[from] as never);
  return out;
}

const createArgs = (input: LeagueInput) => ({
  p_name: input.name.trim(),
  p_visibility: input.visibility,
  p_sport: input.sport ?? 'bowling',
  p_venue: input.venue ?? '',
  p_contact_name: input.contactName ?? '',
  p_contact_phone: input.contactPhone ?? '',
  p_require_photo: !!input.requirePhoto,
});

/** Después de crear o unirse: las listas de ligas, las membresías y la campana cambian. */
const afterJoin = (lid: string) => invalidate(tags.leagues, tags.members, tags.feeds, tags.league(lid));

/**
 * Crea la liga y deja a quien la crea como dueño, con su código de invitación y su jugador (el dueño también
 * juega), todo en una sola RPC. El id sale del teléfono. `owner` queda por compatibilidad: la base usa la sesión.
 */
export async function createLeague(_owner: { uid: string; name: string }, input: LeagueInput): Promise<string> {
  const lid = uuidv7();
  setJoining(lid, true);
  try {
    await rpc('create_league', {
      ...createArgs(input),
      p_id: lid,
      p_kind: input.kind ?? 'liga',
      p_schedule: input.schedule ?? '',
      p_season_start: input.seasonStart || null,
      p_season_end: input.seasonEnd || null,
      p_has_minors: !!input.hasMinors,
      // Reglas por defecto del deporte (punto de oro, sets, tabla…); cada liga las puede cambiar después.
      p_rules: sportMeta(input.sport ?? 'bowling')?.defaultRules() ?? {},
      ...(input.tz ? { p_tz: input.tz } : {}),
    });
  } finally {
    setJoining(lid, false);
  }
  afterJoin(lid);
  return lid;
}

export async function updateLeague(lid: string, patch: Partial<LeagueInput>) {
  await rpc('update_league', { p_league: lid, p_patch: leaguePatch(patch) });
  invalidate(tags.league(lid), tags.leagues);
}

/** Borra la liga con todo su contenido (dueño o superadmin). Los archivos de fotos los borra la base después. */
export async function deleteLeague(lid: string, _myUid: string) {
  await rpc('delete_league', { p_league: lid });
  invalidate(tags.league(lid), tags.leagues, tags.members, tags.feeds);
}

/** Torneo sin liga: su "liga" de un solo torneo (dueño, invitación, jugador) y el torneo adentro, juntos. */
export async function createTournament(_owner: { uid: string; name: string }, input: LeagueInput, date: string): Promise<{ lid: string; eid: string }> {
  const lid = uuidv7();
  const eid = uuidv7();
  setJoining(lid, true);
  try {
    await rpc('create_tournament', { ...createArgs(input), p_date: date, p_id: lid, p_event_id: eid });
  } finally {
    setJoining(lid, false);
  }
  afterJoin(lid);
  return { lid, eid };
}

// ---------- Invitaciones ----------

/** Código vigente de la liga (solo lo leen sus admins). */
export async function getInviteCode(lid: string): Promise<string | null> {
  const rows = await select<{ invite_code: string }>({ table: 'league_secrets', columns: 'invite_code', filters: [{ col: 'league_id', op: 'eq', value: lid }] });
  return rows[0]?.invite_code ?? null;
}

/** Crea (o cambia) el código de invitación: el anterior deja de servir. */
export async function renewInviteCode(league: Pick<League, 'id'>): Promise<string> {
  return rpc<string>('renew_invite_code', { p_league: league.id });
}

/** A qué liga lleva un código (también sin cuenta). null si el código no sirve. */
export async function getInvite(code: string): Promise<Invite | null> {
  const id = code.trim().toUpperCase();
  if (!id) return null;
  const rows = await rpc<{ league_id: string; name: string; sport: string; kind: LeagueKind; visibility: Visibility }[] | null>('invite_preview', { p_code: id });
  const r = rows?.[0];
  return r ? { id, leagueId: r.league_id, leagueName: r.name, sport: r.sport, kind: r.kind, visibility: r.visibility } : null;
}

// ---------- Unirse ----------

// Ligas a las que la cuenta se está uniendo ahora (mientras se le deja listo su jugador).
const joining = new Set<string>();
const joiningListeners = new Set<() => void>();
function setJoining(lid: string, on: boolean) {
  if (on) joining.add(lid);
  else joining.delete(lid);
  joiningListeners.forEach((l) => l());
}
export const isJoining = (lid: string) => joining.has(lid);

export function useJoining(lid: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      joiningListeners.add(cb);
      return () => joiningListeners.delete(cb);
    },
    () => joining.has(lid),
  );
}

/**
 * Unirse a una liga (pública sin más, privada con el código de invitación). Entrar es participar: la cuenta
 * juega con su propio jugador, que la base deja listo en el mismo momento. Devuelve su jugador.
 */
export async function joinLeague(
  lid: string,
  _user: { uid: string; name: string },
  code: string | null,
  /** El jugador de la lista que dijo ser ("¿Eres tú? Crea tu cuenta"): se vincula si sigue sin cuenta. */
  prefer: string | null = null,
): Promise<string | null> {
  setJoining(lid, true);
  try {
    const r = await rpc<{ league_id: string; player_id: string | null } | null>('join_league', {
      p_league: lid,
      p_code: code ? code.trim().toUpperCase() : null,
      p_prefer: prefer,
    });
    if (!r) throw new BackendError('Ese código de invitación ya no sirve. Pide uno nuevo a un admin.', 'validation', 'invalid_code');
    afterJoin(lid);
    invalidate(tags.players(lid), tags.leagueMembers(lid));
    return r.player_id ?? null;
  } finally {
    setJoining(lid, false);
  }
}
