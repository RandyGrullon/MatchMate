/**
 * Lo que no es pantalla del lector de QR (QrScanner.tsx), con pruebas en logic.test.ts: qué hace lo que se leyó
 * (una pantalla de la app, un código de invitación o «no es de MatchMate»), la cuenta de object-fit: cover para
 * pasar las esquinas del QR del video a la pantalla, el cuadro del centro, el resorte con que el marco persigue al
 * QR, los trazos del marco y qué decir cuando la cámara no abre.
 */

// ---------- Qué hace lo que se leyó ----------

/** Donde vive la app (los QR impresos llevan este link aunque se lean desde otra copia, p. ej. la de pruebas). */
export const PRODUCTION_ORIGIN = APP_ORIGIN;
import { APP_ORIGIN } from '../../lib/origin';

/** Código de invitación: 8 letras y números sin los que se confunden (I, O, 0, 1). */
export const INVITE_CODE = /^[A-HJ-NP-Z2-9]{8}$/;

export type ScanRoute =
  /** Una pantalla de la app: se abre ahí mismo (sin recargar). */
  | { kind: 'app'; path: string }
  /** Otra cosa (otra página, texto, wifi…): no se abre sola; se muestra con «Copiar». */
  | { kind: 'foreign'; text: string };

/**
 * Las pantallas a las que lleva un QR (las de App.tsx; `*` = el resto de la ruta, como las pestañas de una liga).
 * Lo fijo se compara sin mayúsculas (un QR en modo alfanumérico lo trae en mayúsculas) y sale en minúsculas.
 */
const ROUTES: readonly (readonly string[])[] = [
  ['unirse', ':code'],
  ['esports', 'unirse', ':code'],
  ['equipos', 'unirse', ':code'],
  ['anotar', ':code'],
  ['invitacion', ':id'],
  ['l', ':lid', '*'],
  ['u', ':id'],
  ['p', ':id'],
  ['esports', 'equipo', ':id'],
  ['equipos', ':id'],
];

/** La ruta conocida que corresponde a `pathname` (lo fijo en minúsculas) o null. */
export function knownRoute(pathname: string): string | null {
  const parts = pathname.replace(/\/+$/, '').split('/').slice(1);
  if (!parts.length || parts.some((p) => !p)) return null;
  for (const route of ROUTES) {
    const rest = route[route.length - 1] === '*';
    const fixed = rest ? route.slice(0, -1) : route;
    if (rest ? parts.length < fixed.length : parts.length !== fixed.length) continue;
    const out: string[] = [];
    let ok = true;
    fixed.forEach((seg, i) => {
      if (!ok) return;
      if (seg.startsWith(':')) out.push(parts[i]);
      else if (parts[i].toLowerCase() === seg) out.push(seg);
      else ok = false;
    });
    if (ok) return `/${[...out, ...parts.slice(fixed.length)].join('/')}`;
  }
  return null;
}

/** El host (con puerto) de cada origen válido; los que no se entienden se ignoran. */
function hostsOf(origins: readonly string[]): Set<string> {
  const hosts = new Set<string>();
  for (const o of origins) {
    try {
      hosts.add(new URL(o).host.toLowerCase());
    } catch {
      // origen raro: no cuenta
    }
  }
  return hosts;
}

