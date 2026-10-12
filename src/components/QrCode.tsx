import { useMemo } from 'react';
import { encode } from 'uqr';
import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_RX, DUO_STROKE } from './splash/brand';

/**
 * Código QR con el estilo de la app: los módulos redondeados (se unen en gotas y píldoras), los tres «ojos» como
 * cuadros redondeados del color de la app y, si el código es lo bastante grande, el logo en el centro sobre su placa
 * blanca. Siempre sobre blanco (también en modo oscuro) y con tinta casi negra para que lo lea cualquier cámara;
 * corrección de errores alta (H, 30 %) para que el logo y las curvas no estorben. Margen de 2 módulos.
 */

/** Tinta de los módulos: el texto del modo claro (casi negro). */
export const QR_INK = '#151822';
/** Margen blanco alrededor, en módulos. */
const BORDER = 2;
/** Desde esta versión (33×33 módulos o más) va el logo en el centro. */
const LOGO_MIN_VERSION = 4;
/** Cuánto del ancho ocupa la placa del logo. */
const LOGO_SHARE = 0.22;

/**
 * El color de los ojos y del logo: el de la app en claro; en oscuro el color de la app es claro (para fondo oscuro) y
 * sobre el blanco del QR se lee poco, así que va oscurecido (o la tinta, donde no hay color-mix).
 */
const QR_CSS = [
  '.mm-qr{--qr-eye:var(--accent)}',
  `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .mm-qr{--qr-eye:${QR_INK}}}`,
  `:root[data-theme="dark"] .mm-qr{--qr-eye:${QR_INK}}`,
  '@supports (color:color-mix(in oklab,red,red)){' +
    '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .mm-qr{--qr-eye:color-mix(in oklab,var(--accent) 60%,#000)}}' +
    ':root[data-theme="dark"] .mm-qr{--qr-eye:color-mix(in oklab,var(--accent) 60%,#000)}}',
].join('\n');

export interface QrPalette {
  /** Módulos. */
  ink: string;
  /** Ojos y fondo del logo. */
  eye: string;
  /** Fondo (y el dibujo del logo). */
  plate: string;
}

export interface QrModel {
  /** Lado total en módulos (con el margen). */
  size: number;
  version: number;
  /** Los módulos (sin los ojos ni el centro del logo) como un solo trazo. */
  d: string;
  /** Esquina de arriba-izquierda de cada ojo (7×7). */
  eyes: { x: number; y: number }[];
  /** El cuadro del centro que se deja libre para el logo (en módulos), o null. */
  logo: { x: number; y: number; size: number } | null;
}

/** Un módulo: cuadrado, con media vuelta en cada esquina que no toca a otro módulo (ni arriba/abajo ni al lado). */
function modulePath(x: number, y: number, n: boolean, e: boolean, s: boolean, w: boolean): string {
  const tl = n && w ? 0.5 : 0;
  const tr = n && e ? 0.5 : 0;
  const br = s && e ? 0.5 : 0;
  const bl = s && w ? 0.5 : 0;
  let p = `M${x + tl} ${y}H${x + 1 - tr}`;
  if (tr) p += 'a.5 .5 0 0 1 .5 .5';
  p += `V${y + 1 - br}`;
  if (br) p += 'a.5 .5 0 0 1-.5 .5';
  p += `H${x + bl}`;
  if (bl) p += 'a.5 .5 0 0 1-.5-.5';
  p += `V${y + tl}`;
  if (tl) p += 'a.5 .5 0 0 1 .5-.5';
  return `${p}Z`;
}

