import { Navigate, Route, Routes, useParams } from 'react-router';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { useLeagueCtx } from './lib/league';
import { SportRoute } from './sports/screens';
import { FeedbackProvider } from './components/feedback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppRouter } from './components/GestureGuards';
import { NotificationsProvider } from './components/Notifications';
import { CreateMenuProvider } from './components/CreateMenu';
import { PwaPrompts } from './components/PwaPrompts';
import { Loading, TopLoader } from './components/ui';

// Cada pantalla se descarga al entrar: quien solo mira la clasificación no carga el panel del admin.
const LeagueShell = lazy(() => import('./components/LeagueShell'));
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const LeaguesPage = lazy(() => import('./pages/LeaguesPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'));
const SplashPreviewPage = lazy(() => import('./pages/SplashPreviewPage'));
const LeagueHome = lazy(() => import('./pages/LeagueHomePage'));
const EventPage = lazy(() => import('./pages/EventPage'));
const PlayerPage = lazy(() => import('./pages/PlayerPage'));
const LeagueProfilePage = lazy(() => import('./pages/LeagueProfilePage'));
const RankingPage = lazy(() => import('./pages/RankingPage'));
const GamesFeedPage = lazy(() => import('./pages/GamesFeedPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

/** Un torneo sin liga no tiene ranking de temporada: vuelve al torneo. */
function LeagueRanking() {
  const { league, base } = useLeagueCtx();
  return league.kind === 'torneo' ? <Navigate to={base} replace /> : <RankingPage />;
}

/** Solo para el superadmin (igual que SuperAdminPage): los demás vuelven a Eventos. */
function SuperOnly({ children }: { children: ReactNode }) {
  const { isSuper, loading } = useAuth();
  if (loading) return <Loading />;
  return isSuper ? children : <Navigate to="/ligas" replace />;
}

function PlayerRoute() {
  const { playerId } = useParams();
  return <PlayerPage key={playerId} />;
}

export default function App() {
  // Sin Supabase configurado la app corre en modo local (PGlite en el navegador): no hay pantalla de error.
  return (
    <ErrorBoundary>
      <AuthProvider>
        <FeedbackProvider>
          <AppRouter>
            <NotificationsProvider>
              <CreateMenuProvider>
                <Suspense fallback={<TopLoader />}>
                  <Routes>
                    <Route index element={<HomePage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/ligas" element={<LeaguesPage />} />
                    <Route path="/unirse/:code" element={<JoinPage />} />
                    <Route path="/perfil" element={<ProfilePage />} />
                    <Route path="/cuenta" element={<AccountPage />} />
                    <Route path="/superadmin" element={<SuperAdminPage />} />
                    <Route
                      path="/superadmin/marca"
                      element={
                        <SuperOnly>
                          <SplashPreviewPage />
                        </SuperOnly>
                      }
                    />
                    <Route path="/l/:lid" element={<LeagueShell />}>
                      {/* Cada ruta muestra la pantalla del deporte de la liga (el boliche, las de siempre). */}
                      <Route index element={<SportRoute slot="Home" bowling={<LeagueHome />} />} />
                      <Route path="ranking" element={<SportRoute slot="Standings" bowling={<LeagueRanking />} />} />
                      <Route path="juegos" element={<SportRoute slot="Feed" bowling={<GamesFeedPage />} />} />
                      <Route path="perfil" element={<SportRoute slot="MyProfile" bowling={<LeagueProfilePage />} />} />
                      <Route path="admin" element={<AdminPage />} />
                      <Route path="e/:eventId" element={<EventPage />} />
                      <Route path="j/:playerId" element={<SportRoute slot="Player" bowling={<PlayerRoute />} />} />
                      <Route path="*" element={<Navigate to="." replace />} />
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </CreateMenuProvider>
            </NotificationsProvider>
            <PwaPrompts />
          </AppRouter>
        </FeedbackProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
