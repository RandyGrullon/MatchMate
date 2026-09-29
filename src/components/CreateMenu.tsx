import { createContext, useCallback, useContext, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronRight, Plus, Ticket, Trophy } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useActiveSport } from '../lib/sportContext';
import type { LeagueKind } from '../lib/types';
import { getSport } from '../sports/registry';
import { useSportStatus } from '../sports/status';
import type { SportId } from '../sports/types';
import { LeagueFormModal } from './LeagueFormModal';
import { Button, Input, Modal, cx } from './ui';

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

/** Abre el menú "Crear" (el círculo del centro, el botón de arriba en la computadora, "Crear o unirme"…). */
export const useCreateMenu = () => useContext(Ctx);

/**
 * El menú "Crear": crear una liga, un torneo sin liga, anotar un juego suelto de boliche (sin deporte o en el
 * boliche) o unirse con un código. Va una sola vez en la raíz
 * de la app (no dentro de la barra, que se esconde según el tamaño de la pantalla: un modal ahí se trababa
 * al girar el teléfono). El deporte se elige en el primer paso de LeagueFormModal; si estás en un deporte (y lo
 * puedes crear), sale marcado y se va de una a los datos.
 */
export function CreateMenuProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const active = useActiveSport();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<{ kind: LeagueKind; sport: SportId | null } | null>(null);
  const [code, setCode] = useState('');

  const toLogin = useCallback(
    () => navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`),
    [navigate, location.pathname, location.search],
  );

  // Sin parámetros a propósito: varios botones lo pasan directo como onClick.
  const openMenu = useCallback(() => {
    if (!user) return toLogin();
    setCode('');
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

  function pick(kind: LeagueKind) {
    setOpen(false);
    setCreating({ kind, sport: active });
  }

  // Juego suelto: la hoja se abre en su página (sin cuenta no se llega aquí: el menú manda a entrar).
  function solo() {
    setOpen(false);
    navigate('/juegos-sueltos?nuevo=1');
  }

  function join(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setOpen(false);
    navigate(`/unirse/${encodeURIComponent(c)}`);
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <Modal open={open} onClose={() => setOpen(false)} title="Crear">
        <div className="flex flex-col gap-2">
          <LeagueOption sport={active} onClick={() => pick('liga')} />
          <TournamentOption sport={active} onClick={() => pick('torneo')} />
          {(!active || active === 'bowling') && <SoloOption onClick={solo} />}
          <form onSubmit={join} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Ticket className="size-5 text-accent" /> ¿Te invitaron? Pon el código
            </span>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD2345"
                maxLength={12}
                autoCapitalize="characters"
                className="font-mono tracking-widest uppercase"
                aria-label="Código de invitación"
              />
              <Button type="submit" disabled={!code.trim()}>
                Unirme
              </Button>
            </div>
          </form>
        </div>
      </Modal>
      {/* Se monta al abrirlo: así el estado de los deportes se consulta solo cuando hace falta. */}
      {creating && (
        <LeagueFormModal open onClose={() => setCreating(null)} kind={creating.kind} sport={creating.sport} onSaved={(to) => navigate(to)} />
      )}
    </Ctx.Provider>
  );
}

/** El deporte en que estás, si la cuenta lo puede crear (sale marcado al crear). */
function useCreatableActive(sport: SportId | null): { only: SportId | null; many: boolean; here: SportId | null } {
  const { isSuper } = useAuth();
  const { creatable } = useSportStatus(isSuper);
  return {
    only: creatable.length === 1 ? creatable[0] : null,
    many: creatable.length > 1,
    here: sport && creatable.includes(sport) ? sport : null,
  };
}

/** «Crear una liga»: de tu deporte (si estás en uno que puedes crear); si no, que elige el deporte o de cuál es. */
function LeagueOption({ sport, onClick }: { sport: SportId | null; onClick: () => void }) {
  const { only, many, here } = useCreatableActive(sport);
  const title = here ? `Crear una liga de ${getSport(here).lower}` : 'Crear una liga';
  const text = here
    ? `Pública o privada; invitas con link o QR.${many ? ' Puedes cambiar el deporte.' : ''}`
    : many
      ? 'Eliges el deporte. Pública o privada; invitas con link o QR.'
      : only && only !== 'bowling'
        ? `Liga de ${getSport(only).lower}. Pública o privada; invitas con link o QR.`
        : 'Con prácticas, torneos y ranking. Pública o privada; invitas con link o QR.';
  return <Option icon={<Plus className="size-5" />} title={title} text={text} onClick={onClick} primary />;
}

function TournamentOption({ sport, onClick }: { sport: SportId | null; onClick: () => void }) {
  const { here } = useCreatableActive(sport);
  return (
    <Option
      icon={<Trophy className="size-5" />}
      title={here ? `Torneo de ${getSport(here).lower} sin liga` : 'Torneo sin liga'}
      text="Un torneo suelto con sus jugadores, equipos y clasificación."
      onClick={onClick}
    />
  );
}

/** «Anotar un juego suelto»: boliche fuera de una liga o torneo (solo sin deporte o en el boliche). */
export function SoloOption({ onClick }: { onClick: () => void }) {
  const Icon = getSport('bowling').icon;
  return (
    <Option
      icon={<Icon className="size-5" />}
      title="Anotar un juego suelto"
      text="Boliche sin liga ni torneo: tus juegos y tu promedio"
      onClick={onClick}
    />
  );
}

function Option({ icon, title, text, onClick, primary }: { icon: ReactNode; title: string; text: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex items-center gap-3 rounded-2xl p-3 text-left transition active:scale-[0.98]',
        primary ? 'bg-accent text-accent-fg' : 'border border-line hover:bg-surface-2',
      )}
    >
      <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', primary ? 'bg-white/15' : 'bg-accent-soft text-accent')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className={cx('block text-sm', primary ? 'opacity-85' : 'text-muted')}>{text}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 opacity-60" />
    </button>
  );
}
