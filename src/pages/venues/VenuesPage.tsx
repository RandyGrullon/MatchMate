import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Building2, MapPin, Search, SearchX } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useVenueSearch } from '../../lib/data/business';
import { useActiveSport } from '../../lib/sportContext';
import { useIsPro } from '../../lib/useMode';
import { SPORT_IDS, isSportId, sportMeta } from '../../sports/registry';
import { ScreenTitle } from '../../components/screens/ScreenBits';
import { AppShell } from '../../components/Shell';
import { LeagueTopBar } from '../../components/league/home/LeagueTopBar';
import { VenueCard } from '../../components/venues/VenueBits';
import { Button, Card, Empty, Input, LoadError, Skeleton, cx } from '../../components/ui';
import { SportIcon } from '../sports/SportBits';

function useDebounced(value: string, ms = 300): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Dónde jugar (`/canchas`, de la sección Ligas): las canchas y espacios de las empresas aprobadas, por deporte
 * (`?deporte=`), ciudad y nombre. Las destacadas salen primero. También sin cuenta. Abajo, para quien tiene canchas:
 * registrar su empresa.
 */
export default function VenuesPage() {
  const pro = useIsPro();
  const auth = useAuth();
  const active = useActiveSport();
  const [params, setParams] = useSearchParams();
  const raw = params.get('deporte');
  const sport = raw === 'todos' ? null : raw && isSportId(raw) ? raw : (active ?? null);
  const [city, setCity] = useState('');
  const [query, setQuery] = useState('');
  const venues = useVenueSearch({ sport, city: useDebounced(city), query: useDebounced(query) });

  const pickSport = (s: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('deporte', s ?? 'todos');
        return n;
      },
      { replace: true },
    );

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <LeagueTopBar to="/ligas" label="Ligas" />
        <ScreenTitle title="Dónde jugar" hint="Canchas y espacios deportivos" pro={pro} />

        <div className="-mx-2 mt-4 flex gap-2 overflow-x-auto px-2 pb-1" role="group" aria-label="Deporte">
          {[null, ...SPORT_IDS].map((id) => {
            const on = id === sport;
            return (
              <button
                key={id ?? 'todos'}
                type="button"
                aria-pressed={on}
                onClick={() => pickSport(id)}
                className={cx(
                  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition',
                  on ? 'bg-accent text-accent-fg' : 'bg-surface text-fg ring-1 ring-line ring-inset',
                )}
              >
                {id && <SportIcon sport={id} className="size-4" />}
                {id ? sportMeta(id)?.short : 'Todos'}
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="relative">
            <span className="sr-only">Ciudad</span>
            <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input className="pl-9" placeholder="Ciudad" value={city} maxLength={60} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="relative">
            <span className="sr-only">Nombre</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input className="pl-9" placeholder="Nombre" value={query} maxLength={60} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>

        <div className="mt-5">
          {venues.loading && !venues.data.length ? (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-64 rounded-3xl" />
              ))}
            </div>
          ) : venues.error && !venues.data.length ? (
            <LoadError error={venues.error} />
          ) : venues.data.length ? (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {venues.data.map((v) => (
                <VenueCard key={v.id} venue={v} to={`/canchas/${v.id}`} />
              ))}
            </div>
          ) : (
            <Empty icon={<SearchX className="size-7" aria-hidden="true" />} title={sport ? `Todavía no hay espacios de ${sportMeta(sport)?.lower ?? 'ese deporte'}` : 'Todavía no hay espacios'}>
              {city || query ? 'Prueba con otra ciudad u otro nombre.' : 'Cuando los clubes y canchas se registren, salen aquí.'}
            </Empty>
          )}
        </div>

        <Card className="mt-6 flex items-center gap-3 p-4">
          <Building2 className="size-6 shrink-0 text-accent" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-meta">¿Tienes canchas o un espacio deportivo? Publícalo gratis.</p>
          <Link to={auth.user ? '/empresa' : `/login?next=${encodeURIComponent('/empresa')}`}>
            <Button variant="soft" size="sm">
              Registrar
            </Button>
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}
