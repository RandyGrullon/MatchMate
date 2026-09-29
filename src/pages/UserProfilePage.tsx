import { Link, Navigate, useLocation, useParams } from 'react-router';
import { LogIn, UserPlus, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { AppShell } from '../components/Shell';
import { BackLink } from '../components/BackLink';
import { ProfileView } from '../components/social/ProfileView';
import { Empty, Loading } from '../components/ui';

/**
 * Perfil público de una cuenta (`/u/:userId`): sus deportes, seguidores, seguidos y me gusta, el botón Seguir y
 * sus juegos (con me gusta) y números por deporte. Lo que se ve lo decide la base: solo ligas que puedes ver y
 * nunca las de menores. Tu propio perfil va a `/perfil` (con editar y tu cuenta).
 */
export default function UserProfilePage() {
  const { userId } = useParams();
  const auth = useAuth();
  const { search } = useLocation();

  if (auth.loading) return <Loading />;
  if (!userId) {
    return (
      <AppShell>
        <Empty icon={<UserRound className="size-7" aria-hidden="true" />} title="No encontramos este perfil">
          <Link to="/" className="mt-2 inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-accent hover:bg-accent-soft">
            Volver al Home
          </Link>
        </Empty>
      </AppShell>
    );
  }
  // Tu propio perfil, con lo que pida el link (los push de insignias abren `/u/<tú>?tab=insignias`).
  if (auth.user?.uid === userId) return <Navigate to={{ pathname: '/perfil', search }} replace />;
  if (!auth.user) {
    const next = encodeURIComponent(`/u/${userId}${search}`);
    return (
      <AppShell>
        <Empty icon={<UserRound className="size-7" aria-hidden="true" />} title="Entra para ver este perfil">
          Con tu cuenta ves sus juegos, le das me gusta y lo sigues.
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to={`/login?next=${next}`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2">
              <LogIn className="size-4" aria-hidden="true" /> Entrar
            </Link>
            <Link to={`/login?modo=registro&next=${next}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg">
              <UserPlus className="size-4" aria-hidden="true" /> Crear cuenta
            </Link>
          </div>
        </Empty>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Otra cuenta desde una lista de seguidores: todo vuelve a empezar (pestaña, filtro, hoja). */}
      <ProfileView key={userId} userId={userId} back={<BackLink fallback="/" className="size-11 p-2.5" />} />
    </AppShell>
  );
}
