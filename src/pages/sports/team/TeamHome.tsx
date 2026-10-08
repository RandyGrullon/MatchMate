import { useMemo, type ReactNode } from 'react';
import { CalendarPlus, Shirt, Trophy } from 'lucide-react';
import { compareMatches, hasResult, isOpen, type Match } from '../../../lib/data/matches';
import { ActionLink } from '../../../components/home/TodayCard';
import { Button, Card, ListSkeleton, LoadError, SectionHeader } from '../../../components/ui';
import { upcomingFor } from './logic';
import { MatchRows, NextMatchCard, SectionLink, TableTop, type TableTopRow } from './TeamUi';
import type { TeamLeague } from './useTeamLeague';

/** Lo que se muestra de los partidos en el inicio (puro): el mío que sigue, lo en vivo, los próximos y los últimos resultados. */
export function homeMatches(matches: readonly Match[], myTeamIds: readonly string[], now: number, opts: { upcoming?: number; results?: number } = {}) {
  const live = matches.filter((m) => m.status === 'live' || m.status === 'suspended');
  const next = upcomingFor(matches, myTeamIds, now).find((m) => m.status === 'scheduled' || m.status === 'postponed') ?? null;
  const upcoming = matches
    .filter((m) => (isOpen(m) || m.status === 'postponed') && m.status !== 'live' && m.status !== 'suspended' && m.id !== next?.id)
    .sort(compareMatches)
    .slice(0, opts.upcoming ?? 4);
  const results = matches
    .filter((m) => hasResult(m))
    .sort((a, b) => compareMatches(b, a))
    .slice(0, opts.results ?? 3);
  return { live, next, upcoming, results };
}

/**
 * El inicio de una liga de equipos (baloncesto, fútbol y sala), rediseño «Calma y foco»: va dentro del marco de la liga
 * (LeagueHomeFrame: el ícono y el nombre arriba; Partidos, Tabla, Playoffs y Mi equipo como filas abajo). De arriba a
 * abajo, solo lo que hay:
 * - quien organiza una liga sin equipos: «Primero, los equipos» con UN botón;
 * - «En vivo» (las tarjetas de lo que se está jugando);
 * - «Tu próximo partido» con Voy / Tal vez / No voy en línea (NextMatchCard);
 * - `extra` (los suspendidos del fútbol, pasar a la fase final);
 * - «Próximos partidos» y «Resultados» como filas con su fecha, con «Ver todos»;
 * - «Tabla» con los primeros (`table`).
 * Armar el calendario y el partido suelto están en Organizar › Equipos (en el inicio, solo cuando todavía no hay
 * partidos: es el único botón de la pantalla).
 */
export function TeamHomeView({
  tl,
  now,
  minPlayers,
  renderLive,
  table,
  nextAlert,
  extra,
  build,
}: {
  tl: TeamLeague;
  now: number;
  minPlayers: number;
  renderLive: (m: Match) => ReactNode;
  table: { rows: readonly TableTopRow[]; title?: string; footer?: ReactNode };
  nextAlert?: (m: Match) => ReactNode;
  extra?: ReactNode;
  /** Sin partidos, para quien organiza: «Armar calendario» (o «Armar el torneo»). */
  build?: { label: string; relampago?: boolean; onClick: () => void };
}) {
  const matches = tl.matches.data;
  const myTeamIds = tl.myTeams.map((x) => x.team.id);
  const { live, next, upcoming, results } = useMemo(() => homeMatches(matches, myTeamIds, now), [matches, myTeamIds.join(), now]);
  if (tl.matches.error) return <LoadError error={tl.matches.error} />;
  const loading = tl.matches.loading && !matches.length;
  const noTeams = tl.isAdmin && !tl.teams.loading && tl.teams.data.length < 2;

  return (
    <div className="flex flex-col gap-[30px]">
      {noTeams && (
        <Card className="flex flex-col items-stretch gap-4 p-5">
          <div>
            <p className="text-card-title">Primero, los equipos</p>
            <p className="mt-1 text-meta text-muted">Cada equipo con su color y su plantilla. Después armas el calendario.</p>
          </div>
          <ActionLink to={`${tl.base}/admin?tab=equipos`} icon={Shirt} size="lg">
            Crear los equipos
          </ActionLink>
        </Card>
      )}

      {live.length > 0 && (
        <section aria-labelledby="equipos-vivo">
          <SectionHeader id="equipos-vivo" title="En vivo" />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {live.map((m) => (
              <div key={m.id} className="min-w-0">{renderLive(m)}</div>
            ))}
          </div>
        </section>
      )}

      {next && <NextMatchCard tl={tl} match={next} minPlayers={minPlayers} alert={nextAlert?.(next)} />}

      {extra}

      <section aria-labelledby="equipos-proximos">
        <SectionHeader id="equipos-proximos" title="Próximos partidos" action={matches.length > 0 ? <SectionLink to={`${tl.base}/juegos`}>Ver todos</SectionLink> : undefined} />
        {loading ? (
          <ListSkeleton rows={3} />
        ) : upcoming.length ? (
          <MatchRows tl={tl} matches={upcoming} now={now} />
        ) : !matches.length ? (
          <Card className="flex flex-col items-stretch gap-4 p-5">
            <div>
              <p className="text-card-title">Todavía no hay calendario</p>
              <p className="mt-1 text-meta text-muted">
                {tl.isAdmin && build
                  ? build.relampago
                    ? 'Grupos de todos contra todos y después la final, en un día.'
                    : 'Todos contra todos, de ida o de ida y vuelta.'
                  : 'Cuando el admin arme el calendario, los partidos salen aquí.'}
              </p>
            </div>
            {tl.isAdmin && build && tl.teams.data.length >= 2 && (
              <Button
                variant="primary"
                size="lg"
                icon={build.relampago ? <Trophy className="size-5" /> : <CalendarPlus className="size-5" />}
                onClick={build.onClick}
              >
                {build.label}
              </Button>
            )}
          </Card>
        ) : (
          <p className="mx-1 text-meta text-muted">{next || live.length ? 'No hay más partidos por jugar.' : 'No hay partidos por jugar.'}</p>
        )}
      </section>

      {results.length > 0 && (
        <section aria-labelledby="equipos-resultados">
          <SectionHeader id="equipos-resultados" title="Resultados" action={<SectionLink to={`${tl.base}/juegos?ver=resultados`}>Ver todos</SectionLink>} />
          <MatchRows tl={tl} matches={results} now={now} />
        </section>
      )}

      {tl.season && <TableTop tl={tl} rows={table.rows} title={table.title} mine={myTeamIds} footer={table.footer} />}
    </div>
  );
}
