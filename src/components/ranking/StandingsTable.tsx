import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, cx } from '../ui';
import { cellText, type SortKey, type TableRow } from './logic';
import { TuTag } from './parts';

/** Las columnas de la tabla de Pro: lo que se ve arriba y lo que dice el lector de pantalla. */
const COLUMNS: readonly { key: SortKey | 'pos'; label: string; name: string; align: 'left' | 'center' | 'right' }[] = [
  { key: 'pos', label: '#', name: 'Puesto', align: 'left' },
  { key: 'nombre', label: 'Jugador', name: 'Jugador', align: 'left' },
  { key: 'juegos', label: 'J', name: 'Juegos', align: 'center' },
  { key: 'promedio', label: 'Prom', name: 'Promedio', align: 'right' },
  { key: 'hcp', label: 'Hcp', name: 'Handicap', align: 'right' },
  { key: 'juego', label: 'Alto', name: 'Juego más alto', align: 'right' },
  { key: 'serie', label: 'Serie', name: 'Mejor serie', align: 'right' },
  { key: 'asistencia', label: 'Asist.', name: 'Asistencia', align: 'right' },
];

/**
 * Cada columna de números mide 44 px (el ancho de un toque: su encabezado ordena) y el hueco entre columnas va adentro.
 * 384 px: en el teléfono se ve hasta «Serie» y «Asist.» queda detrás del desvanecido (se desliza).
 */
const TABLE_MIN = 'min-w-[384px]';
const GRID = cx('grid grid-cols-[22px_minmax(84px,1fr)_repeat(6,44px)] items-center pr-1 pl-2.5', TABLE_MIN);
/** Lo de la derecha deja 5 px hasta la columna siguiente (como el hueco de antes). */
const RIGHT_PAD = 'pr-[5px]';

/** El desvanecido de la derecha (mientras haya más columnas que ver). */
const FADE = 'linear-gradient(90deg, #000 calc(100% - 42px), transparent)';

/**
 * Tabla completa de Pro: # · Jugador · J · Prom · Hcp · Alto · Serie · Asist. Tocar una columna la ordena (la ordenada
 * va en el color del deporte, subrayada, y sus números más grandes). En el teléfono no cabe entera: se desliza de lado,
 * con un desvanecido a la derecha y «Desliza ›» debajo. Cada nombre abre la página del jugador; tu fila, en acento suave.
 */
export function StandingsTable({
  rows,
  sort,
  onSort,
  me,
  base,
  totalEvents,
}: {
  rows: readonly TableRow[];
  sort: SortKey;
  onSort: (key: SortKey) => void;
  me: string | null | undefined;
  base: string;
  totalEvents: number;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Sin medir (el primer dibujo, o sin navegador) se supone el teléfono: hay más a la derecha.
  const [more, setMore] = useState(true);
  const measure = useCallback(() => {
    const el = scroller.current;
    if (el) setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);
  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, rows.length]);
  // La columna resaltada: la ordenada (por nombre, el promedio).
  const strong: SortKey = sort === 'nombre' ? 'promedio' : sort;

  return (
    <>
      <Card className="mt-3.5 overflow-hidden">
        <div
          ref={scroller}
          onScroll={measure}
          className="no-scrollbar overflow-x-auto overscroll-x-contain"
          style={more ? { maskImage: FADE, WebkitMaskImage: FADE } : undefined}
        >
          <div role="table" aria-label="Tabla de la temporada" aria-rowcount={rows.length + 1} className={cx(TABLE_MIN, 'pt-1 pb-1.5')}>
            <div role="row" className={cx(GRID, 'min-h-11 text-[11px] font-bold tracking-[0.05em] text-muted uppercase')}>
              {COLUMNS.map((c) => {
                const on = c.key === sort;
                const sortable = c.key !== 'pos';
                return (
                  <div
                    key={c.key}
                    role="columnheader"
                    aria-sort={on ? (c.key === 'nombre' ? 'ascending' : 'descending') : undefined}
                    className={cx('min-w-0', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSort(c.key as SortKey)}
                        aria-label={`Ordenar por ${c.name}`}
                        className={cx(
                          // 44 px de alto y todo el ancho de su columna (las de números, 44 px).
                          'relative inline-flex h-11 w-full items-center whitespace-nowrap uppercase',
                          c.align === 'right' ? cx('justify-end', RIGHT_PAD) : c.align === 'center' ? 'justify-center' : 'justify-start',
                          'focus-visible:outline-2 focus-visible:outline-accent',
                          on ? 'text-accent' : 'transition active:text-fg',
                        )}
                      >
                        {/* Con la flecha no cabe en su columna: sale un poco a cada lado (al hueco entre columnas), sin tocar las vecinas. */}
                        {/* Sin toques propios: si el nombre con la flecha se sale de su columna, ese pedazo no le quita el toque a la vecina. */}
                        <span className={cx('pointer-events-none inline-flex items-center gap-px', on && 'border-b-2 border-accent pb-[3px]', on && c.align !== 'left' && '-mr-1.5')}>
                          {c.label}
                          {on && <ChevronDown aria-hidden="true" strokeWidth={3} className="size-2.5 shrink-0" />}
                        </span>
                      </button>
                    ) : (
                      <span>{c.label}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {rows.map((t, i) => {
              const isMe = !!me && t.row.playerId === me;
              const prevMe = i > 0 && !!me && rows[i - 1].row.playerId === me;
              const line = i > 0 && !isMe && !prevMe;
              return (
                <div
                  key={t.row.playerId || t.row.name}
                  role="row"
                  className={cx(
                    GRID,
                    'relative min-h-[52px] tabular-nums',
                    isMe && 'bg-accent-soft',
                    line && "before:absolute before:top-0 before:right-0 before:left-3.5 before:h-px before:bg-line before:content-['']",
                  )}
                >
                  <span role="cell" className="text-center text-sm font-semibold text-muted">
                    {t.pos}
                  </span>
                  <span role="cell" className="flex min-w-0 items-center gap-1">
                    {t.row.playerId ? (
                      <Link
                        to={`${base}/j/${t.row.playerId}`}
                        title={t.row.name}
                        className="truncate text-[15px] font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
                      >
                        {t.short}
                      </Link>
                    ) : (
                      <span className="truncate text-[15px] font-semibold">{t.short}</span>
                    )}
                    {isMe && <TuTag small />}
                  </span>
                  {COLUMNS.slice(2).map((c) => (
                    <span
                      key={c.key}
                      role="cell"
                      className={cx(
                        'whitespace-nowrap',
                        c.align === 'center' ? 'text-center' : cx('text-right', RIGHT_PAD),
                        c.key === strong ? 'text-lg font-bold tracking-[-0.02em] text-fg' : 'text-[15px] font-medium text-fg-2',
                      )}
                    >
                      {cellText(t, c.key as SortKey, totalEvents)}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      <div className="mx-1 mt-2.5 flex min-h-5 items-center justify-between gap-3 text-[12.5px] leading-[1.4] text-muted">
        <span>Toca una columna para ordenar</span>
        {more && (
          <button
            type="button"
            onClick={() => scroller.current?.scrollTo({ left: scroller.current.scrollWidth, behavior: 'smooth' })}
            className="-my-3 inline-flex min-h-11 shrink-0 items-center gap-0.5 font-semibold text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            Desliza
            <ChevronRight aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
    </>
  );
}
