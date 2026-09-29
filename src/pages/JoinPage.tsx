import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Baby, Globe, Lock, LogIn, Ticket, Trophy, UserPlus, Users } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { getInvite, getInviteDetails, joinLeagueClaim, useLeague, type InviteDetails } from '../lib/data/leagues';
import { useMembership } from '../lib/data/members';
import type { Invite } from '../lib/types';
import { sportMeta } from '../sports/registry';
import { BackLink } from '../components/BackLink';
import { LeagueLogo } from '../components/home/LeagueCard';
import { AppShell } from '../components/Shell';
import { SportSplash } from '../components/splash/SportSplash';
import { useAction, useFeedback } from '../components/feedback';
import { Badge, Button, Card, Empty, Loading } from '../components/ui';
import { INFO_FORMAT, InfoItem, InfoList } from '../components/league/LeagueInfo';
import { countLabel, guessPlayer, infoRows, joinLabel, peopleWord } from '../components/league/logic';
import { SportTheme } from '../components/league/SportTheme';
import { joinClaimMessage, WhoAreYouList, type WhoChoice } from '../components/league/WhoAreYou';
import { SportBadge } from './sports/SportBits';

interface Found {
  invite: Invite | null;
  /** Con sesión: lugar, horario, miembros y los jugadores sin cuenta («¿Quién eres?»). */
  details: InviteDetails | null;
}

/** Lo que dice el link: con sesión, todo (invite_details); sin sesión, lo básico (invite_preview). */
async function findInvite(code: string, signedIn: boolean): Promise<Found> {
  if (signedIn) {
    try {
      const details = await getInviteDetails(code);
      const invite: Invite | null = details
        ? {
            id: code.trim().toUpperCase(),
            leagueId: details.leagueId,
            leagueName: details.name,
            sport: details.sport,
            kind: details.kind,
            visibility: details.visibility,
            logoPath: details.logoPath,
          }
        : null;
      return { invite, details };
    } catch (e) {
      // Cuenta bloqueada o muchos intentos: al menos lo básico.
      console.warn('[invitación]', e);
    }
  }
  return { invite: await getInvite(code).catch(() => null), details: null };
}

/**
 * Link o QR de invitación: /unirse/<código> (y `?soy=<jugador>` desde el perfil de un jugador sin cuenta). Muestra
 * el deporte, el lugar, el horario y cuántos son; con sesión, «¿Quién eres?» si el admin ya anotó jugadores sin
 * cuenta, para unirse como uno de ellos en vez de crear otro con el mismo nombre.
 */
