import type { CSSProperties } from 'react';
import { CheckCheck, EyeOff, Lightbulb, Mail, MailOpen, Trash2 } from 'lucide-react';
import { deleteSuggestion, markSuggestions, useSuggestions } from '../lib/data';
import { useLeagueCtx } from '../lib/league';
import type { Suggestion } from '../lib/types';
import { useBusy } from './busy';
import { useAction, useFeedback } from './feedback';
import { SUGGESTION_DELETED_TEXT, deleteSuggestionConfirm, markLabel, noteDay, unreadIds } from './suggestions';
import { Badge, Button, Card, Empty, ListSkeleton, LoadError, cx } from './ui';

/** Organizadores: las notas del buzón de sugerencias (anónimas), para leerlas, marcarlas y borrarlas. */
export function SuggestionsPanel() {
  const { lid } = useLeagueCtx();
  const suggestions = useSuggestions(lid);
  const run = useAction();
  const { confirm } = useFeedback();
  // La nota que se está borrando (su ruedita; las demás esperan).
  const deleting = useBusy<string>();
  const unread = suggestions.data.filter((s) => !s.read);

  async function remove(s: Suggestion) {
    const ok = await confirm(deleteSuggestionConfirm(s.text));
    if (ok) await deleting.run(s.id, () => run(() => deleteSuggestion(lid, s.id), SUGGESTION_DELETED_TEXT));
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
          <Button size="sm" icon={<CheckCheck className="size-4" />} onClick={() => run(() => markSuggestions(lid, unreadIds(unread), true))}>
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
                    aria-label={markLabel(s.read)}
                    title={markLabel(s.read)}
                    icon={s.read ? <Mail className="size-4" /> : <MailOpen className="size-4" />}
                    onClick={() => run(() => markSuggestions(lid, [s.id], !s.read))}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Borrar"
                    title="Borrar"
                    icon={<Trash2 className="size-4 text-danger" />}
                    loading={deleting.isBusy(s.id)}
                    disabled={deleting.isBusy()}
                    onClick={() => remove(s)}
                  />
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
