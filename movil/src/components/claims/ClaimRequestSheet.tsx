import { useState } from 'react';
import { View } from 'react-native';
import { UserCheck } from 'lucide-react-native';
import { CLAIM_NOTE_MAX, claimErrorText, requestClaim } from '@mm/lib/data/claims';
import { useLeagueCtx } from '@mm/lib/league';
import { claimRequestCopy, claimRequestDoneText } from '@mm/components/claims/banner';
import { toast } from '@/components/feedback';
import { Button, ErrorNote, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * «¿Eres <nombre>?» (ClaimRequestModal de la web): pide ser ese jugador y deja una nota para el admin. El dueño o un
 * admin de la liga lo aprueba; si quien pide es admin, queda aprobado al momento. Va dentro de LeagueScope.
 */
export function ClaimRequestSheet({ player, onClose, onDone }: { player: { id: string; name: string }; onClose: () => void; onDone?: () => void }) {
  const c = useColors();
  const { lid, isAdmin } = useLeagueCtx();
  const copy = claimRequestCopy(player.name, isAdmin);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestClaim(lid, player.id, note);
      toast(claimRequestDoneText(player.name, isAdmin));
      setNote('');
      onDone?.();
      onClose();
    } catch (e) {
      console.error(e);
      setError(claimErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title={copy.title}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" disabled={busy} onPress={onClose}>
            Cancelar
          </Button>
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" full loading={busy} icon={<UserCheck size={18} color={c.accentFg} />} onPress={() => void send()}>
              {copy.confirmText}
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 12, paddingBottom: 4 }}>
        <Txt style={{ fontSize: 15 }}>{copy.message}</Txt>
        {!isAdmin && (
          <Field label={copy.noteLabel}>
            <Input
              multiline
              numberOfLines={2}
              maxLength={CLAIM_NOTE_MAX}
              value={note}
              onChangeText={(t) => setNote(t.slice(0, CLAIM_NOTE_MAX))}
              placeholder={copy.notePlaceholder}
              accessibilityLabel={copy.noteLabel}
              style={{ minHeight: 76, textAlignVertical: 'top', paddingTop: 12 }}
            />
          </Field>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </View>
    </Sheet>
  );
}
