import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Swords } from 'lucide-react';
import { awaitingConfirmation, hasResult, useMatches, type Match } from '../../../lib/data/matches';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { MatchCard } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { Button, Empty, ListSkeleton, LoadError, Segmented, SectionHeader } from '../../../components/ui';
import { cardMatch, sideOfTeams } from './logic';
import { MatchSheet } from './match/MatchSheet';
import { useMyTeams } from './parts';

type Filter = 'todos' | 'mios';
const PAGE = 20;

/** Para ordenar los próximos: la hora, o la ronda si no tiene. */
const when = (m: Match) => (m.scheduledAt ? Date.parse(m.scheduledAt) : (m.round ?? 0) * 1e12);
/** Para ordenar los resultados: cuándo se anotó (lo último primero). */
const played = (m: Match) => Date.parse(m.confirmedAt ?? m.proposedAt ?? m.scheduledAt ?? '') || 0;

/**
 * «Partidos» de la liga de esports (§12.8 `Feed`, `/l/:lid/juegos`): todas las series en vivo, por confirmar, próximas
 * (con los dos lados ya sabidos; las demás están en el cuadro) y resultados, con «Todos | Míos». `?partido=<id>` abre
 * la hoja del partido (el link del push «Tienes un resultado por confirmar» llega aquí).
 */
export default function EsportsMatchesPage() {
  const { lid, league } = useLeagueCtx();
  const [params, setParams] = useSearchParams();
  const matchId = params.get('partido');
  const q = useMatches({ lid });
  const myTeams = useMyTeams();
  const now = useNow().getTime();
  const pro = useIsPro();
  const [filter, setFilter] = useState<Filter>('todos');
  const [shown, setShown] = useState(PAGE);
  const open = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('partido', id);
    else p.delete('partido');
    setParams(p);
  };

  const groups = useMemo(() => {
    const list = q.data.filter((m) => m.status !== 'void' && (filter === 'todos' || sideOfTeams(m, myTeams.all) !== null));
    const live = list.filter((m) => m.status === 'live');
    const toConfirm = list.filter((m) => awaitingConfirmation(m, now) || m.status === 'disputed');
    const upcoming = list.filter((m) => (m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended') && m.sides.every((s) => !!s.teamId)).sort((a, b) => when(a) - when(b));
    const results = list.filter((m) => hasResult(m) && !toConfirm.includes(m)).sort((a, b) => played(b) - played(a));
    return { live, toConfirm, upcoming, results };
  }, [q.data, filter, myTeams.all, now]);

  if (matchId) return <MatchSheet matchId={matchId} onBack={() => open(null)} backLabel="Partidos" shellBar />;
  if (q.error) return <LoadError error={q.error} />;

  const mineToConfirm = q.data.filter((m) => {
    const side = sideOfTeams(m, myTeams.act);
    return side !== null && awaitingConfirmation(m, now) && m.proposedSide !== side;
  }).length;
  const card = (m: Match) => <MatchCard key={m.id} match={cardMatch(m)} mySide={sideOfTeams(m, myTeams.all)} onClick={() => open(m.id)} tz={league.tz} now={now} roundWord="Jornada" />;
  const grid = (list: Match[]) => <div className="grid gap-2.5 sm:grid-cols-2">{list.map(card)}</div>;
  const empty = !groups.live.length && !groups.toConfirm.length && !groups.upcoming.length && !groups.results.length;

  return (
    <div className="flex flex-col px-2">
      <h1 className={pro ? 'text-title-pro' : 'text-title'}>Partidos</h1>
      {myTeams.all.size > 0 && (
        <Segmented
          full
          className="mt-4"
          label="Qué partidos ver"
          options={[
            { key: 'todos', label: 'Todos' },
            { key: 'mios', label: mineToConfirm ? `Míos (${mineToConfirm})` : 'Míos' },
          ]}
          value={filter}
          onChange={(k) => {
            setFilter(k);
            setShown(PAGE);
          }}
        />
      )}
      <div className="mt-[26px] flex flex-col gap-[30px]">
        {q.loading && !q.data.length ? (
          <ListSkeleton rows={4} />
        ) : empty ? (
          <Empty icon={<Swords className="size-8" />} title="Todavía no hay partidos">
            {filter === 'mios' ? 'Cuando te toque jugar, tus series salen aquí.' : 'Las series salen aquí cuando el organizador arme el cuadro.'}
          </Empty>
        ) : (
          <>
            {groups.live.length > 0 && (
              <section>
                <SectionHeader title="En vivo" />
                {grid(groups.live)}
              </section>
            )}
            {groups.toConfirm.length > 0 && (
              <section>
                <SectionHeader title="Por confirmar" />
                {grid(groups.toConfirm)}
              </section>
            )}
            {groups.upcoming.length > 0 && (
              <section>
                <SectionHeader title="Próximos" />
                {grid(groups.upcoming.slice(0, shown))}
              </section>
            )}
            {groups.results.length > 0 && (
              <section>
                <SectionHeader title="Resultados" />
                {grid(groups.results.slice(0, shown))}
              </section>
            )}
            {(groups.results.length > shown || groups.upcoming.length > shown) && (
              <Button variant="quiet" size="lg" className="w-full" onClick={() => setShown(shown + PAGE)}>
                Ver más
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
