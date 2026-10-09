import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { MessageCircle, SearchX } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { invalidate } from '../lib/data/client';
import { postTags, usePost, usePostComments } from '../lib/data/posts';
import { CommentBox, CommentList, COMMENT_BOX_ID } from '../components/posts/Comments';
import { PostCard } from '../components/posts/PostCard';
import { PostCardsSkeleton } from '../components/posts/PostList';
import { ScreenTop, SignInCard, linkButton } from '../components/screens/ScreenBits';
import { AppShell } from '../components/Shell';
import { compactCount } from '../components/social/socialFormat';
import { Card, LoadError, Loading } from '../components/ui';

/**
 * Una publicación (`/p/:postId`; los avisos de me gusta y comentarios llevan aquí): «‹ Social», la publicación entera
 * (con su menú: borrar, reportar, bloquear), sus comentarios como globos y la caja para comentar fija abajo. Si ya no
 * está o no la puedes ver (la borraron, es para sus seguidores o su liga, o hay un bloqueo), lo dice. Sin cuenta: entrar.
 */
export default function PostPage() {
  const { postId } = useParams();
  const auth = useAuth();

  if (auth.loading) return <Loading />;
  if (!auth.user) {
    const next = encodeURIComponent(postId ? `/p/${postId}` : '/social');
    return (
      <AppShell>
        <div className="flex flex-col px-2">
          <ScreenTop label="Social" fallback="/social" />
          <SignInCard className="mt-2" icon={<MessageCircle />} title="Entra para ver esta publicación" text="Dale me gusta, comenta y sigue a quien la publicó." next={next} />
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell>
      {/* Otra publicación (desde un aviso): todo vuelve a empezar (la caja, el scroll). */}
      {postId ? <PostScreen key={postId} postId={postId} /> : <NotFound />}
    </AppShell>
  );
}

function PostScreen({ postId }: { postId: string }) {
  const post = usePost(postId);
  const comments = usePostComments(postId);
  const navigate = useNavigate();
  const location = useLocation();
  const p = post.data;

  // Se borró o bloqueaste a quien la escribió: de vuelta a donde estaba.
  const leave = () => (location.key !== 'default' ? navigate(-1) : navigate('/social', { replace: true }));
  const focusBox = () => {
    const box = document.getElementById(COMMENT_BOX_ID);
    box?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    box?.focus({ preventScroll: true });
  };

  if (post.loading && !p) {
    return (
      <div className="flex flex-col px-2">
        <ScreenTop label="Social" fallback="/social" />
        <div className="mt-2">
          <PostCardsSkeleton rows={1} />
        </div>
      </div>
    );
  }
  if (post.error && !p) {
    return (
      <div className="flex flex-col px-2">
        <ScreenTop label="Social" fallback="/social" />
        <LoadError error={post.error} onRetry={() => invalidate(postTags.post(postId))} />
      </div>
    );
  }
  if (!p) return <NotFound />;

  return (
    <div className="flex flex-col px-2">
      <ScreenTop label="Social" fallback="/social" />
      <div className="mt-2">
        <PostCard post={p} detail onComment={focusBox} onGone={leave} />
      </div>
      <section aria-labelledby="comentarios" className="mt-7">
        <h2 id="comentarios" className="mx-1 mb-3 text-section">
          Comentarios{p.comments > 0 ? <span className="ml-1.5 text-muted">{compactCount(p.comments)}</span> : null}
        </h2>
        <CommentList list={comments} />
      </section>
      <CommentBox postId={p.id} className="mt-4" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col px-2">
      <ScreenTop label="Social" fallback="/social" />
      <Card className="mt-2 flex flex-col items-center px-5 pt-7 pb-5 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <SearchX className="size-7" />
        </span>
        <h1 className="mt-4 text-card-title">Esta publicación ya no está o no la puedes ver</h1>
        <p className="mt-2 max-w-sm text-body text-muted">Puede que la hayan borrado o que sea solo para sus seguidores o su liga.</p>
        <Link to="/social" className={linkButton('quiet', 'mt-6 w-full')}>
          Ir a Social
        </Link>
      </Card>
    </div>
  );
}
