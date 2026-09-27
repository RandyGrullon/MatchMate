import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button, cx } from './ui';

/**
 * Tour guiado: oscurece la pantalla, resalta cada cosa (marcada con data-tour="…") y explica qué hace.
 * Cada tour sale una sola vez por cuenta (la primera vez que se entra a esa pantalla); se puede repetir
 * desde Configuración.
 */
export interface TourStep {
  /** Valor de data-tour del elemento a resaltar. */
  target: string;
  title: string;
  body: string;
}

const PREFIX = 'bowlingx:tour:';
const seenKey = (name: string, uid: string) => `${PREFIX}${name}:${uid}`;
/** Solo un tour a la vez. */
let running = false;

function seen(name: string, uid: string): boolean {
  try {
    return localStorage.getItem(seenKey(name, uid)) === '1';
  } catch {
    return true;
  }
}
function markSeen(name: string, uid: string) {
  try {
    localStorage.setItem(seenKey(name, uid), '1');
  } catch {
    // sin almacenamiento: puede volver a salir
  }
}

/** Configuración › "Ver el tour otra vez": todos los tours vuelven a salir. */
export function resetTours() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // sin almacenamiento
  }
}

/** El elemento visible con ese data-tour (en el teléfono y en la computadora hay versiones distintas). */
function findTarget(target: string): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)];
  return all.find((el) => el.getClientRects().length > 0 && el.offsetWidth > 0) ?? null;
}

/**
 * Pone el tour `name` en esta pantalla. Arranca solo (una vez) cuando `when` es verdadero, después de
 * que la pantalla cargó; los pasos cuyo elemento no está (p. ej. no hay nada en juego) se saltan.
 */
export function Tour({ name, steps, when = true }: { name: string; steps: TourStep[]; when?: boolean }) {
  const { user } = useAuth();
  const [active, setActive] = useState<TourStep[] | null>(null);

  useEffect(() => {
    if (!user || !when || seen(name, user.uid)) return;
    const timer = setTimeout(() => {
      // Con un modal abierto (o con otro tour) se espera a la próxima vez.
      if (running || document.querySelector('dialog[open]')) return;
      const present = steps.filter((s) => findTarget(s.target));
      if (present.length < 2) return;
      running = true;
      setActive(present);
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, when, name]);

  const done = useCallback(() => {
    if (user) markSeen(name, user.uid);
    running = false;
    setActive(null);
  }, [name, user]);

  useEffect(() => () => void (running = false), []);

  if (!active) return null;
  return createPortal(<Overlay steps={active} onDone={done} />, document.body);
}

const PAD = 6;

function Overlay({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [bubbleH, setBubbleH] = useState(180);
  const step = steps[i];
  const last = i === steps.length - 1;

  useLayoutEffect(() => {
    const el = findTarget(step.target);
    if (!el) {
      // Desapareció (la pantalla cambió): se sigue con el próximo.
      if (last) onDone();
      else setI((n) => n + 1);
      return;
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const settle = setTimeout(update, 400);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step.target, last, onDone]);

  useLayoutEffect(() => {
    if (bubble.current) setBubbleH(bubble.current.offsetHeight);
  }, [i, rect]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone();
      if (e.key === 'ArrowRight') (last ? onDone() : setI((n) => n + 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onDone]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(340, vw - 32);
  // La burbuja va debajo del elemento si cabe; si no, arriba.
  const below = rect ? rect.bottom + PAD + 12 + bubbleH < vh - 12 : true;
  const top = rect ? (below ? rect.bottom + PAD + 12 : Math.max(12, rect.top - PAD - 12 - bubbleH)) : vh / 2 - bubbleH / 2;
  const left = rect ? Math.min(vw - width - 16, Math.max(16, rect.left + rect.width / 2 - width / 2)) : (vw - width) / 2;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Tour: ${step.title}`}>
      {/* Todo oscuro menos lo que se explica (el hueco lo hace la sombra enorme del recuadro). */}
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl ring-2 ring-accent transition-all duration-300"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgb(8 10 15 / 0.65)',
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[rgb(8_10_15/0.65)]" />
      )}
      <div
        ref={bubble}
        className="animate-fade-up absolute flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-2xl transition-all duration-300"
        style={{ top, left, width }}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wide text-accent uppercase">
              {i + 1} de {steps.length}
            </p>
            <h2 className="font-bold">{step.title}</h2>
          </div>
          <button type="button" onClick={onDone} aria-label="Saltar el tour" className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        <p className="text-sm text-muted">{step.body}</p>
        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1" aria-hidden>
            {steps.map((s, n) => (
              <span key={s.target} className={cx('h-1.5 rounded-full transition-all', n === i ? 'w-4 bg-accent' : 'w-1.5 bg-line')} />
            ))}
          </div>
          {i > 0 && <Button size="sm" variant="ghost" aria-label="Atrás" icon={<ArrowLeft className="size-4" />} onClick={() => setI((n) => n - 1)} />}
          <Button size="sm" variant="primary" icon={last ? <Check className="size-4" /> : <ArrowRight className="size-4" />} onClick={() => (last ? onDone() : setI((n) => n + 1))}>
            {last ? 'Listo' : 'Siguiente'}
          </Button>
        </div>
      </div>
    </div>
  );
}
