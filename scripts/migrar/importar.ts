/**
 * Carga un plan de migración (transform.ts) en un destino (target.ts), en orden y por upsert, y después revisa:
 * cuántas filas quedaron por tabla y la paridad de números con BowlingX (parity.ts).
 *
 * Orden: cuentas (Auth) → al día las que ya estaban → perfiles → lo que sobra de una carga anterior (se borra) →
 * ligas → código → miembros → jugadores → eventos → equipos → «voy» → fotos (primero el archivo a Storage, después
 * la fila) → participaciones → envíos → reacciones → comentarios → sugerencias. Si algo falla se detiene con el
 * nombre de la tabla: se arregla y se vuelve a correr (no duplica).
 *
 * Volver a cargar (hay un solo proyecto: la primera carga se hace antes del corte y al corte se corre otra vez con
 * la exportación final): `scanTarget` mira lo que ya está en las ligas migradas y separa
 * - lo que vino de BowlingX en una carga anterior y ya no está (se borró allá: una reacción que quitaron, un
 *   juego borrado, alguien que salió de la liga, una foto borrada) → se borra, con su archivo;
 * - lo que se hizo en MatchMate y choca con BowlingX (la misma participación o reacción) → se borra (manda BowlingX);
 * - lo demás que se hizo en MatchMate → se deja y se cuenta.
 * Lo que vino de BowlingX se reconoce por su id: UUID versión 5 (ids.ts). La app hace siempre versión 4.
 */
import { compareParity, type ParityResult } from './parity';
import type { ExistingUser, Target } from './target';
import { TABLES, type FsBackup, type Issue, type MigrationPlan, type PhotoFile, type Row, type TableName } from './types';

export interface ImportOptions {
  /** Bytes de una foto (data URL o archivo de la exportación). */
  readFile: (file: PhotoFile) => Promise<Uint8Array>;
  log?: (msg: string) => void;
  /** Subidas y cuentas a la vez (por defecto 4). */
  concurrency?: number;
  /** Lo que sobra en el destino (scanTarget). Sin esto no se borra nada. */
  scan?: TargetScan;
}

export interface ImportResult {
  users: { created: number; existed: number };
  /** Cuentas de una carga anterior puestas al día. passwords null: la base no tiene migration_sync_passwords. */
  sync: { confirmed: number; passwords: number | null; signedIn: number };
  files: { uploaded: number; existed: number; removed: number; failed: Issue[] };
  rows: Record<TableName, number>;
  /** Filas borradas (de una carga anterior o hechas en MatchMate que chocaban). */
  removed: Partial<Record<TableName, number>>;
}

/** Corre `fn` sobre la lista con hasta `n` a la vez. */
async function pool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

/** Bytes de un data URL (base64). */
export function dataUrlBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  return new Uint8Array(Buffer.from(dataUrl.slice(comma + 1), 'base64'));
}

// ---------- Lo que ya está en el destino ----------

const V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** ¿Vino de BowlingX? Los ids de la migración son UUID v5; la app hace v4. */
export const isMigratedId = (id: unknown) => typeof id === 'string' && V5.test(id);

/**
 * Tablas que se revisan, en el orden en que se borra (primero lo que cuelga de lo demás). `cols`: lo que se lee;
 * `unique`: otra clave única que una fila hecha en MatchMate puede ocupar antes que la de BowlingX.
 */
const SCAN: { table: TableName; cols: string[]; unique?: string[] }[] = [
  { table: 'comments', cols: ['id'] },
  { table: 'reactions', cols: ['id', 'entry_id', 'user_id'], unique: ['entry_id', 'user_id'] },
  { table: 'submissions', cols: ['id'] },
  { table: 'entries', cols: ['id', 'event_id', 'player_id'], unique: ['event_id', 'player_id'] },
  { table: 'photos', cols: ['id', 'path'] },
  { table: 'event_rsvps', cols: ['event_id', 'player_id'] },
  { table: 'teams', cols: ['id'] },
  { table: 'events', cols: ['id'] },
  { table: 'players', cols: ['id', 'league_id', 'user_id'], unique: ['league_id', 'user_id'] },
  { table: 'league_members', cols: ['league_id', 'user_id'] },
  { table: 'suggestions', cols: ['id'] },
];

