import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AlertTriangle, Clock, RotateCcw, ScanLine, WifiOff } from 'lucide-react-native';
import { setSubmissionScan } from '@mm/lib/data/submissions';
import { useLeagueCtx } from '@mm/lib/league';
import type { ScanRow } from '@mm/lib/scan-result';
import { scanDone, startScan, useScanJob } from '@mm/lib/scanJobs';
import type { Player, Submission } from '@mm/lib/types';
import { useNow } from '@mm/lib/useNow';
import { FRESH_MS, adminReads, readOutcome, readingView, scanRowLabel, type ReadingLine } from '@mm/pages/approvals';
import { useBusy } from '@/components/bowlingTeams/parts';
import { PickField } from '@/components/players/fields';
import { Button, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { act } from './parts';

/**
 * Lo que leyó la IA de la foto del envío (PhotoReading de la web, con su lógica: src/pages/approvals.ts). Recién
 * enviado, puede que el teléfono del jugador todavía la esté leyendo (se lee en segundo plano); si no llegó (cerró la
 * app, sin señal, no encontró su fila), el admin la lee aquí con la foto guardada. Con lo leído ya puesto, se puede
 * volver a leer o elegir otra fila. `onApply`: se va a guardar una fila leída (el envío la propone si no se tocó nada).
 */
export function PhotoReading({ sub, player, photoUrl, onApply }: { sub: Submission; player: Player; photoUrl: string | null; onApply: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const now = useNow(30_000);
  const [read, setRead] = useState(() => adminReads.get(sub.id) ?? null);
  const job = useScanJob(read?.jobId ?? null);
  const [picked, setPicked] = useState('');
  // Guardando la fila leída en el envío.
  const saving = useBusy();
  const hasRead = sub.scanned != null;
  const fresh = !!sub.createdAt && now.getTime() - sub.createdAt.toMillis() < FRESH_MS;
  const view = readingView({ job, read, saving: saving.isBusy(), hasRead, fresh, hasPhoto: !!photoUrl, name: player.name });
  const { choices, line } = view;

  function forget() {
    adminReads.delete(sub.id);
    setRead(null);
    setPicked('');
  }

  function apply(row: ScanRow) {
    return saving.run('fila', () => {
      onApply();
      return act(() => setSubmissionScan(lid, sub.id, row.games, row.name));
    });
  }

  function start(pick: boolean) {
    if (!photoUrl) return;
    const next = { jobId: startScan(photoUrl, { leagueId: lid, eventId: sub.eventId ?? null }), pick };
    adminReads.set(sub.id, next);
    setRead(next);
    scanDone(next.jobId)
      .then((rows) => {
        const out = readOutcome(player.name, rows, pick);
        // Si se sabe cuál es su fila, se pone sola; si no (o se pidió cambiarla), el admin la elige.
        if (out && 'apply' in out) {
          adminReads.delete(sub.id);
          void apply(out.apply);
        } else if (out) {
          setPicked(String(out.picked));
        }
      })
      .catch(() => undefined);
  }

  if (view.again) {
    return photoUrl ? (
      <Button variant="ghost" icon={<RotateCcw size={18} color={c.fg} />} onPress={() => start(true)} style={{ alignSelf: 'flex-start' }}>
        Leer de nuevo o elegir otra fila
      </Button>
    ) : null;
  }

  return (
    <View style={[styles.box, { backgroundColor: c.surface2 }]}>
      {line && <Line line={line} />}
      {choices && (
        <View style={{ gap: 8 }}>
          <PickField
            label="Fila de la foto"
            options={[{ key: '', label: '— Elegir fila —' }, ...choices.map((r, i) => ({ key: String(i), label: scanRowLabel(r) }))]}
            value={picked}
            onChange={setPicked}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              variant="primary"
              loading={saving.isBusy()}
              disabled={picked === ''}
              style={{ flex: 1 }}
              onPress={() => {
                const row = choices[+picked];
                if (!row) return;
                // Se queda la fila elegida (con la ruedita) hasta que se guarda.
                void apply(row).then(forget);
              }}
            >
              Usar esta fila
            </Button>
            <Button variant="secondary" onPress={forget}>
              Cancelar
            </Button>
          </View>
        </View>
      )}
      {view.button && (
        <Button variant="secondary" icon={<ScanLine size={18} color={c.fg} />} onPress={() => start(hasRead)} style={{ alignSelf: 'flex-start' }}>
          {view.button}
        </Button>
      )}
    </View>
  );
}

/** Lo que dice la lectura, con su ícono (o la ruedita). */
function Line({ line }: { line: ReadingLine }) {
  const c = useColors();
  const tone = line.kind === 'leyendo' || line.kind === 'guardando' ? 'accent' : line.kind === 'error' || line.kind === 'sin-leer' ? 'warn' : 'muted';
  const color = c[tone];
  const icon =
    line.kind === 'leyendo' || line.kind === 'guardando' ? (
      <ActivityIndicator size="small" color={c.accent} />
    ) : line.kind === 'esperando' ? (
      line.offline ? (
        <WifiOff size={16} color={color} />
      ) : (
        <Clock size={16} color={color} />
      )
    ) : line.kind === 'fresca' ? (
      <Clock size={16} color={color} />
    ) : line.kind === 'error' || line.kind === 'sin-leer' ? (
      <AlertTriangle size={16} color={color} />
    ) : null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.line}>
      {icon && <View style={{ paddingTop: 2 }}>{icon}</View>}
      <Txt variant="meta" tone={tone} style={{ flex: 1 }}>
        {line.text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
