/**
 * El lector de QR sin navegador: qué hace cada texto leído (pantalla de la app, código suelto o «no es de MatchMate»),
 * la cuenta de object-fit: cover para pasar las esquinas a la pantalla, el orden de las esquinas, el resorte del
 * marco, los trazos y los avisos de la cámara.
 */
import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_ORIGIN,
  alignCorners,
  breatheAt,
  cameraProblem,
  centerOf,
  codeReady,
  cornersPath,
  coverFit,
  flatQuad,
  frameStyle,
  growQuad,
  idleQuad,
  knownRoute,
  mapCover,
  normalizeCode,
  problemCopy,
  roundedQuadPath,
  routeFromScan,
  scrimPath,
  springStep,
  toQuad,
  unflatQuad,
  type Quad,
} from './logic';

const ORIGINS = ['http://localhost:5173', PRODUCTION_ORIGIN];
const go = (text: string) => routeFromScan(text, ORIGINS);
const app = (path: string) => ({ kind: 'app', path });

describe('routeFromScan', () => {
  it('el link de invitación de producción abre /unirse dentro de la app', () => {
    expect(go('https://matchmate-oficial.vercel.app/unirse/ABCD2345')).toEqual(app('/unirse/ABCD2345'));
    // http también (el QR viejo o escrito a mano) y con espacios alrededor
    expect(go('  http://matchmate-oficial.vercel.app/unirse/ABCD2345\n')).toEqual(app('/unirse/ABCD2345'));
    // sin «https://»
    expect(go('matchmate-oficial.vercel.app/unirse/ABCD2345')).toEqual(app('/unirse/ABCD2345'));
  });

  it('el mismo origen donde corre la app (con su puerto) también cuenta', () => {
    expect(go('http://localhost:5173/esports/unirse/WXYZ6789')).toEqual(app('/esports/unirse/WXYZ6789'));
    expect(go('http://localhost:4000/unirse/ABCD2345')).toEqual({ kind: 'foreign', text: 'http://localhost:4000/unirse/ABCD2345' });
  });

  it('todas las pantallas conocidas, con ?… y #…', () => {
    const base = PRODUCTION_ORIGIN;
    expect(go(`${base}/esports/unirse/WXYZ6789`)).toEqual(app('/esports/unirse/WXYZ6789'));
    expect(go(`${base}/equipos/unirse/WXYZ6789`)).toEqual(app('/equipos/unirse/WXYZ6789'));
    expect(go(`${base}/anotar/ABCDEFGH23`)).toEqual(app('/anotar/ABCDEFGH23'));
    expect(go(`${base}/invitacion/9f1c`)).toEqual(app('/invitacion/9f1c'));
    expect(go(`${base}/l/abc123`)).toEqual(app('/l/abc123'));
    expect(go(`${base}/l/abc123/e/ev9?x=1#arriba`)).toEqual(app('/l/abc123/e/ev9?x=1#arriba'));
    expect(go(`${base}/u/user-1`)).toEqual(app('/u/user-1'));
    expect(go(`${base}/p/post-1`)).toEqual(app('/p/post-1'));
    expect(go(`${base}/esports/equipo/t1`)).toEqual(app('/esports/equipo/t1'));
    expect(go(`${base}/equipos/t1`)).toEqual(app('/equipos/t1'));
    expect(go(`${base}/unirse/ABCD2345?soy=p7`)).toEqual(app('/unirse/ABCD2345?soy=p7'));
    expect(go(`${base}/unirse/ABCD2345/`)).toEqual(app('/unirse/ABCD2345'));
  });

  it('un QR en mayúsculas (modo alfanumérico) lleva a la misma pantalla', () => {
    expect(go('HTTPS://MATCHMATE-OFICIAL.VERCEL.APP/UNIRSE/ABCD2345')).toEqual(app('/unirse/ABCD2345'));
    expect(go('HTTPS://MATCHMATE-OFICIAL.VERCEL.APP/ESPORTS/UNIRSE/WXYZ6789')).toEqual(app('/esports/unirse/WXYZ6789'));
  });

  it('otra pantalla de la app también se abre (la app decide si existe)', () => {
    expect(go(`${PRODUCTION_ORIGIN}/ligas?ver=abiertas`)).toEqual(app('/ligas?ver=abiertas'));
    expect(go(`${PRODUCTION_ORIGIN}/`)).toEqual(app('/'));
    expect(go(PRODUCTION_ORIGIN)).toEqual(app('/'));
  });

  it('un código suelto de 8 letras y números va a /unirse en mayúsculas', () => {
    expect(go('ABCD2345')).toEqual(app('/unirse/ABCD2345'));
    expect(go('abcd2345')).toEqual(app('/unirse/ABCD2345'));
    expect(go('ABCD 2345')).toEqual(app('/unirse/ABCD2345'));
    expect(go('ABCD-2345')).toEqual(app('/unirse/ABCD2345'));
    // con letras que los códigos no usan (I, O, 0, 1) o de otro largo, no
    expect(go('ABCD1234').kind).toBe('foreign');
    expect(go('ABCD23456').kind).toBe('foreign');
  });

  it('lo de afuera nunca se abre solo', () => {
    for (const t of [
      'https://example.com/unirse/ABCD2345',
      'https://matchmate-oficial.vercel.app.evil.com/unirse/ABCD2345',
      'https://matchmate-oficial.vercel.app@evil.com/unirse/ABCD2345',
      'https://user:pw@matchmate-oficial.vercel.app/unirse/ABCD2345',
      'javascript:alert(1)',
      'ftp://matchmate-oficial.vercel.app/unirse/ABCD2345',
      'WIFI:T:WPA;S:Casa;P:secreto;;',
      'Hola, esto es texto',
      '',
    ]) {
      expect(go(t), t).toEqual({ kind: 'foreign', text: t.trim() });
    }
  });

  it('sin orígenes válidos, solo el código suelto', () => {
    expect(routeFromScan('https://matchmate-oficial.vercel.app/unirse/ABCD2345', ['no es url']).kind).toBe('foreign');
    expect(routeFromScan('ABCD2345', [])).toEqual(app('/unirse/ABCD2345'));
  });

  it('knownRoute: lo fijo en minúsculas, los parámetros como vienen, sin partes vacías', () => {
    expect(knownRoute('/Unirse/abcd2345')).toBe('/unirse/abcd2345');
    expect(knownRoute('/l/L1/Ranking')).toBe('/l/L1/Ranking');
    expect(knownRoute('/unirse')).toBeNull();
    expect(knownRoute('/unirse//')).toBeNull();
    expect(knownRoute('/u/a/b')).toBeNull();
    expect(knownRoute('/ligas')).toBeNull();
  });
});

