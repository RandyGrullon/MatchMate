/**
 * Catálogo de los juegos de esports: la fuente de verdad de las reglas (docs/esports.md §2). Cada liga o torneo es de
 * un solo juego y el juego decide la lógica: modos, mejor de, regla del marcador, ID, plantilla y lobby.
 *
 * La base repite solo lo que necesita para validar en funciones `private.esp_*`; si algo cambia aquí, cambia allá.
 * Puro: sin React ni backend (y sin depender del registro de deportes).
 */
import type { Format } from './settings';

export type GameId =
  | 'valorant'
  | 'cs2'
  | 'lol'
  | 'mlbb'
  | 'rocket_league'
  | 'ea_fc'
  | 'nba_2k'
  | 'sf6'
  | 'tekken8'
  | 'smash'
  | 'clash_royale'
  | 'free_fire'
  | 'fortnite'
  | 'warzone'
  | 'pubg_mobile';
export type GameKind = 'team' | 'duel' | 'br';
export type Mode = '1v1' | '2v2' | '3v3' | '5v5' | 'solo' | 'duo' | 'trio' | 'squad' | 'quad';
export type BestOf = 1 | 3 | 5 | 7;
export type ScoringRule = 'val' | 'cs' | 'win' | 'goals_ot' | 'goals_pen' | 'points' | 'fight' | 'stocks' | 'crowns' | 'br';
export type IdKind = 'riot' | 'steam' | 'mlbb' | 'epic' | 'ea' | 'console' | 'buckler' | 'tekken' | 'nintendo' | 'cr' | 'digits' | 'activision';
export type LinkProvider = 'steam' | 'epic' | 'riot';
/** Cómo se comprueba el ID de un juego (docs/esports.md): conectando la cuenta, buscándolo con la API o de ninguna forma. */
export type VerifyKind = 'login' | 'lookup' | 'none';

/** «Steam», «Epic», «Riot» (en «Conectar con …», «entró con su cuenta de …»). */
export const LINK_PROVIDER_NAME: Readonly<Record<LinkProvider, string>> = { steam: 'Steam', epic: 'Epic', riot: 'Riot' };

export interface GameMeta {
  id: GameId;
  /** «VALORANT» */
  name: string;
  /** «VAL» (monograma, 2–4). Sin logos de marcas (D16). */
  mono: string;
  /** La lógica en una línea («5 contra 5 · mapas a 13 rondas»). */
  blurb: string;
  /** Color del monograma (#rrggbb, letras blancas ≥ 4.5:1). */
  color: string;
  kind: GameKind;
  modes: readonly Mode[];
  defaultMode: Mode;
  /** Mejor de permitidos (vacío en BR). */
  bestOf: readonly BestOf[];
  /** Mejor de por defecto por fase (null en BR). */
  defaultBestOf: { groups: BestOf; playoffs: BestOf; final: BestOf } | null;
  scoring: ScoringRule;
  /** «rondas», «goles», «kills»… */
  pointsWord: string;
  /** «mapas», «juegos», «partidas». */
  mapsWord: string;
  /** Mapas de la lista (vacío: campo libre de hasta 24). Es dato, no lógica. */
  maps: readonly { id: string; name: string }[];
  /** Juegos de pelea: rondas para ganar un juego. */
  roundsToWin?: { default: 2 | 3; options: readonly (2 | 3)[] };
  /** Smash: vidas por jugador. */
  stocks?: { default: number; min: 1; max: 5 };
  /** Suplentes máximos por modo. */
  subsMax: Partial<Record<Mode, number>>;
  /** BR: máximo de inscritos del torneo (todos en la misma partida). */
  lobby?: Partial<Record<Mode, number>>;
  /** BR: puntos por puesto por defecto (el que no está en la lista da 0) y por kill. */
  br?: { placementPoints: readonly number[]; killPoints: number };
  idInfo: {
    kind: IdKind;
    /** «Riot ID» (se lee «Tu …»). */
    label: string;
    /** «Nombre#LAN» */
    placeholder: string;
    /** Cómo encontrarlo. */
    hint: string;
    /** [] = no aplica (platform ''). */
    platforms: readonly { id: string; label: string }[];
    /** [] = no aplica (region ''). Solo sirve para buscar el rango: no entra en la identidad del ID. */
    regions: readonly { id: string; label: string }[];
    /** '' si no aplica. */
    defaultRegion: string;
  };
  /** «Conectar con…» (§8.3): Epic (Rocket League, Fortnite), Steam (CS2) y Riot (LoL y VALORANT, solo con RSO). */
  link: LinkProvider | null;
  /** Tiene búsqueda con API en esports-verify (§8.2): solo LoL y VALORANT (Riot). */
  lookup: boolean;
  /**
   * Cómo se comprueba el ID: 'login' (entrando con su cuenta), 'lookup' (la API del juego lo encuentra) o 'none' (no
   * se puede: el ID y el rango quedan declarados y no son exclusivos). `rank`: el rango sale verificado de la búsqueda
   * (solo LoL). Es la misma tabla que `private.esp_verify_kind` y `private.esp_rank_verifiable`.
   */
  verify: { kind: VerifyKind; rank: boolean };
}

