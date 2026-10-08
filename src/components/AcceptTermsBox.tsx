import { Link } from 'react-router';
import { PRIVACY_PATH, TERMS_PATH } from '../pages/legal/legal';
import { CheckRow } from './cuenta/kit';

/**
 * La casilla obligatoria de «Crear cuenta»: «Acepto los Términos y la Política de privacidad» con los links. Con
 * correo, la aceptación viaja en el registro (signUp con `terms`); con Google, se recuerda y se acepta al volver.
 */
export function AcceptTermsBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <CheckRow checked={checked} onChange={onChange}>
      Acepto los{' '}
      <Link to={TERMS_PATH} className="font-medium text-accent underline underline-offset-2">
        Términos
      </Link>{' '}
      y la{' '}
      <Link to={PRIVACY_PATH} className="font-medium text-accent underline underline-offset-2">
        Política de privacidad
      </Link>
      .
    </CheckRow>
  );
}