/** Clave de la tabla (CONFLICT_KEYS) de cada fila. */
const PK: Partial<Record<TableName, string[]>> = { event_rsvps: ['event_id', 'player_id'], league_members: ['league_id', 'user_id'] };
const pkOf = (table: TableName) => PK[table] ?? ['id'];
const tuple = (r: Row, cols: string[]) => cols.map((c) => String(r[c])).join('/');

export interface TargetScan {
  /** Vino de BowlingX en una carga anterior y ya no está: se borra. */
  stale: Partial<Record<TableName, Row[]>>;
  /** Hecho en MatchMate y choca con lo de BowlingX (misma participación, reacción o cuenta de jugador): se borra. */
  clashes: Partial<Record<TableName, Row[]>>;
  /** Hecho en MatchMate en las ligas migradas, sin chocar: se deja (con `cleanNative`, se borra). */
  native: Partial<Record<TableName, Row[]>>;
  /** Jugadores de BowlingX cuya cuenta pasa a otro jugador: primero se quedan sin cuenta. */
  unlink: string[];
  /** Archivos de las fotos que se borran. */
  files: string[];
  /** Ligas de una carga anterior que ya no están en BowlingX (no se tocan: se borran a mano si hace falta). */
  leagues: string[];
  /** Cuentas de una carga anterior que ya no están en BowlingX (no se tocan). */
  users: string[];
}

/** Lo que ya hay en las ligas del plan (vacío en la primera carga y en el ensayo en seco). */
export async function scanTarget(plan: MigrationPlan, target: Target, users: ExistingUser[]): Promise<TargetScan> {
  const scan: TargetScan = { stale: {}, clashes: {}, native: {}, unlink: [], files: [], leagues: [], users: [] };
  const leagueIds = Object.values(plan.map.leagues);
  const inPlan = new Set(leagueIds);
  const all = await target.leagueIds();
  scan.leagues = all.filter((id) => isMigratedId(id) && !inPlan.has(id));
  const uids = new Set(plan.users.map((u) => u.firebaseUid));
  scan.users = users.filter((u) => u.firebaseUid && !uids.has(u.firebaseUid)).map((u) => u.email ?? u.id);
  const ids = all.filter((id) => inPlan.has(id));
  if (!ids.length) return scan;

  for (const { table, cols, unique } of SCAN) {
    const pk = pkOf(table);
    const planRows = plan.rows[table];
    const planKeys = new Set(planRows.map((r) => tuple(r, pk)));
    const planUnique = new Map<string, string>();
    if (unique) for (const r of planRows) if (unique.every((c) => r[c] != null)) planUnique.set(tuple(r, unique), tuple(r, pk));
    const stale: Row[] = [];
    const clashes: Row[] = [];
    const native: Row[] = [];
    for (const r of await target.keys(table, ids, cols)) {
      const key = tuple(r, pk);
      const owner = unique && unique.every((c) => r[c] != null) ? planUnique.get(tuple(r, unique)) : undefined;
      if (planKeys.has(key)) {
        // Sigue (se pone al día). Un jugador que tenía la cuenta que ahora es de otro jugador: primero sin cuenta.
        if (table === 'players' && owner !== undefined && owner !== key) scan.unlink.push(String(r.id));
      } else if (pk.every((c) => isMigratedId(r[c]))) stale.push(r);
      else if (owner !== undefined) clashes.push(r);
      else native.push(r);
    }
    if (stale.length) scan.stale[table] = stale;
    if (clashes.length) scan.clashes[table] = clashes;
    if (native.length) scan.native[table] = native;
    if (table === 'photos') scan.files.push(...[...stale, ...clashes].map((r) => String(r.path)));
  }
  return scan;
}

/**
 * Al corte, lo hecho en MatchMate en las ligas migradas (pruebas del dueño entre la primera carga y el corte: una
 * cuenta de prueba que se unió, un juego anotado…) también se borra: manda BowlingX (`--limpiar`).
 */
