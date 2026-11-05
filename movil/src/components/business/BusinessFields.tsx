/**
 * Los datos de la empresa (registrarla y cambiarlos), como BusinessForm.tsx de la web. Qué falta para guardar lo dice
 * la misma lógica (src/pages/business/logic.ts).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { BUSINESS_ADDRESS_MAX, BUSINESS_CITY_MAX, BUSINESS_DESCRIPTION_MAX, BUSINESS_NAME_MAX } from '@mm/lib/data/business';
import { businessProblem, type BusinessFormValue } from '@mm/pages/business/logic';
import { Field, Input, Txt } from '../ui';
import { useColors } from '@/theme/theme';

/** Un texto largo (la descripción, la nota al pedir destacar). */
export function TextArea({ value, onChangeText, maxLength, placeholder, label, lines = 3 }: { value: string; onChangeText: (v: string) => void; maxLength: number; placeholder?: string; label?: string; lines?: number }) {
  return (
    <Input
      accessibilityLabel={label}
      multiline
      textAlignVertical="top"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChangeText={onChangeText}
      style={{ height: 28 + lines * 24, paddingTop: 14, paddingBottom: 14 }}
    />
  );
}

/** Un aviso amarillo de lo que falta. */
export function WarnNote({ children }: { children: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="alert" style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.warnSoft }}>
      <Txt variant="meta" tone="warn">
        {children}
      </Txt>
    </View>
  );
}

export function BusinessFields({ value, onChange }: { value: BusinessFormValue; onChange: (v: BusinessFormValue) => void }) {
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof BusinessFormValue>(k: K, v: BusinessFormValue[K]) => {
    setTouched(true);
    onChange({ ...value, [k]: v });
  };
  const problem = touched ? businessProblem(value) : null;
  return (
    <View style={{ gap: 16 }}>
      <Field label="Nombre de la empresa">
        <Input accessibilityLabel="Nombre de la empresa" value={value.name} maxLength={BUSINESS_NAME_MAX} autoComplete="organization-title" placeholder="Club Los Prados" onChangeText={(v) => set('name', v)} />
      </Field>
      <Field label="Ciudad">
        <Input accessibilityLabel="Ciudad" value={value.city} maxLength={BUSINESS_CITY_MAX} autoComplete="postal-address-locality" placeholder="Santo Domingo" onChangeText={(v) => set('city', v)} />
      </Field>
      <Field label="Teléfono o WhatsApp" hint="Los jugadores te escriben aquí.">
        <Input accessibilityLabel="Teléfono o WhatsApp" keyboardType="phone-pad" value={value.phone} maxLength={20} autoComplete="tel" placeholder="809 555 0000" onChangeText={(v) => set('phone', v)} />
      </Field>
      <Field label="Correo (opcional)">
        <Input accessibilityLabel="Correo" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={value.email} maxLength={120} autoComplete="email" onChangeText={(v) => set('email', v)} />
      </Field>
      <Field label="RNC o cédula (opcional)" hint="Para revisar la empresa. No se muestra.">
        <Input accessibilityLabel="RNC o cédula" keyboardType="number-pad" value={value.taxId} maxLength={14} onChangeText={(v) => set('taxId', v)} />
      </Field>
      <Field label="Dirección (opcional)">
        <Input accessibilityLabel="Dirección" value={value.address} maxLength={BUSINESS_ADDRESS_MAX} autoComplete="street-address" onChangeText={(v) => set('address', v)} />
      </Field>
      <Field label="Cuéntales de tu empresa (opcional)">
        <TextArea label="Cuéntales de tu empresa" value={value.description} maxLength={BUSINESS_DESCRIPTION_MAX} onChangeText={(v) => set('description', v)} />
      </Field>
      {problem && <WarnNote>{problem}</WarnNote>}
    </View>
  );
}
