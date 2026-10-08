import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Check, ChevronRight, ClipboardPen, Flag, LandPlot, PencilLine, Signature, UserPlus, type LucideIcon } from 'lucide-react';
import { useEvents } from '../../../lib/data';
import { useGolfCardPlayers, useGolfCourses, useGolfEvent, useGolfRounds, useGolfTournaments, type GolfRoundDoc } from '../../../lib/data/golf';
import { useLeagueSeasons } from '../../../lib/data/seasons';
import { eventLabel, toIsoDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { formatTime } from '../../../lib/schedule';
import { currentSeason } from '../../../lib/seasons';
import type { BowlingEvent } from '../../../lib/types';
import { useNow } from '../../../lib/useNow';
import { scoreRound } from '../../../sports/golf/scoring';
import { weekdayLabel } from '../../../components/home/logic';
import { ActionLink, LiveDot } from '../../../components/home/TodayCard';
import { useIsPro } from '../../../components/mode';
import { Initials, PosNum, TuTag } from '../../../components/ranking/parts';
import { BusyIcon } from '../../../components/busy';
import { Button, Card, DateBlock, ListRow, ListSkeleton, LoadError, RowIcon, SectionHeader, Skeleton } from '../../../components/ui';
import { EmptyCard, MenuSheets, SectionAdd, SectionLink, ShowMore, useMenuSheet } from '../FieldChrome';
import { groupOrder, mergeCard, nextGroupHole, useCourtLog } from './courtLog';
import GolfEvent from './GolfEvent';
import { golfNow, meritTop, scoreText, type NowAction } from './home';
import { RoundForm } from './RoundForm';
import { cardHoles, formatLabel, golfRoundOf, holesDone, isComplete, nineLabel, startIndex } from './logic';
import { useGolfMerit } from './seasonTable';

/**
 * Inicio de la liga de golf (rediseño «Calma y foco», con la forma de la liga del boliche; el ícono, el nombre y las filas
 * de abajo los pone LeagueHomeFrame):
 * - la ronda de hoy una sola vez, con lo tuyo en una línea y UN botón («Seguir en el hoyo 8», «Inscribirme»);
 * - el orden de mérito (los 3 de arriba, con tu lugar) y «Ver toda»;
 * - «Próximas rondas» como filas con su fecha («OCT / 17») y, para el admin, «+ Nueva» a la derecha; sin nada próximo, la
 *   tarjeta vacía con el único botón de la pantalla. Sin campo todavía, primero «Agregar el campo»;
 * - «Resultados»: las rondas jugadas (3 y «Ver las 8»).
 * Un torneo sin liga con una sola ronda muestra la ronda directo.
 */
export default function GolfHome() {
  const { lid, isAdmin, league } = useLeagueCtx();
  const events = useEvents(lid);
  const rounds = useGolfRounds(lid);
  const courses = useGolfCourses(lid);
  const tournaments = useGolfTournaments(lid);
  const [creating, setCreating] = useState(false);
  const today = toIsoDate(useNow());

  const byEvent = useMemo(() => new Map(rounds.data.map((r) => [r.eventId, r] as const)), [rounds.data]);
  const upcoming = events.data.filter((e) => e.date >= today && !byEvent.get(e.id)?.closed).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.data.filter((e) => !upcoming.includes(e)).sort((a, b) => b.date.localeCompare(a.date));

  if (league.kind === 'torneo' && events.data.length === 1) return <GolfEvent eventId={events.data[0].id} />;
  if (events.error) return <LoadError error={events.error} />;

  const tournamentName = (id: string | null) => (id ? tournaments.data.find((t) => t.id === id)?.name : null);
  // La ronda de hoy va arriba una sola vez (en «Próximas rondas» ya no sale).
  const now = upcoming.find((e) => e.date === today) ?? null;
  const next = upcoming.filter((e) => e !== now);
  const noCourse = isAdmin && !courses.loading && !courses.data.length;
  const canCreate = isAdmin && courses.data.length > 0;
  const loading = events.loading && !events.data.length;

  return (
    <div className="flex flex-col gap-[30px]">
      {now && <TodayRound event={now} />}

      {noCourse && (
        <EmptyCard
          icon={<LandPlot className="size-5" />}
          title="Primero, el campo"
          text="El par y el SI de cada hoyo, y el rating y slope de cada salida."
          action={
            <ActionLink to={`/l/${lid}/admin?tab=campos`} icon={LandPlot} size="lg">
              Agregar el campo
            </ActionLink>
          }
        />
      )}

      <MeritTop />

      <section aria-labelledby="golf-proximas">
        <SectionHeader
          id="golf-proximas"
          title="Próximas rondas"
          action={canCreate && (next.length > 0 || now) ? <SectionAdd label="Nueva" onClick={() => setCreating(true)} /> : undefined}
        />
        {loading ? (
          <ListSkeleton rows={2} />
        ) : next.length ? (
          <RoundList events={next} byEvent={byEvent} today={today} tournamentName={tournamentName} />
        ) : now ? (
          <p className="mx-1 text-meta text-muted">No hay más rondas por ahora.</p>
        ) : (
          <EmptyCard
            icon={<Flag className="size-5" />}
            title="No hay rondas próximas"
            text={isAdmin ? 'Crea la próxima ronda o un torneo de varias rondas.' : 'Cuando el admin cree la próxima ronda, sale aquí para inscribirte.'}
            action={
              canCreate && (
                <Button variant="primary" size="lg" icon={<PencilLine className="size-5" />} onClick={() => setCreating(true)}>
                  Nueva ronda o torneo
                </Button>
              )
            }
          />
        )}
      </section>

      {/* Torneo sin liga con varias rondas (Pro): sus anotadores anotan en todas. */}
      {isAdmin && league.kind === 'torneo' && <TournamentScorers />}

      {past.length > 0 && (
        <section aria-labelledby="golf-resultados">
          <SectionHeader id="golf-resultados" title="Resultados" />
          <ShowMore items={past} noun="rondas" render={(shown) => <RoundList events={shown} byEvent={byEvent} today={today} tournamentName={tournamentName} />} />
        </section>
      )}

      <RoundForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/**
 * «Anotadores» de un torneo sin liga con varias rondas (sus anotadores anotan en todas), como una fila (Pro): «Juega»
 * quien tiene tarjeta en alguna (se leen solo aquí, para el admin). Mientras llegan, nadie sale con «Juega».
 */
function TournamentScorers() {
  const { lid, league } = useLeagueCtx();
  const pro = useIsPro();
  const cards = useGolfCardPlayers(pro ? lid : undefined);
  const sheet = useMenuSheet();
  if (!pro) return null;
  const busy = sheet.isBusy();
  return (
    <Card className="overflow-hidden">
      <ListRow
        leading={
          <RowIcon>
            <ClipboardPen className="size-5" />
          </RowIcon>
        }
        title="Anotadores"
        subtitle="Anotan en todas las rondas del torneo"
        onClick={() => sheet.show('anotadores')}
        ariaLabel="Anotadores del torneo"
        chevron={!busy}
        trailing={busy ? <BusyIcon busy className="size-5 text-faint" /> : undefined}
      />
      <MenuSheets
        open={sheet.open}
        onClose={sheet.close}
        scorers={{ target: { scope: 'liga', refId: null, title: league.name }, participants: cards.loading && !cards.data.length ? undefined : cards.data }}
      />
    </Card>
  );
}

const NOW_ICON: Record<NowAction['tab'], LucideIcon> = { tarjeta: PencilLine, jugadores: UserPlus, leaderboard: Check };

/**
 * La ronda de hoy, una sola vez (como «En juego ahora» de la liga del boliche): «En juego ahora · 6 jugando» (o «Hoy ·
 * sale a las 7:30 am»), el nombre (abre la ronda), lo tuyo en una línea («Llevas 7 hoyos · 21 pts», con lo anotado en este
 * teléfono) y UN botón que lleva a lo que toca: tu tarjeta, inscribirte o los grupos (quien anota).
 */
function TodayRound({ event }: { event: BowlingEvent }) {
  const { lid, base, isAdmin, member, myPlayerId } = useLeagueCtx();
  const golf = useGolfEvent(lid, event.id);
  const [log] = useCourtLog(event.id);
  const round = golf.data.round;
  const cards = useMemo(() => golf.data.cards.map((c) => mergeCard(c, log)), [golf.data.cards, log]);
  const card = myPlayerId ? (cards.find((c) => c.playerId === myPlayerId) ?? null) : null;
  const playing = cards.filter((c) => holesDone(c) > 0).length;
  const title = eventLabel({ type: event.type, name: event.name, date: event.date }, 'golf');
  const start = event.startTime ? formatTime(event.startTime.slice(0, 5)) : '';
  const when = playing ? 'En juego ahora' : start ? `Hoy · sale a las ${start}` : 'Hoy';

  let state = null;
  if (round && card) {
    const order = groupOrder(card.strokes.length, startIndex(round, card.startHole));
    const nx = nextGroupHole([card], order);
    state = {
      holes: holesDone(card),
      complete: isComplete(card),
      signed: card.signed,
      score: scoreText(scoreRound(golfRoundOf(round, card), round.competition), round.competition),
      nextHole: nx != null ? (cardHoles(round, card.teeId)[nx]?.number ?? nx + 1) : null,
    };
  }
  const { line, action } = golfNow({ mine: state, hasCourse: !!round, staff: isAdmin || !!member?.scorer, member: !!member });
  const ready = !golf.loading || !!round;

  return (
    <Card soft className="pt-[18px] pr-[18px] pb-[18px] pl-5">
      <section aria-label={`${title}: ${when}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-accent">
            <LiveDot />
            <span className="truncate">{when}</span>
          </p>
          {cards.length > 0 && <span className="shrink-0 text-sm font-[550] text-fg-2">{playing ? `${playing} jugando` : `${cards.length} inscritos`}</span>}
        </div>
        <Link
          to={`${base}/e/${event.id}`}
          aria-label={`${title}: cómo van`}
          className="mt-2 block rounded-xl transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex items-center justify-between gap-3">
            <b className="min-w-0 truncate text-[21px] leading-[1.4] font-bold tracking-[-0.02em]">{title}</b>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-accent" />
          </span>
          {ready ? <span className="mt-[3px] block text-[14.5px] leading-[1.4] text-fg-2">{line}</span> : <Skeleton className="mt-1.5 h-4 w-3/4 rounded-md" />}
        </Link>
        {ready && action && (
          <ActionLink to={`${base}/e/${event.id}?tab=${action.tab}`} icon={state?.complete && !state.signed ? Signature : NOW_ICON[action.tab]} className="mt-4 w-full">
            {action.label}
          </ActionLink>
        )}
      </section>
    </Card>
  );
}

/** Las rondas como filas con su fecha («OCT / 17»): cuándo, el campo y el formato, y cuántos van. */
function RoundList({
  events,
  byEvent,
  today,
  tournamentName,
}: {
  events: readonly BowlingEvent[];
  byEvent: Map<string, GolfRoundDoc>;
  today: string;
  tournamentName: (id: string | null) => string | null | undefined;
}) {
  const { base } = useLeagueCtx();
  // Con un solo campo (lo normal en un club) el nombre no hace falta en cada fila.
  const oneCourse = new Set([...byEvent.values()].map((r) => r.courseId)).size <= 1;
  return (
    <Card className="overflow-hidden">
      {events.map((e) => {
        const r = byEvent.get(e.id);
        const t = tournamentName(r?.tournamentId ?? null);
        const name = eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf');
        const ahead = e.date >= today;
        const time = ahead && e.startTime ? formatTime(e.startTime.slice(0, 5)) : '';
        const line = [
          ahead ? weekdayLabel(e.date, today) : null,
          time || null,
          t && !name.startsWith(t) ? t : null,
          r ? [oneCourse ? null : r.courseName, r.nine === 'all' ? null : nineLabel(r.nine, r.holes), formatLabel(r.competition)].filter(Boolean).join(' · ') : 'Falta elegir el campo',
          ahead && e.playerCount ? `${e.playerCount} inscritos` : null,
          !ahead && r && !r.closed ? 'sin cerrar' : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return <ListRow key={e.id} leading={<DateBlock date={e.date} />} title={name} subtitle={line} to={`${base}/e/${e.id}`} />;
      })}
    </Card>
  );
}

/** «Orden de mérito · Ver toda»: los 3 de arriba de la temporada de ahora (tu fila resaltada, con tu lugar siempre). */
function MeritTop() {
  const { lid, base, myPlayerId } = useLeagueCtx();
  const seasons = useLeagueSeasons(lid);
  const { merit, players } = useGolfMerit(currentSeason(seasons.data));
  const rows = useMemo(() => meritTop(merit, myPlayerId), [merit, myPlayerId]);
  if (!rows.length) return null;
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  return (
    <section aria-labelledby="golf-merito">
      <SectionHeader id="golf-merito" title="Orden de mérito" action={<SectionLink to={`${base}/ranking`}>Ver toda</SectionLink>} />
      <Card className="overflow-hidden">
        {rows.map(({ row, me }) => (
          <ListRow
            key={row.id}
            to={`${base}/j/${row.id}`}
            chevron={false}
            me={me}
            className="min-h-[60px]!"
            leading={
              <>
                <PosNum pos={row.rank} />
                <Initials name={nameOf(row.id)} me={me} />
              </>
            }
            title={
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate">{nameOf(row.id)}</span>
                {me && <TuTag />}
              </span>
            }
            value={
              <>
                {row.points.toLocaleString('es-DO')}
                <span className="ml-1 text-sm font-medium tracking-normal text-muted">pts</span>
              </>
            }
          />
        ))}
      </Card>
    </section>
  );
}
