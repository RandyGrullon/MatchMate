import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { MessagesSquare, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLeagueSocial } from '../lib/data/leagueSocial';
import { useLeaguePosts } from '../lib/data/posts';
import { useLeagueCtx } from '../lib/league';
import { leagueSport } from '../sports/registry';
import { useIsPro } from '../components/mode';
import { ComposerCard, type ComposerLeague } from '../components/posts/Composer';
import { PostList } from '../components/posts/PostList';
import { ScreenTitle, SignInCard } from '../components/screens/ScreenBits';
import { Card } from '../components/ui';

/**
 * El muro de la liga (`/l/:lid/muro`, dentro de la liga): «Muro», «¿Qué pasó en la liga?» para publicar (solo
 * miembros: `canPost`) y las publicaciones de la liga sin repetir la liga en cada una. En una liga con menores lo social
 * está apagado y lo dice con calma. Sin cuenta: entrar.
 */
export default function LeagueWallPage() {
  const { lid, league } = useLeagueCtx();
  const auth = useAuth();
  const pro = useIsPro();
  const location = useLocation();
  const torneo = league.kind === 'torneo';
  const title = <ScreenTitle title="Muro" hint={`Lo que cuentan ${torneo ? 'en el torneo' : 'en la liga'}`} pro={pro} />;

  if (league.hasMinors) {
    return (
      <div className="flex flex-col px-2">
        {title}
        <Card className="mt-5 flex flex-col items-center px-5 pt-7 pb-6 text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
            <ShieldCheck className="size-7" />
          </span>
          <h2 className="mt-4 text-section">Aquí no hay muro</h2>
          <p className="mt-1.5 max-w-sm text-meta text-muted">
            {torneo ? 'Este torneo' : 'Esta liga'} tiene menores, así que las publicaciones y los comentarios están apagados para cuidarlos.
          </p>
        </Card>
      </div>
    );
  }

  if (!auth.loading && !auth.user) {
    return (
      <div className="flex flex-col px-2">
        {title}
        <SignInCard
          className="mt-5"
          icon={<MessagesSquare />}
          title="Entra para ver el muro"
          text={`Lo que publican ${torneo ? 'los del torneo' : 'los de la liga'}: fotos, resultados y más.`}
          next={encodeURIComponent(location.pathname + location.search)}
        />
      </div>
    );
  }

  return (
    <Wall
      lid={lid}
      title={title}
      torneo={torneo}
      composer={{ id: lid, name: league.name, sport: leagueSport(league), visibility: league.visibility }}
    />
  );
}

function Wall({ lid, title, torneo, composer }: { lid: string; title: ReactNode; torneo: boolean; composer: ComposerLeague }) {
  const social = useLeagueSocial(lid);
  const posts = useLeaguePosts(lid);
  const canPost = !!social.data?.canPost;
  return (
    <div className="flex flex-col px-2">
      {title}
      {canPost && (
        <div className="mt-5">
          <ComposerCard league={composer} placeholder={torneo ? '¿Qué pasó en el torneo?' : '¿Qué pasó en la liga?'} />
        </div>
      )}
      <div className="mt-4">
        <PostList
          list={posts}
          hideLeague
          empty={
            <Card className="flex flex-col items-center px-5 pt-7 pb-6 text-center">
              <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
                <MessagesSquare className="size-7" />
              </span>
              <h2 className="mt-4 text-section">Todavía no hay publicaciones</h2>
              <p className="mt-1.5 max-w-sm text-meta text-muted">
                {canPost ? 'Cuenta cómo les fue o sube la foto del día.' : `Cuando alguien ${torneo ? 'del torneo' : 'de la liga'} publique, sale aquí.`}
              </p>
            </Card>
          }
        />
      </div>
    </div>
  );
}
