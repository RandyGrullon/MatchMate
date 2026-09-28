import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Field, Input, Modal } from '../../../../components/ui';
import { Stepper } from '../bits';
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
      <label className="flex min-h-12 items-start gap-3 rounded-xl border border-line px-3 py-2.5">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">Que se apunten en la app («Me apunto»)</span>
          <span className="block text-xs text-muted">
            Con cupo, fecha límite y lista de espera: si alguien se baja, entra solo el primero que espera y le llega un aviso. Tú puedes seguir
            agregando a mano.
          </span>
        </span>
      </label>
      {value && !on && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">La inscripción queda cerrada: nadie más se puede apuntar. La lista de espera se conserva.</p>}
      {on && value && (
        <div className="flex flex-col gap-3 rounded-xl bg-surface-2 p-3">
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
            <Input type="time" value={deadline?.time ?? ''} disabled={!deadline} onChange={(e) => deadline && setDeadline(deadline.date, e.target.value)} aria-label="Hora límite" className="w-28" />
            {deadline ? (
              <Button variant="ghost" icon={<X className="size-4" />} aria-label="Quitar la fecha límite" onClick={() => setDeadline('', '')} />
            ) : (
              <span className="w-11" aria-hidden="true" />
            )}
          </div>
          <p className="text-xs text-muted">
            Sin fecha límite, se pueden apuntar hasta que empiece{perCategory ? ' (cuando armes los grupos o el cuadro)' : ' (la ronda 1)'}.
          </p>
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
  ...fields
}: {
  open: boolean;
  value: SignupSettings | null;
  onClose: () => void;
  onSave: (s: SignupSettings | null) => void;
  busy?: boolean;
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
    <Modal
      open={open}
      onClose={onClose}
      title="Inscripción"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={unchanged || (!value && !draft?.open)} onClick={() => onSave(draft)}>
            Guardar
          </Button>
        </>
      }
    >
      <SignupFields value={draft} onChange={setDraft} {...fields} />
    </Modal>
  );
}
