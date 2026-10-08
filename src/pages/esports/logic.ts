/**
 * Lo puro de las pantallas de Esports (pista 4, docs/esports.md §12.2–§12.6): textos, qué acción principal va, cómo se
 * ordenan y filtran las listas, el paso de la hoja del ID de juego y el rango que se elige. Sin React ni backend: lo
 * prueban `logic.test.ts` y las pantallas lo usan tal cual.
 */
import {
  GAMES,
  GAME_IDS,
  canRegister,
  formatLine,
  gamesOfKind,
  isGameId,
  rankKeysOf,
  rlRankFromMmr,
  tournamentPhase,
  verifyKind,
  type GameId,
  type GameKind,
  type GameMeta,
  type Ladder,
  type LinkProvider,
  type Phase,
  type RankKey,
  type RankMap,
  type RankValue,
} from '../../sports/esports';
import type { EsportsTeam, EsportsTeamMember, HubTournament, MyEntry, TeamRole } from '../../lib/data/esports';
import type { GameIdRecord, LookupResult, ProvidersStatus } from '../../lib/data/esportsIds';
import type { Notice } from '../../lib/notices';

// ---------- Palabras ----------

const num = (n: number) => n.toLocaleString('es-DO');

/** «1 miembro», «5 miembros». */
export const countWord = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
export const membersText = (n: number) => countWord(n, 'miembro', 'miembros');

/** «Los Tigres [TGR]». */
export const teamTitle = (t: { name: string; tag: string }) => (t.tag ? `${t.name} [${t.tag}]` : t.name);

export const ROLE_LABEL: Record<TeamRole, string> = { captain: 'Capitán', member: 'Titular', sub: 'Suplente' };

/** El chip de rol de una fila de miembro: el capitán y los suplentes (el titular no lleva). */
export const roleChip = (role: TeamRole): string | null => (role === 'member' ? null : ROLE_LABEL[role]);

/** «Mis equipos»: «VALORANT · 5 miembros · Capitán» (el titular no dice su rol). */
export function myTeamSubtitle(team: Pick<EsportsTeam, 'game' | 'memberCount'>, role: TeamRole): string {
  const game = GAMES[team.game]?.name ?? 'Esports';
  return [game, membersText(team.memberCount), roleChip(role)].filter(Boolean).join(' · ');
}

// ---------- Esports (/esports) ----------

export const GAME_SECTIONS: readonly { kind: GameKind; title: string }[] = [
  { kind: 'team', title: 'Por equipos' },
  { kind: 'duel', title: '1 contra 1' },
  { kind: 'br', title: 'Battle royale' },
];

/** Los 15 juegos en sus tres secciones («Por equipos», «1 contra 1», «Battle royale»), en el orden del catálogo. */
export function gameSections(): { kind: GameKind; title: string; games: GameMeta[] }[] {
  return GAME_SECTIONS.map((s) => ({ ...s, games: gamesOfKind(s.kind) })).filter((s) => s.games.length > 0);
}

