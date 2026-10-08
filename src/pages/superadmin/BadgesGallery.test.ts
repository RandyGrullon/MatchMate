/**
 * Galería de insignias del superadmin (/superadmin/insignias): se dibuja sin navegador y trae todo el catálogo en
 * cada nivel, las formas, los tamaños, los estados, la animación, los íconos y los colores de liga.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { beforeAll, describe, expect, it } from 'vitest';
import { BADGES, definitionCount } from '../../badges/catalog';
import { BADGE_ICON_KEYS } from '../../badges/visual';
import { sectionFromParam, sectionMeta } from './sections';

let html = '';

beforeAll(async () => {
  const { default: BadgesGallery } = await import('./BadgesGallery');
  // Arriba va «‹ Consola» (un link): se dibuja dentro de un router, como en la app.
  html = renderToString(h(MemoryRouter, null, h(BadgesGallery)));
}, 120_000);

describe('galería de insignias', () => {
  it('es una sección de la consola: /superadmin/insignias', () => {
    expect(sectionFromParam('insignias')).toBe('insignias');
    expect(sectionMeta('insignias').label).toBe('Insignias');
  });

  it('las secciones, en claro y en oscuro', () => {
    for (const t of ['Metales', 'Formas y niveles', 'Tamaños', 'Estados', 'Desbloqueo', 'Catálogo', 'Emblemas por deporte', 'Íconos del creador', 'Colores de liga'])
      expect(html).toContain(`>${t}</h2>`);
    expect(html).toContain('>Claro</p>');
    expect(html).toContain('>Oscuro</p>');
    expect(html).toContain('--bd-rim-oro:#855A06');
    expect(html).toContain('--bd-rim-oro:#F6CF63');
  });

  it('todo el catálogo, cada insignia en cada nivel', () => {
    for (const def of BADGES) expect(html, def.key).toContain(`<code>${def.key}</code>`);
    expect(html).toContain(`${BADGES.length} insignias, ${definitionCount()} niveles`);
    // Dos temas: cada nivel sale dos veces, a 64 px y con su nombre accesible.
    const catalog = html.slice(html.indexOf('>Catálogo</h2>'), html.indexOf('>Emblemas por deporte</h2>'));
    expect(catalog.match(/<svg[^>]*width="64"/g)?.length).toBe(2 * definitionCount());
  });

  it('las formas en cada nivel, los estados y la animación', () => {
    expect(html).toContain('aria-label="Tema de la galería"');
    for (const s of ['Hexágono', 'Escudo', 'Círculo', 'Estrella', 'Medalla', 'Medalla con laurel', 'Cuadrado']) expect(html).toContain(`<b class="block font-semibold">${s}</b>`);
    expect(html).toContain('Victorias, oro, en revisión');
    expect(html).toContain('bd-anim');
    expect(html).toContain('>Sin movimiento<');
  });

  it('los 53 íconos del creador y los de estado', () => {
    const icons = html.slice(html.indexOf('>Íconos del creador</h2>'), html.indexOf('>Colores de liga</h2>'));
    for (const k of BADGE_ICON_KEYS) expect(icons, k).toContain(`title="${k}"`);
    for (const k of ['lock', 'hourglass', 'eye-off']) expect(icons).toContain(`<code>${k}</code>`);
  });
});
