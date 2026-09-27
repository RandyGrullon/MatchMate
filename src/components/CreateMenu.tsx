import { createContext, useCallback, useContext, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ChevronRight, Plus, Ticket, Trophy } from 'lucide-react';
import { useAuth } from '../lib/auth';
import type { LeagueKind } from '../lib/types';
import { LeagueFormModal } from './LeagueFormModal';
import { Button, Input, Modal, cx } from './ui';

const Ctx = createContext<{ openMenu: () => void }>({ openMenu: () => undefined });

/** Abre el menú "Crear" (el círculo del centro, el botón de arriba en la computadora, "Crear o unirme"…). */
export const useCreateMenu = () => useContext(Ctx);

/**
 * El menú "Crear": crear una liga, un torneo sin liga o unirse con un código. Va una sola vez en la raíz
 * de la app (no dentro de la barra, que se esconde según el tamaño de la pantalla: un modal ahí se trababa
 * al girar el teléfono).
 */
export function CreateMenuProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<LeagueKind | null>(null);
  const [code, setCode] = useState('');

  const openMenu = useCallback(() => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    setCode('');
    setOpen(true);
  }, [user, navigate, location.pathname, location.search]);
  const value = useMemo(() => ({ openMenu }), [openMenu]);

  function pick(kind: LeagueKind) {
    setOpen(false);
    setCreating(kind);
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
          <Option icon={<Plus className="size-5" />} title="Crear una liga" text="Con prácticas, torneos y ranking. Pública o privada; invitas con link o QR." onClick={() => pick('liga')} primary />
          <Option icon={<Trophy className="size-5" />} title="Torneo sin liga" text="Un torneo suelto con sus jugadores, equipos y clasificación." onClick={() => pick('torneo')} />
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
      <LeagueFormModal open={creating != null} onClose={() => setCreating(null)} kind={creating ?? 'liga'} onSaved={(to) => navigate(to)} />
    </Ctx.Provider>
  );
}

function Option({ icon, title, text, onClick, primary }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; primary?: boolean }) {
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
