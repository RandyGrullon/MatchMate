import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { Compass, Trophy } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { usePublicLeagues } from '../lib/data';
import { inSport, parseActiveSport, setActiveSport } from '../lib/sportContext';
import { HOME_TOUR } from '../lib/tours';
import { SPORTS } from '../sports/registry';
import { useSportStatus } from '../sports/status';
import type { SportId } from '../sports/types';
import { useCreateMenu } from '../components/CreateMenu';
import { FollowingSlot } from '../components/home/FollowingSlot';
import { JoinCodeCard } from '../components/home/JoinCodeCard';
import { LiveSection, NextUpCard } from '../components/home/LiveSection';
import { MyLeaguesBody, MyLeagueList, NoLeaguesYet } from '../components/home/MyLeagues';
import { PublicLeagues } from '../components/home/PublicLeagues';
import { Section, SectionLink } from '../components/home/Section';
import { SportHero } from '../components/home/SportHero';
import { useActivity, useMyLeagues } from '../components/home/useHomeData';
import { WeekAgenda } from '../components/home/WeekAgenda';
import { NotificationsPrompt } from '../components/NotificationsOptIn';
import { AppShell } from '../components/Shell';
import { Tour } from '../components/Tour';
import { ListSkeleton, Loading } from '../components/ui';

/** Ligas públicas del deporte que se muestran aquí (el resto, en Eventos). */
const PUBLIC_SHOWN = 5;

/**
 * Home de un deporte (`/d/:sport`): todo es de ese deporte. La portada en su color (con «Crear liga de <deporte>»),
 * lo que está en juego ahora, lo próximo, la semana, mis ligas con lo próximo de cada una, la gente que sigo y las
 * ligas públicas para unirse. La ruta (App.tsx) ya pone la app en este deporte y manda a `/` si no existe.
 */
export default function SportHomePage() {
  const params = useParams();
  const sport = parseActiveSport(params.sport);
  if (!sport) return <Loading />;
  return <SportHome sport={sport} />;
}

function SportHome({ sport }: { sport: SportId }) {
  const auth = useAuth();
  const meta = SPORTS[sport];
  const sportStatus = useSportStatus(auth.isSuper);
  const mine = useMyLeagues(sport);
  const act = useActivity(mine.leagues, mine.uid);
  const publics = usePublicLeagues();
  const create = useCreateMenu();

  // Por si se llega sin pasar por la ruta (la ruta ya lo hace antes de pintar): la app queda en este deporte.
  useEffect(() => setActiveSport(sport), [sport]);

  // Públicas de este deporte en las que no estoy.
  const joinable = useMemo(() => {
    const mineIds = new Set(mine.all.map((l) => l.id));
    return publics.data.filter(inSport(sport)).filter((l) => !mineIds.has(l.id));
  }, [publics.data, mine.all, sport]);

  if (auth.loading) return <Loading />;

  const signedIn = !!auth.user;
  const canCreate = sportStatus.canCreate(sport);
  const startCreate = (kind: 'liga' | 'torneo') => create.startCreate(kind, sport);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <SportHero
          sport={sport}
          status={sportStatus.status[sport]}
          mine={mine.leagues.length}
          publicCount={joinable.length}
          signedIn={signedIn}
          canCreate={canCreate}
          onCreate={startCreate}
        />

        {signedIn && <Tour name="inicio" steps={HOME_TOUR} when={!mine.loading} />}

        {signedIn && (
          <>
            <LiveSection games={act.games} matches={act.liveItems} />
            <NextUpCard next={act.next} today={act.today} now={act.now.getTime()} />
            <NotificationsPrompt />

            <Section
              title={`Tus ligas de ${meta.lower}`}
              icon={<Trophy className="size-4" aria-hidden="true" />}
              action={mine.leagues.length > 0 && <SectionLink to="/ligas">Eventos</SectionLink>}
            >
              <MyLeaguesBody
                count={mine.leagues.length}
                loading={mine.loading}
                error={mine.error}
                empty={
                  <NoLeaguesYet
                    sportName={meta.lower}
                    canCreate={canCreate}
                    onCreate={() => startCreate('liga')}
                    exploreTo="/ligas"
                    exploreLabel="Buscar en Eventos"
                  />
                }
              >
                <MyLeagueList leagues={mine.leagues} roleOf={mine.roleOf} nextOf={act.nextOf} today={act.today} />
              </MyLeaguesBody>
            </Section>

            <WeekAgenda feeds={act.feeds} leagues={act.leagues} matches={act.mine} today={act.today} />

            <FollowingSlot sport={sport} />
          </>
        )}

        <Section
          title={`Ligas públicas de ${meta.lower}`}
          icon={<Compass className="size-4" aria-hidden="true" />}
          action={joinable.length > PUBLIC_SHOWN && <SectionLink to="/ligas">Ver todas</SectionLink>}
        >
          {publics.loading && !publics.data.length ? (
            <ListSkeleton rows={2} />
          ) : (
            <PublicLeagues
              leagues={joinable}
              today={act.today}
              limit={PUBLIC_SHOWN}
              emptyText={
                mine.leagues.length
                  ? `No hay otras ligas públicas de ${meta.lower} por ahora.`
                  : `Todavía no hay ligas públicas de ${meta.lower}.${canCreate ? ' ¡Crea la primera!' : ''}`
              }
            />
          )}
        </Section>

        {signedIn && <JoinCodeCard />}
      </div>
    </AppShell>
  );
}
