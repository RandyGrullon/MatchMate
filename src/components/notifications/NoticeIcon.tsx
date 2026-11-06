import type { NoticeKind, SocialIcon } from '../../lib/notifications';
import { cx } from '../ui';
import { noticeLook, type NoticeTone } from './noticeLook';

const TONE: Record<NoticeTone, string> = {
  accent: 'bg-accent-soft text-accent',
  warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok',
  danger: 'bg-danger-soft text-danger',
};

/** El cuadrito de color con el ícono del aviso. */
export function NoticeIcon({ kind, icon, className }: { kind: NoticeKind; icon?: SocialIcon; className?: string }) {
  const look = noticeLook(kind, icon);
  const Icon = look.icon;
  return (
    <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', TONE[look.tone], className)} aria-hidden="true">
      <Icon className="size-5" />
    </span>
  );
}
