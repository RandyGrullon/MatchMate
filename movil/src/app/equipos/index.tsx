import { SquadsHome } from '@/components/squads/SquadsHome';

/** Equipos (`/equipos`, SquadsPage de la web). `?crear=1` abre «Crear equipo» (con `?deporte=`, ese deporte ya elegido). */
export default function SquadsRoute() {
  return <SquadsHome />;
}
