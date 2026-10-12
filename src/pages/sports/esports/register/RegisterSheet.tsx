import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Check, IdCard, LogOut, Plus, RefreshCw, Repeat, Users } from 'lucide-react';
import { useAuth } from '../../../../lib/auth';
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
} from '../../../../lib/data/esports';
import { useGameIdsFor, useMyGameIds, type GameIdRecord } from '../../../../lib/data/esportsIds';
import { useLeagueCtx } from '../../../../lib/league';
import { GAMES, isIndividualMode, modeSize, rankKeyFor, type GameId } from '../../../../sports/esports';
import { gamePlatforms, platformsText, type Platform } from '../../../../sports/esports/platforms';
import { EntryStatusChip, IdChip, RankChip, TeamLogo } from '../../../../components/esports/bits';
import { useBusy } from '../../../../components/busy';
import { useFeedback } from '../../../../components/feedback';
import { linkButton } from '../../../../components/screens/ScreenBits';
import { Button, Card, ListRow, ListSkeleton, Segmented, Sheet, cx } from '../../../../components/ui';
import { myIdLink } from '../../../esports/logic';
import {
  MEMBER_PROBLEM,
  memberProblem,
  memberRank,
  myProblemText,
  platformOf,
  platformRequirement,
  playsOnOf,
  rosterCheck,
  rosterText,
  speaksFor,
  staleMembers,
  tournamentIdFor,
  tournamentPathFor,
  type MemberProblem,
  type RosterPick,
} from '../logic';

/**
 * La fila de su ID de juego para el torneo: en NBA 2K, la de la plataforma del torneo (en crossplay, cualquiera; si solo
 * tiene de otra plataforma, esa: así dice «Otra plataforma»); en los demás juegos, la única.
 */
export function idFor(records: readonly GameIdRecord[], t: Pick<EsportsTournament, 'game' | 'settings'>, userId?: string): GameIdRecord | null {
  return tournamentIdFor(records, t, userId);
}

/** Dónde juega un ID, escrito: «PC y PlayStation»; «Sin plataforma» si el juego tiene varias y no lo dijo; '' si es una sola. */
export function playsOnText(game: GameId, rec: Pick<GameIdRecord, 'platform' | 'platforms'> | null): string {
  if (!rec || gamePlatforms(game).length < 2) return '';
  const list = playsOnOf(game, rec);
  return list.length ? platformsText(list) : 'Sin plataforma';
}

/** El botón que lleva a Mi ID de juego según lo que falta. */
const FIX_LABEL: Record<MemberProblem, string> = {
  [MEMBER_PROBLEM.noId]: 'Poner mi ID',
  [MEMBER_PROBLEM.otherPlatform]: 'Cambiar mi ID',
  [MEMBER_PROBLEM.noPlatform]: 'Decir dónde juego',
  [MEMBER_PROBLEM.unchecked]: 'Ir a Mi ID de juego',
  [MEMBER_PROBLEM.noRank]: 'Ir a Mi ID de juego',
};

/** Lo que dice la fila de un miembro que no cumple: «Otra plataforma (PC)», «Sin plataforma», «Sin ID»… */
export function memberProblemLabel(problem: MemberProblem, game: GameId, rec: Pick<GameIdRecord, 'platform' | 'platforms'> | null): string {
  if (problem !== MEMBER_PROBLEM.otherPlatform || !rec) return problem;
  const list = playsOnOf(game, rec);
  return list.length ? `${problem} (${platformsText(list)})` : problem;
}

