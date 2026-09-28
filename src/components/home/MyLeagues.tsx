import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Compass, Plus } from 'lucide-react';
import type { CalendarItem } from '../../lib/calendar';
import { sportHomePath } from '../../lib/sportContext';
import type { League, Member } from '../../lib/types';
import { sportMeta } from '../../sports/registry';
import { SportIcon } from '../../pages/sports/SportBits';
import { Button, Card, ListSkeleton, LoadError } from '../ui';
import { LeagueList, LeagueRow } from './LeagueCard';
import { groupBySport, leaguesCountLabel } from './logic';
import { SportTint } from './SportTint';

interface ListProps {
  leagues: readonly League[];
  roleOf: (lid: string) => Member['role'] | undefined;
  nextOf: ReadonlyMap<string, CalendarItem>;
  today: string;
}

/** Mis ligas de un deporte (o de uno solo): cada una con lo próximo que tiene. */
export function MyLeagueList({ leagues, roleOf, nextOf, today }: ListProps) {
  return (
    <LeagueList>
      {leagues.map((l, i) => (
        <LeagueRow key={l.id} league={l} index={i} role={roleOf(l.id)} next={nextOf.get(l.id)} today={today} />
      ))}
    </LeagueList>
  );
}

/**
 * Mis ligas y torneos agrupados por deporte (Home de todos): arriba de cada grupo el deporte, cuántas tengo y
 * «Entrar» (al Home de ese deporte).
 */
export function MyLeaguesBySport(props: ListProps) {
  const groups = groupBySport(props.leagues);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const meta = sportMeta(g.sport);
        return (
          <div key={g.sport} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <SportTint sport={g.sport} className="shrink-0">
                <span className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent" aria-hidden="true">
                  <SportIcon sport={g.sport} className="size-4" />
                </span>
              </SportTint>
              <p className="min-w-0 flex-1 truncate text-sm">
                <span className="font-semibold">{meta?.short ?? 'Otro deporte'}</span>
                <span className="text-muted"> · {leaguesCountLabel(g.leagues)}</span>
              </p>
              {meta && (
                <Link
                  to={sportHomePath(g.sport)}
                  className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-lg px-1 text-sm font-medium text-accent hover:underline"
                  aria-label={`Entrar a ${meta.label}`}
                >
                  Entrar <ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </div>
            <MyLeagueList {...props} leagues={g.leagues} />
          </div>
        );
      })}
    </div>
  );
}

/** Mis ligas: cargando, error, vacío (con qué hacer) o la lista (agrupada o no). */
export function MyLeaguesBody({
  count,
  loading,
  error,
  empty,
  children,
}: {
  count: number;
  loading: boolean;
  error: Error | null;
  /** Qué mostrar si no hay ninguna. */
  empty: ReactNode;
  children: ReactNode;
}) {
  // Lo que ya está (de la copia del teléfono) se muestra aunque se esté releyendo o haya fallado la relectura.
  if (count) return <>{children}</>;
  if (error) return <LoadError error={error} />;
  if (loading) return <ListSkeleton rows={2} />;
  return <>{empty}</>;
}

/**
 * Sin ligas todavía: qué se puede hacer (crear la tuya, buscar una pública o poner el código). `sportName`: «de
 * pádel» en el Home del deporte.
 */
export function NoLeaguesYet({
  sportName,
  canCreate,
  onCreate,
  exploreTo,
  exploreLabel,
}: {
  sportName?: string;
  canCreate: boolean;
  onCreate: () => void;
  exploreTo?: string;
  exploreLabel?: string;
}) {
  const of = sportName ? ` de ${sportName}` : '';
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <p className="font-semibold">Todavía no estás en ninguna liga{of}</p>
        <p className="text-sm text-muted">
          {canCreate ? 'Crea la tuya e invita a tus amigos con un link o QR, ' : ''}
          {canCreate ? 'o únete' : 'Únete'} a una pública. Si te invitaron, pon el código.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        {canCreate && (
          <Button variant="primary" className="h-11" icon={<Plus className="size-4" />} onClick={onCreate}>
            Crear liga{of}
          </Button>
        )}
        {exploreTo && (
          <Link
            to={exploreTo}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 text-sm font-medium transition hover:bg-surface-2"
          >
            <Compass className="size-4" aria-hidden="true" /> {exploreLabel ?? 'Ver ligas públicas'}
          </Link>
        )}
      </div>
    </Card>
  );
}
