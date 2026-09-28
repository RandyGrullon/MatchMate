import { Navigate, Route, Routes, useLocation, useParams } from 'react-router';
import { lazy, Suspense, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { useLeagueCtx } from './lib/league';
import { installErrorReporting } from './lib/errorReport';
import { SportRoute } from './sports/screens';
import { FeedbackProvider } from './components/feedback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdultGate } from './components/AdultGate';
import { AppRouter } from './components/GestureGuards';
import { NotificationsProvider } from './components/Notifications';
import { CreateMenuProvider } from './components/CreateMenu';
import { PwaPrompts } from './components/PwaPrompts';
import { AppShell } from './components/Shell';
import { Loading, TopLoader } from './components/ui';

// Los errores de los teléfonos le llegan al dueño de la app (consola › Errores).
installErrorReporting();

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
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
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

/** El aviso de error de una pantalla de arriba va dentro del marco de la app: la barra de navegación sigue. */
const inAppFrame = (fallback: ReactNode) => <AppShell>{fallback}</AppShell>;

/**
 * Cada pantalla con su propio aviso de error: si una falla, la barra de navegación (y dentro de una liga, sus
 * pestañas) sigue ahí, y al ir a otra ruta se vuelve a intentar. `area` es el nombre en el reporte.
 * `framed`: pantallas de arriba (el aviso lleva el marco de la app); sin él, las de adentro de una liga (el
 * marco ya lo pone LeagueShell).
 */
function Screen({ area, framed, children }: { area: string; framed?: boolean; children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary area={area} resetKey={pathname} frame={framed ? inAppFrame : undefined}>
      {children}
    </ErrorBoundary>
  );
}

export default function App() {
  // Sin Supabase configurado la app corre en modo local (PGlite en el navegador): no hay pantalla de error.
  return (
    <ErrorBoundary area="app">
      <AuthProvider>
        <FeedbackProvider>
          <AppRouter>
            <NotificationsProvider>
              <CreateMenuProvider>
                <Suspense fallback={<TopLoader />}>
                  {/* «Tengo 18 años o más» una sola vez para quien entró con Google o viene de BowlingX. */}
                  <AdultGate>
                    <Routes>
                      <Route index element={<Screen area="home" framed><HomePage /></Screen>} />
                      <Route path="/login" element={<Screen area="login" framed><LoginPage /></Screen>} />
                      <Route path="/ligas" element={<Screen area="ligas" framed><LeaguesPage /></Screen>} />
                      <Route path="/unirse/:code" element={<Screen area="unirse" framed><JoinPage /></Screen>} />
                      <Route path="/perfil" element={<Screen area="perfil" framed><ProfilePage /></Screen>} />
                      <Route path="/cuenta" element={<Screen area="cuenta" framed><AccountPage /></Screen>} />
                      <Route path="/privacidad" element={<Screen area="privacidad" framed><PrivacyPage /></Screen>} />
                      <Route path="/terminos" element={<Screen area="terminos" framed><TermsPage /></Screen>} />
                      <Route path="/superadmin" element={<Screen area="superadmin" framed><SuperAdminPage /></Screen>} />
                      {/* La ruta fija gana a la de sección: /superadmin/marca sigue siendo la página del logo. */}
                      <Route
                        path="/superadmin/marca"
                        element={
                          <Screen area="superadmin/marca" framed>
                            <SuperOnly>
                              <SplashPreviewPage />
                            </SuperOnly>
                          </Screen>
                        }
                      />
                      <Route path="/superadmin/:section" element={<Screen area="superadmin" framed><SuperAdminPage /></Screen>} />
                      <Route path="/l/:lid" element={<Screen area="liga" framed><LeagueShell /></Screen>}>
                        {/* Cada ruta muestra la pantalla del deporte de la liga (el boliche, las de siempre). */}
                        <Route index element={<Screen area="liga/inicio"><SportRoute slot="Home" bowling={<LeagueHome />} /></Screen>} />
                        <Route path="ranking" element={<Screen area="liga/ranking"><SportRoute slot="Standings" bowling={<LeagueRanking />} /></Screen>} />
                        <Route path="juegos" element={<Screen area="liga/juegos"><SportRoute slot="Feed" bowling={<GamesFeedPage />} /></Screen>} />
                        <Route path="perfil" element={<Screen area="liga/perfil"><SportRoute slot="MyProfile" bowling={<LeagueProfilePage />} /></Screen>} />
                        <Route path="admin" element={<Screen area="liga/admin"><AdminPage /></Screen>} />
                        <Route path="e/:eventId" element={<Screen area="liga/evento"><EventPage /></Screen>} />
                        <Route path="j/:playerId" element={<Screen area="liga/jugador"><SportRoute slot="Player" bowling={<PlayerRoute />} /></Screen>} />
                        <Route path="*" element={<Navigate to="." replace />} />
                      </Route>
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </AdultGate>
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
