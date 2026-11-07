import { useState } from 'react';
import { View } from 'react-native';
import { EyeOff, Lightbulb, Send } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { MAX_SUGGESTION } from '@mm/lib/data';
import { useLeagueCtx } from '@mm/lib/league';
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
} from '@mm/components/suggestions';
import { toast } from '@/components/feedback';
import { Button, Card, Divider, Input, ListRow, RowIcon, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Buzón de sugerencias de la liga (SuggestionBox de la web, con su misma lógica: src/components/suggestions.ts):
 * cualquier jugador deja una nota para los organizadores. Es anónima: la nota solo lleva el mensaje y la fecha; nadie
 * en la app ve quién la escribió. A quien organiza no le sale (las notas son para ellos). Sin señal la nota queda en
 * cola y sale sola. Va dentro de LeagueScope.
 * `row`: como una fila más de la lista de la liga (va dentro de la tarjeta de filas; `divider` le pone la raya de
 * arriba, para que no quede suelta cuando no sale); si no, su tarjeta con «Escribir».
 */
export function SuggestionBox({ row, divider }: { row?: boolean; divider?: boolean } = {}) {
  const c = useColors();
  const { lid, member, league, isAdmin } = useLeagueCtx();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setTextState] = useState(() => suggestionDraft(lid));
  const [sending, setSending] = useState(false);
  if (!showSuggestionBox({ signedIn: !!user, member: !!member, isAdmin })) return null;
  const counter = suggestionCounter(text.length);

  function setText(v: string) {
    setTextState(v);
    setSuggestionDraft(lid, v);
  }

  async function send() {
    const body = text.trim();
    if (!body || sending || !user) return;
    const problem = suggestionPaceProblem(lid);
    if (problem) {
      toast(problem, 'error');
      return;
    }
    setSending(true);
    const result = await deliverSuggestion(lid, user.uid, body);
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
    result.sent.catch((e: unknown) => {
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
        <>
          {divider && <Divider inset={68} />}
          <ListRow
            icon={
              <RowIcon>
                <Lightbulb size={20} color={c.accent} />
              </RowIcon>
            }
            title="Buzón de sugerencias"
            subtitle="Una idea o una queja, sin tu nombre"
            onPress={() => setOpen(true)}
          />
        </>
      ) : (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.warnSoft }}>
            <Lightbulb size={20} color={c.warn} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="bodyStrong">Buzón de sugerencias</Txt>
            <Txt variant="meta" tone="muted">
              Una idea, una queja, algo que mejorar. Es anónimo.
            </Txt>
          </View>
          <Button onPress={() => setOpen(true)}>Escribir</Button>
        </Card>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Buzón de sugerencias"
        footer={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button size="lg" onPress={() => setOpen(false)}>
              Cancelar
            </Button>
            <View style={{ flex: 1 }}>
              <Button variant="primary" size="lg" full disabled={!text.trim()} loading={sending} icon={<Send size={18} color={c.accentFg} />} onPress={() => void send()}>
                Enviar anónimo
              </Button>
            </View>
          </View>
        }
      >
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.surface2 }}>
            <EyeOff size={16} color={c.accent} style={{ marginTop: 2 }} />
            <Txt variant="meta" tone="muted" style={{ flex: 1 }}>
              Le llega a {suggestionOrganizers(league.kind)}{' '}
              <Txt variant="meta" style={{ fontFamily: font.bold }}>
                sin tu nombre
              </Txt>
              : solo ven el mensaje y el día, nunca quién lo escribió.
            </Txt>
          </View>
          <Input
            accessibilityLabel="Sugerencia"
            multiline
            numberOfLines={5}
            maxLength={MAX_SUGGESTION}
            value={text}
            onChangeText={(v) => setText(clampSuggestion(v))}
            placeholder="Escribe tu sugerencia…"
            textAlignVertical="top"
            style={{ height: 140, paddingTop: 14, paddingBottom: 14 }}
          />
          <Txt variant="small" tone={counter.full ? 'danger' : 'muted'} style={{ textAlign: 'right', fontVariant: ['tabular-nums'] }}>
            {counter.text}
          </Txt>
        </View>
      </Sheet>
    </>
  );
}
