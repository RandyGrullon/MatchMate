import { describe, expect, it } from 'vitest';
import { createLocalBackend } from './local';
import { loadLocalSql, orderMigrations } from './migrations';

describe('orden de las migraciones', () => {
  it('por nombre de archivo, sin las que son solo de Supabase', () => {
    const files = {
      '/supabase/migrations/20260927000000_b.sql': 'b',
      '/supabase/migrations/20260926000200_realtime_supabase.sql': 'solo supabase',
      '/supabase/migrations/20260926000100_a.sql': 'a',
      '/supabase/migrations/notas.txt': 'no',
    };
    expect(orderMigrations(files)).toEqual(['a', 'b']);
    expect(orderMigrations({})).toEqual([]);
  });
});

// Los archivos reales (si ya existen): el shim y todas las migraciones cargan en PGlite sin error.
const haveShim = Object.keys(import.meta.glob('/supabase/local/shim.sql')).length > 0;
const haveMigrations = Object.keys(import.meta.glob('/supabase/migrations/*.sql')).length > 0;

describe.skipIf(!haveShim || !haveMigrations)('shim y migraciones reales', () => {
  it('cargan todas en orden y se puede crear una cuenta local', async () => {
    const sql = loadLocalSql();
    expect(sql.length).toBeGreaterThan(1);
    const b = await createLocalBackend({ sql });
    try {
      const s = await b.auth.signUp('prueba@example.com', 'secreto1', 'Prueba');
      expect(s?.email).toBe('prueba@example.com');
      expect((await b.auth.getSession())?.userId).toBe(s?.userId);
      // Volver a abrir sobre la misma base no corre nada de nuevo.
      const again = await createLocalBackend({ sql, db: b.db });
      await again.close();
    } finally {
      await b.close();
    }
  }, 120_000);
});
