import { useState } from 'react';
import { BUSINESS_ADDRESS_MAX, BUSINESS_CITY_MAX, BUSINESS_DESCRIPTION_MAX, BUSINESS_NAME_MAX, type Business, type BusinessInput } from '../../lib/data/business';
import { Field, Input, Textarea } from '../../components/ui';

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

/** Los campos de la empresa. */
export function BusinessFields({ value, onChange }: { value: BusinessFormValue; onChange: (v: BusinessFormValue) => void }) {
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof BusinessFormValue>(k: K, v: BusinessFormValue[K]) => {
    setTouched(true);
    onChange({ ...value, [k]: v });
  };
  const problem = touched ? businessProblem(value) : null;
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nombre de la empresa">
        <Input value={value.name} maxLength={BUSINESS_NAME_MAX} autoComplete="organization" placeholder="Club Los Prados" onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="Ciudad">
        <Input value={value.city} maxLength={BUSINESS_CITY_MAX} autoComplete="address-level2" placeholder="Santo Domingo" onChange={(e) => set('city', e.target.value)} />
      </Field>
      <Field label="Teléfono o WhatsApp" hint="Los jugadores te escriben aquí.">
        <Input type="tel" inputMode="tel" value={value.phone} maxLength={20} autoComplete="tel" placeholder="809 555 0000" onChange={(e) => set('phone', e.target.value)} />
      </Field>
      <Field label="Correo (opcional)">
        <Input type="email" inputMode="email" value={value.email} maxLength={120} autoComplete="email" onChange={(e) => set('email', e.target.value)} />
      </Field>
      <Field label="RNC o cédula (opcional)" hint="Para revisar la empresa. No se muestra.">
        <Input inputMode="numeric" value={value.taxId} maxLength={14} onChange={(e) => set('taxId', e.target.value)} />
      </Field>
      <Field label="Dirección (opcional)">
        <Input value={value.address} maxLength={BUSINESS_ADDRESS_MAX} autoComplete="street-address" onChange={(e) => set('address', e.target.value)} />
      </Field>
      <Field label="Cuéntales de tu empresa (opcional)">
        <Textarea rows={3} value={value.description} maxLength={BUSINESS_DESCRIPTION_MAX} onChange={(e) => set('description', e.target.value)} />
      </Field>
      {problem && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-sm text-warn">{problem}</p>}
    </div>
  );
}
