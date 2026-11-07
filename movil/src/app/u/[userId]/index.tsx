import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ban, Flag, Globe, MoreHorizontal, Newspaper, Trophy, UserCheck, UserRound, UserX } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { invalidate } from '@mm/lib/data/client';
import { peopleTags, usePublicProfile, type PublicProfile } from '@mm/lib/data/follows';
import { useUserPosts, socialErrorText } from '@mm/lib/data/posts';
import { useProfileGames } from '@mm/lib/data/profileGames';
import { setBlocked } from '@mm/lib/data/profileSocial';
import { saveErrorMessage } from '@mm/lib/errorText';
import { BLOCK_EXPLAIN, compactCount, knownSports, profileLine } from '@mm/components/social/socialFormat';
import { FeaturedBadges, ProfileBadgesTab } from '@/components/badges/ProfileBadges';
import { Avatar } from '@/components/social/Avatar';
import { ReportSheet } from '@/components/social/ContentMenu';
import { FollowButton } from '@/components/social/People';
import { GameList } from '@/components/social/GameCard';
import { PostList } from '@/components/social/PostList';
import { confirmAsync, toast } from '@/components/feedback';
import { BackBar, Button, Card, Empty, ErrorNote, ListRow, Loading, RowIcon, Screen, Segmented, Sheet, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';

type ProfileTab = 'publicaciones' | 'juegos' | 'insignias';

/**
 * El perfil de una cuenta (/u/:userId de la web): foto, nombre y «@usuario · deportes · desde cuándo» (y «Te sigue»),
 * su biografía, Seguir, Publicaciones · Seguidores · Siguiendo · Me gusta (tocar abre la lista o la parte) y
 * «Publicaciones | Juegos | Insignias» (con sus destacadas debajo del nombre; `?tab=insignias` abre la vitrina y
 * `&insignia=<id>` esa insignia, como en la web). «⋯»: reportar la cuenta y bloquear o desbloquear. Si la bloqueaste,
 * «Bloqueaste a …» con «Desbloquear». Estadísticas, por ahora en la web.
 */
export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const c = useColors();
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <Screen>
        <BackBar label="Atrás" fallback="/social" />
        <Card style={{ gap: 12 }}>
          <UserRound size={28} color={c.accent} />
          <Txt variant="cardTitle">Entra para ver este perfil</Txt>
          <Txt tone="fg2">Ve sus publicaciones y sus juegos, y síguelo.</Txt>
          <Button variant="primary" size="xl" full onPress={() => router.push('/login')}>
            Entrar
          </Button>
        </Card>
      </Screen>
    );
  }
  return <Profile key={userId} userId={userId} />;
}

function useBlockToggle(person: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    if (next && !(await confirmAsync({ title: `¿Bloquear a ${person.name}?`, message: BLOCK_EXPLAIN, confirmText: 'Bloquear', danger: true }))) return;
    setBusy(true);
    try {
      await setBlocked(person.id, next);
      toast(next ? `Bloqueaste a ${person.name}` : `Desbloqueaste a ${person.name}`);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }
  return { busy, block: () => change(true), unblock: () => change(false) };
}