/** «Mis torneos»: las inscripciones vivas (por aprobar o aprobadas) de torneos que no terminaron, por fecha. */
export function liveEntries(entries: readonly MyEntry[]): MyEntry[] {
  return entries
    .filter((e) => (e.entryStatus === 'pending' || e.entryStatus === 'approved') && (e.tournamentStatus === 'registration' || e.tournamentStatus === 'live'))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * La fase de un torneo de «Mis torneos» (esports_my_entries no trae la ventana de inscripción): en inscripción,
 * «Inscripción abierta» hasta la hora de inicio y «Inscripción cerrada» después.
 */
export function entryPhase(e: Pick<MyEntry, 'tournamentStatus' | 'startsAt'>, now: number): Phase {
  if (e.tournamentStatus !== 'registration') return e.tournamentStatus;
  const start = Date.parse(e.startsAt);
  return Number.isFinite(start) && start <= now ? 'closed' : 'registration';
}

/** El subtítulo de «Mis torneos»: «Los Tigres» o «Los Tigres · Por aprobar». */
export const myEntrySubtitle = (e: Pick<MyEntry, 'entryName' | 'entryStatus'>) => (e.entryStatus === 'pending' ? `${e.entryName} · Por aprobar` : e.entryName);

/** Tiene su ID puesto (de ese juego, o de cualquiera), comprobado o no: es lo que piden los equipos. */
export const hasGameId = (ids: readonly Pick<GameIdRecord, 'game'>[], game?: GameId) => ids.some((r) => !game || r.game === game);

/**
 * El aviso propio de Esports: sin ningún ID puesto, «Pon tu ID de juego». null si no hay nada que decir (o todavía no se
 * sabe). El de un ID tuyo que pasó a otra cuenta lo propone `useEsportsIdMoveNotice` (src/components/home/
 * EsportsHomeRow.tsx, el mismo de Hoy) en Esports y en Mi ID de juego, y gana: es de tipo 'admin'.
 */
export function esportsNotice(o: {
  signedIn: boolean;
  ids: readonly Pick<GameIdRecord, 'game'>[];
  idsLoading: boolean;
  /** En Mi ID de juego no se dice «Pon tu ID» (ya está ahí). */
  onIdsPage?: boolean;
}): Notice | null {
  if (!o.signedIn || o.onIdsPage || o.idsLoading || hasGameId(o.ids)) return null;
  return {
    id: 'esports-poner-id',
    kind: 'tip',
    title: 'Pon tu ID de juego',
    text: 'Así te pueden sumar a un equipo y te inscribes más rápido.',
    action: { label: 'Poner mi ID', to: '/esports/mi-id' },
  };
}

/** «Mi ID de juego» (la fila al final de Esports): los juegos donde tienes ID («VALORANT · EA SPORTS FC», «3 juegos»). */
export function myIdsSubtitle(ids: readonly Pick<GameIdRecord, 'game'>[], signedIn: boolean): string {
  if (!signedIn) return 'Para unirte a equipos e inscribirte';
  const games = GAME_IDS.filter((g) => ids.some((r) => r.game === g));
  if (!games.length) return 'Pon tu ID para inscribirte';
  return games.length <= 2 ? games.map((g) => GAMES[g].name).join(' · ') : countWord(games.length, 'juego', 'juegos');
}

// ---------- La página del juego (/esports/:game) ----------

export type HubSectionKey = 'open' | 'live' | 'finished';
export const HUB_SECTION_TITLE: Record<HubSectionKey, string> = { open: 'Inscripción abierta', live: 'En curso', finished: 'Terminados' };

/** Los torneos del juego en «Inscripción abierta», «En curso» y «Terminados» (en el orden que da la base); solo las que tienen. */
export function hubSections<T extends Pick<HubTournament, 'status'>>(ts: readonly T[]): { key: HubSectionKey; title: string; items: T[] }[] {
  const by: Record<HubSectionKey, T[]> = { open: [], live: [], finished: [] };
  for (const t of ts) {
    if (t.status === 'registration') by.open.push(t);
    else if (t.status === 'live') by.live.push(t);
    else if (t.status === 'finished') by.finished.push(t);
  }
  return (Object.keys(by) as HubSectionKey[]).filter((k) => by[k].length).map((k) => ({ key: k, title: HUB_SECTION_TITLE[k], items: by[k] }));
}

type PhaseFields = Pick<HubTournament, 'status' | 'startsAt' | 'registrationOpensAt' | 'registrationClosesAt' | 'checkinMinutes'>;

export const hubPhase = (t: PhaseFields, now: number): Phase => tournamentPhase(t, now);

/** «Torneos abiertos»: en los que todavía te puedes inscribir. */
export const openTournamentCount = (ts: readonly PhaseFields[], now: number) => ts.filter((t) => canRegister(t, now)).length;

/** «5 contra 5 · Doble eliminación · Solo equipos · 6/16». */
export const tournamentSubtitle = (t: Pick<HubTournament, 'game' | 'mode' | 'format' | 'entryType' | 'approved' | 'maxEntries'>) =>
  `${formatLine(t)} · ${num(t.approved)}/${num(t.maxEntries)}`;

/** «5 contra 5 · Riot ID»: la línea debajo del nombre del juego. */
export const gameLine = (meta: Pick<GameMeta, 'defaultMode' | 'idInfo' | 'kind'>, modeText: string) => `${modeText} · ${meta.idInfo.label}`;

export interface HubActions {
  /** El botón principal: «Crear torneo» (Pro) o «Crear equipo» (Lite, si todavía no tienes equipo de ese juego). */
  primary: 'tournament' | 'team' | null;
  /** «Crear equipo» en gris al lado (Pro, juegos de equipo). */
  secondary: 'team' | null;
  /** Lite: el link «¿Organizas? Crear torneo» al final. */
  organizeLink: boolean;
}

/** Qué acción principal va en la página del juego (§12.3). Los duelos no tienen equipos. */
export function gameHubActions(o: { pro: boolean; kind: GameKind; hasTeam: boolean }): HubActions {
  const teams = o.kind !== 'duel';
  if (o.pro) return { primary: 'tournament', secondary: teams ? 'team' : null, organizeLink: false };
  return { primary: teams && !o.hasTeam ? 'team' : null, secondary: null, organizeLink: true };
}

/** Minúsculas y sin acentos, para buscar «tigres» y encontrar «Los Tigres» o «TÍGRES». */
export const searchKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Los equipos del juego para la vista «Equipos»: primero los tuyos (aunque no estén entre los 100 que da la base) y
 * después los demás, filtrados por nombre o tag.
 */
export function teamLists<M extends { id: string; name: string; tag: string }, T extends { id: string; name: string; tag: string }>(
  mine: readonly M[],
  all: readonly T[],
  query: string,
): { mine: M[]; others: T[] } {
  const q = searchKey(query);
  const hit = (t: { name: string; tag: string }) => !q || searchKey(t.name).includes(q) || searchKey(t.tag).includes(q);
  const ids = new Set(mine.map((t) => t.id));
  return { mine: mine.filter(hit), others: all.filter((t) => !ids.has(t.id) && hit(t)) };
}

// ---------- Volver a donde iba (?volver=) ----------

/** Solo una ruta de la app («/esports/valorant?crear=equipo»): nunca otro sitio («//x.com», «https:…»). */
export function safeBack(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!s.startsWith('/') || s.startsWith('//') || s.includes('\\') || /[\u0000-\u001f]/.test(s)) return null;
  return s;
}

