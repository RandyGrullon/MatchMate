import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Award, BarChart3, ChevronLeft, List, LogIn, Settings, UserPlus, Users } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { useLeaguesByIds, useMyMemberships } from '../lib/data';
import { usePublicProfile, type FollowKind, type PublicProfile } from '../lib/data/follows';
import { useMySoloSessions } from '../lib/data/solo';
import { toIsoDate } from '../lib/format';
import type { League } from '../lib/types';
import { useNow } from '../lib/useNow';
import { getSport } from '../sports/registry';
import { initials } from '../components/Avatar';
import { NoBowlingNumbers, ProfileStats, SportLeagues, splitBySport, useBowlingNumbers, type BowlingNumbersState } from '../components/GlobalStats';
import { BallIcon } from '../components/balls/BallPicker';
import { BallStatsSection, MyBallsSection, useBallSection } from '../components/balls/BallStats';
import { ModeSwitch, useIsPro } from '../components/mode';
import { NoticeSlot } from '../components/NoticeSlot';
import { AppShell } from '../components/Shell';
import { FollowersSheet } from '../components/social/FollowersSheet';
import { GamesTab, StatsTab } from '../components/social/ProfileView';
import { atUsername, knownSports } from '../components/social/socialFormat';
import { AverageCard, NumbersGrid, ShotsCard, TrendCard, type NumberItem } from '../components/stats/YoStats';
import { Card, Empty, ListRow, LoadError, Loading, RowIcon, Skeleton, cx } from '../components/ui';

// Las insignias traen el catálogo y el dibujo: se cargan aparte (la tarjeta de Lite, la línea de Pro y la vitrina).
const BadgesPreview = lazy(() => import('../components/badges/ProfileBadges').then((m) => ({ default: m.BadgesPreview })));
const BadgesLineText = lazy(() => import('../components/badges/ProfileBadges').then((m) => ({ default: m.BadgesLineText })));
const FeaturedSection = lazy(() => import('../components/badges/ProfileBadges').then((m) => ({ default: m.FeaturedSection })));
const ProfileBadgesTab = lazy(() => import('../components/badges/ProfileBadges'));

/** Las partes de Yo que se abren aparte (`?tab=`): Mis juegos, la vitrina de insignias y «Por liga y temporada». */
export type YoPart = 'juegos' | 'insignias' | 'estadisticas';

export const YO_PARTS: Record<YoPart, string> = {
  juegos: 'Mis juegos',
  insignias: 'Insignias',
  estadisticas: 'Por liga y temporada',
};

export const yoPart = (raw: string | null): YoPart | null => (raw === 'juegos' || raw === 'insignias' || raw === 'estadisticas' ? raw : null);

/** Lo que llevan los links de Yo a sus partes: «‹ Yo» vuelve atrás en vez de abrir Yo otra vez. */
const YO_STATE = { yo: true } as const;

/**
 * «@anaperez · Liga de los martes»: tu usuario y tu liga (la de más juegos; «y 1 más» si tienes otras). Sin usuario ni
 * ligas, null.
 */
export function identityLine(username: string | null | undefined, leagues: readonly Pick<League, 'id' | 'name'>[], main?: string | null): string | null {
  const first = (main && leagues.find((l) => l.id === main)) || leagues[0];
  const where = first ? (leagues.length > 1 ? `${first.name} y ${leagues.length - 1} más` : first.name) : null;
  return [atUsername(username), where].filter(Boolean).join(' · ') || null;
}

