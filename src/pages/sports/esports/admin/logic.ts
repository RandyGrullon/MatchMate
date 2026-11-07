/**
 * Lo puro de lo del organizador de un torneo de esports (docs/esports.md §5 y §12.8), sin React: el menú «•••» del
 * torneo y lo que se pregunta al cambiar su estado; armar el cuadro (el plan, los que no hicieron check-in, la vista
 * previa) y pasar a playoffs; la siembra; los agentes libres; el menú de un inscrito; «Editar torneo»; una partida de
 * battle royale; y el «•••» de una serie (corregir, W.O., cambiar la hora, anular). Lo usan la web
 * (TournamentPage.tsx, admin/*.tsx, match/MatchSheet.tsx) y la app del teléfono (movil/src/components/esports).
 */
import { hasResult, isOpen, type Match } from '../../../../lib/data/matchCore';
import type { BrGame, EsportsEntry, EsportsTournament } from '../../../../lib/data/esports';
import type { updateTournament } from '../../../../lib/data/esports';
import {
  FORMAT_LABEL,
  balanceTeams,
  entryStrength,
  maxEntries,
  minEntries,
  modeSize,
  seedEntries,
  validateSettings,
  type BalancedTeam,
  type Format,
  type StagePlan,
} from '../../../../sports/esports';
import type { FormatValue } from '../../../esports/create/logic';
import { withRequirements } from '../../../esports/create/logic';
import { localParts, zonedIso } from '../../racket/logic/time';
import { competitors, memberOrdinal, rosterCount, seedEntryList, teamRoom } from '../logic';

/** Lo que se pregunta antes de algo que cuesta deshacer. */
export interface Ask {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
}

/** Una opción de un menú del organizador (el ícono y lo que hace los pone cada pantalla). */
export interface AdminItem<K extends string> {
  key: K;
  label: string;
  hint?: string;
  danger?: boolean;
}

// ---------- El «•••» del torneo ----------

export type TournamentMenuKey = 'editar' | 'sembrar' | 'agentes' | 'cuadro' | 'rehacer' | 'anotadores' | 'logo' | 'cerrar' | 'reabrir' | 'cancelar';

/**
 * Lo del organizador en el «•••» del torneo (después de «Compartir el torneo»), en orden: editar; sembrar y armar el
 * cuadro (en la inscripción, sin fases, no en battle royale); los agentes libres (en «Libre» con modo de equipo);
 * rehacer el cuadro (solo sin resultados); los anotadores (battle royale); el logo; cerrar, volver a abrir o cancelar.
 */
export function organizerMenu(
  t: Pick<EsportsTournament, 'status' | 'format' | 'entryType'>,
  o: { hasStage: boolean; approved: number; freeAgents: number; individual: boolean; redoable: boolean },
): AdminItem<TournamentMenuKey>[] {
  const open = t.status === 'registration' && !o.hasStage && t.format !== 'br';
  const items: AdminItem<TournamentMenuKey>[] = [{ key: 'editar', label: 'Editar torneo', hint: o.hasStage ? 'Nombre, fechas, cupo y reglas' : 'También el formato' }];
  if (open && o.approved > 1) items.push({ key: 'sembrar', label: 'Sembrar', hint: 'A mano, al azar o por rango' });
  if (t.entryType === 'open' && !o.individual && o.freeAgents > 0) items.push({ key: 'agentes', label: 'Agentes libres', hint: 'Sumar o balancear por rango' });
  if (open) items.push({ key: 'cuadro', label: 'Armar el cuadro' });
  if (o.redoable) items.push({ key: 'rehacer', label: 'Rehacer el cuadro', hint: 'Solo sin resultados' });
  if (t.format === 'br') items.push({ key: 'anotadores', label: 'Anotadores', hint: 'Quién anota las partidas' });
  items.push({ key: 'logo', label: 'Logo', hint: 'El del torneo' });
  if (t.status === 'live') items.push({ key: 'cerrar', label: 'Cerrar torneo', hint: 'Queda terminado' });
  if (t.status === 'cancelled') items.push({ key: 'reabrir', label: 'Volver a abrir', hint: 'Vuelve a la inscripción' });
  if (t.status === 'registration' || t.status === 'live') items.push({ key: 'cancelar', label: 'Cancelar torneo', danger: true });
  return items;
}

