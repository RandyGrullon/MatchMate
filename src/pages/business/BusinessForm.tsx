import { useState } from 'react';
import { BUSINESS_ADDRESS_MAX, BUSINESS_CITY_MAX, BUSINESS_DESCRIPTION_MAX, BUSINESS_NAME_MAX } from '../../lib/data/business';
import { Field, Input, Textarea } from '../../components/ui';
import { businessProblem, type BusinessFormValue } from './logic';

// La lógica del formulario está en logic.ts (la usa también la app del teléfono).
export { businessFormFrom, businessInputFrom, businessProblem, emptyBusinessForm, type BusinessFormValue } from './logic';

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
