import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useMatches } from '../../../lib/data/matches';
import { useRacketEvents, useWithPendingPoints, type RacketEvent } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { MatchCard } from '../../../components/match';
import { ScorersButton } from '../../../components/scorers/ScorersButton';
import { Button, Card, DateBlock, ListRow, ListSkeleton, LoadError, SectionHeader, sectionLinkClass } from '../../../components/ui';
import { eventTypeInfo } from './bits';
import { EventWizard } from './create/EventWizard';
import RacketEventPage from './EventPage';
import { isNightType, parseNightConfig } from './logic/night';
import { isPointsMatch, matchTime } from './logic/results';
import { signupBlurb, signupPhase } from './logic/signup';
import { parseTourneyConfig, tourneyStarted } from './logic/tourney';
import { addDays, timeLabel, todayIn } from './logic/time';
import { useMySide } from './match/MatchDetail';
import { eventPlayers, useNames } from './names';
import { useRacket } from './sport';

/** Qué se dice del evento en la lista: «Ronda 3 de 7», «8 parejas», «2 categorías» (y la inscripción abierta). */
function eventLine(e: RacketEvent, side: readonly [string, string], today: string, now = Date.now()): string {
  if (isNightType(e.type)) {
    const c = parseNightConfig(e.config, e.type);
    const started = c.round > 0 || c.closed;
    const blurb = c.signup ? signupBlurb(c.signup, c.players.length, signupPhase(c.signup, { started, date: e.date, today, now })) : null;
    const state = c.closed ? 'terminada' : c.round ? `ronda ${c.round} de ${c.rounds}` : (blurb ?? `${c.rounds} rondas`);
    return `${c.players.length} jugadores · ${state}`;
  }
  if (e.type === 'torneo') {
    const t = parseTourneyConfig(e.config);
    const n = t.categories.length;
    const line = `${n} ${n === 1 ? 'categoría' : 'categorías'} · ${e.playerCount} ${e.playerCount === 1 ? side[0] : side[1]}`;
    if (!t.signup || !n) return line;
    // El cupo es por categoría: en la lista, el de todo el torneo.
    const total = { ...t.signup, cap: t.signup.cap != null ? t.signup.cap * n : null };
    const blurb = signupBlurb(total, e.playerCount, signupPhase(t.signup, { started: tourneyStarted(t), date: e.date, today, now }));
    return blurb ? `${line} · ${blurb}` : line;
  }
  return `${e.playerCount} ${e.playerCount === 1 ? side[0] : side[1]}`;
}

/**
 * «Anotadores» de un torneo sin liga con varios eventos (sus anotadores anotan en todos): «Juega» quien está inscrito en
 * alguno (las parejas se leen solo aquí, para el admin). Mientras llegan las parejas, nadie sale con «Juega».
 */
function TournamentScorers({ events }: { events: readonly RacketEvent[] }) {
  const { league } = useLeagueCtx();
  const names = useNames();
  const participants = useMemo(() => [...new Set(events.flatMap((e) => eventPlayers(e, names)))], [events, names]);
  return (
    <ScorersButton labeled className="h-11 self-start" target={{ scope: 'liga', refId: null, title: league.name }} participants={names.loading ? undefined : participants} />
  );
}

/**
 * Inicio de la liga de raqueta (rediseño «Calma y foco», con la forma de la liga del boliche): lo que está en vivo, mis
 * próximos partidos, y las noches, ligas y torneos en «Próximas fechas» y «Anteriores», como filas con su fecha. El admin
 * crea con «Nuevo» (plantillas) a la derecha de «Próximas fechas»; sin nada próximo, es el único botón de la pantalla.
 * «Parejas y niveles» es una fila de abajo (LeagueShell, `homeRow`). Un torneo sin liga con un solo evento abre directo.
 */
