/**
 * «Escribir a Ana» por WhatsApp para entrar a un torneo (TourneyContact), dibujado sin navegador: lo usan el anuncio de
 * un torneo sin liga y la pantalla de un torneo de la liga (EventPage). Sin teléfono no sale nada (ni «Pregúntale a…»).
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TourneyContact } from './AnnouncementCard';

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('contacto por WhatsApp de un torneo', () => {
  it('con el teléfono de la liga: «Escribir a Ana», con el saludo ya escrito y de 44 px', () => {
    const html = renderToString(
      h(TourneyContact, { league: { name: 'Liga de los martes', contactName: 'Ana', contactPhone: '809-555-1234' }, eventName: 'Copa de octubre' }),
    );
    expect(text(html)).toBe('Escribir a Ana');
    expect(html).toMatch(/href="https:\/\/wa\.me\/[^"]*"/);
    expect(decodeURIComponent(/href="([^"]*)"/.exec(html)![1].replace(/&amp;/g, '&'))).toContain('Hola Ana, quiero participar en Copa de octubre (Liga de los martes).');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('h-11');
  });

  it('sin nombre de contacto: «Escribir a quien organiza»; sin teléfono, nada', () => {
    expect(text(renderToString(h(TourneyContact, { league: { name: 'L', contactName: '', contactPhone: '8095551234' }, eventName: 'Copa' })))).toBe(
      'Escribir a quien organiza',
    );
    expect(renderToString(h(TourneyContact, { league: { name: 'L', contactName: 'Ana', contactPhone: '' }, eventName: 'Copa' }))).toBe('');
  });
});
