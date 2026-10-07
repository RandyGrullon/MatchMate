import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarSearch, ChevronLeft, Search, X } from 'lucide-react';
import { PUBLIC_FEED_MAX, usePublicLeagues, type PublicLeague } from '../../lib/data/leagues';
import { toIsoDate } from '../../lib/format';
import { inSport } from '../../lib/sportContext';
import { useIsPro } from '../../lib/useMode';
import { useNow } from '../../lib/useNow';
import { sportMeta } from '../../sports/registry';
import { agendaCardNote, hasAgenda } from '../agenda/logic';
import { BusyIcon } from '../busy';
import { filterSports, joinable, publicEmptyText } from '../eventos/logic';
import { publicLeagueLine, searchLeagues } from '../home/logic';
import { mergeFound } from '../home/PublicLeagues';
import { useJoin, useMyLeagues } from '../home/useHomeData';
import { Card, ListRow, ListSkeleton, LoadError, RowIcon, SectionHeader, cx } from '../ui';
import { LeagueTile, SignedOutCard, SportFilter } from './LigasRows';

/** Letras mínimas para buscar también en la base (las que no están en la primera página del listado). */
const SERVER_SEARCH_FROM = 2;
/** Espera (ms) después de la última tecla antes de buscar en la base. */
const SEARCH_DEBOUNCE_MS = 350;

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** La línea de una pública: «Pádel · 8 jugadores · juega el martes · Club Naco» (el deporte, si hay de varios). */
export function openLeagueSubtitle(l: PublicLeague, today: string, now: number, showSport: boolean): string {
  return [showSport ? sportMeta(l.sport)?.short : null, publicLeagueLine(l, today, now), l.venue?.trim()].filter(Boolean).join(' · ');
}

/**
 * «Buscar ligas abiertas» (`/ligas?ver=abiertas`; sin cuenta, la pantalla Ligas): las ligas y los torneos públicos para
 * unirse (los míos no salen), de todos los deportes con chips para filtrar, el buscador (nombre o lugar; desde 2
 * letras también busca en la base) y «¿Dónde juego esta semana?» (la agenda pública). «Unirme» pasa por «¿Quién eres?»
 * si la liga tiene jugadores sin cuenta; sin cuenta lleva a entrar.
 */
