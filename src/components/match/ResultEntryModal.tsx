import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { adminCorrectResult, finishMatch, resolveDispute, type Match } from '../../lib/data/matches';
import { useFeedback, saveErrorMessage } from '../feedback';
import { Button, Field, Input, Sheet } from '../ui';
import { flipScoreText, sideName } from './format';
import { tryParse, type ParsedResult, type ResultParser } from './parsers';

/**
 * Modo «solo resultado» (una hoja desde abajo): escribir el marcador en 10 segundos («6-4 3-6 10-7», «78-72», «2-1») con el lector
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

  const heading = title ?? (mode === 'finish' ? 'Anotar resultado' : mode === 'correct' ? 'Corregir resultado' : 'Decidir el reclamo');
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={heading}
      footer={
        <Button variant="primary" size="xl" className="w-full" loading={busy} disabled={!parsed?.ok} onClick={() => void submit()} icon={<Check className="size-5" strokeWidth={2.6} />}>
          Guardar
        </Button>
      }
    >
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-[15px] font-semibold">
          <span className="truncate">{sideName(m.sides[0])}</span>
          <span className="text-[13px] font-medium text-muted">vs.</span>
          <span className="truncate">{sideName(m.sides[1])}</span>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Marcador</span>
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            inputMode="text"
            autoComplete="off"
            enterKeyHint="done"
            className="num h-16 w-full rounded-2xl bg-surface-2 px-3 text-center text-[26px] font-[650] tracking-wide text-fg placeholder:text-faint focus:ring-2 focus:ring-accent/40 focus:outline-none"
            aria-invalid={parsed?.ok === false}
            aria-describedby="marcador-ayuda"
          />
          <span id="marcador-ayuda" className="text-center text-[13px] text-muted">
            El de la izquierda primero{hint ? <> · {hint}</> : null}
          </span>
        </label>
        {examples.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {examples.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setText(x)}
                className="num inline-flex h-10 items-center rounded-full bg-surface-2 px-4 text-[15px] font-semibold text-fg-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-accent"
              >
                {x}
              </button>
            ))}
          </div>
        )}
        {parsed && !parsed.ok && (
          <p role="alert" className="text-center text-sm text-danger">
            {parsed.error}
          </p>
        )}
        {parsed?.ok && (
          <p role="status" className="rounded-2xl bg-accent-soft px-4 py-3 text-center text-[15px] text-accent">
            {winnerName ? (
              <>
                Gana <b>{winnerName}</b>{' '}
                <span className="num font-[650]">
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
    </Sheet>
  );
}