export function cleanNative(scan: TargetScan): TargetScan {
  const clashes = { ...scan.clashes };
  for (const [t, rows] of Object.entries(scan.native) as [TableName, Row[]][]) clashes[t] = [...(clashes[t] ?? []), ...rows];
  const files = [...scan.files, ...(scan.native.photos ?? []).map((r) => String(r.path))];
  return { ...scan, clashes, native: {}, files };
}

const total = (m: Partial<Record<TableName, Row[] | number>>) => Object.values(m).reduce<number>((a, v) => a + (typeof v === 'number' ? v : (v?.length ?? 0)), 0);

// ---------- Carga ----------

export async function runImport(plan: MigrationPlan, target: Target, opts: ImportOptions): Promise<ImportResult> {
  const log = opts.log ?? (() => undefined);
  const n = opts.concurrency ?? 4;
  const result: ImportResult = {
    users: { created: 0, existed: 0 },
    sync: { confirmed: 0, passwords: 0, signedIn: 0 },
    files: { uploaded: 0, existed: 0, removed: 0, failed: [] },
    rows: Object.fromEntries(TABLES.map((t) => [t, 0])) as Record<TableName, number>,
    removed: {},
  };

  // ---- Cuentas ----
  const existing = await target.listUsers();
  const byId = new Map(existing.map((u) => [u.id, u]));
  const byEmail = new Map(existing.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.id]));
  const toCreate = plan.users.filter((u) => !u.existing);
  for (const u of toCreate) {
    const other = byEmail.get(u.email);
    if (other && other !== u.id) {
      throw new Error(`La cuenta ${u.email} ya existe en MatchMate con otro id: vuelve a correr (el plan se arma con las cuentas de ahora).`);
    }
  }
  log(`Cuentas: ${toCreate.length} por crear o revisar, ${plan.users.length - toCreate.length} ya estaban en MatchMate`);
  await pool(toCreate, n, async (u) => {
    if (byId.has(u.id) || (await target.createUser(u)) === 'exists') result.users.existed++;
    else result.users.created++;
  });

  // Las que creó una carga anterior: al día con la exportación de hoy (correo verificado y contraseña cambiada en
  // BowlingX), solo si todavía no entraron a MatchMate. Las que ya entraron se quedan como están.
  const migrated = plan.users.filter((u) => u.existing && byId.get(u.id)?.firebaseUid === u.firebaseUid);
  const fresh = migrated.filter((u) => !byId.get(u.id)!.lastSignInAt);
  result.sync.signedIn = migrated.length - fresh.length;
  for (const u of migrated) {
    if (u.emailConfirmed && !byId.get(u.id)!.emailConfirmed) {
      await target.confirmEmail(u.id);
      result.sync.confirmed++;
    }
  }
  const hashes = fresh.filter((u) => u.passwordHash).map((u) => ({ id: u.id, hash: u.passwordHash! }));
  if (hashes.length) {
    result.sync.passwords = await target.syncPasswords(hashes);
    if (result.sync.passwords === null) log('OJO: la base no tiene migration_sync_passwords (migración 20260928000100): las contraseñas cambiadas en BowlingX después de la primera carga no se pasan.');
    else if (result.sync.passwords) log(`Contraseñas cambiadas en BowlingX desde la carga anterior: ${result.sync.passwords}`);
  }

  await target.upsert('profiles', plan.rows.profiles);
  for (const p of plan.profileUpdates) await target.updateProfile(p.id, p);
  result.rows.profiles = plan.rows.profiles.length + plan.profileUpdates.length;

  // ---- Lo que sobra de una carga anterior ----
  const scan = opts.scan;
  if (scan) {
    for (const { table } of SCAN) {
      const rows = [...(scan.stale[table] ?? []), ...(scan.clashes[table] ?? [])];
      if (!rows.length) continue;
      const pk = pkOf(table);
      await target.remove(table, rows.map((r) => Object.fromEntries(pk.map((c) => [c, r[c]]))));
      result.removed[table] = rows.length;
      log(`${table}: ${rows.length} borradas (ya no están en BowlingX o chocaban)`);
    }
    if (scan.files.length) {
      await target.removeFiles('scoreboards', scan.files);
      result.files.removed = scan.files.length;
    }
    if (scan.unlink.length) await target.unlinkPlayers(scan.unlink);
  }

  // ---- Tablas ----
  const failedPhotos = new Set<string>();
  for (const table of TABLES) {
    if (table === 'profiles') continue;
    let rows: Row[] = plan.rows[table];
    if (table === 'photos') {
      await uploadFiles(plan, target, opts, n, result, log);
      for (const f of result.files.failed) failedPhotos.add(f.ref);
      // Sin archivo no hay fila (y el envío que la usaba queda sin foto).
      rows = rows.filter((r) => !failedPhotos.has(r.path as string));
    }
    if (table === 'submissions' && failedPhotos.size) {
      const ids = new Set(plan.rows.photos.filter((r) => failedPhotos.has(r.path as string)).map((r) => r.id));
      rows = rows.map((r) => (ids.has(r.photo_id) ? { ...r, photo_id: null } : r));
    }
    log(`${table}: ${rows.length}`);
    await target.upsert(table, rows);
    result.rows[table] = rows.length;
  }
  return result;
}

