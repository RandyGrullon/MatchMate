/**
 * El creador de bolas («Diseñar»): las cuentas (qué se guarda, si cambió algo, dónde tocó el dedo, qué figura hay ahí,
 * mover sin salirse de la bola) y, dibujado sin navegador (renderToString), la hoja con la bola grande y sus tres
 * pestañas (colores, dibujo y figuras), la bola dibujada en la tarjeta de «Mis bolas» (tocarla abre el creador), en la
 * hoja de la bola (sin el color si ya tiene diseño) y en «Por bola».
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BALL_STICKER_SHAPES, ballDesignColors, defaultBallDesign, newSticker, type BallDesign, type BallSticker } from '../../lib/ballDesign';
import { ballStats, type Ball, type BallGame } from '../../lib/balls';
import { ballKeys } from '../../lib/data/balls';
import { queryClient, resetDataClientForTests, setDataUser } from '../../lib/data/client';
import { FeedbackProvider } from '../feedback';
import { BALL_HOLES, StickerArt, ballArtMetrics } from './BallArt';
import { BallDesigner, DesignColors, DesignPattern, DesignStickers } from './BallDesigner';
import { BallSheet } from './BallSheet';
import { BallCard, BallStatsSection, MyBallsSection } from './BallStats';
import {
  ballTap,
  designNeedsSave,
  designToSave,
  moveSticker,
  percent,
  resetWarning,
  sampleText,
  slotColor,
  stickerAt,
  stickerName,
  stickerRing,
  tapToBall,
  withSlotColor,
} from './designer';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const noop = () => undefined;

const ball = (extra: Partial<Ball> = {}): Ball => ({
  id: 'b1',
  name: 'Phaze II',
  brand: 'Storm',
  weight: 15,
  color: '#1d4ed8',
  cover: 'solida',
  drilledOn: null,
  resurfacedOn: null,
  retired: false,
  createdAt: null,
  updatedAt: null,
  ...extra,
});

const sticker = (extra: Partial<BallSticker> = {}): BallSticker => ({ shape: 'estrella', color: '#facc15', x: 0, y: 0.45, size: 0.3, rotation: 0, ...extra });

const galaxy: BallDesign = {
  ...defaultBallDesign('#0b1026'),
  pattern: 'galaxia',
  third: '#f0abfc',
  stickers: [sticker(), sticker({ shape: 'numero', text: '7', color: '#dc2626', x: -0.5, y: 0.15 })],
};

describe('las cuentas del creador', () => {
  it('lo que se guarda: null si queda como la bola sin diseño; si no, arreglado', () => {
    const b = ball({ cover: 'perlada' });
    expect(designToSave(defaultBallDesign(b.color, 'perlada'), b)).toBeNull();
    // La sólida no es lo mismo que la perlada de su cubierta: se guarda.
    expect(designToSave(defaultBallDesign(b.color), b)).toMatchObject({ pattern: 'solida' });
    const saved = designToSave({ ...galaxy, scale: 0.1 + 0.2 + 0.45, stickers: [sticker({ size: 0.1 + 0.2 })] }, b)!;
    expect(saved.scale).toBe(0.75);
    expect(saved.stickers[0].size).toBe(0.3);
  });

  it('si guardar cambia algo (si no, «Guardar» solo cierra)', () => {
    const plain = ball();
    expect(designNeedsSave(defaultBallDesign(plain.color, plain.cover), plain)).toBe(false);
    expect(designNeedsSave({ ...defaultBallDesign(plain.color), shine: false }, plain)).toBe(true);
    const designed = ball({ design: galaxy, color: galaxy.base });
    expect(designNeedsSave(galaxy, designed)).toBe(false);
    expect(designNeedsSave({ ...galaxy, angle: 90 }, designed)).toBe(true);
    // Restablecer (lisa, de su color): se quita el diseño.
    expect(designNeedsSave(defaultBallDesign(designed.color, designed.cover), designed)).toBe(true);
    expect(designToSave(defaultBallDesign(designed.color, designed.cover), designed)).toBeNull();
    // El mismo diseño con otro color en la lista (la base lo arregla): se guarda.
    expect(designNeedsSave(galaxy, { ...designed, color: '#ffffff' })).toBe(true);
  });

  it('dónde tocó el dedo, en radios de la bola, a cualquier tamaño y siempre sobre la bola', () => {
    expect(tapToBall(80, 80, 160, 160, 160)).toEqual({ x: 0, y: 0 });
    expect(tapToBall(64, 64, 128, 128, 160)).toEqual({ x: 0, y: 0 });
    const r = ballArtMetrics(160).radius;
    // La mitad del radio a la derecha y arriba.
    const p = tapToBall(80 + (r / 2) * 1.6, 80 - (r / 2) * 1.6, 160, 160, 160);
    expect(p.x).toBeCloseTo(0.5, 2);
    expect(p.y).toBeCloseTo(-0.5, 2);
    // La misma a 128 px.
    expect(tapToBall(64 + (r / 2) * 1.28, 64, 128, 128, 160).x).toBeCloseTo(0.5, 2);
    // La esquina (afuera de la bola) queda en su borde.
    const corner = tapToBall(160, 160, 160, 160, 160);
    expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(0.95, 1);
    expect(corner.x).toBeGreaterThan(0);
  });

  it('la figura que se tocó: la de más arriba; una chica se toca igual', () => {
    const stickers = [sticker({ x: 0, y: 0, size: 0.4 }), sticker({ x: 0.1, y: 0, size: 0.2 }), sticker({ x: -0.7, y: 0.5, size: 0.1 })];
    expect(stickerAt(stickers, { x: 0.05, y: 0 })).toBe(1);
    expect(stickerAt(stickers, { x: -0.3, y: 0 })).toBe(0);
    expect(stickerAt(stickers, { x: -0.7, y: 0.36 })).toBe(2);
    expect(stickerAt(stickers, { x: 0.8, y: -0.5 })).toBeNull();
    expect(stickerAt([], { x: 0, y: 0 })).toBeNull();
  });

  it('tocar la bola: tocar otra figura la elige (no le pone la elegida encima); tocar donde no hay otra mueve la elegida', () => {
    // La estrella y, encima, el corazón recién agregado (elegido).
    const stickers = [sticker({ x: 0, y: 0.5 }), sticker({ shape: 'corazon', x: -0.33, y: -0.03 })];
    const onStar = { x: 0.05, y: 0.5 };
    // En «Figuras» con el corazón elegido: tocar la estrella la elige.
    expect(ballTap(stickers, 1, onStar, true)).toEqual({ pick: 0 });
    // Tocar donde no hay figura: el corazón va ahí.
    expect(ballTap(stickers, 1, { x: 0.6, y: 0.3 }, true)).toEqual({ move: 1, x: 0.6, y: 0.3 });
    // Tocar el mismo corazón: se acomoda donde tocó.
    expect(ballTap(stickers, 1, { x: -0.3, y: 0 }, true)).toEqual({ move: 1, x: -0.3, y: 0 });
    // Sin elegida, o en otra pestaña: tocar una figura la elige; tocar la bola vacía no hace nada.
    expect(ballTap(stickers, null, onStar, true)).toEqual({ pick: 0 });
    expect(ballTap(stickers, 1, onStar, false)).toEqual({ pick: 0 });
    expect(ballTap(stickers, 1, { x: 0.6, y: 0.3 }, false)).toBeNull();
    expect(ballTap(stickers, null, { x: 0.6, y: 0.3 }, true)).toBeNull();
    // Una elegida que ya no está (se quitó): no se mueve nada.
    expect(ballTap(stickers, 5, { x: 0.6, y: 0.3 }, true)).toBeNull();
    // Dos encimadas: se elige la de arriba, aunque la elegida esté debajo.
    const stacked = [sticker({ x: 0, y: 0.5 }), sticker({ x: 0.1, y: 0.5 })];
    expect(ballTap(stacked, 0, { x: 0.05, y: 0.5 }, true)).toEqual({ pick: 1 });
  });

  it('«Restablecer» pregunta antes y dice lo que se pierde (nada si ya está como sin diseño)', () => {
    const b = ball({ cover: 'perlada' });
    const plain = defaultBallDesign(b.color, b.cover);
    expect(resetWarning(plain, plain)).toBeNull();
    // Lo mismo arreglado (otra forma de escribirlo): no hay nada que perder.
    expect(resetWarning({ ...plain, base: '#1D4ED8' } as BallDesign, plain)).toBeNull();
    expect(resetWarning({ ...plain, angle: 90 }, plain)).toMatch(/^Vuelve a como se ve sin diseño \(de su color\)\. .*«Guardar»/);
    expect(resetWarning({ ...plain, stickers: [sticker()] }, plain)).toContain('se le quita la figura');
    expect(resetWarning(galaxy, plain)).toContain('se le quitan las 2 figuras');
  });

  it('las flechas mueven la figura sin sacarla de la bola', () => {
    expect(moveSticker(sticker({ x: 0, y: 0 }), 0.1, 0)).toMatchObject({ x: 0.1, y: 0 });
    const edge = moveSticker(sticker({ x: 0.7, y: 0.7 }), 0.1, 0.1);
    expect(Math.hypot(edge.x, edge.y)).toBeLessThanOrEqual(1.001);
    expect(moveSticker(sticker({ x: 1, y: 0 }), 0.1, 0).x).toBe(1);
  });

  it('el aro de la figura elegida, en % de la caja', () => {
    expect(stickerRing(sticker({ x: 0, y: 0, size: 0.3 }), 160)).toMatchObject({ left: 50, top: 50 });
    const r = ballArtMetrics(160).radius;
    expect(stickerRing(sticker({ x: 1, y: -1, size: 0.5 }), 160)).toEqual({
      left: Math.round((50 + r) * 100) / 100,
      top: Math.round((50 - r) * 100) / 100,
      diameter: Math.round(2 * 0.5 * r * 1.15 * 100) / 100,
    });
    expect(stickerRing(sticker({ size: 0.1 }), 160).diameter).toBe(12);
  });

  it('nombres, textos de ejemplo y colores de cada lugar', () => {
    expect(stickerName(sticker())).toBe('Estrella');
    expect(stickerName(sticker({ shape: 'numero', text: '21' }))).toBe('Número 21');
    expect(stickerName(sticker({ shape: 'iniciales', text: 'AMP' }))).toBe('Iniciales AMP');
    expect(sampleText('numero', 'AMP')).toBe('7');
    expect(sampleText('iniciales', 'AMP')).toBe('AMP');
    expect(sampleText('iniciales', '')).toBe('AB');
    expect(sampleText('rayo', 'AMP')).toBeUndefined();
    // Lo que muestra el botón es lo que sale en la bola al agregarla (también sin iniciales en la cuenta).
    for (const initials of ['', 'AMP', 'Ñ']) {
      for (const s of BALL_STICKER_SHAPES) expect(newSticker(s.key, galaxy, sampleText(s.key, initials)).text).toBe(sampleText(s.key, initials));
    }
    expect(newSticker('iniciales', galaxy, sampleText('iniciales', '')).text).toBe('AB');
    expect(percent(0.75)).toBe('75 %');
    expect(slotColor(galaxy, 'base')).toBe('#0b1026');
    expect(slotColor(galaxy, 'second')).toBe(ballDesignColors(galaxy).second);
    expect(slotColor(galaxy, 'third')).toBe('#f0abfc');
    expect(withSlotColor(galaxy, 'second', '#16a34a').second).toBe('#16a34a');
    expect(withSlotColor(galaxy, 'third', null).third).toBeNull();
    // La base nunca queda sin color.
    expect(withSlotColor(galaxy, 'base', null).base).toBe('#0b1026');
  });
});

describe('la hoja del creador', () => {
  const sheet = (b: Ball) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(BallDesigner, { ball: b, onClose: noop }))));

  it('una bola sin diseño: la bola grande de su color, «Colores» y la paleta; «Restablecer» no hace nada todavía', () => {
    const out = sheet(ball());
    const t = text(out);
    expect(t).toContain('Diseñar la Phaze II');
    expect(t).toContain('Colores, dibujo y figuras');
    // La bola grande, con nombre para el lector de pantalla.
    expect(out).toMatch(/<svg[^>]*width="160" height="160"[^>]*role="img"/);
    expect(out).toContain('Así se ve la Phaze II</title>');
    expect(out).toContain('fill="#1d4ed8"');
    // Se queda arriba al bajar (menos con el teclado abierto).
    expect(out).toContain('sticky top-0');
    expect(out).toContain('[dialog[data-kb]_&amp;]:static');
    // Las pestañas (44 px de alto): «Colores» abierta.
    expect(out).toMatch(/role="tab" aria-selected="true"[^>]*min-h-11[^>]*>Colores/);
    expect(out.match(/role="tab"/g)).toHaveLength(3);
    expect(t).toContain('Dibujo');
    expect(t).toContain('Figuras');
    // La sólida: solo la base (13 de la paleta), sin automático ni los tres lugares.
    expect(t).toContain('Color de la bola');
    expect(out).not.toContain('Qué color cambias');
    expect(out).not.toContain('Automático');
    expect(out).toMatch(/role="radio" aria-checked="true" aria-label="Azul"/);
    expect(out.match(/role="radio"/g)).toHaveLength(13);
    expect(out).toContain('type="color"');
    expect(out).toContain('value="#1d4ed8"');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>.*?Restablecer/);
    expect(t).toContain('Guardar');
  });

  it('una con diseño: su diseño, los tres colores (el segundo automático) y cuántas figuras tiene', () => {
    const out = sheet(ball({ design: galaxy, color: galaxy.base }));
    const t = text(out);
    expect(out).toContain('fill="#0b1026"');
    expect(out).toContain('aria-label="Qué color cambias"');
    expect(out).toMatch(/role="radio" aria-checked="true" aria-label="Color base"/);
    expect(out).toContain('aria-label="Segundo color (automático)"');
    expect(out).toContain('aria-label="Tercer color"');
    // El automático lleva la «A» en su círculo.
    expect(t).toContain('Base A Segundo Tercero');
    // «Figuras» con el contador.
    expect(out).toMatch(/Figuras<span[^>]*>2<\/span>/);
    // Ya no es la lisa: «Restablecer» se puede tocar.
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>.*?Restablecer/);
  });

  it('«Colores»: el automático del segundo marcado y su color en el código', () => {
    const auto = ballDesignColors(galaxy).second;
    const out = renderToString(h(DesignColors, { draft: galaxy, slot: 'second', onSlot: noop, onColor: noop }));
    expect(out).toMatch(/role="radio" aria-checked="true" aria-label="Segundo color \(automático\)"/);
    expect(out).toMatch(/role="radio" aria-checked="true" aria-label="Automático \(sale de la base\)"/);
    expect(out).toContain(`value="${auto}"`);
    expect(text(out)).toContain('Segundo color');
    // Un color propio: ninguno de la paleta marcado y el selector del teléfono resaltado.
    const own = renderToString(h(DesignColors, { draft: { ...galaxy, base: '#123456' }, slot: 'base', onSlot: noop, onColor: noop }));
    expect(own.match(/aria-checked="true"/g)).toHaveLength(1); // solo «Color base»
    expect(own).toMatch(/type="color"[^>]*ring-2[^>]*value="#123456"/);
    // En la sólida, aunque el lugar elegido sea otro, se cambia la base.
    const solid = renderToString(h(DesignColors, { draft: defaultBallDesign('#dc2626'), slot: 'third', onSlot: noop, onColor: noop }));
    expect(text(solid)).toContain('Color de la bola');
    expect(solid).toMatch(/aria-checked="true" aria-label="Rojo"/);
  });

  it('«Dibujo»: los 8 con su bola chica, los controles (menos en la sólida), brillo y huecos', () => {
    const out = renderToString(h(DesignPattern, { draft: { ...galaxy, shine: false }, onPattern: noop, onChange: noop }));
    const t = text(out);
    expect(out.match(/role="radio"/g)).toHaveLength(8);
    expect(out.match(/<svg[^>]*width="40" height="40"/g)).toHaveLength(8);
    expect(out).toMatch(/role="radio" aria-checked="true"[^>]*>.*?Galaxia/);
    for (const label of ['Sólida', 'Perlada', 'Jaspeada', 'Veteada', 'Dos colores', 'Destellos', 'Galaxia', 'Camuflaje']) expect(t).toContain(label);
    expect(out.match(/type="range"/g)).toHaveLength(3);
    expect(t).toContain('Tamaño del dibujo');
    expect(t).toContain('100 %');
    expect(t).toContain('30°');
    expect(out).toContain('aria-valuetext="50 %"');
    // Brillo apagado, huecos prendidos.
    expect(out.match(/role="switch"/g)).toHaveLength(2);
    expect(out.match(/role="switch"[^>]*checked=""/g)).toHaveLength(1);
    const solid = renderToString(h(DesignPattern, { draft: defaultBallDesign('#dc2626'), onPattern: noop, onChange: noop }));
    expect(solid).not.toContain('type="range"');
    expect(text(solid)).toContain('La sólida no tiene dibujo');
  });

  it('«Figuras»: agregar las 8; con 5 ya no se agrega; la elegida con su texto, color, flechas, tamaño, giro y quitar', () => {
    const empty = renderToString(h(DesignStickers, { draft: defaultBallDesign('#1d4ed8'), picked: null, initials: 'AMP', onPick: noop, onAdd: noop, onRemove: noop, onSticker: noop }));
    expect(empty.match(/aria-label="Agregar: /g)).toHaveLength(8);
    expect(empty).not.toMatch(/aria-label="Agregar: [^"]*" disabled=""|disabled=""[^>]*aria-label="Agregar/);
    expect(text(empty)).toContain('Agregar una figura (0 de 5)');
    // Las iniciales de la cuenta en el botón.
    expect(empty).toContain('>AMP</text>');
    expect(empty).not.toContain('Sus figuras');

    // Sin iniciales en la cuenta, el botón muestra las de ejemplo (las mismas que salen al agregarla).
    const noName = renderToString(h(DesignStickers, { draft: defaultBallDesign('#1d4ed8'), picked: null, initials: '', onPick: noop, onAdd: noop, onRemove: noop, onSticker: noop }));
    expect(noName).toContain('>AB</text>');

    const five: BallDesign = { ...galaxy, stickers: Array.from({ length: 5 }, (_, i) => sticker({ x: i / 10 })) };
    const full = renderToString(h(DesignStickers, { draft: five, picked: null, initials: '', onPick: noop, onAdd: noop, onRemove: noop, onSticker: noop }));
    expect(full.match(/disabled=""/g)).toHaveLength(8);
    expect(text(full)).toContain('Ya tiene 5 figuras');
    expect(full.match(/role="radio"/g)).toHaveLength(5);
    expect(text(full)).toContain('Elige una figura');

    const picked = renderToString(h(DesignStickers, { draft: galaxy, picked: 1, initials: '', onPick: noop, onAdd: noop, onRemove: noop, onSticker: noop }));
    const t = text(picked);
    expect(picked).toMatch(/role="radio" aria-checked="true"[^>]*>.*?Número 7/);
    expect(t).toContain('Número (hasta 3 cifras)');
    expect(picked).toContain('inputMode="numeric"');
    expect(picked).toContain('value="7"');
    expect(t).toContain('Color de la figura');
    expect(picked).toMatch(/aria-checked="true" aria-label="Rojo"/);
    for (const a of ['Mover arriba', 'Mover a la izquierda', 'Mover a la derecha', 'Mover abajo']) expect(picked).toContain(`aria-label="${a}"`);
    expect(t).toContain('toca la bola donde la quieres');
    expect(t).toContain('Toca otra figura en la bola para elegirla');
    expect(t).toContain('Tamaño');
    expect(t).toContain('Giro');
    expect(t).toContain('Quitar la figura');
  });

  it('el texto de una figura nunca llega como marcado (ni en la bola ni en los botones)', () => {
    const evil = { ...galaxy, stickers: [sticker({ shape: 'iniciales', text: '<img src=x onerror=alert(1)>' })] } as BallDesign;
    const out = renderToString(h(DesignStickers, { draft: evil, picked: 0, initials: '<b>', onPick: noop, onAdd: noop, onRemove: noop, onSticker: noop }));
    expect(out).not.toMatch(/<img|<b>|onerror|alert/i);
    // Limpio: las letras, hasta 3 (en el botón, en su nombre y en el campo).
    expect(text(out)).toContain('Iniciales IMG');
    expect(out).toContain('value="IMG"');
    const art = renderToString(h(StickerArt, { shape: 'numero', color: '#ffffff', text: '"><script>1</script>', size: 28 }));
    expect(art).not.toMatch(/<script/);
    expect(art).toContain('>1</text>');
    expect(art).toContain('aria-hidden="true"');
  });

  it('la figura nueva sale en un lugar libre, sin tapar las otras ni los huecos, del color que se ve sobre la bola', () => {
    const s = newSticker('estrella', galaxy);
    expect(stickerAt(galaxy.stickers, s)).toBeNull();
    for (const o of galaxy.stickers) expect(Math.hypot(o.x - s.x, o.y - s.y)).toBeGreaterThanOrEqual(o.size + s.size);
    expect(s.color).toBe('#facc15');
    // Las 5 que salen solas: ninguna encima de otra (tocar una la elige a ella) ni de un hueco.
    const d = { ...galaxy, stickers: [] as BallSticker[] };
    for (let i = 0; i < 5; i++) d.stickers.push(newSticker('estrella', d));
    d.stickers.forEach((a, i) => {
      expect(stickerAt(d.stickers, a)).toBe(i);
      for (const h of BALL_HOLES) expect(Math.hypot(a.x - h.x, a.y - h.y)).toBeGreaterThanOrEqual(a.size + h.r);
    });
  });
});

describe('la bola dibujada en «Mis bolas»', () => {
  const games = (b: string, scores: number[]): BallGame[] =>
    scores.map((score, i) => ({ ball: b, kind: 'solo', ref: `s${i}`, game: 0, date: '2026-09-20', score, frames: null, counted: true }));

  it('la tarjeta: la bola a 64 px; tocarla abre «Diseñar»', () => {
    const b = ball({ design: galaxy, color: galaxy.base });
    const card = (onDesign?: () => void) =>
      renderToString(h(MemoryRouter, null, h(BallCard, { stats: ballStats([b], games('b1', [200]))[0], onEdit: noop, onDesign, onResurface: noop, onRetire: noop })));
    const out = card(noop);
    expect(out).toMatch(/<button[^>]*aria-label="Diseñar la Phaze II"[^>]*>\s*<svg[^>]*width="64" height="64"/);
    expect(text(out)).toContain('Diseñar');
    expect(out).toContain('fill="#0b1026"');
    // Sin creador, la bola solo se ve.
    const plain = card();
    expect(plain).toMatch(/<svg[^>]*width="64" height="64"/);
    expect(plain).not.toContain('Diseñar');
  });

  it('la hoja de la bola: cómo se ve y «Diseñar»; con diseño, sin elegir el color aquí', () => {
    const render = (b: Ball | null, onDesign?: () => void) =>
      renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, h(BallSheet, { ball: b, today: '2026-09-30', onClose: noop, onDesign }))));
    const fresh = render(null);
    expect(fresh).toMatch(/<svg[^>]*width="64" height="64"/);
    expect(text(fresh)).toContain('Cuando la agregues la puedes diseñar');
    expect(fresh.match(/role="radio"/g)).toHaveLength(13);
    expect(text(fresh)).not.toMatch(/Diseñar\s*$/);

    const plain = render(ball(), noop);
    expect(text(plain)).toContain('Hazla como la tuya');
    expect(plain).toMatch(/<button[^>]*>.*?Diseñar<\/button>/);
    expect(plain.match(/role="radio"/g)).toHaveLength(13);

    const designed = render(ball({ design: galaxy, color: galaxy.base }), noop);
    expect(text(designed)).toContain('Su color y su dibujo se cambian en «Diseñar».');
    expect(designed).not.toContain('aria-label="Color de la bola"');
    expect(designed).not.toContain('role="radio"');
    expect(designed).toContain('fill="#0b1026"');
  });

  describe('«Por bola» en las estadísticas', () => {
    const UID = 'u-diseno';
    beforeAll(async () => {
      await setDataUser(UID);
    });
    afterAll(async () => {
      await resetDataClientForTests();
    });

    it('Yo › Pro › «Por bola»: cada bola dibujada a 30 px con su diseño, nombre y peso, juegos y strikes, y su promedio', () => {
      const b = ball({ design: galaxy, color: galaxy.base });
      queryClient.setQueryData(ballKeys.list(UID), { balls: [b, ball({ id: 'b2', name: 'Spare', weight: 14, color: '#f8fafc', cover: 'poliester' })], lastUsed: null });
      queryClient.setQueryData(ballKeys.games(UID, null), [...games('b1', [210, 190]), ...games('b2', [150])]);
      const out = renderToString(h(MemoryRouter, null, h(BallStatsSection)));
      expect(out.match(/<svg[^>]*width="30" height="30"/g)).toHaveLength(2);
      expect(out).toContain('fill="#0b1026"');
      expect(out).toContain('fill="#f8fafc"');
      const t = text(out);
      expect(t).toContain('Por bola');
      expect(t).toContain('Mis bolas');
      expect(t).toContain('Phaze II 15 lb');
      expect(t).toContain('2 juegos');
      expect(t).toContain('Spare 14 lb 1 juego');
      expect(t).toMatch(/Phaze II 15 lb 2 juegos\s+200/);
      // Cada bola abre su hoja en Mis bolas.
      expect(out).toContain('href="/bolas?bola=b1"');
      expect(out).toContain('href="/bolas"');
    });

    it('Yo › Lite › «Mis bolas»: una tarjeta por bola (38 px) con cuántos juegos lleva, y «Agregar»', () => {
      queryClient.setQueryData(ballKeys.list(UID), {
        balls: [ball({ name: 'Morada', weight: 14 }), ball({ id: 'b2', name: 'Negra', color: '#111827' }), ball({ id: 'b3', name: 'Vieja', retired: true })],
        lastUsed: null,
      });
      queryClient.setQueryData(ballKeys.games(UID, null), [...games('b1', [210, 190, 200, 180, 170]), ...games('b2', [150, 160, 170]), ...games('b3', [140])]);
      const out = renderToString(h(MemoryRouter, null, h(MyBallsSection)));
      const t = text(out);
      expect(t).toContain('Mis bolas');
      expect(t).toContain('Agregar');
      expect(out).toContain('href="/bolas?nueva=1"');
      expect(t).toContain('Morada 5 juegos');
      expect(t).toContain('Negra 3 juegos');
      // Las retiradas no salen en Lite (siguen en Mis bolas).
      expect(t).not.toContain('Vieja');
      expect(out.match(/<svg[^>]*width="38" height="38"/g)).toHaveLength(2);
      expect(out).toContain('href="/bolas?bola=b2"');
    });

    it('Yo › Lite › «Mis bolas» sin bolas: «Agrega tu bola»', () => {
      queryClient.setQueryData(ballKeys.list(UID), { balls: [], lastUsed: null });
      const t = text(renderToString(h(MemoryRouter, null, h(MyBallsSection))));
      expect(t).toContain('Agrega tu bola');
      expect(t).toContain('Y mira con cuál tiras mejor');
    });
  });
});
