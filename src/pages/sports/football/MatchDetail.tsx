import { useMemo, useState } from 'react';
import { ClipboardList, ClipboardPen, FileText, Share2 } from 'lucide-react';
import { isSnapshot } from '../../../court';
import { hasResult, isOpen, useMatch, type Match } from '../../../lib/data/matches';
import { football, type FootballEvent, type FootballState, type TimelineItem } from '../../../sports/team/football';
import { ConfirmResultBanner, ShareResultCard } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { Button, Card, Empty, ListRow, Loading, RowIcon, SectionHeader, Sheet } from '../../../components/ui';
import { Convocatoria } from '../team/Convocatoria';
import { canOpenTable, rosterSide } from '../team/logic';
import { DisputeCard, MatchMenu } from '../team/MatchAdminPanel';
import { BackBar, HideShellBar, MatchHead, Scoreboard, matchHeading, sideNames } from '../team/TeamUi';
import { vsTitle } from '../team/view';
import type { TeamLeague } from '../team/useTeamLeague';
import { ActaEditor } from './ActaEditor';
import { decodeLines, decodeTimeline, footballResultParser, walkoverScore } from './adapter';
import { CardIcon, LiveStrip, MatchTimeline, PeriodsLine, PlayersTable, SuspendedNotice } from './bits';
import { FootballCourt } from './FootballCourt';
import { disciplineFrom, footballConfigFrom, footballTeamRules, matchMinutes, variantOf } from './rules';
import { suspendedIn, useFootballSeason } from './season';

/** El estado del acta desde lo que guardó el anotador (matches.state); null si no hay o no se puede leer. */
export function stateFromSnapshot(raw: unknown): FootballState | null {
  if (!isSnapshot(raw)) return null;
  try {
    const snap = raw as { config: unknown; base: FootballState | null; log: FootballEvent[] };
    const start = snap.base ?? football.init(snap.config as never);
    return snap.log.reduce((s, ev) => football.apply(s, ev), start);
  } catch {
    return null;
  }
}

/**
 * Un partido (rediseño «Calma y foco», como el de raqueta): «‹ Partidos» con «•••» (lo del admin, con «Corregir el
 * acta») arriba, el título («Jornada 3»), el estado, el marcador grande y, en vivo, el minuto, las faltas y las rojas;
 * confirmar o reclamar el resultado; UN botón para quien puede anotar («Abrir el acta del partido»); los suspendidos; la
 * convocatoria; goles y tarjetas con su minuto (en Pro, también los jugadores con goles, asistencias y tarjetas); el
 * acta completa (cambios, porteros, penales) y «Compartir el resultado» como filas. El acta se abre encima a pantalla
 * completa.
 */
