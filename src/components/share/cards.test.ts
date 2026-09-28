import { describe, expect, it } from 'vitest';
import { CARD_WIDTH, DEFAULT_MAX_ROWS, buildScene, linkLabel, shareCaption, type CardFrame, type ShareResultSpec, type ShareRow, type ShareTableSpec } from './cards';
import { INK } from './palette';
import { estimateWidth, type SceneNode, type TextNode } from './scene';

const frame: CardFrame = { sportLabel: 'Pádel', color: '#0f766e', date: '27 sep 2026', link: 'https://matchmate.do/l/abc/ranking?ver=parejas' };

const texts = (nodes: readonly SceneNode[]) => nodes.filter((n): n is TextNode => n.t === 'text');
const textOf = (nodes: readonly SceneNode[]) => texts(nodes).map((n) => n.text);

/** Borde izquierdo y derecho de un texto según su anclaje (medido como en las pruebas). */
function span(n: TextNode): [number, number] {
  const w = estimateWidth(n.text, n.size, n.weight);
  const left = n.align === 'right' ? n.x - w : n.align === 'center' ? n.x - w / 2 : n.x;
  return [left, left + w];
}

const rows = (n: number, name = (i: number) => `Jugador ${i + 1}`): ShareRow[] =>
  Array.from({ length: n }, (_, i) => ({ rank: i + 1, name: name(i), values: [10 - (i % 10), i % 5, `+${i}`, 30 - i] }));

const table = (over: Partial<ShareTableSpec> = {}): ShareTableSpec => ({
  kind: 'table',
  title: 'Liga del Jueves',
  subtitle: 'Tabla · Temporada 2026',
  nameLabel: 'Pareja',
  columns: [{ label: 'PJ' }, { label: 'G' }, { label: 'Dif.', optional: true }, { label: 'Pts', strong: true }],
  sections: [{ rows: rows(6) }],
  ...over,
});

describe('link y texto que acompañan la imagen', () => {
  it('el link se muestra corto: sin https://, www, parámetros ni la barra final', () => {
    expect(linkLabel('https://www.matchmate.do/l/abc/ranking/?ver=1#top')).toBe('matchmate.do/l/abc/ranking');
    expect(linkLabel('http://localhost:5173/l/x')).toBe('localhost:5173/l/x');
    expect(linkLabel('  matchmate.do  ')).toBe('matchmate.do');
  });

  it('el texto es el de la tarjeta (o título y línea) con el link abajo', () => {
    expect(shareCaption(table(), 'https://m.do/l/a')).toBe('Liga del Jueves · Tabla · Temporada 2026\nhttps://m.do/l/a');
    expect(shareCaption(table({ subtitle: undefined }))).toBe('Liga del Jueves');
    expect(shareCaption(table({ caption: 'Gana Ana 6-4' }), 'https://m.do')).toBe('Gana Ana 6-4\nhttps://m.do');
  });
});