/** Títulos de las tres familias de lógica, en el orden de las listas. */
export const GAME_KIND_LABEL: Readonly<Record<GameKind, string>> = {
  team: 'Por equipos',
  duel: '1 contra 1',
  br: 'Battle royale',
};

const MODE_SIZE: Readonly<Record<Mode, number>> = {
  '1v1': 1,
  solo: 1,
  '2v2': 2,
  duo: 2,
  '3v3': 3,
  trio: 3,
  squad: 4,
  quad: 4,
  '5v5': 5,
};

const MODE_LABEL: Readonly<Record<Mode, string>> = {
  '1v1': '1 contra 1',
  solo: 'Solo',
  '2v2': '2 contra 2',
  duo: 'Dúos',
  '3v3': '3 contra 3',
  trio: 'Tríos',
  squad: 'Escuadras',
  quad: 'Escuadras',
  '5v5': '5 contra 5',
};

/** Todos los modos (el orden de §2.1). */
export const ALL_MODES: readonly Mode[] = ['1v1', '2v2', '3v3', '5v5', 'solo', 'duo', 'trio', 'squad', 'quad'];

const VALORANT_MAPS = [
  { id: 'ascent', name: 'Ascent' },
  { id: 'bind', name: 'Bind' },
  { id: 'haven', name: 'Haven' },
  { id: 'split', name: 'Split' },
  { id: 'lotus', name: 'Lotus' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'icebox', name: 'Icebox' },
  { id: 'breeze', name: 'Breeze' },
  { id: 'abyss', name: 'Abyss' },
  { id: 'pearl', name: 'Pearl' },
  { id: 'fracture', name: 'Fracture' },
  { id: 'corrode', name: 'Corrode' },
] as const;

const CS2_MAPS = [
  { id: 'mirage', name: 'Mirage' },
  { id: 'inferno', name: 'Inferno' },
  { id: 'nuke', name: 'Nuke' },
  { id: 'ancient', name: 'Ancient' },
  { id: 'anubis', name: 'Anubis' },
  { id: 'dust2', name: 'Dust II' },
  { id: 'train', name: 'Train' },
  { id: 'overpass', name: 'Overpass' },
  { id: 'vertigo', name: 'Vertigo' },
] as const;

const NO_LIST: readonly { id: string; label: string }[] = [];

const RIOT_HINT = 'Lo ves en el cliente de Riot, arriba a la derecha: tu nombre, # y el tag (por ejemplo, Nombre#LAN).';
const EPIC_HINT = 'Es tu nombre de Epic Games: sale en tu perfil del juego o en epicgames.com › Cuenta.';

const team = (game: GameId) => ({ id: game, kind: 'team' as const });
const duel = (game: GameId) => ({
  id: game,
  kind: 'duel' as const,
  modes: ['1v1'] as const,
  defaultMode: '1v1' as const,
  maps: [],
  subsMax: { '1v1': 0 },
  link: null,
});
const br = (game: GameId) => ({ id: game, kind: 'br' as const, bestOf: [], defaultBestOf: null, scoring: 'br' as const, pointsWord: 'kills', mapsWord: 'partidas', maps: [] });

