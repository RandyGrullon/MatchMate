import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Check, Ticket, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { joinSquad, previewSquad, squadErrorText, squadPath, useMySquads, type SquadLite } from '../../lib/data/squads';
import { useIsPro } from '../../lib/useMode';
import { sportMeta } from '../../sports/registry';
import { useFeedback } from '../../components/feedback';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { DeadInvite, InviteHero } from '../../components/screens/InviteBits';
import { SignInCard, linkButton } from '../../components/screens/ScreenBits';
import { AppShell } from '../../components/Shell';
import { membersText, squadJoinState, squadTitle } from '../../components/squads/logic';
import { SquadLogo, SquadTint } from '../../components/squads/SquadBits';
import { Button, Card, Loading } from '../../components/ui';
import { SportIcon } from '../sports/SportBits';

/**
 * Entrar a un equipo con su link o QR (`/equipos/unirse/:code`): «‹ Equipos», el logo, «Te invitaron al equipo»,
 * «{nombre} [TAG]», el deporte y cuántos son. Sin cuenta: crear cuenta o entrar (vuelven aquí). Con cuenta: «Unirme al
 * equipo» → la página del equipo. Si ya estás: «Ya estás en este equipo» con el link. Un código malo: «Esta invitación
 * no sirve».
 */
export default function JoinSquadPage() {
  const { code = '' } = useParams();
  const auth = useAuth();
  const [preview, setPreview] = useState<SquadLite | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setPreview(undefined);
    previewSquad(code)
      .then((p) => alive && setPreview(p ?? null))
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
      <JoinSquadView code={code} preview={auth.loading ? undefined : preview} uid={auth.user?.uid ?? null} />
    </AppShell>
  );
}

/** Lo que se ve con la vista previa ya leída (undefined = leyendo; null = el código no sirve). */
export function JoinSquadView({ code, preview, uid }: { code: string; preview: SquadLite | null | undefined; uid: string | null }) {
  const pro = useIsPro();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useFeedback();
  const mine = useMySquads();
  const [busy, setBusy] = useState(false);
  const mySquadIds = useMemo(() => new Set(mine.data.map((s) => s.id)), [mine.data]);
  const state = squadJoinState({ preview, signedIn: !!uid, loading: !!uid && mine.loading && !mine.data.length, mySquadIds });

  if (state === 'loading') return <Loading />;

  if (state === 'dead' || !preview) {
    return (
      <div className="flex flex-col px-2">
        <LeagueTopBar to="/equipos" label="Equipos" />
        <DeadInvite
          icon={<Ticket />}
          title="Esta invitación no sirve"
          text="El código no existe o lo cambiaron. Pídele el link nuevo al capitán del equipo."
          action={
            <Link to="/equipos" className={linkButton('quiet', 'w-full')}>
              Ver equipos
            </Link>
          }
        />
      </div>
    );
  }

  const meta = sportMeta(preview.sport);

  async function join() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const r = await joinSquad(code);
      toast(`¡Bienvenido a ${preview.name}!`);
      navigate(squadPath(r.squadId), { replace: true });
    } catch (e) {
      console.error(e);
      toast(squadErrorText(e), 'error');
      setBusy(false);
    }
  }

  return (
    <SquadTint color={preview.color} sport={preview.sport}>
      <div className="mx-auto flex w-full max-w-md flex-col px-2">
        <LeagueTopBar to="/equipos" label="Equipos" />
        <InviteHero
          art={<SquadLogo squad={preview} className="size-24" />}
          kicker={state === 'member' ? 'Tu equipo' : 'Te invitaron al equipo'}
          title={squadTitle(preview)}
          sub={
            <span className="inline-flex items-center gap-2">
              <SportIcon sport={preview.sport} className="size-5 text-accent" />
              {[meta?.label ?? 'Otro deporte', preview.city].filter(Boolean).join(' · ')}
            </span>
          }
          meta={membersText(preview.members)}
        />

        {state === 'signin' && (
          <SignInCard
            className="mt-6"
            icon={<Users />}
            title="Entra para unirte al equipo"
            text="Con tu cuenta entras a la plantilla, ves el muro del equipo y juegas sus ligas."
            next={encodeURIComponent(location.pathname + location.search)}
            createLabel="Crear cuenta y unirme"
            loginLabel="Ya tengo cuenta"
          />
        )}

        {state === 'member' && (
          <Card className="mt-6 flex flex-col items-center px-5 pt-7 pb-5 text-center">
            <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
              <Check className="size-7" />
            </span>
            <h2 className="mt-4 text-card-title">Ya estás en este equipo</h2>
            <p className="mt-2 max-w-sm text-body text-muted">No hace falta el código: entra directo a la página del equipo.</p>
            <Link to={squadPath(preview.id)} className={linkButton('primary', 'mt-6 w-full')}>
              <span className="min-w-0 truncate">Ir al equipo</span>
            </Link>
          </Card>
        )}

        {state === 'ready' && (
          <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-8 w-full" loading={busy} onClick={() => void join()} icon={<UserPlus className="size-5" />}>
            Unirme al equipo
          </Button>
        )}
      </div>
    </SquadTint>
  );
}
