import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Plus, Shield } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useMySquads } from '../lib/data/squads';
import { useLiveNow } from '../lib/data/streams';
import { inSport, useActiveSport } from '../lib/sportContext';
import { useIsPro } from '../lib/useMode';
import { sportsOf } from '../sports/registry';
import { useCreateMenu } from '../components/CreateMenu';
import { EsportsRowCard, useEsportsPresence } from '../components/home/EsportsHomeRow';
import { AppShell } from '../components/Shell';
import { ALL_SPORTS, ligasSport, openLeaguesSubtitle, splitMine, tourneysOf, type TourneyItem } from '../components/eventos/logic';
import { useActivity, useMyLeagues } from '../components/home/useHomeData';
import { LeagueCardsSkeleton, LigasSummary, MyLeagueCard, SquadCards, TourneyCard, TourneyStrip } from '../components/ligas/LigasCards';
import { NoLeaguesCard, OpenLeaguesRow, SportFilter } from '../components/ligas/LigasRows';
import { ligasSummary, soonest } from '../components/ligas/logic';
import { OpenLeagues } from '../components/ligas/OpenLeagues';
import { SearchButton } from '../components/social/SearchButton';
import { Card, ListRow, LoadError, Loading, RowIcon, SectionHeader, cx, sectionLinkClass } from '../components/ui';

