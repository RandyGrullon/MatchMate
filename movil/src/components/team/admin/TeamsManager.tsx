/**
 * Equipos de temporada y sus plantillas en la app (TeamsManager.tsx de la web, con su lógica: teamsAdmin.ts): los
 * equipos como filas (escudo, nombre y quién es el capitán) y cada uno abre su hoja con la plantilla; cada jugador abre
 * la suya (dorsal, posición y rol, o sacarlo). El admin maneja todo; el capitán o delegado, la plantilla de su equipo
 * (sin cambiar roles ni sacar a otro capitán o delegado). Los jugadores sin cuenta los crea el admin.
 *
 * En el teléfono va una hoja a la vez: la del jugador, la de agregar y la de «Nombre y color» se abren en lugar de la
 * del equipo y, al cerrarlas, vuelve la del equipo.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Palette, Plus, Search, Trash2, UserPlus, UserRound } from 'lucide-react-native';
import { createPlayer } from '@mm/lib/data/players';
import { createSeasonTeam, deleteSeasonTeam, nextFreeJersey, removeTeamPlayer, setTeamPlayer, updateSeasonTeam, type RosterEntry, type SeasonTeam, type TeamRole } from '@mm/lib/data/seasonTeams';
import { saveErrorMessage } from '@mm/lib/errorText';
import { TEAM_PALETTE, teamColor } from '@mm/pages/sports/team/logic';
import { addableLine, addablePlayers, ROLE_LABEL, ROLES, rosterEdit, rosterError, rosterSubtitle, teamLine, validTeamName, type RosterPatch } from '@mm/pages/sports/team/teamsAdmin';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { useBusy } from '@/components/bowlingTeams/parts';
import { confirmAsync, toast } from '@/components/feedback';
import { PickField } from '@/components/players/fields';
import { Button, Card, Field, Input, SectionHeader, Segmented, Sheet, Txt } from '@/components/ui';
import { LogoSpinner } from '@/components/Logo';
import { DangerButton, Jersey, TeamCrest } from '../TeamBits';
import { act, Row, ToneIcon, useQuickMinor } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** La hoja que está abierta (una a la vez). */
type Open = { kind: 'team'; teamId: string } | { kind: 'player'; teamId: string; playerId: string } | { kind: 'add'; teamId: string } | { kind: 'form'; teamId: string | null } | null;

/** Organizar › Equipos: todos los equipos como filas; cada uno abre su hoja con la plantilla. */
export function TeamsManager({ tl, positions, sportWord = 'equipo' }: { tl: TeamLeague; positions: readonly string[]; sportWord?: string }) {
  const c = useColors();
  const [open, setOpen] = useState<Open>(null);
  const teams = tl.teams;
  // La hoja sigue al equipo de la caché (la plantilla cambia mientras está abierta).
  const team = open && open.kind !== 'form' ? (teams.data.find((t) => t.id === open.teamId) ?? null) : null;
  const formTeam = open?.kind === 'form' && open.teamId ? (teams.data.find((t) => t.id === open.teamId) ?? null) : null;
  // Al cerrar la hoja de un jugador, la de agregar o la de «Nombre y color» de un equipo, vuelve la del equipo.
  const backToTeam = () => setOpen(open?.teamId ? { kind: 'team', teamId: open.teamId } : null);
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title={`Equipos (${teams.data.length})`}
        action={
          teams.data.length > 0 ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setOpen({ kind: 'form', teamId: null })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
              <Plus size={18} strokeWidth={2.4} color={c.accent} />
              <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
                {`Nuevo ${sportWord}`}
              </Txt>
            </Pressable>
          ) : undefined
        }
      />
      {teams.loading && !teams.data.length ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <LogoSpinner size={32} label="Cargando los equipos" />
        </View>
      ) : !teams.data.length ? (
        <Card style={{ gap: 16 }}>
          <View style={{ gap: 4 }}>
            <Txt variant="cardTitle">Todavía no hay equipos</Txt>
            <Txt variant="meta" tone="muted">
              Cada equipo con su color y su plantilla con dorsales.
            </Txt>
          </View>
          <Button variant="primary" size="lg" icon={<Plus size={20} color={c.accentFg} />} onPress={() => setOpen({ kind: 'form', teamId: null })}>
            {`Crear el primer ${sportWord}`}
          </Button>
        </Card>
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {teams.data.map((t, i) => (
            <Row key={t.id} top={i === 0} leading={<TeamCrest team={t} />} title={t.name} subtitle={teamLine(tl, t)} onPress={() => setOpen({ kind: 'team', teamId: t.id })} accessibilityLabel={`${t.name}: plantilla`} />
          ))}
        </Card>
      )}

      <Sheet open={open?.kind === 'team' && !!team} onClose={() => setOpen(null)} title={team?.name ?? 'Equipo'} subtitle={team ? teamLine(tl, team) : undefined}>
        {open?.kind === 'team' && team && (
          <>
            <RosterList tl={tl} team={team} onPlayer={(playerId) => setOpen({ kind: 'player', teamId: team.id, playerId })} onAdd={() => setOpen({ kind: 'add', teamId: team.id })} flat />
            <Card padded={false} style={{ overflow: 'hidden', borderWidth: 1, borderColor: c.line, shadowOpacity: 0, elevation: 0 }}>
              <Row top leading={<ToneIcon icon={Palette} accent />} title="Nombre y color" subtitle="O borrar el equipo" onPress={() => setOpen({ kind: 'form', teamId: team.id })} />
            </Card>
          </>
        )}
      </Sheet>
      {open?.kind === 'player' && team && (
        <RosterPlayerSheet key={open.playerId} tl={tl} team={team} playerId={open.playerId} canRoles positions={positions} onClose={backToTeam} />
      )}
      {open?.kind === 'add' && team && <AddPlayerSheet tl={tl} team={team} canCreate onClose={backToTeam} />}
      {open?.kind === 'form' && (
        <TeamForm
          key={open.teamId ?? 'nuevo'}
          tl={tl}
          team={formTeam}
          onClose={backToTeam}
          onDeleted={() => setOpen(null)}
        />
      )}
    </View>
  );
}