export function OpenLeagues({ signedIn }: { signedIn: boolean }) {
  const pro = useIsPro();
  const mine = useMyLeagues(null);
  const { roleOf } = mine;
  const [params, setParams] = useSearchParams();
  const pubAll = usePublicLeagues({ limit: PUBLIC_FEED_MAX });
  const sports = useMemo(() => filterSports([], pubAll.data), [pubAll.data]);
  const raw = params.get('deporte');
  const sport = raw && sports.includes(raw) ? raw : null;
  const pub = usePublicLeagues({ sport, limit: PUBLIC_FEED_MAX });
  const now = useNow();
  const today = toIsoDate(now);
  const { joining, join, modal } = useJoin();

  const [query, setQuery] = useState('');
  const q = query.trim();
  const typed = useDebounced(q, SEARCH_DEBOUNCE_MS);
  const remoteOn = typed.length >= SERVER_SEARCH_FROM;
  const remote = usePublicLeagues({ sport, query: typed, enabled: remoteOn });

  const isMine = useMemo(() => (lid: string) => !!roleOf(lid), [roleOf]);
  const toJoin = useMemo(() => joinable(pub.data, isMine, sport), [pub.data, isMine, sport]);
  const shown = useMemo(() => {
    const local = searchLeagues(toJoin, q);
    return q.length >= SERVER_SEARCH_FROM ? mergeFound(local, remote.data.filter((l) => inSport(sport)(l) && !isMine(l.id))) : local;
  }, [toJoin, q, remote.data, sport, isMine]);
  const searching = q.length >= SERVER_SEARCH_FROM && (typed !== q || remote.loading);
  const searchFailed = q.length >= SERVER_SEARCH_FROM && typed === q && !remote.loading && !!remote.error;
  const showSport = !sport && sports.length > 1;

  const setSport = (s: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (s) n.set('deporte', s);
        else n.delete('deporte');
        return n;
      },
      { replace: true },
    );

  const agenda = !sport || hasAgenda(sport);
  const loading = (pub.loading && !pub.data.length) || mine.loading;

  return (
    <div className="flex flex-col px-2">
      {signedIn && (
        <Link to="/ligas" className="-mt-2 -ml-1.5 inline-flex h-11 items-center gap-0.5 self-start pr-2 text-body font-[550] text-accent">
          <ChevronLeft aria-hidden="true" className="size-5" /> Ligas
        </Link>
      )}
      <h1 className={pro ? 'text-title-pro' : 'text-title'}>Ligas abiertas</h1>
      <p className="mt-1.5 text-meta text-muted">Públicas, de todos los deportes: entras con un toque.</p>

      {!signedIn && <SignedOutCard className="mt-5" />}

      <label className="relative mt-5 block">
        <span className="sr-only">Buscar ligas públicas</span>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o lugar"
          enterKeyHint="search"
          className="card-shadow h-[52px] w-full rounded-2xl bg-surface pr-12 pl-12 text-base text-fg placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-accent [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Borrar búsqueda"
            className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center text-faint hover:text-fg"
          >
            <X aria-hidden="true" className="size-[18px]" />
          </button>
        )}
      </label>

      {sports.length > 1 && <SportFilter sports={sports} value={sport} onChange={setSport} className="mt-3" />}

      {agenda && (
        <Card className="mt-5 overflow-hidden">
          <ListRow
            dense={pro}
            leading={
              <RowIcon tone="accent">
                <CalendarSearch className="size-5" />
              </RowIcon>
            }
            title="¿Dónde juego esta semana?"
            subtitle={agendaCardNote(sport)}
            to={sport ? `/agenda?deporte=${encodeURIComponent(sport)}` : '/agenda'}
          />
        </Card>
      )}

      <section aria-labelledby="para-unirte" className="mt-[30px]">
        <SectionHeader id="para-unirte" title="Para unirte" />
        {pub.error && !pub.data.length ? (
          <LoadError error={pub.error} />
        ) : loading ? (
          <ListSkeleton rows={3} />
        ) : toJoin.length === 0 && !q ? (
          <p className="mx-1 text-meta text-muted">{publicEmptyText({ sport, inSportTotal: pub.data.filter(inSport(sport)).length })}</p>
        ) : shown.length === 0 ? (
          <p aria-live="polite" className="mx-1 text-meta text-muted">
            {searching
              ? 'Buscando…'
              : searchFailed
                ? 'No se pudo buscar en todas las públicas. Revisa tu conexión y prueba otra vez.'
                : `Ninguna pública tiene «${q}» en el nombre o el lugar.`}
          </p>
        ) : (
          <Card className="overflow-hidden">
            {shown.map((l) => (
              <ListRow
                key={l.id}
                dense={pro}
                leading={<LeagueTile league={l} dense />}
                title={l.name}
                subtitle={openLeagueSubtitle(l, today, now.getTime(), showSport)}
                to={`/l/${l.id}`}
                trailing={
                  <button
                    type="button"
                    onClick={() => void join(l)}
                    disabled={joining === l.id}
                    aria-busy={joining === l.id || undefined}
                    aria-label={`Unirme a ${l.name}`}
                    className={cx(
                      "relative inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-accent-soft px-3.5 text-sm font-[650] text-accent transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-[0.97]",
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-80',
                    )}
                  >
                    <span aria-hidden="true" className={cx(joining === l.id && 'text-transparent')}>
                      Unirme
                    </span>
                    <BusyIcon busy={joining === l.id} className="absolute inset-0 m-auto size-4" />
                  </button>
                }
              />
            ))}
          </Card>
        )}
      </section>
      {modal}
    </div>
  );
}
