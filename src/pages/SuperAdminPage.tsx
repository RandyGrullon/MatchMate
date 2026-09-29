import { Navigate, useParams, useSearchParams } from 'react-router';
import { useAuth } from '../lib/auth';
import { Loading } from '../components/ui';
import { Console } from './superadmin/Console';
import { sectionFromParam } from './superadmin/sections';

/**
 * Consola del dueño de la app (solo superadmin): /superadmin y /superadmin/<sección>.
 * Resumen, cuentas, ligas y torneos, deportes, anuncios, lectura de fotos, sistema (con el respaldo completo),
 * auditoría, marca e insignias (la galería). Las piezas viven en src/pages/superadmin/. Los demás vuelven a Eventos.
 */
export default function SuperAdminPage() {
  const auth = useAuth();
  const { section: param } = useParams();
  const [params] = useSearchParams();

  if (auth.loading) return <Loading />;
  if (!auth.isSuper) return <Navigate to="/ligas" replace />;
  // Links de antes: /superadmin?tab=cuentas.
  if (!param && params.get('tab') === 'cuentas') return <Navigate to="/superadmin/cuentas" replace />;
  const section = sectionFromParam(param);
  if (!section) return <Navigate to="/superadmin" replace />;
  return <Console section={section} />;
}
