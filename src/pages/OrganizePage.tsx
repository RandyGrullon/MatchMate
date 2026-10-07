import { Navigate, useLocation } from 'react-router';
import { Crown, Plus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { pendingTotal, useLeaguePending } from '../lib/data/organizer';
import { countLabel, organizeLanding, organizedLeagueIds } from '../lib/organize';
import type { League } from '../lib/types';
import { leagueSport } from '../sports/registry';
import { SportIcon } from './sports/SportBits';
import { useCreateMenu } from '../components/CreateMenu';
import { LeagueLogo } from '../components/home/LeagueCard';
import { useMyLeagues } from '../components/home/useHomeData';
import { pendingLine } from '../components/organizer/logic';
import { AppShell } from '../components/Shell';
import { Button, Card, ListRow, ListSkeleton, Loading, LoadError, RowIcon, SectionHeader } from '../components/ui';

/**
 * Organizar (`/organizar`, la pestaña de Pro): con una sola liga va directo a su Organizar (`/l/:lid/admin`); con
 * varias (o con la consola del dueño de la app), la lista de lo que organizas con lo que espera en cada una. Sin ligas
 * que organizar, cómo crear una. La pantalla con «Por hacer» y «La liga» llega con el resto de Organizar.
 */
export default function OrganizePage() {
  const auth = useAuth();
  const location = useLocation();
  const mine = useMyLeagues(null);
  const create = useCreateMenu();

  if (auth.loading) return <Loading />;
  if (!auth.user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;

  const organized = organizedLeagueIds(mine.memberships.data);
  if (!mine.memberships.loading) {
    const landing = organizeLanding(organized, auth.isSuper);
    if ('redirect' in landing) return <Navigate to={landing.redirect} replace />;
  }
  const byId = new Map(mine.all.map((l) => [l.id, l]));
  const leagues = organized.map((id) => byId.get(id)).filter((l): l is League => !!l);

  return (
    <AppShell>
      <div className="flex flex-col gap-7">
        <h1 className="text-title">Organizar</h1>

        {mine.error && !leagues.length ? (
          <LoadError error={mine.error} />
        ) : mine.loading ? (
          <ListSkeleton rows={2} />
        ) : leagues.length ? (
          <section>
            <SectionHeader title="Lo que organizas" />
            <Card className="overflow-hidden">
              {leagues.map((l) => (
                <OrganizedRow key={l.id} league={l} />
              ))}
            </Card>
          </section>
        ) : (
          <Card className="flex flex-col items-start gap-4 p-5">
            <div>
              <p className="text-body font-semibold">Todavía no organizas ninguna liga</p>
              <p className="mt-1 text-sm text-muted">Crea una liga o un torneo y aquí verás lo que espera por ti.</p>
            </div>
            <Button variant="soft" size="lg" icon={<Plus className="size-[18px]" strokeWidth={2.4} />} onClick={create.openMenu}>
              Crear o unirme
            </Button>
          </Card>
        )}

        {auth.isSuper && (
          <Card className="overflow-hidden">
            <ListRow
              leading={
                <RowIcon>
                  <Crown className="size-5" />
                </RowIcon>
              }
              title="Panel del superadmin"
              subtitle="Toda la app: cuentas, ligas y errores"
              to="/superadmin"
            />
          </Card>
        )}
      </div>
    </AppShell>
  );
}

/** Una liga que organizas: su logo (o el deporte), lo que espera y cuántas cosas son. */
function OrganizedRow({ league }: { league: League }) {
  const pending = useLeaguePending(league.id).data;
  const total = pendingTotal(pending);
  const line = pendingLine(pending);
  return (
    <ListRow
      leading={
        <LeagueLogo path={league.logoPath} className="size-10 rounded-xl">
          <RowIcon tone={total > 0 ? 'warn' : 'accent'}>
            <SportIcon sport={leagueSport(league)} className="size-5" />
          </RowIcon>
        </LeagueLogo>
      }
      title={league.name}
      subtitle={line || (pending ? 'Todo al día' : undefined)}
      to={`/l/${league.id}/admin`}
      ariaLabel={total > 0 ? `${league.name}: ${total} ${total === 1 ? 'pendiente' : 'pendientes'}` : undefined}
      trailing={
        total > 0 ? (
          <span className="num grid h-[26px] min-w-[26px] place-items-center rounded-full bg-accent px-2 text-[13px] font-bold text-accent-fg">
            {countLabel(total)}
          </span>
        ) : undefined
      }
    />
  );
}
