import { useId } from 'react';
import { Info } from 'lucide-react';
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
} from '../../lib/balls';
import { Field, Input, Select } from '../ui';

/**
 * «Perforación» en la hoja de una bola: el layout Dual Angle que da quien la perforó (45 × 4½ × 30): el ángulo de
 * perforación, del pin al PAP y el ángulo VAL, y además el buffer y unas notas. Los ángulos se escriben (solo cifras);
 * las pulgadas se eligen en enteros y octavos (½, ⅜…), sin escribir fracciones. Abajo, cómo queda en una línea
 * («45° × 4½″ × 30°») y lo que no vale.
 */

/**
 * La perforación con ese valor cambiado: sin la clave si queda vacía; null si no queda nada (así, sin cambios, es igual
 * a la de antes). Las notas se guardan como se escriben (se recortan al guardar).
 */
export function editLayout(l: BallLayout | null | undefined, k: keyof BallLayout, v: number | string | undefined): BallLayout | null {
  const next: Record<string, unknown> = { ...(l ?? {}) };
  if (v === undefined || v === '') delete next[k];
  else next[k] = v;
  return Object.keys(next).length ? (next as BallLayout) : null;
}

const WHOLE_INCHES = Array.from({ length: LAYOUT_INCHES_MAX + 1 }, (_, i) => i);

function AngleField({ label, value, invalid, onChange }: { label: string; value: number | undefined; invalid: boolean; onChange: (v: number | undefined) => void }) {
  return (
    <Field label={label}>
      <span className="relative block">
        <Input
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={typeof value === 'number' ? String(value) : ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            onChange(digits ? Number(digits) : undefined);
          }}
          placeholder="—"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          className="h-11 pr-8"
        />
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
          °
        </span>
      </span>
    </Field>
  );
}

function InchesField({ label, value, invalid, onChange }: { label: string; value: number | undefined; invalid: boolean; onChange: (v: number | undefined) => void }) {
  const id = useId();
  const parts = splitInches(value);
  const whole = parts?.whole ?? null;
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1.5">
      <span id={id} className="text-xs font-medium text-muted">
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <Select
          aria-label={`${label}: pulgadas`}
          aria-invalid={invalid || undefined}
          value={whole == null ? '' : String(whole)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : joinInches(Number(e.target.value), parts?.eighths ?? 0))}
          className="h-11 min-w-0 flex-1 pr-1! pl-2.5!"
        >
          <option value="">—</option>
          {WHOLE_INCHES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
        <Select
          aria-label={`${label}: fracción`}
          aria-invalid={invalid || undefined}
          value={String(parts?.eighths ?? 0)}
          onChange={(e) => onChange(joinInches(whole, Number(e.target.value)))}
          className="h-11 min-w-0 flex-1 pr-1! pl-2.5!"
        >
          {INCH_EIGHTHS.map((f, i) => (
            <option key={i} value={i} disabled={i > 0 && whole === LAYOUT_INCHES_MAX}>
              {f || '—'}
            </option>
          ))}
        </Select>
        <span aria-hidden="true" className="text-muted">
          ″
        </span>
      </span>
    </div>
  );
}

export function BallLayoutFields({ value, onChange }: { value: BallLayout | null | undefined; onChange: (l: BallLayout | null) => void }) {
  const titleId = useId();
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
    <section aria-labelledby={titleId} className="flex flex-col gap-3 border-t border-line pt-5">
      <div>
        <h3 id={titleId} className="text-[15px] font-semibold">
          Perforación <span className="font-normal text-muted">(opcional)</span>
        </h3>
        <details className="text-[13px] text-muted">
          <summary className="-mb-1.5 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-medium text-accent [&::-webkit-details-marker]:hidden">
            <Info aria-hidden="true" className="size-4" /> ¿Qué es el layout?
          </summary>
          <p className="mt-1.5">
            Dual Angle: ángulo de perforación, distancia del pin al PAP y ángulo VAL. Te lo da quien te perforó la bola, por ejemplo 45 × 4½ × 30. El PAP es el
            punto del eje de tu mano; el buffer, cuánto se corre el pin (si lleva).
          </p>
        </details>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <AngleField label="Ángulo de perforación" value={num('drillingAngle')} invalid={problem === 'drillingAngle'} onChange={set('drillingAngle')} />
        <InchesField label="Pin a PAP" value={num('pinToPap')} invalid={problem === 'pinToPap'} onChange={set('pinToPap')} />
        <AngleField label="Ángulo VAL" value={num('valAngle')} invalid={problem === 'valAngle'} onChange={set('valAngle')} />
        <InchesField label="Buffer" value={num('pinBuffer')} invalid={problem === 'pinBuffer'} onChange={set('pinBuffer')} />
      </div>
      <Field label="Notas">
        <Input
          value={l?.notes ?? ''}
          onChange={(e) => set('notes')(e.target.value)}
          maxLength={LAYOUT_NOTES_MAX}
          placeholder="Ej.: Dual Angle, mano derecha"
          autoComplete="off"
          aria-invalid={problem === 'notes' || undefined}
          className="h-11"
        />
      </Field>
      {text && (
        <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm">
          <span className="text-muted">Tu layout: </span>
          <span className="num font-semibold">{text}</span>
        </p>
      )}
      {problem && (
        <p className="text-sm text-danger" aria-live="polite">
          {layoutProblemText(problem)}
        </p>
      )}
    </section>
  );
}
