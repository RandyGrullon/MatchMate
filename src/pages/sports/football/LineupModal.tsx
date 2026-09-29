import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckSquare, Hand, Square, UserPlus, X } from 'lucide-react';
import type { Match, PlayerDraft } from '../../../lib/data/matches';
import { useMatchRsvps } from '../../../lib/data/teamSports';
import type { Suspended } from '../../../sports/team/discipline';
import type { Side } from '../../../sports/types';
import { Badge, Button, Field, Modal, Select, Tabs, cx } from '../../../components/ui';
import { rosterOf, teamColor } from '../team/logic';
import { Jersey, RsvpBadge } from '../team/TeamBits';
import type { TeamLeague } from '../team/useTeamLeague';
import { REASON_TEXT } from './bits';

export interface LineupSide {
  /** Titulares (los que arrancan en la cancha). */
  starters: string[];
  goalkeeper: string | null;
}

/**
 * Alineación de cada lado: titulares (hasta los que van en la cancha) y el portero. Cuenta como partido jugado para
 * los titulares; los que entran de cambio suman después. Arranca con lo que ya tiene el acta o con los que dijeron
 * «Voy». Los suspendidos salen marcados (la app avisa, no bloquea). Refuerzos: jugadores de la liga fuera de las dos
 * plantillas, hasta el límite de la liga.
 */
