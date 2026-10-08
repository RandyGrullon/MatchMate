import { afterEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../../index.html?raw';
import type { SportId } from '../../sports/types';
import { lastSport, rememberSport, SPORT_KEY } from '../../lib/splash';
import { brandColors, contrast, parseHex } from '../../lib/theme';
import { BRAND, duoFaviconSvg, duoSvg } from './brand';
import { DURATION, LIVE_SCENES, SCENE_FOR_SPORT, SCENE_ORDER, SCENES, injectSplash, sceneForSport, sceneSvg, splashCss } from './scenes';

/** XML bien formado (lo justo para estos SVG): etiquetas balanceadas, atributos con comillas y sin repetir. */
function checkXml(xml: string) {
  const stack: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<>]*")*)\s*(\/?)>/g;
  let last = 0;
  for (const m of xml.matchAll(tag)) {
    if (/[<>]/.test(xml.slice(last, m.index))) throw new Error(`XML roto antes de ${m[0]}`);
    last = m.index + m[0].length;
    const names = [...m[3].matchAll(/([\w:-]+)=/g)].map((a) => a[1]);
    if (new Set(names).size !== names.length) throw new Error(`atributo repetido en ${m[0]}`);
    if (m[1]) {
      if (stack.pop() !== m[2]) throw new Error(`</${m[2]}> no cierra lo que abrió`);
    } else if (!m[4]) stack.push(m[2]);
  }
  if (/[<>]/.test(xml.slice(last))) throw new Error('XML roto al final');
  if (stack.length) throw new Error(`sin cerrar: ${stack.join(', ')}`);
}

