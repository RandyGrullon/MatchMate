import { Navigate, NavigationType, Route, Routes, useLocation, useNavigationType, useParams } from 'react-router';
import { lazy, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { useLeagueCtx } from './lib/league';
import { installErrorReporting } from './lib/errorReport';
import { getActiveSport, installSportAccent, parseActiveSport, setActiveSport } from './lib/sportContext';
import { SportRoute } from './sports/screens';
import { FeedbackProvider } from './components/feedback';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AdultGate } from './components/AdultGate';
import { LegalGate } from './components/LegalGate';
import { BadgeUnlockHost } from './components/badges/BadgeUnlockHost';
import { unlockGateOpen } from './components/badges/hold';
import { AppRouter } from './components/GestureGuards';
import { NotificationsProvider } from './components/Notifications';
import { CreateMenuProvider } from './components/CreateMenu';
import { PushNotice } from './components/NotificationsOptIn';
import { PwaPrompts } from './components/PwaPrompts';
import { ResumeAfterLogin } from './components/ResumeAfterLogin';
import { AppShell } from './components/Shell';
import { Loading, TopLoader } from './components/ui';

// Los errores de los teléfonos le llegan al dueño de la app (consola › Errores).
installErrorReporting();
// La app toma el color del deporte en que estás (antes de pintar la primera pantalla).
installSportAccent();

