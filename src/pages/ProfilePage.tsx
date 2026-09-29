import { Link, useLocation } from 'react-router';
import { ChevronRight, LogIn, Pencil, Search, Settings, UserPlus } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../lib/data';
import { getSport } from '../sports/registry';
import { AppShell } from '../components/Shell';
import { ProfileStats } from '../components/GlobalStats';
import { ProfileView } from '../components/social/ProfileView';
import { Card, Empty, Loading, StatsSkeleton } from '../components/ui';

const actionLink = 'inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.97]';
const iconLink =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-muted transition hover:bg-surface-2 hover:text-fg';

/** Debajo de los números del boliche: tus juegos sueltos (los de fuera de una liga o torneo) y anotar uno. */
function SoloGamesLink() {
  const Icon = getSport('bowling').icon;
  return (
    <Card className="overflow-hidden">
      <Link to="/juegos-sueltos" className="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Juegos sueltos</span>
          <span className="block text-xs text-muted">Boliche sin liga ni torneo: tus juegos y tu promedio</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </Link>
    </Card>
  );
}

/**
 * Tu perfil (/perfil): como te ven los demás (tu @usuario, seguidores, seguidos, me gusta, tus juegos con sus me
 * gusta y tus números por deporte), más editar tu cuenta, buscar personas (/buscar) y tus números del boliche
 * sumando todas tus ligas, torneos y juegos sueltos (cada liga tiene además su propio perfil, con los números de su
 * deporte), con el link a tus juegos sueltos.
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
        fallbackUsername={auth.profile?.username}
        skipBowlingStats
        actions={
          <>
            <Link to="/cuenta" className={`${actionLink} border border-line bg-surface text-fg hover:bg-surface-2`}>
              <Pencil className="size-4" aria-hidden="true" /> Editar perfil
            </Link>
            <Link to="/buscar" aria-label="Buscar personas" title="Buscar personas" className={iconLink}>
              <Search className="size-5" aria-hidden="true" />
            </Link>
            <Link to="/cuenta" aria-label="Configuración de la cuenta" title="Configuración de la cuenta" className={iconLink}>
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
            <>
              <ProfileStats memberships={memberships.data} leagues={leagues.data} />
              <SoloGamesLink />
            </>
          )
        }
      />
    </AppShell>
  );
}