export default function RacketHome() {
  const { lid, base, isAdmin, league, myPlayerId } = useLeagueCtx();
  const { side, doubles, ext } = useRacket();
  const events = useRacketEvents(lid);
  const q = useMatches({ lid });
  const matches = useWithPendingPoints(lid, q.data);
  const mySideOf = useMySide();
  const now = useNow().getTime();
  const [creating, setCreating] = useState(false);
  const today = todayIn(league.tz);

  const { upcoming, past, lastNight } = useMemo(() => {
    const list = events.data;
    // Una noche que sigue abierta pasada la medianoche sigue arriba.
    const yesterday = addDays(today, -1);
    const openNight = (e: RacketEvent) => isNightType(e.type) && e.date >= yesterday && (() => {
      const c = parseNightConfig(e.config, e.type);
      return !c.closed && c.round > 0;
    })();
    const up = list.filter((e) => e.date >= today || openNight(e)).sort((a, b) => a.date.localeCompare(b.date));
    return {
      upcoming: up,
      past: list.filter((e) => !up.includes(e)),
      lastNight: list.find((e) => isNightType(e.type)) ?? null,
    };
  }, [events.data, today]);

  const live = matches.filter((m) => m.status === 'live').slice(0, 6);
  const mine = myPlayerId
    ? matches
        .filter((m) => (m.status === 'scheduled' || m.status === 'suspended' || m.status === 'postponed') && mySideOf(m) !== null)
        .sort((a, b) => matchTime(a) - matchTime(b))
        .slice(0, 4)
    : [];

  if (league.kind === 'torneo' && events.data.length === 1) return <RacketEventPage eventId={events.data[0].id} />;
  if (events.error) return <LoadError error={events.error} />;

  const link = (id: string) => `${base}/juegos?partido=${id}`;

  const matchList = (list: typeof matches) => (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {list.map((m) => (
        <MatchCard key={m.id} match={m} mySide={mySideOf(m)} to={m.eventId ? `${base}/e/${m.eventId}?partido=${m.id}` : link(m.id)} tz={league.tz} now={now} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} />
      ))}
    </div>
  );
  // «Nuevo» va a la derecha de «Próximas fechas»; sin nada próximo, es el botón de la tarjeta vacía (uno solo).
  const empty = !(events.loading && !events.data.length) && !upcoming.length;

  return (
    <div className="flex flex-col gap-[30px]">
      {live.length > 0 && (
        <section aria-labelledby="raqueta-vivo">
          <SectionHeader id="raqueta-vivo" title="En vivo" />
          {matchList(live)}
        </section>
      )}

      {mine.length > 0 && (
        <section aria-labelledby="raqueta-mios">
          <SectionHeader id="raqueta-mios" title="Mis próximos partidos" />
          {matchList(mine)}
        </section>
      )}

      <section aria-labelledby="raqueta-fechas">
        <SectionHeader
          id="raqueta-fechas"
          title="Próximas fechas"
          action={
            isAdmin && !empty ? (
              <button type="button" onClick={() => setCreating(true)} className={sectionLinkClass} aria-haspopup="dialog">
                <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.4} />
                Nuevo
              </button>
            ) : undefined
          }
        />
        {events.loading && !events.data.length ? (
          <ListSkeleton rows={2} />
        ) : upcoming.length ? (
          <EventList events={upcoming} today={today} side={side} doubles={doubles} />
        ) : (
          <Card className="flex flex-col items-stretch gap-4 p-5">
            <div>
              <p className="text-card-title">No hay nada próximo</p>
              <p className="mt-1 text-meta text-muted">
                {isAdmin
                  ? ext.templates?.length
                    ? `Crea ${[...(ext.hideTemplates?.includes('americano') ? [] : ['un americano']), ...ext.templates.map((t) => t.title.toLowerCase())].slice(0, 3).join(', ')} o un torneo.`
                    : 'Crea un americano para esta noche, una liga de parejas o un torneo.'
                  : 'Cuando el admin cree lo próximo, sale aquí.'}
              </p>
            </div>
            {isAdmin && (
              <Button variant="primary" size="lg" icon={<Plus className="size-5" />} onClick={() => setCreating(true)}>
                Nuevo
              </Button>
            )}
          </Card>
        )}
        {/* Torneo sin liga con varios eventos: sus anotadores anotan en todos. */}
        {isAdmin && league.kind === 'torneo' && (
          <div className="mt-3 flex">
            <TournamentScorers events={events.data} />
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="raqueta-antes">
          <SectionHeader id="raqueta-antes" title="Anteriores" />
          <EventList events={past} today={today} side={side} doubles={doubles} />
        </section>
      )}

      {isAdmin && creating && <EventWizard open onClose={() => setCreating(false)} lastNight={lastNight} />}
    </div>
  );
}

/** Las noches, ligas y torneos como filas con su fecha («OCT / 13»); el de hoy dice «Hoy» en el color del deporte. */
function EventList({ events, today, side, doubles }: { events: RacketEvent[]; today: string; side: readonly [string, string]; doubles: boolean }) {
  const { base } = useLeagueCtx();
  const { ext } = useRacket();
  return (
    <Card className="overflow-hidden">
      {events.map((e) => {
        const isToday = e.date === today;
        const custom = ext.eventInfo?.(e, side) ?? null;
        const label = custom?.label ?? eventTypeInfo(e.type, doubles).label;
        const line = [label, e.startTime ? timeLabel(e.startTime) : null, custom?.line ?? eventLine(e, side, today)].filter(Boolean).join(' · ');
        return (
          <ListRow
            key={e.id}
            leading={<DateBlock date={e.date} />}
            title={e.name || label}
            subtitle={
              <>
                {isToday && <span className="font-semibold text-accent">Hoy · </span>}
                {line}
              </>
            }
            to={`${base}/e/${e.id}`}
          />
        );
      })}
    </Card>
  );
}