/** Lo que se pregunta (null: nada) y el aviso de cada cambio de estado del torneo (`esports_set_status`). */
export const STATUS_CHANGE: Readonly<Record<'live' | 'finished' | 'cancelled' | 'registration', { ask: Ask | null; ok: string }>> = {
  live: { ask: { title: '¿Empezar el torneo?', message: 'Se cierra la inscripción y ya puedes anotar las partidas.', confirmText: 'Empezar' }, ok: 'El torneo empezó' },
  finished: { ask: { title: '¿Cerrar el torneo?', message: 'Queda como terminado.', confirmText: 'Cerrar' }, ok: 'Torneo cerrado' },
  cancelled: { ask: { title: '¿Cancelar el torneo?', message: 'Les llega a los inscritos. Lo puedes volver a abrir.', confirmText: 'Cancelar torneo', danger: true }, ok: 'Torneo cancelado' },
  registration: { ask: null, ok: 'Torneo abierto otra vez' },
};

/** «Rehacer el cuadro» (`esports_delete_stage`, solo sin resultados). */
export const REDO_ASK: Ask = { title: '¿Rehacer el cuadro?', message: 'Se borran sus series (todavía sin resultados) y lo armas de nuevo.', confirmText: 'Rehacer', danger: true };
export const REDO_OK = 'Listo: arma el cuadro otra vez';

// ---------- Armar el cuadro y pasar a playoffs ----------

/** El plan con la siembra (o el error del motor en palabras: con estos inscritos no se puede). */
export function tryPlan(fn: () => StagePlan | null): { plan: StagePlan | null; error: string | null } {
  try {
    return { plan: fn(), error: null };
  } catch (e) {
    return { plan: null, error: e instanceof Error ? e.message : 'No se pudo armar con estos inscritos.' };
  }
}

/** Los aprobados que no hicieron check-in (solo si el torneo lo pide). */
export function checkinMissing<E extends Pick<EsportsEntry, 'kind' | 'status' | 'seed' | 'name' | 'checkedInAt'>>(t: Pick<EsportsTournament, 'checkinMinutes'>, entries: readonly E[]): E[] {
  return t.checkinMinutes ? competitors(entries).filter((e) => !e.checkedInAt) : [];
}

/** «Simple eliminación · 6 inscritos, por siembra.» */
export const stageIntro = (format: Format, n: number) => `${FORMAT_LABEL[format]} · ${n} ${n === 1 ? 'inscrito' : 'inscritos'}, por siembra.`;
/** La línea debajo de «Dejar fuera a los que no hicieron check-in». */
export const missingHint = (missing: readonly Pick<EsportsEntry, 'name'>[]) => `${missing.length} sin check-in: ${missing.map((e) => e.name).join(', ')}`;
export const LEAVE_OUT_LABEL = 'Dejar fuera a los que no hicieron check-in';
/** La nota con la que se rechaza a quien no hizo check-in al dejarlo fuera. */
export const NO_CHECKIN_NOTE = 'No hizo check-in';
export const notEnoughText = (format: Format) => `Hacen falta al menos ${minEntries(format)} para ${FORMAT_LABEL[format].toLowerCase()}.`;
export const planErrorText = (error: string | null) => `${error ?? 'No se pudo armar.'} Cambia los ajustes en «Editar torneo».`;
/** El botón de «Armar el cuadro» según el formato. */
export const createStageLabel = (format: Format) => (format === 'groups_playoffs' ? 'Crear los grupos' : format === 'round_robin' ? 'Crear los partidos' : 'Crear el cuadro');
export const stageCreatedText = (format: Format) => (format === 'groups_playoffs' ? 'Grupos creados: el torneo empezó' : 'Cuadro creado: el torneo empezó');
export const playoffsIntro = (perGroup: number) => `Pasan ${perGroup} de cada grupo, cruzados (1.º A contra 2.º B…).`;

