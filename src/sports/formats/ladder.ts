/**
 * Escalera (ladder): la lista va del 1.º (índice 0) hacia abajo. Se puede retar hasta K puestos más arriba
 * (3 por defecto). Si gana el retador, toma el puesto del retado y este baja uno (los del medio también bajan
 * uno); si pierde, nada cambia. Se usan los puestos del momento en que se juega. Hay plazo para aceptar y
 * para jugar; si se vence, es W.O. a favor del retador.
 *
 * Las fechas son textos ISO y `now` siempre se pasa desde fuera (las funciones no leen el reloj).
 */

export interface Challenge {
  id: string;
  challenger: string;
  challenged: string;
  /** ISO. */
  createdAt: string;
  acceptBy: string;
  playBy: string;
  status: 'pending' | 'accepted' | 'played' | 'walkover' | 'declined' | 'cancelled';
  acceptedAt?: string;
  /** Quién ganó (al jugarse o por W.O.). */
  winner?: string;
}

export interface LadderOptions {
  /** Puestos hacia arriba que se pueden retar (3). */
  maxUp?: number;
  /** Días para aceptar (3) y para jugar desde que se crea el reto (7). */
  acceptDays?: number;
  playDays?: number;
}

const DAY = 86_400_000;
const open = (c: Challenge) => c.status === 'pending' || c.status === 'accepted';

/** A quiénes puede retar este jugador ahora. */
export function challengeTargets(ladder: readonly string[], challenger: string, maxUp = 3): string[] {
  const p = ladder.indexOf(challenger);
  if (p <= 0) return [];
  return ladder.slice(Math.max(0, p - maxUp), p);
}

/** Por qué no se puede retar (texto en español), o null si se puede. */
export function challengeError(
  ladder: readonly string[],
  challenger: string,
  challenged: string,
  active: readonly Challenge[] = [],
  maxUp = 3,
): string | null {
  const p = ladder.indexOf(challenger);
  const q = ladder.indexOf(challenged);
  if (p < 0 || q < 0) return 'Los dos tienen que estar en la escalera.';
  if (challenger === challenged) return 'No te puedes retar a ti mismo.';
  if (q >= p) return 'Solo puedes retar a alguien que esté más arriba.';
  if (p - q > maxUp) return `Solo puedes retar hasta ${maxUp} puestos más arriba.`;
  if (active.some((c) => open(c) && [c.challenger, c.challenged].some((x) => x === challenger || x === challenged))) {
    return 'Uno de los dos ya tiene un reto pendiente.';
  }
  return null;
}

/** Crea el reto con sus plazos. Lanza Error si no se puede. */
export function createChallenge(
  ladder: readonly string[],
  input: { id: string; challenger: string; challenged: string; now: string },
  active: readonly Challenge[] = [],
  opts: LadderOptions = {},
): Challenge {
  const err = challengeError(ladder, input.challenger, input.challenged, active, opts.maxUp ?? 3);
  if (err) throw new Error(err);
  const t = Date.parse(input.now);
  if (Number.isNaN(t)) throw new Error('Fecha no válida.');
  return {
    id: input.id,
    challenger: input.challenger,
    challenged: input.challenged,
    createdAt: new Date(t).toISOString(),
    acceptBy: new Date(t + (opts.acceptDays ?? 3) * DAY).toISOString(),
    playBy: new Date(t + (opts.playDays ?? 7) * DAY).toISOString(),
    status: 'pending',
  };
}

/** El retado acepta (antes del plazo). */
export function acceptChallenge(c: Challenge, now: string): Challenge {
  if (c.status !== 'pending') throw new Error('Ese reto ya no está pendiente.');
  if (Date.parse(now) > Date.parse(c.acceptBy)) throw new Error('Se venció el plazo para aceptar.');
  return { ...c, status: 'accepted', acceptedAt: new Date(Date.parse(now)).toISOString() };
}

/**
 * Mueve la escalera con un resultado: si el ganador estaba más abajo, toma el puesto del perdedor y este
 * (y los que estaban entre los dos) bajan uno. Si el ganador ya estaba arriba, no cambia nada.
 */
export function applyLadderResult(ladder: readonly string[], winner: string, loser: string): string[] {
  const w = ladder.indexOf(winner);
  const l = ladder.indexOf(loser);
  if (w < 0 || l < 0) throw new Error('Los dos tienen que estar en la escalera.');
  if (w < l) return ladder.slice();
  const out = ladder.slice();
  out.splice(w, 1);
  out.splice(l, 0, winner);
  return out;
}

/** Anota el resultado de un reto aceptado (o pendiente, si lo jugaron sin aceptar en la app). */
export function playChallenge(ladder: readonly string[], c: Challenge, winner: string): { ladder: string[]; challenge: Challenge } {
  if (!open(c)) throw new Error('Ese reto ya se cerró.');
  if (winner !== c.challenger && winner !== c.challenged) throw new Error('El ganador tiene que ser uno de los dos.');
  const loser = winner === c.challenger ? c.challenged : c.challenger;
  return { ladder: applyLadderResult(ladder, winner, loser), challenge: { ...c, status: 'played', winner } };
}

/**
 * Aplica los plazos vencidos a `now`: si no se aceptó a tiempo, o si no se jugó a tiempo, gana el retador por
 * W.O. (se aplican por orden de vencimiento). Devuelve la escalera y los retos actualizados.
 */
export function expireChallenges(ladder: readonly string[], challenges: readonly Challenge[], now: string): { ladder: string[]; challenges: Challenge[] } {
  const t = Date.parse(now);
  const deadline = (c: Challenge) => Date.parse(c.status === 'pending' ? c.acceptBy : c.playBy);
  const due = challenges.filter((c) => open(c) && t > deadline(c)).sort((a, b) => deadline(a) - deadline(b) || (a.id < b.id ? -1 : 1));
  let current = ladder.slice();
  const updated = new Map<string, Challenge>();
  for (const c of due) {
    if (current.includes(c.challenger) && current.includes(c.challenged)) current = applyLadderResult(current, c.challenger, c.challenged);
    updated.set(c.id, { ...c, status: 'walkover', winner: c.challenger });
  }
  return { ladder: current, challenges: challenges.map((c) => updated.get(c.id) ?? c) };
}

/** Agrega al final de la escalera (los nuevos empiezan abajo). */
export function addToLadder(ladder: readonly string[], id: string): string[] {
  return ladder.includes(id) ? ladder.slice() : [...ladder, id];
}
