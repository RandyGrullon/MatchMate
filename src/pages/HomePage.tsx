import { useMemo } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CalendarDays, Compass, Crown, LayoutGrid, Trophy } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { usePublicLeagues } from '../lib/data';
import { lastLeague } from '../lib/league';
import { countBySport, mySportsFirst, offeredSports } from '../lib/sportContext';
import { HOME_TOUR } from '../lib/tours';
import { leagueSport, sportsOf } from '../sports/registry';
import { openSports, useSportStatus } from '../sports/status';
import { SportBadge, SportIcon } from './sports/SportBits';
import { useCreateMenu } from '../components/CreateMenu';
import { AgendaLinkCard } from '../components/home/AgendaLinkCard';
import { FollowingSlot } from '../components/home/FollowingSlot';
import { JoinCodeCard } from '../components/home/JoinCodeCard';
import { LiveSection, NextUpCard } from '../components/home/LiveSection';
import { greeting, todayLabel } from '../components/home/logic';
import { MyLeaguesBody, MyLeaguesBySport, MyLeagueList, NoLeaguesYet } from '../components/home/MyLeagues';
import { PublicLeagues } from '../components/home/PublicLeagues';
import { Section, SectionLink } from '../components/home/Section';
import { SportPickerRow } from '../components/home/SportPickerRow';
import { useActivity, useMyLeagues } from '../components/home/useHomeData';
import { WeekAgenda } from '../components/home/WeekAgenda';
import { Welcome } from '../components/home/Welcome';
import { NotificationsPrompt } from '../components/NotificationsOptIn';
import { AppShell } from '../components/Shell';
import { Tour } from '../components/Tour';
import { ListSkeleton, LoadError, Loading } from '../components/ui';

/** Ligas públicas que se muestran en la portada sin cuenta. */
const WELCOME_PUBLIC = 5;

/**
 * Home de todos los deportes (`/`): el saludo, los deportes (los míos primero) para entrar a uno, lo que está en juego
 * ahora en todas mis ligas, lo próximo (partido o evento), la semana, mis ligas agrupadas por deporte, la gente que
 * sigo y el código de invitación. Sin cuenta: la portada con los deportes y las ligas públicas.
 */
export default function HomePage() {
  const auth = useAuth();
  const { status, creatable } = useSportStatus(auth.isSuper);
  const mine = useMyLeagues(null);
  const act = useActivity(mine.leagues, mine.uid);
  const publics = usePublicLeagues();
  const create = useCreateMenu();

  // Los deportes de arriba: los abiertos (y los de beta para el superadmin), los que tengo y los que tienen públicas.
  const counts = useMemo(() => countBySport(mine.all), [mine.all]);
  const sports = useMemo(() => {
    const offered = offeredSports({
      status,
      isSuper: auth.isSuper,
      mine: sportsOf(mine.all),
      visible: sportsOf(publics.data),
    });
    return mySportsFirst(offered, counts);
  }, [status, auth.isSuper, mine.all, publics.data, counts]);

  if (auth.loading) return <Loading />;

  if (!auth.user) {
    return (
      <AppShell>
        <div className="flex flex-col gap-6">
          <Welcome open={openSports(status)} />
          <Section title="Elige tu deporte" icon={<LayoutGrid className="size-4" aria-hidden="true" />}>
            <SportPickerRow sports={sports} counts={counts} status={status} />
          </Section>
          <AgendaLinkCard />
          <Section title="Ligas públicas" icon={<Compass className="size-4" aria-hidden="true" />} action={<SectionLink to="/ligas">Ver todas</SectionLink>}>
            {publics.loading && !publics.data.length ? (
              <ListSkeleton rows={3} />
            ) : publics.error && !publics.data.length ? (
              // Sin señal o muchas visitas seguidas sin cuenta: no es que no haya ligas.
              <LoadError error={publics.error} />
            ) : (
              <PublicLeagues
                leagues={publics.data}
                today={act.today}
                showSport={sportsOf(publics.data).length > 1}
                limit={WELCOME_PUBLIC}
                emptyText="Todavía no hay ligas públicas. Crea tu cuenta y arma la primera."
              />
            )}
          </Section>
        </div>
      </AppShell>
    );
  }

  const first = displayName(auth).split(' ')[0];
  const manySports = sportsOf(mine.all).length > 1;
  // La última liga que abriste en este teléfono (si sigues en ella), para volver de un toque.
  const last = lastLeague();
  const resume = mine.all.length > 1 ? mine.all.find((l) => l.id === last) : undefined;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-0.5">
          <p className="text-sm text-muted first-letter:uppercase">{todayLabel(act.now)}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">{first ? `${greeting(act.now)}, ${first}` : greeting(act.now)}</h1>
        </header>

        <Tour name="inicio" steps={HOME_TOUR} when={!mine.loading} />

        <Section title="Tus deportes" icon={<LayoutGrid className="size-4" aria-hidden="true" />} tour="deportes">
          <SportPickerRow sports={sports} counts={counts} status={status} />
        </Section>

        <LiveSection games={act.games} matches={act.liveItems} />
        <NextUpCard next={act.next} today={act.today} now={act.now.getTime()} />
        <NotificationsPrompt />

        {resume && (
          <Link
            to={`/l/${resume.id}`}
            className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 transition hover:bg-surface-2"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
              {manySports ? (
                <SportIcon sport={leagueSport(resume)} className="size-5" />
              ) : resume.kind === 'torneo' ? (
                <Trophy className="size-5" />
              ) : (
                <CalendarDays className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-muted">Seguir en</span>
              <span className="block truncate font-semibold">{resume.name}</span>
            </span>
            {manySports && <SportBadge sport={leagueSport(resume)} className="hidden min-[400px]:inline-flex" />}
            <ArrowRight className="size-5 shrink-0 text-accent" aria-hidden="true" />
          </Link>
        )}

        <WeekAgenda feeds={act.feeds} leagues={act.leagues} matches={act.mine} today={act.today} showSport={manySports} />

        <AgendaLinkCard />

        <Section
          title="Tus ligas y torneos"
          icon={<Trophy className="size-4" aria-hidden="true" />}
          action={mine.all.length > 0 && <SectionLink to="/ligas">Eventos</SectionLink>}
        >
          <MyLeaguesBody
            count={mine.all.length}
            loading={mine.loading}
            error={mine.error}
            empty={<NoLeaguesYet canCreate={creatable.length > 0} onCreate={() => create.startCreate('liga', null)} exploreTo="/ligas" />}
          >
            {manySports ? (
              <MyLeaguesBySport leagues={mine.all} roleOf={mine.roleOf} nextOf={act.nextOf} today={act.today} />
            ) : (
              <MyLeagueList leagues={mine.all} roleOf={mine.roleOf} nextOf={act.nextOf} today={act.today} />
            )}
          </MyLeaguesBody>
        </Section>

        <FollowingSlot sport={null} />

        <JoinCodeCard />

        {auth.isSuper && (
          <Link
            to="/superadmin"
            className="inline-flex min-h-11 items-center justify-center gap-2 self-center rounded-xl px-3 text-sm font-medium text-accent hover:bg-surface-2"
          >
            <Crown className="size-4" aria-hidden="true" /> Panel del superadmin
          </Link>
        )}
      </div>
    </AppShell>
  );
}
