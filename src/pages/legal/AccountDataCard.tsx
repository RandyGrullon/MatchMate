import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Download, ScrollText, ShieldCheck, UserX } from 'lucide-react';
import { useFeedback } from '../../components/feedback';
import { useBusy } from '../../components/busy';
import { Button, Card } from '../../components/ui';
import { accountErrorMessage, downloadMyData } from './account';
import { PRIVACY_PATH, TERMS_PATH } from './legal';

const loadDialog = () => import('./DeleteAccountDialog');
const DeleteAccountDialog = lazy(loadDialog);

/**
 * Configuración › Tus datos (Ley 172-13): la política de privacidad y los términos, «Descargar mis datos» (un
 * JSON con todo lo de la cuenta) y «Borrar mi cuenta» (con el traspaso guiado de las ligas a su nombre).
 */
export function AccountDataCard({ onDeleting, onDeleted }: { onDeleting?: (deleting: boolean) => void; onDeleted: () => void }) {
  const { toast } = useFeedback();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // La primera vez se baja el diálogo (sin señal tarda): «Borrar mi cuenta» da vueltas mientras.
  const opening = useBusy();

  function openDelete() {
    // Si no se pudo bajar, se abre igual: la pantalla de error dice que hay que actualizar (como antes).
    void opening.run('abrir', () => loadDialog().catch(() => undefined)).then(() => setDeleting(true));
  }

  async function exportData() {
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

  const row = 'flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm font-medium transition hover:bg-surface-2';
  return (
    <section className="flex flex-col gap-2" aria-labelledby="tus-datos">
      <h2 id="tus-datos" className="text-sm font-semibold text-muted">
        Tus datos
      </h2>
      <Card className="divide-y divide-line overflow-hidden">
        <Link to={PRIVACY_PATH} className={row}>
          <ShieldCheck className="size-5 text-accent" aria-hidden="true" />
          <span className="flex-1">Política de privacidad</span>
          <ChevronRight className="size-4 text-muted" aria-hidden="true" />
        </Link>
        <Link to={TERMS_PATH} className={row}>
          <ScrollText className="size-5 text-accent" aria-hidden="true" />
          <span className="flex-1">Términos de uso</span>
          <ChevronRight className="size-4 text-muted" aria-hidden="true" />
        </Link>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-sm text-muted">
            Baja un archivo con todo lo de tu cuenta (perfil, ligas, jugadores y resultados), o borra tu cuenta para siempre.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="size-4" />} loading={exporting} onClick={exportData} className="max-sm:h-11">
              Descargar mis datos
            </Button>
            <Button variant="ghost" icon={<UserX className="size-4" />} loading={opening.isBusy()} onClick={openDelete} className="text-danger max-sm:h-11">
              Borrar mi cuenta
            </Button>
          </div>
        </div>
      </Card>
      {deleting && (
        <Suspense fallback={null}>
          <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} onDeleting={onDeleting} onDeleted={onDeleted} />
        </Suspense>
      )}
    </section>
  );
}