export function LineupModal({
  open,
  onClose,
  tl,
  match: m,
  current,
  players,
  reinforcements,
  suspended,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  tl: TeamLeague;
  match: Match;
  current: [LineupSide, LineupSide];
  /** Jugadores en cancha por equipo (11, 7, 5). */
  players: number;
  reinforcements: number;
  suspended: readonly Suspended[];
  onSave: (side: Side, lineup: LineupSide, entries: PlayerDraft[]) => void;
}) {
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const [tab, setTab] = useState<'1' | '2'>('1');
  // Lo que ya tiene el acta desde el primer dibujo (el efecto de abajo completa con la convocatoria).
  const [picked, setPicked] = useState<[LineupSide, LineupSide]>(() => [
    { starters: [...current[0].starters], goalkeeper: current[0].goalkeeper },
    { starters: [...current[1].starters], goalkeeper: current[1].goalkeeper },
  ]);
  const [extras, setExtras] = useState<[string[], string[]]>([[], []]);
  const rosters = useMemo(() => [rosterOf(tl.allTeams.data, m.sides[0].teamId), rosterOf(tl.allTeams.data, m.sides[1].teamId)] as const, [tl.allTeams.data, m.sides]);

  // Al abrir: lo que ya tiene el acta; si no hay, los que dijeron «Voy» (hasta los que caben) y el portero de la plantilla.
  useEffect(() => {
    if (!open) return;
    const start = ([0, 1] as const).map((i): LineupSide => {
      if (current[i].starters.length) return { starters: [...current[i].starters], goalkeeper: current[i].goalkeeper };
      const yes = rsvps.data.filter((r) => r.matchId === m.id && r.side === i + 1 && r.status === 'yes').map((r) => r.playerId);
      const gk = rosters[i].find((r) => /^(gk|portero|arquero)$/i.test(r.position ?? '') && yes.includes(r.playerId))?.playerId ?? null;
      return { starters: yes.slice(0, players), goalkeeper: gk };
    }) as [LineupSide, LineupSide];
    setPicked(start);
    setExtras([
      start[0].starters.filter((id) => !rosters[0].some((r) => r.playerId === id)),
      start[1].starters.filter((id) => !rosters[1].some((r) => r.playerId === id)),
    ]);
    // Solo al abrir (las respuestas que lleguen después no pisan lo que el anotador ya tocó).
  }, [open]);

  const i = tab === '1' ? 0 : 1;
  const side = m.sides[i];
  const color = teamColor(tl.teamOf(side.teamId), i + 1);
  const roster = rosters[i];
  const mine = picked[i];
  const list = [...roster.map((r) => r.playerId), ...extras[i]];
  const taken = new Set([...rosters[0], ...rosters[1]].map((r) => r.playerId).concat(extras[0], extras[1]));
  const candidates = tl.players.data.filter((p) => !taken.has(p.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const susp = new Map(suspended.filter((s) => s.team === side.teamId).map((s) => [s.player, s] as const));
  const full = mine.starters.length >= players;
  const statusOf = (pid: string) => rsvps.data.find((r) => r.matchId === m.id && r.playerId === pid)?.status;
  const jersey = (pid: string) => roster.find((r) => r.playerId === pid)?.jersey ?? null;
  const warnings = mine.starters.filter((id) => susp.has(id));

  const update = (next: LineupSide) =>
    setPicked((p) => {
      const out: [LineupSide, LineupSide] = [p[0], p[1]];
      out[i] = next;
      return out;
    });
  const toggle = (id: string) => {
    if (mine.starters.includes(id)) update({ starters: mine.starters.filter((x) => x !== id), goalkeeper: mine.goalkeeper === id ? null : mine.goalkeeper });
    else if (!full) update({ ...mine, starters: [...mine.starters, id] });
  };
  const setKeeper = (id: string) => {
    const starters = mine.starters.includes(id) ? mine.starters : full ? mine.starters : [...mine.starters, id];
    if (!starters.includes(id)) return;
    update({ starters, goalkeeper: mine.goalkeeper === id ? null : id });
  };

  const save = () => {
    ([0, 1] as const).forEach((k) => {
      const ids = new Set(rosters[k].map((r) => r.playerId));
      const lu = picked[k];
      const entries: PlayerDraft[] = lu.starters.map((pid) => ({
        playerId: pid,
        jersey: rosters[k].find((r) => r.playerId === pid)?.jersey ?? null,
        position: pid === lu.goalkeeper ? 'GK' : 'titular',
        sub: !ids.has(pid),
      }));
      const same = JSON.stringify(lu) === JSON.stringify(current[k]);
      if (!same) onSave((k + 1) as Side, lu, entries);
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alineación"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save}>
            Guardar ({picked[0].starters.length} y {picked[1].starters.length})
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Marca los {players} titulares de cada equipo y toca <Hand className="inline size-4 align-[-3px]" /> para el portero. Cuenta como partido jugado; los que
          entran de cambio se suman solos.
        </p>
        <Tabs
          items={m.sides.map((s, k) => ({ key: String(k + 1) as '1' | '2', label: tl.teamOf(s.teamId)?.name ?? s.label, count: picked[k].starters.length }))}
          active={tab}
          onChange={(k) => setTab(k)}
        />
        {warnings.length > 0 && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              {warnings.map((id) => tl.nameOf(id)).join(', ')} {warnings.length === 1 ? 'está suspendido' : 'están suspendidos'} para este partido. Si juega, sale
              como alineación indebida (el admin decide).
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => update({ starters: list.filter((pid) => statusOf(pid) === 'yes').slice(0, players), goalkeeper: null })}
          >
            Los que dijeron «Voy»
          </Button>
          <Button size="sm" variant="ghost" onClick={() => update({ starters: [], goalkeeper: null })}>
            Ninguno
          </Button>
          <span className={cx('ml-auto self-center text-xs', full ? 'font-semibold text-ok' : 'text-muted')}>
            {mine.starters.length} de {players}
          </span>
        </div>
        {!roster.length && !extras[i].length && <p className="text-sm text-muted">Este equipo no tiene plantilla. Arma la plantilla en Admin › Equipos.</p>}
        <ul className="flex flex-col gap-1">
          {list.map((pid) => {
            const on = mine.starters.includes(pid);
            const gk = mine.goalkeeper === pid;
            const s = susp.get(pid);
            return (
              <li key={pid} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggle(pid)}
                  aria-pressed={on}
                  disabled={!on && full}
                  className={cx('flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 text-left transition disabled:opacity-50', on ? 'bg-accent-soft' : 'hover:bg-surface-2')}
                >
                  {on ? <CheckSquare className="size-5 shrink-0 text-accent" /> : <Square className="size-5 shrink-0 text-muted" />}
                  <Jersey n={jersey(pid)} color={on ? color : undefined} />
                  <span className="min-w-0 flex-1 truncate">{tl.nameOf(pid)}</span>
                  {s && <Badge tone="danger">Suspendido</Badge>}
                  {!s && extras[i].includes(pid) && <Badge>Refuerzo</Badge>}
                  {!s && !extras[i].includes(pid) && <RsvpBadge status={statusOf(pid)} />}
                </button>
                <Button
                  size="sm"
                  variant={gk ? 'primary' : 'ghost'}
                  className="h-12 w-12"
                  aria-pressed={gk}
                  aria-label={gk ? `${tl.nameOf(pid)} es el portero` : `Poner a ${tl.nameOf(pid)} de portero`}
                  icon={<Hand className="size-5" />}
                  onClick={() => setKeeper(pid)}
                />
              </li>
            );
          })}
        </ul>
        {susp.size > 0 && (
          <p className="text-xs text-muted">
            Suspendidos:{' '}
            {[...susp.values()].map((s) => `${tl.nameOf(s.player)} (${REASON_TEXT[s.reason] ?? s.reason})`).join(', ')}.
          </p>
        )}
        {reinforcements > 0 && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
            <p className="text-sm font-medium">
              Refuerzos ({extras[i].length} de {reinforcements})
            </p>
            {extras[i].map((pid) => (
              <div key={pid} className="flex items-center gap-2">
                <UserPlus className="size-4 text-muted" />
                <span className="flex-1 truncate text-sm">{tl.nameOf(pid)}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<X className="size-4" />}
                  aria-label={`Quitar a ${tl.nameOf(pid)}`}
                  onClick={() => {
                    setExtras((e) => {
                      const out: [string[], string[]] = [[...e[0]], [...e[1]]];
                      out[i] = out[i].filter((x) => x !== pid);
                      return out;
                    });
                    update({ starters: mine.starters.filter((x) => x !== pid), goalkeeper: mine.goalkeeper === pid ? null : mine.goalkeeper });
                  }}
                />
              </div>
            ))}
            <Field label="Agregar refuerzo">
              <Select
                value=""
                disabled={extras[i].length >= reinforcements || !candidates.length}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  setExtras((x) => {
                    const out: [string[], string[]] = [[...x[0]], [...x[1]]];
                    out[i] = [...out[i], id];
                    return out;
                  });
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
          </div>
        )}
      </div>
    </Modal>
  );
}
