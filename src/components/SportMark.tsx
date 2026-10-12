import type { ReactNode } from 'react';
import { CircleHelp, Trophy } from 'lucide-react';
import { gameMeta, isGameId, type GameId } from '../sports/esports/catalog';
import { DEFAULT_SPORT, sportMeta } from '../sports/registry';
import { GameMark } from './esports/bits';
import { sportTint } from './home/SportTint';
import { cx } from './ui';

/**
 * De qué deporte es algo (una fecha, una liga, un torneo, un partido), en un cuadro y en el color de ese deporte: su
 * ícono en el acento suave (como RowIcon) o, en esports con juego, el monograma del juego (GameMark, sin logos de
 * marcas); esports sin juego, el control. Las mismas piezas en Hoy, Ligas y el Calendario:
 * - lo que tiene fecha (Lo que viene, lo próximo de Hoy, el Calendario abierto): el deporte en la esquina del bloque de
 *   la fecha (SportCorner);
 * - lo demás (una liga sin logo, un torneo, la semana, un partido en vivo, la tarjeta de hoy): el cuadro (SportMark).
 * Un torneo lleva el trofeo chico en la esquina (`torneo`); un partido en vivo, el punto verde (`live`).
 */

export type SportMarkSize = 'xs' | 'sm' | 'md' | 'lg';

/** 24 px (la esquina de la fecha), 36 (filas compactas), 40 (RowIcon, filas de Pro) y 48 (filas de Lite). */
const BOX: Record<SportMarkSize, string> = {
  xs: 'size-6 rounded-lg',
  sm: 'size-9 rounded-xl',
  md: 'size-10 rounded-xl',
  lg: 'size-12 rounded-[15px]',
};
const GLYPH: Record<SportMarkSize, string> = { xs: 'size-3.5', sm: 'size-4', md: 'size-5', lg: 'size-6' };
/** El trofeo de la esquina (en el de 24 px no cabe). */
const BADGE: Record<SportMarkSize, string> = { xs: '', sm: 'size-4', md: 'size-[18px]', lg: 'size-5' };
const BADGE_GLYPH: Record<SportMarkSize, string> = { xs: '', sm: 'size-2.5', md: 'size-3', lg: 'size-3' };

/** El juego que se muestra: solo en esports y si es uno del catálogo. */
const shownGame = (sport: string, game: string | null | undefined): GameId | null => (sport === 'esports' && isGameId(game) ? game : null);

/** Lo que dice el lector de pantalla: «Pádel», «Valorant», «Torneo de boliche», «Torneo de Valorant». */
export function sportMarkLabel(sport: string | null | undefined, game?: string | null, torneo?: boolean): string {
  const id = sport || DEFAULT_SPORT;
  const g = gameMeta(shownGame(id, game));
  const meta = sportMeta(id);
  if (torneo) return `Torneo de ${g?.name ?? meta?.lower ?? 'otro deporte'}`;
  return g?.name ?? meta?.label ?? 'Otro deporte';
}

/** El color del deporte en una pieza chica: su clase y su <style> (React lo pone una vez en el <head>). */
function tintOf(sport: string) {
  const t = sportTint(sport);
  const style = t.css ? (
    <style href={t.className} precedence="default">
      {t.css}
    </style>
  ) : null;
  return { className: t.className, style };
}

/**
 * El cuadro del deporte. `sport` sin valor = boliche (como `leagueSport`); `game`: el juego (esports). `label`: lo que
 * dice el lector de pantalla (por defecto el deporte o el juego); `null` si ya lo dice el texto de al lado. `box` y
 * `glyph`: otro tamaño y esquinas (el cuadrito de la liga en sus cuatro tamaños).
 */
export function SportMark({
  sport,
  game,
  size = 'md',
  torneo,
  live,
  label,
  box,
  glyph,
  className,
}: {
  sport: string | null | undefined;
  game?: string | null;
  size?: SportMarkSize;
  torneo?: boolean;
  live?: boolean;
  label?: string | null;
  box?: string;
  glyph?: string;
  className?: string;
}) {
  const id = sport || DEFAULT_SPORT;
  const g = shownGame(id, game);
  const Icon = sportMeta(id)?.icon ?? CircleHelp;
  const tint = tintOf(id);
  const boxClass = box ?? BOX[size];
  const name = label === null ? null : (label ?? sportMarkLabel(id, g, torneo));
  const badge = torneo && size !== 'xs';
  return (
    <span
      {...(name ? { role: 'img', 'aria-label': name } : { 'aria-hidden': true })}
      className={cx('inline-flex shrink-0', (badge || live) && 'relative', tint.className, className)}
    >
      {tint.style}
      {g ? (
        <GameMark game={g} box={boxClass} decorative />
      ) : (
        <span className={cx('grid place-items-center bg-accent-soft text-accent', boxClass)}>
          <Icon aria-hidden="true" className={glyph ?? GLYPH[size]} />
        </span>
      )}
      {badge && (
        <span className={cx('absolute -right-1 -bottom-1 grid place-items-center rounded-full bg-surface text-fg-2 shadow-sm ring-2 ring-surface', BADGE[size])}>
          <Trophy aria-hidden="true" className={BADGE_GLYPH[size]} strokeWidth={2.4} />
        </span>
      )}
      {live && <span className="live-dot absolute -top-0.5 -right-0.5 text-ok ring-2 ring-surface" />}
    </span>
  );
}

/**
 * Algo con el deporte en su esquina de abajo a la derecha (24 px): el bloque de la fecha (OCT / 13) en Lo que viene, lo
 * próximo de Hoy y el Calendario abierto, o el ícono de una tarea (Por hacer). Lo de adentro también toma el color del
 * deporte (el mes de la fecha). `on`: el fondo de alrededor, para el borde que separa la esquina (blanco en una
 * tarjeta; gris sobre surface-2, como el bloque `raised` de la tarjeta de lo próximo).
 */
export function SportCorner({
  sport,
  game,
  on = 'surface',
  label,
  children,
  className,
}: {
  sport: string | null | undefined;
  game?: string | null;
  on?: 'surface' | 'surface-2';
  label?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const tint = tintOf(sport || DEFAULT_SPORT);
  return (
    <span className={cx('relative inline-flex shrink-0', tint.className, className)}>
      {tint.style}
      {children}
      <SportMark
        sport={sport}
        game={game}
        size="xs"
        label={label}
        className={cx('absolute -right-1.5 -bottom-1.5 rounded-lg ring-2', on === 'surface-2' ? 'ring-surface-2' : 'ring-surface')}
      />
    </span>
  );
}
