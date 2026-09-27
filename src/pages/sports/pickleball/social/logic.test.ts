import { describe, expect, it } from 'vitest';
import { tryParse } from '../../../../components/match';
import { scheduleStats } from '../../../../sports/formats';
import { nightRounds } from '../../racket/logic/night';
import { pts } from '../../racket/logic/testMatch';
import {
  DEFAULT_GAME,
  gameMatchRules,
  gameParser,
  gameText,
  isSocialEvent,
  mixedRound,
  newSocialConfig,
  nextSocialRound,
  parseGame,
  parseSocialConfig,
  redoSocialRound,
  socialConfigJson,
  socialDrafts,
  socialShareText,
  socialTable,
} from './logic';

const P = (n: number, pre = 'p') => Array.from({ length: n }, (_, i) => `${pre}${i + 1}`);

describe('configuración del round robin social', () => {
  it('juego a 11, ganando por 2, tradicional por defecto; lo que no sirve se descarta', () => {
    expect(parseGame(undefined)).toEqual(DEFAULT_GAME);
    expect(parseGame({ to: 15, winBy: 1, scoring: 'rally' })).toEqual({ to: 15, winBy: 1, scoring: 'rally' });
    expect(parseGame({ to: 40, winBy: 3 })).toEqual({ to: 11, winBy: 2, scoring: 'sideout' });
    expect(gameText({ to: 21, winBy: 2, scoring: 'rally' })).toBe('Juego a 21, ganando por 2, conteo por rally');
  });

  it('se guarda como americano con el juego y el mixto; sin bono por descansar', () => {
    const c = newSocialConfig({ players: P(8), courts: ['Cancha 1', 'Cancha 2'], mixed: ['p1', 'p2', 'p3', 'p4'], seed: 's' });
    const json = socialConfigJson(c);
    expect(json).toMatchObject({ format: 'americano', rest: 'none', game: DEFAULT_GAME, points: { mode: 'game', target: 11 }, mixed: ['p1', 'p2', 'p3', 'p4'] });
    const back = parseSocialConfig(json);
    expect(back.game).toEqual(DEFAULT_GAME);
    expect(back.mixed).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(back.players).toEqual(P(8));
    expect(isSocialEvent({ type: 'americano', config: json })).toBe(true);
    expect(isSocialEvent({ type: 'americano', config: { format: 'americano' } })).toBe(false);
    // Del mixto solo quedan los que juegan.
    expect(parseSocialConfig({ ...json, mixed: ['p1', 'x'] }).mixed).toEqual(['p1']);
  });
});

describe('rondas', () => {
  it('libre: el calendario del americano (sin repetir compañero)', () => {
    const cfg = newSocialConfig({ players: P(8), courts: ['C1', 'C2'], rounds: 7, seed: 'rr' });
    const seen = new Set<string>();
    let c = cfg;
    const rounds = [];
    for (let r = 1; r <= 7; r++) {
      const next = nextSocialRound(c, []);
      expect(next.ok).toBe(true);
      if (!next.ok) return;
      if (next.config) c = { ...c, ...next.config };
      c = { ...c, round: r };
      rounds.push(next.social);
      for (const m of next.social.matches) for (const pair of [m.side1, m.side2]) seen.add([...pair].sort().join('+'));
    }
    expect(scheduleStats(P(8), rounds).maxPartner).toBe(1);
    expect(seen.size).toBe(28);
  });

  it('mixto: cada pareja con uno de cada grupo y compañero distinto cada ronda', () => {
    const A = P(4, 'a');
    const B = P(4, 'b');
    const partners = new Set<string>();
    for (let r = 1; r <= 4; r++) {
      const round = mixedRound(A, B, { round: r, courts: 2, seed: 's' });
      expect(round.matches).toHaveLength(2);
      expect(round.rests).toEqual([]);
      for (const m of round.matches) {
        for (const [x, y] of [m.side1, m.side2]) {
          expect(A.includes(x) !== A.includes(y)).toBe(true);
          partners.add([x, y].sort().join('+'));
        }
      }
    }
    expect(partners.size).toBe(16);
  });

  it('mixto con grupos desparejos: los que sobran descansan por turnos', () => {
    const A = P(5, 'a');
    const B = P(4, 'b');
    const prev = [];
    const rested = new Map<string, number>();
    for (let r = 1; r <= 5; r++) {
      const round = mixedRound(A, B, { round: r, courts: 2, seed: 's', previous: prev });
      expect(round.rests).toHaveLength(1);
      for (const p of round.rests) rested.set(p, (rested.get(p) ?? 0) + 1);
      prev.push(round);
    }
    // Cada uno de A descansó una vez.
    expect([...rested.values()].every((n) => n === 1)).toBe(true);
    expect(() => mixedRound(['a1'], B, { round: 1, courts: 1, seed: 's' })).toThrow('al menos 2');
  });

  it('nextSocialRound en mixto: pide 2 de cada grupo; rehacer con otro sorteo', () => {
    const cfg = newSocialConfig({ players: P(8), courts: ['C1', 'C2'], rounds: 3, mixed: ['p1'], seed: 's' });
    expect(nextSocialRound(cfg, [])).toEqual({ ok: false, reason: 'En mixto hacen falta al menos 2 de cada grupo.' });
    const ok = nextSocialRound({ ...cfg, mixed: ['p1', 'p2', 'p3', 'p4'] }, []);
    expect(ok.ok && ok.round).toBe(1);
    expect(redoSocialRound(cfg, [], 'x')).toEqual({ ok: false, reason: 'Todavía no hay ronda.' });
  });
});