/** Agrega `key=value` a una ruta que puede traer ya su `?…`. */
export function withQuery(path: string, key: string, value: string): string {
  const [base, hash = ''] = path.split('#', 2);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}${hash ? `#${hash}` : ''}`;
}

/** «Poner mi ID» y vuelve a `back` al confirmar: /esports/mi-id?juego=valorant&volver=… */
export const myIdLink = (game: GameId, back?: string | null) =>
  back ? `/esports/mi-id?juego=${game}&volver=${encodeURIComponent(back)}` : `/esports/mi-id?juego=${game}`;

/** La página del juego con la hoja de crear equipo abierta (y a dónde volver después de crearlo). */
export const createTeamLink = (game: GameId, back?: string | null) =>
  back ? `/esports/${game}?crear=equipo&volver=${encodeURIComponent(back)}` : `/esports/${game}?crear=equipo`;

// ---------- Crear y editar un equipo ----------

export interface TeamForm {
  name: string;
  tag: string;
  description: string;
}

/** El tag mientras se escribe: mayúsculas, solo letras y números, hasta 5. */
export const cleanTag = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);

/**
 * Un tag que sale del nombre hasta que la persona escribe el suyo: las iniciales («Los Tigres del Norte» → «LTDN»); de
 * una sola palabra, entera si cabe («Fénix» → «FENIX») o sus 3 primeras («Dragones» → «DRA»).
 */
export function suggestTag(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0].length <= 5 ? words[0] : words[0].slice(0, 3);
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, 5);
}

/** Lo que falta para crear (o guardar) el equipo, por campo. Vacío = se puede. */
export function teamFormErrors(f: TeamForm): Partial<Record<keyof TeamForm, string>> {
  const errors: Partial<Record<keyof TeamForm, string>> = {};
  const name = f.name.trim();
  if (name.length < 2) errors.name = 'Ponle un nombre de 2 letras o más.';
  else if (name.length > 40) errors.name = 'El nombre va hasta 40 letras.';
  if (!/^[A-Z0-9]{2,5}$/.test(f.tag)) errors.tag = 'El tag va de 2 a 5 letras o números.';
  if (f.description.trim().length > 200) errors.description = 'La descripción va hasta 200 letras.';
  return errors;
}

/** Lo que cambió (para updateTeam); null si nada. */
export function teamPatch(team: Pick<EsportsTeam, 'name' | 'tag' | 'description'>, f: TeamForm): { name?: string; tag?: string; description?: string } | null {
  const patch: { name?: string; tag?: string; description?: string } = {};
  if (f.name.trim() !== team.name) patch.name = f.name.trim();
  if (f.tag !== team.tag) patch.tag = f.tag;
  if (f.description.trim() !== (team.description ?? '')) patch.description = f.description.trim();
  return Object.keys(patch).length ? patch : null;
}

// ---------- La página del equipo ----------

export type TeamViewer = TeamRole | 'none';

export const viewerRole = (members: readonly Pick<EsportsTeamMember, 'userId' | 'role'>[], uid: string | null | undefined): TeamViewer =>
  (uid && members.find((m) => m.userId === uid)?.role) || 'none';

const ROLE_ORDER: Record<TeamRole, number> = { captain: 0, member: 1, sub: 2 };

/** El capitán primero, después los titulares y al final los suplentes; en cada grupo, por nombre. */
export function sortMembers<T extends Pick<EsportsTeamMember, 'role' | 'displayName'>>(members: readonly T[]): T[] {
  return [...members].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.displayName.localeCompare(b.displayName, 'es'));
}

export type TeamMenuKey = 'edit' | 'delete' | 'leave';

/** El menú «•••» del equipo: el capitán edita o borra; un miembro sale; quien no es miembro, nada. */
export function teamMenu(viewer: TeamViewer): TeamMenuKey[] {
  if (viewer === 'captain') return ['edit', 'delete'];
  if (viewer === 'member' || viewer === 'sub') return ['leave'];
  return [];
}

export type MemberActionKey = 'toggle_sub' | 'make_captain' | 'remove';

/** Lo que el capitán puede hacer con otro miembro (a sí mismo, nada: primero pasa la capitanía). */
export function memberActions(viewer: TeamViewer, target: Pick<EsportsTeamMember, 'userId' | 'role'>, uid: string | null | undefined): MemberActionKey[] {
  if (viewer !== 'captain' || !uid || target.userId === uid || target.role === 'captain') return [];
  return ['toggle_sub', 'make_captain', 'remove'];
}

export const toggleSubLabel = (role: TeamRole) => (role === 'sub' ? 'Hacer titular' : 'Hacer suplente');

/** «Titular · 4 de 5» para la hoja de un miembro. */
export function rosterSummary(members: readonly Pick<EsportsTeamMember, 'role'>[]): string {
  const starters = members.filter((m) => m.role !== 'sub').length;
  const subs = members.length - starters;
  return [countWord(starters, 'titular', 'titulares'), subs ? countWord(subs, 'suplente', 'suplentes') : null].filter(Boolean).join(' · ');
}

// ---------- Unirse con el código ----------

export type JoinState = 'loading' | 'dead' | 'signin' | 'member' | 'need_id' | 'ready';

/** Qué muestra /esports/unirse/:code (§12.5). */
export function joinState(o: {
  preview: { teamId: string; game: GameId } | null | undefined;
  signedIn: boolean;
  loading: boolean;
  myTeamIds: ReadonlySet<string>;
  ids: readonly GameIdRecord[];
}): JoinState {
  if (o.preview === undefined || o.loading) return 'loading';
  if (!o.preview) return 'dead';
  if (!o.signedIn) return 'signin';
  if (o.myTeamIds.has(o.preview.teamId)) return 'member';
  if (!hasGameId(o.ids, o.preview.game)) return 'need_id';
  return 'ready';
}

// ---------- Mi ID de juego ----------

/** Los IDs en el orden de los juegos (NBA 2K: uno por plataforma). */
export function sortIds<T extends Pick<GameIdRecord, 'game' | 'platform'>>(ids: readonly T[]): T[] {
  const order = (g: GameId) => {
    const i = GAME_IDS.indexOf(g);
    return i < 0 ? GAME_IDS.length : i;
  };
  return [...ids].sort((a, b) => order(a.game) - order(b.game) || a.platform.localeCompare(b.platform));
}

/** El ID de ese juego (y plataforma, en NBA 2K; sin plataforma, el primero que tenga). */
export function idFor<T extends Pick<GameIdRecord, 'game' | 'platform'>>(ids: readonly T[], game: GameId, platform?: string | null): T | null {
  return ids.find((r) => r.game === game && (platform == null || platform === '' ? true : r.platform === platform)) ?? null;
}

/** El juego busca el ID con la API de Riot (LoL y VALORANT) y la función la tiene encendida: «Buscar» en vez de «Guardar». */
export const canLookup = (game: GameId, providers: Pick<ProvidersStatus, 'lookup'>) => verifyKind(game) === 'lookup' && providers.lookup.includes(game);

/** El juego tiene «Conectar con…» y el proveedor está encendido. */
export function linkProviderFor(game: GameId, providers: Pick<ProvidersStatus, 'link'>): LinkProvider | null {
  const p = GAMES[game]?.link ?? null;
  return p && providers.link[p] ? p : null;
}

/** La etiqueta del ID dentro de una frase: «tu código de amigo de Steam», pero «tu Riot ID» (los nombres van igual). */
export const idWord = (label: string) => (/^(Código|Usuario|Tag)(?=\s)/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);

export const PROVIDER_NAME: Record<LinkProvider, string> = { steam: 'Steam', epic: 'Epic', riot: 'Riot' };
export const connectLabel = (p: LinkProvider) => `Conectar con ${PROVIDER_NAME[p]}`;

/** Lo que dice la vuelta de «Conectar con…» (?conectado=<proveedor> o ?error=<codigo>). */
export const LINK_ERROR_TEXT: Record<string, string> = {
  estado_vencido: 'Se venció el inicio de sesión: vuelve a intentarlo.',
  proveedor: 'El proveedor no lo confirmó.',
  no_disponible: 'Conectar esa cuenta no está disponible ahora.',
};

export function linkResultToast(params: Pick<URLSearchParams, 'get'>): { text: string; tone: 'ok' | 'error' } | null {
  if (params.get('conectado')) return { text: 'Listo: tu cuenta quedó conectada.', tone: 'ok' };
  const code = params.get('error');
  if (code) return { text: LINK_ERROR_TEXT[code] ?? 'No se pudo conectar la cuenta.', tone: 'error' };
  return null;
}

/**
 * El paso de la hoja del ID (§12.6): lo que hay, escribir el ID y el rango (un solo paso), «¿Eres tú?» (lo que encontró
 * la búsqueda de Riot), el ID ya está conectado a otra cuenta, o cambiar solo el rango.
 */
export type IdStep = 'summary' | 'edit' | 'found' | 'taken' | 'rank';

/** Con un ID guardado se abre en lo que hay; sin él, en escribirlo. */
export const initialIdStep = (record: object | null): IdStep => (record ? 'summary' : 'edit');

export type FoundLookup = Extract<LookupResult, { status: 'found' }>;

/** Lo que lleva la hoja del ID mientras está abierta. */
export interface IdSheetState {
  step: IdStep;
  /** Lo que se escribe en el campo. */
  raw: string;
  platform: string;
  region: string;
  /** El ID como quedó guardado («Nombre#TAG»). */
  display: string;
  /** «¿Eres tú?»: lo que encontró la búsqueda. */
  found: FoundLookup | null;
  /** La búsqueda no lo encontró: el aviso debajo del campo (con «Guardarlo así»). */
  message: string | null;
  /** El rango que se elige (opcional). */
  ranks: RankMap;
}

/** Cómo se abre la hoja del ID de un juego: con lo guardado (si hay) y la región o plataforma de siempre. */
export function initialIdSheetState(game: GameId, record: GameIdRecord | null): IdSheetState {
  const meta = GAMES[game];
  return {
    step: initialIdStep(record),
    raw: record?.idDisplay ?? '',
    platform: record?.platform ?? '',
    region: record?.region || meta?.idInfo.defaultRegion || '',
    display: record?.idDisplay ?? '',
    found: null,
    message: null,
    ranks: { ...(record?.ranks ?? {}) },
  };
}

/** El mismo rango (sin importar el orden de las claves). */
function sameRanks(a: RankMap, b: RankMap): boolean {
  const norm = (m: RankMap) =>
    JSON.stringify(
      Object.entries(m)
        .filter(([, v]) => v != null)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([k, v]) => [k, Object.entries(v as object).sort(([x], [y]) => x.localeCompare(y))]),
    );
  return norm(a) === norm(b);
}

/**
 * Los rangos que se mandan (setRanks) al guardar: nada si no cambió (así un rango verificado no pasa a declarado); los
 * elegidos; vacío si quitó los que tenía.
 */
export function ranksToSend(chosen: RankMap, before: RankMap | null | undefined): RankMap | undefined {
  const prev = before ?? {};
  if (sameRanks(chosen, prev)) return undefined;
  if (Object.keys(chosen).length) return chosen;
  return Object.keys(prev).length ? {} : undefined;
}

/** El campo del ID se escribe con el teclado de números (código de amigo, User Code, ID de Free Fire…). */
export const numericId = (game: GameId) => ['steam', 'buckler', 'digits', 'mlbb'].includes(GAMES[game]?.idInfo.kind ?? '');

/**
 * Lo que sigue después de buscar (el ID ya quedó guardado como declarado): encontrado → «¿Eres tú?»; no existe → el
 * campo con el aviso («Guardarlo así»); sin búsqueda, muchas búsquedas o un error → queda guardado así.
 */
export function afterLookup(r: Pick<LookupResult, 'status'>, label: string): { next: 'found' | 'edit' | 'saved'; message: string | null } {
  switch (r.status) {
    case 'found':
      return { next: 'found', message: null };
    case 'not_found':
      return { next: 'edit', message: `No encontramos ese ${label}. Revisa cómo lo escribiste.` };
    default:
      return { next: 'saved', message: null };
  }
}

/** «Ese ID está conectado a otra cuenta»: con qué entró quien lo tiene y qué hacer si es tuyo. */
export function takenText(game: GameId): string {
  const p = GAMES[game]?.link ?? null;
  return `Quien lo conectó entró con su cuenta ${p ? `de ${PROVIDER_NAME[p]}` : 'del juego'}. Si es tuyo, conéctalo tú y pasa a tu cuenta.`;
}

export type IdActionKey = 'rank' | 'lookup' | 'link' | 'change' | 'delete';

/**
 * Lo que se hace con un ID guardado: el rango; «Comprobar con Riot» (hay búsqueda y no está comprobado); «Conectar
 * con…» (está encendido y no entró con su cuenta); «Cambiar mi ID» (no si entró con su cuenta) y quitarlo.
 */
export function idActions(r: Pick<GameIdRecord, 'game' | 'status' | 'ownership'>, providers: Pick<ProvidersStatus, 'lookup' | 'link'>): IdActionKey[] {
  const login = r.ownership === 'login';
  const out: IdActionKey[] = ['rank'];
  if (canLookup(r.game, providers) && r.status !== 'confirmado') out.push('lookup');
  if (!login && linkProviderFor(r.game, providers)) out.push('link');
  if (!login) out.push('change');
  out.push('delete');
  return out;
}

/** La primera palabra del error de la base ('id_tomado', 'cerrado: …'). */
export function raisedCode(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null;
  const { code, message } = e as { code?: unknown; message?: unknown };
  const fromMessage = typeof message === 'string' ? message.trim().split(/[\s:]/)[0] : '';
  if (fromMessage && /^[a-z_]+$/.test(fromMessage)) return fromMessage;
  return typeof code === 'string' && /^[a-z_]+$/.test(code) ? code : null;
}

/** «Ese ID está conectado a otra cuenta» (alguien entró con esa cuenta de Steam, Epic o Riot): lleva a su paso. */
export const isTakenError = (e: unknown) => raisedCode(e) === 'id_tomado';

// ---------- El rango que se elige (RankPicker) ----------

export type { RankKey };

/** Las claves que se eligen: Rocket League por modo (1v1, 2v2, 3v3); los demás, uno solo. */
export const rankKeysFor = (game: GameId): RankKey[] => rankKeysOf(game);

/** La clave que se ve primero: el modo por defecto del juego si tiene rango por modo. */
export function defaultRankKey(game: GameId): RankKey {
  const keys = rankKeysFor(game);
  const mode = GAMES[game]?.defaultMode as string | undefined;
  return (keys as string[]).includes(mode ?? '') ? (mode as RankKey) : keys[0];
}

/** Pone (o quita, con null) el rango de una clave. */
export function setRank(map: RankMap, key: RankKey, v: RankValue | null): RankMap {
  const next: RankMap = { ...map };
  if (v) next[key] = v;
  else delete next[key];
  return next;
}

type TierLadder = Extract<Ladder, { kind: 'tiers' }>;

/** Las divisiones de un tier de la más baja a la más alta: «1 2 3» (asc) o «IV III II I» (desc, la I es la mejor). */
export function divsOf(ladder: TierLadder, tierId: string): number[] {
  const tier = ladder.tiers.find((t) => t.id === tierId);
  if (!tier || !tier.divs) return [];
  const list = Array.from({ length: tier.divs }, (_, i) => i + 1);
  return tier.order === 'desc' ? list.reverse() : list;
}

/** Al elegir un tier: con divisiones, la más baja; sin, ninguna. El MMR (Rocket League) se quita: ya no es el de ese rango. */
export function pickTier(ladder: TierLadder, tierId: string): RankValue | null {
  if (!tierId) return null;
  const divs = divsOf(ladder, tierId);
  return divs.length ? { tier: tierId, div: divs[0] } : { tier: tierId };
}

/** El MMR escrito → el rango que propone (Rocket League), con el MMR guardado. null si no es un número de −100 a 3 000. */
export function mmrProposal(mode: '1v1' | '2v2' | '3v3', raw: string): { tier: string; div?: number; mmr: number } | null {
  const s = raw.trim();
  if (!/^-?\d{1,4}$/.test(s)) return null;
  const mmr = Number(s);
  if (mmr < -100 || mmr > 3000) return null;
  return { ...rlRankFromMmr(mode, mmr), mmr };
}

/** Un número de la escalera numérica (CS Rating, trofeos) desde el campo; null si está vacío o no es número. */
export function numberRank(raw: string): RankValue | null {
  const s = raw.replace(/[.\s,]/g, '');
  if (!/^\d{1,8}$/.test(s)) return null;
  return { value: Number(s) };
}

export const isTierRank = (r: RankValue | null | undefined): r is { tier: string; div?: number; mmr?: number } => !!r && 'tier' in r;
export const isNumberRank = (r: RankValue | null | undefined): r is { value: number } => !!r && 'value' in r;
export const isTextRank = (r: RankValue | null | undefined): r is { text: string } => !!r && 'text' in r;

// ---------- Parámetros ----------

/** Un `?juego=` que sirve. */
export const gameParam = (v: string | null): GameId | null => (v && isGameId(v) ? v : null);