describe('imagen de una tabla', () => {
  it('fondo del color del deporte, 540 de ancho, encabezado, cuadro blanco y marca con el link', () => {
    const s = buildScene(table(), frame);
    expect(s.width).toBe(CARD_WIDTH);
    expect(s.background).toBe(frame.color);
    const t = textOf(s.nodes);
    expect(t).toContain('PÁDEL');
    expect(t).toContain('27 sep 2026');
    expect(t).toContain('Liga del Jueves');
    expect(t).toContain('Tabla · Temporada 2026');
    expect(t).toContain('Pareja');
    expect(t).toEqual(expect.arrayContaining(['#', 'PJ', 'G', 'Dif.', 'Pts']));
    expect(t).toEqual(expect.arrayContaining(['Match', 'Mate', 'matchmate.do/l/abc/ranking']));
    expect(s.nodes.some((n) => n.t === 'logo' && n.tile === INK.onColor && n.ink === frame.color)).toBe(true);
    expect(s.nodes.some((n) => n.t === 'rect' && n.color === INK.surface && n.w === CARD_WIDTH - 32)).toBe(true);
    // Todo lo que se pinta cabe en la imagen.
    for (const n of texts(s.nodes)) {
      const [l, r] = span(n);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(CARD_WIDTH);
      expect(n.y).toBeLessThan(s.height);
    }
  });

  it('medalla de oro, plata y bronce para los 3 primeros; del 4 en adelante, el número', () => {
    const s = buildScene(table(), frame);
    const medals = s.nodes.filter((n) => n.t === 'circle' && ([INK.gold, INK.silver, INK.bronze] as string[]).includes(n.color));
    expect(medals.map((n) => n.t === 'circle' && n.color)).toEqual([INK.gold, INK.silver, INK.bronze]);
    const four = texts(s.nodes).find((n) => n.text === '4' && n.align === 'center');
    expect(four?.color).toBe(INK.muted);
  });

  it('crece con las filas y corta en 24 con «y N más en la app»', () => {
    const small = buildScene(table({ sections: [{ rows: rows(5) }] }), frame);
    const big = buildScene(table({ sections: [{ rows: rows(10) }] }), frame);
    expect(big.height).toBeGreaterThan(small.height);

    const many = buildScene(table({ sections: [{ rows: rows(30) }] }), frame);
    const t = textOf(many.nodes);
    expect(t).toContain(`y ${30 - DEFAULT_MAX_ROWS} más en la app`);
    expect(t).toContain(`Jugador ${DEFAULT_MAX_ROWS}`);
    expect(t).not.toContain(`Jugador ${DEFAULT_MAX_ROWS + 1}`);
    expect(buildScene(table({ sections: [{ rows: rows(30) }], maxRows: 5 }), frame).nodes.some((n) => n.t === 'text' && n.text === 'y 25 más en la app')).toBe(true);
  });

  it('por secciones (grupos, categorías), el tope cuenta todas las filas', () => {
    const s = buildScene(
      table({
        sections: [
          { heading: 'Grupo A', rows: rows(3, (i) => `A${i}`) },
          { heading: 'Grupo vacío', rows: [] },
          { heading: 'Grupo B', rows: rows(3, (i) => `B${i}`) },
        ],
        maxRows: 4,
      }),
      frame,
    );
    const t = textOf(s.nodes);
    expect(t).toContain('GRUPO A');
    expect(t).toContain('GRUPO B');
    expect(t).not.toContain('GRUPO VACÍO');
    expect(t).toEqual(expect.arrayContaining(['A0', 'A1', 'A2', 'B0']));
    expect(t).not.toContain('B1');
    expect(t).toContain('y 2 más en la app');
  });

  it('con nombres largos se quitan las columnas opcionales, nunca los puntos, y nada se encima', () => {
    const long = buildScene(
      table({
        columns: [{ label: 'PJ' }, { label: 'G' }, { label: 'P' }, { label: 'JF', optional: true }, { label: 'JC', optional: true }, { label: 'Dif. J' }, { label: 'Pts', strong: true }],
        sections: [{ rows: rows(4, (i) => `María Altagracia Rodríguez de los Santos / Pareja ${i}`).map((r) => ({ ...r, values: [12, 9, 3, 88, 61, '+27', 27] })) }],
      }),
      frame,
    );
    const t = textOf(long.nodes);
    expect(t).not.toContain('JF');
    expect(t).not.toContain('JC');
    expect(t).toEqual(expect.arrayContaining(['PJ', 'G', 'P', 'Dif. J', 'Pts']));
    const names = texts(long.nodes).filter((n) => n.text.startsWith('María'));
    expect(names).toHaveLength(4);
    for (const n of names) expect(n.text.endsWith('…')).toBe(true);
    // Los nombres terminan antes de la primera columna.
    const firstCol = Math.min(...texts(long.nodes).filter((n) => n.align === 'right' && n.y > names[0].y - 30).map((n) => span(n)[0]));
    for (const n of names) expect(span(n)[1]).toBeLessThan(firstCol);

    // Con nombres cortos caben todas.
    const short = textOf(buildScene(table({ columns: [{ label: 'PJ' }, { label: 'JF', optional: true }, { label: 'Pts', strong: true }], sections: [{ rows: rows(3, () => 'Ana').map((r) => ({ ...r, values: [1, 2, 3] })) }] }), frame).nodes);
    expect(short).toContain('JF');
  });

  it('punto de color y línea chica (equipo o club); los descalificados más claros y sin puesto', () => {
    const s = buildScene(
      table({
        sections: [
          {
            rows: [
              { rank: 1, name: 'Ana', sub: 'Delfines', dot: '#ff0000', values: [1, 2, 3, 4] },
              { rank: null, name: 'Luis', sub: 'Tiburones', dim: true, values: ['', '', '', 'DQ'] },
            ],
          },
        ],
      }),
      frame,
    );
    expect(s.nodes.some((n) => n.t === 'circle' && n.color === '#ff0000')).toBe(true);
    expect(textOf(s.nodes)).toEqual(expect.arrayContaining(['Delfines', 'Tiburones', '–', 'DQ']));
    const luis = texts(s.nodes).find((n) => n.text === 'Luis');
    expect(luis?.opacity).toBeLessThan(1);
    expect(texts(s.nodes).find((n) => n.text === 'Ana')?.opacity).toBeUndefined();
  });

  it('sin filas: «Todavía no hay datos.»; la nota va al final', () => {
    const empty = buildScene(table({ sections: [] }), frame);
    expect(textOf(empty.nodes)).toContain('Todavía no hay datos.');
    const noted = buildScene(table({ note: 'Solo juegos verificados.' }), frame);
    expect(textOf(noted.nodes)).toContain('Solo juegos verificados.');
  });

  it('un título largo va en 2 renglones y un deporte sin link ni fecha también sale', () => {
    const s = buildScene(table({ title: 'Liga de pádel del Club Deportivo Arroyo Hondo, categoría intermedia de los jueves en la noche' }), { sportLabel: 'Pádel', color: '#0f766e' });
    const big = texts(s.nodes).filter((n) => n.size === 26);
    expect(big).toHaveLength(2);
    expect(big[1].text.endsWith('…')).toBe(true);
    expect(textOf(s.nodes)).not.toContain('27 sep 2026');
    for (const n of texts(s.nodes)) expect(span(n)[1]).toBeLessThanOrEqual(CARD_WIDTH);
  });
});

