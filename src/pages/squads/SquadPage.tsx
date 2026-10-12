import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ImageUp, LogOut, Newspaper, Pencil, Shield, Swords, Trash2, Trophy, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useSquadPosts } from '../../lib/data/posts';
import { deleteSquad, leaveSquad, squadErrorText, useMySquadInvites, useSquad, type SquadMember, type SquadPage as SquadData } from '../../lib/data/squads';
import { useIsPro } from '../../lib/useMode';
import { useBusy } from '../../components/busy';
import { EventMenu, MoreButton, type MenuItem } from '../../components/event/EventHeader';
import { useFeedback } from '../../components/feedback';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { ComposerCard } from '../../components/posts/Composer';
import { PostList } from '../../components/posts/PostList';
import { DeadInvite } from '../../components/screens/InviteBits';
import { SignInCard, linkButton } from '../../components/screens/ScreenBits';
import { Quiet } from '../../components/search/SearchRows';
import { AppShell } from '../../components/Shell';
import { SQUAD_TABS, squadMenu, squadTab, squadViewer, type SquadMenuKey, type SquadTab, type SquadViewer } from '../../components/squads/logic';
import { SquadTint } from '../../components/squads/SquadBits';
import { SquadFollowButton } from '../../components/squads/SquadFollowButton';
import { SquadCounters, SquadFollowersSheet, SquadHeader } from '../../components/squads/SquadHeader';
import { SquadInviteBanner } from '../../components/squads/SquadInviteBanner';
import { SquadGamesTab, SquadRosterTab, SquadStatsTab, SquadTournamentsTab } from '../../components/squads/SquadTabs';
import { Button, LoadError, Loading, PageSkeleton, Tabs } from '../../components/ui';
import { EditSquadSheet, SquadLogoSheet } from './EditSquadSheet';
import { SquadInviteSheet } from './SquadInviteSheet';
import { SquadLeagueSheet } from './SquadLeagueSheet';
import { SquadMemberSheet } from './SquadMemberSheet';

/**
 * Un equipo (`/equipos/:squadId`) como un perfil (docs/perfiles-equipos-esports.md §3): arriba, en su color, el logo (o
 * el tag en un círculo), el nombre, «[TAG] · deporte · ciudad», «Busca jugadores» y la descripción; el capitán invita
 * (la hoja con la búsqueda de personas, las invitaciones pendientes y el código, el link y el QR; `?invitar=1` la abre,
 * como al crear el equipo) y quien no es miembro lo sigue (con una invitación pendiente, Aceptar · Rechazar). Debajo,
 * Publicaciones · Seguidores · Me gusta · Miembros y el récord, y las pestañas (`?tab=`): Publicaciones (el muro;
 * publican los miembros), Juegos, Torneos, Estadísticas (el récord, las ligas por temporada y «Inscribir en una liga»)
 * y Plantilla (`?jugador=<id>`: la tarjeta de esa persona arriba; así enlaza el perfil global). «•••»: editar, logo,
 * salir y borrar (el capitán) o salir (un miembro). Sin cuenta: lo de arriba, los seguidores y entrar para lo demás.
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
  // Una invitación pendiente a este equipo (el push lleva aquí): Aceptar · Rechazar en lugar de Seguir.
  const myInvites = useMySquadInvites();
  const invite = uid && viewer === 'none' ? myInvites.data.find((i) => i.squad.id === id) : undefined;
  const jugador = params.get('jugador');
  const tab = squadTab(params.get('tab'), jugador);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'edit' | 'logo' | 'liga' | 'seguidores' | null>(null);
  const [picked, setPicked] = useState<SquadMember | null>(null);
  const inviting = params.get('invitar') === '1' && viewer === 'captain';
  const createdCode = (location.state as { inviteCode?: string } | null)?.inviteCode ?? null;
  const next = encodeURIComponent(location.pathname + location.search);

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
  // La pestaña de entrada no va en el link (con `?jugador=` la de entrada es Plantilla).
  const setTab = (t: SquadTab) => setParam('tab', t === squadTab(null, jugador) ? null : t);

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
  const signIn = (icon: ReactNode, title: string, text: string) => <SignInCard icon={icon} title={title} text={text} next={next} />;

  let content: ReactNode;
  if (tab === 'publicaciones') {
    content = uid ? <Wall squad={squad} viewer={viewer} /> : signIn(<Newspaper />, 'Entra para ver sus publicaciones', 'Con tu cuenta ves su muro, lo comentas y te enteras de sus partidos.');
  } else if (tab === 'juegos') {
    content = uid ? <SquadGamesTab squadId={squad.id} pro={pro} /> : signIn(<Swords />, 'Entra para ver sus partidos', 'Con tu cuenta ves sus partidos en cada liga, con el resultado.');
  } else if (tab === 'torneos') {
    content = uid ? <SquadTournamentsTab squadId={squad.id} pro={pro} /> : signIn(<Trophy />, 'Entra para ver sus partidos', 'Con tu cuenta ves los torneos que jugó y cómo le fue.');
  } else if (tab === 'estadisticas') {
    content = uid ? (
      <SquadStatsTab squad={squad} viewer={viewer} pro={pro} onRequest={() => setSheet('liga')} />
    ) : (
      signIn(<Trophy />, 'Entra para ver sus partidos', 'Con tu cuenta ves su récord por liga y por temporada.')
    );
  } else {
    content = uid ? (
      <SquadRosterTab squad={squad} viewer={viewer} pro={pro} highlight={jugador} onPick={setPicked} />
    ) : (
      signIn(<Users />, 'Entra para ver la plantilla', 'Con tu cuenta ves quiénes juegan, con su posición y su número.')
    );
  }

  return (
    <SquadTint color={squad.color} sport={squad.sport}>
      <div className="flex flex-col px-2">
        <TopBar actions={menuKeys.length > 0 && <MoreButton onClick={() => setMenu(true)} />} />
        <SquadHeader squad={squad} pro={pro} />

        {invite ? (
          <SquadInviteBanner invite={invite} squadName={squad.name} />
        ) : viewer === 'captain' ? (
          <Button variant="primary" size={pro ? 'lg' : 'xl'} className="mt-3.5 w-full" icon={<UserPlus className="size-5" />} onClick={() => setParam('invitar', '1')}>
            Invitar
          </Button>
        ) : viewer === 'none' ? (
          <SquadFollowButton squadId={squad.id} name={squad.name} following={squad.isFollowing} className="mt-3.5 h-12! w-full text-base" />
        ) : null}

        <SquadCounters squad={squad} onTab={setTab} onFollowers={() => setSheet('seguidores')} />

        <div className="mt-[26px]">
          <Tabs<SquadTab> items={[...SQUAD_TABS]} active={tab} onChange={setTab} />
        </div>
        <div className="mt-5">{content}</div>

        <SquadFollowersSheet squad={squad} open={sheet === 'seguidores'} onClose={() => setSheet(null)} />
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

// ---------- Publicaciones ----------

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
        onClick: () => toast('Primero pásale la capitanía a alguien: en la plantilla, toca «•••» en su fila.', 'error'),
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
