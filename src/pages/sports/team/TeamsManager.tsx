import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Palette, Plus, Search, Trash2, UserPlus, UserRound } from 'lucide-react';
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
import { Button, Card, Field, Input, ListRow, ListSkeleton, RowIcon, SectionHeader, Segmented, Select, Sheet, cx, sectionLinkClass } from '../../../components/ui';
import { TEAM_PALETTE, teamColor } from './logic';
import { Jersey } from './TeamBits';
import { DangerButton, TeamCrest } from './TeamUi';
import type { TeamLeague } from './useTeamLeague';

/**
 * Equipos de temporada y sus plantillas (compartido por baloncesto y fútbol), rediseño «Calma y foco»: los equipos como
 * filas (escudo, nombre y quién es el capitán) y cada uno abre su hoja con la plantilla; cada jugador abre la suya
 * (dorsal, posición y rol, o sacarlo). El admin maneja todo; el capitán o delegado, la plantilla de su equipo (sin
 * cambiar roles ni sacar a otro capitán o delegado). Los jugadores sin cuenta los crea el admin; después se vinculan
 * con su cuenta.
 */

const ROLE_LABEL: Record<TeamRole, string> = { player: 'Jugador', captain: 'Capitán', delegate: 'Delegado' };
const ROLES: readonly TeamRole[] = ['player', 'captain', 'delegate'];

/** Mensaje de un error al guardar la plantilla (dorsal repetido, sin permiso…). */
function rosterError(e: unknown): string {
  if (asBackendError(e)?.kind === 'conflict') return 'Ese dorsal ya lo usa otro jugador del equipo.';
  return saveErrorMessage(e);
}

/** «4 jugadores · Capitán: Ana Pérez». */
const teamLine = (tl: Pick<TeamLeague, 'nameOf'>, t: SeasonTeam) =>
  `${t.roster.length} ${t.roster.length === 1 ? 'jugador' : 'jugadores'}${t.roster
    .filter((r) => r.role !== 'player')
    .map((r) => ` · ${ROLE_LABEL[r.role]}: ${tl.nameOf(r.playerId)}`)
    .join('')}`;

/** Organizar › Equipos: todos los equipos como filas; cada uno abre su hoja con la plantilla. */
export function TeamsManager({ tl, positions, sportWord = 'equipo' }: { tl: TeamLeague; positions: readonly string[]; sportWord?: string }) {
  const [editing, setEditing] = useState<SeasonTeam | 'nuevo' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const teams = tl.teams;
  // La hoja sigue al equipo de la caché (la plantilla cambia mientras está abierta).
  const open = openId ? (teams.data.find((t) => t.id === openId) ?? null) : null;
  return (
    <section aria-labelledby="equipos-lista">
      <SectionHeader
        id="equipos-lista"
        title={`Equipos (${teams.data.length})`}
        action={
          teams.data.length > 0 ? (
            <button type="button" onClick={() => setEditing('nuevo')} className={sectionLinkClass} aria-haspopup="dialog">
              <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.4} />
              Nuevo {sportWord}
            </button>
          ) : undefined
        }
      />
      {teams.loading && !teams.data.length ? (
        <ListSkeleton rows={3} />
      ) : !teams.data.length ? (
        <Card className="flex flex-col items-stretch gap-4 p-5">
          <div>
            <p className="text-card-title">Todavía no hay equipos</p>
            <p className="mt-1 text-meta text-muted">Cada equipo con su color y su plantilla con dorsales.</p>
          </div>
          <Button variant="primary" size="lg" icon={<Plus className="size-5" />} onClick={() => setEditing('nuevo')}>
            Crear el primer {sportWord}
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {teams.data.map((t) => (
            <ListRow key={t.id} leading={<TeamCrest team={t} />} title={t.name} subtitle={teamLine(tl, t)} onClick={() => setOpenId(t.id)} ariaLabel={`${t.name}: plantilla`} />
          ))}
        </Card>
      )}
      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? 'Equipo'} subtitle={open ? teamLine(tl, open) : undefined}>
        {open && (
          <div className="flex flex-col gap-3.5 pb-1">
            <RosterEditor tl={tl} team={open} canRoles positions={positions} flat />
            <Card className="overflow-hidden shadow-[inset_0_0_0_1px_var(--line)]">
              <ListRow
                leading={
                  <RowIcon>
                    <Palette className="size-5" />
                  </RowIcon>
                }
                title="Nombre y color"
                subtitle="O borrar el equipo"
                onClick={() => setEditing(open)}
              />
            </Card>
          </div>
        )}
      </Sheet>
      <TeamForm
        tl={tl}
        team={editing === 'nuevo' ? null : editing}
        open={editing != null}
        onClose={() => setEditing(null)}
        onDeleted={() => {
          setEditing(null);
          setOpenId(null);
        }}
      />
    </section>
  );
}

