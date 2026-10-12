import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { Crown, ImageUp, LogOut, Newspaper, Pencil, Send, Shield, Trash2, Trophy, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useSquadPosts } from '../../lib/data/posts';
import {
  deleteSquad,
  leaveSquad,
  recordText,
  squadErrorText,
  syncSquadRoster,
  useSquad,
  withdrawSquadRequest,
  type SquadLeague,
  type SquadMember,
  type SquadPage as SquadData,
} from '../../lib/data/squads';
import { useIsPro } from '../../lib/useMode';
import { sportMeta } from '../../sports/registry';
import { Avatar } from '../../components/Avatar';
import { useBusy } from '../../components/busy';
import { EventMenu, MoreButton, type MenuItem } from '../../components/event/EventHeader';
import { useFeedback } from '../../components/feedback';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { LeagueTile } from '../../components/ligas/LigasRows';
import { ComposerCard } from '../../components/posts/Composer';
import { PostList } from '../../components/posts/PostList';
import { DeadInvite } from '../../components/screens/InviteBits';
import { SignInCard, linkButton } from '../../components/screens/ScreenBits';
import { Quiet } from '../../components/search/SearchRows';
import { AppShell } from '../../components/Shell';
import { userPath } from '../../components/social/UserLink';
import {
  LEAGUE_STATUS_TEXT,
  SQUAD_TABS,
  canEnterLeagues,
  leaguesSoonText,
  memberLine,
  requestErrorText,
  shownLeagues,
  sortRoster,
  squadMenu,
  squadTab,
  squadViewer,
  syncErrorText,
  syncText,
  type SquadMenuKey,
  type SquadTab,
  type SquadViewer,
} from '../../components/squads/logic';
import { LeagueStatusBadge, RowWithActions, SquadLogo, SquadTint } from '../../components/squads/SquadBits';
import { SquadFollowButton } from '../../components/squads/SquadFollowButton';
import { Badge, Button, Card, ListRow, ListSkeleton, LoadError, Loading, PageSkeleton, SectionHeader, Segmented, cx } from '../../components/ui';
import { SportIcon } from '../sports/SportBits';
import { EditSquadSheet, SquadLogoSheet } from './EditSquadSheet';
import { SquadInviteSheet } from './SquadInviteSheet';
import { SquadLeagueSheet } from './SquadLeagueSheet';
import { SquadMemberSheet } from './SquadMemberSheet';

/**
 * Un equipo (`/equipos/:squadId`): arriba, en su color, el logo (o el tag en un círculo), el nombre, el tag, el
 * deporte, la ciudad, «Busca jugadores» y miembros · seguidores · récord. Quien no es miembro lo sigue; el capitán
 * invita (la hoja con el código, el link, el QR y compartir; `?invitar=1` la abre, como al crear el equipo). «•••»:
 * editar, logo, salir y borrar (el capitán) o salir (un miembro). Pestañas (`?tab=`): Plantilla (el capitán toca a
 * alguien para su posición y número, la capitanía o sacarlo), Muro (publican los miembros) y Ligas (inscribirlo en una
 * liga de su deporte: fútbol, futsal o baloncesto). Sin cuenta: lo de arriba y entrar para ver la plantilla.
 */
export default function SquadPage() {
  const { squadId = '' } = useParams();
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
      <SquadView id={squadId} uid={auth.user?.uid ?? null} />
    </AppShell>
  );
}

function TopBar({ actions }: { actions?: ReactNode }) {
  return <LeagueTopBar to="/equipos" label="Equipos" actions={actions} />;
}

