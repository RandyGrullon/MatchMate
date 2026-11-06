import { useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { League } from '../../lib/types';
import { useJoinFlow } from '../league/WhoAreYou';

export { AHEAD_DAYS, useActivity, useMyLeagues, type Activity } from './activity';

/**
 * «Unirme» a una liga pública desde una lista: sin cuenta va a entrar; si la liga tiene jugadores sin cuenta, primero
 * «¿Quién eres?» (el mismo camino que la tarjeta de la liga: useJoinFlow); si sale bien, a la liga. `modal` va una
 * vez en la pantalla de la lista.
 */
export function useJoin(): { joining: string | null; join: (l: League) => Promise<void>; modal: ReactNode } {
  const navigate = useNavigate();
  const flow = useJoinFlow((t) => navigate(`/l/${t.lid}`));
  const { start } = flow;
  const join = useCallback((l: League) => start({ lid: l.id, name: l.name, sport: l.sport, kind: l.kind }), [start]);
  return { joining: flow.busy, join, modal: flow.modal };
}
