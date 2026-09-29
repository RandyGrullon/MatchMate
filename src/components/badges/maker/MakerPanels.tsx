import { useMemo } from 'react';
import { Award, Gift, Plus } from 'lucide-react';
import { badgeLabel } from '../../../badges/visual';
import { usePlayers } from '../../../lib/data';
import { MAX_ACTIVE_DESIGNS, canMakeBadges, type LeagueBadge, type LeagueBadgesData } from '../../../lib/data/leagueBadges';
import { useLeagueCtx } from '../../../lib/league';
import { leagueSport } from '../../../sports/registry';
import { Button, Card } from '../../ui';
import { BadgeGrid, BadgeTile } from '../BadgeTile';
import { MakerModals, RecentAwards, useMaker } from './MakerHost';
import { designLook } from './look';

/**
 * Lo pesado de las insignias del creador fuera de Admin (se carga aparte desde LeagueMadeBadges.tsx): el estante
 * «Insignias de la liga» de la portada y las del creador en la página de un jugador.
 */

const holdersText = (n: number) => (n === 0 ? 'Nadie todavía' : n === 1 ? '1 la tiene' : `${n} la tienen`);

/**
 * «Insignias de la liga» (§6.2): los diseños activos a 64 px con cuántos la tienen, las últimas 5 que se dieron y,
 * para quien diseña y da, «Dar insignia» y «Nueva insignia». Es la puerta del creador para los miembros elegidos que
 * no son admins.
 */
export function MakerShelf({ data }: { data: LeagueBadgesData }) {
  const ctx = useLeagueCtx();
  const { lid, league } = ctx;
  const players = usePlayers(lid);
  const names = useMemo(() => new Map(players.data.map((p) => [p.id, p.name] as const)), [players.data]);
  const m = useMaker();
  const sport = leagueSport(league);
  const can = canMakeBadges(ctx);
  const active = data.designs.filter((d) => d.status === 'activa');

  return (
    <section aria-labelledby="insignias-liga" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="insignias-liga" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Award className="size-5 text-accent" aria-hidden="true" /> Insignias de la liga
        </h2>
        {can && active.length > 0 && (
          <Button size="sm" variant="primary" className="min-h-11" icon={<Gift className="size-4" />} onClick={() => m.openGive(null)}>
            Dar insignia
          </Button>
        )}
      </div>
      <Card className="flex flex-col gap-2 p-2">
        {active.length ? (
          <BadgeGrid>
            {active.map((d) => {
              const look = designLook(d, sport);
              return (
                <BadgeTile
                  key={d.id}
                  look={look}
                  name={d.name}
                  sub={holdersText(d.active)}
                  label={`${badgeLabel(d.name, look)}: ${holdersText(d.active)}`}
                  onOpen={() => m.openSheet(d)}
                />
              );
            })}
          </BadgeGrid>
        ) : (
          <p className="px-2 py-3 text-sm text-muted">Diseña la primera insignia de la liga: un campeón, la asistencia perfecta o la que ustedes quieran.</p>
        )}
        <RecentAwards awards={data.awards} designs={data.designs} names={names} sport={sport} tz={league.tz} onOpen={m.openSheet} className="border-t border-line pt-1" />
        {can && active.length < MAX_ACTIVE_DESIGNS && (
          <Button variant="ghost" className="min-h-11 self-start" icon={<Plus className="size-4" />} onClick={() => m.openEditor({ kind: 'new' })}>
            Nueva insignia
          </Button>
        )}
      </Card>
      <MakerModals m={m} data={data} />
    </section>
  );
}

/** Las insignias del creador de un jugador (su página en la liga; la vitrina de los que no tienen cuenta). */
export function PlayerMadeBadges({ playerId, data }: { playerId: string; data: LeagueBadgesData }) {
  const ctx = useLeagueCtx();
  const m = useMaker();
  const sport = leagueSport(ctx.league);
  const byId = new Map(data.designs.map((d) => [d.id, d] as const));
  // Una por diseño (×N si se la dieron varias veces), la más nueva arriba.
  const tiles = new Map<string, { badge: LeagueBadge; period: string; count: number }>();
  for (const a of data.awards) {
    const d = byId.get(a.badgeId);
    if (a.playerId !== playerId || a.revokedAt || a.hidden || !d || d.status === 'oculta') continue;
    const t = tiles.get(d.id);
    if (t) t.count++;
    else tiles.set(d.id, { badge: d, period: a.period, count: 1 });
  }
  if (!tiles.size) return null;
  return (
    <section aria-labelledby="jugador-insignias-liga" className="mt-5 flex flex-col gap-2">
      <h2 id="jugador-insignias-liga" className="flex items-center gap-2 text-lg font-bold tracking-tight">
        <Award className="size-5 text-accent" aria-hidden="true" /> De la liga
      </h2>
      <Card className="p-2">
        <BadgeGrid>
          {[...tiles.values()].map((t) => {
            const look = designLook(t.badge, sport, t.period);
            return (
              <BadgeTile
                key={t.badge.id}
                look={look}
                name={t.badge.name}
                sub={t.period || 'LIGA'}
                count={t.count}
                label={`${badgeLabel(t.badge.name, look)}${t.count > 1 ? `, ${t.count} veces` : ''}`}
                onOpen={() => m.openSheet(t.badge)}
              />
            );
          })}
        </BadgeGrid>
      </Card>
      <MakerModals m={m} data={data} />
    </section>
  );
}
