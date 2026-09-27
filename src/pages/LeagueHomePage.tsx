import { lazy, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CalendarDays, CalendarRange, CheckCircle2, ChevronRight, Clock, MapPin, Plus, Trophy, UserPlus, Users } from 'lucide-react';
import { displayName, useAuth } from '../lib/auth';
import { joinLeague, useEntriesOfEvents, useEvents, usePlayerEntries } from '../lib/data';
import { eventLabel, formatDate, formatDateLong, toIsoDate } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { liveInfo } from '../lib/live';
import { useNow } from '../lib/useNow';
import { entryLine, eventPosition } from '../lib/stats';
import type { BowlingEvent, EventType } from '../lib/types';
import { Announcements } from '../components/AnnouncementCard';
import { EventFormModal } from '../components/EventFormModal';
import { LiveBoard } from '../components/LiveBoard';
import { LiveActions } from '../components/LiveNow';
import { useNotifications } from '../components/Notifications';
import { NextPracticeCard } from '../components/NextPracticeCard';
import { SuggestionBox } from '../components/SuggestionBox';
import { Tour } from '../components/Tour';
import { LEAGUE_TOUR } from '../lib/tours';
import { useAction } from '../components/feedback';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, PageSkeleton, Position, Tabs } from '../components/ui';

const EventPage = lazy(() => import('./EventPage'));

/** Inicio: en una liga, sus eventos; en un torneo sin liga, el torneo mismo. */
export default function LeagueHome() {
  const { league } = useLeagueCtx();
  return league.kind === 'torneo' ? <TournamentHome /> : <LeagueEvents />;
}

function TournamentHome() {
  const { lid } = useLeagueCtx();
  const events = useEvents(lid);
  if (events.error) return <LoadError error={events.error} />;
  if (events.loading) return <PageSkeleton />;
  const ev = events.data.find((e) => e.type === 'torneo') ?? events.data[0];
  if (!ev) return <Empty icon={<Trophy className="size-8" />} title="Este torneo no tiene evento">Un admin puede borrarlo y crearlo otra vez.</Empty>;
  return (
    <div className="flex flex-col gap-5">
      <EventPage eventId={ev.id} />
      <SuggestionBox />
    </div>
  );
}

