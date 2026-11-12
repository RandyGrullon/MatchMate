/**
 * Lo puro de pagar con Azul en el teléfono (movil/src/lib/azul.ts): leer el formulario que llega a la pantalla de
 * Azul, armar el cuerpo del POST y reconocer la vuelta. Sin react-native, para probarlo fuera de la app.
 */
import type { AzulForm } from '@mm/lib/data/business';

/** El formulario que llegó a la pantalla de Azul (null si falta o no es uno). */
export function azulFormFrom(raw: string | undefined): AzulForm | null {
  if (!raw) return null;
  try {
    const f = JSON.parse(raw) as Partial<AzulForm>;
    if (typeof f.url !== 'string' || !/^https:\/\//.test(f.url) || !f.fields || typeof f.fields !== 'object') return null;
    return f as AzulForm;
  } catch {
    return null;
  }
}

/** El cuerpo del POST (application/x-www-form-urlencoded), como lo manda el formulario de la web. */
export function azulBody(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`.replace(/%20/g, '+'))
    .join('&');
}

/** La dirección sin query ni ancla, y su query (sin el `?`). */
function split(url: string): [string, string] {
  const i = url.search(/[?#]/);
  if (i < 0) return [url, ''];
  return [url.slice(0, i), url[i] === '?' ? url.slice(i + 1).split('#')[0] : ''];
}

/**
 * Si `url` es la vuelta de Azul (la dirección de ApprovedUrl, DeclinedUrl o CancelUrl del formulario firmado), su query
 * sin el `?` (puede ser vacío); si no, null.
 */
export function azulReturnQuery(url: string, fields: Record<string, string>): string | null {
  const [base, query] = split(url);
  const backs = [fields.ApprovedUrl, fields.DeclinedUrl, fields.CancelUrl].filter((u): u is string => !!u).map((u) => split(u)[0]);
  return backs.includes(base) ? query : null;
}