export function FootballMatchDetail({ tl, matchId, table, onTable, onBack }: { tl: TeamLeague; matchId: string; table: boolean; onTable: (open: boolean) => void; onBack: () => void }) {
  const pro = useIsPro();
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  // El partido completo (reglas y el estado del acta, que puede pesar) solo se baja para abrir el acta en la cancha,
  // ver el acta completa o corregirla: quien mira usa lo de la lista, que el tiempo real pone al día.
  const one = useMatch(tl.lid, table || full || editing ? matchId : undefined);
  const listed = tl.matches.data.find((x) => x.id === matchId) ?? null;
  const m: Match | null = listed ?? one.data;
  const variant = variantOf(tl.league.sport);
  const rules = one.data?.rules ?? tl.rules.data;
  const config = useMemo(() => footballConfigFrom(rules, variant), [rules, variant]);
  const teamRules = useMemo(() => footballTeamRules(rules, variant), [rules, variant]);
  const season = useFootballSeason(tl);
  const discipline = disciplineFrom(tl.rules.data);
  const suspended = useMemo(
    () => (m && (isOpen(m) || m.status === 'postponed') ? suspendedIn(season.disciplineMatches, m.id, discipline, season.adjustments) : []),
    [m, season, discipline],
  );
  const flags = useMemo(() => new Map(suspended.map((s) => [s.player, 'Suspendido'] as const)), [suspended]);

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

  // Sin señal y sin copia del partido completo: el acta arranca con lo de la lista y las reglas de la liga (lo que
  // ya se anotó en otro teléfono llega al pedir el turno).
  const courtMatch: Match | null = one.data ?? (one.error && listed ? { ...listed, rules: tl.rules.data } : null);
  const names = sideNames(tl, m);
  const speaker = tl.speakerOf(m);
  const official = tl.officialOf(m.id);
  const canTable = canOpenTable({ match: m, isAdmin: tl.isAdmin, isScorer: !!tl.member?.scorer, userId: tl.userId, official, speaker });
  const url = typeof location !== 'undefined' ? `${location.origin}${tl.base}/juegos?partido=${m.id}` : undefined;
  const live = m.status === 'live' || m.status === 'suspended';
  const showActa = hasResult(m) || live;
  const hasLines = !!m.score?.lines;
  const fullRow = showActa && (hasLines || !hasResult(m));

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
            parser={footballResultParser({ keep: m.score })}
            placeholder="2-1 (o 1-1 pen 4-3)"
            walkoverScore={(absent) => walkoverScore(config.walkoverScore, absent)}
            minutes={matchMinutes(config)}
            onDeleted={onBack}
            extraAdmin={
              hasResult(m) && m.status !== 'walkover'
                ? [{ key: 'acta', icon: ClipboardPen, label: 'Corregir el acta', hint: 'Goleadores y tarjetas', onClick: () => setEditing(true) }]
                : []
            }
          />
        }
      />

      <Scoreboard tl={tl} match={m} mySide={rosterSide(m, tl.allTeams.data, tl.myPlayerId)} className="mt-[22px]" />
      {live ? <LiveStrip match={m} names={names} className="mt-3 px-1" /> : <PeriodsLine match={m} className="mt-3 px-1" />}

      <ConfirmResultBanner lid={tl.lid} match={m} mySide={speaker} isAdmin={tl.isAdmin} className="mt-3.5" />
      <DisputeCard tl={tl} match={m} parser={footballResultParser({ keep: m.score })} placeholder="2-1 (o 1-1 pen 4-3)" className="mt-3.5" />

      {canTable && (
        <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-[22px] w-full" icon={<ClipboardList className="size-5" />} onClick={() => onTable(true)}>
          {live ? 'Seguir con el acta' : 'Abrir el acta del partido'}
        </Button>
      )}
      {official && (
        <p className={canTable ? 'mt-2.5 text-center text-meta text-muted' : 'mt-3.5 px-1 text-meta text-muted'}>
          Anotador de mesa: <b className="font-semibold text-fg-2">{official.name || 'designado'}</b>
        </p>
      )}

      <SuspendedNotice tl={tl} list={suspended} className="mt-3.5" />

      {(m.status === 'scheduled' || m.status === 'postponed') && <Convocatoria tl={tl} match={m} minPlayers={teamRules.minPlayers} flags={flags} className="mt-[30px]" />}

      {showActa && (
        <section aria-labelledby="fb-goles" className="mt-[30px]">
          <SectionHeader id="fb-goles" title="Goles y tarjetas" />
          <MatchTimeline tl={tl} match={m} names={names} />
          {!hasLines && hasResult(m) && m.status !== 'walkover' && <p className="mx-1 text-meta text-muted">Sin goleadores ni tarjetas: el resultado se anotó sin el acta.</p>}
          {hasLines && !decodeTimeline(m.score?.tl, decodeLines(m.score?.lines)).length && <p className="mx-1 text-meta text-muted">Sin goles ni tarjetas.</p>}
        </section>
      )}
      {showActa && pro && hasLines && (
        <section aria-labelledby="fb-jugadores" className="mt-[30px]">
          <SectionHeader id="fb-jugadores" title="Jugadores" />
          <PlayersTable tl={tl} match={m} />
        </section>
      )}

      {(fullRow || hasResult(m)) && (
        <Card className="mt-[30px] overflow-hidden">
          {fullRow && (
            <ListRow
              leading={
                <RowIcon>
                  <FileText className="size-5" />
                </RowIcon>
              }
              title="Acta completa"
              subtitle="Cambios, porteros y penales"
              onClick={() => setFull(true)}
              dense={pro}
            />
          )}
          {hasResult(m) && (
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
          )}
        </Card>
      )}
      <Sheet open={full} onClose={() => setFull(false)} title="Acta completa" subtitle={vsTitle(names)}>
        {full && (one.loading && !one.data ? <Loading label="Bajando el acta…" /> : <FullActa tl={tl} match={one.data ?? m} names={names} />)}
      </Sheet>
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
      {tl.isAdmin && editing && <ActaEditor tl={tl} match={one.data ?? m} open={editing} onClose={() => setEditing(false)} />}

      {table && canTable && courtMatch && <FootballCourt tl={tl} match={courtMatch} variant={variant} suspended={suspended} onExit={() => onTable(false)} />}
      {table && canTable && !courtMatch && <Loading label="Abriendo el acta…" />}
    </div>
  );
}

