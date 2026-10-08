import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { MIN_PASSWORD } from '../lib/auth';
import { BigInput } from './cuenta/kit';

/** Contraseña con botón para verla: el campo grande del rediseño (Entrar, Configuración › Contraseña). */
export function PasswordInput({
  value,
  onChange,
  autoComplete,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <BigInput
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        minLength={autoComplete === 'new-password' ? MIN_PASSWORD : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className="pr-14"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-1.5 my-auto grid size-11 place-items-center rounded-xl text-muted transition hover:text-fg"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </span>
  );
}
