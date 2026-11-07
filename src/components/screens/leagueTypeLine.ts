import { sportMeta } from '../../sports/registry';

/**
 * «Boliche · Liga pública», «Pádel · Liga privada», «Boliche · Torneo»: la línea debajo del nombre en las pantallas de
 * entrar a una liga (InviteBits.tsx en la web; /anotar/<código> en el teléfono). Sin React: la usa también la app.
 */
export function leagueTypeLine(sport: string | null | undefined, kind: string | null | undefined, visibility: string | null | undefined): string {
  const word = kind === 'torneo' ? 'Torneo' : visibility === 'public' ? 'Liga pública' : 'Liga privada';
  const meta = sportMeta(sport);
  return meta ? `${meta.short} · ${word}` : word;
}
