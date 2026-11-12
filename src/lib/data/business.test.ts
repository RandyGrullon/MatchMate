import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackendError, setBackendForTests } from '../backend';
import { PAY_MESSAGES } from '../../../supabase/functions/azul-pay/core';
import { createFakeBackend, type FakeBackend } from '../db/fakeBackend';
import {
  businessErrorText,
  isFeatured,
  paymentErrorText,
  paymentReturn,
  priceText,
  sendToAzul,
  startPromotionPayment,
  uploadVenuePhoto,
  verifyPromotionPayment,
  whatsappLink,
} from './business';
import { setDataUser } from './client';

const ME = '01900000-0000-7000-8000-0000000000aa';
const VENUE = '01900000-0000-7000-8000-0000000000bb';

let fake: FakeBackend;
let uploaded: string[];
let removed: string[];
beforeEach(async () => {
  fake = createFakeBackend();
  uploaded = [];
  removed = [];
  Object.assign(fake.storage, {
    upload: async (_bucket: string, path: string) => {
      uploaded.push(path);
    },
    remove: async (_bucket: string, paths: string[]) => {
      removed.push(...paths);
    },
    publicUrl: async (_bucket: string, path: string) => `https://fotos.example/${path}`,
  });
  setBackendForTests(fake);
  await setDataUser(ME);
});
afterEach(async () => {
  await setDataUser(null);
  setBackendForTests(null);
});

const photo = { blob: new Blob([new Uint8Array(1000)], { type: 'image/webp' }), contentType: 'image/webp' as const, width: 1600, height: 900 };

describe('fotos de un espacio', () => {
  it('sube a <mi cuenta>/<id>.webp y la enlaza con su tamaño', async () => {
    fake.onRpc = (fn, args) => (fn === 'add_venue_photo' ? [{ id: args.p_photo, path: args.p_path, width: 1600, height: 900 }] : null);
    const photos = await uploadVenuePhoto(VENUE, photo);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatch(new RegExp(`^${ME}/[0-9a-f-]{36}\\.webp$`));
    const args = fake.calls.find((c) => c.fn === 'add_venue_photo')!.args;
    expect(args).toEqual({ p_venue: VENUE, p_photo: uploaded[0].slice(ME.length + 1, -5), p_path: uploaded[0], p_width: 1600, p_height: 900 });
    expect(photos).toEqual([{ id: args.p_photo, path: uploaded[0], width: 1600, height: 900 }]);
    expect(removed).toEqual([]);
  });

  it('si la base no la acepta (tope de 8), el archivo se borra y sale el error', async () => {
    fake.onRpc = () => {
      throw new BackendError('limite', 'validation', 'limite');
    };
    await expect(uploadVenuePhoto(VENUE, photo)).rejects.toMatchObject({ code: 'limite' });
    expect(removed).toEqual(uploaded);
  });

  it('una foto vacía o muy grande no se sube', async () => {
    await expect(uploadVenuePhoto(VENUE, { ...photo, blob: new Blob([]) })).rejects.toMatchObject({ code: 'imagen' });
    await expect(uploadVenuePhoto(VENUE, { ...photo, blob: new Blob([new Uint8Array(500_000)]) })).rejects.toMatchObject({ code: 'imagen' });
    expect(uploaded).toEqual([]);
  });
});

describe('textos', () => {
  it('WhatsApp: 10 dígitos de aquí llevan el 1; muy corto, nada', () => {
    expect(whatsappLink('809-555-0000')).toBe('https://wa.me/18095550000');
    expect(whatsappLink('+18095550000', 'Hola, ¿hay cancha?')).toBe('https://wa.me/18095550000?text=Hola%2C%20%C2%BFhay%20cancha%3F');
    expect(whatsappLink('555')).toBeNull();
    expect(whatsappLink(null)).toBeNull();
  });

  it('precio por hora y destacado', () => {
    expect(priceText(1500)).toBe('RD$1,500 la hora');
    expect(priceText(0)).toBe('RD$0 la hora');
    expect(priceText(null)).toBeNull();
    const now = Date.parse('2026-11-05T12:00:00Z');
    expect(isFeatured({ featuredUntil: '2026-11-06T00:00:00Z' }, now)).toBe(true);
    expect(isFeatured({ featuredUntil: '2026-11-05T11:00:00Z' }, now)).toBe(false);
    expect(isFeatured({ featuredUntil: null }, now)).toBe(false);
  });

  it('los errores en palabras sencillas', () => {
    expect(businessErrorText(new BackendError('x', 'conflict', 'duplicado'))).toBe('Ya tienes una empresa registrada (o algo pedido que espera respuesta).');
    expect(businessErrorText(new BackendError('x', 'validation', 'limite'))).toMatch(/30 espacios/);
    expect(businessErrorText(new BackendError('x', 'permission', '42501'))).toMatch(/No puedes hacer eso/);
    expect(businessErrorText(new BackendError('x', 'validation', 'invalido'))).toMatch(/Revisa lo que llenaste/);
    expect(businessErrorText(new BackendError('x', 'network'))).toMatch(/Sin conexión/);
    expect(businessErrorText(new Error('rara'), 'Otra cosa')).toBe('Otra cosa');
  });
});