/** Eventos de la liga: anuncios, próxima práctica y la lista de torneos y prácticas (pasadas y por venir). */
function LeagueEvents() {
  const { lid, league, isAdmin, myPlayerId, base, member } = useLeagueCtx();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const events = useEvents(lid);
  const mine = usePlayerEntries(lid, myPlayerId ?? undefined);
  const now = useNow();
  const feed = useNotifications().feeds.find((f) => f.lid === lid);
  const [creating, setCreating] = useState<EventType | null>(null);
  const type: EventType = params.get('ver') === 'practicas' ? 'practica' : 'torneo';

  const myEventIds = useMemo(() => new Set(mine.data.map((e) => e.eventId)), [mine.data]);
  const myTournamentIds = useMemo(
    () => events.data.filter((e) => e.type === 'torneo' && myEventIds.has(e.id)).map((e) => e.id),
    [events.data, myEventIds],
  );
  const tournamentEntries = useEntriesOfEvents(lid, myTournamentIds);

  const byYear = useMemo(() => {
    const groups = new Map<string, BowlingEvent[]>();
    for (const e of events.data.filter((e) => e.type === type)) {
      const y = e.date.slice(0, 4);
      groups.set(y, [...(groups.get(y) ?? []), e]);
    }
    return [...groups.entries()];
  }, [events.data, type]);

  const today = toIsoDate(now);
  const isTorneo = type === 'torneo';
  const liveEvents = events.data.map((event) => ({ event, info: liveInfo(event, league, now) })).filter((l) => l.info.live);
  const counts = {
    torneo: events.data.filter((e) => e.type === 'torneo').length,
    practica: events.data.filter((e) => e.type === 'practica').length,
  };

  return (
    <div className="flex flex-col gap-5">
      <LeagueHeader />
      <Tour name="liga" steps={LEAGUE_TOUR} when={!!member} />
      {!member && league.visibility === 'public' && <JoinBanner />}
      {/* Lo que se está jugando ahora: lo ve toda la liga (y quien mira una liga pública). */}
      {liveEvents.map(({ event: ev, info }) => (
        <LiveBoard key={ev.id} event={ev} info={info} actions={feed && <LiveActions feed={feed} event={ev} />} />
      ))}

      {!events.loading && <Announcements events={events.data} />}
      {myPlayerId && <NextPracticeCard events={events.data} playerId={myPlayerId} />}

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 [&>div]:mx-0 [&>div]:px-0">
          <Tabs
            items={[
              { key: 'torneos', label: 'Torneos', icon: <Trophy className="size-4" />, count: counts.torneo },
              { key: 'practicas', label: 'Prácticas', icon: <CalendarDays className="size-4" />, count: counts.practica },
            ]}
            active={isTorneo ? 'torneos' : 'practicas'}
            onChange={(k) => setParams(k === 'practicas' ? { ver: k } : {}, { replace: true })}
          />
        </div>
        {isAdmin && (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(type)} className="shrink-0">
            <span className="hidden sm:inline">{isTorneo ? 'Nuevo torneo' : 'Nueva práctica'}</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
        )}
      </div>

      {events.error ? (
        <LoadError error={events.error} />
      ) : events.loading ? (
        <ListSkeleton rows={4} />
      ) : byYear.length === 0 ? (
        <Empty
          icon={isTorneo ? <Trophy className="size-8" /> : <CalendarDays className="size-8" />}
          title={isTorneo ? 'Todavía no hay torneos' : 'Todavía no hay prácticas'}
        >
          {isAdmin
            ? isTorneo
              ? 'Crea el torneo para anunciarlo, inscribir jugadores y armar equipos.'
              : 'Crea la práctica para que los jugadores confirmen si van.'
            : 'Cuando el admin los cree aparecerán aquí.'}
        </Empty>
      ) : (
        byYear.map(([year, list]) => (
          <section key={year} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">{year}</h2>
            <Card className="stagger divide-y divide-line overflow-hidden">
              {list.map((e, i) => {
                const played = myEventIds.has(e.id);
                const myEntry = played ? mine.data.find((m) => m.eventId === e.id) : undefined;
                const pos = isTorneo && myEntry ? eventPosition(e, tournamentEntries.data, myEntry.id) : null;
                // Tu promedio de esa sesión (los juegos que cuentan).
                const myLine = myEntry ? entryLine(myEntry, e) : null;
                const upcoming = e.date >= today;
                const going = myPlayerId && e.rsvp?.[myPlayerId];
                return (
                  <Link
                    key={e.id}
                    to={`${base}/e/${e.id}`}
                    style={{ '--i': i } as CSSProperties}
                    className="group flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      {isTorneo ? <Trophy className="size-5" /> : <CalendarDays className="size-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-medium">{isTorneo ? eventLabel(e) : formatDate(e.date)}</span>
                        {upcoming && <Badge tone="accent">{e.date === today ? 'Hoy' : 'Próximo'}</Badge>}
                        {played && !upcoming && (
                          <Badge tone="ok">
                            <CheckCircle2 className="size-3" /> {isTorneo ? 'Jugaste' : 'Fuiste'}
                          </Badge>
                        )}
                        {going && upcoming && <Badge tone="ok">Vas</Badge>}
                      </div>
                      <div className="truncate text-xs text-muted first-letter:uppercase">
                        {isTorneo ? formatDateLong(e.date) : `${e.games} juegos`}
                        {isTorneo && e.hcpPercent > 0 && ` · Hcp ${e.hcpPercent}% de ${e.hcpBase}`}
                        {myLine && myLine.games > 0 && (
                          <>
                            {' · '}
                            <span className="font-semibold text-fg">tu promedio {myLine.avg}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {pos ? (
                      <span className="flex flex-col items-center text-[10px] text-muted">
                        <Position pos={pos.pos} />
                        de {pos.of}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-sm text-muted tabular-nums">
                        <Users className="size-4" />
                        {upcoming && !isTorneo ? Object.keys(e.rsvp ?? {}).length : (e.playerCount ?? 0)}
                      </span>
                    )}
                    <ChevronRight className="size-4 text-muted" />
                  </Link>
                );
              })}
            </Card>
          </section>
        ))
      )}

      {/* Buzón de sugerencias anónimo (para los organizadores). */}
      <SuggestionBox />

      {isAdmin && (
        <EventFormModal
          open={creating != null}
          onClose={() => setCreating(null)}
          type={creating ?? type}
          onCreated={(id) => navigate(`${base}/e/${id}`)}
        />
      )}
    </div>
  );
}

/** Datos de la liga: dónde y cuándo juegan, y la temporada. */
function LeagueHeader() {
  const { league } = useLeagueCtx();
  const season =
    league.seasonStart && league.seasonEnd ? `Temporada ${formatDate(league.seasonStart)} – ${formatDate(league.seasonEnd)}` : null;
  const bits = [
    league.venue && { icon: <MapPin className="size-3.5" />, text: league.venue },
    league.schedule && { icon: <Clock className="size-3.5" />, text: league.schedule },
    season && { icon: <CalendarRange className="size-3.5" />, text: season },
  ].filter(Boolean) as { icon: ReactNode; text: string }[];
  if (!bits.length) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {bits.map((b) => (
        <span key={b.text} className="inline-flex items-center gap-1">
          {b.icon}
          {b.text}
        </span>
      ))}
    </div>
  );
}

/** Observador de una liga pública: invitación a unirse. */
function JoinBanner() {
  const { lid, league, base } = useLeagueCtx();
  const auth = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const [busy, setBusy] = useState(false);

  async function join() {
    if (!auth.user) return navigate(`/login?next=${encodeURIComponent(base)}`);
    setBusy(true);
    // Al unirse ya es jugador: se queda en la liga (la página cambia sola).
    await run(async () => {
      await joinLeague(lid, { uid: auth.user!.uid, name: displayName(auth) }, null);
      return true;
    }, `Te uniste a ${league.name}`);
    setBusy(false);
  }

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="font-medium">Estás viendo {league.name}</p>
        <p className="text-sm text-muted">Únete para confirmar asistencia, subir tus juegos y salir en el ranking.</p>
      </div>
      <Button variant="primary" icon={<UserPlus className="size-4" />} loading={busy} onClick={join}>
        Unirme
      </Button>
    </Card>
  );
}
