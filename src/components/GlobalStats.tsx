import { useMemo } from 'react';
import { Link } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { byDate, countedFrames, entryStatGames, soloStatGames, type StatGame } from '../lib/bowlingStats';
import { usePlayerAcrossLeagues } from '../lib/data';
import { soloAsEntry, soloOldestFirst, useMySoloSessions, type SoloSession } from '../lib/data/solo';
import { eventLabel, formatDate, toIsoDate } from '../lib/format';
import { calcHandicap, playerStats, type PlayerStats } from '../lib/stats';
import type { BowlingEvent, Entry, GameFrames, League, Member } from '../lib/types';
import { useNow } from '../lib/useNow';
import { leagueSport, sportMeta, sportsOf } from '../sports/registry';
import { LeagueIcon } from './home/LeagueCard';
import { Card, ListRow, LoadError, RowIcon, SectionHeader, StatsSkeleton, cx } from './ui';

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

/** Los números del boliche de la cuenta, todo junto (sus ligas, torneos y juegos sueltos). Solo cuentan los verificados. */
export interface BowlingNumbers {
  all: PlayerStats;
  /** Los juegos que cuentan, del más viejo al más nuevo (con su texto para la gráfica). */
  games: StatGame[];
  /** Los cuadros que cuadran con el puntaje (Teclado y Pines). */
  frames: GameFrames[];
  /** Eventos de sus ligas con al menos un juego que cuenta. */
  attended: number;
  /** Eventos de sus ligas desde el primero al que fue hasta hoy (el de hoy, solo si ya jugó). */
  held: number;
  tournaments: number;
  practices: number;
  /** Por liga, con los mismos juegos que el total (también las que no tienen juegos), la de más juegos primero. */
  perLeague: { lid: string; name: string; stats: PlayerStats }[];
  /** Los juegos sueltos (null si no tiene). */
  solo: PlayerStats | null;
  /** Por año, del más nuevo al más viejo. */
  years: { year: string; stats: PlayerStats }[];
  /** Su handicap en el último torneo con handicap en que está inscrito (null si no hay). */
  hcp: number | null;
}

/**
 * Lo que suma el perfil global (sin leer la base: sirve para probarlo). `across`: las participaciones y los eventos de
 * cada liga; `solo`: los juegos sueltos, del más viejo al más nuevo; `today`: 'YYYY-MM-DD'.
 */
