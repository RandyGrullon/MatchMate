import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { inSport } from '../lib/sportContext';
import { useIsPro } from '../lib/useMode';
import { sportsOf } from '../sports/registry';
import { useCreateMenu } from '../components/CreateMenu';
import { AppShell } from '../components/Shell';
import { ALL_SPORTS, ligasSport, openLeaguesSubtitle, splitMine, tourneysOf } from '../components/eventos/logic';
import { useActivity, useMyLeagues } from '../components/home/useHomeData';
import { LeagueListRow, NoLeaguesCard, OpenLeaguesRow, SportFilter, TourneyRow } from '../components/ligas/LigasRows';
import { OpenLeagues } from '../components/ligas/OpenLeagues';
import { Card, ListSkeleton, LoadError, Loading, SectionHeader, cx } from '../components/ui';

/**
 * Ligas (`/ligas`, la pestaña Ligas; antes «Eventos»), rediseño «Calma y foco»: el título con «Crear o unirme» (la hoja
 * que antes era el botón del centro de la barra), «Tus ligas» (cada una con lo de hoy: «En juego hoy · 6 jugadores»),
 * «Tus torneos» (los sin liga y los de tus ligas que vienen) y «Buscar ligas abiertas» (las públicas de todos los
 * deportes y la agenda pública, en `?ver=abiertas`). El filtro de deporte sale solo si juegas más de uno. Lo de hoy y
 * lo que viene (con «Voy») está en Hoy y su Calendario; aquí no se repite. Sin cuenta: las abiertas.
 */
export default function LeaguesPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  if (auth.loading) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }
  const signedIn = !!auth.user;
  return <AppShell>{signedIn && params.get('ver') !== 'abiertas' ? <MyLeagues /> : <OpenLeagues signedIn={signedIn} />}</AppShell>;
}

function MyLeagues() {
  const pro = useIsPro();
  const create = useCreateMenu();
  const [params, setParams] = useSearchParams();
  const mine = useMyLeagues(null);
  const mySports = useMemo(() => sportsOf(mine.all), [mine.all]);
  // Sin elegir en los chips, «Todos» (la última liga que se vio no esconde las demás).
  const sport = ligasSport(mySports, params.get('deporte'));
  const leagues = useMemo(() => mine.all.filter(inSport(sport)), [mine.all, sport]);
  const act = useActivity(leagues, mine.uid);
  const { ligas } = splitMine(leagues, act.nextOf);
  const tourneys = useMemo(() => tourneysOf(leagues, act.upcoming, act.today), [leagues, act.upcoming, act.today]);

  // En juego ahora (ya es la hora, no «empieza pronto»): las ligas y los eventos; y cuántos inscritos tiene cada evento.
  const { liveLeagues, liveEvents, entrants } = useMemo(() => {
    const started = act.games.filter((g) => !g.info.startsSoon);
    return {
      liveLeagues: new Set([...started.map((g) => g.feed.lid), ...act.liveItems.map((m) => m.league.id)]),
      liveEvents: new Set(started.map((g) => g.event.id)),
      entrants: new Map(act.feeds.flatMap((f) => f.events.map((e) => [e.id, e.playerCount] as const))),
    };
  }, [act.games, act.liveItems, act.feeds]);
  const logoOf = (lid: string) => leagues.find((l) => l.id === lid)?.logoPath ?? null;
  const ligasCount = leagues.filter((l) => l.kind !== 'torneo').length;

  const setSport = (s: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('deporte', s ?? ALL_SPORTS);
        return n;
      },
      { replace: true },
    );

  let body;
  if (mine.error && !mine.all.length) body = <LoadError error={mine.error} />;
  else if (mine.loading && !mine.all.length)
    body = (
      <section className="mt-[26px]">
        <SectionHeader title="Tus ligas" />
        <ListSkeleton rows={2} />
      </section>
    );
  else if (!mine.all.length)
    body = (
      <div className="mt-[26px]">
        <NoLeaguesCard onCreate={create.openMenu} />
      </div>
    );
  else
    body = (
      <>
        {ligas.length > 0 && (
          <section aria-labelledby="tus-ligas" className="mt-[26px]">
            <SectionHeader id="tus-ligas" title="Tus ligas" />
            <Card className="overflow-hidden">
              {ligas.map((l) => (
                <LeagueListRow
                  key={l.id}
                  league={l}
                  live={liveLeagues.has(l.id)}
                  next={act.nextOf.get(l.id)}
                  today={act.today}
                  role={mine.roleOf(l.id)}
                  pro={pro}
                />
              ))}
            </Card>
          </section>
        )}
        {tourneys.length > 0 && (
          <section aria-labelledby="tus-torneos" className={ligas.length ? 'mt-[30px]' : 'mt-[26px]'}>
            <SectionHeader id="tus-torneos" title="Tus torneos" />
            <Card className="overflow-hidden">
              {tourneys.map((t) => (
                <TourneyRow
                  key={t.key}
                  t={t}
                  logoPath={logoOf(t.lid)}
                  live={!!t.eventId && liveEvents.has(t.eventId)}
                  entrants={t.eventId ? entrants.get(t.eventId) : null}
                  today={act.today}
                  showLeague={ligasCount > 1}
                  pro={pro}
                />
              ))}
            </Card>
          </section>
        )}
      </>
    );

  return (
    <div className="flex flex-col px-2">
      <header className="flex items-center justify-between gap-3">
        <h1 className={pro ? 'text-title-pro' : 'text-title'}>Ligas</h1>
        {/* Se ve de 40 px (como el diseño) y se toca en 44. */}
        <button
          type="button"
          onClick={create.openMenu}
          aria-haspopup="dialog"
          className="relative inline-flex h-10 shrink-0 items-center gap-[7px] rounded-full bg-accent-soft px-4 text-meta font-semibold whitespace-nowrap text-accent transition after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-[''] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.4} />
          Crear o unirme
        </button>
      </header>

      {/* Solo si juegas más de un deporte: «Todos» y los tuyos. */}
      {mySports.length > 1 && <SportFilter sports={mySports} value={sport} onChange={setSport} className="mt-5" />}

      {body}

      <div className={cx(mine.all.length || mine.loading ? 'mt-[30px]' : 'mt-5')}>
        <OpenLeaguesRow subtitle={openLeaguesSubtitle(mySports)} pro={pro} />
      </div>
    </div>
  );
}
