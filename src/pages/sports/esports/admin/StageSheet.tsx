import { useMemo, useState } from 'react';
import { GitFork } from 'lucide-react';
import type { Match } from '../../../../lib/data/matches';
import { createStage, decideEntry, esportsErrorText, type EsportsEntry, type EsportsTournament, type StageLink } from '../../../../lib/data/esports';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { FORMAT_LABEL, minEntries, resolvePlan, type StagePlan } from '../../../../sports/esports';
import {
  LEAVE_OUT_LABEL,
  NO_CHECKIN_NOTE,
  checkinMissing,
  createStageLabel,
  missingHint,
  notEnoughText,
  planErrorText,
  planPreview,
  playoffsIntro,
  stageCreatedText,
  stageIntro,
  tryPlan,
} from './logic';
import { groupLetter } from '../../../../sports/formats';
import { StandingsTable } from '../../../../components/match';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { Button, Card, Sheet } from '../../../../components/ui';
import { ToggleRow } from '../../racket/bits';
import { EsportsBracket } from '../bracket/EsportsBracket';
import { entryBySideTeam, groupTablesOf, planFor, planFromStage, playoffsPlanFor, seedsFor, standingsColumns } from '../logic';
import { useEntryNames } from '../parts';

/**
 * «Armar el cuadro» (§12.8): el formato y cuántos entran, «Dejar fuera a los que no hicieron check-in» (los rechaza
 * antes de crear la fase), la vista previa (el cuadro sin resultados; en grupos, quién va en cada uno) y «Crear el
 * cuadro» → createStage. `playoffs`: las tablas finales de cada grupo y la vista previa de los playoffs.
 */
export function StageSheet({
  open,
  onClose,
  mode,
  t,
  entries,
  matches,
  links,
}: {
  open: boolean;
  onClose: () => void;
  mode: 'create' | 'playoffs';
  t: EsportsTournament;
  entries: readonly EsportsEntry[];
  matches: readonly Match[];
  links: readonly StageLink[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title={mode === 'create' ? 'Armar el cuadro' : 'Pasar a playoffs'} subtitle={FORMAT_LABEL[t.format]}>
      {open && (mode === 'create' ? <CreateBody t={t} entries={entries} onDone={onClose} /> : <PlayoffsBody t={t} entries={entries} matches={matches} links={links} onDone={onClose} />)}
    </Sheet>
  );
}

function CreateBody({ t, entries, onDone }: { t: EsportsTournament; entries: readonly EsportsEntry[]; onDone: () => void }) {
  const { lid } = useLeagueCtx();
  const { toast } = useFeedback();
  const busy = useBusy<'crear'>();
  const nameOf = useEntryNames(entries as EsportsEntry[]);
  const missing = checkinMissing(t, entries);
  const [leaveOut, setLeaveOut] = useState(false);
  const pool = leaveOut ? entries.filter((e) => !missing.includes(e)) : entries;
  const seeds = useMemo(() => seedsFor(pool as EsportsEntry[], t), [pool, t]);
  const { plan, error } = useMemo(() => tryPlan(() => planFor(t, seeds)), [t, seeds]);
  const min = minEntries(t.format);
  const enough = seeds.length >= min;
  const seedOf = (id: string) => seeds.indexOf(id) + 1 || null;

  const create = () =>
    busy.run('crear', async () => {
      if (!plan) return;
      try {
        for (const e of leaveOut ? missing : []) await decideEntry(e.id, false, NO_CHECKIN_NOTE);
        await createStage(lid, t.eventId, plan);
        toast(stageCreatedText(t.format));
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'cuadro'), 'error');
      }
    });

  return (
    <div className="flex flex-col gap-4 pb-1">
      <p className="mx-1 text-[15px] text-fg-2">{stageIntro(t.format, seeds.length)}</p>
      {missing.length > 0 && (
        <ToggleRow
          checked={leaveOut}
          onChange={setLeaveOut}
          label={LEAVE_OUT_LABEL}
          hint={missingHint(missing)}
        />
      )}
      {!enough ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">{notEnoughText(t.format)}</p>
      ) : error || !plan ? (
        <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">{planErrorText(error)}</p>
      ) : (
        <Preview plan={plan} nameOf={nameOf} seedOf={seedOf} />
      )}
      <Button variant="primary" size="lg" className="w-full" icon={<GitFork className="size-5" />} disabled={!enough || !plan} loading={busy.isBusy('crear')} onClick={() => void create()}>
        {createStageLabel(t.format)}
      </Button>
    </div>
  );
}