async function uploadFiles(plan: MigrationPlan, target: Target, opts: ImportOptions, n: number, result: ImportResult, log: (m: string) => void) {
  if (!plan.files.length) return;
  const folders = [...new Set(plan.files.map((f) => f.path.split('/')[0]))];
  const already = await target.existingFiles('scoreboards', folders);
  const todo = plan.files.filter((f) => !already.has(f.path));
  result.files.existed = plan.files.length - todo.length;
  log(`Fotos: ${todo.length} por subir (${Math.round(todo.reduce((a, f) => a + f.bytes, 0) / 1024 / 1024)} MB), ${result.files.existed} ya estaban`);
  let done = 0;
  await pool(todo, n, async (f) => {
    try {
      await target.upload(f, await opts.readFile(f));
      result.files.uploaded++;
    } catch (e) {
      result.files.failed.push({ table: 'photos', ref: f.path, message: (e as Error).message });
    }
    if (++done % 100 === 0) log(`  ${done}/${todo.length}`);
  });
}

export interface CountCheck {
  table: TableName;
  expected: number;
  actual: number;
  /** De esas, hechas en MatchMate (no vienen de BowlingX y se dejaron). */
  native: number;
}

/** Filas por tabla en el destino contra el plan (solo las ligas migradas), más las hechas en MatchMate que se dejaron. */
export async function checkCounts(plan: MigrationPlan, target: Target, result?: ImportResult, scan?: TargetScan): Promise<CountCheck[]> {
  const leagueIds = Object.values(plan.map.leagues);
  const out: CountCheck[] = [];
  for (const table of TABLES) {
    // Perfiles: todas las cuentas de BowlingX (las nuevas y las que ya estaban) quedan con firebase_uid; más las
    // de una carga anterior que ya no están en BowlingX (no se borran).
    const native = table === 'profiles' ? (scan?.users.length ?? 0) : (scan?.native[table]?.length ?? 0);
    const expected = (table === 'profiles' ? plan.users.length : (result?.rows[table] ?? plan.rows[table].length)) + native;
    out.push({ table, expected, actual: await target.count(table, leagueIds), native });
  }
  return out;
}

/**
 * Paridad entre el respaldo de BowlingX y lo que quedó en el destino: solo con lo que vino de BowlingX (ids v5).
 * Lo hecho en MatchMate en esas ligas (se deja) se cuenta aparte (formatScan) y no ensucia la comparación.
 */
export async function checkParity(backup: FsBackup, plan: MigrationPlan, target: Target): Promise<ParityResult> {
  const ids = Object.values(plan.map.leagues);
  const mine = (rows: Row[]) => rows.filter((r) => isMigratedId(r.id));
  const [players, events, teams, entries] = await Promise.all([
    target.read('players', ids).then(mine),
    target.read('events', ids).then(mine),
    target.read('teams', ids).then(mine),
    target.read('entries', ids).then(mine),
  ]);
  return compareParity(backup, plan, { players, events, teams, entries });
}

