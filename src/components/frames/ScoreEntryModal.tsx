import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, History } from 'lucide-react';
import { useFeedback } from '../feedback';
import { Button, Modal, cx } from '../ui';
import { clearGameDraft, forgetAfterSave, pendingDraft, rememberGame, type PendingDraft } from './draftMemory';
import { FrameEditor, type EditorWork, type ScoreMode, type ScoreValue } from './FrameEditor';

/** El aviso de lo que quedó sin guardar (y, si lo guardado cambió mientras tanto, qué quedó guardado). */
function memoryNotice({ newer }: PendingDraft): { title: string; detail: string | null } {
  return {
    title: 'Seguimos donde lo dejaste (sin guardar)',
    detail: !newer
      ? null
      : newer.score != null
        ? `Ojo: mientras tanto se guardó ${newer.score} en este juego.`
        : 'Ojo: lo guardado de este juego cambió mientras tanto.',
  };
}

/**
 * Hoja para anotar un juego (pines, teclado o total). `resetKey` reinicia el editor al cambiar de juego; `startMode`
 * elige con qué forma se abre un juego sin cuadros.
 *
 * Con `memoryKey` (única por cuenta, lugar y juego) cada cambio queda en el teléfono hasta «Guardar»: si se cierra sin
 * guardar (Cancelar, Esc, el fondo, atrás o la app cerrada), al volver a abrir ese juego sigue donde lo dejó, con
 * «Descartar» para volver a lo guardado. Si `onSave` devuelve `false` no se guardó: la memoria se queda.
 */
export function ScoreEntryModal({
  open,
  onClose,
  title,
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
  /** Arriba del editor (p. ej. elegir el juego). */
  top?: ReactNode;
  note?: ReactNode;
  saveText?: string;
  startMode?: ScoreMode;
}) {
  const { confirm, toast } = useFeedback();
  const [value, setValue] = useState<ScoreValue & { ready: boolean }>({ ...initial, ready: false });
  const [busy, setBusy] = useState(false);
  const saved = stored ?? initial;
  // Lo que quedó sin guardar de este juego se lee al abrirlo (y al cambiar de juego): el editor se monta con eso.
  const opened = open && memoryKey ? `${memoryKey}\n${resetKey ?? ''}` : null;
  const [memory, setMemory] = useState(() => ({ opened, found: opened ? pendingDraft(memoryKey!, initial, saved) : null }));
  if (memory.opened !== opened) setMemory({ opened, found: opened ? pendingDraft(memoryKey!, initial, saved) : null });
  const found = memory.opened === opened ? memory.found : null;
  const notice = found ? memoryNotice(found) : null;

  // El aviso también para el lector de pantalla: se escribe después de abrir en una región que ya está (si llega
  // escrito junto con la hoja, no se anuncia).
  const box = useRef<HTMLDivElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  const spoken = notice ? [notice.title, notice.detail].filter(Boolean).join('. ') : '';
  useEffect(() => {
    const t = setTimeout(() => {
      if (said.current) said.current.textContent = spoken;
    }, 150);
    return () => clearTimeout(t);
  }, [spoken, opened]);
  // Después de «Descartar» ese botón ya no está: el foco vuelve a la forma de anotar elegida (cuando ya se cerró la
  // pregunta, que al cerrarse lo devuelve al botón).
  const [refocus, setRefocus] = useState(0);
  useEffect(() => {
    if (!refocus) return;
    const t = setTimeout(() => box.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus(), 60);
    return () => clearTimeout(t);
  }, [refocus]);

  function change(v: ScoreValue & { ready: boolean }, work: EditorWork) {
    setValue(v);
    if (open && memoryKey) rememberGame(memoryKey, work, saved);
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
    setMemory((m) => (m.opened === opened ? { opened, found: null } : m));
    setRefocus((n) => n + 1);
    toast('Se descartó lo anotado');
  }

  async function save() {
    // La de este juego: al guardar se puede pasar al siguiente.
    const key = memoryKey;
    setBusy(true);
    try {
      const result = await onSave({ score: value.score, frames: value.frames });
      if (key) forgetAfterSave(key, result, stored !== undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={<Check className="size-4" />} disabled={!value.ready} loading={busy} onClick={save}>
            {saveText}
            {value.ready && value.score != null ? ` ${value.score}` : ''}
          </Button>
        </>
      }
    >
      <div ref={box} className="flex flex-col gap-4">
        <p ref={said} className="sr-only" aria-live="polite" />
        {/* `top` y `note` van en su propio Fragment: su `key` (p. ej. la bola del juego) no choca con la del editor. */}
        <Fragment key="top">{top}</Fragment>
        {open && notice && (
          <div
            key="aviso-memoria"
            className={cx(
              '-my-1 flex items-center gap-2 rounded-xl py-0.5 pr-1 pl-3 text-sm',
              notice.detail ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent',
            )}
          >
            {notice.detail ? <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> : <History className="size-4 shrink-0" aria-hidden="true" />}
            <span className="min-w-0 flex-1 py-1.5">
              {notice.title}
              {notice.detail && <span className="block text-xs font-medium">{notice.detail}</span>}
            </span>
            <button
              type="button"
              onClick={() => void discard()}
              className="inline-flex h-11 shrink-0 items-center rounded-lg px-3 font-semibold text-danger transition hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Descartar
            </button>
          </div>
        )}
        {open && (
          <FrameEditor
            key={`${resetKey ?? ''}${found ? ':memoria' : ''}`}
            initial={initial}
            resume={found?.work}
            onChange={change}
            startMode={startMode}
          />
        )}
        <Fragment key="note">{note}</Fragment>
      </div>
    </Modal>
  );
}
