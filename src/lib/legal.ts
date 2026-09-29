/**
 * Términos de uso y Política de privacidad: la versión vigente de cada uno, lo que cambió, los datos que faltan y
 * si la cuenta ya aceptó lo vigente. Un solo lugar para todo esto.
 *
 * La base guarda cada aceptación (20260929000900_legal.sql: legal_acceptances, accept_legal) y tiene las mismas
 * versiones en private.legal_versions(); tests/sql/legal.test.ts revisa que coincidan.
 *
 * Para cambiar un texto: 1) la página (src/pages/legal); 2) aquí, la fecha nueva (TERMS_VERSION o PRIVACY_VERSION y
 * desde cuándo rige) y lo que cambió en LEGAL_CHANGES; 3) una migración nueva que redefine private.legal_versions()
 * con las mismas fechas. Al entrar, cada cuenta ve «Actualizamos los términos» (src/components/LegalGate.tsx).
 *
 * Orden al publicar: primero la migración (la base) y después la app. Si la app sale antes, accept_legal no acepta
 * las fechas nuevas ('invalido'): LegalGate deja seguir sin guardar (se reporta en Errores de la consola y la consola
 * › Legal muestra que las versiones no coinciden) y vuelve a preguntar cuando la base esté al día.
 */

export type LegalDocKey = 'terminos' | 'privacidad';

/** Versión vigente de los Términos de uso ('YYYY-MM-DD'). */
export const TERMS_VERSION = '2026-09-29';
/** Versión vigente de la Política de privacidad ('YYYY-MM-DD'). */
export const PRIVACY_VERSION = '2026-09-29';
/** Desde cuándo rige cada una ('YYYY-MM-DD'). */
export const TERMS_EFFECTIVE = '2026-09-29';
export const PRIVACY_EFFECTIVE = '2026-09-29';

export interface LegalDocInfo {
  key: LegalDocKey;
  title: string;
  version: string;
  effective: string;
}

export const LEGAL_DOCS: Readonly<Record<LegalDocKey, LegalDocInfo>> = {
  terminos: { key: 'terminos', title: 'Términos de uso', version: TERMS_VERSION, effective: TERMS_EFFECTIVE },
  privacidad: { key: 'privacidad', title: 'Política de privacidad', version: PRIVACY_VERSION, effective: PRIVACY_EFFECTIVE },
};

/** Lo que va en la metadata del registro con correo (la base lo guarda al crear la cuenta). */
export const CURRENT_LEGAL = { terms: TERMS_VERSION, privacy: PRIVACY_VERSION } as const;

/**
 * Lo nuevo de la versión vigente, en palabras simples: lo ve quien ya había aceptado una anterior. Al cambiar una
 * versión, se cambia esta lista (solo lo de esa versión).
 */
export const LEGAL_CHANGES: readonly { doc: LegalDocKey; text: string }[] = [
  { doc: 'terminos', text: 'Ahora puedes reportar comentarios, avisos, juegos, ligas y cuentas que no deberían estar en la app, y te contamos qué hacemos con los reportes.' },
  { doc: 'terminos', text: 'Qué se puede subir en fotos y logos, y qué pasa si alguien no cumple las reglas.' },
  { doc: 'privacidad', text: 'Guardamos cuándo aceptas los términos y la privacidad, qué versión y desde qué navegador.' },
  {
    doc: 'privacidad',
    text: 'Los reportes: qué se guarda, quién los ve y que ni los admins de la liga ni la persona reportada saben quién reportó (solo el equipo de MatchMate).',
  },
  { doc: 'privacidad', text: 'Más claro: los avisos al teléfono, los menores, borrar tu cuenta y cómo escribirnos.' },
];

/**
 * Mientras sea true, el superadmin ve arriba de las páginas legales que falta la revisión de un abogado dominicano
 * (los demás no lo ven). Al aprobarlo: false, llenar LEGAL_CONTACT y subir las versiones si cambió el texto.
 */
export const LEGAL_DRAFT = true;

/**
 * Quién responde por los datos y cómo escribirle. Lo que va entre corchetes falta llenarlo (las páginas lo marcan
 * y la consola › Legal lo lista): no se inventa.
 */
export const LEGAL_CONTACT = {
  responsible: '[Nombre legal del titular]',
  taxId: '[RNC o cédula del titular]',
  address: '[Dirección del titular para notificaciones]',
  email: 'matchmate.oficial@gmail.com',
  place: 'Santo Domingo, República Dominicana',
} as const;

/** ¿Es un dato que falta llenar? (entre corchetes) */
export const isPlaceholder = (text: string) => /^\[.*\]$/.test(text.trim());

/** Lo que falta llenar en los textos, para el dueño de la app (consola › Legal). */
export const LEGAL_PLACEHOLDERS: readonly { text: string; what: string; where: string }[] = [
  {
    text: LEGAL_CONTACT.responsible,
    what: 'La persona o empresa que responde por MatchMate y por los datos (el «responsable» de la Ley 172-13).',
    where: 'Privacidad › Quién cuida tus datos · Términos › El acuerdo',
  },
  {
    text: LEGAL_CONTACT.taxId,
    what: 'Su RNC (si es empresa) o su cédula (si es una persona).',
    where: 'Privacidad › Quién cuida tus datos · Términos › El acuerdo',
  },
  {
    text: LEGAL_CONTACT.address,
    what: 'Una dirección donde recibir notificaciones y reclamos por escrito.',
    where: 'Privacidad › Quién cuida tus datos',
  },
].filter((p) => isPlaceholder(p.text));

