import { useMemo } from 'react';
import { ArrowLeft, ClipboardList, UserCheck } from 'lucide-react';
import { hasResult, useMatch, type Match } from '../../../lib/data/matches';
import { ConfirmResultBanner, MatchCard, ShareResultCard } from '../../../components/match';
import { Button, Card, Empty, Loading } from '../../../components/ui';
import { Convocatoria } from '../team/Convocatoria';
import { canOpenTable } from '../team/logic';
import { MatchAdminPanel } from '../team/MatchAdminPanel';
import { TeamName } from '../team/TeamBits';
import type { TeamLeague } from '../team/useTeamLeague';
import { forfeitScore } from './adapter';
import { BasketballCourt } from './BasketballCourt';
import { basketballParser, BoxScore, LiveStrip, PeriodsTable } from './bits';
import { basketballConfigFrom, basketballTeamRules } from './rules';

/**
 * Un partido: marcador, en vivo, confirmar o reclamar el resultado, convocatoria, mesa anotadora (quien puede),
 * cuartos y puntos por jugador, compartir y lo del admin. La mesa se abre encima a pantalla completa.
 */
export function MatchDetail({ tl, matchId, table, onTable, onBack }: { tl: TeamLeague; matchId: string; table: boolean; onTable: (open: boolean) => void; onBack: () => void }) {
  // El partido completo (reglas y estado de la mesa, que puede pesar) solo se baja para abrir la mesa: quien mira
  // usa lo de la lista, que el tiempo real pone al día sin volver a leer.
  const one = useMatch(tl.lid, table ? matchId : undefined);
  const listed = tl.matches.data.find((x) => x.id === matchId) ?? null;
  const m: Match | null = listed ?? one.data;
  const rules = one.data?.rules ?? tl.rules.data;
  const config = useMemo(() => basketballConfigFrom(rules), [rules]);
  const teamRules = useMemo(() => basketballTeamRules(rules), [rules]);

  if (!m) {
    if (one.loading || tl.matches.loading) return <Loading />;
    return (
      <div className="flex flex-col gap-3">
        <Button variant="ghost" className="self-start" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
          Partidos
        </Button>
        <Empty title="Este partido ya no existe">Puede que el admin lo haya borrado.</Empty>
      </div>
    );
  }

  // Sin señal y sin copia del partido completo: la mesa arranca con lo de la lista y las reglas de la liga (lo que
  // ya se anotó en otro teléfono llega al pedir el turno).
  const courtMatch: Match | null = one.data ?? (one.error && listed ? { ...listed, rules: tl.rules.data } : null);
  const teams = m.sides.map((s) => tl.teamOf(s.teamId));
  const names: [string, string] = [teams[0]?.name ?? m.sides[0].label, teams[1]?.name ?? m.sides[1].label];
  const speaker = tl.speakerOf(m);
  const official = tl.officialOf(m.id);
  const canTable = canOpenTable({ match: m, isAdmin: tl.isAdmin, isScorer: !!tl.member?.scorer, userId: tl.userId, official, speaker });
  const url = typeof location !== 'undefined' ? `${location.origin}${tl.base}/juegos?partido=${m.id}` : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" className="self-start" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
        Partidos
      </Button>

      <MatchCard
        match={m}
        mySide={speaker}
        roundWord="Jornada"
        tz={tl.tz}
        renderSide={(s) => <TeamName team={tl.teamOf(s.teamId)} label={s.label} />}
        footer={<LiveStrip match={m} names={names} />}
      />

      <ConfirmResultBanner lid={tl.lid} match={m} mySide={speaker} isAdmin={tl.isAdmin} />

      {(canTable || official) && (
        <Card className="flex flex-col gap-3 p-4">
          {official && (
            <p className="flex items-center gap-2 text-sm">
              <UserCheck className="size-4 text-accent" />
              Anotador de mesa: <b>{official.name || 'designado'}</b>
            </p>
          )}
          {canTable && (
            <Button variant="primary" className="h-14 text-base" icon={<ClipboardList className="size-5" />} onClick={() => onTable(true)}>
              {m.status === 'live' || m.status === 'suspended' ? 'Seguir en la mesa anotadora' : 'Abrir la mesa anotadora'}
            </Button>
          )}
        </Card>
      )}

      {(hasResult(m) || m.status === 'live' || m.status === 'suspended') && (
        <Card className="flex flex-col gap-4 p-4">
          <PeriodsTable match={m} names={names} periodsPerGame={config.periods} />
          <BoxScore tl={tl} match={m} />
          {!m.score?.lines && hasResult(m) && <p className="text-sm text-muted">Sin puntos por jugador (el resultado se anotó sin la mesa).</p>}
        </Card>
      )}

      {(m.status === 'scheduled' || m.status === 'postponed') && <Convocatoria tl={tl} match={m} minPlayers={teamRules.minPlayers} />}

      {hasResult(m) && (
        <ShareResultCard
          match={m}
          title={tl.league.name}
          roundWord="Jornada"
          url={url}
          sideExtra={(s) => ({ dot: tl.teamOf(m.sides.find((x) => x.side === s)?.teamId ?? null)?.color ?? null })}
        />
      )}

      {tl.isAdmin && (
        <MatchAdminPanel
          tl={tl}
          match={m}
          parser={basketballParser}
          placeholder="78-72"
          walkoverScore={(absent) => forfeitScore(config.forfeitScore, absent)}
          onDeleted={onBack}
        />
      )}

      {table && canTable && courtMatch && <BasketballCourt tl={tl} match={courtMatch} onExit={() => onTable(false)} />}
      {table && canTable && !courtMatch && <Loading label="Abriendo la mesa…" />}
    </div>
  );
}
