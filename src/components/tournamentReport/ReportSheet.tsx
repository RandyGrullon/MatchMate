import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ChevronRight, Download, FileSpreadsheet, FileText, Share2 } from 'lucide-react';
import { useLeagueBadges } from '../../lib/data/leagueBadges';
import { usePlayers } from '../../lib/data/players';
import { useTournamentPrize } from '../../lib/data/prizes';
import { useLeagueCtx } from '../../lib/league';
import type { ReportFormat } from '../../lib/report/model';
import { useFeedback } from '../feedback';
import { downloadFile } from '../share/actions';
import { shareDate } from '../share/ShareButton';
import { Button, Sheet, Spinner } from '../ui';
import type { ReportButtonProps } from './ReportButton';
import { buildReport, offerReport, prizesHidden, shareReport } from './flow';

/** En qué va la hoja: eligiendo, haciendo el archivo, listo (compartir o ya descargado) o con error. */
export type ReportPhase =
  | { kind: 'choose' }
  | { kind: 'working'; format: ReportFormat }
  | { kind: 'ready'; format: ReportFormat; fileName: string; canShare: boolean }
  | { kind: 'error'; format: ReportFormat };

const FORMAT_NAME: Record<ReportFormat, string> = { pdf: 'PDF', excel: 'Excel' };

/**
 * La hoja «Reporte del torneo»: elegir PDF o Excel, hacerlo (el reporte del deporte con los premios que se leen aquí) y
 * compartirlo con el menú del teléfono (WhatsApp) o descargarlo. El archivo se hace antes de mostrar «Compartir»: el
 * menú del teléfono solo se abre si el toque lo llama de una vez (Safari no deja después de esperar).
 */
