/**
 * Puntuación de boliche (10 pinos) a partir de los tiros en orden.
 * Cuadros 1–9: strike (X) = 10 + los 2 tiros siguientes; spare (/) = 10 + el siguiente.
 * Cuadro 10: hasta 3 tiros si hay strike o spare.
 */

export const ALL_PINS = 0b11_1111_1111;

export interface FrameView {
  /** Marcas de cada tiro del cuadro: 'X', '/', '-', '7'… */
  marks: string[];
  /** Pinos de cada tiro del cuadro. */
  rolls: number[];
  /** Índice en la lista de tiros donde empieza el cuadro. */
  start: number;
  /** Puntaje acumulado hasta este cuadro; null mientras falten tiros para saberlo. */
  total: number | null;
}

export interface GameView {
  frames: FrameView[];
  /** Último acumulado conocido. */
  score: number;
  complete: boolean;
}

/** Tiros de cada cuadro (el 10 puede tener 3). */
function split(rolls: readonly number[]) {
  const frames: { start: number; rolls: number[] }[] = [];
  let i = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    const n = f === 9 ? 3 : rolls[i] === 10 ? 1 : 2;
    frames.push({ start: i, rolls: rolls.slice(i, i + n) });
    i += n;
  }
  return frames;
}

function marksOf(rolls: number[], tenth: boolean): string[] {
  const out: string[] = [];
  let fresh = true; // quedan los 10 pinos parados
  let standing = 10;
  rolls.forEach((r) => {
    if (fresh && r === 10) out.push('X');
    else if (!fresh && r === standing) out.push('/');
    else out.push(r === 0 ? '-' : String(r));
    if (!tenth) {
      fresh = false;
      standing = 10 - r;
      return;
    }
    // En el 10 se vuelve a parar todo después de un strike o de un spare.
    if (fresh && r === 10) {
      fresh = true;
      standing = 10;
    } else if (!fresh && r === standing) {
      fresh = true;
      standing = 10;
    } else {
      fresh = false;
      standing = standing - r;
    }
  });
  return out;
}

export function scoreGame(rolls: readonly number[]): GameView {
  const parts = split(rolls);
  const frames: FrameView[] = [];
  let running = 0;
  let known = true;
  parts.forEach((p, f) => {
    let value: number | null;
    const [a = 0, b = 0] = p.rolls;
    if (f === 9) {
      const need = a === 10 || a + b === 10 ? 3 : 2;
      value = p.rolls.length >= need ? p.rolls.slice(0, need).reduce((s, r) => s + r, 0) : null;
    } else if (a === 10) {
      const next = rolls.slice(p.start + 1, p.start + 3);
      value = next.length === 2 ? 10 + next[0] + next[1] : null;
    } else if (p.rolls.length === 2 && a + b === 10) {
      const next = rolls[p.start + 2];
      value = next != null ? 10 + next : null;
    } else {
      value = p.rolls.length === 2 ? a + b : null;
    }
    if (value == null) known = false;
    if (known && value != null) running += value;
    frames.push({ marks: marksOf(p.rolls, f === 9), rolls: p.rolls, start: p.start, total: known && value != null ? running : null });
  });
  return { frames, score: running, complete: maxNextRoll(rolls) < 0 };
}

/**
 * Máximo de pinos que puede tumbar el próximo tiro (los que quedan parados).
 * -1 si el juego ya terminó.
 */
export function maxNextRoll(rolls: readonly number[]): number {
  const s = standingNow(rolls);
  return s == null ? -1 : s.standing;
}

/** Si el próximo tiro es con los 10 pinos parados (se puede marcar X) y cuántos quedan. null = juego terminado. */
export function standingNow(rolls: readonly number[]): { standing: number; fresh: boolean; frame: number; roll: number } | null {
  const parts = split(rolls);
  const used = parts.reduce((n, p) => n + p.rolls.length, 0);
  if (used < rolls.length) return null; // sobran tiros: juego inválido/terminado
  const last = parts[parts.length - 1];
  if (!last) return { standing: 10, fresh: true, frame: 0, roll: 0 };
  const f = parts.length - 1;
  const [a, b] = last.rolls;
  if (f < 9) {
    if (last.rolls.length === 1 && a !== 10) return { standing: 10 - a, fresh: false, frame: f, roll: 1 };
    return { standing: 10, fresh: true, frame: f + 1, roll: 0 };
  }
  // Cuadro 10
  if (last.rolls.length === 1) return a === 10 ? { standing: 10, fresh: true, frame: 9, roll: 1 } : { standing: 10 - a, fresh: false, frame: 9, roll: 1 };
  if (last.rolls.length === 2) {
    if (a === 10) return b === 10 ? { standing: 10, fresh: true, frame: 9, roll: 2 } : { standing: 10 - b, fresh: false, frame: 9, roll: 2 };
    if (a + b === 10) return { standing: 10, fresh: true, frame: 9, roll: 2 };
    return null;
  }
  return null;
}

/** ¿La lista de tiros es un juego válido (se puede seguir o ya terminó)? */
export function validRolls(rolls: readonly number[]): boolean {
  for (let i = 0; i < rolls.length; i++) {
    const r = rolls[i];
    if (!Number.isInteger(r) || r < 0) return false;
    const max = maxNextRoll(rolls.slice(0, i));
    if (max < 0 || r > max) return false;
  }
  return true;
}

/**
 * Segundo tiro del mismo "rack" cuando cambia el primero (ninguno es strike): un spare sigue siendo spare
 * (el segundo se ajusta) y un cuadro abierto sigue abierto; si el segundo ya no cabe, null.
 */
