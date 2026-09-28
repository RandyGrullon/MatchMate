import { useMemo } from 'react';
import { Link } from 'react-router';
import { Medal } from 'lucide-react';
import { useEvents, usePlayers } from '../../../lib/data';
import { useGolfRounds, useGolfRules, useGolfSeason, useGolfTournaments } from '../../../lib/data/golf';
import { eventLabel, formatDate } from '../../../lib/format';
import { useLeagueCtx } from '../../../lib/league';
import { ShareButton, type ShareTableSpec } from '../../../components/share';
import { Card, Empty, ListSkeleton, LoadError, Position } from '../../../components/ui';
import { inSeasonDate } from './GolfHome';
import { meritEvents, seasonMerit } from './logic';

/**
 * Orden de mérito de la temporada: puntos por puesto en cada ronda cerrada (un torneo de varias rondas cuenta
 * como un evento cuando todas sus rondas están cerradas). Empates en un evento reparten los puntos.
 */
export default function GolfStandings() {
  const { lid, base, league } = useLeagueCtx();
  const season = useGolfSeason(lid);
  const rounds = useGolfRounds(lid);
  const rules = useGolfRules(lid);
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const tournaments = useGolfTournaments(lid);

  const { merit, counted } = useMemo(() => {
    const dates = new Map(events.data.map((e) => [e.id, e.date] as const));
    const evs = meritEvents(season.data, rounds.data, (id) => inSeasonDate(league, dates.get(id)));
    return { merit: seasonMerit(evs, rules.data.meritPoints), counted: evs };
  }, [season.data, rounds.data, rules.data, events.data, league]);

  if (season.error) return <LoadError error={season.error} />;
  if (season.loading) return <ListSkeleton rows={6} />;
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? '(jugador borrado)';
  const eventName = (id: string) => {
    const e = events.data.find((x) => x.id === id);
    return e ? eventLabel({ type: e.type, name: e.name, date: e.date }, 'golf') : 'Ronda';
  };
  const season$ = league.seasonStart || league.seasonEnd ? `${league.seasonStart ? formatDate(league.seasonStart) : '…'} – ${league.seasonEnd ? formatDate(league.seasonEnd) : '…'}` : null;

  // Imagen del orden de mérito para mandar al grupo.
  const shareCard = (): ShareTableSpec => ({
    kind: 'table',
    title: league.name,
    subtitle: season$ ? `Orden de mérito · ${season$}` : 'Orden de mérito',
    nameLabel: 'Jugador',
    columns: [{ label: 'Jugó' }, { label: 'Ganó' }, { label: 'Mejor', optional: true }, { label: 'Puntos', strong: true }],
    sections: [{ rows: merit.map((m) => ({ rank: m.rank, name: nameOf(m.id), values: [m.events, m.wins, m.best ?? '–', m.points.toLocaleString('es-DO')] })) }],
    note: `Puntos por puesto en cada ronda cerrada (${counted.length} ${counted.length === 1 ? 'evento' : 'eventos'}).`,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">Orden de mérito</h1>
          <p className="text-sm text-muted">
            {season$ ? `Temporada ${season$}. ` : ''}Puntos por puesto en cada ronda cerrada: {rules.data.meritPoints.slice(0, 5).join(', ')}…
          </p>
        </div>
        {merit.length > 0 && <ShareButton className="shrink-0" card={shareCard} />}
      </div>
      {!merit.length ? (
        <Empty icon={<Medal className="size-8" />} title="Todavía no hay rondas cerradas">
          Cuando el admin cierre una ronda, sus resultados suman aquí.
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_3.5rem_3rem_3rem] gap-2 border-b border-line px-3 py-2 text-xs text-muted sm:grid-cols-[2rem_1fr_4rem_4rem_4rem_4rem]">
            <span>#</span>
            <span>Jugador</span>
            <span className="text-right">Puntos</span>
            <span className="text-right">Jugó</span>
            <span className="text-right">Ganó</span>
            <span className="hidden text-right sm:block">Mejor</span>
          </div>
          <ul className="divide-y divide-line">
            {merit.map((m) => (
              <li key={m.id}>
                <Link to={`${base}/j/${m.id}`} className="grid grid-cols-[2rem_1fr_3.5rem_3rem_3rem] items-center gap-2 px-3 py-2.5 hover:bg-surface-2 sm:grid-cols-[2rem_1fr_4rem_4rem_4rem_4rem]">
                  <Position pos={m.rank} />
                  <span className="truncate font-medium">{nameOf(m.id)}</span>
                  <b className="text-right tabular-nums">{m.points.toLocaleString('es-DO')}</b>
                  <span className="text-right text-sm tabular-nums">{m.events}</span>
                  <span className="text-right text-sm tabular-nums">{m.wins}</span>
                  <span className="hidden text-right text-sm tabular-nums sm:block">{m.best ?? '–'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {counted.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">Cuentan ({counted.length})</h2>
          <Card className="divide-y divide-line overflow-hidden">
            {counted.map((e) => (
              <Link key={e.id} to={`${base}/e/${e.eventIds[0]}?tab=leaderboard`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-surface-2">
                <span className="truncate">{e.kind === 'torneo' ? (tournaments.data.find((t) => t.id === e.id)?.name ?? 'Torneo') : eventName(e.id)}</span>
                <span className="shrink-0 text-xs text-muted">
                  {e.kind === 'torneo' ? `${e.eventIds.length} rondas · ` : ''}ganó {e.rows.filter((r) => r.rank === 1).map((r) => nameOf(r.id)).join(' y ') || '–'}
                </span>
              </Link>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
