import { useId, useMemo, useState, type ReactNode } from 'react';
import { BookOpen, Plus, Search, X } from 'lucide-react';
import { BALL_BRANDS, BALL_CATALOG, catalogBall, searchBallCatalog, type CatalogBall } from '../../lib/ballCatalog';
import { BALL_MAX, catalogLine, catalogLook, catalogSpecs } from '../../lib/balls';
import { Button, Input, Sheet } from '../ui';
import { BallArt } from './BallArt';

/**
 * Buscar bolas en el catálogo de marcas y modelos (src/lib/ballCatalog.ts): por marca, por modelo o los dos en
 * cualquier orden («storm phaze», «phaze storm»). Arriba de la hoja de una bola («Buscar en el catálogo»: llena marca,
 * nombre y cubierta) y en Mis bolas («Buscar bolas»: «Agregar a mi arsenal» abre la hoja ya llena).
 */

/** Cuántas salen en la hoja de la bola (ahí se busca una sola) y en «Buscar bolas» (ahí se mira). */
const PICK_LIMIT = 8;
const BROWSE_LIMIT = 40;

/** Gris de una bola del catálogo que no dice sus colores. */
const NO_COLOR = '#6b7280';

/** ¿Hay catálogo? (sin modelos no sale el buscador). */
export const hasBallCatalog = () => BALL_CATALOG.length > 0;

/** La bola del catálogo dibujada con sus colores (la que se propone al agregarla). */
export function CatalogBallArt({ ball: c, size, className }: { ball: CatalogBall; size: number; className?: string }) {
  const look = useMemo(() => catalogLook(c), [c]);
  return <BallArt design={look} color={look?.base ?? NO_COLOR} cover={c.cover} size={size} className={className} />;
}

/** El campo de búsqueda (con su lupa y la X para borrar lo escrito). */
export function CatalogSearchInput({
  value,
  onChange,
  label,
  placeholder = 'Marca o modelo: Storm, Phaze…',
}: {
  value: string;
  onChange: (v: string) => void;
  /** Nombre accesible del campo. */
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={60}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Borrar búsqueda"
          className="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center text-muted hover:text-fg"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </label>
  );
}

/** Un modelo en la lista: la bola con sus colores, la marca, el nombre y «Reactiva perlada · 2023 · asimétrico». */
export function CatalogRow({ ball: c, trailing, disabled, onClick }: { ball: CatalogBall; trailing?: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent active:bg-surface-2 disabled:pointer-events-none disabled:opacity-50"
    >
      <CatalogBallArt ball={c} size={40} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-muted">{c.brand}</span>
        <span className="block truncate text-[15px] leading-snug font-semibold">{c.name}</span>
        <span className="block truncate text-[13px] text-muted">{catalogLine(c)}</span>
      </span>
      {trailing}
    </button>
  );
}

/** La lista de modelos que salen (o que no sale ninguno). */
function CatalogResults({ query, results, label, row }: { query: string; results: readonly CatalogBall[]; label: string; row: (c: CatalogBall) => ReactNode }) {
  if (!results.length) {
    return (
      <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted" aria-live="polite">
        {`Ninguna bola del catálogo con «${query.trim()}».`}
      </p>
    );
  }
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {results.map((c) => (
        <li key={c.id}>{row(c)}</li>
      ))}
    </ul>
  );
}

/**
 * «Buscar en el catálogo» en la hoja de una bola. Sin modelo elegido: el buscador (en una nueva, abierto; en una que ya
 * existe, detrás de un botón) y, al tocar uno, `onPick` (la hoja llena marca, nombre y cubierta). «No está en el
 * catálogo» (`onManual`) cierra el buscador y se escribe a mano. Con modelo: cuál es (su marca, su nombre y lo que dice
 * el catálogo), «Cambiar» y la X para quitarlo (lo escrito se queda). `brand` y `name` dicen cuál es si la clave ya no
 * está en el catálogo. `initialQuery`, para las pruebas.
 */