/** Debajo de «Amigos y seguidores»: «3 seguidores · 1 siguiendo · 5 me gusta», o «Buscar personas» si todo está en cero. */
export function socialLine(p: Pick<PublicProfile, 'followers' | 'following' | 'likesReceived'> | null | undefined): string {
  if (!p || (!p.followers && !p.following && !p.likesReceived)) return 'Buscar personas';
  return [`${p.followers} ${p.followers === 1 ? 'seguidor' : 'seguidores'}`, `${p.following} siguiendo`, p.likesReceived > 0 && `${p.likesReceived} me gusta`]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Yo (/perfil), rediseño «Calma y foco» (final/6-perfil.png y p6-perfil.png). Arriba, «Lite | Pro» (cómo ver la app) y
 * un solo engranaje (la cuenta, /cuenta); debajo, tu nombre, tu @usuario y tu liga.
 * - Lite: tu promedio con la gráfica corta y cómo vas, Mejor juego · Mejor serie · Juegos, Mis bolas (con sus juegos),
 *   Insignias (con lo que te falta) y las filas Mis juegos y Amigos y seguidores.
 * - Pro: los 6 números, la tendencia por juego o por mes, tus tiros (y qué pinos te quedan), por bola y las filas Por
 *   liga y temporada, Mis juegos, Insignias y Amigos y seguidores.
 * Los números del boliche suman todas tus ligas, torneos y juegos sueltos (cada liga tiene además su propio perfil); las
 * ligas de otros deportes llevan a sus números. Las partes (`?tab=juegos|insignias|estadisticas`) se abren con «‹ Yo»;
 * el push de una insignia abre `?tab=insignias&insignia=…`.
 */
export default function ProfilePage() {
  const auth = useAuth();
  // Al entrar vuelve aquí con la parte y la insignia (el push de una insignia abre /perfil?tab=insignias&insignia=…).
  const here = useLocation();
  const next = encodeURIComponent(`/perfil${here.search}`);

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
      <Yo uid={auth.user.uid} />
    </AppShell>
  );
}

