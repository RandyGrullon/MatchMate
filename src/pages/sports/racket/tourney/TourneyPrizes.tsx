import { useMemo } from 'react';
import { Insignia } from '../../../../badges/visual';
import type { Match } from '../../../../lib/data/matches';
import { useLeagueBadges } from '../../../../lib/data/leagueBadges';
import { useTournamentPrize } from '../../../../lib/data/prizes';
import type { RacketEvent } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { racketTourneyComp, racketTourneyPlace, racketTourneyProvider } from '../../../../prizes/sports';
import { designLook } from '../../../../components/badges/maker/look';
import { TournamentPrizes } from '../../../../components/prizes/TournamentPrizes';
import { cx } from '../../../../components/ui';
import type { TourneyConfig } from '../logic/tourney';
import type { Names } from '../names';
import { useRacket } from '../sport';

/**
 * «Premios del torneo» del torneo de raqueta por categorías (docs/premios-torneo.md §5.2): una sección por categoría,
 * «Parejas · Categoría A» en dobles o «Individual · Categoría A» en singles. El podio lo calcula el servidor con el
 * cuadro de cada categoría; el de aquí (la misma cuenta) es para «Por ahora» y el aviso «El podio cambió».
 */
export function TourneyPrizes({ event, cfg, matches, names, now }: { event: RacketEvent; cfg: TourneyConfig; matches: readonly Match[]; names: Names; now: number }) {
  const { lid } = useLeagueCtx();
  const { sport, leagueRules } = useRacket();
  const comp = useMemo(() => racketTourneyComp(lid, event, { sport, leagueRules, categories: cfg.categories }), [lid, event, sport, leagueRules, cfg.categories]);
  const who = useMemo(() => ({ nameOf: names.nameOf, rosterOf: names.rosterOf }), [names]);
  const podium = useMemo(() => racketTourneyProvider(cfg.categories, matches, who, now), [cfg.categories, matches, who, now]);
  // Se prende con la primera final que cuenta: cada categoría se entrega cuando cuenta la suya (la base lo revisa).
  const ready = cfg.categories.some((c) => racketTourneyPlace(c, 1, matches, who, now).status !== 'sin_resultado');
  return <TournamentPrizes comp={comp} ready={ready} waitText="Se entregan cuando cuente la final de la categoría" podium={podium} />;
}

/** «Se lleva: [insignia] Campeón» junto al podio de una categoría (si esa categoría tiene premio de 1.er lugar). */
export function CategoryPrize({ eventId, catId, className }: { eventId: string; catId: string; className?: string }) {
  const { lid, league, member } = useLeagueCtx();
  const { sport } = useRacket();
  // En una liga con menores, las insignias de la liga las ven solo sus miembros.
  const hide = !!league.hasMinors && !member;
  const prize = useTournamentPrize(hide ? null : lid, 'evento', eventId);
  const slot = prize.data?.slots.find((s) => s.division === catId && s.place === 1) ?? null;
  const made = useLeagueBadges(slot ? lid : null);
  const design = slot ? made.data.designs.find((d) => d.id === slot.badgeId && d.status !== 'oculta') : undefined;
  if (!slot || !design) return null;
  return (
    <div className={cx('flex items-center gap-2 text-sm', className)}>
      <Insignia badge={designLook(design, sport, prize.data?.period)} size={40} />
      <span className="min-w-0 truncate text-muted">
        {slot.deliveredAt ? 'Se llevó' : 'Se lleva'}: <b className="font-semibold text-fg">{design.name}</b>
      </span>
    </div>
  );
}
