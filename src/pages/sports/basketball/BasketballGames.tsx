import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { awaitingConfirmation, hasResult, type Match } from '../../../lib/data/matches';
import { useNow } from '../../../lib/useNow';
import { MatchCard, ScheduleList } from '../../../components/match';
import { ListSkeleton, LoadError, cx } from '../../../components/ui';
import { TeamName } from '../team/TeamBits';
import { useTeamLeague, type TeamLeague } from '../team/useTeamLeague';
import { LiveStrip } from './bits';
import { MatchDetail } from './MatchDetail';

type Filter = 'todos' | 'vivo' | 'proximos' | 'resultados' | 'mios';

/** El link de un partido (el push de «resultado por confirmar» trae `?partido=`). */
export const matchLink = (base: string, id: string) => `${base}/juegos?partido=${id}`;

/** Tarjeta de un partido de baloncesto: colores de los equipos y el en vivo abajo. */
export function BasketballMatchCard({ tl, match: m, now }: { tl: TeamLeague; match: Match; now?: number }) {
  const names: [string, string] = [tl.teamOf(m.sides[0].teamId)?.name ?? m.sides[0].label, tl.teamOf(m.sides[1].teamId)?.name ?? m.sides[1].label];
  const live = m.status === 'live' || m.status === 'suspended';
  return (
    <MatchCard
      match={m}
      to={matchLink(tl.base, m.id)}
      mySide={tl.speakerOf(m)}
      roundWord="Jornada"
      tz={tl.tz}
      now={now}
      renderSide={(s) => <TeamName team={tl.teamOf(s.teamId)} label={s.label} />}
      footer={live ? <LiveStrip match={m} names={names} /> : undefined}
    />
  );
}

/**
 * Partidos de la liga (/l/:lid/juegos): en vivo, próximos, resultados y los de mi equipo. Con `?partido=<id>` abre
 * ese partido (así llega el push de «Tienes un resultado por confirmar»); con `&mesa=1`, su mesa anotadora.
 */
export default function BasketballGames() {
  const tl = useTeamLeague();
  const [params, setParams] = useSearchParams();
  const partido = params.get('partido');
  const now = useNow(30_000).getTime();
  const [filter, setFilter] = useState<Filter>('todos');
  const myTeamIds = tl.myTeams.map((x) => x.team.id);

  const list = useMemo(() => {
    const all = tl.matches.data;
    switch (filter) {
      case 'vivo':
        return all.filter((m) => m.status === 'live' || m.status === 'suspended');
      case 'proximos':
        return all.filter((m) => m.status === 'scheduled' || m.status === 'postponed');
      case 'resultados':
        return all.filter((m) => hasResult(m));
      case 'mios':
        return all.filter((m) => m.sides.some((s) => s.teamId && myTeamIds.includes(s.teamId)));
      default:
        return all;
    }
  }, [tl.matches.data, filter, myTeamIds.join()]);

  if (partido) {
    return (
      <MatchDetail
        tl={tl}
        matchId={partido}
        table={params.get('mesa') === '1'}
        onTable={(open) =>
          setParams(
            (p) => {
              const next = new URLSearchParams(p);
              if (open) next.set('mesa', '1');
              else next.delete('mesa');
              return next;
            },
            { replace: !open },
          )
        }
        onBack={() => setParams({}, { replace: false })}
      />
    );
  }

  if (tl.matches.error) return <LoadError error={tl.matches.error} />;
  const pendingMine = tl.matches.data.filter((m) => awaitingConfirmation(m, now) && tl.speakerOf(m) !== null && tl.speakerOf(m) !== m.proposedSide).length;
  const chips: { key: Filter; label: string; count?: number }[] = [
    { key: 'todos', label: 'Todos' },
    { key: 'vivo', label: 'En vivo', count: tl.matches.data.filter((m) => m.status === 'live').length },
    { key: 'proximos', label: 'Por jugar' },
    { key: 'resultados', label: 'Resultados', count: pendingMine || undefined },
    ...(myTeamIds.length ? [{ key: 'mios' as const, label: 'Mi equipo' }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Filtrar partidos">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={filter === c.key}
            onClick={() => setFilter(c.key)}
            className={cx(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-95',
              filter === c.key ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
            )}
          >
            {c.label}
            {!!c.count && <span className="rounded-full bg-danger px-1.5 text-[11px] leading-4 text-on-danger">{c.count}</span>}
          </button>
        ))}
      </div>
      {tl.matches.loading && !tl.matches.data.length ? (
        <ListSkeleton rows={4} />
      ) : (
        <ScheduleList
          matches={list}
          groupBy="round"
          roundWord="Jornada"
          tz={tl.tz}
          now={now}
          renderMatch={(m) => <BasketballMatchCard tl={tl} match={m} now={now} />}
          empty={filter === 'todos' ? (tl.isAdmin ? 'Arma el calendario en Admin › Equipos.' : 'Cuando el admin arme el calendario, los partidos salen aquí.') : 'Nada por aquí.'}
        />
      )}
    </div>
  );
}
