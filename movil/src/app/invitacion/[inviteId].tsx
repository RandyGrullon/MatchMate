import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ban, CircleCheck, ClipboardPen, MailX, Ticket, UserPlus, X } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { respondErrorText, respondInvite, useInviteDetails, type InviteStatus, type LeagueInviteDetails } from '@mm/lib/data/invites';
import { formatDate, formatDateLong } from '@mm/lib/format';
import { joinClaimMessage } from '@mm/components/claims/logic';
import { countLabel, guessPlayer, infoRows, peopleWord } from '@mm/components/league/logic';
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
} from '@mm/components/notifications/inviteText';
import { scorerReach, scorerReachForYou } from '@mm/components/scorers/logic';
import { sportMeta } from '@mm/sports/registry';
import { toast } from '@/components/feedback';
import { WhoAreYouList, type WhoChoice } from '@/components/league/WhoAreYou';
import { BackBar, Button, Card, Empty, LoadError, Loading, Screen, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';

const INFO_FORMAT = { date: formatDate, longDate: formatDateLong };
const STATUS_WORD: Record<InviteStatus, string> = { pending: 'pendiente', accepted: 'aceptada', declined: 'rechazada', cancelled: 'retirada' };

/**
 * Una invitación a una liga (/invitacion/<id>; InvitePage de la web): quién invitó, el nombre de la liga con su
 * deporte y tipo, sus datos, «¿Quién eres?» si el admin ya anotó jugadores sin cuenta, y «Aceptar» con «Rechazar»
 * debajo. Si ya se respondió dice cómo quedó; la de otra cuenta solo dice cómo está. La de anotador dice hasta dónde
 * anota y «Aceptar y anotar» lleva al torneo.
 */
export default function InviteScreen() {
  const { inviteId = '' } = useLocalSearchParams<{ inviteId: string }>();
  const auth = useAuth();
  const c = useColors();
  const details = useInviteDetails(auth.user ? inviteId : null);
  const d = details.data;

  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <Screen>
        <BackBar label="Avisos" fallback="/avisos" />
        <Empty
          icon={<Ticket size={28} color={c.accent} />}
          title="Entra para ver tu invitación"
          text="Entra con la cuenta a la que te invitaron."
          action={
            <Button variant="primary" full onPress={() => router.push('/login')}>
              Entrar
            </Button>
          }
        />
      </Screen>
    );
  }
  if (details.loading && !d) return <Loading />;

  let body: ReactNode;
  if (details.error && !d) body = <LoadError error={details.error} />;
  else if (!d)
    body = <Empty icon={<MailX size={28} color={c.accent} />} title="Esta invitación no existe o no es para ti." text="Revisa que entraste con la cuenta a la que te invitaron." />;
  else if (!d.mine) body = <OtherInvite invite={d} />;
  else if (d.status === 'pending' && !d.member) body = <PendingInvite key={d.id} invite={d} />;
  else body = <DecidedInvite invite={d} />;

  return (
    <Screen>
      <BackBar label="Avisos" fallback="/avisos" />
      {body}
    </Screen>
  );
}

/** La de otra cuenta (el superadmin la puede abrir): cómo está, sin Aceptar ni Rechazar. */
function OtherInvite({ invite: d }: { invite: LeagueInviteDetails }) {
  const c = useColors();
  const who = inviterText(d.invitedBy);
  const noun = leagueNoun(d.league.kind);
  const line = `${who ? `${who} invitó` : 'Invitaron'} a otra cuenta a ${d.league.name || noun}. Está ${STATUS_WORD[d.status]}: solo esa cuenta la puede responder.`;
  return (
    <Empty
      icon={<Ticket size={28} color={c.accent} />}
      title="Esta invitación es de otra cuenta"
      text={line}
      action={
        d.league.id ? (
          <Button full onPress={() => openLink(`/l/${d.league.id}`)}>
            {`Ir a ${noun}`}
          </Button>
        ) : undefined
      }
    />
  );
}

/** Ya respondida, retirada o ya es miembro: cómo quedó y a dónde ir. */
function DecidedInvite({ invite: d }: { invite: LeagueInviteDetails }) {
  const c = useColors();
  const status = inviteOutcomeOf(d.status, d.member);
  const { title, body } = inviteOutcome(status, d.league.kind, d.league.name);
  const icon = status === 'accepted' ? <CircleCheck size={28} color={c.accent} /> : status === 'declined' ? <X size={28} color={c.accent} /> : <Ban size={28} color={c.accent} />;
  return (
    <Empty
      icon={icon}
      title={title}
      text={body}
      action={
        status === 'accepted' && d.league.id ? (
          <Button variant="primary" full onPress={() => openLink(d.scorer?.path ?? `/l/${d.league.id}`)}>
            {d.scorer ? 'Ir a anotar' : `Ir a ${leagueNoun(d.league.kind)}`}
          </Button>
        ) : undefined
      }
    />
  );
}

