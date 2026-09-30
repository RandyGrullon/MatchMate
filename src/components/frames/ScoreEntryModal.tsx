import { Fragment, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button, Modal } from '../ui';
import { FrameEditor, type ScoreMode, type ScoreValue } from './FrameEditor';

/**
 * Hoja para anotar un juego (pines, teclado o total). `resetKey` reinicia el editor al cambiar de juego; `startMode`
 * elige con qué forma se abre un juego sin cuadros.
 */
export function ScoreEntryModal({
  open,
  onClose,
  title,
  initial,
  onSave,
  resetKey,
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
  /** Arriba del editor (p. ej. elegir el juego). */
  top?: ReactNode;
  note?: ReactNode;
  saveText?: string;
  startMode?: ScoreMode;
}) {
  const [value, setValue] = useState<ScoreValue & { ready: boolean }>({ ...initial, ready: false });
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await onSave({ score: value.score, frames: value.frames });
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
      <div className="flex flex-col gap-4">
        {/* `top` y `note` van en su propio Fragment: su `key` (p. ej. la bola del juego) no choca con la del editor. */}
        <Fragment key="top">{top}</Fragment>
        {open && <FrameEditor key={resetKey} initial={initial} onChange={setValue} startMode={startMode} />}
        <Fragment key="note">{note}</Fragment>
      </div>
    </Modal>
  );
}
