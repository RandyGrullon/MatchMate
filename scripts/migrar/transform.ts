/**
 * Transformador BowlingX (Firestore) → MatchMate (Postgres). Función pura: recibe el respaldo (y, si hay, la
 * exportación de Firebase Auth con los parámetros del hash) y devuelve las cuentas, las filas de cada tabla en el
 * orden en que se cargan, los archivos de fotos para Storage y un reporte de lo que se corrigió o no pasó.
 *
 * - Ids: UUID v5 (ids.ts). Los compuestos se desarman: la participación `evento_jugador` pasa a ser
 *   (event_id, player_id); la reacción `participación_cuenta` a (entry_id, user_id); la membresía `liga_uid`
 *   a (league_id, user_id).
 * - `event.rsvp` y `event.teams` (mapas dentro del evento) pasan a filas de event_rsvps y teams.
 * - `member.playerId` / `player.uid` pasan a `players.user_id` (manda la membresía si no cuadran).
 * - Todo es boliche (`sport = 'bowling'`). Se conservan las marcas 'importado' y 'sin-foto'; las marcas con id
 *   de foto pasan al uuid de la foto (aunque la foto ya no exista: el juego sigue verificado, como en BowlingX).
 * - `live` y `limits` no se migran. Las sugerencias siguen anónimas.
 * - Los datos que no caben en las reglas de MatchMate (teléfono con guiones, nombres de más de 60, pinos
 *   fuera de 0–300…) se corrigen y se anotan en el reporte; lo que no se puede pasar se anota como no migrado.
 */
import { toFbscrypt, type FirebaseHashConfig } from './hash';
import {
  entryUuid,
  eventUuid,
  fallbackInviteCode,
  leagueUuid,
  legacyId,
  photoUuid,
  playerUuid,
  teamUuid,
  userUuid,
} from './ids';
import {
  TABLES,
  type FirebaseAuthExport,
  type FirebaseAuthUser,
  type FsBackup,
  type FsEvent,
  type FsLeague,
  type FsMember,
  type FsUser,
  type Issue,
  type MigrationPlan,
  type PhotoFile,
  type Row,
  type TableName,
  type TransformReport,
  type UserPlan,
} from './types';

export interface TransformOptions {
  /** `firebase auth:export --format=json`: correos, verificación, Google y los hashes. */
  auth?: FirebaseAuthExport | null;
  /** Parámetros del hash (consola de Firebase). Sin ellos las cuentas se crean sin contraseña. */
  hashConfig?: FirebaseHashConfig | null;
  /** Cuentas que ya existen en MatchMate: si el correo coincide se usa ese uuid (no se crea otra). */
  existingUsers?: { id: string; email: string | null }[];
  /** Fecha ISO (YYYY-MM-DD): las fotos más viejas no se suben (los juegos siguen verificados). */
  photosSince?: string | null;
  /** Dar todos los correos por verificados (si no, solo los verificados en Firebase y los de Google). */
  trustEmails?: boolean;
  /** Correos que quedan como superadmin en MatchMate (además de los que ya lo eran, salvo admin@admin.com). */
  superadmins?: string[];
  /** Correo de la cuenta que se queda con las ligas cuyo dueño ya no existe. */
  fallbackOwner?: string | null;
  /** Crear las cuentas sin contraseña aunque haya hash (entran con «¿Olvidaste tu contraseña?»). */
  withoutPasswords?: boolean;
}

