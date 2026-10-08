import { useMemo, useState } from 'react';
import { ArrowLeft, Scale, UserPlus } from 'lucide-react';
import { assignFreeAgent, esportsErrorText, formTeams, type EsportsEntry, type EsportsTournament } from '../../../../lib/data/esports';
import { balanceTeams, modeSize, type BalancedTeam } from '../../../../sports/esports';
import { RankChip } from '../../../../components/esports/bits';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { Button, Card, ListRow, Sheet } from '../../../../components/ui';
import { competitors, freeAgents, memberOrdinal, memberRank, rosterCount, teamRoom } from '../logic';
import { Initials } from '../parts';

/**
 * Los agentes libres de un torneo «Libre» con modo de equipo (§5.1, §12.8): cada uno con su rango; «Balancear por
 * rango» muestra los equipos que saldrían (serpiente por rango, con la fuerza de cada uno) y «Crear estos equipos» los
 * inscribe (formTeams); o se toca uno y «Sumar a…» lo pone en un equipo inscrito con lugar (assignFreeAgent).
 */
export function FreeAgentsSheet({ open, onClose, t, entries }: { open: boolean; onClose: () => void; t: EsportsTournament; entries: readonly EsportsEntry[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="Agentes libres" subtitle={`Equipos de ${modeSize(t.mode)}`}>
      {open && <Body t={t} entries={entries} onDone={onClose} />}
    </Sheet>
  );
}

type View = { kind: 'list' } | { kind: 'balance' } | { kind: 'assign'; agent: EsportsEntry };

function Body({ t, entries, onDone }: { t: EsportsTournament; entries: readonly EsportsEntry[]; onDone: () => void }) {
  const { toast } = useFeedback();
  const busy = useBusy<string>();
  const [view, setView] = useState<View>({ kind: 'list' });
  const agents = freeAgents(entries);
  const size = modeSize(t.mode);
  const userOf = (e: EsportsEntry) => e.members[0]?.userId ?? e.captainId ?? e.id;
  const byUser = useMemo(() => new Map(agents.map((a) => [userOf(a), a])), [agents]);
  const balanced = useMemo(
    () =>
      balanceTeams(
        agents.map((a) => ({ userId: userOf(a), ordinal: memberOrdinal(t.game, t.mode, a.members[0]?.ranks) })),
        { teamSize: size, subs: t.settings.subs, seed: t.eventId },
      ),
    [agents, t, size],
  );
  const taken = entries.filter((e) => /^Equipo \d+$/.test(e.name)).length;
  const teamsWithRoom = competitors(entries).filter((e) => e.kind === 'team' && teamRoom(e, t.mode, t.settings.subs) > 0);

  const create = () =>
    busy.run('crear', async () => {
      try {
        await formTeams(
          t.eventId,
          balanced.teams.map((team: BalancedTeam, i) => ({ name: `Equipo ${taken + i + 1}`, members: team.members.map((m) => ({ userId: m.userId, role: m.role })) })),
        );
        toast(`${balanced.teams.length} ${balanced.teams.length === 1 ? 'equipo creado' : 'equipos creados'}`);
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  const assign = (agent: EsportsEntry, team: EsportsEntry) =>
    busy.run(team.id, async () => {
      const { starters } = rosterCount(team.members);
      try {
        await assignFreeAgent(agent.id, team.id, starters < size ? 'member' : 'sub');
        toast(`${agent.name} quedó en ${team.name}`);
        setView({ kind: 'list' });
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });

  if (!agents.length) return <p className="pb-2 text-sm text-muted">No hay agentes libres por ahora.</p>;

  if (view.kind === 'balance') {
    return (
      <div className="flex flex-col gap-4 pb-1">
        <BackLine onBack={() => setView({ kind: 'list' })} />
        {balanced.teams.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">{`Hacen falta al menos ${size} agentes para armar un equipo.`}</p>
        ) : (
          balanced.teams.map((team, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="flex items-baseline justify-between gap-3 px-5 pt-3.5 pb-1">
                <p className="text-[15px] font-[650]">{`Equipo ${taken + i + 1}`}</p>
                <p className="text-[13px] text-muted">{team.strength == null ? 'Sin rango' : `Fuerza ${team.strength}`}</p>
              </div>
              {team.members.map((m) => {
                const a = byUser.get(m.userId);
                return (
                  <ListRow
                    key={m.userId}
                    dense
                    leading={<Initials name={a?.name ?? '?'} className="size-9" />}
                    title={a?.name ?? m.userId}
                    subtitle={<RankChip game={t.game} rank={memberRank(t.game, t.mode, a?.members[0]?.ranks)} source={a?.members[0]?.rankSource} />}
                    trailing={<span className="text-[12px] font-semibold text-muted">{m.role === 'captain' ? 'Capitán' : m.role === 'sub' ? 'Suplente' : 'Titular'}</span>}
                  />
                );
              })}
            </Card>
          ))
        )}
        {balanced.leftover.length > 0 && (
          <p className="mx-1 text-[13.5px] text-muted">{`Sin equipo: ${balanced.leftover.map((u) => byUser.get(u)?.name ?? u).join(', ')}.`}</p>
        )}
        <Button variant="primary" size="lg" className="w-full" disabled={!balanced.teams.length} loading={busy.isBusy('crear')} onClick={() => void create()}>
          Crear estos equipos
        </Button>
      </div>
    );
  }

  if (view.kind === 'assign') {
    const agent = view.agent;
    return (
      <div className="flex flex-col gap-4 pb-1">
        <BackLine onBack={() => setView({ kind: 'list' })} />
        <p className="mx-1 text-[15px] font-semibold">{`Sumar a ${agent.name} a…`}</p>
        {teamsWithRoom.length ? (
          <Card className="overflow-hidden">
            {teamsWithRoom.map((team) => {
              const room = teamRoom(team, t.mode, t.settings.subs);
              return (
                <ListRow
                  key={team.id}
                  title={team.name}
                  subtitle={`${team.members.length} en la plantilla · ${room} ${room === 1 ? 'lugar' : 'lugares'}`}
                  onClick={() => void assign(agent, team)}
                  trailing={busy.isBusy(team.id) ? <span className="text-[13px] text-muted">Sumando…</span> : undefined}
                />
              );
            })}
          </Card>
        ) : (
          <p className="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm text-muted">Ningún equipo inscrito tiene lugar.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-1">
      <Card className="overflow-hidden">
        {agents.map((a) => (
          <ListRow
            key={a.id}
            leading={<Initials name={a.name} />}
            title={a.name}
            subtitle={
              <span className="flex flex-wrap items-center gap-x-1.5">
                {a.members[0]?.gamerTag && <span>{a.members[0].gamerTag}</span>}
                <RankChip game={t.game} rank={memberRank(t.game, t.mode, a.members[0]?.ranks)} source={a.members[0]?.rankSource} />
              </span>
            }
            onClick={() => setView({ kind: 'assign', agent: a })}
            ariaLabel={`Sumar a ${a.name} a un equipo`}
          />
        ))}
      </Card>
      <Button variant="primary" size="lg" className="w-full" icon={<Scale className="size-5" />} onClick={() => setView({ kind: 'balance' })}>
        Balancear por rango
      </Button>
      {teamsWithRoom.length > 0 && (
        <p className="mx-1 inline-flex items-center gap-1.5 text-[13.5px] text-muted">
          <UserPlus aria-hidden="true" className="size-4" />
          Toca uno para sumarlo a un equipo con lugar.
        </p>
      )}
    </div>
  );
}

function BackLine({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start text-meta font-[550] text-accent">
      <ArrowLeft aria-hidden="true" className="size-4" />
      Agentes libres
    </button>
  );
}
