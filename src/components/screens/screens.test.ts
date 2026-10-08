/**
 * Las piezas comunes de las pantallas sueltas del rediseño (ScreenBits, InviteBits), dibujadas sin navegador: el título
 * con una línea, la tarjeta de entrar o crear la cuenta, los datos de una liga en filas y la invitación que no sirve.
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DeadInvite, InfoCard, InviteHero, leagueTypeLine } from './InviteBits';
import { ScreenTitle, ScreenTop, SignInCard, linkButton } from './ScreenBits';

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, el));
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');

describe('pantallas sueltas', () => {
  it('«‹ Yo» y el título (32 px; 28 en Pro) con una línea', () => {
    expect(text(render(h(ScreenTop, { label: 'Yo', fallback: '/perfil' })))).toContain('Yo');
    const lite = render(h(ScreenTitle, { title: 'Mis bolas', hint: 'Solo tú ves tus bolas' }));
    expect(lite).toContain('class="text-title');
    expect(text(lite)).toContain('Solo tú ves tus bolas');
    expect(render(h(ScreenTitle, { title: 'Mis bolas', pro: true }))).toContain('class="text-title-pro');
  });

  it('sin cuenta: «Crear cuenta» (principal) y «Entrar», los dos vuelven a la dirección', () => {
    const out = render(h(SignInCard, { icon: h('svg'), title: 'Entra para ver esto', next: '%2Fbolas' }));
    expect(text(out)).toContain('Entra para ver esto');
    expect(out).toContain('href="/login?modo=registro&amp;next=%2Fbolas"');
    expect(out).toContain('href="/login?next=%2Fbolas"');
    expect(out.match(/bg-accent text-accent-fg/g)).toHaveLength(1);
    expect(linkButton('quiet')).toContain('h-btn');
  });

  it('la invitación: el título grande, «Boliche · Liga pública» y los datos en filas con el WhatsApp del contacto', () => {
    const hero = text(render(h(InviteHero, { art: null, kicker: 'Te invitaron a la liga', title: 'Liga de los martes', meta: leagueTypeLine('bowling', 'liga', 'public') })));
    expect(hero).toContain('Te invitaron a la liga Liga de los martes Boliche · Liga pública');
    const card = render(
      h(InfoCard, {
        rows: [
          { key: 'venue', label: 'Bolera', value: 'Bolera Sambil' },
          { key: 'contact', label: 'Contacto', value: 'Ana Pérez', phone: '8095551234' },
        ],
        leagueName: 'Liga de los martes',
        members: '12 miembros',
      }),
    );
    expect(text(card)).toContain('Bolera Bolera Sambil');
    expect(text(card)).toContain('Ya están 12 miembros');
    expect(card).toContain('WhatsApp');
    expect(card.match(/class="mm-row relative/g)).toHaveLength(3);
    expect(render(h(InfoCard, { rows: [], leagueName: 'X' }))).toBe('');
  });

  it('una invitación que no sirve: qué pasó y «Ver ligas» (o lo que se le pase)', () => {
    const out = render(h(DeadInvite, { icon: h('svg'), title: 'Esta invitación no sirve', text: 'Pide el link nuevo.' }));
    expect(text(out)).toContain('Esta invitación no sirve Pide el link nuevo. Ver ligas');
    expect(out).toContain('href="/ligas"');
    expect(text(render(h(DeadInvite, { icon: null, title: 'T', text: 'x', action: h('a', { href: '/l/1' }, 'Ir a la liga') })))).toContain('Ir a la liga');
  });

  it('el tipo de liga en una línea', () => {
    expect(leagueTypeLine('padel', 'liga', 'private')).toBe('Pádel · Liga privada');
    expect(leagueTypeLine('bowling', 'torneo', 'public')).toBe('Boliche · Torneo');
    expect(leagueTypeLine(null, 'liga', 'public')).toBe('Liga pública');
  });
});
