import { useMemo } from 'react';
import { Award, ChevronDown, Gift, Plus } from 'lucide-react';
import { usePlayers } from '../../../lib/data';
import { MAX_ACTIVE_DESIGNS, canMakeBadges, useLeagueBadges, type LeagueBadge } from '../../../lib/data/leagueBadges';
import { useLeagueCtx } from '../../../lib/league';
import { leagueSport } from '../../../sports/registry';
import { Button, Card, Empty, ListSkeleton, LoadError } from '../../ui';
import { Chip } from './parts';
import { DesignRow, MakerModals, RecentAwards, useMaker, type MakerState } from './MakerHost';
import { templateName, templatesFor } from './templates';
import { FULL_DESIGNS_TEXT, activeTitle, archivedTitle, designGroups, hasGiven, makerIntro, policyLine } from './view';

/**
 * Admin › «Insignias» (docs/insignias.md §6.5): los diseños de la liga (activos, archivados y los escondidos por
 * moderación), «Nueva insignia», «Dar insignia», las últimas que se dieron y, al tocar una, quién la tiene y qué se
 * puede hacer con ella. Solo para quien diseña y da insignias (`private.can_badges`).
 */
export default function MakerAdmin() {
  const ctx = useLeagueCtx();
  const { lid, league } = ctx;
  const data = useLeagueBadges(lid);
  const players = usePlayers(lid);
  const m = useMaker();
  const sport = leagueSport(league);
  const names = useMemo(() => new Map(players.data.map((p) => [p.id, p.name] as const)), [players.data]);
  const can = canMakeBadges(ctx);
  const { designs } = data.data;
  const { active, archived, hidden } = designGroups(designs);
  const policy = policyLine(league, ctx.isOwner);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Award className="size-5 text-accent" aria-hidden="true" /> Insignias de la liga
        </h2>
        <p className="text-sm text-muted">{makerIntro(league.name)}</p>
      </div>

      {can && (
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" variant="primary" icon={<Plus className="size-4" />} disabled={active.length >= MAX_ACTIVE_DESIGNS} onClick={() => m.openEditor({ kind: 'new' })}>
            Nueva insignia
          </Button>
          <Button className="min-h-11" icon={<Gift className="size-4" />} disabled={!active.length} onClick={() => m.openGive(null)}>
            Dar insignia
          </Button>
        </div>
      )}
      {can && active.length >= MAX_ACTIVE_DESIGNS && <p className="text-xs text-muted">{FULL_DESIGNS_TEXT}</p>}

      {data.error ? (
        <LoadError error={data.error} />
      ) : data.loading && !designs.length ? (
        <ListSkeleton rows={3} />
      ) : !designs.length ? (
        <MakerEmpty can={can} kind={league.kind} sport={sport} m={m} />
      ) : (
        <>
          <DesignList title={activeTitle(active.length)} list={active} sport={sport} onOpen={m.openSheet} empty="No hay insignias activas." />
          {hasGiven(data.data.awards) && (
            <section aria-labelledby="ultimas-dadas" className="flex flex-col gap-1.5">
              <h3 id="ultimas-dadas" className="text-sm font-semibold">
                Las últimas que se dieron
              </h3>
              <Card className="p-2">
                <RecentAwards awards={data.data.awards} designs={designs} names={names} sport={sport} tz={league.tz} onOpen={m.openSheet} />
              </Card>
            </section>
          )}
          {archived.length > 0 && (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold">
                <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                {archivedTitle(archived.length)}
              </summary>
              <DesignList list={archived} sport={sport} onOpen={m.openSheet} />
            </details>
          )}
          {hidden.length > 0 && <DesignList title="Escondidas por moderación" list={hidden} sport={sport} onOpen={m.openSheet} />}
        </>
      )}

      {policy && (
        <p className="text-xs text-muted">
          Las diseñan y las dan: <b className="text-fg">{policy.who}</b>. {policy.text}
        </p>
      )}

      <MakerModals m={m} data={data.data} />
    </div>
  );
}

function DesignList({ title, list, sport, onOpen, empty }: { title?: string; list: readonly LeagueBadge[]; sport: string; onOpen: (b: LeagueBadge) => void; empty?: string }) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}
      {list.length ? (
        <Card className="divide-y divide-line overflow-hidden">
          {list.map((b) => (
            <DesignRow key={b.id} badge={b} sport={sport} reports onOpen={() => onOpen(b)} />
          ))}
        </Card>
      ) : (
        empty && <p className="text-sm text-muted">{empty}</p>
      )}
    </section>
  );
}

/** Sin diseños todavía: las plantillas para arrancar. */
export function MakerEmpty({ can, kind, sport, m }: { can: boolean; kind?: string; sport: string; m: Pick<MakerState, 'openEditor'> }) {
  return (
    <Empty icon={<Award className="size-8" />} title="Todavía no hay insignias de la liga">
      {can ? (
        <div className="flex flex-col items-center gap-3">
          <span>Empieza con una plantilla o diseña la tuya desde cero.</span>
          <div className="flex flex-wrap justify-center gap-1.5">
            {templatesFor(kind)
              .slice(0, 6)
              .map((t) => (
                <Chip key={t.key} on={false} onClick={() => m.openEditor({ kind: 'new', template: t.key })}>
                  {templateName(t.key, sport, kind === 'torneo')}
                </Chip>
              ))}
          </div>
        </div>
      ) : (
        'Cuando la liga cree insignias, salen aquí.'
      )}
    </Empty>
  );
}
