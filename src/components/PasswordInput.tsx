import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { MIN_PASSWORD } from '../lib/auth';
import { Input } from './ui';

/** Contraseña con botón para verla. */
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
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        minLength={autoComplete === 'new-password' ? MIN_PASSWORD : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={invalid ? 'border-danger pr-10' : 'pr-10'}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
