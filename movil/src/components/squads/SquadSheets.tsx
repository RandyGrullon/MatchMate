/**
 * Las hojas de la página de un equipo (las de src/pages/squads de la web, con su misma lógica: logic.ts y
 * squadForm.ts): el menú «•••» (editar, logo, salir y borrar), «Editar equipo», «Logo del equipo», «Inscribir en una
 * liga», lo del capitán con alguien de la plantilla y los seguidores. Antes de ir a otra pantalla, la hoja se cierra.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Crown, ImageUp, LogOut, Pencil, Save, Search, Send, Trash2, UserMinus, UserRound, Users } from 'lucide-react-native';
import { useLeagueSearch } from '@mm/lib/data/leagueSocial';
import {
  deleteSquad,
  leaveSquad,
  removeSquadLogo,
  removeSquadMember,
  requestSquadLeague,
  setSquadMember,
  squadErrorText,
  squadProblem,
  updateSquad,
  uploadSquadLogo,
  useSquadFollowers,
  type SquadMember,
  type SquadPage,
} from '@mm/lib/data/squads';
import { logoErrorText } from '@mm/lib/logos';
import { sportMeta } from '@mm/sports/registry';
import { useMyLeagues } from '@mm/components/home/activity';
import { leagueResultLine } from '@mm/components/search/searchFormat';
import { atUsername } from '@mm/components/social/socialFormat';
import {
  POSITION_MAX,
  leagueChoices,
  memberActions,
  memberEdit,
  memberErrorText,
  ownSquadLeagues,
  requestErrorText,
  squadAsk,
  takenLeagues,
  type SquadLeagueChoice,
  type SquadMenuKey,
  type SquadViewer,
} from '@mm/components/squads/logic';
import { squadFormOf, squadPatchOf, type SquadForm } from '@mm/pages/squads/squadForm';
import { MenuRow } from '../esports/inputs';
import { Avatar } from '../social/Avatar';
import { FollowButton } from '../social/People';
import { confirmAsync, toast } from '../feedback';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, ListRow, LoadError, Loading, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { LeagueMark } from './bits';
import { SquadFields, SquadLogoField } from './fields';
import type { PickedLogo } from './logo';
import { openProfile } from './SquadTabs';

const line = (i: number, color: string) => (i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color } : null);

/** Cierra la hoja y después va (un Modal abierto se quedaría encima de la pantalla nueva). */
const closeThen = (close: () => void, go: () => void) => {
  close();
  setTimeout(go, 0);
};

// ---------- Menú «•••» ----------

