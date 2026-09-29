import { useEffect, useMemo, useState } from 'react';
import { Globe, Search, X } from 'lucide-react';
import { usePublicLeagues, type PublicLeague } from '../../lib/data/leagues';
import { inSport } from '../../lib/sportContext';
import { Button, Card, Input } from '../ui';
import { LeagueList, LeagueRow } from './LeagueCard';
import { publicLeagueLine, searchLeagues } from './logic';
import { useJoin } from './useHomeData';

/** Letras mínimas para buscar también en la base (las que no están en la primera página del listado). */
const SERVER_SEARCH_FROM = 2;
/** Espera (ms) después de la última tecla antes de buscar en la base. */
const SEARCH_DEBOUNCE_MS = 350;

/** Lo escrito, cuando se deja de escribir un momento. */
function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Las de la lista y las que encontró la base, sin repetir (primero las de la lista, en su orden). */
export function mergeFound<L extends { id: string }>(local: readonly L[], server: readonly L[]): L[] {
  const seen = new Set(local.map((l) => l.id));
  return [...local, ...server.filter((l) => !seen.has(l.id))];
}

/**
 * Ligas y torneos públicos para unirse (los que ya son míos no salen), las más activas primero, cada una con su
 * línea («24 jugadores · juega el martes»): con buscador (nombre o lugar) en Eventos y los primeros `limit` en el
 * Home. El buscador filtra lo que ya está en la lista y, desde 2 letras, también busca en la base (`sport` y
 * `exclude` dicen cuáles de esas sirven). «Unirme» pasa por «¿Quién eres?» si la liga tiene jugadores sin cuenta;
 * sin cuenta lleva a entrar.
 */
export function PublicLeagues({
  leagues,
  today,
  showSport,
  search,
  limit,
  emptyText,
  sport = null,
  exclude,
}: {
  leagues: readonly PublicLeague[];
  today: string;
  showSport?: boolean;
  search?: boolean;
  limit?: number;
  /** Qué decir si no hay ninguna (sin buscar). */
  emptyText: string;
  /** Deporte de la búsqueda en la base (null = todos). */
  sport?: string | null;
  /** Las que no se muestran aunque la base las encuentre (las mías). */
  exclude?: (lid: string) => boolean;
}) {
  const { joining, join, modal } = useJoin();
  const [query, setQuery] = useState('');
  const q = query.trim();
  const typed = useDebounced(q, SEARCH_DEBOUNCE_MS);
  const remoteOn = !!search && typed.length >= SERVER_SEARCH_FROM;
  const remote = usePublicLeagues({ sport, query: typed, enabled: remoteOn });
  const now = Date.now();

  const shown = useMemo(() => {
    const local = search ? searchLeagues(leagues, q) : [...leagues];
    const found =
      search && q.length >= SERVER_SEARCH_FROM ? mergeFound(local, remote.data.filter((l) => inSport(sport)(l) && !exclude?.(l.id))) : local;
    return limit ? found.slice(0, limit) : found;
  }, [leagues, search, q, remote.data, sport, exclude, limit]);
  const searching = !!search && q.length >= SERVER_SEARCH_FROM && (typed !== q || remote.loading);
  // La búsqueda en la base falló (sin señal, o muchas seguidas sin cuenta): no es que ninguna lo tenga.
  const searchFailed = !!search && q.length >= SERVER_SEARCH_FROM && typed === q && !remote.loading && !!remote.error;

  return (
    <div className="flex flex-col gap-2">
      {search && leagues.length > 3 && (
        <label className="relative">
          <span className="sr-only">Buscar ligas públicas</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o lugar"
            className="h-11 pr-11 pl-9"
            enterKeyHint="search"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center text-muted hover:text-fg"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
      )}
      {leagues.length === 0 ? (
        <Card className="flex items-center gap-3 px-4 py-4 text-sm text-muted">
          <Globe className="size-5 shrink-0" /> {emptyText}
        </Card>
      ) : shown.length === 0 ? (
        <Card className="px-4 py-4 text-sm text-muted">
          <span aria-live="polite">
            {searching
              ? 'Buscando…'
              : searchFailed
                ? 'No se pudo buscar en todas las ligas públicas. Revisa tu conexión y prueba otra vez.'
                : `Ninguna pública tiene «${q}» en el nombre o el lugar.`}
          </span>
        </Card>
      ) : (
        <LeagueList>
          {shown.map((l, i) => (
            <LeagueRow
              key={l.id}
              league={l}
              index={i}
              today={today}
              showSport={showSport}
              line={publicLeagueLine(l, today, now)}
              action={
                <Button size="sm" variant="primary" className="h-11" loading={joining === l.id} onClick={() => join(l)} aria-label={`Unirme a ${l.name}`}>
                  Unirme
                </Button>
              }
            />
          ))}
        </LeagueList>
      )}
      {modal}
    </div>
  );
}
