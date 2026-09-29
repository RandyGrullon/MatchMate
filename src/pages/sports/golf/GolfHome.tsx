import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, ChevronRight, Flag, LandPlot, Lock, Medal, Plus, Trophy } from 'lucide-react';
import { useEvents } from '../../../lib/data';
import { useGolfCourses, useGolfRounds, useGolfTournaments, type GolfRoundDoc } from '../../../lib/data/golf';
import { useLeagueSeasons } from '../../../lib/data/seasons';
import { eventLabel, formatDate, toIsoDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { currentSeason } from '../../../lib/seasons';
import type { BowlingEvent } from '../../../lib/types';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, Position, cx } from '../../../components/ui';
import GolfEvent from './GolfEvent';
import { RoundForm } from './RoundForm';
import { formatLabel, nineLabel } from './logic';
import { useGolfMerit } from './seasonTable';

/**
 * Inicio de la liga de golf: rondas de hoy y las próximas, resultados y lo primero del orden de mérito.
 * Un torneo sin liga con una sola ronda muestra la ronda directo.
 */
export default function GolfHome() {
  const { lid, base, isAdmin, league } = useLeagueCtx();
  const events = useEvents(lid);
  const rounds = useGolfRounds(lid);
  const courses = useGolfCourses(lid);
  const tournaments = useGolfTournaments(lid);
  const [creating, setCreating] = useState(false);
  const today = toIsoDate(new Date());

  const byEvent = useMemo(() => new Map(rounds.data.map((r) => [r.eventId, r] as const)), [rounds.data]);
  const upcoming = events.data.filter((e) => e.date >= today && !byEvent.get(e.id)?.closed).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.data.filter((e) => !upcoming.includes(e)).sort((a, b) => b.date.localeCompare(a.date));

  if (league.kind === 'torneo' && events.data.length === 1) return <GolfEvent eventId={events.data[0].id} />;
  if (events.error) return <LoadError error={events.error} />;

  const tournamentName = (id: string | null) => (id ? tournaments.data.find((t) => t.id === id)?.name : null);

  return (
    <div className="flex flex-col gap-5">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)} disabled={!courses.data.length}>
            Nueva ronda o torneo
          </Button>
          <Link to={`${base}/admin?tab=campos`} className="text-sm font-medium text-accent">
            Campos del club
          </Link>
        </div>
      )}
      {isAdmin && !courses.loading && !courses.data.length && (
        <Card className="flex items-start gap-3 px-4 py-4">
          <LandPlot className="mt-0.5 size-6 shrink-0 text-accent" />
          <div className="text-sm">
            <p className="font-semibold">Primero, el campo</p>
            <p className="text-muted">Agrega el campo del club (par y SI de cada hoyo, rating y slope de cada salida) para crear rondas.</p>
            <Link to={`${base}/admin?tab=campos`} className="mt-2 inline-block font-medium text-accent">
              Agregar el campo →
            </Link>
          </div>
        </Card>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">Próximas rondas</h2>
        {events.loading ? (
          <ListSkeleton rows={2} />
        ) : !upcoming.length ? (
          <Empty icon={<CalendarDays className="size-8" />} title="No hay rondas próximas">
            {isAdmin ? 'Crea la próxima ronda con el botón de arriba.' : 'Cuando el admin cree la próxima ronda, sale aquí para inscribirte.'}
          </Empty>
        ) : (
          <RoundList events={upcoming} byEvent={byEvent} today={today} tournamentName={tournamentName} />
        )}
      </section>

      <MeritPreview />

      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Resultados</h2>
          <RoundList events={past} byEvent={byEvent} today={today} tournamentName={tournamentName} />
        </section>
      )}

      <RoundForm open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function RoundList({
  events,
  byEvent,
  today,
  tournamentName,
}: {
  events: BowlingEvent[];
  byEvent: Map<string, GolfRoundDoc>;
  today: string;
  tournamentName: (id: string | null) => string | null | undefined;
}) {
  const { base } = useLeagueCtx();
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {events.map((e) => {
        const r = byEvent.get(e.id);
        const t = tournamentName(r?.tournamentId ?? null);
        const isToday = e.date === today;
        return (
          <Link key={e.id} to={`${base}/e/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
            <div className={cx('flex size-11 shrink-0 flex-col items-center justify-center rounded-xl', isToday ? 'bg-accent text-accent-fg' : 'bg-surface-2')}>
              {r?.closed ? <Lock className="size-4" /> : t ? <Trophy className="size-4" /> : <Flag className="size-4" />}
              <span className="text-[10px] font-semibold">{isToday ? 'HOY' : formatDate(e.date).split(' ').slice(0, 2).join(' ')}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="truncate font-medium">{eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf')}</span>
                {t && !e.name.startsWith(t) && <Badge tone="accent">{t}</Badge>}
              </div>
              <div className="truncate text-xs text-muted">
                {r ? `${r.courseName} · ${nineLabel(r.nine, r.holes)} · ${formatLabel(r.competition)}` : 'Falta elegir el campo'}
                {e.playerCount ? ` · ${e.playerCount} inscritos` : ''}
              </div>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted" />
          </Link>
        );
      })}
    </Card>
  );
}

/** Los 5 primeros del orden de mérito de la temporada de ahora (las mismas rondas que Orden de mérito). */
function MeritPreview() {
  const { lid, base } = useLeagueCtx();
  const seasons = useLeagueSeasons(lid);
  const { merit: all, players } = useGolfMerit(currentSeason(seasons.data));
  const merit = useMemo(() => all.filter((m) => m.points > 0), [all]);
  if (!merit.length) return null;
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">Orden de mérito</h2>
        <Link to={`${base}/ranking`} className="flex items-center gap-1 text-sm font-medium text-accent">
          <Medal className="size-4" /> Ver todo
        </Link>
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        {merit.slice(0, 5).map((m) => (
          <Link key={m.id} to={`${base}/j/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
            <Position pos={m.rank} />
            <span className="flex-1 truncate font-medium">{nameOf(m.id)}</span>
            <span className="font-bold tabular-nums">{m.points.toLocaleString('es-DO')}</span>
            <span className="text-xs text-muted">pts</span>
          </Link>
        ))}
      </Card>
    </section>
  );
}