/** El texto como link de la app (http/https a uno de `hosts`), o null. Acepta el link sin «https://». */
function appUrl(text: string, hosts: Set<string>): URL | null {
  const tries = /^[a-z][a-z0-9+.-]*:/i.test(text) ? [text] : [`https://${text}`];
  for (const t of tries) {
    let url: URL;
    try {
      url = new URL(t);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    if (url.username || url.password) continue;
    if (hosts.has(url.host.toLowerCase())) return url;
  }
  return null;
}

/**
 * Qué hacer con lo que leyó la cámara. `origins`: dónde corre la app (location.origin) y PRODUCTION_ORIGIN.
 * - Un link de la app (http o https al host exacto de uno de `origins`, sin usuario ni clave) → su pantalla, con ?… y
 *   #…; si la ruta no es una de las conocidas igual es de la app y se abre (si no existe, la app lleva al inicio).
 * - Un código de invitación suelto (ABCD2345, también «abcd 2345») → /unirse/<CÓDIGO>.
 * - Lo demás (otra página, javascript:, texto) → 'foreign': no se abre nunca solo.
 */
export function routeFromScan(raw: string, origins: readonly string[]): ScanRoute {
  const text = raw.trim();
  const bare = text.replace(/[\s-]/g, '').toUpperCase();
  if (INVITE_CODE.test(bare)) return { kind: 'app', path: `/unirse/${bare}` };
  if (text && !/\s/.test(text)) {
    const url = appUrl(text, hostsOf(origins));
    if (url) {
      const path = knownRoute(url.pathname) ?? (url.pathname.replace(/\/+$/, '') || '/');
      return { kind: 'app', path: `${path}${url.search}${url.hash}` };
    }
  }
  return { kind: 'foreign', text };
}

/** Lo que se escribe en «Escribir el código»: letras y números en mayúsculas, sin espacios ni guiones. */
export const normalizeCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** ¿Ya se puede ir con lo escrito? 8 letras y números (la pantalla de la invitación dice si no existe). */
export const codeReady = (s: string): boolean => /^[A-Z0-9]{8}$/.test(normalizeCode(s));

// ---------- Geometría ----------

export interface Pt {
  x: number;
  y: number;
}
/** Las 4 esquinas en orden (arriba-izq., arriba-der., abajo-der., abajo-izq. del QR tal como se leyó). */
export type Quad = [Pt, Pt, Pt, Pt];

/**
 * object-fit: cover: el cuadro de `srcW`×`srcH` (el video, o el cuadro reducido que se escaneó: es el mismo dibujo a
 * otra escala) llena `boxW`×`boxH` recortando lo que sobra, centrado. Devuelve escala y corrimiento.
 */
export function coverFit(srcW: number, srcH: number, boxW: number, boxH: number): { scale: number; dx: number; dy: number } {
  if (srcW <= 0 || srcH <= 0) return { scale: 1, dx: 0, dy: 0 };
  const scale = Math.max(boxW / srcW, boxH / srcH);
  return { scale, dx: (boxW - srcW * scale) / 2, dy: (boxH - srcH * scale) / 2 };
}

/** Puntos del cuadro escaneado (`srcW`×`srcH`) a la pantalla (`boxW`×`boxH`) con object-fit: cover. */
export function mapCover(points: readonly Pt[], srcW: number, srcH: number, boxW: number, boxH: number): Pt[] {
  const { scale, dx, dy } = coverFit(srcW, srcH, boxW, boxH);
  return points.map((p) => ({ x: p.x * scale + dx, y: p.y * scale + dy }));
}

/** Las 4 esquinas de lo leído como Quad (null si no son 4 números). */
export function toQuad(points: readonly Pt[] | null | undefined): Quad | null {
  if (!points || points.length !== 4 || points.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) return null;
  return points.map((p) => ({ x: p.x, y: p.y })) as Quad;
}

const dist2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/**
 * Las esquinas leídas en el orden que más se parece al marco de ahora: así el marco no da media vuelta si el QR está
 * de lado o de cabeza (la «esquina de arriba» del QR puede estar abajo en la pantalla). Prueba los 4 giros y, por si
 * la imagen viene en espejo, el otro sentido.
 */
export function alignCorners(current: Quad, found: Quad): Quad {
  let best = found;
  let bestCost = Infinity;
  const orders: Pt[][] = [found, [...found].reverse()];
  for (const order of orders) {
    for (let k = 0; k < 4; k++) {
      const q = [0, 1, 2, 3].map((i) => order[(i + k) % 4]) as Quad;
      const cost = q.reduce((s, p, i) => s + dist2(p, current[i]), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = q;
      }
    }
  }
  return best;
}

export const centerOf = (q: Quad): Pt => ({ x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 });

/** El marco un poco más grande que el QR (por `k` desde su centro): lo abraza sin tapar los bordes. */
export function growQuad(q: Quad, k: number): Quad {
  const c = centerOf(q);
  return q.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })) as Quad;
}

/** Lo más largo de un lado del cuadrilátero (para el radio de las esquinas y el largo de los trazos). */
export const quadSide = (q: Quad): number => Math.max(...q.map((p, i) => Math.sqrt(dist2(p, q[(i + 1) % 4]))));

/**
 * El cuadro del centro donde se apunta (sin QR a la vista): 70 % del ancho, hasta 280 px y no más del 42 % del alto,
 * un poco arriba del medio (abajo van los botones). `breathe` lo agranda o achica un poco (el «respirar»).
 */
export function idleQuad(boxW: number, boxH: number, breathe = 0): Quad {
  const side = Math.max(120, Math.min(boxW * 0.7, 280, boxH * 0.42)) * (1 + breathe);
  const cx = boxW / 2;
  const cy = boxH * 0.44;
  const h = side / 2;
  return [
    { x: cx - h, y: cy - h },
    { x: cx + h, y: cy - h },
    { x: cx + h, y: cy + h },
    { x: cx - h, y: cy + h },
  ];
}

/** El respirar del cuadro: ±1.5 % en un ciclo de 2.6 s (0 con menos movimiento). */
export const breatheAt = (ms: number): number => 0.015 * Math.sin((ms / 2600) * 2 * Math.PI);

// ---------- El resorte ----------

/** Las 8 coordenadas del marco en fila (x0, y0, x1, y1…) para moverlas juntas. */
export const flatQuad = (q: Quad): number[] => q.flatMap((p) => [p.x, p.y]);
export const unflatQuad = (v: readonly number[]): Quad => [0, 1, 2, 3].map((i) => ({ x: v[2 * i], y: v[2 * i + 1] })) as Quad;

/** Rigidez y freno del resorte: llega en ~0.3 s, con un rebote apenas visible. */
export const SPRING = { stiffness: 210, damping: 24 };

