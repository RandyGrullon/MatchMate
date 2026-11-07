import { memo, useId, useMemo, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { catalogLook, type Ball, type BallCover } from '@mm/lib/balls';
import { ballDesignOf, type BallDesign, type BallSticker, type BallStickerShape } from '@mm/lib/ballDesign';
import type { CatalogBall } from '@mm/lib/ballCatalog';
import { C, artNum as f, ballArtScene, designHash, stickerOutline, stickerParts, type ArtPaint, type StickerPart } from '@mm/components/balls/art';
import { CATALOG_NO_COLOR } from '@mm/components/balls/catalog';
import { font } from '@/theme/tokens';

/**
 * Una bola del boliche dibujada con su diseño (BallArt de la web), con react-native-svg: el mismo dibujo, las mismas
 * figuras, la sombra, los huecos y el brillo (todo sale de ballArtScene, src/components/balls/art.ts). Se ve a 24, 40,
 * 64 y 160 px como en la web.
 */

/** Un trozo de una figura pegada en react-native-svg (el texto con su borde: primero el borde y encima el relleno). */
function stickerPart(p: StickerPart, key: number): ReactNode {
  switch (p.t) {
    case 'path':
      return (
        <Path
          key={key}
          d={p.d}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          strokeLinejoin={p.round === 'all' ? 'round' : undefined}
          strokeLinecap={p.round ? 'round' : undefined}
        />
      );
    case 'circle':
      return <Circle key={key} r={p.r} fill={p.fill} stroke={p.stroke} strokeWidth={p.strokeWidth} strokeLinejoin={p.round ? 'round' : undefined} strokeLinecap={p.round ? 'round' : undefined} />;
    case 'ellipse':
      return <Ellipse key={key} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={p.fill} />;
    case 'text': {
      const text = { y: 0, dy: p.fontSize * 0.35, textAnchor: 'middle' as const, fontFamily: font.heavy, fontSize: p.fontSize };
      return (
        <G key={key}>
          {p.stroke && (
            <SvgText {...text} fill="none" stroke={p.stroke} strokeWidth={p.strokeWidth} strokeLinejoin="round">
              {p.text}
            </SvgText>
          )}
          <SvgText {...text} fill={p.fill}>
            {p.text}
          </SvgText>
        </G>
      );
    }
    default:
      return null;
  }
}

/**
 * Una figura sola, sin la bola (StickerArt de la web: los botones del creador para agregarla o elegirla): con su color,
 * su borde y, en el número y las iniciales, su texto (limpio, como en la bola). Decorativa: el nombre va en el botón.
 */
export function StickerArt({ shape, color, text, size }: { shape: BallStickerShape; color: string; text?: string; size: number }) {
  const s: BallSticker = { shape, color, x: 0, y: 0, size: 1, rotation: 0, ...(text ? { text } : {}) };
  return (
    <View aria-hidden style={{ width: size, height: size }}>
      <Svg viewBox="-1.2 -1.2 2.4 2.4" width={size} height={size}>
        {stickerParts(s, stickerOutline(color), 0.1, 'mid').map(stickerPart)}
      </Svg>
    </View>
  );
}

export interface BallArtProps {
  /** La bola: su diseño, su color y su cubierta (lo mismo que pasar `design`, `color` y `cover`, que mandan si vienen). */
  ball?: Pick<Ball, 'design' | 'color' | 'cover'> | null;
  design?: BallDesign | null;
  color?: string | null;
  cover?: BallCover | null;
  /** Puntos (ancho y alto). */
  size: number;
  /** Nombre para el lector de pantalla; sin él, la bola es decorativa (el nombre va al lado). */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export const BallArt = memo(function BallArt({ ball, design = ball?.design, color = ball?.color, cover = ball?.cover, size, label, style }: BallArtProps) {
  const d = useMemo(() => ballDesignOf({ design, color, cover }), [design, color, cover]);
  // Ids únicos también en la vista previa web (ahí el SVG es del navegador y los ids son de toda la página).
  const reactId = useId();
  const hash = useMemo(() => designHash(d, size), [d, size]);
  const id = `${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}-${hash}`;
  const sc = useMemo(() => ballArtScene(d, size), [d, size]);
  const c = sc.colors;
  const clip = `mm-ball-clip-${id}`;
  const soft = (n: 2 | 3) => `mm-ball-s${n}-${id}`;
  const paint = (p: ArtPaint | undefined) => (p === '@soft2' ? `url(#${soft(2)})` : p === '@soft3' ? `url(#${soft(3)})` : p);

  return (
    // El nombre (o que es decorativa) va en la caja: en la vista previa web el <svg> no entiende esas propiedades.
    <View
      style={[{ width: size, height: size }, style]}
      {...(label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : { 'aria-hidden': true })}
    >
      <Svg viewBox="0 0 100 100" width={size} height={size}>
        <Defs>
          <ClipPath id={clip}>
            <Circle cx={C} cy={C} r={sc.radius} />
          </ClipPath>
          {sc.usesSoft &&
            ([2, 3] as const).map((n) => (
              <RadialGradient key={n} id={soft(n)} cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
                <Stop offset={0} stopColor={n === 2 ? c.second : c.third} />
                <Stop offset={sc.solidTo} stopColor={n === 2 ? c.second : c.third} />
                <Stop offset={1} stopColor={n === 2 ? c.second : c.third} stopOpacity={0} />
              </RadialGradient>
            ))}
        </Defs>
        <Circle cx={C} cy={C} r={sc.halo.r} fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeWidth={sc.halo.width} />
        <G clipPath={`url(#${clip})`}>
          <Rect width={100} height={100} fill={c.base} />
          {sc.features.length > 0 && (
            <G transform={sc.patternTransform}>
              {sc.features.map(({ shape: s }, i) =>
                s.t === 'circle' ? (
                  <Circle key={i} cx={f(s.cx)} cy={f(s.cy)} r={f(s.r)} fill={paint(s.fill)} opacity={s.opacity != null ? f(s.opacity) : undefined} />
                ) : s.t === 'ellipse' ? (
                  <Ellipse
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
                  <Path
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
            </G>
          )}
          {sc.stickers.map((s, i) => (
            <G key={i} transform={s.transform}>
              {s.parts.map(stickerPart)}
            </G>
          ))}
          <Path d={sc.shadow.d} fillRule="evenodd" fill="#000000" opacity={sc.shadow.opacity} />
          <Path d={sc.rim.d} fillRule="evenodd" fill="#ffffff" opacity={sc.rim.opacity} />
        </G>
        {sc.holes.map((h, i) => (
          <G key={i}>
            <Circle cx={h.cx} cy={h.cy} r={h.r} fill={h.fill} stroke={h.stroke} strokeWidth={h.strokeWidth} />
            {h.inner && <Circle cx={h.inner.cx} cy={h.inner.cy} r={h.inner.r} fill={h.inner.fill} />}
          </G>
        ))}
        {sc.shine && (
          <G fill="#ffffff">
            <Ellipse cx={sc.shine.cx} cy={sc.shine.cy} rx={sc.shine.rx} ry={sc.shine.ry} transform={sc.shine.transform} opacity={0.85} />
            {sc.shine.dot && <Circle cx={sc.shine.dot.cx} cy={sc.shine.dot.cy} r={sc.shine.dot.r} opacity={0.85} />}
          </G>
        )}
        <Circle cx={C} cy={C} r={sc.radius} fill="none" stroke={c.outline} strokeWidth={sc.outline} />
      </Svg>
    </View>
  );
});

/** La bola del catálogo dibujada con sus colores (la que se propone al agregarla; CatalogBallArt de la web). */
export function CatalogBallArt({ ball: c, size }: { ball: CatalogBall; size: number }) {
  const look = useMemo(() => catalogLook(c), [c]);
  return <BallArt design={look} color={look?.base ?? CATALOG_NO_COLOR} cover={c.cover} size={size} />;
}
