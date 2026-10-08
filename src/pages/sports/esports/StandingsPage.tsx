import { useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { ListOrdered } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { useLeagueTournaments, type EsportsTournament } from '../../../lib/data/esports';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { tiebreakText } from '../../../sports/esports';
import { groupLetter } from '../../../sports/formats';
import { StandingsTable } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { Empty, ListSkeleton, LoadError, PageSkeleton, SectionHeader } from '../../../components/ui';
import { Chips, FinePrint } from '../racket/bits';
import { BrLeaderboard } from './br/BrLeaderboard';
import { brTable, competitors, groupTablesOf, myEntryOf, planFromStage, stageMatches, standingsColumns, tableOf } from './logic';
import { useEntryNames, useTournament } from './parts';

/** Los formatos que tienen tabla (grupos, todos contra todos y battle royale). */
const hasTable = (t: Pick<EsportsTournament, 'format' | 'status'>) => t.status !== 'cancelled' && (t.format === 'groups_playoffs' || t.format === 'round_robin' || t.format === 'br');

/**
 * «Tabla» de la liga de esports (§12.8 `Standings`, `/l/:lid/ranking`): las tablas de los grupos, la de todos contra
 * todos o la acumulada de battle royale. En una liga con varios torneos, se elige el torneo arriba. Si ningún torneo
 * tiene tabla (solo cuadros), vuelve al inicio.
 */
export default function EsportsStandingsPage() {
  const { lid } = useLeagueCtx();
  const list = useLeagueTournaments(lid);
  const [params, setParams] = useSearchParams();
  const pro = useIsPro();
  const withTable = useMemo(() => list.data.filter(hasTable), [list.data]);
  if (list.error) return <LoadError error={list.error} />;
  if (list.loading && !list.data.length) return <PageSkeleton />;
  if (!withTable.length) return <Navigate to=".." replace />;
  const picked = withTable.find((t) => t.eventId === params.get('torneo')) ?? withTable.find((t) => t.status === 'live') ?? withTable[0];
  return (
    <div className="flex flex-col px-2">
      <h1 className={pro ? 'text-title-pro' : 'text-title'}>Tabla</h1>
      {withTable.length > 1 && (
        <Chips
          className="mt-4"
          items={withTable.map((t) => ({ key: t.eventId, label: t.name }))}
          value={picked.eventId}
          onChange={(k) => setParams({ torneo: k }, { replace: true })}
        />
      )}
      <div className="mt-[26px]">
        <TournamentTables key={picked.eventId} eventId={picked.eventId} />
      </div>
    </div>
  );
}

function TournamentTables({ eventId }: { eventId: string }) {
  const { lid } = useLeagueCtx();
  const d = useTournament(lid, eventId);
  const nameOf = useEntryNames(d.entries);
  const uid = useAuth().user?.uid ?? null;
  const now = useNow().getTime();
  if (d.loading) return <ListSkeleton rows={4} />;
  const t = d.t;
  if (!t) return null;
  const mine = myEntryOf(d.entries, uid);
  const highlight = mine ? [mine.id] : [];
  if (t.format === 'br') {
    const ids = competitors(d.entries).map((e) => e.id);
    return <BrLeaderboard rows={brTable(ids, d.br, t.settings, t.game, t.eventId)} nameOf={nameOf} highlight={new Set(highlight)} />;
  }
  const columns = standingsColumns(t.game);
  if (t.format === 'round_robin') {
    if (!stageMatches('league', d.matches, d.links).length) return <NoTable />;
    const ids = competitors(d.entries).map((e) => e.id);
    return (
      <div className="flex flex-col gap-2">
        <StandingsTable rows={tableOf(t.game, ids, d.matches, d.entryOf, now, t.eventId)} nameOf={nameOf} columns={columns} highlight={highlight} />
        <FinePrint>{tiebreakText(t.game)}</FinePrint>
      </div>
    );
  }
  if (!stageMatches('groups', d.matches, d.links).length) return <NoTable />;
  const plan = planFromStage('groups', d.matches, d.links, d.entryOf);
  const tables = groupTablesOf(t.game, plan, d.matches, d.entryOf, now, t.eventId);
  return (
    <div className="flex flex-col gap-[30px]">
      {tables.map((g, i) => (
        <section key={i} aria-label={`Grupo ${groupLetter(i)}`}>
          <SectionHeader title={`Grupo ${groupLetter(i)}`} />
          <StandingsTable rows={g.rows} nameOf={nameOf} columns={columns} highlight={highlight} />
        </section>
      ))}
      <FinePrint>{tiebreakText(t.game)}</FinePrint>
    </div>
  );
}

function NoTable() {
  return (
    <Empty icon={<ListOrdered className="size-8" />} title="Sin tabla todavía">
      La tabla sale cuando el organizador arme los partidos.
    </Empty>
  );
}