/** Nombre y color del equipo (crear o cambiar); borrar. */
function TeamForm({ tl, team, open, onClose, onDeleted }: { tl: TeamLeague; team: SeasonTeam | null; open: boolean; onClose: () => void; onDeleted: () => void }) {
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
    if (ok) onDeleted();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={team ? 'Nombre y color' : 'Nuevo equipo'}
      footer={
        <div className="flex gap-2.5">
          {team && (
            <DangerButton
              icon={<Trash2 className="size-5" />}
              loading={busy.isBusy('borrar')}
              disabled={busy.isBusy()}
              onClick={() => void remove()}
              aria-label={`Borrar ${team.name}`}
            />
          )}
          <Button variant="primary" size="lg" className="flex-1" loading={busy.isBusy('guardar')} disabled={!valid || busy.isBusy()} onClick={() => void save()}>
            {team ? 'Guardar' : 'Crear equipo'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label="Nombre">
          <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Tigres del Ensanche" autoFocus />
        </Field>
        <Field label="Color de la camiseta">
          <div className="flex flex-wrap items-center gap-2.5">
            {TEAM_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cx('size-10 rounded-full ring-offset-2 ring-offset-surface transition', color === c ? 'ring-2 ring-fg' : 'ring-1 ring-black/10')}
                style={{ background: c }}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Otro color" className="size-10 cursor-pointer rounded-full border border-line bg-transparent" />
          </div>
        </Field>
      </div>
    </Sheet>
  );
}

/**
 * Plantilla de un equipo como filas: el dorsal en el color del equipo, el nombre (con su rol) y la posición. Quien la
 * maneja (`canRoles` = admin: roles, sacar a cualquiera y crear jugadores sin cuenta; si no, el capitán o delegado: dorsal
 * y posición, y saca solo a jugadores) toca un jugador para cambiarlo y tiene «Agregar jugador» al final; los demás van a
 * la página de cada uno. `flat`: dentro de una hoja (con contorno en vez de sombra).
 */
export function RosterEditor({ tl, team, canRoles, positions, readOnly, flat }: { tl: TeamLeague; team: SeasonTeam; canRoles: boolean; positions: readonly string[]; readOnly?: boolean; flat?: boolean }) {
  const { toast, confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (team.roster.find((r) => r.playerId === editingId) ?? null) : null;
  const save = async (entry: RosterEntry, patch: Partial<Pick<RosterEntry, 'jersey' | 'position' | 'role'>>): Promise<boolean> => {
    try {
      await setTeamPlayer(tl.lid, team.id, {
        playerId: entry.playerId,
        jersey: patch.jersey !== undefined ? patch.jersey : entry.jersey,
        position: patch.position !== undefined ? patch.position : entry.position,
        ...(canRoles && patch.role ? { role: patch.role } : {}),
      });
      return true;
    } catch (e) {
      toast(rosterError(e), 'error');
      return false;
    }
  };
  const askRemove = (entry: RosterEntry) =>
    confirm({ title: `¿Sacar a ${tl.nameOf(entry.playerId)} de ${team.name}?`, message: 'Sus partidos jugados se quedan.', confirmText: 'Sacar', danger: true });
  const remove = async (entry: RosterEntry): Promise<boolean> => {
    try {
      await removeTeamPlayer(tl.lid, team.id, entry.playerId);
      toast('Jugador fuera de la plantilla');
      return true;
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
      return false;
    }
  };
  const color = teamColor(team);
  return (
    <>
      <Card className={cx('overflow-hidden', flat && 'shadow-[inset_0_0_0_1px_var(--line)]')}>
        {!team.roster.length && <p className="px-5 py-4 text-meta text-muted">La plantilla está vacía.</p>}
        {team.roster.map((r) => {
          const name = tl.nameOf(r.playerId);
          const sub = [r.position, r.role !== 'player' ? ROLE_LABEL[r.role] : null].filter(Boolean).join(' · ');
          return (
            <ListRow
              key={r.playerId}
              me={r.playerId === tl.myPlayerId}
              leading={<Jersey n={r.jersey} color={color} size="lg" />}
              title={name}
              subtitle={sub || undefined}
              onClick={readOnly ? undefined : () => setEditingId(r.playerId)}
              to={readOnly ? `${tl.base}/j/${r.playerId}` : undefined}
              ariaLabel={readOnly ? undefined : `Cambiar a ${name}`}
            />
          );
        })}
        {!readOnly && (
          <ListRow
            leading={
              <RowIcon tone="accent">
                <UserPlus className="size-5" />
              </RowIcon>
            }
            title={<span className="text-accent">Agregar jugador</span>}
            onClick={() => setAdding(true)}
          />
        )}
      </Card>
      {!readOnly && (
        <>
          <PlayerSheet
            key={editing?.playerId ?? 'nadie'}
            tl={tl}
            entry={editing}
            team={team}
            canRoles={canRoles}
            canRemove={!!editing && (canRoles || editing.role === 'player')}
            positions={positions}
            onClose={() => setEditingId(null)}
            onSave={(patch) => (editing ? save(editing, patch) : Promise.resolve(false))}
            onAskRemove={() => (editing ? askRemove(editing) : Promise.resolve(false))}
            onRemove={() => (editing ? remove(editing) : Promise.resolve(false))}
          />
          <AddPlayerSheet tl={tl} team={team} canCreate={canRoles} open={adding} onClose={() => setAdding(false)} />
        </>
      )}
    </>
  );
}

/** Un jugador de la plantilla: dorsal, posición y rol (admin), con «Guardar»; y sacarlo del equipo. */
function PlayerSheet({
  tl,
  entry,
  team,
  canRoles,
  canRemove,
  positions,
  onClose,
  onSave,
  onAskRemove,
  onRemove,
}: {
  tl: TeamLeague;
  entry: RosterEntry | null;
  team: SeasonTeam;
  canRoles: boolean;
  canRemove: boolean;
  positions: readonly string[];
  onClose: () => void;
  onSave: (patch: Partial<Pick<RosterEntry, 'jersey' | 'position' | 'role'>>) => Promise<boolean>;
  onAskRemove: () => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  // Lo que espera (guardar o sacarlo): la ruedita en ese botón y lo demás no se toca.
  const busy = useBusy<'guardar' | 'sacar'>();
  const [jersey, setJersey] = useState(entry?.jersey == null ? '' : String(entry.jersey));
  const [position, setPosition] = useState(entry?.position ?? '');
  const [role, setRole] = useState<TeamRole>(entry?.role ?? 'player');
  if (!entry) return <Sheet open={false} onClose={onClose} title="Jugador">{null}</Sheet>;
  const n = jersey.trim() === '' ? null : Number(jersey);
  const badJersey = n !== null && (!Number.isInteger(n) || n < 0 || n > 99);
  const posOptions = entry.position && !positions.includes(entry.position) ? [...positions, entry.position] : positions;
  const patch: Partial<Pick<RosterEntry, 'jersey' | 'position' | 'role'>> = {};
  if (!badJersey && n !== entry.jersey) patch.jersey = n;
  if ((position || null) !== (entry.position ?? null)) patch.position = position || null;
  if (canRoles && role !== entry.role) patch.role = role;
  const changed = Object.keys(patch).length > 0;
  const save = () =>
    busy.run('guardar', async () => {
      if (await onSave(patch)) onClose();
    });
  const remove = async () => {
    if (!(await onAskRemove())) return;
    await busy.run('sacar', async () => {
      if (await onRemove()) onClose();
    });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={tl.nameOf(entry.playerId)}
      subtitle={team.name}
      footer={
        <div className="flex gap-2.5">
          {canRemove && (
            <DangerButton loading={busy.isBusy('sacar')} disabled={busy.isBusy()} onClick={() => void remove()}>
              Sacar
            </DangerButton>
          )}
          <Button variant="primary" size="lg" className="flex-1" loading={busy.isBusy('guardar')} disabled={!changed || badJersey || busy.isBusy()} onClick={() => void save()}>
            Guardar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Dorsal" hint={badJersey ? 'De 0 a 99' : undefined}>
            <Input
              className="text-center font-bold tabular-nums"
              inputMode="numeric"
              placeholder="#"
              value={jersey}
              maxLength={2}
              disabled={busy.isBusy()}
              onChange={(e) => setJersey(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <Field label="Posición">
            <Select value={position} disabled={busy.isBusy()} onChange={(e) => setPosition(e.target.value)}>
              <option value="">Sin posición</option>
              {posOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {canRoles && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Rol en el equipo</span>
            <Segmented full label="Rol en el equipo" options={ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] }))} value={role} onChange={setRole} />
          </div>
        )}
        <Link to={`${tl.base}/j/${entry.playerId}`} className="inline-flex min-h-11 items-center gap-2 self-start text-meta font-[550] text-accent">
          <UserRound aria-hidden="true" className="size-4" />
          Ver su página
        </Link>
      </div>
    </Sheet>
  );
}

/** Agregar a la plantilla: un jugador de la liga o (admin) uno nuevo sin cuenta. */
function AddPlayerSheet({ tl, team, canCreate, open, onClose }: { tl: TeamLeague; team: SeasonTeam; canCreate: boolean; open: boolean; onClose: () => void }) {
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
    <Sheet open={open} onClose={onClose} title={`Agregar a ${team.name}`}>
      <div className="flex flex-col gap-3 pb-1">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input className="h-11 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la liga" aria-label="Buscar en la liga" />
        </div>
        <ul className="-mx-2 flex max-h-72 flex-col overflow-y-auto">
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={busy.isBusy()}
                onClick={() => void add(p.id)}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2 active:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-70"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold">{p.name}</span>
                  {(teamOfPlayer.has(p.id) || !p.uid) && (
                    <span className="block truncate text-[13px] text-muted">
                      {[teamOfPlayer.has(p.id) ? `En ${teamOfPlayer.get(p.id)}` : null, !p.uid ? 'Sin cuenta' : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                  <BusyIcon busy={busy.isBusy(p.id)} icon={<Plus className="size-5" strokeWidth={2.4} />} className="size-5" />
                </span>
                <span className="sr-only">Agregar</span>
              </button>
            </li>
          ))}
          {!list.length && <li className="px-2 py-3 text-meta text-muted">No hay jugadores con ese nombre en la liga.</li>}
        </ul>
        {canCreate && (
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-surface-2 p-4">
            <p className="text-[15px] font-semibold">¿No está en la liga? Créalo sin cuenta</p>
            <div className="flex gap-2">
              <Input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre y apellido" className="h-11" />
              <Button variant="primary" size="lg" loading={busy.isBusy('crear')} disabled={busy.isBusy() || !newName.trim()} onClick={() => void create()}>
                Crear
              </Button>
            </div>
            <p className="text-[13px] text-muted">Después lo vinculas con su cuenta en Jugadores y miembros.</p>
            {minor.fields}
          </div>
        )}
      </div>
    </Sheet>
  );
}

