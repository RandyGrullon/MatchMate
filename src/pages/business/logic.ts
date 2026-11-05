import type { Business, BusinessInput, BusinessStatus, OwnVenue, VenueInput } from '../../lib/data/business';
import { cleanVenueDetails } from '../../lib/venues/fields';
import type { SportId } from '../../sports/types';

/**
 * Lo que no es pantalla de Mi empresa (BusinessPage, BusinessForm y VenueSheet de la web, y movil/src/app/empresa.tsx
 * del teléfono): los datos de la empresa como se llenan, el espacio mientras se cambia y lo que dice la revisión.
 * Sin React, para que la web y el teléfono hagan lo mismo.
 */

// ---------- Los datos de la empresa ----------

/** Lo que se llena de la empresa (registrarla y cambiar sus datos). */
export interface BusinessFormValue {
  name: string;
  city: string;
  phone: string;
  email: string;
  taxId: string;
  address: string;
  description: string;
}

export const emptyBusinessForm = (): BusinessFormValue => ({ name: '', city: '', phone: '', email: '', taxId: '', address: '', description: '' });

export const businessFormFrom = (b: Business): BusinessFormValue => ({
  name: b.name,
  city: b.city,
  phone: b.phone ?? '',
  email: b.email ?? '',
  taxId: b.taxId ?? '',
  address: b.address ?? '',
  description: b.description ?? '',
});

export const businessInputFrom = (f: BusinessFormValue): BusinessInput => ({
  name: f.name.trim(),
  city: f.city.trim(),
  phone: f.phone.trim() || null,
  email: f.email.trim() || null,
  taxId: f.taxId.trim() || null,
  address: f.address.trim() || null,
  description: f.description.trim() || null,
});

/** Qué falta para poder guardar (null = listo). Lo demás lo revisa la base. */
export function businessProblem(f: BusinessFormValue): string | null {
  if (f.name.trim().length < 2) return 'Escribe el nombre de la empresa.';
  if (f.city.trim().length < 2) return 'Escribe la ciudad.';
  const digits = f.phone.replace(/\D/g, '');
  if (f.phone.trim() && (digits.length < 7 || digits.length > 15)) return 'Revisa el teléfono (de 7 a 15 números).';
  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return 'Revisa el correo.';
  const tax = f.taxId.replace(/\D/g, '');
  if (f.taxId.trim() && tax.length !== 9 && tax.length !== 11) return 'El RNC lleva 9 números (o la cédula, 11).';
  return null;
}

// ---------- La revisión ----------

export type StatusTone = 'ok' | 'warn' | 'danger';

/** El color y lo que le toca hacer a la empresa según cómo va la revisión. */
export function businessStatusInfo(s: BusinessStatus): { tone: StatusTone; text: string } {
  if (s === 'approved') return { tone: 'ok', text: 'Tus espacios activos salen en «Dónde jugar».' };
  if (s === 'pending') return { tone: 'warn', text: 'La estamos revisando. Mientras, agrega tus espacios y sus fotos: salen en cuanto la aprobemos.' };
  if (s === 'rejected') return { tone: 'danger', text: 'Corrige tus datos y la volvemos a revisar.' };
  return { tone: 'danger', text: 'Tus espacios no salen en la app mientras esté suspendida.' };
}

/** El motivo se le muestra si la rechazaron o la suspendieron. */
export const showStatusNote = (b: Pick<Business, 'status' | 'statusNote'>): boolean => !!b.statusNote && (b.status === 'rejected' || b.status === 'suspended');

// ---------- Un espacio mientras se llena ----------

/** El espacio como está en el formulario (los números como texto, tal cual se escriben). */
export interface VenueDraft {
  sport: SportId;
  name: string;
  city: string;
  address: string;
  details: Record<string, string | boolean>;
  priceHour: string;
  hours: string;
  phone: string;
  active: boolean;
}

/** El formulario de un espacio: el guardado o uno nuevo (pádel, con la ciudad y la dirección de la empresa). */
export const venueDraftFrom = (v: OwnVenue | null, business: Business): VenueDraft => ({
  sport: (v?.sport as SportId) ?? 'padel',
  name: v?.name ?? '',
  city: v?.city ?? business.city,
  address: v?.address ?? business.address ?? '',
  details: Object.fromEntries(Object.entries(v?.details ?? {}).map(([k, x]) => [k, typeof x === 'boolean' ? x : String(x)])),
  priceHour: v?.priceHour === null || v?.priceHour === undefined ? '' : String(v.priceHour),
  hours: v?.hours ?? '',
  phone: v && v.phone !== business.phone ? (v.phone ?? '') : '',
  active: v?.active ?? true,
});

/** Solo los números (el precio y los conteos se escriben sin puntos ni letras). */
export const digitsOnly = (s: string): string => s.replace(/[^\d]/g, '');

/** Lo que se manda a guardar, o qué falta (lo que pide el deporte, el nombre o la ciudad). */
export function venueInputFrom(draft: VenueDraft, id: string | null): { ok: true; input: VenueInput } | { ok: false; message: string } {
  const cleaned = cleanVenueDetails(draft.sport, draft.details);
  if (!cleaned.ok) return { ok: false, message: cleaned.message };
  if (draft.name.trim().length < 2) return { ok: false, message: 'Escribe el nombre del espacio.' };
  if (draft.city.trim().length < 2) return { ok: false, message: 'Escribe la ciudad.' };
  const price = draft.priceHour.trim() ? Number(digitsOnly(draft.priceHour)) : null;
  return {
    ok: true,
    input: {
      id,
      sport: draft.sport,
      name: draft.name.trim(),
      city: draft.city.trim(),
      address: draft.address.trim() || null,
      details: cleaned.details,
      priceHour: price,
      hours: draft.hours.trim() || null,
      phone: draft.phone.trim() || null,
      active: draft.active,
    },
  };
}

/** «2 torneos o ligas se juegan aquí», o la invitación a enlazar uno. */
export const venueLeaguesText = (n: number): string =>
  n ? `${n} ${n === 1 ? 'torneo o liga se juega' : 'torneos o ligas se juegan'} aquí.` : 'Enlaza los torneos que organizas aquí: salen en la ficha del espacio.';
