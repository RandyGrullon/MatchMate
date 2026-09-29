import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Award, BarChart3, CalendarDays, Heart, Trophy, UserRound } from 'lucide-react';
import { invalidate } from '../../lib/data/client';
import { peopleTags, usePublicProfile, type FollowKind, type PublicProfile } from '../../lib/data/follows';
import { useProfileGames, useProfileStats } from '../../lib/data/profileGames';
import { useActiveSport } from '../../lib/sportContext';
import { sportMeta } from '../../sports/registry';
import type { SportId } from '../../sports/types';
import { Avatar } from '../Avatar';
import { ReportButton } from '../report/ReportButton';
import { AnimatedNumber, Badge, Card, Empty, LoadError, Skeleton, Tabs, cx } from '../ui';
import { FollowButton } from './FollowButton';
import { FollowersSheet } from './FollowersSheet';
import { GameList } from './GameList';
import { SportBadge } from './SportBadge';
import { SportStats } from './SportStats';
import { atUsername, initialProfileSport, knownSports } from './socialFormat';

type ProfileTab = 'juegos' | 'estadisticas' | 'insignias';

// Las insignias traen el catálogo y el dibujo: se cargan aparte (la pestaña y las destacadas debajo del nombre).
const ProfileBadgesTab = lazy(() => import('../badges/ProfileBadges'));
const FeaturedBadges = lazy(() => import('../badges/ProfileBadges').then((m) => ({ default: m.FeaturedBadges })));

function BadgesSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando insignias">
      <Skeleton className="h-6 w-32" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** «Desde septiembre de 2026». */
function sinceText(iso: string | null): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  return `En MatchMate desde ${new Date(t).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })}`;
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando perfil">
      <Card className="flex flex-col items-center gap-3 p-5">
        <Skeleton className="size-20 rounded-full" />
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-32" />
        <div className="grid w-full grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-11 w-full rounded-xl" />
      </Card>
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}

function Counter({ value, label, onClick, icon }: { value: number; label: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 flex-col items-center justify-center rounded-xl px-1 py-2 transition hover:bg-surface-2 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="flex items-center gap-1 text-lg leading-tight font-bold tabular-nums">
        {icon}
        <AnimatedNumber value={value} />
      </span>
      <span className="text-xs text-muted">{label}</span>
    </button>
  );
}

/**
 * Perfil de una cuenta (el público `/u/:userId` y el tuyo `/perfil`): cabecera con iniciales, nombre, @usuario,
 * deportes y los números Seguidores / Siguiendo / Me gusta (tocar abre la lista), el botón Seguir (no en el tuyo:
 * ahí van `actions`), hasta 3 insignias destacadas y las pestañas «Juegos» (con me gusta y «Ver más»),
 * «Estadísticas» (resumen por deporte) e «Insignias» (la vitrina, src/components/badges; `?tab=insignias`).
 */