/** La vista previa: el cuadro (simple o doble), los grupos o cuántas series y jornadas tiene la liga. */
export function Preview({ plan, nameOf, seedOf }: { plan: StagePlan; nameOf: (id: string) => string; seedOf?: (id: string) => number | null }) {
  const preview = planPreview(plan);
  if (preview.kind === 'bracket') {
    return <EsportsBracket matches={resolvePlan(plan, {})} nameOf={nameOf} seedOf={seedOf} />;
  }
  if (preview.kind === 'league') {
    return <p className="rounded-2xl bg-accent-soft px-4 py-3.5 text-[15px] text-fg-2">{preview.text}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="mx-1 text-[13.5px] text-muted">{preview.text}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {preview.groups.map(({ group: g, ids }) => (
          <Card key={g} className="px-4 py-3">
            <p className="text-[13px] font-bold tracking-[0.06em] text-muted uppercase">{`Grupo ${groupLetter(g)}`}</p>
            <ol className="mt-1.5 flex flex-col gap-1">
              {ids.map((id) => (
                <li key={id} className="truncate text-[15px] font-semibold">
                  {nameOf(id)}
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PlayoffsBody({ t, entries, matches, links, onDone }: { t: EsportsTournament; entries: readonly EsportsEntry[]; matches: readonly Match[]; links: readonly StageLink[]; onDone: () => void }) {
  const { lid } = useLeagueCtx();
  const { toast } = useFeedback();
  const busy = useBusy<'crear'>();
  const now = useNow().getTime();
  const nameOf = useEntryNames(entries as EsportsEntry[]);
  const entryOf = useMemo(() => entryBySideTeam(entries), [entries]);
  const groups = useMemo(() => planFromStage('groups', matches as Match[], links, entryOf), [matches, links, entryOf]);
  const tables = useMemo(() => groupTablesOf(t.game, groups, matches as Match[], entryOf, now, t.eventId), [t.game, groups, matches, entryOf, now, t.eventId]);
  const { plan, error } = useMemo(() => tryPlan(() => playoffsPlanFor(t, tables.map((g) => g.rows.map((r) => r.id)))), [t, tables]);
  const columns = standingsColumns(t.game);
  const create = () =>
    busy.run('crear', async () => {
      if (!plan) return;
      try {
        await createStage(lid, t.eventId, plan);
        toast('Playoffs creados');
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'cuadro'), 'error');
      }
    });
  return (
    <div className="flex flex-col gap-4 pb-1">
      <p className="mx-1 text-[15px] text-fg-2">{playoffsIntro(t.settings.perGroup)}</p>
      {tables.map((g, i) => (
        <div key={i} className="flex flex-col gap-2">
          <p className="mx-1 text-[13px] font-bold tracking-[0.06em] text-muted uppercase">{`Grupo ${groupLetter(i)}`}</p>
          <StandingsTable rows={g.rows} nameOf={nameOf} columns={columns} highlight={g.rows.slice(0, t.settings.perGroup).map((r) => r.id)} />
        </div>
      ))}
      {error || !plan ? <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">{error ?? 'No se pudo armar.'}</p> : <Preview plan={plan} nameOf={nameOf} />}
      <Button variant="primary" size="lg" className="w-full" icon={<GitFork className="size-5" />} disabled={!plan} loading={busy.isBusy('crear')} onClick={() => void create()}>
        Crear los playoffs
      </Button>
    </div>
  );
}
