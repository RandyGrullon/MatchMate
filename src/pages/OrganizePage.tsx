import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Crown, Plus, Zap } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { LeagueContext } from '../lib/league';
import { organizedLeagueIds } from '../lib/organize';
import type { League } from '../lib/types';
import { leagueSport } from '../sports/registry';
import { useCreateMenu } from '../components/CreateMenu';
import { useMyLeagues } from '../components/home/useHomeData';
import { SportTheme } from '../components/league/SportTheme';
import { useIsPro, useSwitchMode } from '../components/mode';
import { NoticeRow, NoticeSlot } from '../components/NoticeSlot';
import { OrganizeHub, useOrganizerCtx } from '../components/organizer/Hub';
import { organizeUrl, pickOrganizeLeague } from '../components/organizer/hubLogic';
import { LeaguePickerChip, LeaguePickerSheet } from '../components/organizer/LeaguePicker';
import { AppShell } from '../components/Shell';
import { Button, Card, ListRow, ListSkeleton, Loading, LoadError, RowIcon } from '../components/ui';

/** La última liga que se miró en Organizar (en este teléfono, por cuenta). */
const LAST_KEY = (uid: string) => `mm:organizar:${uid}`;

function rememberedLeague(uid: string | undefined): string | null {
  if (!uid) return null;
  try {
    return localStorage.getItem(LAST_KEY(uid));
  } catch {
    return null;
  }
}

function rememberLeague(uid: string, lid: string) {
  try {
    localStorage.setItem(LAST_KEY(uid), lid);
  } catch {
    // almacenamiento no disponible
  }
}

/**
 * Organizar (`/organizar`, la pestaña de Pro; `?liga=` elige la liga): el título, la ficha de la liga (toca para elegir
 * otra de las que organizas), «Por hacer» (solo lo que tiene algo, con su número) y «La liga» (cada fila a su pantalla
 * de `/l/:lid/admin?tab=…`). `/l/:lid/admin` sin pantalla viene aquí. Sin ligas que organizar, cómo crear una; el
 * dueño de la app, además, su consola. En Lite se abre igual (un aviso o un link), con «Esto es de Pro · Usar Pro».
 */
export default function OrganizePage() {
  const auth = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const mine = useMyLeagues(null);
  const create = useCreateMenu();
  const uid = auth.user?.uid;

  const organized = organizedLeagueIds(mine.memberships.data);
  const requested = params.get('liga');
  // La pedida se abre de una (sus permisos se miran al cargarla); si no, se espera a saber cuáles organizas.
  const lid = requested && auth.isSuper ? requested : mine.memberships.loading ? null : pickOrganizeLeague(organized, requested, rememberedLeague(uid), auth.isSuper);
  useEffect(() => {
    if (uid && lid) rememberLeague(uid, lid);
  }, [uid, lid]);

  if (auth.loading) return <Loading />;
  if (!auth.user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;

  const byId = new Map(mine.all.map((l) => [l.id, l]));
  const leagues = organized.map((id) => byId.get(id)).filter((l): l is League => !!l);

  return (
    <AppShell>
      <div className="flex flex-col px-2">
        <h1 className="text-title">Organizar</h1>

        {lid ? (
          <OrganizeLeague key={lid} lid={lid} leagues={leagues} onCreate={create.openMenu} />
        ) : mine.error ? (
          <div className="mt-7">
            <LoadError error={mine.error} />
          </div>
        ) : mine.memberships.loading ? (
          <div className="mt-7">
            <ListSkeleton rows={3} />
          </div>
        ) : (
          <Card className="mt-7 flex flex-col items-start gap-4 p-5">
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
          <Card className="mt-7 overflow-hidden">
            <ListRow
              dense
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

        {/* El aviso de la pantalla (instalar, permitir avisos…), abajo: lo de arriba es lo que espera. */}
        <NoticeSlot className="mt-7" />
      </div>
    </AppShell>
  );
}

/** Lo de una liga: su ficha (con la hoja para cambiar), «Por hacer» y «La liga», en el color de su deporte. */
function OrganizeLeague({ lid, leagues, onCreate }: { lid: string; leagues: readonly League[]; onCreate: () => void }) {
  const navigate = useNavigate();
  const isPro = useIsPro();
  const { ctx, loading, error } = useOrganizerCtx(lid);
  const [picking, setPicking] = useState(false);
  const league = ctx?.league ?? leagues.find((l) => l.id === lid) ?? null;

  return (
    <SportTheme sport={league ? leagueSport(league) : null} className="flex flex-col">
      <LeaguePickerChip league={league} onOpen={() => setPicking(true)} className="mt-1.5" />
      {!isPro && <ProLine />}
      {error && !ctx ? (
        <div className="mt-7">
          <LoadError error={error} />
        </div>
      ) : !ctx ? (
        <div className="mt-7">{loading ? <ListSkeleton rows={4} /> : <LoadError error={new Error('not-found')} />}</div>
      ) : !ctx.isAdmin ? (
        <div className="mt-7">
          <LoadError error={new Error('permission-denied')} />
        </div>
      ) : (
        <LeagueContext.Provider value={ctx}>
          <OrganizeHub />
        </LeagueContext.Provider>
      )}
      <LeaguePickerSheet
        open={picking}
        onClose={() => setPicking(false)}
        leagues={leagues}
        current={lid}
        onPick={(id) => navigate(organizeUrl(id), { replace: true })}
        onCreate={onCreate}
      />
    </SportTheme>
  );
}

/** En Lite (se llegó por un aviso o un link): la pantalla se abre igual, con una línea para pasar a Pro. */
function ProLine() {
  const switchMode = useSwitchMode();
  return (
    <NoticeRow
      className="mt-4"
      notice={{
        id: 'organizar-pro',
        kind: 'pro',
        icon: <Zap className="size-[18px]" />,
        title: 'Esto es de Pro',
        text: 'Con Pro, Organizar va en la barra de abajo',
        action: { label: 'Usar Pro', onClick: () => switchMode('pro') },
        dismissible: false,
      }}
    />
  );
}
