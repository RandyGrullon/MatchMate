/**
 * Lo de «Contáctanos» (/contacto) sin pantalla: el correo de MatchMate, los motivos, el tope del mensaje, el correo que
 * se arma para la app de correo y las preguntas frecuentes. Lo usan ContactPage.tsx de la web y la pantalla de la app
 * del teléfono (movil/src/app/contacto.tsx).
 */
import { LEGAL_CONTACT } from '../lib/legal';
import type { LegalText } from './legal/texts';

/** El correo de MatchMate (lo lee el equipo): el mismo que dicen la privacidad y los términos (src/lib/legal.ts). */
export const CONTACT_EMAIL: string = LEGAL_CONTACT.email;

export const CONTACT_REASONS = ['Tengo una duda', 'Algo no funciona', 'Una idea para la app', 'Quiero usarla en mi liga', 'Otro'] as const;
export type ContactReason = (typeof CONTACT_REASONS)[number];

/** Hasta dónde se escribe: los links mailto muy largos no los abren todas las apps de correo. */
export const CONTACT_MAX = 1500;

export interface ContactDraft {
  name: string;
  email: string;
  reason: string;
  message: string;
}

/**
 * El link que abre la app de correo con todo listo: para CONTACT_EMAIL, el asunto «MatchMate · <motivo>» y en el
 * cuerpo el mensaje, el nombre y el correo para responder (si lo puso). Nada pasa por la app ni se guarda.
 */
export function contactMailto(d: ContactDraft): string {
  const reason = (CONTACT_REASONS as readonly string[]).includes(d.reason) ? d.reason : 'Otro';
  const lines = [d.message.trim().slice(0, CONTACT_MAX), '', '--', `Nombre: ${d.name.trim() || 'Sin nombre'}`];
  if (d.email.trim()) lines.push(`Correo para responder: ${d.email.trim()}`);
  const subject = `MatchMate · ${reason}`;
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\r\n'))}`;
}

/** ¿Se puede escribir el correo? (el nombre y el mensaje). */
export const contactReady = (d: Pick<ContactDraft, 'name' | 'message'>) => d.name.trim() !== '' && d.message.trim() !== '';

/** La línea de abajo del mensaje cuando se acerca al tope («1420 de 1500 letras.»). */
export const contactMessageHint = (length: number): string | undefined => (length > CONTACT_MAX - 100 ? `${length} de ${CONTACT_MAX} letras.` : undefined);

/** El correo en dos partes: en un teléfono angosto pasa al otro renglón antes de la @, no a mitad de «gmail.com». */
export function emailParts(email: string): [string, string] {
  const [user, ...rest] = email.split('@');
  return [user ?? '', rest.length ? `@${rest.join('@')}` : ''];
}

/** Las preguntas frecuentes (la última lleva a la política de privacidad). */
export const CONTACT_FAQ: readonly { q: string; a: LegalText }[] = [
  {
    q: '¿Cuánto cuesta?',
    a: 'Nada: MatchMate es gratis. Crear ligas y torneos, invitar a tu gente, anotar juegos y ver tus estadísticas no cuesta.',
  },
  {
    q: '¿Cómo creo una liga?',
    a: 'Crea tu cuenta y ve a Ligas › Crear o unirme. Eliges el deporte, le pones nombre y listo; después invitas a tu gente con un link o un código.',
  },
  {
    q: '¿Cómo me uno a una liga?',
    a: 'Abre el link que te pasó quien la maneja, o ve a Ligas › Crear o unirme y pon el código. Las ligas abiertas están en Ligas › Buscar ligas abiertas.',
  },
  {
    q: '¿Qué pasa con mis datos?',
    a: [
      'Guardamos solo lo necesario para que tu liga funcione. No vendemos tus datos, y puedes bajarlos o borrar tu cuenta cuando quieras. ',
      { link: 'privacidad', text: 'Lee la política de privacidad' },
      '.',
    ],
  },
];
