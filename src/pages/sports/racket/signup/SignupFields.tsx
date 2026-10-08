import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Field, Input, Sheet } from '../../../../components/ui';
import { Stepper, ToggleRow } from '../bits';
import { SaveFooter } from '../night/parts';
import { SIGNUP_MAX, SIGNUP_MIN_CAP, clampCap, newSignup, type SignupSettings } from '../logic/signup';
import { localParts, zonedIso } from '../logic/time';

/**
 * Ajustes de la inscripción «Me apunto» (al crear el americano o el torneo, y en «Inscripción»): abierta o no,
 * cupo (en el torneo, por categoría) o sin tope, y la fecha límite en la hora de la liga. `value` null = la lista
 * la arma el admin (sin inscripción).
 */
export function SignupFields({
  value,
  onChange,
  unit,
  perCategory = false,
  defaultCap,
  maxCap = SIGNUP_MAX,
  tz,
}: {
  value: SignupSettings | null;
  onChange: (s: SignupSettings | null) => void;
  /** «jugador» / «jugadores» o «pareja» / «parejas». */
  unit: readonly [string, string];
  perCategory?: boolean;
  /** Cupo que se propone al abrirla (p. ej. 4 por cancha). */
  defaultCap: number;
  maxCap?: number;
  tz?: string | null;
}) {
  const on = !!value?.open;
  const top = Math.min(SIGNUP_MAX, Math.max(SIGNUP_MIN_CAP, maxCap));
  const deadline = localParts(value?.until, tz);
  const toggle = (checked: boolean) => {
    if (checked) onChange(value ? { ...value, open: true } : newSignup(Math.min(top, clampCap(defaultCap))));
    // Una vez guardada no se quita (la espera nunca se pierde): se cierra.
    else onChange(value ? { ...value, open: false } : null);
  };
  const setDeadline = (date: string, time: string) => {
    if (!value) return;
    const until = date ? zonedIso(date, time || '23:59', tz) : null;
    onChange({ ...value, until });
  };

  return (
    <div className="flex flex-col gap-3">
      <ToggleRow checked={on} onChange={toggle} label="Que se apunten en la app («Me apunto»)" hint="Con cupo, fecha límite y lista de espera que sube sola" />
      {value && !on && <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-2">Cerrada: nadie más se puede apuntar. La lista de espera se conserva.</p>}
      {on && value && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
          <div className="flex flex-wrap items-end gap-3">
            {value.cap != null ? (
              <Stepper
                label={perCategory ? `Cupo por categoría (${unit[1]})` : `Cupo (${unit[1]})`}
                value={value.cap}
                min={SIGNUP_MIN_CAP}
                max={Math.max(top, value.cap)}
                onChange={(cap) => onChange({ ...value, cap })}
              />
            ) : (
              <p className="text-sm">
                <b>Sin tope</b> <span className="text-muted">(hasta {SIGNUP_MAX})</span>
              </p>
            )}
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[var(--accent)]"
                checked={value.cap == null}
                onChange={(e) => onChange({ ...value, cap: e.target.checked ? null : Math.min(top, clampCap(defaultCap)) })}
              />
              Sin tope
            </label>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
            <Field label="Se cierra (opcional)">
              <Input type="date" value={deadline?.date ?? ''} onChange={(e) => setDeadline(e.target.value, deadline?.time ?? '18:00')} aria-label="Fecha límite" />
            </Field>
            <div className="w-28">
              <Input type="time" value={deadline?.time ?? ''} disabled={!deadline} onChange={(e) => deadline && setDeadline(deadline.date, e.target.value)} aria-label="Hora límite" />
            </div>
            {deadline ? (
              <Button variant="ghost" className="size-11 rounded-full text-faint" icon={<X className="size-4" />} aria-label="Quitar la fecha límite" onClick={() => setDeadline('', '')} />
            ) : (
              <span className="w-11" aria-hidden="true" />
            )}
          </div>
          <p className="text-[13px] text-muted">Sin fecha límite, hasta que empiece{perCategory ? ' (al armar grupos o cuadro)' : ' (la ronda 1)'}.</p>
        </div>
      )}
    </div>
  );
}

/** «Inscripción»: los ajustes en un modal (se guardan con la configuración del evento). */
export function SignupSettingsModal({
  open,
  value,
  onClose,
  onSave,
  busy,
  disabled,
  ...fields
}: {
  open: boolean;
  value: SignupSettings | null;
  onClose: () => void;
  onSave: (s: SignupSettings | null) => void;
  /** Se está guardando esto (la ruedita en Guardar). */
  busy?: boolean;
  /** Hay otra cosa guardándose: Guardar espera (sin ruedita). */
  disabled?: boolean;
  unit: readonly [string, string];
  perCategory?: boolean;
  defaultCap: number;
  maxCap?: number;
  tz?: string | null;
}) {
  const [draft, setDraft] = useState<SignupSettings | null>(value);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setDraft(value ?? newSignup(Math.min(fields.maxCap ?? SIGNUP_MAX, clampCap(fields.defaultCap))));
  }
  const unchanged = JSON.stringify(draft) === JSON.stringify(value);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Inscripción"
      footer={<SaveFooter onClose={onClose} busy={!!busy} disabled={disabled || unchanged || (!value && !draft?.open)} onSave={() => onSave(draft)} />}
    >
      <div className="pb-1">
        <SignupFields value={draft} onChange={setDraft} {...fields} />
      </div>
    </Sheet>
  );
}
