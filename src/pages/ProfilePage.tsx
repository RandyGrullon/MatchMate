import { Link } from 'react-router';
import { LogIn, Settings, UserPlus } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../lib/data';
import { AppShell } from '../components/Shell';
import { Avatar } from '../components/Avatar';
import { GlobalStats } from '../components/GlobalStats';
import { Card, Empty, Loading, StatsSkeleton } from '../components/ui';

/** Perfil global: tus números sumando todas tus ligas y torneos (cada liga tiene además su propio perfil). */
export default function ProfilePage() {
  const auth = useAuth();
  const memberships = useMyMemberships(auth.user?.uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));

  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <AppShell>
        <Empty icon={<UserPlus className="size-8" />} title="Tu perfil de jugador">
          Entra para ver tus estadísticas de todas tus ligas juntas.
          <div className="mt-4 flex justify-center gap-2">
            <Link to="/login?next=%2Fperfil" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2">
              <LogIn className="size-4" /> Entrar
            </Link>
            <Link to="/login?modo=registro&next=%2Fperfil" className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg">
              <UserPlus className="size-4" /> Crear cuenta
            </Link>
          </div>
        </Empty>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <Card className="flex items-center gap-4 p-5">
          <Avatar name={displayName(auth)} className="size-14 text-lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold tracking-tight">{displayName(auth)}</h1>
            <p className="text-sm text-muted">Tu perfil global · todas tus ligas</p>
          </div>
          <Link
            to="/cuenta"
            aria-label="Configuración de la cuenta"
            title="Configuración de la cuenta"
            className="inline-flex size-9 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Settings className="size-5" />
          </Link>
        </Card>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Mis estadísticas</h2>
            <p className="text-sm text-muted">Todas tus ligas y torneos juntos. Solo cuentan los juegos que ya cuentan en cada liga.</p>
          </div>
          {memberships.loading || leagues.loading ? <StatsSkeleton /> : <GlobalStats memberships={memberships.data} leagues={leagues.data} />}
        </section>
      </div>
    </AppShell>
  );
}
