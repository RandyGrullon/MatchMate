import {
  Bell,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ClipboardCheck,
  Heart,
  Inbox,
  Lightbulb,
  MapPin,
  Megaphone,
  MessageCircle,
  PartyPopper,
  ShieldAlert,
  Swords,
  Trophy,
  UserPlus,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { NoticeKind, SocialIcon } from '../../lib/notifications';
import { cx } from '../ui';

interface Look {
  icon: LucideIcon;
  tone: string;
}

const ACCENT = 'bg-accent-soft text-accent';
const WARN = 'bg-warn-soft text-warn';
const OK = 'bg-ok-soft text-ok';
const DANGER = 'bg-danger-soft text-danger';

/** Ícono y color de cada tipo de aviso. */
const KINDS: Record<NoticeKind, Look> = {
  torneo: { icon: Megaphone, tone: ACCENT },
  'torneo-hoy': { icon: Trophy, tone: WARN },
  practica: { icon: CalendarDays, tone: ACCENT },
  aprobado: { icon: CheckCircle2, tone: OK },
  rechazado: { icon: XCircle, tone: DANGER },
  'por-aprobar': { icon: Inbox, tone: WARN },
  reaccion: { icon: PartyPopper, tone: ACCENT },
  comentario: { icon: MessageCircle, tone: OK },
  sugerencia: { icon: Lightbulb, tone: WARN },
  'partido-hoy': { icon: CalendarCheck, tone: ACCENT },
  'por-confirmar': { icon: ClipboardCheck, tone: WARN },
  reclamo: { icon: ShieldAlert, tone: DANGER },
  'cambio-hora': { icon: CalendarClock, tone: WARN },
  aplazado: { icon: CalendarX2, tone: WARN },
  ronda: { icon: MapPin, tone: OK },
  reto: { icon: Swords, tone: ACCENT },
  social: { icon: Heart, tone: DANGER },
};

/** Los sociales de afuera: te siguieron, les gustó tu juego o lo comentaron. */
const SOCIAL: Record<SocialIcon, Look> = {
  follow: { icon: UserPlus, tone: ACCENT },
  like: { icon: Heart, tone: DANGER },
  comment: { icon: MessageCircle, tone: OK },
};

const FALLBACK: Look = { icon: Bell, tone: ACCENT };

/** El cuadrito de color con el ícono del aviso. */
export function NoticeIcon({ kind, icon, className }: { kind: NoticeKind; icon?: SocialIcon; className?: string }) {
  const look = (kind === 'social' && icon ? SOCIAL[icon] : KINDS[kind]) ?? FALLBACK;
  const Icon = look.icon;
  return (
    <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', look.tone, className)} aria-hidden="true">
      <Icon className="size-5" />
    </span>
  );
}
