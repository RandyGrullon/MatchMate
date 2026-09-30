/**
 * El diseño de una bola sin pantalla: el de una bola sin diseño, la revisión (la misma de private.ball_design_ok, que
 * tests/sql/diseno-bolas.test.ts compara caso por caso), arreglar lo que llega de afuera, el texto de las figuras
 * (solo cifras o letras), los colores que salen de la base, las figuras nuevas y la semilla del dibujo.
 */
import { describe, expect, it } from 'vitest';
import {
  BALL_DESIGN_MAX_BYTES,
  BALL_PATTERNS,
  BALL_STICKER_SAMPLE_TEXT,
  BALL_STICKER_SHAPES,
  BALL_STICKER_SPOTS,
  BALL_STICKERS_MAX,
  ballDesignBytes,
  ballDesignColors,
  ballDesignOf,
  ballDesignProblem,
  ballDesignSeed,
  cleanColor,
  cleanStickerText,
  colorLuminance,
  defaultBallDesign,
  initialsOf,
  isBallDesign,
  mixColors,
  newSticker,
  normalizeBallDesign,
  nudgeSticker,
  patternLabel,
  readableOn,
  sameBallDesign,
  stickerHasText,
  stickerStartText,
  type BallDesign,
} from './ballDesign';

const FULL: BallDesign = {
  v: 1,
  base: '#0b1026',
  second: '#7c3aed',
  third: null,
  pattern: 'galaxia',
  scale: 1.25,
  softness: 0.6,
  angle: 45,
  shine: true,
  holes: false,
  stickers: [
    { shape: 'estrella', color: '#facc15', x: -0.5, y: 0.2, size: 0.25, rotation: 15 },
    { shape: 'numero', text: '123', color: '#f8fafc', x: 0, y: 0.45, size: 0.3, rotation: 0 },
    { shape: 'iniciales', text: 'ÑÁ', color: '#dc2626', x: 0.5, y: 0.2, size: 0.3, rotation: 350 },
  ],
};

/** Números al azar con semilla (para probar con basura, siempre la misma). */
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

describe('el diseño de una bola sin diseño', () => {
  it('su color, lisa, con brillo y huecos; perlada o jaspeada según la cubierta', () => {
    expect(defaultBallDesign('#DC2626')).toEqual({
      v: 1,
      base: '#dc2626',
      second: null,
      third: null,
      pattern: 'solida',
      scale: 1,
      softness: 0.5,
      angle: 30,
      shine: true,
      holes: true,
      stickers: [],
    });
    expect(defaultBallDesign('#7c3aed', 'perlada').pattern).toBe('perlada');
    expect(defaultBallDesign('#7c3aed', 'hibrida').pattern).toBe('jaspeada');
    expect(defaultBallDesign('#7c3aed', 'uretano').pattern).toBe('solida');
    // Sin color (o uno que no vale): el azul de siempre.
    expect(defaultBallDesign(null).base).toBe('#1d4ed8');
    expect(defaultBallDesign('azul').base).toBe('#1d4ed8');
    for (const cover of [null, 'solida', 'perlada', 'hibrida', 'uretano', 'poliester'] as const) {
      expect(ballDesignProblem(defaultBallDesign('#111827', cover))).toBeNull();
    }
  });

  it('ballDesignOf: el suyo (arreglado) o el de su color y su cubierta', () => {
    expect(ballDesignOf({ design: null, color: '#16a34a', cover: 'perlada' })).toMatchObject({ base: '#16a34a', pattern: 'perlada' });
    expect(ballDesignOf({ design: FULL, color: '#16a34a' })).toEqual(FULL);
    // Uno roto de la base (no debería pasar): se arregla con el color de la bola.
    expect(ballDesignOf({ design: { pattern: 'rayas' }, color: '#16a34a' })).toMatchObject({ base: '#16a34a', pattern: 'solida' });
  });
});