describe('imagen de un resultado', () => {
  const sets: ShareResultSpec = {
    kind: 'result',
    title: 'Americano del jueves',
    subtitle: 'Ronda 3 · Cancha 2',
    status: { label: 'Final', tone: 'accent' },
    sides: [
      { name: 'Ana / Luis', winner: true, cells: [{ text: '6', strong: true }, { text: '3' }, { text: '7', strong: true }] },
      { name: 'Rosa / Pedro', cells: [{ text: '4' }, { text: '6', strong: true }, { text: '6', sup: '5' }] },
    ],
  };

  it('por sets: un número por set, el tie-break chiquito y el ganador marcado con el color', () => {
    const s = buildScene(sets, frame);
    const t = textOf(s.nodes);
    expect(t).toEqual(expect.arrayContaining(['Final', 'Ana / Luis', 'Rosa / Pedro', '6', '3', '7', '4', '5']));
    const digits = texts(s.nodes).filter((n) => /^\d$/.test(n.text) && n.size === 24);
    expect(digits).toHaveLength(6);
    const tb = texts(s.nodes).find((n) => n.text === '5');
    expect(tb?.size).toBe(12);
    // Raya del color del deporte junto al ganador.
    expect(s.nodes.some((n) => n.t === 'rect' && n.color === frame.color && n.w === 4)).toBe(true);
    const winner = texts(s.nodes).find((n) => n.text === 'Ana / Luis');
    const loser = texts(s.nodes).find((n) => n.text === 'Rosa / Pedro');
    expect(winner?.weight).toBe(800);
    expect(loser?.color).toBe(INK.muted);
  });

  it('un número grande por lado (baloncesto, fútbol) y la nota («Penales 4-3»)', () => {
    const s = buildScene(
      {
        kind: 'result',
        title: 'Liga de fútbol',
        status: { label: 'Final', tone: 'accent' },
        sides: [
          { name: 'Tigres', dot: '#f59e0b', winner: true, cells: [{ text: '2', strong: true }] },
          { name: 'Leones', dot: '#2563eb', cells: [{ text: '2' }] },
        ],
        note: 'Penales 4-3',
      },
      frame,
    );
    const nums = texts(s.nodes).filter((n) => n.text === '2');
    expect(nums.every((n) => n.size === 40)).toBe(true);
    expect(textOf(s.nodes)).toContain('Penales 4-3');
    expect(s.nodes.filter((n) => n.t === 'circle' && (n.color === '#f59e0b' || n.color === '#2563eb'))).toHaveLength(2);
  });

  it('sin ganador (en vivo, empate) los dos lados en negro', () => {
    const s = buildScene(
      {
        kind: 'result',
        title: 'Liga',
        status: { label: 'En vivo', tone: 'ok' },
        sides: [
          { name: 'A', cells: [{ text: '10' }] },
          { name: 'B', cells: [{ text: '8' }] },
        ],
      },
      frame,
    );
    expect(texts(s.nodes).filter((n) => n.text === 'A' || n.text === 'B').every((n) => n.color === INK.text)).toBe(true);
  });

  it('nombres largos no se enciman con el marcador', () => {
    const s = buildScene(
      {
        ...sets,
        sides: [
          { ...sets.sides[0], name: 'Juan Carlos Martínez Rodríguez / Francisco Javier Almonte' },
          { ...sets.sides[1], name: 'Pedro Antonio Santana de la Cruz / Luis Manuel Peña' },
        ],
      },
      frame,
    );
    const names = texts(s.nodes).filter((n) => n.size === 19);
    const firstScore = Math.min(...texts(s.nodes).filter((n) => n.size === 24).map((n) => span(n)[0]));
    for (const n of names) {
      expect(n.text.endsWith('…')).toBe(true);
      expect(span(n)[1]).toBeLessThan(firstScore);
    }
  });
});
