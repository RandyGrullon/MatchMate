/**
 * Piezas de la liga dibujadas sin navegador (renderToString): el color de cada deporte y «¿Quién eres?».
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { scopedAccentCss } from '../../lib/theme';
import { SportTheme, sportAccent, sportScopeClass } from './SportTheme';
import { WhoAreYouList } from './WhoAreYou';

const brand = { mode: 'system' as const, accent: null };

describe('color del deporte dentro de la liga', () => {
  it('pádel: su clase, con los tonos para claro, oscuro y como el teléfono', () => {
    const { className, css } = sportAccent('padel', brand);
    expect(className).toBe('mm-sport-padel');
    expect(css).toMatch(/^\.mm-sport-padel\{--accent:#[0-9a-f]{6};--accent-fg:#[0-9a-f]{6};--accent-soft:#[0-9a-f]{6};\}/);
    expect(css).toContain('@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .mm-sport-padel{');
    expect(css).toContain(':root[data-theme="dark"] .mm-sport-padel{');
  });

  it('el boliche, un deporte desconocido o una cuenta con su propio color: el color de la app', () => {
    expect(sportAccent('bowling', brand)).toEqual({ className: '', css: '' });
    expect(sportAccent('curling', brand)).toEqual({ className: '', css: '' });
    expect(sportAccent(null, brand)).toEqual({ className: '', css: '' });
    expect(sportAccent('padel', { mode: 'dark', accent: '#dc2626' })).toEqual({ className: '', css: '' });
    // Elegir el morado de siempre en Configuración es como no elegir: cada liga con el suyo.
    expect(sportAccent('padel', { mode: 'light', accent: '#4338CA' }).className).toBe('mm-sport-padel');
  });

  it('solo acepta una clase simple como selector', () => {
    expect(scopedAccentCss('.mm-sport-golf', '#4d7c0f')).not.toBe('');
    expect(scopedAccentCss('body', '#4d7c0f')).toBe('');
    expect(scopedAccentCss('.x{} body', '#4d7c0f')).toBe('');
    expect(scopedAccentCss('.mm-sport-golf', 'verde')).toBe('');
    expect(sportScopeClass('fútbol<x>')).toBe('mm-sport-ftbolx');
  });

  it('SportTheme envuelve con la clase y deja el CSS una sola vez en el <head>', () => {
    const html = renderToString(h(SportTheme, { sport: 'football', children: h('p', null, 'hola') }));
    expect(html).toContain('class="mm-sport-football"');
    expect(html).toContain('data-sport="football"');
    expect(html).toContain('<p>hola</p>');
    const bowling = renderToString(h(SportTheme, { sport: 'bowling', children: h('p', null, 'hola') }));
    expect(bowling).not.toContain('mm-sport-');
    expect(bowling).not.toContain('<style');
  });
});

describe('«¿Quién eres?»', () => {
  const players = [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: 'Beto' },
  ];

  it('un botón por jugador libre y «No estoy en la lista», con el elegido marcado', () => {
    const html = renderToString(h(WhoAreYouList, { players, value: 'b', onChange: () => {} }));
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('Ana');
    expect(html).toContain('No estoy en la lista');
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html.indexOf('checked=""')).toBeGreaterThan(html.indexOf('Ana'));
    expect(html).not.toContain('Busca tu nombre');
    // Nadie elegido todavía = «No estoy en la lista».
    const none = renderToString(h(WhoAreYouList, { players, value: null, onChange: () => {}, people: ['nadador', 'nadadores'] }));
    expect(none).toContain('estos nadadores');
    expect(none.match(/checked=""/g)).toHaveLength(1);
    expect(none.indexOf('checked=""')).toBeGreaterThan(none.indexOf('Beto'));
  });

  it('con muchos, el buscador', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: String(i), name: `Jugador ${i}` }));
    expect(renderToString(h(WhoAreYouList, { players: many, value: null, onChange: () => {} }))).toContain('Busca tu nombre');
  });
});
