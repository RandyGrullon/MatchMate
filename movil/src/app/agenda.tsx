import { AgendaScreen } from '@/components/agenda/Agenda';

/**
 * El Calendario (`/agenda`, AgendaPage de la web): tus ligas semana por semana y lo abierto en las ligas públicas
 * («¿Dónde juego esta semana?»), con `?ver=mias`, `?deporte=`, `?dia=` y `?apuntar=` como en la web.
 */
export default function AgendaRoute() {
  return <AgendaScreen />;
}
