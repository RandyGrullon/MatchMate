import { lazy, Suspense, useState } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { Newspaper, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { invalidate } from '../lib/data/client';
import { peopleTags, usePublicProfile, type FollowKind } from '../lib/data/follows';
import { useUserPosts } from '../lib/data/posts';
import { AppShell } from '../components/Shell';
import { useIsPro } from '../components/mode';
import { PostList } from '../components/posts/PostList';
import { BlockedCard, ProfileMoreMenu } from '../components/profile/BlockControls';
import { ProfileAvatar } from '../components/profile/ProfileAvatar';
import { ReportButton } from '../components/report/ReportButton';
import { ScreenTop, SignInCard, linkButton } from '../components/screens/ScreenBits';
import { FollowButton } from '../components/social/FollowButton';
import { FollowersSheet } from '../components/social/FollowersSheet';
import { GamesTab, StatsTab } from '../components/social/ProfileView';
import { atUsername, compactCount, knownSports, sportShort } from '../components/social/socialFormat';
import { Card, Empty, LoadError, Loading, Skeleton, Tabs, cx } from '../components/ui';

// Las insignias traen el catálogo y el dibujo: se cargan aparte (la vitrina y las destacadas debajo del nombre).
const ProfileBadgesTab = lazy(() => import('../components/badges/ProfileBadges'));
const FeaturedBadges = lazy(() => import('../components/badges/ProfileBadges').then((m) => ({ default: m.FeaturedBadges })));

type ProfileTab = 'publicaciones' | 'juegos' | 'estadisticas' | 'insignias';

/** `?tab=` → la parte que se ve (Publicaciones si no dice otra). */
export const profileTab = (raw: string | null): ProfileTab =>
  raw === 'juegos' || raw === 'estadisticas' || raw === 'insignias' ? raw : 'publicaciones';

/** «@anaperez · Boliche y pádel · Desde octubre de 2026»: su usuario, sus deportes y desde cuándo está. */
export function profileLine(p: { username?: string | null; sports?: readonly string[] | null; since?: string | null }): string {
  const sports = knownSports(p.sports).map((s, i) => (i === 0 ? sportShort(s) : sportShort(s).toLowerCase()));
  const sportsText = sports.length > 1 ? `${sports.slice(0, -1).join(', ')} y ${sports.at(-1)}` : sports[0];
  const t = p.since ? Date.parse(p.since) : NaN;
  const since = Number.isFinite(t) ? `Desde ${new Date(t).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })}` : null;
  return [atUsername(p.username), sportsText, since].filter(Boolean).join(' · ');
}

/**
 * Perfil público de una cuenta (`/u/:userId`), rediseño «Calma y foco» (como Yo): «‹ Atrás» con «Reportar esta cuenta»
 * y «•••» (Bloquear) a la derecha; su foto (o sus iniciales), su nombre y «@usuario · sus deportes · desde cuándo» (y
 * «Te sigue»), su biografía, sus insignias destacadas, un solo botón Seguir; Publicaciones · Seguidores · Siguiendo ·
 * Me gusta en una tarjeta (tocar abre la lista o la parte) y «Publicaciones | Juegos | Estadísticas | Insignias»
 * (`?tab=`; sin nada, Publicaciones). Si la bloqueaste, en vez de todo eso «Bloqueaste a …» con «Desbloquear». Lo que
 * se ve lo decide la base: solo ligas que puedes ver y nunca las de menores; si esa cuenta te bloqueó (o ya no existe),
 * «No encontramos este perfil». Tu propio perfil va a `/perfil`.
 */
export default function UserProfilePage() {
  const { userId } = useParams();
  const auth = useAuth();
  const { search } = useLocation();

  if (auth.loading) return <Loading />;
  if (!userId) {
    return (
      <AppShell>
        <NotFound />
      </AppShell>
    );
  }
  // Tu propio perfil, con lo que pida el link (los push de insignias abren `/u/<tú>?tab=insignias`).
  if (auth.user?.uid === userId) return <Navigate to={{ pathname: '/perfil', search }} replace />;
  if (!auth.user) {
    const next = encodeURIComponent(`/u/${userId}${search}`);
    return (
      <AppShell>
        <div className="flex flex-col px-2">
          <ScreenTop label="Atrás" fallback="/" />
          <SignInCard className="mt-2" icon={<UserRound />} title="Entra para ver este perfil" text="Ve sus publicaciones y sus juegos, y síguelo." next={next} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Otra cuenta desde una lista de seguidores: todo vuelve a empezar (pestaña, filtro, hoja). */}
      <PublicProfile key={userId} userId={userId} />
    </AppShell>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col px-2">
      <ScreenTop label="Atrás" fallback="/" />
      <Card className="mt-2 flex flex-col items-center px-5 pt-7 pb-5 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <UserRound className="size-7" />
        </span>
        <h1 className="mt-4 text-card-title">No encontramos este perfil</h1>
        <p className="mt-2 max-w-sm text-body text-muted">Puede que la cuenta ya no exista o que no esté disponible.</p>
        <Link to="/" className={linkButton('quiet', 'mt-6 w-full')}>
          Ir a Hoy
        </Link>
      </Card>
    </div>
  );
}

/** El perfil de otra cuenta (ya con sesión). */
function PublicProfile({ userId }: { userId: string }) {
  const profile = usePublicProfile(userId);
  const pro = useIsPro();
  const [params, setParams] = useSearchParams();
  const tab = profileTab(params.get('tab'));
  const [sheet, setSheet] = useState<FollowKind | null>(null);
  const p = profile.data;

  const setTab = (t: ProfileTab) =>
    setParams(
      (prev) => {
        if (t === 'publicaciones') prev.delete('tab');
        else prev.set('tab', t);
        return prev;
      },
      { replace: true },
    );

  const top = (
    <ScreenTop
      label="Atrás"
      fallback="/"
      right={
        p && !p.isMe ? (
          <>
            <ReportButton kind="user" targetId={p.id} ownerId={p.id} className="rounded-full! bg-surface-2 text-fg-2!" />
            <ProfileMoreMenu person={p} blocked={!!p.blockedByMe} />
          </>
        ) : undefined
      }
    />
  );

  if (profile.loading && !p) {
    return (
      <div className="flex flex-col px-2" aria-busy="true" aria-label="Cargando perfil">
        {top}
        <div className="mt-2 flex items-center gap-4">
          <Skeleton className="size-[72px] rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        </div>
        <Skeleton className="mt-6 h-btn rounded-btn" />
        <Skeleton className="mt-3.5 h-[86px] rounded-3xl" />
      </div>
    );
  }
  if (profile.error && !p) {
    return (
      <div className="flex flex-col px-2">
        {top}
        <LoadError error={profile.error} onRetry={() => invalidate(peopleTags.user(userId))} />
      </div>
    );
  }
  if (!p) return <NotFound />;

  const blocked = !!p.blockedByMe;
  const sports = knownSports(p.sports);
  const line = profileLine(p);
  const bio = p.bio?.trim();
  const posts = p.posts ?? 0;
  const counters: { key: string; value: number; label: string; onClick: () => void }[] = [
    { key: 'posts', value: posts, label: posts === 1 ? 'Publicación' : 'Publicaciones', onClick: () => setTab('publicaciones') },
    { key: 'followers', value: p.followers, label: p.followers === 1 ? 'Seguidor' : 'Seguidores', onClick: () => setSheet('followers') },
    { key: 'following', value: p.following, label: 'Siguiendo', onClick: () => setSheet('following') },
    { key: 'likes', value: p.likesReceived, label: 'Me gusta', onClick: () => setTab('juegos') },
  ];

  return (
    <div className="flex flex-col px-2">
      {top}
      <div className={cx('flex items-center', pro ? 'mt-1 gap-3.5' : 'mt-2 gap-4')}>
        <ProfileAvatar name={p.name} photo={p.avatar} className={pro ? 'size-[60px] text-[21px]' : 'size-[72px] text-[25px]'} />
        <div className="min-w-0">
          <h1 className={cx('truncate font-bold', pro ? 'text-[22px] leading-[1.2] tracking-[-0.02em]' : 'text-[26px] leading-[1.15] tracking-[-0.025em]')}>{p.name}</h1>
          {line && <p className={cx('line-clamp-2 text-muted', pro ? 'mt-0.5 text-sm' : 'mt-[3px] text-meta')}>{line}</p>}
          {p.followsYou && !p.isMe && !blocked && (
            <span className="mt-1.5 inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-semibold text-fg-2">Te sigue</span>
          )}
        </div>
      </div>

      {bio && !blocked && <p className={cx('mt-3.5 break-words text-fg-2', pro ? 'text-sm' : 'text-body')}>{bio}</p>}

      {!blocked && (
        <Suspense fallback={null}>
          <div className="mt-4 empty:hidden">
            <FeaturedBadges userId={p.id} />
          </div>
        </Suspense>
      )}

      {!p.isMe && !blocked && (
        <FollowButton
          userId={p.id}
          name={p.name}
          following={p.isFollowing}
          followsYou={p.followsYou}
          className={cx('mt-5 w-full gap-2.5! tracking-[-0.01em]', pro ? 'h-btn-pro! rounded-[15px]! text-base!' : 'h-btn! rounded-btn! text-[17px]!')}
        />
      )}

      <Card className="mt-3.5 overflow-hidden">
        <div className="grid grid-cols-4">
          {counters.map((c, i) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onClick}
              disabled={blocked}
              className={cx(
                'relative flex min-h-[76px] min-w-0 flex-col justify-center px-3 py-3 text-left transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:active:bg-transparent max-[389px]:px-2',
                i > 0 && "before:absolute before:inset-y-[14px] before:left-0 before:w-px before:bg-line before:content-['']",
              )}
            >
              <b className="num text-[23px] leading-[1.15] font-[650]">{compactCount(c.value)}</b>
              <span className="truncate text-[11px] font-[550] text-muted min-[390px]:text-xs">{c.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {blocked ? (
        <BlockedCard person={p} className="mt-[26px]" />
      ) : (
        <>
          <div className="mt-[26px]">
            <Tabs<ProfileTab>
              items={[
                { key: 'publicaciones', label: 'Publicaciones' },
                { key: 'juegos', label: 'Juegos' },
                { key: 'estadisticas', label: 'Estadísticas' },
                { key: 'insignias', label: 'Insignias' },
              ]}
              active={tab}
              onChange={setTab}
            />
          </div>

          <div className="mt-5">
            {tab === 'publicaciones' ? (
              <UserPosts userId={p.id} name={p.name} />
            ) : tab === 'juegos' ? (
              <GamesTab userId={p.id} sports={sports} isMe={p.isMe} name={p.name} />
            ) : tab === 'insignias' ? (
              <Suspense fallback={<Skeleton className="h-64 rounded-3xl" />}>
                <ProfileBadgesTab userId={p.id} name={p.name} sports={sports} />
              </Suspense>
            ) : (
              <StatsTab userId={p.id} isMe={p.isMe} />
            )}
          </div>
        </>
      )}

      <FollowersSheet
        userId={p.id}
        name={p.name}
        kind={blocked ? null : sheet}
        counts={{ followers: p.followers, following: p.following }}
        onKind={setSheet}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}

/** Sus publicaciones que puedes ver (las que publicó para todos, para sus seguidores si lo sigues y las de tus ligas). */
function UserPosts({ userId, name }: { userId: string; name: string }) {
  const posts = useUserPosts(userId);
  const first = name.split(/\s+/)[0] || name;
  return (
    <PostList
      list={posts}
      empty={
        <Empty icon={<Newspaper className="size-7" aria-hidden="true" />} title="Todavía no hay publicaciones">
          Cuando {first} publique algo que puedas ver, sale aquí.
        </Empty>
      }
    />
  );
}
