import type { Post, PostVisibility } from '../../lib/data/posts';

/**
 * Textos y cuentas de las publicaciones (sin React: se prueban solos): los links del texto, la primera línea, el
 * tamaño del hueco de la foto, a quién le sale y la dirección para compartir.
 */

/** Ruta de una publicación. */
export const postPath = (id: string) => `/p/${encodeURIComponent(id)}`;

/** La dirección completa para compartir (con el dominio de la app). */
export function postShareUrl(id: string, origin = typeof location === 'undefined' ? '' : location.origin): string {
  return `${origin}${postPath(id)}`;
}

/** Un pedazo del texto: texto normal o un link (solo http y https). */
export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

/** Lo que termina una frase y no es parte del link («mira https://x.com.» → sin el punto). */
const TRAILING = /[.,;:!?¡¿)\]}»”"'’…]+$/;
const URL_RE = /\bhttps?:\/\/[^\s<>"«»]+/gi;

/** La dirección si es un link seguro (http o https con dominio); null si no. */
export function safeHref(raw: string): string | null {
  try {
    const u = new URL(raw);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** El texto en pedazos con los links aparte (para dibujarlos como <a>). El texto no se toca: se escapa al dibujarlo. */
export function linkify(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  const push = (t: string) => {
    if (!t) return;
    const prev = out.at(-1);
    if (prev?.kind === 'text') prev.text += t;
    else out.push({ kind: 'text', text: t });
  };
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    let raw = m[0];
    // Un paréntesis que se abrió dentro del link (Wikipedia) sí es del link.
    const trail = raw.match(TRAILING)?.[0] ?? '';
    if (trail) {
      raw = raw.slice(0, raw.length - trail.length);
      if (trail.startsWith(')') && raw.includes('(')) raw += ')';
    }
    const href = safeHref(raw);
    push(text.slice(last, start));
    if (href) out.push({ kind: 'link', text: raw, href });
    else push(raw);
    last = start + raw.length;
  }
  push(text.slice(last));
  return out;
}

/** La primera línea con algo (para las filas cortas de Hoy y el texto de compartir), recortada. */
export function firstLine(text: string, max = 90): string {
  const line =
    text
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** ¿El texto es largo para la tarjeta del feed? (va recortado con «Ver más»). */
export function isLongText(text: string): boolean {
  return text.length > 420 || text.split('\n').length > 8;
}

/**
 * Proporción del hueco de la foto (ancho / alto) para que la pantalla no salte cuando llega: la de la foto, entre 4:5
 * (vertical) y 1.91:1 (panorámica); sin tamaño, 4:3. En el visor se ve entera.
 */
export function photoRatio(w: number | null | undefined, h: number | null | undefined): number {
  if (!w || !h || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 4 / 3;
  return Math.min(1.91, Math.max(0.8, w / h));
}

/** A quién le sale, para la pista de la tarjeta (nada si es para todos). */
export function visibilityHint(v: PostVisibility): string | null {
  return v === 'followers' ? 'Seguidores' : v === 'league' ? 'Solo la liga' : null;
}

// ---------- Publicar: a quién le sale ----------

/** Dónde se publica: en tu perfil (null) o en una de tus ligas. */
export interface ComposerTarget {
  id: string;
  name: string;
  sport: string;
  visibility: 'public' | 'private';
}

/** Las opciones de «A quién» según dónde se publica: perfil (Todos · Seguidores) o liga (Todos si es pública · Solo la liga). */
export function audienceOptions(target: Pick<ComposerTarget, 'visibility'> | null): PostVisibility[] {
  if (!target) return ['public', 'followers'];
  return target.visibility === 'public' ? ['public', 'league'] : ['league'];
}

/** La que va de entrada: para todos si se puede; en una liga privada, solo la liga. */
export function defaultAudience(target: Pick<ComposerTarget, 'visibility'> | null): PostVisibility {
  return audienceOptions(target)[0]!;
}

/** Una línea debajo del selector: quién la va a ver. */
export function audienceHint(v: PostVisibility, inLeague: boolean): string {
  if (v === 'followers') return 'La ven solo quienes te siguen.';
  if (v === 'league') return 'La ven solo los miembros de la liga.';
  return inLeague ? 'La ve cualquiera y sale a quien sigue la liga.' : 'La ve cualquiera con cuenta.';
}

/** Cuántos caracteres faltan para el tope a partir de los que se muestra el contador. */
export const COUNTER_FROM = 100;

/** Lo de la fila corta de Hoy: la primera línea, o «📷 Foto» si es solo una foto. */
export function postSnippet(p: Pick<Post, 'text' | 'photo'>): string {
  return firstLine(p.text) || (p.photo ? '📷 Foto' : '');
}
