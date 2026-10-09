import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { History, Search, SearchX, Trophy, Users, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { invalidate } from '../lib/data/client';
import { peopleTags } from '../lib/data/follows';
import { leagueSocialTags, useFollowedLeagues, useLeagueSearch } from '../lib/data/leagueSocial';
import { usePublicLeagues } from '../lib/data/leagues';
import { peopleQuery, PEOPLE_QUERY_MAX, PEOPLE_QUERY_MIN, usePeople, type PersonHit } from '../lib/data/people';
import { ScreenTitle, ScreenTop, SignInCard } from '../components/screens/ScreenBits';
import { useRecentSearches } from '../components/search/recentSearches';
import { fromPublicLeague, LeagueResultRow, PersonRow, Quiet, type LeagueResult } from '../components/search/SearchRows';
import { AppShell } from '../components/Shell';
import { Card, ListSkeleton, Loading, LoadError, SectionHeader, Segmented, cx, sectionLinkClass, type SegmentedOption } from '../components/ui';

/** Qué se ve (`?ver=`): de todo (hasta 5 de cada uno), solo personas o solo ligas. */
export type SearchView = 'todo' | 'personas' | 'ligas';
export const searchView = (v: string | null): SearchView => (v === 'personas' || v === 'ligas' ? v : 'todo');

const VIEWS: readonly SegmentedOption<SearchView>[] = [
  { key: 'todo', label: 'Todo' },
  { key: 'personas', label: 'Personas' },
  { key: 'ligas', label: 'Ligas' },
];

/** En «Todo», cuántas de cada una; las demás, con «Ver todas». */
export const TODO_MAX = 5;
/** Con menos letras no se busca (personas y ligas piden lo mismo). */
const MIN_LETTERS = PEOPLE_QUERY_MIN;
/** La búsqueda queda en la dirección (`?q=`) un rato después de escribir: al volver de un perfil sigue ahí. */
const URL_SYNC_MS = 400;
/** Sin cuenta, las ligas públicas se piden después de dejar de escribir. */
const PUBLIC_DEBOUNCE_MS = 250;
/** Sin cuenta, cuántas públicas trae (las más activas primero). */
const PUBLIC_LIMIT = 20;

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (v === value) return;
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, v, ms]);
  return v;
}

/** Una lista que llega: lo que hay, si carga, si falló y si ya se buscó lo último que se escribió. */
interface Part<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  settled: boolean;
}

const nothingIn = (p: Part<unknown>) => p.settled && !p.loading && !p.error && !p.data.length;

/**
 * Una lista de resultados: cargando (la forma de la lista), el error con «Reintentar», el vacío (`empty`) o las filas.
 * La lista de antes se sigue viendo (más clara) mientras espera a que deje de escribir o llega la nueva.
 */
function PartBody<T>({
  part,
  max,
  rows,
  empty,
  onRetry,
  keyOf,
  row,
}: {
  part: Part<T>;
  max?: number;
  rows: number;
  empty: ReactNode;
  onRetry?: () => unknown;
  keyOf: (item: T) => string;
  row: (item: T) => ReactNode;
}) {
  const { data, loading, error, settled } = part;
  if (loading && !data.length) return <ListSkeleton rows={rows} />;
  if (error && !data.length) return <LoadError error={error} onRetry={onRetry} />;
  if (!data.length) return settled ? <>{empty}</> : <ListSkeleton rows={rows} />;
  const stale = !settled || loading;
  return (
    <Card className={cx('overflow-hidden transition-opacity', stale && 'opacity-60')}>
      <div aria-busy={stale || undefined}>
        {(max ? data.slice(0, max) : data).map((item) => (
          <Fragment key={keyOf(item)}>{row(item)}</Fragment>
        ))}
      </div>
    </Card>
  );
}

/** Un vacío de una sola línea (en «Todo», cuando la otra lista puede tener algo). */
const Line = ({ children }: { children: ReactNode }) => <p className="mx-1 text-meta text-muted">{children}</p>;

/**
 * La lupa (/buscar), rediseño «Calma y foco»: «‹ Social», «Buscar», la caja grande («Personas o ligas») y Todo ·
 * Personas · Ligas (`?ver=`). Personas = cuentas con sesión (search_people: nombre o @usuario), cada una con su foto,
 * «@usuario · Te sigue» y Seguir; ligas = las tuyas y las públicas (search_leagues: nombre o lugar), con su logo, «Liga ·
 * Deporte · lugar · N miembros» y «Tu liga» o Seguir. En «Todo», hasta 5 de cada una con «Ver todas». Con la caja vacía:
 * las búsquedas recientes (en el teléfono), las personas que sigues y las ligas que sigues. Sin cuenta: las ligas
 * públicas (public_leagues_feed) y, para personas, entrar.
 */