function Profile({ userId }: { userId: string }) {
  const c = useColors();
  const profile = usePublicProfile(userId);
  // Las insignias se abren por link (`?tab=insignias`, `&insignia=<id>` y `&quieta=1`: Avisos, los push, el aviso al ganar).
  const params = useLocalSearchParams<{ tab?: string; insignia?: string; quieta?: string }>();
  const [tab, setTab] = useState<ProfileTab>(() => (params.tab === 'insignias' ? 'insignias' : 'publicaciones'));
  // La insignia que se abre en Insignias (la del link, o una destacada que se tocó); null al cerrarla.
  const [badgeLink, setBadgeLink] = useState<{ id: string; still: boolean } | null>(() => (params.insignia ? { id: params.insignia, still: params.quieta === '1' } : null));
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const p = profile.data;
  const toggle = useBlockToggle({ id: userId, name: p?.name ?? 'esta persona' });

  const top = (
    <BackBar
      label="Atrás"
      fallback="/social"
      right={
        p && !p.isMe ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Más opciones"
            hitSlop={6}
            onPress={() => setMenu(true)}
            style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface }}
          >
            <MoreHorizontal size={22} color={c.fg} />
          </Pressable>
        ) : undefined
      }
    />
  );

  if (profile.loading && !p) return <Loading label="Cargando perfil" />;
  if (profile.error && !p) {
    return (
      <Screen>
        {top}
        <ErrorNote>{socialErrorText(profile.error, 'No se pudo cargar el perfil.')}</ErrorNote>
        <Button onPress={() => invalidate(peopleTags.user(userId))}>Reintentar</Button>
      </Screen>
    );
  }
  if (!p) {
    return (
      <Screen>
        {top}
        <Empty title="No encontramos este perfil" text="Puede que la cuenta ya no exista o que no esté disponible." action={<Button onPress={() => router.navigate('/social')}>Ir a Social</Button>} />
      </Screen>
    );
  }

  const blocked = !!p.blockedByMe;
  const line = profileLine(p);
  const bio = p.bio?.trim();
  const posts = p.posts ?? 0;
  const counters = [
    { key: 'posts', value: posts, label: posts === 1 ? 'Publicación' : 'Publicaciones', onPress: () => setTab('publicaciones') },
    { key: 'followers', value: p.followers, label: p.followers === 1 ? 'Seguidor' : 'Seguidores', onPress: () => router.push({ pathname: '/u/[userId]/[lista]', params: { userId: p.id, lista: 'seguidores' } }) },
    { key: 'following', value: p.following, label: 'Siguiendo', onPress: () => router.push({ pathname: '/u/[userId]/[lista]', params: { userId: p.id, lista: 'siguiendo' } }) },
    { key: 'likes', value: p.likesReceived, label: 'Me gusta', onPress: () => setTab('juegos') },
  ];

  return (
    <Screen onRefresh={() => invalidate(peopleTags.user(userId))}>
      {top}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Avatar name={p.name} photo={p.avatar} size={72} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt variant="cardTitle" numberOfLines={1} style={{ fontSize: 26, lineHeight: 30 }}>
            {p.name}
          </Txt>
          {!!line && (
            <Txt variant="meta" tone="muted" numberOfLines={2}>
              {line}
            </Txt>
          )}
          {p.followsYou && !p.isMe && !blocked && (
            <View style={{ alignSelf: 'flex-start', marginTop: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: c.surface2 }}>
              <Txt variant="small" tone="fg2">
                Te sigue
              </Txt>
            </View>
          )}
        </View>
      </View>

      {!!bio && !blocked && <Txt tone="fg2">{bio}</Txt>}

      {/* Sus insignias destacadas (hasta 3): tocar una la abre en Insignias. */}
      {!blocked && (
        <FeaturedBadges
          userId={p.id}
          onOpen={(id) => {
            setTab('insignias');
            setBadgeLink({ id, still: false });
          }}
        />
      )}

      {!p.isMe && !blocked && <FollowButton userId={p.id} name={p.name} isFollowing={p.isFollowing} followsYou={p.followsYou} />}

      <Card padded={false}>
        <View style={{ flexDirection: 'row' }}>
          {counters.map((k, i) => (
            <Pressable
              key={k.key}
              accessibilityRole="button"
              accessibilityLabel={`${compactCount(k.value)} ${k.label}`}
              disabled={blocked}
              onPress={k.onPress}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 76,
                justifyContent: 'center',
                paddingHorizontal: 10,
                borderLeftWidth: i > 0 ? 1 : 0,
                borderLeftColor: c.line,
                backgroundColor: pressed ? c.surface2 : 'transparent',
              })}
            >
              <Txt style={{ fontSize: 23, lineHeight: 27, fontWeight: '700' }}>{compactCount(k.value)}</Txt>
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {k.label}
              </Txt>
            </Pressable>
          ))}
        </View>
      </Card>

      {blocked ? (
        <Card style={{ alignItems: 'center', gap: 10 }}>
          <Ban size={28} color={c.fg2} />
          <Txt variant="cardTitle" style={{ textAlign: 'center' }}>
            Bloqueaste a {p.name}
          </Txt>
          <Txt tone="muted" style={{ textAlign: 'center' }}>
            No ves sus publicaciones ni sus juegos, y no te encuentra en la búsqueda.
          </Txt>
          <Button size="xl" full loading={toggle.busy} icon={<UserCheck size={20} color={c.fg} />} onPress={toggle.unblock}>
            Desbloquear
          </Button>
        </Card>
      ) : (
        <>
          <Segmented<ProfileTab>
            label="Qué ver"
            value={tab}
            onChange={setTab}
            options={[
              { key: 'publicaciones', label: 'Publicaciones' },
              { key: 'juegos', label: 'Juegos' },
              { key: 'insignias', label: 'Insignias' },
            ]}
          />
          {tab === 'publicaciones' ? (
            <UserPosts userId={p.id} name={p.name} />
          ) : tab === 'juegos' ? (
            <UserGames userId={p.id} name={p.name} isMe={p.isMe} />
          ) : (
            <ProfileBadgesTab
              userId={p.id}
              name={p.name}
              sports={knownSports(p.sports)}
              link={badgeLink}
              onLinkDone={() => {
                setBadgeLink(null);
                if (params.insignia) router.setParams({ insignia: undefined, quieta: undefined });
              }}
            />
          )}
          <Card padded={false}>
            <ListRow
              icon={
                <RowIcon>
                  <Globe size={20} color={c.accent} />
                </RowIcon>
              }
              title="Estadísticas"
              subtitle="En la web, por ahora"
              onPress={() => openOnWeb(`/u/${p.id}?tab=estadisticas`)}
            />
          </Card>
        </>
      )}

      <ProfileMenu person={p} open={menu} onClose={() => setMenu(false)} onReport={() => setReporting(true)} toggle={toggle} />
      {reporting && <ReportSheet kind="user" targetId={p.id} onClose={() => setReporting(false)} />}
    </Screen>
  );
}