export function SquadView({ id, uid }: { id: string; uid: string | null }) {
  const pro = useIsPro();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const data = useSquad(id);
  const squad = data.data;
  const viewer = squadViewer(squad);
  const tab = squadTab(params.get('tab'));
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'edit' | 'logo' | 'liga' | null>(null);
  const [picked, setPicked] = useState<SquadMember | null>(null);
  const inviting = params.get('invitar') === '1' && viewer === 'captain';
  const createdCode = (location.state as { inviteCode?: string } | null)?.inviteCode ?? null;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (value) n.set(key, value);
        else n.delete(key);
        return n;
      },
      { replace: true },
    );

  if (data.loading && !squad) {
    return (
      <div className="flex flex-col px-2">
        <TopBar />
        <PageSkeleton />
      </div>
    );
  }
  if (data.error && !squad) {
    return (
      <div className="flex flex-col px-2">
        <TopBar />
        <LoadError error={data.error} />
      </div>
    );
  }
  if (!squad) {
    return (
      <div className="flex flex-col px-2">
        <TopBar />
        <DeadInvite
          icon={<Shield />}
          title="Este equipo ya no existe"
          text="Lo borró su capitán o el link está mal."
          action={
            <Link to="/equipos" className={linkButton('quiet', 'w-full')}>
              Ver equipos
            </Link>
          }
        />
      </div>
    );
  }

  const menuKeys = squadMenu(viewer, squad.members);

  return (
    <SquadTint color={squad.color} sport={squad.sport}>
      <div className="flex flex-col px-2">
        <TopBar actions={menuKeys.length > 0 && <MoreButton onClick={() => setMenu(true)} />} />
        <SquadHero squad={squad} pro={pro} />

        {viewer === 'captain' ? (
          <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-5 w-full" icon={<UserPlus className="size-5" />} onClick={() => setParam('invitar', '1')}>
            Invitar
          </Button>
        ) : viewer === 'none' ? (
          <SquadFollowButton squadId={squad.id} name={squad.name} following={squad.isFollowing} className="mt-5 h-12! w-full text-base" />
        ) : null}

        {!uid ? (
          <SignInCard
            className="mt-6"
            icon={<Users />}
            title="Entra para ver la plantilla"
            text="Con tu cuenta ves quiénes juegan, su muro y en qué ligas está el equipo."
            next={encodeURIComponent(location.pathname + location.search)}
          />
        ) : (
          <>
            <Segmented<SquadTab>
              options={SQUAD_TABS}
              value={tab}
              onChange={(t) => setParam('tab', t === 'plantilla' ? null : t)}
              label="Qué ver del equipo"
              full
              className="mt-6"
            />
            <div className="mt-5">
              {tab === 'plantilla' ? (
                <Roster squad={squad} viewer={viewer} pro={pro} onPick={setPicked} />
              ) : tab === 'muro' ? (
                <Wall squad={squad} viewer={viewer} />
              ) : (
                <Leagues squad={squad} viewer={viewer} pro={pro} onRequest={() => setSheet('liga')} />
              )}
            </div>
          </>
        )}

        <SquadMenu
          open={menu}
          onClose={() => setMenu(false)}
          squad={squad}
          keys={menuKeys}
          onOpen={(k) => {
            setMenu(false);
            setSheet(k);
          }}
        />
        {viewer === 'captain' && (
          <>
            <SquadInviteSheet open={inviting} onClose={() => setParam('invitar', null)} squad={squad} code={createdCode} />
            <EditSquadSheet open={sheet === 'edit'} onClose={() => setSheet(null)} squad={squad} />
            <SquadLogoSheet open={sheet === 'logo'} onClose={() => setSheet(null)} squad={squad} />
            <SquadLeagueSheet open={sheet === 'liga'} onClose={() => setSheet(null)} squad={squad} />
            <SquadMemberSheet member={picked} squad={squad} viewer={viewer} onClose={() => setPicked(null)} />
          </>
        )}
      </div>
    </SquadTint>
  );
}

/** Lo de arriba, en el color del equipo. */
function SquadHero({ squad, pro }: { squad: SquadData; pro: boolean }) {
  const meta = sportMeta(squad.sport);
  const record = recordText(squad.record);
  return (
    <header className="mt-1 flex flex-col items-center rounded-[28px] bg-accent-soft px-5 pt-7 pb-5 text-center">
      <SquadLogo squad={squad} className="size-24" />
      <h1 className={cx(pro ? 'text-title-pro' : 'text-title', 'mt-4 max-w-full break-words')}>{squad.name}</h1>
      <p className="mt-0.5 text-body font-semibold tracking-[0.08em] text-fg-2">[{squad.tag}]</p>
      <p className="mt-1.5 inline-flex flex-wrap items-center justify-center gap-x-1.5 text-meta">
        <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
          <SportIcon sport={squad.sport} className="size-4" />
          {meta?.label ?? 'Otro deporte'}
        </span>
        {squad.city && <span className="text-fg-2">· {squad.city}</span>}
      </p>
      {squad.recruiting && (
        <Badge tone="accent" className="mt-2.5 bg-surface!">
          Busca jugadores
        </Badge>
      )}
      {squad.description && <p className="mt-2.5 max-w-md text-body break-words whitespace-pre-line text-fg-2">{squad.description}</p>}
      <ul aria-label="Números del equipo" className="mt-5 grid w-full max-w-sm grid-cols-3 divide-x divide-line rounded-2xl bg-surface py-3">
        <Counter value={squad.members.toLocaleString('es-DO')} label={squad.members === 1 ? 'miembro' : 'miembros'} />
        <Counter value={squad.followers.toLocaleString('es-DO')} label={squad.followers === 1 ? 'seguidor' : 'seguidores'} />
        <Counter value={record || '—'} label="récord" small={!!record} />
      </ul>
    </header>
  );
}

