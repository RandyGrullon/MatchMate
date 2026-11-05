import { useMemo } from 'react';
import { BackendError } from '../backend/types';
import { uuidv7 } from '../db/ids';
import { asBackendError } from '../db/errors';
import { compressShowcase, MAX_SHOWCASE_BYTES, type ShowcasePhoto } from '../image';
import { primePublicUrl, publicUrl, VENUE_BUCKET } from '../publicImages';
import type { AccountMode } from '../auth';
import { backend, getUserId, invalidate, queryClient, remember, rpc, type Live } from './client';
import { keys as appKeys } from './keys';

/**
 * Empresas (20261105000100_empresas.sql, docs/empresas.md): la empresa de la cuenta con sus espacios deportivos
 * (canchas, boleras, piscinas…), sus fotos, pedir destacar un espacio, el modo de la app (jugador o empresa), «Dónde
 * jugar» (lo público) y la consola del superadmin. Todo por RPC (las tablas no se leen directo).
 */

// ---------- Tipos ----------

export type BusinessStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type PromotionStatus = 'requested' | 'active' | 'rejected' | 'cancelled';

export interface VenuePhoto {
  id: string;
  /** Ruta en el bucket 'venues'. */
  path: string;
  width: number | null;
  height: number | null;
}

export interface VenuePromotion {
  id: string;
  status: PromotionStatus;
  days: number;
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  createdAt: string;
}

/** Un espacio como sale en «Dónde jugar» y en su ficha. */
export interface Venue {
  id: string;
  businessId: string;
  sport: string;
  name: string;
  city: string;
  address: string | null;
  details: Record<string, number | string | boolean>;
  /** Pesos por hora. */
  priceHour: number | null;
  hours: string | null;
  /** El del espacio o, si no tiene, el de la empresa. */
  phone: string | null;
  /** Hasta cuándo sale destacado (null = no lo está). */
  featuredUntil: string | null;
  /** La primera es la portada. */
  photos: VenuePhoto[];
  business: { id: string; name: string; description: string | null; email: string | null };
}

/** Lo que ve la empresa (y el superadmin) de su espacio. */
export interface OwnVenue extends Venue {
  active: boolean;
  /** Torneos y ligas que se juegan ahí. */
  leagues: number;
  /** La pedida, si no la activa, si no la última. */
  promotion: VenuePromotion | null;
}

export interface VenueDetail extends Venue {
  /** Es de la empresa de la cuenta (o mira el superadmin). */
  mine: boolean;
  leagues: { id: string; name: string; kind: 'liga' | 'torneo'; sport: string }[];
}

export interface Business {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  city: string;
  address: string | null;
  description: string | null;
  status: BusinessStatus;
  /** Por qué se rechazó o se suspendió. */
  statusNote: string | null;
  commissionPct: number;
  createdAt: string;
  reviewedAt: string | null;
  venues: OwnVenue[];
}

export interface BusinessInput {
  name: string;
  city: string;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  address?: string | null;
  description?: string | null;
}

export interface VenueInput {
  /** null = espacio nuevo. */
  id: string | null;
  sport: string;
  name: string;
  city: string;
  details: Record<string, number | string | boolean>;
  address?: string | null;
  priceHour?: number | null;
  hours?: string | null;
  phone?: string | null;
  active?: boolean;
}

// ---------- Límites (los mismos de la base) ----------

export const BUSINESS_NAME_MAX = 80;
export const BUSINESS_CITY_MAX = 60;
export const BUSINESS_ADDRESS_MAX = 160;
export const BUSINESS_DESCRIPTION_MAX = 500;
export const VENUE_HOURS_MAX = 120;
export const VENUES_MAX = 30;
export const VENUE_PHOTOS_MAX = 8;
export const PROMOTION_DAYS = [7, 15, 30] as const;

export const BUSINESS_STATUS_LABEL: Record<BusinessStatus, string> = {
  pending: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  suspended: 'Suspendida',
};

export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = {
  requested: 'Pedida',
  active: 'Activa',
  rejected: 'Rechazada',
  cancelled: 'Terminada',
};

// ---------- Claves y etiquetas ----------

