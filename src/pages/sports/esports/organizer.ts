import { useLeagueCtx } from '../../../lib/league';
import { useIsPro } from '../../../lib/useMode';

/**
 * Lo del organizador del torneo de esports: solo en Pro y si es admin de la liga (los permisos los decide la base). Sin
 * pantallas: lo usan parts.tsx de la web y la app del teléfono.
 */
export function useOrganizer(): boolean {
  const { isAdmin } = useLeagueCtx();
  return useIsPro() && isAdmin;
}
