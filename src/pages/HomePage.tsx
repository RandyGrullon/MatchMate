import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Crown, PencilLine } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { useActiveSport } from '../lib/sportContext';
import type { League } from '../lib/types';
import { recentEvents, resumeElsewhere, scorePath, startedGames, useMemoryTick, type RecentEvent } from '../lib/useNextGame';
import { leagueSport, sportsOf } from '../sports/registry';
import { useSportStatus } from '../sports/status';
import { useCreateMenu } from '../components/CreateMenu';
import { Landing } from '../components/cuenta/Landing';
import { EsportsRowCard, useEsportsHome } from '../components/home/EsportsHomeRow';
import { FollowingSlot } from '../components/home/FollowingSlot';
import { HomeHeader } from '../components/home/HomeHeader';
import { CalendarSheet, ModeSheet, WhereSheet } from '../components/home/HomeSheets';
import { HomeStats } from '../components/home/HomeStats';
import { JoinLeagueCard } from '../components/home/JoinLeagueCard';
import { LiveSectionPro, ToDoSection, WeekStrip, toDoOf } from '../components/home/ProSections';
import { useRsvp } from '../components/home/RsvpButton';
import { SportTint } from '../components/home/SportTint';
import { IdleCard, NextUpCard, QuietLink, TodayCard } from '../components/home/TodayCard';
import { UpNext, canRsvp } from '../components/home/UpNext';
import { useActivity, useMyLeagues, type Activity } from '../components/home/useHomeData';
import { useHomeNotices } from '../components/home/useHomeNotices';
import { LiveMatchesCard, NextMatchCard } from '../components/LiveNowMatches';
import { useMode } from '../components/mode';
import { NoticeSlot } from '../components/NoticeSlot';
import { useNotifications } from '../components/Notifications';
import { AppShell } from '../components/Shell';
import { LoadError, Loading, Skeleton } from '../components/ui';
import type { LeagueFeed } from '../lib/data';

/**
 * Hoy (`/`), el único inicio (rediseño «Calma y foco»; `/d/:sport` lleva aquí). Sin cuenta: la portada (Landing) con
 * «Crear mi cuenta» y las ligas abiertas. Con cuenta, de todos tus deportes:
 * - Lite: la fecha, «Hola, Ana» y la campana; lo de hoy UNA vez (TodayCard: tus juegos y un botón, o tu próxima fecha
 *   con «Voy»); tu promedio y tu lugar (abre la Tabla); «Lo que viene» con «Voy» en línea y el Calendario en una hoja.
 * - Pro: lo mismo más denso, con «Planilla», «Por hacer», «En vivo» y «Esta semana» (y la etiqueta «PRO ▾»).
 * - Cuenta nueva: «Únete a tu liga» con el código (y el QR), crear tu liga, un juego suelto o buscar ligas abiertas.
 * Un solo aviso por pantalla (NoticeSlot). Tus ligas están en Ligas; los deportes, en Ligas › Buscar ligas abiertas.
 * Esports: con el deporte activo en esports o si la cuenta tiene equipos o inscripciones, la fila «Esports» (a
 * `/esports`); y el aviso de un ID de juego tuyo que pasó a otra cuenta (alguien entró con esa cuenta de Epic, Steam
 * o Riot).
 */
export default function HomePage() {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  return auth.user ? <Hoy /> : <SignedOutHome />;
}

/**
 * Sin cuenta: la portada (Landing): qué es MatchMate en un título y una línea, «Crear mi cuenta», las ligas abiertas y
 * «¿Dónde juego esta semana?». Los deportes uno por uno están en Acerca de y en Ligas abiertas.
 */
function SignedOutHome() {
  return (
    <AppShell>
      <Landing />
    </AppShell>
  );
}

type HomeSheet = 'calendario' | 'donde' | 'modo';

