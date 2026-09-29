import { Link, useLocation } from 'react-router';
import { LogIn, Pencil, Settings, UserPlus } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../lib/data';
import { AppShell } from '../components/Shell';
import { ProfileStats } from '../components/GlobalStats';
import { ProfileView } from '../components/social/ProfileView';
import { Empty, Loading, StatsSkeleton } from '../components/ui';

const actionLink = 'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.97]';

/**
 * Tu perfil (/perfil): como te ven los demás (seguidores, seguidos, me gusta, tus juegos con sus me gusta y tus
 * números por deporte), más editar tu cuenta y tus números del boliche sumando todas tus ligas y torneos (cada
 * liga tiene además su propio perfil, con los números de su deporte).
 */
export default function ProfilePage() {
  const auth = useAuth();
  // Al entrar vuelve aquí con la pestaña y la insignia (el push de una insignia abre /perfil?tab=insignias&insignia=…).
  const here = useLocation();
  const next = encodeURIComponent(`/perfil${here.search}`);
  const memberships = useMyMemberships(auth.user?.uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));

  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <AppShell>
        <Empty icon={<UserPlus className="size-8" />} title="Tu perfil de jugador">
          Entra para ver tus juegos, tus seguidores y tus estadísticas de todas tus ligas juntas.
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to={`/login?next=${next}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2">
              <LogIn className="size-4" /> Entrar
            </Link>
            <Link to={`/login?modo=registro&next=${next}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg">
              <UserPlus className="size-4" /> Crear cuenta
            </Link>
          </div>
        </Empty>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ProfileView
        userId={auth.user.uid}
        fallbackName={displayName(auth)}
        skipBowlingStats
        actions={
          <>
            <Link to="/cuenta" className={`${actionLink} border border-line bg-surface text-fg hover:bg-surface-2`}>
              <Pencil className="size-4" aria-hidden="true" /> Editar perfil
            </Link>
            <Link
              to="/cuenta"
              aria-label="Configuración de la cuenta"
              title="Configuración de la cuenta"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:bg-surface-2 hover:text-fg"
            >
              <Settings className="size-5" aria-hidden="true" />
            </Link>
          </>
        }
        statsTop={
          memberships.loading || leagues.loading ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-bold tracking-tight">Mis estadísticas</h2>
              <StatsSkeleton />
            </section>
          ) : (
            <ProfileStats memberships={memberships.data} leagues={leagues.data} />
          )
        }
      />
    </AppShell>
  );
}
