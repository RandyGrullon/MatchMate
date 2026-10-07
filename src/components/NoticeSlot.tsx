import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  activeSlot,
  claimSlot,
  dismissNotice,
  dismissedFor,
  dismissedSnapshot,
  noticesSnapshot,
  pickEntry,
  refreshNotices,
  registerNotice,
  subscribeNotices,
  type Notice,
} from '../lib/notices';
import { BusyIcon, useBusy } from './busy';
import { cx } from './ui';

export type { Notice, NoticeAction, NoticeKind } from '../lib/notices';
export { NOTICE_PRIORITY, registerNotice } from '../lib/notices';

/**
 * Propone un aviso mientras la pantalla (o la parte de la app) que lo llama está montada y `notice` no es null/false.
 * El NoticeSlot de la pantalla muestra solo el más importante: pendientes del admin > instalar la app > permitir avisos >
 * sugerir Pro > pista. Se puede llamar en cada render con un objeto nuevo: solo se vuelve a dibujar si cambia lo que
 * dice; las funciones (action.onClick, onDismiss) se leen al tocar.
 *
 *   useNotice(canInstall && { id: 'instalar', kind: 'install', title: 'Instala MatchMate', text: 'Ábrela como una app',
 *     action: { label: 'Instalar', onClick: install } });
 */
export function useNotice(notice: Notice | null | false | undefined): void {
  const latest = useRef<Notice | null>(notice || null);
  const id = notice ? notice.id : null;
  const sig = notice
    ? JSON.stringify([notice.kind, notice.title, notice.text ?? '', notice.action?.label ?? '', notice.action?.to ?? '', notice.dismissible ?? true, notice.snoozeDays ?? 0])
    : null;
  // Primero lo último que dice (el efecto de abajo lo lee al proponerlo).
  useEffect(() => {
    if (notice) latest.current = notice;
  });
  useEffect(() => {
    if (!id || !latest.current) return;
    return registerNotice(() => latest.current!);
  }, [id]);
  useEffect(() => {
    if (sig) refreshNotices();
  }, [sig]);
}

/**
 * El lugar del aviso de una pantalla: una fila que se puede cerrar, nunca más de una. Va una vez por pantalla (si por
 * error hay dos montados, solo muestra el último). Al cerrarlo se recuerda en el teléfono para esa cuenta.
 */
export function NoticeSlot({ className }: { className?: string }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const entries = useSyncExternalStore(subscribeNotices, noticesSnapshot, noticesSnapshot);
  useSyncExternalStore(subscribeNotices, dismissedSnapshot, dismissedSnapshot);
  const active = useSyncExternalStore(subscribeNotices, activeSlot, activeSlot);
  const [slot, setSlot] = useState<number | null>(null);
  useEffect(() => {
    const s = claimSlot();
    setSlot(s.id);
    return s.release;
  }, []);
  if (active !== null && active !== slot) return null;
  const entry = pickEntry(entries, dismissedFor(uid));
  if (!entry) return null;
  const notice = entry.get?.() ?? entry.notice;
  return (
    <NoticeRow
      notice={notice}
      className={className}
      onDismiss={() => {
        dismissNotice(uid, notice);
        notice.onDismiss?.();
      }}
    />
  );
}

/**
 * La fila de un aviso (lo que dibuja NoticeSlot): título, una línea debajo, el botón en el color del deporte («Probar
 * Pro») y la X. Sin fondo, solo con contorno: no compite con las tarjetas.
 */
export function NoticeRow({ notice, onDismiss, className }: { notice: Notice; onDismiss?: () => void; className?: string }) {
  const busy = useBusy();
  const action = notice.action;
  const actionClass = cx(
    'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2 text-meta font-[650] text-accent transition active:opacity-70',
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-60',
  );
  let button: ReactNode = null;
  if (action?.to)
    button = (
      <Link to={action.to} onClick={() => void action.onClick?.()} className={actionClass}>
        {action.label}
      </Link>
    );
  else if (action)
    button = (
      <button
        type="button"
        disabled={busy.isBusy()}
        onClick={() =>
          void busy
            .run('accion', async () => {
              await action.onClick?.();
            })
            .catch((e: unknown) => console.warn('[aviso]', e))
        }
        className={actionClass}
      >
        <BusyIcon busy={busy.isBusy()} className="size-4" />
        {action.label}
      </button>
    );
  return (
    <div data-notice={notice.id} className={cx('flex items-center gap-3 rounded-[20px] py-1.5 pr-1 pl-4 shadow-[inset_0_0_0_1px_var(--line)]', className)}>
      {notice.icon && (
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          {notice.icon}
        </span>
      )}
      <div className="min-w-0 flex-1 py-1.5">
        <p className="text-meta font-semibold">{notice.title}</p>
        {notice.text && <p className="mt-px text-[13.5px] text-muted">{notice.text}</p>}
      </div>
      {button}
      {notice.dismissible !== false && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar aviso"
          className="grid size-11 shrink-0 place-items-center rounded-full text-faint transition hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-[18px]" />
        </button>
      )}
    </div>
  );
}
