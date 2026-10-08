import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarDays, CalendarRange, Clock, MapPin, UserRound, Users } from 'lucide-react';
import { sportMeta } from '../../sports/registry';
import { WhatsAppLink } from '../league/LeagueInfo';
import type { InfoKey, InfoRow } from '../league/logic';
import { Card, RowIcon, cx } from '../ui';
import { linkButton } from './ScreenBits';

/**
 * Las pantallas de entrar a una liga (el link o QR con el código, una invitación y el link para anotar) en el rediseño
 * «Calma y foco»: arriba el logo (o la escena del deporte), quién te invita y el nombre grande, con una línea («Boliche ·
 * Liga pública»); debajo los datos de la liga como filas de una tarjeta y al final un solo botón principal.
 */

/** El logo y el título centrados: «Te invitaron a la liga» + «Liga de los martes» + «Boliche · Liga pública». */
export function InviteHero({ art, kicker, title, sub, meta }: { art: ReactNode; kicker: ReactNode; title: ReactNode; sub?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      {art}
      <p className="mt-5 text-meta text-muted">{kicker}</p>
      <h1 className="mt-1 text-title break-words">{title}</h1>
      {sub && <p className="mt-1 text-body font-semibold break-words text-fg-2">{sub}</p>}
      {meta && <p className="mt-1.5 text-sm text-muted">{meta}</p>}
    </div>
  );
}

const ICONS: Record<InfoKey, ReactNode> = {
  venue: <MapPin className="size-5" />,
  schedule: <Clock className="size-5" />,
  season: <CalendarRange className="size-5" />,
  date: <CalendarDays className="size-5" />,
  contact: <UserRound className="size-5" />,
};

/** Una fila de datos de la tarjeta: el ícono, qué es (chico) y el dato; `trailing` a la derecha (WhatsApp). */
export function InfoLine({ icon, label, value, trailing }: { icon: ReactNode; label: string; value: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mm-row relative flex min-h-row items-center gap-3.5 py-2.5 pr-[18px] pl-5 text-left">
      <RowIcon>{icon}</RowIcon>
      <div className="min-w-0 flex-1">
        <dt className="text-[13px] text-muted">{label}</dt>
        <dd className="text-body font-semibold break-words">{value}</dd>
      </div>
      {trailing}
    </div>
  );
}

/**
 * Los datos de la liga (lugar, cuándo juegan, temporada o fecha, contacto con su WhatsApp) en una tarjeta, una fila cada
 * uno, y cuántos son (`members`). Sin nada que mostrar, nada.
 */
export function InfoCard({
  rows,
  leagueName,
  members,
  className,
}: {
  rows: readonly InfoRow[];
  leagueName: string;
  /** «Ya están: 12 miembros». */
  members?: string | null;
  className?: string;
}) {
  if (!rows.length && !members) return null;
  return (
    <Card className={cx('overflow-hidden', className)}>
      <dl>
        {rows.map((r) => (
          <InfoLine
            key={r.key}
            icon={ICONS[r.key]}
            label={r.label}
            value={r.value}
            trailing={r.phone ? <WhatsAppLink phone={r.phone} leagueName={leagueName} className="h-9 rounded-full" /> : undefined}
          />
        ))}
        {members && <InfoLine icon={<Users className="size-5" />} label="Ya están" value={members} />}
      </dl>
    </Card>
  );
}

/** El cuadro del logo o de la escena del deporte arriba de la pantalla (96 px). */
export const heroArtClass = 'size-24 rounded-3xl';

/** «Boliche · Liga pública», «Pádel · Liga privada», «Boliche · Torneo». */
export function leagueTypeLine(sport: string | null | undefined, kind: string | null | undefined, visibility: string | null | undefined): string {
  const word = kind === 'torneo' ? 'Torneo' : visibility === 'public' ? 'Liga pública' : 'Liga privada';
  const meta = sportMeta(sport);
  return meta ? `${meta.short} · ${word}` : word;
}

/**
 * Una invitación que no sirve o que ya se respondió (código cambiado, link vencido, de otra cuenta…): qué pasó en una
 * línea y a dónde ir (`action`; si no, «Ver ligas»).
 */
export function DeadInvite({ icon, title, text, action }: { icon: ReactNode; title: string; text: ReactNode; action?: ReactNode }) {
  return (
    <Card className="mt-2 flex flex-col items-center px-5 pt-7 pb-5 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent [&>svg]:size-7">
        {icon}
      </span>
      <h1 className="mt-4 text-card-title">{title}</h1>
      <p className="mt-2 max-w-sm text-body text-muted">{text}</p>
      <div className="mt-6 w-full">
        {action ?? (
          <Link to="/ligas" className={linkButton('quiet', 'w-full')}>
            Ver ligas
          </Link>
        )}
      </div>
    </Card>
  );
}