describe('escribir el código', () => {
  it('normaliza y pide 8 letras y números', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(codeReady('abcd 2345')).toBe(true);
    expect(codeReady('ABCD234')).toBe(false);
    expect(codeReady('ABCD23456')).toBe(false);
  });
});

describe('de la imagen a la pantalla (object-fit: cover)', () => {
  it('video apaisado en pantalla vertical: escala por el alto y recorta los lados', () => {
    // 1280×720 en 390×844: escala 844/720; sobra de ancho, se centra.
    const f = coverFit(1280, 720, 390, 844);
    expect(f.scale).toBeCloseTo(844 / 720, 6);
    expect(f.dy).toBeCloseTo(0, 6);
    expect(f.dx).toBeCloseTo((390 - 1280 * (844 / 720)) / 2, 6);
    // El centro del video cae en el centro de la pantalla.
    const [c] = mapCover([{ x: 640, y: 360 }], 1280, 720, 390, 844);
    expect(c.x).toBeCloseTo(195, 6);
    expect(c.y).toBeCloseTo(422, 6);
  });

  it('video vertical en pantalla más ancha: escala por el ancho y recorta arriba y abajo', () => {
    const f = coverFit(720, 1280, 1000, 1000);
    expect(f.scale).toBeCloseTo(1000 / 720, 6);
    expect(f.dx).toBeCloseTo(0, 6);
    expect(f.dy).toBeCloseTo((1000 - 1280 * (1000 / 720)) / 2, 6);
    const [tl, br] = mapCover(
      [
        { x: 0, y: 0 },
        { x: 720, y: 1280 },
      ],
      720,
      1280,
      1000,
      1000,
    );
    expect(tl.x).toBeCloseTo(0, 6);
    expect(br.x).toBeCloseTo(1000, 6);
    expect(tl.y).toBeLessThan(0);
    expect(br.y).toBeGreaterThan(1000);
  });

  it('el cuadro reducido que se escanea da los mismos puntos que el video entero', () => {
    const full = mapCover([{ x: 900, y: 300 }], 1280, 720, 390, 844)[0];
    const small = mapCover([{ x: 450, y: 150 }], 640, 360, 390, 844)[0];
    expect(small.x).toBeCloseTo(full.x, 6);
    expect(small.y).toBeCloseTo(full.y, 6);
  });

  it('sin tamaño del video no se rompe', () => {
    expect(coverFit(0, 0, 390, 844)).toEqual({ scale: 1, dx: 0, dy: 0 });
  });

  it('toQuad: solo 4 puntos con números', () => {
    expect(toQuad([{ x: 0, y: 0 }])).toBeNull();
    expect(toQuad(null)).toBeNull();
    expect(
      toQuad([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: Number.NaN },
        { x: 0, y: 1 },
      ]),
    ).toBeNull();
  });
});

