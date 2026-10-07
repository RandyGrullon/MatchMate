import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { LeagueContext, type LeagueCtx } from '../lib/league';
import { useActiveSport } from '../lib/sportContext';
import type { EventType, LeagueKind } from '../lib/types';
import type { SportId } from '../sports/types';
import { CreateSheet, SoloOption, type OrganizedLeague } from './create/CreateSheet';
import { CreateWizard } from './create/CreateWizard';
import { EventFormModal } from './EventFormModal';

export { SoloOption };

interface CreateMenuApi {
  /** Abre el menú «Crear» (crear liga, torneo sin liga o unirse con código). */
  openMenu: () => void;
  /**
   * Va directo a crear una liga o un torneo de ese deporte (p. ej. «Crear liga de pádel» en el Home del deporte).
   * Sin deporte, el que está marcado es el deporte en que estás.
   */
  startCreate: (kind: LeagueKind, sport?: SportId | null) => void;
}

const Ctx = createContext<CreateMenuApi>({ openMenu: () => undefined, startCreate: () => undefined });

/** Abre la hoja «Crear o unirme» (Ligas › «Crear o unirme», el menú de cambiar de liga, «Crear una liga»…). */
export const useCreateMenu = () => useContext(Ctx);

/** Lo que necesita el formulario de la práctica o del torneo de una liga (EventFormModal lee la liga del contexto). */
export function organizedCtx({ league, member }: OrganizedLeague): LeagueCtx {
  return {
    lid: league.id,
    league,
    member,
    isAdmin: true,
    isOwner: member.role === 'owner',
    isScorer: !!member.scorer,
    canScore: true,
    myPlayerId: member.playerId,
    base: `/l/${league.id}`,
  };
}

/**
 * La hoja «Crear o unirme» (ya no es el botón del centro de la barra: se abre desde Ligas): primero unirse con un
 * código o el QR, que es lo más común, y debajo crear una liga o un torneo (el asistente de pasos, CreateWizard), una
 * práctica o un torneo en una liga que organizas (el formulario de siempre, EventFormModal) o anotar un juego suelto.
 * Va una sola vez en la raíz de la app (no dentro de una pantalla: un modal ahí se trababa al girar el teléfono). Si
 * estás en un deporte (y lo puedes crear), el asistente lo trae marcado.
 */
export function CreateMenuProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const active = useActiveSport();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<{ kind: LeagueKind; sport: SportId | null } | null>(null);
  const [eventFor, setEventFor] = useState<{ org: OrganizedLeague; type: EventType } | null>(null);

  const toLogin = useCallback(
    () => navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`),
    [navigate, location.pathname, location.search],
  );

  // Sin parámetros a propósito: varios botones lo pasan directo como onClick.
  const openMenu = useCallback(() => {
    if (!user) return toLogin();
    setOpen(true);
  }, [user, toLogin]);

  const startCreate = useCallback(
    (kind: LeagueKind, sport?: SportId | null) => {
      if (!user) return toLogin();
      setOpen(false);
      setCreating({ kind, sport: sport === undefined ? active : sport });
    },
    [user, toLogin, active],
  );
  const value = useMemo(() => ({ openMenu, startCreate }), [openMenu, startCreate]);

  // Si cambia la pantalla, la hoja se cierra.
  useEffect(() => setOpen(false), [location.pathname]);

  const close = useCallback(() => setOpen(false), []);

  // Juego suelto: la hoja se abre en su página (sin cuenta no se llega aquí: el menú manda a entrar).
  function solo() {
    setOpen(false);
    navigate('/juegos-sueltos?nuevo=1');
  }

  function join(code: string) {
    setOpen(false);
    navigate(`/unirse/${encodeURIComponent(code)}`);
  }

  function event(org: OrganizedLeague, type: EventType) {
    setOpen(false);
    setEventFor({ org, type });
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <CreateSheet open={open} onClose={close} onJoin={join} onCreate={(kind) => startCreate(kind)} onEvent={event} onSolo={solo} />
      {/* Se monta al abrirlo: el estado de los deportes y las ligas se consultan solo cuando hace falta. */}
      {creating && (
        <CreateWizard
          kind={creating.kind}
          sport={creating.sport}
          onClose={() => setCreating(null)}
          onDone={(to) => {
            setCreating(null);
            navigate(to);
          }}
        />
      )}
      {eventFor && (
        <LeagueContext.Provider value={organizedCtx(eventFor.org)}>
          <EventFormModal
            open
            type={eventFor.type}
            onClose={() => setEventFor(null)}
            onCreated={(id) => navigate(`/l/${eventFor.org.league.id}/e/${id}${eventFor.type === 'torneo' ? '?tab=inscritos' : ''}`)}
          />
        </LeagueContext.Provider>
      )}
    </Ctx.Provider>
  );
}