// ---------- Reporte en texto ----------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Lo que se va a borrar o dejar en el destino (se muestra antes de confirmar y en el reporte). */
export function formatScan(scan: TargetScan): string {
  const lines: string[] = [];
  const stale = total(scan.stale);
  const clashes = total(scan.clashes);
  const native = total(scan.native);
  if (!stale && !clashes && !native && !scan.leagues.length && !scan.users.length && !scan.unlink.length) {
    return 'Nada de una carga anterior en esas ligas.';
  }
  if (stale) {
    lines.push(`Se BORRAN ${plural(stale, 'fila', 'filas')} de una carga anterior que ya no están en BowlingX:`);
    for (const [t, rows] of Object.entries(scan.stale)) lines.push(`  - ${t}: ${rows!.length}`);
  }
  if (scan.files.length) lines.push(`Se borran ${plural(scan.files.length, 'foto', 'fotos')} de Storage (sus filas se borran arriba).`);
  if (clashes) {
    lines.push(`Se BORRAN ${plural(clashes, 'fila hecha', 'filas hechas')} en MatchMate que chocan con BowlingX (manda BowlingX):`);
    for (const [t, rows] of Object.entries(scan.clashes)) lines.push(`  - ${t}: ${rows!.length}`);
  }
  if (scan.unlink.length) lines.push(`${plural(scan.unlink.length, 'jugador cambia', 'jugadores cambian')} de cuenta (como en BowlingX).`);
  if (native) {
    lines.push(`Se DEJAN ${plural(native, 'fila hecha', 'filas hechas')} en MatchMate en esas ligas (no vienen de BowlingX; con --limpiar se borran):`);
    for (const [t, rows] of Object.entries(scan.native)) lines.push(`  - ${t}: ${rows!.length}`);
  }
  if (scan.leagues.length) lines.push(`OJO: ${plural(scan.leagues.length, 'liga', 'ligas')} de una carga anterior ya no está en BowlingX (no se toca): ${scan.leagues.join(', ')}`);
  if (scan.users.length) {
    lines.push(`OJO: ${plural(scan.users.length, 'cuenta', 'cuentas')} de una carga anterior ya no está en BowlingX (no se toca): ${scan.users.slice(0, 20).join(', ')}${scan.users.length > 20 ? '…' : ''}`);
  }
  return lines.join('\n');
}

