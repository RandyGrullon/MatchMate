import { Link } from 'react-router';
import { ChevronRight, Heart, MessageCircle } from 'lucide-react';
import { useSocialFeed, type Post } from '../../lib/data/posts';
import { Avatar } from '../Avatar';
import { postPath, postSnippet } from '../posts/postFormat';
import { compactCount } from '../social/socialFormat';
import { Card, SectionHeader, cx, sectionLinkClass } from '../ui';

/** Publicaciones que se ven en Hoy (las demás, en Social). */
const SOCIAL_SHOWN = 2;

/**
 * «Social» en Hoy: las 2 publicaciones más nuevas de tu gente (quien sigues, tus ligas y las que sigues) en filas cortas
 * (foto, nombre, la primera línea o «📷 Foto», me gusta y comentarios), con «Ver todo» a Social. Si no hay nada, todavía
 * no llega o no se pudo leer, no sale (Hoy no se llena de avisos).
 */
export function SocialSlot({ className }: { className?: string }) {
  const feed = useSocialFeed('following');
  const posts = feed.data.slice(0, SOCIAL_SHOWN);
  if (!posts.length) return null;
  return (
    <section aria-labelledby="social-hoy" className={className}>
      <SectionHeader
        id="social-hoy"
        title="Social"
        action={
          <Link to="/social" className={sectionLinkClass}>
            Ver todo
          </Link>
        }
      />
      <Card className="overflow-hidden">
        {posts.map((p) => (
          <SocialRow key={p.id} post={p} />
        ))}
      </Card>
    </section>
  );
}

/** Una fila corta: toda la fila abre la publicación (los números van adentro, no tapan el toque). */
function SocialRow({ post }: { post: Post }) {
  const name = post.author.name.trim() || 'Alguien';
  return (
    <Link
      to={postPath(post.id)}
      aria-label={`Publicación de ${name}: ${postSnippet(post)}`}
      className="mm-row relative flex min-h-row items-center gap-3.5 py-2.5 pr-[18px] pl-5 transition active:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <Avatar name={name} photo={post.author.avatar} className="size-10 text-sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold tracking-[-0.01em]">{post.isMine ? 'Tú' : name}</span>
        <span className="mt-0.5 block truncate text-sm text-muted">{postSnippet(post)}</span>
      </span>
      {(post.likes > 0 || post.comments > 0) && (
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-semibold text-muted tabular-nums" aria-hidden="true">
          {post.likes > 0 && (
            <span className={cx('inline-flex items-center gap-1', post.likedByMe && 'text-danger')}>
              <Heart className={cx('size-3.5', post.likedByMe && 'fill-current')} /> {compactCount(post.likes)}
            </span>
          )}
          {post.comments > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-3.5" /> {compactCount(post.comments)}
            </span>
          )}
        </span>
      )}
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />
    </Link>
  );
}
