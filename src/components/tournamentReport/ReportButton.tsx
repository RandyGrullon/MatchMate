import { lazy, Suspense, useState } from 'react';
import { FileDown } from 'lucide-react';
import type { TournamentReport } from '../../lib/report/model';
import type { PrizeComp } from '../../prizes/catalog';
import { useBusy } from '../busy';
import { Button, Card, cx } from '../ui';

/**
 * «Reporte del torneo»: el PDF (para WhatsApp o imprimir) o el Excel del torneo con todo, en cualquier pantalla de
 * torneo de cualquier deporte. Lo ve todo el que ve el torneo (también sin cuenta en una liga pública). La hoja con las
 * opciones y todo lo que hace el archivo se cargan al tocar.
 */

const loadSheet = () => import('./ReportSheet');
const ReportSheet = lazy(loadSheet);

export interface ReportButtonProps {
  /**
   * Arma el reporte al tocar «PDF» o «Excel» (puede cargar el adaptador del deporte con import()). Sin los premios
   * entregados: esos los agrega la hoja con `comp`. null = no hay nada que reportar.
   */
  report: () => TournamentReport | null | Promise<TournamentReport | null>;
  /** La competencia con premios (la misma de la tarjeta «Premios»): los entregados salen en la página «General». */
  comp?: PrizeComp | null;
  /**
   * 'icon': el botón chico de la cabecera (para todos). 'card': la tarjeta grande, para el admin cuando el torneo
   * terminó.
   */
  look?: 'icon' | 'card';
  /** Mientras la pantalla todavía lee los datos del torneo. */
  disabled?: boolean;
  className?: string;
}

export function ReportButton({ report, comp, look = 'icon', disabled, className }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const loading = useBusy();
  // La hoja se baja al tocar: el botón gira mientras llega.
  const start = async () => {
    await loading.run('abrir', () => loadSheet().catch(() => undefined));
    setOpen(true);
  };
  const sheet = open && (
    <Suspense fallback={null}>
      <ReportSheet open onClose={() => setOpen(false)} report={report} comp={comp ?? null} />
    </Suspense>
  );
  if (look === 'card') {
    return (
      <>
        {/* Una fila en una tarjeta (sin borde de color): el reporte, para quien organiza cuando el torneo terminó. */}
        <Card className={cx('flex min-h-row items-center gap-3.5 py-2.5 pr-3 pl-5', className)}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent" aria-hidden="true">
            <FileDown className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold">Reporte del torneo</p>
            <p className="text-sm text-muted">PDF para WhatsApp o imprimir, o Excel.</p>
          </div>
          <Button variant="soft" className="h-11 shrink-0 rounded-full!" disabled={disabled} loading={loading.isBusy()} onClick={() => void start()}>
            Descargar
          </Button>
        </Card>
        {sheet}
      </>
    );
  }
  return (
    <>
      <Button
        variant="ghost"
        className={className}
        disabled={disabled}
        loading={loading.isBusy()}
        onClick={() => void start()}
        aria-label="Reporte del torneo"
        title="Reporte del torneo"
        icon={<FileDown className="size-5" />}
      />
      {sheet}
    </>
  );
}
