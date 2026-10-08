import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Baby, LogIn, Ticket, UserPlus } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { getInvite, getInviteDetails, joinLeagueClaim, useLeague, type InviteDetails } from '../lib/data/leagues';
import { useMembership } from '../lib/data/members';
import type { Invite } from '../lib/types';
import { sportMeta } from '../sports/registry';
import { LeagueLogo } from '../components/home/LeagueCard';
import { DeadInvite, InfoCard, InviteHero, heroArtClass, leagueTypeLine } from '../components/screens/InviteBits';
import { ScreenTop, linkButton } from '../components/screens/ScreenBits';
import { AppShell } from '../components/Shell';
import { SportSplash } from '../components/splash/SportSplash';
import { useAction, useFeedback } from '../components/feedback';
import { Button, Card, Loading } from '../components/ui';
import { INFO_FORMAT } from '../components/league/LeagueInfo';
import { countLabel, guessPlayer, infoRows, joinLabel, peopleWord } from '../components/league/logic';
import { SportTheme } from '../components/league/SportTheme';
import { joinClaimMessage, WhoAreYouList, type WhoChoice } from '../components/league/WhoAreYou';

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
 * Link o QR de invitación: /unirse/<código> (y `?soy=<jugador>` desde el perfil de un jugador sin cuenta), rediseño
 * «Calma y foco»: «‹ Ligas», el logo (o la escena del deporte), «Te invitaron a la liga» con el nombre grande y «Boliche ·
 * Liga pública»; los datos (lugar, horario, temporada, contacto y cuántos son) en filas, y un solo botón «Unirme». Con
 * sesión, «¿Quién eres?» si el admin ya anotó jugadores sin cuenta, para unirse como uno de ellos en vez de crear otro con
 * el mismo nombre. Sin sesión, «Crear cuenta y unirme» o «Ya tengo cuenta» (vuelven aquí).
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
        <div className="flex flex-col px-2">
          <ScreenTop label="Ligas" fallback="/ligas" />
          <DeadInvite icon={<Ticket />} title="Esta invitación no sirve" text="El código no existe o lo cambiaron. Pídele el link nuevo a quien organiza." />
        </div>
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
      <SportTheme sport={invite.sport}>
        <div className="mx-auto flex max-w-md flex-col px-2">
          <ScreenTop label="Ligas" fallback="/ligas" />
          <InviteHero
            art={
              // El logo de la liga si tiene (se ve también sin cuenta); si no, la escena del deporte.
              <LeagueLogo path={invite.logoPath} className={heroArtClass}>
                {meta ? (
                  <SportSplash scene={meta.scene} word={false} width={176} label={`Animación de ${meta.lower}`} />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    <Ticket className="size-7" />
                  </div>
                )}
              </LeagueLogo>
            }
            kicker={`Te invitaron ${torneo ? 'al torneo' : 'a la liga'}`}
            title={invite.leagueName}
            meta={leagueTypeLine(invite.sport, invite.kind, invite.visibility)}
          />

          <InfoCard
            className="mt-6"
            rows={rows}
            leagueName={invite.leagueName}
            members={details && details.members > 0 ? countLabel(details.members, ['miembro', 'miembros']) : null}
          />
          {hasMinors && (
            <p className="mx-1 mt-3 flex items-start gap-2 text-[13px] text-muted">
              <Baby aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
              {torneo ? 'Torneo con menores' : 'Liga con menores'}: privada, sin fotos ni comentarios. A los menores los registra un admin.
            </p>
          )}

          {auth.user ? (
            <div className="mt-6 flex flex-col gap-5">
              {players.length > 0 && (
                <Card className="p-4">
                  <WhoAreYouList players={players} value={picked} onChange={setChoice} people={people} />
                </Card>
              )}
              <Button variant="primary" size="xl" className="w-full" loading={busy} onClick={join} icon={<UserPlus className="size-5" />}>
                {pickedName ? `Unirme como ${pickedName}` : joinLabel(invite.kind)}
              </Button>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-2.5">
              <Link to={`/login?modo=registro&next=${next}`} className={linkButton('primary', 'w-full')}>
                <UserPlus aria-hidden="true" className="size-5" />
                <span className="min-w-0 truncate">Crear cuenta y unirme</span>
              </Link>
              <Link to={`/login?next=${next}`} className={linkButton('quiet', 'w-full')}>
                <LogIn aria-hidden="true" className="size-5" />
                <span className="min-w-0 truncate">Ya tengo cuenta</span>
              </Link>
            </div>
          )}
        </div>
      </SportTheme>
    </AppShell>
  );
}
