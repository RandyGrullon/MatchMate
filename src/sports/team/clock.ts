/**
 * Reloj de partido calculado con marcas de tiempo (ms desde 1970), nunca con setInterval: si la pantalla
 * se bloquea o la app se duerme, al volver el reloj sigue bien. Todo puro: la hora la pasa quien llama.
 * El reloj cuenta tiempo jugado; el baloncesto muestra lo que falta (duración − jugado) y el fútbol el minuto.
 */

export interface ClockState {
  running: boolean;
  /** Tiempo jugado (ms) hasta `since`, o hasta que se paró. */
  elapsedMs: number;
  /** Hora (ms) en que arrancó por última vez; null si está parado. */
  since: number | null;
}

export function newClock(): ClockState {
  return { running: false, elapsedMs: 0, since: null };
}

/** Tiempo jugado a la hora `now`. Sin `now` (jugada sin hora) vale lo que tenía al arrancar o al pararse. */
export function elapsedAt(c: ClockState, now?: number): number {
  if (!c.running || c.since === null || now === undefined) return c.elapsedMs;
  return c.elapsedMs + Math.max(0, now - c.since);
}

export function startClock(c: ClockState, at: number): ClockState {
  if (c.running) throw new Error('El reloj ya está corriendo');
  return { running: true, elapsedMs: c.elapsedMs, since: at };
}

/** Para el reloj. `max` (ms) lo deja en el tope (el reloj de baloncesto no baja de 0:00). */
export function stopClock(c: ClockState, at: number, max = Infinity): ClockState {
  if (!c.running) throw new Error('El reloj ya está parado');
  return { running: false, elapsedMs: Math.min(max, elapsedAt(c, at)), since: null };
}

/** Corrige el reloj a mano. Si está corriendo, sigue corriendo desde `at`. */
export function setElapsed(c: ClockState, elapsedMs: number, at?: number): ClockState {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('Tiempo inválido');
  if (c.running && at === undefined) throw new Error('Para corregir el reloj corriendo hace falta la hora');
  return { running: c.running, elapsedMs, since: c.running ? (at as number) : null };
}

/** "9:58" (m:ss). `up` redondea hacia arriba (cuenta regresiva: con 0,4 s quedan "0:01"). */
export function formatClock(ms: number, round: 'up' | 'down' = 'down'): string {
  const total = Math.max(0, round === 'up' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
