import { useId, useState, type ReactNode } from 'react';
import type { MinorInput } from '../../lib/data/players';
import { useLeagueCtx } from '../../lib/league';
import { Field, Input, cx } from '../ui';
import { emptyGuardian, guardianProblem, type GuardianDraft } from './logic';

/**
 * «Es menor de edad» (solo en ligas con menores). Un menor no tiene cuenta, nadie lo puede reclamar y no sale en
 * lo social; el nombre de su tutor y su teléfono solo los ven los admins.
 */
export function MinorCheck({
  checked,
  onChange,
  label = 'Es menor de edad',
  hint = 'Sin cuenta: nadie lo puede reclamar y no sale en lo social.',
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cx('flex min-h-11 cursor-pointer items-start gap-3', className)}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** El permiso del padre, madre o tutor (obligatorio para registrar a un menor). */
export function ConsentCheck({
  checked,
  onChange,
  label = 'El tutor dio permiso',
  hint = 'Su padre, madre o tutor aceptó que lo registres en la app. Queda anotado quién lo registró y cuándo.',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 p-4">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-sm">
        {label}
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

/** Padre, madre o tutor (obligatorio), su teléfono (opcional) y el permiso. */
export function GuardianFields({ value, onChange }: { value: GuardianDraft; onChange: (v: GuardianDraft) => void }) {
  const id = useId();
  const set = (patch: Partial<GuardianDraft>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={`${id}-nota`}>
      <Field label="Padre, madre o tutor">
        <Input
          required
          maxLength={60}
          value={value.guardianName}
          onChange={(e) => set({ guardianName: e.target.value })}
          placeholder="Nombre y apellido"
          autoComplete="off"
        />
      </Field>
      <Field label="Teléfono del tutor (opcional)">
        <Input
          type="tel"
          inputMode="tel"
          maxLength={24}
          value={value.guardianPhone}
          onChange={(e) => set({ guardianPhone: e.target.value })}
          placeholder="809 555 1234"
          autoComplete="off"
        />
      </Field>
      <ConsentCheck checked={value.consent} onChange={(consent) => set({ consent })} />
      <p id={`${id}-nota`} className="text-xs text-muted">
        El tutor y su teléfono solo los ven los admins de la liga.
      </p>
    </fieldset>
  );
}

/** Lo que da useQuickMinor: `fields` va debajo del nombre; `take()` antes de crear; `reset()` después. */
export interface QuickMinor {
  /** «Es menor de edad» y su tutor (null si la liga no tiene menores o todavía no hay nombre). */
  fields: ReactNode;
  /** Lo que va a createPlayer: null = adulto; undefined = falta algo del tutor (el error ya se ve en `fields`). */
  take: () => MinorInput | null | undefined;
  reset: () => void;
}

/**
 * Agregar a alguien al vuelo (inscribir en un evento, parejas, noches, plantillas) en una liga con menores: pregunta
 * «Es menor de edad» (marcado de entrada) y pide su tutor, como «Agregar jugador». `show`: ya hay un nombre escrito.
 */
export function useQuickMinor(show: boolean): QuickMinor {
  const { league } = useLeagueCtx();
  const on = !!league.hasMinors;
  const [isMinor, setIsMinor] = useState(true);
  const [guardian, setGuardian] = useState<GuardianDraft>(emptyGuardian);
  const [error, setError] = useState<string | null>(null);

  const take = (): MinorInput | null | undefined => {
    if (!on || !isMinor) return null;
    const problem = guardianProblem(guardian);
    setError(problem);
    if (problem) return undefined;
    return { guardianName: guardian.guardianName, guardianPhone: guardian.guardianPhone, consent: guardian.consent };
  };
  const reset = () => {
    setIsMinor(true);
    setGuardian(emptyGuardian);
    setError(null);
  };

  const fields =
    on && show ? (
      <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4">
        <MinorCheck checked={isMinor} onChange={setIsMinor} />
        {isMinor && <GuardianFields value={guardian} onChange={setGuardian} />}
        {error && isMinor && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    ) : null;
  return { fields, take, reset };
}