/**
 * Ligas (`/ligas`, la pestaña Ligas; antes «Eventos»), rediseño «Calma y foco»: el título con «Crear o unirme» (la hoja
 * que antes era el botón del centro de la barra) y la lupa (buscar personas y ligas), debajo el resumen («3 ligas · 1 en
 * vivo · Próximo: hoy 7:30 pm»), «Tus ligas» (cada una en su tarjeta, en el color de su deporte: lo próximo, «EN VIVO»,
 * los jugadores y, en el boliche, tu lugar y tu promedio), «Tus torneos» (tarjetas que se deslizan de lado: los sin liga
 * y los de tus ligas que vienen) y «Buscar ligas abiertas» (las públicas de todos los deportes y la agenda pública, en
 * `?ver=abiertas`). «Tus equipos» (los de fuera de una liga, cada uno en su color: hasta 3, con «Ver todos» →
 * /equipos) o, sin ninguno, la fila «Equipos» para crear uno. El filtro de deporte sale solo si juegas más de uno (y
 * filtra todo). Lo de hoy y lo que viene (con «Voy») está en Hoy y su Calendario; aquí no se repite. Sin cuenta: las
 * abiertas. Con el filtro en Esports (o sin filtro y la cuenta en esports), la fila «Torneos de esports» lleva a
 * `/esports` (los torneos donde juega salen solos: es miembro de su liga).
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
  // Las transmisiones activas de mis ligas (la misma lectura que «En vivo» de Hoy): la liga sale «EN VIVO».
  const streams = useLiveNow().data;

  // En juego ahora (ya es la hora, no «empieza pronto»): las ligas (o su transmisión) y los eventos; y cuántos inscritos
  // tiene cada evento.
  const { liveLeagues, liveEvents, entrants } = useMemo(() => {
    const started = act.games.filter((g) => !g.info.startsSoon);
    return {
      liveLeagues: new Set([...started.map((g) => g.feed.lid), ...act.liveItems.map((m) => m.league.id), ...streams.map((s) => s.leagueId)]),
      liveEvents: new Set(started.map((g) => g.event.id)),
      entrants: new Map(act.feeds.flatMap((f) => f.events.map((e) => [e.id, e.playerCount] as const))),
    };
  }, [act.games, act.liveItems, act.feeds, streams]);
  const feedOf = (lid: string) => act.feeds.find((f) => f.lid === lid);
  const logoOf = (lid: string) => leagues.find((l) => l.id === lid)?.logoPath ?? null;
  const tourneyLive = (t: TourneyItem) => (!!t.eventId && liveEvents.has(t.eventId)) || (t.standalone && liveLeagues.has(t.lid));
  const ligasCount = leagues.filter((l) => l.kind !== 'torneo').length;
  // Arriba: «3 ligas · 1 en vivo · Próximo: hoy 7:30 pm» (solo lo que hay).
  const summary = ligasSummary({
    ligas: ligas.length,
    torneos: tourneys.length,
    live: ligas.filter((l) => liveLeagues.has(l.id)).length + tourneys.filter(tourneyLive).length,
    next: soonest(leagues.flatMap((l) => act.nextOf.get(l.id) ?? [])),
    today: act.today,
  });
  // Esports: con el filtro en Esports, o sin filtro y la cuenta en esports (sus ligas, el deporte activo, sus equipos).
  const activeSport = useActiveSport();
  const esports = useEsportsPresence(mine.uid, activeSport);
  const showEsports = sport === 'esports' || (!sport && (mySports.includes('esports') || esports.show));
  // Tus equipos (fuera de una liga), con el mismo filtro de deporte. Sin ninguno, la fila para crear uno.
  const squads = useMySquads();
  const squadList = useMemo(() => (sport ? squads.data.filter((s) => s.sport === sport) : squads.data), [squads.data, sport]);
  const squadMode: 'list' | 'row' | null =
    squadList.length > 0 ? 'list' : squads.loading || squads.data.length > 0 || sport === 'esports' ? null : 'row';

  const setSport = (s: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('deporte', s ?? ALL_SPORTS);
        return n;
      },
      { replace: true },
    );

  // Lo que va abajo (Equipos, esports, ligas abiertas) se separa más si arriba hay listas.
  const rowsGap = mine.all.length || mine.loading || squadMode === 'list' ? 'mt-[30px]' : 'mt-5';
  // Las tarjetas entran una tras otra; en Pro, más juntas y, desde 640 px, en dos columnas.
  const grid = cx('stagger grid', pro ? 'gap-3 sm:grid-cols-2' : 'gap-3.5');

  let body;
  if (mine.error && !mine.all.length) body = <LoadError error={mine.error} />;
  else if (mine.loading && !mine.all.length)
    body = (
      <section className="mt-[26px]">
        <SectionHeader title="Tus ligas" />
        <LeagueCardsSkeleton pro={pro} />
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
            <div className={grid}>
              {ligas.map((l, i) => {
                const feed = feedOf(l.id);
                return (
                  <MyLeagueCard
                    key={l.id}
                    index={i}
                    league={l}
                    live={liveLeagues.has(l.id)}
                    next={act.nextOf.get(l.id)}
                    today={act.today}
                    role={mine.roleOf(l.id)}
                    playerId={feed?.playerId}
                    pending={feed?.isAdmin ? feed.pending.length : 0}
                    pro={pro}
                  />
                );
              })}
            </div>
          </section>
        )}
        {tourneys.length > 0 && (
          <section aria-labelledby="tus-torneos" className={ligas.length ? 'mt-[30px]' : 'mt-[26px]'}>
            <SectionHeader id="tus-torneos" title="Tus torneos" />
            <TourneyStrip pro={pro}>
              {tourneys.map((t) => (
                <TourneyCard
                  key={t.key}
                  t={t}
                  logoPath={logoOf(t.lid)}
                  live={tourneyLive(t)}
                  entrants={t.eventId ? entrants.get(t.eventId) : null}
                  today={act.today}
                  showLeague={ligasCount > 1}
                  pro={pro}
                />
              ))}
            </TourneyStrip>
          </section>
        )}
      </>
    );

  return (
    <div className="flex flex-col px-2">
      <header className="flex items-center justify-between gap-3">
        <h1 className={pro ? 'text-title-pro' : 'text-title'}>Ligas</h1>
        <div className="flex shrink-0 items-center gap-2.5">
          {/* Se ve de 40 px (como el diseño) y se toca en 44. Con menos de 390 px, sin el «+»: así cabe la lupa al lado. */}
          <button
            type="button"
            onClick={create.openMenu}
            aria-haspopup="dialog"
            className="relative inline-flex h-10 shrink-0 items-center gap-[7px] rounded-full bg-accent-soft px-4 text-meta font-semibold whitespace-nowrap text-accent transition after:absolute after:-inset-y-0.5 after:inset-x-0 after:content-[''] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Plus aria-hidden="true" className="size-[18px] max-[390px]:hidden" strokeWidth={2.4} />
            Crear o unirme
          </button>
          {/* La lupa: personas con cuenta y ligas (como la de Hoy). */}
          <SearchButton />
        </div>
      </header>
      {/* De un vistazo: cuántas, cuántas en vivo y lo próximo. */}
      <LigasSummary parts={summary} className="mt-1.5" />

      {/* Solo si juegas más de un deporte: «Todos» y los tuyos. */}
      {mySports.length > 1 && <SportFilter sports={mySports} value={sport} onChange={setSport} className="mt-5" />}

      {body}

      {squadMode === 'list' && (
        <section aria-labelledby="tus-equipos" className="mt-[30px]">
          <SectionHeader
            id="tus-equipos"
            title="Tus equipos"
            action={
              <Link to="/equipos" className={sectionLinkClass}>
                Ver todos
              </Link>
            }
          />
          <SquadCards squads={squadList.slice(0, 3)} pro={pro} />
        </section>
      )}

      {squadMode === 'row' && (
        <Card className={cx('overflow-hidden', rowsGap)}>
          <ListRow
            dense={pro}
            leading={
              <RowIcon tone="accent">
                <Shield className="size-5" />
              </RowIcon>
            }
            title="Equipos"
            subtitle="Crea tu equipo competitivo, con o sin liga"
            to="/equipos"
          />
        </Card>
      )}

      {showEsports && (
        <EsportsRowCard
          title="Torneos de esports"
          subtitle="Torneos y equipos por juego"
          game={esports.game}
          pro={pro}
          className={squadMode === 'row' ? 'mt-3.5' : rowsGap}
        />
      )}

      <div className={cx(showEsports || squadMode === 'row' ? 'mt-3.5' : rowsGap)}>
        <OpenLeaguesRow subtitle={openLeaguesSubtitle(mySports)} pro={pro} />
      </div>
    </div>
  );
}
