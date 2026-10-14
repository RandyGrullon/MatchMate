import { useMemo } from 'react';
import { handicapAverages } from '../../lib/bowlingSeason';
import { useAllEntries, useEvents, usePlayers } from '../../lib/data';
import { useLeagueSeasons } from '../../lib/data/seasons';
import { todayIn } from '../../pages/sports/racket/logic/time';
import { cx } from '../ui';

/**
 * Piezas de los equipos fijos del boliche: la marca del equipo (su color con el número o las iniciales), el punto de
 * color y el promedio de cada jugador de la liga.
 */

/** «Equipo 3» → «3»; «Los Strikers» → «LS». */
export function teamInitials(name: string): string {
  const n = /^equipo\s+(\d{1,2})$/i.exec(name.trim());
  if (n) return n[1];
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

/** Letra oscura en los colores claros (amarillo, verde limón) y blanca en los demás. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#fff';
  const v = parseInt(m[1], 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111827' : '#fff';
}

/** El escudo del equipo en las filas: un cuadrado de 40 px en su color, con el número o las iniciales. */
export function TeamMark({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold tracking-normal', className)}
      style={{ background: color, color: inkOn(color) }}
    >
      {teamInitials(name)}
    </span>
  );
}

/** El punto de color del equipo (12 px). */
export function TeamDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cx('size-3 shrink-0 rounded-full', className)} style={{ background: color }} />;
}

/** «4 jugadores». */
export const playersWord = (n: number) => `${n} ${n === 1 ? 'jugador' : 'jugadores'}`;

/**
 * El promedio de cada jugador de la liga para armar equipos: el del handicap de una inscripción de hoy (la temporada,
 * la anterior, el fijo o el de entrada; handicapAverages), como la lista de jugadores del admin. 0 = sin promedio.
 */
export function useLeagueAverages(lid: string | undefined, tz?: string | null): ReadonlyMap<string, number> {
  const players = usePlayers(lid);
  const entries = useAllEntries(lid);
  const events = useEvents(lid);
  const seasons = useLeagueSeasons(lid);
  return useMemo(() => {
    const dates = new Map(events.data.map((e) => [e.id, e.date]));
    const byPlayer = handicapAverages(players.data, entries.data, dates, seasons.data, todayIn(tz));
    return new Map([...byPlayer].map(([id, a]) => [id, a.average]));
  }, [players.data, entries.data, events.data, seasons.data, tz]);
}
