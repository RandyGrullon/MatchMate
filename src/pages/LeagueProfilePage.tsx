import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Eye, LogIn, RotateCcw, UserPlus, UserRound } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { ensurePlayer, joinLeague, useJoining } from '../lib/data';
import { useLeagueCtx } from '../lib/league';
import { useAction } from '../components/feedback';
import { Button, Empty, PageSkeleton } from '../components/ui';
import PlayerPage from './PlayerPage';

/**
 * "Mis juegos" dentro de la liga:
 * - miembro: su página de jugador (la cuenta es su jugador; si todavía no lo tiene, se le crea solo);
 * - sin ser miembro: unirse (pública) o pedir invitación (privada).
 */
export default function LeagueProfilePage() {
  const { lid, myPlayerId, member } = useLeagueCtx();
  const { user } = useAuth();
  const joining = useJoining(lid);
  if (myPlayerId) return <PlayerPage playerId={myPlayerId} />;
  // Recién unido: se le está creando su jugador.
  if (member && joining) return <PageSkeleton />;
  if (!user) return <SignInPrompt />;
  if (!member) return <NotMember />;
  return <PreparingPlayer />;
}

function SignInPrompt() {
  const location = useLocation();
  const next = encodeURIComponent(location.pathname);
  return (
    <Empty icon={<UserRound className="size-8" />} title="Tu perfil de jugador">
      Entra para ver tus números, confirmar asistencia y subir tus juegos.
      <div className="mt-4 flex justify-center gap-2">
        <Link to={`/login?next=${next}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2">
          <LogIn className="size-4" /> Entrar
        </Link>
        <Link to={`/login?modo=registro&next=${next}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg">
          <UserPlus className="size-4" /> Crear cuenta
        </Link>
      </div>
    </Empty>
  );
}

function NotMember() {
  const { lid, league } = useLeagueCtx();
  const auth = useAuth();
  const run = useAction();
  const [busy, setBusy] = useState(false);
  // Vino de "¿Eres tú? Crea tu cuenta" en la página de un jugador: se une como ese jugador (si sigue libre).
  const [params] = useSearchParams();
  const soy = params.get('soy');
  if (league.visibility === 'private') {
    return (
      <Empty icon={<Eye className="size-8" />} title="Estás viendo como superadmin">
        No eres miembro de esta liga privada. Para tener perfil aquí, pide el link de invitación.
      </Empty>
    );
  }
  async function join() {
    setBusy(true);
    await run(() => joinLeague(lid, { uid: auth.user!.uid, name: displayName(auth) }, null, soy), `Te uniste a ${league.name}`);
    setBusy(false);
  }
  return (
    <Empty icon={<UserPlus className="size-8" />} title={`Únete a ${league.name}`}>
      Entras como jugador: confirmas asistencia, anotas tus juegos y sales en el ranking.
      <div className="mt-4">
        <Button variant="primary" loading={busy} onClick={join} icon={<UserPlus className="size-4" />}>
          Unirme
        </Button>
      </div>
    </Empty>
  );
}

/**
 * Miembro que todavía no tiene su jugador (se unió antes de que entrar fuera jugar, o falló al crearse):
 * se le crea solo, con su cuenta.
 */
function PreparingPlayer() {
  const { lid, member } = useLeagueCtx();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!member) return;
    let alive = true;
    setFailed(false);
    ensurePlayer(lid, member.uid, member.name).catch((e) => {
      console.error(e);
      if (alive) setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [lid, member, attempt]);

  if (!failed) return <PageSkeleton />;
  return (
    <Empty icon={<UserRound className="size-8" />} title="No se pudo preparar tu perfil">
      Revisa tu conexión e inténtalo de nuevo.
      <div className="mt-4">
        <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={() => setAttempt((n) => n + 1)}>
          Intentar de nuevo
        </Button>
      </div>
    </Empty>
  );
}