export function formatReport(plan: MigrationPlan, counts?: CountCheck[], parity?: ParityResult, result?: ImportResult): string {
  const r = plan.report;
  const lines: string[] = [];
  lines.push('== Cuentas ==');
  lines.push(
    `${r.users.total} cuentas: ${r.users.withPassword} con su contraseña de siempre, ${r.users.googleOnly} solo Google, ` +
      `${r.users.withoutPassword} sin contraseña (usan «¿Olvidaste tu contraseña?»).`,
  );
  lines.push(`${r.users.unconfirmed} con el correo sin verificar (lo confirman al entrar), ${r.users.banned} bloqueadas, ${r.users.reused} ya estaban en MatchMate, ${r.users.superadmins} superadmin.`);
  if (r.users.unconfirmed) {
    lines.push(
      `  Esas ${r.users.unconfirmed} ven «Confirma tu correo» la primera vez que entran con contraseña y piden el link (1 correo cada una): ` +
        'revisa en Supabase › Authentication › Rate Limits que los correos por hora alcancen. Con --confiar-correos entran directo.',
    );
  }
  lines.push('Todas las cuentas de BowlingX contestan una vez «Tengo 18 años o más» al entrar (BowlingX no lo preguntaba).');
  if (result) {
    lines.push(`Creadas ahora: ${result.users.created}; ya existían: ${result.users.existed}.`);
    if (result.sync.confirmed || result.sync.passwords || result.sync.signedIn) {
      lines.push(
        `De una carga anterior: ${result.sync.confirmed} con el correo recién verificado, ` +
          `${result.sync.passwords ?? 'sin revisar'} con la contraseña cambiada en BowlingX, ${result.sync.signedIn} ya entraron a MatchMate (se quedan como están).`,
      );
    }
  }
  lines.push('', '== Filas por tabla ==');
  for (const t of TABLES) {
    const c = counts?.find((x) => x.table === t);
    const mark = c ? (c.actual === c.expected ? `ok${c.native ? ` (+${c.native} de MatchMate)` : ''}` : `OJO: hay ${c.actual}`) : '';
    lines.push(`${t.padEnd(16)} ${String(t === 'profiles' ? r.counts.users : r.counts[t]).padStart(7)}  ${mark}`);
  }
  if (result && total(result.removed)) {
    lines.push(`Borradas (de una carga anterior o que chocaban): ${Object.entries(result.removed).map(([t, k]) => `${t} ${k}`).join(', ')}.`);
  }
  lines.push('', '== Fotos ==');
  lines.push(
    `${r.photos.found} en BowlingX: ${r.photos.migrated} se pasan (${(r.photos.bytes / 1024 / 1024).toFixed(1)} MB), ` +
      `${r.photos.old} viejas no se pasan, ${r.photos.tooBig} de más de 1 MB, ${r.photos.missingData} sin datos.`,
  );
  if (r.photos.bytes > 900 * 1024 * 1024) lines.push('OJO: pasan de 900 MB y el plan gratis tiene 1 GB. Usa --fotos-meses para subir solo las recientes.');
  if (result) lines.push(`Subidas: ${result.files.uploaded}; ya estaban: ${result.files.existed}; borradas: ${result.files.removed}; fallaron: ${result.files.failed.length}.`);
  for (const f of result?.files.failed ?? []) lines.push(`  - ${f.ref}: ${f.message}`);
  lines.push('', `== Correcciones (${r.fixes.length}) ==`);
  for (const f of r.fixes.slice(0, 100)) lines.push(`  - [${f.table}] ${f.ref}: ${f.message}`);
  if (r.fixes.length > 100) lines.push(`  … y ${r.fixes.length - 100} más (ver el reporte JSON)`);
  lines.push('', `== No se migran (${r.dropped.length}) ==`);
  for (const f of r.dropped.slice(0, 100)) lines.push(`  - [${f.table}] ${f.ref}: ${f.message}`);
  if (r.dropped.length > 100) lines.push(`  … y ${r.dropped.length - 100} más (ver el reporte JSON)`);
  if (parity) {
    lines.push('', '== Paridad (promedios, rankings y totales) ==');
    const c = parity.checked;
    lines.push(
      `Revisado: ${plural(c.leagues, 'liga', 'ligas')}, ${plural(c.players, 'jugador', 'jugadores')}, ${plural(c.events, 'evento', 'eventos')}, ` +
        `${plural(c.seasons, 'temporada', 'temporadas')}, ${plural(c.accounts, 'cuenta', 'cuentas')}.`,
    );
    if (parity.ok) lines.push('IDÉNTICO: todos los números salen iguales en BowlingX y en MatchMate.');
    else {
      // Con nombres en vez de uuid, y cada valor corto.
      const human = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => parity.labels[id] ?? id);
      const short = (v: unknown) => {
        const s = human(JSON.stringify(v) ?? 'nada');
        return s.length > 160 ? `${s.slice(0, 160)}…` : s;
      };
      lines.push(`${plural(parity.total, 'diferencia', 'diferencias')} (casi siempre por las correcciones, lo que no se migra o lo hecho en MatchMate, de arriba):`);
      for (const d of parity.diffs.slice(0, 50)) lines.push(`  - ${human(d.path)}: BowlingX ${short(d.bowlingx)} · MatchMate ${short(d.matchmate)}`);
      if (parity.total > 50) lines.push(`  … y ${parity.total - 50} más (ver el reporte JSON)`);
    }
  }
  return lines.join('\n');
}
