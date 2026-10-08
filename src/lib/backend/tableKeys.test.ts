import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pagedOrder } from './supabase';

/**
 * Cada tabla que la app lee con `select` se pide ordenada por su clave (para paginar). Si la tabla no tiene `id` y no
 * está en TABLE_KEYS, Supabase responde 400 («column … id does not exist») y la pantalla dice «No se pudieron cargar
 * los datos» (el modo local no lo nota: PGlite no aplica ese orden). Esta prueba cruza las tablas que lee la app con las
 * columnas de las migraciones.
 */
const root = join(__dirname, '..', '..', '..');

function filesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** El texto de cada `create table public.<nombre> (…);` de todas las migraciones (la última definición gana). */
function tableBlocks(): Map<string, string> {
  const dir = join(root, 'supabase', 'migrations');
  const blocks = new Map<string, string>();
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const m of sql.matchAll(/create table public\.([a-z_]+) \(([\s\S]*?)\n\);/g)) blocks.set(m[1], m[2]);
  }
  return blocks;
}

/** Las tablas que la app lee con `select({ table: '…' })`. */
function tablesRead(): Set<string> {
  const names = new Set<string>();
  for (const file of filesUnder(join(root, 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/table:\s*'([a-z_]+)'/g)) names.add(m[1]);
  }
  return names;
}

describe('orden para paginar: la clave de cada tabla existe', () => {
  const blocks = tableBlocks();
  const read = [...tablesRead()].filter((t) => blocks.has(t)).sort();

  it('encuentra las tablas que lee la app (incluidas las de esports)', () => {
    expect(read.length).toBeGreaterThan(20);
    expect(read).toContain('esports_tournaments');
  });

  it.each(read)('%s', (table) => {
    const block = blocks.get(table)!;
    for (const { col } of pagedOrder({ table, columns: '*' })) {
      expect(new RegExp(`(^|\\n)\\s*${col}\\s`).test(block), `${table} no tiene la columna «${col}»: agrégala a TABLE_KEYS`).toBe(true);
    }
  });
});
