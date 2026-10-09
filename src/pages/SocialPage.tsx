import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Compass, Newspaper, Search, Trophy, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useFollowingGames } from '../lib/data/profileGames';
import { useSocialFeed } from '../lib/data/posts';
import { useIsPro } from '../components/mode';
import { ComposerCard } from '../components/posts/Composer';
import { PostList } from '../components/posts/PostList';
import { SignInCard, linkButton } from '../components/screens/ScreenBits';
import { AppShell } from '../components/Shell';
import { GameList } from '../components/social/GameList';
import { SearchButton } from '../components/social/SearchButton';
import { Card, Loading, Segmented } from '../components/ui';

export type SocialTab = 'siguiendo' | 'descubrir' | 'juegos';

/** `?ver=` → la parte que se ve (Siguiendo si no dice otra). */
export const socialTab = (raw: string | null): SocialTab => (raw === 'descubrir' || raw === 'juegos' ? raw : 'siguiendo');

const TABS: { key: SocialTab; label: string }[] = [
  { key: 'siguiendo', label: 'Siguiendo' },
  { key: 'descubrir', label: 'Descubrir' },
  { key: 'juegos', label: 'Juegos' },
];

/**
 * Social (`/social`), rediseño «Calma y foco»: el título con la lupa a la derecha, «¿Qué jugaste hoy?» para publicar y
 * «Siguiendo · Descubrir · Juegos» (`?ver=`): lo de quien sigues, tus ligas y las ligas que sigues (y lo tuyo); lo
 * público de todos; y los juegos de quien sigues (con me gusta). Sin cuenta: entrar.
 */
export default function SocialPage() {
  const auth = useAuth();
  const pro = useIsPro();
  if (auth.loading) return <Loading />;
  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <header className="flex items-center justify-between gap-3">
          <h1 className={pro ? 'text-title-pro' : 'text-title'}>Social</h1>
          <SearchButton />
        </header>
        {auth.user ? (
          <SocialHome />
        ) : (
          <SignInCard
            className="mt-5"
            icon={<Users />}
            title="Entra para ver Social"
            text="Lo que publican tus amigos y tus ligas, sus juegos y lo que cuentas tú."
            next={encodeURIComponent('/social')}
          />
        )}
      </div>
    </AppShell>
  );
}

function SocialHome() {
  const [params, setParams] = useSearchParams();
  const tab = socialTab(params.get('ver'));
  const setTab = (t: SocialTab) =>
    setParams(
      (prev) => {
        if (t === 'siguiendo') prev.delete('ver');
        else prev.set('ver', t);
        return prev;
      },
      { replace: true },
    );

  return (
    <>
      <div className="mt-5">
        {/* Lo que acabas de publicar sale arriba en Siguiendo: si estabas en Juegos, te lleva ahí. */}
        <ComposerCard onPosted={() => tab === 'juegos' && setTab('siguiendo')} />
      </div>
      <Segmented<SocialTab> className="mt-5" full label="Qué ver" value={tab} onChange={setTab} options={TABS} />
      <div className="mt-4">
        {tab === 'siguiendo' ? <FollowingPosts onDiscover={() => setTab('descubrir')} /> : tab === 'descubrir' ? <DiscoverPosts /> : <FollowingGames />}
      </div>
    </>
  );
}

function FollowingPosts({ onDiscover }: { onDiscover: () => void }) {
  const list = useSocialFeed('following');
  return (
    <PostList
      list={list}
      empty={
        <EmptyCard icon={<Users />} title="Aquí sale lo de tu gente" text="Sigue a personas y ligas para ver lo que publican. O cuenta tú qué jugaste hoy.">
          <Link to="/buscar" className={linkButton('soft', 'w-full')}>
            <Search aria-hidden="true" className="size-5" />
            <span className="min-w-0 truncate">Buscar personas</span>
          </Link>
          <button type="button" onClick={onDiscover} className={linkButton('quiet', 'w-full')}>
            <Compass aria-hidden="true" className="size-5" />
            <span className="min-w-0 truncate">Ver Descubrir</span>
          </button>
        </EmptyCard>
      }
    />
  );
}

function DiscoverPosts() {
  const list = useSocialFeed('discover');
  return <PostList list={list} empty={<EmptyCard icon={<Newspaper />} title="Todavía no hay publicaciones" text="Sé el primero en contar qué jugaste." />} />;
}

function FollowingGames() {
  const games = useFollowingGames(null);
  return (
    <GameList
      games={games}
      showUser
      empty={
        <EmptyCard icon={<Trophy />} title="Todavía no hay juegos" text="Cuando alguien que sigues juegue, sus juegos salen aquí para darles me gusta.">
          <Link to="/buscar" className={linkButton('soft', 'w-full')}>
            <Search aria-hidden="true" className="size-5" />
            <span className="min-w-0 truncate">Buscar personas</span>
          </Link>
        </EmptyCard>
      }
    />
  );
}

/** Una tarjeta tranquila para lo vacío: ícono, título, una línea y, si hace falta, botones. */
function EmptyCard({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-5 pt-7 pb-5 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent [&>svg]:size-7">
        {icon}
      </span>
      <h2 className="mt-4 text-section">{title}</h2>
      <p className="mt-1.5 max-w-sm text-meta text-muted">{text}</p>
      {children && <div className="mt-5 flex w-full flex-col gap-2.5">{children}</div>}
    </Card>
  );
}
