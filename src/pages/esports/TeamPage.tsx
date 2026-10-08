import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowLeftRight, Crown, LogIn, LogOut, Pencil, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import {
  deleteTeam,
  esportsErrorText,
  leaveTeam,
  removeTeamMember,
  setTeamMemberRole,
  useEsportsTeam,
  useEsportsTournament,
  useTeamEntries,
  type EsportsEntry,
  type EsportsTeam,
  type EsportsTeamMember,
} from '../../lib/data/esports';
import { useGameIdsFor, type GameIdRecord } from '../../lib/data/esportsIds';
import { GAMES, formatLine, type GameId } from '../../sports/esports';
import { Avatar } from '../../components/Avatar';
import { EntryStatusChip, EsportsTint, GameMark, IdChip, RankChip, TeamLogo } from '../../components/esports/bits';
import { EventMenu, MoreButton, type MenuItem } from '../../components/event/EventHeader';
import { useFeedback } from '../../components/feedback';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { useIsPro } from '../../components/mode';
import { NoticeSlot } from '../../components/NoticeSlot';
import { DeadInvite } from '../../components/screens/InviteBits';
import { linkButton } from '../../components/screens/ScreenBits';
import { AppShell } from '../../components/Shell';
import { Badge, Button, Card, DateBlock, ListRow, ListSkeleton, LoadError, Loading, PageSkeleton, SectionHeader, cx } from '../../components/ui';
import { EditTeamSheet } from './teams/EditTeamSheet';
import { TeamInviteSheet } from './teams/TeamInviteSheet';
import { defaultRankKey, memberActions, membersText, roleChip, rosterSummary, sortMembers, teamMenu, toggleSubLabel, viewerRole, type TeamViewer } from './logic';

/**
 * Un equipo de esports (`/esports/equipo/:teamId`, §12.4): «‹ {juego}», el logo grande, el nombre, el tag, el juego y
 * la descripción; el capitán tiene «Invitar» (la hoja con el código, el QR y el link; `?invitar=1` la abre, como al
 * crear el equipo). Los miembros con su ID y su rango (el capitán toca uno para hacerlo suplente o titular, pasarle la
 * capitanía o sacarlo), los torneos del equipo y el menú «•••»: el capitán edita o borra el equipo; un miembro sale.
 */
export default function TeamPage() {
  const { teamId = '' } = useParams();
  const auth = useAuth();
  if (auth.loading) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }
  return (
    <AppShell>
      <EsportsTint>
        <TeamView teamId={teamId} uid={auth.user?.uid ?? null} />
      </EsportsTint>
    </AppShell>
  );
}

