import { useMemo } from 'react';
import { todayIn } from '../../../../badges/rules/periods';
import type { RacketEvent } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { nightProvider, racketNightComp } from '../../../../prizes/sports';
import type { StandingRow } from '../../../../sports/types';
import { NIGHT_WAIT_TEXT, nightReady, nightWarnings } from '../../../../components/prizes/screens';
import { TournamentPrizes } from '../../../../components/prizes/TournamentPrizes';
import { useRacket } from '../sport';

/**
 * «Premios del torneo» de una noche de americano o mexicano o del round robin social del pickleball (docs/premios-
 * torneo.md §5.2): solo individual. El podio lo arma el teléfono con la tabla de la noche (los 3 primeros que jugaron);
 * el servidor revisa que cada uno haya jugado y que nadie se lo entregue a sí mismo. Se entrega desde el día del evento
 * (lo mejor es cuando termina: mientras tanto, un aviso).
 */
export function NightPrizes({ event, table, finished, nameOf }: { event: RacketEvent; table: readonly StandingRow[]; finished: boolean; nameOf: (playerId: string) => string }) {
  const { lid, league } = useLeagueCtx();
  const { sport } = useRacket();
  const now = useNow(60_000).getTime();
  const comp = useMemo(() => racketNightComp(lid, event, sport), [lid, event, sport]);
  const podium = useMemo(() => nightProvider(table, nameOf), [table, nameOf]);
  if (!comp) return null;
  const ready = nightReady(event.date, todayIn(now, league.tz));
  return <TournamentPrizes comp={comp} ready={ready} waitText={NIGHT_WAIT_TEXT} podium={podium} warnings={nightWarnings(finished)} />;
}