export const GAMES: Readonly<Record<GameId, GameMeta>> = {
  valorant: {
    ...team('valorant'),
    name: 'VALORANT',
    mono: 'VAL',
    blurb: '5 contra 5 · mapas a 13 rondas',
    color: '#be123c',
    modes: ['5v5'],
    defaultMode: '5v5',
    bestOf: [1, 3, 5],
    defaultBestOf: { groups: 1, playoffs: 3, final: 5 },
    scoring: 'val',
    pointsWord: 'rondas',
    mapsWord: 'mapas',
    maps: VALORANT_MAPS,
    subsMax: { '5v5': 2 },
    idInfo: {
      kind: 'riot',
      label: 'Riot ID',
      placeholder: 'Nombre#LAN',
      hint: RIOT_HINT,
      platforms: NO_LIST,
      regions: [
        { id: 'latam', label: 'Latinoamérica' },
        { id: 'na', label: 'Norteamérica' },
        { id: 'br', label: 'Brasil' },
        { id: 'eu', label: 'Europa' },
        { id: 'ap', label: 'Asia-Pacífico' },
        { id: 'kr', label: 'Corea' },
      ],
      defaultRegion: 'latam',
    },
    link: 'riot',
    lookup: true,
    verify: { kind: 'lookup', rank: false },
  },
  cs2: {
    ...team('cs2'),
    name: 'Counter-Strike 2',
    mono: 'CS2',
    blurb: '5 contra 5 · mapas a 13 (MR12)',
    color: '#b45309',
    modes: ['5v5'],
    defaultMode: '5v5',
    bestOf: [1, 3, 5],
    defaultBestOf: { groups: 1, playoffs: 3, final: 5 },
    scoring: 'cs',
    pointsWord: 'rondas',
    mapsWord: 'mapas',
    maps: CS2_MAPS,
    subsMax: { '5v5': 2 },
    idInfo: {
      kind: 'steam',
      label: 'Código de amigo de Steam',
      placeholder: '22202',
      hint: 'En Steam: Amigos › Añadir un amigo. Ahí sale tu código de amigo (también sirve tu SteamID64 de 17 dígitos).',
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    link: 'steam',
    lookup: false,
    verify: { kind: 'login', rank: false },
  },
  lol: {
    ...team('lol'),
    name: 'League of Legends',
    mono: 'LoL',
    blurb: '5 contra 5 · por juegos',
    color: '#0f766e',
    modes: ['5v5'],
    defaultMode: '5v5',
    bestOf: [1, 3, 5],
    defaultBestOf: { groups: 1, playoffs: 3, final: 5 },
    scoring: 'win',
    pointsWord: 'kills',
    mapsWord: 'juegos',
    maps: [],
    subsMax: { '5v5': 2 },
    idInfo: {
      kind: 'riot',
      label: 'Riot ID',
      placeholder: 'Nombre#LAN',
      hint: RIOT_HINT,
      platforms: NO_LIST,
      regions: [
        { id: 'la1', label: 'LAN' },
        { id: 'la2', label: 'LAS' },
        { id: 'na1', label: 'NA' },
        { id: 'br1', label: 'Brasil' },
        { id: 'euw1', label: 'EUW' },
        { id: 'eun1', label: 'EUNE' },
        { id: 'kr', label: 'Corea' },
        { id: 'jp1', label: 'Japón' },
        { id: 'oc1', label: 'Oceanía' },
      ],
      defaultRegion: 'la1',
    },
    link: 'riot',
    lookup: true,
    verify: { kind: 'lookup', rank: true },
  },
  mlbb: {
    ...team('mlbb'),
    name: 'Mobile Legends: Bang Bang',
    mono: 'MLBB',
    blurb: '5 contra 5 · por juegos',
    color: '#1d4ed8',
    modes: ['5v5'],
    defaultMode: '5v5',
    bestOf: [1, 3, 5, 7],
    defaultBestOf: { groups: 1, playoffs: 3, final: 5 },
    scoring: 'win',
    pointsWord: 'kills',
    mapsWord: 'juegos',
    maps: [],
    subsMax: { '5v5': 2 },
    idInfo: {
      kind: 'mlbb',
      label: 'ID y zona',
      placeholder: '12345678 (1234)',
      hint: 'Toca tu foto de perfil: debajo de tu nombre salen tu ID y, entre paréntesis, tu zona.',
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    link: null,
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
  rocket_league: {
    ...team('rocket_league'),
    name: 'Rocket League',
    mono: 'RL',
    blurb: 'Por goles · 1v1, 2v2 o 3v3',
    color: '#0369a1',
    modes: ['1v1', '2v2', '3v3'],
    defaultMode: '3v3',
    bestOf: [1, 3, 5, 7],
    defaultBestOf: { groups: 5, playoffs: 5, final: 7 },
    scoring: 'goals_ot',
    pointsWord: 'goles',
    mapsWord: 'juegos',
    maps: [],
    subsMax: { '1v1': 0, '2v2': 1, '3v3': 2 },
    idInfo: {
      kind: 'epic',
      label: 'Epic ID',
      placeholder: 'TuNombreEpic',
      hint: EPIC_HINT,
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    link: 'epic',
    lookup: false,
    verify: { kind: 'login', rank: false },
  },
  ea_fc: {
    ...duel('ea_fc'),
    name: 'EA SPORTS FC',
    mono: 'FC',
    blurb: '1 contra 1 · por goles',
    color: '#15803d',
    bestOf: [1, 3],
    defaultBestOf: { groups: 1, playoffs: 1, final: 3 },
    scoring: 'goals_pen',
    pointsWord: 'goles',
    mapsWord: 'juegos',
    idInfo: {
      kind: 'ea',
      label: 'EA ID',
      placeholder: 'TuEAID',
      hint: 'Es el nombre de tu cuenta de EA: sale en la app de EA o en ea.com › Mi cuenta.',
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
  nba_2k: {
    ...duel('nba_2k'),
    name: 'NBA 2K',
    mono: '2K',
    blurb: '1 contra 1 · por puntos',
    color: '#c2410c',
    bestOf: [1, 3, 5, 7],
    defaultBestOf: { groups: 1, playoffs: 1, final: 3 },
    scoring: 'points',
    pointsWord: 'puntos',
    mapsWord: 'juegos',
    idInfo: {
      kind: 'console',
      label: 'Usuario de la consola',
      placeholder: 'TuUsuario',
      hint: 'Tu usuario de PlayStation Network, Xbox, Steam o Nintendo, según dónde juegues.',
      platforms: [
        { id: 'psn', label: 'PlayStation' },
        { id: 'xbox', label: 'Xbox' },
        { id: 'steam', label: 'Steam' },
        { id: 'switch', label: 'Nintendo Switch' },
      ],
      regions: NO_LIST,
      defaultRegion: '',
    },
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
  sf6: {
    ...duel('sf6'),
    name: 'Street Fighter 6',
    mono: 'SF6',
    blurb: '1 contra 1 · por rondas',
    color: '#7e22ce',
    bestOf: [1, 3, 5],
    defaultBestOf: { groups: 3, playoffs: 3, final: 5 },
    scoring: 'fight',
    pointsWord: 'rondas',
    mapsWord: 'juegos',
    roundsToWin: { default: 2, options: [2] },
    idInfo: {
      kind: 'buckler',
      label: 'User Code',
      placeholder: '1234567890',
      hint: "En el juego: tu perfil de CFN. Son 10 números; también salen en Buckler's Boot Camp.",
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
  tekken8: {
    ...duel('tekken8'),
    name: 'TEKKEN 8',
    mono: 'T8',
    blurb: '1 contra 1 · por rondas',
    color: '#991b1b',
    bestOf: [1, 3, 5],
    defaultBestOf: { groups: 3, playoffs: 3, final: 5 },
    scoring: 'fight',
    pointsWord: 'rondas',
    mapsWord: 'juegos',
    roundsToWin: { default: 3, options: [2, 3] },
    idInfo: {
      kind: 'tekken',
      label: 'TEKKEN ID',
      placeholder: 'abcd-1234-efgh',
      hint: 'En el juego: tu perfil de jugador. Son 12 letras y números en tres grupos de 4.',
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
  smash: {
    ...duel('smash'),
    name: 'Super Smash Bros. Ultimate',
    mono: 'SSBU',
    blurb: '1 contra 1 · por vidas',
    color: '#be185d',
    bestOf: [1, 3, 5],
    defaultBestOf: { groups: 3, playoffs: 3, final: 5 },
    scoring: 'stocks',
    pointsWord: 'vidas',
    mapsWord: 'juegos',
    stocks: { default: 3, min: 1, max: 5 },
    idInfo: {
      kind: 'nintendo',
      label: 'Código de amigo',
      placeholder: 'SW-1234-5678-9012',
      hint: 'En la Switch: toca tu ícono de usuario › Perfil. Empieza con SW-.',
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
  clash_royale: {
    ...duel('clash_royale'),
    name: 'Clash Royale',
    mono: 'CR',
    blurb: '1 contra 1 · por coronas',
    color: '#3730a3',
    bestOf: [1, 3, 5],
    defaultBestOf: { groups: 3, playoffs: 3, final: 5 },
    scoring: 'crowns',
    pointsWord: 'coronas',
    mapsWord: 'juegos',
    idInfo: {
      kind: 'cr',
      label: 'Tag de jugador',
      placeholder: '#2PYLQGR',
      hint: 'Toca tu nombre en el juego: el tag sale debajo y empieza con #.',
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
  free_fire: {
    ...br('free_fire'),
    name: 'Free Fire',
    mono: 'FF',
    blurb: 'Battle royale · puesto + kills',
    color: '#a16207',
    modes: ['solo', 'duo', 'squad'],
    defaultMode: 'squad',
    subsMax: { solo: 0, duo: 1, squad: 1 },
    lobby: { solo: 48, duo: 24, squad: 12 },
    br: { placementPoints: [12, 9, 8, 7, 6, 5, 4, 3, 2, 1], killPoints: 1 },
    idInfo: {
      kind: 'digits',
      label: 'ID de Free Fire',
      placeholder: '123456789',
      hint: 'Toca tu foto de perfil arriba a la izquierda: debajo de tu nombre sale tu ID.',
      platforms: NO_LIST,
      regions: [
        { id: 'na', label: 'Norteamérica' },
        { id: 'sa', label: 'Latinoamérica' },
        { id: 'br', label: 'Brasil' },
      ],
      defaultRegion: '',
    },
    link: null,
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
  fortnite: {
    ...br('fortnite'),
    name: 'Fortnite',
    mono: 'FN',
    blurb: 'Battle royale · puesto + kills',
    color: '#6d28d9',
    modes: ['solo', 'duo', 'trio', 'squad'],
    defaultMode: 'duo',
    subsMax: { solo: 0, duo: 1, trio: 1, squad: 1 },
    lobby: { solo: 100, duo: 50, trio: 33, squad: 25 },
    br: { placementPoints: [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1, 1], killPoints: 1 },
    idInfo: {
      kind: 'epic',
      label: 'Epic ID',
      placeholder: 'TuNombreEpic',
      hint: EPIC_HINT,
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    link: 'epic',
    lookup: false,
    verify: { kind: 'login', rank: false },
  },
  warzone: {
    ...br('warzone'),
    name: 'Call of Duty: Warzone',
    mono: 'WZ',
    blurb: 'Battle royale · puesto + kills',
    color: '#374151',
    modes: ['solo', 'duo', 'trio', 'quad'],
    defaultMode: 'trio',
    subsMax: { solo: 0, duo: 1, trio: 1, quad: 1 },
    lobby: { solo: 100, duo: 75, trio: 50, quad: 37 },
    br: { placementPoints: [10, 8, 6, 5, 4, 3, 2, 1], killPoints: 1 },
    idInfo: {
      kind: 'activision',
      label: 'Activision ID',
      placeholder: 'Nombre#1234567',
      hint: 'En el juego: Social › tu perfil. Es tu nombre, # y un número.',
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    link: null,
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
  pubg_mobile: {
    ...br('pubg_mobile'),
    name: 'PUBG Mobile',
    mono: 'PUBG',
    blurb: 'Battle royale · puesto + kills',
    color: '#854d0e',
    modes: ['solo', 'duo', 'squad'],
    defaultMode: 'squad',
    subsMax: { solo: 0, duo: 1, squad: 1 },
    lobby: { solo: 100, duo: 50, squad: 25 },
    br: { placementPoints: [10, 6, 5, 4, 3, 2, 1, 1], killPoints: 1 },
    idInfo: {
      kind: 'digits',
      label: 'ID de personaje',
      placeholder: '5123456789',
      hint: 'Toca tu foto de perfil: el ID de personaje sale debajo de tu nombre.',
      platforms: NO_LIST,
      regions: NO_LIST,
      defaultRegion: '',
    },
    link: null,
    lookup: false,
    verify: { kind: 'none', rank: false },
  },
};

/** Los 15 juegos en el orden de §2.1 (agrupados por kind: por equipos, 1 contra 1, battle royale). */
export const GAME_IDS: readonly GameId[] = [
  'valorant',
  'cs2',
  'lol',
  'mlbb',
  'rocket_league',
  'ea_fc',
  'nba_2k',
  'sf6',
  'tekken8',
  'smash',
  'clash_royale',
  'free_fire',
  'fortnite',
  'warzone',
  'pubg_mobile',
];

export const isGameId = (v: unknown): v is GameId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(GAMES, v);

export const gameMeta = (id: string | null | undefined): GameMeta | null => (isGameId(id) ? GAMES[id] : null);

export const gamesOfKind = (kind: GameKind): GameMeta[] => GAME_IDS.map((id) => GAMES[id]).filter((g) => g.kind === kind);

/** Cómo se comprueba el ID del juego ('none' si el juego no existe). */
export const verifyKind = (game: GameId): VerifyKind => (isGameId(game) ? GAMES[game].verify.kind : 'none');

/** El ID del juego se puede comprobar (conectando la cuenta o con la búsqueda): «Pedir ID confirmado» tiene sentido. */
export const canVerifyId = (game: GameId): boolean => verifyKind(game) !== 'none';

/** El rango del juego puede salir verificado (solo LoL): «Pedir rango verificado» tiene sentido. */
export const canVerifyRank = (game: GameId): boolean => isGameId(game) && GAMES[game].verify.rank;

export const isMode = (v: unknown): v is Mode => typeof v === 'string' && Object.prototype.hasOwnProperty.call(MODE_SIZE, v);

/** Titulares por lado (§2.1). */
export const modeSize = (mode: Mode): number => MODE_SIZE[mode];

/** Un modo de 1 titular juega como individual (sin equipos de esports; entrada siempre «Libre»). */
export const isIndividualMode = (mode: Mode): boolean => modeSize(mode) === 1;

/** «5 contra 5», «Escuadras»… */
export const modeLabel = (mode: Mode): string => MODE_LABEL[mode];

/** El modo es de ese juego. */
export const modeOk = (game: GameId, mode: string): mode is Mode => (GAMES[game].modes as readonly string[]).includes(mode);

/** Suplentes máximos del juego en ese modo (0 si el modo no es del juego). */
export const subsMaxFor = (game: GameId, mode: Mode): number => GAMES[game].subsMax[mode] ?? 0;

/**
 * Límites de la plantilla de un inscrito: `min` titulares; `max` con los suplentes que permite el torneo (`subs`,
 * por defecto todos los del juego, siempre entre 0 y `subsMax`).
 */
export function rosterLimits(game: GameId, mode: Mode, subs?: number): { min: number; max: number; subsMax: number } {
  const min = modeSize(mode);
  const subsMax = subsMaxFor(game, mode);
  const s = Math.min(Math.max(Math.trunc(subs ?? subsMax), 0), subsMax);
  return { min, max: min + (Number.isFinite(s) ? s : 0), subsMax };
}

/** Máximo de miembros de un equipo de esports del juego: titulares + suplentes del modo más grande (5v5 7, RL 5, BR 5). */
export function teamMaxMembers(game: GameId): number {
  return Math.max(0, ...GAMES[game].modes.map((m) => modeSize(m) + subsMaxFor(game, m)));
}

/** Cupo máximo de un torneo: en BR el lobby del modo; todos contra todos 20; el resto 128. */
export function maxEntries(game: GameId, mode: Mode, format: Format): number {
  if (format === 'br') return GAMES[game].lobby?.[mode] ?? 0;
  if (format === 'round_robin') return 20;
  return 128;
}

/** Cupo mínimo: doble eliminación y grupos + playoffs 4; todos contra todos 3; eliminación simple y BR 2. */
export function minEntries(format: Format): number {
  switch (format) {
    case 'double_elim':
    case 'groups_playoffs':
      return 4;
    case 'round_robin':
      return 3;
    default:
      return 2;
  }
}
