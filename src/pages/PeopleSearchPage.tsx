import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LogIn, Search, SearchX, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { peopleQuery, PEOPLE_QUERY_MAX, PEOPLE_QUERY_MIN, usePeople, type PersonHit } from '../lib/data/people';
import { AppShell } from '../components/Shell';
import { BackLink } from '../components/BackLink';
import { FollowButton } from '../components/social/FollowButton';
import { UserLink } from '../components/social/UserLink';
import { Badge, Card, Empty, Input, ListSkeleton, Loading, LoadError, cx } from '../components/ui';

/** La búsqueda queda en la dirección (`?q=`) un rato después de escribir: al volver de un perfil sigue ahí. */
const URL_SYNC_MS = 400;

/**
 * Buscar personas (/buscar): por nombre o @usuario, con Seguir en cada una. Sin escribir nada, las personas que
 * sigues. Cualquier cuenta con sesión ve a las demás (menos las bloqueadas); sus juegos siguen dependiendo de las
 * ligas que puede ver.
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
        <Empty icon={<Search className="size-7" aria-hidden="true" />} title="Entra para buscar personas">
          Con tu cuenta encuentras a otros jugadores por su nombre o @usuario y los sigues.
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/login?next=%2Fbuscar" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2">
              <LogIn className="size-4" aria-hidden="true" /> Entrar
            </Link>
            <Link to="/login?modo=registro&next=%2Fbuscar" className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg">
              <UserPlus className="size-4" aria-hidden="true" /> Crear cuenta
            </Link>
          </div>
        </Empty>
      </AppShell>
    );
  }

  const q = peopleQuery(query);
  const tooShort = q.length > 0 && q.length < PEOPLE_QUERY_MIN;
  // La lista de antes se sigue viendo (más clara) mientras espera a que deje de escribir o llega la nueva.
  const stale = !people.settled || people.loading;

  let content;
  if (tooShort) {
    content = <Card className="px-4 py-4 text-sm text-muted">Escribe al menos {PEOPLE_QUERY_MIN} letras para buscar.</Card>;
  } else if (people.loading && !people.data.length) {
    content = <ListSkeleton rows={4} />;
  } else if (people.error && !people.data.length) {
    content = <LoadError error={people.error} />;
  } else if (!people.data.length) {
    content = !people.settled ? (
      <ListSkeleton rows={4} />
    ) : q ? (
      <Empty icon={<SearchX className="size-7" aria-hidden="true" />} title={`No encontramos a nadie con «${query.trim()}»`}>
        Revisa cómo se escribe o busca por su @usuario.
      </Empty>
    ) : (
      <Empty icon={<Users className="size-7" aria-hidden="true" />} title="Aún no sigues a nadie">
        Búscalos por su nombre o @usuario arriba.
      </Empty>
    );
  } else {
    content = (
      <Card className={cx('overflow-hidden transition-opacity', stale && 'opacity-60')}>
        <ul className="divide-y divide-line" aria-busy={stale || undefined}>
          {people.data.map((hit) => (
            <PersonRow key={hit.id} hit={hit} />
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <BackLink fallback="/perfil" className="-ml-2 flex size-11 items-center justify-center p-0" />
          <h1 className="text-2xl font-bold tracking-tight">Buscar personas</h1>
        </div>
        <label className="relative">
          <span className="sr-only">Buscar personas por nombre o @usuario</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, PEOPLE_QUERY_MAX))}
            placeholder="Busca por nombre o @usuario"
            className="h-11 pr-11 pl-9"
            enterKeyHint="search"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
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
        {!q && <h2 className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">Personas que sigues</h2>}
        {content}
      </div>
    </AppShell>
  );
}

function PersonRow({ hit }: { hit: PersonHit }) {
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <UserLink userId={hit.id} name={hit.name} username={hit.username}>
          {hit.followsYou && <Badge className="mt-0.5">Te sigue</Badge>}
        </UserLink>
      </div>
      <FollowButton userId={hit.id} name={hit.name} following={hit.isFollowing} followsYou={hit.followsYou} size="sm" />
    </li>
  );
}