/** Nombre y color del equipo (crear o cambiar); borrar. Los 10 colores de la paleta (en el teléfono no hay «Otro color»). */
function TeamForm({ tl, team, onClose, onDeleted }: { tl: TeamLeague; team: SeasonTeam | null; onClose: () => void; onDeleted: () => void }) {
  const c = useColors();
  const [name, setName] = useState(team?.name ?? '');
  const [color, setColor] = useState(team ? teamColor(team) : TEAM_PALETTE[tl.teams.data.length % TEAM_PALETTE.length]);
  const busy = useBusy<'guardar' | 'borrar'>();
  const valid = validTeamName(name);
  const save = async () => {
    const ok = await busy.run('guardar', () =>
      act(async () => {
        if (team) await updateSeasonTeam(tl.lid, team.id, { name: name.trim(), color });
        else await createSeasonTeam(tl.lid, { name: name.trim(), color });
        return true;
      }, team ? 'Equipo guardado' : 'Equipo creado'),
    );
    if (ok) onClose();
  };
  const remove = async () => {
    if (!team) return;
    const yes = await confirmAsync({
      title: `¿Borrar ${team.name}?`,
      message: 'Sus partidos se quedan con el nombre, pero ya no cuenta en la tabla como equipo. Esto no se puede deshacer.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!yes) return;
    const ok = await busy.run('borrar', () =>
      act(async () => {
        await deleteSeasonTeam(tl.lid, team.id);
        return true;
      }, 'Equipo borrado'),
    );
    if (ok) onDeleted();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={team ? 'Nombre y color' : 'Nuevo equipo'}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {team && <DangerButton icon={<Trash2 size={20} color={c.danger} />} loading={busy.isBusy('borrar')} disabled={busy.isBusy()} onPress={() => void remove()} accessibilityLabel={`Borrar ${team.name}`} />}
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" full loading={busy.isBusy('guardar')} disabled={!valid || busy.isBusy()} onPress={() => void save()}>
              {team ? 'Guardar' : 'Crear equipo'}
            </Button>
          </View>
        </View>
      }
    >
      <Field label="Nombre">
        <Input value={name} maxLength={60} onChangeText={setName} placeholder="Tigres del Ensanche" autoFocus accessibilityLabel="Nombre" />
      </Field>
      <Field label="Color de la camiseta">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {TEAM_PALETTE.map((hex) => (
            <Pressable
              key={hex}
              accessibilityRole="radio"
              accessibilityLabel={`Color ${hex}`}
              accessibilityState={{ selected: color === hex }}
              onPress={() => setColor(hex)}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: hex, borderWidth: color === hex ? 3 : 1, borderColor: color === hex ? c.fg : 'rgba(0,0,0,0.1)' }}
            />
          ))}
        </View>
      </Field>
    </Sheet>
  );
}

/**
 * La plantilla de un equipo como filas: el dorsal en el color del equipo, el nombre (con su rol) y la posición. Quien la
 * maneja toca un jugador para cambiarlo (`onPlayer`) y tiene «Agregar jugador» al final (`onAdd`); con `readOnly`, cada
 * jugador va a su página. `flat`: dentro de una hoja (con contorno en vez de sombra).
 */