/**
 * Inscribirse (§12.8): en modo individual (y como agente libre) se ve el ID de juego (tocarlo: «Cambiar cuenta» en Mi ID
 * de juego, con la vuelta a este torneo), dónde juega y el rango, lo que pide el torneo de plataforma («Este torneo es de
 * PlayStation») o lo que falta («Primero pon tu ID…», «Tu ID es de PC y el torneo es de PlayStation», «Di dónde juegas
 * …», «Este torneo pide tu ID … comprobado», el rango verificado en LoL) con el link a Mi ID de juego; con equipo, uno de
 * sus equipos de ese juego donde es capitán (o «Crear equipo») y la plantilla: casillas con sus miembros, titular o
 * suplente, lo que le falta a cada uno según el torneo («Sin ID», «Otra plataforma», «Sin plataforma», «ID sin
 * comprobar», «Sin rango verificado») y el contador «5 titulares · 1 suplente»; «Inscribir a {equipo}» se habilita
 * cuando cumple. En «Libre» con modo de equipo, primero «Con mi equipo» o «Como agente libre». Ya inscrito: su estado,
 * «Actualizar mi ID en la inscripción» (si cambió su ID), «Cambiar plantilla» (en la inscripción) y «Retirarme».
 */
export function RegisterSheet({ open, onClose, t, entry }: { open: boolean; onClose: () => void; t: EsportsTournament; entry: EsportsEntry | null }) {
  const title = entry ? 'Tu inscripción' : t.entryType === 'teams' && !isIndividualMode(t.mode) ? 'Inscribir mi equipo' : 'Inscribirme';
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle={t.name}>
      {open && (entry ? <MyEntryView t={t} entry={entry} onClose={onClose} /> : <RegisterBody t={t} onDone={onClose} />)}
    </Sheet>
  );
}

function RegisterBody({ t, onDone }: { t: EsportsTournament; onDone: () => void }) {
  const individual = isIndividualMode(t.mode);
  const [how, setHow] = useState<'team' | 'agent'>('team');
  if (individual) return <SoloRegister t={t} agent={false} onDone={onDone} />;
  if (t.entryType === 'teams') return <TeamRegister t={t} onDone={onDone} />;
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        full
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
          <p className="mx-1 text-[14px] text-muted">El organizador te suma a un equipo con lugar o arma equipos con los agentes libres (por rango).</p>
          <SoloRegister t={t} agent onDone={onDone} />
        </>
      )}
    </div>
  );
}

/** El link para poner, cambiar o comprobar el ID (con la plataforma del torneo) y volver al torneo. */
function useIdLink(t: EsportsTournament): string {
  const { lid, league } = useLeagueCtx();
  const back = tournamentPathFor(lid, t.eventId, league.kind);
  return myIdLink(t.game, back, platformOf(t));
}