export default function SearchPage() {
  const auth = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(() => (params.get('q') ?? '').slice(0, PEOPLE_QUERY_MAX));
  const inputRef = useRef<HTMLInputElement>(null);
  const view = searchView(params.get('ver'));
  const todo = view === 'todo';
  const signedIn = !!auth.user;
  const recent = useRecentSearches(auth.user?.uid);

  const raw = query.trim();
  const q = peopleQuery(query);
  const tooShort = q.length > 0 && q.length < MIN_LETTERS;
  // Con @ es un usuario: en «Todo» solo personas (en «Ligas» se busca sin la @).
  const leagueText = raw.replace(/^@+/, '');
  const leaguesShown = !(todo && raw.startsWith('@'));

  const people = usePeople(query);
  const leagueSearch = useLeagueSearch(leagueText, signedIn && leaguesShown);
  const followed = useFollowedLeagues();
  const publicWanted = norm(leagueText);
  const publicText = useDebounced(publicWanted, PUBLIC_DEBOUNCE_MS);
  const publics = usePublicLeagues({
    query: publicText,
    limit: PUBLIC_LIMIT,
    enabled: !signedIn && leaguesShown && (publicText === '' || publicText.length >= MIN_LETTERS),
  });
  const publicRows = useMemo(() => publics.data.map(fromPublicLeague), [publics.data]);

  const inUrl = params.get('q') ?? '';
  useEffect(() => {
    if (raw === inUrl) return;
    const t = setTimeout(
      () =>
        setParams(
          (p) => {
            const next = new URLSearchParams(p);
            if (raw) next.set('q', raw);
            else next.delete('q');
            return next;
          },
          { replace: true },
        ),
      URL_SYNC_MS,
    );
    return () => clearTimeout(t);
  }, [raw, inUrl, setParams]);

  if (auth.loading) {
    return (
      <AppShell>
        <Loading />
      </AppShell>
    );
  }

  const setView = (v: SearchView) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (v === 'todo') next.delete('ver');
        else next.set('ver', v);
        return next;
      },
      { replace: true },
    );

  const searched = !!q && !tooShort;
  // Tocar un resultado (o su Seguir) recuerda la búsqueda; también Enter.
  const rememberQuery = () => {
    if (searched) recent.add(raw);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    rememberQuery();
    inputRef.current?.blur();
  };
  const pick = (text: string) => {
    setQuery(text.slice(0, PEOPLE_QUERY_MAX));
    recent.add(text);
  };

  const quoted = `«${raw}»`;
  const max = todo ? TODO_MAX : undefined;
  const rows = todo ? 3 : 4;
  const seeAll = (to: SearchView, what: string) => (
    <button type="button" onClick={() => setView(to)} aria-label={`Ver todas las ${what}`} className={sectionLinkClass}>
      Ver todas
    </button>
  );

  // ---------- Personas ----------
  const peoplePart: Part<PersonHit> = { data: people.data, loading: people.loading, error: people.error, settled: people.settled };
  const peopleHeader = todo || !q;
  const peopleSection = (
    <section aria-labelledby={peopleHeader ? 'buscar-personas' : undefined}>
      {peopleHeader && (
        <SectionHeader
          id="buscar-personas"
          title={q ? 'Personas' : 'Personas que sigues'}
          action={todo && peoplePart.data.length > TODO_MAX ? seeAll('personas', 'personas') : undefined}
        />
      )}
      <PartBody
        part={peoplePart}
        max={max}
        rows={rows}
        onRetry={() => invalidate(peopleTags.search)}
        keyOf={(p) => p.id}
        row={(p) => <PersonRow hit={p} />}
        empty={
          !q ? (
            <Quiet icon={<Users />} title="Aún no sigues a nadie">
              Búscalos por su nombre o @usuario arriba.
            </Quiet>
          ) : todo ? (
            <Line>{`Ninguna persona con ${quoted}.`}</Line>
          ) : (
            <Quiet icon={<SearchX />} title={`No encontramos a nadie con ${quoted}`}>
              Revisa cómo se escribe o busca por su @usuario.
            </Quiet>
          )
        }
      />
    </section>
  );
  const signIn = (
    <SignInCard
      icon={<Search />}
      title="Entra para buscar personas"
      text="Encuentra a otros jugadores por su nombre o @usuario y síguelos."
      next={encodeURIComponent(location.pathname + location.search)}
    />
  );

  // ---------- Ligas ----------
  const leaguesPart: Part<LeagueResult> = !signedIn
    ? { data: publicRows, loading: publics.loading, error: publics.error, settled: publicText === publicWanted }
    : q
      ? { data: leagueSearch.data, loading: leagueSearch.loading, error: leagueSearch.error, settled: leagueSearch.settled }
      : { data: followed.data, loading: followed.loading, error: followed.error, settled: true };
  const leaguesHeader = todo || !q;
  const leaguesSection = (
    <section aria-labelledby={leaguesHeader ? 'buscar-ligas' : undefined}>
      {leaguesHeader && (
        <SectionHeader
          id="buscar-ligas"
          title={q ? 'Ligas' : signedIn ? 'Ligas que sigues' : 'Ligas públicas'}
          action={todo && leaguesPart.data.length > TODO_MAX ? seeAll('ligas', 'ligas') : undefined}
        />
      )}
      <PartBody
        part={leaguesPart}
        max={max}
        rows={rows}
        onRetry={signedIn ? () => invalidate(q ? leagueSocialTags.search : leagueSocialTags.followed) : undefined}
        keyOf={(l) => l.id}
        row={(l) => <LeagueResultRow league={l} />}
        empty={
          !q ? (
            signedIn ? (
              <Quiet icon={<Trophy />} title="Aún no sigues ninguna liga">
                Sigue una liga pública y sus publicaciones salen en Social.
              </Quiet>
            ) : (
              <Line>Todavía no hay ligas públicas.</Line>
            )
          ) : todo && signedIn ? (
            <Line>{`Ninguna liga con ${quoted}.`}</Line>
          ) : (
            <Quiet icon={<SearchX />} title={`No encontramos ligas con ${quoted}`}>
              {signedIn ? 'Busca por el nombre de la liga o el lugar donde juegan.' : 'Sin cuenta se ven las públicas. Busca por el nombre o el lugar donde juegan.'}
            </Quiet>
          )
        }
      />
    </section>
  );

  let body: ReactNode;
  if (tooShort) {
    body = <Line>{`Escribe al menos ${MIN_LETTERS} letras para buscar.`}</Line>;
  } else if (todo && signedIn && searched && nothingIn(peoplePart) && (!leaguesShown || nothingIn(leaguesPart))) {
    body = (
      <Quiet icon={<SearchX />} title={`No encontramos nada con ${quoted}`}>
        Revisa cómo se escribe, o busca a alguien por su @usuario y una liga por su lugar.
      </Quiet>
    );
  } else if (!signedIn) {
    body =
      view === 'personas' ? (
        signIn
      ) : (
        <>
          {leaguesShown && leaguesSection}
          {todo && signIn}
        </>
      );
  } else {
    body =
      view === 'personas' ? (
        peopleSection
      ) : view === 'ligas' ? (
        leaguesSection
      ) : (
        <>
          {peopleSection}
          {leaguesShown && leaguesSection}
        </>
      );
  }

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <ScreenTop label="Social" fallback="/social" />
        <ScreenTitle title="Buscar" />
        <form role="search" onSubmit={submit} className="mt-5">
          <label className="relative block">
            <span className="sr-only">Buscar personas o ligas</span>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, PEOPLE_QUERY_MAX))}
              placeholder="Personas o ligas"
              enterKeyHint="search"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="card-shadow h-[52px] w-full rounded-2xl bg-surface pr-12 pl-12 text-base text-fg placeholder:text-faint focus:outline-2 focus:outline-offset-1 focus:outline-accent [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label="Borrar búsqueda"
                className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center text-faint hover:text-fg"
              >
                <X aria-hidden="true" className="size-[18px]" />
              </button>
            )}
          </label>
        </form>
        <Segmented options={VIEWS} value={view} onChange={setView} label="Qué buscar" full className="mt-3" />
        <div className="mt-[26px] flex flex-col gap-[30px]" onClickCapture={rememberQuery}>
          {!raw && recent.list.length > 0 && <RecentChips list={recent.list} onPick={pick} onClear={recent.clear} />}
          {body}
        </div>
      </div>
    </AppShell>
  );
}

/** Las últimas búsquedas (con la caja vacía): un chip por cada una y «Borrar» para olvidarlas. */
function RecentChips({ list, onPick, onClear }: { list: readonly string[]; onPick: (q: string) => void; onClear: () => void }) {
  return (
    <section aria-labelledby="buscar-recientes">
      <SectionHeader
        id="buscar-recientes"
        title="Búsquedas recientes"
        action={
          <button type="button" onClick={onClear} aria-label="Borrar las búsquedas recientes" className={sectionLinkClass}>
            Borrar
          </button>
        }
      />
      <ul className="mx-1 flex flex-wrap gap-2">
        {list.map((r) => (
          <li key={r} className="max-w-full">
            <button
              type="button"
              onClick={() => onPick(r)}
              className={cx(
                "relative inline-flex h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-meta font-semibold text-fg-2 transition after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-[0.97]",
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              )}
            >
              <History aria-hidden="true" className="size-4 shrink-0 text-muted" />
              <span className="truncate">{r}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