const sq = (x: number, y: number, s: number): Quad => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe('el marco', () => {
  it('alignCorners: un QR de cabeza no hace girar el marco (se reordena como el de ahora)', () => {
    const now = sq(100, 100, 200);
    const upsideDown: Quad = [now[2], now[3], now[0], now[1]];
    expect(alignCorners(now, upsideDown)).toEqual(now);
    const sideways: Quad = [now[1], now[2], now[3], now[0]];
    expect(alignCorners(now, sideways)).toEqual(now);
    const mirrored: Quad = [now[1], now[0], now[3], now[2]];
    expect(alignCorners(now, mirrored)).toEqual(now);
  });

  it('growQuad agranda desde el centro', () => {
    const q = growQuad(sq(0, 0, 100), 1.1);
    expect(centerOf(q)).toEqual({ x: 50, y: 50 });
    expect(q[0].x).toBeCloseTo(-5, 6);
    expect(q[2].y).toBeCloseTo(105, 6);
  });

  it('idleQuad: centrado de lado, arriba del medio, hasta 280 px', () => {
    const q = idleQuad(390, 844);
    expect(q[1].x - q[0].x).toBeCloseTo(273, 6);
    expect(centerOf(q).x).toBeCloseTo(195, 6);
    expect(centerOf(q).y).toBeLessThan(844 / 2);
    expect(idleQuad(1200, 900)[1].x - idleQuad(1200, 900)[0].x).toBe(280);
    // apaisado y bajito: no pasa del 42 % del alto
    expect(idleQuad(800, 360)[1].x - idleQuad(800, 360)[0].x).toBeCloseTo(151.2, 6);
    const big = idleQuad(390, 844, 0.015);
    expect(big[1].x - big[0].x).toBeCloseTo(273 * 1.015, 6);
  });

  it('el respirar es chiquito', () => {
    for (const t of [0, 650, 1300, 1950, 2600]) expect(Math.abs(breatheAt(t))).toBeLessThanOrEqual(0.015);
  });

  it('springStep llega al QR y se queda quieto', () => {
    const from = flatQuad(sq(0, 0, 200));
    const to = flatQuad(sq(150, 300, 80));
    const pos = [...from];
    const vel = new Array(8).fill(0);
    let maxOver = 0;
    for (let i = 0; i < 60; i++) {
      springStep(pos, vel, to, 1 / 60);
      maxOver = Math.max(maxOver, pos[0] - to[0]);
    }
    pos.forEach((v, i) => expect(v).toBeCloseTo(to[i], 1));
    // rebota poco (menos de 6 px en un salto de 150)
    expect(maxOver).toBeLessThan(6);
    expect(unflatQuad(pos)[2].x).toBeCloseTo(230, 1);
  });

  it('springStep con un salto de tiempo grande no se dispara', () => {
    const pos = [0, 0, 0, 0, 0, 0, 0, 0];
    const vel = new Array(8).fill(0);
    springStep(pos, vel, [100, 100, 100, 100, 100, 100, 100, 100], 5);
    for (const v of pos) expect(Math.abs(v)).toBeLessThan(200);
  });

  it('los trazos: hueco redondeado, oscurecido con hueco y 4 esquinas', () => {
    const q = sq(10, 20, 100);
    const hole = roundedQuadPath(q, 10);
    expect(hole.startsWith('M10 30Q10 20 20 20')).toBe(true);
    expect(hole.endsWith('Z')).toBe(true);
    expect(scrimPath(390, 844, q, 10)).toBe(`M0 0H390V844H0Z${hole}`);
    const c = cornersPath(q, 30, 10);
    expect(c.match(/M/g)).toHaveLength(4);
    expect(c.startsWith('M10 50L10 30Q10 20 20 20L40 20')).toBe(true);
  });

  it('frameStyle: radio y brazos según el tamaño', () => {
    expect(frameStyle(sq(0, 0, 273))).toEqual({ radius: 22, arm: 34 });
    const small = frameStyle(sq(0, 0, 60));
    expect(small.radius).toBeCloseTo(6, 6);
    expect(small.arm).toBeCloseTo(12, 6);
  });
});

describe('cuando la cámara no abre', () => {
  const ok = { secure: true, hasMedia: true };
  it('cameraProblem por el nombre del error', () => {
    expect(cameraProblem({ name: 'NotAllowedError' }, ok)).toBe('denied');
    expect(cameraProblem({ name: 'SecurityError' }, ok)).toBe('denied');
    expect(cameraProblem({ name: 'NotFoundError' }, ok)).toBe('nocamera');
    expect(cameraProblem({ name: 'OverconstrainedError' }, ok)).toBe('nocamera');
    expect(cameraProblem({ name: 'NotReadableError' }, ok)).toBe('busy');
    expect(cameraProblem(new Error('raro'), ok)).toBe('error');
    expect(cameraProblem(null, { secure: false, hasMedia: false })).toBe('insecure');
    expect(cameraProblem(null, { secure: true, hasMedia: false })).toBe('nocamera');
  });

  it('el permiso negado en el iPhone dice dónde darlo (Safari y la app instalada)', () => {
    const ios = problemCopy('denied', 'ios');
    expect(ios.body).toContain('Ajustes › Safari › Cámara');
    expect(ios.body).toContain('Ajustes › MatchMate');
    expect(ios.body).toContain('elegir una foto del QR o escribir el código');
    expect(ios.retry).toBe(true);
    expect(problemCopy('denied', 'android').body).toContain('Permisos › Cámara');
    expect(problemCopy('insecure', 'other')).toMatchObject({ retry: false });
    expect(problemCopy('nocamera', 'other').title).toBe('No encontramos una cámara');
  });
});
