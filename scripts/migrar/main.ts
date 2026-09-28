/**
 * Comandos de la migración (se corren con `node scripts/migrar/cli.mjs <comando>`; paso a paso en docs/migracion.md):
 *
 *   exportar     --cuenta-servicio <cuenta.json> --salida <carpeta>
 *   probar-clave --auth <users.json> --hash <hash.txt> --correo <tu correo>
 *   importar     --datos <carpeta o respaldo.json> [--auth users.json] [--hash hash.txt]
 *                [--destino supabase] [--seco] [--fotos-meses N | --fotos-desde AAAA-MM-DD]
 *                [--confiar-correos] [--sin-claves] [--superadmin correo]… [--dueno-reemplazo correo]
 *                [--limpiar | --sin-borrar] [--env archivo] [--reporte archivo.json] [--si]
 *   probar-destino [--env archivo]        (solo lee: clave, tablas, RPC, bucket y lo que ya se cargó)
 *   sintetico    --salida <carpeta> [--semilla N]   (exportación de prueba realista, para ensayar sin la de verdad)
 *   torneo       <archivo.json> --liga <uuid> [--reemplazar] [--env archivo]
 *
 * Sin `--destino supabase` la importación es un ensayo en seco: carga todo en un Postgres en memoria (PGlite)
 * con las migraciones de verdad, revisa los conteos y la paridad, y no toca nada en internet.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createSupabaseBackend } from '../../src/lib/backend/supabase';
import { createFirestoreReader, exportBowlingX, getAccessToken, type ServiceAccount } from './exportar';
import { parseHashConfig, toFbscrypt, verifyFbscrypt } from './hash';
import { checkCounts, checkParity, cleanNative, dataUrlBytes, formatReport, formatScan, isMigratedId, runImport, scanTarget } from './importar';
import { makeSyntheticExport, syntheticSummary } from './sintetico';
import { checkSupabaseEnv, createLocalTarget, createNodeClient, createSupabaseTarget, type Target } from './target';
import { importTournament, type TournamentFile } from './torneo';
import { normalizeBackup, transformBackup } from './transform';
import { TABLES, type FirebaseAuthExport, type PhotoFile } from './types';

interface Args {
  _: string[];
  flags: Map<string, string[]>;
}

/** `--clave valor`, `--bandera` y el resto como posicionales. */
export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: new Map() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, inline] = a.slice(2).split('=', 2);
      const v = inline ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true');
      out.flags.set(k, [...(out.flags.get(k) ?? []), v]);
    } else out._.push(a);
  }
  return out;
}

const flag = (a: Args, k: string) => a.flags.get(k)?.at(-1);
const has = (a: Args, k: string) => a.flags.has(k);

/** Lee un archivo KEY=valor (sin pisar lo que ya está en el entorno). */
function loadEnvFile(path: string): void {
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // No mostrar lo que se escribe (contraseñas).
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.includes(question)) process.stdout.write(s);
    };
  }
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      done(answer);
    }),
  );
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')) as T;
const log = (msg: string) => console.log(msg);