/** Pendiente: la liga, «¿Quién eres?» y Aceptar / Rechazar. */
function PendingInvite({ invite: d }: { invite: LeagueInviteDetails }) {
  const auth = useAuth();
  const c = useColors();
  const [choice, setChoice] = useState<WhoChoice | undefined>(undefined);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const l = d.league;
  const torneo = l.kind === 'torneo';
  // Invitación de anotador: «¿Quién eres?» solo si también la invitaron a jugar.
  const sc = d.scorer ?? null;
  const players = useMemo(() => (sc && !sc.asPlayer ? [] : d.players), [sc, d.players]);
  const me = displayName(auth);
  const suggested = useMemo<WhoChoice>(() => guessPlayer(players, me), [players, me]);
  const picked = choice === undefined ? suggested : choice;
  const pickedName = picked ? (players.find((p) => p.id === picked)?.name ?? null) : null;
  const rows = infoRows({ sport: l.sport, kind: l.kind, venue: l.venue, schedule: l.schedule, seasonStart: l.seasonStart, seasonEnd: l.seasonEnd }, INFO_FORMAT);
  const meta = sportMeta(l.sport);
  const Icon = meta?.icon;

  async function respond(accept: boolean) {
    if (busy) return;
    setBusy(accept ? 'accept' : 'decline');
    try {
      const r = await respondInvite(d.id, accept, accept && players.length ? picked : null);
      if (r.status === 'accepted') {
        toast(r.scorer ? respondedText('accepted', l.name, r.scorer.title) : joinedText(l.name));
        // Lo de «¿Quién eres?» solo si entró ahora.
        const said = r.joined && players.length ? joinClaimMessage(picked, pickedName, r.playerId, r.claimId) : null;
        if (said) toast(said);
        openLink(r.scorer?.path ?? `/l/${r.leagueId || l.id}`);
        return;
      }
      toast(respondedText(r.status, l.name), r.status === 'cancelled' ? 'error' : 'ok');
    } catch (e) {
      toast(respondErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 20 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ width: 88, height: 88, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
          {Icon ? <Icon size={40} color={c.accent} /> : null}
        </View>
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          {sc ? `${invitedByLine(d.invitedBy)} a anotar en` : `${invitedByLine(d.invitedBy)} ${torneo ? 'al torneo' : 'a la liga'}`}
        </Txt>
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {sc ? sc.title || l.name || 'Un torneo' : l.name || 'Una liga'}
        </Txt>
        {!!(sc && sc.title && l.name && sc.title !== l.name) && <Txt tone="fg2">{l.name}</Txt>}
        <Txt variant="meta" tone="muted">
          {[meta?.short, leagueTypeLabel(l.kind, l.visibility)].filter(Boolean).join(' · ')}
        </Txt>
      </View>

      {sc && (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <ClipboardPen size={20} color={c.accent} />
          <Txt tone="fg2" style={{ flex: 1 }}>
            {scorerInviteBody(scorerReachForYou(scorerReach({ id: l.id, kind: l.kind, sport: l.sport })), sc.asPlayer)}
          </Txt>
        </View>
      )}

      {(rows.length > 0 || l.members > 0) && (
        <Card style={{ gap: 12 }}>
          {rows.map((r) => (
            <View key={r.key} style={{ gap: 2 }}>
              <Txt variant="meta" tone="muted">
                {r.label}
              </Txt>
              <Txt>{r.value}</Txt>
            </View>
          ))}
          {l.members > 0 && (
            <View style={{ gap: 2 }}>
              <Txt variant="meta" tone="muted">
                Ya están
              </Txt>
              <Txt>{countLabel(l.members, ['miembro', 'miembros'])}</Txt>
            </View>
          )}
        </Card>
      )}

      {players.length > 0 && (
        <Card>
          <WhoAreYouList players={players} value={picked} onChange={setChoice} people={peopleWord(l.sport)} />
        </Card>
      )}

      <View style={{ gap: 10 }}>
        <Button variant="primary" size="xl" full loading={busy === 'accept'} disabled={!!busy} onPress={() => void respond(true)} icon={<UserPlus size={20} color={c.accentFg} />}>
          {pickedName ? `Aceptar como ${pickedName}` : sc ? 'Aceptar y anotar' : 'Aceptar'}
        </Button>
        <Button size="xl" full loading={busy === 'decline'} disabled={!!busy} onPress={() => void respond(false)}>
          Rechazar
        </Button>
      </View>
    </View>
  );
}
