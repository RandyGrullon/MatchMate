import { useMemo } from 'react';
import { Link } from 'react-router';
import { CalendarCheck, CalendarDays, ChevronRight, CircleHelp, Flame, Globe, Hash, Layers, Sigma, Target, Trophy } from 'lucide-react';
import { frameStats } from '../lib/bowling';
import { usePlayerAcrossLeagues } from '../lib/data';
import { eventLabel, formatDate } from '../lib/format';
import { playerStats } from '../lib/stats';
import type { BowlingEvent, Entry, League, Member } from '../lib/types';
import { leagueSport, sportMeta, sportsOf } from '../sports/registry';
import { Stat } from './event/StandingsTab';
import { ScoreChart, type ChartPoint } from './ScoreChart';
import { Badge, Card, LoadError, StatsSkeleton } from './ui';

interface Played {
  lid: string;
  entry: Entry;
  event: BowlingEvent;
}

/** Una liga de otro deporte en el perfil global: sus números están en el perfil de esa liga. */
export interface SportLeagueLink {
  lid: string;
  name: string;
  sport: string;
  kind: League['kind'];
}

/**
 * Separa las membresías: las del boliche (el perfil global suma pinos, promedios y series) y las ligas de los
 * otros deportes, que llevan sus números en el perfil de cada liga. Una liga que no se pudo leer se queda con
 * el boliche, como antes (sale sin juegos).
 */
export function splitBySport(memberships: Member[], leagues: League[]): { bowling: Member[]; others: SportLeagueLink[] } {
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const bowling: Member[] = [];
  const others: SportLeagueLink[] = [];
  for (const m of memberships) {
    const league = byId.get(m.leagueId);
    if (!league || leagueSport(league) === 'bowling') bowling.push(m);
    else if (!others.some((o) => o.lid === league.id)) others.push({ lid: league.id, name: league.name, sport: leagueSport(league), kind: league.kind });
  }
  const order = sportsOf(others.map((o) => ({ id: o.lid, sport: o.sport })));
  others.sort((a, b) => order.indexOf(a.sport) - order.indexOf(b.sport) || a.name.localeCompare(b.name));
  return { bowling, others };
}

/**
 * Perfil global › Mis estadísticas: los números del boliche sumando sus ligas y, aparte, las ligas de los
 * otros deportes con un link al perfil de cada una (cada deporte cuenta lo suyo: sets, goles, golpes, marcas).
 */
export function ProfileStats({ memberships, leagues }: { memberships: Member[]; leagues: League[] }) {
  const { bowling, others } = useMemo(() => splitBySport(memberships, leagues), [memberships, leagues]);
  const showBowling = bowling.length > 0 || others.length === 0;
  return (
    <>
      {showBowling && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">{others.length ? 'Mis estadísticas de boliche' : 'Mis estadísticas'}</h2>
            <p className="text-sm text-muted">
              {others.length ? 'Tus ligas y torneos de boliche juntos.' : 'Todas tus ligas y torneos juntos.'} Solo cuentan los juegos que ya cuentan en cada
              liga.
            </p>
          </div>
          <GlobalStats memberships={bowling} leagues={leagues} />
        </section>
      )}
      {others.length > 0 && <SportLeagues leagues={others} alone={!showBowling} />}
    </>
  );
}

