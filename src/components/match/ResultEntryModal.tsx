import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { adminCorrectResult, finishMatch, resolveDispute, type Match } from '../../lib/data/matches';
import { useFeedback, saveErrorMessage } from '../feedback';
import { Button, Field, Input, Modal } from '../ui';
import { flipScoreText, sideName } from './format';
import { tryParse, type ParsedResult, type ResultParser } from './parsers';

/**
 * Modo «solo resultado»: escribir el marcador en 10 segundos («6-4 3-6 10-7», «78-72», «2-1») con el lector
 * del deporte (parsers.ts). Muestra enseguida quién gana, o el error en palabras sencillas.
 *
 * `mode`:
 * - 'finish' (por defecto): termina el partido (admin o anotador: final; jugador: el rival confirma). Va por la
 *   cola: sin señal se guarda y sale solo.
 * - 'correct': el admin corrige un resultado (queda confirmado).
 * - 'resolve': el admin decide una disputa con este marcador.
 * `onSubmit` reemplaza lo anterior (p. ej. el americano guarda otra cosa).
 */
export function ResultEntryModal({
  open,
  onClose,
  lid,
  match: m,
  parser,
  mode = 'finish',
  placeholder = '6-4 3-6 10-7',
  hint,
  examples = [],
  title,
  onSubmit,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  lid: string;
  match: Match;
  parser: ResultParser;
  mode?: 'finish' | 'correct' | 'resolve';
  placeholder?: string;
  hint?: ReactNode;
  /** Botones con marcadores comunes («6-0 6-0», «2-0»…). */
  examples?: string[];
  title?: ReactNode;
  onSubmit?: (r: ParsedResult) => Promise<void>;
  onDone?: (r: ParsedResult, sent: boolean) => void;
}) {
  const { toast } = useFeedback();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setText(typeof m.score?.text === 'string' && mode !== 'finish' ? m.score.text : '');
    setNote('');
  }, [open, m.score, mode]);

  const parsed = useMemo(() => (text.trim() ? tryParse(parser, text) : null), [parser, text]);
  const winnerName = parsed?.ok && parsed.value.winner ? sideName(m.sides[parsed.value.winner - 1]) : null;

  const submit = async () => {
    if (!parsed?.ok || busy) return;
    const r = parsed.value;
    setBusy(true);
    try {
      let sent = true;
      if (onSubmit) await onSubmit(r);
      else if (mode === 'correct') await adminCorrectResult(lid, m.id, { score: r.score, winner: r.winner, state: r.state, note });
      else if (mode === 'resolve') await resolveDispute(lid, m.id, { score: r.score, winner: r.winner, state: r.state, note });
      else {
        const out = await finishMatch(lid, m.id, { score: r.score, winner: r.winner, state: r.state ?? null });
        sent = out !== undefined;
        if (out && !out.ok) throw new Error('Otro teléfono va más adelante con este partido.');
      }
      toast(sent ? 'Resultado guardado' : 'Sin señal: el resultado se envía solo al volver');
      onDone?.(r, sent);
      onClose();
    } catch (e) {
      toast(e instanceof Error && !('kind' in e) ? e.message : saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? (mode === 'finish' ? 'Anotar resultado' : mode === 'correct' ? 'Corregir resultado' : 'Decidir el reclamo')}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={!parsed?.ok} onClick={() => void submit()} icon={<CheckCircle2 className="size-5" />}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-sm font-medium">
          <span className="truncate">{sideName(m.sides[0])}</span>
          <span className="text-muted">vs.</span>
          <span className="truncate">{sideName(m.sides[1])}</span>
        </div>
        <Field label="Marcador (el de la izquierda primero)" hint={hint}>
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            inputMode="text"
            autoComplete="off"
            enterKeyHint="done"
            className="h-12 text-center text-xl font-semibold tabular-nums tracking-wide"
            aria-invalid={parsed?.ok === false}
          />
        </Field>
        {examples.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {examples.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setText(x)}
                className="rounded-full bg-surface-2 px-3 py-1.5 text-sm tabular-nums text-muted hover:text-fg active:scale-95"
              >
                {x}
              </button>
            ))}
          </div>
        )}
        {parsed && !parsed.ok && (
          <p role="alert" className="text-sm text-danger">
            {parsed.error}
          </p>
        )}
        {parsed?.ok && (
          <p role="status" className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">
            {winnerName ? (
              <>
                Gana <b>{winnerName}</b>{' '}
                <span className="tabular-nums">
                  {parsed.value.winner === 2 && typeof parsed.value.score.text === 'string' ? flipScoreText(parsed.value.score.text) : parsed.value.score.text}
                </span>
              </>
            ) : (
              <>Empate {parsed.value.score.text}</>
            )}
          </p>
        )}
        {mode !== 'finish' && (
          <Field label="Nota (opcional)">
            <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Por qué se cambió" />
          </Field>
        )}
      </form>
    </Modal>
  );
}
