import { useLayoutEffect } from 'react';
import { Navigate, useParams } from 'react-router';
import { parseActiveSport, setActiveSport } from '../lib/sportContext';

/**
 * `/d/:sport` (rediseño «Calma y foco»: hay un solo inicio). Ya no es una pantalla aparte: la app se queda en ese deporte
 * (el filtro de Ligas y el color) y va a Hoy (`/`), que muestra lo de todos tus deportes. Los links viejos (avisos,
 * favoritos, el selector de deporte) siguen sirviendo. La ruta (App.tsx) ya pone el deporte antes de pintar; aquí se
 * repite por si se llega sin pasar por ella.
 */
export default function SportHomePage() {
  const params = useParams();
  const sport = parseActiveSport(params.sport);
  useLayoutEffect(() => {
    if (sport) setActiveSport(sport);
  }, [sport]);
  return <Navigate to="/" replace />;
}
