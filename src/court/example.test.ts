/**
 * El ejemplo de docs/partidos.md («enchufar un motor al modo cancha»), probado: un adaptador de pádel con el
 * motor de src/sports/racket, publicando solo en los hitos (fin de juego) y como mucho cada minuto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchScore, PublishResult } from '../lib/data/matches';
import { createRacketEngine, matchTotals, toLive, type MatchSetup, type TennisEvent, type TennisState } from '../sports/racket';
import { createCourtStore } from './log';
import { createCourtMachine, type CourtDeps } from './machine';
import type { CourtAdapter } from './types';
import type { CourtController } from './useCourt';

// ---- Lo que escribe el agente de raqueta ----

export function padelAdapter(rules: Record<string, unknown> = {}): CourtAdapter<MatchSetup, TennisState, TennisEvent> {
  const engine = createRacketEngine('padel', rules);
  return {
    engine,
    score: (s): MatchScore => {
      const t = matchTotals(s);
      // `live` = foto chica para la pantalla «En vivo» (juegos del set, 15/30/40, quién saca).
      return { text: engine.result(s).summary, sides: [t.sets[0], t.sets[1]], live: toLive(s) as unknown as Record<string, unknown> };
    },
    // Hito = terminó un juego o un set.
    milestone: (prev, next) => prev.sets.length !== next.sets.length || prev.games.join() !== next.games.join(),
  };
}

// La pantalla del deporte le pasa su controlador a CourtLayout (acepta el de cualquier deporte).
function acceptsAnySport(c: CourtController<unknown, unknown, unknown>) {
  return c;
}
export function courtLayoutAcceptsPadel(c: CourtController<MatchSetup, TennisState, TennisEvent>) {
  return acceptsAnySport(c);
}

// ---- Prueba ----

const published: { seq: number; score: MatchScore | null }[] = [];
let deps: CourtDeps;

beforeEach(() => {
  vi.useFakeTimers();
  published.length = 0;
  deps = {
    claim: async () => ({ ok: true, scorerId: 'u', scorerName: 'Ana', leaseUntil: null, expired: false, status: 'scheduled', seq: 0, version: 0, state: null }),
    publish: async (p): Promise<PublishResult> => {
      published.push({ seq: p.seq, score: p.score });
      return { ok: true, seq: p.seq };
    },
    finish: async () => ({ ok: true, status: 'finished' }),
    suspend: async () => {},
    store: createCourtStore('memory'),
    origin: 'tel',
  };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('enchufar un motor al modo cancha (ejemplo de la documentación)', () => {
  it('pádel: publica el primer punto, luego solo al terminar cada juego (o cada minuto)', async () => {
    const m = createCourtMachine({ lid: 'L', mid: 'M', userId: 'u', adapter: padelAdapter(), config: { firstServer: 1 }, deps });
    await m.open();
    const point = (side: 1 | 2) => {
      vi.advanceTimersByTime(5_000);
      expect(m.apply({ type: 'point', side })).toBeNull();
    };
    point(1); // 15-0: primera jugada, se publica (el partido sale «En vivo»)
    point(1); // 30-0
    point(1); // 40-0
    expect(published.map((p) => p.seq)).toEqual([1]);
    point(1); // juego: hito → se publica ya
    await vi.runOnlyPendingTimersAsync();
    expect(published.map((p) => p.seq)).toEqual([1, 4]);
    expect(published[1].score).toMatchObject({ sides: [0, 0], live: { now: [1, 0] } });
    point(2);
    // Sin hitos, al minuto de la última publicación.
    vi.advanceTimersByTime(60_000);
    expect(published.map((p) => p.seq)).toEqual([1, 4, 5]);
    expect(m.getView().summary).toContain('1-0');
    expect(typeof courtLayoutAcceptsPadel).toBe('function');
    m.close();
  });
});
