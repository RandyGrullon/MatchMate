import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { clearAfterLogin, takeAfterLogin, useAuth } from '../lib/auth';

/**
 * Al abrirse la sesión (entró con su correo, volvió de Google o abrió el link para confirmar el correo, también en
 * otra pestaña): si antes de entrar iba a algún lado (una invitación, una liga: lo guarda /login con saveAfterLogin),
 * la app va ahí una sola vez y lo borra. Con el link de «olvidé mi contraseña» no se mueve (primero pone la nueva) y
 * se olvida. Va dentro del router, después de las rutas: si /login también navega, gana esta.
 */
export function ResumeAfterLogin() {
  const { user, recovering } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const uid = user?.uid ?? null;
  const resetting = recovering || (pathname === '/cuenta' && new URLSearchParams(search).has('recuperar'));

  // Lo de la pantalla actual se lee al abrirse la sesión; el efecto de abajo solo corre cuando cambia la cuenta.
  const latest = useRef({ path: pathname + search, resetting, navigate });
  useLayoutEffect(() => {
    latest.current = { path: pathname + search, resetting, navigate };
  });

  useEffect(() => {
    if (!uid) return;
    const { path, resetting: busy, navigate: go } = latest.current;
    if (busy) {
      clearAfterLogin();
      return;
    }
    const dest = takeAfterLogin();
    if (dest && dest !== path) go(dest, { replace: true });
  }, [uid]);

  return null;
}
