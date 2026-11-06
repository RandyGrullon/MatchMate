import {
  Award,
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
  MailPlus,
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

/**
 * El ícono y el color de cada aviso. Lo usan NoticeIcon de la web y el de la app del teléfono (allá `lucide-react` es
 * `lucide-react-native`: los mismos nombres).
 */
export type NoticeTone = 'accent' | 'warn' | 'ok' | 'danger';

export interface NoticeLook {
  icon: LucideIcon;
  tone: NoticeTone;
}

/** Ícono y color de cada tipo de aviso. */
const KINDS: Record<NoticeKind, NoticeLook> = {
  torneo: { icon: Megaphone, tone: 'accent' },
  'torneo-hoy': { icon: Trophy, tone: 'warn' },
  practica: { icon: CalendarDays, tone: 'accent' },
  aprobado: { icon: CheckCircle2, tone: 'ok' },
  rechazado: { icon: XCircle, tone: 'danger' },
  'por-aprobar': { icon: Inbox, tone: 'warn' },
  reaccion: { icon: PartyPopper, tone: 'accent' },
  comentario: { icon: MessageCircle, tone: 'ok' },
  sugerencia: { icon: Lightbulb, tone: 'warn' },
  'partido-hoy': { icon: CalendarCheck, tone: 'accent' },
  'por-confirmar': { icon: ClipboardCheck, tone: 'warn' },
  reclamo: { icon: ShieldAlert, tone: 'danger' },
  'cambio-hora': { icon: CalendarClock, tone: 'warn' },
  aplazado: { icon: CalendarX2, tone: 'warn' },
  ronda: { icon: MapPin, tone: 'ok' },
  reto: { icon: Swords, tone: 'accent' },
  social: { icon: Heart, tone: 'danger' },
};

/** Los sociales de afuera: te siguieron, les gustó tu juego, lo comentaron, te invitaron a una liga o te ganaste una insignia. */
const SOCIAL: Record<SocialIcon, NoticeLook> = {
  follow: { icon: UserPlus, tone: 'accent' },
  like: { icon: Heart, tone: 'danger' },
  badge: { icon: Award, tone: 'warn' },
  comment: { icon: MessageCircle, tone: 'ok' },
  invite: { icon: MailPlus, tone: 'accent' },
};

const FALLBACK: NoticeLook = { icon: Bell, tone: 'accent' };

export function noticeLook(kind: NoticeKind, icon?: SocialIcon): NoticeLook {
  return (kind === 'social' && icon ? SOCIAL[icon] : KINDS[kind]) ?? FALLBACK;
}