export function SquadMenu({ open, onClose, squad, keys, onOpen }: { open: boolean; onClose: () => void; squad: SquadPage; keys: readonly SquadMenuKey[]; onOpen: (k: 'edit' | 'logo') => void }) {
  const c = useColors();
  const [busy, setBusy] = useState<SquadMenuKey | null>(null);
  const captain = squad.myRole === 'captain';

  async function run(key: SquadMenuKey, ask: Parameters<typeof confirmAsync>[0], fn: () => Promise<void>, done: string, after?: () => void) {
    if (!(await confirmAsync(ask))) return;
    setBusy(key);
    try {
      await fn();
      toast(done);
      onClose();
      if (after) setTimeout(after, 0);
    } catch (e) {
      console.error(e);
      toast(squadErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={squad.name}>
      {keys.map((k) => {
        if (k === 'edit') return <MenuRow key={k} icon={<Pencil size={20} color={c.fg2} />} label="Editar equipo" hint="Nombre, tag, ciudad, color y más" onPress={() => onOpen('edit')} />;
        if (k === 'logo') return <MenuRow key={k} icon={<ImageUp size={20} color={c.fg2} />} label="Logo" hint={squad.logo ? 'Cambiarlo o quitarlo' : 'Ponle el escudo del equipo'} onPress={() => onOpen('logo')} />;
        if (k === 'delete')
          return (
            <MenuRow
              key={k}
              danger
              disabled={busy !== null}
              icon={<Trash2 size={20} color={c.danger} />}
              label="Borrar equipo"
              onPress={() => void run(k, squadAsk.delete(squad.name), () => deleteSquad(squad.id), 'Equipo borrado', () => router.replace('/equipos' as Href))}
            />
          );
        // Salir: el capitán con más gente primero pasa la capitanía.
        if (captain)
          return (
            <MenuRow
              key={k}
              danger
              icon={<LogOut size={20} color={c.danger} />}
              label="Salir del equipo"
              hint="Primero pásale la capitanía a alguien"
              onPress={() => toast('Primero pásale la capitanía a alguien: en la plantilla, toca «•••» en su fila.', 'error')}
            />
          );
        return (
          <MenuRow
            key={k}
            danger
            disabled={busy !== null}
            icon={<LogOut size={20} color={c.danger} />}
            label="Salir del equipo"
            onPress={() => void run(k, squadAsk.leave(squad.name), () => leaveSquad(squad.id), `Saliste de ${squad.name}`)}
          />
        );
      })}
    </Sheet>
  );
}

// ---------- Editar ----------

/** «Editar equipo» (el capitán): nombre, tag, ciudad, color, descripción y «Busca jugadores». Guarda solo lo que cambió. El deporte no se cambia. */
export function EditSquadSheet({ open, onClose, squad }: { open: boolean; onClose: () => void; squad: SquadPage }) {
  return (
    <Sheet open={open} onClose={onClose} title="Editar equipo" subtitle={squad.name}>
      {open && <EditBody squad={squad} onDone={onClose} />}
    </Sheet>
  );
}

function EditBody({ squad, onDone }: { squad: SquadPage; onDone: () => void }) {
  const c = useColors();
  const [form, setForm] = useState<SquadForm>(() => squadFormOf(squad));
  const [busy, setBusy] = useState(false);
  const problem = squadProblem(form);
  const patch = squadPatchOf(squad, form);

  async function save() {
    if (problem || busy) return;
    if (!patch) return onDone();
    setBusy(true);
    try {
      await updateSquad(squad.id, patch);
      toast('Equipo guardado');
      onDone();
    } catch (e) {
      console.error(e);
      toast(squadErrorText(e), 'error');
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <SquadFields form={form} sport={squad.sport} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
      {problem && <ErrorNote>{problem}</ErrorNote>}
      <Button variant="primary" size="xl" full loading={busy} disabled={!!problem} icon={<Save size={20} color={c.accentFg} />} onPress={save}>
        Guardar
      </Button>
    </View>
  );
}

// ---------- Logo ----------

/** «Logo del equipo» (el capitán): elegir la imagen (se recorta al cuadrado), «Quitar» el de ahora y «Guardar». */
export function SquadLogoSheet({ open, onClose, squad }: { open: boolean; onClose: () => void; squad: SquadPage }) {
  return (
    <Sheet open={open} onClose={onClose} title="Logo del equipo" subtitle={squad.name}>
      {open && <LogoBody squad={squad} onDone={onClose} />}
    </Sheet>
  );
}

function LogoBody({ squad, onDone }: { squad: SquadPage; onDone: () => void }) {
  const c = useColors();
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const change = !!logo || (removed && !!squad.logo);

  async function save() {
    if (busy) return;
    if (!change) return onDone();
    setBusy(true);
    try {
      if (logo) await uploadSquadLogo(squad.id, logo.logo);
      else await removeSquadLogo(squad.id);
      toast(logo ? 'Logo guardado' : 'Logo quitado');
      onDone();
    } catch (e) {
      console.warn('[logo del equipo]', e);
      toast(logoErrorText(e), 'error');
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <SquadLogoField value={logo} onChange={setLogo} squad={squad} removed={removed} onRemove={setRemoved} />
      <Button variant="primary" size="xl" full loading={busy} disabled={!change} icon={<Save size={20} color={c.accentFg} />} onPress={save}>
        Guardar
      </Button>
    </View>
  );
}

// ---------- Inscribir en una liga ----------

/**
 * «Inscribir en una liga» (el capitán): buscar la liga por nombre o lugar (solo las de su deporte, públicas o de las
 * que ya es miembro); sin buscar, sus ligas de ese deporte. «Pedir» manda la solicitud (con confirmación).
 */
export function SquadLeagueSheet({ open, onClose, squad }: { open: boolean; onClose: () => void; squad: SquadPage }) {
  return (
    <Sheet open={open} onClose={onClose} title="Inscribir en una liga" subtitle={squad.name}>
      {open && <LeagueBody squad={squad} onDone={onClose} />}
    </Sheet>
  );
}

function LeagueBody({ squad, onDone }: { squad: SquadPage; onDone: () => void }) {
  const c = useColors();
  const [query, setQuery] = useState('');
  const search = useLeagueSearch(query);
  const mine = useMyLeagues(null);
  const [busy, setBusy] = useState<string | null>(null);
  const taken = useMemo(() => takenLeagues(squad.leagues), [squad.leagues]);
  const lower = sportMeta(squad.sport)?.lower ?? 'este deporte';
  const searching = query.trim().length >= 2;
  const own = useMemo(() => ownSquadLeagues(mine.all, squad.sport), [mine.all, squad.sport]);
  const results = useMemo<SquadLeagueChoice[]>(() => leagueChoices(search.data, squad.sport), [search.data, squad.sport]);
  const list = searching ? results : own;

  async function ask(l: SquadLeagueChoice) {
    if (!(await confirmAsync(squadAsk.request(l.name, squad.members)))) return;
    setBusy(l.id);
    try {
      await requestSquadLeague(squad.id, l.id);
      toast(`Listo: le avisamos a ${l.name}`);
      onDone();
    } catch (e) {
      console.error(e);
      toast(requestErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Search size={18} color={c.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }} />
        <Input
          accessibilityLabel="Buscar ligas"
          value={query}
          onChangeText={(v) => setQuery(v.slice(0, 60))}
          placeholder="Nombre de la liga o lugar"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, height: 48, paddingLeft: 42 }}
        />
      </View>
      <Txt variant="meta" tone="muted">{`Solo ligas de ${lower}, públicas o donde ya juegas. La liga tiene que aceptar al equipo.`}</Txt>

      {!searching && <Txt variant="bodyStrong" style={{ marginHorizontal: 4 }}>{`Tus ligas de ${lower}`}</Txt>}
      {searching && search.loading && !results.length ? (
        <Loading label="Buscando ligas" />
      ) : list.length ? (
        <Card padded={false}>
          {list.map((l, i) => {
            const status = taken.get(l.id);
            return (
              <View key={l.id} style={line(i, c.line)}>
                <ListRow
                  icon={<LeagueMark sport={l.sport} logo={l.logo} />}
                  title={l.name}
                  subtitle={leagueResultLine({ ...l, isFollowing: false, isMember: !!l.isMember }) || null}
                  chevron={false}
                  right={
                    status ? (
                      <Badge tone={status === 'approved' ? 'ok' : 'warn'}>{status === 'approved' ? 'Ya está' : 'Pendiente'}</Badge>
                    ) : (
                      <Button variant="soft" loading={busy === l.id} disabled={busy !== null} icon={<Send size={16} color={c.accent} />} onPress={() => ask(l)}>
                        Pedir
                      </Button>
                    )
                  }
                  onPress={() => closeThen(onDone, () => router.push({ pathname: '/l/[lid]', params: { lid: l.id } }))}
                />
              </View>
            );
          })}
        </Card>
      ) : (
        <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
          {searching ? `Ninguna liga de ${lower} con «${query.trim()}».` : `Todavía no estás en ninguna liga de ${lower}. Búscala arriba por su nombre o lugar.`}
        </Txt>
      )}
    </View>
  );
}

// ---------- Alguien de la plantilla ----------

/**
 * Lo que el capitán hace con alguien de la plantilla (tocando «•••» en su fila): la posición y el número (también los
 * suyos), pasarle la capitanía y sacarlo del equipo (los dos con confirmación). Arriba, su cara y «Ver perfil».
 */
export function SquadMemberSheet({ member, squad, viewer, onClose }: { member: SquadMember | null; squad: SquadPage; viewer: SquadViewer; onClose: () => void }) {
  return (
    <Sheet open={!!member} onClose={onClose} title={member ? (member.isMe ? `${member.name} (tú)` : member.name) : ''} subtitle={member?.username ? `@${member.username}` : undefined}>
      {member && <MemberBody key={member.id} member={member} squad={squad} viewer={viewer} onDone={onClose} />}
    </Sheet>
  );
}

function MemberBody({ member: m, squad, viewer, onDone }: { member: SquadMember; squad: SquadPage; viewer: SquadViewer; onDone: () => void }) {
  const c = useColors();
  const [busy, setBusy] = useState<'guardar' | 'capitan' | 'sacar' | null>(null);
  const [position, setPosition] = useState(m.position ?? '');
  const [jersey, setJersey] = useState(m.jersey != null ? String(m.jersey) : '');
  const actions = memberActions(viewer, m);
  const edit = memberEdit(m, position, jersey);

  async function run(key: 'guardar' | 'capitan' | 'sacar', fn: () => Promise<void>, done: string) {
    setBusy(key);
    try {
      await fn();
      toast(done);
      onDone();
    } catch (e) {
      console.error(e);
      toast(memberErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!edit.changed || edit.badJersey) return;
    await run('guardar', () => setSquadMember(squad.id, m.id, { position: position.trim() || null, jersey: edit.jersey }), 'Listo');
  }

  async function makeCaptain() {
    if (await confirmAsync(squadAsk.makeCaptain(m.name))) await run('capitan', () => setSquadMember(squad.id, m.id, { role: 'captain' }), `${m.name} es el nuevo capitán`);
  }

  async function remove() {
    if (await confirmAsync(squadAsk.remove(m.name))) await run('sacar', () => removeSquadMember(squad.id, m.id), `${m.name} ya no está en el equipo`);
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={m.name} photo={m.avatar} size={48} />
        <Pressable accessibilityRole="link" onPress={() => closeThen(onDone, () => openProfile(m.id, m.isMe))} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
          <UserRound size={16} color={c.accent} />
          <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
            Ver perfil
          </Txt>
        </Pressable>
      </View>

      {actions.includes('edit') && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Field label="Posición">
                <Input accessibilityLabel="Posición" maxLength={POSITION_MAX} value={position} placeholder="Portero, base, delantero…" onChangeText={setPosition} />
              </Field>
            </View>
            <View style={{ width: 96 }}>
              <Field label="Número">
                <Input
                  accessibilityLabel="Número"
                  keyboardType="number-pad"
                  maxLength={2}
                  value={jersey}
                  placeholder="10"
                  invalid={edit.badJersey}
                  style={{ textAlign: 'center' }}
                  onChangeText={(v) => setJersey(v.replace(/\D/g, '').slice(0, 2))}
                />
              </Field>
            </View>
          </View>
          {edit.badJersey && (
            <Txt variant="small" tone="danger">
              El número va de 0 a 99.
            </Txt>
          )}
          <Button full loading={busy === 'guardar'} disabled={!edit.changed || edit.badJersey || busy !== null} icon={<Save size={16} color={c.fg} />} onPress={save}>
            Guardar posición y número
          </Button>
        </View>
      )}

      {actions.includes('make_captain') && (
        <MenuRow icon={<Crown size={20} color={c.fg2} />} label="Pasar la capitanía" hint="Tú sigues en el equipo" disabled={busy !== null} onPress={() => void makeCaptain()} />
      )}
      {actions.includes('remove') && <MenuRow danger icon={<UserMinus size={20} color={c.danger} />} label="Sacar del equipo" disabled={busy !== null} onPress={() => void remove()} />}
    </View>
  );
}

// ---------- Seguidores ----------

/** Quiénes siguen al equipo (también sin cuenta), cada uno con su perfil y su botón de seguir. Por páginas de 30. */
export function SquadFollowersSheet({ squad, open, onClose }: { squad: Pick<SquadPage, 'id' | 'name'>; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Seguidores de ${squad.name}`}>
      {open && <FollowersList squadId={squad.id} onPick={onClose} />}
    </Sheet>
  );
}

function FollowersList({ squadId, onPick }: { squadId: string; onPick: () => void }) {
  const c = useColors();
  const list = useSquadFollowers(squadId);
  if (list.loading && !list.data.length) return <Loading label="Cargando los seguidores" />;
  if (list.error && !list.data.length) return <LoadError error={list.error} onRetry={list.refresh} />;
  if (!list.data.length) return <Empty icon={<Users size={28} color={c.accent} />} title="Todavía nadie sigue a este equipo" text="Cuando alguien lo siga, sale aquí." />;
  return (
    <View style={{ gap: 12 }}>
      <View accessibilityLabel="Seguidores">
        {list.data.map((p) => {
          const name = p.name.trim() || 'Alguien';
          return (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <Pressable accessibilityRole="link" accessibilityLabel={`Perfil de ${name}`} onPress={() => closeThen(onPick, () => openProfile(p.id, !!p.isMe))} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Avatar name={name} photo={p.avatar} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {p.isMe ? `${name} (tú)` : name}
                  </Txt>
                  {!!atUsername(p.username) && (
                    <Txt variant="meta" tone="muted" numberOfLines={1}>
                      {`${atUsername(p.username)}${p.followsYou && !p.isMe ? ' · Te sigue' : ''}`}
                    </Txt>
                  )}
                </View>
              </Pressable>
              {!p.isMe && <FollowButton userId={p.id} isFollowing={p.isFollowing} followsYou={p.followsYou} name={name} />}
            </View>
          );
        })}
      </View>
      {list.moreError && (
        <Txt variant="meta" tone="danger" style={{ textAlign: 'center' }}>
          No se pudieron cargar más. Intenta de nuevo.
        </Txt>
      )}
      {list.hasMore && (
        <Button loading={list.loadingMore} onPress={() => list.loadMore()} style={{ alignSelf: 'center' }}>
          Ver más
        </Button>
      )}
    </View>
  );
}
