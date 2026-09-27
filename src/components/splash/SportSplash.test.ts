import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { brandColors } from '../../lib/theme';
import { SportSplash, type SportSplashProps } from './SportSplash';

const render = (...props: SportSplashProps[]) => renderToStaticMarkup(createElement('div', null, ...props.map((p) => createElement(SportSplash, p))));

describe('SportSplash', () => {
  it('dibuja la escena del deporte (desconocido = la genérica) con la palabra', () => {
    const html = render({ sport: 'bowling' });
    expect(html).toContain('data-scene="bowling"');
    expect(html).toContain('<svg class="sp-bowling"');
    expect(html).toContain('Match<b>Mate</b>');
    expect(html).toContain('aria-hidden="true"');
    expect(render({ sport: 'padel' })).toContain('data-scene="padel"');
    expect(render({ sport: 'curling' as SportSplashProps['sport'] })).toContain('data-scene="generic"');
    expect(render({})).toContain('data-scene="generic"');
  });

  it('una escena exacta sale aunque esté apagada; en modo forzado lleva los tonos de ese modo', () => {
    const html = render({ scene: 'golf', mode: 'dark', accent: '#0d9488', width: 150, label: 'Golf' });
    const dark = brandColors('#0d9488').dark;
    expect(html).toContain('data-mode="dark"');
    expect(html).toContain(`--sp-w:150px;--accent:${dark.accent};--accent-fg:${dark.fg}`);
    expect(html).toContain('role="img" aria-label="Golf"');
    expect(html).not.toContain('aria-hidden');
  });

  it('varias copias en la misma pantalla no comparten id; en bucle y sin palabra', () => {
    const html = render({ scene: 'swimming' }, { scene: 'swimming', loop: true, word: false });
    expect(html).not.toContain('__ID__');
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const u of html.matchAll(/url\(#([^)]+)\)/g)) expect(ids).toContain(u[1]);
    expect(html).toContain('class="mm-sp loop"');
    expect(html.match(/Match<b>Mate<\/b>/g)).toHaveLength(1);
    // El CSS va una sola vez aunque haya dos animaciones.
    expect(html.match(/<style/g)).toHaveLength(1);
  });
});
