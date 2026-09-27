import { describe, expect, it } from 'vitest';
import { buildRpcSql, buildSelectSql, checkIdent, parseColumns } from './query';
import { BackendError } from './types';

describe('nombres', () => {
  it('solo minúsculas, números y _', () => {
    expect(checkIdent('league_members')).toBe('league_members');
    expect(checkIdent('_x1')).toBe('_x1');
    for (const bad of ['League', '1abc', 'a-b', 'a b', 'a"b', '', 'x'.repeat(64), null, 5]) {
      expect(() => checkIdent(bad)).toThrow(BackendError);
    }
  });

  it('columnas: * o lista simple', () => {
    expect(parseColumns()).toBe('*');
    expect(parseColumns(' * ')).toBe('*');
    expect(parseColumns('id, name')).toEqual(['id', 'name']);
    expect(() => parseColumns('id,profiles(name)')).toThrow(BackendError);
    expect(() => parseColumns('id,')).toThrow(BackendError);
  });
});

describe('SQL del select local', () => {
  it('filtros con parámetros, orden y límite dentro de json_agg', () => {
    const { sql, params } = buildSelectSql({
      table: 'events',
      columns: 'id,name',
      filters: [
        { col: 'league_id', op: 'eq', value: 'L' },
        { col: 'id', op: 'in', value: ['a'] },
        { col: 'deleted_at', op: 'is', value: null },
        { col: 'open', op: 'is', value: false },
        { col: 'tags', op: 'contains', value: ['x'] },
        { col: 'at', op: 'gte', value: new Date('2026-01-01T00:00:00Z') },
      ],
      order: [{ col: 'at', asc: false }, { col: 'name' }],
      limit: 10,
    });
    expect(sql).toBe(
      `select coalesce(json_agg(_mm_t), '[]'::json) as data from (select "id", "name" from public."events"` +
        ` where "league_id" = $1 and "id" = any($2) and "deleted_at" is null and "open" is false and "tags" @> $3 and "at" >= $4` +
        ` order by "at" desc, "name" asc limit 10) _mm_t`,
    );
    expect(params).toEqual(['L', ['a'], ['x'], '2026-01-01T00:00:00.000Z']);
  });
});

describe('SQL de rpc local', () => {
  it('argumentos por nombre, sin undefined, y la forma de la respuesta', () => {
    expect(buildRpcSql('f', { p_a: 1, p_b: undefined, p_c: null }, 'single')).toEqual({
      sql: 'select to_json(_mm_r) as data from public."f"("p_a" => $1, "p_c" => $2) _mm_r',
      params: [1, null],
    });
    expect(buildRpcSql('f', undefined, 'set').sql).toBe(`select coalesce(json_agg(_mm_r), '[]'::json) as data from public."f"() _mm_r`);
    expect(buildRpcSql('f', {}, 'void').sql).toBe('select public."f"()');
    expect(() => buildRpcSql('f', { 'p_a => 1); --': 1 }, 'void')).toThrow(BackendError);
  });
});
