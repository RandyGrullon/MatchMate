/**
 * Lo del organizador para armar el torneo (admin/SeedSheet, StageSheet y FreeAgentsSheet de la web, con su misma
 * lógica: logic.ts y admin/logic.ts):
 * - «Siembra»: los aprobados en orden con flechas, «Al azar» o «Por rango», y «Guardar la siembra» (setSeeds).
 * - «Armar el cuadro»: el formato y cuántos entran, «Dejar fuera a los que no hicieron check-in», la vista previa (el
 *   cuadro sin resultados; en grupos, quién va en cada uno; en liga, cuántas series) y «Crear el cuadro» (createStage).
 * - «Pasar a playoffs»: las tablas finales de cada grupo y la vista previa de los playoffs.
 * - «Agentes libres»: cada uno con su rango; «Balancear por rango» (los equipos que saldrían con su fuerza → «Crear
 *   estos equipos») o tocar uno y «Sumar a…» un equipo inscrito con lugar.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, GitFork, Scale, Shuffle, UserPlus } from 'lucide-react-native';
import type { Match } from '@mm/lib/data/matches';
import { assignFreeAgent, createStage, decideEntry, esportsErrorText, formTeams, setSeeds, type EsportsEntry, type EsportsTournament, type StageLink } from '@mm/lib/data/esports';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { FORMAT_LABEL, modeSize, resolvePlan, type StagePlan } from '@mm/sports/esports';
import { groupLetter } from '@mm/sports/formats/groups';
import { competitors, entryBySideTeam, freeAgents, groupTablesOf, memberRank, memberRoleText, planFor, planFromStage, playoffsPlanFor, seedsFor, standingsColumns, teamRoom } from '@mm/pages/sports/esports/logic';
import {
  LEAVE_OUT_LABEL,
  NO_CHECKIN_NOTE,
  agentUserOf,
  assignRoleFor,
  balanceAgents,
  checkinMissing,
  createStageLabel,
  formedTeamName,
  formedTeamsCount,
  leftoverText,
  missingHint,
  moveSeed,
  notEnoughAgentsText,
  notEnoughText,
  planErrorText,
  planPreview,
  playoffsIntro,
  randomSeedOrder,
  rankSeedOrder,
  roomLine,
  seedStrength,
  stageCreatedText,
  stageIntro,
  strengthText,
  teamsCreatedText,
  teamsWithRoom,
  tryPlan,
} from '@mm/pages/sports/esports/admin/logic';
import { minEntries } from '@mm/sports/esports';
import { useEntryNames } from '@mm/pages/sports/esports/tournamentData';
import { StandingsTable } from '../match/StandingsTable';
import { toast } from '../feedback';
import { Button, Card, ListRow, Sheet, Txt } from '../ui';
import { EsportsBracket } from './Bracket';
import { Initials, RankChip } from './bits';
import { GrayNote, SoftNote } from './fields';
import { ToggleRow } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

// ---------- Siembra ----------

export function SeedSheet({ open, onClose, t, entries }: { open: boolean; onClose: () => void; t: EsportsTournament; entries: readonly EsportsEntry[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="Siembra" subtitle="El 1 es el mejor sembrado">
      {open && <SeedBody t={t} entries={entries} onDone={onClose} />}
    </Sheet>
  );
}

function SeedBody({ t, entries, onDone }: { t: EsportsTournament; entries: readonly EsportsEntry[]; onDone: () => void }) {
  const c = useColors();
  const list = competitors(entries);
  const byId = new Map(list.map((e) => [e.id, e]));
  const [order, setOrder] = useState<string[]>(() => seedsFor(entries, t));
  const [shuffles, setShuffles] = useState(0);
  const [busy, setBusy] = useState(false);
  const random = () => {
    const n = shuffles + 1;
    setShuffles(n);
    setOrder(randomSeedOrder(list, t, n));
  };
  async function save() {
    setBusy(true);
    try {
      await setSeeds(t.eventId, order);
      toast('Siembra guardada');
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'cuadro'), 'error');
    } finally {
      setBusy(false);
    }
  }
  if (!list.length) {
    return (
      <Txt variant="meta" tone="muted">
        Todavía no hay aprobados para sembrar.
      </Txt>
    );
  }
  const arrow = (label: string, off: boolean, onPress: () => void, child: ReactNode) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={off} onPress={onPress} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', opacity: off ? 0.3 : 1 }}>
      {child}
    </Pressable>
  );
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="lg" style={{ flex: 1 }} icon={<Shuffle size={20} color={c.fg} />} onPress={random}>
          Al azar
        </Button>
        <Button size="lg" style={{ flex: 1 }} icon={<BarChart3 size={20} color={c.fg} />} onPress={() => setOrder(rankSeedOrder(list, t))}>
          Por rango
        </Button>
      </View>
      <Card padded={false}>
        {order.map((id, i) => {
          const e = byId.get(id);
          const s = e ? seedStrength(e, t) : null;
          return (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingLeft: 16, paddingRight: 8, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}>
              <Txt tone="muted" style={{ width: 24, textAlign: 'center', fontSize: 15, fontFamily: font.bold }}>
                {i + 1}
              </Txt>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                  {e?.name ?? '—'}
                </Txt>
                <Txt tone="muted" style={{ fontSize: 12.5 }}>
                  {strengthText(s)}
                </Txt>
              </View>
              {arrow(`Subir a ${e?.name ?? ''}`, i === 0, () => setOrder((o) => moveSeed(o, i, -1)), <ArrowUp size={20} color={c.fg2} />)}
              {arrow(`Bajar a ${e?.name ?? ''}`, i === order.length - 1, () => setOrder((o) => moveSeed(o, i, 1)), <ArrowDown size={20} color={c.fg2} />)}
            </View>
          );
        })}
      </Card>
      <Button variant="primary" size="lg" full loading={busy} onPress={save}>
        Guardar la siembra
      </Button>
    </View>
  );
}

// ---------- Armar el cuadro y pasar a playoffs ----------

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
  const c = useColors();
  const { lid } = useLeagueCtx();
  const nameOf = useEntryNames(entries as EsportsEntry[]);
  const missing = checkinMissing(t, entries);
  const [leaveOut, setLeaveOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const pool = leaveOut ? entries.filter((e) => !missing.includes(e)) : entries;
  const seeds = seedsFor(pool as EsportsEntry[], t);
  const { plan, error } = tryPlan(() => planFor(t, seeds));
  const enough = seeds.length >= minEntries(t.format);
  const seedOf = (id: string) => seeds.indexOf(id) + 1 || null;

  async function create() {
    if (!plan) return;
    setBusy(true);
    try {
      for (const e of leaveOut ? missing : []) await decideEntry(e.id, false, NO_CHECKIN_NOTE);
      await createStage(lid, t.eventId, plan);
      toast(stageCreatedText(t.format));
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'cuadro'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Txt tone="fg2" style={{ fontSize: 15, marginHorizontal: 4 }}>
        {stageIntro(t.format, seeds.length)}
      </Txt>
      {missing.length > 0 && <ToggleRow checked={leaveOut} onChange={setLeaveOut} label={LEAVE_OUT_LABEL} hint={missingHint(missing)} />}
      {!enough ? <GrayNote>{notEnoughText(t.format)}</GrayNote> : error || !plan ? <GrayNote>{planErrorText(error)}</GrayNote> : <Preview plan={plan} nameOf={nameOf} seedOf={seedOf} />}
      <Button variant="primary" size="lg" full icon={<GitFork size={20} color={c.accentFg} />} disabled={!enough || !plan} loading={busy} onPress={create}>
        {createStageLabel(t.format)}
      </Button>
    </View>
  );
}

/** La vista previa: el cuadro (simple o doble), los grupos o cuántas series y jornadas tiene la liga. */
function Preview({ plan, nameOf, seedOf }: { plan: StagePlan; nameOf: (id: string) => string; seedOf?: (id: string) => number | null }) {
  const c = useColors();
  const preview = planPreview(plan);
  if (preview.kind === 'bracket') return <EsportsBracket matches={resolvePlan(plan, {})} nameOf={nameOf} seedOf={seedOf} />;
  if (preview.kind === 'league') return <SoftNote>{preview.text}</SoftNote>;
  return (
    <View style={{ gap: 12 }}>
      <Txt tone="muted" style={{ fontSize: 13.5, marginHorizontal: 4 }}>
        {preview.text}
      </Txt>
      {preview.groups.map(({ group, ids }) => (
        <Card key={group} style={{ paddingVertical: 12, gap: 6 }}>
          <Txt tone="muted" style={{ fontSize: 13, fontFamily: font.bold, letterSpacing: 0.8, textTransform: 'uppercase' }}>{`Grupo ${groupLetter(group)}`}</Txt>
          {ids.map((id) => (
            <Txt key={id} numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold, color: c.fg }}>
              {nameOf(id)}
            </Txt>
          ))}
        </Card>
      ))}
    </View>
  );
}