export function CatalogPick({
  value,
  brand,
  name,
  fresh,
  initialQuery = '',
  onPick,
  onClear,
  onManual,
}: {
  value: string | null;
  brand: string;
  name: string;
  fresh: boolean;
  initialQuery?: string;
  onPick: (c: CatalogBall) => void;
  onClear: () => void;
  onManual: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(fresh && !value);
  const results = useMemo(() => searchBallCatalog(query, PICK_LIMIT), [query]);
  const titleId = useId();
  if (!hasBallCatalog() && !value) return null;
  const linked = catalogBall(value);

  if (value && !searching) {
    const specs = linked ? (catalogSpecs(linked) ?? catalogLine(linked)) : null;
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line py-2 pr-1 pl-3.5">
        {linked ? <CatalogBallArt ball={linked} size={36} className="shrink-0" /> : <BookOpen aria-hidden="true" className="size-5 shrink-0 text-muted" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted">Del catálogo</p>
          <p className="truncate text-[15px] leading-snug font-semibold">{linked ? `${linked.brand} ${linked.name}` : [brand, name].filter(Boolean).join(' ')}</p>
          {specs && <p className="truncate text-[13px] text-muted">{specs}</p>}
        </div>
        {hasBallCatalog() && (
          <Button variant="ghost" className="h-11 shrink-0 px-3" onClick={() => setSearching(true)}>
            Cambiar
          </Button>
        )}
        <button
          type="button"
          onClick={onClear}
          aria-label="Quitar el modelo del catálogo"
          title="Quitar el modelo del catálogo"
          className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    );
  }

  if (!searching) {
    return (
      <button
        type="button"
        onClick={() => setSearching(true)}
        className="flex min-h-11 items-center gap-2 self-start rounded-xl text-sm font-semibold text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Search aria-hidden="true" className="size-4" /> Buscar en el catálogo
      </button>
    );
  }

  const pick = (c: CatalogBall) => {
    setQuery('');
    setSearching(false);
    onPick(c);
  };
  const manual = () => {
    setQuery('');
    setSearching(false);
    onManual();
  };
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 id={titleId} className="text-xs font-medium text-muted">
          Buscar en el catálogo
        </h3>
        {value && (
          <button type="button" onClick={() => setSearching(false)} className="-my-3 min-h-11 text-sm font-semibold text-accent">
            Cancelar
          </button>
        )}
      </div>
      <CatalogSearchInput value={query} onChange={setQuery} label="Buscar en el catálogo" />
      {query.trim() ? (
        <>
          <CatalogResults query={query} results={results} label="Bolas del catálogo" row={(c) => <CatalogRow ball={c} onClick={() => pick(c)} />} />
          <Button variant="quiet" className="h-11 self-start" onClick={manual}>
            No está en el catálogo
          </Button>
        </>
      ) : (
        <p className="text-[13px] text-muted">Marca y modelo, en cualquier orden. Llena la marca, el nombre y la cubierta; si no está, escríbela abajo.</p>
      )}
    </section>
  );
}

/**
 * «Buscar bolas» de Mis bolas: el buscador del catálogo, las marcas para tocar (sin nada escrito) y los modelos que
 * salen; tocar uno lo agrega a mi arsenal (`onAdd` abre la hoja de una bola nueva ya llena). Si no está, `onManual`
 * abre la hoja vacía. Con el cupo lleno no se puede agregar. Se monta abierta.
 */
export function CatalogSearchSheet({
  initialQuery = '',
  full,
  onAdd,
  onManual,
  onClose,
}: {
  initialQuery?: string;
  full: boolean;
  onAdd: (id: string) => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const found = useMemo(() => searchBallCatalog(query, BROWSE_LIMIT + 1), [query]);
  const results = found.slice(0, BROWSE_LIMIT);
  return (
    <Sheet open onClose={onClose} title="Buscar bolas" subtitle="Marcas y modelos del catálogo">
      <div className="flex flex-col gap-3">
        <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-1">
          <CatalogSearchInput value={query} onChange={setQuery} label="Buscar bolas" placeholder="Storm, Hammer, Phaze…" />
        </div>
        {!query.trim() ? (
          <>
            <p className="text-sm text-muted">Escribe la marca, el modelo o los dos, en cualquier orden. O toca una marca:</p>
            <div role="group" aria-label="Marcas" className="flex flex-wrap gap-2">
              {BALL_BRANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setQuery(b)}
                  className="h-11 rounded-full bg-surface-2 px-4 text-sm font-medium text-fg transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {b}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <CatalogResults
              query={query}
              results={results}
              label="Bolas del catálogo"
              row={(c) => (
                <CatalogRow
                  ball={c}
                  disabled={full}
                  onClick={() => onAdd(c.id)}
                  trailing={
                    <span className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-accent-soft pr-3 pl-2.5 text-sm font-semibold text-accent">
                      <Plus aria-hidden="true" className="size-4" strokeWidth={2.4} />
                      Agregar<span className="sr-only"> a mi arsenal</span>
                    </span>
                  }
                />
              )}
            />
            {found.length > BROWSE_LIMIT && <p className="text-[13px] text-muted">Hay más: escribe también el modelo.</p>}
          </>
        )}
        {full ? (
          <p className="text-[13px] text-muted">Ya tienes {BALL_MAX} bolas: borra una que ya no uses para agregar otra.</p>
        ) : (
          query.trim() && (
            <Button variant="quiet" className="h-11 self-start" onClick={onManual}>
              No está en el catálogo: agregarla a mano
            </Button>
          )
        )}
      </div>
    </Sheet>
  );
}
