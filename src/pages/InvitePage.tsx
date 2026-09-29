import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Ban, CircleCheck, Globe, Lock, LogIn, MailX, Ticket, Trophy, UserPlus, Users, X } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { respondErrorText, respondInvite, useInviteDetails, type InviteStatus, type LeagueInviteDetails } from '../lib/data/invites';
import { AppShell } from '../components/Shell';
import { BackLink } from '../components/BackLink';
import { useFeedback } from '../components/feedback';
import { INFO_FORMAT, InfoItem, InfoList } from '../components/league/LeagueInfo';
import { countLabel, guessPlayer, infoRows, peopleWord } from '../components/league/logic';
import { SportTheme } from '../components/league/SportTheme';
import { joinClaimMessage, WhoAreYouList, type WhoChoice } from '../components/league/WhoAreYou';
import {
  invitedByLine,
  inviteOutcome,
  inviteOutcomeOf,
  inviterText,
  joinedText,
  leagueNoun,
  leagueTypeLabel,
  respondedText,
} from '../components/notifications/inviteText';
import { Badge, Button, Card, Empty, Loading, LoadError } from '../components/ui';
import { SportBadge, SportIcon } from './sports/SportBits';

const linkBtn = 'inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition active:scale-[0.97]';

/**
 * Una invitación a una liga (/invitacion/<id>, el push y el aviso de la campana llevan aquí): quién invitó, la
 * liga (deporte, tipo, lugar, horario y cuántos son), «¿Quién eres?» si el admin ya anotó jugadores sin cuenta, y
 * Aceptar (entra a la liga, como con el código) o Rechazar. Solo la ve la cuenta invitada (el superadmin también,
 * pero sin poder responderla); si ya se respondió, dice cómo quedó.
 */
export default function InvitePage() {
  const { inviteId = '' } = useParams();
  const auth = useAuth();
  const details = useInviteDetails(auth.user ? inviteId : null);
  const d = details.data;

  if (auth.loading) return <Loading />;
  if (!auth.user) {
    const next = encodeURIComponent(`/invitacion/${inviteId}`);
    return (
      <AppShell>
        <Empty icon={<Ticket className="size-7" aria-hidden="true" />} title="Entra para ver tu invitación">
          Entra con la cuenta a la que te invitaron para unirte a la liga.
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to={`/login?next=${next}`} className={`${linkBtn} border border-line text-fg hover:bg-surface-2`}>
              <LogIn className="size-4" aria-hidden="true" /> Entrar
            </Link>
            <Link to={`/login?modo=registro&next=${next}`} className={`${linkBtn} bg-accent text-accent-fg`}>
              <UserPlus className="size-4" aria-hidden="true" /> Crear cuenta
            </Link>
          </div>
        </Empty>
      </AppShell>
    );
  }
  if (details.loading && !d) return <Loading />;

  return (
    <AppShell>
      <BackLink fallback="/avisos" className="-ml-2 mb-2 flex size-11 items-center justify-center p-0" />
      {details.error && !d ? (
        <LoadError error={details.error} />
      ) : !d ? (
        <Empty icon={<MailX className="size-7" aria-hidden="true" />} title="Esta invitación no existe o no es para ti.">
          Revisa que entraste con la cuenta a la que te invitaron.
          <div className="mt-4 flex justify-center">
            <Link to="/ligas" className={`${linkBtn} font-semibold text-accent hover:bg-accent-soft`}>
              Ver ligas
            </Link>
          </div>
        </Empty>
      ) : !d.mine ? (
        <OtherInvite invite={d} />
      ) : d.status === 'pending' && !d.member ? (
        <PendingInvite key={d.id} invite={d} />
      ) : (
        <DecidedInvite invite={d} />
      )}
    </AppShell>
  );
}

const STATUS_WORD: Record<InviteStatus, string> = { pending: 'pendiente', accepted: 'aceptada', declined: 'rechazada', cancelled: 'retirada' };

/** La de otra cuenta (el superadmin la puede abrir): cómo está, sin Aceptar ni Rechazar (solo la responde la invitada). */
function OtherInvite({ invite: d }: { invite: LeagueInviteDetails }) {
  const who = inviterText(d.invitedBy);
  const noun = leagueNoun(d.league.kind);
  const line = `${who ? `${who} invitó` : 'Invitaron'} a otra cuenta a ${d.league.name || noun}. Está ${STATUS_WORD[d.status]}: solo esa cuenta la puede responder.`;
  return (
    <Empty icon={<Ticket className="size-7" />} title="Esta invitación es de otra cuenta">
      {line}
      {d.league.id && (
        <div className="mt-4 flex justify-center">
          <Link to={`/l/${d.league.id}`} className={`${linkBtn} font-semibold text-accent hover:bg-accent-soft`}>
            Ir a {noun}
          </Link>
        </div>
      )}
    </Empty>
  );
}

