import { useState } from 'react';
import { EyeOff, Lightbulb, Send } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useLeagueCtx } from '../lib/league';
import { useFeedback } from './feedback';
import {
  SUGGESTION_LATE_FAIL_TEXT,
  SUGGESTION_QUEUED_TEXT,
  SUGGESTION_SENT_TEXT,
  clampSuggestion,
  deliverSuggestion,
  setSuggestionDraft,
  showSuggestionBox,
  suggestionCounter,
  suggestionDraft,
  suggestionErrorText,
  suggestionOrganizers,
  suggestionPaceProblem,
} from './suggestions';
import { Button, Card, ListRow, Modal, RowIcon, cx } from './ui';

/**
 * Buzón de sugerencias de la liga: cualquier jugador deja una nota para los organizadores.
 * Es anónima: la nota solo lleva el mensaje y la fecha; nadie en la app ve quién la escribió.
 * A los organizadores no se les muestra (las notas son para ellos).
 * `row`: como una fila más de la lista de la liga (ListRow, va dentro de la tarjeta de filas); si no, su tarjeta.
 */
export function SuggestionBox({ row }: { row?: boolean } = {}) {
  const { lid, member, league, isAdmin } = useLeagueCtx();
  const { user } = useAuth();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [text, setTextState] = useState(() => suggestionDraft(lid));
  const [sending, setSending] = useState(false);
  if (!showSuggestionBox({ signedIn: !!user, member: !!member, isAdmin })) return null;
  const organizers = suggestionOrganizers(league.kind);
  const counter = suggestionCounter(text.length);
  const full = counter.full;

  function setText(v: string) {
    setTextState(v);
    setSuggestionDraft(lid, v);
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    const problem = suggestionPaceProblem(lid);
    if (problem) {
      toast(problem, 'error');
      return;
    }
    setSending(true);
    const result = await deliverSuggestion(lid, user!.uid, body);
    setSending(false);
    if (result.kind === 'error') {
      console.error(result.error);
      toast(suggestionErrorText(result.error), 'error');
      return;
    }
    setText('');
    setOpen(false);
    if (result.kind === 'ok') {
      toast(SUGGESTION_SENT_TEXT);
      return;
    }
    toast(SUGGESTION_QUEUED_TEXT);
    // Si al final no se pudo, el texto vuelve a la caja para reintentar.
    result.sent.catch((e) => {
      console.error(e);
      if (!suggestionDraft(lid)) {
        setSuggestionDraft(lid, body);
        setTextState(body);
      }
      toast(SUGGESTION_LATE_FAIL_TEXT, 'error');
    });
  }

  return (
    <>
      {row ? (
        <ListRow
          leading={
            <RowIcon>
              <Lightbulb className="size-5" />
            </RowIcon>
          }
          title="Buzón de sugerencias"
          subtitle="Una idea o una queja, sin tu nombre"
          onClick={() => setOpen(true)}
          chevron
        />
      ) : (
        <Card className="flex items-center gap-3 p-4" tour="buzon">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warn-soft text-warn">
            <Lightbulb className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Buzón de sugerencias</p>
            <p className="text-sm text-muted">Una idea, una queja, algo que mejorar. Es anónimo.</p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            Escribir
          </Button>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <Lightbulb className="size-5 text-warn" /> Buzón de sugerencias
          </span>
        }
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" icon={<Send className="size-4" />} disabled={!text.trim()} loading={sending} onClick={send}>
              Enviar anónimo
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm text-muted">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>
              Le llega a {organizers} <b className="text-fg">sin tu nombre</b>: solo ven el mensaje y el día, nunca quién lo escribió.
            </span>
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(clampSuggestion(e.target.value))}
            rows={5}
            placeholder="Escribe tu sugerencia…"
            aria-label="Sugerencia"
            className="w-full resize-none rounded-2xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-accent sm:text-sm"
          />
          <p className={cx('text-right text-xs tabular-nums', full ? 'font-medium text-danger' : 'text-muted')}>
            {counter.text}
          </p>
        </div>
      </Modal>
    </>
  );
}
