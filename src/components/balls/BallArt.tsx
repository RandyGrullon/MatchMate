import { memo, useId, useMemo, type ReactNode } from 'react';
import type { Ball, BallCover } from '../../lib/balls';
import { ballDesignOf, type BallDesign, type BallSticker, type BallStickerShape } from '../../lib/ballDesign';
import { FONT_STACK } from '../share/scene';
import { C, artNum as f, ballArtScene, designHash, stickerOutline, stickerParts, type ArtPaint, type StickerPart } from './art';

// Las cuentas del dibujo están en art.ts (sin React: la app del teléfono pinta la misma bola).
export { BALL_HOLES, ballArtDetail, ballArtMetrics, patternFeatures, smoothPath } from './art';
export type { ArtShape, BallArtDetail, PatternFeature } from './art';

/**
 * Una bola del boliche dibujada (estilo dibujo animado, como el resto de la app) a partir de su diseño
 * (src/lib/ballDesign.ts): el color base, el dibujo (perlada, jaspeada, galaxia…) con su tamaño, suavidad y ángulo,
 * las figuras pegadas, la sombra, los tres huecos, el brillo y un borde oscuro del mismo color. Todo en SVG, sin
 * nada al azar: el dibujo sale de una semilla del diseño (siempre igual en el teléfono y en el servidor).
 *
 * Se ve a 24, 40, 64 y 160 px sobre el fondo claro y el oscuro: el borde y el brillo se engrosan en lo chico (medidos en
 * píxeles), lo fino del dibujo se aclara (menos puntos, más grandes) y un halo tenue la separa de un fondo oscuro. La
 * bola usa sus propios colores (no los del tema). Qué se dibuja y dónde: ballArtScene (art.ts).
 *
 * El texto de las figuras (número e iniciales) va como texto de React (nunca como marcado) y además limpio: solo
 * cifras o letras (cleanStickerText).
 */

