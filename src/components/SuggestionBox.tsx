import { useState } from 'react';
import { EyeOff, Lightbulb, Send } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { MAX_SUGGESTION, SUGGESTION_PACE_S, sendSuggestion } from '../lib/data';
import { useLeagueCtx } from '../lib/league';
import { paceCheck, paceStart } from '../lib/pace';
import { useFeedback } from './feedback';
import { Button, Card, Modal, cx } from './ui';

/** Sin señal la nota queda en cola y sale sola; no se espera al servidor. */
const QUEUED_MS = 1500;
/** Nota a medio escribir por liga (la misma en el Calendario y en "Mis juegos"). */
const drafts = new Map<string, string>();

/**
 * Buzón de sugerencias de la liga: cualquier jugador deja una nota para los organizadores.
 * Es anónima: la nota solo lleva el mensaje y la fecha; nadie en la app ve quién la escribió.
 * A los organizadores no se les muestra (las notas son para ellos).
 */
export function SuggestionBox() {
  const { lid, member, league, isAdmin } = useLeagueCtx();
  const { user } = useAuth();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [text, setTextState] = useState(() => drafts.get(lid) ?? '');
  const [sending, setSending] = useState(false);
  if (!user || !member || isAdmin) return null;
  const organizers = league.kind === 'torneo' ? 'los organizadores del torneo' : 'los organizadores de la liga';
  const paceKey = `${lid}:sugerencia`;
  const full = text.length >= MAX_SUGGESTION;

  function setText(v: string) {
    setTextState(v);
    if (v) drafts.set(lid, v);
    else drafts.delete(lid);
  }

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    const check = paceCheck(paceKey, SUGGESTION_PACE_S);
    if (!check.ok) {
      toast(
        check.reason === 'pendiente'
          ? 'Tu sugerencia anterior todavía se está enviando. Espera a tener señal.'
          : `Ya enviaste una hace poco. Podrás mandar otra en ${check.wait} s.`,
        'error',
      );
      return;
    }
    setSending(true);
    const sent = sendSuggestion(lid, user!.uid, body);
    paceStart(paceKey, sent);
    const result = await Promise.race([
      sent.then(() => 'ok' as const),
      new Promise<'en-cola'>((r) => setTimeout(() => r('en-cola'), QUEUED_MS)),
    ]).catch((e: unknown) => e);
    setSending(false);
    if (result === 'ok' || result === 'en-cola') {
      setText('');
      setOpen(false);
      if (result === 'ok') {
        toast('¡Gracias! Tu sugerencia llegó al buzón, sin tu nombre.');
      } else {
        toast('Sin señal: tu sugerencia se envía sola cuando vuelva la conexión.');
        // Si al final no se pudo, el texto vuelve a la caja para reintentar.
        sent.catch((e) => {
          console.error(e);
          if (!drafts.get(lid)) {
            drafts.set(lid, body);
            setTextState(body);
          }
          toast('No se pudo enviar tu sugerencia. Sigue en el buzón para que la reintentes.', 'error');
        });
      }
    } else {
      console.error(result);
      toast(
        /permission/i.test(String((result as Error)?.message ?? ''))
          ? 'Ya enviaste una hace poco. Espera un minuto para mandar otra.'
          : 'No se pudo enviar tu sugerencia. Inténtalo de nuevo.',
        'error',
      );
    }
  }

  return (
    <>
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
            onChange={(e) => setText(e.target.value.slice(0, MAX_SUGGESTION))}
            rows={5}
            placeholder="Escribe tu sugerencia…"
            aria-label="Sugerencia"
            className="w-full resize-none rounded-2xl border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-accent sm:text-sm"
          />
          <p className={cx('text-right text-xs tabular-nums', full ? 'font-medium text-danger' : 'text-muted')}>
            {full ? `Llegaste al máximo (${MAX_SUGGESTION} letras): lo que sigue no entra.` : `${text.length}/${MAX_SUGGESTION}`}
          </p>
        </div>
      </Modal>
    </>
  );
}
