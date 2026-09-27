import type { CSSProperties } from 'react';
import { CheckCheck, EyeOff, Lightbulb, Mail, MailOpen, Trash2 } from 'lucide-react';
import { deleteSuggestion, markSuggestions, useSuggestions } from '../lib/data';
import { useLeagueCtx } from '../lib/league';
import { formatDate, toIsoDate } from '../lib/format';
import type { Suggestion } from '../lib/types';
import { useAction, useFeedback } from './feedback';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, cx } from './ui';

/** Día de la nota: "hoy", "ayer" o la fecha (sin la hora: no ayuda a adivinar quién la escribió). */
function noteDay(ms: number | undefined): string {
  if (ms == null) return 'hoy';
  const day = toIsoDate(new Date(ms));
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return day === toIsoDate(today) ? 'hoy' : day === toIsoDate(yesterday) ? 'ayer' : formatDate(day);
}

/** Organizadores: las notas del buzón de sugerencias (anónimas), para leerlas, marcarlas y borrarlas. */
export function SuggestionsPanel() {
  const { lid } = useLeagueCtx();
  const suggestions = useSuggestions(lid);
  const run = useAction();
  const { confirm } = useFeedback();
  const unread = suggestions.data.filter((s) => !s.read);

  async function remove(s: Suggestion) {
    const ok = await confirm({ title: '¿Borrar la sugerencia?', message: `“${s.text.length > 140 ? `${s.text.slice(0, 140)}…` : s.text}”`, confirmText: 'Borrar', danger: true });
    if (ok) await run(() => deleteSuggestion(lid, s.id), 'Sugerencia borrada');
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Lightbulb className="size-5 text-warn" /> Buzón de sugerencias
          </h2>
          <p className="flex items-start gap-1.5 text-sm text-muted">
            <EyeOff className="mt-0.5 size-4 shrink-0" /> Son anónimas: la app no muestra quién las escribió, solo el mensaje.
          </p>
        </div>
        {unread.length > 0 && (
          <Button size="sm" icon={<CheckCheck className="size-4" />} onClick={() => run(() => markSuggestions(lid, unread.map((s) => s.id), true))}>
            Marcar todas como leídas
          </Button>
        )}
      </div>

      {suggestions.error ? (
        <LoadError error={suggestions.error} />
      ) : suggestions.loading ? (
        <ListSkeleton rows={3} />
      ) : suggestions.data.length === 0 ? (
        <Empty icon={<Lightbulb className="size-8" />} title="El buzón está vacío">
          Cuando alguien de la liga deje una sugerencia, aparece aquí (sin su nombre).
        </Empty>
      ) : (
        <div className="stagger flex flex-col gap-2">
          {suggestions.data.map((s, i) => (
            <Card key={s.id} style={{ '--i': i } as CSSProperties} className={cx('flex flex-col gap-2 p-4', !s.read && 'border-warn/40')}>
              <div className="flex items-center gap-2 text-xs text-muted">
                {!s.read && <Badge tone="warn">Nueva</Badge>}
                <span>{noteDay(s.createdAt?.toMillis())}</span>
                <span className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={s.read ? 'Marcar como no leída' : 'Marcar como leída'}
                    title={s.read ? 'Marcar como no leída' : 'Marcar como leída'}
                    icon={s.read ? <Mail className="size-4" /> : <MailOpen className="size-4" />}
                    onClick={() => run(() => markSuggestions(lid, [s.id], !s.read))}
                  />
                  <Button variant="ghost" size="sm" aria-label="Borrar" title="Borrar" icon={<Trash2 className="size-4 text-danger" />} onClick={() => remove(s)} />
                </span>
              </div>
              <p className={cx('text-sm break-words whitespace-pre-line', s.read && 'text-muted')}>{s.text}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