describe('pagar con Azul', () => {
  it('start y verify van a la Edge Function azul-pay', async () => {
    const calls: [string, unknown][] = [];
    Object.assign(fake, {
      invoke: async (fn: string, body: unknown) => {
        calls.push([fn, body]);
        return (body as { action: string }).action === 'start'
          ? { url: 'https://pruebas.azul.com.do/PaymentPage/', fields: { OrderNumber: '7' }, orderNumber: 7, amount: 1500 }
          : { status: 'approved', orderNumber: 7, venueId: VENUE, endsAt: '2026-11-12T00:00:00Z', days: 7, amount: 1500 };
      },
    });
    expect(await startPromotionPayment(VENUE, 7)).toMatchObject({ orderNumber: 7, fields: { OrderNumber: '7' } });
    expect(await verifyPromotionPayment({ OrderNumber: '7', AuthHash: 'abc' })).toMatchObject({ status: 'approved', venueId: VENUE });
    expect(calls).toEqual([
      ['azul-pay', { action: 'start', venueId: VENUE, days: 7 }],
      ['azul-pay', { action: 'verify', params: { OrderNumber: '7', AuthHash: 'abc' } }],
    ]);
  });

  it('el formulario: POST a Azul con un campo escondido por dato; GET al simulador local', () => {
    const made: { tag: string; props: Record<string, unknown>; children: unknown[]; submitted: boolean }[] = [];
    const doc = {
      createElement: (tag: string) => {
        const el = { tag, props: {} as Record<string, unknown>, children: [] as unknown[], submitted: false, style: {} };
        made.push(el);
        return new Proxy(el, {
          set: (t, k, v) => {
            if (k === 'style') return true;
            t.props[String(k)] = v;
            return true;
          },
          get: (t, k) =>
            k === 'appendChild' ? (c: unknown) => t.children.push(c) : k === 'submit' ? () => (t.submitted = true) : k === 'style' ? t.style : (t as never)[k],
        });
      },
      body: { appendChild: () => undefined },
    } as unknown as Document;
    sendToAzul({ url: 'https://pruebas.azul.com.do/PaymentPage/', fields: { OrderNumber: '7', AuthHash: 'abc' } }, doc);
    const form = made[0];
    expect(form.props).toMatchObject({ method: 'post', action: 'https://pruebas.azul.com.do/PaymentPage/' });
    expect(made.slice(1).map((m) => m.props)).toEqual([
      { type: 'hidden', name: 'OrderNumber', value: '7' },
      { type: 'hidden', name: 'AuthHash', value: 'abc' },
    ]);
    expect(form.submitted).toBe(true);
    made.length = 0;
    sendToAzul({ url: '/dev/azul', fields: {} }, doc);
    expect(made[0].props.method).toBe('get');
  });

  it('la vuelta: respuesta firmada, «Cancelar» o nada', () => {
    expect(paymentReturn('?OrderNumber=7&Amount=150000&AuthHash=abc')).toEqual({ kind: 'response', params: { OrderNumber: '7', Amount: '150000', AuthHash: 'abc' } });
    expect(paymentReturn('?cancelado=7')).toEqual({ kind: 'cancelled', orderNumber: 7 });
    expect(paymentReturn('?cancelado=x')).toBeNull();
    expect(paymentReturn('?OrderNumber=7')).toBeNull();
    expect(paymentReturn('')).toBeNull();
  });

  it('los errores de pagar: el mensaje de azul-pay tal cual (es el de su core)', () => {
    for (const code of ['config', 'firma', 'rate_limited'] as const) {
      expect(paymentErrorText(new BackendError(PAY_MESSAGES[code], 'unknown', code))).toBe(PAY_MESSAGES[code]);
    }
    expect(paymentErrorText(new BackendError('La función azul-pay no está disponible', 'not_found'))).toBe(PAY_MESSAGES.config);
    // Un código crudo de la base no se muestra.
    expect(paymentErrorText(new BackendError('invalido', 'validation', 'invalido'))).toMatch(/Revisa lo que llenaste/);
    expect(paymentErrorText(new BackendError('x', 'network'))).toMatch(/Sin conexión/);
  });
});
