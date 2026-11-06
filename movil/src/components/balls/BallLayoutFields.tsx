import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Info } from 'lucide-react-native';
import {
  INCH_EIGHTHS,
  LAYOUT_INCHES_MAX,
  LAYOUT_NOTES_MAX,
  cleanLayout,
  joinInches,
  layoutProblem,
  layoutProblemText,
  layoutText,
  splitInches,
  type BallLayout,
} from '@mm/lib/balls';
import { LAYOUT_WHOLE_INCHES, angleFromText, editLayout } from '@mm/components/balls/layout';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Field, Input, Txt } from '../ui';
import { ChoiceChips } from './inputs';

/**
 * «Perforación» en la hoja de una bola (BallLayoutFields de la web): el layout Dual Angle que da quien la perforó
 * (45 × 4½ × 30): el ángulo de perforación, del pin al PAP y el ángulo VAL, y además el buffer y unas notas. Los ángulos
 * se escriben (solo cifras); las pulgadas se eligen en enteros y octavos (½, ⅜…). Abajo, cómo queda en una línea
 * («45° × 4½″ × 30°») y lo que no vale.
 */

function AngleField({ label, value, invalid, onChange }: { label: string; value: number | undefined; invalid: boolean; onChange: (v: number | undefined) => void }) {
  const c = useColors();
  return (
    <Field label={label}>
      <View style={{ width: 120 }}>
        <Input
          accessibilityLabel={label}
          keyboardType="number-pad"
          maxLength={2}
          value={typeof value === 'number' ? String(value) : ''}
          onChangeText={(t) => onChange(angleFromText(t))}
          placeholder="—"
          autoComplete="off"
          invalid={invalid}
          style={{ paddingRight: 32 }}
        />
        <View pointerEvents="none" aria-hidden style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}>
          <Txt style={{ color: c.muted, fontSize: 17 }}>°</Txt>
        </View>
      </View>
    </Field>
  );
}

function InchesField({ label, value, invalid, onChange }: { label: string; value: number | undefined; invalid: boolean; onChange: (v: number | undefined) => void }) {
  const c = useColors();
  const parts = splitInches(value);
  const whole = parts?.whole ?? null;
  // La marca de pulgadas va al final, como en la web (el lector de pantalla no la lee).
  const inch = (
    <View aria-hidden style={{ width: 16, alignItems: 'center' }}>
      <Txt style={{ color: c.muted, fontSize: 17 }}>″</Txt>
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="bodyStrong" tone="fg2">
        {label}
      </Txt>
      <ChoiceChips<string>
        label={`${label}: pulgadas`}
        invalid={invalid}
        value={whole == null ? '' : String(whole)}
        onChange={(k) => onChange(k === '' ? undefined : joinInches(Number(k), parts?.eighths ?? 0))}
        options={[{ key: '', label: '—' }, ...LAYOUT_WHOLE_INCHES.map((n) => ({ key: String(n), label: String(n) }))]}
      />
      <ChoiceChips<string>
        label={`${label}: fracción`}
        invalid={invalid}
        value={String(parts?.eighths ?? 0)}
        onChange={(k) => onChange(joinInches(whole, Number(k)))}
        options={INCH_EIGHTHS.map((fr, i) => ({ key: String(i), label: fr || '—', disabled: i > 0 && whole === LAYOUT_INCHES_MAX }))}
        trailing={inch}
      />
    </View>
  );
}

export function BallLayoutFields({ value, onChange }: { value: BallLayout | null | undefined; onChange: (l: BallLayout | null) => void }) {
  const c = useColors();
  const [info, setInfo] = useState(false);
  const l = value ?? null;
  const clean = cleanLayout(l);
  const problem = layoutProblem(clean);
  const text = layoutText(clean);
  const num = (k: 'drillingAngle' | 'pinToPap' | 'valAngle' | 'pinBuffer') => {
    const v = l?.[k];
    return typeof v === 'number' ? v : undefined;
  };
  const set = (k: keyof BallLayout) => (v: number | string | undefined) => onChange(editLayout(l, k, v));
  return (
    <View style={{ gap: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 20 }}>
      <View>
        <Txt accessibilityRole="header" style={{ fontSize: 15, fontFamily: font.semibold, color: c.fg }}>
          Perforación{' '}
          <Txt style={{ fontSize: 15, color: c.muted }}>(opcional)</Txt>
        </Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: info }}
          onPress={() => setInfo((v) => !v)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}
        >
          <Info size={16} color={c.accent} />
          <Txt style={{ fontSize: 13, fontFamily: font.medium, color: c.accent }}>¿Qué es el layout?</Txt>
        </Pressable>
        {info && (
          <Txt tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
            Dual Angle: ángulo de perforación, distancia del pin al PAP y ángulo VAL. Te lo da quien te perforó la bola, por ejemplo 45 × 4½ × 30. El PAP es el
            punto del eje de tu mano; el buffer, cuánto se corre el pin (si lleva).
          </Txt>
        )}
      </View>
      <AngleField label="Ángulo de perforación" value={num('drillingAngle')} invalid={problem === 'drillingAngle'} onChange={set('drillingAngle')} />
      <InchesField label="Pin a PAP" value={num('pinToPap')} invalid={problem === 'pinToPap'} onChange={set('pinToPap')} />
      <AngleField label="Ángulo VAL" value={num('valAngle')} invalid={problem === 'valAngle'} onChange={set('valAngle')} />
      <InchesField label="Buffer" value={num('pinBuffer')} invalid={problem === 'pinBuffer'} onChange={set('pinBuffer')} />
      <Field label="Notas">
        <Input
          accessibilityLabel="Notas"
          value={l?.notes ?? ''}
          onChangeText={(t) => set('notes')(t)}
          maxLength={LAYOUT_NOTES_MAX}
          placeholder="Ej.: Dual Angle, mano derecha"
          autoComplete="off"
          invalid={problem === 'notes'}
        />
      </Field>
      {text && (
        <View style={{ borderRadius: 12, backgroundColor: c.surface2, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Txt style={{ fontSize: 14 }}>
            <Txt tone="muted" style={{ fontSize: 14 }}>
              Tu layout:{' '}
            </Txt>
            <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>{text}</Txt>
          </Txt>
        </View>
      )}
      {problem && (
        <Txt variant="meta" tone="danger" accessibilityLiveRegion="polite">
          {layoutProblemText(problem)}
        </Txt>
      )}
    </View>
  );
}