/** Individual o agente libre: su ID (tocarlo para cambiar la cuenta), dónde juega, su rango y «Inscribirme». */
function SoloRegister({ t, agent, onDone }: { t: EsportsTournament; agent: boolean; onDone: () => void }) {
  const uid = useAuth().user?.uid ?? null;
  const ids = useMyGameIds(uid);
  const { toast } = useFeedback();
  const busy = useBusy<'inscribir'>();
  const idLink = useIdLink(t);
  const meta = GAMES[t.game];
  const rec = idFor(ids.data, t);
  const rankKey = rankKeyFor(t.game, t.mode);
  const tp = platformOf(t);
  // Lo que falta se dice antes de llamar a la base (que igual lo revisa: esportsErrorText tiene sus códigos).
  const problem = memberProblem(rec, t.settings, rankKey, t.game);
  const playsOn: Platform[] = playsOnOf(t.game, rec);
  const requirement = platformRequirement(t.game, tp);
  const where = playsOnText(t.game, rec);
  const register = () =>
    busy.run('inscribir', async () => {
      try {
        await registerSolo(t.eventId);
        toast(t.settings.autoApprove ? 'Listo: quedaste inscrito' : 'Inscripción enviada: falta que la aprueben');
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  if (ids.loading && !ids.data.length) return <ListSkeleton rows={1} />;
  return (
    <div className="flex flex-col gap-4 pb-1">
      <Card className="overflow-hidden">
        <ListRow
          leading={
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-2">
              <IdCard className="size-5" />
            </span>
          }
          title={rec ? rec.idDisplay : `Sin ${meta.idInfo.label}`}
          subtitle={
            rec ? (
              <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <IdChip ownership={rec.ownership} />
                {where && <span className={cx(where === 'Sin plataforma' && 'font-semibold text-warn')}>{where}</span>}
                <RankChip game={t.game} rank={memberRank(t.game, t.mode, rec.ranks)} source={rec.rankSource} />
              </span>
            ) : (
              `Tu ${meta.idInfo.label} de ${meta.name}`
            )
          }
          to={idLink}
          ariaLabel={rec ? `Tu ${meta.idInfo.label}: ${rec.idDisplay}. Cambiar cuenta` : `Poner tu ${meta.idInfo.label}`}
          trailing={
            // Encima del link de la fila, pero sin atrapar el toque: toda la fila lleva a Mi ID de juego.
            <span className="pointer-events-none inline-flex items-center gap-1 text-meta font-[550] text-accent">
              {rec && <Repeat aria-hidden="true" className="size-4" />}
              {rec ? 'Cambiar cuenta' : 'Poner'}
            </span>
          }
        />
      </Card>
      {requirement && !problem && <p className="mx-1 -mt-1 text-[14px] text-muted">{requirement}</p>}
      {problem ? (
        <>
          <p className="mx-1 text-[15px] font-semibold text-warn">
            {myProblemText(problem, t.game, { tournament: tp, playsOn })}
            {requirement && problem !== MEMBER_PROBLEM.otherPlatform && <span className="block font-normal text-muted">{requirement}</span>}
          </p>
          <Link to={idLink} className={linkButton('primary', 'w-full')}>
            <span className="min-w-0 truncate">{FIX_LABEL[problem]}</span>
          </Link>
        </>
      ) : (
        <Button variant="primary" size="xl" className="w-full" loading={busy.isBusy('inscribir')} onClick={() => void register()}>
          {agent ? 'Inscribirme como agente libre' : 'Inscribirme'}
        </Button>
      )}
    </div>
  );
}

/** Con equipo: elegir el equipo (soy su capitán) y la plantilla. */
function TeamRegister({ t, onDone }: { t: EsportsTournament; onDone: () => void }) {
  const uid = useAuth().user?.uid ?? null;
  const { lid, league } = useLeagueCtx();
  const teams = useMyEsportsTeams(uid);
  const mine = useMemo(() => teams.data.filter((x) => x.game === t.game && x.myRole === 'captain'), [teams.data, t.game]);
  const [picked, setPicked] = useState<string | null>(null);
  const teamId = picked ?? mine[0]?.id ?? null;
  const back = tournamentPathFor(lid, t.eventId, league.kind);
  if (teams.loading && !teams.data.length) return <ListSkeleton rows={2} />;
  if (!mine.length) {
    return (
      <div className="flex flex-col gap-4 pb-1">
        <p className="mx-1 text-[15px] text-muted">{`Para inscribir un equipo tienes que ser su capitán. Crea uno de ${GAMES[t.game].name} e invita a tu gente.`}</p>
        <Link to={`/esports/${t.game}?crear=equipo&volver=${encodeURIComponent(back)}`} className={linkButton('primary', 'w-full')}>
          <Plus aria-hidden="true" className="size-5" />
          <span className="min-w-0 truncate">Crear equipo</span>
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 pb-1">
      {mine.length > 1 && (
        <Card className="overflow-hidden">
          {mine.map((x) => (
            <ListRow
              key={x.id}
              dense
              leading={<TeamLogo path={x.logoPath} name={x.name} tag={x.tag} className="size-10" />}
              title={`${x.name} [${x.tag}]`}
              subtitle={`${x.memberCount} ${x.memberCount === 1 ? 'miembro' : 'miembros'}`}
              onClick={() => setPicked(x.id)}
              trailing={x.id === teamId ? <Check aria-label="Elegido" className="size-5 text-accent" /> : undefined}
            />
          ))}
        </Card>
      )}
      {teamId && <RosterPicker key={teamId} t={t} teamId={teamId} onDone={onDone} />}
    </div>
  );
}

/**
 * La plantilla del equipo para el torneo: casillas con sus miembros (ID, rango, IdChip), titular o suplente y lo que le
 * falta a cada uno. `entryId`: cambiar la plantilla de una inscripción que ya existe.
 */
function RosterPicker({ t, teamId, entryId, initial, onDone }: { t: EsportsTournament; teamId: string; entryId?: string; initial?: readonly RosterPick[]; onDone: () => void }) {
  const uid = useAuth().user?.uid ?? '';
  const team = useEsportsTeam(teamId);
  const members = team.data?.members ?? [];
  const ids = useGameIdsFor(
    members.map((m) => m.userId),
    t.game,
  );
  if ((team.loading && !team.data) || (ids.loading && !ids.data.length)) return <ListSkeleton rows={4} />;
  if (!team.data) return <p className="text-sm text-muted">No se pudo leer el equipo.</p>;
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
  const { toast } = useFeedback();
  const busy = useBusy<'guardar'>();
  const size = modeSize(t.mode);
  const subsMax = t.settings.subs;
  const rankKey = rankKeyFor(t.game, t.mode);
  const requirement = platformRequirement(t.game, platformOf(t));
  const problems = useMemo(() => new Map(members.map((m) => [m.userId, memberProblem(idFor(records, t, m.userId), t.settings, rankKey, t.game)])), [members, records, t, rankKey]);
  const [picks, setPicks] = useState<RosterPick[]>(() => {
    if (initial?.length) return [...initial];
    const out: RosterPick[] = [{ userId: captainId, role: 'captain' }];
    for (const m of members) {
      if (m.userId === captainId || problems.get(m.userId)) continue;
      const starters = out.filter((p) => p.role !== 'sub').length;
      const subs = out.length - starters;
      if (m.role === 'sub' ? subs < subsMax : starters < size) out.push({ userId: m.userId, role: m.role === 'sub' ? 'sub' : 'member' });
      else if (subs < subsMax) out.push({ userId: m.userId, role: 'sub' });
    }
    return out;
  });
  const check = rosterCheck(picks, { mode: t.mode, subs: subsMax, captainId, problems });
  const toggle = (userId: string) => {
    if (userId === captainId) return;
    setPicks((list) => (list.some((p) => p.userId === userId) ? list.filter((p) => p.userId !== userId) : [...list, { userId, role: list.filter((p) => p.role !== 'sub').length < size ? 'member' : 'sub' }]));
  };
  const setRole = (userId: string, role: 'member' | 'sub') => setPicks((list) => list.map((p) => (p.userId === userId ? { ...p, role } : p)));
  const save = () =>
    busy.run('guardar', async () => {
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
          toast(t.settings.autoApprove ? `Listo: ${team.name} quedó inscrito` : 'Inscripción enviada: falta que la aprueben');
        }
        onDone();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  return (
    <div className="flex flex-col gap-3">
      <p className="mx-1 text-sm font-[650] text-fg-2">
        {`Plantilla: ${size} ${size === 1 ? 'titular' : 'titulares'}${subsMax ? ` y hasta ${subsMax} ${subsMax === 1 ? 'suplente' : 'suplentes'}` : ''}`}
        {requirement && <span className="block font-normal text-muted">{requirement}</span>}
      </p>
      <Card className="overflow-hidden">
        {members.map((m) => {
          const pick = picks.find((p) => p.userId === m.userId);
          const rec = idFor(records, t, m.userId);
          const problem = problems.get(m.userId) ?? null;
          const captain = m.userId === captainId;
          return (
            <div key={m.userId} className="mm-row flex items-center gap-2 pr-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={!!pick}
                disabled={captain || (!pick && !!problem)}
                onClick={() => toggle(m.userId)}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left transition active:bg-surface-2 disabled:cursor-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span aria-hidden="true" className={cx('grid size-6 shrink-0 place-items-center rounded-full', pick ? 'bg-accent text-accent-fg' : 'shadow-[inset_0_0_0_1.5px_var(--faint)]', !pick && problem && 'opacity-40')}>
                  {pick && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">
                    {m.displayName}
                    {captain && <span className="ml-1.5 text-[12px] font-semibold text-accent">Capitán</span>}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
                    {problem ? <span className="font-semibold text-warn">{memberProblemLabel(problem, t.game, rec)}</span> : rec ? <span className="truncate">{rec.idDisplay}</span> : null}
                    {rec && !problem && <RankChip game={t.game} rank={memberRank(t.game, t.mode, rec.ranks)} source={rec.rankSource} />}
                  </span>
                </span>
              </button>
              {rec && <span className="hidden min-[400px]:inline-flex"><IdChip ownership={rec.ownership} /></span>}
              {pick && !captain && subsMax > 0 && (
                <button
                  type="button"
                  onClick={() => setRole(m.userId, pick.role === 'sub' ? 'member' : 'sub')}
                  aria-label={`${m.displayName}: ${pick.role === 'sub' ? 'suplente' : 'titular'}. Cambiar`}
                  className={cx('min-h-11 shrink-0 rounded-full px-3 text-[13px] font-semibold', pick.role === 'sub' ? 'bg-surface-2 text-fg-2' : 'bg-accent-soft text-accent')}
                >
                  {pick.role === 'sub' ? 'Suplente' : 'Titular'}
                </button>
              )}
            </div>
          );
        })}
      </Card>
      <p aria-live="polite" className={cx('mx-1 text-[14px] font-semibold', check.ok ? 'text-fg-2' : 'text-muted')}>
        {rosterText(check.starters, check.subs)}
        {check.error && <span className="block font-normal text-warn">{check.error}</span>}
      </p>
      <Button variant="primary" size="xl" className="w-full" disabled={!check.ok} loading={busy.isBusy('guardar')} onClick={() => void save()}>
        {entryId ? 'Guardar la plantilla' : `Inscribir a ${team.name}`}
      </Button>
    </div>
  );
}

/**
 * Ya inscrito: el estado, la plantilla, «Actualizar mi ID en la inscripción» (su ID de ahora no es el que quedó al
 * inscribirse; el capitán, el de cualquiera de la plantilla), «Cambiar mi cuenta del juego», «Cambiar plantilla» y
 * «Retirarme».
 */
function MyEntryView({ t, entry, onClose }: { t: EsportsTournament; entry: EsportsEntry; onClose: () => void }) {
  const uid = useAuth().user?.uid ?? null;
  const { toast, confirm } = useFeedback();
  const busy = useBusy<'retirar' | 'actualizar'>();
  const [editing, setEditing] = useState(false);
  const captain = speaksFor(entry, uid);
  const open = t.status === 'registration';
  const idLink = useIdLink(t);
  const ids = useGameIdsFor(
    entry.members.map((m) => m.userId),
    t.game,
  );
  const live = entry.status === 'pending' || entry.status === 'approved';
  const stale = useMemo(() => staleMembers(entry.members, ids.data, t), [entry.members, ids.data, t]);
  const mine = !!uid && stale.includes(uid);
  const others = captain ? stale.filter((u) => u !== uid).length : 0;
  const canRefresh = open && live && (mine || others > 0);
  const myMember = uid ? entry.members.find((m) => m.userId === uid) : undefined;
  const myNow = uid ? idFor(ids.data, t, uid) : null;
  const refresh = () =>
    busy.run('actualizar', async () => {
      try {
        const n = await refreshEntryIds(entry.id, t.eventId);
        toast(n > 0 ? 'Listo: la inscripción tiene el ID de ahora' : 'La inscripción ya tenía el ID de ahora');
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  const withdraw = async () => {
    if (!(await confirm({ title: '¿Retirarte del torneo?', message: entry.kind === 'team' ? `${entry.name} sale de la inscripción.` : 'Sales de la inscripción.', confirmText: 'Retirarme', danger: true }))) return;
    await busy.run('retirar', async () => {
      try {
        await withdrawEntry(entry.id);
        toast('Te retiraste del torneo');
        onClose();
      } catch (e) {
        toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
      }
    });
  };
  if (editing && entry.teamId) {
    return (
      <div className="pb-1">
        <RosterPicker t={t} teamId={entry.teamId} entryId={entry.id} initial={entry.members.map((m) => ({ userId: m.userId, role: m.role }))} onDone={() => setEditing(false)} />
        <button type="button" onClick={() => setEditing(false)} className="mt-1.5 flex h-11 w-full items-center justify-center text-meta font-[550] text-accent">
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 pb-1">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{entry.name}</span>
        <EntryStatusChip status={entry.status} checkedIn={!!entry.checkedInAt} />
      </div>
      {entry.note && <p className="text-[14px] text-muted">{`Nota del organizador: «${entry.note}»`}</p>}
      {entry.kind !== 'player' && entry.members.length > 0 && (
        <Card className="overflow-hidden">
          {entry.members.map((m) => (
            <ListRow
              key={m.userId}
              dense
              leading={
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-2">
                  <Users className="size-4" />
                </span>
              }
              title={m.displayName}
              subtitle={
                <span className="flex flex-wrap items-center gap-x-1.5">
                  <span>{m.gamerTag}</span>
                  <RankChip game={t.game} rank={memberRank(t.game, t.mode, m.ranks)} source={m.rankSource} />
                </span>
              }
              trailing={<span className="text-[12px] font-semibold text-muted">{m.role === 'captain' ? 'Capitán' : m.role === 'sub' ? 'Suplente' : 'Titular'}</span>}
            />
          ))}
        </Card>
      )}
      {canRefresh && (
        <div className="flex flex-col gap-2 rounded-2xl bg-accent-soft p-4">
          <p className="text-[14.5px] text-fg-2">
            {mine && myMember && myNow
              ? `Ahora tu ID es ${myNow.idDisplay}; en la inscripción quedó ${myMember.gamerTag}.`
              : `${others === 1 ? 'Alguien de la plantilla cambió su ID' : `${others} de la plantilla cambiaron su ID`} después de inscribirse.`}
          </p>
          <Button variant="primary" size="lg" className="w-full" icon={<RefreshCw className="size-5" />} loading={busy.isBusy('actualizar')} onClick={() => void refresh()}>
            {others > 0 ? 'Actualizar los IDs en la inscripción' : 'Actualizar mi ID en la inscripción'}
          </Button>
        </div>
      )}
      {open && live && (
        <Link to={idLink} className={linkButton('quiet', 'w-full')}>
          <Repeat aria-hidden="true" className="size-5" />
          <span className="min-w-0 truncate">Cambiar mi cuenta del juego</span>
        </Link>
      )}
      {open && captain && entry.kind === 'team' && entry.teamId && (
        <Button variant="quiet" size="lg" className="w-full" icon={<Users className="size-5" />} onClick={() => setEditing(true)}>
          Cambiar plantilla
        </Button>
      )}
      {open && captain && (
        <Button variant="quiet" size="lg" className="w-full text-danger" icon={<LogOut className="size-5" />} loading={busy.isBusy('retirar')} onClick={() => void withdraw()}>
          Retirarme
        </Button>
      )}
      {!open && <p className="mx-1 text-[13.5px] text-muted">El torneo ya empezó: la plantilla solo la cambia el organizador.</p>}
    </div>
  );
}
