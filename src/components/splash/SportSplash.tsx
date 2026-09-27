import { useId, useMemo, type CSSProperties } from 'react';
import type { SportId } from '../../sports/types';
import { brandColors, loadTheme } from '../../lib/theme';
import { cx } from '../ui';
import { sceneForSport, sceneSvg, splashCss, type SceneId } from './scenes';

export interface SportSplashProps {
  /** Deporte: elige su escena (el futsal usa la del fútbol). Sin deporte o con la escena apagada: la genérica. */
  sport?: SportId | null;
  /** Escena exacta (gana sobre `sport` y muestra también las apagadas; para la vista previa). */
  scene?: SceneId;
  /** Como la app (por defecto) o forzado a claro u oscuro. */
  mode?: 'auto' | 'light' | 'dark';
  /** Color principal para `mode` claro/oscuro forzado (hex; null = el morado). Por defecto, el elegido en la app. */
  accent?: string | null;
  /** Se repite sin parar (cargas dentro de la app). */
  loop?: boolean;
  /** Sin movimiento: la imagen final (como con movimiento reducido). */
  still?: boolean;
  /** «MatchMate» debajo del dibujo. */
  word?: boolean;
  /** Ancho del dibujo en px (el alto es 120/220). Por defecto 220. */
  width?: number;
  /** Texto para lectores de pantalla; sin él es decorativo. */
  label?: string;
  className?: string;
}

/**
 * La animación de apertura de un deporte (las mismas escenas de index.html, desde scenes.ts).
 * Para repetirla, cambia su `key`.
 */
export function SportSplash({ sport, scene, mode = 'auto', accent, loop, still, word = true, width, label, className }: SportSplashProps) {
  const id = scene ?? sceneForSport(sport);
  // Cada copia con sus propios id (clipPath): puede haber varias en la misma pantalla.
  const uid = useId().replace(/[^\w-]/g, '');
  const svg = useMemo(() => sceneSvg(id, `mm${uid}-`), [id, uid]);

  const style: Record<string, string> = {};
  if (width) style['--sp-w'] = `${width}px`;
  if (mode !== 'auto') {
    // En un modo forzado el color de la app puede ser el del otro modo: se ponen los tonos de este.
    const c = brandColors(accent === undefined ? loadTheme().accent : accent)[mode];
    style['--accent'] = c.accent;
    style['--accent-fg'] = c.fg;
  }

  return (
    <div
      className={cx('mm-sp', loop && 'loop', still && 'still', className)}
      data-mode={mode === 'auto' ? undefined : mode}
      data-scene={id}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style as CSSProperties}
    >
      {/* React lo pone una sola vez en el <head> aunque haya varias animaciones. */}
      <style href="mm-splash" precedence="default">
        {splashCss()}
      </style>
      <span className="contents" dangerouslySetInnerHTML={{ __html: svg }} />
      {word && (
        <div className="word">
          Match<b>Mate</b>
        </div>
      )}
    </div>
  );
}