/** Un número de arriba: grande, y qué es debajo («3 miembros»). */
function Counter({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <li className="flex min-w-0 flex-col items-center px-1">
      <b className={cx('num max-w-full truncate', small ? 'text-[15px] leading-7' : 'text-xl')}>{value}</b> <span className="text-xs text-muted">{label}</span>
    </li>
  );
}

// ---------- Plantilla ----------

function Roster({ squad, viewer, pro, onPick }: { squad: SquadData; viewer: SquadViewer; pro: boolean; onPick: (m: SquadMember) => void }) {
  const roster = useMemo(() => sortRoster(squad.roster), [squad.roster]);
  if (!roster.length) return <ListSkeleton rows={Math.min(5, Math.max(1, squad.members))} />;
  return (
    <section aria-label="Plantilla">
      {viewer === 'captain' && <p className="mx-1 mb-3 text-meta text-muted">Toca a alguien para su posición y número, pasarle la capitanía o sacarlo.</p>}
      <Card className="overflow-hidden">
        {roster.map((m) => (
          <ListRow
            key={m.id}
            dense={pro}
            me={m.isMe}
            leading={<Avatar name={m.name} photo={m.avatar} className="size-10 text-sm" />}
            title={m.isMe ? `${m.name} (tú)` : m.name}
            subtitle={memberLine(m) || undefined}
            trailing={
              m.role === 'captain' ? (
                <Badge tone="accent">
                  <Crown aria-hidden="true" className="size-3" />
                  Capitán
                </Badge>
              ) : undefined
            }
            chevron={viewer === 'captain' ? true : undefined}
            {...(viewer === 'captain' ? { onClick: () => onPick(m), ariaLabel: `${m.name}: opciones` } : { to: userPath(m.id) })}
          />
        ))}
      </Card>
    </section>
  );
}

// ---------- Muro ----------

function Wall({ squad, viewer }: { squad: SquadData; viewer: SquadViewer }) {
  const posts = useSquadPosts(squad.id);
  const member = viewer !== 'none';
  return (
    <div className="flex flex-col gap-3.5">
      {member && <ComposerCard squad={{ id: squad.id, name: squad.name }} placeholder="¿Qué cuenta el equipo?" />}
      <PostList
        list={posts}
        hideSquad
        empty={
          <Quiet icon={<Newspaper />} title="Todavía no hay publicaciones">
            {member ? 'Escribe lo primero: el próximo partido, un resultado o una foto del equipo.' : 'Cuando el equipo publique algo, sale aquí y en tu Social si lo sigues.'}
          </Quiet>
        }
      />
    </div>
  );
}

// ---------- Ligas ----------

