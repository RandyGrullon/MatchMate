/**
 * Un equipo de esports (`/esports/equipo/<id>`, TeamPage + teams/TeamInviteSheet + teams/EditTeamSheet de la web, con su
 * misma lógica: src/pages/esports/logic.ts) y entrar a uno con su link (`/esports/unirse/<código>`, JoinTeamPage). El
 * equipo: el logo, el nombre, el tag, el juego y la descripción; el capitán tiene «Invitar» (el código, el QR y el link;
 * `?invitar=1` la abre). Los miembros con su ID y su rango (el capitán: hacerlo suplente o titular, pasarle la capitanía
 * o sacarlo), los torneos del equipo y «•••»: el capitán edita (con el logo) o borra el equipo; un miembro sale.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeftRight, Copy, Crown, IdCard, LogOut, MoreHorizontal, Pencil, RefreshCw, Save, Share2, Ticket, Trash2, UserMinus, UserPlus, UserRound, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import {
  deleteTeam,
  esportsErrorText,
  joinTeam,
  leaveTeam,
  previewTeamCode,
  removeTeamLogo,
  removeTeamMember,
  renewTeamCode,
  setTeamMemberRole,
  teamJoinUrl,
  teamShareText,
  updateTeam,
  uploadTeamLogo,
  useEsportsTeam,
  useEsportsTournament,
  useMyEsportsTeams,
  useTeamEntries,
  useTeamInviteCode,
  type EsportsEntry,
  type EsportsTeam,
  type EsportsTeamMember,
  type TeamPreview,
} from '@mm/lib/data/esports';
import { useGameIdsFor, useMyGameIds, type GameIdRecord } from '@mm/lib/data/esportsIds';
import { logoErrorText } from '@mm/lib/logos';
import { shareOrigin } from '@mm/lib/origin';
import { GAMES, formatLine, type GameId } from '@mm/sports/esports';
import {
  cleanTag,
  defaultRankKey,
  idWord,
  joinState,
  memberActions,
  memberProfileTarget,
  membersText,
  myIdLink,
  roleChip,
  rosterSummary,
  sortMembers,
  teamFormErrors,
  teamMenu,
  teamPatch,
  teamTitle,
  toggleSubLabel,
  viewerRole,
  type TeamForm,
  type TeamViewer,
} from '@mm/pages/esports/logic';
import { DateBlock } from '../DateBlock';
import { QrCode } from '../invite/QrCode';
import { Avatar } from '../social/Avatar';
import { confirmAsync, toast } from '../feedback';
import { BackBar, Badge, Button, Card, Empty, Field, Input, LoadError, Loading, SectionHeader, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { EntryStatusChip, GameMark, IdChip, RankChip, TeamLogo } from './bits';
import { TeamLogoField, type PickedLogo } from './TeamLogoField';
import { SignInCard } from './EsportsIndex';
import { MenuRow, RichRow, RowText } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const go = (href: string) => router.push(href as Href);

/** El perfil de un miembro en la app: el tuyo es Yo. */
function openProfile(userId: string, me: boolean) {
  const t = memberProfileTarget(userId, me);
  if (t.kind === 'me') router.navigate('/yo');
  else router.push({ pathname: '/u/[userId]', params: { userId: t.userId } });
}

export function TeamScreen({ teamId }: { teamId: string }) {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  return <TeamView teamId={teamId} uid={auth.user?.uid ?? null} />;
}

