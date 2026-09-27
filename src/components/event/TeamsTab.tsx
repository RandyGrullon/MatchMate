import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Shield, Shuffle, Trash2, X } from 'lucide-react';
import { addTeam, deleteTeam, renameTeam, updateEntry } from '../../lib/data';
import { useLeagueCtx } from '../../lib/league';
import { category, entryHandicap } from '../../lib/stats';
import type { BowlingEvent, Entry, Player } from '../../lib/types';
import { useAction, useFeedback } from '../feedback';
import { Button, Card, Empty, Field, Input, Modal, Select } from '../ui';
import { AutoTeamsModal } from './AutoTeamsModal';
import { CategoryBadge } from './CategoryBadge';

export function TeamsTab({ event, entries, players }: { event: BowlingEvent; entries: Entry[]; players: Player[] }) {
  const { lid } = useLeagueCtx();
  const run = useAction();
  const { confirm } = useFeedback();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [auto, setAuto] = useState(false);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (e: Entry) => byId.get(e.playerId)?.name ?? '(jugador borrado)';
  const teams = Object.entries(event.teams ?? {}).sort(([, a], [, b]) => a.order - b.order);
  const unassigned = entries.filter((e) => !e.teamId || !event.teams?.[e.teamId]).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  async function create(ev: FormEvent) {
    ev.preventDefault();
    const n = name.trim() || `Equipo ${teams.length + 1}`;
    setName('');
    await run(() => addTeam(lid, event.id, n), `${n} creado`);
  }

  async function remove(teamId: string, teamName: string, members: Entry[]) {
    const ok = await confirm({
      title: `¿Eliminar ${teamName}?`,
      message: members.length ? `Sus ${members.length} jugadores quedan sin equipo.` : undefined,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (ok) await run(() => deleteTeam(lid, event.id, teamId, members.map((m) => m.id)), 'Equipo eliminado');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form onSubmit={create} className="flex flex-1 gap-2">
          <Input placeholder={`Equipo ${teams.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del equipo" />
          <Button type="submit" icon={<Plus className="size-4" />} className="shrink-0">
            Crear
          </Button>
        </form>
        <Button variant="primary" icon={<Shuffle className="size-4" />} disabled={entries.length < 2} onClick={() => setAuto(true)}>
          Armar automáticamente
        </Button>
      </div>

      {teams.length === 0 ? (
        <Empty icon={<Shield className="size-8" />} title="Sin equipos">
          Arma los equipos automáticamente por promedio, o créalos y asígnales jugadores a mano.
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {teams.map(([teamId, team]) => {
            const members = entries.filter((e) => e.teamId === teamId).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
            const avg = members.reduce((a, m) => a + (m.average || 0), 0);
            const hcp = members.reduce((a, m) => a + entryHandicap(m, event), 0);
            const full = !!event.teamSize && members.length >= event.teamSize;
            return (
              <Card key={teamId} className="flex flex-col">
                <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                  <Shield className="size-4 text-accent" />
                  {/* Tocar el nombre: cambiarlo. */}
                  <button
                    type="button"
                    onClick={() => setRenaming({ id: teamId, name: team.name })}
                    title="Cambiar el nombre"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <h3 className="truncate font-semibold">{team.name}</h3>
                    <Pencil className="size-3.5 shrink-0 text-muted" />
                  </button>
                  {!!event.teamSize && (
                    <span className={full ? 'text-xs font-medium text-ok' : 'text-xs text-muted'}>
                      {members.length}/{event.teamSize}
                    </span>
                  )}
                  <Button variant="ghost" size="sm" aria-label="Eliminar equipo" icon={<Trash2 className="size-4" />} onClick={() => remove(teamId, team.name, members)} />
                </div>
                <div className="flex gap-4 px-4 pt-2 text-xs text-muted">
                  <span>
                    Suma promedios <b className="text-fg tabular-nums">{avg}</b>
                  </span>
                  <span>
                    Hcp equipo <b className="text-fg tabular-nums">{hcp}</b>
                  </span>
                </div>
                <ul className="flex flex-col px-2 py-2">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                      <CategoryBadge value={category(m.average, event.categoryCuts)} />
                      <span className="flex-1 truncate text-sm">{nameOf(m)}</span>
                      <span className="text-xs text-muted tabular-nums">
                        {m.average} · hcp {entryHandicap(m, event)}
                      </span>
                      <button
                        type="button"
                        className="rounded p-1 text-muted hover:text-danger"
                        aria-label={`Quitar a ${nameOf(m)} del equipo`}
                        onClick={() => run(() => updateEntry(lid, m.id, { teamId: null }))}
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                  {members.length === 0 && <li className="px-2 py-1.5 text-sm text-muted">Sin jugadores</li>}
                </ul>
                {unassigned.length > 0 && !full && (
                  <div className="mt-auto px-4 pb-3">
                    <Select
                      value=""
                      onChange={(e) => e.target.value && run(() => updateEntry(lid, e.target.value, { teamId }))}
                      aria-label={`Agregar jugador a ${team.name}`}
                      className="h-9"
                    >
                      <option value="">+ Agregar jugador…</option>
                      {unassigned.map((u) => (
                        <option key={u.id} value={u.id}>
                          {nameOf(u)} ({u.average})
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {entries.length > 0 && (
        <Card className="px-4 py-3">
          <h3 className="mb-2 text-sm font-semibold">Sin equipo ({unassigned.length})</h3>
          {unassigned.length === 0 ? (
            <p className="text-sm text-muted">Todos los inscritos tienen equipo.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {unassigned.map((u) => (
                <span key={u.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-sm">
                  {nameOf(u)} <span className="text-muted tabular-nums">{u.average}</span>
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      <AutoTeamsModal open={auto} onClose={() => setAuto(false)} event={event} entries={entries} players={players} />
      <Modal
        open={renaming != null}
        onClose={() => setRenaming(null)}
        title="Renombrar equipo"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="rename-team">
              Guardar
            </Button>
          </>
        }
      >
        <form
          id="rename-team"
          onSubmit={(e) => {
            e.preventDefault();
            if (renaming?.name.trim()) run(() => renameTeam(lid, event.id, renaming.id, renaming.name.trim()));
            setRenaming(null);
          }}
        >
          <Field label="Nombre">
            <Input autoFocus value={renaming?.name ?? ''} onChange={(e) => setRenaming((r) => r && { ...r, name: e.target.value })} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
