/**
 * Inscribirse en un torneo de esports (register/RegisterSheet.tsx de la web, con su misma lógica: register/logic.ts y
 * logic.ts). En modo individual (y como agente libre): el ID de juego (tocarlo lleva a Mi ID de juego, con la vuelta a
 * este torneo), dónde juega y el rango, lo que pide el torneo o lo que falta, e «Inscribirme». Con equipo: uno de sus
 * equipos de ese juego donde es capitán (o «Crear equipo») y la plantilla (casillas, titular o suplente, lo que le
 * falta a cada uno y el contador). En «Libre» con modo de equipo, primero «Con mi equipo» o «Como agente libre». Ya
 * inscrito: su estado, la plantilla, «Actualizar mi ID en la inscripción», «Cambiar mi cuenta del juego», «Cambiar
 * plantilla» y «Retirarme».
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Check, IdCard, LogOut, Plus, RefreshCw, Repeat, Users } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import {
  esportsErrorText,
  refreshEntryIds,
  registerSolo,
  registerTeam,
  setEntryRoster,
  useEsportsTeam,
  useMyEsportsTeams,
  withdrawEntry,
  type EsportsEntry,
  type EsportsTeamMember,
  type EsportsTournament,
} from '@mm/lib/data/esports';
import { useGameIdsFor, useMyGameIds, type GameIdRecord } from '@mm/lib/data/esportsIds';
import { useLeagueCtx } from '@mm/lib/league';
import { GAMES, isIndividualMode, modeSize, rankKeyFor } from '@mm/sports/esports';
import { myIdLink } from '@mm/pages/esports/logic';
import {
  MEMBER_PROBLEM,
  memberProblem,
  memberRank,
  memberRoleText,
  myProblemText,
  platformOf,
  platformRequirement,
  playsOnOf,
  rosterCheck,
  rosterText,
  speaksFor,
  staleMembers,
  tournamentPathFor,
  type RosterPick,
} from '@mm/pages/sports/esports/logic';
import {
  FIX_LABEL,
  idFor,
  initialRosterPicks,
  memberProblemLabel,
  playsOnText,
  refreshInfo,
  registerSheetTitle,
  rosterHeading,
  soloRegisteredText,
  teamRegisteredText,
  toggleRosterPick,
  withdrawMessage,
} from '@mm/pages/sports/esports/register/logic';
import { confirmAsync, toast } from '../feedback';
import { EntryStatusChip, IdChip, RankChip, TeamLogo } from './bits';
import { Button, Card, Loading, Segmented, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Cierra la hoja y abre otra pantalla de la app (Mi ID de juego, crear equipo). */
const go = (onClose: () => void, href: string) => {
  onClose();
  router.push(href as Href);
};

export function RegisterSheet({ open, onClose, t, entry }: { open: boolean; onClose: () => void; t: EsportsTournament; entry: EsportsEntry | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={registerSheetTitle(t, entry)} subtitle={t.name}>
      {open && (entry ? <MyEntryView t={t} entry={entry} onClose={onClose} /> : <RegisterBody t={t} onDone={onClose} />)}
    </Sheet>
  );
}

function RegisterBody({ t, onDone }: { t: EsportsTournament; onDone: () => void }) {
  const [how, setHow] = useState<'team' | 'agent'>('team');
  if (isIndividualMode(t.mode)) return <SoloRegister t={t} agent={false} onDone={onDone} />;
  if (t.entryType === 'teams') return <TeamRegister t={t} onDone={onDone} />;
  return (
    <View style={{ gap: 16 }}>
      <Segmented
        label="Cómo te inscribes"
        options={[
          { key: 'team', label: 'Con mi equipo' },
          { key: 'agent', label: 'Como agente libre' },
        ]}
        value={how}
        onChange={setHow}
      />
      {how === 'team' ? (
        <TeamRegister t={t} onDone={onDone} />
      ) : (
        <>
          <Txt tone="muted" style={{ fontSize: 14, marginHorizontal: 4 }}>
            El organizador te suma a un equipo con lugar o arma equipos con los agentes libres (por rango).
          </Txt>
          <SoloRegister t={t} agent onDone={onDone} />
        </>
      )}
    </View>
  );
}