/** Ya respondida, retirada o ya es miembro (o aceptó y ya salió): cómo quedó y a dónde ir. */
function DecidedInvite({ invite: d }: { invite: LeagueInviteDetails }) {
  const status = inviteOutcomeOf(d.status, d.member);
  const { title, body } = inviteOutcome(status, d.league.kind, d.league.name);
  const icon = status === 'accepted' ? <CircleCheck className="size-7" /> : status === 'declined' ? <X className="size-7" /> : <Ban className="size-7" />;
  return (
    <Empty icon={icon} title={title}>
      {body}
      <div className="mt-4 flex justify-center">
        {status === 'accepted' && d.league.id ? (
          <Link to={`/l/${d.league.id}`} className={`${linkBtn} bg-accent font-semibold text-accent-fg`}>
            Ir a {leagueNoun(d.league.kind)}
          </Link>
        ) : (
          <Link to="/ligas" className={`${linkBtn} font-semibold text-accent hover:bg-accent-soft`}>
            Ver ligas
          </Link>
        )}
      </div>
    </Empty>
  );
}

/** Pendiente: la liga, «¿Quién eres?» y Aceptar / Rechazar. */
function PendingInvite({ invite: d }: { invite: LeagueInviteDetails }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const [choice, setChoice] = useState<WhoChoice | undefined>(undefined);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const l = d.league;
  const torneo = l.kind === 'torneo';
  const players = d.players;
  const me = displayName(auth);
  // La sugerencia: el único jugador libre con el mismo nombre de la cuenta (si hay).
  const suggested = useMemo<WhoChoice>(() => guessPlayer(players, me), [players, me]);
  const picked = choice === undefined ? suggested : choice;
  const pickedName = picked ? (players.find((p) => p.id === picked)?.name ?? null) : null;
  const rows = infoRows({ sport: l.sport, kind: l.kind, venue: l.venue, schedule: l.schedule, seasonStart: l.seasonStart, seasonEnd: l.seasonEnd }, INFO_FORMAT);

  async function respond(accept: boolean) {
    if (busy) return;
    setBusy(accept ? 'accept' : 'decline');
    try {
      const r = await respondInvite(d.id, accept, accept ? picked : null);
      if (r.status === 'accepted') {
        toast(joinedText(l.name));
        // Lo de «¿Quién eres?» solo si entró ahora: si ya estaba aceptada (otro teléfono, Avisos) no se pidió nada.
        const said = r.joined ? joinClaimMessage(picked, pickedName, r.playerId, r.claimId) : null;
        if (said) toast(said);
        navigate(`/l/${r.leagueId || l.id}`);
        return;
      }
      // Rechazada, o ya no valía: la pantalla pasa a decir cómo quedó.
      toast(respondedText(r.status, l.name), r.status === 'cancelled' ? 'error' : 'ok');
    } catch (e) {
      toast(respondErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SportTheme sport={l.sport}>
      <Card className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <SportIcon sport={l.sport} className="size-7" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="text-sm text-muted">
            {invitedByLine(d.invitedBy)} {torneo ? 'al torneo' : 'a la liga'}
          </p>
          <h1 className="text-xl font-bold tracking-tight break-words">{l.name || 'Una liga'}</h1>
          <div className="flex flex-wrap justify-center gap-1.5">
            {l.sport && <SportBadge sport={l.sport} />}
            <Badge tone="neutral">
              {torneo ? <Trophy className="size-3" /> : l.visibility === 'public' ? <Globe className="size-3" /> : <Lock className="size-3" />}
              {leagueTypeLabel(l.kind, l.visibility)}
            </Badge>
          </div>
        </div>

        <InfoList
          rows={rows}
          leagueName={l.name}
          className="w-full border-t border-line pt-4"
          extra={l.members > 0 ? <InfoItem icon={<Users className="size-4" />} label="Ya están" value={countLabel(l.members, ['miembro', 'miembros'])} /> : undefined}
        />

        <div className="flex w-full flex-col gap-4">
          {players.length > 0 && <WhoAreYouList players={players} value={picked} onChange={setChoice} people={peopleWord(l.sport)} />}
          <div className="flex flex-col gap-2">
            <Button variant="primary" className="h-11 w-full" loading={busy === 'accept'} disabled={!!busy} onClick={() => void respond(true)} icon={<UserPlus className="size-4" />}>
              <span className="min-w-0 truncate">{pickedName ? `Aceptar como ${pickedName}` : 'Aceptar'}</span>
            </Button>
            <Button className="h-11 w-full" loading={busy === 'decline'} disabled={!!busy} onClick={() => void respond(false)}>
              Rechazar
            </Button>
          </div>
        </div>
      </Card>
    </SportTheme>
  );
}
