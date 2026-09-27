import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button, Modal } from '../ui';
import { FrameEditor, type ScoreValue } from './FrameEditor';

/** Hoja para anotar un juego (pines, teclado o total). `resetKey` reinicia el editor al cambiar de juego. */
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
        {top}
        {open && <FrameEditor key={resetKey} initial={initial} onChange={setValue} />}
        {note}
      </div>
    </Modal>
  );
}
