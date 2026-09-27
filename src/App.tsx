import { Navigate, Route, Routes, useParams } from 'react-router';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './lib/auth';
import { badConfig, firebaseConfigured } from './lib/firebase';
import { useLeagueCtx } from './lib/league';
import { FeedbackProvider } from './components/feedback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppRouter } from './components/GestureGuards';
import { NotificationsProvider } from './components/Notifications';
import { CreateMenuProvider } from './components/CreateMenu';
import { PwaPrompts } from './components/PwaPrompts';
import { TopLoader } from './components/ui';

// Cada pantalla se descarga al entrar: quien solo mira la clasificación no carga el panel del admin.
const LeagueShell = lazy(() => import('./components/LeagueShell'));
const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const LeaguesPage = lazy(() => import('./pages/LeaguesPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'));
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

function PlayerRoute() {
  const { playerId } = useParams();
  return <PlayerPage key={playerId} />;
}

function MissingConfig() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-sm">
      <h1 className="mb-2 text-lg font-semibold">Falta la configuración de Firebase</h1>
      <p className="text-muted">
        Revisa estas variables (vacías o con caracteres raros, como una clave copiada oculta con •••):
      </p>
      <ul className="my-3 list-disc pl-5 font-mono text-xs">
        {badConfig.map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
      <p className="text-muted">
        Corrígelas en <code>.env.local</code> o en Vercel → Settings → Environment Variables (ver <code>.env.example</code>) y
        vuelve a desplegar.
      </p>
    </div>
  );
}

export default function App() {
  if (!firebaseConfigured) return <MissingConfig />;
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
                    <Route path="/l/:lid" element={<LeagueShell />}>
                      <Route index element={<LeagueHome />} />
                      <Route path="ranking" element={<LeagueRanking />} />
                      <Route path="juegos" element={<GamesFeedPage />} />
                      <Route path="perfil" element={<LeagueProfilePage />} />
                      <Route path="admin" element={<AdminPage />} />
                      <Route path="e/:eventId" element={<EventPage />} />
                      <Route path="j/:playerId" element={<PlayerRoute />} />
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
