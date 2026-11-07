import { useState } from 'react';
import { View } from 'react-native';
import { CheckCheck, EyeOff, Lightbulb, Mail, MailOpen, Trash2 } from 'lucide-react-native';
import { deleteSuggestion, markSuggestions, useSuggestions } from '@mm/lib/data';
import { useLeagueCtx } from '@mm/lib/league';
import type { Suggestion } from '@mm/lib/types';
import { useNow } from '@mm/lib/useNow';
import { SUGGESTION_DELETED_TEXT, deleteSuggestionConfirm, markLabel, noteDay, unreadIds } from '@mm/components/suggestions';
import { confirmAsync } from '@/components/feedback';
import { LogoSpinner } from '@/components/Logo';
import { runAction } from '@/components/swimming/parts';
import { Badge, Button, Card, Empty, LoadError, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * Organizadores: las notas del buzón de sugerencias (SuggestionsPanel de la web), anónimas, para leerlas, marcarlas
 * (una o todas) y borrarlas. Las nuevas llevan «Nueva» y el borde amarillo.
 */
export function SuggestionsPanel() {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const suggestions = useSuggestions(lid);
  const now = useNow();
  // La nota que se está borrando (su ruedita; las demás esperan).
  const [deleting, setDeleting] = useState<string | null>(null);
  const unread = unreadIds(suggestions.data);

  async function remove(s: Suggestion) {
    if (!(await confirmAsync(deleteSuggestionConfirm(s.text)))) return;
    setDeleting(s.id);
    await runAction(() => deleteSuggestion(lid, s.id), SUGGESTION_DELETED_TEXT);
    setDeleting(null);
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 12, alignItems: 'flex-start' }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Lightbulb size={20} color={c.warn} />
            <Txt variant="section" accessibilityRole="header">
              Buzón de sugerencias
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <EyeOff size={16} color={c.muted} style={{ marginTop: 2 }} />
            <Txt variant="meta" tone="muted" style={{ flex: 1 }}>
              Son anónimas: la app no muestra quién las escribió, solo el mensaje.
            </Txt>
          </View>
        </View>
        {unread.length > 0 && (
          <Button icon={<CheckCheck size={18} color={c.fg} />} onPress={() => runAction(() => markSuggestions(lid, unread, true))}>
            Marcar todas como leídas
          </Button>
        )}
      </View>

      {suggestions.error ? (
        <LoadError error={suggestions.error} />
      ) : suggestions.loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <LogoSpinner size={36} label="Cargando" />
        </View>
      ) : suggestions.data.length === 0 ? (
        <Empty
          icon={<Lightbulb size={28} color={c.accent} />}
          title="El buzón está vacío"
          text="Cuando alguien de la liga deje una sugerencia, aparece aquí (sin su nombre)."
        />
      ) : (
        <View style={{ gap: 8 }}>
          {suggestions.data.map((s) => (
            <Card key={s.id} style={{ gap: 8, padding: 16, borderWidth: 1.5, borderColor: s.read ? 'transparent' : `${c.warn}66` }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {!s.read && <Badge tone="warn">Nueva</Badge>}
                <Txt variant="small" tone="muted" style={{ flex: 1 }}>
                  {noteDay(s.createdAt?.toMillis(), now)}
                </Txt>
                <Button
                  variant="ghost"
                  accessibilityLabel={markLabel(s.read)}
                  icon={s.read ? <Mail size={18} color={c.fg} /> : <MailOpen size={18} color={c.fg} />}
                  onPress={() => runAction(() => markSuggestions(lid, [s.id], !s.read))}
                />
                <Button
                  variant="ghost"
                  accessibilityLabel="Borrar"
                  icon={<Trash2 size={18} color={c.danger} />}
                  loading={deleting === s.id}
                  disabled={!!deleting}
                  onPress={() => void remove(s)}
                />
              </View>
              <Txt tone={s.read ? 'muted' : 'fg'} selectable>
                {s.text}
              </Txt>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}