function TeamView({ teamId, uid }: { teamId: string; uid: string | null }) {
  const c = useColors();
  const params = useLocalSearchParams<{ invitar?: string }>();
  const data = useEsportsTeam(teamId);
  const team = data.data?.team ?? null;
  const members = useMemo(() => sortMembers(data.data?.members ?? []), [data.data]);
  const memberIds = useMemo(() => members.map((m) => m.userId), [members]);
  const ids = useGameIdsFor(memberIds, team?.game ?? null);
  const entries = useTeamEntries(teamId);
  const viewer = viewerRole(members, uid);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<EsportsTeamMember | null>(null);
  const idsByUser = useMemo(() => new Map(ids.data.map((r) => [r.userId, r] as const)), [ids.data]);
  const inviting = params.invitar === '1' && viewer === 'captain';
  const setInviting = (on: boolean) => router.setParams({ invitar: on ? '1' : undefined });

  if (data.loading && !data.data) {
    return (
      <View style={{ gap: 16 }}>
        <BackBar label="Esports" fallback="/esports" />
        <Loading label="Cargando el equipo" />
      </View>
    );
  }
  if (data.error && !data.data) {
    return (
      <View style={{ gap: 16 }}>
        <BackBar label="Esports" fallback="/esports" />
        <LoadError error={data.error} />
      </View>
    );
  }
  if (!team) {
    return (
      <View style={{ gap: 16 }}>
        <BackBar label="Esports" fallback="/esports" />
        <Empty
          icon={<Users size={28} color={c.accent} />}
          title="Este equipo ya no existe"
          text="Lo borró su capitán o el link está mal."
          action={<Button onPress={() => router.navigate('/esports' as Href)}>Ver esports</Button>}
        />
      </View>
    );
  }

  const meta = GAMES[team.game];
  const menuKeys = teamMenu(viewer);
  const live = entries.data.filter((e) => e.status === 'pending' || e.status === 'approved' || e.status === 'rejected');

  return (
    <View style={{ gap: 20 }}>
      <BackBar
        label={meta.name}
        fallback={`/esports/${team.game}`}
        right={
          menuKeys.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={6} onPress={() => setMenu(true)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <MoreHorizontal size={22} color={c.fg} />
            </Pressable>
          ) : undefined
        }
      />

      <View style={{ alignItems: 'center', gap: 2 }}>
        <TeamLogo path={team.logoPath} name={team.name} tag={team.tag} size={96} />
        <Txt variant="title" style={{ textAlign: 'center', marginTop: 16 }}>
          {team.name}
        </Txt>
        <Txt tone="fg2" style={{ fontFamily: font.semibold, letterSpacing: 1.2 }}>{`[${team.tag}]`}</Txt>
        <Pressable accessibilityRole="link" onPress={() => go(`/esports/${team.game}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 8 }}>
          <GameMark game={team.game} size="sm" />
          <Txt tone="accent" variant="meta" style={{ fontFamily: font.semibold }}>
            {meta.name}
          </Txt>
        </Pressable>
        {!!team.description && (
          <Txt tone="muted" style={{ textAlign: 'center' }}>
            {team.description}
          </Txt>
        )}
      </View>

      {viewer === 'captain' && (
        <Button variant="primary" size="xl" full icon={<UserPlus size={20} color={c.accentFg} />} onPress={() => setInviting(true)}>
          Invitar
        </Button>
      )}

      <View style={{ gap: 10 }}>
        <SectionHeader
          title="Miembros"
          action={
            members.length > 0 ? (
              <Txt variant="meta" tone="muted">
                {rosterSummary(members)}
              </Txt>
            ) : undefined
          }
        />
        {!uid ? (
          <Card style={{ alignItems: 'center', gap: 12 }}>
            <Txt tone="muted" style={{ textAlign: 'center' }}>{`${membersText(team.memberCount)}. Entra a tu cuenta para ver quiénes juegan.`}</Txt>
            <Button full onPress={() => router.push('/login')}>
              Entrar
            </Button>
          </Card>
        ) : members.length === 0 ? (
          <Loading label="Cargando los miembros" />
        ) : (
          <Card padded={false}>
            {members.map((m, i) => (
              <View key={m.userId} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                <MemberRow member={m} game={team.game} record={idsByUser.get(m.userId) ?? null} me={m.userId === uid} onOpen={memberActions(viewer, m, uid).length ? () => setPicked(m) : undefined} />
              </View>
            ))}
          </Card>
        )}
      </View>

      {live.length > 0 && (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Torneos del equipo" />
          <Card padded={false}>
            {live.map((e, i) => (
              <View key={e.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                <TeamEntryRow entry={e} game={team.game} />
              </View>
            ))}
          </Card>
        </View>
      )}

      <TeamMenu
        open={menu}
        onClose={() => setMenu(false)}
        team={team}
        viewer={viewer}
        onEdit={() => {
          setMenu(false);
          setEditing(true);
        }}
      />
      <MemberSheet member={picked} team={team} viewer={viewer} uid={uid} members={members} onClose={() => setPicked(null)} />
      {viewer === 'captain' && (
        <>
          <TeamInviteSheet open={inviting} onClose={() => setInviting(false)} team={team} />
          <EditTeamSheet open={editing} onClose={() => setEditing(false)} team={team} />
        </>
      )}
    </View>
  );
}

function MemberRow({ member, game, record, me, onOpen }: { member: EsportsTeamMember; game: GameId; record: GameIdRecord | null; me: boolean; onOpen?: () => void }) {
  const rank = record ? (record.ranks[defaultRankKey(game)] ?? null) : null;
  const chip = roleChip(member.role);
  return (
    <RichRow
      me={me}
      icon={<Avatar name={member.displayName} size={40} />}
      title={me ? `${member.displayName} (tú)` : member.displayName}
      accessibilityLabel={onOpen ? `${member.displayName}: opciones` : undefined}
      subtitle={
        <>
          <RowText>{record?.idDisplay ?? 'Sin ID de juego'}</RowText>
          {record && rank && <RankChip game={game} rank={rank} source={record.rankSource} />}
        </>
      }
      right={
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {chip && <Badge tone={member.role === 'captain' ? 'accent' : 'muted'}>{chip}</Badge>}
          {record && <IdChip ownership={record.ownership} />}
        </View>
      }
      // Sin opciones del capitán, tocar la fila abre su perfil (el tuyo, Yo); con opciones, la hoja trae «Ver perfil».
      onPress={onOpen ?? (() => openProfile(member.userId, me))}
    />
  );
}

/** Un torneo del equipo: la fecha, el nombre (del torneo; si todavía no llega, el del inscrito) y el estado de la inscripción. */
function TeamEntryRow({ entry, game }: { entry: EsportsEntry; game: GameId }) {
  const t = useEsportsTournament(entry.eventId);
  const tour = t.data;
  return (
    <RichRow
      icon={tour ? <DateBlock date={tour.startsAt} /> : <GameMark game={game} size="md" />}
      title={tour?.name ?? entry.name}
      subtitle={tour ? <RowText>{formatLine(tour)}</RowText> : undefined}
      right={<EntryStatusChip status={entry.status} checkedIn={!!entry.checkedInAt} />}
      onPress={() => router.push({ pathname: '/l/[lid]', params: { lid: entry.leagueId } })}
    />
  );
}

/** El menú «•••»: el capitán edita o borra el equipo; un miembro sale. */
function TeamMenu({ open, onClose, team, viewer, onEdit }: { open: boolean; onClose: () => void; team: EsportsTeam; viewer: TeamViewer; onEdit: () => void }) {
  const c = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, ask: { title: string; message: string; confirmText: string; danger?: boolean }, fn: () => Promise<void>, done: string) {
    if (!(await confirmAsync(ask))) return;
    setBusy(key);
    try {
      await fn();
      toast(done);
      onClose();
      router.replace(`/esports/${team.game}` as Href);
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, team.game, 'equipo'), 'error');
    } finally {
      setBusy(null);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title={team.name}>
      {teamMenu(viewer).map((k) => {
        if (k === 'edit') return <MenuRow key={k} icon={<Pencil size={20} color={c.fg2} />} label="Editar equipo" hint="Nombre, tag, descripción y logo" onPress={onEdit} />;
        if (k === 'delete')
          return (
            <MenuRow
              key={k}
              danger
              disabled={busy !== null}
              icon={<Trash2 size={20} color={c.danger} />}
              label="Borrar equipo"
              onPress={() =>
                void run(
                  k,
                  { title: `¿Borrar ${team.name}?`, message: 'Se borra para todos. Si está inscrito en torneos que no han empezado, se retira de ellos.', confirmText: 'Borrar equipo', danger: true },
                  () => deleteTeam(team.id),
                  'Equipo borrado',
                )
              }
            />
          );
        return (
          <MenuRow
            key={k}
            danger
            disabled={busy !== null}
            icon={<LogOut size={20} color={c.danger} />}
            label="Salir del equipo"
            onPress={() =>
              void run(k, { title: `¿Salir de ${team.name}?`, message: 'Para volver necesitas el link o el código del equipo.', confirmText: 'Salir', danger: true }, () => leaveTeam(team.id), `Saliste de ${team.name}`)
            }
          />
        );
      })}
    </Sheet>
  );
}

/** Lo que el capitán hace con un miembro: suplente o titular, pasarle la capitanía o sacarlo (con confirmación). */
function MemberSheet({ member: m, team, viewer, uid, members, onClose }: { member: EsportsTeamMember | null; team: EsportsTeam; viewer: TeamViewer; uid: string | null; members: readonly EsportsTeamMember[]; onClose: () => void }) {
  const c = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  const actions = m ? memberActions(viewer, m, uid) : [];
  async function act(key: string, fn: () => Promise<void>, done: string, ask?: { title: string; message: string; confirmText: string; danger?: boolean }) {
    if (ask && !(await confirmAsync(ask))) return;
    setBusy(key);
    try {
      await fn();
      toast(done);
      onClose();
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, team.game, 'equipo'), 'error');
    } finally {
      setBusy(null);
    }
  }
  return (
    <Sheet open={!!m} onClose={onClose} title={m?.displayName ?? ''}>
      {m && (
        <>
          {/* Primero su perfil de la app (todo lo suyo); después lo del capitán. */}
          <MenuRow
            icon={<UserRound size={20} color={c.fg2} />}
            label="Ver perfil"
            hint="Sus ligas, equipos y publicaciones"
            onPress={() => {
              onClose();
              openProfile(m.userId, m.userId === uid);
            }}
          />
          {actions.map((k) => {
            if (k === 'toggle_sub') {
              const to = m.role === 'sub' ? 'member' : 'sub';
              return (
                <MenuRow
                  key={k}
                  disabled={busy !== null}
                  icon={<ArrowLeftRight size={20} color={c.fg2} />}
                  label={toggleSubLabel(m.role)}
                  hint={rosterSummary(members)}
                  onPress={() => void act(k, () => setTeamMemberRole(team.id, m.userId, to), to === 'sub' ? `${m.displayName} quedó de suplente` : `${m.displayName} quedó de titular`)}
                />
              );
            }
            if (k === 'make_captain')
              return (
                <MenuRow
                  key={k}
                  disabled={busy !== null}
                  icon={<Crown size={20} color={c.fg2} />}
                  label="Pasar la capitanía"
                  hint="Tú quedas como titular"
                  onPress={() =>
                    void act(k, () => setTeamMemberRole(team.id, m.userId, 'captain'), `${m.displayName} es el nuevo capitán`, {
                      title: `¿Pasarle la capitanía a ${m.displayName}?`,
                      message: 'Va a poder invitar, sacar gente, editar el equipo e inscribirlo en torneos. Tú quedas como titular.',
                      confirmText: 'Pasar la capitanía',
                    })
                  }
                />
              );
            return (
              <MenuRow
                key={k}
                danger
                disabled={busy !== null}
                icon={<UserMinus size={20} color={c.danger} />}
                label="Sacar del equipo"
                onPress={() =>
                  void act(k, () => removeTeamMember(team.id, m.userId), `${m.displayName} ya no está en el equipo`, {
                    title: `¿Sacar a ${m.displayName}?`,
                    message: 'Puede volver a entrar si le mandas el link o el código.',
                    confirmText: 'Sacar',
                    danger: true,
                  })
                }
              />
            );
          })}
        </>
      )}
    </Sheet>
  );
}

/**
 * «Invitar» al equipo (el capitán): el código grande, el QR del link (`/esports/unirse/<código>`), compartirlo o
 * copiar el código, y «Cambiar código» (el de ahora deja de servir).
 */
function TeamInviteSheet({ open, onClose, team }: { open: boolean; onClose: () => void; team: EsportsTeam }) {
  return (
    <Sheet open={open} onClose={onClose} title="Invitar al equipo" subtitle={team.name}>
      {open && <InviteBody team={team} />}
    </Sheet>
  );
}

function InviteBody({ team }: { team: EsportsTeam }) {
  const c = useColors();
  const code = useTeamInviteCode(team.id, true);
  const [renewed, setRenewed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = renewed ?? code.data;
  // Con el dominio de la app: es el link que abre la app en el teléfono de quien lo recibe.
  const url = current ? teamJoinUrl(shareOrigin(null), current) : null;
  async function renew() {
    const ok = await confirmAsync({ title: '¿Cambiar el código?', message: 'El link y el código de ahora dejan de servir. Quien ya está en el equipo sigue igual.', confirmText: 'Cambiar código' });
    if (!ok) return;
    setBusy(true);
    try {
      setRenewed(await renewTeamCode(team.id));
      toast('Código nuevo listo');
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, team.game, 'equipo'), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ alignItems: 'center', gap: 20 }}>
      <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
        Quien entre con el link o el código se suma al equipo. Necesita su ID del juego.
      </Txt>
      {current && url ? (
        <>
          <View style={{ borderRadius: 24, backgroundColor: '#ffffff', padding: 8 }}>
            <QrCode value={url} size={176} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
              Código del equipo
            </Txt>
            <Txt selectable accessibilityLabel={`Código ${current.split('').join(' ')}`} style={{ fontSize: 28, lineHeight: 34, fontFamily: font.bold, letterSpacing: 4 }}>
              {current}
            </Txt>
          </View>
        </>
      ) : code.loading ? (
        <LogoSpinner size={36} label="Cargando el código" />
      ) : (
        <Txt variant="meta" tone="muted">
          No se pudo leer el código. Cierra y vuelve a abrir.
        </Txt>
      )}
      <View style={{ alignSelf: 'stretch', gap: 8 }}>
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
          Manda el link por WhatsApp o donde quieras.
        </Txt>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            full
            disabled={!url}
            icon={<Share2 size={18} color={c.fg} />}
            style={{ flex: 1 }}
            onPress={async () => {
              if (!url) return;
              try {
                await Share.share({ message: `${teamShareText(team)}\n${url}`, url });
              } catch {
                toast('No se pudo compartir.', 'error');
              }
            }}
          >
            Compartir link
          </Button>
          <Button
            full
            disabled={!current}
            icon={<Copy size={18} color={c.fg} />}
            style={{ flex: 1 }}
            onPress={async () => {
              if (!current) return;
              await Clipboard.setStringAsync(current);
              toast('Código copiado');
            }}
          >
            Copiar código
          </Button>
        </View>
      </View>
      <Button full loading={busy} disabled={!current} icon={<RefreshCw size={16} color={c.fg} />} onPress={renew}>
        Cambiar código
      </Button>
    </View>
  );
}

/** «Editar equipo» (el capitán): nombre, tag, descripción y logo. Guarda solo lo que cambió (`updateTeam`) y el logo aparte. */
function EditTeamSheet({ open, onClose, team }: { open: boolean; onClose: () => void; team: EsportsTeam }) {
  return (
    <Sheet open={open} onClose={onClose} title="Editar equipo" subtitle={team.name}>
      {open && <EditTeamBody team={team} onDone={onClose} />}
    </Sheet>
  );
}

function EditTeamBody({ team, onDone }: { team: EsportsTeam; onDone: () => void }) {
  const c = useColors();
  const [form, setForm] = useState<TeamForm>({ name: team.name, tag: team.tag, description: team.description ?? '' });
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const errors = teamFormErrors(form);
  const patch = teamPatch(team, form);
  const logoChange = !!logo || (logoRemoved && !!team.logoPath);
  const ok = Object.keys(errors).length === 0;
  async function save() {
    if (!ok || busy) return;
    if (!patch && !logoChange) return onDone();
    setBusy(true);
    try {
      if (patch) await updateTeam(team.id, patch);
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, team.game, 'equipo'), 'error');
      setBusy(false);
      return;
    }
    try {
      if (logo) await uploadTeamLogo(team.id, logo.logo);
      else if (logoRemoved && team.logoPath) await removeTeamLogo(team.id);
    } catch (e) {
      console.warn('[logo del equipo]', e);
      toast(logoErrorText(e), 'error');
      setBusy(false);
      return;
    }
    toast('Equipo guardado');
    setBusy(false);
    onDone();
  }
  return (
    <View style={{ gap: 16 }}>
      <Field label="Nombre del equipo" hint={errors.name} error={!!errors.name}>
        <Input maxLength={40} value={form.name} invalid={!!errors.name} onChangeText={(name) => setForm((f) => ({ ...f, name }))} />
      </Field>
      <Field label="Tag" hint={errors.tag ?? 'De 2 a 5 letras o números.'} error={!!errors.tag}>
        <Input maxLength={5} autoCapitalize="characters" value={form.tag} invalid={!!errors.tag} style={{ fontFamily: font.semibold, letterSpacing: 1.2 }} onChangeText={(v) => setForm((f) => ({ ...f, tag: cleanTag(v) }))} />
      </Field>
      <Field label="Descripción (opcional)" hint={errors.description} error={!!errors.description}>
        <Input multiline maxLength={200} value={form.description} onChangeText={(description) => setForm((f) => ({ ...f, description }))} style={{ height: 80, paddingTop: 14, textAlignVertical: 'top' }} />
      </Field>
      <TeamLogoField value={logo} onChange={setLogo} name={form.name || team.name} tag={form.tag || team.tag} current={team.logoPath} removed={logoRemoved} onRemove={setLogoRemoved} />
      <Button variant="primary" size="xl" full loading={busy} disabled={!ok} icon={<Save size={20} color={c.accentFg} />} onPress={save}>
        Guardar
      </Button>
    </View>
  );
}

/**
 * Entrar a un equipo con su link o QR (`/esports/unirse/<código>`): el logo, «Te invitaron al equipo», «{nombre} [TAG]»,
 * el juego y cuántos son. Sin cuenta: crear cuenta o entrar. Sin su ID del juego: «Primero pon tu ID de {juego}» (vuelve
 * aquí al guardarlo). Con todo: «Unirme al equipo». Si ya estás, directo al equipo. Un código malo: «Esta invitación no
 * sirve».
 */
export function JoinTeamScreen({ code }: { code: string }) {
  const auth = useAuth();
  // undefined = leyendo; null = no sirve. Lo de otro código no cuenta (leyendo).
  const [result, setResult] = useState<{ code: string; preview: TeamPreview | null } | null>(null);
  useEffect(() => {
    let alive = true;
    previewTeamCode(code)
      .then((p) => alive && setResult({ code, preview: p }))
      .catch((e: unknown) => {
        console.warn('[equipo por código]', e);
        if (alive) setResult({ code, preview: null });
      });
    return () => {
      alive = false;
    };
  }, [code]);
  const preview = result?.code === code ? result.preview : undefined;
  return <JoinTeamView code={code} preview={auth.loading ? undefined : preview} uid={auth.user?.uid ?? null} />;
}

function JoinTeamView({ code, preview, uid }: { code: string; preview: TeamPreview | null | undefined; uid: string | null }) {
  const c = useColors();
  const ids = useMyGameIds(uid);
  const teams = useMyEsportsTeams(uid);
  const [busy, setBusy] = useState(false);
  const myTeamIds = useMemo(() => new Set(teams.data.map((t) => t.id)), [teams.data]);
  const loading = !!uid && ((ids.loading && !ids.data.length) || (teams.loading && !teams.data.length));
  const state = joinState({ preview, signedIn: !!uid, loading, myTeamIds, ids: ids.data });
  const teamId = preview?.teamId;

  useEffect(() => {
    if (state === 'member' && teamId) router.replace({ pathname: '/esports/equipo/[teamId]', params: { teamId } } as never);
  }, [state, teamId]);

  if (state === 'loading' || state === 'member') return <Loading label="Buscando la invitación" />;
  if (state === 'dead' || !preview) {
    return (
      <View style={{ gap: 16 }}>
        <BackBar label="Esports" fallback="/esports" />
        <Empty
          icon={<Ticket size={28} color={c.accent} />}
          title="Esta invitación no sirve"
          text="El código no existe o lo cambiaron. Pídele el link nuevo al capitán del equipo."
          action={<Button onPress={() => router.navigate('/esports' as Href)}>Ver esports</Button>}
        />
      </View>
    );
  }

  const meta = GAMES[preview.game];
  const here = `/esports/unirse/${encodeURIComponent(code)}`;
  async function join() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const r = await joinTeam(code);
      if (!r) {
        toast('Ese código ya no sirve. Pídele el link nuevo al capitán.', 'error');
        setBusy(false);
        return;
      }
      toast(`¡Bienvenido a ${preview.name}!`);
      router.replace({ pathname: '/esports/equipo/[teamId]', params: { teamId: r.teamId } } as never);
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, preview.game, 'equipo'), 'error');
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 24 }}>
      <BackBar label="Esports" fallback="/esports" />
      <View style={{ alignItems: 'center', gap: 4 }}>
        <TeamLogo path={preview.logoPath} name={preview.name} tag={preview.tag} size={96} />
        <Txt variant="meta" tone="muted" style={{ marginTop: 16 }}>
          Te invitaron al equipo
        </Txt>
        <Txt variant="title" style={{ textAlign: 'center' }}>
          {teamTitle(preview)}
        </Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GameMark game={preview.game} size="sm" />
          <Txt tone="fg2" style={{ fontFamily: font.semibold }}>
            {meta.name}
          </Txt>
        </View>
        <Txt variant="meta" tone="muted">
          {membersText(preview.memberCount)}
        </Txt>
      </View>

      {state === 'signin' && (
        <SignInCard
          icon={<Users size={28} color={c.accent} />}
          title="Entra para unirte al equipo"
          text={`Con tu cuenta y tu ${idWord(meta.idInfo.label)} entras al equipo y te inscribes en sus torneos.`}
          createLabel="Crear cuenta y unirme"
          loginLabel="Ya tengo cuenta"
        />
      )}

      {state === 'need_id' && (
        <Card style={{ alignItems: 'center', gap: 8, paddingTop: 28 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <IdCard size={28} color={c.accent} />
          </View>
          <Txt variant="cardTitle" style={{ textAlign: 'center', marginTop: 8 }}>{`Primero pon tu ID de ${meta.name}`}</Txt>
          <Txt tone="muted" style={{ textAlign: 'center' }}>{`El equipo ve tu ${idWord(meta.idInfo.label)} y tu rango. Al guardarlo vuelves aquí para unirte.`}</Txt>
          <View style={{ alignSelf: 'stretch', marginTop: 16 }}>
            <Button variant="primary" size="xl" full onPress={() => go(myIdLink(preview.game, here))}>
              Poner mi ID
            </Button>
          </View>
        </Card>
      )}

      {state === 'ready' && (
        <Button variant="primary" size="xl" full loading={busy} onPress={join} icon={<UserPlus size={20} color={c.accentFg} />}>
          Unirme al equipo
        </Button>
      )}
    </View>
  );
}
