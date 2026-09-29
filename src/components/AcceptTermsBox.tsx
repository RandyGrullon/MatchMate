import { Link } from 'react-router';
import { PRIVACY_PATH, TERMS_PATH } from '../pages/legal/legal';

/**
 * La casilla obligatoria de «Crear cuenta»: «Acepto los Términos y la Política de privacidad» con los links. Con
 * correo, la aceptación viaja en el registro (signUp con `terms`); con Google, se recuerda y se acepta al volver.
 */
export function AcceptTermsBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="-my-1 flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-sm">
      <input
        type="checkbox"
        required
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
      />
      <span>
        Acepto los{' '}
        <Link to={TERMS_PATH} className="font-medium text-accent underline underline-offset-2">
          Términos
        </Link>{' '}
        y la{' '}
        <Link to={PRIVACY_PATH} className="font-medium text-accent underline underline-offset-2">
          Política de privacidad
        </Link>
        .
      </span>
    </label>
  );
}
