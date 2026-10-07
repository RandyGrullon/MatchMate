import { lazy, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Trophy, UserPlus } from 'lucide-react';
import { upcomingCalendar } from '../lib/calendar';
import { useEvents, usePlayers } from '../lib/data';
import { toIsoDate } from '../lib/format';
import { useLeagueCtx } from '../lib/league';
import { liveGames } from '../lib/live';
import { useNow } from '../lib/useNow';
import type { EventType } from '../lib/types';
import { EventFormModal } from '../components/EventFormModal';
import { AHEAD_DAYS } from '../components/home/useHomeData';
import { LeagueCalendarSheet, PlayersSheet } from '../components/league/home/LeagueSheets';
import { LeagueIdent, LeagueRows, NextDates, NowCard, ROW_ICONS, TableTop, type LeagueRowDef } from '../components/league/home/LeagueSections';
import { nextDates, pastLine, peopleLine, tableTop } from '../components/league/home/logic';
import { useLeagueFeed, useLeagueToDo, useSeasonTable } from '../components/league/home/useLeagueData';
import { LeagueHomeBottom, LeagueHomeTop, useLeagueHomeNotices } from '../components/league/LeagueHome';
import { useJoinFlow } from '../components/league/WhoAreYou';
import { useMode } from '../components/mode';
import { NoticeSlot } from '../components/NoticeSlot';
import { SuspendTodayCard } from '../components/organizer/SuspendDay';
import { SuggestionBox } from '../components/SuggestionBox';
import { Button, Card, Empty, LoadError, PageSkeleton, Skeleton, cx } from '../components/ui';

const EventPage = lazy(() => import('./EventPage'));

/** Inicio: en una liga, la liga en una sola pantalla; en un torneo sin liga, el torneo mismo. */
export default function LeagueHome() {
  const { league } = useLeagueCtx();
  return league.kind === 'torneo' ? <TournamentHome /> : <LeagueScreen />;
}

/** Torneo sin liga: su evento (EventPage), con lo de arriba y lo de abajo de cualquier inicio y el aviso de la pantalla. */
function TournamentHome() {
  const { lid } = useLeagueCtx();
  const { isPro } = useMode();
  const events = useEvents(lid);
  useLeagueHomeNotices(isPro);
  if (events.error) return <LoadError error={events.error} />;
  if (events.loading) return <PageSkeleton />;
  const ev = events.data.find((e) => e.type === 'torneo') ?? events.data[0];
  if (!ev) return <Empty icon={<Trophy className="size-8" />} title="Este torneo no tiene evento">Un admin puede borrarlo y crearlo otra vez.</Empty>;
  return (
    <div className="flex flex-col gap-5">
      <LeagueHomeTop />
      <EventPage eventId={ev.id} />
      <NoticeSlot />
      <LeagueHomeBottom />
      <SuggestionBox />
    </div>
  );
}

type LeagueSheet = 'calendario' | 'jugadores';

/** «Mis números en esta liga»; en un teléfono angosto (menos de 390 px) no cabe entero: «Mis números». */
const MY_NUMBERS = (
  <>
    Mis números<span className="max-[389px]:hidden"> en esta liga</span>
  </>
);

/**
 * La liga en una sola pantalla, sin pestañas (rediseño «Calma y foco», `2-liga.png`): «‹ Ligas» e «Invitar» arriba
 * (LeagueShell), el ícono y el nombre completo con cuándo y dónde juegan; «En juego ahora» con el botón de anotar (1
 * toque, la misma lógica que Hoy); la Tabla (los 3 de arriba y «Ver toda»); «Próximas fechas» con «Voy» en línea y el
 * Calendario; y las filas Jugadores, Resultados anteriores y Mis números (en Pro, «Organizas esta liga» → Organizar).
 * Un solo aviso (NoticeSlot): a quien organiza en Lite, lo pendiente o «Organizas esta liga · Probar Pro».
 *
 * Lo de las 5 pestañas de antes sigue a un toque: Calendario → hoja Calendario (con «Nueva práctica» para quien
 * organiza); Juegos → Resultados anteriores (`/juegos`); Ranking → Tabla › Ver toda (`/ranking`); Mis juegos → Mis
 * números (`/perfil`); Admin → Organizar (`/admin`). La tabla en vivo está en la práctica (tocar «Práctica de hoy»).
 */