export function RosterList({ tl, team, onPlayer, onAdd, readOnly, flat }: { tl: TeamLeague; team: SeasonTeam; onPlayer?: (playerId: string) => void; onAdd?: () => void; readOnly?: boolean; flat?: boolean }) {
  const c = useColors();
  const color = teamColor(team);
  return (
    <Card padded={false} style={[{ overflow: 'hidden' }, flat ? { borderWidth: 1, borderColor: c.line, shadowOpacity: 0, elevation: 0 } : null]}>
      {!team.roster.length && (
        <Txt variant="meta" tone="muted" style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
          La plantilla está vacía.
        </Txt>
      )}
      {team.roster.map((r, i) => {
        const name = tl.nameOf(r.playerId);
        return (
          <Row
            key={r.playerId}
            top={i === 0}
            me={r.playerId === tl.myPlayerId}
            leading={<Jersey n={r.jersey} color={color} size="lg" />}
            title={name}
            subtitle={rosterSubtitle(r) || undefined}
            onPress={readOnly ? () => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid: tl.lid, playerId: r.playerId } }) : onPlayer ? () => onPlayer(r.playerId) : undefined}
            accessibilityLabel={readOnly ? undefined : `Cambiar a ${name}`}
          />
        );
      })}
      {!readOnly && onAdd && (
        <Row
          top={!team.roster.length}
          leading={<ToneIcon icon={UserPlus} accent />}
          title={
            <Txt variant="bodyStrong" tone="accent">
              Agregar jugador
            </Txt>
          }
          onPress={onAdd}
          accessibilityLabel="Agregar jugador"
        />
      )}
    </Card>
  );
}

/**
 * La plantilla con sus hojas, para quien la maneja fuera de Organizar (el capitán o delegado de su equipo): `canRoles`
 * = admin (roles, sacar a cualquiera y crear jugadores sin cuenta).
 */
export function RosterEditor({ tl, team, canRoles, positions, readOnly, flat }: { tl: TeamLeague; team: SeasonTeam; canRoles: boolean; positions: readonly string[]; readOnly?: boolean; flat?: boolean }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <RosterList tl={tl} team={team} readOnly={readOnly} flat={flat} onPlayer={setPlayerId} onAdd={() => setAdding(true)} />
      {!readOnly && playerId && <RosterPlayerSheet key={playerId} tl={tl} team={team} playerId={playerId} canRoles={canRoles} positions={positions} onClose={() => setPlayerId(null)} />}
      {!readOnly && adding && <AddPlayerSheet tl={tl} team={team} canCreate={canRoles} onClose={() => setAdding(false)} />}
    </>
  );
}

/** Un jugador de la plantilla: dorsal, posición y rol (admin), con «Guardar»; y sacarlo del equipo. */
function RosterPlayerSheet({ tl, team, playerId, canRoles, positions, onClose }: { tl: TeamLeague; team: SeasonTeam; playerId: string; canRoles: boolean; positions: readonly string[]; onClose: () => void }) {
  const c = useColors();
  const entry: RosterEntry | null = team.roster.find((r) => r.playerId === playerId) ?? null;
  // Lo que espera (guardar o sacarlo): la ruedita en ese botón y lo demás no se toca.
  const busy = useBusy<'guardar' | 'sacar'>();
  const [jersey, setJersey] = useState(entry?.jersey == null ? '' : String(entry.jersey));
  const [position, setPosition] = useState(entry?.position ?? '');
  const [role, setRole] = useState<TeamRole>(entry?.role ?? 'player');
  if (!entry) return null;
  const canRemove = canRoles || entry.role === 'player';
  const { patch, badJersey, posOptions, changed } = rosterEdit(entry, { jersey, position, role }, canRoles, positions);
  const name = tl.nameOf(entry.playerId);
  const save = (p: RosterPatch) =>
    busy.run('guardar', async () => {
      try {
        await setTeamPlayer(tl.lid, team.id, {
          playerId: entry.playerId,
          jersey: p.jersey !== undefined ? p.jersey : entry.jersey,
          position: p.position !== undefined ? p.position : entry.position,
          ...(canRoles && p.role ? { role: p.role } : {}),
        });
        onClose();
      } catch (e) {
        toast(rosterError(e), 'error');
      }
    });
  const remove = async () => {
    const yes = await confirmAsync({ title: `¿Sacar a ${name} de ${team.name}?`, message: 'Sus partidos jugados se quedan.', confirmText: 'Sacar', danger: true });
    if (!yes) return;
    await busy.run('sacar', async () => {
      try {
        await removeTeamPlayer(tl.lid, team.id, entry.playerId);
        toast('Jugador fuera de la plantilla');
        onClose();
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
      }
    });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={name}
      subtitle={team.name}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {canRemove && (
            <DangerButton loading={busy.isBusy('sacar')} disabled={busy.isBusy()} onPress={() => void remove()}>
              Sacar
            </DangerButton>
          )}
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" full loading={busy.isBusy('guardar')} disabled={!changed || badJersey || busy.isBusy()} onPress={() => void save(patch)}>
              Guardar
            </Button>
          </View>
        </View>
      }
    >
      <Field label="Dorsal" hint={badJersey ? 'De 0 a 99' : undefined} error={badJersey}>
        <Input
          keyboardType="number-pad"
          placeholder="#"
          value={jersey}
          maxLength={2}
          editable={!busy.isBusy()}
          onChangeText={(t) => setJersey(t.replace(/\D/g, ''))}
          accessibilityLabel="Dorsal"
          style={{ width: 96, textAlign: 'center', fontFamily: font.bold }}
        />
      </Field>
      <Field label="Posición">
        <PickField label="Posición" options={[{ key: '', label: 'Sin posición' }, ...posOptions.map((p) => ({ key: p, label: p }))]} value={position} onChange={setPosition} disabled={busy.isBusy()} />
      </Field>
      {canRoles && (
        <View style={{ gap: 6 }}>
          <Txt variant="small" tone="muted">
            Rol en el equipo
          </Txt>
          <Segmented<TeamRole> label="Rol en el equipo" options={ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r] }))} value={role} onChange={setRole} />
        </View>
      )}
      <Pressable
        accessibilityRole="link"
        onPress={() => {
          onClose();
          router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid: tl.lid, playerId: entry.playerId } });
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start' }}
      >
        <UserRound size={16} color={c.accent} />
        <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
          Ver su página
        </Txt>
      </Pressable>
    </Sheet>
  );
}

