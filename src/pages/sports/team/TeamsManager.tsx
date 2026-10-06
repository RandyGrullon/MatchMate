import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Shirt, Trash2, UserPlus } from 'lucide-react';
import { createPlayer } from '../../../lib/data';
import { asBackendError } from '../../../lib/db/errors';
import {
  createSeasonTeam,
  deleteSeasonTeam,
  nextFreeJersey,
  removeTeamPlayer,
  setTeamPlayer,
  updateSeasonTeam,
  type RosterEntry,
  type SeasonTeam,
  type TeamRole,
} from '../../../lib/data/seasonTeams';
import { BusyIcon, useBusy } from '../../../components/busy';
import { saveErrorMessage, useAction, useFeedback } from '../../../components/feedback';
import { useQuickMinor } from '../../../components/players/GuardianFields';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, Modal, cx } from '../../../components/ui';
import { TEAM_PALETTE, teamColor } from './logic';
import { BusySelect, TeamDot } from './TeamBits';
import type { TeamLeague } from './useTeamLeague';

/**
 * Equipos de temporada y sus plantillas (compartido por baloncesto y fútbol): nombre, color, dorsal, posición y
 * rol. El admin maneja todo; el capitán o delegado, la plantilla de su equipo (sin cambiar roles ni sacar a otro
 * capitán o delegado). Los jugadores sin cuenta los crea el admin; después se vinculan con su cuenta.
 */

const ROLE_LABEL: Record<TeamRole, string> = { player: 'Jugador', captain: 'Capitán', delegate: 'Delegado' };

/** Mensaje de un error al guardar la plantilla (dorsal repetido, sin permiso…). */
function rosterError(e: unknown): string {
  if (asBackendError(e)?.kind === 'conflict') return 'Ese dorsal ya lo usa otro jugador del equipo.';
  return saveErrorMessage(e);
}

/** Admin › Equipos: todos los equipos con su plantilla. */
export function TeamsManager({ tl, positions, sportWord = 'equipo' }: { tl: TeamLeague; positions: readonly string[]; sportWord?: string }) {
  const [editing, setEditing] = useState<SeasonTeam | 'nuevo' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const teams = tl.teams;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Equipos ({teams.data.length})</h2>
        <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing('nuevo')}>
          Nuevo {sportWord}
        </Button>
      </div>
      {teams.loading && !teams.data.length ? (
        <ListSkeleton rows={3} />
      ) : !teams.data.length ? (
        <Empty icon={<Shirt className="size-8" />} title="Todavía no hay equipos">
          Crea los equipos de la temporada con su color y arma cada plantilla con dorsales. Después armas el calendario.
        </Empty>
      ) : (
        teams.data.map((t) => (
          <Card key={t.id} className="overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <TeamDot team={t} className="size-4" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                <div className="truncate font-medium">{t.name}</div>
                <div className="truncate text-xs text-muted">
                  {t.roster.length} jugadores
                  {t.roster
                    .filter((r) => r.role !== 'player')
                    .map((r) => ` · ${ROLE_LABEL[r.role]}: ${tl.nameOf(r.playerId)}`)
                    .join('')}
                </div>
              </button>
              <Button size="sm" icon={<Pencil className="size-4" />} aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)} />
            </div>
            {open === t.id && (
              <div className="border-t border-line px-4 py-3">
                <RosterEditor tl={tl} team={t} canRoles positions={positions} />
              </div>
            )}
          </Card>
        ))
      )}
      <TeamForm tl={tl} team={editing === 'nuevo' ? null : editing} open={editing != null} onClose={() => setEditing(null)} />
    </div>
  );
}

