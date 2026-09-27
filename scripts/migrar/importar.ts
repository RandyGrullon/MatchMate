/**
 * Carga un plan de migración (transform.ts) en un destino (target.ts), en orden y por upsert, y después revisa:
 * cuántas filas quedaron por tabla y la paridad de números con BowlingX (parity.ts).
 *
 * Orden: cuentas (Auth) → perfiles → ligas → código → miembros → jugadores → eventos → equipos → «voy» →
 * fotos (primero el archivo a Storage, después la fila) → participaciones → envíos → reacciones → comentarios →
 * sugerencias. Si algo falla se detiene con el nombre de la tabla: se arregla y se vuelve a correr (no duplica).
 */
import { compareParity, type ParityResult } from './parity';
import type { Target } from './target';
import { TABLES, type FsBackup, type Issue, type MigrationPlan, type PhotoFile, type Row, type TableName } from './types';

export interface ImportOptions {
  /** Bytes de una foto (data URL o archivo de la exportación). */
  readFile: (file: PhotoFile) => Promise<Uint8Array>;
  log?: (msg: string) => void;
  /** Subidas y cuentas a la vez (por defecto 4). */
  concurrency?: number;
}

export interface ImportResult {
  users: { created: number; existed: number };
  files: { uploaded: number; existed: number; failed: Issue[] };
  rows: Record<TableName, number>;
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

export async function runImport(plan: MigrationPlan, target: Target, opts: ImportOptions): Promise<ImportResult> {
  const log = opts.log ?? (() => undefined);
  const n = opts.concurrency ?? 4;
  const result: ImportResult = {
    users: { created: 0, existed: 0 },
    files: { uploaded: 0, existed: 0, failed: [] },
    rows: Object.fromEntries(TABLES.map((t) => [t, 0])) as Record<TableName, number>,
  };

  // ---- Cuentas ----
  const existing = await target.listUsers();
  const byId = new Set(existing.map((u) => u.id));
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
  await target.upsert('profiles', plan.rows.profiles);
  for (const p of plan.profileUpdates) await target.updateProfile(p.id, p);
  result.rows.profiles = plan.rows.profiles.length + plan.profileUpdates.length;

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
}

/** Filas por tabla en el destino contra el plan (solo las ligas migradas). */
export async function checkCounts(plan: MigrationPlan, target: Target, result?: ImportResult): Promise<CountCheck[]> {
  const leagueIds = Object.values(plan.map.leagues);
  const out: CountCheck[] = [];
  for (const table of TABLES) {
    // Perfiles: todas las cuentas de BowlingX (las nuevas y las que ya estaban) quedan con firebase_uid.
    const expected = table === 'profiles' ? plan.users.length : (result?.rows[table] ?? plan.rows[table].length);
    out.push({ table, expected, actual: await target.count(table, leagueIds) });
  }
  return out;
}

/** Paridad entre el respaldo de BowlingX y lo que quedó en el destino. */
export async function checkParity(backup: FsBackup, plan: MigrationPlan, target: Target): Promise<ParityResult> {
  const ids = Object.values(plan.map.leagues);
  const [players, events, teams, entries] = await Promise.all([
    target.read('players', ids),
    target.read('events', ids),
    target.read('teams', ids),
    target.read('entries', ids),
  ]);
  return compareParity(backup, plan, { players, events, teams, entries });
}

// ---------- Reporte en texto ----------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function formatReport(plan: MigrationPlan, counts?: CountCheck[], parity?: ParityResult, result?: ImportResult): string {
  const r = plan.report;
  const lines: string[] = [];
  lines.push('== Cuentas ==');
  lines.push(
    `${r.users.total} cuentas: ${r.users.withPassword} con su contraseña de siempre, ${r.users.googleOnly} solo Google, ` +
      `${r.users.withoutPassword} sin contraseña (usan «¿Olvidaste tu contraseña?»).`,
  );
  lines.push(`${r.users.unconfirmed} con el correo sin verificar (lo confirman al entrar), ${r.users.banned} bloqueadas, ${r.users.reused} ya estaban en MatchMate, ${r.users.superadmins} superadmin.`);
  if (result) lines.push(`Creadas ahora: ${result.users.created}; ya existían: ${result.users.existed}.`);
  lines.push('', '== Filas por tabla ==');
  for (const t of TABLES) {
    const c = counts?.find((x) => x.table === t);
    const mark = c ? (c.actual === c.expected ? 'ok' : `OJO: hay ${c.actual}`) : '';
    lines.push(`${t.padEnd(16)} ${String(t === 'profiles' ? r.counts.users : r.counts[t]).padStart(7)}  ${mark}`);
  }
  lines.push('', '== Fotos ==');
  lines.push(
    `${r.photos.found} en BowlingX: ${r.photos.migrated} se pasan (${(r.photos.bytes / 1024 / 1024).toFixed(1)} MB), ` +
      `${r.photos.old} viejas no se pasan, ${r.photos.tooBig} de más de 1 MB, ${r.photos.missingData} sin datos.`,
  );
  if (r.photos.bytes > 900 * 1024 * 1024) lines.push('OJO: pasan de 900 MB y el plan gratis tiene 1 GB. Usa --fotos-meses para subir solo las recientes.');
  if (result) lines.push(`Subidas: ${result.files.uploaded}; ya estaban: ${result.files.existed}; fallaron: ${result.files.failed.length}.`);
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
      lines.push(`${plural(parity.total, 'diferencia', 'diferencias')} (casi siempre por las correcciones o lo que no se migra, de arriba):`);
      for (const d of parity.diffs.slice(0, 50)) lines.push(`  - ${human(d.path)}: BowlingX ${short(d.bowlingx)} · MatchMate ${short(d.matchmate)}`);
      if (parity.total > 50) lines.push(`  … y ${parity.total - 50} más (ver el reporte JSON)`);
    }
  }
  return lines.join('\n');
}