/** Las ligas de los otros deportes: cada una abre «Mis números» en esa liga. */
function SportLeagues({ leagues, alone }: { leagues: SportLeagueLink[]; alone: boolean }) {
  return (
    <section className="flex flex-col gap-3" aria-label={alone ? 'Mis ligas' : 'Mis ligas de otros deportes'}>
      <div>
        <h2 className="text-lg font-bold tracking-tight">{alone ? 'Mis ligas' : 'Otros deportes'}</h2>
        <p className="text-sm text-muted">Cada deporte lleva sus números en el perfil de la liga: toca una para ver los tuyos.</p>
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        {leagues.map((l) => {
          const meta = sportMeta(l.sport);
          const Icon = meta?.icon ?? CircleHelp;
          return (
            <Link key={l.lid} to={`/l/${l.lid}/perfil`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{l.name}</div>
                <div className="text-xs text-muted">
                  {meta?.short ?? 'Otro deporte'} · {l.kind === 'torneo' ? 'Torneo' : 'Liga'}
                </div>
              </div>
              <span className="text-xs font-medium text-accent">Mis números</span>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          );
        })}
      </Card>
    </section>
  );
}

/**
 * Perfil global del boliche: puntaje y promedio de la cuenta sumando todas sus ligas (y torneos sin liga), y los
 * de cada liga. La cuenta es su jugador en cada liga. Solo cuentan los juegos verificados, igual que en cada liga.
 * Recibe solo las membresías del boliche (ver `splitBySport`): los otros deportes no tienen pinos ni promedio.
 */
export function GlobalStats({ memberships, leagues }: { memberships: Member[]; leagues: League[] }) {
  const links = memberships.filter((m) => m.playerId).map((m) => ({ lid: m.leagueId, playerId: m.playerId! }));
  const across = usePlayerAcrossLeagues(links);
  const nameOf = useMemo(() => new Map(leagues.map((l) => [l.id, l.name])), [leagues]);

  const played = useMemo<Played[]>(
    () =>
      across.data
        .flatMap(({ lid, entries, events }) => {
          const byId = new Map(events.map((e) => [e.id, e]));
          return entries.filter((e) => byId.has(e.eventId)).map((entry) => ({ lid, entry, event: byId.get(entry.eventId)! }));
        })
        .sort((a, b) => a.event.date.localeCompare(b.event.date)),
    [across.data],
  );

  if (!links.length) {
    // Recién unido: su jugador se está creando (si no aparece, "Mis juegos" lo vuelve a intentar).
    if (memberships.length) {
      return (
        <Card className="p-4 text-sm text-muted">
          Estamos preparando tu jugador. Si no aparece en unos segundos, ábrelo en{' '}
          <Link to={`/l/${memberships[0].leagueId}/perfil`} className="font-medium text-accent">
            Mis juegos
          </Link>
          .
        </Card>
      );
    }
    return (
      <Card className="p-4 text-sm text-muted">
        Únete a una liga o crea la tuya: aquí verás tus números de todas tus ligas juntas.
      </Card>
    );
  }
  if (across.error) return <LoadError error={across.error} />;
  if (across.loading) return <StatsSkeleton />;

  const all = playerStats(played.map((p) => p.entry));
  // Strikes y spares de los juegos anotados por cuadros que cuentan.
  const frames = played.flatMap(({ entry }) =>
    Object.entries(entry.frames ?? {})
      .filter(([i]) => entry.scores?.[+i] != null && entry.photos?.[+i] != null)
      .map(([, f]) => frameStats(f.rolls)),
  );
  const strikes = frames.reduce((n, f) => n + f.strikes, 0);
  const spares = frames.reduce((n, f) => n + f.spares, 0);
  const counted = played.filter(({ entry }) => entry.scores?.some((s, i) => s != null && entry.photos?.[i] != null));
  const tournaments = counted.filter((p) => p.event.type === 'torneo').length;
  const practices = counted.length - tournaments;

  // Últimos 30 juegos que cuentan, de todas las ligas, del más viejo al más nuevo.
  const points: ChartPoint[] = played
    .flatMap(({ lid, entry, event }) =>
      (entry.scores ?? []).flatMap((s, i) =>
        s != null && entry.photos?.[i]
          ? [{ score: s, label: `${nameOf.get(lid) ?? 'Liga'} · ${eventLabel(event)} · J${i + 1} · ${formatDate(event.date)}` }]
          : [],
      ),
    )
    .slice(-30);

  // Por liga con los mismos juegos que el total (así las ligas suman el global); también las que no tienen juegos.
  const perLeague = links
    .map(({ lid }) => ({ lid, name: nameOf.get(lid) ?? 'Liga', stats: playerStats(played.filter((p) => p.lid === lid).map((p) => p.entry)) }))
    .sort((a, b) => b.stats.games - a.stats.games || a.name.localeCompare(b.name));

  const byYear = new Map<string, Entry[]>();
  for (const p of played) {
    const y = p.event.date.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), p.entry]);
  }
  const years = [...byYear.entries()].sort(([a], [b]) => b.localeCompare(a));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat icon={<Target className="size-4" />} label="Promedio global" value={all.autoAverage ?? '—'} />
        <Stat icon={<Sigma className="size-4" />} label="Puntaje total" value={all.pins ? all.pins.toLocaleString('es-DO') : '—'} />
        <Stat icon={<Hash className="size-4" />} label="Juegos" value={all.games} />
        <Stat icon={<Flame className="size-4" />} label="Mejor juego" value={all.high || '—'} />
        <Stat icon={<Layers className="size-4" />} label="Mejor serie (3)" value={all.highSeries || '—'} />
        <Stat icon={<CalendarCheck className="size-4" />} label="Asistencia" value={counted.length} sub={counted.length === 1 ? 'evento' : 'eventos'} />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="accent">
          <Globe className="size-3" /> {perLeague.length} {perLeague.length === 1 ? 'liga' : 'ligas'}
        </Badge>
        <Badge>
          <Trophy className="size-3" /> {tournaments} {tournaments === 1 ? 'torneo' : 'torneos'}
        </Badge>
        <Badge>
          <CalendarDays className="size-3" /> {practices} {practices === 1 ? 'práctica' : 'prácticas'}
        </Badge>
        {frames.length > 0 && (
          <>
            <Badge tone="accent">{strikes} strikes</Badge>
            <Badge tone="accent">{spares} spares</Badge>
          </>
        )}
        {all.pending > 0 && <Badge tone="warn">{all.pending} por verificar</Badge>}
      </div>

      {points.length >= 2 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-muted">Últimos {points.length} juegos</h3>
            {all.autoAverage != null && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className="inline-block h-px w-4 bg-muted" /> promedio {all.autoAverage}
              </span>
            )}
          </div>
          <Card className="px-2 pt-3 pb-1 sm:px-4">
            <ScoreChart points={points} average={all.autoAverage} />
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-muted">Por liga</h3>
        <Card className="divide-y divide-line overflow-hidden">
          {perLeague.map(({ lid, name, stats }) => (
            <Link key={lid} to={`/l/${lid}/perfil`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{name}</div>
                <div className="text-xs text-muted tabular-nums">
                  {stats.games} {stats.games === 1 ? 'juego' : 'juegos'}
                  {stats.pins > 0 && ` · puntaje ${stats.pins.toLocaleString('es-DO')}`}
                  {stats.high > 0 && ` · mejor ${stats.high}`}
                  {stats.pending > 0 && ` · ${stats.pending} por verificar`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold tabular-nums">{stats.autoAverage ?? '—'}</div>
                <div className="text-[11px] text-muted">promedio</div>
              </div>
              <ChevronRight className="size-4 text-muted" />
            </Link>
          ))}
        </Card>
      </section>

      {years.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted">Por año</h3>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 text-left font-medium">Año</th>
                  <th className="px-2 py-2 text-right font-medium">Juegos</th>
                  <th className="px-2 py-2 text-right font-medium">Promedio</th>
                  <th className="px-4 py-2 text-right font-medium">Mejor</th>
                </tr>
              </thead>
              <tbody>
                {years.map(([y, list]) => {
                  const s = playerStats(list);
                  return (
                    <tr key={y} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 font-medium">{y}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{s.games}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{s.autoAverage ?? '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{s.high || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>
      )}
    </div>
  );
}
