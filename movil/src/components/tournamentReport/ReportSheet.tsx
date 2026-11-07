/**
 * La hoja «Reporte del torneo» (ReportSheet de la web, con su misma lógica: src/components/tournamentReport/flow.ts y
 * view.ts): elegir PDF o Excel, hacerlo (el reporte del deporte con los premios que se leen aquí, el mismo archivo de la
 * web: src/lib/report) y compartirlo con la hoja del teléfono (WhatsApp, Archivos, correo…). En la vista previa web de
 * la app se descarga de una vez, como en la web en una computadora.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, ArrowLeft, ChevronRight, Download, FileSpreadsheet, FileText, Share2 } from 'lucide-react-native';
import { useLeagueBadges } from '@mm/lib/data/leagueBadges';
import { usePlayers } from '@mm/lib/data/players';
import { useTournamentPrize } from '@mm/lib/data/prizes';
import { useLeagueCtx } from '@mm/lib/league';
import { reportBytes, type ReportBytes } from '@mm/lib/report/bytes';
import type { ReportFormat, TournamentReport } from '@mm/lib/report/model';
import type { PrizeComp } from '@mm/prizes/catalog';
import { shareDate } from '@mm/components/share/frame';
import { fullReport, prizesHidden } from '@mm/components/tournamentReport/flow';
import {
  PRIZES_LOADING_TEXT,
  REPORT_CHOOSE_TEXT,
  REPORT_OPTIONS,
  REPORT_TITLE,
  downloadedText,
  readyText,
  reportErrorText,
  workingText,
  type ReportPhase,
} from '@mm/components/tournamentReport/view';
import { toast } from '@/components/feedback';
import { LogoSpinner } from '@/components/Logo';
import { Button, Sheet, Txt } from '@/components/ui';
import { canShareFiles, downloadBytes, phoneLogo, saveToCache, shareSaved, xlsxBytes } from '@/platform/reportFile';
import { useColors } from '@/theme/theme';

export interface ReportSource {
  /** Arma el reporte del deporte al tocar «PDF» o «Excel» (sin los premios: los agrega la hoja). null = nada que reportar. */
  report: () => TournamentReport | null | Promise<TournamentReport | null>;
  /** La competencia con premios (la misma de la tarjeta «Premios»): los entregados salen en la página «General». */
  comp?: PrizeComp | null;
}

/** El archivo hecho: sus bytes, el título del torneo y, en el teléfono, dónde quedó guardado. */
type Ready = ReportBytes & { title: string; uri: string | null };

