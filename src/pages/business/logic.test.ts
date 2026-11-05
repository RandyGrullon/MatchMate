import { describe, expect, it } from 'vitest';
import type { Business, OwnVenue } from '../../lib/data/business';
import { venueLine, venueMapUrl, venueWhatsappText } from '../../lib/venues/text';
import {
  businessFormFrom,
  businessInputFrom,
  businessProblem,
  businessStatusInfo,
  emptyBusinessForm,
  showStatusNote,
  venueDraftFrom,
  venueInputFrom,
  venueLeaguesText,
} from './logic';

// Datos ficticios.
const BUSINESS: Business = {
  id: 'b1',
  name: 'EMPRESA DE EJEMPLO SRL',
  taxId: null,
  phone: '809-000-0000',
  email: null,
  city: 'Santo Domingo',
  address: 'Calle Ficticia 1',
  description: null,
  status: 'pending',
  statusNote: null,
  commissionPct: 10,
  createdAt: '2026-11-05T12:00:00Z',
  reviewedAt: null,
  venues: [],
};

const VENUE: OwnVenue = {
  id: 'v1',
  businessId: 'b1',
  sport: 'padel',
  name: 'Pádel de Ejemplo',
  city: 'Santiago',
  address: null,
  details: { canchas: 4, paredes: 'cristal', techada: true },
  priceHour: 1500,
  hours: null,
  phone: '809-000-0000',
  featuredUntil: null,
  photos: [],
  business: { id: 'b1', name: 'EMPRESA DE EJEMPLO SRL', description: null, email: null },
  active: false,
  leagues: 0,
  promotion: null,
};

describe('los datos de la empresa (la web y el teléfono)', () => {
  it('pide nombre y ciudad, y revisa teléfono, correo y RNC solo si se llenan', () => {
    const ok = { ...emptyBusinessForm(), name: 'Club de Ejemplo', city: 'Santiago' };
    expect(businessProblem(emptyBusinessForm())).toBe('Escribe el nombre de la empresa.');
    expect(businessProblem({ ...ok, city: ' ' })).toBe('Escribe la ciudad.');
    expect(businessProblem(ok)).toBeNull();
    expect(businessProblem({ ...ok, phone: '12' })).toMatch(/teléfono/);
    expect(businessProblem({ ...ok, email: 'usuario@' })).toBe('Revisa el correo.');
    expect(businessProblem({ ...ok, taxId: '1234' })).toMatch(/RNC/);
    expect(businessProblem({ ...ok, taxId: '123456789', phone: '809-000-0000', email: 'usuario@ejemplo.test' })).toBeNull();
  });

  it('lo vacío se manda como null y lo guardado vuelve al formulario', () => {
    expect(businessInputFrom({ ...emptyBusinessForm(), name: ' Club ', city: 'Santiago ', phone: ' ' })).toEqual({
      name: 'Club',
      city: 'Santiago',
      phone: null,
      email: null,
      taxId: null,
      address: null,
      description: null,
    });
    expect(businessFormFrom(BUSINESS)).toMatchObject({ name: 'EMPRESA DE EJEMPLO SRL', phone: '809-000-0000', email: '', address: 'Calle Ficticia 1' });
  });

  it('la revisión: color, texto y el motivo solo si la rechazaron o suspendieron', () => {
    expect(businessStatusInfo('approved').tone).toBe('ok');
    expect(businessStatusInfo('pending').tone).toBe('warn');
    expect(businessStatusInfo('rejected')).toEqual({ tone: 'danger', text: 'Corrige tus datos y la volvemos a revisar.' });
    expect(showStatusNote({ status: 'rejected', statusNote: 'Falta algo' })).toBe(true);
    expect(showStatusNote({ status: 'pending', statusNote: 'Falta algo' })).toBe(false);
    expect(showStatusNote({ status: 'suspended', statusNote: null })).toBe(false);
  });
});

describe('un espacio mientras se llena', () => {
  it('uno nuevo sale de pádel con la ciudad y la dirección de la empresa', () => {
    expect(venueDraftFrom(null, BUSINESS)).toEqual({
      sport: 'padel',
      name: '',
      city: 'Santo Domingo',
      address: 'Calle Ficticia 1',
      details: {},
      priceHour: '',
      hours: '',
      phone: '',
      active: true,
    });
  });

  it('uno guardado: los números como texto, sin dirección la de la empresa y el teléfono vacío si es el de la empresa', () => {
    expect(venueDraftFrom(VENUE, BUSINESS)).toMatchObject({ city: 'Santiago', address: 'Calle Ficticia 1', details: { canchas: '4', paredes: 'cristal', techada: true }, priceHour: '1500', phone: '', active: false });
    expect(venueDraftFrom({ ...VENUE, phone: '809-000-0001' }, BUSINESS).phone).toBe('809-000-0001');
  });

  it('lo que se guarda, o lo que falta', () => {
    const draft = { ...venueDraftFrom(null, BUSINESS), name: 'Pádel de Ejemplo', details: { canchas: '3', techada: true }, priceHour: '1,200' };
    expect(venueInputFrom(draft, null)).toEqual({
      ok: true,
      input: { id: null, sport: 'padel', name: 'Pádel de Ejemplo', city: 'Santo Domingo', address: 'Calle Ficticia 1', details: { canchas: 3, techada: true }, priceHour: 1200, hours: null, phone: null, active: true },
    });
    expect(venueInputFrom({ ...draft, details: {} }, 'v1')).toEqual({ ok: false, message: 'Falta: canchas.' });
    expect(venueInputFrom({ ...draft, name: 'P' }, null)).toEqual({ ok: false, message: 'Escribe el nombre del espacio.' });
    expect(venueInputFrom({ ...draft, city: '' }, null)).toEqual({ ok: false, message: 'Escribe la ciudad.' });
    expect(venueInputFrom({ ...draft, priceHour: ' ' }, 'v1')).toMatchObject({ ok: true, input: { id: 'v1', priceHour: null } });
  });

  it('los torneos que se juegan ahí', () => {
    expect(venueLeaguesText(0)).toMatch(/^Enlaza/);
    expect(venueLeaguesText(1)).toBe('1 torneo o liga se juega aquí.');
    expect(venueLeaguesText(3)).toBe('3 torneos o ligas se juegan aquí.');
  });
});

describe('un espacio en palabras', () => {
  it('la línea de la tarjeta, el mapa y el texto de WhatsApp', () => {
    expect(venueLine(VENUE)).toBe('Pádel · 4 canchas · Cristal · Techada');
    expect(venueLine(VENUE, 1)).toBe('Pádel · 4 canchas');
    expect(venueMapUrl(VENUE)).toBe('https://www.google.com/maps/search/?api=1&query=P%C3%A1del%20de%20Ejemplo%2C%20Santiago');
    expect(venueWhatsappText(VENUE)).toBe('Hola, vi Pádel de Ejemplo en MatchMate.');
  });
});
