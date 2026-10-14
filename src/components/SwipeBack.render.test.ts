/**
 * «Desliza para salir» dibujado sin navegador: el indicador quieto (escondido detrás del borde, sin tocarse) y la marca
 * `data-back-to` de cada «‹ atrás» con la pantalla de ARRIBA (no el historial): la flecha de un jugador, la barra del
 * evento y las de Yo / Social / Ligas, la de la liga, las sueltas («‹ Configuración»), la de un partido abierto encima
 * (la lista de debajo, sin `?partido=`) y la de la consola.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BackLink } from './BackLink';
import { BackBar as KitBackBar } from './cuenta/kit';
import { EventTopBar } from './event/EventHeader';
import { LeagueTopBar } from './league/home/LeagueTopBar';
import { ScreenTop } from './screens/ScreenBits';
import { SwipeBack } from './SwipeBack';

const render = (el: ReactElement, url = '/') => renderToString(h(MemoryRouter, { initialEntries: [url] }, el));
/** Los `data-back-to` del HTML, en orden (sin escapar). */
const marks = (html: string) => [...html.matchAll(/data-back-to="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));

describe('SwipeBack quieto', () => {
  it('no se ve ni se puede tocar: el círculo con «‹» está escondido detrás del borde', () => {
    const html = render(h(SwipeBack));
    expect(html).toContain('data-swipe-back=""');
    expect(html).toMatch(/aria-hidden="true" class="pointer-events-none fixed top-0 left-0 z-50 size-0"/);
    expect(html).toMatch(/style="transform:translate3d\(-40px, 0, 0\);opacity:0"/);
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('lucide-chevron-left');
    // Al llegar al umbral se pinta del color de la app; sin a dónde salir, apagado.
    expect(html).toContain('data-[state=armed]:bg-accent');
    expect(html).toContain('data-[state=dead]:text-muted');
    expect(html.replace(/<[^>]+>/g, '').trim()).toBe('');
  });
});

describe('cada «‹ atrás» dice a qué pantalla sale el gesto (data-back-to)', () => {
  it('la flecha de un jugador: su `fallback` (la Tabla), no el historial', () => {
    expect(marks(render(h(BackLink, { fallback: '/l/abc/ranking' }), '/l/abc/j/p1'))).toEqual(['/l/abc/ranking']);
  });

  it('la barra del evento: la liga; un torneo sin liga no tiene a dónde', () => {
    expect(marks(render(h(EventTopBar, { back: { label: 'Liga de los martes', fallback: '/l/abc' }, right: null }), '/l/abc/e/ev1'))).toEqual(['/l/abc']);
    expect(marks(render(h(EventTopBar, { back: null, right: null }), '/l/abc'))).toEqual([]);
  });

  it('las de Yo, Social y Ligas (ScreenTop)', () => {
    expect(marks(render(h(ScreenTop, { label: 'Yo', fallback: '/perfil' }), '/bolas'))).toEqual(['/perfil']);
    expect(marks(render(h(ScreenTop, { label: 'Social', fallback: '/social' }), '/p/x'))).toEqual(['/social']);
    expect(marks(render(h(ScreenTop, { label: 'Ligas', fallback: '/ligas' }), '/agenda'))).toEqual(['/ligas']);
  });

  it('la de la liga: «‹ Ligas» en su inicio y la de adentro a su inicio', () => {
    expect(marks(render(h(LeagueTopBar, { to: '/ligas', label: 'Ligas' }), '/l/abc'))).toEqual(['/ligas']);
    expect(marks(render(h(LeagueTopBar, { to: '/l/abc', label: 'Liga de los martes' }), '/l/abc/ranking'))).toEqual(['/l/abc']);
  });

  it('las de las pantallas sueltas («‹ Configuración»)', () => {
    expect(marks(render(h(KitBackBar, { to: '/cuenta', label: 'Configuración' }), '/acerca'))).toEqual(['/cuenta']);
  });

  it('la de un partido abierto encima (raqueta, esports): la lista de debajo, sin el partido ni el modo cancha', async () => {
    const { BackBar } = await import('../pages/sports/racket/frame');
    const html = render(h(BackBar, { label: 'Americano del jueves', onBack: () => {} }), '/l/abc/e/ev1?ver=cuadro&partido=m1&cancha=1');
    expect(marks(html)).toEqual(['/l/abc/e/ev1?ver=cuadro']);
    expect(marks(render(h(BackBar, { label: 'X', onBack: () => {}, backTo: '/l/abc' }), '/l/abc/juegos?partido=m1'))).toEqual(['/l/abc']);
  });

  it('la de un partido de equipos: la lista sin ?partido= ni ?mesa=; la del perfil de un jugador, su `fallback`', async () => {
    const { BackBar, HistoryBackBar } = await import('../pages/sports/team/TeamUi');
    expect(marks(render(h(BackBar, { label: 'Partidos', onBack: () => {} }), '/l/abc/juegos?partido=m1&mesa=1'))).toEqual(['/l/abc/juegos']);
    expect(marks(render(h(HistoryBackBar, { label: 'Liga', fallback: '/l/abc/ranking' }), '/l/abc/j/p1'))).toEqual(['/l/abc/ranking']);
  });

  it('la consola: la cabecera (se ve también en la computadora, donde «‹ Consola» no va)', async () => {
    const { SectionHeader } = await import('../pages/superadmin/bits');
    expect(marks(render(h(SectionHeader, { title: 'Ligas' }), '/superadmin/ligas'))).toEqual(['/superadmin']);
    expect(marks(render(h(SectionHeader, { title: 'Consola', back: { to: '/organizar', label: 'Organizar' } }), '/superadmin'))).toEqual(['/organizar']);
    expect(marks(render(h(SectionHeader, { title: 'Consola', back: null }), '/superadmin'))).toEqual([]);
  });
});