describe('la revisión (la misma de la base)', () => {
  it('uno completo vale; lo que falla dice dónde', () => {
    expect(ballDesignProblem(FULL)).toBeNull();
    expect(isBallDesign(FULL)).toBe(true);
    const cases: [unknown, string][] = [
      [null, 'object'],
      [[], 'object'],
      ['solida', 'object'],
      [new Date(), 'object'],
      [{ ...FULL, extra: 1 }, 'keys'],
      [Object.fromEntries(Object.entries(FULL).filter(([k]) => k !== 'angle')), 'keys'],
      [{ ...FULL, v: 2 }, 'v'],
      [{ ...FULL, v: '1' }, 'v'],
      [{ ...FULL, base: '#0B1026' }, 'base'],
      [{ ...FULL, second: '' }, 'second'],
      [{ ...FULL, third: 5 }, 'third'],
      [{ ...FULL, pattern: 'rayas' }, 'pattern'],
      [{ ...FULL, scale: 2.01 }, 'scale'],
      [{ ...FULL, softness: Number.NaN }, 'softness'],
      [{ ...FULL, angle: 361 }, 'angle'],
      [{ ...FULL, shine: 1 }, 'shine'],
      [{ ...FULL, holes: null }, 'holes'],
      [{ ...FULL, stickers: {} }, 'stickers'],
      [{ ...FULL, stickers: Array(BALL_STICKERS_MAX + 1).fill(FULL.stickers[0]) }, 'stickers'],
      [{ ...FULL, stickers: [null] }, 'stickers.0'],
      [{ ...FULL, stickers: [{ ...FULL.stickers[0], shape: 'unicornio' }] }, 'stickers.0.shape'],
      [{ ...FULL, stickers: [{ ...FULL.stickers[0], text: '1' }] }, 'stickers.0.keys'],
      [{ ...FULL, stickers: [FULL.stickers[0], { ...FULL.stickers[1], text: '1234' }] }, 'stickers.1.text'],
      [{ ...FULL, stickers: [{ ...FULL.stickers[2], text: '<b>' }] }, 'stickers.0.text'],
      [{ ...FULL, stickers: [{ ...FULL.stickers[2], text: 'ab' }] }, 'stickers.0.text'],
      [{ ...FULL, stickers: [{ ...FULL.stickers[0], color: '#FFF' }] }, 'stickers.0.color'],
      [{ ...FULL, stickers: [{ ...FULL.stickers[0], x: -1.2 }] }, 'stickers.0.x'],
      [{ ...FULL, stickers: [{ ...FULL.stickers[0], size: 0.7 }] }, 'stickers.0.size'],
      [{ ...FULL, stickers: [{ ...FULL.stickers[0], rotation: '90' }] }, 'stickers.0.rotation'],
    ];
    for (const [x, problem] of cases) expect(ballDesignProblem(x), JSON.stringify(x)).toBe(problem);
  });

  it('un diseño al tope (5 figuras de texto, números largos) queda muy por debajo de 4 kB', () => {
    const big = normalizeBallDesign({
      ...FULL,
      scale: 1.23456789,
      stickers: Array(5).fill({ shape: 'iniciales', text: 'ÑÑÑ', color: '#ffffff', x: -0.999999, y: 0.123456, size: 0.555555, rotation: 359.4 }),
    });
    expect(ballDesignProblem(big)).toBeNull();
    // La base mide el texto de jsonb, con un espacio después de cada «:» y «,»: aun así sobra.
    expect(ballDesignBytes(big) * 1.5).toBeLessThan(BALL_DESIGN_MAX_BYTES);
    expect(ballDesignBytes({ big: 'x'.repeat(BALL_DESIGN_MAX_BYTES) })).toBeGreaterThan(BALL_DESIGN_MAX_BYTES);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(ballDesignProblem(cycle)).toBe('size');
  });
});