/** Un trozo de una figura pegada (stickerParts) en SVG. */
function stickerPart(p: StickerPart, key: number): ReactNode {
  const round = 'round' in p ? p.round : undefined;
  const line = {
    stroke: 'stroke' in p ? p.stroke : undefined,
    strokeWidth: 'strokeWidth' in p ? p.strokeWidth : undefined,
    strokeLinejoin: round === 'all' ? ('round' as const) : undefined,
    strokeLinecap: round ? ('round' as const) : undefined,
  };
  switch (p.t) {
    case 'path':
      return <path key={key} d={p.d} fill={p.fill} {...line} />;
    case 'circle':
      return <circle key={key} r={p.r} fill={p.fill} {...line} />;
    case 'ellipse':
      return <ellipse key={key} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={p.fill} />;
    case 'text':
      return (
        <text
          key={key}
          y={0}
          dy="0.35em"
          textAnchor="middle"
          fontFamily={FONT_STACK}
          fontWeight={p.weight}
          fontSize={p.fontSize}
          fill={p.fill}
          {...(p.stroke ? { stroke: p.stroke, strokeWidth: p.strokeWidth, strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {})}
        >
          {p.text}
        </text>
      );
    default:
      return null;
  }
}

const stickerBody = (parts: readonly StickerPart[]) => <>{parts.map(stickerPart)}</>;

/**
 * Una figura sola, sin la bola (los botones del creador para agregarla o elegirla): con su color, su borde y, en el
 * número y las iniciales, su texto (limpio, como en la bola). Decorativa: el nombre va en el botón.
 */
export function StickerArt({ shape, color, text, size, className }: { shape: BallStickerShape; color: string; text?: string; size: number; className?: string }) {
  const s: BallSticker = { shape, color, x: 0, y: 0, size: 1, rotation: 0, ...(text ? { text } : {}) };
  return (
    <svg viewBox="-1.2 -1.2 2.4 2.4" width={size} height={size} className={className} aria-hidden="true" focusable="false">
      {stickerBody(stickerParts(s, stickerOutline(color), 0.1, 'mid'))}
    </svg>
  );
}

// ---------- La bola ----------

export interface BallArtProps {
  /** La bola: su diseño, su color y su cubierta (lo mismo que pasar `design`, `color` y `cover`, que mandan si vienen). */
  ball?: Pick<Ball, 'design' | 'color' | 'cover'> | null;
  /** El diseño (de la bola o del creador). Sin diseño: la bola lisa de `color` (y perlada o jaspeada según `cover`). */
  design?: BallDesign | null;
  /** El color de la bola, si no tiene diseño. */
  color?: string | null;
  cover?: BallCover | null;
  /** Píxeles (ancho y alto). 24, 40, 64 y 160 son los de la app. */
  size: number;
  /** Nombre accesible («La Phaze II»): con él es role="img" con <title>; sin él, aria-hidden (el nombre va al lado). */
  label?: string;
  className?: string;
}

/**
 * Una bola del boliche dibujada con su diseño. Con `memo`: la hoja de anotar se vuelve a dibujar con cada tecla, pero
 * sus bolas (las de la caché, siempre el mismo objeto) no se vuelven a dibujar.
 */
export const BallArt = memo(function BallArt({ ball, design = ball?.design, color = ball?.color, cover = ball?.cover, size, label, className }: BallArtProps) {
  const d = useMemo(() => ballDesignOf({ design, color, cover }), [design, color, cover]);
  // useId es único en una página de React; la huella del diseño lo es también entre dos dibujos hechos aparte (p. ej.
  // renderToString de varias bolas juntadas en un solo SVG): así un degradado nunca toma el de otra bola.
  const reactId = useId();
  const hash = useMemo(() => designHash(d, size), [d, size]);
  const id = `${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}-${hash}`;
  const sc = useMemo(() => ballArtScene(d, size), [d, size]);
  const c = sc.colors;
  const clip = `mm-ball-clip-${id}`;
  const titleId = `mm-ball-t-${id}`;
  const soft = (n: 2 | 3) => `mm-ball-s${n}-${id}`;
  const paint = (p: ArtPaint | undefined) => (p === '@soft2' ? `url(#${soft(2)})` : p === '@soft3' ? `url(#${soft(3)})` : p);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      focusable="false"
      {...(label ? { role: 'img', 'aria-labelledby': titleId } : { 'aria-hidden': true })}
    >
      {label && <title id={titleId}>{label}</title>}
      <defs>
        <clipPath id={clip}>
          <circle cx={C} cy={C} r={sc.radius} />
        </clipPath>
        {sc.usesSoft &&
          ([2, 3] as const).map((n) => (
            <radialGradient key={n} id={soft(n)}>
              <stop offset={0} stopColor={n === 2 ? c.second : c.third} />
              <stop offset={sc.solidTo} stopColor={n === 2 ? c.second : c.third} />
              <stop offset={1} stopColor={n === 2 ? c.second : c.third} stopOpacity={0} />
            </radialGradient>
          ))}
      </defs>
      {/* Halo tenue: separa la bola de un fondo oscuro (en uno claro no se nota). */}
      <circle cx={C} cy={C} r={sc.halo.r} fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeWidth={sc.halo.width} />
      <g clipPath={`url(#${clip})`}>
        <rect width={100} height={100} fill={c.base} />
        {sc.features.length > 0 && (
          <g transform={sc.patternTransform}>
            {sc.features.map(({ shape: s }, i) =>
              s.t === 'circle' ? (
                <circle key={i} cx={f(s.cx)} cy={f(s.cy)} r={f(s.r)} fill={paint(s.fill)} opacity={s.opacity != null ? f(s.opacity) : undefined} />
              ) : s.t === 'ellipse' ? (
                <ellipse
                  key={i}
                  cx={f(s.cx)}
                  cy={f(s.cy)}
                  rx={f(s.rx)}
                  ry={f(s.ry)}
                  transform={`rotate(${f(s.rot)} ${f(s.cx)} ${f(s.cy)})`}
                  fill={paint(s.fill)}
                  opacity={s.opacity != null ? f(s.opacity) : undefined}
                />
              ) : (
                <path
                  key={i}
                  d={s.d}
                  fill={s.fill ? paint(s.fill) : 'none'}
                  stroke={s.stroke ? paint(s.stroke) : undefined}
                  strokeWidth={s.width != null ? f(s.width) : undefined}
                  strokeLinecap={s.stroke ? 'round' : undefined}
                  strokeLinejoin={s.stroke ? 'round' : undefined}
                  opacity={s.opacity != null ? f(s.opacity) : undefined}
                />
              ),
            )}
          </g>
        )}
        {sc.stickers.map((s, i) => (
          <g key={i} transform={s.transform}>
            {stickerBody(s.parts)}
          </g>
        ))}
        {/* Sombra de dibujo animado (abajo a la derecha) y la luz que rebota en el borde. */}
        <path d={sc.shadow.d} fillRule="evenodd" fill="#000000" opacity={sc.shadow.opacity} />
        <path d={sc.rim.d} fillRule="evenodd" fill="#ffffff" opacity={sc.rim.opacity} />
      </g>
      {sc.holes.map((h, i) => (
        <g key={i}>
          <circle cx={h.cx} cy={h.cy} r={h.r} fill={h.fill} stroke={h.stroke} strokeWidth={h.strokeWidth} />
          {h.inner && <circle cx={h.inner.cx} cy={h.inner.cy} r={h.inner.r} fill={h.inner.fill} />}
        </g>
      ))}
      {sc.shine && (
        <g fill="#ffffff">
          <ellipse cx={sc.shine.cx} cy={sc.shine.cy} rx={sc.shine.rx} ry={sc.shine.ry} transform={sc.shine.transform} opacity={0.85} />
          {sc.shine.dot && <circle cx={sc.shine.dot.cx} cy={sc.shine.dot.cy} r={sc.shine.dot.r} opacity={0.85} />}
        </g>
      )}
      <circle cx={C} cy={C} r={sc.radius} fill="none" stroke={c.outline} strokeWidth={sc.outline} />
    </svg>
  );
});
