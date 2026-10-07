import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, History, X } from 'lucide-react';
import { BusyIcon, useBusy } from '../busy';
import { useFeedback } from '../feedback';
import { MODAL_OPENED, cx } from '../ui';
import { clearGameDraft, forgetAfterSave, pendingDraft, readGameDraft, rememberGame, type PendingDraft } from './draftMemory';
import { ACTION_BUTTON, FrameEditor, type EditorParts, type EditorWork, type ScoreMode, type ScoreValue } from './FrameEditor';

/** El aviso de lo que quedó sin guardar (y, si lo guardado cambió mientras tanto, qué quedó guardado). */
function memoryNotice({ newer }: PendingDraft): { title: string; detail: string | null } {
  return {
    title: 'Seguimos donde lo dejaste',
    detail: !newer
      ? null
      : newer.score != null
        ? `Ojo: mientras tanto se guardó ${newer.score} en este juego.`
        : 'Ojo: lo guardado de este juego cambió mientras tanto.',
  };
}

/**
 * El título de la hoja en dos líneas: «Ana Pérez · Juego 3» pasa a «Juego 3» con «Ana Pérez» debajo (si no viene
 * `subtitle`), así cabe al lado de la X y de «Teclado ▾».
 */
export function splitTitle(title: ReactNode, subtitle?: ReactNode): [ReactNode, ReactNode] {
  if (subtitle != null || typeof title !== 'string') return [title, subtitle ?? null];
  const at = title.lastIndexOf(' · ');
  return at > 0 ? [title.slice(at + 3), title.slice(0, at)] : [title, null];
}

/**
 * El fondo de la hoja: blanco en claro y el fondo de la app en oscuro (las teclas grises se distinguen), y la barra de
 * progreso sobre él. En los tres sitios del modo oscuro (como el sistema y elegido en la app).
 */
const SHEET_DARK = '--an-bg:var(--bg);--an-track:var(--line)';
const SHEET_CSS = [
  '.mm-anotar{--an-bg:var(--surface);--an-track:var(--surface-2)}',
  `@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .mm-anotar{${SHEET_DARK}}}`,
  `:root[data-theme=dark] .mm-anotar{${SHEET_DARK}}`,
].join('\n');

/**
 * Qué hace el botón grande del pie: «Guardar» con el juego completo (o un total válido); a mitad del juego, con memoria,
 * «Guardar y salir» (lo anotado ya está en el teléfono: cierra sin guardar nada como puntaje); sin memoria, apagado.
 */
export function footerAction(ready: boolean, remembers: boolean): 'guardar' | 'salir' | 'apagado' {
  return ready ? 'guardar' : remembers ? 'salir' : 'apagado';
}

/** Lo que se sabe de la memoria del teléfono al abrir un juego. */
function openMemory(opened: string | null, memoryKey: string | undefined, initial: ScoreValue, saved: ScoreValue) {
  if (!opened || !memoryKey) return { opened, found: null, inPhone: false };
  const found = pendingDraft(memoryKey, initial, saved);
  return { opened, found, inPhone: found != null || readGameDraft(memoryKey) != null };
}

/**
 * Hoja a pantalla completa para anotar un juego (pines, teclado o total, en «Teclado ▾»). Arriba la X, el juego y la forma
 * de anotar; después «Seguimos donde lo dejaste» (si hay algo sin guardar), lo de `top` (la bola del juego), el progreso,
 * la hoja de 2 × 5 cuadros, lo que llevas y el teclado; abajo «Deshacer» y «Guardar».
 *
 * `resetKey` reinicia el editor al cambiar de juego; `startMode` elige con qué forma se abre un juego sin cuadros.
 *
 * Con `memoryKey` (única por cuenta, lugar y juego) cada cambio queda en el teléfono hasta «Guardar»: si se cierra sin
 * guardar (la X, «Guardar y salir» a mitad del juego, Esc, atrás o la app cerrada), al volver a abrir ese juego sigue
 * donde lo dejó, con «Descartar» para volver a lo guardado. «Guardar» (`onSave`) solo se llama con el juego completo (o
 * un total válido): a mitad del juego el botón es «Guardar y salir», que deja lo anotado en el teléfono y cierra (nunca
 * guarda un juego a medias como puntaje). Si `onSave` devuelve `false` no se guardó: la memoria se queda.
 */
