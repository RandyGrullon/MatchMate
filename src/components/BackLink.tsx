import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { cx } from './ui';

/**
 * Flecha para volver: regresa a la pantalla anterior y, si se entró directo por un link, va a `fallback`. Deslizar
 * desde el borde (en la app instalada) va siempre a `fallback`, la pantalla de arriba (`data-back-to`, SwipeBack).
 */
export function BackLink({ fallback, label = 'Volver', className }: { fallback: string; label?: string; className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <button
      type="button"
      data-back-to={fallback}
      onClick={() => (location.key !== 'default' ? navigate(-1) : navigate(fallback, { replace: true }))}
      className={cx('shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95', className)}
      aria-label={label}
      title={label}
    >
      <ArrowLeft className="size-5" />
    </button>
  );
}