export default function ReportSheet({
  open,
  onClose,
  report,
  comp,
}: {
  open: boolean;
  onClose: () => void;
  report: ReportButtonProps['report'];
  comp: NonNullable<ReportButtonProps['comp']> | null;
}) {
  const ctx = useLeagueCtx();
  const { toast } = useFeedback();
  // Los premios, como la tarjeta: en una liga con menores solo los ven los miembros.
  const hide = prizesHidden(ctx.league, ctx.member);
  const prize = useTournamentPrize(comp && !hide ? ctx.lid : null, comp?.scope ?? 'evento', comp?.refId ?? null);
  const made = useLeagueBadges(prize.data ? ctx.lid : null);
  const players = usePlayers(prize.data ? ctx.lid : undefined);
  const prizesLoading = !!comp && !hide && (prize.loading || (!!prize.data && (made.loading || players.loading)));
  const [phase, setPhase] = useState<ReportPhase>({ kind: 'choose' });
  const [busy, setBusy] = useState(false);
  const ready = useRef<{ file: File; title: string } | null>(null);
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
      const built = await buildReport(
        format,
        report,
        { comp, prize: prize.data, designs: made.data.designs, players: players.data, hidden: hide },
        { generated: shareDate(new Date(), ctx.league.tz) },
      );
      if (!alive.current) return;
      ready.current = built;
      // Sin menú para archivos (computadora, o el Excel en Android): se descarga de una vez.
      const { canShare } = offerReport(built.file);
      if (!canShare) toast(`${FORMAT_NAME[format]} descargado`);
      setPhase({ kind: 'ready', format, fileName: built.file.name, canShare });
    } catch (e) {
      console.error('[reporte]', e);
      if (alive.current) setPhase({ kind: 'error', format });
    }
  };

  const download = () => {
    const f = ready.current;
    if (!f) return;
    downloadFile(f.file, f.file.name);
    toast('Reporte descargado');
  };

  const share = async () => {
    const f = ready.current;
    if (!f) return;
    setBusy(true);
    const next = await shareReport(f, typeof location !== 'undefined' ? location.href : '');
    if (!alive.current) return;
    setBusy(false);
    if (next === 'close') onClose();
    else if (next === 'download') {
      downloadFile(f.file, f.file.name);
      toast('Se descargó el reporte para que lo mandes');
    }
  };

  return (
    <ReportSheetView
      open={open}
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

function Option({ icon, title, text, disabled, onClick }: { icon: ReactNode; title: string; text: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-row w-full items-center gap-3.5 rounded-2xl bg-surface-2 py-2.5 pr-4 pl-3.5 text-left transition active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface text-accent" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-faint" />
    </button>
  );
}

/** Lo que se ve en la hoja (sin datos ni archivos: se prueba con renderToString). */
export function ReportSheetView(p: {
  open: boolean;
  onClose: () => void;
  subtitle?: string;
  phase: ReportPhase;
  prizesLoading?: boolean;
  busy?: boolean;
  onPick: (format: ReportFormat) => void;
  onShare: () => void;
  onDownload: () => void;
  onBack: () => void;
}) {
  const { phase } = p;
  const back = (
    <Button variant="quiet" size="lg" className="min-w-0 flex-1" icon={<ArrowLeft className="size-4" />} onClick={p.onBack}>
      Otro formato
    </Button>
  );
  // Un solo botón principal (Compartir, o Descargar otra vez); lo demás en gris al lado.
  const footer =
    phase.kind === 'ready' ? (
      <div className="flex flex-wrap gap-2">
        {back}
        {phase.canShare ? (
          <>
            <Button variant="quiet" size="lg" className="min-w-0 flex-1" icon={<Download className="size-4" />} onClick={p.onDownload}>
              Descargar
            </Button>
            <Button variant="primary" size="xl" className="w-full" loading={p.busy} icon={<Share2 className="size-5" />} onClick={p.onShare}>
              Compartir
            </Button>
          </>
        ) : (
          <Button variant="primary" size="lg" className="min-w-0 flex-1" icon={<Download className="size-4" />} onClick={p.onDownload}>
            Descargar otra vez
          </Button>
        )}
      </div>
    ) : phase.kind === 'error' ? (
      <div className="flex">{back}</div>
    ) : undefined;

  return (
    <Sheet open={p.open} onClose={p.onClose} title="Reporte del torneo" subtitle={p.subtitle} footer={footer}>
      {phase.kind === 'choose' ? (
        <div className="flex flex-col gap-3">
          <p className="text-meta text-muted">Campeones, premios y resultados en la primera página; el individual después.</p>
          <Option
            icon={<FileText className="size-5" />}
            title="PDF"
            text="Para mandar por WhatsApp o imprimir."
            disabled={p.prizesLoading}
            onClick={() => p.onPick('pdf')}
          />
          <Option
            icon={<FileSpreadsheet className="size-5" />}
            title="Excel"
            text="Hojas «General» e «Individual», y el detalle."
            disabled={p.prizesLoading}
            onClick={() => p.onPick('excel')}
          />
          {p.prizesLoading && (
            <p className="flex items-center gap-2 text-xs text-muted" role="status">
              <Spinner className="size-4" /> Leyendo los premios…
            </p>
          )}
        </div>
      ) : phase.kind === 'working' ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
          <Spinner className="size-6" />
          <p className="text-sm text-muted">Haciendo el {FORMAT_NAME[phase.format]}…</p>
        </div>
      ) : phase.kind === 'ready' ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl bg-surface-2 px-4 py-7 text-center">
          {phase.format === 'pdf' ? <FileText className="size-9 text-accent" /> : <FileSpreadsheet className="size-9 text-accent" />}
          <p className="text-sm font-medium break-all">{phase.fileName}</p>
          <p className="text-xs text-muted">
            {phase.canShare ? 'Toca «Compartir» y elige WhatsApp (o donde quieras).' : 'Se descargó: búscalo en tus descargas.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-3xl bg-surface-2 px-4 py-8 text-center">
          <AlertTriangle className="size-6 text-warn" />
          <p className="text-sm">No se pudo hacer el {FORMAT_NAME[phase.format]}. Prueba otra vez.</p>
        </div>
      )}
    </Sheet>
  );
}