export function bowlingNumbers({
  across,
  links,
  names,
  solo,
  today,
}: {
  across: readonly { lid: string; entries: readonly Entry[]; events: readonly BowlingEvent[] }[];
  links: readonly { lid: string }[];
  names: ReadonlyMap<string, string>;
  solo: readonly SoloSession[];
  today: string;
}): BowlingNumbers {
  const played: Played[] = across
    .flatMap(({ lid, entries, events }) => {
      const byId = new Map(events.map((e) => [e.id, e]));
      return entries.filter((e) => byId.has(e.eventId)).map((entry) => ({ lid, entry, event: byId.get(entry.eventId)! }));
    })
    .sort((a, b) => a.event.date.localeCompare(b.event.date));
  const soloEntries = solo.map(soloAsEntry);
  const all = playerStats([...played.map((p) => p.entry), ...soloEntries]);
  // Todos los juegos que cuentan (de las ligas y los sueltos), del más viejo al más nuevo: la tendencia y, con los
  // cuadros que cuadran con el puntaje, los porcentajes y el pino por pino.
  const games = byDate([
    ...played.flatMap(({ lid, entry, event }) =>
      entryStatGames(entry, event.date, (i) => `${names.get(lid) ?? 'Liga'} · ${eventLabel(event)} · J${i + 1} · ${formatDate(event.date)}`),
    ),
    ...solo.flatMap((s) =>
      soloStatGames(s, (i) => `${['Juego suelto', s.venue.trim()].filter(Boolean).join(' · ')} · J${i + 1} · ${formatDate(s.playedOn)}`),
    ),
  ]);
  const counted = played.filter(({ entry }) => entry.scores?.some((s, i) => s != null && entry.photos?.[i] != null));
  const tournaments = counted.filter((p) => p.event.type === 'torneo').length;

  // Asistencia: en cada liga, desde el primer evento al que fue hasta hoy (el de hoy cuenta solo si ya jugó).
  let held = 0;
  for (const { lid, events } of across) {
    const went = new Set(counted.filter((p) => p.lid === lid).map((p) => p.event.id));
    const first = counted.find((p) => p.lid === lid)?.event.date;
    if (!first) continue;
    held += events.filter((e) => e.date >= first && (e.date < today || went.has(e.id))).length;
  }

  // Por liga con los mismos juegos que el total (así las ligas suman el global); también las que no tienen juegos.
  const perLeague = links
    .map(({ lid }) => ({ lid, name: names.get(lid) ?? 'Liga', stats: playerStats(played.filter((p) => p.lid === lid).map((p) => p.entry)) }))
    .sort((a, b) => b.stats.games - a.stats.games || a.name.localeCompare(b.name));

  const byYear = new Map<string, Pick<Entry, 'scores' | 'photos'>[]>();
  const addYear = (date: string, e: Pick<Entry, 'scores' | 'photos'>) => byYear.set(date.slice(0, 4), [...(byYear.get(date.slice(0, 4)) ?? []), e]);
  for (const p of played) addYear(p.event.date, p.entry);
  solo.forEach((s, i) => addYear(s.playedOn, soloEntries[i]));
  const years = [...byYear.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([year, list]) => ({ year, stats: playerStats(list) }));

  // El handicap: el del último torneo con handicap en que está inscrito (el fijado a mano, o con el promedio con que
  // entró; si todavía no tiene, con su promedio de ahora).
  const torneo = [...played].reverse().find(({ entry, event }) => event.type === 'torneo' && (event.hcpPercent > 0 || entry.handicapOverride != null));
  const hcp = torneo
    ? (torneo.entry.handicapOverride ?? calcHandicap(torneo.entry.average || all.autoAverage || 0, torneo.event.hcpBase, torneo.event.hcpPercent))
    : null;

  return {
    all,
    games,
    frames: countedFrames(games),
    attended: counted.length,
    held: Math.max(held, counted.length),
    tournaments,
    practices: counted.length - tournaments,
    perLeague,
    solo: solo.length ? playerStats(soloEntries) : null,
    years,
    hcp,
  };
}

/** Cómo están los números del boliche: listos, leyéndose, con error o sin nada que sumar (y si su jugador se está creando). */
export type BowlingNumbersState =
  | { status: 'ready'; data: BowlingNumbers }
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'none'; preparing: string | null };

const NO_SOLO: SoloSession[] = [];

/**
 * Los números del boliche de la cuenta (Yo y «Por liga y temporada»): sus ligas de boliche (`memberships`, ver
 * splitBySport) y sus juegos sueltos (`solo`; sin pasarlos, no suma juegos sueltos).
 */
export function useBowlingNumbers(memberships: Member[], leagues: League[], solo: SoloSession[] = NO_SOLO, soloLoading = false): BowlingNumbersState {
  const links = useMemo(() => memberships.filter((m) => m.playerId).map((m) => ({ lid: m.leagueId, playerId: m.playerId! })), [memberships]);
  const across = usePlayerAcrossLeagues(links);
  const names = useMemo(() => new Map(leagues.map((l) => [l.id, l.name])), [leagues]);
  // Del más viejo al más nuevo, como los de las ligas (el mismo día, en el orden en que se anotaron).
  const soloOld = useMemo(() => soloOldestFirst(solo), [solo]);
  const today = toIsoDate(useNow());
  const data = useMemo(() => bowlingNumbers({ across: across.data, links, names, solo: soloOld, today }), [across.data, links, names, soloOld, today]);
  if (!links.length && !solo.length) {
    if (soloLoading) return { status: 'loading' };
    // Recién unido: su jugador se está creando (si no aparece, "Mis juegos" lo vuelve a intentar).
    return { status: 'none', preparing: memberships[0]?.leagueId ?? null };
  }
  if (across.error) return { status: 'error', error: across.error };
  if (across.loading || (soloLoading && !solo.length)) return { status: 'loading' };
  return { status: 'ready', data };
}

