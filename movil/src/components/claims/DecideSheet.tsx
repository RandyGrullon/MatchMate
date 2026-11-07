import { useState } from 'react';
import { View } from 'react-native';
import { AlertTriangle, UserCheck, X } from 'lucide-react-native';
import { CLAIM_NOTE_MAX, decideClaim, fetchClaimConflicts, type PlayerClaim } from '@mm/lib/data/claims';
import { CLAIM_CONFLICT_HELP, conflictsProblem, decideCopy, decideDoneText, decideProblem, type DecideProblem } from '@mm/components/claims/panel';
import { toast } from '@/components/feedback';
import { Button, Field, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * Aprobar o rechazar un reclamo (DecideModal de la web): lo que va a pasar, una nota opcional para quien pidió y, al
 * aprobar, antes se revisa si los dos jugadores aparecen en lo mismo (entonces se explica qué choca y no se toca nada).
 */
export function DecideSheet({ lid, claim: c, approve, onClose }: { lid: string; claim: PlayerClaim; approve: boolean; onClose: () => void }) {
  const col = useColors();
  const copy = decideCopy(c, approve);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<DecideProblem | null>(null);

  const close = () => {
    if (!busy) onClose();
  };

  async function submit() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (approve) {
        // Antes de aprobar: si los dos jugaron lo mismo, no se pueden juntar (se explica y no se toca nada).
        const conflicts = conflictsProblem(await fetchClaimConflicts(c.id));
        if (conflicts) {
          setProblem(conflicts);
          return;
        }
      }
      const status = await decideClaim(lid, c.id, approve, note);
      toast(decideDoneText(c, approve, status));
      onClose();
    } catch (e) {
      console.error(e);
      setProblem(decideProblem(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={close}
      title={copy.title}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" disabled={busy} onPress={close}>
            Cancelar
          </Button>
          <View style={{ flex: 1 }}>
            <Button
              variant={approve ? 'primary' : 'danger'}
              size="lg"
              full
              loading={busy}
              icon={approve ? <UserCheck size={18} color={col.accentFg} /> : <X size={18} color={col.onDanger} />}
              onPress={() => void submit()}
            >
              {copy.confirmText}
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 12, paddingBottom: 4 }}>
        <Txt style={{ fontSize: 15 }}>{copy.message}</Txt>
        <Field label={copy.noteLabel}>
          <Input
            multiline
            numberOfLines={2}
            maxLength={CLAIM_NOTE_MAX}
            value={note}
            onChangeText={(t) => setNote(t.slice(0, CLAIM_NOTE_MAX))}
            placeholder={copy.placeholder}
            accessibilityLabel={copy.noteLabel}
            style={{ minHeight: 76, textAlignVertical: 'top', paddingTop: 12 }}
          />
        </Field>
        {problem && (
          <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 14, padding: 12, backgroundColor: col.dangerSoft }}>
            <AlertTriangle size={16} color={col.danger} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Txt tone="danger" style={{ fontSize: 14 }}>
                {problem.text}
              </Txt>
              {problem.list && (
                <>
                  {problem.list.map((x) => (
                    <Txt key={x} tone="danger" style={{ fontSize: 14 }}>
                      {`• ${x}`}
                    </Txt>
                  ))}
                  <Txt tone="danger" style={{ fontSize: 14 }}>
                    {CLAIM_CONFLICT_HELP}
                  </Txt>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </Sheet>
  );
}
