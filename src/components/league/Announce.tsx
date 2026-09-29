import { useMemo, useRef, useState } from 'react';
import { BellOff, Megaphone, Send, X } from 'lucide-react';
import { asBackendError } from '../../lib/db/errors';
import {
  ANNOUNCE_DAILY_LIMIT,
  ANNOUNCE_MAX,
  announceToLeague,
  useAnnounceReach,
  useLeagueAnnouncements,
  type LeagueAnnouncement,
} from '../../lib/data/leagues';
import { useLeagueCtx } from '../../lib/league';
import { relativeTime } from '../../lib/notifications';
import { useNow } from '../../lib/useNow';
import { saveErrorMessage, useFeedback } from '../feedback';
import { ReportButton } from '../report/ReportButton';
import { Button, Card, Textarea, cx } from '../ui';
import { announceTemplates, noticesLeft, reachLine, recentNotices } from './logic';

// ---------- Avisos cerrados (en este teléfono) ----------

const closedKey = (lid: string) => `mm:avisos-cerrados:${lid}`;

function readClosed(lid: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(closedKey(lid)) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveClosed(lid: string, ids: Set<string>) {
  try {
    // Los últimos 20 bastan: los avisos salen solo 2 días.
    localStorage.setItem(closedKey(lid), JSON.stringify([...ids].slice(-20)));
  } catch {
    // sin almacenamiento: se cierra solo mientras la pantalla está abierta
  }
}

/**
 * Arriba en el inicio de la liga: el aviso del admin de los últimos 2 días («Se suspende por lluvia»), para quien no
 * tiene las notificaciones activadas. Cada quien lo puede cerrar; quien no es admin lo puede reportar.
 */
export function LeagueNotices() {
  const { lid, isAdmin } = useLeagueCtx();
  const list = useLeagueAnnouncements(lid, 5);
  const now = useNow();
  const [closed, setClosed] = useState(() => readClosed(lid));
  const shown = useMemo(() => recentNotices(list.data, now.getTime(), closed), [list.data, now, closed]);
  if (!shown.length) return null;

  const close = (id: string) => {
    const next = new Set(closed).add(id);
    setClosed(next);
    saveClosed(lid, next);
  };

  return (
    <div className="flex flex-col gap-2" role="region" aria-label="Avisos de la liga">
      {shown.map((a) => (
        <div key={a.id} className="animate-fade-up flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3">
          <Megaphone className="mt-0.5 size-5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-warn">
              Aviso{a.authorName ? ` de ${a.authorName}` : ''} · {relativeTime(Date.parse(a.sentAt), now.getTime())}
            </p>
            <p className="text-sm break-words whitespace-pre-line text-fg">{a.body}</p>
          </div>
          {!isAdmin && <ReportButton kind="announcement" targetId={a.id} className="-my-2" />}
          <button
            type="button"
            onClick={() => close(a.id)}
            aria-label="Cerrar el aviso"
            className="-m-1 rounded-lg p-1 text-muted transition hover:bg-surface/60 hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Admin › Liga: avisar a toda la liga («Se suspende por lluvia»). Llega como notificación a los miembros que las
 * activaron y sale 2 días arriba en el inicio de la liga. Hasta 3 por día (la base lo cuida).
 */
export function AnnouncePanel() {
  const { lid, league, member } = useLeagueCtx();
  const { confirm, toast } = useFeedback();
  const reach = useAnnounceReach(lid);
  const history = useLeagueAnnouncements(lid, 10);
  const now = useNow();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const r = reach.data;
  const left = noticesLeft(r);
  const out = left === 0;
  const body = text.trim();
  const all = league.kind === 'torneo' ? 'todo el torneo' : 'toda la liga';
  const home = league.kind === 'torneo' ? 'el inicio del torneo' : 'el inicio de la liga';

  function applyTemplate(t: string) {
    setText(t);
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(t.length, t.length);
    });
  }

  async function send() {
    if (!body || sending || out) return;
    const reachText = r ? reachLine(r.reach, member ? r.members - 1 : r.members) : '';
    const ok = await confirm({
      title: `¿Avisar a ${all}?`,
      message: (
        <>
          <span className="mb-2 block rounded-xl bg-surface-2 px-3 py-2 break-words whitespace-pre-line text-fg">{body}</span>
          {reachText} No se puede borrar después.
        </>
      ),
      confirmText: 'Enviar aviso',
    });
    if (!ok) return;
    setSending(true);
    try {
      const n = await announceToLeague(lid, body);
      setText('');
      toast(n ? `Aviso enviado a ${n} ${n === 1 ? 'miembro' : 'miembros'}` : `Aviso publicado en ${home}`);
    } catch (e) {
      console.error(e);
      toast(
        asBackendError(e)?.kind === 'rate_limited'
          ? `Ya se mandaron los ${r?.dailyLimit ?? ANNOUNCE_DAILY_LIMIT} avisos de hoy. Mañana puedes mandar más.`
          : saveErrorMessage(e),
        'error',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4" tour="avisar">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Megaphone className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">Avisar a {all}</h3>
          <p className="text-sm text-muted">
            Llega como notificación al teléfono y sale 2 días arriba en el inicio. Para lo urgente: lluvia, apagón, cambio de lugar u hora.
          </p>
        </div>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="Avisos listos">
        {announceTemplates(league.sport).map((t) => (
          <button
            key={t}
            type="button"
            disabled={out}
            onClick={() => applyTemplate(t)}
            className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium text-muted transition hover:text-fg active:scale-95 disabled:opacity-50"
          >
            {t.replace(/[:.]\s*$/, '')}
          </button>
        ))}
        <span aria-hidden="true" className="w-3 shrink-0" />
      </div>

      <div className="flex flex-col gap-1">
        <Textarea
          ref={box}
          rows={3}
          maxLength={ANNOUNCE_MAX}
          value={text}
          disabled={out}
          onChange={(e) => setText(e.target.value.slice(0, ANNOUNCE_MAX))}
          placeholder="Hoy se suspende por lluvia. Nos vemos el martes."
          aria-label="Texto del aviso"
        />
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>{r ? reachLine(r.reach, member ? r.members - 1 : r.members) : ' '}</span>
          <span className={cx('shrink-0 tabular-nums', text.length >= ANNOUNCE_MAX && 'text-warn')}>
            {text.length}/{ANNOUNCE_MAX}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cx('text-xs', out ? 'text-warn' : 'text-muted')}>
          {left == null
            ? ''
            : out
              ? 'Ya se mandaron los avisos de hoy. Mañana puedes mandar más.'
              : `Te ${left === 1 ? 'queda' : 'quedan'} ${left} de ${r!.dailyLimit} avisos hoy.`}
        </span>
        <Button variant="primary" icon={<Send className="size-4" />} loading={sending} disabled={!body || out} onClick={send}>
          Enviar aviso
        </Button>
      </div>

      {history.data.length > 0 && <AnnounceHistory list={history.data} now={now.getTime()} />}
    </Card>
  );
}

/** Los avisos que se mandaron: qué, quién, cuándo y a cuántos les llegó. */
function AnnounceHistory({ list, now }: { list: LeagueAnnouncement[]; now: number }) {
  return (
    <details className="group border-t border-line pt-3">
      <summary className="cursor-pointer list-none text-sm font-medium text-accent select-none">
        {`Últimos avisos enviados (${list.length})`}
      </summary>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {list.map((a) => (
          <li key={a.id} className="flex flex-col gap-0.5 py-2 text-sm">
            <span className="break-words whitespace-pre-line">{a.body}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              {a.authorName || 'Admin'} · {relativeTime(Date.parse(a.sentAt), now)} ·
              {a.recipients ? (
                ` llegó a ${a.recipients} ${a.recipients === 1 ? 'miembro' : 'miembros'}`
              ) : (
                <span className="inline-flex items-center gap-1">
                  <BellOff className="size-3" /> solo en el inicio
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