export function ScoreEntryModal({
  open,
  onClose,
  title,
  subtitle,
  initial,
  onSave,
  resetKey,
  memoryKey,
  stored,
  top,
  note,
  saveText = 'Guardar',
  startMode,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** La línea de debajo del título («Práctica de hoy»). */
  subtitle?: ReactNode;
  initial: ScoreValue;
  onSave: (v: ScoreValue) => Promise<unknown> | void;
  resetKey?: string;
  /** Dónde se recuerda lo anotado sin guardar (sin esto, cerrar sin guardar lo pierde). */
  memoryKey?: string;
  /**
   * Lo guardado de verdad, cuando «Guardar» de esta hoja solo lo pasa a otra que se guarda después (juego suelto): la
   * memoria se compara con esto y se queda al tocar «Listo» (la borra esa hoja al guardar).
   */
  stored?: ScoreValue;
  /** Arriba del editor (la bola del juego; en la tabla, también elegir el juego). */
  top?: ReactNode;
  /** Debajo del teclado (p. ej. «Borrar» el juego del teléfono). */
  note?: ReactNode;
  saveText?: string;
  startMode?: ScoreMode;
}) {
  const { confirm, toast } = useFeedback();
  const saving = useBusy<'guardar'>();
  const saved = stored ?? initial;
  // Lo que quedó sin guardar de este juego se lee al abrirlo (y al cambiar de juego): el editor arranca con eso.
  const opened = open && memoryKey ? `${memoryKey}\n${resetKey ?? ''}` : null;
  const [memory, setMemory] = useState(() => openMemory(opened, memoryKey, initial, saved));
  if (memory.opened !== opened) setMemory(openMemory(opened, memoryKey, initial, saved));
  const current = memory.opened === opened;
  const found = current ? memory.found : null;
  const inPhone = current && memory.inPhone;
  const notice = found ? memoryNotice(found) : null;
  const [head, sub] = splitTitle(title, subtitle);
  const titleId = useId();

  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Los avisos que están en pantalla vuelven a ponerse encima de esta hoja.
      window.dispatchEvent(new Event(MODAL_OPENED));
    }
    if (!open && d.open) d.close();
  }, [open]);
  // Si se desmonta abierta, que no quede el fondo oscuro (y el foco vuelve al botón que la abrió).
  useLayoutEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  // El aviso también para el lector de pantalla: se escribe después de abrir en una región que ya está (si llega
  // escrito junto con la hoja, no se anuncia).
  const said = useRef<HTMLParagraphElement>(null);
  const spoken = notice ? [`${notice.title} (sin guardar)`, notice.detail].filter(Boolean).join('. ') : '';
  useEffect(() => {
    const t = setTimeout(() => {
      if (said.current) said.current.textContent = spoken;
    }, 150);
    return () => clearTimeout(t);
  }, [spoken, opened]);
  // Después de «Descartar» ese botón ya no está: el foco vuelve a la forma de anotar (cuando ya se cerró la pregunta,
  // que al cerrarse lo devuelve al botón).
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (!refocus) return;
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-mode-trigger]')?.focus(), 60);
    return () => clearTimeout(t);
  }, [refocus]);

  function change(_v: ScoreValue & { ready: boolean }, work: EditorWork) {
    if (!open || !memoryKey) return;
    rememberGame(memoryKey, work, saved);
    // «✓ Guardado en tu teléfono» solo si de verdad quedó (sin almacenamiento, no).
    const has = readGameDraft(memoryKey) != null;
    setMemory((m) => (m.opened === opened && m.inPhone !== has ? { ...m, inPhone: has } : m));
  }

  /** Volver a lo guardado y olvidar lo de la memoria, preguntando antes (lo anotado no se recupera). */
  async function discard() {
    const key = memoryKey;
    const ok = await confirm({
      title: '¿Descartar lo anotado?',
      message: 'Se borra lo que anotaste en este juego sin guardar y vuelve a lo guardado. No se puede deshacer.',
      confirmText: 'Descartar',
      danger: true,
    });
    if (!ok || !key) return;
    clearGameDraft(key);
    setMemory((m) => (m.opened === opened ? { opened, found: null, inPhone: false } : m));
    setRefocus((n) => n + 1);
    toast('Se descartó lo anotado');
  }

  async function save(v: ScoreValue) {
    // La de este juego: al guardar se puede pasar al siguiente.
    const key = memoryKey;
    await saving.run('guardar', async () => {
      const result = await onSave({ score: v.score, frames: v.frames });
      if (key) forgetAfterSave(key, result, stored !== undefined);
    });
  }

  /** A mitad del juego: lo anotado ya está en el teléfono; se cierra sin guardar nada como puntaje. */
  function keepAndClose() {
    if (inPhone) toast('Guardado en tu teléfono: sigue cuando quieras');
    onClose();
  }

  /** «Guardar 214» con el juego completo; a mitad del juego, «Guardar y salir» (sin `memoryKey`, «Guardar» apagado). */
  function saveButton({ value }: EditorParts) {
    const action = footerAction(value.ready, !!memoryKey);
    if (action === 'guardar') {
      return (
        <button
          type="button"
          disabled={saving.isBusy()}
          aria-busy={saving.isBusy() || undefined}
          onClick={() => void save(value)}
          className={cx(ACTION_BUTTON, 'bg-accent text-accent-fg')}
        >
          <BusyIcon busy={saving.isBusy()} icon={<Check className="size-[18px]" />} className="size-[18px]" />
          <span className="min-w-0 truncate">
            {saveText}
            {value.score != null ? ` ${value.score}` : ''}
          </span>
        </button>
      );
    }
    if (action === 'salir') {
      return (
        <button type="button" onClick={keepAndClose} className={cx(ACTION_BUTTON, 'bg-accent-soft text-accent')}>
          <Check className="size-[18px]" />
          <span className="min-w-0 truncate">Guardar y salir</span>
        </button>
      );
    }
    return (
      <button type="button" disabled className={cx(ACTION_BUTTON, 'bg-accent text-accent-fg')}>
        <Check className="size-[18px]" />
        <span className="min-w-0 truncate">{saveText}</span>
      </button>
    );
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc en una hoja abierta encima (dentro de esta en React) o con el menú «Teclado ▾» abierto: esa se cierra sola.
        if (e.target !== e.currentTarget || ref.current?.querySelector('[data-menu-open]')) {
          if (e.target === e.currentTarget) e.preventDefault();
          return;
        }
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        // Teléfono: toda la pantalla, sube desde abajo (mm-sheet en index.css). Computadora: una hoja alta en el centro.
        'mm-anotar mm-sheet m-0 h-dvh max-h-none w-full max-w-none overflow-hidden overscroll-none border-0 bg-(--an-bg) p-0 text-fg',
        'sm:m-auto sm:h-[min(58rem,calc(100dvh-2rem))] sm:max-w-md sm:rounded-sheet sm:border sm:border-line sm:shadow-2xl',
      )}
    >
      {open && (
        <style href="mm-anotar" precedence="default">
          {SHEET_CSS}
        </style>
      )}
      {open && (
        <FrameEditor
          resetToken={`${resetKey ?? ''}${found ? ':memoria' : ''}`}
          initial={initial}
          resume={found?.work}
          onChange={change}
          startMode={startMode}
          phoneSaved={inPhone}
        >
          {(parts) => (
            <div className="flex h-full flex-col">
              {/* El juego centrado entre la X y «Teclado ▾»; en un teléfono angosto (menos de 380 px) «Teclado ▾» no cabe en
                  104 px: su columna toma lo que mide y el título (con «Práctica de hoy» debajo) se acorta sin taparse. */}
              <header className="grid min-h-[54px] shrink-0 grid-cols-[104px_minmax(0,1fr)_104px] items-center px-4 pt-[env(safe-area-inset-top)] max-[379px]:grid-cols-[48px_minmax(0,1fr)_auto]">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-fg-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <X className="size-[22px]" />
                </button>
                <div className="min-w-0 px-3 text-center leading-[1.2]">
                  <h2 id={titleId} className="line-clamp-2 text-lg font-bold tracking-[-0.02em]">
                    {head}
                  </h2>
                  {sub && <p className="truncate text-[13px] text-muted">{sub}</p>}
                </div>
                <div className="justify-self-end">{parts.modeMenu}</div>
              </header>

              <div className="modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="flex min-h-full flex-col pb-1">
                  <p ref={said} className="sr-only" aria-live="polite" />
                  {notice && (
                    <div
                      className={cx(
                        'mx-4 mt-2 flex min-h-11 items-center gap-2 rounded-[14px] pr-1 pl-3.5 text-sm font-medium min-[380px]:mx-5 min-[380px]:gap-2.5 min-[380px]:pr-1.5 min-[380px]:text-[14.5px]',
                        notice.detail ? 'bg-warn-soft text-warn' : 'bg-surface-2 text-fg-2',
                      )}
                    >
                      {notice.detail ? (
                        <AlertTriangle className="size-[18px] shrink-0" aria-hidden="true" />
                      ) : (
                        <History className="size-[18px] shrink-0 text-accent" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 py-2">
                        {notice.title}
                        <span className="sr-only"> (sin guardar)</span>
                        {notice.detail && <span className="block text-xs font-medium">{notice.detail}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => void discard()}
                        className="inline-flex h-11 shrink-0 items-center rounded-lg px-2 text-sm font-[650] min-[380px]:px-2.5 transition hover:bg-fg/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        Descartar
                      </button>
                    </div>
                  )}
                  {top != null && top !== false && <div className="mt-2.5 flex flex-col gap-2 px-5">{top}</div>}
                  {parts.body}
                  {note != null && note !== false && <div className="mx-5 mt-4">{note}</div>}
                </div>
              </div>

              <footer
                className={cx(
                  'grid shrink-0 gap-2.5 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] min-[380px]:px-5',
                  parts.undo ? 'grid-cols-[1fr_1.3fr] min-[380px]:grid-cols-[1fr_1.45fr]' : 'grid-cols-1',
                )}
              >
                {parts.undo}
                {saveButton(parts)}
              </footer>
            </div>
          )}
        </FrameEditor>
      )}
    </dialog>
  );
}
