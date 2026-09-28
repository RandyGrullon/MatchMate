import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, ChevronRight, Plus, Users } from 'lucide-react';
import { useMatches } from '../../../lib/data/matches';
import { useRacketEvents, useWithPendingPoints, type RacketEvent } from '../../../lib/data/racket';
import { formatDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { MatchCard } from '../../../components/match';
import { Button, Card, Empty, ListSkeleton, LoadError, cx } from '../../../components/ui';
import { EventIcon, Section, eventTypeInfo } from './bits';
import { EventWizard } from './create/EventWizard';
import RacketEventPage from './EventPage';
import { isNightType, parseNightConfig } from './logic/night';
import { isPointsMatch, matchTime } from './logic/results';
import { signupBlurb, signupPhase } from './logic/signup';
import { parseTourneyConfig, tourneyStarted } from './logic/tourney';
import { addDays, timeLabel, todayIn } from './logic/time';
import { useMySide } from './match/MatchDetail';
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
 * Inicio de la liga de raqueta: lo que está en vivo, mis próximos partidos, y las noches, ligas y torneos (hoy
 * y próximos arriba). El admin crea con «Nuevo» (plantillas). Un torneo sin liga con un solo evento abre directo.
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

  return (
    <div className="flex flex-col gap-5">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" className="h-11" icon={<Plus className="size-5" />} onClick={() => setCreating(true)}>
            Nuevo
          </Button>
          <Link to={`${base}/admin?tab=parejas`} className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent hover:bg-surface-2">
            <Users className="size-4" /> {doubles ? 'Parejas y niveles' : 'Jugadores y niveles'}
          </Link>
        </div>
      )}

      {live.length > 0 && (
        <Section title="En vivo">
          <div className="grid gap-2 sm:grid-cols-2">
            {live.map((m) => (
              <MatchCard key={m.id} match={m} mySide={mySideOf(m)} to={m.eventId ? `${base}/e/${m.eventId}?partido=${m.id}` : link(m.id)} tz={league.tz} now={now} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} />
            ))}
          </div>
        </Section>
      )}

      {mine.length > 0 && (
        <Section title="Mis próximos partidos">
          <div className="grid gap-2 sm:grid-cols-2">
            {mine.map((m) => (
              <MatchCard key={m.id} match={m} mySide={mySideOf(m)} to={m.eventId ? `${base}/e/${m.eventId}?partido=${m.id}` : link(m.id)} tz={league.tz} now={now} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Hoy y próximos">
        {events.loading && !events.data.length ? (
          <ListSkeleton rows={2} />
        ) : upcoming.length ? (
          <EventList events={upcoming} today={today} side={side} doubles={doubles} />
        ) : (
          <Empty icon={<CalendarDays className="size-8" />} title="No hay nada próximo">
            {isAdmin
              ? ext.templates?.length
                ? `Toca «Nuevo»: ${[...(ext.hideTemplates?.includes('americano') ? [] : ['un americano']), ...ext.templates.map((t) => t.title.toLowerCase())].slice(0, 3).join(', ')} o un torneo.`
                : 'Toca «Nuevo»: un americano para esta noche, una liga de parejas o un torneo.'
              : 'Cuando el admin cree lo próximo, sale aquí.'}
          </Empty>
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Anteriores">
          <EventList events={past} today={today} side={side} doubles={doubles} />
        </Section>
      )}

      {isAdmin && creating && <EventWizard open onClose={() => setCreating(false)} lastNight={lastNight} />}
    </div>
  );
}

function EventList({ events, today, side, doubles }: { events: RacketEvent[]; today: string; side: readonly [string, string]; doubles: boolean }) {
  const { base } = useLeagueCtx();
  const { ext } = useRacket();
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {events.map((e) => {
        const isToday = e.date === today;
        const custom = ext.eventInfo?.(e, side) ?? null;
        const label = custom?.label ?? eventTypeInfo(e.type, doubles).label;
        return (
          <Link key={e.id} to={`${base}/e/${e.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
            <div className={cx('flex size-11 shrink-0 flex-col items-center justify-center rounded-xl', isToday ? 'bg-accent text-accent-fg' : 'bg-surface-2')}>
              <EventIcon type={e.type} className="size-4" />
              <span className="text-[10px] font-semibold">{isToday ? 'HOY' : formatDate(e.date).split(' ').slice(0, 2).join(' ')}</span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium">{e.name || label}</span>
              <span className="block truncate text-xs text-muted">
                {label}
                {e.startTime ? ` · ${timeLabel(e.startTime)}` : ''} · {custom?.line ?? eventLine(e, side, today)}
              </span>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted" />
          </Link>
        );
      })}
    </Card>
  );
}
