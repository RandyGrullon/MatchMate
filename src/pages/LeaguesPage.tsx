import { useMemo, type ReactNode } from 'react';
import { CalendarClock, Globe, Layers, Shield, Trophy } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { usePublicLeagues } from '../lib/data';
import { inSport, setActiveSport, useActiveSport } from '../lib/sportContext';
import { SPORTS } from '../sports/registry';
import { SportChips, useSportFilter } from './sports/SportBits';
import { AppShell } from '../components/Shell';
import { NoLeaguesYet, NoneOfKind, SignedOutCard } from '../components/eventos/EventosEmpty';
import { UpcomingList } from '../components/eventos/UpcomingList';
import { eventosSubtitle, filterSports, joinable, publicEmptyText, splitMine } from '../components/eventos/logic';
import { JoinCodeCard } from '../components/home/JoinCodeCard';
import { LeagueList, LeagueRow } from '../components/home/LeagueCard';
import { LiveSection } from '../components/home/LiveSection';
import { PublicLeagues } from '../components/home/PublicLeagues';
import { Section } from '../components/home/Section';
import { SportTint } from '../components/home/SportTint';
import { useActivity, useMyLeagues } from '../components/home/useHomeData';
import { ListSkeleton, LoadError } from '../components/ui';
import type { League, Member } from '../lib/types';

/**
 * Eventos (`/ligas`). En un deporte, solo lo de ese deporte; en «Todos los deportes», todo, con chips para filtrar.
 * Arriba lo que está en juego; después mis ligas, mis torneos (lo más pronto primero), lo que viene en los próximos
 * 30 días (eventos y mis partidos, con día, hora, liga y deporte), las públicas para unirme (con buscador) y el código.
 */
export default function LeaguesPage() {
  const auth = useAuth();
  const active = useActiveSport();
  const pub = usePublicLeagues();

  // Chips solo en «Todos los deportes» y si hay de más de un deporte (el filtro vive en ?deporte=).
  const mine = useMyLeagues(null);
  const sports = filterSports(mine.all, pub.data);
  const multi = sports.length > 1;
  const [chip, setChip] = useSportFilter(!active && multi ? sports : []);
  const sport: string | null = active ?? chip;
  const showSport = !sport && multi;

  // Mis ligas del deporte (o todas): misma lista mientras no cambie, para no recalcular lo que viene en cada pintada.
  const leagues = useMemo(() => mine.all.filter(inSport(sport)), [mine.all, sport]);
  const act = useActivity(leagues, mine.uid);
  const { ligas, torneos } = splitMine(leagues, act.nextOf);
  const isMine = (lid: string) => !!mine.roleOf(lid);
  const toJoin = joinable(pub.data, isMine, sport);
  const inSportTotal = pub.data.filter(inSport(sport)).length;
  const others = mine.all.length - leagues.length;
  const meta = active ? SPORTS[active] : null;
  const Icon = meta?.icon;

  const showAll = () => (active ? setActiveSport(null) : setChip(null));
  const signedIn = !!auth.user;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex items-start gap-3">
          {meta && Icon && (
            <SportTint sport={active} className="shrink-0">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-fg" aria-hidden="true">
                <Icon className="size-6" />
              </span>
            </SportTint>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{meta ? `Eventos de ${meta.lower}` : 'Eventos'}</h1>
            <p className="text-sm text-muted">{eventosSubtitle(sport)}</p>
            {active && (
              <button
                type="button"
                onClick={() => setActiveSport(null)}
                className="-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-accent hover:underline"
              >
                <Layers className="size-4" aria-hidden="true" /> Ver de todos los deportes
              </button>
            )}
          </div>
        </header>

        {!active && multi && <SportChips sports={sports} value={chip} onChange={setChip} />}

        {!signedIn && !auth.loading && <SignedOutCard />}

        {signedIn && (
          <>
            <LiveSection games={act.games} matches={act.liveItems} />

            {mine.error ? (
              <LoadError error={mine.error} />
            ) : mine.loading ? (
              <Section title="Mis ligas" icon={<Shield className="size-4" />}>
                <ListSkeleton rows={2} />
              </Section>
            ) : leagues.length === 0 ? (
              <NoLeaguesYet sport={sport} others={others} onShowAll={showAll} />
            ) : (
              <>
                <MineSection title="Mis ligas" icon={<Shield className="size-4" />} kind="liga" sport={sport} leagues={ligas} act={act} role={mine.roleOf} showSport={showSport} />
                <MineSection title="Mis torneos" icon={<Trophy className="size-4" />} kind="torneo" sport={sport} leagues={torneos} act={act} role={mine.roleOf} showSport={showSport} />
                <Section title="Próximos" icon={<CalendarClock className="size-4" />} action={<span className="text-xs text-muted">Próximos 30 días</span>}>
                  <UpcomingList items={act.upcoming} today={act.today} showSport={showSport} loading={act.loading} />
                </Section>
              </>
            )}
          </>
        )}

        <Section title="Públicas para unirte" icon={<Globe className="size-4" />}>
          {pub.error ? (
            <LoadError error={pub.error} />
          ) : pub.loading || mine.loading ? (
            <ListSkeleton rows={3} />
          ) : (
            <PublicLeagues leagues={toJoin} today={act.today} showSport={showSport} search emptyText={publicEmptyText({ sport, inSportTotal })} />
          )}
        </Section>

        <JoinCodeCard />
      </div>
    </AppShell>
  );
}

/** «Mis ligas» o «Mis torneos»: la lista (con lo próximo de cada una) o, si no hay, cómo crear. */
function MineSection({
  title,
  icon,
  kind,
  sport,
  leagues,
  act,
  role,
  showSport,
}: {
  title: string;
  icon: ReactNode;
  kind: 'liga' | 'torneo';
  sport: string | null;
  leagues: League[];
  act: ReturnType<typeof useActivity>;
  role: (lid: string) => Member['role'] | undefined;
  showSport: boolean;
}) {
  return (
    <Section title={title} icon={icon} action={leagues.length > 0 ? <span className="text-xs tabular-nums text-muted">{leagues.length}</span> : undefined}>
      {leagues.length === 0 ? (
        <NoneOfKind kind={kind} sport={sport} />
      ) : (
        <LeagueList>
          {leagues.map((l, i) => (
            <LeagueRow key={l.id} league={l} index={i} role={role(l.id)} next={act.nextOf.get(l.id)} today={act.today} showSport={showSport} />
          ))}
        </LeagueList>
      )}
    </Section>
  );
}