describe('arreglar lo que llega (el borrador, la base o más adelante una foto)', () => {
  it('lleva cada número a su rango, redondea, da la vuelta a los ángulos y quita lo que no vale', () => {
    const d = normalizeBallDesign(
      {
        v: 9,
        base: ' #ABC ',
        second: 'RED',
        third: '#FFFFFF',
        pattern: 'rayas',
        scale: 99,
        softness: -3,
        angle: -30,
        shine: 'sí',
        holes: false,
        extra: '<script>',
        stickers: [
          { shape: 'numero', text: '12a34', color: '#000', x: 9, y: -9, size: 2, rotation: 725 },
          { shape: 'iniciales', text: 'ñé<b>z', color: 'x', x: '0.5', y: 0.1234567, size: 0.3333333, rotation: -90 },
          { shape: 'numero', text: 'abc' },
          { shape: 'estrella', text: 'hola', color: '#ff0000' },
          { shape: 'unicornio' },
          'x',
          null,
        ],
      },
      '#dc2626',
    );
    expect(d).toEqual({
      v: 1,
      base: '#aabbcc',
      second: null,
      third: '#ffffff',
      pattern: 'solida',
      scale: 2,
      softness: 0,
      angle: 330,
      shine: true,
      holes: false,
      stickers: [
        { shape: 'numero', text: '123', color: '#000000', x: 1, y: -1, size: 0.6, rotation: 5 },
        { shape: 'iniciales', text: 'ÑÉB', color: '#ffffff', x: 0.5, y: 0.123, size: 0.333, rotation: 270 },
        { shape: 'estrella', color: '#ff0000', x: 0, y: 0, size: 0.3, rotation: 0 },
      ],
    });
    expect(ballDesignProblem(d)).toBeNull();
    // Lo que no es un objeto: el de la bola sin diseño.
    expect(normalizeBallDesign('galaxia', '#16a34a')).toEqual(defaultBallDesign('#16a34a'));
    // Hasta 5 figuras.
    expect(normalizeBallDesign({ ...FULL, stickers: Array(8).fill(FULL.stickers[0]) }).stickers).toHaveLength(BALL_STICKERS_MAX);
  });

  it('con basura al azar siempre sale uno que vale, y arreglarlo otra vez no lo cambia', () => {
    const rnd = random(7);
    const junk = (): unknown => {
      const pick = rnd();
      if (pick < 0.15) return Math.round(rnd() * 800 - 400) / 7;
      if (pick < 0.25) return ['#abc', '#123456', 'RED', '', '#FFFFFF', 'galaxia', 'numero', 'iniciales', '<b>x</b>', '42'][Math.floor(rnd() * 10)];
      if (pick < 0.3) return rnd() < 0.5;
      if (pick < 0.35) return null;
      return undefined;
    };
    for (let i = 0; i < 300; i++) {
      const x: Record<string, unknown> = {};
      for (const k of ['v', 'base', 'second', 'third', 'pattern', 'scale', 'softness', 'angle', 'shine', 'holes', 'junk']) x[k] = junk();
      if (rnd() < 0.5) x.pattern = BALL_PATTERNS[Math.floor(rnd() * BALL_PATTERNS.length)].key;
      x.stickers = Array.from({ length: Math.floor(rnd() * 8) }, () => ({
        shape: rnd() < 0.8 ? BALL_STICKER_SHAPES[Math.floor(rnd() * BALL_STICKER_SHAPES.length)].key : junk(),
        text: junk(),
        color: junk(),
        x: junk(),
        y: junk(),
        size: junk(),
        rotation: junk(),
      }));
      const d = normalizeBallDesign(x, '#dc2626');
      expect(ballDesignProblem(d), JSON.stringify(x)).toBeNull();
      expect(normalizeBallDesign(d)).toEqual(d);
      expect(sameBallDesign(d, JSON.parse(JSON.stringify(d)))).toBe(true);
    }
  });

  it('el texto de las figuras: solo cifras o letras en mayúscula (con Ñ y tildes), hasta 3', () => {
    expect(cleanStickerText('numero', ' 1a2-3 4')).toBe('123');
    expect(cleanStickerText('numero', '<img src=x>')).toBe('');
    expect(cleanStickerText('iniciales', 'ñé<b>z')).toBe('ÑÉB');
    expect(cleanStickerText('iniciales', 'áb')).toBe('ÁB');
    expect(cleanStickerText('iniciales', '"><script>')).toBe('SCR');
    expect(cleanStickerText('iniciales', 'ø 1 @')).toBe('');
    expect(cleanStickerText('estrella', 'ABC')).toBe('');
    expect(cleanStickerText('numero', 7)).toBe('');
    expect(stickerHasText('numero')).toBe(true);
    expect(stickerHasText('logo')).toBe(false);
    expect(initialsOf('Ana María Pérez')).toBe('AMP');
    expect(initialsOf('josé ángel de la cruz')).toBe('JÁD');
    expect(initialsOf('   ')).toBe('');
    expect(initialsOf(null)).toBe('');
  });

  it('sameBallDesign: iguales después de arreglarlos', () => {
    expect(sameBallDesign(FULL, { ...FULL, base: '#0B1026' })).toBe(true);
    expect(sameBallDesign(FULL, { ...FULL, angle: 46 })).toBe(false);
  });
});

