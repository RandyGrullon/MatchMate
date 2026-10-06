import { useMemo } from 'react';
import { Link } from 'react-router';
import { compareMatches, isOpen, type Match } from '../../../lib/data/matches';
import { setMatchOfficial } from '../../../lib/data/teamSports';
import { whenText } from '../../../components/match/format';
import { useBusy } from '../../../components/busy';
import { useAction } from '../../../components/feedback';
import { Card, Empty } from '../../../components/ui';
import { scorerCandidates } from './logic';
import { BusySelect } from './TeamBits';
import type { TeamLeague } from './useTeamLeague';

/**
 * Admin: los partidos por jugar con su anotador de mesa designado (compartido por los deportes de equipo). Si termina
 * el partido quien está designado, el resultado queda final. Se puede designar a un admin, a un anotador de la liga o
 * al capitán o delegado de uno de los dos equipos.
 */
export function OfficialsList({ tl, linkOf }: { tl: TeamLeague; linkOf: (m: Match) => string }) {
  const open = useMemo(() => tl.matches.data.filter((m) => isOpen(m) || m.status === 'postponed').sort(compareMatches), [tl.matches.data]);
  if (!open.length) return <Empty title="No hay partidos por jugar">Arma el calendario o crea un partido suelto.</Empty>;
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {open.map((m) => (
        <OfficialRow key={m.id} tl={tl} match={m} to={linkOf(m)} />
      ))}
    </Card>
  );
}

function OfficialRow({ tl, match: m, to }: { tl: TeamLeague; match: Match; to: string }) {
  const run = useAction();
  const saving = useBusy();
  const official = tl.officialOf(m.id);
  const candidates = scorerCandidates(m, tl.allTeams.data, tl.members.data, tl.players.data);
  const name = (i: 0 | 1) => tl.teamOf(m.sides[i].teamId)?.name ?? m.sides[i].label;
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <Link to={to} className="min-w-0 flex-1">
        <div className="truncate font-medium">
          {name(0)} vs. {name(1)}
        </div>
        <div className="truncate text-xs text-muted">
          {[m.stage || (m.round != null ? `Jornada ${m.round}` : ''), whenText(m.scheduledAt, tl.tz) ?? 'Sin fecha', m.court].filter(Boolean).join(' · ')}
          {m.status === 'postponed' && ' · Aplazado'}
        </div>
      </Link>
      <BusySelect
        busy={saving.isBusy()}
        className="sm:w-64"
        selectClassName="h-11"
        aria-label={`Anotador de mesa de ${name(0)} vs. ${name(1)}`}
        value={official?.userId ?? ''}
        onChange={(e) => {
          const uid = e.target.value;
          void saving.run('anotador', () => run(() => setMatchOfficial(tl.lid, m.id, uid || null), uid ? 'Anotador designado' : 'Sin anotador designado'));
        }}
      >
        <option value="">Anotador: sin designar</option>
        {official && !candidates.some((c) => c.uid === official.userId) && <option value={official.userId}>{official.name || 'Designado'}</option>}
        {candidates.map((c) => (
          <option key={c.uid} value={c.uid}>
            {c.name} · {c.why}
          </option>
        ))}
      </BusySelect>
    </div>
  );
}