/** La vista previa del plan: el cuadro (simple o doble), cuántas series y jornadas tiene la liga, o quién va en cada grupo. */
export type PlanPreview = { kind: 'bracket' } | { kind: 'league'; text: string } | { kind: 'groups'; text: string; groups: { group: number; ids: string[] }[] };

export function planPreview(plan: StagePlan): PlanPreview {
  if (plan.kind === 'bracket' || plan.kind === 'playoffs') return { kind: 'bracket' };
  if (plan.kind === 'league') {
    const jornadas = new Set(plan.matches.map((m) => m.round)).size;
    return { kind: 'league', text: `${plan.matches.length} series en ${jornadas} ${jornadas === 1 ? 'jornada' : 'jornadas'}.` };
  }
  const rounds = new Set(plan.matches.map((m) => `${m.group ?? 0}:${m.round}`));
  const groups = new Map<number, string[]>();
  for (const m of plan.matches) {
    const list = groups.get(m.group ?? 0) ?? [];
    for (const s of m.sides) if (s.kind === 'entry' && !list.includes(s.entryId)) list.push(s.entryId);
    groups.set(m.group ?? 0, list);
  }
  return { kind: 'groups', text: `${plan.matches.length} series en ${rounds.size} jornadas de grupo.`, groups: [...groups].map(([group, ids]) => ({ group, ids })) };
}

// ---------- La siembra ----------

