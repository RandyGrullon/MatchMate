import { cx } from '../ui';

/**
 * El color de la bola (el de la bola de verdad, para reconocerla). Con borde para que una blanca o una negra se vea
 * en el tema claro y en el oscuro; sin bola, un círculo punteado.
 */
export function BallDot({ color, className }: { color: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block shrink-0 rounded-full border',
        color ? 'border-line shadow-[inset_-2px_-2px_4px_rgb(0_0_0/0.25)]' : 'border-dashed border-muted',
        className ?? 'size-4',
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
