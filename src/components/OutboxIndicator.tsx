import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudUpload, Copy, LogIn, RotateCcw, Trash2 } from 'lucide-react';
import { useCurrentOutbox, useOutboxSnapshot } from '../lib/data';
import type { OutboxItem } from '../lib/db/outbox';
import { useFeedback } from './feedback';
import { Button, Modal } from './ui';

/** Por qué el servidor no aceptó una operación de la cola, en palabras sencillas. */
function reason(item: OutboxItem): string {
  switch (item.errorKind) {
    case 'permission':
      return 'Ya no tienes permiso (¿te sacaron de la liga o te cambiaron el rol?).';
    case 'not_found':
      return 'Ya no existe: alguien lo borró.';
    case 'rate_limited':
      return 'Se mandó muy seguido. Intenta de nuevo en un momento.';
    case 'conflict':
      return 'Choca con otro cambio que ya estaba guardado.';
    case 'validation':
      return 'El servidor no lo aceptó (dato no válido o ya está cerrado).';
    default:
      return item.lastError || 'No se pudo enviar.';
  }
}

/** Texto para copiar (y no perder los juegos si hay que descartarlo). */
function copyText(item: OutboxItem): string {
  const scores = (item.args.p_scores ?? item.args.p_score) as unknown;
  const shown = Array.isArray(scores) ? scores.map((s) => s ?? '–').join(' · ') : scores != null ? String(scores) : '';
  return [item.label ?? item.fn, shown, new Date(item.createdAt).toLocaleString('es-DO')].filter(Boolean).join(' — ');
}

/**
 * Lo que está en la cola sin conexión: «N por enviar» mientras hay pendientes, «Enviado» cuando termina,
 * «No se pudo enviar» (para copiar, reintentar o descartar) y «Entra de nuevo» si venció la sesión.
 */
export function OutboxIndicator() {
  const snap = useOutboxSnapshot();
  const outbox = useCurrentOutbox();
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const before = useRef(0);

  useEffect(() => {
    const had = before.current;
    before.current = snap.pendingCount;
    if (had > 0 && snap.pendingCount === 0 && !snap.failed.length) {
      setJustSent(true);
      const t = setTimeout(() => setJustSent(false), 2500);
      return () => clearTimeout(t);
    }
  }, [snap.pendingCount, snap.failed.length]);

  const failed = snap.failed.length;
  if (!snap.pendingCount && !failed && !justSent) return null;

  async function copy(item: OutboxItem) {
    try {
      await navigator.clipboard.writeText(copyText(item));
      toast('Copiado');
    } catch {
      toast('No se pudo copiar', 'error');
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-surface-2 px-4 py-1.5 text-sm">
        {snap.needsAuth ? (
          // La sesión venció sin señal: se renueva sola al volver; si no, al entrar de nuevo salen solos.
          <span className="flex items-center gap-1.5 font-medium text-warn">
            <LogIn className="size-4" /> Sesión vencida: {snap.pendingCount} {snap.pendingCount === 1 ? 'pendiente espera' : 'pendientes esperan'} a que entres de nuevo
          </span>
        ) : snap.pendingCount > 0 ? (
          <span className="flex items-center gap-1.5 text-muted">
            <CloudUpload className="size-4" /> {snap.pendingCount} por enviar
          </span>
        ) : justSent && !failed ? (
          <span className="flex items-center gap-1.5 text-ok">
            <CheckCircle2 className="size-4" /> Enviado
          </span>
        ) : null}
        {failed > 0 && (
          <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 font-medium text-danger">
            <AlertTriangle className="size-4" /> {failed === 1 ? '1 no se pudo enviar' : `${failed} no se pudieron enviar`}
          </button>
        )}
      </div>
      <Modal open={open && failed > 0} onClose={() => setOpen(false)} title="No se pudo enviar">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            El servidor no aceptó estos cambios hechos en este teléfono. Cópialos si los necesitas, vuelve a intentar o descártalos.
          </p>
          {snap.failed.map((item) => (
            <div key={item.opId} className="flex flex-col gap-2 rounded-xl border border-line p-3">
              <div className="text-sm font-medium">{copyText(item)}</div>
              <div className="text-xs text-danger">{reason(item)}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon={<Copy className="size-4" />} onClick={() => copy(item)}>
                  Copiar
                </Button>
                <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={() => void outbox?.retry(item.opId)}>
                  Reintentar
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => void outbox?.discard(item.opId)}>
                  Descartar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
