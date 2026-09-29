import { lazy, Suspense, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Flag } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { REPORT_KIND_THIS, type ReportKind } from '../../lib/data/reports';
import { cx } from '../ui';

const ReportModal = lazy(() => import('./ReportModal'));

/**
 * «Reportar» algo (comentario, juego, aviso, liga o cuenta): abre el modal con el motivo y una nota. Sin cuenta
 * lleva a entrar y vuelve aquí; lo propio (`ownerId` = la cuenta) no se reporta y el botón no sale.
 * `icon`: solo la bandera (44 px, con nombre para lectores de pantalla); `text`: bandera y «Reportar…».
 */
export function ReportButton({
  kind,
  targetId,
  ownerId,
  variant = 'icon',
  label,
  className,
}: {
  kind: ReportKind;
  targetId: string;
  /** De quién es (si es de la cuenta que mira, no sale). */
  ownerId?: string | null;
  variant?: 'icon' | 'text';
  /** Texto del botón `text` (por defecto «Reportar <esto>»). */
  label?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  if (ownerId && user?.uid === ownerId) return null;
  const name = label ?? `Reportar ${REPORT_KIND_THIS[kind]}`;

  function start() {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label={variant === 'icon' ? name : undefined}
        title={variant === 'icon' ? name : undefined}
        className={cx(
          'inline-flex shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
          variant === 'icon' ? 'size-11' : 'min-h-11 gap-1.5 px-3 text-sm font-medium',
          className,
        )}
      >
        <Flag className="size-4" aria-hidden="true" />
        {variant === 'text' && <span>{name}</span>}
      </button>
      {open && (
        <Suspense fallback={null}>
          <ReportModal kind={kind} targetId={targetId} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