/** Nombre y color del equipo (crear o cambiar); borrar. */
function TeamForm({ tl, team, open, onClose }: { tl: TeamLeague; team: SeasonTeam | null; open: boolean; onClose: () => void }) {
  const run = useAction();
  const { confirm } = useFeedback();
  const [name, setName] = useState('');
  const [color, setColor] = useState(TEAM_PALETTE[0]);
  const busy = useBusy<'guardar' | 'borrar'>();
  const [seen, setSeen] = useState<string | null>(null);
  const key = open ? (team?.id ?? 'nuevo') : null;
  if (key !== seen) {
    setSeen(key);
    if (open) {
      setName(team?.name ?? '');
      setColor(team ? teamColor(team) : TEAM_PALETTE[tl.teams.data.length % TEAM_PALETTE.length]);
    }
  }
  const valid = name.trim().length > 0 && name.trim().length <= 60;
  const save = async () => {
    const ok = await busy.run('guardar', () =>
      run(async () => {
        if (team) await updateSeasonTeam(tl.lid, team.id, { name: name.trim(), color });
        else await createSeasonTeam(tl.lid, { name: name.trim(), color });
        return true;
      }, team ? 'Equipo guardado' : 'Equipo creado'),
    );
    if (ok) onClose();
  };
  const remove = async () => {
    if (!team) return;
    const yes = await confirm({
      title: `¿Borrar ${team.name}?`,
      message: 'Sus partidos se quedan con el nombre, pero ya no cuenta en la tabla como equipo. Esto no se puede deshacer.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!yes) return;
    const ok = await busy.run('borrar', () =>
      run(async () => {
        await deleteSeasonTeam(tl.lid, team.id);
        return true;
      }, 'Equipo borrado'),
    );
    if (ok) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={team ? 'Editar equipo' : 'Nuevo equipo'}
      footer={
        <>
          {team && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              icon={<Trash2 className="size-4" />}
              loading={busy.isBusy('borrar')}
              disabled={busy.isBusy()}
              onClick={() => void remove()}
            >
              Borrar
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy.isBusy('guardar')} disabled={!valid || busy.isBusy()} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Tigres del Ensanche" autoFocus />
        </Field>
        <Field label="Color de la camiseta">
          <div className="flex flex-wrap items-center gap-2">
            {TEAM_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cx('size-9 rounded-full ring-offset-2 ring-offset-surface transition', color === c ? 'ring-2 ring-fg' : 'ring-1 ring-black/10')}
                style={{ background: c }}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Otro color" className="size-9 cursor-pointer rounded-full border border-line bg-transparent" />
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Plantilla de un equipo: dorsal, nombre, posición y rol. `canRoles` (admin): cambia roles, saca a cualquiera y
 * crea jugadores sin cuenta. Si no (capitán o delegado): dorsal y posición, y saca solo a jugadores.
 */
export function RosterEditor({ tl, team, canRoles, positions }: { tl: TeamLeague; team: SeasonTeam; canRoles: boolean; positions: readonly string[] }) {
  const { toast, confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const save = async (entry: RosterEntry, patch: Partial<Pick<RosterEntry, 'jersey' | 'position' | 'role'>>) => {
    try {
      await setTeamPlayer(tl.lid, team.id, {
        playerId: entry.playerId,
        jersey: patch.jersey !== undefined ? patch.jersey : entry.jersey,
        position: patch.position !== undefined ? patch.position : entry.position,
        ...(canRoles && patch.role ? { role: patch.role } : {}),
      });
    } catch (e) {
      toast(rosterError(e), 'error');
    }
  };
  const askRemove = (entry: RosterEntry) =>
    confirm({ title: `¿Sacar a ${tl.nameOf(entry.playerId)} de ${team.name}?`, message: 'Sus partidos jugados se quedan.', confirmText: 'Sacar', danger: true });
  const remove = async (entry: RosterEntry) => {
    try {
      await removeTeamPlayer(tl.lid, team.id, entry.playerId);
      toast('Jugador fuera de la plantilla');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {!team.roster.length && <p className="text-sm text-muted">La plantilla está vacía.</p>}
      <ul className="flex flex-col divide-y divide-line">
        {team.roster.map((r) => (
          <RosterRow
            key={r.playerId}
            entry={r}
            name={tl.nameOf(r.playerId)}
            canRoles={canRoles}
            canRemove={canRoles || r.role === 'player'}
            positions={positions}
            onSave={(patch) => save(r, patch)}
            onAskRemove={() => askRemove(r)}
            onRemove={() => remove(r)}
          />
        ))}
      </ul>
      <Button size="sm" className="self-start" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)}>
        Agregar jugador
      </Button>
      <AddPlayerModal tl={tl} team={team} canCreate={canRoles} open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function RosterRow({
  entry,
  name,
  canRoles,
  canRemove,
  positions,
  onSave,
  onAskRemove,
  onRemove,
}: {
  entry: RosterEntry;
  name: string;
  canRoles: boolean;
  canRemove: boolean;
  positions: readonly string[];
  onSave: (patch: Partial<Pick<RosterEntry, 'jersey' | 'position' | 'role'>>) => Promise<void>;
  onAskRemove: () => Promise<boolean>;
  onRemove: () => Promise<void>;
}) {
  // Cada fila espera lo suyo (dorsal, posición, rol o sacarlo): la ruedita sale en ese campo y la fila no se toca.
  const busy = useBusy<'jersey' | 'position' | 'role' | 'remove'>();
  const save = (field: 'jersey' | 'position' | 'role', patch: Partial<Pick<RosterEntry, 'jersey' | 'position' | 'role'>>) => void busy.run(field, () => onSave(patch));
  const remove = async () => {
    if (await onAskRemove()) await busy.run('remove', onRemove);
  };
  const [jersey, setJersey] = useState(entry.jersey == null ? '' : String(entry.jersey));
  const [seen, setSeen] = useState(entry.jersey);
  if (seen !== entry.jersey) {
    setSeen(entry.jersey);
    setJersey(entry.jersey == null ? '' : String(entry.jersey));
  }
  const commit = () => {
    const n = jersey.trim() === '' ? null : Number(jersey);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 99)) {
      setJersey(entry.jersey == null ? '' : String(entry.jersey));
      return;
    }
    if (n !== entry.jersey) save('jersey', { jersey: n });
  };
  const posOptions = entry.position && !positions.includes(entry.position) ? [...positions, entry.position] : positions;
  return (
    <li className="flex flex-wrap items-center gap-2 py-2" aria-busy={busy.isBusy() || undefined}>
      <span className="relative shrink-0">
        <Input
          className="h-10 w-16 text-center font-bold tabular-nums"
          inputMode="numeric"
          aria-label={`Dorsal de ${name}`}
          placeholder="#"
          value={jersey}
          maxLength={2}
          disabled={busy.isBusy()}
          onChange={(e) => setJersey(e.target.value.replace(/\D/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {busy.isBusy('jersey') && <BusyIcon busy className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-muted" />}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {name}
        {entry.role !== 'player' && (
          <Badge tone="accent" className="ml-1.5">
            {ROLE_LABEL[entry.role]}
          </Badge>
        )}
      </span>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <BusySelect
          busy={busy.isBusy('position')}
          disabled={busy.isBusy()}
          className="flex-1 sm:w-32"
          selectClassName="h-10"
          aria-label={`Posición de ${name}`}
          value={entry.position ?? ''}
          onChange={(e) => save('position', { position: e.target.value || null })}
        >
          <option value="">Posición</option>
          {posOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </BusySelect>
        {canRoles && (
          <BusySelect
            busy={busy.isBusy('role')}
            disabled={busy.isBusy()}
            className="flex-1 sm:w-32"
            selectClassName="h-10"
            aria-label={`Rol de ${name}`}
            value={entry.role}
            onChange={(e) => save('role', { role: e.target.value as TeamRole })}
          >
            {(Object.keys(ROLE_LABEL) as TeamRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </BusySelect>
        )}
        {canRemove && (
          <Button
            size="md"
            variant="ghost"
            icon={<Trash2 className="size-4" />}
            aria-label={`Sacar a ${name}`}
            loading={busy.isBusy('remove')}
            disabled={busy.isBusy()}
            onClick={() => void remove()}
          />
        )}
      </div>
    </li>
  );
}

/** Agregar a la plantilla: un jugador de la liga o (admin) uno nuevo sin cuenta. */
function AddPlayerModal({ tl, team, canCreate, open, onClose }: { tl: TeamLeague; team: SeasonTeam; canCreate: boolean; open: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const [q, setQ] = useState('');
  const [newName, setNewName] = useState('');
  // Qué se está agregando (el id del jugador o «crear»): solo ese muestra la ruedita.
  const busy = useBusy();
  // Liga con menores: «Es menor de edad» y su tutor debajo del nombre.
  const minor = useQuickMinor(canCreate && !!newName.trim());
  const inTeam = new Set(team.roster.map((r) => r.playerId));
  const teamOfPlayer = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tl.teams.data) for (const r of t.roster) if (t.id !== team.id) map.set(r.playerId, t.name);
    return map;
  }, [tl.teams.data, team.id]);
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const list = tl.players.data
    .filter((p) => !inTeam.has(p.id) && (!q.trim() || norm(p.name).includes(norm(q.trim()))))
    .sort((a, b) => Number(teamOfPlayer.has(a.id)) - Number(teamOfPlayer.has(b.id)) || a.name.localeCompare(b.name, 'es'));

  const add = (playerId: string) =>
    busy.run(playerId, async () => {
      try {
        await setTeamPlayer(tl.lid, team.id, { playerId, jersey: nextFreeJersey(team.roster, 4) });
        toast(`${tl.nameOf(playerId)} está en ${team.name}`);
      } catch (e) {
        toast(rosterError(e), 'error');
      }
    });
  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const m = minor.take();
    if (m === undefined) return;
    await busy.run('crear', async () => {
      try {
        const id = await createPlayer(tl.lid, name, null, m);
        await setTeamPlayer(tl.lid, team.id, { playerId: id, jersey: nextFreeJersey(team.roster, 4) });
        setNewName('');
        minor.reset();
        toast(`${name} está en ${team.name}`);
      } catch (e) {
        toast(rosterError(e), 'error');
      }
    });
  };
  return (
    <Modal open={open} onClose={onClose} title={`Agregar a ${team.name}`} footer={<Button onClick={onClose}>Listo</Button>}>
      <div className="flex flex-col gap-3">
        <Field label="Buscar en la liga">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre" />
          </div>
        </Field>
        <ul className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate">
                {p.name}
                {teamOfPlayer.has(p.id) && <span className="ml-1 text-xs text-muted">(en {teamOfPlayer.get(p.id)})</span>}
                {!p.uid && <span className="ml-1 text-xs text-muted">· sin cuenta</span>}
              </span>
              <Button size="sm" loading={busy.isBusy(p.id)} disabled={busy.isBusy()} icon={<Plus className="size-4" />} onClick={() => void add(p.id)}>
                Agregar
              </Button>
            </li>
          ))}
          {!list.length && <li className="py-3 text-sm text-muted">No hay jugadores con ese nombre en la liga.</li>}
        </ul>
        {canCreate && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
            <p className="text-sm font-medium">¿No está en la liga? Créalo sin cuenta</p>
            <p className="text-xs text-muted">Cuando entre a la app, lo vinculas con su cuenta en Admin › Jugadores.</p>
            <div className="flex gap-2">
              <Input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre y apellido" />
              <Button variant="primary" loading={busy.isBusy('crear')} disabled={busy.isBusy() || !newName.trim()} onClick={() => void create()}>
                Crear
              </Button>
            </div>
            {minor.fields}
          </div>
        )}
      </div>
    </Modal>
  );
}
