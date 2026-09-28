import { useState } from 'react';
import { Globe, Search, X } from 'lucide-react';
import type { League } from '../../lib/types';
import { Button, Card, Input } from '../ui';
import { LeagueList, LeagueRow } from './LeagueCard';
import { searchLeagues } from './logic';
import { useJoin } from './useHomeData';

/**
 * Ligas y torneos públicos para unirse (los que ya son míos no salen): con buscador (nombre o lugar) en Eventos y
 * los primeros `limit` en el Home del deporte. «Unirme» sin cuenta lleva a entrar.
 */
export function PublicLeagues({
  leagues,
  today,
  showSport,
  search,
  limit,
  emptyText,
}: {
  leagues: readonly League[];
  today: string;
  showSport?: boolean;
  search?: boolean;
  limit?: number;
  /** Qué decir si no hay ninguna (sin buscar). */
  emptyText: string;
}) {
  const { joining, join } = useJoin();
  const [query, setQuery] = useState('');
  const found = search ? searchLeagues(leagues, query) : [...leagues];
  const shown = limit ? found.slice(0, limit) : found;

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
        <Card className="px-4 py-4 text-sm text-muted">Ninguna pública tiene «{query.trim()}» en el nombre o el lugar.</Card>
      ) : (
        <LeagueList>
          {shown.map((l, i) => (
            <LeagueRow
              key={l.id}
              league={l}
              index={i}
              today={today}
              showSport={showSport}
              action={
                <Button size="sm" variant="primary" className="h-11" loading={joining === l.id} onClick={() => join(l)} aria-label={`Unirme a ${l.name}`}>
                  Unirme
                </Button>
              }
            />
          ))}
        </LeagueList>
      )}
    </div>
  );
}