/** Sin números todavía: su jugador se está creando, o cómo empezar (unirse, crear o un juego suelto). */
export function NoBowlingNumbers({ preparing, className }: { preparing: string | null; className?: string }) {
  return preparing ? (
    <Card className={cx('p-5 text-sm text-muted', className)}>
      Estamos preparando tu jugador. Si no aparece en unos segundos, ábrelo en{' '}
      <Link to={`/l/${preparing}/perfil`} className="font-medium text-accent">
        Mis juegos
      </Link>
      .
    </Card>
  ) : (
    <Card className={cx('p-5 text-sm text-muted', className)}>
      Únete a una liga, crea la tuya o{' '}
      <Link to="/juegos-sueltos" className="font-medium text-accent">
        anota un juego suelto
      </Link>
      : aquí verás tus números de todo junto.
    </Card>
  );
}

/**
 * «Por liga y temporada» (Yo, `/perfil?tab=estadisticas`): las ligas de boliche (y torneos) con sus juegos sueltos,
 * todo junto, y aparte las ligas de los otros deportes con un link al perfil de cada una (cada deporte cuenta lo suyo:
 * sets, goles, golpes, marcas).
 */
export function ProfileStats({ memberships, leagues }: { memberships: Member[]; leagues: League[] }) {
  const { bowling, others } = useMemo(() => splitBySport(memberships, leagues), [memberships, leagues]);
  const solo = useMySoloSessions();
  const hasSolo = solo.data.length > 0;
  const showBowling = bowling.length > 0 || others.length === 0 || hasSolo;
  return (
    <>
      {showBowling && <GlobalStats memberships={bowling} leagues={leagues} solo={solo.data} soloLoading={solo.loading} title={others.length > 0} />}
      {others.length > 0 && <SportLeagues leagues={others} alone={!showBowling} />}
    </>
  );
}

