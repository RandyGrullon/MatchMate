import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Ban, CircleCheck, ClipboardPen, MailX, Ticket, UserPlus, X } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { respondErrorText, respondInvite, useInviteDetails, type InviteStatus, type LeagueInviteDetails } from '../lib/data/invites';
import { AppShell } from '../components/Shell';
import { useFeedback } from '../components/feedback';
import { LeagueLogo } from '../components/home/LeagueCard';
import { INFO_FORMAT } from '../components/league/LeagueInfo';
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
  scorerInviteBody,
} from '../components/notifications/inviteText';
import { scorerReach, scorerReachForYou } from '../components/scorers/logic';
import { DeadInvite, InfoCard, InviteHero, heroArtClass } from '../components/screens/InviteBits';
import { ScreenTop, SignInCard, linkButton } from '../components/screens/ScreenBits';
import { Button, Card, Loading, LoadError } from '../components/ui';
import { SportIcon } from './sports/SportBits';
import { sportMeta } from '../sports/registry';

/**
 * Una invitación a una liga (/invitacion/<id>, el push y el aviso de la campana llevan aquí), rediseño «Calma y foco»:
 * «‹ Avisos», el logo, quién invitó y el nombre grande con «Boliche · Liga privada», los datos de la liga en filas
 * (lugar, horario, temporada y cuántos son), «¿Quién eres?» si el admin ya anotó jugadores sin cuenta, y un solo botón
 * «Aceptar» (entra a la liga, como con el código) con «Rechazar» debajo. Solo la ve la cuenta invitada (el superadmin
 * también, pero sin poder responderla); si ya se respondió, dice cómo quedó. Una invitación de anotador («te invitó a
 * anotar en Copa Aniversario») dice hasta dónde anota y si también juega; «Aceptar y anotar» lleva al torneo.
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
        <div className="mx-auto flex max-w-md flex-col px-2">
          <ScreenTop label="Avisos" fallback="/avisos" />
          <SignInCard
            className="mt-2"
            icon={<Ticket />}
            title="Entra para ver tu invitación"
            text="Entra con la cuenta a la que te invitaron."
            next={next}
          />
        </div>
      </AppShell>
    );
  }
  if (details.loading && !d) return <Loading />;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-md flex-col px-2">
        <ScreenTop label="Avisos" fallback="/avisos" />
        {details.error && !d ? (
          <LoadError error={details.error} />
        ) : !d ? (
          <DeadInvite icon={<MailX />} title="Esta invitación no existe o no es para ti." text="Revisa que entraste con la cuenta a la que te invitaron." />
        ) : !d.mine ? (
          <OtherInvite invite={d} />
        ) : d.status === 'pending' && !d.member ? (
          <PendingInvite key={d.id} invite={d} />
        ) : (
          <DecidedInvite invite={d} />
        )}
      </div>
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
    <DeadInvite
      icon={<Ticket />}
      title="Esta invitación es de otra cuenta"
      text={line}
      action={
        d.league.id ? (
          <Link to={`/l/${d.league.id}`} className={linkButton('quiet', 'w-full')}>
            Ir a {noun}
          </Link>
        ) : undefined
      }
    />
  );
}

/** Ya respondida, retirada o ya es miembro (o aceptó y ya salió): cómo quedó y a dónde ir. */
function DecidedInvite({ invite: d }: { invite: LeagueInviteDetails }) {
  const status = inviteOutcomeOf(d.status, d.member);
  const { title, body } = inviteOutcome(status, d.league.kind, d.league.name);
  const icon = status === 'accepted' ? <CircleCheck /> : status === 'declined' ? <X /> : <Ban />;
  return (
    <DeadInvite
      icon={icon}
      title={title}
      text={body}
      action={
        status === 'accepted' && d.league.id ? (
          <Link to={d.scorer?.path ?? `/l/${d.league.id}`} className={linkButton('primary', 'w-full')}>
            {d.scorer ? 'Ir a anotar' : `Ir a ${leagueNoun(d.league.kind)}`}
          </Link>
        ) : undefined
      }
    />
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
  // Invitación de anotador: «¿Quién eres?» solo si también la invitaron a jugar.
  const sc = d.scorer ?? null;
  const players = sc && !sc.asPlayer ? [] : d.players;
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
      const r = await respondInvite(d.id, accept, accept && players.length ? picked : null);
      if (r.status === 'accepted') {
        toast(r.scorer ? respondedText('accepted', l.name, r.scorer.title) : joinedText(l.name));
        // Lo de «¿Quién eres?» solo si entró ahora: si ya estaba aceptada (otro teléfono, Avisos) no se pidió nada.
        const said = r.joined && players.length ? joinClaimMessage(picked, pickedName, r.playerId, r.claimId) : null;
        if (said) toast(said);
        // La de anotador lleva al torneo donde lo invitaron.
        navigate(r.scorer?.path ?? `/l/${r.leagueId || l.id}`);
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

  const meta = sportMeta(l.sport);
  return (
    <SportTheme sport={l.sport}>
      <InviteHero
        art={
          <LeagueLogo path={l.logoPath} className={heroArtClass}>
            <div className={`${heroArtClass} flex items-center justify-center bg-accent-soft text-accent`}>
              <SportIcon sport={l.sport} className="size-10" />
            </div>
          </LeagueLogo>
        }
        kicker={sc ? `${invitedByLine(d.invitedBy)} a anotar en` : `${invitedByLine(d.invitedBy)} ${torneo ? 'al torneo' : 'a la liga'}`}
        title={sc ? sc.title || l.name || 'Un torneo' : l.name || 'Una liga'}
        sub={sc && sc.title && l.name && sc.title !== l.name ? l.name : undefined}
        meta={[meta?.short, leagueTypeLabel(l.kind, l.visibility)].filter(Boolean).join(' · ')}
      />

      {sc && (
        <p className="mx-1 mt-5 flex items-start gap-2.5 text-meta text-fg-2">
          <ClipboardPen className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          {scorerInviteBody(scorerReachForYou(scorerReach({ id: l.id, kind: l.kind, sport: l.sport })), sc.asPlayer)}
        </p>
      )}

      <InfoCard className="mt-6" rows={rows} leagueName={l.name} members={l.members > 0 ? countLabel(l.members, ['miembro', 'miembros']) : null} />

      <div className="mt-6 flex flex-col gap-5">
        {players.length > 0 && (
          <Card className="p-4">
            <WhoAreYouList players={players} value={picked} onChange={setChoice} people={peopleWord(l.sport)} />
          </Card>
        )}
        <div className="flex flex-col gap-2.5">
          <Button variant="primary" size="xl" className="w-full" loading={busy === 'accept'} disabled={!!busy} onClick={() => void respond(true)} icon={<UserPlus className="size-5" />}>
            {pickedName ? `Aceptar como ${pickedName}` : sc ? 'Aceptar y anotar' : 'Aceptar'}
          </Button>
          <Button variant="quiet" size="xl" className="w-full" loading={busy === 'decline'} disabled={!!busy} onClick={() => void respond(false)}>
            Rechazar
          </Button>
        </div>
      </div>
    </SportTheme>
  );
}
