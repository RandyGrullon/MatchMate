/**
 * Organizar › Temporada y fechas: «Suspender un día» (SuspendDayRow y SuspendDayModal de
 * src/components/organizer/SuspendDay.tsx, con su misma lógica: suspendForm.ts y organizer/logic.ts). El día (hoy por
 * defecto), el motivo y, si se sabe, la nueva fecha; muestra lo que va a pasar (suspend_day_preview) y, al confirmar,
 * mueve o aplaza todo y manda UN aviso a la liga. Va dentro de LeagueScope.
 */
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AlertTriangle, CalendarX, CloudRain } from 'lucide-react-native';
import { SUSPEND_REASON_MAX, suspendDay, useSuspendPreview } from '@mm/lib/data/organizer';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { addDays } from '@mm/pages/sports/racket/logic/time';
import { dayWords, suspendCounts, suspendDoneText, suspendLines, suspendNotice, suspendReasons } from '@mm/components/organizer/logic';
import { ISO_DATE, leagueToday, suspendAudience, suspendErrorText, suspendForm } from '@mm/components/organizer/suspendForm';
import { DateStepper } from '@/components/DateStepper';
import { confirmAsync, toast } from '@/components/feedback';
import { Button, Card, Field, Input, ListRow, RowIcon, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { OptionalDayField } from './parts';

/** La fila «Suspender un día» (abre la hoja). */
export function SuspendDayRow() {
  const c = useColors();
  const { league } = useLeagueCtx();
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <ListRow
        icon={
          <RowIcon>
            <CloudRain size={20} color={c.accent} />
          </RowIcon>
        }
        title="Suspender un día"
        subtitle={`Lluvia, sin luz… mueve o aplaza lo de ese día y avisa a ${suspendAudience(league.kind)}`}
        onPress={() => setOpen(true)}
      />
      {/* Se monta al abrirse: empieza en hoy y sin motivo. */}
      {open && <SuspendDaySheet onClose={() => setOpen(false)} />}
    </Card>
  );
}

/** Dos rayas grises mientras llega lo de ese día (el Skeleton de la web). */
function PreviewLoading() {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height: 14, width: '66%', borderRadius: 6, backgroundColor: c.surface2 }} />
      <View style={{ height: 14, width: '50%', borderRadius: 6, backgroundColor: c.surface2 }} />
    </View>
  );
}

export function SuspendDaySheet({ onClose }: { onClose: () => void }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const now = useNow();
  const today = leagueToday(league.tz, now);
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [busy, setBusy] = useState(false);

  const validDate = ISO_DATE.test(date);
  const preview = useSuspendPreview(lid, validDate ? date : null);
  const p = preview.data;
  // Sin nueva fecha, lo que tiene inscritos se queda: si es lo único, suspender no cambiaría nada (ni sale el aviso).
  const { target, badNewDate, why, n, changes, canSend } = suspendForm({ date, reason, newDate, today, preview: p, busy });
  const all = suspendAudience(league.kind);

  async function send() {
    if (!canSend) return;
    const ok = await confirmAsync({
      title: `¿Suspender el ${dayWords(date)}?`,
      message: `${suspendNotice(date, why, target)}\n\nEse aviso le llega a ${all}. Lo que se mueva o se cancele no se puede deshacer desde aquí.`,
      confirmText: 'Suspender',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await suspendDay(lid, date, why, target);
      toast(suspendDoneText(r));
      onClose();
    } catch (e) {
      console.error(e);
      toast(suspendErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Suspender un día"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" onPress={onClose}>
            Cancelar
          </Button>
          <View style={{ flex: 1 }}>
            <Button variant="danger" size="lg" full loading={busy} disabled={!canSend} icon={<CalendarX size={18} color={c.onDanger} />} onPress={() => void send()}>
              Suspender el día
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 16, paddingBottom: 4 }}>
        <Field label="Día que se suspende">
          <DateStepper value={date} onChange={setDate} />
        </Field>

        <View style={{ gap: 8 }}>
          <Field label="Motivo (va en el aviso)">
            <Input
              value={reason}
              maxLength={SUSPEND_REASON_MAX}
              onChangeText={(t) => setReason(t.slice(0, SUSPEND_REASON_MAX))}
              placeholder="Lluvia"
              accessibilityLabel="Motivo (va en el aviso)"
            />
          </Field>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="Motivos listos" contentContainerStyle={{ gap: 6 }}>
            {suspendReasons(league.sport).map((t) => {
              const on = reason === t;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setReason(t)}
                  style={{ minHeight: 44, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 12, backgroundColor: on ? c.accent : c.surface2 }}
                >
                  <Txt style={{ fontSize: 14, fontFamily: font.medium, color: on ? c.accentFg : c.muted }}>{t}</Txt>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Field
          label="Nueva fecha (opcional)"
          error={badNewDate}
          hint={
            badNewDate
              ? 'Tiene que ser desde hoy y distinta del día que se suspende.'
              : 'Si todavía no la sabes, déjala vacía: los partidos quedan aplazados y se avisa que la fecha se dirá después.'
          }
        >
          <OptionalDayField label="Nueva fecha (opcional)" value={newDate} min={today} start={addDays(date, 1)} onChange={setNewDate} />
        </Field>

        <View accessibilityLiveRegion="polite" style={{ borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, padding: 12 }}>
          {!validDate ? (
            <Txt tone="muted" style={{ fontSize: 14 }}>
              Elige el día.
            </Txt>
          ) : preview.loading && !p ? (
            <PreviewLoading />
          ) : preview.error ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color={c.danger} />
              <Txt tone="danger" style={{ fontSize: 14, flex: 1 }}>
                No se pudo ver qué hay ese día. Revisa tu conexión.
              </Txt>
            </View>
          ) : p && n === 0 ? (
            <Txt tone="muted" style={{ fontSize: 14 }}>
              {p.counts.locked ? 'Lo de ese día ya empezó o tiene resultados: no hay nada que suspender.' : `El ${dayWords(date)} no hay nada programado.`}
            </Txt>
          ) : p ? (
            <View style={{ gap: 6 }}>
              <Txt style={{ fontSize: 14, fontFamily: font.medium }}>{`El ${dayWords(date)}: ${suspendCounts(p).join(', ')}.`}</Txt>
              <View style={{ gap: 4 }}>
                {[...suspendLines(p, target), ...(changes > 0 ? [`Se manda un aviso a ${all}.`] : [])].map((l) => (
                  <View key={l} style={{ flexDirection: 'row', gap: 8, paddingLeft: 4 }}>
                    <Txt tone="muted" style={{ fontSize: 14 }}>
                      •
                    </Txt>
                    <Txt tone="muted" style={{ fontSize: 14, flex: 1 }}>
                      {l}
                    </Txt>
                  </View>
                ))}
              </View>
              {changes === 0 && !badNewDate && (
                <Txt tone="warn" style={{ fontSize: 14, fontFamily: font.medium, marginTop: 2 }}>
                  Sin nueva fecha no cambia nada: ponle una nueva fecha para moverlo.
                </Txt>
              )}
            </View>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}
