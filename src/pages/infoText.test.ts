/** Lo compartido de «Acerca de» (aboutText.ts) y «Contáctanos» (contactText.ts), con datos ficticios. */
import { describe, expect, it } from 'vitest';
import { plainLegalText } from './legal/texts';
import { ABOUT_FEATURES, ABOUT_HEADINGS, ABOUT_NOTE, ABOUT_STEPS, sportFullName, sportGridColumns, sportGridCols } from './aboutText';
import { CONTACT_EMAIL, CONTACT_FAQ, CONTACT_MAX, contactMessageHint, contactReady, emailParts } from './contactText';

describe('Acerca de (aboutText.ts)', () => {
  it('las partes, lo que se puede hacer y cómo empezar', () => {
    expect(ABOUT_NOTE).toBe('Ligas y torneos entre amigos, en español y gratis.');
    expect(Object.values(ABOUT_HEADINGS)).toEqual(['Los deportes', 'Qué puedes hacer', 'Cómo empezar']);
    expect(ABOUT_FEATURES).toHaveLength(6);
    expect(ABOUT_STEPS.map((s) => s.title)).toEqual(['Crea tu cuenta', 'Crea tu liga o únete a una', 'Anota y compite']);
  });

  it('la grilla de deportes llena sus filas; el otro nombre va entre paréntesis', () => {
    expect([8, 9, 10, 12].map(sportGridColumns)).toEqual([4, 3, 4, 4]);
    expect([8, 9].map(sportGridCols)).toEqual(['grid-cols-4', 'grid-cols-3']);
    expect(sportFullName({ name: 'Ping pong', alias: 'Tenis de mesa' })).toBe('Ping pong (tenis de mesa)');
    expect(sportFullName({ name: 'Golf' })).toBeUndefined();
  });
});

describe('Contáctanos (contactText.ts)', () => {
  it('hace falta el nombre y el mensaje; el aviso del tope sale cerca del final', () => {
    expect(contactReady({ name: 'Jugador Uno', message: 'Hola' })).toBe(true);
    expect(contactReady({ name: '  ', message: 'Hola' })).toBe(false);
    expect(contactReady({ name: 'Jugador Uno', message: ' ' })).toBe(false);
    expect(contactMessageHint(CONTACT_MAX - 100)).toBeUndefined();
    expect(contactMessageHint(CONTACT_MAX - 99)).toBe(`${CONTACT_MAX - 99} de ${CONTACT_MAX} letras.`);
  });

  it('el correo se parte antes de la @', () => {
    expect(emailParts('correo@ejemplo.com')).toEqual(['correo', '@ejemplo.com']);
    expect(emailParts(CONTACT_EMAIL).join('')).toBe(CONTACT_EMAIL);
    expect(emailParts('sinarroba')).toEqual(['sinarroba', '']);
  });

  it('las preguntas frecuentes; la de los datos lleva a la privacidad', () => {
    expect(CONTACT_FAQ.map((f) => f.q)).toEqual(['¿Cuánto cuesta?', '¿Cómo creo una liga?', '¿Cómo me uno a una liga?', '¿Qué pasa con mis datos?']);
    const last = CONTACT_FAQ[3]!.a;
    expect(typeof last).not.toBe('string');
    expect(plainLegalText(last)).toContain('Lee la política de privacidad');
  });
});
