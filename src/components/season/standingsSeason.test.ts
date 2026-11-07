import { describe, expect, it } from 'vitest';
import { hasSavedTable } from './standingsSeason';

describe('la temporada en las tablas', () => {
  it('sin tabla guardada o activa: se calcula', () => {
    expect(hasSavedTable(null)).toBe(false);
    expect(hasSavedTable({ status: 'active', standings: null })).toBe(false);
    expect(hasSavedTable({ status: 'closed', standings: null })).toBe(false);
  });
});