/** Sube (−1) o baja (+1) al de la posición `i`. Fuera de la lista, igual. */
export function moveSeed(order: readonly string[], i: number, d: -1 | 1): string[] {
  const j = i + d;
  const next = [...order];
  if (j < 0 || j >= order.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

type SeedTournament = Pick<EsportsTournament, 'eventId' | 'game' | 'mode'>;

/** «Al azar» (la vez `n`: la primera con la semilla del evento, las demás con otra para que cambie). */
export const randomSeedOrder = (list: readonly Pick<EsportsEntry, 'id' | 'members'>[], t: SeedTournament, n: number) =>
  seedEntries(seedEntryList(list, t.game, t.mode), 'random', { seed: n === 1 ? t.eventId : `${t.eventId}:${n}`, teamSize: modeSize(t.mode) });

/** «Por rango»: el promedio de los titulares con rango (sin rango al final). */
export const rankSeedOrder = (list: readonly Pick<EsportsEntry, 'id' | 'members'>[], t: SeedTournament) =>
  seedEntries(seedEntryList(list, t.game, t.mode), 'rank', { seed: t.eventId, teamSize: modeSize(t.mode) });

/** La fuerza de un inscrito (null sin rango). */
export const seedStrength = (e: Pick<EsportsEntry, 'id' | 'members'>, t: SeedTournament): number | null => entryStrength(seedEntryList([e], t.game, t.mode)[0].ordinals, modeSize(t.mode));

export const strengthText = (s: number | null) => (s == null ? 'Sin rango' : `Fuerza ${Math.round(s)}`);

// ---------- Agentes libres ----------

/** La cuenta de un agente libre. */
export const agentUserOf = (e: Pick<EsportsEntry, 'members' | 'captainId' | 'id'>) => e.members[0]?.userId ?? e.captainId ?? e.id;

/** «Balancear por rango»: los equipos que saldrían (serpiente por rango, con la fuerza de cada uno) y los que sobran. */
export function balanceAgents(agents: readonly EsportsEntry[], t: Pick<EsportsTournament, 'eventId' | 'game' | 'mode' | 'settings'>): { teams: BalancedTeam[]; leftover: string[] } {
  return balanceTeams(
    agents.map((a) => ({ userId: agentUserOf(a), ordinal: memberOrdinal(t.game, t.mode, a.members[0]?.ranks) })),
    { teamSize: modeSize(t.mode), subs: t.settings.subs, seed: t.eventId },
  );
}

/** Cuántos equipos armó ya el organizador («Equipo 1…N»): los nuevos siguen la cuenta. */
export const formedTeamsCount = (entries: readonly Pick<EsportsEntry, 'name'>[]) => entries.filter((e) => /^Equipo \d+$/.test(e.name)).length;
export const formedTeamName = (taken: number, i: number) => `Equipo ${taken + i + 1}`;

/** Los equipos inscritos con lugar en la plantilla. */
export function teamsWithRoom<E extends EsportsEntry>(entries: readonly E[], t: Pick<EsportsTournament, 'mode' | 'settings'>): E[] {
  return competitors(entries).filter((e) => e.kind === 'team' && teamRoom(e, t.mode, t.settings.subs) > 0);
}

/** Con qué rol entra un agente libre al equipo: titular si faltan titulares, si no suplente. */
export const assignRoleFor = (team: Pick<EsportsEntry, 'members'>, mode: Pick<EsportsTournament, 'mode'>['mode']): 'member' | 'sub' =>
  rosterCount(team.members).starters < modeSize(mode) ? 'member' : 'sub';

export const roomLine = (team: Pick<EsportsEntry, 'members'>, room: number) => `${team.members.length} en la plantilla · ${room} ${room === 1 ? 'lugar' : 'lugares'}`;
export const teamsCreatedText = (n: number) => `${n} ${n === 1 ? 'equipo creado' : 'equipos creados'}`;
export const notEnoughAgentsText = (size: number) => `Hacen falta al menos ${size} agentes para armar un equipo.`;
export const leftoverText = (names: readonly string[]) => `Sin equipo: ${names.join(', ')}.`;

// ---------- Un inscrito ----------

export type EntryMenuKey = 'seed' | 'checkin' | 'name';

/** El menú de un inscrito para quien organiza: «Cambiar siembra», «Quitar check-in» (o marcarlo) y «Editar nombre». */
export function entryAdminItems(t: Pick<EsportsTournament, 'checkinMinutes'>, e: Pick<EsportsEntry, 'status' | 'kind' | 'seed' | 'checkedInAt' | 'name' | 'tag'>): AdminItem<EntryMenuKey>[] {
  const items: AdminItem<EntryMenuKey>[] = [];
  if (e.status === 'approved' && e.kind !== 'free_agent') items.push({ key: 'seed', label: 'Cambiar siembra', hint: e.seed ? `Ahora: ${e.seed}` : 'Sin siembra' });
  if (e.status === 'approved' && t.checkinMinutes) items.push({ key: 'checkin', label: e.checkedInAt ? 'Quitar check-in' : 'Marcar check-in' });
  items.push({ key: 'name', label: 'Editar nombre', hint: entryTitle(e) });
  return items;
}

/** «Los Tigres [TGR]». */
export const entryTitle = (e: Pick<EsportsEntry, 'name' | 'tag'>) => (e.tag ? `${e.name} [${e.tag}]` : e.name);

/** La siembra escrita: solo números, hasta 3. */
export const cleanSeedInput = (v: string) => v.replace(/\D/g, '').slice(0, 3);
/** La siembra que se guarda (vacío = sin siembra) y si sirve (1 a 128). */
export function seedFromInput(raw: string): { n: number | null; ok: boolean } {
  const n = raw.trim() ? Number(raw) : null;
  return { n, ok: n === null || (Number.isInteger(n) && n >= 1 && n <= 128) };
}

/** El tag escrito: mayúsculas y números. */
export const cleanEntryTag = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** El nombre (1 a 40) y el tag (hasta 5) de un inscrito sirven. */
export const entryNameOk = (name: string, tag: string) => name.trim().length >= 1 && name.trim().length <= 40 && /^[A-Z0-9]{0,5}$/.test(tag);

// ---------- Editar torneo ----------

/** Lo que se edita en «Editar torneo». */
export interface TournamentEdit {
  name: string;
  date: string;
  time: string;
  closeDate: string;
  closeTime: string;
  /** Minutos de check-in (0 = sin check-in). */
  checkin: number;
  prize: string;
  announcement: string;
  format: FormatValue;
}

type EditTournament = Pick<
  EsportsTournament,
  'name' | 'game' | 'mode' | 'format' | 'entryType' | 'maxEntries' | 'settings' | 'startsAt' | 'registrationClosesAt' | 'checkinMinutes' | 'prizeText' | 'announcement'
>;

/** Los valores de entrada (las fechas en la zona de la liga). */
export function editInitial(t: EditTournament, tz?: string): TournamentEdit {
  const start = localParts(t.startsAt, tz) ?? { date: '', time: '' };
  const close = localParts(t.registrationClosesAt, tz) ?? start;
  return {
    name: t.name,
    date: start.date,
    time: start.time,
    closeDate: close.date,
    closeTime: close.time,
    checkin: t.checkinMinutes ?? 0,
    prize: t.prizeText,
    announcement: t.announcement,
    format: { game: t.game, mode: t.mode, format: t.format, entryType: t.entryType, maxEntries: t.maxEntries, settings: withRequirements(t.game, t.settings) },
  };
}

/** El cupo que se puede poner: no menos que los aprobados ni que el mínimo del formato. */
export const editRange = (t: Pick<EsportsTournament, 'game' | 'mode'>, format: Format, approved: number) => ({ lo: Math.max(minEntries(format), approved), hi: maxEntries(t.game, t.mode, format) });

/** Los errores de «Editar torneo» (vacío = se puede guardar). Lo del formato solo cuenta si todavía se puede cambiar. */
export function editTournamentErrors(t: Pick<EsportsTournament, 'game' | 'mode'>, v: TournamentEdit, o: { tz?: string; approved: number; formatEditable: boolean }): string[] {
  const f = v.format;
  const { lo, hi } = editRange(t, f.format, o.approved);
  const startsAt = zonedIso(v.date, v.time, o.tz);
  const closesAt = zonedIso(v.closeDate, v.closeTime, o.tz);
  const errors: string[] = [];
  if (v.name.trim().length < 2) errors.push('Ponle un nombre al torneo.');
  if (!startsAt) errors.push('Pon el día y la hora del inicio.');
  if (startsAt && closesAt && Date.parse(closesAt) > Date.parse(startsAt)) errors.push('La inscripción tiene que cerrar antes del inicio.');
  if (f.maxEntries < lo || f.maxEntries > hi) errors.push(`El cupo va de ${lo} a ${hi}.`);
  if (o.formatEditable) errors.push(...validateSettings(t.game, t.mode, f.format, f.entryType, f.maxEntries, f.settings));
  return errors;
}

/** Solo lo que cambió (para `updateTournament`); vacío = no hay nada que guardar. */
export function editTournamentPatch(t: EditTournament, v: TournamentEdit, o: { tz?: string; formatEditable: boolean }): Parameters<typeof updateTournament>[1] {
  const startsAt = zonedIso(v.date, v.time, o.tz);
  const closesAt = zonedIso(v.closeDate, v.closeTime, o.tz);
  const patch: Parameters<typeof updateTournament>[1] = {};
  if (v.name.trim() !== t.name) patch.name = v.name.trim();
  if (startsAt && startsAt !== new Date(t.startsAt).toISOString()) patch.startsAt = startsAt;
  if (closesAt && closesAt !== new Date(t.registrationClosesAt).toISOString()) patch.registrationClosesAt = closesAt;
  if ((t.checkinMinutes ?? 0) !== v.checkin) patch.checkinMinutes = v.checkin > 0 ? v.checkin : null;
  if (v.format.maxEntries !== t.maxEntries) patch.maxEntries = v.format.maxEntries;
  if (v.prize.trim() !== t.prizeText) patch.prizeText = v.prize;
  if (v.announcement.trim() !== t.announcement) patch.announcement = v.announcement;
  if (o.formatEditable) {
    if (v.format.format !== t.format) patch.format = v.format.format;
    if (JSON.stringify(v.format.settings) !== JSON.stringify(t.settings) || patch.format) patch.settings = v.format.settings;
  }
  return patch;
}

export const FORMAT_LOCKED_TEXT = 'El formato ya no se cambia: el torneo empezó.';

// ---------- Una partida de battle royale ----------

/** «Anotar partida» o, editando una, «Partida 3 · Jornada 1». */
export const brSheetTitle = (editing: Pick<BrGame, 'round' | 'gameNo'> | null | undefined) => (editing ? `Partida ${editing.gameNo} · Jornada ${editing.round}` : 'Anotar partida');

/** Cuántas jornadas y partidas por jornada se pueden elegir (lo del torneo, o más si ya se pasó). */
export function brSlotRanges(t: Pick<EsportsTournament, 'settings'>, round: number, gameNo: number): { rounds: number; perRound: number } {
  return { rounds: Math.max(t.settings.br?.rounds ?? 1, round), perRound: Math.max(t.settings.br?.gamesPerRound ?? 4, gameNo) };
}

/** Esa jornada y partida ya está anotada (solo al anotar una nueva). */
export const brClash = (games: readonly Pick<BrGame, 'round' | 'gameNo'>[], round: number, gameNo: number, editing: boolean) => !editing && games.some((g) => g.round === round && g.gameNo === gameNo);
export const BR_CLASH_TEXT = 'Esa partida ya está anotada: ábrela en «Partidas» para editarla.';

/** El puesto y las kills de cada inscrito al abrir (los de la partida que se edita; si no, vacío). */
export function brInitialRows(list: readonly Pick<EsportsEntry, 'id'>[], editing: Pick<BrGame, 'results'> | null): Record<string, { placement: number | null; kills: number }> {
  return Object.fromEntries(
    list.map((e) => {
      const r = editing?.results.find((x) => x.entryId === e.id);
      return [e.id, { placement: r?.placement ?? null, kills: r?.kills ?? 0 }];
    }),
  );
}

export const BR_DELETE_ASK: Ask = { title: '¿Borrar esta partida?', message: 'Se borran sus puestos y kills. No se puede deshacer.', confirmText: 'Borrar', danger: true };

// ---------- El «•••» de una serie ----------

export type SeriesMenuKey = 'corregir' | 'wo' | 'hora' | 'anular';

/** Lo del organizador en el «•••» de una serie: corregir (con resultado), W.O. (abierta y con los dos lados), cambiar la hora y anular. */
export function seriesAdminMenu(m: Pick<Match, 'status'>, o: { known: boolean }): AdminItem<SeriesMenuKey>[] {
  const items: AdminItem<SeriesMenuKey>[] = [];
  if (hasResult(m)) items.push({ key: 'corregir', label: 'Corregir resultado', hint: 'Queda confirmado' });
  if (isOpen(m) && o.known) items.push({ key: 'wo', label: 'W.O.', hint: 'Quién no vino' });
  if (isOpen(m) || m.status === 'postponed') items.push({ key: 'hora', label: 'Cambiar hora' });
  if (m.status !== 'void') items.push({ key: 'anular', label: 'Anular la serie', danger: true });
  return items;
}

export const VOID_ASK: Ask = { title: '¿Anular esta serie?', message: 'No cuenta para la tabla ni para el cuadro.', confirmText: 'Anular', danger: true };
/** La nota de «Dejar el propuesto» y la de lo que corrige el organizador. */
export const KEEP_PROPOSED_NOTE = 'Queda el resultado propuesto';
export const CORRECTED_NOTE = 'Corregido por el organizador';

/** W.O.: quién no vino (o ninguno). */
export const walkoverOptions = (names: readonly [string, string]): { key: 0 | 1 | 2; label: string }[] => [
  { key: 1, label: `No vino ${names[0]}` },
  { key: 2, label: `No vino ${names[1]}` },
  { key: 0, label: 'No vino ninguno' },
];