function TeamView({ teamId, uid }: { teamId: string; uid: string | null }) {
  const pro = useIsPro();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
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
  const inviting = params.get('invitar') === '1' && viewer === 'captain';

  const setInviting = (on: boolean) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (on) n.set('invitar', '1');
        else n.delete('invitar');
        return n;
      },
      { replace: true },
    );

  if (data.loading && !data.data) {
    return (
      <div className="flex flex-col px-2">
        <LeagueTopBar to="/esports" label="Esports" />
        <PageSkeleton />
      </div>
    );
  }
  if (data.error && !data.data) {
    return (
      <div className="flex flex-col px-2">
        <LeagueTopBar to="/esports" label="Esports" />
        <LoadError error={data.error} />
      </div>
    );
  }
  if (!team) {
    return (
      <div className="flex flex-col px-2">
        <LeagueTopBar to="/esports" label="Esports" />
        <DeadInvite
          icon={<Users />}
          title="Este equipo ya no existe"
          text="Lo borró su capitán o el link está mal."
          action={
            <Link to="/esports" className={linkButton('quiet', 'w-full')}>
              Ver esports
            </Link>
          }
        />
      </div>
    );
  }

  const meta = GAMES[team.game];
  const menuKeys = teamMenu(viewer);
  const live = entries.data.filter((e) => e.status === 'pending' || e.status === 'approved' || e.status === 'rejected');

  return (
    <div className="flex flex-col px-2">
      <LeagueTopBar to={`/esports/${team.game}`} label={meta.name} actions={menuKeys.length > 0 && <MoreButton onClick={() => setMenu(true)} />} />

      <header className="flex flex-col items-center text-center">
        <TeamLogo path={team.logoPath} name={team.name} tag={team.tag} className="size-24" />
        <h1 className={cx(pro ? 'text-title-pro' : 'text-title', 'mt-4 max-w-full break-words')}>{team.name}</h1>
        <p className="mt-0.5 text-body font-semibold tracking-[0.08em] text-fg-2">[{team.tag}]</p>
        <Link
          to={`/esports/${team.game}`}
          className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-meta font-semibold text-accent transition active:opacity-70 focus-visible:outline-2 focus-visible:outline-accent"
        >
          <GameMark game={team.game} size="sm" />
          {meta.name}
        </Link>
        {team.description && <p className="mt-1 max-w-md text-body break-words text-muted">{team.description}</p>}
      </header>

      {viewer === 'captain' && (
        <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-6 w-full" icon={<UserPlus className="size-5" />} onClick={() => setInviting(true)}>
          Invitar
        </Button>
      )}

      <NoticeSlot className="mt-5" />

      <section aria-labelledby="miembros" className="mt-[26px]">
        <SectionHeader id="miembros" title="Miembros" action={members.length > 0 ? <span className="text-meta text-muted">{rosterSummary(members)}</span> : undefined} />
        {!uid ? (
          <Card className="flex flex-col items-center gap-3 px-5 py-6 text-center">
            <p className="text-body text-muted">{membersText(team.memberCount)}. Entra a tu cuenta para ver quiénes juegan.</p>
            <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className={linkButton('quiet', 'w-full')}>
              <LogIn aria-hidden="true" className="size-5" />
              Entrar
            </Link>
          </Card>
        ) : members.length === 0 ? (
          <ListSkeleton rows={Math.min(5, Math.max(1, team.memberCount))} />
        ) : (
          <Card className="overflow-hidden">
            {members.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                game={team.game}
                record={idsByUser.get(m.userId) ?? null}
                me={m.userId === uid}
                dense={pro}
                onOpen={memberActions(viewer, m, uid).length ? () => setPicked(m) : undefined}
              />
            ))}
          </Card>
        )}
      </section>

      {live.length > 0 && (
        <section aria-labelledby="torneos-del-equipo" className="mt-[30px]">
          <SectionHeader id="torneos-del-equipo" title="Torneos del equipo" />
          <Card className="overflow-hidden">
            {live.map((e) => (
              <TeamEntryRow key={e.id} entry={e} game={team.game} dense={pro} />
            ))}
          </Card>
        </section>
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
    </div>
  );
}

function MemberRow({
  member,
  game,
  record,
  me,
  dense,
  onOpen,
}: {
  member: EsportsTeamMember;
  game: GameId;
  record: GameIdRecord | null;
  me: boolean;
  dense: boolean;
  onOpen?: () => void;
}) {
  const rank = record ? (record.ranks[defaultRankKey(game)] ?? null) : null;
  const chip = roleChip(member.role);
  return (
    <ListRow
      dense={dense}
      me={me}
      leading={<Avatar name={member.displayName} className="size-10 text-sm" />}
      title={me ? `${member.displayName} (tú)` : member.displayName}
      ariaLabel={onOpen ? `${member.displayName}: opciones` : undefined}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="break-all">{record?.idDisplay ?? 'Sin ID de juego'}</span>
          {record && rank && <RankChip game={game} rank={rank} source={record.rankSource} />}
        </span>
      }
      trailing={
        <div className="flex flex-col items-end gap-1">
          {chip && <Badge tone={member.role === 'captain' ? 'accent' : 'neutral'}>{chip}</Badge>}
          {record && <IdChip ownership={record.ownership} />}
        </div>
      }
      onClick={onOpen}
    />
  );
}

/** Un torneo del equipo: la fecha, el nombre (del torneo; si todavía no llega, el del inscrito) y el estado de la inscripción. */
function TeamEntryRow({ entry, game, dense }: { entry: EsportsEntry; game: GameId; dense: boolean }) {
  const t = useEsportsTournament(entry.eventId);
  const tour = t.data;
  return (
    <ListRow
      dense={dense}
      leading={tour ? <DateBlock date={tour.startsAt} /> : <GameMark game={game} size="md" />}
      title={tour?.name ?? entry.name}
      subtitle={tour ? formatLine(tour) : undefined}
      trailing={<EntryStatusChip status={entry.status} checkedIn={!!entry.checkedInAt} />}
      to={`/l/${entry.leagueId}`}
    />
  );
}