export function ProfileView({
  userId,
  fallbackName,
  fallbackUsername,
  actions,
  back,
  statsTop,
  skipBowlingStats,
}: {
  userId: string;
  /** Tu nombre mientras el perfil no llega (tu propio perfil). */
  fallbackName?: string;
  /** Tu @usuario mientras el perfil no llega (sin la @). */
  fallbackUsername?: string;
  /** En tu propio perfil: editar y cuenta (en vez de «Seguir»). */
  actions?: ReactNode;
  /** Flecha para volver (arriba a la izquierda). */
  back?: ReactNode;
  /** Arriba de «Estadísticas» (tu perfil: tus números del boliche de siempre). */
  statsTop?: ReactNode;
  /** El boliche ya sale en `statsTop`. */
  skipBowlingStats?: boolean;
}) {
  const profile = usePublicProfile(userId);
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const tab: ProfileTab = rawTab === 'estadisticas' || rawTab === 'insignias' ? rawTab : 'juegos';
  const [sheet, setSheet] = useState<FollowKind | null>(null);

  const setTab = (t: ProfileTab) =>
    setParams(
      (p) => {
        if (t === 'juegos') p.delete('tab');
        else p.set('tab', t);
        return p;
      },
      { replace: true },
    );

  const p: PublicProfile | null =
    profile.data ??
    (fallbackName && !profile.loading
      ? { id: userId, name: fallbackName, username: fallbackUsername ?? '', since: null, sports: [], followers: 0, following: 0, likesReceived: 0, gamesCount: 0, isFollowing: false, followsYou: false, isMe: true }
      : null);

  if (profile.loading && !p) return <ProfileSkeleton />;
  if (profile.error && !p) return <LoadError error={profile.error} onRetry={() => invalidate(peopleTags.user(userId))} />;
  if (!p) {
    return (
      <Empty icon={<UserRound className="size-7" aria-hidden="true" />} title="No encontramos este perfil">
        Puede que la cuenta ya no exista o que no esté disponible.
        <div className="mt-3 flex justify-center">
          <Link to="/" className="inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-accent hover:bg-accent-soft">
            Volver al Home
          </Link>
        </div>
      </Empty>
    );
  }

  const sports = knownSports(p.sports);
  const since = sinceText(p.since);
  const handle = atUsername(p.username);

  return (
    <div className="flex flex-col gap-5">
      <section className="relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-accent-soft via-surface to-surface p-5 text-center">
        {back && <div className="absolute top-3 left-3">{back}</div>}
        {/* El perfil de otra cuenta: «Reportar esta cuenta» arriba a la derecha. */}
        {!p.isMe && (
          <div className="absolute top-3 right-3">
            <ReportButton kind="user" targetId={p.id} ownerId={p.id} />
          </div>
        )}
        <Avatar name={p.name} className="size-20 text-2xl ring-4 ring-surface" />
        <div className="flex min-w-0 max-w-full flex-col items-center gap-1">
          <h1 className="max-w-full truncate text-2xl font-bold tracking-tight">{p.name}</h1>
          {handle && <p className="-mt-1 max-w-full truncate text-sm text-muted">{handle}</p>}
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted">
            {p.followsYou && !p.isMe && <Badge>Te sigue</Badge>}
            {since && <span>{since}</span>}
          </div>
        </div>
        <Suspense fallback={null}>
          <FeaturedBadges userId={p.id} />
        </Suspense>
        {sports.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5" aria-label="Deportes">
            {sports.map((s) => (
              <SportBadge key={s} sport={s} />
            ))}
          </div>
        )}
        <div className="grid w-full max-w-sm grid-cols-3 gap-1 rounded-2xl bg-surface/70 p-1">
          <Counter value={p.followers} label={p.followers === 1 ? 'Seguidor' : 'Seguidores'} onClick={() => setSheet('followers')} />
          <Counter value={p.following} label="Siguiendo" onClick={() => setSheet('following')} />
          <Counter
            value={p.likesReceived}
            label="Me gusta"
            icon={<Heart className={cx('size-4', p.likesReceived > 0 ? 'fill-danger text-danger' : 'text-muted')} aria-hidden="true" />}
            onClick={() => setTab('juegos')}
          />
        </div>
        <div className="flex w-full max-w-sm flex-wrap justify-center gap-2">
          {p.isMe ? actions : <FollowButton userId={p.id} name={p.name} following={p.isFollowing} followsYou={p.followsYou} className="w-full" />}
        </div>
      </section>

      <Tabs<ProfileTab>
        items={[
          { key: 'juegos', label: 'Juegos', icon: <Trophy className="size-4" aria-hidden="true" /> },
          { key: 'estadisticas', label: 'Estadísticas', icon: <BarChart3 className="size-4" aria-hidden="true" /> },
          { key: 'insignias', label: 'Insignias', icon: <Award className="size-4" aria-hidden="true" /> },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'juegos' ? (
        <GamesTab userId={p.id} sports={sports} isMe={p.isMe} name={p.name} />
      ) : tab === 'insignias' ? (
        <Suspense fallback={<BadgesSkeleton />}>
          <ProfileBadgesTab userId={p.id} name={p.name} sports={sports} />
        </Suspense>
      ) : (
        <div className="flex flex-col gap-5">
          {statsTop}
          <StatsTab userId={p.id} skipBowling={skipBowlingStats} isMe={p.isMe} />
        </div>
      )}

      <FollowersSheet
        userId={p.id}
        name={p.name}
        kind={sheet}
        counts={{ followers: p.followers, following: p.following }}
        onKind={setSheet}
        onClose={() => setSheet(null)}
      />
    </div>
  );
}

function GamesTab({ userId, sports, isMe, name }: { userId: string; sports: SportId[]; isMe: boolean; name: string }) {
  const active = useActiveSport();
  // undefined = no ha tocado: el deporte en que estás (si lo juega); null = todos.
  const [pick, setPick] = useState<SportId | null | undefined>(undefined);
  const sport = pick === undefined ? initialProfileSport(active, sports) : pick;
  const games = useProfileGames(userId, sport);
  const meta = sportMeta(sport);
  const first = name.split(/\s+/)[0] || name;

  return (
    <div className="flex flex-col gap-3">
      {sports.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filtrar por deporte">
          <Chip on={sport == null} onClick={() => setPick(null)}>
            Todos
          </Chip>
          {sports.map((s) => (
            <Chip key={s} on={sport === s} onClick={() => setPick(s)}>
              {sportMeta(s)?.short ?? s}
            </Chip>
          ))}
        </div>
      )}
      <GameList
        key={sport ?? '*'}
        games={games}
        empty={
          <Empty icon={<CalendarDays className="size-7" aria-hidden="true" />} title={meta ? `Sin juegos de ${meta.lower}` : 'Todavía no hay juegos'}>
            {isMe
              ? 'Cuando juegues en una liga, tus juegos salen aquí para que los demás te den me gusta.'
              : `Cuando ${first} juegue en ligas que puedas ver, sus juegos salen aquí.`}
          </Empty>
        }
      />
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition active:scale-[0.97] sm:h-9',
        on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function StatsTab({ userId, skipBowling, isMe }: { userId: string; skipBowling?: boolean; isMe: boolean }) {
  const stats = useProfileStats(userId);
  return (
    <SportStats
      stats={stats.data}
      loading={stats.loading}
      error={stats.error}
      onRetry={() => invalidate(peopleTags.user(userId))}
      skipBowling={skipBowling}
      emptyText={skipBowling ? null : isMe ? 'Cuando juegues en alguna liga, aquí salen tus números de cada deporte.' : undefined}
    />
  );
}
