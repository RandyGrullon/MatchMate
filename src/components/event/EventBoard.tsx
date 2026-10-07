import type { Player } from '../../lib/types';
import { initials } from '../Avatar';
import { Card, ListRow, SectionHeader, cx } from '../ui';
import { boardLine, type BoardRow } from './board';
import { LiveDot } from '../home/TodayCard';

/** El puesto (18 px) y la cara de una fila de «Cómo van todos». La propia, en el color del deporte. */
function Lead({ pos, name, me }: { pos: number; name: string; me: boolean }) {
  return (
    <>
      <span className="num w-[18px] shrink-0 text-center text-meta font-semibold text-muted">{pos}</span>
      <span
        aria-hidden="true"
        className={cx(
          'grid size-10 shrink-0 place-items-center rounded-full text-sm font-[650]',
          me ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg-2',
        )}
      >
        {initials(name)}
      </span>
    </>
  );
}

/** La etiqueta «Tú» al lado del nombre. */
export function MeTag({ className }: { className?: string }) {
  return (
    <span className={cx('mm-ev-tag ml-1.5 inline-flex h-[22px] items-center rounded-full px-2 align-[2px] text-xs font-[650] text-accent', className)}>
      Tú
    </span>
  );
}

/**
 * «Cómo van todos» (Lite): la misma tabla que la Planilla de Pro, como lista. Cada fila con su puesto, su cara, sus juegos
 * («212 · 245 · 201», lo que falta por aprobar en gris y «jugando el 3» si es el tuyo a medias) y el total, que solo suma
 * lo aprobado. Tocar una fila abre el juego (felicitar y comentar), si ya está en la planilla.
 */
export function EventBoard({
  rows,
  players,
  me,
  live,
  past,
  onOpen,
  className,
}: {
  rows: readonly BoardRow[];
  players: readonly Player[];
  me: string | null;
  /** Se está jugando ahora: «● En vivo» al lado del título. */
  live: boolean;
  /** Ya pasó: «Resultados» en vez de «Cómo van todos». */
  past: boolean;
  onOpen?: (row: BoardRow) => void;
  className?: string;
}) {
  if (!rows.length) return null;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Jugador';
  const greyed = rows.some((r) => r.cells.some((c) => c.kind !== 'ok' && c.kind !== 'empty' && !c.partial));
  return (
    <section className={className} aria-labelledby="como-van-todos">
      <SectionHeader
        id="como-van-todos"
        title={past ? 'Resultados' : 'Cómo van todos'}
        action={
          live && (
            <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-accent">
              <LiveDot />
              En vivo
            </span>
          )
        }
      />
      <Card className="overflow-hidden">
        {rows.map((r) => {
          const name = nameOf(r.playerId);
          const mine = r.playerId === me;
          const line = boardLine(r.cells);
          return (
            <ListRow
              key={r.playerId}
              me={mine}
              leading={<Lead pos={r.pos} name={name} me={mine} />}
              title={
                <>
                  {name}
                  {mine && <MeTag />}
                </>
              }
              subtitle={
                <span className="tabular-nums tracking-[0.01em]">
                  {line.map((g, k) => (
                    <span key={k}>
                      {k > 0 && ' · '}
                      <span className={g.faint ? 'text-faint' : undefined}>{g.text}</span>
                    </span>
                  ))}
                </span>
              }
              value={r.total}
              chevron={false}
              onClick={onOpen && r.entry ? () => onOpen(r) : undefined}
              ariaLabel={`${r.pos}. ${name}: ${r.total}`}
            />
          );
        })}
      </Card>
      {greyed && <p className="mt-3.5 text-center text-[13px] text-muted">En gris, los que faltan por aprobar · solo suman los aprobados</p>}
    </section>
  );
}