function PlayoffsBody({ t, entries, matches, links, onDone }: { t: EsportsTournament; entries: readonly EsportsEntry[]; matches: readonly Match[]; links: readonly StageLink[]; onDone: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const now = useNow().getTime();
  const nameOf = useEntryNames(entries as EsportsEntry[]);
  const [busy, setBusy] = useState(false);
  const entryOf = entryBySideTeam(entries);
  const groups = planFromStage('groups', matches as Match[], links, entryOf);
  const tables = groupTablesOf(t.game, groups, matches as Match[], entryOf, now, t.eventId);
  const { plan, error } = tryPlan(() => playoffsPlanFor(t, tables.map((g) => g.rows.map((r) => r.id))));
  const columns = standingsColumns(t.game);
  async function create() {
    if (!plan) return;
    setBusy(true);
    try {
      await createStage(lid, t.eventId, plan);
      toast('Playoffs creados');
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'cuadro'), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <Txt tone="fg2" style={{ fontSize: 15, marginHorizontal: 4 }}>
        {playoffsIntro(t.settings.perGroup)}
      </Txt>
      {tables.map((g, i) => (
        <View key={i} style={{ gap: 8 }}>
          <Txt tone="muted" style={{ fontSize: 13, fontFamily: font.bold, letterSpacing: 0.8, marginHorizontal: 4, textTransform: 'uppercase' }}>{`Grupo ${groupLetter(i)}`}</Txt>
          <StandingsTable rows={g.rows} nameOf={nameOf} columns={columns} highlight={g.rows.slice(0, t.settings.perGroup).map((r) => r.id)} />
        </View>
      ))}
      {error || !plan ? <GrayNote>{error ?? 'No se pudo armar.'}</GrayNote> : <Preview plan={plan} nameOf={nameOf} />}
      <Button variant="primary" size="lg" full icon={<GitFork size={20} color={c.accentFg} />} disabled={!plan} loading={busy} onPress={create}>
        Crear los playoffs
      </Button>
    </View>
  );
}

// ---------- Agentes libres ----------

export function FreeAgentsSheet({ open, onClose, t, entries }: { open: boolean; onClose: () => void; t: EsportsTournament; entries: readonly EsportsEntry[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="Agentes libres" subtitle={`Equipos de ${modeSize(t.mode)}`}>
      {open && <AgentsBody t={t} entries={entries} onDone={onClose} />}
    </Sheet>
  );
}

type AgentsView = { kind: 'list' } | { kind: 'balance' } | { kind: 'assign'; agent: EsportsEntry };

function AgentsBody({ t, entries, onDone }: { t: EsportsTournament; entries: readonly EsportsEntry[]; onDone: () => void }) {
  const c = useColors();
  const [view, setView] = useState<AgentsView>({ kind: 'list' });
  const [busy, setBusy] = useState<string | null>(null);
  const agents = freeAgents(entries);
  const size = modeSize(t.mode);
  const byUser = new Map(agents.map((a) => [agentUserOf(a), a]));
  const balanced = balanceAgents(agents, t);
  const taken = formedTeamsCount(entries);
  const withRoom = teamsWithRoom(entries, t);
  const back = (
    <Pressable accessibilityRole="button" onPress={() => setView({ kind: 'list' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' }}>
      <ArrowLeft size={16} color={c.accent} />
      <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
        Agentes libres
      </Txt>
    </Pressable>
  );

  async function create() {
    setBusy('crear');
    try {
      await formTeams(
        t.eventId,
        balanced.teams.map((team, i) => ({ name: formedTeamName(taken, i), members: team.members.map((m) => ({ userId: m.userId, role: m.role })) })),
      );
      toast(teamsCreatedText(balanced.teams.length));
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(null);
    }
  }
  async function assign(agent: EsportsEntry, team: EsportsEntry) {
    setBusy(team.id);
    try {
      await assignFreeAgent(agent.id, team.id, assignRoleFor(team, t.mode));
      toast(`${agent.name} quedó en ${team.name}`);
      setView({ kind: 'list' });
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(null);
    }
  }

  if (!agents.length) {
    return (
      <Txt variant="meta" tone="muted">
        No hay agentes libres por ahora.
      </Txt>
    );
  }

  if (view.kind === 'balance') {
    return (
      <View style={{ gap: 16 }}>
        {back}
        {balanced.teams.length === 0 ? (
          <GrayNote>{notEnoughAgentsText(size)}</GrayNote>
        ) : (
          balanced.teams.map((team, i) => (
            <Card key={i} padded={false}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
                <Txt style={{ fontSize: 15, fontFamily: font.bold }}>{formedTeamName(taken, i)}</Txt>
                <Txt tone="muted" style={{ fontSize: 13 }}>
                  {team.strength == null ? 'Sin rango' : `Fuerza ${team.strength}`}
                </Txt>
              </View>
              {team.members.map((m) => {
                const a = byUser.get(m.userId);
                return (
                  <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 6 }}>
                    <Initials name={a?.name ?? '?'} size={36} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                        {a?.name ?? m.userId}
                      </Txt>
                      <RankChip game={t.game} rank={memberRank(t.game, t.mode, a?.members[0]?.ranks)} source={a?.members[0]?.rankSource} />
                    </View>
                    <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.semibold }}>
                      {memberRoleText(m.role)}
                    </Txt>
                  </View>
                );
              })}
            </Card>
          ))
        )}
        {balanced.leftover.length > 0 && (
          <Txt tone="muted" style={{ fontSize: 13.5, marginHorizontal: 4 }}>
            {leftoverText(balanced.leftover.map((u) => byUser.get(u)?.name ?? u))}
          </Txt>
        )}
        <Button variant="primary" size="lg" full disabled={!balanced.teams.length} loading={busy === 'crear'} onPress={create}>
          Crear estos equipos
        </Button>
      </View>
    );
  }

  if (view.kind === 'assign') {
    const agent = view.agent;
    return (
      <View style={{ gap: 16 }}>
        {back}
        <Txt style={{ fontSize: 15, fontFamily: font.semibold, marginHorizontal: 4 }}>{`Sumar a ${agent.name} a…`}</Txt>
        {withRoom.length ? (
          <Card padded={false}>
            {withRoom.map((team, i) => {
              const room = teamRoom(team, t.mode, t.settings.subs);
              return (
                <View key={team.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <ListRow
                    title={team.name}
                    subtitle={roomLine(team, room)}
                    right={
                      busy === team.id ? (
                        <Txt tone="muted" style={{ fontSize: 13 }}>
                          Sumando…
                        </Txt>
                      ) : undefined
                    }
                    onPress={busy ? undefined : () => void assign(agent, team)}
                  />
                </View>
              );
            })}
          </Card>
        ) : (
          <GrayNote>Ningún equipo inscrito tiene lugar.</GrayNote>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Card padded={false}>
        {agents.map((a, i) => (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={`Sumar a ${a.name} a un equipo`}
            onPress={() => setView({ kind: 'assign', agent: a })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: pressed ? c.surface2 : 'transparent', borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line })}
          >
            <Initials name={a.name} />
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {a.name}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 4 }}>
                {!!a.members[0]?.gamerTag && (
                  <Txt variant="meta" tone="muted">
                    {a.members[0].gamerTag}
                  </Txt>
                )}
                <RankChip game={t.game} rank={memberRank(t.game, t.mode, a.members[0]?.ranks)} source={a.members[0]?.rankSource} />
              </View>
            </View>
          </Pressable>
        ))}
      </Card>
      <Button variant="primary" size="lg" full icon={<Scale size={20} color={c.accentFg} />} onPress={() => setView({ kind: 'balance' })}>
        Balancear por rango
      </Button>
      {withRoom.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 4 }}>
          <UserPlus size={16} color={c.muted} />
          <Txt tone="muted" style={{ fontSize: 13.5 }}>
            Toca uno para sumarlo a un equipo con lugar.
          </Txt>
        </View>
      )}
    </View>
  );
}
