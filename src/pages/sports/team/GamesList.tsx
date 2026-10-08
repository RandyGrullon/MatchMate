import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarDays } from 'lucide-react';
import { awaitingConfirmation, hasResult, type Match } from '../../../lib/data/matches';
import { groupSchedule } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { Empty, ListSkeleton, LoadError, SectionHeader, Segmented, type SegmentedOption } from '../../../components/ui';
import { MatchRows, ScreenTitle } from './TeamUi';
import type { TeamLeague } from './useTeamLeague';

export type GamesFilter = 'proximos' | 'resultados' | 'mios';

/** Qué partidos van en cada opción: por jugar (programados y aplazados), lo ya jugado (con resultado o anulado) y los de mi equipo. */
export function filterGames(all: readonly Match[], filter: GamesFilter, myTeamIds: readonly string[]): Match[] {
  switch (filter) {
    case 'proximos':
      return all.filter((m) => m.status === 'scheduled' || m.status === 'postponed');
    case 'resultados':
      return all.filter((m) => hasResult(m) || m.status === 'void');
    case 'mios':
      return all.filter((m) => m.sides.some((s) => s.teamId && myTeamIds.includes(s.teamId)));
  }
}

/** La opción de entrada: lo que viene; si ya no queda nada por jugar, los resultados. */
export function defaultGamesFilter(all: readonly Match[]): GamesFilter {
  return all.some((m) => m.status === 'scheduled' || m.status === 'postponed') ? 'proximos' : 'resultados';
}

/**
 * Partidos de la liga (/l/:lid/juegos), rediseño «Calma y foco»: «‹ Liga» arriba (la barra de la liga), el título
 * «Partidos» y un segmentado Por jugar | Resultados | Mi equipo (`?ver=`; el número en Resultados es lo que te toca
 * confirmar). Lo que se está jugando sale siempre arriba («En vivo», con su tarjeta). Por jornada, como filas con su fecha
 * (los resultados con el marcador al final), del más nuevo al más viejo en Resultados.
 */
export function GamesList({ tl, now, renderMatch, roundWord = 'Jornada' }: { tl: TeamLeague; now: number; renderMatch: (m: Match) => ReactNode; roundWord?: string }) {
  const pro = useIsPro();
  const [params, setParams] = useSearchParams();
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const all = tl.matches.data;
  const asked = params.get('ver') as GamesFilter | null;
  const filter: GamesFilter = asked === 'proximos' || asked === 'resultados' || (asked === 'mios' && myTeamIds.length) ? asked : defaultGamesFilter(all);
  const live = useMemo(() => all.filter((m) => m.status === 'live' || m.status === 'suspended'), [all]);
  const list = useMemo(() => filterGames(all, filter, myTeamIds).filter((m) => m.status !== 'live' && m.status !== 'suspended'), [all, filter, myTeamIds.join()]);
  const groups = useMemo(() => {
    const g = groupSchedule(list, 'round', { roundWord, tz: tl.tz });
    return filter === 'resultados' ? [...g].reverse() : g;
  }, [list, filter, roundWord, tl.tz]);

  if (tl.matches.error) return <LoadError error={tl.matches.error} />;
  const pendingMine = all.filter((m) => awaitingConfirmation(m, now) && tl.speakerOf(m) !== null && tl.speakerOf(m) !== m.proposedSide).length;
  const options: SegmentedOption<GamesFilter>[] = [
    { key: 'proximos', label: 'Por jugar' },
    {
      key: 'resultados',
      ariaLabel: pendingMine ? `Resultados: ${pendingMine} por confirmar` : 'Resultados',
      label: (
        <>
          Resultados
          {pendingMine > 0 && <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-warn px-1.5 text-[11px] font-bold tracking-normal text-bg">{pendingMine}</span>}
        </>
      ),
    },
    ...(myTeamIds.length ? [{ key: 'mios' as const, label: 'Mi equipo' }] : []),
  ];
  const empty =
    filter === 'proximos'
      ? tl.isAdmin
        ? 'Arma el calendario en Organizar › Equipos.'
        : 'Cuando el admin arme el calendario, los partidos salen aquí.'
      : filter === 'resultados'
        ? 'Todavía no se ha jugado ningún partido.'
        : 'Tu equipo no tiene partidos todavía.';

  return (
    <div className="flex flex-col px-2">
      <ScreenTitle title="Partidos" pro={pro} />
      <Segmented
        full
        label="Qué partidos ver"
        className="mt-4"
        options={options}
        value={filter}
        onChange={(k) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p);
              next.set('ver', k);
              return next;
            },
            { replace: true },
          )
        }
      />
      {tl.matches.loading && !all.length ? (
        <div className="mt-[22px]">
          <ListSkeleton rows={4} />
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <section aria-labelledby="partidos-vivo" className="mt-[22px]">
              <SectionHeader id="partidos-vivo" title="En vivo" />
              <div className="grid gap-2.5 sm:grid-cols-2">
                {live.map((m) => (
                  <div key={m.id} className="min-w-0">{renderMatch(m)}</div>
                ))}
              </div>
            </section>
          )}
          {groups.length ? (
            groups.map((g) => (
              <section key={g.key} aria-label={g.title} className="mt-[26px]">
                <SectionHeader title={<span className="first-letter:uppercase">{g.title}</span>} />
                <MatchRows tl={tl} matches={g.matches} now={now} roundWord={roundWord} court round={!g.matches.every((m) => m.round != null)} highlight={filter !== 'mios'} />
              </section>
            ))
          ) : (
            <div className="mt-[22px]">
              <Empty icon={<CalendarDays className="size-8" />} title="Nada por aquí">
                {empty}
              </Empty>
            </div>
          )}
        </>
      )}
    </div>
  );
}