const ITEM_TEXT: Record<TimelineItem['kind'], string> = {
  goal: 'Gol',
  own_goal: 'Autogol',
  yellow: 'Amarilla',
  second_yellow: 'Doble amarilla (roja)',
  red: 'Roja directa',
  sub: 'Cambio',
  goalkeeper: 'Portero',
  timeout: 'Tiempo muerto',
  period_end: 'Fin del tiempo',
  shootout: 'Penal',
};

/** El acta completa (de la lista de jugadas del anotador): goles, tarjetas, cambios, porteros, tiempos muertos y penales. */
function FullActa({ tl, match: m, names }: { tl: TeamLeague; match: Match; names: [string, string] }) {
  const state = useMemo(() => stateFromSnapshot(m.state), [m.state]);
  if (!state) return <p className="text-sm text-muted">Este partido no tiene el acta del anotador (se anotó solo el resultado).</p>;
  const who = (side: 1 | 2, id?: string) => {
    if (!id) return '';
    const j = m.sides[side - 1].players.find((p) => p.playerId === id)?.jersey ?? tl.jerseyOf(id, m.sides[side - 1].teamId);
    return `${j != null ? `#${j} ` : ''}${tl.nameOf(id)}`;
  };
  const items = state.timeline;
  if (!items.length) return <p className="text-sm text-muted">Todavía no hay jugadas.</p>;
  return (
    <ol className="flex flex-col divide-y divide-line text-sm">
      {items.map((it, i) => {
        const side = it.side;
        const playerSide = it.kind === 'own_goal' && side ? (side === 1 ? 2 : 1) : side;
        let detail = '';
        if (it.kind === 'sub' && side) detail = `sale ${who(side, it.player)}, entra ${who(side, it.in)}`;
        else if (it.kind === 'shootout' && side) detail = `${who(side, it.player) || names[side - 1]}: ${it.scored ? 'gol' : 'fallado'}`;
        else if (playerSide && it.player) detail = who(playerSide, it.player);
        if (it.assist && side) detail += ` (asistencia de ${who(side, it.assist)})`;
        return (
          <li key={i} className="flex items-center gap-2 py-1.5">
            <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-muted">{it.minute ? `${it.minute}'` : it.kind === 'period_end' ? '' : `${it.period}T`}</span>
            {(it.kind === 'yellow' || it.kind === 'second_yellow' || it.kind === 'red') && <CardIcon kind={it.kind} />}
            <span className="min-w-0 flex-1">
              <b className="font-medium">{ITEM_TEXT[it.kind]}</b>
              {side ? <span className="text-muted"> · {names[side - 1]}</span> : null}
              {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