/** Agregar a la plantilla: un jugador de la liga o (admin) uno nuevo sin cuenta. */
function AddPlayerSheet({ tl, team, canCreate, onClose }: { tl: TeamLeague; team: SeasonTeam; canCreate: boolean; onClose: () => void }) {
  const c = useColors();
  const [q, setQ] = useState('');
  const [newName, setNewName] = useState('');
  // Qué se está agregando (el id del jugador o «crear»): solo ese muestra la ruedita.
  const busy = useBusy();
  // Liga con menores: «Es menor de edad» y su tutor debajo del nombre.
  const minor = useQuickMinor(canCreate && !!newName.trim());
  const { list, teamOf } = addablePlayers(tl.players.data, team, tl.teams.data, q);
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
    <Sheet open onClose={onClose} title={`Agregar a ${team.name}`}>
      <View style={{ justifyContent: 'center' }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: 14, zIndex: 1 }}>
          <Search size={16} color={c.muted} />
        </View>
        <Input value={q} onChangeText={setQ} placeholder="Buscar en la liga" accessibilityLabel="Buscar en la liga" style={{ height: 44, paddingLeft: 38, fontSize: 16 }} />
      </View>
      <View>
        {list.map((p) => {
          const line = addableLine(p, teamOf);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`Agregar a ${p.name}`}
              disabled={busy.isBusy()}
              onPress={() => void add(p.id)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: pressed ? c.surface2 : 'transparent', opacity: busy.isBusy() && !busy.isBusy(p.id) ? 0.7 : 1 })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {p.name}
                </Txt>
                {!!line && (
                  <Txt variant="small" tone="muted" numberOfLines={1}>
                    {line}
                  </Txt>
                )}
              </View>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
                {busy.isBusy(p.id) ? <ActivityIndicator size="small" color={c.accent} /> : <Plus size={20} strokeWidth={2.4} color={c.accent} />}
              </View>
            </Pressable>
          );
        })}
        {!list.length && (
          <Txt variant="meta" tone="muted" style={{ paddingHorizontal: 8, paddingVertical: 12 }}>
            No hay jugadores con ese nombre en la liga.
          </Txt>
        )}
      </View>
      {canCreate && (
        <View style={{ gap: 10, borderRadius: 20, padding: 16, backgroundColor: c.surface2 }}>
          <Txt style={{ fontSize: 15, fontFamily: font.semibold }}>¿No está en la liga? Créalo sin cuenta</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Input value={newName} maxLength={60} onChangeText={setNewName} placeholder="Nombre y apellido" accessibilityLabel="Nombre y apellido" style={{ height: 48, backgroundColor: c.surface }} />
            </View>
            <Button variant="primary" size="lg" loading={busy.isBusy('crear')} disabled={busy.isBusy() || !newName.trim()} onPress={() => void create()}>
              Crear
            </Button>
          </View>
          <Txt variant="small" tone="muted">
            Después lo vinculas con su cuenta en Jugadores y miembros.
          </Txt>
          {minor.fields}
        </View>
      )}
    </Sheet>
  );
}