describe('escenas de apertura', () => {
  it('index.html está al día con scenes.ts (si falla: node scripts/icons/splash.mjs)', () => {
    expect(injectSplash(indexHtml)).toBe(indexHtml);
  });

  it('index.html trae solo las escenas activas y ninguna clave vieja', () => {
    const templates = [...indexHtml.matchAll(/<template id="sp-([\w-]+)">/g)].map((m) => m[1]);
    expect(templates).toEqual([...LIVE_SCENES]);
    expect(LIVE_SCENES).toContain('generic');
    expect(indexHtml).not.toMatch(/bowlingx|bowlinx/i);
    expect(indexHtml).toContain(`localStorage.getItem('${SPORT_KEY}')`);
  });

  it('cada deporte tiene escena; sin deporte, desconocido o apagado: la genérica', () => {
    const sports: SportId[] = ['bowling', 'padel', 'tennis', 'pickleball', 'basketball', 'football', 'futsal', 'golf', 'swimming', 'table_tennis', 'esports'];
    for (const s of sports) expect(SCENE_ORDER).toContain(SCENE_FOR_SPORT[s]);
    expect(SCENE_FOR_SPORT.table_tennis).toBe('table_tennis');
    expect(sceneForSport('table_tennis')).toBe('table_tennis');
    // Esports: su propia escena (el control y el «GG»), activa al abrir y la última de la vista previa.
    expect(SCENE_FOR_SPORT.esports).toBe('esports');
    expect(sceneForSport('esports')).toBe('esports');
    expect(SCENE_ORDER.at(-1)).toBe('esports');
    expect(LIVE_SCENES).toContain('esports');
    expect(SCENES.esports.label).toBe('Esports');
    expect(SCENE_FOR_SPORT.futsal).toBe('football');
    expect(sceneForSport('bowling')).toBe('bowling');
    expect(sceneForSport(null)).toBe('generic');
    expect(sceneForSport('ajedrez')).toBe('generic');
    expect(sceneForSport('constructor')).toBe('generic');
    expect(sceneForSport('futsal', ['generic', 'football'])).toBe('football');
    expect(sceneForSport('padel', ['generic'])).toBe('generic');
  });

  it.each(SCENE_ORDER)('%s: SVG válido, estilos con su prefijo y tiempos que se pueden repetir', (id) => {
    const { svg, css } = SCENES[id];
    const prefix = `sp-${id}`;
    checkXml(svg);
    expect(svg.startsWith(`<svg class="${prefix}" viewBox="0 0 220 120">`)).toBe(true);

    const rules = css.split('\n');
    const keyframes = rules.filter((r) => r.startsWith('@keyframes')).map((r) => /^@keyframes ([\w-]+)\{/.exec(r)![1]);
    for (const k of keyframes) expect(k.startsWith(`${prefix}-`)).toBe(true);
    for (const r of rules.filter((l) => !l.startsWith('@'))) {
      const selectors = r.slice(0, r.indexOf('{')).split(',');
      for (const s of selectors) expect(s.startsWith(`.${prefix} .`)).toBe(true);
      // Cada clase del selector existe en el dibujo.
      for (const c of r.slice(0, r.indexOf('{')).matchAll(/\.([\w-]+)/g)) if (c[1] !== prefix) expect(svg).toMatch(new RegExp(`class="[^"]*\\b${c[1]}\\b`));
    }
    // Todas duran lo mismo y sin retraso: en bucle no se desfasan.
    for (const m of css.matchAll(/animation:([^;}]+)/g)) {
      const [name, duration] = m[1].trim().split(/\s+/);
      expect(keyframes).toContain(name);
      expect(duration).toBe(DURATION);
      expect(m[1]).toMatch(/\bboth\b/);
      expect(m[1].trim().split(/\s+/).filter((t) => /^[\d.]+m?s$/.test(t))).toHaveLength(1);
    }
    for (const m of css.matchAll(/animation-name:([\w-]+)/g)) expect(keyframes).toContain(m[1]);
    expect(css).not.toContain('animation-delay');
    // Colores solo con variables (salvo detalles fijos: el blanco de los agujeros y la franja de los pinos).
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i);

    // Los id van con __ID__ y cada url(#…) apunta a uno de la escena.
    const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
    for (const i of ids) expect(i.startsWith('__ID__')).toBe(true);
    for (const u of svg.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(u[1]);
    const copy = sceneSvg(id, 'x1-');
    expect(copy).not.toContain('__ID__');
    checkXml(copy);
  });

  it('el CSS común cubre oscuro (forzado, del sistema y elegido), bucle y movimiento reducido', () => {
    const css = splashCss();
    expect(css.match(/--sp-acc:var\(--accent,#8b8cf6\)/g)).toHaveLength(3);
    expect(css).toContain('@media (prefers-reduced-motion:reduce){.mm-sp *{animation:none!important}}');
    expect(css).toContain('.mm-sp.loop svg *{animation-iteration-count:infinite!important}');
    for (const id of SCENE_ORDER) expect(css).toContain(SCENES[id].css);
    expect(splashCss(['bowling'])).not.toContain('.sp-padel');
  });
});

describe('último deporte usado', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('se guarda para la próxima apertura', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    expect(lastSport()).toBeNull();
    rememberSport('padel');
    expect(store.get('mm:sport')).toBe('padel');
    expect(lastSport()).toBe('padel');
  });

  it('sin almacenamiento no rompe nada', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(() => rememberSport('golf')).not.toThrow();
    expect(lastSport()).toBeNull();
  });
});

describe('marca', () => {
  it('el morado de siempre usa sus tonos a mano; otro color, los calculados (y se leen)', () => {
    expect(brandColors(null)).toEqual({
      light: { accent: BRAND.light.accent, fg: BRAND.light.onAccent, soft: '#e8e7fb' },
      dark: { accent: BRAND.dark.accent, fg: BRAND.dark.onAccent, soft: '#25264a' },
    });
    expect(brandColors('#4338CA')).toEqual(brandColors(null));
    expect(brandColors('azul')).toEqual(brandColors(null));
    const teal = brandColors('#0d9488');
    for (const m of ['light', 'dark'] as const) expect(contrast(parseHex(teal[m].accent)!, parseHex(teal[m].fg)!)).toBeGreaterThanOrEqual(4.5);
  });

  it('los SVG de los iconos están bien formados y el favicon sigue el modo del sistema', () => {
    checkXml(duoSvg({ tile: '#4338ca', ink: '#fff' }));
    checkXml(duoSvg({ tile: null, ink: '#fff', viewBox: '88 88 336 336' }));
    const fav = duoFaviconSvg();
    checkXml(fav);
    expect(fav).toContain('@media (prefers-color-scheme:dark)');
    expect(fav).toContain(BRAND.dark.accent);
  });
});