function Yo({ uid }: { uid: string }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const part = yoPart(params.get('tab'));
  const pro = useIsPro();
  const profile = usePublicProfile(uid);
  const memberships = useMyMemberships(uid);
  const leagues = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const { bowling, others } = useMemo(() => splitBySport(memberships.data, leagues.data), [memberships.data, leagues.data]);
  const solo = useMySoloSessions();
  const numbers = useBowlingNumbers(bowling, leagues.data, solo.data, solo.loading);
  const balls = useBallSection();
  const today = toIsoDate(useNow());
  const [sheet, setSheet] = useState<FollowKind | null>(null);

  const p = profile.data;
  const name = p?.name || displayName(auth);
  const sports = useMemo(() => knownSports(p?.sports), [p?.sports]);
  const listsLoading = memberships.loading || leagues.loading;
  // Los números del boliche: si juega boliche, tiene juegos sueltos o (todavía) ninguna liga de otro deporte.
  const showBowling = bowling.length > 0 || others.length === 0 || solo.data.length > 0;
  const state: BowlingNumbersState = listsLoading ? { status: 'loading' } : numbers;
  const main = state.status === 'ready' ? state.data.perLeague.find((l) => l.stats.games > 0)?.lid : null;
  const line = identityLine(p?.username ?? auth.profile?.username, leagues.data, main);
  const open = (to: YoPart) => navigate(`?tab=${to}`, { state: YO_STATE });

  if (part) {
    return (
      <YoPartView part={part}>
        {part === 'juegos' ? (
          <div className="flex flex-col gap-[26px]">
            <SoloGamesRow />
            <GamesTab userId={uid} sports={sports} isMe name={name} />
          </div>
        ) : part === 'insignias' ? (
          <Suspense fallback={<Skeleton className="h-64 rounded-3xl" />}>
            <div className="flex flex-col gap-[26px]">
              <FeaturedSection userId={uid} />
              <ProfileBadgesTab userId={uid} name={name} sports={sports} />
            </div>
          </Suspense>
        ) : (
          <div className="flex flex-col gap-[26px]">
            {listsLoading ? <Skeleton className="h-64 rounded-3xl" /> : <ProfileStats memberships={memberships.data} leagues={leagues.data} />}
            <StatsTab userId={uid} skipBowling isMe />
          </div>
        )}
      </YoPartView>
    );
  }

  const zero = !p || (!p.followers && !p.following && !p.likesReceived);
  const friends = (dense: boolean) => (
    <ListRow
      dense={dense}
      leading={
        <RowIcon>
          <Users className={dense ? 'size-[19px]' : 'size-5'} />
        </RowIcon>
      }
      title="Amigos y seguidores"
      subtitle={socialLine(p)}
      {...(zero ? { to: '/buscar' } : { onClick: () => setSheet('followers') })}
    />
  );
  const myGames = (dense: boolean) => (
    <ListRow
      dense={dense}
      leading={
        <RowIcon>
          <List className={dense ? 'size-[19px]' : 'size-5'} />
        </RowIcon>
      }
      title="Mis juegos"
      subtitle="Prácticas, torneos y sueltos"
      onClick={() => open('juegos')}
    />
  );

  return (
    <div className="flex flex-col px-2">
      <YoTop />
      <Identity name={name} line={line} pro={pro} />
      <NoticeSlot className="mt-4" />

      {pro ? (
        <>
          {showBowling && <ProNumbers state={state} today={today} />}
          {showBowling && <BallStatsSection className="mt-3.5" />}
          {others.length > 0 && <OtherSports uid={uid} others={others} alone={!showBowling} />}
          <Card className="mt-3.5 overflow-hidden">
            <ListRow
              dense
              leading={
                <RowIcon>
                  <BarChart3 className="size-[19px]" />
                </RowIcon>
              }
              title={YO_PARTS.estadisticas}
              onClick={() => open('estadisticas')}
            />
            {myGames(true)}
            <ListRow
              dense
              leading={
                <RowIcon>
                  <Award className="size-[19px]" />
                </RowIcon>
              }
              title="Insignias"
              subtitle={
                <Suspense fallback="Tu vitrina">
                  <BadgesLineText userId={uid} sports={sports} />
                </Suspense>
              }
              onClick={() => open('insignias')}
            />
            {friends(true)}
            {showBowling && !balls.has && !balls.loading && (
              <ListRow
                dense
                leading={
                  <RowIcon>
                    <BallIcon className="size-[19px]" />
                  </RowIcon>
                }
                title="Mis bolas"
                subtitle="Agrega tu bola y mira con cuál tiras mejor"
                to="/bolas?nueva=1"
              />
            )}
          </Card>
        </>
      ) : (
        <>
          {showBowling && <LiteNumbers state={state} />}
          {showBowling && <MyBallsSection className="mt-[26px]" />}
          <Suspense fallback={<Skeleton className="mt-[26px] h-[196px] rounded-3xl" />}>
            <BadgesPreview userId={uid} sports={sports} className="mt-[26px]" />
          </Suspense>
          {others.length > 0 && <OtherSports uid={uid} others={others} alone={!showBowling} />}
          <Card className="mt-[26px] overflow-hidden">
            {myGames(false)}
            {friends(false)}
          </Card>
        </>
      )}

      {p && (
        <FollowersSheet
          userId={uid}
          name={p.name}
          kind={sheet}
          counts={{ followers: p.followers, following: p.following }}
          onKind={setSheet}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/** Arriba de Yo: «Lite | Pro» (cambia al momento, con «Deshacer» abajo) y el único engranaje (la cuenta). */
function YoTop() {
  return (
    <div className="-mt-2.5 flex items-center justify-between gap-3">
      <ModeSwitch className="[&>button]:px-[18px] max-[359px]:[&>button]:px-3" />
      <Link
        to="/cuenta"
        state={YO_STATE}
        aria-label="Configuración de la cuenta"
        title="Configuración de la cuenta"
        className={cx(
          'card-shadow grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg-2 transition active:scale-95',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        )}
      >
        <Settings aria-hidden="true" className="size-[21px]" />
      </Link>
    </div>
  );
}

/** Tus iniciales en el color del deporte, tu nombre y «@usuario · tu liga» (más chico en Pro). */
function Identity({ name, line, pro }: { name: string; line: string | null; pro: boolean }) {
  return (
    <div className={cx('flex items-center', pro ? 'mt-[18px] gap-3.5' : 'mt-5 gap-4')}>
      <span
        aria-hidden="true"
        className={cx('grid shrink-0 place-items-center rounded-full bg-accent font-[650] text-accent-fg', pro ? 'size-[52px] text-lg' : 'size-[60px] text-[21px]')}
      >
        {initials(name)}
      </span>
      <div className="min-w-0">
        <h1 className={cx('truncate font-bold', pro ? 'text-[22px] leading-[1.2] tracking-[-0.02em]' : 'text-[26px] leading-[1.15] tracking-[-0.025em]')}>{name}</h1>
        {line && <p className={cx('truncate text-muted', pro ? 'mt-0.5 text-sm' : 'mt-[3px] text-meta')}>{line}</p>}
      </div>
    </div>
  );
}

/** Lite: la tarjeta «Tu promedio» (o, sin juegos todavía, cómo empezar). */
function LiteNumbers({ state }: { state: BowlingNumbersState }) {
  if (state.status === 'loading') return <Skeleton className="mt-5 h-[300px] rounded-3xl" />;
  if (state.status === 'error') return <LoadError error={state.error} />;
  if (state.status === 'none') return <NoBowlingNumbers preparing={state.preparing} className="mt-5" />;
  const { all, games } = state.data;
  return (
    <AverageCard
      className="mt-5"
      average={all.autoAverage}
      history={games}
      high={all.high}
      series={all.highSeries}
      games={all.games}
    />
  );
}

/** Pro: los 6 números, la tendencia y tus tiros. */
function ProNumbers({ state, today }: { state: BowlingNumbersState; today: string }) {
  if (state.status === 'loading') return <Skeleton className="mt-4 h-[154px] rounded-3xl" />;
  if (state.status === 'error') return <LoadError error={state.error} />;
  if (state.status === 'none') return <NoBowlingNumbers preparing={state.preparing} className="mt-4" />;
  const n = state.data;
  const items: NumberItem[] = [
    { label: 'Promedio', value: n.all.autoAverage ?? '—', accent: true },
    { label: 'Mejor juego', value: n.all.high || '—' },
    { label: 'Mejor serie', value: n.all.highSeries || '—' },
    { label: 'Juegos', value: n.all.games },
    { label: 'Hcp', value: n.hcp ?? '—' },
    { label: 'Asistencia', value: n.held ? `${n.attended}/${n.held}` : '—' },
  ];
  return (
    <>
      <NumbersGrid className="mt-4" items={items} />
      <TrendCard className="mt-3.5" games={n.games} average={n.all.autoAverage} today={today} />
      <ShotsCard className="mt-3.5" frames={n.frames} games={n.all.games} />
    </>
  );
}

/** Las ligas de otros deportes (cada una a sus números) y, si no juegas boliche, tu resumen de esos deportes. */
function OtherSports({ uid, others, alone }: { uid: string; others: Parameters<typeof SportLeagues>[0]['leagues']; alone: boolean }) {
  return (
    <div className="mt-[26px] flex flex-col gap-3.5">
      <SportLeagues leagues={others} alone={alone} />
      {alone && <StatsTab userId={uid} skipBowling isMe />}
    </div>
  );
}

/** Yo › Mis juegos: arriba, los juegos sueltos (los de fuera de una liga, y anotar uno). */
function SoloGamesRow() {
  const Icon = getSport('bowling').icon;
  return (
    <Card className="overflow-hidden">
      <ListRow
        to="/juegos-sueltos"
        leading={
          <RowIcon tone="accent">
            <Icon className="size-5" />
          </RowIcon>
        }
        title="Juegos sueltos"
        subtitle="Boliche sin liga ni torneo: anota los tuyos"
      />
    </Card>
  );
}

/** «‹ Yo»: si viniste de Yo, vuelve atrás; si entraste directo (un aviso, un link), abre Yo. */
function BackToYo() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromYo = !!(location.state as { yo?: boolean } | null)?.yo;
  return (
    <Link
      to="/perfil"
      replace={!fromYo}
      onClick={(e) => {
        if (!fromYo) return;
        e.preventDefault();
        navigate(-1);
      }}
      className="-ml-1.5 inline-flex h-11 items-center gap-0.5 self-start rounded-xl pr-2 text-body font-[550] text-accent transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <ChevronLeft aria-hidden="true" className="size-6" />
      Yo
    </Link>
  );
}

/** Una parte de Yo: «‹ Yo», su título y lo de adentro. */
function YoPartView({ part, children }: { part: YoPart; children: ReactNode }) {
  return (
    <div className="flex flex-col px-2">
      <div className="-mt-2 mb-1 flex min-h-13 items-center">
        <BackToYo />
      </div>
      <h1 className="text-title">{YO_PARTS[part]}</h1>
      <div className="mt-5">{children}</div>
    </div>
  );
}