function LeagueScreen() {
  const { lid, league, isAdmin, myPlayerId, base, member } = useLeagueCtx();
  const { isPro } = useMode();
  const navigate = useNavigate();
  const now = useNow();
  const today = toIsoDate(now);
  const data = useLeagueFeed();
  const table = useSeasonTable();
  const players = usePlayers(lid);
  const toDo = useLeagueToDo(isPro && isAdmin ? lid : null, true);
  const [sheet, setSheet] = useState<LeagueSheet | null>(null);
  const [creating, setCreating] = useState<EventType | null>(null);
  useLeagueHomeNotices(isPro);

  const live = useMemo(() => liveGames([data.feed], [league], now), [data.feed, league, now]);
  const dates = useMemo(() => {
    const items = upcomingCalendar([data.feed], [league], today, AHEAD_DAYS).filter((it) => it.date >= today);
    return nextDates(items, new Set(live.map((g) => `${lid}:${g.event.id}`)));
  }, [data.feed, league, today, live, lid]);
  const top = useMemo(() => tableTop(table.rows, myPlayerId), [table.rows, myPlayerId]);
  const observer = !member && league.visibility === 'public';

  const rows: LeagueRowDef[] = [
    {
      key: 'jugadores',
      icon: ROW_ICONS.players,
      title: 'Jugadores',
      subtitle: players.data.length ? peopleLine(players.data.length) : null,
      onClick: () => setSheet('jugadores'),
    },
    { key: 'resultados', icon: ROW_ICONS.results, title: 'Resultados anteriores', subtitle: pastLine(data.events, today), to: `${base}/juegos` },
    ...(member ? [{ key: 'numeros', icon: ROW_ICONS.numbers, title: MY_NUMBERS, to: `${base}/perfil` }] : []),
    // Pro: lo de la antigua pestaña Admin, con lo que espera.
    ...(isPro && isAdmin
      ? [
          {
            key: 'organizar',
            icon: ROW_ICONS.organize,
            title: 'Organizas esta liga',
            subtitle: toDo.line || 'Jugadores, fechas y ajustes',
            to: `${base}/admin`,
            count: toDo.count,
            accent: true,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col px-2">
      <LeagueIdent className="mt-1" />

      <LeagueHomeTop className="mt-[22px]" />
      {observer && <JoinBanner className="mt-[22px]" />}

      {data.error && !data.events.length ? (
        <div className="mt-[22px]">
          <LoadError error={data.error} />
        </div>
      ) : data.loading ? (
        <Skeleton className="mt-[22px] h-[188px] rounded-3xl" />
      ) : (
        live.map((g) => (
          <div key={g.event.id} className="mt-[22px]">
            <NowCard game={g} today={today} member={!!member} />
          </div>
        ))
      )}
      {isPro && isAdmin && (
        <div className="mt-3.5 empty:hidden">
          <SuspendTodayCard key={`suspender-${lid}`} />
        </div>
      )}

      <TableTop rows={top} loading={table.loading} className="mt-[30px]" />

      {data.loading ? (
        <Skeleton className="mt-[30px] h-40 rounded-3xl" />
      ) : (
        <NextDates items={dates} events={data.events} today={today} onCalendar={() => setSheet('calendario')} className="mt-[30px]" />
      )}

      <LeagueRows rows={rows} className="mt-[30px]">
        {/* Para los jugadores: el buzón anónimo para quien organiza (a quien organiza no le sale). */}
        <SuggestionBox row />
      </LeagueRows>

      {/* El único aviso de la pantalla, al final de la liga (como una fila discreta). */}
      <NoticeSlot className="mt-4" />

      <LeagueHomeBottom className="mt-[30px]" />

      <PlayersSheet open={sheet === 'jugadores'} onClose={() => setSheet(null)} />
      <LeagueCalendarSheet
        open={sheet === 'calendario'}
        onClose={() => setSheet(null)}
        feed={data.feed}
        today={today}
        onCreate={
          // Pro: quien organiza crea aquí la próxima fecha (en Lite está en Ligas › Crear o unirme).
          isAdmin && isPro
            ? (type) => {
                setSheet(null);
                setCreating(type);
              }
            : undefined
        }
      />
      {isAdmin && (
        <EventFormModal open={creating != null} onClose={() => setCreating(null)} type={creating ?? 'practica'} onCreated={(id) => navigate(`${base}/e/${id}`)} />
      )}
    </div>
  );
}

/**
 * Observador de una liga pública: invitación a unirse, con «¿Quién eres?» si el admin ya anotó jugadores sin cuenta
 * (el mismo camino que en todas partes). Al unirse ya es jugador: se queda en la liga (la página cambia sola).
 */
function JoinBanner({ className }: { className?: string }) {
  const { lid, league, base } = useLeagueCtx();
  const flow = useJoinFlow();
  const join = () => flow.start({ lid, name: league.name, sport: league.sport, kind: league.kind, next: base });

  return (
    <Card className={cx('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', className)}>
      <div className="flex-1">
        <p className="font-medium">Estás viendo {league.name}</p>
        <p className="text-sm text-muted">Únete para confirmar asistencia, subir tus juegos y salir en el ranking.</p>
      </div>
      <Button variant="primary" icon={<UserPlus className="size-4" />} loading={flow.busy === lid} onClick={join}>
        Unirme
      </Button>
      {flow.modal}
    </Card>
  );
}
