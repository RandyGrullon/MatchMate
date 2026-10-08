import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import { IdCard, Ticket, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { esportsErrorText, joinTeam, previewTeamCode, useMyEsportsTeams, type TeamPreview } from '../../lib/data/esports';
import { useMyGameIds } from '../../lib/data/esportsIds';
import { GAMES } from '../../sports/esports';
import { EsportsTint, GameMark, TeamLogo } from '../../components/esports/bits';
import { useFeedback } from '../../components/feedback';
import { useIsPro } from '../../components/mode';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { DeadInvite, InviteHero } from '../../components/screens/InviteBits';
import { SignInCard, linkButton } from '../../components/screens/ScreenBits';
import { AppShell } from '../../components/Shell';
import { Button, Card, Loading } from '../../components/ui';
import { idWord, joinState, membersText, myIdLink, teamTitle } from './logic';

/**
 * Entrar a un equipo con su link o QR (`/esports/unirse/:code`, §12.5), como JoinPage: «‹ Esports», el logo, «Te
 * invitaron al equipo», «{nombre} [TAG]», el juego y cuántos son. Sin cuenta: crear cuenta o entrar (vuelven aquí). Sin
 * su ID del juego: «Primero pon tu ID de {juego}» (vuelve aquí al guardarlo). Con todo: «Unirme al equipo» → la página
 * del equipo. Si ya estás, directo al equipo. Un código malo: «Esta invitación no sirve».
 */
export default function JoinTeamPage() {
  const { code = '' } = useParams();
  const auth = useAuth();
  const [preview, setPreview] = useState<TeamPreview | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setPreview(undefined);
    previewTeamCode(code)
      .then((p) => alive && setPreview(p))
      .catch((e: unknown) => {
        console.warn('[equipo por código]', e);
        if (alive) setPreview(null);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <AppShell>
      <EsportsTint>
        <JoinTeamView code={code} preview={auth.loading ? undefined : preview} uid={auth.user?.uid ?? null} />
      </EsportsTint>
    </AppShell>
  );
}

/** Lo que se ve con la vista previa del código ya leída (undefined = leyendo; null = no sirve). */
export function JoinTeamView({ code, preview, uid }: { code: string; preview: TeamPreview | null | undefined; uid: string | null }) {
  const pro = useIsPro();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useFeedback();
  const ids = useMyGameIds(uid);
  const teams = useMyEsportsTeams(uid);
  const [busy, setBusy] = useState(false);
  const myTeamIds = useMemo(() => new Set(teams.data.map((t) => t.id)), [teams.data]);
  const loading = !!uid && ((ids.loading && !ids.data.length) || (teams.loading && !teams.data.length));
  const state = joinState({ preview, signedIn: !!uid, loading, myTeamIds, ids: ids.data });

  if (state === 'loading') return <Loading />;
  if (state === 'member' && preview) return <Navigate to={`/esports/equipo/${preview.teamId}`} replace />;

  if (state === 'dead' || !preview) {
    return (
      <div className="flex flex-col px-2">
        <LeagueTopBar to="/esports" label="Esports" />
        <DeadInvite
          icon={<Ticket />}
          title="Esta invitación no sirve"
          text="El código no existe o lo cambiaron. Pídele el link nuevo al capitán del equipo."
          action={
            <Link to="/esports" className={linkButton('quiet', 'w-full')}>
              Ver esports
            </Link>
          }
        />
      </div>
    );
  }

  const meta = GAMES[preview.game];
  const here = `/esports/unirse/${encodeURIComponent(code)}`;

  async function join() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const r = await joinTeam(code);
      if (!r) {
        toast('Ese código ya no sirve. Pídele el link nuevo al capitán.', 'error');
        setBusy(false);
        return;
      }
      toast(`¡Bienvenido a ${preview.name}!`);
      navigate(`/esports/equipo/${r.teamId}`, { replace: true });
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, preview.game, 'equipo'), 'error');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-2">
      <LeagueTopBar to="/esports" label="Esports" />
      <InviteHero
        art={<TeamLogo path={preview.logoPath} name={preview.name} tag={preview.tag} className="size-24" />}
        kicker="Te invitaron al equipo"
        title={teamTitle(preview)}
        sub={
          <span className="inline-flex items-center gap-2">
            <GameMark game={preview.game} size="sm" />
            {meta.name}
          </span>
        }
        meta={membersText(preview.memberCount)}
      />

      {state === 'signin' && (
        <SignInCard
          className="mt-6"
          icon={<Users />}
          title="Entra para unirte al equipo"
          text={`Con tu cuenta y tu ${idWord(meta.idInfo.label)} entras al equipo y te inscribes en sus torneos.`}
          next={encodeURIComponent(location.pathname + location.search)}
          createLabel="Crear cuenta y unirme"
          loginLabel="Ya tengo cuenta"
        />
      )}

      {state === 'need_id' && (
        <Card className="mt-6 flex flex-col items-center px-5 pt-7 pb-5 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <IdCard className="size-7" />
          </span>
          <h2 className="mt-4 text-card-title">Primero pon tu ID de {meta.name}</h2>
          <p className="mt-2 max-w-sm text-body text-muted">El equipo ve tu {idWord(meta.idInfo.label)} y tu rango. Al guardarlo vuelves aquí para unirte.</p>
          <Link to={myIdLink(preview.game, here)} className={linkButton('primary', 'mt-6 w-full')}>
            <span className="min-w-0 truncate">Poner mi ID</span>
          </Link>
        </Card>
      )}

      {state === 'ready' && (
        <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-8 w-full" loading={busy} onClick={() => void join()} icon={<UserPlus className="size-5" />}>
          Unirme al equipo
        </Button>
      )}
    </div>
  );
}