/** Fecha (AAAA-MM-DD) `months` meses antes de `iso`. */
export function monthsBefore(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

// ---------- exportar ----------

async function cmdExport(a: Args): Promise<number> {
  const out = resolve(flag(a, 'salida') ?? 'migracion-bowlingx');
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  let projectId = flag(a, 'proyecto');
  let token = 'owner';
  if (!emulator) {
    const file = flag(a, 'cuenta-servicio');
    if (!file) {
      console.error('Falta --cuenta-servicio <archivo.json> (Firebase › Configuración del proyecto › Cuentas de servicio).');
      return 1;
    }
    const sa = readJson<ServiceAccount>(file);
    projectId ??= sa.project_id;
    token = await getAccessToken(sa, fetch);
  }
  if (!projectId) {
    console.error('Falta --proyecto <id>');
    return 1;
  }
  mkdirSync(join(out, 'fotos'), { recursive: true });
  const reader = createFirestoreReader({ projectId, token, fetchFn: fetch, baseUrl: emulator ? `http://${emulator}/v1` : undefined });
  const backup = await exportBowlingX(reader, {
    log,
    async savePhoto(lid, id, bytes, contentType) {
      const rel = `fotos/${lid}/${id}.${contentType === 'image/webp' ? 'webp' : 'jpg'}`;
      mkdirSync(join(out, 'fotos', lid), { recursive: true });
      writeFileSync(join(out, rel), bytes);
      return rel;
    },
  });
  writeFileSync(join(out, 'bowlingx.json'), JSON.stringify(backup, null, 1));
  log(`Listo: ${backup.leagues.length} ligas y ${backup.users.length} cuentas en ${join(out, 'bowlingx.json')}`);
  return 0;
}

// ---------- probar-clave ----------

async function cmdCheckPassword(a: Args): Promise<number> {
  const authFile = flag(a, 'auth');
  const hashFile = flag(a, 'hash');
  const email = flag(a, 'correo')?.trim().toLowerCase();
  if (!authFile || !hashFile || !email) {
    console.error('Uso: probar-clave --auth users.json --hash hash.txt --correo tu@correo.com');
    return 1;
  }
  const cfg = parseHashConfig(readFileSync(hashFile, 'utf8'));
  const user = readJson<FirebaseAuthExport>(authFile).users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    console.error(`${email} no está en ${authFile}.`);
    return 1;
  }
  if (!user.passwordHash || !user.salt) {
    console.error(`${email} no tiene contraseña en Firebase (entra con Google).`);
    return 1;
  }
  const password = process.env.MM_PASSWORD ?? (await ask(`Contraseña de ${email} en BowlingX: `, true));
  if (verifyFbscrypt(password, toFbscrypt(user.passwordHash, user.salt, cfg))) {
    log('BIEN: la contraseña coincide. Los parámetros del hash están bien copiados.');
    return 0;
  }
  log('NO coincide. O la contraseña está mal, o los parámetros del hash se copiaron mal (revisa hash.txt).');
  return 2;
}

// ---------- importar ----------