function keepSecond(oldFirst: number, second: number, newFirst: number): number | null {
  if (oldFirst + second === 10) return 10 - newFirst;
  return second < 10 - newFirst ? second : null;
}

/**
 * Corrige el tiro `i` con `pins` sin perder los cuadros siguientes (cada cuadro de la 1 a la 9 empieza
 * con los 10 pinos, así que no dependen del anterior). El spare sigue spare y el cuadro abierto sigue abierto.
 * `extra` va alineado con los tiros (p. ej. los pines marcados) y lo que cambia queda con `fill`.
 * Si el cuadro necesita otro tiro (una X que pasó a ser 7, o el segundo ya no cabe), ese tiro queda en 0
 * y se devuelve en `next` para escribirlo enseguida. En el cuadro 10, lo que ya no tiene sentido se quita
 * y se vuelve a anotar al final.
 */
export function replaceRoll<M>(
  rolls: readonly number[],
  extra: readonly M[],
  i: number,
  pins: number,
  fill: M,
): { rolls: number[]; extra: M[]; next: number | null } {
  const frames = scoreGame(rolls).frames;
  const f = frames.findIndex((fr) => i >= fr.start && i < fr.start + fr.rolls.length);
  if (f < 0) return { rolls: [...rolls], extra: [...extra], next: null };
  const fr = frames[f];
  const end = fr.start + fr.rolls.length;
  const k = i - fr.start;
  const [a, b, c] = fr.rolls;
  const xs = Array.from({ length: rolls.length }, (_, j) => (j < extra.length ? extra[j] : fill));
  // Los tiros del cuadro que no cambiaron conservan su dato; el resto queda con `fill`.
  const build = (frame: number[], next: number | null = null) => ({
    rolls: [...rolls.slice(0, fr.start), ...frame, ...rolls.slice(end)],
    extra: [...xs.slice(0, fr.start), ...frame.map((v, j) => (j !== k && v === fr.rolls[j] ? xs[fr.start + j] : fill)), ...xs.slice(end)],
    next,
  });

  if (f < 9) {
    if (k === 1) return build([a, pins]);
    if (pins === 10) return build([10]); // pasó a strike: el segundo tiro sobra
    if (b == null) {
      // Era strike (o el cuadro va por el primer tiro): si hay cuadros después, falta el segundo tiro.
      return end < rolls.length ? build([pins, 0], i + 1) : build([pins]);
    }
    const second = keepSecond(a, b, pins);
    return second == null ? build([pins, 0], i + 1) : build([pins, second]);
  }

  // Cuadro 10 (siempre es el último): se conserva lo que sigue si sigue teniendo sentido; si no, se quita.
  if (k === 0) {
    if (a === 10 && pins === 10) return build([...fr.rolls]);
    if (a === 10 || pins === 10 || b == null) return build([pins]);
    const second = keepSecond(a, b, pins);
    if (second == null) return build([pins]);
    return build(c != null ? [pins, second, c] : [pins, second]);
  }
  if (k === 1) {
    if (a === 10) {
      // Tras la X, el segundo tiro es con los 10 pinos; el tercero depende de él.
      if ((b === 10) !== (pins === 10)) return build([a, pins]);
      if (pins === 10 || c == null) return build(c != null ? [a, pins, c] : [a, pins]);
      const third = keepSecond(b, c, pins);
      return build(third == null ? [a, pins] : [a, pins, third]);
    }
    // Segundo tiro del primer rack: el tercero solo existe con spare.
    return build(a + pins === 10 && a + b === 10 && c != null ? [a, pins, c] : [a, pins]);
  }
  return build([a, b, pins]);
}

export interface FrameStats {
  strikes: number;
  spares: number;
  /** Cuadros sin strike ni spare. */
  opens: number;
  /** Tiros de bola uno (para el promedio de primera bola). */
  firstBalls: number[];
}

export function frameStats(rolls: readonly number[]): FrameStats {
  const stats: FrameStats = { strikes: 0, spares: 0, opens: 0, firstBalls: [] };
  split(rolls).forEach((p, f) => {
    if (f < 9) {
      const [a, b] = p.rolls;
      stats.firstBalls.push(a);
      if (a === 10) stats.strikes++;
      else if (p.rolls.length === 2) (a + b === 10 ? stats.spares++ : stats.opens++);
      return;
    }
    // Cuadro 10: cada X y cada / cuentan.
    const marks = marksOf(p.rolls, true);
    stats.firstBalls.push(p.rolls[0]);
    marks.forEach((m) => (m === 'X' ? stats.strikes++ : m === '/' ? stats.spares++ : undefined));
    if (p.rolls.length === 2 && p.rolls[0] + p.rolls[1] < 10) stats.opens++;
  });
  return stats;
}

export const bitCount = (mask: number) => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
};

/**
 * Pinos parados antes del próximo tiro según los pines marcados en cada tiro (bit 0 = pin 1).
 * Si falta la máscara de algún tiro del cuadro en curso, se supone que quedan los pinos de atrás.
 */
export function standingMask(rolls: readonly number[], masks: readonly (number | null)[] | undefined): number {
  const now = standingNow(rolls);
  if (!now || now.fresh) return ALL_PINS;
  // Tiro anterior del mismo "rack".
  const i = rolls.length - 1;
  const knocked = masks?.[i];
  if (knocked != null) return ALL_PINS & ~knocked;
  // Sin máscara: se dejan parados los pinos de mayor número (solo para dibujar).
  let mask = 0;
  for (let p = 9; p >= 0 && bitCount(mask) < now.standing; p--) mask |= 1 << p;
  return mask;
}
