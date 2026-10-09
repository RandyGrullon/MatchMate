import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Flag, MoreHorizontal, Trash2, UserX, type LucideIcon } from 'lucide-react';
import { socialErrorText } from '../../lib/data/posts';
import { setBlocked } from '../../lib/data/profileSocial';
import type { ReportKind } from '../../lib/data/reports';
import { BusyIcon, useBusy } from '../busy';
import { useFeedback } from '../feedback';
import { Sheet, cx } from '../ui';

const loadReportModal = () => import('../report/ReportModal');
const ReportModal = lazy(loadReportModal);

/** Una opción del menú «⋯». */
export interface MenuOption {
  key: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  danger?: boolean;
  onClick: () => void;
}

/** Las opciones del menú de una publicación o un comentario según lo que puede hacer quien mira. */
export function contentMenuKeys(c: { isMine: boolean; canDelete: boolean }): ('borrar' | 'reportar' | 'bloquear')[] {
  return [...(c.isMine ? [] : (['reportar', 'bloquear'] as const)), ...(c.canDelete ? (['borrar'] as const) : [])];
}

/** El nombre corto para «Bloquear a Ana». */
export const shortName = (name: string) => name.trim().split(/\s+/)[0] || 'esta persona';

/**
 * El menú «⋯» de algo que alguien escribió (publicación o comentario): Reportar y Bloquear a quien lo escribió (si no
 * es tuyo) y Borrar (si puedes: tuyo, de tu publicación, admin de la liga o superadmin), en una hoja que sube desde
 * abajo. Borrar y bloquear piden confirmación. `onGone`: ya no se ve (se borró o bloqueaste a quien lo escribió).
 */
export function ContentMenu({
  what,
  kind,
  targetId,
  author,
  isMine,
  canDelete,
  onDelete,
  onGone,
  deleteText,
  className,
}: {
  /** «publicación» o «comentario» (los textos del menú). */
  what: 'publicación' | 'comentario';
  kind: Extract<ReportKind, 'post' | 'post_comment'>;
  targetId: string;
  author: { id: string; name: string };
  isMine: boolean;
  canDelete: boolean;
  onDelete: () => Promise<void>;
  onGone?: () => void;
  /** Lo que se dice al confirmar el borrado. */
  deleteText?: ReactNode;
  className?: string;
}) {
  const { confirm, toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const busy = useBusy<'borrar' | 'bloquear'>();
  const name = shortName(author.name);
  const fem = what === 'publicación';
  const label = `Más opciones ${fem ? 'de la publicación' : 'del comentario'}`;

  async function remove() {
    const ok = await confirm({
      title: `¿Borrar ${fem ? 'la publicación' : 'el comentario'}?`,
      message: deleteText ?? (fem ? 'Se borra para todos, con sus me gusta y comentarios.' : 'Se borra para todos.'),
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    await busy.run('borrar', async () => {
      try {
        await onDelete();
        toast(fem ? 'Publicación borrada' : 'Comentario borrado');
        onGone?.();
      } catch (e) {
        console.error(e);
        toast(socialErrorText(e, 'No se pudo borrar. Inténtalo otra vez.'), 'error');
      }
    });
  }

  async function block() {
    const ok = await confirm({
      title: `¿Bloquear a ${name}?`,
      message: 'Dejan de seguirse, no verás lo que publica ni comenta y no podrá ver tu perfil. Puedes desbloquearlo cuando quieras.',
      confirmText: 'Bloquear',
      danger: true,
    });
    if (!ok) return;
    await busy.run('bloquear', async () => {
      try {
        await setBlocked(author.id, true);
        toast(`Bloqueaste a ${name}`);
        onGone?.();
      } catch (e) {
        console.error(e);
        toast(socialErrorText(e, 'No se pudo bloquear. Inténtalo otra vez.'), 'error');
      }
    });
  }

  const actions: Record<'borrar' | 'reportar' | 'bloquear', MenuOption> = {
    reportar: { key: 'reportar', label: `Reportar ${fem ? 'publicación' : 'comentario'}`, hint: 'Lo revisa el equipo de MatchMate.', icon: Flag, onClick: () => setReporting(true) },
    bloquear: { key: 'bloquear', label: `Bloquear a ${name}`, hint: 'No verás lo que publica.', icon: UserX, onClick: () => void block() },
    borrar: { key: 'borrar', label: `Borrar ${what}`, icon: Trash2, danger: true, onClick: () => void remove() },
  };
  const items = contentMenuKeys({ isMine, canDelete }).map((k) => actions[k]);
  if (!items.length) return null;
  const working = busy.isBusy();

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // El reporte se baja mientras elige.
          void loadReportModal().catch(() => undefined);
          setOpen(true);
        }}
        disabled={working}
        aria-haspopup="dialog"
        aria-busy={working || undefined}
        aria-label={label}
        title="Más opciones"
        className={cx(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg active:scale-95',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-60',
          className,
        )}
      >
        <BusyIcon busy={working} icon={<MoreHorizontal className="size-5" strokeWidth={2.2} aria-hidden="true" />} className="size-5" />
      </button>
      {/* Solo cuando se abre: una lista larga no carga una hoja por publicación. */}
      {open && (
        <Sheet open onClose={() => setOpen(false)} title={fem ? 'Publicación' : 'Comentario'} subtitle={`De ${author.name.trim() || 'alguien'}`}>
          <MenuRows items={items} onPick={() => setOpen(false)} />
        </Sheet>
      )}
      {reporting && (
        <Suspense fallback={null}>
          <ReportModal kind={kind} targetId={targetId} onClose={() => setReporting(false)} />
        </Suspense>
      )}
    </>
  );
}

/** Las opciones como filas grandes (la de borrar, en rojo). */
export function MenuRows({ items, onPick }: { items: readonly MenuOption[]; onPick?: () => void }) {
  return (
    <ul className="-mx-2 flex flex-col pb-1">
      {items.map((it) => (
        <li key={it.key}>
          <button
            type="button"
            onClick={() => {
              onPick?.();
              it.onClick();
            }}
            className={cx(
              'flex min-h-14 w-full items-center gap-3.5 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent',
              it.danger && 'text-danger',
            )}
          >
            <span aria-hidden="true" className={cx('grid size-10 shrink-0 place-items-center rounded-xl', it.danger ? 'bg-danger-soft text-danger' : 'bg-surface-2 text-fg-2')}>
              <it.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body font-semibold">{it.label}</span>
              {it.hint && <span className="block truncate text-[13px] text-muted">{it.hint}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
