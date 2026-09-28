import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Check, ChevronDown, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLeaguesByIds, useMyMemberships, usePublicLeagues } from '../lib/data';
import { countBySport, mySportsFirst, offeredSports, setActiveSport, switchTarget, useActiveSport } from '../lib/sportContext';
import { SPORTS, SPORT_IDS, sportsOf } from '../sports/registry';
import { useSportStatus } from '../sports/status';
import type { SportId } from '../sports/types';
import { Logo } from './Logo';
import { sportTileNote } from './home/SportPickerRow';
import { SportTint } from './home/SportTint';
import { MODAL_OPENED, cx } from './ui';

/**
 * El deporte en que estás, siempre arriba: el ícono y el nombre del deporte (o el logo y «Todos los deportes»).
 * Tocarlo abre el selector: una hoja desde abajo en el teléfono y un cuadro debajo del botón en la computadora.
 * `compact`: solo el ícono (dentro de una liga, donde arriba va el nombre de la liga).
 */
export function SportChip({ compact }: { compact?: boolean }) {
  const active = useActiveSport();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const meta = active ? SPORTS[active] : null;
  const Icon = meta?.icon;
  const label = meta?.label ?? 'Todos los deportes';
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Estás en ${label}. Cambiar de deporte`}
        title="Cambiar de deporte"
        data-tour="deporte"
        className={cx(
          'flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface-2/70 pr-2 pl-1.5 text-sm font-semibold transition hover:bg-surface-2 active:scale-[0.97]',
          compact ? 'shrink-0' : 'max-w-[13rem] min-w-0 shrink pr-2.5',
        )}
      >
        {meta && Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
            <Icon className="size-[1.1rem]" aria-hidden="true" />
          </span>
        ) : (
          <Logo className="size-8 shrink-0" />
        )}
        {!compact &&
          (meta ? (
            <span className="min-w-0 truncate">{meta.short}</span>
          ) : (
            <span className="min-w-0 truncate">
              {/* En la computadora angosta, al lado de las secciones, no cabe entero. */}
              <span className="sm:hidden lg:inline">Todos los deportes</span>
              <span className="hidden sm:inline lg:hidden">Todos</span>
            </span>
          ))}
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </button>
      {open && <SportSheet anchor={ref.current} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Ancho del cuadro en la computadora (26rem). */
const POPOVER_W = 416;

/** Dónde va el cuadro en la computadora: debajo del botón, sin salirse de la pantalla. */
function popoverPlace(anchor: HTMLElement | null): CSSProperties {
  if (!anchor || typeof window === 'undefined') return {};
  const r = anchor.getBoundingClientRect();
  const left = Math.max(12, Math.min(r.left, window.innerWidth - POPOVER_W - 12));
  return { '--pop-top': `${Math.round(r.bottom + 8)}px`, '--pop-left': `${Math.round(left)}px` } as CSSProperties;
}

const SHEET_CSS = [
  '@keyframes mm-sheet-up{from{transform:translateY(100%)}to{transform:none}}',
  '.mm-sheet[open]{animation:mm-sheet-up .3s var(--ease-out)}',
  '@media (min-width:640px){.mm-sheet[open]{animation:pop-in .2s var(--ease-out)}}',
].join('\n');

/** El selector de deporte (montado solo mientras está abierto: así sus datos se piden solo al abrirlo). */
function SportSheet({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { user, isSuper } = useAuth();
  const active = useActiveSport();
  const { status } = useSportStatus(isSuper);
  const memberships = useMyMemberships(user?.uid);
  const mine = useLeaguesByIds(memberships.data.map((m) => m.leagueId));
  const pub = usePublicLeagues();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [place] = useState(() => popoverPlace(anchor));

  useLayoutEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      window.dispatchEvent(new Event(MODAL_OPENED));
    }
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  // Al girar el teléfono o cambiar el tamaño de la ventana, el cuadro quedaría fuera de lugar: se cierra.
  useEffect(() => {
    const close = () => {
      if (window.matchMedia('(min-width: 640px)').matches) onClose();
    };
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [onClose]);

  const counts = useMemo(() => countBySport(mine.data), [mine.data]);
  const sports = useMemo(
    () => mySportsFirst(offeredSports({ status, isSuper, mine: sportsOf(mine.data), visible: sportsOf(pub.data), active }), counts),
    [status, isSuper, mine.data, pub.data, active, counts],
  );
  const hidden = SPORT_IDS.length - sports.length;

  function choose(sport: SportId | null) {
    setActiveSport(sport);
    onClose();
    const to = switchTarget(pathname, sport);
    if (to && to !== pathname) navigate(to);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="deporte-titulo"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      style={place}
      className={cx(
        'mm-sheet overflow-hidden overscroll-none border border-line bg-surface p-0 text-fg shadow-2xl',
        // Teléfono: hoja desde abajo, de lado a lado.
        'm-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-3xl border-b-0',
        // Computadora: cuadro debajo del botón.
        'sm:mt-(--pop-top) sm:mr-auto sm:mb-auto sm:ml-(--pop-left) sm:max-h-[min(36rem,calc(100dvh_-_var(--pop-top)_-_1rem))] sm:w-[26rem] sm:rounded-2xl sm:border-b sm:backdrop:bg-black/20 sm:backdrop:backdrop-blur-none',
      )}
    >
      <style href="mm-sheet" precedence="default">
        {SHEET_CSS}
      </style>
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 id="deporte-titulo" className="text-base font-semibold">
              ¿En qué deporte estás?
            </h2>
            <p className="text-sm text-muted">Home y Eventos muestran solo lo de ese deporte.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mt-1.5 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4">
          <button
            type="button"
            onClick={() => choose(null)}
            aria-pressed={active === null}
            className={cx(
              'mb-3 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition active:scale-[0.99]',
              active === null ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-surface-2',
            )}
          >
            <SportTint sport="bowling" className="shrink-0">
              <Logo className="size-11" />
            </SportTint>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Todos los deportes</span>
              <span className="block text-xs text-muted">
                {mine.data.length === 1
                  ? 'Tu liga y lo de todos los deportes'
                  : mine.data.length > 1
                    ? `Tus ${mine.data.length} ligas y lo de todos los deportes`
                    : 'Home y Eventos con todo junto'}
              </span>
            </span>
            {active === null && <Check className="size-5 shrink-0 text-accent" />}
          </button>

          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Deportes">
            {sports.map((id) => {
              const meta = SPORTS[id];
              const Icon = meta.icon;
              const on = active === id;
              const count = counts[id] ?? 0;
              return (
                <SportTint key={id} sport={id} className="contents">
                  <button
                    type="button"
                    onClick={() => choose(id)}
                    aria-pressed={on}
                    aria-label={`${meta.label}: ${sportTileNote(count, status[id])}`}
                    className={cx(
                      'relative flex min-h-[6.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-3 text-center transition active:scale-[0.97]',
                      on ? 'border-accent bg-accent-soft/60' : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <span className={cx('flex size-11 items-center justify-center rounded-2xl', on ? 'bg-accent text-accent-fg' : 'bg-accent-soft text-accent')}>
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <span className="w-full truncate text-sm leading-tight font-semibold">{meta.short}</span>
                    <span className={cx('text-[11px] leading-none', count > 0 ? 'font-medium text-accent' : 'text-muted')}>{sportTileNote(count, status[id])}</span>
                    {on && (
                      <span className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                </SportTint>
              );
            })}
          </div>

          {hidden > 0 && <p className="mt-3 px-1 text-xs text-muted">Más deportes están en prueba: salen aquí cuando abran.</p>}
        </div>
      </div>
    </dialog>
  );
}