async function cmdImport(a: Args, root: string): Promise<number> {
  const datos = flag(a, 'datos');
  if (!datos) {
    console.error('Falta --datos <carpeta de la exportación o respaldo.json>');
    return 1;
  }
  const envFile = flag(a, 'env');
  if (envFile) loadEnvFile(envFile);
  const file = statSync(datos).isDirectory() ? join(datos, 'bowlingx.json') : datos;
  const baseDir = dirname(resolve(file));
  const backup = normalizeBackup(readJson<unknown>(file));
  const auth = flag(a, 'auth') ? readJson<FirebaseAuthExport>(flag(a, 'auth')!) : null;
  const hashConfig = flag(a, 'hash') ? parseHashConfig(readFileSync(flag(a, 'hash')!, 'utf8')) : null;
  if (!auth) log('Sin --auth: las cuentas salen del respaldo, sin contraseña (entran con «¿Olvidaste tu contraseña?»).');
  else if (!hashConfig && !has(a, 'sin-claves')) log('Sin --hash: las cuentas se crean sin contraseña.');

  const months = flag(a, 'fotos-meses');
  const photosSince = flag(a, 'fotos-desde') ?? (months ? monthsBefore(backup.exportedAt ?? new Date().toISOString(), Number(months)) : null);
  const toSupabase = flag(a, 'destino') === 'supabase' && !has(a, 'seco') && !has(a, 'dry-run');

  let target: Target;
  let destino = 'seco';
  if (toSupabase) {
    const env = checkSupabaseEnv(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
    target = createSupabaseTarget({ url: env.url, secretKey: env.key });
    destino = env.url;
    log(`Destino: ${env.url}${env.ref ? ` (proyecto ${env.ref})` : ''}`);
  } else {
    log('Ensayo en seco: Postgres en memoria (PGlite) con las migraciones de verdad. No se toca Supabase.');
    target = await createLocalTarget({ root });
  }

  const started = Date.now();
  try {
    const users = await target.listUsers();
    const plan = transformBackup(backup, {
      auth,
      hashConfig,
      existingUsers: users,
      photosSince,
      trustEmails: has(a, 'confiar-correos'),
      superadmins: a.flags.get('superadmin') ?? [],
      fallbackOwner: flag(a, 'dueno-reemplazo') ?? null,
      withoutPasswords: has(a, 'sin-claves'),
    });
    // Lo que ya está de una carga anterior (en la primera carga y en el ensayo en seco, nada). --limpiar: también
    // se borra lo hecho en MatchMate en esas ligas (pruebas antes del corte). --sin-borrar: no se borra nada.
    let scan = await scanTarget(plan, target, users);
    if (has(a, 'limpiar')) scan = cleanNative(scan);
    if (has(a, 'sin-borrar')) scan = { ...scan, stale: {}, clashes: {}, files: [] };
    // Antes de escribir en Supabase se muestra el plan y se pide confirmar (el ensayo en seco solo lo muestra al final).
    if (toSupabase) {
      log(formatReport(plan));
      log('\n== Lo que ya está en MatchMate ==\n' + formatScan(scan));
      if (!has(a, 'si') && (await ask('\n¿Cargar esto en Supabase? Escribe SI para seguir: ')).trim().toUpperCase() !== 'SI') {
        log('No se hizo nada.');
        return 1;
      }
    }
    const readPhoto = async (f: PhotoFile) => ('dataUrl' in f.source ? dataUrlBytes(f.source.dataUrl) : new Uint8Array(await readFile(join(baseDir, f.source.file))));
    const result = await runImport(plan, target, { readFile: readPhoto, log, scan });
    const counts = await checkCounts(plan, target, result, scan);
    const parity = await checkParity(backup, plan, target);
    log('\n' + formatReport(plan, counts, parity, result));
    log('\n== Lo que ya estaba en MatchMate ==\n' + formatScan(scan));
    log(`\nTardó ${Math.round((Date.now() - started) / 1000)} s.`);
    const reportFile = resolve(flag(a, 'reporte') ?? join(baseDir, `reporte-${toSupabase ? 'supabase' : 'seco'}.json`));
    const scanSummary = { ...scan, stale: counted(scan.stale), clashes: counted(scan.clashes), native: counted(scan.native) };
    writeFileSync(reportFile, JSON.stringify({ destino, report: plan.report, result, counts, parity, scan: scanSummary, map: plan.map }, null, 1));
    log(`Reporte completo: ${reportFile}`);
    const countsOk = counts.every((c) => c.actual === c.expected);
    return countsOk && parity.ok && !result.files.failed.length ? 0 : 2;
  } finally {
    await target.close();
  }
}

/** { tabla: filas } → { tabla: cuántas } (para el reporte JSON). */
const counted = (m: Partial<Record<string, unknown[]>>) => Object.fromEntries(Object.entries(m).map(([t, rows]) => [t, rows?.length ?? 0]));

// ---------- probar-destino ----------

/**
 * Antes de la primera carga (y del corte): revisa, SIN escribir nada, que la clave sirve y ve lo que la importación
 * necesita: la API de admin de Auth, cada tabla, la RPC migration_sync_passwords, el bucket scoreboards con su
 * límite, y cuánto de BowlingX ya se cargó.
 */
async function cmdCheckTarget(a: Args): Promise<number> {
  const envFile = flag(a, 'env');
  if (envFile) loadEnvFile(envFile);
  const env = checkSupabaseEnv(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
  log(`Proyecto: ${env.url}${env.ref ? ` (${env.ref})` : ''} · clave ${env.key.slice(0, 10)}…`);
  const sb = createNodeClient(env.url, env.key);
  const target = createSupabaseTarget({ url: env.url, secretKey: env.key, client: sb });
  let ok = true;
  const line = (good: boolean, msg: string) => {
    if (!good) ok = false;
    log(`${good ? 'bien ' : 'MAL  '} ${msg}`);
  };
  try {
    const users = await target.listUsers();
    line(true, `Auth (API de admin): ${users.length} cuentas, ${users.filter((u) => u.firebaseUid).length} de BowlingX.`);
  } catch (e) {
    line(false, `Auth (API de admin): ${(e as Error).message}`);
    return 2; // Sin clave que sirva no tiene sentido seguir.
  }
  for (const t of TABLES) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
    line(!error, `${t}: ${error ? `${error.message}${error.code ? ` [${error.code}]` : ''}` : `${count ?? 0} filas`}`);
  }
  try {
    const n = await target.syncPasswords([]);
    line(n !== null, n === null ? 'RPC migration_sync_passwords: falta (aplica supabase/migrations/20260928000100_migracion_claves.sql).' : 'RPC migration_sync_passwords: está.');
  } catch (e) {
    line(false, `RPC migration_sync_passwords: ${(e as Error).message}`);
  }
  const { data: bucket, error: bErr } = await sb.storage.getBucket('scoreboards');
  if (bErr || !bucket) line(false, `Bucket scoreboards: ${bErr?.message ?? 'no existe'}`);
  else {
    const mimes = bucket.allowed_mime_types ?? [];
    line(
      !bucket.public && bucket.file_size_limit === 1048576 && mimes.includes('image/jpeg') && mimes.includes('image/webp'),
      `Bucket scoreboards: ${bucket.public ? 'PÚBLICO' : 'privado'}, límite ${bucket.file_size_limit ?? 'ninguno'} bytes, tipos ${mimes.join(', ') || 'todos'}.`,
    );
  }
  try {
    const leagues = (await target.leagueIds()).filter(isMigratedId);
    log(`       Ligas de BowlingX ya cargadas: ${leagues.length}${leagues.length ? ' (volver a correr la importación las pone al día)' : ''}.`);
  } catch (e) {
    line(false, `leagues: ${(e as Error).message}`);
  }
  log(ok ? '\nTodo listo para importar.' : '\nHay cosas en MAL: arréglalas antes de importar.');
  return ok ? 0 : 2;
}

// ---------- sintetico ----------

async function cmdSynthetic(a: Args): Promise<number> {
  const out = resolve(flag(a, 'salida') ?? 'bowlingx-sintetico');
  const exp = makeSyntheticExport({ seed: flag(a, 'semilla') ? Number(flag(a, 'semilla')) : undefined });
  for (const [rel, data] of exp.files) {
    mkdirSync(dirname(join(out, rel)), { recursive: true });
    writeFileSync(join(out, rel), data);
  }
  writeFileSync(join(out, 'bowlingx.json'), JSON.stringify(exp.backup, null, 1));
  writeFileSync(join(out, 'users.json'), JSON.stringify(exp.auth, null, 1));
  writeFileSync(join(out, 'hash.txt'), exp.hashText);
  writeFileSync(join(out, 'claves-de-prueba.json'), JSON.stringify(exp.passwords, null, 1));
  const s = syntheticSummary(exp);
  log(
    `Listo en ${out}: ${s.leagues} ligas, ${s.accounts} cuentas, ${s.players} jugadores, ${s.events} eventos, ${s.entries} participaciones ` +
      `(${s.games} juegos), ${s.photos} fotos, ${s.submissions} envíos, ${s.reactions} reacciones, ${s.comments} comentarios, ${s.suggestions} sugerencias.`,
  );
  log(`Ensayo: node scripts/migrar/cli.mjs importar --datos ${out} --auth ${join(out, 'users.json')} --hash ${join(out, 'hash.txt')} --fotos-meses 6`);
  return 0;
}

// ---------- torneo ----------

async function cmdTournament(a: Args, root: string): Promise<number> {
  const [file] = a._;
  const league = flag(a, 'liga');
  if (!file || !league) {
    console.error('Uso: torneo <archivo.json> --liga <id-de-la-liga> [--reemplazar]');
    return 1;
  }
  const envFile = flag(a, 'env') ?? ['.env.local', '.env'].map((f) => join(root, f)).find((f) => existsSync(f));
  if (envFile) loadEnvFile(envFile);
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (en .env.local).');
    return 1;
  }
  const data = readJson<TournamentFile>(file);
  log(`${data.event?.name} (${data.event?.date}) · ${data.players?.length ?? 0} jugadores · ${data.teams?.length ?? 0} equipos`);
  const backend = createSupabaseBackend({ url, publishableKey: key, client: createNodeClient(url, key) });
  const email = process.env.MM_EMAIL || (await ask('Correo de un admin de la liga: '));
  const password = process.env.MM_PASSWORD || (await ask('Contraseña: ', true));
  await backend.auth.signIn(email, password);
  try {
    const r = await importTournament(backend, league, data, { replace: has(a, 'reemplazar'), log });
    log(`Listo: ${r.created} jugadores nuevos, ${r.entered} inscritos, ${r.teams} equipos${r.replaced ? ' (se reemplazó el anterior)' : ''}.`);
    return 0;
  } finally {
    await backend.auth.signOut();
  }
}

// ---------- Entrada ----------

export async function main(argv: string[], ctx: { root: string }): Promise<number> {
  const a = parseArgs(argv);
  const cmd = a._.shift();
  try {
    switch (cmd) {
      case 'exportar':
        return await cmdExport(a);
      case 'probar-clave':
        return await cmdCheckPassword(a);
      case 'importar':
        return await cmdImport(a, ctx.root);
      case 'probar-destino':
        return await cmdCheckTarget(a);
      case 'sintetico':
        return await cmdSynthetic(a);
      case 'torneo':
        return await cmdTournament(a, ctx.root);
      default:
        console.error('Comandos: exportar, probar-clave, probar-destino, sintetico, importar, torneo. Paso a paso en docs/migracion.md.');
        return 1;
    }
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    return 1;
  }
}
