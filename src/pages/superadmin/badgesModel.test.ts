import { describe, expect, it } from 'vitest';
import { badgeDef, rarityOf } from '../../badges/catalog';
import { toBadgeEngine, toBadgeReports, toBlockedTerms } from '../../lib/data/badgeAdmin';
import { MIN_BASE, jobKindLabel, rarityDrift, rarityOfPct, rarityRow, rarityRows, raritySummary, reportedView, shortError } from './badgesModel';

describe('rareza contra la meta del catálogo (§1.7.9)', () => {
  it('el porcentaje cae en su rango', () => {
    expect([60, 40, 39.9, 15, 14.9, 5, 4.9, 1, 0.9, 0].map(rarityOfPct)).toEqual(['C', 'C', 'PC', 'PC', 'R', 'R', 'E', 'E', 'L', 'L']);
    expect(rarityDrift('R', 'C')).toBe(2);
    expect(rarityDrift('C', 'L')).toBe(-4);
    expect(rarityDrift('E', 'E')).toBe(0);
  });

  it('una fila: nombre, nivel, meta y veredicto; con base chica no se juzga', () => {
    const def = badgeDef('bowling_games')!;
    const target = rarityOf(def, 1, 'bowling');
    expect(target).toBeTruthy();
    const easy = rarityRow({ key: 'bowling_games', sport: 'bowling', level: 1, holders: 90, base: 100, pct: 90 })!;
    expect(easy).toMatchObject({ name: expect.any(String), levelName: expect.any(String), measured: 'C', base: 100 });
    expect(easy.verdict).toBe(target === 'C' ? 'ok' : 'facil');
    const small = rarityRow({ key: 'bowling_games', sport: 'bowling', level: 1, holders: 1, base: MIN_BASE - 1, pct: null })!;
    expect(small.pct).toBeCloseTo(2, 0);
    expect(small.verdict).toBe('poca_base');
    expect(rarityRow({ key: 'no_existe', sport: 'bowling', level: 1, holders: 1, base: 1, pct: 100 })).toBeNull();
    // bowlingx_roots es un conjunto cerrado: sin meta.
    expect(rarityRow({ key: 'bowlingx_roots', sport: 'bowling', level: 0, holders: 5, base: 100, pct: 5 })!.verdict).toBe('sin_meta');
  });

  it('lo más desviado primero y el resumen', () => {
    // El nivel más alto con meta de Líneas jugadas (Épica o Legendaria): al 99 % sale muy fácil.
    const top = badgeDef('bowling_games')!.levels.map((l) => l.level).filter((l) => ['E', 'L'].includes(String(rarityOf(badgeDef('bowling_games')!, l, 'bowling')))).at(-1)!;
    expect(top).toBeGreaterThan(0);
    const rows = rarityRows([
      { key: 'bowlingx_roots', sport: 'bowling', level: 0, holders: 5, base: 100, pct: 5 },
      { key: 'bowling_games', sport: 'bowling', level: top, holders: 99, base: 100, pct: 99 },
      { key: 'debut', sport: 'bowling', level: 0, holders: 80, base: 100, pct: 80 },
    ]);
    expect(rows[0].key).toBe('bowling_games');
    expect(rows.at(-1)!.key).toBe('bowlingx_roots');
    const sum = raritySummary(rows);
    expect(sum.total).toBe(3);
    expect(sum.ok + sum.easy + sum.hard + sum.unjudged).toBe(3);
    expect(sum.easy).toBeGreaterThanOrEqual(1);
  });
});

describe('el motor y los reportes', () => {
  it('nombres de los trabajos y errores cortos', () => {
    expect(jobKindLabel('vinculo')).toBe('Vínculo o reclamo');
    expect(jobKindLabel('otra')).toBe('otra');
    expect(shortError(null)).toMatch(/sin tiempo|CPU/);
    expect(shortError(`motor: TypeError: x\n    at y`)).toBe('motor: TypeError: x');
    expect(shortError('x'.repeat(300))).toHaveLength(160);
  });

  it('lee admin_badges_engine (y aguanta lo que falta)', () => {
    expect(toBadgeEngine(null)).toBeNull();
    const e = toBadgeEngine({
      queue: { pending: 3, due: '2', locked: 0, dead: 1, notices: 4, oldestDue: '2026-10-05T16:00:00.000Z' },
      byKind: [{ kind: 'resultado', pending: 2, dead: 1 }],
      dead: [{ id: 7, kind: 'resultado', ref: 'entry:x', attempts: 5, lastError: null, runAfter: 'a', createdAt: 'b' }],
      backfill: [{ runId: 'r1', dryRun: true, pending: 5, dead: 0 }],
      runs: [{ runId: 'r1', at: 'c', badges: 10, holders: 40 }],
      dryRun: { runId: 'r1', rows: [{ key: 'debut', sport: 'bowling', level: 0, holders: 4, base: 5, pct: 80 }, { key: 'x', sport: 'golf', level: 1, holders: 0, base: 0, pct: null }] },
      periods: [],
    })!;
    expect(e.queue).toEqual({ pending: 3, due: 2, locked: 0, dead: 1, notices: 4, oldestDue: '2026-10-05T16:00:00.000Z' });
    expect(e.dead[0]).toMatchObject({ id: 7, leagueName: null, lastError: null });
    expect(e.dryRun!.rows[1].pct).toBeNull();
    expect(toBadgeEngine({})!.dryRun).toBeNull();
  });

  it('lee los reportes y las palabras; cómo se ve lo reportado', () => {
    const r = toBadgeReports({
      open: 2,
      rows: [
        {
          id: 1,
          kind: 'insignia',
          reason: 'no jugó',
          createdAt: 'x',
          sameTarget: 2,
          leagueName: 'Los Pinos',
          award: { id: 'a1', key: 'bowling_games', sport: 'bowling', level: 2, periodKey: '-', status: 'firme', playerName: 'Ana', context: {} },
        },
        {
          id: 2,
          kind: 'diseno',
          reason: '',
          createdAt: 'y',
          design: { id: 'd1', leagueId: 'L', name: 'Campeón', shape: 'shield', palette: 'oro', icon: 'trophy', status: 'oculta' },
        },
        { nada: true },
      ],
    });
    expect(r.open).toBe(2);
    expect(r.rows).toHaveLength(2);
    const award = reportedView(r.rows[0])!;
    expect(award.detail).toContain('de Ana');
    expect(award.look.tier).toBe('plata');
    const design = reportedView(r.rows[1])!;
    expect(design).toMatchObject({ name: 'Campeón', detail: 'Diseño de la liga · escondido' });
    expect(toBlockedTerms([{ term: 'feo', whole: true, createdAt: 'z' }, { term: '' }, 3])).toEqual([{ term: 'feo', whole: true, createdAt: 'z' }]);
  });
});
