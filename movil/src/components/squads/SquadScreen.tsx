/**
 * Un equipo (`/equipos/<id>`, SquadPage de la web, con su misma lógica: src/components/squads/logic.ts) como un perfil:
 * arriba, en su color, el logo (o el tag en un círculo), el nombre, «[TAG] · deporte · ciudad», «Busca jugadores» y la
 * descripción; el capitán invita (`?invitar=1` abre la hoja, como al crear el equipo) y quien no es miembro lo sigue
 * (con una invitación pendiente, Aceptar · Rechazar). Debajo, Publicaciones · Seguidores · Me gusta · Miembros y el
 * récord, y las pestañas (`?tab=`): Publicaciones, Juegos, Torneos, Estadísticas (con «Inscribir en una liga») y
 * Plantilla (`?jugador=<id>`: la tarjeta de esa persona arriba). «•••»: editar, logo, salir y borrar (el capitán) o
 * salir (un miembro). Sin cuenta: lo de arriba, los seguidores y entrar para lo demás.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ChevronRight, MailOpen, MoreHorizontal, Newspaper, Shield, Swords, Trophy, UserPlus, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { recordText, respondSquadInvite, useMySquadInvites, useSquad, type MySquadInvite, type SquadMember, type SquadPage } from '@mm/lib/data/squads';
import { sportMeta } from '@mm/sports/registry';
import { invitedByLine } from '@mm/components/notifications/inviteText';
import { compactCount } from '@mm/components/social/socialFormat';
import {
  SQUAD_TABS,
  pendingSquadInvite,
  recordSummary,
  squadInviteErrorText,
  squadMenu,
  squadRespondedText,
  squadTab,
  squadTabParam,
  squadViewer,
  type SquadTab,
} from '@mm/components/squads/logic';
import { SignInCard } from '../esports/EsportsIndex';
import { ChoiceChips } from '../esports/inputs';
import { toast } from '../feedback';
import { BackBar, Button, Card, Empty, LoadError, Loading, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { SquadFollowButton, SquadLogo, useSquadColors } from './bits';
import { createdCodes } from './CreateSquadSheet';
import { SquadInviteSheet } from './SquadInviteSheet';
import { EditSquadSheet, SquadFollowersSheet, SquadLeagueSheet, SquadLogoSheet, SquadMemberSheet, SquadMenu } from './SquadSheets';
import { SquadGamesTab, SquadRosterTab, SquadStatsTab, SquadTournamentsTab, SquadWall } from './SquadTabs';

const TopBar = ({ right }: { right?: ReactNode }) => <BackBar label="Equipos" fallback="/equipos" right={right} />;

export function SquadScreen({ squadId }: { squadId: string }) {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  return <SquadView id={squadId} uid={auth.user?.uid ?? null} />;
}

function SquadView({ id, uid }: { id: string; uid: string | null }) {
  const c = useColors();
  const params = useLocalSearchParams<{ tab?: string; jugador?: string; invitar?: string }>();
  const data = useSquad(id);
  const squad = data.data;
  const viewer = squadViewer(squad);
  // Una invitación pendiente a este equipo (el aviso lleva aquí): Aceptar · Rechazar en lugar de Seguir.
  const myInvites = useMySquadInvites();
  const invite = pendingSquadInvite(myInvites.data, id, !!uid, viewer);
  const jugador = typeof params.jugador === 'string' && params.jugador ? params.jugador : null;
  const tab = squadTab(params.tab ?? null, jugador);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<'edit' | 'logo' | 'liga' | 'seguidores' | null>(null);
  const [picked, setPicked] = useState<SquadMember | null>(null);
  const inviting = params.invitar === '1' && viewer === 'captain';
  const setTab = (t: SquadTab) => router.setParams({ tab: squadTabParam(t, jugador) ?? undefined });
  const setInviting = (on: boolean) => router.setParams({ invitar: on ? '1' : undefined });

  if (data.loading && !squad) {
    return (
      <View style={{ gap: 16 }}>
        <TopBar />
        <Loading label="Cargando el equipo" />
      </View>
    );
  }
  if (data.error && !squad) {
    return (
      <View style={{ gap: 16 }}>
        <TopBar />
        <LoadError error={data.error} />
      </View>
    );
  }
  if (!squad) {
    return (
      <View style={{ gap: 16 }}>
        <TopBar />
        <Empty
          icon={<Shield size={28} color={c.accent} />}
          title="Este equipo ya no existe"
          text="Lo borró su capitán o el link está mal."
          action={<Button onPress={() => router.navigate('/equipos' as Href)}>Ver equipos</Button>}
        />
      </View>
    );
  }

  const menuKeys = squadMenu(viewer, squad.members);
  const signIn = (icon: ReactNode, title: string, text: string) => <SignInCard icon={icon} title={title} text={text} />;

  let content: ReactNode;
  if (tab === 'publicaciones') {
    content = uid ? <SquadWall squad={squad} viewer={viewer} /> : signIn(<Newspaper size={28} color={c.accent} />, 'Entra para ver sus publicaciones', 'Con tu cuenta ves su muro, lo comentas y te enteras de sus partidos.');
  } else if (tab === 'juegos') {
    content = uid ? <SquadGamesTab squadId={squad.id} /> : signIn(<Swords size={28} color={c.accent} />, 'Entra para ver sus partidos', 'Con tu cuenta ves sus partidos en cada liga, con el resultado.');
  } else if (tab === 'torneos') {
    content = uid ? <SquadTournamentsTab squadId={squad.id} /> : signIn(<Trophy size={28} color={c.accent} />, 'Entra para ver sus partidos', 'Con tu cuenta ves los torneos que jugó y cómo le fue.');
  } else if (tab === 'estadisticas') {
    content = uid ? (
      <SquadStatsTab squad={squad} viewer={viewer} onRequest={() => setSheet('liga')} />
    ) : (
      signIn(<Trophy size={28} color={c.accent} />, 'Entra para ver sus partidos', 'Con tu cuenta ves su récord por liga y por temporada.')
    );
  } else {
    content = uid ? (
      <SquadRosterTab squad={squad} viewer={viewer} highlight={jugador} onPick={setPicked} />
    ) : (
      signIn(<Users size={28} color={c.accent} />, 'Entra para ver la plantilla', 'Con tu cuenta ves quiénes juegan, con su posición y su número.')
    );
  }

  return (
    <View style={{ gap: 14 }}>
      <TopBar
        right={
          menuKeys.length > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={6} onPress={() => setMenu(true)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <MoreHorizontal size={22} color={c.fg} />
            </Pressable>
          ) : undefined
        }
      />
      <SquadHeader squad={squad} />

      {invite ? (
        <InviteBanner invite={invite} squadName={squad.name} />
      ) : viewer === 'captain' ? (
        <Button variant="primary" size="xl" full icon={<UserPlus size={20} color={c.accentFg} />} onPress={() => setInviting(true)}>
          Invitar
        </Button>
      ) : viewer === 'none' ? (
        <SquadFollowButton squadId={squad.id} name={squad.name} following={squad.isFollowing} full />
      ) : null}

      <SquadCounters squad={squad} onTab={setTab} onFollowers={() => setSheet('seguidores')} />

      <View style={{ marginTop: 12 }}>
        <ChoiceChips<SquadTab> scroll label="Partes del equipo" items={SQUAD_TABS} value={tab} onChange={setTab} />
      </View>
      <View style={{ marginTop: 6 }}>{content}</View>

      <SquadFollowersSheet squad={squad} open={sheet === 'seguidores'} onClose={() => setSheet(null)} />
      <SquadMenu
        open={menu}
        onClose={() => setMenu(false)}
        squad={squad}
        keys={menuKeys}
        onOpen={(k) => {
          setMenu(false);
          // En el iPhone una hoja no se abre mientras la otra se está cerrando.
          setTimeout(() => setSheet(k), 350);
        }}
      />
      {viewer === 'captain' && (
        <>
          <SquadInviteSheet open={inviting} onClose={() => setInviting(false)} squad={squad} code={createdCodes.get(squad.id) ?? null} />
          <EditSquadSheet open={sheet === 'edit'} onClose={() => setSheet(null)} squad={squad} />
          <SquadLogoSheet open={sheet === 'logo'} onClose={() => setSheet(null)} squad={squad} />
          <SquadLeagueSheet open={sheet === 'liga'} onClose={() => setSheet(null)} squad={squad} />
          <SquadMemberSheet member={picked} squad={squad} viewer={viewer} onClose={() => setPicked(null)} />
        </>
      )}
    </View>
  );
}

/** Lo de arriba, como un perfil: el logo, el nombre, «[TAG] · deporte · ciudad», «Busca jugadores» y la descripción, sobre el color del equipo. */
function SquadHeader({ squad }: { squad: SquadPage }) {
  const c = useSquadColors(squad.color, squad.sport);
  const meta = sportMeta(squad.sport);
  const Icon = meta?.icon;
  return (
    <View style={{ borderRadius: 28, backgroundColor: c.accentSoft, padding: 20, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <SquadLogo squad={squad} size={72} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt accessibilityRole="header" style={{ fontSize: 26, lineHeight: 30, fontFamily: font.bold, letterSpacing: -0.5 }}>
            {squad.name}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, marginTop: 3 }}>
            <Txt variant="meta" tone="fg2" style={{ fontFamily: font.semibold, letterSpacing: 1 }}>{`[${squad.tag}]`}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {Icon && <Icon size={16} color={c.accent} />}
              <Txt variant="meta" style={{ color: c.accent, fontFamily: font.semibold }}>
                {meta?.label ?? 'Otro deporte'}
              </Txt>
            </View>
            {!!squad.city && (
              <Txt variant="meta" tone="fg2">
                {`· ${squad.city}`}
              </Txt>
            )}
          </View>
          {squad.recruiting && (
            <View style={{ alignSelf: 'flex-start', marginTop: 6, borderRadius: 999, backgroundColor: c.surface, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Txt style={{ color: c.accent, fontFamily: font.semibold, fontSize: 12 }}>Busca jugadores</Txt>
            </View>
          )}
        </View>
      </View>
      {!!squad.description && <Txt tone="fg2">{squad.description}</Txt>}
    </View>
  );
}

/**
 * Los números del equipo, como los de un perfil: Publicaciones · Seguidores · Me gusta · Miembros (tocar abre la parte
 * o la lista de seguidores) y, debajo, el récord (lleva a Estadísticas).
 */
function SquadCounters({ squad, onTab, onFollowers }: { squad: SquadPage; onTab: (t: SquadTab) => void; onFollowers: () => void }) {
  const c = useColors();
  const posts = squad.posts ?? 0;
  const likes = squad.likes ?? 0;
  const counters = [
    { key: 'posts', value: posts, label: posts === 1 ? 'Publicación' : 'Publicaciones', onPress: () => onTab('publicaciones') },
    { key: 'followers', value: squad.followers, label: squad.followers === 1 ? 'Seguidor' : 'Seguidores', onPress: onFollowers },
    { key: 'likes', value: likes, label: 'Me gusta', onPress: () => onTab('publicaciones') },
    { key: 'members', value: squad.members, label: squad.members === 1 ? 'Miembro' : 'Miembros', onPress: () => onTab('plantilla') },
  ];
  const record = recordText(squad.record);
  const summary = recordSummary(squad.record);
  return (
    <Card padded={false}>
      <View accessibilityLabel="Números del equipo" style={{ flexDirection: 'row' }}>
        {counters.map((k, i) => (
          <Pressable
            key={k.key}
            accessibilityRole="button"
            accessibilityLabel={`${compactCount(k.value)} ${k.label}`}
            onPress={k.onPress}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 76, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 12, backgroundColor: pressed ? c.surface2 : 'transparent', borderLeftWidth: i ? StyleSheet.hairlineWidth : 0, borderLeftColor: c.line })}
          >
            <Txt style={{ fontSize: 23, lineHeight: 27, fontFamily: font.semibold }}>{compactCount(k.value)}</Txt>
            <Txt tone="muted" numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, fontFamily: font.medium }}>
              {k.label}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => onTab('estadisticas')}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, backgroundColor: pressed ? c.surface2 : 'transparent' })}
      >
        <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
          Récord
        </Txt>
        <Txt style={{ fontSize: 17, fontFamily: font.semibold }}>{record || '—'}</Txt>
        <Txt tone="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
          {summary || 'Sin partidos todavía'}
        </Txt>
        <ChevronRight size={20} color={c.faint} />
      </Pressable>
    </Card>
  );
}

/** Quien abre el equipo con una invitación pendiente: quién lo invitó y Rechazar · Aceptar, en lugar de Seguir. */
function InviteBanner({ invite: inv, squadName }: { invite: MySquadInvite; squadName: string }) {
  const c = useColors();
  const [busy, setBusy] = useState<boolean | null>(null);

  async function respond(accept: boolean) {
    if (busy !== null) return;
    setBusy(accept);
    try {
      await respondSquadInvite(inv.id, accept);
      toast(squadRespondedText(accept, squadName));
    } catch (e) {
      console.error(e);
      toast(squadInviteErrorText(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 14, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <MailOpen size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong">{`${invitedByLine({ ...inv.invitedBy, username: inv.invitedBy.username ?? '' })} a este equipo`}</Txt>
          <Txt variant="meta" tone="muted" style={{ marginTop: 2 }}>
            Si aceptas, entras a la plantilla y puedes publicar en su muro.
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button size="lg" full loading={busy === false} disabled={busy !== null} onPress={() => respond(false)}>
            Rechazar
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="primary" size="lg" full loading={busy === true} disabled={busy !== null} onPress={() => respond(true)}>
            Aceptar
          </Button>
        </View>
      </View>
    </Card>
  );
}