export default function JoinPage() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const { toast } = useFeedback();
  const [found, setFound] = useState<Found | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<WhoChoice | undefined>(undefined);
  const uid = auth.user?.uid;
  const invite = found?.invite ?? null;
  const details = found?.details ?? null;
  const membership = useMembership(invite?.leagueId, uid);
  // Sin sesión, una liga pública se puede leer: así se ve el lugar y el horario antes de crear la cuenta.
  const openLeague = useLeague(!uid && invite?.visibility === 'public' ? invite.leagueId : undefined);

  useEffect(() => {
    if (auth.loading) return;
    let alive = true;
    setFound(undefined);
    void findInvite(code, !!uid).then((f) => alive && setFound(f));
    return () => {
      alive = false;
    };
  }, [code, uid, auth.loading]);

  const players = useMemo(() => details?.players ?? [], [details]);
  // La sugerencia: el del link (?soy=) si sigue libre; si no, el único con el mismo nombre de la cuenta.
  const suggested = useMemo<WhoChoice>(() => {
    const soy = params.get('soy');
    if (soy && players.some((p) => p.id === soy)) return soy;
    return guessPlayer(players, displayName(auth));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, params, auth.profile?.name, auth.user?.displayName]);
  const picked = choice === undefined ? suggested : choice;
  const pickedName = picked ? (players.find((p) => p.id === picked)?.name ?? null) : null;

  if (found === undefined || auth.loading || membership.loading) return <Loading />;
  if (invite && (membership.data || details?.member)) return <Navigate to={`/l/${invite.leagueId}`} replace />;

  const next = encodeURIComponent(`/unirse/${code}${params.get('soy') ? `?soy=${encodeURIComponent(params.get('soy')!)}` : ''}`);

  if (!invite) {
    return (
      <AppShell>
        <BackLink fallback="/" className="-ml-1.5 mb-3" />
        <Empty icon={<Ticket className="size-8" />} title="Esta invitación no sirve">
          El código no existe o lo cambiaron. Pídele a un admin de la liga el link nuevo.
          <div className="mt-4">
            <Link to="/ligas" className="font-medium text-accent">
              Ver ligas
            </Link>
          </div>
        </Empty>
      </AppShell>
    );
  }

  const meta = sportMeta(invite.sport);
  const torneo = invite.kind === 'torneo';
  const people = peopleWord(invite.sport);
  const info = details ?? openLeague.data;
  const rows = info
    ? infoRows(
        {
          sport: invite.sport,
          kind: invite.kind,
          venue: info.venue,
          schedule: info.schedule,
          seasonStart: info.seasonStart,
          seasonEnd: info.seasonEnd,
          // El contacto solo sale cuando la liga es pública (sin sesión se lee la liga completa).
          ...(openLeague.data ? { contactName: openLeague.data.contactName, contactPhone: openLeague.data.contactPhone } : {}),
        },
        INFO_FORMAT,
      )
    : [];
  const hasMinors = details?.hasMinors ?? openLeague.data?.hasMinors ?? false;

  async function join() {
    if (!invite || !auth.user) return;
    setBusy(true);
    const r = await run(
      () => joinLeagueClaim(invite.leagueId, { uid: auth.user!.uid, name: displayName(auth) }, invite.id, picked),
      `¡Bienvenido a ${invite.leagueName}!`,
    );
    setBusy(false);
    if (r === undefined) return;
    const said = joinClaimMessage(picked, pickedName, r.playerId, r.claimId);
    if (said) toast(said);
    navigate(`/l/${invite.leagueId}`);
  }

  return (
    <AppShell>
      <BackLink fallback="/" className="-ml-1.5 mb-3" />
      <SportTheme sport={invite.sport}>
        <Card className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
          {/* El logo de la liga si tiene (se ve también sin cuenta); si no, la escena del deporte. */}
          <LeagueLogo path={invite.logoPath} className="size-24 rounded-3xl">
            {meta ? (
              <SportSplash scene={meta.scene} word={false} width={176} label={`Animación de ${meta.lower}`} />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <Ticket className="size-7" />
              </div>
            )}
          </LeagueLogo>
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm text-muted">Te invitaron {torneo ? 'al torneo' : 'a la liga'}</p>
            <h1 className="text-xl font-bold tracking-tight">{invite.leagueName}</h1>
            <div className="flex flex-wrap justify-center gap-1.5">
              {invite.sport && <SportBadge sport={invite.sport} />}
              <Badge tone="neutral">
                {torneo ? <Trophy className="size-3" /> : invite.visibility === 'public' ? <Globe className="size-3" /> : <Lock className="size-3" />}
                {torneo ? 'Torneo' : invite.visibility === 'public' ? 'Liga pública' : 'Liga privada'}
              </Badge>
            </div>
          </div>

          <InfoList
            rows={rows}
            leagueName={invite.leagueName}
            className="w-full border-t border-line pt-4"
            extra={details && details.members > 0 ? <InfoItem icon={<Users className="size-4" />} label="Ya están" value={countLabel(details.members, ['miembro', 'miembros'])} /> : undefined}
          />
          {hasMinors && (
            <p className="flex w-full items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-left text-xs text-muted">
              <Baby className="mt-0.5 size-4 shrink-0 text-accent" />
              {torneo ? 'Torneo con menores' : 'Liga con menores'}: privada, sin fotos ni comentarios. A los menores los registra un admin.
            </p>
          )}

          {auth.user ? (
            <div className="flex w-full flex-col gap-4">
              {players.length > 0 && <WhoAreYouList players={players} value={picked} onChange={setChoice} people={people} />}
              <Button variant="primary" className="w-full" loading={busy} onClick={join} icon={<UserPlus className="size-4" />}>
                <span className="min-w-0 truncate">{pickedName ? `Unirme como ${pickedName}` : joinLabel(invite.kind)}</span>
              </Button>
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <Link
                to={`/login?modo=registro&next=${next}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg"
              >
                <UserPlus className="size-4" /> Crear cuenta y unirme
              </Link>
              <Link
                to={`/login?next=${next}`}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2"
              >
                <LogIn className="size-4" /> Ya tengo cuenta
              </Link>
            </div>
          )}
        </Card>
      </SportTheme>
    </AppShell>
  );
}
