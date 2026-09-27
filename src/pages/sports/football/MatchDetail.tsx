import { useMemo, useState } from 'react';
import { ArrowLeft, ClipboardList, ClipboardPen, FileText, UserCheck } from 'lucide-react';
import { isSnapshot } from '../../../court';
import { hasResult, isOpen, useMatch, type Match } from '../../../lib/data/matches';
import { football, type FootballEvent, type FootballState, type TimelineItem } from '../../../sports/team/football';
import { ConfirmResultBanner, MatchCard, ShareResultCard } from '../../../components/match';
import { Button, Card, Empty, Loading } from '../../../components/ui';
import { Convocatoria } from '../team/Convocatoria';
import { canOpenTable } from '../team/logic';
import { MatchAdminPanel } from '../team/MatchAdminPanel';
import { SectionHead, TeamName } from '../team/TeamBits';
import type { TeamLeague } from '../team/useTeamLeague';
import { ActaEditor } from './ActaEditor';
import { footballResultParser, walkoverScore } from './adapter';
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
 * Un partido: marcador, en vivo, confirmar o reclamar el resultado, anotador de mesa y el acta en la cancha (quien
 * puede), suspendidos para este partido, goles y tarjetas con su minuto, jugadores, convocatoria, compartir y lo del
 * admin (corregir el resultado o el acta completa, W.O., aplazar…). El acta se abre encima a pantalla completa.
 */
export function FootballMatchDetail({ tl, matchId, table, onTable, onBack }: { tl: TeamLeague; matchId: string; table: boolean; onTable: (open: boolean) => void; onBack: () => void }) {
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState(false);
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
      <div className="flex flex-col gap-3">
        <Button variant="ghost" className="self-start" icon={<ArrowLeft className="size-4" />} onClick={onBack}>
          Partidos
        </Button>
        <Empty title="Este partido ya no existe">Puede que el admin lo haya borrado.</Empty>
      </div>
    );
  }

  // Sin señal y sin copia del partido completo: el acta arranca con lo de la lista y las reglas de la liga (lo que
  // ya se anotó en otro teléfono llega al pedir el turno).
  const courtMatch: Match | null = one.data ?? (one.error && listed ? { ...listed, rules: tl.rules.data } : null);
  const teams = m.sides.map((s) => tl.teamOf(s.teamId));
  const names: [string, string] = [teams[0]?.name ?? m.sides[0].label, teams[1]?.name ?? m.sides[1].label];
  const speaker = tl.speakerOf(m);
  const official = tl.officialOf(m.id);
  const canTable = canOpenTable({ match: m, isAdmin: tl.isAdmin, isScorer: !!tl.member?.scorer, userId: tl.userId, official, speaker });
  const url = typeof location !== 'undefined' ? `${location.origin}${tl.base}/juegos?partido=${m.id}` : undefined;
  const showActa = hasResult(m) || m.status === 'live' || m.status === 'suspended';

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
              {m.status === 'live' || m.status === 'suspended' ? 'Seguir con el acta' : 'Abrir el acta del partido'}
            </Button>
          )}
        </Card>
      )}

      <SuspendedNotice tl={tl} list={suspended} />

      {showActa && (
        <Card className="flex flex-col gap-4 p-4">
          <SectionHead title="Goles y tarjetas" />
          <PeriodsLine match={m} />
          <MatchTimeline tl={tl} match={m} names={names} />
          <PlayersTable tl={tl} match={m} />
          {!m.score?.lines && hasResult(m) && m.status !== 'walkover' && <p className="text-sm text-muted">Sin goleadores ni tarjetas (el resultado se anotó sin el acta).</p>}
          {m.score?.lines || !hasResult(m) ? (
            <Button variant="ghost" size="sm" className="self-start" icon={<FileText className="size-4" />} onClick={() => setFull(!full)}>
              {full ? 'Esconder el acta completa' : 'Ver el acta completa (cambios, porteros, penales)'}
            </Button>
          ) : null}
          {full && (one.loading && !one.data ? <Loading label="Bajando el acta…" /> : <FullActa tl={tl} match={one.data ?? m} names={names} />)}
        </Card>
      )}

      {(m.status === 'scheduled' || m.status === 'postponed') && <Convocatoria tl={tl} match={m} minPlayers={teamRules.minPlayers} flags={flags} />}

      {hasResult(m) && <ShareResultCard match={m} title={tl.league.name} roundWord="Jornada" url={url} />}

      {tl.isAdmin && (
        <>
          <MatchAdminPanel
            tl={tl}
            match={m}
            parser={footballResultParser({ keep: m.score })}
            placeholder="2-1 (o 1-1 pen 4-3)"
            walkoverScore={(absent) => walkoverScore(config.walkoverScore, absent)}
            minutes={matchMinutes(config)}
            onDeleted={onBack}
          />
          {hasResult(m) && m.status !== 'walkover' && (
            <Button className="self-start" icon={<ClipboardPen className="size-4" />} onClick={() => setEditing(true)}>
              Corregir el acta (goleadores y tarjetas)
            </Button>
          )}
          {editing && <ActaEditor tl={tl} match={one.data ?? m} open={editing} onClose={() => setEditing(false)} />}
        </>
      )}

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