describe('partidos y tabla', () => {
  it('cada partido es un juego de pickleball en dobles, a 11 (o lo que diga la noche), sin total fijo', () => {
    const cfg = newSocialConfig({ players: P(4), courts: ['Cancha 1'], game: { to: 15, winBy: 2, scoring: 'rally' }, seed: 's' });
    const { drafts, rests } = socialDrafts(cfg, { round: 1, matches: [{ court: 1, side1: ['p1', 'p2'], side2: ['p3', 'p4'] }], rests: [] }, { match: { sport: 'pickleball', doubles: false } });
    expect(rests).toEqual([]);
    expect(drafts[0]).toMatchObject({ court: 'Cancha 1', format: 'americano', requireConfirm: false });
    expect(drafts[0].rules).toMatchObject({ points: { mode: 'game', target: 15 }, match: { sport: 'pickleball', doubles: true, bestOf: 1, gameTo: 15, scoring: 'rally', switchAt: 8 } });
    expect(gameMatchRules(DEFAULT_GAME)).toMatchObject({ gameTo: 11, winBy: 2, switchAt: 6 });
  });

  it('tabla: ganados → dif. de puntos → puntos a favor (no la suma de puntos)', () => {
    const cfg = parseSocialConfig({ players: P(4), game: DEFAULT_GAME });
    const ms = [pts(1, 'C1', ['p1', 'p2'], ['p3', 'p4'], 11, 9), pts(2, 'C1', ['p1', 'p3'], ['p2', 'p4'], 3, 11), pts(3, 'C1', ['p1', 'p4'], ['p2', 'p3'], 11, 2)];
    const rounds = nightRounds(cfg, ms, Date.now());
    const t = socialTable(P(4), rounds);
    // p1: 2 G (+2 -8 +9 = +3); p2: 2 G (+2 +8 -9 = +1); p4: 2 G (-2 +8 +9 = +15); p3: 0 G.
    expect(t.map((r) => r.id)).toEqual(['p4', 'p1', 'p2', 'p3']);
    expect(t[0]).toMatchObject({ won: 2, points: 2, diff: 15 });
    expect(t[1].decidedBy).toBe('dif. de puntos');
    const text = socialShareText({ title: 'Round robin', rows: t, nameOf: (id) => id.toUpperCase(), final: true });
    expect(text).toContain('Tabla final');
    expect(text).toContain('1. P4: 2 G, 1 P (+15)');
  });

  it('lector del marcador: final posible del juego', () => {
    const parse = gameParser(DEFAULT_GAME);
    expect(parse('11-7')).toMatchObject({ score: { text: '11-7', sides: [11, 7] }, winner: 1 });
    expect(parse('9 11').winner).toBe(2);
    expect(parse('13-11').winner).toBe(1);
    expect(tryParse(parse, '11-10')).toEqual({ ok: false, error: '11-10 no termina un juego a 11 ganando por 2.' });
    expect(tryParse(parse, '12-7').ok).toBe(false);
    expect(tryParse(parse, 'once').ok).toBe(false);
    expect(gameParser({ to: 11, winBy: 1, scoring: 'sideout' })('11-10').winner).toBe(1);
  });
});