/** '2026-09-28' → '28 de septiembre de 2026'. */
export function legalDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d, 12).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---------- Aceptación ----------

/** La última versión que aceptó la cuenta de cada documento (null = ninguna). */
export interface LegalAccepted {
  terms: string | null;
  privacy: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const newest = (a: string | null, b: string) => (a == null || b > a ? b : a);

/** Filas de legal_acceptances → la última versión de cada documento. */
export function latestAccepted(rows: readonly { doc: string; version: string }[]): LegalAccepted {
  let terms: string | null = null;
  let privacy: string | null = null;
  for (const r of rows) {
    if (!DATE.test(r.version)) continue;
    if (r.doc === 'terminos') terms = newest(terms, r.version);
    else if (r.doc === 'privacidad') privacy = newest(privacy, r.version);
  }
  return { terms, privacy };
}

/**
 * Qué documentos le falta aceptar (su última versión es más vieja que la vigente, o no aceptó ninguna). Una versión
 * más nueva que la de esta app (la aceptó con una app más nueva) cuenta como aceptada.
 */
export function legalPending(a: LegalAccepted): LegalDocKey[] {
  const out: LegalDocKey[] = [];
  if (a.terms == null || a.terms < TERMS_VERSION) out.push('terminos');
  if (a.privacy == null || a.privacy < PRIVACY_VERSION) out.push('privacidad');
  return out;
}

/** ¿Hay que mostrarle «Actualizamos los términos»? undefined = no se sabe (copia vieja en el teléfono): no. */
export const needsLegal = (a: LegalAccepted | null | undefined): boolean => !!a && legalPending(a).length > 0;

/** Nunca aceptó nada (cuenta de Google nueva o de antes de guardar la aceptación). */
export const neverAccepted = (a: LegalAccepted | null | undefined): boolean => !a || (a.terms == null && a.privacy == null);

/**
 * Desde cuándo se guarda la aceptación con su versión ('YYYY-MM-DD'). Las cuentas creadas antes aceptaron el texto
 * sin versión («al entrar o crear tu cuenta aceptas…»): para ellas es un cambio y ven «Actualizamos los términos»
 * con lo nuevo; una cuenta nueva que nunca aceptó (Google sin la casilla) ve «Antes de seguir».
 */
export const LEGAL_TRACKED_SINCE = '2026-09-29';

/** ¿La cuenta es de antes de guardar la aceptación? `createdAt` en ISO (sin fecha no se sabe: no). */
export const accountBeforeLegal = (createdAt: string | null | undefined): boolean =>
  typeof createdAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(createdAt) && createdAt.slice(0, 10) < LEGAL_TRACKED_SINCE;

/** Lo nuevo de los documentos que le faltan. */
export const legalChangesFor = (docs: readonly LegalDocKey[]): string[] => LEGAL_CHANGES.filter((c) => docs.includes(c.doc)).map((c) => c.text);

/** Lo que queda aceptado después de aceptar lo vigente (para poner al día la copia del perfil). */
export function acceptedNow(a: LegalAccepted | null | undefined): LegalAccepted {
  return { terms: newest(a?.terms ?? null, TERMS_VERSION), privacy: newest(a?.privacy ?? null, PRIVACY_VERSION) };
}

// ---------- Registro con Google ----------

/**
 * Marcó «Acepto…» en «Crear cuenta» y fue a Google: al volver se acepta solo (vale 1 hora, solo esta versión y solo
 * para una cuenta creada después de marcarla). Al salir de la cuenta se olvida (auth.tsx).
 */
const PENDING_KEY = 'mm:acepto-legal';
const PENDING_MS = 60 * 60 * 1000;
/** Margen por si el reloj del teléfono no coincide con el de la base (la hora de la cuenta la pone la base). */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * ¿La cuenta se creó después de marcar la casilla (hora `at` del teléfono, con el margen del reloj)? Así la marca solo
 * vale para la cuenta nueva que vuelve de Google, no para otra que entre después en el mismo teléfono (una que ya
 * existía, o la de Google si esa vez se canceló). Sin fecha no se sabe: no.
 */
export function createdAfterMark(createdAt: string | null | undefined, at: number): boolean {
  const created = typeof createdAt === 'string' ? Date.parse(createdAt) : Number.NaN;
  return Number.isFinite(created) && Number.isFinite(at) && created >= at - CLOCK_SKEW_MS;
}

export function rememberLegalForGoogle(now = Date.now()): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ at: now, ...CURRENT_LEGAL }));
  } catch {
    // Sin almacenamiento: al volver se le pregunta.
  }
}

/** Olvida la casilla marcada (al salir de la cuenta: la marca era de otra persona o de otra vez). */
export function forgetLegalForGoogle(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // sin almacenamiento
  }
}

/**
 * ¿Marcó la casilla antes de ir a Google (hace menos de 1 hora, con estas mismas versiones) y esta cuenta
 * (`createdAt`, profiles.created_at) se creó después? Se usa una sola vez: se borra aunque no valga.
 */
export function takeLegalPending(createdAt: string | null | undefined, now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw == null) return false;
    localStorage.removeItem(PENDING_KEY);
    const v = JSON.parse(raw) as { at?: unknown; terms?: unknown; privacy?: unknown };
    const at = Number(v.at);
    return (
      Number.isFinite(at) &&
      now - at >= 0 &&
      now - at < PENDING_MS &&
      v.terms === TERMS_VERSION &&
      v.privacy === PRIVACY_VERSION &&
      createdAfterMark(createdAt, at)
    );
  } catch {
    return false;
  }
}