/** El link para poner, cambiar o comprobar el ID (con la plataforma del torneo) y volver al torneo. */
function useIdLink(t: EsportsTournament): string {
  const { lid, league } = useLeagueCtx();
  return myIdLink(t.game, tournamentPathFor(lid, t.eventId, league.kind), platformOf(t));
}

/** Individual o agente libre: su ID (tocarlo para cambiar la cuenta), dónde juega, su rango y «Inscribirme». */
function SoloRegister({ t, agent, onDone }: { t: EsportsTournament; agent: boolean; onDone: () => void }) {
  const c = useColors();
  const uid = useAuth().user?.uid ?? null;
  const ids = useMyGameIds(uid);
  const [busy, setBusy] = useState(false);
  const idLink = useIdLink(t);
  const meta = GAMES[t.game];
  const rec = idFor(ids.data, t);
  const tp = platformOf(t);
  // Lo que falta se dice antes de llamar a la base (que igual lo revisa: esportsErrorText tiene sus códigos).
  const problem = memberProblem(rec, t.settings, rankKeyFor(t.game, t.mode), t.game);
  const playsOn = playsOnOf(t.game, rec);
  const requirement = platformRequirement(t.game, tp);
  const where = playsOnText(t.game, rec);
  async function register() {
    setBusy(true);
    try {
      await registerSolo(t.eventId);
      toast(soloRegisteredText(t.settings.autoApprove));
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(false);
    }
  }
  if (ids.loading && !ids.data.length) return <Loading />;
  return (
    <View style={{ gap: 16 }}>
      <Card padded={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rec ? `Tu ${meta.idInfo.label}: ${rec.idDisplay}. Cambiar cuenta` : `Poner tu ${meta.idInfo.label}`}
          onPress={() => go(onDone, idLink)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? c.surface2 : 'transparent' })}
        >
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <IdCard size={20} color={c.fg2} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>
              {rec ? rec.idDisplay : `Sin ${meta.idInfo.label}`}
            </Txt>
            {rec ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                <IdChip ownership={rec.ownership} />
                {!!where && (
                  <Txt variant="meta" tone={where === 'Sin plataforma' ? 'warn' : 'muted'} style={where === 'Sin plataforma' ? { fontFamily: font.semibold } : undefined}>
                    {where}
                  </Txt>
                )}
                <RankChip game={t.game} rank={memberRank(t.game, t.mode, rec.ranks)} source={rec.rankSource} />
              </View>
            ) : (
              <Txt variant="meta" tone="muted">{`Tu ${meta.idInfo.label} de ${meta.name}`}</Txt>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {rec && <Repeat size={16} color={c.accent} />}
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
              {rec ? 'Cambiar cuenta' : 'Poner'}
            </Txt>
          </View>
        </Pressable>
      </Card>
      {!!requirement && !problem && (
        <Txt tone="muted" style={{ fontSize: 14, marginHorizontal: 4, marginTop: -4 }}>
          {requirement}
        </Txt>
      )}
      {problem ? (
        <>
          <View style={{ marginHorizontal: 4 }}>
            <Txt tone="warn" style={{ fontSize: 15, fontFamily: font.semibold }}>
              {myProblemText(problem, t.game, { tournament: tp, playsOn })}
            </Txt>
            {!!requirement && problem !== MEMBER_PROBLEM.otherPlatform && <Txt tone="muted">{requirement}</Txt>}
          </View>
          <Button variant="primary" size="xl" full onPress={() => go(onDone, idLink)}>
            {FIX_LABEL[problem]}
          </Button>
        </>
      ) : (
        <Button variant="primary" size="xl" full loading={busy} onPress={register}>
          {agent ? 'Inscribirme como agente libre' : 'Inscribirme'}
        </Button>
      )}
    </View>
  );
}

