import { useMemo, useState } from 'react';
import { ClipboardList, Share2 } from 'lucide-react';
import { hasResult, useMatch, type Match } from '../../../lib/data/matches';
import { ConfirmResultBanner, ShareResultCard } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { Button, Card, Empty, ListRow, Loading, RowIcon, SectionHeader, Sheet } from '../../../components/ui';
import { Convocatoria } from '../team/Convocatoria';
import { canOpenTable, rosterSide } from '../team/logic';
import { DisputeCard, MatchMenu } from '../team/MatchAdminPanel';
import { BackBar, HideShellBar, MatchHead, Scoreboard, matchHeading, sideNames } from '../team/TeamUi';
import type { TeamLeague } from '../team/useTeamLeague';
import { vsTitle } from '../team/view';
import { forfeitScore } from './adapter';
import { BasketballCourt } from './BasketballCourt';
import { basketballParser, BoxScore, LiveStrip, PeriodsTable } from './bits';
import { basketballConfigFrom, basketballTeamRules } from './rules';

/**
 * Un partido (rediseño «Calma y foco», como el de raqueta): «‹ Partidos» con «•••» (lo del admin) arriba, el título
 * («Jornada 3»), el estado, el marcador grande y, en vivo, el cuarto, el reloj y las faltas; confirmar o reclamar el
 * resultado; UN botón para quien puede anotar («Abrir la mesa anotadora»); la convocatoria; los puntos por cuarto y por
 * jugador (en Pro, con triples, tiros libres y faltas) y «Compartir el resultado». La mesa se abre encima a pantalla
 * completa.
 */
export function MatchDetail({ tl, matchId, table, onTable, onBack }: { tl: TeamLeague; matchId: string; table: boolean; onTable: (open: boolean) => void; onBack: () => void }) {
  const pro = useIsPro();
  const [sharing, setSharing] = useState(false);
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
      <div className="flex flex-col px-2">
        <HideShellBar />
        <BackBar label="Partidos" onBack={onBack} />
        <Empty title="Este partido ya no existe">Puede que el admin lo haya borrado.</Empty>
      </div>
    );
  }

  // Sin señal y sin copia del partido completo: la mesa arranca con lo de la lista y las reglas de la liga (lo que
  // ya se anotó en otro teléfono llega al pedir el turno).
  const courtMatch: Match | null = one.data ?? (one.error && listed ? { ...listed, rules: tl.rules.data } : null);
  const names = sideNames(tl, m);
  const speaker = tl.speakerOf(m);
  const official = tl.officialOf(m.id);
  const canTable = canOpenTable({ match: m, isAdmin: tl.isAdmin, isScorer: !!tl.member?.scorer, userId: tl.userId, official, speaker });
  const url = typeof location !== 'undefined' ? `${location.origin}${tl.base}/juegos?partido=${m.id}` : undefined;
  const live = m.status === 'live' || m.status === 'suspended';
  const played = hasResult(m) || live;

  return (
    <div className="flex flex-col px-2">
      <MatchHead
        tl={tl}
        match={m}
        onBack={onBack}
        pro={pro}
        menu={
          <MatchMenu
            tl={tl}
            match={m}
            title={vsTitle(names)}
            parser={basketballParser}
            placeholder="78-72"
            walkoverScore={(absent) => forfeitScore(config.forfeitScore, absent)}
            onDeleted={onBack}
          />
        }
      />

      <Scoreboard tl={tl} match={m} mySide={rosterSide(m, tl.allTeams.data, tl.myPlayerId)} className="mt-[22px]" />
      {live && <LiveStrip match={m} names={names} className="mt-3 px-1" />}

      <ConfirmResultBanner lid={tl.lid} match={m} mySide={speaker} isAdmin={tl.isAdmin} className="mt-3.5" />
      <DisputeCard tl={tl} match={m} parser={basketballParser} placeholder="78-72" className="mt-3.5" />

      {canTable && (
        <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-[22px] w-full" icon={<ClipboardList className="size-5" />} onClick={() => onTable(true)}>
          {live ? 'Seguir en la mesa anotadora' : 'Abrir la mesa anotadora'}
        </Button>
      )}
      {official && (
        <p className={canTable ? 'mt-2.5 text-center text-meta text-muted' : 'mt-3.5 px-1 text-meta text-muted'}>
          Anotador de mesa: <b className="font-semibold text-fg-2">{official.name || 'designado'}</b>
        </p>
      )}

      {(m.status === 'scheduled' || m.status === 'postponed') && <Convocatoria tl={tl} match={m} minPlayers={teamRules.minPlayers} className="mt-[30px]" />}

      {played && (
        <>
          <section aria-labelledby="bb-cuartos" className="mt-[30px] empty:hidden">
            <PeriodsTable match={m} names={names} periodsPerGame={config.periods} title={<SectionHeader id="bb-cuartos" title={config.periods === 2 ? 'Por mitad' : 'Por cuarto'} />} />
          </section>
          <section aria-labelledby="bb-puntos" className="mt-[30px]">
            <SectionHeader id="bb-puntos" title="Puntos" />
            <BoxScore tl={tl} match={m} full={pro} />
            {!m.score?.lines && hasResult(m) && <p className="mx-1 text-meta text-muted">Sin puntos por jugador: el resultado se anotó sin la mesa.</p>}
          </section>
        </>
      )}

      {hasResult(m) && (
        <Card className="mt-[30px] overflow-hidden">
          <ListRow
            leading={
              <RowIcon>
                <Share2 className="size-5" />
              </RowIcon>
            }
            title="Compartir el resultado"
            subtitle="Imagen o texto para WhatsApp"
            onClick={() => setSharing(true)}
            dense={pro}
          />
        </Card>
      )}
      <Sheet open={sharing} onClose={() => setSharing(false)} title="Compartir el resultado" subtitle={matchHeading(m)}>
        {sharing && (
          <ShareResultCard
            match={m}
            title={tl.league.name}
            roundWord="Jornada"
            url={url}
            sideExtra={(s) => ({ dot: tl.teamOf(m.sides.find((x) => x.side === s)?.teamId ?? null)?.color ?? null })}
            className="shadow-none!"
          />
        )}
      </Sheet>

      {table && canTable && courtMatch && <BasketballCourt tl={tl} match={courtMatch} onExit={() => onTable(false)} />}
      {table && canTable && !courtMatch && <Loading label="Abriendo la mesa…" />}
    </div>
  );
}
