/**
 * SQL del backend local en el navegador: el shim de Supabase y las migraciones, en orden, empaquetados por Vite.
 * Las migraciones que terminan en `_supabase.sql` solo corren en Supabase (usan realtime, storage, pg_cron, vault…).
 * Si todavía no existen, los glob devuelven {} y el build no se rompe.
 */

/** Nombre del archivo, sin carpetas. */
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Ordena por nombre de archivo (el prefijo de fecha de Supabase) y quita las que son solo de Supabase. */
export function orderMigrations(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter((path) => path.endsWith('.sql') && !path.endsWith('_supabase.sql'))
    .sort((a, b) => (baseName(a) < baseName(b) ? -1 : baseName(a) > baseName(b) ? 1 : 0))
    .map((path) => files[path]);
}

const shim = import.meta.glob<string>('/supabase/local/shim.sql', { query: '?raw', import: 'default', eager: true });
const migrations = import.meta.glob<string>('/supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });

/** Shim + migraciones para `createLocalBackend({ sql })`. */
export function loadLocalSql(): string[] {
  const shimSql = Object.values(shim)[0];
  if (!shimSql) throw new Error('Falta supabase/local/shim.sql: sin él no se puede abrir la base local.');
  return [shimSql, ...orderMigrations(migrations)];
}