/** Con equipo: elegir el equipo (soy su capitán) y la plantilla. */
function TeamRegister({ t, onDone }: { t: EsportsTournament; onDone: () => void }) {
  const c = useColors();
  const uid = useAuth().user?.uid ?? null;
  const { lid, league } = useLeagueCtx();
  const teams = useMyEsportsTeams(uid);
  const mine = useMemo(() => teams.data.filter((x) => x.game === t.game && x.myRole === 'captain'), [teams.data, t.game]);
  const [picked, setPicked] = useState<string | null>(null);
  const teamId = picked ?? mine[0]?.id ?? null;
  const back = tournamentPathFor(lid, t.eventId, league.kind);
  if (teams.loading && !teams.data.length) return <Loading />;
  if (!mine.length) {
    return (
      <View style={{ gap: 16 }}>
        <Txt tone="muted" style={{ fontSize: 15, marginHorizontal: 4 }}>{`Para inscribir un equipo tienes que ser su capitán. Crea uno de ${GAMES[t.game].name} e invita a tu gente.`}</Txt>
        <Button variant="primary" size="xl" full icon={<Plus size={20} color={c.accentFg} />} onPress={() => go(onDone, `/esports/${t.game}?crear=equipo&volver=${encodeURIComponent(back)}`)}>
          Crear equipo
        </Button>
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      {mine.length > 1 && (
        <Card padded={false}>
          {mine.map((x, i) => (
            <Pressable
              key={x.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: x.id === teamId }}
              onPress={() => setPicked(x.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}
            >
              <TeamLogo path={x.logoPath} name={x.name} tag={x.tag} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>{`${x.name} [${x.tag}]`}</Txt>
                <Txt variant="meta" tone="muted">{`${x.memberCount} ${x.memberCount === 1 ? 'miembro' : 'miembros'}`}</Txt>
              </View>
              {x.id === teamId && <Check size={20} color={c.accent} accessibilityLabel="Elegido" />}
            </Pressable>
          ))}
        </Card>
      )}
      {teamId && <RosterPicker key={teamId} t={t} teamId={teamId} onDone={onDone} />}
    </View>
  );
}

/** La plantilla del equipo para el torneo. `entryId`: cambiar la plantilla de una inscripción que ya existe. */
function RosterPicker({ t, teamId, entryId, initial, onDone }: { t: EsportsTournament; teamId: string; entryId?: string; initial?: readonly RosterPick[]; onDone: () => void }) {
  const uid = useAuth().user?.uid ?? '';
  const team = useEsportsTeam(teamId);
  const members = useMemo(() => team.data?.members ?? [], [team.data]);
  const userIds = useMemo(() => members.map((m) => m.userId), [members]);
  const ids = useGameIdsFor(userIds, t.game);
  if ((team.loading && !team.data) || (ids.loading && !ids.data.length)) return <Loading />;
  if (!team.data) {
    return (
      <Txt variant="meta" tone="muted">
        No se pudo leer el equipo.
      </Txt>
    );
  }
  return <RosterForm key={`${members.length}:${ids.data.length}`} t={t} team={team.data.team} members={members} records={ids.data} captainId={uid} entryId={entryId} initial={initial} onDone={onDone} />;
}

function RosterForm({
  t,
  team,
  members,
  records,
  captainId,
  entryId,
  initial,
  onDone,
}: {
  t: EsportsTournament;
  team: { id: string; name: string; tag: string; logoPath: string | null };
  members: readonly EsportsTeamMember[];
  records: readonly GameIdRecord[];
  captainId: string;
  entryId?: string;
  initial?: readonly RosterPick[];
  onDone: () => void;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const size = modeSize(t.mode);
  const subsMax = t.settings.subs;
  const rankKey = rankKeyFor(t.game, t.mode);
  const requirement = platformRequirement(t.game, platformOf(t));
  const problems = useMemo(() => new Map(members.map((m) => [m.userId, memberProblem(idFor(records, t, m.userId), t.settings, rankKey, t.game)])), [members, records, t, rankKey]);
  const [picks, setPicks] = useState<RosterPick[]>(() => (initial?.length ? [...initial] : initialRosterPicks(members, captainId, problems, size, subsMax)));
  const check = rosterCheck(picks, { mode: t.mode, subs: subsMax, captainId, problems });
  const setRole = (userId: string, role: 'member' | 'sub') => setPicks((list) => list.map((p) => (p.userId === userId ? { ...p, role } : p)));
  async function save() {
    setBusy(true);
    try {
      if (entryId) {
        await setEntryRoster(
          entryId,
          picks.map((p) => ({ userId: p.userId, role: p.role })),
        );
        toast('Plantilla cambiada');
      } else {
        await registerTeam(
          t.eventId,
          team.id,
          picks.filter((p) => p.userId !== captainId).map((p) => ({ userId: p.userId, role: p.role === 'sub' ? 'sub' : 'member' })),
        );
        toast(teamRegisteredText(t.settings.autoApprove, team.name));
      }
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <View style={{ marginHorizontal: 4 }}>
        <Txt tone="fg2" variant="meta" style={{ fontFamily: font.bold }}>
          {rosterHeading(size, subsMax)}
        </Txt>
        {!!requirement && <Txt tone="muted">{requirement}</Txt>}
      </View>
      <Card padded={false}>
        {members.map((m, i) => {
          const pick = picks.find((p) => p.userId === m.userId);
          const rec = idFor(records, t, m.userId);
          const problem = problems.get(m.userId) ?? null;
          const captain = m.userId === captainId;
          return (
            <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!pick, disabled: captain || (!pick && !!problem) }}
                disabled={captain || (!pick && !!problem)}
                onPress={() => setPicks((list) => toggleRosterPick(list, m.userId, captainId, size))}
                style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingLeft: 16 }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pick ? c.accent : 'transparent',
                    borderWidth: pick ? 0 : 1.5,
                    borderColor: c.faint,
                    opacity: !pick && problem ? 0.4 : 1,
                  }}
                >
                  {pick && <Check size={16} color={c.accentFg} strokeWidth={3} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                    {m.displayName}
                    {captain && <Txt style={{ fontSize: 12, fontFamily: font.semibold, color: c.accent }}>{'  Capitán'}</Txt>}
                  </Txt>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    {problem ? (
                      <Txt tone="warn" style={{ fontSize: 13, fontFamily: font.semibold }}>
                        {memberProblemLabel(problem, t.game, rec)}
                      </Txt>
                    ) : rec ? (
                      <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
                        {rec.idDisplay}
                      </Txt>
                    ) : null}
                    {rec && !problem && <RankChip game={t.game} rank={memberRank(t.game, t.mode, rec.ranks)} source={rec.rankSource} />}
                  </View>
                </View>
              </Pressable>
              {pick && !captain && subsMax > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${m.displayName}: ${pick.role === 'sub' ? 'suplente' : 'titular'}. Cambiar`}
                  onPress={() => setRole(m.userId, pick.role === 'sub' ? 'member' : 'sub')}
                  style={{ minHeight: 44, borderRadius: 22, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: pick.role === 'sub' ? c.surface2 : c.accentSoft }}
                >
                  <Txt style={{ fontSize: 13, fontFamily: font.semibold, color: pick.role === 'sub' ? c.fg2 : c.accent }}>{pick.role === 'sub' ? 'Suplente' : 'Titular'}</Txt>
                </Pressable>
              )}
            </View>
          );
        })}
      </Card>
      <View accessibilityLiveRegion="polite" style={{ marginHorizontal: 4 }}>
        <Txt tone={check.ok ? 'fg2' : 'muted'} style={{ fontSize: 14, fontFamily: font.semibold }}>
          {rosterText(check.starters, check.subs)}
        </Txt>
        {!!check.error && <Txt tone="warn">{check.error}</Txt>}
      </View>
      <Button variant="primary" size="xl" full disabled={!check.ok} loading={busy} onPress={save}>
        {entryId ? 'Guardar la plantilla' : `Inscribir a ${team.name}`}
      </Button>
    </View>
  );
}

/** Ya inscrito: el estado, la plantilla, actualizar el ID, cambiar la cuenta del juego, la plantilla y «Retirarme». */
function MyEntryView({ t, entry, onClose }: { t: EsportsTournament; entry: EsportsEntry; onClose: () => void }) {
  const c = useColors();
  const uid = useAuth().user?.uid ?? null;
  const [busy, setBusy] = useState<null | 'retirar' | 'actualizar'>(null);
  const [editing, setEditing] = useState(false);
  const captain = speaksFor(entry, uid);
  const open = t.status === 'registration';
  const idLink = useIdLink(t);
  const userIds = useMemo(() => entry.members.map((m) => m.userId), [entry.members]);
  const ids = useGameIdsFor(userIds, t.game);
  const live = entry.status === 'pending' || entry.status === 'approved';
  const stale = useMemo(() => staleMembers(entry.members, ids.data, t), [entry.members, ids.data, t]);
  const myMember = uid ? entry.members.find((m) => m.userId === uid) : undefined;
  const myNow = uid ? idFor(ids.data, t, uid) : null;
  const refreshing = refreshInfo({ open, live, stale, uid, captain, myGamerTag: myMember?.gamerTag ?? null, myIdNow: myNow?.idDisplay ?? null });
  async function refresh() {
    setBusy('actualizar');
    try {
      const n = await refreshEntryIds(entry.id, t.eventId);
      toast(n > 0 ? 'Listo: la inscripción tiene el ID de ahora' : 'La inscripción ya tenía el ID de ahora');
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(null);
    }
  }
  async function withdraw() {
    if (!(await confirmAsync({ title: '¿Retirarte del torneo?', message: withdrawMessage(entry), confirmText: 'Retirarme', danger: true }))) return;
    setBusy('retirar');
    try {
      await withdrawEntry(entry.id);
      toast('Te retiraste del torneo');
      onClose();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(null);
    }
  }
  if (editing && entry.teamId) {
    return (
      <View style={{ gap: 6 }}>
        <RosterPicker t={t} teamId={entry.teamId} entryId={entry.id} initial={entry.members.map((m) => ({ userId: m.userId, role: m.role }))} onDone={() => setEditing(false)} />
        <Button onPress={() => setEditing(false)} variant="ghost" full>
          Cancelar
        </Button>
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt numberOfLines={1} style={{ flex: 1, fontSize: 17, fontFamily: font.semibold }}>
          {entry.name}
        </Txt>
        <EntryStatusChip status={entry.status} checkedIn={!!entry.checkedInAt} />
      </View>
      {!!entry.note && <Txt tone="muted" style={{ fontSize: 14 }}>{`Nota del organizador: «${entry.note}»`}</Txt>}
      {entry.kind !== 'player' && entry.members.length > 0 && (
        <Card padded={false}>
          {entry.members.map((m, i) => (
            <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Users size={16} color={c.fg2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {m.displayName}
                </Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <Txt variant="meta" tone="muted">
                    {m.gamerTag}
                  </Txt>
                  <RankChip game={t.game} rank={memberRank(t.game, t.mode, m.ranks)} source={m.rankSource} />
                </View>
              </View>
              <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.semibold }}>
                {memberRoleText(m.role)}
              </Txt>
            </View>
          ))}
        </Card>
      )}
      {refreshing.canRefresh && (
        <View style={{ gap: 8, borderRadius: 16, backgroundColor: c.accentSoft, padding: 16 }}>
          <Txt tone="fg2" style={{ fontSize: 14.5 }}>
            {refreshing.text}
          </Txt>
          <Button variant="primary" size="lg" full icon={<RefreshCw size={20} color={c.accentFg} />} loading={busy === 'actualizar'} onPress={refresh}>
            {refreshing.label}
          </Button>
        </View>
      )}
      {open && live && (
        <Button size="lg" full icon={<Repeat size={20} color={c.fg} />} onPress={() => go(onClose, idLink)}>
          Cambiar mi cuenta del juego
        </Button>
      )}
      {open && captain && entry.kind === 'team' && !!entry.teamId && (
        <Button size="lg" full icon={<Users size={20} color={c.fg} />} onPress={() => setEditing(true)}>
          Cambiar plantilla
        </Button>
      )}
      {open && captain && (
        <Button size="lg" full icon={<LogOut size={20} color={c.danger} />} loading={busy === 'retirar'} onPress={withdraw}>
          <Txt style={{ color: c.danger, fontFamily: font.bold, fontSize: 16 }}>Retirarme</Txt>
        </Button>
      )}
      {!open && (
        <Txt tone="muted" style={{ fontSize: 13.5, marginHorizontal: 4 }}>
          El torneo ya empezó: la plantilla solo la cambia el organizador.
        </Txt>
      )}
    </View>
  );
}