/** La liga de tu promedio y tu lugar: la del juego de hoy, la de lo próximo o tu primera liga de boliche. */
function standingLeague(act: Activity, leagues: readonly League[]): { lid: string; playerId: string; name: string } | null {
  const live = act.games.find((g) => g.feed.playerId);
  if (live) return { lid: live.feed.lid, playerId: live.feed.playerId!, name: live.league.name };
  const next = act.next?.kind === 'event' ? act.next.event : null;
  if (next && next.sport === 'bowling' && next.playerId) return { lid: next.lid, playerId: next.playerId, name: next.leagueName };
  const bowling = (f: LeagueFeed) => {
    const l = leagues.find((x) => x.id === f.lid);
    return !!l && leagueSport(l) === 'bowling' && !!f.playerId;
  };
  const kindOf = (f: LeagueFeed) => leagues.find((x) => x.id === f.lid)?.kind;
  const feed = act.feeds.find((f) => bowling(f) && kindOf(f) !== 'torneo') ?? act.feeds.find(bowling);
  if (!feed) return null;
  return { lid: feed.lid, playerId: feed.playerId!, name: leagues.find((l) => l.id === feed.lid)?.name ?? 'tu liga' };
}

function Hoy() {
  const auth = useAuth();
  const { isPro } = useMode();
  const { creatable } = useSportStatus(auth.isSuper);
  const mine = useMyLeagues(null);
  const act = useActivity(mine.leagues, mine.uid);
  const create = useCreateMenu();
  const rsvp = useRsvp();
  const tick = useMemoryTick();
  // Todavía no se sabe nada de las ligas (primera carga sin copia en el teléfono): ni «Nada programado» ni cuenta nueva.
  const notices = useNotifications();
  const [sheet, setSheet] = useState<HomeSheet | null>(null);
  useHomeNotices({ feeds: act.feeds, leagues: act.leagues, pro: isPro });
  const activeSport = useActiveSport();
  const esports = useEsportsHome(mine.uid, activeSport);

  const first = displayName(auth).split(' ')[0];
  const featured = act.games[0] ?? null;
  const manySports = sportsOf(mine.all).length > 1;
  const playsBowling = !mine.all.length || sportsOf(mine.all).includes('bowling');

  // Anotar sin un juego de hoy: seguir el que quedó a medias (ayer u hoy), «¿Dónde jugaste?» o un juego suelto.
  const recent = useMemo(() => recentEvents(act.feeds, act.leagues, act.today), [act.feeds, act.leagues, act.today]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick: volver a leer la memoria de la hoja de anotar
  const started = useMemo(() => startedGames(mine.uid), [mine.uid, tick]);
  const resume = resumeElsewhere(started, recent, featured?.event.id);
  const anotar = anotarLink({ resume, recent, today: act.today, bowling: playsBowling, onWhere: () => setSheet('donde') });

  // Lo de hoy, una sola vez: el evento de boliche en juego (o los partidos en vivo), si no lo próximo, y si no hay nada,
  // la cuenta nueva o el día sin nada programado.
  const nextEvent = act.next?.kind === 'event' ? act.next.event : null;
  const nextMatch = act.next?.kind === 'match' ? act.next.match : null;
  const live = act.games.length > 0 || act.liveItems.length > 0;
  let today: ReactNode;
  if (live) {
    today = (
      <div className="flex flex-col gap-3.5">
        {act.games.map((g) => (
          <TodayCard key={`${g.feed.lid}:${g.event.id}`} game={g} today={act.today} pro={isPro} />
        ))}
        <LiveMatchesCard items={act.liveItems} />
      </div>
    );
  } else if (nextMatch) {
    today = (
      <SportTint sport={nextMatch.sport}>
        <NextMatchCard next={nextMatch} />
      </SportTint>
    );
  } else if (nextEvent) {
    today = (
      <NextUpCard
        item={nextEvent}
        today={act.today}
        rsvp={canRsvp(nextEvent) ? (going) => rsvp(nextEvent.lid, nextEvent.eventId!, nextEvent.playerId!, going) : null}
        anotar={anotar}
      />
    );
  } else if (mine.loading || notices.loading) {
    today = <Skeleton className="h-[300px] rounded-3xl" />;
  } else if (mine.error && !mine.all.length) {
    today = <LoadError error={mine.error} />;
  } else if (!mine.all.length) {
    today = <JoinLeagueCard onCreate={creatable.length ? () => create.startCreate('liga', null) : null} />;
  } else {
    today = <IdleCard anotar={anotar} />;
  }

  // «Lo que viene» sin lo que ya sale arriba.
  const shownKeys = new Set([...act.games.map((g) => `${g.feed.lid}:${g.event.id}`), ...(nextEvent && !live ? [nextEvent.key] : [])]);
  const upcoming = act.upcoming.filter((it) => !shownKeys.has(it.key) && !(nextMatch && !live && it.matchId === nextMatch.match.id));
  const standing = standingLeague(act, act.leagues);
  const todo = isPro ? toDoOf(act.feeds, act.today) : [];
  const hasLeagues = mine.all.length > 0;

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <HomeHeader now={act.now} name={first} onModeTag={() => setSheet('modo')} />

        <div className="mt-[18px]">{today}</div>

        {/* El único aviso de la pantalla, a la vista: justo debajo de lo de hoy. */}
        <NoticeSlot className="mt-3.5" />

        {isPro ? (
          <>
            <ToDoSection todo={todo} leagues={act.leagues} className="mt-[26px]" />
            {featured && <LiveSectionPro game={featured} today={act.today} className="mt-[26px]" />}
            {hasLeagues && (
              <WeekStrip
                feeds={act.feeds}
                leagues={act.leagues}
                matches={act.mine}
                today={act.today}
                onOpen={() => setSheet('calendario')}
                className="mt-[26px]"
              />
            )}
          </>
        ) : (
          <>
            {standing && <HomeStats lid={standing.lid} playerId={standing.playerId} leagueName={standing.name} className="mt-3.5" />}
            {hasLeagues && (
              <UpNext items={upcoming} today={act.today} showLeague={mine.all.length > 1} onCalendar={() => setSheet('calendario')} className="mt-7" />
            )}
          </>
        )}

        {esports.show && <EsportsRowCard title="Esports" subtitle="Tus equipos y torneos" pro={isPro} className="mt-7" />}

        <FollowingSlot sport={null} className="mt-7" />

        {auth.isSuper && (
          <Link
            to="/superadmin"
            className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 self-center rounded-xl px-3 text-sm font-medium text-accent hover:bg-surface-2"
          >
            <Crown className="size-4" aria-hidden="true" /> Panel del superadmin
          </Link>
        )}
      </div>

      <CalendarSheet
        open={sheet === 'calendario'}
        onClose={() => setSheet(null)}
        feeds={act.feeds}
        leagues={act.leagues}
        matches={act.mine}
        today={act.today}
        showSport={manySports}
      />
      <WhereSheet open={sheet === 'donde'} onClose={() => setSheet(null)} recent={recent} today={act.today} />
      <ModeSheet open={sheet === 'modo'} onClose={() => setSheet(null)} />
    </AppShell>
  );
}

/**
 * El link discreto para anotar sin un juego de hoy: «Seguir mi juego 2» (si quedó uno a medias ayer u hoy), «Anotar un
 * juego» (abre «¿Dónde jugaste?» si jugaste ayer u hoy en una liga) o «Anotar un juego suelto». Nada si no juegas boliche.
 */
function anotarLink({
  resume,
  recent,
  today,
  bowling,
  onWhere,
}: {
  resume: ReturnType<typeof resumeElsewhere>;
  recent: readonly RecentEvent[];
  today: string;
  bowling: boolean;
  onWhere: () => void;
}): ReactNode {
  if (resume)
    return (
      <QuietLink to={scorePath(resume.lid, resume.eventId)} icon={PencilLine} accent>
        {`Seguir mi juego ${resume.game}${resume.recent.event.date === today ? '' : ' de ayer'}`}
      </QuietLink>
    );
  if (recent.length) return <QuietLink onClick={onWhere}>Anotar un juego</QuietLink>;
  if (!bowling) return null;
  return <QuietLink to="/juegos-sueltos?nuevo=1">Anotar un juego suelto</QuietLink>;
}