function Leagues({ squad, viewer, pro, onRequest }: { squad: SquadData; viewer: SquadViewer; pro: boolean; onRequest: () => void }) {
  const { toast, confirm } = useFeedback();
  const act = useBusy<string>();
  const leagues = useMemo(() => shownLeagues(squad.leagues), [squad.leagues]);
  const captain = viewer === 'captain';

  if (!canEnterLeagues(squad.sport)) {
    return (
      <Quiet icon={<Trophy />} title="Ligas">
        {leaguesSoonText(squad.sport)}
      </Quiet>
    );
  }

  async function withdraw(l: SquadLeague) {
    const ok = await confirm({ title: `¿Retirar la solicitud a ${l.name}?`, message: 'Puedes volver a pedir cuando quieras.', confirmText: 'Retirar', danger: true });
    if (!ok) return;
    await act.run(l.requestId, async () => {
      try {
        await withdrawSquadRequest(squad.id, l);
        toast('Solicitud retirada');
      } catch (e) {
        console.error(e);
        toast(requestErrorText(e), 'error');
      }
    });
  }

  async function sync(l: SquadLeague) {
    await act.run(l.requestId, async () => {
      try {
        toast(syncText(await syncSquadRoster(squad.id, l.leagueId)));
      } catch (e) {
        console.error(e);
        toast(syncErrorText(e), 'error');
      }
    });
  }

  return (
    <section aria-labelledby="ligas-del-equipo" className="flex flex-col">
      <SectionHeader id="ligas-del-equipo" title="Ligas del equipo" />
      {leagues.length ? (
        <Card className="overflow-hidden">
          {leagues.map((l) => (
            <RowWithActions
              key={l.requestId}
              row={
                <ListRow
                  dense={pro}
                  to={`/l/${l.leagueId}`}
                  leading={<LeagueTile league={{ id: l.leagueId, sport: l.sport, kind: 'liga', logoPath: l.logo }} dense />}
                  title={l.name}
                  subtitle={recordText(l.record) || (l.status === 'approved' ? 'Sin partidos todavía' : LEAGUE_STATUS_TEXT[l.status])}
                  trailing={<LeagueStatusBadge status={l.status} />}
                />
              }
              actions={
                captain && l.status === 'pending' ? (
                  <Button variant="quiet" className="h-11 sm:h-9" loading={act.isBusy(l.requestId)} disabled={act.isBusy()} onClick={() => void withdraw(l)}>
                    Retirar solicitud
                  </Button>
                ) : captain && l.status === 'approved' ? (
                  <Button variant="quiet" className="h-11 sm:h-9" loading={act.isBusy(l.requestId)} disabled={act.isBusy()} icon={<UserPlus className="size-4" />} onClick={() => void sync(l)}>
                    Pasar miembros nuevos
                  </Button>
                ) : undefined
              }
            />
          ))}
        </Card>
      ) : (
        <Quiet icon={<Trophy />} title="Todavía no juega en ninguna liga">
          {captain ? `Inscríbelo en una liga de ${sportMeta(squad.sport)?.lower ?? 'su deporte'}: los admins de la liga deciden.` : 'Cuando el capitán lo inscriba en una liga, sale aquí.'}
        </Quiet>
      )}
      {captain && (
        <Button variant="soft" size={pro ? 'lg' : 'xl'} className="mt-4 w-full" icon={<Send className="size-5" />} onClick={onRequest}>
          Inscribir en una liga
        </Button>
      )}
    </section>
  );
}

// ---------- Menú «•••» ----------

function SquadMenu({
  open,
  onClose,
  squad,
  keys,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  squad: SquadData;
  keys: readonly SquadMenuKey[];
  onOpen: (k: 'edit' | 'logo') => void;
}) {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const act = useBusy<SquadMenuKey>();
  const captain = squad.myRole === 'captain';

  async function run(key: SquadMenuKey, ask: Parameters<typeof confirm>[0], fn: () => Promise<void>, done: string, after?: () => void) {
    if (!(await confirm(ask))) return;
    await act.run(key, async () => {
      try {
        await fn();
        toast(done);
        onClose();
        after?.();
      } catch (e) {
        console.error(e);
        toast(squadErrorText(e), 'error');
      }
    });
  }

  const items: MenuItem[] = keys.map((k): MenuItem => {
    if (k === 'edit') return { key: k, icon: Pencil, label: 'Editar equipo', hint: 'Nombre, tag, ciudad, color y más', onClick: () => onOpen('edit') };
    if (k === 'logo') return { key: k, icon: ImageUp, label: 'Logo', hint: squad.logo ? 'Cambiarlo o quitarlo' : 'Ponle el escudo del equipo', onClick: () => onOpen('logo') };
    if (k === 'delete')
      return {
        key: k,
        icon: Trash2,
        label: 'Borrar equipo',
        danger: true,
        busy: act.isBusy(k),
        onClick: () =>
          void run(
            k,
            {
              title: `¿Borrar ${squad.name}?`,
              message: 'Se borra para todos: la plantilla, el muro y los seguidores. Si ya juega en ligas, ese equipo se queda en su liga.',
              confirmText: 'Borrar equipo',
              danger: true,
            },
            () => deleteSquad(squad.id),
            'Equipo borrado',
            () => navigate('/equipos', { replace: true }),
          ),
      };
    // Salir: el capitán con más gente primero pasa la capitanía.
    if (captain)
      return {
        key: k,
        icon: LogOut,
        label: 'Salir del equipo',
        hint: 'Primero pásale la capitanía a alguien',
        danger: true,
        onClick: () => toast('Primero pásale la capitanía a alguien: toca su nombre en la plantilla.', 'error'),
      };
    return {
      key: k,
      icon: LogOut,
      label: 'Salir del equipo',
      danger: true,
      busy: act.isBusy(k),
      onClick: () =>
        void run(
          k,
          { title: `¿Salir de ${squad.name}?`, message: 'Para volver necesitas el link o el código del equipo.', confirmText: 'Salir', danger: true },
          () => leaveSquad(squad.id),
          `Saliste de ${squad.name}`,
        ),
    };
  });
  return <EventMenu open={open} onClose={onClose} title={squad.name} items={items} />;
}
