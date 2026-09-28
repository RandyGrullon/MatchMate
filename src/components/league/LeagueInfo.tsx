import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarDays, CalendarRange, Clock, Info, LogIn, MapPin, MessageCircle, UserPlus, UserRound } from 'lucide-react';
import { displayName, useAuth } from '../../lib/auth';
import { joinLeague } from '../../lib/data/leagues';
import { usePlayers } from '../../lib/data/players';
import { formatDate, formatDateLong } from '../../lib/format';
import { useLeagueCtx, whatsappUrl } from '../../lib/league';
import type { League } from '../../lib/types';
import { useAction, useFeedback } from '../feedback';
import { Button, Card, cx } from '../ui';
import { freePlayers, guessPlayer, infoRows, joinLabel, peopleWord, type InfoKey, type InfoRow } from './logic';
import { WhoAreYouModal, type WhoChoice } from './WhoAreYou';

const ICONS: Record<InfoKey, ReactNode> = {
  venue: <MapPin className="size-4" />,
  schedule: <Clock className="size-4" />,
  season: <CalendarRange className="size-4" />,
  date: <CalendarDays className="size-4" />,
  contact: <UserRound className="size-4" />,
};

export const INFO_FORMAT = { date: formatDate, longDate: formatDateLong };

/** Lo que tiene la liga de esto: lugar, cuándo juegan, temporada (o fecha del torneo) y contacto. */
export const leagueInfo = (league: League) => infoRows(league, INFO_FORMAT);

/** Botón de WhatsApp al contacto de la liga, con un saludo ya escrito. */
export function WhatsAppLink({ phone, leagueName, className }: { phone: string; leagueName: string; className?: string }) {
  return (
    <a
      href={whatsappUrl(phone, `Hola, te escribo por ${leagueName} (MatchMate).`)}
      target="_blank"
      rel="noreferrer"
      className={cx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-fg transition hover:bg-surface-2 active:scale-[0.97]',
        className,
      )}
    >
      <MessageCircle className="size-4 text-ok" /> WhatsApp
    </a>
  );
}

/** Filas de datos (lugar, horario…) con su icono; el contacto, con su botón de WhatsApp. `extra` va al final. */
export function InfoList({ rows, leagueName, extra, className }: { rows: readonly InfoRow[]; leagueName: string; extra?: ReactNode; className?: string }) {
  if (!rows.length && !extra) return null;
  return (
    <dl className={cx('grid gap-2.5 text-left text-sm sm:grid-cols-2', className)}>
      {rows.map((r) => (
        <div key={r.key} className={cx('flex items-start gap-2.5', r.key === 'contact' && 'sm:col-span-2')}>
          <span className="mt-0.5 text-accent">{ICONS[r.key]}</span>
          <div className="min-w-0 flex-1">
            <dt className="text-xs text-muted">{r.label}</dt>
            <dd className="break-words">{r.value}</dd>
          </div>
          {r.phone && <WhatsAppLink phone={r.phone} leagueName={leagueName} className="self-center" />}
        </div>
      ))}
      {extra}
    </dl>
  );
}

/** Una fila más de datos (p. ej. cuántos son), con la misma forma. */
export function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-accent">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="break-words">{value}</dd>
      </div>
    </div>
  );
}

/** Las filas de los datos de la liga (sin tarjeta). */
export function LeagueInfoList({ league, className }: { league: League; className?: string }) {
  return <InfoList rows={leagueInfo(league)} leagueName={league.name} className={className} />;
}

/** «Sobre la liga»: para los miembros, al final del inicio (quien no es miembro los ve en la tarjeta para unirse). */
export function LeagueInfoCard() {
  const { league } = useLeagueCtx();
  if (!leagueInfo(league).length) return null;
  return (
    <Card className="flex flex-col gap-3 p-4" tour="datos-liga">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Info className="size-4 text-accent" /> {league.kind === 'torneo' ? 'Sobre el torneo' : 'Sobre la liga'}
      </h2>
      <LeagueInfoList league={league} />
    </Card>
  );
}

/**
 * Quien mira una liga pública sin ser miembro: los datos de la liga y «Unirme». Si el admin ya anotó jugadores sin
 * cuenta, primero «¿Quién eres?» (para no quedar dos veces en la tabla). Sin cuenta, lleva a crearla y vuelve aquí.
 */
export function JoinLeagueCard() {
  const { lid, league, base } = useLeagueCtx();
  const auth = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const { toast } = useFeedback();
  const players = usePlayers(lid);
  const free = useMemo(() => freePlayers(players.data), [players.data]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const people = peopleWord(league.sport);
  const torneo = league.kind === 'torneo';
  const next = encodeURIComponent(base);

  async function join(choice: WhoChoice) {
    if (!auth.user) return navigate(`/login?next=${next}`);
    setBusy(true);
    const pid = await run(() => joinLeague(lid, { uid: auth.user!.uid, name: displayName(auth) }, null, choice), `Te uniste a ${league.name}`);
    setBusy(false);
    if (pid === undefined) return;
    setAsking(false);
    if (choice && pid && pid !== choice) toast(`Ese ${people[0]} ya lo tomó otra cuenta: te dejamos uno nuevo. Si eras tú, avísale al admin.`);
  }

  function start() {
    if (!auth.user) return navigate(`/login?modo=registro&next=${next}`);
    if (free.length) setAsking(true);
    else void join(null);
  }

  return (
    <Card className="flex flex-col gap-4 p-4" tour="unirme">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Estás viendo {league.name}</p>
          <p className="text-sm text-muted">
            {torneo ? 'Únete para salir en la tabla del torneo y recibir los avisos.' : 'Únete para salir en la tabla, ver tus números y recibir los avisos de la liga.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <Button variant="primary" icon={<UserPlus className="size-4" />} loading={busy || (!!auth.user && players.loading)} onClick={start}>
            {joinLabel(league.kind)}
          </Button>
          {!auth.user && (
            <Link to={`/login?next=${next}`} className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-accent">
              <LogIn className="size-4" /> Ya tengo cuenta
            </Link>
          )}
        </div>
      </div>
      <LeagueInfoList league={league} className="border-t border-line pt-3" />
      <WhoAreYouModal
        open={asking}
        onClose={() => setAsking(false)}
        players={free}
        initial={guessPlayer(free, displayName(auth))}
        busy={busy}
        joinText={joinLabel(league.kind)}
        people={people}
        onJoin={join}
      />
    </Card>
  );
}