// Cada pantalla se descarga al entrar: quien solo mira la clasificación no carga el panel del admin.
const LeagueShell = lazy(() => import('./components/LeagueShell'));
const HomePage = lazy(() => import('./pages/HomePage'));
const SportHomePage = lazy(() => import('./pages/SportHomePage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SoloGamesPage = lazy(() => import('./pages/SoloGamesPage'));
const BallsPage = lazy(() => import('./pages/BallsPage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const PeopleSearchPage = lazy(() => import('./pages/PeopleSearchPage'));
const InvitePage = lazy(() => import('./pages/InvitePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const LeaguesPage = lazy(() => import('./pages/LeaguesPage'));
const OrganizePage = lazy(() => import('./pages/OrganizePage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const ScorerJoinPage = lazy(() => import('./pages/ScorerJoinPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SuperAdminPage = lazy(() => import('./pages/SuperAdminPage'));
const SplashPreviewPage = lazy(() => import('./pages/SplashPreviewPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));
const LeagueHome = lazy(() => import('./pages/LeagueHomePage'));
const EventPage = lazy(() => import('./pages/EventPage'));
const PlayerPage = lazy(() => import('./pages/PlayerPage'));
const LeagueProfilePage = lazy(() => import('./pages/LeagueProfilePage'));
const RankingPage = lazy(() => import('./pages/RankingPage'));
const GamesFeedPage = lazy(() => import('./pages/GamesFeedPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SeasonsPage = lazy(() => import('./components/season/SeasonsPage'));

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

/**
 * `/`: Hoy, el único inicio (la pestaña Hoy de la barra lleva siempre aquí, aunque la app esté en un deporte: entrar a
 * una liga la pone en el suyo). El Home de cada deporte (`/d/:sport`) sigue para quien elige uno en el selector.
 * Volver atrás hasta aquí sí es salir del deporte (p. ej. entraste a una liga desde Hoy).
 */
function GlobalHomeRoute() {
  const { key } = useLocation();
  const back = useNavigationType() === NavigationType.Pop && key !== 'default';
  useLayoutEffect(() => {
    // Solo al llegar atrás a esta entrada: no cuando después se elige un deporte aquí mismo (ese navega solo).
    if (back && getActiveSport()) setActiveSport(null);
  }, [back, key]);
  return <HomePage />;
}

/** `/d/:sport`: la app se pone en ese deporte (antes de pintar); uno que esta versión no conoce vuelve a `/`. */
function SportHomeRoute() {
  const { sport } = useParams();
  const id = parseActiveSport(sport);
  useLayoutEffect(() => {
    if (id) setActiveSport(id);
  }, [id]);
  if (!id) return <Navigate to="/" replace />;
  return <SportHomePage key={id} />;
}

function PlayerRoute() {
  const { playerId } = useParams();
  return <PlayerPage key={playerId} />;
}

/** El aviso de error de una pantalla de arriba va dentro del marco de la app: la barra de navegación sigue. */
const inAppFrame = (fallback: ReactNode) => <AppShell>{fallback}</AppShell>;

/**
 * El aviso al ganar una insignia solo con las puertas de la cuenta pasadas (AccountGates: «¿Tienes 18 años?» y los
 * términos vigentes): esas preguntas (la de Google y las cuentas de BowlingX, justo las que reciben su historial) no se
 * tapan con una celebración, y «Ver mis insignias» llevaría a una pantalla que las puertas todavía cierran.
 */
function GatedBadgeUnlock() {
  if (!unlockGateOpen(useAuth())) return null;
  return (
    <ErrorBoundary area="insignias" frame={() => null}>
      <BadgeUnlockHost />
    </ErrorBoundary>
  );
}

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

/** Las pantallas de la cuenta antes de la app: primero «tengo 18 años o más», después aceptar los términos vigentes. */
function AccountGates({ children }: { children: ReactNode }) {
  return (
    <AdultGate>
      <LegalGate>{children}</LegalGate>
    </AdultGate>
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
                  {/* «Tengo 18 años o más» una sola vez para quien entró con Google o viene de BowlingX; después, los términos. */}
                  <AccountGates>
                    <Routes>
                      <Route index element={<Screen area="home" framed><GlobalHomeRoute /></Screen>} />
                      {/* Home de un deporte (la app queda en ese deporte). */}
                      <Route path="/d/:sport" element={<Screen area="deporte" framed><SportHomeRoute /></Screen>} />
                      <Route path="/avisos" element={<Screen area="avisos" framed><NotificationsPage /></Screen>} />
                      {/* Juegos de boliche fuera de una liga o torneo (?juego=<id> abre uno; ?nuevo=1, uno nuevo). */}
                      <Route path="/juegos-sueltos" element={<Screen area="juegos-sueltos" framed><SoloGamesPage /></Screen>} />
                      {/* Mis bolas del boliche (?bola=<id> abre una; ?nueva=1, una nueva). */}
                      <Route path="/bolas" element={<Screen area="bolas" framed><BallsPage /></Screen>} />
                      <Route path="/u/:userId" element={<Screen area="usuario" framed><UserProfilePage /></Screen>} />
                      <Route path="/buscar" element={<Screen area="buscar" framed><PeopleSearchPage /></Screen>} />
                      {/* Una invitación a una liga (el push y el aviso de la campana llevan aquí). */}
                      <Route path="/invitacion/:inviteId" element={<Screen area="invitacion" framed><InvitePage /></Screen>} />
                      <Route path="/login" element={<Screen area="login" framed><LoginPage /></Screen>} />
                      <Route path="/ligas" element={<Screen area="ligas" framed><LeaguesPage /></Screen>} />
                      {/* Organizar (la pestaña de Pro): tu única liga directo a su Organizar; con varias, eliges. */}
                      <Route path="/organizar" element={<Screen area="organizar" framed><OrganizePage /></Screen>} />
                      {/* «¿Dónde juego esta semana?»: lo abierto en las ligas públicas (con y sin cuenta). */}
                      <Route path="/agenda" element={<Screen area="agenda" framed><AgendaPage /></Screen>} />
                      <Route path="/unirse/:code" element={<Screen area="unirse" framed><JoinPage /></Screen>} />
                      {/* El link para anotar de un torneo (con o sin cuenta; ?entrar=1 al volver de /login). */}
                      <Route path="/anotar/:code" element={<Screen area="anotar" framed><ScorerJoinPage /></Screen>} />
                      <Route path="/perfil" element={<Screen area="perfil" framed><ProfilePage /></Screen>} />
                      <Route path="/cuenta" element={<Screen area="cuenta" framed><AccountPage /></Screen>} />
                      <Route path="/privacidad" element={<Screen area="privacidad" framed><PrivacyPage /></Screen>} />
                      <Route path="/terminos" element={<Screen area="terminos" framed><TermsPage /></Screen>} />
                      {/* Sin cuenta, la barra lleva aquí en lugar de Perfil y Eventos (con cuenta, desde Configuración). */}
                      <Route path="/acerca" element={<Screen area="acerca" framed><AboutPage /></Screen>} />
                      <Route path="/contacto" element={<Screen area="contacto" framed><ContactPage /></Screen>} />
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
                        {/* Playoffs de las ligas de equipos (los otros deportes vuelven al inicio de la liga). */}
                        <Route path="playoffs" element={<Screen area="liga/playoffs"><SportRoute slot="Playoffs" bowling={<Navigate to=".." replace />} /></Screen>} />
                        <Route path="temporadas" element={<Screen area="liga/temporadas"><SeasonsPage /></Screen>} />
                        <Route path="admin" element={<Screen area="liga/admin"><AdminPage /></Screen>} />
                        <Route path="e/:eventId" element={<Screen area="liga/evento"><EventPage /></Screen>} />
                        <Route path="j/:playerId" element={<Screen area="liga/jugador"><SportRoute slot="Player" bowling={<PlayerRoute />} /></Screen>} />
                        <Route path="*" element={<Navigate to="." replace />} />
                      </Route>
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </AccountGates>
                </Suspense>
                {/* El aviso al ganar una insignia (solo con insignias sin ver y la puerta de edad pasada; si falla, no tapa nada). */}
                <GatedBadgeUnlock />
              </CreateMenuProvider>
            </NotificationsProvider>
            {/* Después de entrar o crear la cuenta, sigue a donde iba (una invitación, una liga). */}
            <ResumeAfterLogin />
            {/* Instalar la app y permitir los avisos: el aviso de la pantalla (NoticeSlot), nunca carteles apilados. */}
            <PwaPrompts />
            <PushNotice />
          </AppRouter>
        </FeedbackProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
