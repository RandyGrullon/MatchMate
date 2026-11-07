/**
 * Un reporte en la lista de la liga (ReportItem y ResolveButtons de la web, src/components/report/ReportItem.tsx, con su
 * misma lógica: src/components/report/logic.ts y src/lib/data/reports.ts): el motivo, qué es, lo reportado a la vista
 * (con «Ver», que lo abre en la app si lo tiene o en la web), la nota, cuántos hay de lo mismo y cómo quedó. Abajo,
 * «Marcar como atendido» (con lo que se hizo) y «Descartar».
 */
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { CheckCircle2, ExternalLink, Flag } from 'lucide-react-native';
import { REPORT_KIND_LABEL, REPORT_NOTE_MAX, REPORT_REASON_LABEL, reportErrorText, reportTargetUrl, resolveReport, type Report } from '@mm/lib/data/reports';
import { relativeTime } from '@mm/lib/notifications';
import { ATTEND_NOTE_LABEL, ATTEND_NOTE_PLACEHOLDER, attendNoteHint, dismissConfirm, reasonTone, resolvedText, resolvedToast } from '@mm/components/report/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { PillButton } from '@/components/scorers/parts';
import { Button, Input, Sheet, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';
import { font, radius, type Colors } from '@/theme/tokens';

/** El color del motivo (lo grave en rojo, lo dudoso en amarillo, lo demás en gris). */
function toneColors(c: Colors, report: Pick<Report, 'reason'>): { bg: string; fg: string } {
  const tone = reasonTone(report.reason);
  if (tone === 'danger') return { bg: c.dangerSoft, fg: c.danger };
  if (tone === 'warn') return { bg: c.warnSoft, fg: c.warn };
  return { bg: c.surface2, fg: c.muted };
}

export function ReportItem({ report: r, now, actions }: { report: Report; now: number; actions?: ReactNode }) {
  const c = useColors();
  const t = r.target;
  const url = reportTargetUrl(r);
  const created = Date.parse(r.createdAt);
  const done = resolvedText(r, now);
  const tone = toneColors(c, r);
  return (
    <View style={{ gap: 10, paddingHorizontal: 20, paddingVertical: 16 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: tone.bg }}>
          <Flag size={12} color={tone.fg} />
          <Txt style={{ color: tone.fg, fontFamily: font.semibold, fontSize: 12 }}>{REPORT_REASON_LABEL[r.reason]}</Txt>
        </View>
        <Txt variant="small" tone="muted" style={{ flexShrink: 1 }}>
          {REPORT_KIND_LABEL[r.kind]}
          {r.leagueName && r.kind !== 'league' ? ` · ${r.leagueName}` : ''}
        </Txt>
        {Number.isFinite(created) && (
          <Txt variant="small" tone="muted" style={{ marginLeft: 'auto' }}>
            {relativeTime(created, now)}
          </Txt>
        )}
      </View>

      <View style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface2 }}>
        {t ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt numberOfLines={1} style={{ fontSize: 14, fontFamily: font.semibold }}>
                {t.title}
              </Txt>
              {!!t.text && (
                <Txt numberOfLines={3} tone="fg2" style={{ fontSize: 14, lineHeight: 20 }}>
                  {t.text}
                </Txt>
              )}
              {r.kind === 'league' && !!t.userName && (
                <Txt variant="small" tone="muted" numberOfLines={1}>
                  {`Dueño: ${t.userName}`}
                </Txt>
              )}
            </View>
            {url && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Ver ${REPORT_KIND_LABEL[r.kind].toLowerCase()}: ${t.title}`}
                onPress={() => openLink(url)}
                style={({ pressed }) => ({ width: 44, height: 44, margin: -8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? c.accentSoft : 'transparent' })}
              >
                <ExternalLink size={16} color={c.accent} />
              </Pressable>
            )}
          </View>
        ) : (
          <Txt variant="meta" tone="muted">
            Ya no existe (se borró).
          </Txt>
        )}
      </View>

      {!!r.note && <Txt style={{ fontSize: 14, lineHeight: 20 }}>{`«${r.note}»`}</Txt>}
      {r.status === 'open' && r.sameTarget > 1 && (
        <Txt variant="small" tone="warn" style={{ fontFamily: font.semibold }}>
          {`${r.sameTarget} reportes abiertos de esto`}
        </Txt>
      )}
      {done && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <CheckCircle2 size={14} color={r.status === 'actioned' ? c.ok : c.muted} style={{ marginTop: 1 }} />
          <Txt variant="small" tone="muted" style={{ flex: 1 }}>
            {done}
            {r.actionNote ? `: «${r.actionNote}»` : ''}
          </Txt>
        </View>
      )}
      {actions && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{actions}</View>}
    </View>
  );
}

/**
 * Descartar (con confirmación) y «Marcar como atendido» (con una nota de lo que se hizo) de un reporte abierto.
 * Cierra también los demás reportes abiertos de lo mismo.
 */
export function ResolveButtons({ report }: { report: Report }) {
  const c = useColors();
  // Cuál se está guardando: la ruedita va en ese botón.
  const [busy, setBusy] = useState<'dismissed' | 'actioned' | null>(null);
  const [attending, setAttending] = useState(false);
  const [note, setNote] = useState('');

  async function run(status: 'dismissed' | 'actioned', text: string | null) {
    if (busy) return false;
    setBusy(status);
    try {
      await resolveReport(report.id, status, text);
      toast(resolvedToast(status));
      return true;
    } catch (e) {
      console.error(e);
      toast(reportErrorText(e), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    if (await confirmAsync(dismissConfirm(report))) await run('dismissed', null);
  }

  async function attend() {
    if (await run('actioned', note)) {
      setAttending(false);
      setNote('');
    }
  }

  return (
    <>
      <PillButton variant="soft" icon={(color) => <CheckCircle2 size={16} color={color} />} disabled={!!busy} onPress={() => setAttending(true)}>
        Marcar como atendido
      </PillButton>
      <PillButton variant="quiet" loading={busy === 'dismissed'} disabled={!!busy} onPress={() => void dismiss()}>
        Descartar
      </PillButton>
      <Sheet
        open={attending}
        onClose={() => setAttending(false)}
        title="Marcar como atendido"
        footer={
          <Button variant="primary" size="xl" full icon={<CheckCircle2 size={20} color={c.accentFg} />} loading={busy === 'actioned'} onPress={() => void attend()}>
            Listo
          </Button>
        }
      >
        <View style={{ gap: 8 }}>
          <Txt style={{ fontSize: 14 }}>
            {ATTEND_NOTE_LABEL}
            <Txt tone="muted" style={{ fontSize: 14 }}>
              {attendNoteHint(report)}
            </Txt>
          </Txt>
          <Input
            multiline
            value={note}
            onChangeText={(v) => setNote(v.slice(0, REPORT_NOTE_MAX))}
            maxLength={REPORT_NOTE_MAX}
            placeholder={ATTEND_NOTE_PLACEHOLDER}
            accessibilityLabel={ATTEND_NOTE_LABEL}
            style={{ height: 96, paddingTop: 14, textAlignVertical: 'top' }}
          />
        </View>
      </Sheet>
    </>
  );
}