describe('colores', () => {
  it('mezclar, luminancia, limpiar y el texto que se lee encima', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#1d4ed8', '#1d4ed8', 0.3)).toBe('#1d4ed8');
    expect(colorLuminance('#ffffff')).toBeCloseTo(1);
    expect(colorLuminance('#000000')).toBe(0);
    expect(cleanColor(' #ABC ')).toBe('#aabbcc');
    expect(cleanColor('#12345g')).toBeNull();
    expect(readableOn('#111827')).toBe('#ffffff');
    expect(readableOn('#facc15')).toBe('#111827');
  });

  it('second y third null salen de la base: más claros en una oscura, más oscuros en una clara', () => {
    const dark = ballDesignColors({ base: '#111827', second: null, third: null });
    expect(colorLuminance(dark.second)).toBeGreaterThan(colorLuminance('#111827'));
    expect(colorLuminance(dark.third)).toBeGreaterThan(colorLuminance(dark.second));
    const light = ballDesignColors({ base: '#facc15', second: null, third: '#0000ff' });
    expect(colorLuminance(light.second)).toBeLessThan(colorLuminance('#facc15'));
    expect(light.third).toBe('#0000ff');
    // El borde y los huecos: siempre oscuros.
    for (const c of [dark, light, ballDesignColors({ base: '#ffffff', second: null, third: null })]) {
      expect(colorLuminance(c.outline)).toBeLessThan(0.1);
      expect(colorLuminance(c.hole)).toBeLessThan(0.05);
    }
  });
});