/** Lo que se dibuja del QR de `value` (en módulos). */
export function qrModel(value: string): QrModel {
  const qr = encode(value, { ecc: 'H', border: BORDER });
  const n = qr.size;
  const inner = 17 + 4 * qr.version;
  const b = (n - inner) / 2;
  const eyes = [
    { x: b, y: b },
    { x: b + inner - 7, y: b },
    { x: b, y: b + inner - 7 },
  ];
  let logo: QrModel['logo'] = null;
  if (qr.version >= LOGO_MIN_VERSION) {
    let side = Math.round(inner * LOGO_SHARE);
    if (side % 2 === 0) side += 1; // impar: queda centrado en un módulo (el lado del QR también es impar)
    const at = b + (inner - side) / 2;
    logo = { x: at, y: at, size: side };
  }
  const inEye = (x: number, y: number) => eyes.some((o) => x >= o.x && x < o.x + 7 && y >= o.y && y < o.y + 7);
  const inLogo = (x: number, y: number) => !!logo && x >= logo.x && x < logo.x + logo.size && y >= logo.y && y < logo.y + logo.size;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && qr.data[y][x] && !inEye(x, y) && !inLogo(x, y);
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (on(x, y)) d += modulePath(x, y, !on(x, y - 1), !on(x + 1, y), !on(x, y + 1), !on(x - 1, y));
    }
  }
  return { size: n, version: qr.version, d, eyes, logo };
}

/** Un ojo (7×7): el marco redondeado (con su hueco) y el centro de 3×3. */
const eyeRing = (x: number, y: number) =>
  `M${x + 2.2} ${y}h2.6a2.2 2.2 0 0 1 2.2 2.2v2.6a2.2 2.2 0 0 1-2.2 2.2h-2.6a2.2 2.2 0 0 1-2.2-2.2v-2.6a2.2 2.2 0 0 1 2.2-2.2z` +
  `M${x + 2.4} ${y + 1}h2.2a1.4 1.4 0 0 1 1.4 1.4v2.2a1.4 1.4 0 0 1-1.4 1.4h-2.2a1.4 1.4 0 0 1-1.4-1.4v-2.2a1.4 1.4 0 0 1 1.4-1.4z`;

/**
 * El QR en SVG. `palette`: colores fijos (para guardarlo como imagen o en las pruebas); sin ella, los ojos y el logo
 * toman el color de la app (y su versión oscurecida en modo oscuro).
 */
export function QrCode({ value, className = 'size-44', palette }: { value: string; className?: string; palette?: Partial<QrPalette> }) {
  const m = useMemo(() => qrModel(value), [value]);
  const ink = palette?.ink ?? QR_INK;
  const plate = palette?.plate ?? '#ffffff';
  const eye = palette?.eye ?? `var(--qr-eye, ${QR_INK})`;
  const tile = m.logo ? m.logo.size - 1.2 : 0;
  return (
    <>
      {!palette?.eye && (
        // React lo pone una sola vez en el <head> aunque haya varios QR en pantalla.
        <style href="mm-qr" precedence="default">
          {QR_CSS}
        </style>
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${m.size} ${m.size}`}
        className={className ? `mm-qr ${className}` : 'mm-qr'}
        role="img"
        aria-label="Código QR de la invitación"
      >
        <rect width={m.size} height={m.size} rx={1.5} fill={plate} />
        <path d={m.d} fill={ink} />
        {m.eyes.map((o) => (
          <g key={`${o.x}-${o.y}`} fill={eye}>
            <path fillRule="evenodd" d={eyeRing(o.x, o.y)} />
            <rect x={o.x + 2} y={o.y + 2} width={3} height={3} rx={1} />
          </g>
        ))}
        {m.logo && (
          <>
            <rect x={m.logo.x} y={m.logo.y} width={m.logo.size} height={m.logo.size} rx={m.logo.size * 0.24} fill={plate} />
            <svg x={m.logo.x + 0.6} y={m.logo.y + 0.6} width={tile} height={tile} viewBox="0 0 512 512" aria-hidden="true">
              <rect width="512" height="512" rx={DUO_RX} fill={eye} />
              <path d={DUO_M} fill="none" stroke={plate} strokeWidth={DUO_STROKE} strokeLinecap="round" strokeLinejoin="round" />
              {DUO_HEADS.map(([x, y]) => (
                <circle key={x} cx={x} cy={y} r={DUO_HEAD_R} fill={plate} />
              ))}
            </svg>
          </>
        )}
      </svg>
    </>
  );
}
