import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { LogIn, Ticket, UserPlus } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { getInvite, joinLeague, useMembership } from '../lib/data';
import type { Invite } from '../lib/types';
import { BackLink } from '../components/BackLink';
import { AppShell } from '../components/Shell';
import { useAction } from '../components/feedback';
import { Button, Card, Empty, Loading } from '../components/ui';

/** Link o QR de invitación: /unirse/<código>. */
export default function JoinPage() {
  const { code = '' } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const membership = useMembership(invite?.leagueId, auth.user?.uid);

  useEffect(() => {
    let alive = true;
    getInvite(code)
      .then((i) => alive && setInvite(i))
      .catch(() => alive && setInvite(null));
    return () => {
      alive = false;
    };
  }, [code]);

  if (invite === undefined || auth.loading || membership.loading) return <Loading />;
  if (invite && membership.data) return <Navigate to={`/l/${invite.leagueId}`} replace />;

  const next = encodeURIComponent(`/unirse/${code}`);

  async function join() {
    if (!invite || !auth.user) return;
    setBusy(true);
    const ok = await run(async () => {
      await joinLeague(invite.leagueId, { uid: auth.user!.uid, name: displayName(auth) }, invite.id);
      return true;
    }, `¡Bienvenido a ${invite.leagueName}!`);
    setBusy(false);
    if (ok) navigate(`/l/${invite.leagueId}`);
  }

  return (
    <AppShell>
      <BackLink fallback="/" className="-ml-1.5 mb-3" />
      {!invite ? (
        <Empty icon={<Ticket className="size-8" />} title="Esta invitación no sirve">
          El código no existe o lo cambiaron. Pídele a un admin de la liga el link nuevo.
          <div className="mt-4">
            <Link to="/ligas" className="font-medium text-accent">
              Ver ligas
            </Link>
          </div>
        </Empty>
      ) : (
        <Card className="mx-auto flex max-w-sm flex-col items-center gap-4 p-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Ticket className="size-7" />
          </div>
          <div>
            <p className="text-sm text-muted">Te invitaron a</p>
            <h1 className="text-xl font-bold tracking-tight">{invite.leagueName}</h1>
          </div>
          {auth.user ? (
            <Button variant="primary" className="w-full" loading={busy} onClick={join} icon={<UserPlus className="size-4" />}>
              Unirme a la liga
            </Button>
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
      )}
    </AppShell>
  );
}
