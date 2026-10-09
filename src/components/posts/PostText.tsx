import { useMemo } from 'react';
import { cx } from '../ui';
import { linkify } from './postFormat';

/**
 * El texto de una publicación o un comentario: respeta los saltos de línea y los links (solo http y https) se abren
 * aparte, sin pasar quién mandó ni dejar que la otra página toque esta (`noopener noreferrer nofollow`).
 */
export function PostText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => linkify(text), [text]);
  return (
    <p className={cx('break-words whitespace-pre-line', className)}>
      {parts.map((p, i) =>
        p.kind === 'link' ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={(e) => e.stopPropagation()}
            className="font-medium break-all text-accent underline-offset-2 hover:underline"
          >
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}
