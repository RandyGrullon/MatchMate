import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Search, SearchX, Users, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { peopleQuery, PEOPLE_QUERY_MAX, PEOPLE_QUERY_MIN, usePeople, type PersonHit } from '../lib/data/people';
import { Avatar } from '../components/Avatar';
import { ScreenTitle, ScreenTop, SignInCard } from '../components/screens/ScreenBits';
import { AppShell } from '../components/Shell';
import { FollowButton } from '../components/social/FollowButton';
import { atUsername } from '../components/social/socialFormat';
import { userPath } from '../components/social/UserLink';
import { Card, ListRow, ListSkeleton, Loading, LoadError, SectionHeader, cx } from '../components/ui';

/** La búsqueda queda en la dirección (`?q=`) un rato después de escribir: al volver de un perfil sigue ahí. */
const URL_SYNC_MS = 400;

/** Un vacío corto dentro de una tarjeta: el ícono, qué pasa y una línea. */
function Quiet({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-5 py-8 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent [&>svg]:size-7">
        {icon}
      </span>
      <h2 className="mt-4 text-section">{title}</h2>
      {children && <p className="mt-1.5 max-w-sm text-meta text-muted">{children}</p>}
    </Card>
  );
}

/**
 * Buscar personas (/buscar), rediseño «Calma y foco»: «‹ Yo», el título, el buscador grande y una lista (cada persona en
 * su fila: iniciales, nombre, @usuario y «Te sigue»; toda la fila abre su perfil) con Seguir al lado. Sin escribir nada,
 * las personas que sigues. Cualquier cuenta con sesión ve a las demás (menos las bloqueadas); sus juegos siguen
 * dependiendo de las ligas que puede ver.
 */
export default function PeopleSearchPage() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(() => (params.get('q') ?? '').slice(0, PEOPLE_QUERY_MAX));
  const people = usePeople(query);

  const inUrl = params.get('q') ?? '';
  useEffect(() => {
    const q = query.trim();
    if (q === inUrl) return;
    const t = setTimeout(
      () =>
        setParams(
          (p) => {
            const next = new URLSearchParams(p);
            if (q) next.set('q', q);
            else next.delete('q');
            return next;
          },
          { replace: true },
        ),
      URL_SYNC_MS,
    );
    return () => clearTimeout(t);
  }, [query, inUrl, setParams]);

  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <AppShell>
        <div className="flex flex-col px-2">
          <ScreenTop label="Yo" fallback="/perfil" />
          <ScreenTitle title="Buscar personas" />
          <SignInCard
            className="mt-5"
            icon={<Search />}
            title="Entra para buscar personas"
            text="Encuentra a otros jugadores por su nombre o @usuario y síguelos."
            next="%2Fbuscar"
          />
        </div>
      </AppShell>
    );
  }

  const q = peopleQuery(query);
  const tooShort = q.length > 0 && q.length < PEOPLE_QUERY_MIN;
  // La lista de antes se sigue viendo (más clara) mientras espera a que deje de escribir o llega la nueva.
  const stale = !people.settled || people.loading;

  let content;
  if (tooShort) {
    content = <p className="mx-1 text-meta text-muted">Escribe al menos {PEOPLE_QUERY_MIN} letras para buscar.</p>;
  } else if (people.loading && !people.data.length) {
    content = <ListSkeleton rows={4} />;
  } else if (people.error && !people.data.length) {
    content = <LoadError error={people.error} />;
  } else if (!people.data.length) {
    content = !people.settled ? (
      <ListSkeleton rows={4} />
    ) : q ? (
      <Quiet icon={<SearchX />} title={`No encontramos a nadie con «${query.trim()}»`}>
        Revisa cómo se escribe o busca por su @usuario.
      </Quiet>
    ) : (
      <Quiet icon={<Users />} title="Aún no sigues a nadie">
        Búscalos por su nombre o @usuario arriba.
      </Quiet>
    );
  } else {
    content = (
      <Card className={cx('overflow-hidden transition-opacity', stale && 'opacity-60')}>
        <div aria-busy={stale || undefined}>
          {people.data.map((hit) => (
            <PersonRow key={hit.id} hit={hit} />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <ScreenTop label="Yo" fallback="/perfil" />
        <ScreenTitle title="Buscar personas" />
        <label className="relative mt-5 block">
          <span className="sr-only">Buscar personas por nombre o @usuario</span>
          <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, PEOPLE_QUERY_MAX))}
            placeholder="Nombre o @usuario"
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
              onClick={() => setQuery('')}
              aria-label="Borrar búsqueda"
              className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center text-faint hover:text-fg"
            >
              <X aria-hidden="true" className="size-[18px]" />
            </button>
          )}
        </label>
        <section className="mt-[26px]" aria-labelledby={!q ? 'personas-sigues' : undefined}>
          {!q && <SectionHeader id="personas-sigues" title="Personas que sigues" />}
          {content}
        </section>
      </div>
    </AppShell>
  );
}

/** Una persona: iniciales, nombre, «@usuario · Te sigue» (toda la fila abre su perfil) y Seguir al lado. */
function PersonRow({ hit }: { hit: PersonHit }) {
  const handle = atUsername(hit.username);
  return (
    <ListRow
      to={userPath(hit.id)}
      leading={<Avatar name={hit.name || 'Jugador'} className="size-10 text-sm" />}
      title={hit.name || 'Jugador'}
      subtitle={[handle, hit.followsYou && 'Te sigue'].filter(Boolean).join(' · ') || undefined}
      trailing={<FollowButton userId={hit.id} name={hit.name} following={hit.isFollowing} followsYou={hit.followsYou} size="sm" className="rounded-full!" />}
    />
  );
}