/** Superadmins fijos de BowlingX (admins.ts): NO pasan como superadmin (crítica 37). */
export const FIXED_SUPERADMINS = ['admin@admin.com'];
/** Límite del bucket scoreboards. */
export const MAX_PHOTO_BYTES = 1048576;
/** Motivo del bloqueo (consola) de una cuenta que estaba deshabilitada en Firebase. */
export const BLOCKED_REASON = 'Deshabilitada en BowlingX (Firebase)';
const MARKS = new Set(['importado', 'sin-foto']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
const DEFAULT_TIME = '2026-01-01T00:00:00.000Z';

// ---------- Ayudas de texto y números ----------

/** Largo en caracteres como char_length de Postgres (un emoji cuenta uno). */
const clen = (s: string) => Array.from(s).length;
const cut = (s: string, max: number) => (clen(s) > max ? Array.from(s).slice(0, max).join('').trim() : s);
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

function isoTime(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isoDate(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? v : null;
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** El respaldo de una liga (`league` + colecciones) o el completo (`leagues` + `users`) → la forma completa. */
export function normalizeBackup(json: unknown): FsBackup {
  const o = (json ?? {}) as Record<string, unknown>;
  if (Array.isArray(o.leagues)) {
    return { ...(o as unknown as FsBackup), users: Array.isArray(o.users) ? (o.users as FsUser[]) : [] };
  }
  if (o.league && typeof o.league === 'object') {
    const { app, exportedAt, league, ...cols } = o as Record<string, unknown>;
    const one = { ...(league as FsLeague), ...(cols as Partial<FsLeague>) };
    // El respaldo de una liga solo trae su id y su nombre: el dueño sale de las membresías.
    one.ownerUid ??= one.members?.find((m) => m?.role === 'owner')?.uid;
    return { app: app as string | undefined, exportedAt: exportedAt as string | undefined, leagues: [one], users: [] };
  }
  throw new Error('No parece un respaldo de BowlingX (falta "leagues" o "league").');
}

/** Tipo y tamaño de una foto en data URL (sin decodificarla). */
function dataUrlInfo(data: string): { contentType: 'image/jpeg' | 'image/webp'; bytes: number } | null {
  const comma = data.indexOf(',');
  const head = comma > 0 ? data.slice(0, comma) : '';
  const m = /^data:image\/(jpeg|jpg|webp);base64$/i.exec(head);
  if (!m) return null;
  const b64 = data.slice(comma + 1).replace(/\s/g, '');
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return { contentType: m[1].toLowerCase() === 'webp' ? 'image/webp' : 'image/jpeg', bytes: Math.floor((b64.length * 3) / 4) - pad };
}

// ---------- Transformación ----------

export function transformBackup(input: unknown, opts: TransformOptions = {}): MigrationPlan {
  const backup = normalizeBackup(input);
  const fallbackTime = isoTime(backup.exportedAt) ?? DEFAULT_TIME;
  const rows = Object.fromEntries(TABLES.map((t) => [t, [] as Row[]])) as Record<TableName, Row[]>;
  const fixes: Issue[] = [];
  const dropped: Issue[] = [];
  const fix = (table: string, ref: string, message: string) => fixes.push({ table, ref, message });
  const drop = (table: string, ref: string, message: string) => dropped.push({ table, ref, message });
  const photoStats = { found: 0, migrated: 0, old: 0, tooBig: 0, missingData: 0, bytes: 0 };
  const files: PhotoFile[] = [];

  /** Nombre visible de 1 a 60 (como private.clean_name); si no sirve, `fallback` y se anota. */
  const name = (v: unknown, fallback: string, table: string, ref: string, max = 60): string => {
    const raw = str(v).trim();
    if (!raw) {
      fix(table, ref, `sin nombre: queda «${fallback}»`);
      return fallback;
    }
    const out = cut(raw, max);
    if (out !== raw) fix(table, ref, `nombre de más de ${max} letras: se recortó`);
    return out || fallback;
  };
  /** Texto opcional hasta `max` (recortado y anotado si pasa). */
  const shortText = (v: unknown, max: number, table: string, ref: string, what: string): string => {
    const raw = str(v).trim();
    const out = cut(raw, max);
    if (out !== raw) fix(table, ref, `${what} de más de ${max} letras: se recortó`);
    return out;
  };

  // ---- Cuentas ----
  const authByUid = new Map<string, FirebaseAuthUser>((opts.auth?.users ?? []).map((u) => [u.localId, u]));
  const fsByUid = new Map<string, FsUser>(backup.users.map((u) => [u.id, u]));
  const existingByEmail = new Map<string, string>();
  for (const u of opts.existingUsers ?? []) if (u.email) existingByEmail.set(u.email.trim().toLowerCase(), u.id);
  const forcedSupers = new Set((opts.superadmins ?? []).map((e) => e.trim().toLowerCase()));
  // Nombre al unirse a una liga, por si la cuenta no tiene nombre en ninguna otra parte.
  const memberName = new Map<string, string>();
  for (const l of backup.leagues) for (const m of l.members ?? []) if (m.uid && m.name && !memberName.has(m.uid)) memberName.set(m.uid, m.name);

  const users: UserPlan[] = [];
  const userId = new Map<string, string>(); // uid de Firebase → uuid
  const userName = new Map<string, string>();
  const emails = new Set<string>();
  const uids = [...new Set([...authByUid.keys(), ...fsByUid.keys()])].sort();
  for (const uid of uids) {
    const a = authByUid.get(uid);
    const f = fsByUid.get(uid);
    const ref = `users/${uid}`;
    const email = str(a?.email ?? f?.email).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      drop('users', ref, 'cuenta sin correo válido: no se puede crear en Supabase');
      continue;
    }
    if (emails.has(email)) {
      drop('users', ref, `correo repetido (${email}): ya lo tiene otra cuenta`);
      continue;
    }
    emails.add(email);
    if (opts.auth && !a) fix('users', ref, 'no está en Firebase Auth (se borró la cuenta): se crea sin contraseña para no perder sus datos');
    const providers =a?.providerUserInfo?.map((p) => p.providerId) ?? (a?.passwordHash ? ['password'] : []);
    const google = providers.includes('google.com');
    let passwordHash: string | null = null;
    if (a?.passwordHash && a.salt && opts.hashConfig && !opts.withoutPasswords) {
      try {
        passwordHash = toFbscrypt(a.passwordHash, a.salt, opts.hashConfig);
      } catch (e) {
        fix('users', ref, `hash de contraseña ilegible (${(e as Error).message}): entra con «¿Olvidaste tu contraseña?»`);
      }
    }
    const fixed = FIXED_SUPERADMINS.includes(email);
    if (fixed) fix('users', ref, `${email} no pasa como superadmin (el superadmin de MatchMate se pone aparte)`);
    const existing = existingByEmail.get(email);
    const plan: UserPlan = {
      id: existing ?? userUuid(uid),
      firebaseUid: uid,
      email,
      name: name(f?.name ?? a?.displayName ?? memberName.get(uid) ?? email.split('@')[0], 'Jugador', 'users', ref),
      emailConfirmed: opts.trustEmails === true || a?.emailVerified === true || google,
      passwordHash,
      providers,
      banned: a?.disabled === true,
      isSuperadmin: forcedSupers.has(email) || (f?.superadmin === true && !fixed),
      createdAt: isoTime(f?.createdAt) ?? isoTime(a?.createdAt) ?? fallbackTime,
      existing: existing !== undefined,
    };
    users.push(plan);
    userId.set(uid, plan.id);
    userName.set(uid, plan.name);
  }
  for (const e of forcedSupers) if (!users.some((u) => u.email === e)) fix('users', e, 'superadmin pedido pero esa cuenta no está en BowlingX');
  const fallbackOwner = opts.fallbackOwner ? users.find((u) => u.email === opts.fallbackOwner!.trim().toLowerCase()) : undefined;
  if (opts.fallbackOwner && !fallbackOwner) fix('users', opts.fallbackOwner, 'la cuenta de reemplazo para dueños no está en BowlingX');

  // ---- Ligas ----
  const usedCodes = new Set<string>();
  const leagueMap: Record<string, string> = {};
  const invitesByLeague = new Map<string, string[]>();
  for (const inv of backup.invites ?? []) invitesByLeague.set(inv.leagueId, [...(invitesByLeague.get(inv.leagueId) ?? []), inv.id]);

  for (const l of backup.leagues) {
    const lref = `leagues/${l.id}`;
    const lid = leagueUuid(l.id);
    const leagueTime = isoTime(l.createdAt) ?? fallbackTime;
    const members = (l.members ?? []).filter((m): m is FsMember => !!m && typeof m.uid === 'string' && m.uid !== '');

    // Dueño: ownerUid; si no existe, el miembro con rol de dueño; si no, la cuenta de reemplazo.
    let ownerUid = l.ownerUid && userId.has(l.ownerUid) ? l.ownerUid : undefined;
    if (!ownerUid) {
      const byRole = members.find((m) => m.role === 'owner' && userId.has(m.uid));
      ownerUid = byRole?.uid ?? fallbackOwner?.firebaseUid;
      if (!ownerUid) {
        drop('leagues', lref, 'el dueño ya no tiene cuenta y no se indicó --dueno-reemplazo: la liga no se migra');
        continue;
      }
      fix('leagues', lref, `el dueño ${l.ownerUid ?? '(sin dueño)'} ya no tiene cuenta: queda ${ownerUid}`);
    }
    const ownerId = userId.get(ownerUid)!;
    leagueMap[l.id] = lid;

    const kind = l.kind === 'torneo' ? 'torneo' : 'liga';
    if (l.kind && l.kind !== kind) fix('leagues', lref, `tipo desconocido «${l.kind}»: queda liga`);
    const visibility = l.visibility === 'public' ? 'public' : 'private';
    if (l.visibility !== visibility) fix('leagues', lref, `visibilidad «${str(l.visibility)}»: queda privada`);
    const phoneRaw = str(l.contactPhone);
    const phone = phoneRaw.replace(/[^0-9+]/g, '').slice(0, 20);
    if (phone !== phoneRaw) fix('leagues', lref, `teléfono «${phoneRaw}» queda «${phone}» (solo números y +)`);
    const season = (v: unknown, what: string) => {
      if (v == null || v === '') return null;
      const d = isoDate(v);
      if (!d) fix('leagues', lref, `${what} «${str(v)}» no es una fecha: queda vacía`);
      return d;
    };
    rows.leagues.push({
      id: lid,
      sport: 'bowling',
      kind,
      visibility,
      name: name(l.name, 'Liga', 'leagues', lref),
      owner_id: ownerId,
      venue: shortText(l.venue, 80, 'leagues', lref, 'bolera'),
      schedule: shortText(l.schedule, 80, 'leagues', lref, 'horario'),
      season_start: season(l.seasonStart, 'inicio de temporada'),
      season_end: season(l.seasonEnd, 'fin de temporada'),
      contact_name: shortText(l.contactName, 60, 'leagues', lref, 'contacto'),
      contact_phone: phone,
      require_photo: l.requirePhoto === true,
      has_minors: false,
      tz: 'America/Santo_Domingo',
      rules: {},
      created_at: leagueTime,
    });

    // Código de invitación: el de BowlingX si viene y sirve (los links viejos siguen sirviendo); si no, uno fijo.
    const candidates = [l.inviteCode, ...(invitesByLeague.get(l.id) ?? [])].filter((c): c is string => typeof c === 'string');
    let code = candidates.map((c) => c.trim().toUpperCase()).find((c) => INVITE_RE.test(c) && !usedCodes.has(c));
    if (!code) {
      for (let i = 0; !code || usedCodes.has(code); i++) code = fallbackInviteCode(lid, i);
      if (candidates.length) fix('league_secrets', lref, 'el código de invitación de BowlingX no sirve: se hizo uno nuevo');
    }
    usedCodes.add(code);
    rows.league_secrets.push({ league_id: lid, invite_code: code });

    // ---- Miembros ----
    const memberRows = new Map<string, Row>(); // uid → fila
    const sortedMembers = [...members].sort(
      (a, b) => str(isoTime(a.joinedAt)).localeCompare(str(isoTime(b.joinedAt))) || a.uid.localeCompare(b.uid),
    );
    for (const m of sortedMembers) {
      const mref = `members/${l.id}_${m.uid}`;
      if (!userId.has(m.uid)) {
        drop('league_members', mref, 'la cuenta ya no existe');
        continue;
      }
      if (memberRows.has(m.uid)) continue;
      let role = m.role === 'owner' || m.role === 'admin' ? m.role : 'member';
      if (m.role && m.role !== role) fix('league_members', mref, `rol «${m.role}»: queda miembro`);
      if (role === 'owner' && m.uid !== ownerUid) {
        role = 'admin';
        fix('league_members', mref, 'había otro dueño: queda admin');
      }
      if (m.uid === ownerUid) role = 'owner';
      memberRows.set(m.uid, {
        league_id: lid,
        user_id: userId.get(m.uid)!,
        role,
        is_scorer: m.scorer === true,
        display_name: name(m.name ?? userName.get(m.uid), userName.get(m.uid) ?? 'Jugador', 'league_members', mref),
        joined_at: isoTime(m.joinedAt) ?? leagueTime,
      });
    }
    if (!memberRows.has(ownerUid)) {
      fix('league_members', `members/${l.id}_${ownerUid}`, 'el dueño no tenía membresía: se agrega');
      memberRows.set(ownerUid, {
        league_id: lid,
        user_id: ownerId,
        role: 'owner',
        is_scorer: false,
        display_name: userName.get(ownerUid) ?? 'Jugador',
        joined_at: leagueTime,
      });
    }
    rows.league_members.push(...memberRows.values());

    // ---- Jugadores y su cuenta (member.playerId manda; player.uid completa) ----
    const players = new Map((l.players ?? []).filter((p) => p && p.id).map((p) => [p.id, p]));
    const linkedUid = new Map<string, string>(); // jugador → uid de su cuenta
    const hasPlayer = new Set<string>(); // uid con jugador
    for (const m of sortedMembers) {
      if (!m.playerId || !memberRows.has(m.uid) || hasPlayer.has(m.uid)) continue;
      const mref = `members/${l.id}_${m.uid}`;
      if (!players.has(m.playerId)) {
        fix('players', mref, `su jugador ${m.playerId} ya no existe: queda sin jugador`);
      } else if (linkedUid.has(m.playerId)) {
        fix('players', mref, `su jugador ${m.playerId} ya es de otra cuenta: queda sin jugador`);
      } else {
        linkedUid.set(m.playerId, m.uid);
        hasPlayer.add(m.uid);
      }
    }
    for (const p of players.values()) {
      if (!p.uid || linkedUid.get(p.id) === p.uid) continue;
      const pref = `${lref}/players/${p.id}`;
      if (linkedUid.has(p.id)) fix('players', pref, `player.uid (${p.uid}) no cuadra con la membresía: se usa la membresía`);
      else if (!memberRows.has(p.uid)) fix('players', pref, `su cuenta ${p.uid} ya no es miembro: queda sin cuenta`);
      else if (hasPlayer.has(p.uid)) fix('players', pref, `su cuenta ${p.uid} ya tiene otro jugador: queda sin cuenta`);
      else {
        linkedUid.set(p.id, p.uid);
        hasPlayer.add(p.uid);
        fix('players', pref, 'la membresía no tenía el jugador: se vincula por player.uid');
      }
    }
    for (const p of players.values()) {
      const pref = `${lref}/players/${p.id}`;
      let avg: number | null = null;
      if (p.averageOverride != null) {
        if (isNum(p.averageOverride) && p.averageOverride >= 0 && p.averageOverride <= 300) avg = p.averageOverride;
        else fix('players', pref, `promedio fijo «${str(p.averageOverride)}» fuera de 0–300: se quita`);
      }
      const uid = linkedUid.get(p.id);
      rows.players.push({
        id: playerUuid(l.id, p.id),
        league_id: lid,
        user_id: uid ? userId.get(uid)! : null,
        name: name(p.name, 'Jugador', 'players', pref),
        average_override: avg,
        is_minor: false,
        attrs: {},
        created_at: isoTime(p.createdAt) ?? leagueTime,
      });
    }
    const playerUser = (pid: string) => {
      const uid = linkedUid.get(pid);
      return uid ? userId.get(uid)! : null;
    };

    // ---- Eventos, equipos y «voy» ----
    const events = new Map<string, FsEvent>();
    for (const e of l.events ?? []) {
      if (!e?.id) continue;
      const eref = `${lref}/events/${e.id}`;
      const date = isoDate(e.date);
      if (!date) {
        drop('events', eref, `fecha «${str(e.date)}» inválida: el evento y sus juegos no se migran`);
        continue;
      }
      events.set(e.id, e);
      const eid = eventUuid(l.id, e.id);
      const eventTime = isoTime(e.createdAt) ?? leagueTime;
      const type = e.type === 'torneo' ? 'torneo' : 'practica';
      if (e.type !== type) fix('events', eref, `tipo «${str(e.type)}»: queda práctica`);
      const intIn = (v: unknown, min: number, max: number, def: number, what: string) => {
        if (v == null) return def;
        if (isNum(v) && v >= min && v <= max) {
          if (!isInt(v)) fix('events', eref, `${what} ${v} redondeado`);
          return Math.round(v);
        }
        fix('events', eref, `${what} «${str(v)}» fuera de ${min}–${max}: queda ${def}`);
        return def;
      };
      const rankBy = (v: unknown, what: string) => {
        if (v == null) return null;
        if (v === 'hcp' || v === 'scratch') return v;
        fix('events', eref, `${what} «${str(v)}» desconocido: se quita`);
        return null;
      };
      let cuts: number[] | null = null;
      if (e.categoryCuts != null) {
        if (Array.isArray(e.categoryCuts) && e.categoryCuts.length === 3 && e.categoryCuts.every((c) => isInt(c) && c >= 0 && c <= 300)) cuts = e.categoryCuts;
        else fix('events', eref, 'cortes de categoría inválidos: se quitan');
      }
      rows.events.push({
        id: eid,
        league_id: lid,
        type,
        name: shortText(e.name, 80, 'events', eref, 'nombre'),
        date,
        start_time: null,
        games: intIn(e.games, 1, 10, 3, 'juegos'),
        hcp_base: intIn(e.hcpBase, 0, 300, 0, 'base del handicap'),
        hcp_percent: intIn(e.hcpPercent, 0, 100, 0, '% del handicap'),
        individual_rank_by: rankBy(e.individualRankBy, 'orden individual'),
        team_rank_by: rankBy(e.teamRankBy, 'orden de equipos'),
        category_cuts: cuts,
        team_size: intIn(e.teamSize, 0, 20, 0, 'jugadores por equipo'),
        announcement: shortText(e.announcement, 1000, 'events', eref, 'anuncio'),
        config: {},
        created_by: null,
        created_at: eventTime,
      });
      // `order` en BowlingX es Date.now() (+ i): ~1,7 billones, no cabe en teams.sort_order (integer, hasta
      // 2 147 483 647) y la carga fallaría. Se guarda el lugar de cada equipo (1, 2, 3…) en el mismo orden (los
      // sin número van al final, como estaban): la clasificación por equipos sale igual.
      const teamList = Object.entries(e.teams ?? {})
        .map(([tid, t], i) => ({ tid, t, i }))
        .filter((x): x is { tid: string; t: { name?: string | null; order?: number }; i: number } => !!x.t && typeof x.t === 'object' && !x.tid.includes('/'));
      const place = new Map(
        [...teamList]
          .sort((a, b) => {
            const x = isNum(a.t.order) ? a.t.order : Infinity;
            const y = isNum(b.t.order) ? b.t.order : Infinity;
            return x === y ? a.i - b.i : x < y ? -1 : 1;
          })
          .map((x, k) => [x.tid, k + 1] as const),
      );
      for (const { tid, t, i } of teamList) {
        const tref = `${eref}/teams/${tid}`;
        rows.teams.push({
          id: teamUuid(l.id, e.id, tid),
          league_id: lid,
          event_id: eid,
          name: name(t.name, `Equipo ${i + 1}`, 'teams', tref),
          sort_order: place.get(tid)!,
          color: null,
          created_at: eventTime,
        });
      }
      for (const [pid, going] of Object.entries(e.rsvp ?? {})) {
        if (going !== true) continue;
        if (!players.has(pid)) {
          drop('event_rsvps', `${eref}/rsvp/${pid}`, 'el jugador ya no existe');
          continue;
        }
        rows.event_rsvps.push({ event_id: eid, player_id: playerUuid(l.id, pid), league_id: lid, going: true, created_at: eventTime });
      }
    }
    const teamOf = (e: FsEvent, tid: string | null | undefined) =>
      tid && e.teams && typeof e.teams === 'object' && e.teams[tid] && !tid.includes('/') ? teamUuid(l.id, e.id, tid) : null;

    // ---- Fotos (solo si vienen en la exportación) ----
    const photos = new Set<string>(); // ids de BowlingX que sí se migran
    for (const ph of l.photos ?? []) {
      if (!ph?.id || ph.id.includes('/')) continue;
      photoStats.found++;
      const pref = `${lref}/photos/${ph.id}`;
      const created = isoTime(ph.createdAt);
      if (opts.photosSince && (created ?? '') < opts.photosSince) {
        photoStats.old++;
        continue;
      }
      let info: { contentType: 'image/jpeg' | 'image/webp'; bytes: number } | null = null;
      let source: PhotoFile['source'] | null = null;
      if (typeof ph.data === 'string' && ph.data) {
        info = dataUrlInfo(ph.data);
        source = { dataUrl: ph.data };
      } else if (typeof ph.file === 'string' && ph.file && isInt(ph.bytes)) {
        info = { contentType: ph.contentType === 'image/webp' ? 'image/webp' : 'image/jpeg', bytes: ph.bytes };
        source = { file: ph.file };
      }
      if (!info || !source) {
        photoStats.missingData++;
        drop('photos', pref, 'foto sin datos (o no es JPEG/WebP)');
        continue;
      }
      if (info.bytes > MAX_PHOTO_BYTES) {
        photoStats.tooBig++;
        drop('photos', pref, `foto de ${info.bytes} bytes: pasa de 1 MB`);
        continue;
      }
      const id = photoUuid(l.id, ph.id);
      const path = `${lid}/${id}.${info.contentType === 'image/webp' ? 'webp' : 'jpg'}`;
      const dim = (v: unknown) => (isInt(v) && v >= 1 && v <= 20000 ? v : null);
      rows.photos.push({
        id,
        league_id: lid,
        event_id: ph.eventId && events.has(ph.eventId) ? eventUuid(l.id, ph.eventId) : null,
        path,
        content_type: info.contentType,
        width: dim(ph.width),
        height: dim(ph.height),
        bytes: info.bytes,
        uploaded_by: null,
        created_at: created ?? leagueTime,
        expires_at: null,
        purged_at: null,
      });
      files.push({ bucket: 'scoreboards', path, contentType: info.contentType, bytes: info.bytes, source });
      photos.add(ph.id);
      photoStats.migrated++;
      photoStats.bytes += info.bytes;
    }

    // ---- Participaciones ----
    const scoresOf = (v: unknown, table: string, ref: string): (number | null)[] => {
      if (!Array.isArray(v)) return [];
      let bad = v.length > 10;
      const out = v.slice(0, 10).map((x) => {
        if (x == null) return null;
        if (isInt(x) && x >= 0 && x <= 300) return x;
        bad = true;
        return null;
      });
      if (bad) fix(table, ref, `pinos inválidos ${JSON.stringify(v)}: quedan ${JSON.stringify(out)}`);
      return out;
    };
    const framesOf = (v: unknown, table: string, ref: string): Row | null => {
      if (v == null) return null;
      if (typeof v !== 'object' || Array.isArray(v) || JSON.stringify(v).length > 12000) {
        fix(table, ref, 'cuadros inválidos o muy grandes: se quitan');
        return null;
      }
      return Object.keys(v).length ? (v as Row) : null;
    };
    const entryKeys = new Map<string, string>(); // `${evento}/${jugador}` → id de documento que quedó
    const entryByDoc = new Map<string, string>(); // id de documento → `${evento}/${jugador}`
    for (const x of l.entries ?? []) {
      if (!x?.id) continue;
      const xref = `${lref}/entries/${x.id}`;
      const ev = events.get(x.eventId);
      if (!ev) {
        drop('entries', xref, 'el evento ya no existe (o no se migró)');
        continue;
      }
      if (!players.has(x.playerId)) {
        drop('entries', xref, 'el jugador ya no existe');
        continue;
      }
      const key = `${x.eventId}/${x.playerId}`;
      entryByDoc.set(x.id, key);
      const prev = entryKeys.get(key);
      if (prev !== undefined) {
        // Dos documentos del mismo jugador en el mismo evento: queda el del id normal (evento_jugador).
        const normal = `${x.eventId}_${x.playerId}`;
        if (x.id !== normal) {
          drop('entries', xref, 'repetida (el jugador ya tiene su participación en ese evento)');
          continue;
        }
        drop('entries', `${lref}/entries/${prev}`, 'repetida (el jugador ya tiene su participación en ese evento)');
        const i = rows.entries.findIndex((r) => r.id === entryUuid(l.id, x.eventId, x.playerId));
        if (i >= 0) rows.entries.splice(i, 1);
      }
      entryKeys.set(key, x.id);
      const team = teamOf(ev, x.teamId);
      if (x.teamId && !team) fix('entries', xref, `equipo ${x.teamId} no existe en el evento: queda sin equipo`);
      let average = isNum(x.average) ? x.average : 0;
      if (average < 0 || average > 300) {
        fix('entries', xref, `promedio ${average} fuera de 0–300`);
        average = Math.min(300, Math.max(0, average));
      }
      let hcp: number | null = null;
      if (x.handicapOverride != null) {
        if (isNum(x.handicapOverride) && x.handicapOverride >= -300 && x.handicapOverride <= 300) hcp = Math.round(x.handicapOverride);
        else fix('entries', xref, `handicap fijo «${str(x.handicapOverride)}» inválido: se quita`);
      }
      let badMark = false;
      const marks = (Array.isArray(x.photos) ? x.photos : []).slice(0, 36).map((m) => {
        if (m == null) return null;
        if (typeof m !== 'string' || m === '' || m.includes('/')) {
          badMark = true;
          return null;
        }
        return MARKS.has(m) ? m : photoUuid(l.id, m);
      });
      if (badMark) fix('entries', xref, 'marca de foto inválida: ese juego queda en borrador');
      rows.entries.push({
        id: entryUuid(l.id, x.eventId, x.playerId),
        league_id: lid,
        event_id: eventUuid(l.id, x.eventId),
        player_id: playerUuid(l.id, x.playerId),
        team_id: team,
        average,
        handicap_override: hcp,
        scores: scoresOf(x.scores, 'entries', xref),
        photos: marks,
        frames: framesOf(x.frames, 'entries', xref),
        created_at: isoTime(x.createdAt) ?? isoTime(ev.createdAt) ?? leagueTime,
      });
    }
    /** Participación de una reacción o comentario: por (evento, jugador) o por el id del documento. */
    const entryFor = (d: { entryId?: string; eventId?: string; playerId?: string }) => {
      const byFields = d.eventId && d.playerId ? `${d.eventId}/${d.playerId}` : null;
      const key = byFields && entryKeys.has(byFields) ? byFields : d.entryId ? entryByDoc.get(d.entryId) : undefined;
      if (!key || !entryKeys.has(key)) return null;
      const [eid, pid] = key.split('/');
      return { id: entryUuid(l.id, eid, pid), event_id: eventUuid(l.id, eid), player_id: playerUuid(l.id, pid) };
    };

    // ---- Envíos ----
    for (const s of l.submissions ?? []) {
      if (!s?.id) continue;
      const sref = `${lref}/submissions/${s.id}`;
      if (!players.has(s.playerId)) {
        drop('submissions', sref, 'el jugador ya no existe');
        continue;
      }
      const event = s.eventId && events.has(s.eventId) ? eventUuid(l.id, s.eventId) : null;
      const date = isoDate(s.date);
      if (!event && !date) {
        drop('submissions', sref, 'sin evento (ya no existe) ni fecha');
        continue;
      }
      if (s.eventId && !event) fix('submissions', sref, 'su evento ya no existe: queda por fecha');
      const scores = scoresOf(s.scores, 'submissions', sref);
      if (!scores.length) {
        drop('submissions', sref, 'sin pinos');
        continue;
      }
      const status = s.status === 'aprobado' || s.status === 'rechazado' ? s.status : 'pendiente';
      if (s.status !== status) fix('submissions', sref, `estado «${str(s.status)}»: queda pendiente`);
      if (s.photoId && !photos.has(s.photoId)) fix('submissions', sref, 'su foto no se migra: queda sin foto');
      rows.submissions.push({
        id: legacyId('submission', l.id, s.id),
        league_id: lid,
        player_id: playerUuid(l.id, s.playerId),
        event_id: event,
        date,
        scores,
        scanned: Array.isArray(s.scanned) ? scoresOf(s.scanned, 'submissions', sref) : null,
        scanned_name: s.scannedName ? shortText(s.scannedName, 60, 'submissions', sref, 'nombre leído') || null : null,
        frames: framesOf(s.frames, 'submissions', sref),
        photo_id: s.photoId && photos.has(s.photoId) ? photoUuid(l.id, s.photoId) : null,
        status,
        note: s.note ? shortText(s.note, 500, 'submissions', sref, 'nota') || null : null,
        // BowlingX no guarda quién lo envió: la cuenta del jugador (casi siempre fue él).
        created_by: playerUser(s.playerId),
        created_at: isoTime(s.createdAt) ?? leagueTime,
        reviewed_at: isoTime(s.reviewedAt),
        reviewed_by: s.reviewedBy ? (userId.get(s.reviewedBy) ?? null) : null,
      });
    }

    // ---- Social ----
    const authorName = (uid: string, v: unknown, table: string, ref: string) =>
      name(v, (memberRows.get(uid)?.display_name as string | undefined) ?? userName.get(uid) ?? 'Jugador', table, ref);
    const reactions = new Map<string, { row: Row; ref: string }>(); // `${entry}/${user}` → la más nueva
    for (const r of l.reactions ?? []) {
      if (!r?.id) continue;
      const rref = `${lref}/reactions/${r.id}`;
      const entry = entryFor(r);
      if (!entry) {
        drop('reactions', rref, 'el juego ya no existe');
        continue;
      }
      if (!userId.has(r.uid)) {
        drop('reactions', rref, 'la cuenta ya no existe');
        continue;
      }
      if (r.type !== 'like' && r.type !== 'felicitar') {
        drop('reactions', rref, `tipo «${str(r.type)}» desconocido`);
        continue;
      }
      const row: Row = {
        id: legacyId('reaction', l.id, r.id),
        league_id: lid,
        entry_id: entry.id,
        event_id: entry.event_id,
        player_id: entry.player_id,
        user_id: userId.get(r.uid)!,
        author_name: authorName(r.uid, r.name, 'reactions', rref),
        type: r.type,
        created_at: isoTime(r.createdAt) ?? leagueTime,
      };
      const key = `${entry.id}/${row.user_id as string}`;
      const prev = reactions.get(key);
      if (prev && str(prev.row.created_at) >= str(row.created_at)) {
        drop('reactions', rref, 'repetida (la cuenta ya reaccionó a ese juego)');
        continue;
      }
      if (prev) drop('reactions', prev.ref, 'repetida (la cuenta ya reaccionó a ese juego)');
      reactions.set(key, { row, ref: rref });
    }
    rows.reactions.push(...[...reactions.values()].map((r) => r.row));

    for (const c of l.comments ?? []) {
      if (!c?.id) continue;
      const cref = `${lref}/comments/${c.id}`;
      const entry = entryFor(c);
      if (!entry) {
        drop('comments', cref, 'el juego ya no existe');
        continue;
      }
      if (!userId.has(c.uid)) {
        drop('comments', cref, 'la cuenta ya no existe');
        continue;
      }
      const text = shortText(c.text, 500, 'comments', cref, 'comentario');
      if (!text) {
        drop('comments', cref, 'comentario vacío');
        continue;
      }
      rows.comments.push({
        id: legacyId('comment', l.id, c.id),
        league_id: lid,
        entry_id: entry.id,
        event_id: entry.event_id,
        player_id: entry.player_id,
        user_id: userId.get(c.uid)!,
        author_name: authorName(c.uid, c.name, 'comments', cref),
        text,
        created_at: isoTime(c.createdAt) ?? leagueTime,
      });
    }

    for (const s of l.suggestions ?? []) {
      if (!s?.id) continue;
      const sref = `${lref}/suggestions/${s.id}`;
      const text = shortText(s.text, 1000, 'suggestions', sref, 'sugerencia');
      if (!text) {
        drop('suggestions', sref, 'sugerencia vacía');
        continue;
      }
      rows.suggestions.push({
        id: legacyId('suggestion', l.id, s.id),
        league_id: lid,
        text,
        read: s.read === true,
        created_at: isoTime(s.createdAt) ?? leagueTime,
      });
    }
  }

  // ---- Perfiles (las cuentas nuevas; las que ya existían solo se marcan) ----
  // - adult_confirmed_at NO se llena: BowlingX nunca preguntó la edad. La app (AdultGate) les pregunta una sola vez
  //   «Tengo 18 años o más» al entrar. Tampoco se toca al volver a cargar (el upsert no lleva esa columna).
  // - Deshabilitada en Firebase: además de bloqueada en Auth, bloqueada en la consola (blocked_at), para que se vea.
  for (const u of users) {
    if (u.existing) continue;
    rows.profiles.push({
      id: u.id,
      email: u.email,
      name: u.name,
      is_superadmin: u.isSuperadmin,
      firebase_uid: u.firebaseUid,
      blocked_at: u.banned ? u.createdAt : null,
      blocked_reason: u.banned ? BLOCKED_REASON : null,
      created_at: u.createdAt,
    });
  }
  const profileUpdates = users.filter((u) => u.existing).map((u) => ({ id: u.id, firebase_uid: u.firebaseUid, is_superadmin: u.isSuperadmin }));

  const counts = Object.fromEntries(TABLES.map((t) => [t, rows[t].length])) as TransformReport['counts'];
  counts.users = users.length;
  counts.files = files.length;
  const report: TransformReport = {
    counts,
    users: {
      total: users.length,
      withPassword: users.filter((u) => u.passwordHash).length,
      googleOnly: users.filter((u) => !u.passwordHash && u.providers.includes('google.com')).length,
      withoutPassword: users.filter((u) => !u.passwordHash && !u.providers.includes('google.com')).length,
      unconfirmed: users.filter((u) => !u.emailConfirmed).length,
      banned: users.filter((u) => u.banned).length,
      reused: users.filter((u) => u.existing && u.id !== userUuid(u.firebaseUid)).length,
      superadmins: users.filter((u) => u.isSuperadmin).length,
    },
    photos: photoStats,
    fixes,
    dropped,
  };
  return { users, rows, profileUpdates, files, map: { leagues: leagueMap, users: Object.fromEntries(userId) }, report };
}
