/**
 * Validación de consultas (igual en los dos backends) y armado del SQL del backend local.
 * Nunca se mete en el SQL un nombre que no pase `IDENT`; los valores van siempre como parámetros ($1, $2…).
 */
import { BackendError, type Filter, type SelectQuery } from './types';

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Tabla, columna, función o argumento: minúsculas, números y _, máximo 63 (límite de Postgres). */
export function checkIdent(name: unknown, what = 'Nombre'): string {
  if (typeof name !== 'string' || name.length > 63 || !IDENT.test(name)) {
    throw new BackendError(`${what} inválido: ${String(name)}`, 'validation', 'invalid_identifier');
  }
  return name;
}

export const quoteIdent = (name: string, what?: string) => `"${checkIdent(name, what)}"`;

/** Columnas de `select`: '*' o una lista separada por coma, sin joins ni alias. */
export function parseColumns(columns?: string): '*' | string[] {
  const raw = (columns ?? '*').trim();
  if (raw === '*' || raw === '') return '*';
  return raw.split(',').map((c) => checkIdent(c.trim(), 'Columna'));
}

/** Fechas a texto ISO (como las manda supabase-js en JSON); lo demás igual. */
export function normalizeValue(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normalizeValue);
  return v;
}

const isScalar = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date;

function checkFilter(f: Filter): void {
  checkIdent(f.col, 'Columna');
  const bad = (why: string) => new BackendError(`Filtro inválido en ${f.col}: ${why}`, 'validation', 'invalid_filter');
  switch (f.op) {
    case 'eq':
    case 'neq':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      if (f.value === null || f.value === undefined) throw bad(`para comparar con null usa 'is'`);
      if (!isScalar(f.value)) throw bad('el valor tiene que ser texto, número, booleano o fecha');
      return;
    case 'in':
      if (!Array.isArray(f.value) || !f.value.every(isScalar)) throw bad(`'in' necesita un arreglo de valores`);
      return;
    case 'is':
      if (f.value !== null && f.value !== true && f.value !== false) throw bad(`'is' solo acepta null, true o false`);
      return;
    case 'contains':
      if (!Array.isArray(f.value) || !f.value.every(isScalar)) throw bad(`'contains' necesita un arreglo`);
      return;
    default:
      throw bad(`operador desconocido '${String((f as { op?: unknown }).op)}'`);
  }
}

/** Revisa toda la consulta; lanza BackendError('validation') si algo no cuadra. */
export function checkSelect(q: SelectQuery): void {
  checkIdent(q.table, 'Tabla');
  parseColumns(q.columns);
  for (const f of q.filters ?? []) checkFilter(f);
  for (const o of q.order ?? []) checkIdent(o.col, 'Columna');
  if (q.limit !== undefined && (!Number.isInteger(q.limit) || q.limit < 0)) {
    throw new BackendError(`Límite inválido: ${String(q.limit)}`, 'validation', 'invalid_limit');
  }
}

const OPS: Record<Exclude<Filter['op'], 'in' | 'is' | 'contains'>, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

export interface BuiltSql {
  sql: string;
  params: unknown[];
}

/**
 * SELECT del backend local. Devuelve una sola fila con `data` = arreglo JSON, armado por Postgres con
 * `json_agg` igual que PostgREST: fechas en texto ISO, numeric como número, arreglos y jsonb tal cual.
 */
export function buildSelectSql(q: SelectQuery): BuiltSql {
  checkSelect(q);
  const params: unknown[] = [];
  const param = (v: unknown) => {
    params.push(normalizeValue(v));
    return `$${params.length}`;
  };
  const cols = parseColumns(q.columns);
  const where = (q.filters ?? []).map((f) => {
    const col = quoteIdent(f.col);
    switch (f.op) {
      case 'in':
        return `${col} = any(${param(f.value)})`;
      case 'is':
        return `${col} is ${f.value === null ? 'null' : f.value ? 'true' : 'false'}`;
      case 'contains':
        return `${col} @> ${param(f.value)}`;
      default:
        return `${col} ${OPS[f.op]} ${param(f.value)}`;
    }
  });
  const order = (q.order ?? []).map((o) => `${quoteIdent(o.col)} ${o.asc === false ? 'desc' : 'asc'}`);
  let inner = `select ${cols === '*' ? '*' : cols.map((c) => `"${c}"`).join(', ')} from public.${quoteIdent(q.table, 'Tabla')}`;
  if (where.length) inner += ` where ${where.join(' and ')}`;
  if (order.length) inner += ` order by ${order.join(', ')}`;
  if (q.limit !== undefined) inner += ` limit ${q.limit}`;
  return { sql: `select coalesce(json_agg(_mm_t), '[]'::json) as data from (${inner}) _mm_t`, params };
}

/**
 * Forma de lo que devuelve una función, para responder igual que PostgREST:
 * - `void`: null;
 * - `set` (returns setof / returns table): arreglo (de filas u, si es setof escalar, de valores);
 * - `single`: el valor si es escalar (int, text, jsonb, uuid[]…) o un objeto si devuelve una fila (returns <tabla> u OUT).
 */
export type RpcShape = 'void' | 'set' | 'single';

/** Llamada con argumentos por nombre: public.fn(p_a => $1, p_b => $2). Los `undefined` se omiten (usan el default). */
export function buildRpcSql(fn: string, args: Record<string, unknown> | undefined, shape: RpcShape): BuiltSql {
  const name = `public.${quoteIdent(fn, 'Función')}`;
  // Igual que el JSON que manda supabase-js: sin undefined y con fechas en texto.
  const clean = args === undefined ? {} : (JSON.parse(JSON.stringify(args)) as Record<string, unknown>);
  const params: unknown[] = [];
  const named = Object.entries(clean).map(([k, v]) => {
    params.push(v);
    return `${quoteIdent(k, 'Argumento')} => $${params.length}`;
  });
  const call = `${name}(${named.join(', ')})`;
  if (shape === 'void') return { sql: `select ${call}`, params };
  if (shape === 'set') return { sql: `select coalesce(json_agg(_mm_r), '[]'::json) as data from ${call} _mm_r`, params };
  return { sql: `select to_json(_mm_r) as data from ${call} _mm_r`, params };
}