export function ReportSheet({ open, onClose, report, comp }: ReportSource & { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <ReportSheetOpen onClose={onClose} report={report} comp={comp ?? null} />;
}

function ReportSheetOpen({ onClose, report, comp }: { onClose: () => void; report: ReportSource['report']; comp: PrizeComp | null }) {
  const ctx = useLeagueCtx();
  // Los premios, como la tarjeta: en una liga con menores solo los ven los miembros.
  const hide = prizesHidden(ctx.league, ctx.member);
  const prize = useTournamentPrize(comp && !hide ? ctx.lid : null, comp?.scope ?? 'evento', comp?.refId ?? null);
  const made = useLeagueBadges(prize.data ? ctx.lid : null);
  const players = usePlayers(prize.data ? ctx.lid : undefined);
  const prizesLoading = !!comp && !hide && (prize.loading || (!!prize.data && (made.loading || players.loading)));
  const [phase, setPhase] = useState<ReportPhase>({ kind: 'choose' });
  const [busy, setBusy] = useState(false);
  const ready = useRef<Ready | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const make = async (format: ReportFormat) => {
    setPhase({ kind: 'working', format });
    try {
      const full = await fullReport(report, { comp, prize: prize.data, designs: made.data.designs, players: players.data, hidden: hide });
      const file = await reportBytes(format, full, { generated: shareDate(new Date(), ctx.league.tz), logo: phoneLogo, xlsx: xlsxBytes });
      if (!alive.current) return;
      // Sin hoja de compartir (la vista previa web): se descarga de una vez.
      const canShare = await canShareFiles();
      const uri = canShare ? await saveToCache(file) : null;
      if (!alive.current) return;
      ready.current = { ...file, title: full.title, uri };
      if (!canShare) {
        downloadBytes(file);
        toast(downloadedText(format));
      }
      setPhase({ kind: 'ready', format, fileName: file.name, canShare });
    } catch (e) {
      console.error('[reporte]', e);
      if (alive.current) setPhase({ kind: 'error', format });
    }
  };

  const download = () => {
    const f = ready.current;
    if (!f) return;
    downloadBytes(f);
    toast('Reporte descargado');
  };

  const share = async () => {
    const f = ready.current;
    if (!f?.uri) return;
    setBusy(true);
    try {
      await shareSaved(f.uri, f.type, `${f.title} · ${REPORT_TITLE}`);
    } catch (e) {
      console.warn('[reporte] compartir', e);
      toast('No se pudo compartir.', 'error');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <ReportSheetView
      onClose={onClose}
      subtitle={comp?.name}
      phase={phase}
      prizesLoading={prizesLoading}
      busy={busy}
      onPick={(f) => void make(f)}
      onShare={() => void share()}
      onDownload={download}
      onBack={() => setPhase({ kind: 'choose' })}
    />
  );
}

function Option({ icon, title, text, disabled, onPress }: { icon: ReactNode; title: string; text: string; disabled?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${text}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.option, { backgroundColor: c.surface2, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.optionIcon, { backgroundColor: c.surface }]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="meta" tone="muted">
          {text}
        </Txt>
      </View>
      <ChevronRight size={20} color={c.faint} />
    </Pressable>
  );
}

/** Lo que se ve en la hoja según el paso (como ReportSheetView de la web). */
function ReportSheetView(p: {
  onClose: () => void;
  subtitle?: string;
  phase: ReportPhase;
  prizesLoading: boolean;
  busy: boolean;
  onPick: (format: ReportFormat) => void;
  onShare: () => void;
  onDownload: () => void;
  onBack: () => void;
}) {
  const c = useColors();
  const { phase } = p;
  const back = (
    <Button size="lg" icon={<ArrowLeft size={16} color={c.fg} />} onPress={p.onBack} style={{ flex: 1 }}>
      Otro formato
    </Button>
  );
  // Un solo botón principal (Compartir, o Descargar otra vez); lo demás en gris al lado. En el teléfono no hay
  // «Descargar»: la hoja de compartir ya trae «Guardar en Archivos».
  const footer =
    phase.kind === 'ready' ? (
      <View style={{ gap: 8 }}>
        {phase.canShare ? (
          <>
            <View style={{ flexDirection: 'row' }}>{back}</View>
            <Button variant="primary" size="xl" full loading={p.busy} icon={<Share2 size={20} color={c.accentFg} />} onPress={p.onShare}>
              Compartir
            </Button>
          </>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {back}
            <Button variant="primary" size="lg" icon={<Download size={16} color={c.accentFg} />} onPress={p.onDownload} style={{ flex: 1 }}>
              Descargar otra vez
            </Button>
          </View>
        )}
      </View>
    ) : phase.kind === 'error' ? (
      <View style={{ flexDirection: 'row' }}>{back}</View>
    ) : undefined;

  const FormatIcon = phase.kind !== 'choose' && phase.format === 'excel' ? FileSpreadsheet : FileText;
  return (
    <Sheet open onClose={p.onClose} title={REPORT_TITLE} subtitle={p.subtitle} footer={footer}>
      {phase.kind === 'choose' ? (
        <View style={{ gap: 12 }}>
          <Txt variant="meta" tone="muted">
            {REPORT_CHOOSE_TEXT}
          </Txt>
          {REPORT_OPTIONS.map((o) => (
            <Option
              key={o.format}
              icon={o.format === 'pdf' ? <FileText size={20} color={c.accent} /> : <FileSpreadsheet size={20} color={c.accent} />}
              title={o.title}
              text={o.text}
              disabled={p.prizesLoading}
              onPress={() => p.onPick(o.format)}
            />
          ))}
          {p.prizesLoading && (
            <View accessibilityRole="progressbar" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <LogoSpinner size={16} label={PRIZES_LOADING_TEXT} />
              <Txt variant="small" tone="muted">
                {PRIZES_LOADING_TEXT}
              </Txt>
            </View>
          )}
        </View>
      ) : phase.kind === 'working' ? (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 40 }}>
          <LogoSpinner size={32} label={workingText(phase.format)} />
          <Txt variant="meta" tone="muted">
            {workingText(phase.format)}
          </Txt>
        </View>
      ) : phase.kind === 'ready' ? (
        <View style={[styles.result, { backgroundColor: c.surface2 }]}>
          <FormatIcon size={36} color={c.accent} />
          <Txt selectable variant="meta" style={{ textAlign: 'center' }}>
            {phase.fileName}
          </Txt>
          <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
            {readyText(phase.canShare)}
          </Txt>
        </View>
      ) : (
        <View style={[styles.result, { backgroundColor: c.surface2 }]}>
          <AlertTriangle size={24} color={c.warn} />
          <Txt variant="meta" style={{ textAlign: 'center' }}>
            {reportErrorText(phase.format)}
          </Txt>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, borderRadius: 16, paddingVertical: 10, paddingLeft: 14, paddingRight: 16 },
  optionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  result: { alignItems: 'center', gap: 8, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 28 },
});