function ProfileMenu({
  person,
  open,
  onClose,
  onReport,
  toggle,
}: {
  person: PublicProfile;
  open: boolean;
  onClose: () => void;
  onReport: () => void;
  toggle: ReturnType<typeof useBlockToggle>;
}) {
  const c = useColors();
  const blocked = !!person.blockedByMe;
  const rows = [
    { key: 'reportar', label: 'Reportar esta cuenta', hint: 'Lo revisa el equipo de MatchMate.', icon: Flag, danger: false, run: onReport },
    blocked
      ? { key: 'desbloquear', label: `Desbloquear a ${person.name}`, hint: 'Vuelven a ver las publicaciones del otro', icon: UserCheck, danger: false, run: toggle.unblock }
      : { key: 'bloquear', label: `Bloquear a ${person.name}`, hint: 'Dejan de seguirse y no te encuentra', icon: UserX, danger: true, run: toggle.block },
  ];
  return (
    <Sheet open={open} onClose={onClose} title={person.name}>
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <Pressable
            key={r.key}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              void r.run();
            }}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 16, paddingHorizontal: 16, backgroundColor: pressed ? c.surface2 : c.surface })}
          >
            <Icon size={20} color={r.danger ? c.danger : c.fg} />
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong" tone={r.danger ? 'danger' : 'fg'}>
                {r.label}
              </Txt>
              <Txt variant="meta" tone="muted">
                {r.hint}
              </Txt>
            </View>
          </Pressable>
        );
      })}
    </Sheet>
  );
}

/** Sus publicaciones que puedes ver. */
function UserPosts({ userId, name }: { userId: string; name: string }) {
  const c = useColors();
  const posts = useUserPosts(userId);
  const first = name.split(/\s+/)[0] || name;
  return <PostList list={posts} empty={<Empty icon={<Newspaper size={28} color={c.accent} />} title="Todavía no hay publicaciones" text={`Cuando ${first} publique algo que puedas ver, sale aquí.`} />} />;
}

/** Sus juegos (los de ligas que puedes ver). */
function UserGames({ userId, name, isMe }: { userId: string; name: string; isMe: boolean }) {
  const c = useColors();
  const games = useProfileGames(userId, null);
  const first = name.split(/\s+/)[0] || name;
  return (
    <GameList
      games={games}
      empty={
        <Empty
          icon={<Trophy size={28} color={c.accent} />}
          title="Todavía no hay juegos"
          text={isMe ? 'Cuando juegues en una liga, tus juegos salen aquí para que los demás te den me gusta.' : `Cuando ${first} juegue en ligas que puedas ver, sus juegos salen aquí.`}
        />
      }
    />
  );
}