/** El menú «•••»: el capitán edita o borra el equipo; un miembro sale. */
function TeamMenu({ open, onClose, team, viewer, onEdit }: { open: boolean; onClose: () => void; team: EsportsTeam; viewer: TeamViewer; onEdit: () => void }) {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, ask: Parameters<typeof confirm>[0], fn: () => Promise<void>, done: string) {
    if (!(await confirm(ask))) return;
    setBusy(key);
    try {
      await fn();
      toast(done);
      onClose();
      navigate(`/esports/${team.game}`, { replace: true });
    } catch (e) {
      console.error(e);
      toast(esportsErrorText(e, team.game, 'equipo'), 'error');
    } finally {
      setBusy(null);
    }
  }

  const items: MenuItem[] = teamMenu(viewer).map((k): MenuItem => {
    if (k === 'edit') return { key: k, icon: Pencil, label: 'Editar equipo', hint: 'Nombre, tag, descripción y logo', onClick: onEdit };
    if (k === 'delete')
      return {
        key: k,
        icon: Trash2,
        label: 'Borrar equipo',
        danger: true,
        busy: busy === k,
        onClick: () =>
          void run(
            k,
            {
              title: `¿Borrar ${team.name}?`,
              message: 'Se borra para todos. Si está inscrito en torneos que no han empezado, se retira de ellos.',
              confirmText: 'Borrar equipo',
              danger: true,
            },
            () => deleteTeam(team.id),
            'Equipo borrado',
          ),
      };
    return {
      key: k,
      icon: LogOut,
      label: 'Salir del equipo',
      danger: true,
      busy: busy === k,
      onClick: () =>
        void run(
          k,
          { title: `¿Salir de ${team.name}?`, message: 'Para volver necesitas el link o el código del equipo.', confirmText: 'Salir', danger: true },
          () => leaveTeam(team.id),
          `Saliste de ${team.name}`,
        ),
    };
  });
  return <EventMenu open={open} onClose={onClose} title={team.name} items={items} />;
}

/** Lo que el capitán hace con un miembro: suplente o titular, pasarle la capitanía o sacarlo (con confirmación). */
function MemberSheet({
  member,
  team,
  viewer,
  uid,
  members,
  onClose,
}: {
  member: EsportsTeamMember | null;
  team: EsportsTeam;
  viewer: TeamViewer;
  uid: string | null;
  members: readonly EsportsTeamMember[];
  onClose: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const m = member;
  const actions = m ? memberActions(viewer, m, uid) : [];

  async function act(key: string, fn: () => Promise<void>, done: string, ask?: Parameters<typeof confirm>[0]) {
    if (ask && !(await confirm(ask))) return;
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

  const items: MenuItem[] = !m
    ? []
    : actions.map((k): MenuItem => {
        if (k === 'toggle_sub') {
          const to = m.role === 'sub' ? 'member' : 'sub';
          return {
            key: k,
            icon: ArrowLeftRight,
            label: toggleSubLabel(m.role),
            hint: rosterSummary(members),
            busy: busy === k,
            onClick: () => void act(k, () => setTeamMemberRole(team.id, m.userId, to), to === 'sub' ? `${m.displayName} quedó de suplente` : `${m.displayName} quedó de titular`),
          };
        }
        if (k === 'make_captain')
          return {
            key: k,
            icon: Crown,
            label: 'Pasar la capitanía',
            hint: 'Tú quedas como titular',
            busy: busy === k,
            onClick: () =>
              void act(k, () => setTeamMemberRole(team.id, m.userId, 'captain'), `${m.displayName} es el nuevo capitán`, {
                title: `¿Pasarle la capitanía a ${m.displayName}?`,
                message: 'Va a poder invitar, sacar gente, editar el equipo e inscribirlo en torneos. Tú quedas como titular.',
                confirmText: 'Pasar la capitanía',
              }),
          };
        return {
          key: k,
          icon: UserMinus,
          label: 'Sacar del equipo',
          danger: true,
          busy: busy === k,
          onClick: () =>
            void act(k, () => removeTeamMember(team.id, m.userId), `${m.displayName} ya no está en el equipo`, {
              title: `¿Sacar a ${m.displayName}?`,
              message: 'Puede volver a entrar si le mandas el link o el código.',
              confirmText: 'Sacar',
              danger: true,
            }),
        };
      });

  return <EventMenu open={!!m && items.length > 0} onClose={onClose} title={m?.displayName ?? ''} items={items} />;
}
