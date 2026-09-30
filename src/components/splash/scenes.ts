/**
 * Animaciones de apertura de MatchMate: una escena por deporte (docs/plan/investigacion-brand.md).
 *
 * Esta es la ÚNICA fuente de las escenas. De aquí salen:
 * - index.html: el CSS y los <template> de las escenas activas, más el script que elige la escena antes de pintar.
 *   Se regenera con `node scripts/icons/splash.mjs` (una prueba avisa si index.html quedó viejo).
 * - SportSplash.tsx: las mismas escenas dentro de la app (vista previa y cargas).
 *
 * Reglas de cada escena:
 * - SVG de 220×120; las clases y los @keyframes llevan el prefijo `sp-<escena>` para no chocar entre sí.
 * - Colores solo con las variables de `.mm-sp` (--sp-acc = el color de la app, --sp-on = el texto sobre él, etc.):
 *   así sirven en claro, en oscuro y con el color elegido.
 * - Todas las animaciones duran lo mismo (DURATION) y sin animation-delay: el tiempo va en los % de los keyframes.
 *   Así se pueden repetir en bucle sin desfasarse (clase `loop`). La acción termina hacia el 75 % (1,5 s).
 * - El estado SIN animar es la imagen final y tiene que verse bien: con movimiento reducido se ve eso.
 *   Nada puede depender de una animación para esconderse.
 * - Los id (clipPath) se escriben `__ID__x` y se cambian por un prefijo único al usarlos.
 */
import type { SportId } from '../../sports/types';
import { SPLASH_SEEN_KEY, SPORT_KEY } from '../../lib/splash';
import { DUO_HEAD_R, DUO_HEADS, DUO_M, DUO_STROKE } from './brand';

export type SceneId = 'generic' | 'bowling' | 'padel' | 'tennis' | 'pickleball' | 'basketball' | 'football' | 'golf' | 'swimming' | 'table_tennis';

export interface Scene {
  id: SceneId;
  /** Nombre para la vista previa. */
  label: string;
  css: string;
  /** SVG (sin xmlns: va dentro del HTML). */
  svg: string;
}

/** Duración de todas las escenas (la acción termina hacia 1,5 s; el resto es la imagen final quieta). */
export const DURATION = '2s';
const T = DURATION;