/** Las ligas de los otros deportes: cada una abre «Mis números» en esa liga. */
export function SportLeagues({ leagues, alone, className }: { leagues: SportLeagueLink[]; alone: boolean; className?: string }) {
  return (
    <section className={className} aria-label={alone ? 'Mis ligas' : 'Mis ligas de otros deportes'}>
      <SectionHeader title={alone ? 'Mis ligas' : 'Otros deportes'} />
      <p className="mx-1 -mt-1.5 mb-3 text-sm text-muted">Cada deporte lleva sus números en la liga: toca una para ver los tuyos.</p>
      <Card className="overflow-hidden">
        {leagues.map((l) => {
          const meta = sportMeta(l.sport);
          const Icon = meta?.icon ?? CircleHelp;
          return (
            <ListRow
              key={l.lid}
              to={`/l/${l.lid}/perfil`}
              leading={
                <RowIcon tone="accent">
                  <Icon className="size-5" />
                </RowIcon>
              }
              title={l.name}
              subtitle={`${meta?.short ?? 'Otro deporte'} · ${l.kind === 'torneo' ? 'Torneo' : 'Liga'} · Mis números`}
            />
          );
        })}
      </Card>
    </section>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Perfil global del boliche, por liga y por año: el total de todas sus ligas (y torneos sin liga) y sus juegos sueltos,
 * cada liga con sus números (abre «Mis números» de esa liga) y cada año. La cuenta es su jugador en cada liga. Solo
 * cuentan los juegos verificados, igual que en cada liga. Recibe solo las membresías del boliche (ver `splitBySport`).
 * Los juegos sueltos suman al total y a cada año, y tienen su fila en «Por liga»; el promedio y la tabla de cada liga
 * siguen siendo solo de la liga. El promedio grande, la tendencia y los tiros van arriba, en Yo.
 */
export function GlobalStats({
  memberships,
  leagues,
  solo,
  soloLoading = false,
  title,
}: {
  memberships: Member[];
  leagues: League[];
  solo?: SoloSession[];
  soloLoading?: boolean;
  /** «Boliche, todo junto» (cuando también hay otros deportes). */
  title?: boolean;
}) {
  const state = useBowlingNumbers(memberships, leagues, solo, soloLoading);
  const leagueOf = useMemo(() => new Map(leagues.map((l) => [l.id, l])), [leagues]);
  if (state.status === 'none') return <NoBowlingNumbers preparing={state.preparing} />;
  if (state.status === 'error') return <LoadError error={state.error} />;
  if (state.status === 'loading') return <StatsSkeleton />;
  const n = state.data;
  const leaguesCount = n.perLeague.length;
  const what = [
    plural(n.all.games, 'juego', 'juegos'),
    leaguesCount > 0 && plural(leaguesCount, 'liga', 'ligas'),
    leaguesCount > 0 && plural(n.practices, 'práctica', 'prácticas'),
    leaguesCount > 0 && plural(n.tournaments, 'torneo', 'torneos'),
    n.solo && plural(n.solo.games, 'juego suelto', 'juegos sueltos'),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-[26px]">
      <section aria-label="Todo junto">
        <SectionHeader title={title ? 'Boliche, todo junto' : 'Todo junto'} />
        <Card className="p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Promedio</p>
              <p className="num mt-1 text-stat">{n.all.autoAverage ?? '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted">Puntaje total</p>
              <p className="num mt-1 text-row-num">{n.all.pins ? n.all.pins.toLocaleString('es-DO') : '—'}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-fg-2">{what.join(' · ')}</p>
          <p className="mt-1 text-[13px] text-muted">
            Solo cuentan los juegos que ya cuentan en cada liga.
            {n.all.pending > 0 && ` ${plural(n.all.pending, 'juego', 'juegos')} por aprobar todavía no ${n.all.pending === 1 ? 'suma' : 'suman'}.`}
          </p>
        </Card>
      </section>

      <section aria-label="Por liga">
        <SectionHeader title="Por liga" action={<span className="text-sm text-muted">Promedio</span>} />
        <Card className="overflow-hidden">
          {n.perLeague.map(({ lid, name, stats }) => (
            <ListRow
              key={lid}
              to={`/l/${lid}/perfil`}
              leading={<LeagueIcon league={leagueOf.get(lid) ?? { id: lid, sport: 'bowling', kind: 'liga' }} />}
              title={name}
              subtitle={statsLine(stats)}
              value={stats.autoAverage ?? '—'}
              chevron
            />
          ))}
          {n.solo && (
            <ListRow
              to="/juegos-sueltos"
              leading={<LeagueIcon league={SOLO_ICON} />}
              title="Juegos sueltos"
              subtitle={statsLine(n.solo)}
              value={n.solo.autoAverage ?? '—'}
              chevron
            />
          )}
        </Card>
      </section>

      {n.years.length > 0 && (
        <section aria-label="Por año">
          <SectionHeader title="Por año" />
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-2.5 text-left font-medium">Año</th>
                  <th className="px-2 py-2.5 text-right font-medium">Juegos</th>
                  <th className="px-2 py-2.5 text-right font-medium">Promedio</th>
                  <th className="px-5 py-2.5 text-right font-medium">Mejor</th>
                </tr>
              </thead>
              <tbody>
                {n.years.map(({ year, stats: s }) => (
                  <tr key={year} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium">{year}</td>
                    <td className="px-2 py-3 text-right tabular-nums">{s.games}</td>
                    <td className="px-2 py-3 text-right font-semibold tabular-nums">{s.autoAverage ?? '—'}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.high || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}
    </div>
  );
}

/** El cuadrito de «Juegos sueltos» en «Por liga»: el del boliche (no hay liga con logo). */
const SOLO_ICON = { id: 'juegos-sueltos', sport: 'bowling', kind: 'liga' } as const;

/** Debajo del nombre en «Por liga»: juegos, puntaje, mejor juego y lo que falta aprobar. */
function statsLine(stats: PlayerStats): string {
  return [
    plural(stats.games, 'juego', 'juegos'),
    stats.pins > 0 && `puntaje ${stats.pins.toLocaleString('es-DO')}`,
    stats.high > 0 && `mejor ${stats.high}`,
    stats.pending > 0 && `${stats.pending} por aprobar`,
  ]
    .filter(Boolean)
    .join(' · ');
}
