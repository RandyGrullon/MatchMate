import { useEffect, useMemo, useState } from 'react';
import { CheckSquare, Square, UserPlus, X } from 'lucide-react';
import type { Match } from '../../../lib/data/matches';
import { useMatchRsvps } from '../../../lib/data/teamSports';
import type { Side } from '../../../sports/types';
import { Button, Field, Segmented, Select, Sheet, cx } from '../../../components/ui';
import { rosterOf, teamColor } from './logic';
import { Jersey, RsvpBadge } from './TeamBits';
import { presentEntries, presentStart, reinforcementCandidates, togglePresent, type PresentEntry } from './presentes';
import type { TeamLeague } from './useTeamLeague';

// La lógica está en presentes.ts (la comparte la app del teléfono).
export type { PresentEntry } from './presentes';

/**
 * Lista de presentes que confirma el anotador (de ahí salen los partidos jugados de cada jugador). Arranca con
 * los que dijeron «Voy» (o con la lista que ya había). Los refuerzos son jugadores de la liga que no están en la
 * plantilla del equipo, hasta el límite de la liga.
 */
export function PresentesModal({
  open,
  onClose,
  tl,
  match: m,
  current,
  reinforcements,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  tl: TeamLeague;
  match: Match;
  current: [string[], string[]];
  reinforcements: number;
  onSave: (side: Side, players: PresentEntry[]) => void;
}) {
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const [tab, setTab] = useState<'1' | '2'>('1');
  const [picked, setPicked] = useState<[string[], string[]]>([[], []]);
  const [adding, setAdding] = useState('');

  const rosters = useMemo(
    () => [rosterOf(tl.allTeams.data, m.sides[0].teamId), rosterOf(tl.allTeams.data, m.sides[1].teamId)] as const,
    [tl.allTeams.data, m.sides],
  );

  // Al abrir: la lista que ya tiene la mesa; si no hay, los que dijeron «Voy».
  useEffect(() => {
    if (!open) return;
    setPicked(presentStart(current, rsvps.data, m.id));
    setAdding('');
    // Solo al abrir (las respuestas que lleguen después no pisan lo que el anotador ya tocó).
  }, [open]);

  const i = tab === '1' ? 0 : 1;
  const side = m.sides[i];
  const team = tl.teamOf(side.teamId);
  const color = teamColor(team, i + 1);
  const roster = rosters[i];
  const rosterIds = new Set(roster.map((r) => r.playerId));
  const extras = picked[i].filter((id) => !rosterIds.has(id));
  const candidates = reinforcementCandidates(tl.players.data, picked, rosters);
  const full = extras.length >= reinforcements;

  const toggle = (id: string) => setPicked((p) => togglePresent(p, i, id));
  const setSide = (ids: string[]) =>
    setPicked((p) => {
      const next: [string[], string[]] = [[...p[0]], [...p[1]]];
      next[i] = ids;
      return next;
    });
  const statusOf = (pid: string) => rsvps.data.find((r) => r.matchId === m.id && r.playerId === pid)?.status;

  const save = () => {
    for (const [side, list] of presentEntries(picked, rosters)) onSave(side, list);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Presentes"
      subtitle="Cuenta como partido jugado para cada uno"
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={save}>
          Guardar presentes ({picked[0].length} y {picked[1].length})
        </Button>
      }
    >
      <div className="flex flex-col gap-3 pb-1">
        <Segmented
          full
          label="Equipo"
          options={m.sides.map((s, k) => ({
            key: String(k + 1) as '1' | '2',
            label: (
              <>
                <span className="min-w-0 truncate">{tl.teamOf(s.teamId)?.name ?? s.label}</span>
                <span className="num text-muted">{picked[k].length}</span>
              </>
            ),
          }))}
          value={tab}
          onChange={(k) => setTab(k)}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="quiet" size="lg" onClick={() => setSide(roster.filter((r) => statusOf(r.playerId) === 'yes').map((r) => r.playerId).concat(extras))}>
            Los que dijeron «Voy»
          </Button>
          <Button variant="quiet" size="lg" onClick={() => setSide([...roster.map((r) => r.playerId), ...extras])}>
            Todos
          </Button>
          <Button variant="ghost" size="lg" onClick={() => setSide([])}>
            Ninguno
          </Button>
        </div>
        {!roster.length && <p className="text-meta text-muted">Este equipo no tiene plantilla. Agrega refuerzos o arma la plantilla en Organizar › Equipos.</p>}
        <ul className="flex flex-col gap-1">
          {roster.map((r) => {
            const on = picked[i].includes(r.playerId);
            return (
              <li key={r.playerId}>
                <button
                  type="button"
                  onClick={() => toggle(r.playerId)}
                  aria-pressed={on}
                  className={cx('flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition', on ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                >
                  {on ? <CheckSquare className="size-5 shrink-0 text-accent" /> : <Square className="size-5 shrink-0 text-muted" />}
                  <Jersey n={r.jersey} color={on ? color : undefined} />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{tl.nameOf(r.playerId)}</span>
                  <RsvpBadge status={statusOf(r.playerId)} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col gap-2 rounded-[20px] bg-surface-2 p-4">
          <p className="text-[15px] font-semibold">
            Refuerzos ({extras.length} de {reinforcements})
          </p>
          {extras.map((pid) => (
            <div key={pid} className="flex items-center gap-2">
              <UserPlus className="size-4 text-muted" />
              <span className="flex-1 truncate text-sm">{tl.nameOf(pid)}</span>
              <Button variant="ghost" size="lg" icon={<X className="size-4" />} aria-label={`Quitar a ${tl.nameOf(pid)}`} onClick={() => toggle(pid)} />
            </div>
          ))}
          {reinforcements > 0 && (
            <Field label="Agregar refuerzo" hint={full ? `La liga permite ${reinforcements} por partido.` : 'Jugadores de la liga que no son de ningún equipo de este partido.'}>
              <Select
                value={adding}
                disabled={full || !candidates.length}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id) toggle(id);
                  setAdding('');
                }}
              >
                <option value="">{candidates.length ? 'Elige un jugador…' : 'No hay más jugadores en la liga'}</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </div>
    </Sheet>
  );
}