describe('figuras nuevas y la semilla', () => {
  it('cada figura nueva cae en un lugar libre, con un color que se ve y un texto de ejemplo', () => {
    const d = defaultBallDesign('#111827');
    for (const shape of ['numero', 'iniciales', 'estrella', 'llama', 'rayo'] as const) d.stickers.push(newSticker(shape, d));
    expect(d.stickers).toHaveLength(BALL_STICKERS_MAX);
    // Las 5, en sus lugares y de su tamaño (las dos últimas más chicas).
    expect(d.stickers.map((s) => ({ x: s.x, y: s.y, size: s.size }))).toEqual(BALL_STICKER_SPOTS);
    expect(d.stickers.every((s) => s.color === '#facc15')).toBe(true);
    expect(newSticker('estrella', defaultBallDesign('#f8fafc')).color).toBe('#dc2626');
    expect(d.stickers.find((s) => s.shape === 'numero')?.text).toBe('7');
    expect(d.stickers.find((s) => s.shape === 'iniciales')?.text).toBe('AB');
    expect(newSticker('iniciales', d, initialsOf('Randy Grullón'))).toMatchObject({ text: 'RG' });
    expect(newSticker('estrella', d)).not.toHaveProperty('text');
    expect(ballDesignProblem(d)).toBeNull();
    expect(nudgeSticker(d.stickers[0], 0.9, -0.1)).toMatchObject({ x: 0.9, y: 0.4 });
    expect(nudgeSticker({ ...d.stickers[0], x: 0.95 }, 0.1, 0)).toMatchObject({ x: 1 });
  });

  it('las 5 figuras nuevas no se tapan entre ellas y no se salen de la bola', () => {
    const d = defaultBallDesign('#111827');
    for (let i = 0; i < BALL_STICKERS_MAX; i++) d.stickers.push(newSticker('estrella', d));
    d.stickers.forEach((a, i) => {
      expect(Math.hypot(a.x, a.y) + a.size).toBeLessThanOrEqual(1);
      for (const b of d.stickers.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.size + b.size);
    });
  });

  it('la figura nueva usa el lugar que quedó libre y, si ya no cabe entera, sale más chica donde hay más espacio', () => {
    const d = defaultBallDesign('#111827');
    for (let i = 0; i < 3; i++) d.stickers.push(newSticker('estrella', d));
    // Quitó la primera: la nueva va a su lugar.
    expect(newSticker('rayo', { ...d, stickers: d.stickers.slice(1) })).toMatchObject(BALL_STICKER_SPOTS[0]);
    // Movió la primera a otro lado: su lugar queda libre.
    const moved = [{ ...d.stickers[0], x: -0.6, y: -0.2 }, ...d.stickers.slice(1)];
    expect(newSticker('rayo', { ...d, stickers: moved })).toMatchObject(BALL_STICKER_SPOTS[0]);
    // Una muy grande en el centro: ningún lugar le da el tamaño entero; va al de más espacio, a lo más chico.
    const big = newSticker('rayo', { ...d, stickers: [{ ...d.stickers[0], x: 0, y: 0, size: 0.6 }] });
    expect(big).toMatchObject({ x: BALL_STICKER_SPOTS[4].x, y: BALL_STICKER_SPOTS[4].y, size: 0.15 });
    // Una que la tapa a medias: sale del tamaño que le cabe ahí.
    const half = newSticker('rayo', { ...d, stickers: [{ ...d.stickers[0], x: 0, y: 0, size: 0.55 }] });
    expect(half).toMatchObject({ x: BALL_STICKER_SPOTS[4].x, y: BALL_STICKER_SPOTS[4].y, size: 0.16 });
    expect(Math.hypot(half.x, half.y) - 0.55).toBeGreaterThanOrEqual(half.size);
    expect(ballDesignProblem({ ...d, stickers: [big] })).toBeNull();
  });

  it('el texto con que sale una figura: el que se da limpio o el de ejemplo', () => {
    expect(stickerStartText('numero')).toBe(BALL_STICKER_SAMPLE_TEXT.digits);
    expect(stickerStartText('iniciales', '')).toBe(BALL_STICKER_SAMPLE_TEXT.letters);
    expect(stickerStartText('iniciales', '12')).toBe('AB');
    expect(stickerStartText('iniciales', 'amp')).toBe('AMP');
    expect(stickerStartText('numero', '21x')).toBe('21');
    expect(stickerStartText('llama', 'AMP')).toBeUndefined();
    // La figura nueva sale con ese mismo texto.
    for (const text of [undefined, null, '', 'ñu', '<b>', '1234']) {
      for (const shape of ['numero', 'iniciales'] as const) {
        expect(newSticker(shape, defaultBallDesign(), text).text).toBe(stickerStartText(shape, text));
      }
    }
  });

  it('la semilla sale del dibujo y la base: mover lo demás no cambia las manchas', () => {
    const moved: BallDesign = { ...FULL, scale: 2, angle: 90, second: '#ffffff', stickers: [] };
    expect(ballDesignSeed(FULL)).toBe(ballDesignSeed(moved));
    expect(ballDesignSeed(FULL)).not.toBe(ballDesignSeed({ ...FULL, base: '#0b1027' }));
    expect(ballDesignSeed(FULL)).not.toBe(ballDesignSeed({ ...FULL, pattern: 'destellos' }));
    expect(patternLabel('bicolor')).toBe('Dos colores');
  });
});
