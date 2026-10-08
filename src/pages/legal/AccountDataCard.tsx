import { lazy, Suspense, useState } from 'react';
import { Download, ScrollText, ShieldCheck, UserX } from 'lucide-react';
import { useFeedback } from '../../components/feedback';
import { useBusy } from '../../components/busy';
import { Card, ListRow, RowIcon, SectionHeader, Spinner } from '../../components/ui';
import { useIsPro } from '../../lib/useMode';
import { accountErrorMessage, downloadMyData } from './account';
import { PRIVACY_PATH, TERMS_PATH } from './legal';

const loadDialog = () => import('./DeleteAccountDialog');
const DeleteAccountDialog = lazy(loadDialog);

/**
 * Configuración › Tus datos (Ley 172-13), en filas: la política de privacidad y los términos, «Descargar mis datos» (un
 * JSON con todo lo de la cuenta; da vueltas mientras se arma) y «Borrar mi cuenta» (en rojo, con el traspaso guiado de
 * las ligas a su nombre).
 */
export function AccountDataCard({ onDeleting, onDeleted, className }: { onDeleting?: (deleting: boolean) => void; onDeleted: () => void; className?: string }) {
  const { toast } = useFeedback();
  const pro = useIsPro();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // La primera vez se baja el diálogo (sin señal tarda): «Borrar mi cuenta» da vueltas mientras.
  const opening = useBusy();

  function openDelete() {
    if (opening.isBusy()) return;
    // Si no se pudo bajar, se abre igual: la pantalla de error dice que hay que actualizar (como antes).
    void opening.run('abrir', () => loadDialog().catch(() => undefined)).then(() => setDeleting(true));
  }

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    try {
      const name = await downloadMyData();
      toast(`Listo: se bajó ${name}`);
    } catch (e) {
      toast(accountErrorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  }

  const icon = pro ? 'size-[19px]' : 'size-5';
  return (
    <section aria-labelledby="tus-datos" className={className}>
      <SectionHeader id="tus-datos" title="Tus datos" />
      <Card className="overflow-hidden">
        <ListRow
          dense={pro}
          leading={
            <RowIcon>
              <ShieldCheck className={icon} />
            </RowIcon>
          }
          title="Política de privacidad"
          to={PRIVACY_PATH}
        />
        <ListRow
          dense={pro}
          leading={
            <RowIcon>
              <ScrollText className={icon} />
            </RowIcon>
          }
          title="Términos de uso"
          to={TERMS_PATH}
        />
        <ListRow
          dense={pro}
          leading={
            <RowIcon>
              <Download className={icon} />
            </RowIcon>
          }
          title="Descargar mis datos"
          subtitle="Tu perfil, ligas y resultados"
          onClick={() => void exportData()}
          trailing={exporting ? <Spinner className="text-accent" /> : undefined}
          chevron={!exporting}
        />
        <ListRow
          dense={pro}
          leading={
            // Como RowIcon, en rojo suave: lo único de la pantalla que no se deshace.
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
              <UserX className={icon} />
            </span>
          }
          title={<span className="text-danger">Borrar mi cuenta</span>}
          subtitle="No se puede deshacer"
          onClick={openDelete}
          trailing={opening.isBusy() ? <Spinner className="text-danger" /> : undefined}
          chevron={!opening.isBusy()}
        />
      </Card>
      {deleting && (
        <Suspense fallback={null}>
          <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} onDeleting={onDeleting} onDeleted={onDeleted} />
        </Suspense>
      )}
    </section>
  );
}