/** Orden de la vista previa. */
export const SCENE_ORDER: readonly SceneId[] = ['generic', 'bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'golf', 'swimming', 'table_tennis'];

/** Escena de cada deporte (el futsal usa la del fútbol). */
export const SCENE_FOR_SPORT: Record<SportId, SceneId> = {
  bowling: 'bowling',
  padel: 'padel',
  tennis: 'tennis',
  pickleball: 'pickleball',
  basketball: 'basketball',
  football: 'football',
  futsal: 'football',
  golf: 'golf',
  swimming: 'swimming',
  table_tennis: 'table_tennis',
};

/**
 * Escenas que ya salen al abrir la app. Las demás solo se ven en la vista previa hasta que se encienda su deporte:
 * se agrega aquí y se corre `node scripts/icons/splash.mjs`.
 */
export const LIVE_SCENES: readonly SceneId[] = ['generic', 'bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'golf', 'swimming', 'table_tennis'];

/** La escena de un deporte; sin deporte, desconocido o con la escena apagada: la genérica. */
export function sceneForSport(sport: string | null | undefined, live: readonly SceneId[] = LIVE_SCENES): SceneId {
  const scene = sport && Object.hasOwn(SCENE_FOR_SPORT, sport) ? SCENE_FOR_SPORT[sport as SportId] : null;
  return scene && live.includes(scene) ? scene : 'generic';
}

// ---------- Estilos comunes ----------

/** Variables del modo oscuro (van en tres sitios: forzado, como el sistema y elegido en la app). */
const DARK_VARS =
  '--sp-acc:var(--accent,#8b8cf6);--sp-on:var(--accent-fg,#0d0f15);--sp-bg:#0d0f15;--sp-fg:#eceef3;--sp-edge:#c9ccd6;' +
  '--sp-gnd:var(--sp-acc);--sp-gnd-o:.35;--sp-hole:#000;--sp-drop:none';

/** Contenedor `.mm-sp` (el #splash de index.html y SportSplash): colores, tamaño, la palabra, bucle y movimiento reducido. */
export const SPLASH_BASE_CSS = [
  '.mm-sp{--sp-acc:var(--accent,#4338ca);--sp-on:var(--accent-fg,#fff);--sp-bg:#f4f5f8;--sp-fg:#151822;--sp-piece:#fff;--sp-edge:#8e96a8;' +
    '--sp-gnd:#151822;--sp-gnd-o:.16;--sp-hole:#262a36;--sp-drop:drop-shadow(0 2px 1.5px rgb(16 24 40 / .22));' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:var(--sp-fg)}',
  `.mm-sp[data-mode=dark]{${DARK_VARS}}`,
  `@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .mm-sp:not([data-mode=light]){${DARK_VARS}}}`,
  `:root[data-theme=dark] .mm-sp:not([data-mode=light]){${DARK_VARS}}`,
  '.mm-sp svg{width:var(--sp-w,220px);height:auto;aspect-ratio:11/6;overflow:visible}',
  '.mm-sp .word{font-size:calc(var(--sp-w,220px)*.127);font-weight:800;letter-spacing:-.02em;line-height:1.2;animation:sp-word .45s ease-out .75s both}',
  '.mm-sp .word b{color:var(--sp-acc)}',
  '.mm-sp .acc{fill:var(--sp-acc)}',
  '.mm-sp .on{fill:var(--sp-on)}',
  '.mm-sp .pc{fill:var(--sp-piece);stroke:var(--sp-edge);stroke-width:1.4}',
  '.mm-sp .gnd{fill:none;stroke:var(--sp-gnd);stroke-opacity:var(--sp-gnd-o);stroke-width:2;stroke-linecap:round}',
  // En bucle (cargas dentro de la app): todo se repite junto y se funde entre vuelta y vuelta.
  `.mm-sp.loop svg{animation:sp-loop ${T} linear infinite}`,
  '.mm-sp.loop svg *{animation-iteration-count:infinite!important}',
  '.mm-sp.still *{animation:none!important}',
  '@keyframes sp-loop{0%{opacity:0}6%,90%{opacity:1}100%{opacity:0}}',
  '@keyframes sp-word{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
  '@media (prefers-reduced-motion:reduce){.mm-sp *{animation:none!important}}',
].join('\n');

/** Solo index.html: la capa de apertura a pantalla completa (se quita con hideSplash de src/lib/splash.ts). */
export const SPLASH_SHELL_CSS = [
  '#splash{position:fixed;inset:0;z-index:9999;background:var(--sp-bg);font-family:Inter,ui-sans-serif,system-ui,sans-serif;transition:opacity .35s ease,visibility .35s}',
  '#splash.out{opacity:0;visibility:hidden}',
].join('\n');

// ---------- Escenas ----------

const svg = (id: SceneId, body: string[]) => [`<svg class="sp-${id}" viewBox="0 0 220 120">`, ...body.map((l) => `  ${l}`), '</svg>'].join('\n');
/** Curvas para arcos con gravedad: sube frenando / baja acelerando. */
const UP = 'cubic-bezier(.33,.66,.66,1)';
const DOWN = 'cubic-bezier(.33,0,.66,.33)';
const SHADOW = 'drop-shadow(0 2px 2px rgb(16 24 40 / .22))';

/** El logo Dúo se arma solo: aparece el cuadro, la M se dibuja, las cabezas saltan y la V late como un choque de manos. */
const generic: Scene = {
  id: 'generic',
  label: 'MatchMate',
  svg: svg('generic', [
    '<g transform="translate(62 12) scale(.1875)">',
    '  <rect class="acc tile" width="512" height="512" rx="112"/>',
    '  <circle class="clap" cx="256" cy="324" r="46" fill="none" stroke-width="14"/>',
    `  <path class="m" d="${DUO_M}" pathLength="1" fill="none" stroke-width="${DUO_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`,
    ...DUO_HEADS.map(([cx, cy], i) => `  <circle class="on h${i + 1}" cx="${cx}" cy="${cy}" r="${DUO_HEAD_R}"/>`),
    '</g>',
  ]),
  css: [
    `.sp-generic .tile{transform-box:fill-box;transform-origin:center;animation:sp-generic-tile ${T} both}`,
    `.sp-generic .m{stroke:var(--sp-on);stroke-dasharray:1;transform-box:fill-box;transform-origin:50% 64%;animation:sp-generic-m ${T} both}`,
    '.sp-generic .h1,.sp-generic .h2{transform-box:fill-box;transform-origin:center}',
    `.sp-generic .h1{animation:sp-generic-h1 ${T} both}`,
    `.sp-generic .h2{animation:sp-generic-h2 ${T} both}`,
    `.sp-generic .clap{stroke:var(--sp-on);opacity:0;transform-box:fill-box;transform-origin:center;animation:sp-generic-clap ${T} both}`,
    '@keyframes sp-generic-tile{0%{opacity:0;transform:scale(.6);animation-timing-function:cubic-bezier(.2,.8,.2,1)}14%{opacity:1;transform:scale(1.04)}22%,100%{opacity:1;transform:none}}',
    '@keyframes sp-generic-m{0%,8%{opacity:0;stroke-dashoffset:1}9%{opacity:1;stroke-dashoffset:1;animation-timing-function:cubic-bezier(.5,0,.3,1)}' +
      '38%{stroke-dashoffset:0;transform:none}44%{transform:none;animation-timing-function:ease-out}48%{transform:scale(1.07)}56%,100%{opacity:1;stroke-dashoffset:0;transform:none}}',
    '@keyframes sp-generic-h1{0%,27%{transform:scale(0)}35%{transform:scale(1.28)}41%{transform:scale(.9)}46%,100%{transform:none}}',
    '@keyframes sp-generic-h2{0%,32%{transform:scale(0)}40%{transform:scale(1.28)}46%{transform:scale(.9)}51%,100%{transform:none}}',
    '@keyframes sp-generic-clap{0%,46%{opacity:0;transform:scale(.3)}49%{opacity:.9}64%,100%{opacity:0;transform:scale(1.9)}}',
  ].join('\n'),
};

/** La de BowlingX, igual: la bola entra girando y los 3 pinos salen volando. */
const PIN = (x: number, y: number) =>
  `<g class="pin p${(x - 102) / 20}"><path class="pc" d="M${x} ${y}c-7 0-8-12-4-21 2-5 1-9 1-13 0-7 1-12 3-12s3 5 3 12c0 4-1 8 1 13 4 9 3 21-4 21z"/>` +
  `<rect x="${x - 3}" y="${y - 36}" width="6" height="3" rx="1" fill="#e5484d"/></g>`;
const bowling: Scene = {
  id: 'bowling',
  label: 'Boliche',
  svg: svg('bowling', [
    PIN(122, 108),
    PIN(142, 104),
    PIN(162, 108),
    '<g class="ball">',
    '  <circle class="acc" cx="104" cy="92" r="17"/>',
    '  <circle cx="99" cy="85" r="2.6" fill="#fff" fill-opacity=".85"/>',
    '  <circle cx="107" cy="83" r="2.6" fill="#fff" fill-opacity=".85"/>',
    '  <circle cx="104" cy="91" r="2.6" fill="#fff" fill-opacity=".85"/>',
    '</g>',
    '<path class="gnd" d="M20 110H210"/>',
  ]),
  css: [
    `.sp-bowling .ball{transform-box:fill-box;transform-origin:center;filter:drop-shadow(0 3px 3px rgb(16 24 40 / .25));animation:sp-bowling-roll ${T} both}`,
    `.sp-bowling .pin{transform-box:fill-box;transform-origin:50% 100%;filter:var(--sp-drop);animation:sp-bowling-p1 ${T} both}`,
    '.sp-bowling .p2{animation-name:sp-bowling-p2}',
    '.sp-bowling .p3{animation-name:sp-bowling-p3}',
    '@keyframes sp-bowling-roll{0%{transform:translateX(-160px) rotate(-540deg);animation-timing-function:cubic-bezier(.3,.7,.4,1)}35%,100%{transform:none}}',
    '@keyframes sp-bowling-p1{0%,27.5%{opacity:1;transform:none;animation-timing-function:ease-in}52.5%,100%{opacity:0;transform:translate(26px,-10px) rotate(80deg)}}',
    '@keyframes sp-bowling-p2{0%,30%{opacity:1;transform:none;animation-timing-function:ease-in}55%,100%{opacity:0;transform:translate(10px,-22px) rotate(-70deg)}}',
    '@keyframes sp-bowling-p3{0%,32.5%{opacity:1;transform:none;animation-timing-function:ease-in}57.5%,100%{opacity:0;transform:translate(30px,6px) rotate(95deg)}}',
  ].join('\n'),
};

/** La pala gira desde atrás y golpea; la pelota rebota en el cristal (que destella) y vuelve al centro. */
const padel: Scene = {
  id: 'padel',
  label: 'Pádel',
  svg: svg('padel', [
    '<rect class="glass" x="186" y="22" width="8" height="88" rx="1.5"/>',
    '<path class="hit" d="M181 44l-5-5M179 52h-7M181 60l-5 5"/>',
    '<path class="gnd" d="M20 110H206"/>',
    '<g class="racket">',
    '  <rect class="pc" x="37" y="74" width="6" height="26" rx="2.5"/>',
    '  <path class="wrap" d="M37 88h6M37 92h6M37 96h6"/>',
    '  <ellipse class="pc" cx="40" cy="57" rx="15" ry="18.5"/>',
    '  <path class="holes" d="M34 50h12M34 57h12M34 64h12"/>',
    '</g>',
    '<g class="bx">',
    '  <ellipse class="shadow" cx="116" cy="110" rx="5" ry="1.4"/>',
    '  <g class="by"><circle class="acc ball" cx="116" cy="80" r="5.5"/></g>',
    '</g>',
  ]),
  css: [
    `.sp-padel .glass{fill:var(--sp-acc);fill-opacity:.12;stroke:var(--sp-acc);stroke-opacity:.5;stroke-width:1.2;animation:sp-padel-glass ${T} both}`,
    `.sp-padel .hit{fill:none;stroke:var(--sp-acc);stroke-width:1.6;stroke-linecap:round;opacity:0;animation:sp-padel-hit ${T} both}`,
    '.sp-padel .holes{fill:none;stroke:var(--sp-edge);stroke-width:3;stroke-linecap:round;stroke-dasharray:0 6}',
    '.sp-padel .wrap{fill:none;stroke:var(--sp-edge);stroke-width:1.2}',
    `.sp-padel .racket{filter:var(--sp-drop);transform-box:view-box;transform-origin:40px 100px;animation:sp-padel-racket ${T} both}`,
    '.sp-padel .shadow{fill:var(--sp-fg);opacity:.14}',
    `.sp-padel .ball{filter:${SHADOW}}`,
    `.sp-padel .bx{animation:sp-padel-x ${T} both}`,
    `.sp-padel .by{animation:sp-padel-y ${T} both}`,
    '@keyframes sp-padel-racket{0%{transform:rotate(-85deg);animation-timing-function:cubic-bezier(.5,0,.8,.4)}16%{transform:rotate(4deg);animation-timing-function:ease-out}' +
      '24%{transform:rotate(16deg);animation-timing-function:ease-in-out}40%,100%{transform:none}}',
    '@keyframes sp-padel-x{0%,15%{transform:translateX(-54px);animation-timing-function:linear}36%{transform:translateX(64px);animation-timing-function:cubic-bezier(.3,.6,.5,1)}58%,100%{transform:none}}',
    `@keyframes sp-padel-y{0%{transform:translateY(-30px);animation-timing-function:${DOWN}}15%{transform:translateY(-20px);animation-timing-function:${UP}}` +
      `26%{transform:translateY(-36px);animation-timing-function:${DOWN}}36%{transform:translateY(-28px);animation-timing-function:cubic-bezier(.4,0,.6,1)}58%,100%{transform:none}}`,
    '@keyframes sp-padel-glass{0%,35%{fill-opacity:.12}38%{fill-opacity:.55}54%,100%{fill-opacity:.12}}',
    '@keyframes sp-padel-hit{0%,35%{opacity:0}38%{opacity:1}52%,100%{opacity:0}}',
  ].join('\n'),
};

/** La pelota cruza la red en arco, bota del otro lado (se aplasta y deja la marca) y sale de la escena. */
const tennis: Scene = {
  id: 'tennis',
  label: 'Tenis',
  svg: svg('tennis', [
    '<path class="gnd" d="M20 110H210"/>',
    '<ellipse class="mark" cx="150" cy="110" rx="8" ry="2"/>',
    '<path class="mesh" d="M101 80h12M101 86h12M101 92h12M101 98h12M101 104h12M104.5 76v34M108 76v34M111.5 76v34"/>',
    '<path class="post" d="M100 110V71"/>',
    '<rect class="pc" x="98.5" y="72" width="15" height="3.5" rx="1"/>',
    '<g class="bx"><g class="by"><g class="sq"><g class="spin">',
    '  <circle class="acc" cx="150" cy="104" r="6"/>',
    '  <path class="seam" d="M145.2 100.4c3 1.8 3 5.4 0 7.2M154.8 100.4c-3 1.8-3 5.4 0 7.2"/>',
    '</g></g></g></g>',
  ]),
  css: [
    '.sp-tennis .post{fill:none;stroke:var(--sp-fg);stroke-opacity:.7;stroke-width:2.2;stroke-linecap:round}',
    '.sp-tennis .mesh{fill:none;stroke:var(--sp-fg);stroke-opacity:.28;stroke-width:.8}',
    `.sp-tennis .mark{fill:var(--sp-fg);opacity:.16;transform-box:fill-box;transform-origin:center;animation:sp-tennis-mark ${T} both}`,
    '.sp-tennis .seam{fill:none;stroke:var(--sp-on);stroke-width:1.1;stroke-linecap:round}',
    `.sp-tennis .bx{animation:sp-tennis-x ${T} linear both}`,
    `.sp-tennis .by{filter:${SHADOW};animation:sp-tennis-y ${T} both}`,
    `.sp-tennis .sq{transform-box:fill-box;transform-origin:50% 100%;animation:sp-tennis-sq ${T} both}`,
    `.sp-tennis .spin{transform-box:fill-box;transform-origin:center;animation:sp-tennis-spin ${T} both}`,
    '@keyframes sp-tennis-x{0%{transform:translateX(-165px)}40%{transform:none}62%{opacity:1}70%,100%{opacity:0;transform:translateX(95px)}}',
    `@keyframes sp-tennis-y{0%{transform:translateY(-50px);animation-timing-function:${UP}}16%{transform:translateY(-78px);animation-timing-function:${DOWN}}` +
      `40%{transform:none;animation-timing-function:${UP}}56%{transform:translateY(-40px);animation-timing-function:${DOWN}}70%,100%{transform:translateY(-16px)}}`,
    '@keyframes sp-tennis-sq{0%,38%{transform:none}40.5%{transform:scale(1.3,.7)}44%,100%{transform:none}}',
    '@keyframes sp-tennis-spin{0%{transform:rotate(-540deg)}40%{transform:none}70%,100%{transform:rotate(260deg)}}',
    '@keyframes sp-tennis-mark{0%,39%{opacity:0;transform:scale(.3)}42%{opacity:.3;transform:none}100%{opacity:.16;transform:none}}',
  ].join('\n'),
};

/** Una pelota perforada pasa suave sobre la red baja y cae en la zona de no volea (kitchen), que se ilumina. */
const pickleball: Scene = {
  id: 'pickleball',
  label: 'Pickleball',
  svg: svg('pickleball', [
    '<path class="kitchen" d="M117 110h40l-4-8h-32z"/>',
    '<path class="gnd" d="M20 110H206"/>',
    '<path class="mesh" d="M109 91h7M109 96h7M109 101h7M109 106h7M112.5 88v22M116 88v22"/>',
    '<path class="post" d="M108 110V86"/>',
    '<rect class="pc" x="106.5" y="86" width="10" height="3" rx="1"/>',
    '<g class="paddle">',
    '  <rect class="pc" x="41" y="78" width="6" height="22" rx="2.5"/>',
    '  <path class="wrap" d="M41 86h6M41 90.5h6M41 95h6"/>',
    '  <rect class="pc" x="32" y="48" width="24" height="31" rx="9"/>',
    '  <rect class="stripe" x="36" y="52" width="16" height="23" rx="6"/>',
    '</g>',
    '<g class="bx"><g class="by"><g class="spin">',
    '  <circle class="acc" cx="138" cy="104" r="6"/>',
    '  <path class="dots" d="M138 100.8h0m2.8 1.6h0m0 3.2h0m-2.8 1.6h0m-2.8-1.6h0m0-3.2h0m2.8 1.6h0"/>',
    '</g></g></g>',
  ]),
  css: [
    `.sp-pickleball .kitchen{fill:var(--sp-acc);fill-opacity:.14;animation:sp-pickleball-k ${T} both}`,
    '.sp-pickleball .post{fill:none;stroke:var(--sp-fg);stroke-opacity:.7;stroke-width:2.2;stroke-linecap:round}',
    '.sp-pickleball .mesh{fill:none;stroke:var(--sp-fg);stroke-opacity:.28;stroke-width:.8}',
    '.sp-pickleball .wrap{fill:none;stroke:var(--sp-edge);stroke-width:1.2}',
    '.sp-pickleball .stripe{fill:var(--sp-acc);fill-opacity:.16}',
    '.sp-pickleball .dots{fill:none;stroke:var(--sp-on);stroke-width:1.8;stroke-linecap:round}',
    `.sp-pickleball .paddle{filter:var(--sp-drop);transform-box:view-box;transform-origin:44px 100px;animation:sp-pickleball-paddle ${T} both}`,
    `.sp-pickleball .bx{animation:sp-pickleball-x ${T} both}`,
    `.sp-pickleball .by{filter:${SHADOW};animation:sp-pickleball-y ${T} both}`,
    `.sp-pickleball .spin{transform-box:fill-box;transform-origin:center;animation:sp-pickleball-spin ${T} both}`,
    '@keyframes sp-pickleball-paddle{0%{transform:rotate(-28deg);animation-timing-function:ease-in}9%{transform:rotate(8deg);animation-timing-function:ease-out}22%,100%{transform:none}}',
    '@keyframes sp-pickleball-x{0%,7%{transform:translateX(-76px);animation-timing-function:linear}44%{transform:translateX(-6px);animation-timing-function:ease-out}56%,100%{transform:none}}',
    `@keyframes sp-pickleball-y{0%{transform:translateY(-44px);animation-timing-function:ease-in}7%{transform:translateY(-38px);animation-timing-function:${UP}}` +
      `24%{transform:translateY(-62px);animation-timing-function:${DOWN}}44%{transform:none;animation-timing-function:${UP}}` +
      `50%{transform:translateY(-9px);animation-timing-function:${DOWN}}56%,100%{transform:none}}`,
    '@keyframes sp-pickleball-spin{0%,7%{transform:rotate(-260deg);animation-timing-function:ease-out}56%,100%{transform:none}}',
    '@keyframes sp-pickleball-k{0%,43%{fill-opacity:.14}47%{fill-opacity:.5}66%,100%{fill-opacity:.14}}',
  ].join('\n'),
};

/** La pelota entra en arco y pasa limpia por el aro (entre la mitad de atrás y la de adelante); la malla se estira. */
const basketball: Scene = {
  id: 'basketball',
  label: 'Baloncesto',
  svg: svg('basketball', [
    '<path class="gnd" d="M20 110H206"/>',
    '<path class="pole" d="M200 110V38h-13"/>',
    '<rect class="pc" x="182" y="16" width="5" height="44" rx="1.2"/>',
    '<path class="rim" d="M150 50a15 3.4 0 0 1 30 0"/>',
    '<g class="bx"><g class="by"><g class="spin">',
    '  <circle class="acc" cx="165" cy="100.5" r="9.5"/>',
    '  <path class="seam" d="M155.5 100.5h19M165 91v19M158.3 93.8c3.2 3.6 3.2 9.8 0 13.4M171.7 93.8c-3.2 3.6-3.2 9.8 0 13.4"/>',
    '</g></g></g>',
    '<path class="net" d="M151 51l6 21M158 51.5l3 20.5M165 52v20M172 51.5l-3 20.5M179 51l-6 21M153 58h24M155 65h20"/>',
    '<path class="rim" d="M150 50a15 3.4 0 0 0 30 0M180 50h2"/>',
  ]),
  css: [
    '.sp-basketball .pole{fill:none;stroke:var(--sp-fg);stroke-opacity:.45;stroke-width:3;stroke-linejoin:round}',
    '.sp-basketball .rim{fill:none;stroke:var(--sp-fg);stroke-opacity:.85;stroke-width:2.2;stroke-linecap:round}',
    `.sp-basketball .net{fill:none;stroke:var(--sp-fg);stroke-opacity:.45;stroke-width:1;transform-box:fill-box;transform-origin:50% 0;animation:sp-basketball-net ${T} both}`,
    '.sp-basketball .seam{fill:none;stroke:var(--sp-on);stroke-width:1.1}',
    `.sp-basketball .bx{animation:sp-basketball-x ${T} both}`,
    `.sp-basketball .by{filter:drop-shadow(0 3px 3px rgb(16 24 40 / .22));animation:sp-basketball-y ${T} both}`,
    `.sp-basketball .spin{transform-box:fill-box;transform-origin:center;animation:sp-basketball-spin ${T} both}`,
    '@keyframes sp-basketball-x{0%{transform:translateX(-127px);animation-timing-function:linear}38%{transform:translateX(-3px);animation-timing-function:ease-out}50%,100%{transform:none}}',
    `@keyframes sp-basketball-y{0%{transform:translateY(-8px);animation-timing-function:${UP}}20%{transform:translateY(-92px);animation-timing-function:${DOWN}}` +
      `38%{transform:translateY(-61px);animation-timing-function:cubic-bezier(.4,0,.8,.6)}58%{transform:none;animation-timing-function:${UP}}` +
      `64%{transform:translateY(-9px);animation-timing-function:${DOWN}}70%,100%{transform:none}}`,
    '@keyframes sp-basketball-spin{0%{transform:rotate(-400deg);animation-timing-function:ease-out}58%,100%{transform:none}}',
    '@keyframes sp-basketball-net{0%,43%{transform:none}50%{transform:scale(.9,1.38)}58%{transform:scale(1.03,.94)}64%,100%{transform:none}}',
  ].join('\n'),
};

/** La pelota entra girando al arco (por detrás del palo) y la red se infla hacia atrás; la pelota se queda dentro. */
const football: Scene = {
  id: 'football',
  label: 'Fútbol y futsal',
  svg: svg('football', [
    '<g class="net">',
    '  <path class="net-bg" d="M160 48L202 56V110H160z"/>',
    '  <path class="mesh" d="M170.5 50V110M181 52V110M191.5 54V110M160 64h42M160 78h42M160 92h42"/>',
    '</g>',
    '<path class="frame" d="M160 48L202 56V110"/>',
    '<path class="gnd" d="M14 110H206"/>',
    '<path class="tufts" d="M34 110l2-5 1.5 5M38 110l2-4 1 4M84 110l2-5 1.5 5M128 110l2-4 1.5 4M131.5 110l2-5 1 5"/>',
    '<g class="bx"><g class="by"><g class="spin">',
    '  <circle class="pc" cx="184" cy="102" r="8"/>',
    '  <path class="acc" d="M184 98.6L187.23 100.95L186 104.75H182L180.77 100.95Z"/>',
    '  <path class="seams" d="M184 98.6V94.8M187.23 100.95L190.85 99.78M186 104.75L188.23 107.82M182 104.75L179.77 107.82M180.77 100.95L177.15 99.78"/>',
    '</g></g></g>',
    '<path class="post-e" d="M160 110V48"/>',
    '<path class="post" d="M160 110V48"/>',
  ]),
  css: [
    '.sp-football .net-bg{fill:var(--sp-fg);fill-opacity:.04}',
    '.sp-football .mesh{fill:none;stroke:var(--sp-fg);stroke-opacity:.3;stroke-width:.8}',
    `.sp-football .net{transform-box:fill-box;transform-origin:0 50%;animation:sp-football-net ${T} both}`,
    '.sp-football .frame{fill:none;stroke:var(--sp-edge);stroke-width:1.4;stroke-linejoin:round}',
    '.sp-football .tufts{fill:none;stroke:var(--sp-gnd);stroke-opacity:var(--sp-gnd-o);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}',
    '.sp-football .post-e{stroke:var(--sp-edge);stroke-width:5;stroke-linecap:round}',
    '.sp-football .post{stroke:var(--sp-piece);stroke-width:2.6;stroke-linecap:round}',
    '.sp-football .seams{fill:none;stroke:var(--sp-edge);stroke-width:1}',
    `.sp-football .bx{animation:sp-football-x ${T} both}`,
    `.sp-football .by{filter:${SHADOW};animation:sp-football-y ${T} both}`,
    `.sp-football .spin{transform-box:fill-box;transform-origin:center;animation:sp-football-spin ${T} both}`,
    '@keyframes sp-football-x{0%{transform:translateX(-160px);animation-timing-function:linear}44%{transform:translateX(9px);animation-timing-function:ease-out}54%{transform:translateX(3px)}62%,100%{transform:none}}',
    `@keyframes sp-football-y{0%{transform:none;animation-timing-function:${UP}}20%{transform:translateY(-42px);animation-timing-function:${DOWN}}` +
      `44%{transform:translateY(-14px);animation-timing-function:${DOWN}}54%{transform:none;animation-timing-function:${UP}}` +
      `58%{transform:translateY(-4px);animation-timing-function:${DOWN}}62%,100%{transform:none}}`,
    '@keyframes sp-football-spin{0%{transform:rotate(-720deg);animation-timing-function:cubic-bezier(.2,.6,.4,1)}54%,100%{transform:none}}',
    '@keyframes sp-football-net{0%,43%{transform:none}48%{transform:scale(1.2,1.02)}56%{transform:scale(.96,1)}64%,100%{transform:none}}',
  ].join('\n'),
};

/** La pelota rueda frenando por el green y cae al hoyo (recortada por el borde); la bandera ondea. */
const golf: Scene = {
  id: 'golf',
  label: 'Golf',
  svg: svg('golf', [
    '<clipPath id="__ID__c"><path d="M0-40H220V106.5H0z"/></clipPath>',
    '<ellipse class="green" cx="112" cy="107" rx="100" ry="7"/>',
    '<ellipse class="cup" cx="160" cy="106.5" rx="7.5" ry="2.4"/>',
    '<path class="pole" d="M160 106V28"/>',
    '<path class="acc flag" d="M160.8 29l24 6.5-24 6.5z"/>',
    '<g clip-path="url(#__ID__c)"><g class="bx"><g class="by"><g class="spin">',
    '  <circle class="pc" cx="160" cy="106" r="5"/>',
    '  <path class="dimples" d="M157.8 104h0m4.4 0h0m-2.2-2.2h0"/>',
    '</g></g></g></g>',
  ]),
  css: [
    '.sp-golf .green{fill:var(--sp-acc);fill-opacity:.15}',
    '.sp-golf .cup{fill:var(--sp-hole)}',
    '.sp-golf .pole{fill:none;stroke:var(--sp-fg);stroke-opacity:.75;stroke-width:1.6;stroke-linecap:round}',
    `.sp-golf .flag{transform-box:fill-box;transform-origin:0 50%;animation:sp-golf-flag ${T} ease-in-out both}`,
    '.sp-golf .dimples{fill:none;stroke:var(--sp-edge);stroke-width:1.1;stroke-linecap:round}',
    `.sp-golf .bx{animation:sp-golf-x ${T} both}`,
    `.sp-golf .by{animation:sp-golf-y ${T} both}`,
    `.sp-golf .spin{transform-box:fill-box;transform-origin:center;animation:sp-golf-spin ${T} both}`,
    '@keyframes sp-golf-x{0%{transform:translateX(-128px);animation-timing-function:cubic-bezier(.25,.6,.4,1)}44%,100%{transform:none}}',
    '@keyframes sp-golf-y{0%,45%{transform:translateY(-6px);animation-timing-function:cubic-bezier(.5,0,1,1)}51%{transform:translateY(1px)}55%{transform:translateY(-1px)}59%,100%{transform:none}}',
    '@keyframes sp-golf-spin{0%{transform:rotate(-600deg);animation-timing-function:cubic-bezier(.25,.6,.4,1)}44%,100%{transform:none}}',
    '@keyframes sp-golf-flag{0%,25%,50%,75%,100%{transform:none}12.5%,62.5%{transform:skewY(6deg) scaleX(.86)}37.5%,87.5%{transform:skewY(-4deg) scaleX(.94)}}',
  ].join('\n'),
};

/** Ola que se repite cada 20 px (se desplaza 20 o 40 px por vuelta: el bucle no salta). */
const wave = (y: number, amp: number) => `M-24 ${y}q5 ${-amp} 10 0${'t10 0'.repeat(25)}`;

/** El nadador cruza con dos brazadas mientras las olas corren, toca la pared (la placa destella) y sale el cronómetro. */
const swimming: Scene = {
  id: 'swimming',
  label: 'Natación',
  svg: svg('swimming', [
    '<clipPath id="__ID__w"><path d="M14 0H196V120H14z"/></clipPath>',
    '<clipPath id="__ID__a"><path d="M0 0H240V84H0z"/></clipPath>',
    '<path class="water" d="M14 84H196V110H14z"/>',
    '<path class="gnd" d="M16 110H196"/>',
    '<rect class="flash" x="187" y="60" width="11" height="36" rx="3"/>',
    '<g clip-path="url(#__ID__w)"><g class="sw">',
    '  <path class="body" d="M136 89q22-6 40-5"/>',
    '  <path class="kick" d="M122 83q3-5 6 0M114 85q2.5-4 5 0"/>',
    '  <circle class="pc" cx="181" cy="78" r="7"/>',
    '  <path class="acc" d="M174 78a7 7 0 0 1 14 0z"/>',
    '  <path class="gog" d="M184.5 79.6h3.2"/>',
    '  <g clip-path="url(#__ID__a)"><g class="arm"><path class="arm-e" d="M172 84q9-7 19-4"/><path class="arm-i" d="M172 84q9-7 19-4"/></g></g>',
    '</g></g>',
    `<g clip-path="url(#__ID__w)"><path class="wave w1" d="${wave(84, 3)}"/><path class="wave w2" d="${wave(94, 2)}"/></g>`,
    '<path class="rope r1" d="M20 101H188"/>',
    '<path class="rope r2" d="M26 101H182"/>',
    '<rect class="pc" x="196" y="54" width="8" height="58" rx="1.5"/>',
    '<rect class="acc" x="192.5" y="66" width="3.5" height="24" rx="1"/>',
    '<g class="timer">',
    '  <circle class="pc" cx="176" cy="30" r="10"/>',
    '  <path class="knob" d="M176 20v-3M173 16.5h6"/>',
    '  <path class="hand" d="M176 30v-6.5"/>',
    '</g>',
  ]),
  css: [
    '.sp-swimming .water{fill:var(--sp-acc);fill-opacity:.07}',
    '.sp-swimming .wave{fill:none;stroke:var(--sp-acc);stroke-linecap:round}',
    `.sp-swimming .w1{stroke-opacity:.6;stroke-width:1.6;animation:sp-swimming-w1 ${T} linear both}`,
    `.sp-swimming .w2{stroke-opacity:.3;stroke-width:1.4;animation:sp-swimming-w2 ${T} linear both}`,
    '.sp-swimming .rope{fill:none;stroke-width:3.6;stroke-linecap:round;stroke-dasharray:0 12}',
    '.sp-swimming .r1{stroke:var(--sp-acc)}',
    '.sp-swimming .r2{stroke:var(--sp-edge)}',
    '.sp-swimming .body{fill:none;stroke:var(--sp-acc);stroke-opacity:.3;stroke-width:8;stroke-linecap:round}',
    '.sp-swimming .gog{fill:none;stroke:var(--sp-fg);stroke-width:1.6;stroke-linecap:round}',
    '.sp-swimming .kick{fill:none;stroke:var(--sp-edge);stroke-width:1.2;stroke-linecap:round}',
    '.sp-swimming .arm-e{fill:none;stroke:var(--sp-edge);stroke-width:4.2;stroke-linecap:round}',
    '.sp-swimming .arm-i{fill:none;stroke:var(--sp-piece);stroke-width:2.2;stroke-linecap:round}',
    `.sp-swimming .arm{transform-box:view-box;transform-origin:172px 84px;animation:sp-swimming-arm ${T} both}`,
    `.sp-swimming .sw{animation:sp-swimming-sw ${T} both}`,
    `.sp-swimming .flash{fill:var(--sp-acc);opacity:0;animation:sp-swimming-flash ${T} both}`,
    `.sp-swimming .timer{transform-box:fill-box;transform-origin:center;animation:sp-swimming-timer ${T} both}`,
    '.sp-swimming .knob{fill:none;stroke:var(--sp-edge);stroke-width:2;stroke-linecap:round}',
    `.sp-swimming .hand{fill:none;stroke:var(--sp-acc);stroke-width:1.8;stroke-linecap:round;transform-box:view-box;transform-origin:176px 30px;animation:sp-swimming-hand ${T} both}`,
    '@keyframes sp-swimming-sw{0%{transform:translateX(-150px);animation-timing-function:cubic-bezier(.3,.2,.5,1)}54%,100%{transform:none}}',
    '@keyframes sp-swimming-arm{0%{transform:rotate(-720deg);animation-timing-function:cubic-bezier(.3,.2,.5,1)}54%,100%{transform:none}}',
    '@keyframes sp-swimming-w1{to{transform:translateX(-40px)}}',
    '@keyframes sp-swimming-w2{to{transform:translateX(-20px)}}',
    '@keyframes sp-swimming-flash{0%,53%{opacity:0}56%{opacity:.55}74%,100%{opacity:0}}',
    '@keyframes sp-swimming-timer{0%,55%{opacity:0;transform:scale(.4)}62%{opacity:1;transform:scale(1.12)}68%,100%{opacity:1;transform:none}}',
    '@keyframes sp-swimming-hand{0%,56%{transform:rotate(-150deg)}72%,100%{transform:none}}',
  ].join('\n'),
};

/**
 * El saque reglamentario del ping pong: la paleta golpea, la pelota bota en su lado de la mesa, pasa baja sobre la
 * red y bota del otro lado (esa mitad se ilumina y queda la marca); da un saltito y se queda quieta.
 */
const tableTennis: Scene = {
  id: 'table_tennis',
  label: 'Ping pong',
  svg: svg('table_tennis', [
    '<path class="gnd" d="M20 110H206"/>',
    '<path class="leg" d="M46 83v27M174 83v27"/>',
    '<rect class="acc top" x="30" y="78" width="160" height="5" rx="1"/>',
    '<rect class="half" x="111" y="78" width="79" height="5"/>',
    '<path class="line" d="M110 78v5"/>',
    '<ellipse class="mark" cx="138" cy="78" rx="5" ry="1.3"/>',
    '<path class="mesh" d="M105 69h10M105 72h10M105 75h10M106.5 67v10M113.5 67v10"/>',
    '<path class="post" d="M110 78V66"/>',
    '<g class="paddle">',
    '  <rect class="pc" x="23.5" y="65" width="5" height="17" rx="2"/>',
    '  <circle class="acc" cx="26" cy="56" r="11"/>',
    '  <circle class="face" cx="26" cy="56" r="8"/>',
    '</g>',
    '<g class="bx"><g class="by"><g class="sq">',
    '  <circle class="pc ball" cx="150" cy="74.8" r="3.2"/>',
    '</g></g></g>',
  ]),
  css: [
    '.sp-table_tennis .top{filter:var(--sp-drop)}',
    '.sp-table_tennis .leg{fill:none;stroke:var(--sp-fg);stroke-opacity:.5;stroke-width:2.2;stroke-linecap:round}',
    `.sp-table_tennis .half{fill:var(--sp-on);fill-opacity:.18;animation:sp-table_tennis-half ${T} both}`,
    '.sp-table_tennis .line{fill:none;stroke:var(--sp-on);stroke-width:1.2}',
    `.sp-table_tennis .mark{fill:var(--sp-fg);opacity:.3;transform-box:fill-box;transform-origin:center;animation:sp-table_tennis-mark ${T} both}`,
    '.sp-table_tennis .post{fill:none;stroke:var(--sp-fg);stroke-opacity:.7;stroke-width:2;stroke-linecap:round}',
    '.sp-table_tennis .mesh{fill:none;stroke:var(--sp-fg);stroke-opacity:.28;stroke-width:.8}',
    '.sp-table_tennis .face{fill:none;stroke:var(--sp-on);stroke-opacity:.35;stroke-width:1.2}',
    `.sp-table_tennis .paddle{filter:var(--sp-drop);transform-box:view-box;transform-origin:26px 82px;animation:sp-table_tennis-paddle ${T} both}`,
    '.sp-table_tennis .ball{stroke-width:1}',
    `.sp-table_tennis .bx{animation:sp-table_tennis-x ${T} both}`,
    `.sp-table_tennis .by{filter:${SHADOW};animation:sp-table_tennis-y ${T} both}`,
    `.sp-table_tennis .sq{transform-box:fill-box;transform-origin:50% 100%;animation:sp-table_tennis-sq ${T} both}`,
    '@keyframes sp-table_tennis-paddle{0%{transform:rotate(-35deg);animation-timing-function:ease-in}8%{transform:none;animation-timing-function:ease-out}' +
      '14%{transform:rotate(8deg);animation-timing-function:ease-in-out}26%,100%{transform:none}}',
    '@keyframes sp-table_tennis-x{0%,8%{transform:translateX(-116px);animation-timing-function:linear}20%{transform:translateX(-80px);animation-timing-function:linear}' +
      '36%{transform:translateX(-40px);animation-timing-function:linear}50%{transform:translateX(-12px);animation-timing-function:ease-out}' +
      '58%{transform:translateX(-5px);animation-timing-function:ease-out}66%,100%{transform:none}}',
    `@keyframes sp-table_tennis-y{0%,8%{transform:translateY(-26px);animation-timing-function:${DOWN}}20%{transform:none;animation-timing-function:${UP}}` +
      `36%{transform:translateY(-24px);animation-timing-function:${DOWN}}50%{transform:none;animation-timing-function:${UP}}` +
      `58%{transform:translateY(-7px);animation-timing-function:${DOWN}}66%,100%{transform:none}}`,
    '@keyframes sp-table_tennis-sq{0%,19%{transform:none}20.5%{transform:scale(1.25,.75)}23%,49%{transform:none}50.5%{transform:scale(1.25,.75)}53%,100%{transform:none}}',
    '@keyframes sp-table_tennis-half{0%,49%{fill-opacity:.18}52%{fill-opacity:.5}70%,100%{fill-opacity:.18}}',
    '@keyframes sp-table_tennis-mark{0%,49%{opacity:0;transform:scale(.3)}52%{opacity:.45;transform:none}100%{opacity:.3;transform:none}}',
  ].join('\n'),
};

export const SCENES: Record<SceneId, Scene> = { generic, bowling, padel, tennis, pickleball, basketball, football, golf, swimming, table_tennis: tableTennis };

/** El SVG de una escena con sus id únicos (`prefix` distinto por cada copia en la página). */
export function sceneSvg(id: SceneId, prefix: string): string {
  return SCENES[id].svg.replaceAll('__ID__', prefix);
}

/** Todo el CSS para las escenas pedidas (por defecto, todas). */
export function splashCss(ids: readonly SceneId[] = SCENE_ORDER): string {
  return [SPLASH_BASE_CSS, ...ids.map((id) => SCENES[id].css)].join('\n');
}

// ---------- index.html ----------

const GENERATED = 'generado por scripts/icons/splash.mjs desde src/components/splash/scenes.ts; no editar a mano';
const indent = (text: string, pad: string) =>
  text
    .split('\n')
    .map((l) => (l ? pad + l : l))
    .join('\n');

/** Bloque del <head>: el CSS de la capa y de las escenas activas. */
export function splashHeadBlock(pad = '    '): string {
  return [`<!-- splash:css (${GENERATED}) -->`, '<style>', indent([SPLASH_SHELL_CSS, splashCss(LIVE_SCENES)].join('\n'), '  '), '</style>', '<!-- /splash:css -->']
    .map((l) => indent(l, pad))
    .join('\n');
}

/** Bloque del <body>: los <template> de las escenas activas, la capa y el script que elige la escena antes de pintar. */
export function splashBodyBlock(pad = '    '): string {
  // Solo los deportes con escena activa (y distinta de la genérica); lo demás cae en la genérica.
  const map: Record<string, SceneId> = {};
  for (const [sport, scene] of Object.entries(SCENE_FOR_SPORT)) if (scene !== 'generic' && LIVE_SCENES.includes(scene)) map[sport] = scene;
  const script = [
    '// Una vez por sesión (al abrir la app instalada siempre es una sesión nueva); nunca más de 4 s.',
    `// La escena es la del último deporte usado (${SPORT_KEY}); si no hay o no está activa, la genérica.`,
    '(function () {',
    "  var el = document.getElementById('splash');",
    '  try {',
    `    if (sessionStorage.getItem('${SPLASH_SEEN_KEY}')) { el.remove(); return; }`,
    `    sessionStorage.setItem('${SPLASH_SEEN_KEY}', '1');`,
    '  } catch (e) {}',
    `  var scenes = ${JSON.stringify(map)};`,
    "  var scene = 'generic';",
    '  try {',
    `    var sport = localStorage.getItem('${SPORT_KEY}');`,
    '    if (sport && Object.prototype.hasOwnProperty.call(scenes, sport)) scene = scenes[sport];',
    '  } catch (e) {}',
    "  var t = document.getElementById('sp-' + scene);",
    '  if (t) el.insertBefore(t.content.cloneNode(true), el.firstChild);',
    "  el.setAttribute('data-scene', scene);",
    "  setTimeout(function () { if (el.isConnected) { el.classList.add('out'); setTimeout(function () { el.remove(); }, 400); } }, 4000);",
    '})();',
  ].join('\n');
  return [
    `<!-- splash:html (${GENERATED}) -->`,
    ...LIVE_SCENES.map((id) => `<template id="sp-${id}">\n${indent(sceneSvg(id, `sp-${id}-`), '  ')}\n</template>`),
    '<div id="splash" class="mm-sp" aria-hidden="true"><div class="word">Match<b>Mate</b></div></div>',
    '<script>',
    indent(script, '  '),
    '</script>',
    '<!-- /splash:html -->',
  ]
    .map((l) => indent(l, pad))
    .join('\n');
}

/** Pone (o actualiza) los dos bloques en el texto de index.html, respetando sus saltos de línea. */
export function injectSplash(html: string): string {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const put = (src: string, name: string, block: string) => {
    const re = new RegExp(`[ \\t]*<!-- ${name}[ (][\\s\\S]*?<!-- /${name} -->`);
    if (!re.test(src)) throw new Error(`index.html no tiene el bloque <!-- ${name} --> … <!-- /${name} -->`);
    return src.replace(re, () => block.replace(/\n/g, eol));
  };
  return put(put(html, 'splash:css', splashHeadBlock()), 'splash:html', splashBodyBlock());
}
