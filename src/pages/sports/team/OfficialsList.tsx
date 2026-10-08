import { useMemo, useState } from 'react';
import { UserCheck } from 'lucide-react';
import { compareMatches, isOpen, type Match } from '../../../lib/data/matches';
import { Card, Empty, ListRow, RowIcon } from '../../../components/ui';
import { OfficialSheet } from './MatchAdminPanel';
import { sideNames } from './TeamUi';
import type { TeamLeague } from './useTeamLeague';
import { matchWhen, todayIn, vsTitle } from './view';

/**
 * Organizar: los partidos por jugar con su anotador de mesa designado (compartido por los deportes de equipo), como
 * filas; tocar una abre la hoja para elegirlo. Si termina el partido quien está designado, el resultado queda final. Se
 * puede designar a un admin, a un anotador de la liga o al capitán o delegado de uno de los dos equipos.
 */
export function OfficialsList({ tl }: { tl: TeamLeague; linkOf?: (m: Match) => string }) {
  const open = useMemo(() => tl.matches.data.filter((m) => isOpen(m) || m.status === 'postponed').sort(compareMatches), [tl.matches.data]);
  const [editing, setEditing] = useState<string | null>(null);
  const match = editing ? (open.find((m) => m.id === editing) ?? null) : null;
  if (!open.length) return <Empty title="No hay partidos por jugar">Arma el calendario o crea un partido suelto.</Empty>;
  const today = todayIn(tl.tz);
  return (
    <>
      <Card className="overflow-hidden">
        {open.map((m) => {
          const official = tl.officialOf(m.id);
          const names = sideNames(tl, m);
          return (
            <ListRow
              key={m.id}
              leading={
                <RowIcon tone={official ? 'accent' : 'neutral'}>
                  <UserCheck className="size-5" />
                </RowIcon>
              }
              title={vsTitle(names)}
              subtitle={
                <>
                  {[m.stage || (m.round != null ? `Jornada ${m.round}` : ''), m.status === 'postponed' ? 'Aplazado' : matchWhen(m.scheduledAt, tl.tz, today)].filter(Boolean).join(' · ')}
                  <span className="block font-[550] text-fg-2">{official ? `Anota: ${official.name || 'designado'}` : 'Sin anotador designado'}</span>
                </>
              }
              onClick={() => setEditing(m.id)}
              ariaLabel={`Anotador de mesa de ${names[0]} vs. ${names[1]}`}
            />
          );
        })}
      </Card>
      {match && <OfficialSheet tl={tl} match={match} open onClose={() => setEditing(null)} />}
    </>
  );
}