export const businessTags = {
  all: 'business',
  mine: 'business:mine',
  venues: 'business:venues',
  venue: (id: string) => `business:venue:${id}`,
  admin: 'business:admin',
  prices: 'business:prices',
};

const keys = {
  mine: (uid: string) => `business:mine:${uid}`,
  search: (sport: string | null, city: string, q: string, limit: number) => `business:venues:${sport ?? '*'}:${city}:${q}:${limit}`,
  venue: (id: string) => `business:venue:${id}`,
  adminList: (status: string | null, q: string, page: number) => `business:admin:list:${status ?? '*'}:${q}:${page}`,
  admin: (id: string) => `business:admin:${id}`,
  prices: 'business:prices',
  payments: (status: string | null, page: number) => `business:admin:payments:${status ?? '*'}:${page}`,
};

function afterChange(venueId?: string | null) {
  invalidate(businessTags.mine, businessTags.venues, businessTags.admin, ...(venueId ? [businessTags.venue(venueId)] : []));
}

// ---------- La empresa ----------

/** La empresa de la cuenta con sus espacios (null si no tiene, o sin sesión). */
export function useMyBusiness(): Live<Business | null> {
  const uid = getUserId();
  const key = uid ? keys.mine(uid) : null;
  if (key) remember(key, { kind: 'business' });
  const st = queryClient.useQuery<Business | null>(key, () => rpc<Business | null>('my_business'), {
    initial: null,
    tags: [businessTags.all, businessTags.mine],
    staleMs: 30_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

const businessArgs = (b: BusinessInput) => ({
  p_name: b.name,
  p_city: b.city,
  p_phone: b.phone ?? null,
  p_email: b.email ?? null,
  p_tax_id: b.taxId ?? null,
  p_address: b.address ?? null,
  p_description: b.description ?? null,
});

/** Pone al día el modo en el perfil guardado (sin volver a leerlo). */
function patchMode(mode: AccountMode | null) {
  const uid = getUserId();
  if (!uid) return;
  const key = appKeys.profile(uid);
  const cached = queryClient.getQueryData<{ accountMode?: AccountMode | null } | null>(key);
  if (cached) queryClient.setQueryData(key, { ...cached, accountMode: mode });
}

/** Registra la empresa (queda en revisión) y pone la app en modo empresa. Devuelve su id. */
export async function registerBusiness(input: BusinessInput): Promise<string> {
  const id = await rpc<string>('register_business', businessArgs(input));
  patchMode('business');
  afterChange();
  return id;
}

export async function updateBusiness(input: BusinessInput): Promise<Business> {
  const saved = await rpc<Business>('update_business', businessArgs(input));
  afterChange();
  return saved;
}

/** Borra la empresa con sus espacios y fotos; la app vuelve a modo jugador. */
export async function deleteBusiness(): Promise<void> {
  await rpc<boolean>('delete_business');
  patchMode(null);
  afterChange();
}

/** Jugador o empresa (hay que tener una). Se ve al momento. */
export async function setAccountMode(mode: AccountMode): Promise<AccountMode | null> {
  const saved = await rpc<AccountMode | null>('set_account_mode', { p_mode: mode });
  patchMode(saved);
  return saved;
}

// ---------- Espacios ----------

export async function saveVenue(input: VenueInput): Promise<OwnVenue> {
  const saved = await rpc<OwnVenue>('save_venue', {
    p_id: input.id,
    p_sport: input.sport,
    p_name: input.name,
    p_city: input.city,
    p_details: input.details,
    p_address: input.address ?? null,
    p_price_hour: input.priceHour ?? null,
    p_hours: input.hours ?? null,
    p_phone: input.phone ?? null,
    p_active: input.active ?? true,
  });
  afterChange(saved.id);
  return saved;
}

export async function deleteVenue(id: string): Promise<void> {
  await rpc<boolean>('delete_venue', { p_venue: id });
  afterChange(id);
}

/** La foto lista para subir (más grande y nítida que la del marcador). */
export const prepareVenuePhoto = (file: Blob): Promise<ShowcasePhoto> => compressShowcase(file);

/**
 * Sube una foto del espacio y la enlaza (al final; la primera es la portada). Si la base no la acepta (más de 8, por
 * ejemplo), el archivo se borra. Devuelve las fotos como quedaron. Necesita señal.
 */
export async function uploadVenuePhoto(venueId: string, file: Blob | ShowcasePhoto): Promise<VenuePhoto[]> {
  const me = getUserId();
  if (!me) throw new BackendError('Entra a tu cuenta.', 'auth', 'session_not_found');
  const img = 'blob' in file && 'width' in file ? file : await prepareVenuePhoto(file);
  if (!img.blob.size || img.blob.size > MAX_SHOWCASE_BYTES) throw new BackendError('La foto es muy grande.', 'validation', 'imagen');
  const id = uuidv7();
  const path = `${me}/${id}.${img.contentType === 'image/jpeg' ? 'jpg' : 'webp'}`;
  await backend().storage.upload(VENUE_BUCKET, path, img.blob, img.contentType);
  let photos: VenuePhoto[];
  try {
    photos = await rpc<VenuePhoto[]>('add_venue_photo', { p_venue: venueId, p_photo: id, p_path: path, p_width: img.width, p_height: img.height });
  } catch (e) {
    try {
      await backend().storage.remove(VENUE_BUCKET, [path]);
    } catch {
      // queda huérfana: no se enlazó a nada
    }
    throw e;
  }
  const url = await publicUrl(VENUE_BUCKET, path);
  if (url) primePublicUrl(VENUE_BUCKET, path, url);
  afterChange(venueId);
  return photos;
}

export async function deleteVenuePhoto(venueId: string, photoId: string): Promise<VenuePhoto[]> {
  const photos = await rpc<VenuePhoto[]>('delete_venue_photo', { p_photo: photoId });
  afterChange(venueId);
  return photos;
}

export async function setVenueCover(venueId: string, photoId: string): Promise<VenuePhoto[]> {
  const photos = await rpc<VenuePhoto[]>('set_venue_cover', { p_photo: photoId });
  afterChange(venueId);
  return photos;
}

/** Pide destacar el espacio por tantos días (lo activa el superadmin). */
export async function requestPromotion(venueId: string, days: number, note?: string | null): Promise<OwnVenue> {
  const saved = await rpc<OwnVenue>('request_promotion', { p_venue: venueId, p_days: days, p_note: note ?? null });
  afterChange(venueId);
  return saved;
}

export async function cancelPromotion(venueId: string, promotionId: string): Promise<void> {
  await rpc<boolean>('cancel_promotion', { p_promotion: promotionId });
  afterChange(venueId);
}

// ---------- Pagar con Azul (20261105000200_pagos_azul.sql, supabase/functions/azul-pay) ----------

/** Lo que cuesta destacar por tantos días (RD$, ITBIS incluido). Sin precios, se pide y se cobra aparte. */
export interface PromotionPrice {
  days: number;
  amount: number;
}

export function usePromotionPrices(): Live<PromotionPrice[]> {
  const uid = getUserId();
  const key = uid ? keys.prices : null;
  const st = queryClient.useQuery<PromotionPrice[]>(key, () => rpc<PromotionPrice[]>('promotion_prices'), {
    initial: [],
    tags: [businessTags.all, businessTags.prices],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** El formulario que el navegador manda a la Página de Pagos de Azul (lo firma la Edge Function azul-pay). */
export interface AzulForm {
  url: string;
  fields: Record<string, string>;
  orderNumber: number;
  amount: number;
}

/** Empieza el pago: la base pone el precio y deja el pago pendiente; azul-pay firma el formulario. */
export async function startPromotionPayment(venueId: string, days: number): Promise<AzulForm> {
  const form = await backend().invoke<AzulForm>('azul-pay', { action: 'start', venueId, days });
  afterChange(venueId);
  return form;
}

/**
 * Lleva el navegador a Azul con un formulario (Azul lo pide así: POST desde el navegador de la persona). Una ruta de
 * la app (el simulador del modo local, /dev/azul) va por GET.
 */
export function sendToAzul(form: Pick<AzulForm, 'url' | 'fields'>, doc: Document = document): void {
  const f = doc.createElement('form');
  f.method = form.url.startsWith('/') ? 'get' : 'post';
  f.action = form.url;
  f.style.display = 'none';
  for (const [name, value] of Object.entries(form.fields)) {
    const input = doc.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    f.appendChild(input);
  }
  doc.body.appendChild(f);
  f.submit();
}

export type PaymentStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'error';

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Sin terminar',
  approved: 'Aprobado',
  declined: 'Declinado',
  cancelled: 'Cancelado',
  error: 'Con error',
};

/** Lo que dijo azul-pay al volver de Azul. */
export interface PaymentResult {
  status: PaymentStatus;
  orderNumber: number;
  venueId: string | null;
  endsAt: string | null;
  days: number | null;
  amount: number;
}

/** La vuelta de Azul (lo que trae el query string): azul-pay revisa la firma y la base activa la promoción. */
export async function verifyPromotionPayment(params: Record<string, string>): Promise<PaymentResult> {
  const result = await backend().invoke<PaymentResult>('azul-pay', { action: 'verify', params });
  afterChange(result.venueId);
  return result;
}

/** Volvió de Azul con «Cancelar»: el pago pendiente queda cancelado (la promoción sigue pedida). */
export async function cancelPromotionPayment(orderNumber: number): Promise<boolean> {
  const done = await rpc<boolean>('cancel_payment', { p_order: orderNumber });
  afterChange();
  return done;
}

export type PaymentReturn = { kind: 'response'; params: Record<string, string> } | { kind: 'cancelled'; orderNumber: number };

/** Lo que vino de Azul en la URL de vuelta: la respuesta (con AuthHash), el «Cancelar» o nada (null). */
export function paymentReturn(search: string): PaymentReturn | null {
  const q = new URLSearchParams(search);
  const cancelled = q.get('cancelado');
  if (cancelled !== null) return /^\d{1,18}$/.test(cancelled) ? { kind: 'cancelled', orderNumber: Number(cancelled) } : null;
  if (!q.get('AuthHash') || !q.get('OrderNumber')) return null;
  const params: Record<string, string> = {};
  for (const [k, v] of q) params[k] = v;
  return { kind: 'response', params };
}

/** Los códigos de azul-pay (PAY_MESSAGES en supabase/functions/azul-pay/core.ts): su mensaje ya viene para mostrar. */
const PAY_CODES = new Set(['invalido', 'sesion', 'no_permitido', 'firma', 'no_existe', 'rate_limited', 'config', 'servidor']);
const PAY_NOT_READY = 'El pago con Azul no está listo todavía. Pide la promoción y te escribimos.';

/**
 * El error de pagar, en palabras sencillas: azul-pay manda `{code, message}` con el mensaje en español (sin importar
 * su core aquí: la app del teléfono comparte este archivo y Metro no ve supabase/functions/azul-pay).
 */
export function paymentErrorText(e: unknown): string {
  const be = asBackendError(e);
  // Un código crudo de la base ('invalido') no es un mensaje: ese va por businessErrorText.
  if (be?.code && PAY_CODES.has(be.code) && be.message && !/^[a-z_]+$/.test(be.message)) return be.message;
  // La función no está publicada todavía.
  if (be?.kind === 'not_found') return PAY_NOT_READY;
  return businessErrorText(e, 'No se pudo empezar el pago. Inténtalo otra vez.');
}

/** El torneo o la liga se juega en un espacio de la empresa (null = ya no). */
export async function setLeagueVenue(lid: string, venueId: string | null): Promise<void> {
  await rpc<boolean>('set_league_venue', { p_league: lid, p_venue: venueId });
  afterChange(venueId);
}

// ---------- Dónde jugar (también sin cuenta) ----------

export interface VenueSearch {
  sport?: string | null;
  city?: string;
  query?: string;
  limit?: number;
}

/** Espacios de empresas aprobadas, destacados primero. */
export function useVenueSearch(q: VenueSearch): Live<Venue[]> & { total: number } {
  const sport = q.sport || null;
  const city = (q.city ?? '').trim().toLowerCase();
  const text = (q.query ?? '').trim().toLowerCase();
  const limit = Math.min(60, Math.max(1, q.limit ?? 30));
  const key = keys.search(sport, city, text, limit);
  remember(key, { kind: 'venueSearch' });
  const st = queryClient.useQuery<{ rows: Venue[]; total: number }>(
    key,
    () => rpc<{ rows: Venue[]; total: number }>('search_venues', { p_sport: sport, p_city: city || null, p_search: text || null, p_limit: limit }),
    { initial: { rows: [], total: 0 }, tags: [businessTags.all, businessTags.venues], staleMs: 60_000 },
  );
  return useMemo(() => ({ data: st.data.rows, total: st.data.total, loading: st.loading, error: st.error }), [st]);
}

/** La ficha de un espacio (null si no existe o no es público). */
export function useVenue(id: string | null | undefined): Live<VenueDetail | null> {
  const key = id ? keys.venue(id) : null;
  if (key) remember(key, { kind: 'venue', id: id! });
  const st = queryClient.useQuery<VenueDetail | null>(key, () => rpc<VenueDetail | null>('venue_detail', { p_venue: id }), {
    initial: null,
    tags: id ? [businessTags.all, businessTags.venue(id)] : [],
    staleMs: 60_000,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

/** El link de WhatsApp para escribirle (República Dominicana: 10 dígitos sin el 1 se le pone). */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  const full = digits.length === 10 ? `1${digits}` : digits;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** «RD$1,500 la hora». */
export const priceText = (n: number | null | undefined): string | null =>
  n === null || n === undefined ? null : `RD$${n.toLocaleString('es-DO', { maximumFractionDigits: 0 })} la hora`;

/** Destacado ahora (la base lo dice con featuredUntil; esto evita mostrarlo si venció mientras estaba abierta). */
export const isFeatured = (v: Pick<Venue, 'featuredUntil'>, now = Date.now()): boolean => !!v.featuredUntil && Date.parse(v.featuredUntil) > now;

// ---------- La consola (superadmin) ----------

export interface AdminBusinessRow {
  id: string;
  name: string;
  city: string;
  status: BusinessStatus;
  createdAt: string;
  owner: { id: string; name: string | null; email: string | null };
  venues: number;
  featured: number;
  /** Promociones pedidas sin decidir. */
  requests: number;
}

export interface AdminBusinessList {
  rows: AdminBusinessRow[];
  total: number;
  counts: Record<BusinessStatus | 'requests', number>;
}

export interface AdminPromotion extends VenuePromotion {
  venueId: string;
  venueName: string;
  amount: number | null;
  decidedAt: string | null;
}

export interface AdminPayment {
  id: string;
  orderNumber: number;
  amount: number;
  status: PaymentStatus;
  authorizationCode: string | null;
  responseMessage: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AdminPaymentRow extends AdminPayment {
  businessId: string | null;
  businessName: string;
}

export interface AdminPaymentList {
  rows: AdminPaymentRow[];
  total: number;
  /** Lo cobrado con Azul (aprobados). */
  approvedTotal: number;
}

export interface AdminBusiness extends Business {
  owner: { id: string; name: string | null; email: string | null; blocked: boolean };
  promotions: AdminPromotion[];
  leagues: { id: string; name: string; kind: 'liga' | 'torneo'; sport: string; venueId: string; createdAt: string }[];
  /** Los pagos con Azul (los más nuevos primero). */
  payments?: AdminPayment[];
  /** Lo pagado en promociones (con Azul o anotado). */
  paid: number;
}

export const ADMIN_BUSINESS_PAGE = 50;

const EMPTY_LIST: AdminBusinessList = { rows: [], total: 0, counts: { pending: 0, approved: 0, rejected: 0, suspended: 0, requests: 0 } };

export function useAdminBusinesses(status: BusinessStatus | null, query: string, page = 0): Live<AdminBusinessList> {
  const q = query.trim();
  const key = keys.adminList(status, q, page);
  remember(key, { kind: 'adminBusinesses' });
  const st = queryClient.useQuery<AdminBusinessList>(
    key,
    () => rpc<AdminBusinessList>('admin_businesses', { p_status: status, p_search: q || null, p_limit: ADMIN_BUSINESS_PAGE, p_offset: page * ADMIN_BUSINESS_PAGE }),
    { initial: EMPTY_LIST, tags: [businessTags.all, businessTags.admin], persist: false },
  );
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

export function useAdminBusiness(id: string | null): Live<AdminBusiness | null> {
  const key = id ? keys.admin(id) : null;
  if (key) remember(key, { kind: 'adminBusiness', id: id! });
  const st = queryClient.useQuery<AdminBusiness | null>(key, () => rpc<AdminBusiness | null>('admin_business', { p_business: id }), {
    initial: null,
    tags: [businessTags.all, businessTags.admin],
    persist: false,
  });
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

export async function adminSetBusinessStatus(id: string, status: BusinessStatus, note?: string | null): Promise<void> {
  await rpc('admin_set_business_status', { p_business: id, p_status: status, p_note: note ?? null });
  afterChange();
}

export async function adminSetCommission(id: string, pct: number): Promise<void> {
  await rpc('admin_set_commission', { p_business: id, p_pct: pct });
  afterChange();
}

export async function adminDecidePromotion(id: string, approve: boolean, opts: { days?: number; amount?: number; note?: string | null } = {}): Promise<void> {
  await rpc('admin_decide_promotion', { p_promotion: id, p_approve: approve, p_days: opts.days ?? null, p_amount: opts.amount ?? null, p_note: opts.note ?? null });
  afterChange();
}

export async function adminGrantPromotion(venueId: string, days: number, amount: number, note?: string | null): Promise<void> {
  await rpc('admin_grant_promotion', { p_venue: venueId, p_days: days, p_amount: amount, p_note: note ?? null });
  afterChange(venueId);
}

export async function adminEndPromotion(id: string): Promise<void> {
  await rpc('admin_end_promotion', { p_promotion: id });
  afterChange();
}

/** Pone (o quita, con null) el precio de destacar por tantos días. */
export async function adminSetPromotionPrice(days: number, amount: number | null): Promise<PromotionPrice[]> {
  const prices = await rpc<PromotionPrice[]>('admin_set_promotion_price', { p_days: days, p_amount: amount });
  invalidate(businessTags.prices);
  return prices;
}

export const ADMIN_PAYMENTS_PAGE = 50;

/** Los pagos con Azul (`enabled` false: no lee nada, p. ej. con el panel cerrado). */
export function useAdminPayments(status: PaymentStatus | null, page = 0, enabled = true): Live<AdminPaymentList> {
  const key = enabled ? keys.payments(status, page) : null;
  const st = queryClient.useQuery<AdminPaymentList>(
    key,
    () => rpc<AdminPaymentList>('admin_payments', { p_status: status, p_limit: ADMIN_PAYMENTS_PAGE, p_offset: page * ADMIN_PAYMENTS_PAGE }),
    { initial: { rows: [], total: 0, approvedTotal: 0 }, tags: [businessTags.all, businessTags.admin], persist: false },
  );
  return useMemo(() => ({ data: st.data, loading: st.loading, error: st.error }), [st]);
}

// ---------- Errores ----------

/** Lo que pasó, en palabras sencillas. */
export function businessErrorText(e: unknown, fallback = 'No se pudo guardar. Inténtalo otra vez.'): string {
  const be = asBackendError(e);
  if (!be) return fallback;
  if (be.code === 'duplicado') return 'Ya tienes una empresa registrada (o algo pedido que espera respuesta).';
  if (be.code === 'limite') return 'Llegaste al tope (30 espacios por empresa y 8 fotos por espacio).';
  if (be.code === 'imagen') return be.message;
  if (be.kind === 'permission') return 'No puedes hacer eso. Si tu empresa está suspendida o en revisión, espera la respuesta.';
  if (be.code === 'no_existe') return 'Eso ya no existe. Vuelve a cargar la página.';
  if (be.kind === 'validation') return 'Revisa lo que llenaste: falta algo o hay un dato que no se entiende.';
  if (be.kind === 'network') return 'Sin conexión. Inténtalo cuando vuelva la señal.';
  return fallback;
}