/**
 * Un paso del resorte (`dt` en segundos): cada coordenada se acerca a su destino con velocidad (así el marco
 * «persigue» al QR en vez de saltar). Cambia `pos` y `vel` en el lugar; pasos largos se parten para no salirse.
 */
export function springStep(pos: number[], vel: number[], target: readonly number[], dt: number, k = SPRING.stiffness, c = SPRING.damping): void {
  let left = Math.min(Math.max(dt, 0), 0.1);
  while (left > 1e-6) {
    const h = Math.min(left, 1 / 120);
    for (let i = 0; i < pos.length; i++) {
      const a = k * (target[i] - pos[i]) - c * vel[i];
      vel[i] += a * h;
      pos[i] += vel[i] * h;
    }
    left -= h;
  }
}

// ---------- Los trazos ----------

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (p: Pt) => `${r1(p.x)} ${r1(p.y)}`;
const toward = (from: Pt, to: Pt, len: number): Pt => {
  const d = Math.sqrt(dist2(from, to)) || 1;
  const t = Math.min(len, d / 2) / d;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
};

/** El cuadrilátero con las esquinas redondeadas (radio `r`): el hueco del oscurecido y el relleno al leer. */
export function roundedQuadPath(q: Quad, r: number): string {
  let d = '';
  q.forEach((p, i) => {
    const prev = q[(i + 3) % 4];
    const next = q[(i + 1) % 4];
    const a = toward(p, prev, r);
    const b = toward(p, next, r);
    d += `${i ? 'L' : 'M'}${fmt(a)}Q${fmt(p)} ${fmt(b)}`;
  });
  return `${d}Z`;
}

/** Las 4 esquinas del marco (como ⌜ ⌝ ⌟ ⌞): cada una con brazos de `arm` por los dos lados y la vuelta redondeada. */
export function cornersPath(q: Quad, arm: number, r: number): string {
  return q
    .map((p, i) => {
      const prev = q[(i + 3) % 4];
      const next = q[(i + 1) % 4];
      return `M${fmt(toward(p, prev, arm))}L${fmt(toward(p, prev, r))}Q${fmt(p)} ${fmt(toward(p, next, r))}L${fmt(toward(p, next, arm))}`;
    })
    .join('');
}

/** La pantalla entera con el hueco del marco (se pinta con fill-rule evenodd). */
export const scrimPath = (w: number, h: number, q: Quad, r: number): string => `M0 0H${r1(w)}V${r1(h)}H0Z${roundedQuadPath(q, r)}`;

/** Radio y brazos del marco según su tamaño: 22 px y 30 px en el cuadro de siempre, menos en un QR chico. */
export function frameStyle(q: Quad): { radius: number; arm: number } {
  const side = quadSide(q);
  return { radius: Math.max(6, Math.min(22, side * 0.1)), arm: Math.max(12, Math.min(34, side * 0.17)) };
}

// ---------- Cuando la cámara no abre ----------

export type CameraProblem = 'denied' | 'nocamera' | 'busy' | 'insecure' | 'error';

/** Qué pasó al pedir la cámara (por el nombre del error del navegador). */
export function cameraProblem(err: unknown, env: { secure: boolean; hasMedia: boolean }): CameraProblem {
  if (!env.secure) return 'insecure';
  if (!env.hasMedia) return 'nocamera';
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'nocamera';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'error';
}

export type Platform = 'ios' | 'android' | 'other';

/** El aviso de cada problema, con calma y con qué hacer (en el iPhone, dónde se da el permiso). */
export function problemCopy(problem: CameraProblem, platform: Platform): { title: string; body: string; retry: boolean } {
  const fallback = 'Mientras, puedes elegir una foto del QR o escribir el código.';
  switch (problem) {
    case 'denied':
      return {
        title: 'Falta el permiso de la cámara',
        body:
          platform === 'ios'
            ? `En el iPhone ve a Ajustes › Safari › Cámara y elige «Permitir». Si usas la app instalada: Ajustes › MatchMate › Cámara. ${fallback}`
            : platform === 'android'
              ? `Toca el candado junto a la dirección › Permisos › Cámara. Si usas la app instalada: mantén presionado el ícono de MatchMate › Información de la app › Permisos › Cámara. ${fallback}`
              : `Permite la cámara desde el candado junto a la dirección del navegador. ${fallback}`,
        retry: true,
      };
    case 'nocamera':
      return { title: 'No encontramos una cámara', body: `Este dispositivo no tiene cámara o no está disponible. ${fallback}`, retry: false };
    case 'busy':
      return { title: 'La cámara está ocupada', body: `Otra app la está usando: ciérrala y toca «Intentar de nuevo». ${fallback}`, retry: true };
    case 'insecure':
      return { title: 'La cámara no está disponible aquí', body: `El navegador solo deja usar la cámara en una conexión segura (https). ${fallback}`, retry: false };
    default:
      return { title: 'No pudimos abrir la cámara', body: `Toca «Intentar de nuevo». ${fallback}`, retry: true };
  }
}
