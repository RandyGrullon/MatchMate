// @ts-self-types="./badges-engine.gen.d.ts"
// GENERADO por scripts/badges/bundle.mjs (pnpm badges:bundle): no se edita a mano.
// El motor de las insignias (src/badges/edge.ts y lo que importa: 66 archivos) en un solo ESM sin imports para la
// Edge Function supabase/functions/insignias (Deno). src/badges/bundle.test.ts falla si quedó viejo.
// fuente: sha256-1528c458e17c07cf604926b5e301aa66fe8d18bca567b0a8fd37b6595a573b7b
// salida: sha256-584cb84ad7cbe08372817f32e5042d5d2cb76dffe1b4dfe7f9cdf7f62314115e
// ---
//#region src/sports/types.ts
const SPORT_FAMILY = {
	bowling: "series",
	golf: "series",
	swimming: "series",
	padel: "racket",
	tennis: "racket",
	pickleball: "racket",
	basketball: "team",
	football: "team",
	futsal: "team"
};
//#endregion
//#region src/badges/catalog.ts
/**
* Catálogo de las insignias automáticas (docs/insignias.md §2): la única fuente de keys, nombres, textos, niveles,
* umbrales, rarezas estimadas, forma e ícono. Lo leen la app (textos, progreso, galería) y el motor (umbrales,
* parámetros y qué evaluador corre cada una). Todo puro, sin React: entra en el bundle de Deno.
*
* Todos los deportes están abiertos desde el primer día (no hay lanzamiento por fases).
*
* Plantillas de texto: `{n}` es el valor (el umbral del nivel, o el valor real que guarda `context.values.n`) y el
* resto sale de la evidencia o del deporte (ver `PLACEHOLDERS`). Nunca se nombra al rival.
*
* Historial de umbrales (§3.8): cada cambio se anota aquí con fecha y motivo. Subir un umbral solo afecta lo que se
* gane después; lo ya ganado se queda.
* - 2026-09-29: valores iniciales del diseño.
*/
const ALL_SPORTS = Object.keys(SPORT_FAMILY);
const RACKET = [
	"padel",
	"tennis",
	"pickleball"
];
const TEAM = [
	"basketball",
	"football",
	"futsal"
];
const FOOTBALL = ["football", "futsal"];
/** Deportes con título del mes y del año (una tabla individual que el servidor puede recalcular). */
const FIGURE = [
	"bowling",
	"padel",
	"tennis",
	"pickleball",
	"golf"
];
/** Deportes con progreso contra la línea base (§1.7.6). */
const PROGRESS = [
	"bowling",
	"padel",
	"tennis",
	"pickleball",
	"golf",
	"swimming"
];
/** Niveles 1, 2, 3… con su umbral y la rareza de cada uno ('C PC R E'). */
function tiers(rarities, thresholds, extra = []) {
	const r = rarities.split(" ");
	if (r.length !== thresholds.length) throw new Error("catálogo: rarezas y umbrales no cuadran");
	return thresholds.map((threshold, i) => ({
		level: i + 1,
		threshold,
		rarity: r[i],
		...extra[i]
	}));
}
/** Un solo nivel (el 0, «única»). */
const one = (rarity, threshold) => [threshold === void 0 ? {
	level: 0,
	rarity
} : {
	level: 0,
	rarity,
	threshold
}];
/** Podio: oro = 1.º (nivel 3), plata = 2.º (nivel 2), bronce = 3.º (nivel 1). El umbral es el puesto. */
const podium = (gold, silver, bronze) => [
	{
		level: 1,
		threshold: 3,
		rarity: bronze
	},
	{
		level: 2,
		threshold: 2,
		rarity: silver
	},
	{
		level: 3,
		threshold: 1,
		rarity: gold
	}
];
const units = (singular, plural) => [singular, plural];
const GENERAL = [
	{
		key: "debut",
		group: "general",
		sports: ALL_SPORTS,
		scope: "cuenta",
		period: "siempre",
		category: "bienvenida",
		shape: "hex",
		icon: "sport",
		name: {
			default: "Debut",
			bowling: "Primera línea",
			padel: "Debut en la cancha",
			tennis: "Debut en la cancha",
			pickleball: "Debut en la cancha",
			basketball: "Debut en la cancha",
			football: "Debut en la cancha",
			futsal: "Debut en la cancha",
			golf: "Primera ronda",
			swimming: "Primera prueba"
		},
		description: {
			default: "¡Arrancaste! Tu primer {unidad} de {deporte} ya cuenta.",
			golf: "¡Arrancaste! Tu primera ronda de golf ya cuenta.",
			swimming: "¡Arrancaste! Tu primera prueba de natación ya cuenta."
		},
		how: {
			default: "Juega tu primer {unidad} de {deporte} en una liga.",
			golf: "Juega tu primera ronda de golf en una liga.",
			swimming: "Nada tu primera prueba en una liga."
		},
		compare: "none",
		levels: one("C"),
		evaluator: "debut"
	},
	{
		key: "month_streak",
		group: "general",
		sports: "all",
		scope: "cuenta",
		period: "siempre",
		category: "constancia",
		shape: "circle",
		icon: "flame",
		name: "Constancia",
		description: "{n} meses seguidos jugando. ¡Tú no paras!",
		how: "Juega al menos 2 días cada mes (una ronda de golf o un encuentro de natación bastan), {n} meses seguidos.",
		unit: units("mes", "meses"),
		compare: "gte",
		levels: tiers("C PC R E L", [
			3,
			6,
			12,
			24,
			36
		]),
		params: {
			minWeightedDays: 2,
			wildcardWindow: 12
		},
		evaluator: "month_streak"
	},
	{
		key: "mileage",
		group: "general",
		sports: "all",
		scope: "cuenta",
		period: "siempre",
		category: "lealtad",
		shape: "hex",
		icon: "footprints",
		name: "Kilometraje",
		description: "{n} días jugando en MatchMate.",
		how: "Suma {n} días jugando. Un día de golf o de natación vale 2.",
		unit: units("día", "días"),
		compare: "gte",
		levels: tiers("PC R E", [
			50,
			150,
			300
		]),
		params: {
			maxWeightedPerWeek: 4,
			settleHours: 48
		},
		evaluator: "account_activity"
	},
	{
		key: "strong_start",
		group: "general",
		sports: "all",
		scope: "cuenta",
		period: "siempre",
		category: "bienvenida",
		shape: "hex",
		icon: "rocket",
		name: "Arranque con todo",
		description: "Jugaste {n} días en tu primer mes. ¡Llegaste pa' quedarte!",
		how: "Juega {n} días distintos en tus primeros 30 días.",
		unit: units("día", "días"),
		compare: "gte",
		levels: one("C", 4),
		params: { windowDays: 30 },
		evaluator: "account_activity"
	},
	{
		key: "multisport",
		group: "general",
		sports: "all",
		scope: "cuenta",
		period: "siempre",
		category: "multideporte",
		shape: "hex",
		icon: "infinity",
		name: "Multideporte",
		levelNames: {
			1: "Doble vía",
			2: "Todoterreno",
			3: "Pentatleta"
		},
		description: "Juegas {n} deportes en MatchMate: {deportes}.",
		how: "Juega {n} deportes distintos, al menos 3 días en cada uno.",
		unit: units("deporte", "deportes"),
		compare: "gte",
		levels: tiers("PC R E", [
			2,
			3,
			5
		]),
		params: { minDaysPerSport: 3 },
		evaluator: "account_activity"
	},
	{
		key: "three_worlds",
		group: "general",
		sports: "all",
		scope: "cuenta",
		period: "siempre",
		category: "multideporte",
		shape: "hex",
		icon: "sparkles",
		name: "Tres mundos",
		description: "Juegas de todo: series, raqueta y equipo.",
		how: "Juega al menos 3 días en un deporte de series (boliche, golf o natación), en uno de raqueta y en uno de equipo.",
		compare: "none",
		levels: one("E"),
		params: { minDaysPerSport: 3 },
		evaluator: "account_activity"
	},
	{
		key: "anniversary",
		group: "general",
		sports: "all",
		scope: "cuenta",
		period: "aniversario",
		category: "lealtad",
		shape: "circle",
		icon: "cake",
		name: "Aniversario",
		description: "{n} años jugando en MatchMate. ¡Gracias por estar!",
		levelDescriptions: { 1: "Un año jugando en MatchMate. ¡Gracias por estar!" },
		how: "Cumple {n} año(s) en MatchMate jugando al menos 12 días en el último año.",
		unit: units("año", "años"),
		compare: "gte",
		levels: tiers("C PC R", [
			1,
			2,
			5
		]),
		params: { minWeightedDays: 12 },
		accountOnly: true,
		evaluator: "account_activity"
	},
	{
		key: "climbing",
		group: "general",
		sports: ["bowling", "golf"],
		scope: "cuenta",
		period: "siempre",
		category: "mejora",
		shape: "hex",
		icon: "mountain",
		name: "Subiendo",
		description: {
			bowling: "Tu promedio subió {n} pinos desde que empezaste. ¡Se nota el trabajo!",
			golf: "Bajaste {n} golpes desde tus primeras rondas."
		},
		how: {
			bowling: "Sube {n} pinos entre la media de tus primeros 18 juegos y la de tus últimos 18.",
			golf: "Baja {n} golpes entre el diferencial de tus primeras 5 rondas de 18 hoyos y el de tus últimas 5."
		},
		unit: {
			bowling: units("pino", "pinos"),
			golf: units("golpe", "golpes")
		},
		compare: "gte",
		levels: tiers("PC R E", [
			{
				bowling: 5,
				golf: 2
			},
			{
				bowling: 10,
				golf: 4
			},
			{
				bowling: 20,
				golf: 6
			}
		]),
		params: {
			window: {
				bowling: 18,
				golf: 5
			},
			minCount: {
				bowling: 36,
				golf: 10
			}
		},
		evaluator: "climbing"
	},
	{
		key: "event_podium",
		group: "general",
		sports: [
			"bowling",
			"padel",
			"tennis",
			"pickleball",
			"basketball",
			"football",
			"futsal",
			"golf"
		],
		scope: "liga",
		period: "evento",
		category: "resultados",
		shape: "shield",
		icon: "trophy",
		name: "Podio",
		levelNames: {
			3: "Primer lugar",
			2: "Segundo lugar",
			1: "Tercer lugar"
		},
		description: "Te subiste al podio de {evento}.",
		levelDescriptions: {
			3: "Ganaste {evento}.",
			2: "Quedaste en segundo lugar en {evento}.",
			1: "Te subiste al podio de {evento}."
		},
		how: "Termina entre los tres primeros de un torneo de tu liga, con campo suficiente.",
		compare: "place",
		levels: podium("R", "R", "PC"),
		params: {
			minPlayers: { bowling: 6 },
			minAccounts: { golf: 4 },
			graceHours: {
				default: 48,
				bowling: 72,
				golf: 24
			}
		},
		repeatable: true,
		title: true,
		evaluator: "event_podium"
	}
];
const BOWLING = [
	{
		key: "bowling_games",
		group: "bowling",
		sports: ["bowling"],
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "sport",
		name: "Líneas jugadas",
		description: "Ya llevas {n} juegos que cuentan.",
		how: "Juega {n} juegos que cuenten (con foto o aprobados).",
		unit: units("juego", "juegos"),
		compare: "gte",
		levels: tiers("C PC R E", [
			30,
			100,
			300,
			1e3
		]),
		params: { maxPerDay: 10 },
		evaluator: "bowling_career"
	},
	{
		key: "bowling_breakthrough",
		group: "bowling",
		sports: ["bowling"],
		scope: "cuenta",
		period: "siempre",
		category: "mejora",
		shape: "hex",
		icon: "trending-up",
		name: "Rompe barreras",
		description: "Pasaste los {n} por primera vez. ¡Eso va pa'rriba!",
		how: "Tira un juego de {n} o más.",
		unit: units("pino", "pinos"),
		compare: "gte",
		levels: tiers("C C PC", [
			125,
			150,
			175
		]),
		privateByDefault: true,
		evaluator: "bowling_career"
	},
	{
		key: "bowling_club",
		group: "bowling",
		sports: ["bowling"],
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "crown",
		name: "Club de los 200",
		levelNames: {
			1: "Club 200",
			2: "Club 225",
			3: "Club 250",
			4: "Club 275"
		},
		description: "Entraste al club de los {n}.",
		how: "Tira un juego de {n} o más (desde 250, con foto).",
		unit: units("pino", "pinos"),
		compare: "gte",
		levels: tiers("PC R E L", [
			200,
			225,
			250,
			275
		], [
			void 0,
			void 0,
			{ strict: true },
			{ strict: true }
		]),
		evaluator: "bowling_career"
	},
	{
		key: "bowling_perfect_game",
		group: "bowling",
		sports: ["bowling"],
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "gem",
		name: "Juego perfecto",
		description: "300. Doce strikes seguidos. Leyenda.",
		how: "Tira un juego perfecto de 300 con foto del marcador. Tu liga lo confirma.",
		compare: "gte",
		levels: [{
			level: 0,
			threshold: 300,
			rarity: "L",
			strict: true
		}],
		repeatable: true,
		aval: true,
		evaluator: "bowling_game"
	},
	{
		key: "bowling_series",
		group: "bowling",
		sports: ["bowling"],
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "zap",
		name: "Serie de tres",
		description: "Sumaste {n} en tres juegos seguidos.",
		how: "Suma {n} o más en tres juegos seguidos de un mismo evento.",
		unit: units("pino", "pinos"),
		compare: "gte",
		levels: tiers("PC R E", [
			500,
			575,
			650
		], [
			void 0,
			void 0,
			{ strict: true }
		]),
		evaluator: "bowling_career"
	},
	{
		key: "bowling_over_average",
		group: "bowling",
		sports: ["bowling"],
		scope: "cuenta",
		period: "siempre",
		category: "mejora",
		shape: "hex",
		icon: "rocket",
		name: "Por encima de ti",
		description: "Tiraste {n} pinos por encima de tu promedio.",
		how: "Tira un juego {n} pinos por encima de tu promedio (se mide con tus últimos 30 juegos; necesitas 12).",
		unit: units("pino", "pinos"),
		compare: "gte",
		levels: tiers("C PC R", [
			25,
			40,
			60
		], [
			void 0,
			void 0,
			{ strict: true }
		]),
		params: {
			minBaseGames: 12,
			baseWindow: 30
		},
		evaluator: "bowling_career"
	},
	{
		key: "bowling_strike_streak",
		group: "bowling",
		sports: ["bowling"],
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "flame",
		name: "Racha de strikes",
		levelNames: {
			1: "Pavo",
			2: "Six-pack",
			3: "Nueve seguidos"
		},
		description: "Metiste {n} strikes seguidos en un juego.",
		how: "Mete {n} strikes seguidos en un juego anotado bola por bola.",
		unit: units("strike", "strikes"),
		compare: "gte",
		levels: tiers("PC E L", [
			3,
			6,
			9
		], [
			void 0,
			void 0,
			{ strict: true }
		]),
		evaluator: "bowling_career"
	},
	{
		key: "bowling_clean_game",
		group: "bowling",
		sports: ["bowling"],
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "badge-check",
		name: "Cero abiertos",
		description: "Un juego entero sin dejar cuadro abierto.",
		how: "Termina un juego anotado bola por bola sin dejar ningún cuadro abierto.",
		compare: "none",
		levels: one("R"),
		repeatable: true,
		evaluator: "bowling_game"
	},
	{
		key: "bowling_split",
		group: "bowling",
		sports: ["bowling"],
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "crosshair",
		name: "Split convertido",
		description: "Te paraste frente a un split y lo tumbaste.",
		how: "Convierte un split en un juego donde anotes qué pinos tumbas.",
		compare: "none",
		levels: one("R"),
		repeatable: true,
		evaluator: "bowling_game"
	},
	{
		key: "bowling_seven_ten",
		group: "bowling",
		sports: ["bowling"],
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "target",
		name: "El 7-10",
		description: "Convertiste el 7-10. Casi nadie lo logra.",
		how: "Convierte el 7-10 con foto del marcador y los pinos anotados. Tu liga lo confirma.",
		compare: "none",
		levels: [{
			level: 0,
			rarity: "L",
			strict: true
		}],
		repeatable: true,
		aval: true,
		evaluator: "bowling_game"
	},
	{
		key: "bowling_category_win",
		group: "bowling",
		sports: ["bowling"],
		scope: "liga",
		period: "evento",
		category: "resultados",
		shape: "shield",
		icon: "medal",
		name: "Mejor de tu categoría",
		description: "Nadie te ganó en la categoría {categoria} de {evento}.",
		how: "Gana tu categoría (A, B, C o D) en un torneo con 4 o más jugadores en ella.",
		compare: "none",
		levels: one("PC"),
		params: {
			minInCategory: 4,
			sandbagPins: 15
		},
		repeatable: true,
		title: true,
		evaluator: "bowling_event"
	},
	{
		key: "bowling_team_win",
		group: "bowling",
		sports: ["bowling"],
		scope: "liga",
		period: "evento",
		category: "resultados",
		shape: "shield",
		icon: "users-round",
		name: "Título por equipos",
		description: "Tu equipo ganó {evento}.",
		how: "Gana un torneo por equipos con 3 o más equipos.",
		compare: "none",
		levels: one("R"),
		params: {
			minTeams: 3,
			minMembers: 2
		},
		repeatable: true,
		title: true,
		evaluator: "bowling_event"
	}
];
const RACKET_BADGES = [
	{
		key: "racket_matches",
		group: "racket",
		sports: RACKET,
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "sport",
		name: "Partidos jugados",
		description: "Ya llevas {n} partidos de {deporte}.",
		how: "Juega {n} partidos que cuenten (americano incluido; sin W.O.).",
		unit: units("partido", "partidos"),
		compare: "gte",
		levels: tiers("C PC R E", [
			10,
			30,
			75,
			150
		]),
		params: { maxPerDay: 4 },
		evaluator: "racket_career"
	},
	{
		key: "racket_wins",
		group: "racket",
		sports: RACKET,
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "award",
		name: "Victorias",
		description: "Ya llevas {n} victorias.",
		how: "Gana {n} partidos a sets que confirme el rival (máximo 3 por mes contra el mismo).",
		unit: units("victoria", "victorias"),
		compare: "gte",
		levels: tiers("C PC R E", [
			5,
			15,
			40,
			100
		]),
		params: { maxPerRivalMonth: 3 },
		evaluator: "racket_career"
	},
	{
		key: "racket_win_streak",
		group: "racket",
		sports: RACKET,
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "circle",
		icon: "flame",
		name: "Racha ganadora",
		description: "Ganaste {n} partidos seguidos.",
		how: "Gana {n} partidos seguidos contra al menos 2 rivales distintos (3 para el oro).",
		unit: units("partido", "partidos"),
		compare: "gte",
		levels: tiers("PC R E", [
			3,
			5,
			8
		], [
			{ req: { rivals: 2 } },
			{ req: { rivals: 2 } },
			{ req: { rivals: 3 } }
		]),
		evaluator: "racket_career"
	},
	{
		key: "racket_bagel",
		group: "racket",
		sports: RACKET,
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "target",
		name: {
			default: "Rosco",
			padel: "Set en blanco",
			tennis: "Set en blanco",
			pickleball: "Juego en blanco"
		},
		description: {
			default: "Ganaste un set 6-0.",
			pickleball: "Ganaste un juego sin que te anotaran."
		},
		how: {
			default: "Gana un set sin ceder un juego, en un partido confirmado.",
			pickleball: "Gana un juego sin que el rival anote, en un partido confirmado."
		},
		compare: "none",
		levels: one({
			padel: "PC",
			tennis: "PC",
			pickleball: "R"
		}),
		repeatable: true,
		evaluator: "racket_match"
	},
	{
		key: "racket_comeback",
		group: "racket",
		sports: RACKET,
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "repeat",
		name: "Remontada",
		description: {
			default: "Perdiste el primer set y le diste la vuelta.",
			pickleball: "Perdiste el primer juego y le diste la vuelta."
		},
		how: {
			default: "Gana un partido después de perder el primer set, sin retiro.",
			pickleball: "Gana un partido después de perder el primer juego, sin retiro."
		},
		compare: "none",
		levels: one("PC"),
		repeatable: true,
		evaluator: "racket_match"
	},
	{
		key: "racket_tiebreaks",
		group: "racket",
		sports: RACKET,
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "zap",
		name: {
			default: "Sangre fría",
			pickleball: "Al filo"
		},
		description: {
			default: "Ganaste {n} tie-breaks.",
			pickleball: "Ganaste {n} juegos que se fueron más allá de {tope}."
		},
		how: {
			default: "Gana {n} tie-breaks en partidos confirmados.",
			pickleball: "Gana {n} juegos que se vayan más allá de los puntos del juego."
		},
		unit: {
			default: units("tie-break", "tie-breaks"),
			pickleball: units("juego", "juegos")
		},
		compare: "gte",
		levels: tiers("PC R E", [
			3,
			10,
			25
		]),
		evaluator: "racket_career"
	},
	{
		key: "racket_upset",
		group: "racket",
		sports: RACKET,
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "rocket",
		name: "Batacazo",
		description: "Le ganaste a alguien con mucho mejor récord que tú.",
		how: "Gánale a alguien con 10 o más partidos y al menos 25 puntos más de % de victorias que tú.",
		compare: "none",
		levels: one("R"),
		params: {
			minRivalMatches: 10,
			minOwnMatches: 5,
			pctGap: 25
		},
		repeatable: true,
		evaluator: "racket_match"
	},
	{
		key: "racket_partners",
		group: "racket",
		sports: RACKET,
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "handshake",
		name: "Buena química",
		description: "Has ganado con {n} compañeros distintos.",
		how: "Gana partidos de dobles con {n} compañeros distintos.",
		unit: units("compañero", "compañeros"),
		compare: "gte",
		levels: tiers("PC R", [3, 8]),
		evaluator: "racket_career"
	},
	{
		key: "racket_ladder_climber",
		group: "racket",
		sports: RACKET,
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "trending-up",
		name: "Escalando",
		description: "Ganaste {n} retos subiendo en la escalera.",
		levelDescriptions: { 1: "Ganaste tu primer reto subiendo en la escalera." },
		how: "Gana {n} retos como retador en la escalera, en partidos confirmados.",
		unit: units("reto", "retos"),
		compare: "gte",
		levels: tiers("PC R E", [
			1,
			5,
			15
		]),
		evaluator: "racket_career"
	},
	{
		key: "racket_night_champion",
		group: "racket",
		sports: ["padel", "pickleball"],
		scope: "liga",
		period: "evento",
		category: "resultados",
		shape: "shield",
		icon: "moon-star",
		name: "Figura de la noche",
		description: "Nadie sumó más puntos que tú en la noche de {formato}.",
		how: "Suma más puntos que nadie en una noche de americano o mexicano de 8 o más jugadores.",
		compare: "none",
		levels: one("R"),
		params: {
			minPlayers: 8,
			minAccounts: 6,
			minWriters: 2,
			closeHours: 24
		},
		repeatable: true,
		title: true,
		evaluator: "racket_night"
	}
];
const TEAM_BADGES = [
	{
		key: "team_matches",
		group: "team",
		sports: TEAM,
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "sport",
		name: "Partidos jugados",
		description: "Ya llevas {n} partidos.",
		how: "Juega {n} partidos en los que salgas en la alineación o el acta.",
		unit: units("partido", "partidos"),
		compare: "gte",
		levels: tiers("C PC R E", [
			5,
			15,
			40,
			100
		]),
		evaluator: "team_career"
	},
	{
		key: "team_wins",
		group: "team",
		sports: TEAM,
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "award",
		name: "Victorias",
		description: "Tu equipo ha ganado {n} partidos contigo en cancha.",
		how: "Gana {n} partidos con tu equipo, jugando tú (máximo 2 por mes contra el mismo equipo).",
		unit: units("victoria", "victorias"),
		compare: "gte",
		levels: tiers("C PC R E", [
			5,
			15,
			40,
			100
		]),
		params: { maxPerTeamMonth: 2 },
		evaluator: "team_career"
	},
	{
		key: "team_unbeaten",
		group: "team",
		sports: TEAM,
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "circle",
		icon: "flame",
		name: {
			default: "Invicto",
			basketball: "Racha ganadora"
		},
		description: {
			default: "{n} partidos seguidos sin perder contigo en cancha.",
			basketball: "{n} partidos seguidos ganando contigo en cancha."
		},
		how: {
			default: "Juega {n} partidos seguidos sin perder.",
			basketball: "Gana {n} partidos seguidos jugando tú."
		},
		unit: units("partido", "partidos"),
		compare: "gte",
		levels: tiers("PC R E", [
			3,
			5,
			8
		]),
		evaluator: "team_career"
	},
	{
		key: "team_comeback",
		group: "team",
		sports: TEAM,
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "repeat",
		name: "Remontada",
		description: "Tu equipo iba perdiendo y lo ganó.",
		how: {
			default: "Gana un partido que tu equipo perdía al medio tiempo o por 2 goles.",
			basketball: "Gana un partido que tu equipo perdía por 8 o más al medio tiempo."
		},
		compare: "none",
		levels: one("R"),
		params: { deficit: {
			basketball: 8,
			football: 2,
			futsal: 2
		} },
		repeatable: true,
		excludeVariants: ["basketball3x3"],
		evaluator: "team_match"
	}
];
const BASKETBALL = [
	{
		key: "basketball_first_basket",
		group: "basketball",
		sports: ["basketball"],
		scope: "cuenta",
		period: "siempre",
		category: "bienvenida",
		shape: "hex",
		icon: "sport",
		name: "Tu primera canasta",
		description: "¡Anotaste tu primer punto!",
		how: "Anota tu primer punto en un partido.",
		compare: "gte",
		levels: one("C", 1),
		evaluator: "basketball_career"
	},
	{
		key: "basketball_points_game",
		group: "basketball",
		sports: ["basketball"],
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "flame",
		name: "Noche de anotación",
		description: "Metiste {n} puntos en un partido.",
		how: "Mete {n} puntos en un partido.",
		unit: units("punto", "puntos"),
		compare: "gte",
		levels: tiers("C PC R", [
			{
				basketball: 10,
				basketball3x3: 6
			},
			{
				basketball: 20,
				basketball3x3: 10
			},
			{
				basketball: 30,
				basketball3x3: 14
			}
		]),
		evaluator: "basketball_career"
	},
	{
		key: "basketball_points",
		group: "basketball",
		sports: ["basketball"],
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "target",
		name: "Punto a punto",
		description: "Ya llevas {n} puntos.",
		how: "Suma {n} puntos en partidos.",
		unit: units("punto", "puntos"),
		compare: "gte",
		levels: tiers("C PC E", [
			50,
			250,
			1e3
		]),
		evaluator: "basketball_career"
	},
	{
		key: "basketball_threes_game",
		group: "basketball",
		sports: ["basketball"],
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "crosshair",
		name: "Mano caliente",
		description: "Metiste {n} triples en un partido.",
		how: "Mete {n} triples en un partido.",
		unit: units("triple", "triples"),
		compare: "gte",
		levels: tiers("PC E", [3, 6]),
		excludeVariants: ["basketball3x3"],
		evaluator: "basketball_career"
	},
	{
		key: "basketball_threes",
		group: "basketball",
		sports: ["basketball"],
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "zap",
		name: "Desde lejos",
		description: "Ya llevas {n} triples.",
		how: "Suma {n} triples en partidos.",
		unit: units("triple", "triples"),
		compare: "gte",
		levels: tiers("PC R", [10, 50]),
		excludeVariants: ["basketball3x3"],
		evaluator: "basketball_career"
	},
	{
		key: "basketball_triple_threat",
		group: "basketball",
		sports: ["basketball"],
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "sparkles",
		name: "Triple amenaza",
		description: "En un mismo partido anotaste de 1, de 2 y de 3, con 15 o más.",
		how: "En un mismo partido, anota de 1, de 2 y de 3 y llega a {n} puntos.",
		compare: "gte",
		levels: one("PC", 15),
		repeatable: true,
		excludeVariants: ["basketball3x3"],
		evaluator: "basketball_match"
	},
	{
		key: "basketball_clean_hands",
		group: "basketball",
		sports: ["basketball"],
		scope: "liga",
		period: "evento",
		category: "juego_limpio",
		shape: "square",
		icon: "hand-heart",
		name: "Manos limpias",
		description: "{n} puntos o más sin cometer faltas.",
		how: "Anota {n} puntos o más en un partido sin cometer faltas.",
		compare: "gte",
		levels: one("PC", {
			basketball: 12,
			basketball3x3: 8
		}),
		params: { minMatchFouls: 4 },
		repeatable: true,
		evaluator: "basketball_match"
	},
	{
		key: "basketball_game_leader",
		group: "basketball",
		sports: ["basketball"],
		scope: "liga",
		period: "evento",
		category: "resultados",
		shape: "shield",
		icon: "crown",
		name: "Líder del partido",
		description: "Nadie anotó más que tú en el partido.",
		how: "Sé quien más anota en un partido, con {n} puntos o más.",
		compare: "gte",
		levels: one("PC", {
			basketball: 10,
			basketball3x3: 6
		}),
		params: { maxLinesChars: 2800 },
		repeatable: true,
		title: true,
		evaluator: "basketball_match"
	}
];
const FOOTBALL_BADGES = [
	{
		key: "football_first_goal",
		group: "football",
		sports: FOOTBALL,
		scope: "cuenta",
		period: "siempre",
		category: "bienvenida",
		shape: "hex",
		icon: "goal",
		name: "Primer gol",
		description: "¡Tu primer gol!",
		how: "Mete tu primer gol en un partido.",
		compare: "gte",
		levels: one({
			football: "PC",
			futsal: "C"
		}, 1),
		evaluator: "football_career"
	},
	{
		key: "football_goals",
		group: "football",
		sports: FOOTBALL,
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "sport",
		name: "Gol a gol",
		description: "Ya llevas {n} goles.",
		how: "Mete {n} goles en partidos.",
		unit: units("gol", "goles"),
		compare: "gte",
		levels: tiers("PC R E", [
			{
				football: 5,
				futsal: 10
			},
			{
				football: 20,
				futsal: 40
			},
			{
				football: 50,
				futsal: 100
			}
		]),
		evaluator: "football_career"
	},
	{
		key: "football_goals_in_match",
		group: "football",
		sports: FOOTBALL,
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "flame",
		name: "Noche goleadora",
		levelNames: {
			1: {
				football: "Doblete",
				futsal: "Hat-trick"
			},
			2: {
				football: "Hat-trick",
				futsal: "Póker"
			},
			3: {
				football: "Póker",
				futsal: "Manita"
			},
			4: {
				football: "Manita",
				futsal: "Media docena"
			}
		},
		description: "¡{nivel}! {n} goles en un partido.",
		how: "Mete {n} goles en un mismo partido.",
		unit: units("gol", "goles"),
		compare: "gte",
		levels: tiers("PC R E L", [
			{
				football: 2,
				futsal: 3
			},
			{
				football: 3,
				futsal: 4
			},
			{
				football: 4,
				futsal: 5
			},
			{
				football: 5,
				futsal: 6
			}
		]),
		evaluator: "football_career"
	},
	{
		key: "football_assists",
		group: "football",
		sports: FOOTBALL,
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "handshake",
		name: "Pase gol",
		description: "Ya llevas {n} asistencias.",
		how: "Da {n} asistencias de gol (cuentan las que anota el acta).",
		unit: units("asistencia", "asistencias"),
		compare: "gte",
		levels: tiers("PC R", [{
			football: 5,
			futsal: 10
		}, {
			football: 20,
			futsal: 30
		}]),
		evaluator: "football_career"
	},
	{
		key: "football_clean_sheet",
		group: "football",
		sports: FOOTBALL,
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "badge-check",
		name: "Valla invicta",
		description: "Terminaste {n} partidos sin recibir goles.",
		levelDescriptions: { 1: "Terminaste un partido sin recibir goles." },
		how: "Juega de portero y termina {n} partidos sin recibir goles.",
		unit: units("partido", "partidos"),
		compare: "gte",
		levels: tiers("PC R E", [
			1,
			5,
			15
		]),
		evaluator: "football_career"
	},
	{
		key: "football_late_winner",
		group: "football",
		sports: FOOTBALL,
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "timer",
		name: "Gol del triunfo",
		description: "Metiste el gol que ganó el partido al final.",
		how: "Mete el gol que le da la victoria a tu equipo en el último 10 % del partido o en la prórroga.",
		compare: "none",
		levels: one("E"),
		params: { lateShare: .9 },
		repeatable: true,
		evaluator: "football_match"
	},
	{
		key: "football_shootout_win",
		group: "football",
		sports: FOOTBALL,
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "target",
		name: "Nervios de acero",
		description: "Ganaron en penales.",
		how: "Gana una tanda de penales jugando el partido.",
		compare: "none",
		levels: one("R"),
		repeatable: true,
		evaluator: "football_match"
	}
];
const GOLF = [
	{
		key: "golf_rounds",
		group: "golf",
		sports: ["golf"],
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "sport",
		name: "Rondas jugadas",
		description: "Ya llevas {n} rondas.",
		how: "Juega {n} rondas con tarjeta firmada (una de 9 hoyos vale media).",
		unit: units("ronda", "rondas"),
		compare: "gte",
		levels: tiers("C PC R", [
			5,
			20,
			60
		]),
		params: { maxPerDay: 1 },
		evaluator: "golf_career"
	},
	{
		key: "golf_birdies",
		group: "golf",
		sports: ["golf"],
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "bird",
		name: "Birdies",
		description: "Ya llevas {n} birdies.",
		levelDescriptions: { 1: "¡Tu primer birdie!" },
		how: "Haz {n} birdies (un golpe bajo par) en tarjetas firmadas.",
		unit: units("birdie", "birdies"),
		compare: "gte",
		levels: tiers("PC R E", [
			1,
			10,
			50
		], [{ strict: true }]),
		evaluator: "golf_career"
	},
	{
		key: "golf_eagle",
		group: "golf",
		sports: ["golf"],
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "sparkles",
		name: "Águila",
		description: "Dos bajo par en un hoyo.",
		how: "Haz dos golpes bajo par en un hoyo, con marcador en tu grupo.",
		compare: "none",
		levels: one("E"),
		alts: { albatross: {
			name: "¡Albatros!",
			description: "Tres bajo par en un hoyo.",
			aval: true
		} },
		repeatable: true,
		evaluator: "golf_card"
	},
	{
		key: "golf_hole_in_one",
		group: "golf",
		sports: ["golf"],
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "flag-triangle-right",
		name: "Hoyo en uno",
		description: "¡Hoyo en uno! Esto se celebra.",
		how: "Mete la bola de un golpe, con marcador en tu grupo. Tu liga lo confirma.",
		compare: "none",
		levels: one("L"),
		repeatable: true,
		aval: true,
		evaluator: "golf_card"
	},
	{
		key: "golf_break_barrier",
		group: "golf",
		sports: ["golf"],
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "zap",
		name: "Rompiste la barrera",
		description: "Hiciste una ronda de {hoyos} por debajo de {n}.",
		how: "Haz una ronda por debajo de {n} golpes, sin levantar la bola.",
		unit: units("golpe", "golpes"),
		compare: "lt",
		levels: tiers("C PC R E", [
			{
				golf: 110,
				golf9: 55
			},
			{
				golf: 100,
				golf9: 50
			},
			{
				golf: 90,
				golf9: 45
			},
			{
				golf: 80,
				golf9: 40
			}
		]),
		evaluator: "golf_career"
	},
	{
		key: "golf_par_round",
		group: "golf",
		sports: ["golf"],
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "gem",
		name: "Ronda en par",
		description: "18 hoyos en par o mejor.",
		how: "Juega 18 hoyos en par o mejor, sin levantar la bola. Tu liga lo confirma.",
		compare: "none",
		levels: one("L"),
		repeatable: true,
		aval: true,
		evaluator: "golf_card"
	},
	{
		key: "golf_stableford",
		group: "golf",
		sports: ["golf"],
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "star",
		name: "Stableford",
		description: "Sumaste {n} puntos Stableford netos.",
		how: "Suma {n} puntos Stableford netos en una ronda.",
		unit: units("punto", "puntos"),
		compare: "gte",
		levels: tiers("PC R E", [
			{
				golf: 32,
				golf9: 16
			},
			{
				golf: 36,
				golf9: 18
			},
			{
				golf: 40,
				golf9: 20
			}
		]),
		evaluator: "golf_career"
	},
	{
		key: "golf_no_disaster",
		group: "golf",
		sports: ["golf"],
		scope: "liga",
		period: "evento",
		category: "constancia",
		shape: "circle",
		icon: "badge-check",
		name: "Ronda sin tropiezos",
		description: "18 hoyos sin pasar de doble bogey.",
		how: "Juega 18 hoyos sin pasar de doble bogey en ninguno.",
		compare: "none",
		levels: one("R"),
		repeatable: true,
		evaluator: "golf_card"
	},
	{
		key: "golf_birdie_collection",
		group: "golf",
		sports: ["golf"],
		scope: "cuenta",
		period: "siempre",
		category: "marcas",
		shape: "star",
		icon: "bird",
		name: "Colección de birdies",
		description: "Birdie en par 3, par 4 y par 5.",
		how: "Haz al menos un birdie en un par 3, en un par 4 y en un par 5.",
		compare: "none",
		levels: one("R"),
		evaluator: "golf_career"
	},
	{
		key: "golf_course_best",
		group: "golf",
		sports: ["golf"],
		scope: "liga",
		period: "evento",
		category: "mejora",
		shape: "hex",
		icon: "mountain",
		name: "Récord personal en el campo",
		description: "Bajaste tu mejor score en {campo}.",
		how: "Mejora tu mejor score en un campo donde ya jugaste 2 rondas desde la misma salida.",
		compare: "none",
		levels: one("PC"),
		params: { minPriorRounds: 2 },
		repeatable: true,
		evaluator: "golf_card"
	}
];
const SWIMMING = [
	{
		key: "swim_races",
		group: "swimming",
		sports: ["swimming"],
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "sport",
		name: "Pruebas nadadas",
		description: "Ya llevas {n} pruebas.",
		how: "Nada {n} pruebas en encuentros.",
		unit: units("prueba", "pruebas"),
		compare: "gte",
		levels: tiers("C PC R", [
			10,
			40,
			100
		]),
		evaluator: "swim_career"
	},
	{
		key: "swim_personal_best",
		group: "swimming",
		sports: ["swimming"],
		scope: "cuenta",
		period: "siempre",
		category: "mejora",
		shape: "hex",
		icon: "timer",
		name: "Marca personal",
		description: "Ya bajaste tu marca personal {n} veces.",
		levelDescriptions: { 1: "Bajaste tu marca en {prueba}." },
		how: "Baja tu mejor tiempo en una prueba que ya nadaste, {n} veces.",
		unit: units("marca", "marcas"),
		compare: "gte",
		levels: tiers("C PC R", [
			1,
			5,
			20
		]),
		evaluator: "swim_career"
	},
	{
		key: "swim_big_drop",
		group: "swimming",
		sports: ["swimming"],
		scope: "cuenta",
		period: "siempre",
		category: "mejora",
		shape: "hex",
		icon: "zap",
		name: "Bajón de tiempo",
		description: "Mejoraste tu marca un {n} % de un golpe.",
		how: "Baja tu marca un {n} % de una vez (contra una marca de hace 3 semanas o más).",
		compare: "gte",
		levels: tiers("C PC R", [
			2,
			4,
			7
		]),
		params: { minDaysSincePrevious: 21 },
		evaluator: "swim_career"
	},
	{
		key: "swim_four_strokes",
		group: "swimming",
		sports: ["swimming"],
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "waves",
		name: "Los cuatro estilos",
		description: "Nadaste libre, espalda, pecho y mariposa en competencia.",
		how: "Nada al menos una prueba de libre, de espalda, de pecho y de mariposa.",
		compare: "none",
		levels: one("PC"),
		evaluator: "swim_career"
	},
	{
		key: "swim_distance",
		group: "swimming",
		sports: ["swimming"],
		scope: "cuenta",
		period: "siempre",
		category: "hitos",
		shape: "hex",
		icon: "anchor",
		name: "Fondista",
		description: "Completaste {n} m libre en competencia.",
		how: "Completa una prueba de {n} m libre o más.",
		unit: units("metro", "metros"),
		compare: "gte",
		levels: tiers("R E L", [
			400,
			800,
			1500
		]),
		evaluator: "swim_career"
	},
	{
		key: "swim_medal",
		group: "swimming",
		sports: ["swimming"],
		scope: "liga",
		period: "evento",
		category: "resultados",
		shape: "shield",
		icon: "medal",
		name: "Medalla",
		levelNames: {
			3: "Oro",
			2: "Plata",
			1: "Bronce"
		},
		description: "{nivel} en {prueba}.",
		how: "Termina entre los tres primeros de tu grupo en una prueba de un encuentro.",
		compare: "place",
		levels: podium("PC", "PC", "C"),
		params: {
			goldMin: 3,
			silverMin: 4,
			bronzeMin: 5
		},
		repeatable: true,
		title: true,
		evaluator: "swim_meet"
	},
	{
		key: "swim_record",
		group: "swimming",
		sports: ["swimming"],
		scope: "liga",
		period: "evento",
		category: "marcas",
		shape: "star",
		icon: "crown",
		name: "Récord",
		levelNames: {
			2: "Récord del club",
			3: "Récord de la liga"
		},
		description: "El tiempo más rápido de la liga en {prueba}.",
		levelDescriptions: {
			2: "El tiempo más rápido de tu club en {prueba}.",
			3: "El tiempo más rápido de la liga en {prueba}."
		},
		how: "Nada más rápido que todos los tiempos anteriores de tu club o de la liga en una prueba.",
		compare: "none",
		levels: [{
			level: 2,
			rarity: "R",
			req: {
				minTimes: 3,
				minSwimmers: 2
			}
		}, {
			level: 3,
			rarity: "E",
			req: {
				minTimes: 5,
				minSwimmers: 3
			}
		}],
		repeatable: true,
		evaluator: "swim_meet"
	}
];
const MONTHLY = [
	{
		key: "player_of_month",
		group: "mensual",
		sports: FIGURE,
		scope: "liga",
		period: "mes",
		category: "resultados",
		shape: "medal",
		icon: "star",
		name: "Figura del mes",
		description: "Fuiste la figura de {liga} en {mes}: {valor}.",
		how: "Sé el mejor de tu liga en el mes (promedio, victorias o diferencial), con el mínimo de juegos.",
		compare: "none",
		levels: one("E"),
		params: {
			minGames: { bowling: 9 },
			minDates: { bowling: 3 },
			minMatches: {
				padel: 4,
				tennis: 4,
				pickleball: 4
			},
			minCards: { golf: 2 }
		},
		repeatable: true,
		title: true,
		evaluator: "month_league"
	},
	{
		key: "most_improved_month",
		group: "mensual",
		sports: PROGRESS,
		scope: "liga",
		period: "mes",
		category: "mejora",
		shape: "medal",
		icon: "trending-up",
		name: "Mayor progreso del mes",
		description: "Nadie en {liga} subió tanto como tú en {mes}: {valor}.",
		how: "Mejora más que nadie de tu liga contra tu propio nivel del mes anterior.",
		compare: "none",
		levels: one("R"),
		params: { minGain: {
			bowling: 6,
			padel: 8,
			tennis: 8,
			pickleball: 8,
			golf: 2,
			swimming: 2
		} },
		repeatable: true,
		title: true,
		evaluator: "month_league"
	},
	{
		key: "streak_month",
		group: "mensual",
		sports: [
			"bowling",
			"padel",
			"tennis",
			"pickleball",
			"basketball",
			"football",
			"futsal",
			"golf"
		],
		scope: "liga",
		period: "mes",
		category: "constancia",
		shape: "medal",
		icon: "flame",
		name: "Racha del mes",
		description: {
			bowling: "¡Qué racha! {n} juegos seguidos por encima de tu promedio, la mejor de {liga} en {mes}.",
			padel: "¡Qué racha! {n} victorias seguidas, la mejor de {liga} en {mes}.",
			tennis: "¡Qué racha! {n} victorias seguidas, la mejor de {liga} en {mes}.",
			pickleball: "¡Qué racha! {n} victorias seguidas, la mejor de {liga} en {mes}.",
			basketball: "{equipo} no perdió en {n} partidos seguidos, la mejor racha de {liga} en {mes}.",
			football: "{equipo} no perdió en {n} partidos seguidos, la mejor racha de {liga} en {mes}.",
			futsal: "{equipo} no perdió en {n} partidos seguidos, la mejor racha de {liga} en {mes}.",
			golf: "¡Qué racha! {n} tarjetas seguidas en tu nivel o mejor, la mejor de {liga} en {mes}."
		},
		how: "Ten la racha más larga de tu liga en el mes, contra tu propio nivel.",
		compare: "none",
		levels: one("R"),
		params: {
			minRun: {
				bowling: 6,
				padel: 4,
				tennis: 4,
				pickleball: 4,
				basketball: 4,
				football: 4,
				futsal: 4,
				golf: 3
			},
			teamShare: .75
		},
		repeatable: true,
		title: true,
		evaluator: "month_league"
	},
	{
		key: "perfect_attendance_month",
		group: "mensual",
		sports: [
			"bowling",
			"padel",
			"tennis",
			"pickleball",
			"basketball",
			"football",
			"futsal",
			"golf"
		],
		scope: "liga",
		period: "mes",
		category: "asistencia",
		shape: "medal",
		icon: "calendar-check",
		name: "Asistencia perfecta del mes",
		description: "No faltaste a ninguna fecha de {liga} en {mes}. ¡Tú no te pierdes una!",
		how: "Juega todas las fechas de tu liga en el mes.",
		compare: "none",
		levels: one("PC"),
		params: {
			minDates: {
				default: 3,
				golf: 2
			},
			minPlayers: { bowling: 4 },
			minCards: { golf: 3 }
		},
		repeatable: true,
		evaluator: "month_league"
	},
	{
		key: "team_of_month",
		group: "mensual",
		sports: TEAM,
		scope: "liga",
		period: "mes",
		category: "resultados",
		shape: "medal",
		icon: "users-round",
		name: "Equipo del mes",
		description: "{equipo} fue el equipo del mes en {liga}, y tú jugaste {jugados} de sus {total} partidos.",
		how: "Juega al menos la mitad de los partidos del mejor equipo del mes.",
		compare: "none",
		levels: one("R"),
		params: {
			minTeams: 4,
			minTeamMatches: 2,
			minCandidateMatches: 3,
			share: .5
		},
		repeatable: true,
		title: true,
		evaluator: "month_league"
	},
	{
		key: "top_scorer_month",
		group: "mensual",
		sports: TEAM,
		scope: "liga",
		period: "mes",
		category: "resultados",
		shape: "medal",
		icon: "crosshair",
		name: {
			default: "Bota de oro del mes",
			basketball: "Más puntos del mes"
		},
		description: {
			default: "Metiste {n} goles en {mes}, lo más de {liga}.",
			basketball: "Anotaste {n} puntos en {mes}, lo más de {liga}."
		},
		how: {
			default: "Mete más goles que nadie de tu liga en el mes.",
			basketball: "Anota más puntos que nadie de tu liga en el mes."
		},
		compare: "none",
		levels: one("E"),
		params: {
			minMatches: 2,
			minGoals: {
				football: 3,
				futsal: 4
			}
		},
		repeatable: true,
		title: true,
		evaluator: "month_league"
	},
	{
		key: "clean_sheet_month",
		group: "mensual",
		sports: FOOTBALL,
		scope: "liga",
		period: "mes",
		category: "resultados",
		shape: "medal",
		icon: "badge-check",
		name: "Valla menos vencida del mes",
		description: "Tu portería fue la menos batida de {liga} en {mes}.",
		how: "Juega de portero al menos 2 partidos del mes y recibe menos goles por partido que nadie.",
		compare: "none",
		levels: one("E"),
		params: { minMatches: 2 },
		repeatable: true,
		title: true,
		evaluator: "month_league"
	},
	{
		key: "personal_best_month",
		group: "mensual",
		sports: ["bowling", "golf"],
		scope: "cuenta",
		period: "mes",
		category: "mejora",
		shape: "medal",
		icon: "sparkles",
		name: "Tu mejor mes",
		description: "En {mes} tuviste tu mejor mes en {deporte}: {valor} sobre tu mejor mes anterior.",
		how: "Ten el mejor mes de tu historia (con 3 o más meses anteriores para comparar).",
		compare: "none",
		levels: one("PC"),
		params: {
			minGames: { bowling: 9 },
			minCards: { golf: 2 },
			minPriorMonths: 3
		},
		repeatable: true,
		evaluator: "month_account"
	},
	{
		key: "box_top_month",
		group: "mensual",
		sports: RACKET,
		scope: "liga",
		period: "cajas",
		category: "resultados",
		shape: "medal",
		icon: "crown",
		name: "Cima de tu caja",
		description: "Terminaste en la cima de la caja {caja} en {mes}.",
		how: "Termina primero de tu caja en el mes, con los partidos mínimos para subir.",
		compare: "none",
		levels: one("PC"),
		params: {
			minPlayers: 3,
			minMatches: 2
		},
		repeatable: true,
		title: true,
		evaluator: "box_month"
	},
	{
		key: "box_promoted",
		group: "mensual",
		sports: RACKET,
		scope: "liga",
		period: "cajas",
		category: "mejora",
		shape: "medal",
		icon: "trending-up",
		name: "Subiste de caja",
		description: "Subiste a la caja {caja} para {mes}.",
		how: "Termina el mes en los puestos que suben de caja.",
		compare: "none",
		levels: one("PC"),
		repeatable: true,
		title: true,
		evaluator: "box_month"
	},
	{
		key: "ladder_top",
		group: "mensual",
		sports: RACKET,
		scope: "liga",
		period: "mes",
		category: "resultados",
		shape: "medal",
		icon: "crown",
		name: "Número 1",
		description: "Cerraste {mes} en el puesto 1 de la escalera de {liga}.",
		how: "Cierra el mes en el puesto 1 de la escalera, después de ganarlo o defenderlo en un reto.",
		compare: "none",
		levels: one("E"),
		params: { minRungs: 8 },
		repeatable: true,
		title: true,
		evaluator: "ladder_month"
	},
	{
		key: "monthly_regular",
		group: "mensual",
		sports: ALL_SPORTS,
		scope: "cuenta",
		period: "mes",
		category: "constancia",
		shape: "medal",
		icon: "calendar-check",
		name: "Fijo del mes",
		description: "Jugaste {n} días de {deporte} en {mes}.",
		how: "Juega {n} días de {deporte} en un mes (un día de golf o de natación vale 2).",
		unit: units("día", "días"),
		compare: "gte",
		levels: tiers("PC R E", [
			4,
			8,
			12
		]),
		params: { maxWeightedPerWeek: 4 },
		repeatable: true,
		highestOnly: true,
		evaluator: "month_account"
	}
];
const YEARLY = [
	{
		key: "year_recap",
		group: "anual",
		sports: "all",
		scope: "cuenta",
		period: "anio",
		category: "constancia",
		shape: "medal_laurel",
		icon: "sunrise",
		name: "Tu {anio}",
		description: "{anio} en MatchMate: {n} días jugando, {deportes_n} deportes, {meses} meses activos. ¡Qué año!",
		how: "Juega {n} días en el año, con al menos 6 meses activos.",
		unit: units("día", "días"),
		compare: "gte",
		levels: tiers("C PC R", [
			20,
			50,
			100
		]),
		params: { minActiveMonths: 6 },
		highestOnly: true,
		evaluator: "year_account"
	},
	{
		key: "full_year",
		group: "anual",
		sports: ALL_SPORTS,
		scope: "cuenta",
		period: "anio",
		category: "constancia",
		shape: "medal_laurel",
		icon: "sun",
		name: "Todo el año",
		description: "Jugaste {deporte} {n} de los 12 meses de {anio}.",
		how: "Juega {deporte} en {n} de los 12 meses del año.",
		unit: units("mes", "meses"),
		compare: "gte",
		levels: one("R", 10),
		repeatable: true,
		evaluator: "year_account"
	},
	{
		key: "figure_of_year",
		group: "anual",
		sports: FIGURE,
		scope: "liga",
		period: "anio",
		category: "resultados",
		shape: "medal_laurel",
		icon: "star",
		name: "Figura del año",
		description: "Fuiste la figura de {liga} en {anio}.",
		how: "Sé el mejor de tu liga en todo el año, con el mínimo de juegos.",
		compare: "none",
		levels: one("E"),
		params: {
			minGames: { bowling: 36 },
			minMatches: {
				padel: 12,
				tennis: 12,
				pickleball: 12
			},
			minCards: { golf: 8 },
			minAttendancePct: 40
		},
		repeatable: true,
		title: true,
		evaluator: "year_league"
	},
	{
		key: "progress_of_year",
		group: "anual",
		sports: PROGRESS,
		scope: "liga",
		period: "anio",
		category: "mejora",
		shape: "medal_laurel",
		icon: "rocket",
		name: "Mayor progreso del año",
		description: "Nadie en {liga} progresó tanto como tú en {anio}: {valor}.",
		how: "Mejora más que nadie de tu liga entre el principio y el final del año.",
		compare: "none",
		levels: one("E"),
		params: {
			minGain: {
				bowling: 8,
				padel: 10,
				tennis: 10,
				pickleball: 10,
				golf: 2.5
			},
			minPersonalBests: { swimming: 4 },
			window: {
				bowling: 30,
				golf: 6
			},
			minMatchesPerHalf: {
				padel: 8,
				tennis: 8,
				pickleball: 8
			}
		},
		repeatable: true,
		title: true,
		evaluator: "year_league"
	}
];
const SEASON = [
	{
		key: "season_podium",
		group: "temporada",
		sports: ALL_SPORTS.filter((s) => s !== "swimming"),
		scope: "liga",
		period: "temporada",
		category: "resultados",
		shape: "shield",
		icon: "trophy",
		name: "Título de temporada",
		levelNames: {
			3: "Título",
			2: "Segundo lugar",
			1: "Tercer lugar"
		},
		description: "¡Ganaste {temporada} de {liga}!",
		levelDescriptions: {
			3: "¡Ganaste {temporada} de {liga}!",
			2: "Terminaste en segundo lugar de {temporada} de {liga}.",
			1: "Terminaste en tercer lugar de {temporada} de {liga}."
		},
		how: "Termina entre los tres primeros de la temporada, jugando al menos la mitad de las fechas.",
		compare: "place",
		levels: podium("E", "E", "E"),
		alts: { torneo: {
			name: "Título del torneo",
			description: "¡Ganaste {temporada}!"
		} },
		repeatable: true,
		title: true,
		evaluator: "season_league"
	},
	{
		key: "category_title",
		group: "temporada",
		sports: ["bowling", "swimming"],
		scope: "liga",
		period: "temporada",
		category: "resultados",
		shape: "shield",
		icon: "medal",
		name: "Título de categoría",
		description: "Ganaste la categoría {categoria} de {liga} en {temporada}.",
		how: "Termina primero de tu categoría en la temporada.",
		compare: "none",
		levels: one("R"),
		params: {
			minInCategory: 4,
			minTotal: { bowling: 12 },
			sandbagPins: { bowling: 15 }
		},
		repeatable: true,
		title: true,
		evaluator: "season_league"
	},
	{
		key: "season_most_improved",
		group: "temporada",
		sports: PROGRESS,
		scope: "liga",
		period: "temporada",
		category: "mejora",
		shape: "shield",
		icon: "trending-up",
		name: "Mayor progreso de la temporada",
		description: "Tu temporada en {liga}: {valor}.",
		how: "Mejora más que nadie de tu liga entre el arranque y el final de la temporada.",
		compare: "none",
		levels: one("E"),
		params: {
			minEligible: 6,
			minGain: {
				bowling: 8,
				padel: 10,
				tennis: 10,
				pickleball: 10,
				golf: 2.5
			},
			minPersonalBests: { swimming: 3 },
			minGames: { bowling: 24 },
			minPerHalf: {
				padel: 5,
				tennis: 5,
				pickleball: 5,
				golf: 3
			}
		},
		repeatable: true,
		title: true,
		evaluator: "season_league"
	},
	{
		key: "season_rookie",
		group: "temporada",
		sports: PROGRESS,
		scope: "liga",
		period: "temporada",
		category: "resultados",
		shape: "shield",
		icon: "sprout",
		name: "Revelación de la temporada",
		description: "Tu primera temporada en {deporte} y fuiste lo mejor entre los nuevos de {liga}.",
		how: "En tu primera temporada del deporte, sé el mejor de los nuevos (con 3 o más nuevos).",
		compare: "none",
		levels: one("R"),
		params: {
			minRookies: 3,
			minAttendancePct: 50
		},
		oncePerSport: true,
		title: true,
		evaluator: "season_league"
	},
	{
		key: "season_attendance",
		group: "temporada",
		sports: ALL_SPORTS,
		scope: "liga",
		period: "temporada",
		category: "asistencia",
		shape: "shield",
		icon: "calendar-check",
		name: "Asistencia de temporada",
		description: "Fuiste a {n} de las {total} fechas de {temporada}.",
		how: "Juega el {n} % de las fechas de la temporada desde que empezaste.",
		compare: "gte",
		levels: tiers("C PC R", [
			75,
			90,
			100
		]),
		params: {
			minDates: {
				bowling: 8,
				padel: 6,
				tennis: 6,
				pickleball: 6,
				basketball: 6,
				football: 6,
				futsal: 6,
				golf: 4,
				swimming: 3
			},
			lineupShare: .8
		},
		highestOnly: true,
		evaluator: "season_league"
	},
	{
		key: "season_top_scorer",
		group: "temporada",
		sports: TEAM,
		scope: "liga",
		period: "temporada",
		category: "resultados",
		shape: "shield",
		icon: "crosshair",
		name: {
			default: "Bota de oro de la temporada",
			basketball: "Más puntos de la temporada"
		},
		description: {
			default: "{n} goles en {temporada}: nadie metió más en {liga}.",
			basketball: "{n} puntos por partido en {temporada}: nadie anotó más en {liga}."
		},
		how: {
			default: "Mete más goles que nadie de tu liga en la temporada.",
			basketball: "Ten el mejor promedio de puntos de tu liga en la temporada."
		},
		compare: "none",
		levels: one("E"),
		params: {
			minTeams: 4,
			share: .5,
			minGoals: {
				football: 3,
				futsal: 3
			},
			minMatches: { basketball: 6 }
		},
		repeatable: true,
		title: true,
		evaluator: "season_league"
	},
	{
		key: "season_best_keeper",
		group: "temporada",
		sports: FOOTBALL,
		scope: "liga",
		period: "temporada",
		category: "resultados",
		shape: "shield",
		icon: "anchor",
		name: "Portero menos vencido",
		description: "Tu portería fue la menos batida de {liga} en {temporada}.",
		how: "Juega de portero al menos la mitad de los partidos de tu equipo y recibe menos goles por partido que nadie.",
		compare: "none",
		levels: one("E"),
		params: {
			minTeams: 4,
			share: .5,
			minMatches: 6
		},
		repeatable: true,
		title: true,
		evaluator: "season_league"
	},
	{
		key: "fair_play",
		group: "temporada",
		sports: [
			"football",
			"futsal",
			"basketball",
			"swimming"
		],
		scope: "liga",
		period: "temporada",
		category: "juego_limpio",
		shape: "square",
		icon: "handshake",
		name: {
			default: "Juego limpio",
			swimming: "Estilo limpio"
		},
		description: {
			default: "Una temporada entera sin roja y casi sin amarillas. ¡Así se juega!",
			basketball: "Una temporada entera sin técnicas ni antideportivas. ¡Así se juega!",
			swimming: "{n} pruebas sin una descalificación."
		},
		how: {
			default: "Juega 8 o más partidos en la temporada sin rojas, con 1 amarilla como mucho.",
			basketball: "Juega 8 o más partidos en la temporada sin faltas técnicas, antideportivas ni descalificantes.",
			swimming: "Nada 6 o más pruebas en la temporada sin descalificaciones ni abandonos."
		},
		compare: "none",
		levels: one("PC"),
		params: {
			minMatches: {
				default: 8,
				swimming: 6
			},
			maxYellows: {
				football: 1,
				futsal: 1
			}
		},
		repeatable: true,
		evaluator: "season_league"
	},
	{
		key: "fair_play_team",
		group: "temporada",
		sports: TEAM,
		scope: "liga",
		period: "temporada",
		category: "juego_limpio",
		shape: "square",
		icon: "heart-handshake",
		name: "Equipo juego limpio",
		description: "{equipo} fue el equipo más limpio de {liga} en {temporada}.",
		how: "Juega al menos el 40 % de los partidos del equipo con menos tarjetas o faltas de la temporada.",
		compare: "none",
		levels: one("R"),
		params: {
			minTeams: 4,
			minMatches: 8,
			share: .4,
			redWeight: 3
		},
		repeatable: true,
		title: true,
		evaluator: "season_league"
	},
	{
		key: "honor_word",
		group: "temporada",
		sports: RACKET,
		scope: "liga",
		period: "temporada",
		category: "juego_limpio",
		shape: "square",
		icon: "thumbs-up",
		name: "Palabra de honor",
		description: "{n} partidos en {temporada} sin W.O. y sin reclamos perdidos. Contigo se puede contar.",
		how: "Juega 8 o más partidos oficiales en la temporada sin dar W.O. ni perder reclamos.",
		compare: "none",
		levels: one("PC"),
		params: { minMatches: 8 },
		repeatable: true,
		evaluator: "season_league"
	}
];
const COMMUNITY = [
	{
		key: "league_builder",
		group: "comunidad",
		sports: "all",
		scope: "cuenta",
		period: "liga",
		category: "organizacion",
		shape: "square",
		icon: "users-round",
		name: "Liga en marcha",
		description: "Tu liga {liga} ya tiene {n} jugadores activos. ¡Armaste algo bonito!",
		how: "Como dueño, llega a {n} jugadores que jueguen 3 días o más en tu liga.",
		unit: units("jugador", "jugadores"),
		compare: "gte",
		levels: tiers("R E L", [
			10,
			25,
			50
		]),
		params: {
			minDaysPerPlayer: 3,
			minAccounts: 6
		},
		accountOnly: true,
		evaluator: "community"
	},
	{
		key: "season_organizer",
		group: "comunidad",
		sports: "all",
		scope: "cuenta",
		period: "temporada",
		category: "organizacion",
		shape: "square",
		icon: "calendar-check",
		name: "Temporada organizada",
		description: "Sacaste adelante {temporada} de {liga}: {fechas} fechas y {jugadores} jugadores.",
		how: "Organiza una temporada de 8 o más fechas y 8 o más jugadores, como dueño o admin que ayudó.",
		compare: "none",
		levels: one("R"),
		params: {
			minDates: 8,
			minPlayers: 8,
			minAccounts: 4,
			minServiceDays: 5
		},
		repeatable: true,
		accountOnly: true,
		evaluator: "season_staff"
	},
	{
		key: "table_crew",
		group: "comunidad",
		sports: "all",
		scope: "cuenta",
		period: "siempre",
		category: "voluntariado",
		shape: "square",
		icon: "whistle",
		name: "Mesa técnica",
		description: "{n} días anotando y aprobando para que otros jueguen. ¡Gracias!",
		how: "Anota, confirma o aprueba resultados de otros durante {n} días.",
		unit: units("día", "días"),
		compare: "gte",
		levels: tiers("PC R E", [
			5,
			20,
			60
		]),
		params: { minGolfCards: 4 },
		accountOnly: true,
		evaluator: "community"
	},
	{
		key: "captain_band",
		group: "comunidad",
		sports: TEAM,
		scope: "liga",
		period: "temporada",
		category: "liderazgo",
		shape: "square",
		icon: "ribbon",
		name: "Brazalete",
		description: "Capitaneaste a {equipo} toda la temporada: {n} partidos.",
		how: "Sé capitán o delegado de un equipo que juegue 8 o más partidos en la temporada.",
		compare: "none",
		levels: one("R"),
		params: {
			minMatches: 8,
			maxWalkovers: 1
		},
		repeatable: true,
		evaluator: "season_league"
	},
	{
		key: "coach_board",
		group: "comunidad",
		sports: ["swimming"],
		scope: "cuenta",
		period: "temporada",
		category: "liderazgo",
		shape: "square",
		icon: "megaphone",
		name: "Cuerpo técnico",
		description: "Tu club {club} compitió con {n} nadadores en {temporada}.",
		how: "Entrena un club con 5 o más nadadores que compitan en la temporada.",
		compare: "none",
		levels: one("R"),
		params: { minSwimmers: 5 },
		repeatable: true,
		accountOnly: true,
		evaluator: "season_staff"
	},
	{
		key: "good_vibes",
		group: "comunidad",
		sports: "all",
		scope: "cuenta",
		period: "siempre",
		category: "companerismo",
		shape: "square",
		icon: "party-popper",
		name: "Buena vibra",
		description: "Felicitaste a {n} compañeros distintos por sus juegos.",
		how: "Felicita a {n} compañeros distintos de tus ligas, a lo largo de varios meses.",
		unit: units("persona", "personas"),
		compare: "gte",
		levels: tiers("C PC R", [
			10,
			30,
			75
		], [
			{ req: { months: 2 } },
			{ req: { months: 3 } },
			{ req: { months: 6 } }
		]),
		accountOnly: true,
		noMinors: true,
		evaluator: "community"
	},
	{
		key: "bowlingx_roots",
		group: "comunidad",
		sports: ["bowling"],
		scope: "cuenta",
		period: "siempre",
		category: "historia",
		shape: "square",
		icon: "tree-palm",
		name: "Raíces BowlingX",
		description: "Estabas desde BowlingX. Aquí empezó todo.",
		how: "Solo para quienes venían de BowlingX y jugaron en MatchMate.",
		compare: "none",
		levels: one("cerrada"),
		accountOnly: true,
		closed: true,
		evaluator: "community"
	}
];
const BADGES = [
	...GENERAL,
	...BOWLING,
	...RACKET_BADGES,
	...TEAM_BADGES,
	...BASKETBALL,
	...FOOTBALL_BADGES,
	...GOLF,
	...SWIMMING,
	...MONTHLY,
	...YEARLY,
	...SEASON,
	...COMMUNITY
];
const BY_KEY = new Map(BADGES.map((b) => [b.key, b]));
BADGES.map((b) => b.key);
/** La definición de una key; undefined si esta versión no la conoce (una fila de una versión más nueva). */
const badgeDef = (key) => BY_KEY.get(key);
/** Las insignias que se apagan o no con `badges_auto` en una liga (las de cuenta no dependen de eso). */
function allowedBy(def, mode) {
	if (def.scope === "cuenta") return true;
	if (mode === "ninguna") return false;
	return mode === "todas" || !def.title;
}
/**
* Variantes de una fila, de la más específica a la más general: baloncesto 3x3 → `['basketball3x3',
* 'basketball']`; golf de 9 hoyos → `['golf9', 'golf']`; 'all' → `[]` (solo `default`).
*/
function variantsOf(sport, opts = {}) {
	if (sport === "all") return [];
	if (sport === "basketball" && opts.is3x3) return ["basketball3x3", "basketball"];
	if (sport === "golf" && opts.nineHoles) return ["golf9", "golf"];
	return [sport];
}
const isByVariantObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/** El valor para esas variantes: el primero que exista, si no `default`; undefined si no hay. */
function pickVariant(value, variants) {
	if (value === void 0) return void 0;
	if (!isByVariantObject(value)) return value;
	for (const v of variants) if (value[v] !== void 0) return value[v];
	return value.default;
}
function variantList(arg) {
	if (arg === void 0 || arg === "all") return [];
	if (typeof arg !== "string") return arg;
	if (arg === "basketball3x3") return ["basketball3x3", "basketball"];
	if (arg === "golf9") return ["golf9", "golf"];
	return [arg];
}
/** Un parámetro del criterio (`params`) para un deporte o variante. */
const paramOf = (def, name, sport) => pickVariant(def.params?.[name], variantList(sport));
/** Metal con que se pinta cada nivel (§4.3): la única se pinta en oro, sin puntos. */
const LEVEL_TIER = {
	0: "oro",
	1: "bronce",
	2: "plata",
	3: "oro",
	4: "platino",
	5: "diamante"
};
const levelDef = (def, level) => def.levels.find((l) => l.level === level);
/** Umbral de un nivel para esas variantes (el puesto en los podios). */
const thresholdOf = (def, level, sport) => pickVariant(levelDef(def, level)?.threshold, variantList(sport));
/** ¿El valor llega al nivel? (`gte`: llega al umbral; `lt`: queda por debajo; sin umbral: no se mide así). */
function reaches(def, l, value, variants) {
	const t = pickVariant(l.threshold, variants);
	if (t === void 0) return false;
	if (def.compare === "gte") return value >= t;
	if (def.compare === "lt") return value < t;
	if (def.compare === "place") return value === t;
	return false;
}
/** Todos los niveles que alcanza un valor (cada nivel es una fila propia), de menor a mayor. */
function levelsReached(def, value, sport) {
	const variants = variantList(sport);
	return def.levels.filter((l) => reaches(def, l, value, variants)).map((l) => l.level);
}
/** El nivel más alto que alcanza un valor; null si ninguno. */
function levelFor(def, value, sport) {
	const got = levelsReached(def, value, sport);
	return got.length ? got[got.length - 1] : null;
}
/** El siguiente nivel que falta y su umbral (para `badge_progress`); null si ya tiene el más alto o no se mide. */
function nextLevel(def, value, sport) {
	if (def.compare !== "gte" && def.compare !== "lt") return null;
	const variants = variantList(sport);
	for (const l of def.levels) {
		if (reaches(def, l, value, variants)) continue;
		const target = pickVariant(l.threshold, variants);
		return target === void 0 ? null : {
			level: l.level,
			target
		};
	}
	return null;
}
/** Nivel de un puesto en un podio: 1.º oro (3), 2.º plata (2), 3.º bronce (1). */
function placeLevel(place) {
	return place === 1 ? 3 : place === 2 ? 2 : place === 3 ? 1 : null;
}
/** Rellena `{clave}` con los valores; lo que no viene se queda como está. */
function fillText(template, vars) {
	return template.replace(/\{([a-z_]+)\}/g, (all, k) => {
		const v = vars[k];
		return v === void 0 ? all : String(v);
	});
}
const optVariants = (o) => o.variants ?? variantsOf(o.sport ?? "all");
const altOf = (def, alt) => alt ? def.alts?.[alt] : void 0;
/** Nombre de la insignia (plantilla: `year_recap` lleva `{anio}`). */
function nameOf(def, o = {}) {
	return altOf(def, o.alt)?.name ?? pickVariant(def.name, optVariants(o)) ?? def.key;
}
/** Trabajos de la cola (§3.3) que corren cada evaluador. `historial` = la primera corrida (§3.5). */
const EVALUATOR_JOBS = {
	debut: [
		"resultado",
		"revisar",
		"vinculo",
		"historial"
	],
	account_activity: [
		"cuenta",
		"vinculo",
		"historial"
	],
	month_streak: [
		"mes",
		"vinculo",
		"historial"
	],
	climbing: [
		"resultado",
		"revisar",
		"vinculo",
		"historial"
	],
	event_podium: ["evento", "historial"],
	bowling_career: [
		"resultado",
		"revisar",
		"vinculo",
		"historial"
	],
	bowling_game: [
		"resultado",
		"revisar",
		"historial"
	],
	bowling_event: ["evento", "historial"],
	racket_career: [
		"resultado",
		"revisar",
		"vinculo",
		"historial"
	],
	racket_match: [
		"resultado",
		"revisar",
		"historial"
	],
	racket_night: ["noche", "historial"],
	team_career: [
		"resultado",
		"revisar",
		"vinculo",
		"historial"
	],
	team_match: [
		"resultado",
		"revisar",
		"historial"
	],
	basketball_career: [
		"resultado",
		"revisar",
		"vinculo",
		"historial"
	],
	basketball_match: [
		"resultado",
		"revisar",
		"historial"
	],
	football_career: [
		"resultado",
		"revisar",
		"vinculo",
		"historial"
	],
	football_match: [
		"resultado",
		"revisar",
		"historial"
	],
	golf_career: [
		"resultado",
		"revisar",
		"vinculo",
		"historial"
	],
	golf_card: [
		"resultado",
		"revisar",
		"historial"
	],
	swim_career: [
		"resultado",
		"revisar",
		"vinculo",
		"historial"
	],
	swim_meet: ["evento", "historial"],
	month_league: ["mes", "historial"],
	month_account: ["mes", "historial"],
	box_month: ["cajas"],
	ladder_month: ["escalera"],
	year_account: ["anio", "historial"],
	year_league: ["anio", "historial"],
	season_league: ["temporada"],
	season_staff: ["temporada"],
	community: ["cuenta", "historial"]
};
/** Los evaluadores que corre un tipo de trabajo. */
const evaluatorsFor = (kind) => Object.keys(EVALUATOR_JOBS).filter((id) => EVALUATOR_JOBS[id].includes(kind));
/** Las insignias de un evaluador. */
const badgesOfEvaluator = (id) => BADGES.filter((d) => d.evaluator === id);
//#endregion
//#region src/lib/bowling.ts
/**
* Puntuación de boliche (10 pinos) a partir de los tiros en orden.
* Cuadros 1–9: strike (X) = 10 + los 2 tiros siguientes; spare (/) = 10 + el siguiente.
* Cuadro 10: hasta 3 tiros si hay strike o spare.
*/
const ALL_PINS = 1023;
/** Tiros de cada cuadro (el 10 puede tener 3). */
function split(rolls) {
	const frames = [];
	let i = 0;
	for (let f = 0; f < 10 && i < rolls.length; f++) {
		const n = f === 9 ? 3 : rolls[i] === 10 ? 1 : 2;
		frames.push({
			start: i,
			rolls: rolls.slice(i, i + n)
		});
		i += n;
	}
	return frames;
}
function marksOf(rolls, tenth) {
	const out = [];
	let fresh = true;
	let standing = 10;
	rolls.forEach((r) => {
		if (fresh && r === 10) out.push("X");
		else if (!fresh && r === standing) out.push("/");
		else out.push(r === 0 ? "-" : String(r));
		if (!tenth) {
			fresh = false;
			standing = 10 - r;
			return;
		}
		if (fresh && r === 10) {
			fresh = true;
			standing = 10;
		} else if (!fresh && r === standing) {
			fresh = true;
			standing = 10;
		} else {
			fresh = false;
			standing = standing - r;
		}
	});
	return out;
}
function scoreGame(rolls) {
	const parts = split(rolls);
	const frames = [];
	let running = 0;
	let known = true;
	parts.forEach((p, f) => {
		let value;
		const [a = 0, b = 0] = p.rolls;
		if (f === 9) {
			const need = a === 10 || a + b === 10 ? 3 : 2;
			value = p.rolls.length >= need ? p.rolls.slice(0, need).reduce((s, r) => s + r, 0) : null;
		} else if (a === 10) {
			const next = rolls.slice(p.start + 1, p.start + 3);
			value = next.length === 2 ? 10 + next[0] + next[1] : null;
		} else if (p.rolls.length === 2 && a + b === 10) {
			const next = rolls[p.start + 2];
			value = next != null ? 10 + next : null;
		} else value = p.rolls.length === 2 ? a + b : null;
		if (value == null) known = false;
		if (known && value != null) running += value;
		frames.push({
			marks: marksOf(p.rolls, f === 9),
			rolls: p.rolls,
			start: p.start,
			total: known && value != null ? running : null
		});
	});
	return {
		frames,
		score: running,
		complete: maxNextRoll(rolls) < 0
	};
}
/**
* Máximo de pinos que puede tumbar el próximo tiro (los que quedan parados).
* -1 si el juego ya terminó.
*/
function maxNextRoll(rolls) {
	const s = standingNow(rolls);
	return s == null ? -1 : s.standing;
}
/** Si el próximo tiro es con los 10 pinos parados (se puede marcar X) y cuántos quedan. null = juego terminado. */
function standingNow(rolls) {
	const parts = split(rolls);
	if (parts.reduce((n, p) => n + p.rolls.length, 0) < rolls.length) return null;
	const last = parts[parts.length - 1];
	if (!last) return {
		standing: 10,
		fresh: true,
		frame: 0,
		roll: 0
	};
	const f = parts.length - 1;
	const [a, b] = last.rolls;
	if (f < 9) {
		if (last.rolls.length === 1 && a !== 10) return {
			standing: 10 - a,
			fresh: false,
			frame: f,
			roll: 1
		};
		return {
			standing: 10,
			fresh: true,
			frame: f + 1,
			roll: 0
		};
	}
	if (last.rolls.length === 1) return a === 10 ? {
		standing: 10,
		fresh: true,
		frame: 9,
		roll: 1
	} : {
		standing: 10 - a,
		fresh: false,
		frame: 9,
		roll: 1
	};
	if (last.rolls.length === 2) {
		if (a === 10) return b === 10 ? {
			standing: 10,
			fresh: true,
			frame: 9,
			roll: 2
		} : {
			standing: 10 - b,
			fresh: false,
			frame: 9,
			roll: 2
		};
		if (a + b === 10) return {
			standing: 10,
			fresh: true,
			frame: 9,
			roll: 2
		};
		return null;
	}
	return null;
}
/** ¿La lista de tiros es un juego válido (se puede seguir o ya terminó)? */
function validRolls(rolls) {
	for (let i = 0; i < rolls.length; i++) {
		const r = rolls[i];
		if (!Number.isInteger(r) || r < 0) return false;
		const max = maxNextRoll(rolls.slice(0, i));
		if (max < 0 || r > max) return false;
	}
	return true;
}
function frameStats(rolls) {
	const stats = {
		strikes: 0,
		spares: 0,
		opens: 0,
		firstBalls: []
	};
	split(rolls).forEach((p, f) => {
		if (f < 9) {
			const [a, b] = p.rolls;
			stats.firstBalls.push(a);
			if (a === 10) stats.strikes++;
			else if (p.rolls.length === 2) a + b === 10 ? stats.spares++ : stats.opens++;
			return;
		}
		const marks = marksOf(p.rolls, true);
		stats.firstBalls.push(p.rolls[0]);
		marks.forEach((m) => m === "X" ? stats.strikes++ : m === "/" ? stats.spares++ : void 0);
		if (p.rolls.length === 2 && p.rolls[0] + p.rolls[1] < 10) stats.opens++;
	});
	return stats;
}
const bitCount = (mask) => {
	let n = 0;
	for (let m = mask; m; m &= m - 1) n++;
	return n;
};
/**
* Pinos vecinos para decidir un split (índice = pin − 1). Un pino se une con los dos que tiene detrás en diagonal y
* con el que queda justo detrás a dos filas («dormido»: 1-5, 2-8, 3-9). Los de la misma fila no se unen: así, con el
* pino de adelante caído, 5-6 o 7-8 son split (regla USBC) y 2-8 o 3-9 no.
*
*   7 8 9 10
*    4 5 6
*     2 3
*      1
*/
const PIN_NEIGHBORS = [
	[
		1,
		2,
		4
	],
	[
		0,
		3,
		4,
		7
	],
	[
		0,
		4,
		5,
		8
	],
	[
		1,
		6,
		7
	],
	[
		0,
		1,
		2,
		7,
		8
	],
	[
		2,
		8,
		9
	],
	[3],
	[
		1,
		3,
		4
	],
	[
		2,
		4,
		5
	],
	[5]
];
/**
* ¿Los pinos parados (bit 0 = pin 1) son un split? El pino 1 cayó, quedan 2 o más y no forman un solo grupo
* conectado según `PIN_NEIGHBORS`.
*/
function isSplit(standing) {
	const pins = standing & ALL_PINS;
	if (pins & 1 || bitCount(pins) < 2) return false;
	const start = Math.log2(pins & -pins);
	let seen = 1 << start;
	const stack = [start];
	while (stack.length) for (const n of PIN_NEIGHBORS[stack.pop()]) if (pins & 1 << n && !(seen & 1 << n)) {
		seen |= 1 << n;
		stack.push(n);
	}
	return seen !== pins;
}
//#endregion
//#region src/lib/data/rows.ts
/** El evento de la app con sus equipos (`teams[id] = {name, order}`) y su «voy» (`rsvp[jugador] = true`). */
function toEvent(r, teams = [], rsvps = []) {
	const teamMap = {};
	for (const t of teams) if (t.event_id === r.id) teamMap[t.id] = {
		name: t.name,
		order: t.sort_order,
		color: t.color
	};
	const rsvp = {};
	for (const x of rsvps) if (x.event_id === r.id && x.going) rsvp[x.player_id] = true;
	return {
		id: r.id,
		type: r.type,
		name: r.name ?? "",
		date: r.date,
		games: r.games,
		hcpBase: r.hcp_base,
		hcpPercent: r.hcp_percent,
		teams: teamMap,
		playerCount: r.player_count ?? 0,
		individualRankBy: r.individual_rank_by ?? void 0,
		teamRankBy: r.team_rank_by ?? void 0,
		categoryCuts: r.category_cuts && r.category_cuts.length === 3 ? r.category_cuts : void 0,
		teamSize: r.team_size,
		announcement: r.announcement ?? "",
		rsvp,
		startTime: r.start_time,
		createdAt: r.created_at ?? null
	};
}
const toEntry = (r) => ({
	id: r.id,
	eventId: r.event_id,
	playerId: r.player_id,
	teamId: r.team_id ?? null,
	average: r.average ?? 0,
	handicapOverride: r.handicap_override ?? null,
	scores: r.scores ?? [],
	photos: r.photos ?? [],
	...r.frames && Object.keys(r.frames).length ? { frames: r.frames } : {}
});
function isValidScore(n) {
	return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 300;
}
/** Ajusta un arreglo por juego al número de juegos del evento. */
function slots(arr, games, fill) {
	return Array.from({ length: games }, (_, i) => arr && i < arr.length ? arr[i] : fill);
}
function calcHandicap(average, base, percent) {
	if (!average || percent <= 0) return 0;
	return Math.max(0, Math.floor((base - average) * percent / 100));
}
function entryHandicap(entry, event) {
	if (event.type !== "torneo") return 0;
	if (entry.handicapOverride != null) return entry.handicapOverride;
	return calcHandicap(entry.average, event.hcpBase, event.hcpPercent);
}
/** Números de un jugador en un evento. Solo cuentan juegos verificados con foto, salvo includeDrafts. */
function entryLine(entry, event, includeDrafts = false) {
	const raw = slots(entry.scores, event.games, null);
	const photos = slots(entry.photos, event.games, null);
	const verified = raw.map((s, i) => s != null && photos[i] != null);
	const scores = raw.map((s, i) => verified[i] || includeDrafts ? s : null);
	const counted = scores.filter((s) => s != null);
	const hcp = entryHandicap(entry, event);
	const scratch = counted.reduce((a, b) => a + b, 0);
	const hcpTotal = hcp * counted.length;
	return {
		entry,
		hcp,
		scores,
		verified,
		pending: raw.filter((s, i) => s != null && !verified[i]).length,
		games: counted.length,
		scratch,
		hcpTotal,
		total: scratch + hcpTotal,
		avg: counted.length ? Math.floor(scratch / counted.length) : 0,
		high: counted.length ? Math.max(...counted) : 0
	};
}
/**
* La regla EFECTIVA del individual de un torneo (la del dueño: con handicap). Sin regla escrita, 'hcp'; sin handicap
* (0 %) o en una práctica, 'scratch' aunque la regla diga 'hcp'. Es la que usan la clasificación, los premios del
* torneo (private.prize_bowling_rank) y las insignias automáticas.
*/
function individualRule(event) {
	return event.type === "torneo" && event.hcpPercent > 0 && (event.individualRankBy ?? "hcp") === "hcp" ? "hcp" : "scratch";
}
/** La regla EFECTIVA de los equipos (la del dueño: por scratch). Con handicap solo si la regla lo dice y hay handicap. */
function teamRule(event) {
	return event.type === "torneo" && event.hcpPercent > 0 && (event.teamRankBy ?? "scratch") === "hcp" ? "hcp" : "scratch";
}
/** Valor con el que se ordena la clasificación individual (regla del evento). */
function individualValue(event) {
	const isTorneo = event.type === "torneo";
	const useHcp = individualRule(event) === "hcp";
	return (l) => isTorneo ? useHcp ? l.total : l.scratch : l.avg;
}
/** Valor con el que se ordena la clasificación por equipos (la gemela de individualValue). */
function teamValue(event) {
	const useHcp = teamRule(event) === "hcp";
	return (t) => useHcp ? t.total : t.scratch;
}
function teamLines(event, lines) {
	return Object.entries(event.teams ?? {}).sort(([, a], [, b]) => a.order - b.order).map(([teamId, team]) => {
		const members = lines.filter((l) => l.entry.teamId === teamId);
		const perGame = Array.from({ length: event.games }, (_, g) => members.reduce((sum, m) => m.scores[g] != null ? sum + m.scores[g] + m.hcp : sum, 0));
		const scratch = members.reduce((a, m) => a + m.scratch, 0);
		const hcpTotal = members.reduce((a, m) => a + m.hcpTotal, 0);
		return {
			teamId,
			name: team.name,
			members,
			perGame,
			scratch,
			hcpTotal,
			total: scratch + hcpTotal,
			teamAverage: members.reduce((a, m) => a + (m.entry.average || 0), 0),
			teamHcp: members.reduce((a, m) => a + m.hcp, 0)
		};
	});
}
/** Cortes del torneo 2025: A 200+, B 175–199, C 160–174, D menos de 160. */
const DEFAULT_CUTS = [
	200,
	175,
	160
];
function category(average, cuts = DEFAULT_CUTS) {
	if (average >= cuts[0]) return "A";
	if (average >= cuts[1]) return "B";
	if (average >= cuts[2]) return "C";
	return "D";
}
/**
* Redondeo del WHS: al entero más cercano y 0,5 sube (16,5 → 17; −0,5 → 0; −2,5 → −2).
* El épsilon evita que un 12,4999999 de coma flotante (que en realidad es 12,5) baje.
*/
function roundWhs(x) {
	return Math.floor(x + .5 + 1e-9);
}
function isValidIndex(n) {
	return typeof n === "number" && Number.isFinite(n) && n >= -10 && n <= 54;
}
const sum$1 = (xs) => xs.reduce((a, b) => a + b, 0);
function findTee(course, teeId) {
	const tee = course.tees.find((t) => t.id === teeId);
	if (!tee) throw new Error("Esa salida no existe en el campo.");
	return tee;
}
/** Hoyos que se juegan desde una salida (con su par y SI), en orden de número. */
function teeHoles(course, tee, nine = "all") {
	const all = course.holes.map((h, i) => ({
		number: i + 1,
		par: tee.pars?.[i] ?? h.par,
		si: tee.sis?.[i] ?? h.si
	}));
	if (all.length !== 18 || nine === "all") return all;
	return nine === "front" ? all.slice(0, 9) : all.slice(9);
}
/**
* Rating que corresponde a la ronda. En un campo de 9 hoyos, el de la salida (ya es de 9).
* Para 9 hoyos en un campo de 18 usa `front9`/`back9`; si no están, ESTIMA: rating/2, el mismo slope
* y el par de esos 9 hoyos (`estimated: true`, para avisarlo en pantalla).
*/
function teeRating(course, tee, nine = "all") {
	if (course.holes.length === 9) return {
		rating: tee,
		holes: 9,
		estimated: false
	};
	if (nine === "all") return {
		rating: tee,
		holes: 18,
		estimated: false
	};
	const given = nine === "front" ? tee.front9 : tee.back9;
	if (given) return {
		rating: given,
		holes: 9,
		estimated: false
	};
	const par = sum$1(teeHoles(course, tee, nine).map((h) => h.par));
	return {
		rating: {
			rating: tee.rating / 2,
			slope: tee.slope,
			par
		},
		holes: 9,
		estimated: true
	};
}
/**
* Handicap de campo SIN redondear (se redondea solo para mostrarlo, con `roundWhs`).
* `holes = 9`: `r` es el rating de 9 hoyos y se usa la mitad del Index.
*/
function courseHandicap(index, r, holes = 18) {
	return (holes === 9 ? index / 2 : index) * r.slope / 113 + (r.rating - r.par);
}
/** Handicap de juego = handicap de campo (sin redondear) × % de la competencia, redondeado (0,5 sube). */
function playingHandicap(courseHcp, allowance = 95) {
	return roundWhs(courseHcp * allowance / 100);
}
/** Todo el cálculo para un jugador: Index escrito a mano + la salida que eligió + el % de la competencia. */
function handicapFor(index, course, teeId, opts = {}) {
	if (!isValidIndex(index)) throw new Error(`El Index va de -10 a 54.`);
	const allowance = opts.allowance ?? 95;
	const { rating, holes, estimated } = teeRating(course, findTee(course, teeId), opts.nine ?? "all");
	const courseHcp = courseHandicap(index, rating, holes);
	return {
		courseHcp,
		courseHcpRounded: roundWhs(courseHcp),
		playingHcp: playingHandicap(courseHcp, allowance),
		allowance,
		holes,
		estimated
	};
}
/**
* Golpes de ventaja por hoyo según el SI (el de SI más bajo recibe primero).
* - Con handicap mayor que el número de hoyos, un segundo golpe (o tercero) en los más difíciles.
* - Con handicap «plus» (negativo) se DEVUELVEN golpes empezando por el SI más alto (el 18): valores negativos.
* Con 9 hoyos cuenta el orden de los SI de esos hoyos (1, 3, 5… o 1–9 da igual).
* La suma siempre da el handicap de juego.
*/
function strokesReceived(playingHcp, sis) {
	const n = sis.length;
	if (!n) return [];
	const rank = new Array(n);
	sis.map((si, i) => ({
		si,
		i
	})).sort((a, b) => a.si - b.si || a.i - b.i).forEach((o, r) => rank[o.i] = r + 1);
	const ph = Math.trunc(playingHcp);
	if (ph >= 0) {
		const base = Math.floor(ph / n);
		const extra = ph % n;
		return rank.map((r) => base + (r <= extra ? 1 : 0));
	}
	const give = -ph;
	const base = Math.floor(give / n);
	const extra = give % n;
	return rank.map((r) => 0 - (base + (r > n - extra ? 1 : 0)));
}
//#endregion
//#region src/badges/rules/bowling.ts
/**
* Validación de boliche para las insignias (docs/insignias.md §1.7.5): juegos contados (B1), validados (B2), con
* cuadros que cuadran (B3) y con pinos anotados (BM), la regla de juez y parte, y lo que se lee de los cuadros
* (rachas de strikes, splits, el 7-10) con los helpers de src/lib/bowling.ts.
*/
/** Id de una foto (uuid). */
const PHOTO_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function markKind(mark) {
	if (!mark) return null;
	if (mark === "importado") return "importado";
	if (mark === "sin-foto") return "sin-foto";
	return PHOTO_ID_RE.test(mark) ? "foto" : null;
}
/** Juez y parte: la cuenta es owner, admin o anotador de esa liga cuando se evalúa. */
function isJudge(member) {
	return !!member && (member.role === "owner" || member.role === "admin" || member.is_scorer);
}
/** Orden de juego: fecha, hora de inicio, evento y número de juego. */
function gameOrder(a, b) {
	if (a.date !== b.date) return a.date < b.date ? -1 : 1;
	const ta = a.start_time ?? "";
	const tb = b.start_time ?? "";
	if (ta !== tb) return ta < tb ? -1 : 1;
	if (a.event_id !== b.event_id) return a.event_id < b.event_id ? -1 : 1;
	return a.index - b.index;
}
/** B3: los cuadros son un juego válido y terminado que suma lo anotado. */
function framesMatch(frames, score) {
	if (!frames || !Array.isArray(frames.rolls) || !validRolls(frames.rolls)) return false;
	const g = scoreGame(frames.rolls);
	return g.complete && g.score === score;
}
/**
* ¿Un juego anotado sin foto por un juez y parte viene de un envío que aprobó otra cuenta? Se empareja por jugador,
* evento (o su fecha) y puntaje; quien aprobó no es quien envió ni la cuenta del jugador.
*/
function approvedByOther(entry, eventDate, score, submissions, playerUser) {
	return submissions.some((s) => s.status === "aprobado" && s.player_id === entry.player_id && (s.event_id === entry.event_id || !s.event_id && s.date === eventDate) && s.scores.includes(score) && !!s.reviewed_by && s.reviewed_by !== s.created_by && s.reviewed_by !== playerUser);
}
/**
* Los juegos B1 de unas participaciones, en orden de juego: puntaje y marca no nulos y, si el jugador es juez y
* parte, solo fotos, importados o envíos que aprobó otra cuenta.
*/
function bowlingGames(input) {
	const events = new Map(input.events.map((e) => [e.id, e]));
	const out = [];
	for (const entry of input.entries) {
		const event = events.get(entry.event_id);
		if (!event) continue;
		const judge = input.judge?.(entry) ?? false;
		const scores = entry.scores ?? [];
		const photos = entry.photos ?? [];
		scores.forEach((score, index) => {
			if (score == null || !isValidScore(score)) return;
			const mark = markKind(photos[index]);
			if (!mark) return;
			if (judge && mark === "sin-foto" && !approvedByOther(entry, event.date, score, input.submissions ?? [], input.userOf?.(entry.player_id) ?? null)) return;
			const raw = entry.frames?.[String(index)] ?? null;
			const frames = framesMatch(raw, score) ? raw : null;
			out.push({
				entry_id: entry.id,
				event_id: entry.event_id,
				league_id: entry.league_id,
				player_id: entry.player_id,
				date: event.date,
				start_time: event.start_time,
				event_type: event.type,
				official: event.type === "torneo",
				index,
				score,
				mark,
				verified: mark !== "sin-foto",
				frames,
				masks: !!frames?.masks?.some((m) => m != null)
			});
		});
	}
	return out.sort(gameOrder);
}
/** Referencia de un juego para `badge_awards.refs`. */
const gameRef = (g) => `entry:${g.entry_id}:${g.index}`;
/** Actividad válida de boliche: una participación con al menos un juego B1 (oficial en torneos). */
function bowlingActivity(games, userOf) {
	const seen = /* @__PURE__ */ new Map();
	for (const g of games) {
		const k = `${g.player_id}|${g.date}`;
		const prev = seen.get(k);
		if (prev) prev.official = prev.official || g.official;
		else seen.set(k, {
			sport: "bowling",
			league_id: g.league_id,
			player_id: g.player_id,
			user_id: userOf(g.player_id),
			date: g.date,
			official: g.official
		});
	}
	return [...seen.values()];
}
/** Racha más larga de strikes en un juego, con las bolas extra del cuadro 10. */
function longestStrikeRun(rolls) {
	let best = 0;
	let run = 0;
	for (const m of scoreGame(rolls).frames.flatMap((f) => f.marks)) {
		run = m === "X" ? run + 1 : 0;
		best = Math.max(best, run);
	}
	return best;
}
/**
* Racks con pinos marcados en la primera bola (BM) y segunda bola jugada. La máscara tiene que cuadrar con los pinos
* que dice el tiro; si no, ese rack no cuenta (se escriben a mano).
*/
function rackLeaves(rolls, masks) {
	const out = [];
	for (let i = 0; i + 1 < rolls.length; i++) {
		if (!standingNow(rolls.slice(0, i))?.fresh || rolls[i] === 10) continue;
		const knocked = masks?.[i];
		if (knocked == null) continue;
		const leave = ALL_PINS & ~knocked;
		if (bitCount(leave) !== 10 - rolls[i]) continue;
		out.push({
			roll: i,
			leave,
			converted: rolls[i] + rolls[i + 1] === 10
		});
	}
	return out;
}
/** Splits convertidos de un juego (sin el 7-10, que va aparte) y 7-10 convertidos. */
function splitConversions(frames) {
	const racks = rackLeaves(frames.rolls, frames.masks).filter((r) => r.converted && isSplit(r.leave));
	return {
		splits: racks.filter((r) => r.leave !== 576),
		sevenTen: racks.filter((r) => r.leave === 576)
	};
}
function isValidStrokes(n) {
	return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 20;
}
/** Stableford: 2 puntos por el par neto, uno más por cada golpe menos, uno menos por cada golpe más, y nunca menos de 0. */
function stablefordPoints(strokes, par, received = 0) {
	return Math.max(0, 2 + par + received - strokes);
}
/** Tope del hoyo en el formato «máximo por hoyo». */
function maxScoreFor(rule, par, received) {
	switch (rule.kind) {
		case "netDoubleBogey": return par + 2 + received;
		case "doublePar": return par * 2;
		case "parPlus": return par + rule.n;
		case "fixed": return rule.value;
	}
}
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
/** Puntaje de una ronda (completa o en curso) en el formato de la competencia. */
function scoreRound(round, comp) {
	const { holes, card } = round;
	const received = strokesReceived(round.playingHcp, holes.map((h) => h.si));
	const rule = comp.maxScore ?? { kind: "netDoubleBogey" };
	const rows = holes.map((h, i) => {
		const pickedUp = !!card.pickedUp?.[i];
		const strokes = pickedUp ? null : card.strokes[i] ?? null;
		const played = pickedUp || strokes != null;
		let score = strokes;
		if (comp.format === "maxScore" && played) {
			const cap = maxScoreFor(rule, h.par, received[i]);
			score = strokes == null ? cap : Math.min(strokes, cap);
		}
		const points = !played ? null : strokes == null ? 0 : stablefordPoints(strokes, h.par, comp.basis === "net" ? received[i] : 0);
		return {
			...h,
			received: received[i],
			strokes,
			pickedUp,
			played,
			score,
			points,
			putts: card.putts?.[i] ?? null
		};
	});
	const done = rows.filter((r) => r.played);
	const thru = done.length;
	const gap = done.some((r) => r.score == null);
	const par = sum(done.map((r) => r.par));
	const gross = thru && !gap ? sum(done.map((r) => r.score)) : null;
	const net = gross == null ? null : gross - sum(done.map((r) => r.received));
	const putts = rows.filter((r) => r.putts != null);
	return {
		holes: rows,
		playingHcp: round.playingHcp,
		thru,
		complete: thru === holes.length,
		dq: comp.format === "stroke" && rows.some((r) => r.pickedUp),
		gross,
		net,
		points: sum(done.map((r) => r.points ?? 0)),
		par,
		toPar: gross == null ? null : gross - par,
		netToPar: net == null ? null : net - par,
		putts: putts.length ? sum(putts.map((r) => r.putts)) : null
	};
}
/** Stableford se gana con más puntos; stroke play y «máximo por hoyo», con menos golpes. */
function higherWins(comp) {
	return comp.format === "stableford";
}
/**
* Número que ordena la ronda: en Stableford los puntos; en los demás, golpes contra el par (neto o bruto),
* que sirve con la ronda a medias («thru») y con salidas de par distinto. null = sin empezar o sin total.
*/
function roundValue(s, comp) {
	if (!s.thru) return null;
	if (comp.format === "stableford") return s.points;
	return comp.basis === "net" ? s.netToPar : s.toPar;
}
//#endregion
//#region src/badges/rules/golf.ts
/**
* Validación de golf para las insignias (docs/insignias.md §1.7.5): tarjeta contada (G1) y validada (G2: con
* marcador de otra cuenta en el grupo y campo sano), hoyos de la tarjeta y actividad. Todo sobre la copia del campo
* que guarda la ronda (`golf_rounds.course`), con los helpers de src/sports/golf.
*/
/** Hoyos que juega la tarjeta con el par y el SI de su salida; null si la salida no está en la copia del campo. */
function cardHoles(card, round) {
	try {
		return teeHoles(round.course, findTee(round.course, card.tee_id), round.nine);
	} catch {
		return null;
	}
}
/** G1: firmada, sin DQ, ronda cerrada y todos los hoyos de la vuelta con golpes o bola levantada. */
function isG1(card, round) {
	if (card.status !== "firmada" || card.dq || round.status !== "cerrada" || card.event_id !== round.event_id) return false;
	const holes = cardHoles(card, round);
	if (!holes || card.strokes.length !== holes.length) return false;
	return holes.every((_, i) => isValidStrokes(card.strokes[i]) || !!card.picked_up?.[i]);
}
/**
* Campo sano en la copia de la ronda: pares de 3 a 5, par total 68–74 (34–37 en 9 hoyos), rating 55–80 (en 9
* hoyos, la mitad) y slope 55–155.
*/
function saneField(round, teeId) {
	const holes = cardHoles({ tee_id: teeId }, round);
	if (!holes || holes.length !== 9 && holes.length !== 18) return false;
	if (!holes.every((h) => h.par >= 3 && h.par <= 5)) return false;
	const par = holes.reduce((n, h) => n + h.par, 0);
	const nine = holes.length === 9;
	if (nine ? par < 34 || par > 37 : par < 68 || par > 74) return false;
	const r = roundRating(round, teeId);
	const [lo, hi] = nine ? [27.5, 40] : [55, 80];
	return !!r && r.rating >= lo && r.rating <= hi && r.slope >= 55 && r.slope <= 155;
}
/** Rating, slope y par de la salida para los hoyos de la ronda (la vuelta de 9 si es de 9); null si no existe. */
function roundRating(round, teeId) {
	try {
		return teeRating(round.course, findTee(round.course, teeId), round.nine).rating;
	} catch {
		return null;
	}
}
/** Marcador: otra tarjeta G1 del mismo evento y grupo, de otra cuenta. */
function hasMarker(card, cards, round, userOf) {
	if (card.group_no == null) return false;
	const me = userOf(card.player_id);
	return cards.some((c) => {
		if (c.id === card.id || c.event_id !== card.event_id || c.group_no !== card.group_no || !isG1(c, round)) return false;
		const u = userOf(c.player_id);
		return !!u && u !== me;
	});
}
/** Cuentas que marcaron la tarjeta (evidencia de las hazañas). */
function markersOf(card, cards, round, userOf) {
	if (card.group_no == null) return [];
	const me = userOf(card.player_id);
	const out = /* @__PURE__ */ new Set();
	for (const c of cards) {
		if (c.id === card.id || c.event_id !== card.event_id || c.group_no !== card.group_no || !isG1(c, round)) continue;
		const u = userOf(c.player_id);
		if (u && u !== me) out.add(u);
	}
	return [...out];
}
/** G2: G1, marcador de otra cuenta en el grupo y campo sano. */
function isG2(card, round, cards, userOf) {
	return isG1(card, round) && saneField(round, card.tee_id) && hasMarker(card, cards, round, userOf);
}
/** Bruto sin hoyos levantados (null si levantó alguno o falta un hoyo). */
function grossOf(card, holes) {
	let total = 0;
	for (let i = 0; i < holes.length; i++) {
		const s = card.strokes[i];
		if (card.picked_up?.[i] || !isValidStrokes(s)) return null;
		total += s;
	}
	return total;
}
/**
* Actividad válida de golf: una tarjeta G1 da el día de la ronda. Oficial si la ronda cerrada tuvo 3+ tarjetas G1.
*/
function golfActivity(cards, rounds, ctx) {
	const byEvent = new Map(rounds.map((r) => [r.event_id, r]));
	const counted = cards.filter((c) => {
		const r = byEvent.get(c.event_id);
		return !!r && isG1(c, r);
	});
	const perEvent = /* @__PURE__ */ new Map();
	for (const c of counted) perEvent.set(c.event_id, (perEvent.get(c.event_id) ?? 0) + 1);
	const out = [];
	for (const c of counted) {
		const date = ctx.dateOf(c.event_id);
		if (!date) continue;
		out.push({
			sport: "golf",
			league_id: c.league_id,
			player_id: c.player_id,
			user_id: ctx.userOf(c.player_id),
			date,
			official: (perEvent.get(c.event_id) ?? 0) >= 3
		});
	}
	return out;
}
/**
* Línea base de boliche antes de la fecha `before` ('YYYY-MM-DD', sin incluirla): piso de la media de los últimos
* `window` juegos B1 (de la cuenta: todos sus jugadores de boliche; sin cuenta: los de su liga). null con menos de
* `min` juegos.
*/
function bowlingBaseline(games, before, opts = {}) {
	const window = opts.window ?? 30;
	const min = opts.min ?? 12;
	const prior = games.filter((g) => g.date < before).sort(gameOrder).slice(-window);
	if (prior.length < min) return null;
	return {
		base: Math.floor(prior.reduce((n, g) => n + g.score, 0) / prior.length),
		games: prior.length
	};
}
/** % (0–100, con decimales) de juegos ganados sobre jugados; null sin juegos. */
function gamesWonPct(pairs) {
	let won = 0;
	let played = 0;
	for (const [mine, theirs] of pairs) {
		won += mine;
		played += mine + theirs;
	}
	return played ? won / played * 100 : null;
}
/**
* Diferencial MatchMate (no oficial) de una tarjeta: bruto ajustado = Σ min(golpes, par + 3), un hoyo levantado vale
* par + 3; diferencial = (bruto ajustado − rating) × 113 / slope, con la salida de la copia del campo. Las de 9 hoyos
* usan el rating de su vuelta y solo se comparan con otras de 9. Una décima. null si falta un hoyo o la salida.
*/
function golfDifferential(card, round) {
	const holes = cardHoles(card, round);
	const r = roundRating(round, card.tee_id);
	if (!holes || !r || holes.length !== 9 && holes.length !== 18) return null;
	let adjusted = 0;
	for (let i = 0; i < holes.length; i++) {
		const cap = holes[i].par + 3;
		const s = card.strokes[i];
		if (card.picked_up?.[i]) adjusted += cap;
		else if (typeof s === "number" && s >= 1) adjusted += Math.min(s, cap);
		else return null;
	}
	return {
		value: Math.round((adjusted - r.rating) * 113 * 10 / r.slope) / 10,
		holes: holes.length === 9 ? 9 : 18
	};
}
/** Diferenciales que entran al índice derivado, los mejores de cuántos, y el mínimo para calcularlo. */
const DERIVED_INDEX = {
	last: 20,
	best: 8,
	min: 5
};
/**
* Índice topado (§1.7.6) = min(`hcp_index`, índice derivado). Derivado = media de los mejores 8 de los últimos 20
* diferenciales de rondas G2 de 18 hoyos (en orden de fecha). Con menos de 5 diferenciales, el escrito topado en 36.
* Sin índice escrito se juega con 0, como en la ronda.
*/
function cappedIndex(hcpIndex, differentials18) {
	const own = typeof hcpIndex === "number" && Number.isFinite(hcpIndex) ? hcpIndex : 0;
	const clamp = (x) => Math.min(54, Math.max(-10, x));
	if (differentials18.length < DERIVED_INDEX.min) return clamp(Math.min(own, 36));
	const best = [...differentials18.slice(-DERIVED_INDEX.last)].sort((a, b) => a - b).slice(0, DERIVED_INDEX.best);
	const derived = Math.round(best.reduce((n, d) => n + d, 0) / best.length * 10) / 10;
	return clamp(Math.min(own, derived));
}
/** Hándicap de juego recalculado con el índice topado, con el % de la competencia de la ronda. */
function cappedPlayingHcp(card, round, index) {
	try {
		return handicapFor(index, round.course, card.tee_id, {
			nine: round.nine,
			allowance: round.competition?.allowance ?? 95
		}).playingHcp;
	} catch {
		return null;
	}
}
//#endregion
//#region src/pages/sports/racket/logic/time.ts
/**
* Fechas y horas en la zona de la liga (leagues.tz). Los partidos guardan `scheduled_at` en UTC; el admin escribe
* la fecha y la hora de la liga ('2026-10-08' y '20:00' en Santo Domingo). Sin librerías: Intl.
*/
const DEFAULT_TZ = "America/Santo_Domingo";
const formatters = /* @__PURE__ */ new Map();
const formatterOf = (tz) => {
	let fmt = formatters.get(tz);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit"
		});
		formatters.set(tz, fmt);
	}
	return fmt;
};
const parts = (ts, tz) => {
	const out = {};
	for (const p of formatterOf(tz).formatToParts(ts)) if (p.type !== "literal") out[p.type] = Number(p.value);
	return out;
};
const badZones = /* @__PURE__ */ new Set();
const safeTz = (tz) => {
	const z = tz || "America/Santo_Domingo";
	if (formatters.has(z)) return z;
	if (badZones.has(z)) return DEFAULT_TZ;
	try {
		formatterOf(z);
		return z;
	} catch {
		badZones.add(z);
		return DEFAULT_TZ;
	}
};
/** ISO → fecha y hora de la zona: { date: '2026-10-08', time: '20:00' }. */
function localParts(iso, tz) {
	if (!iso) return null;
	const ts = Date.parse(iso);
	if (!Number.isFinite(ts)) return null;
	const p = parts(ts, safeTz(tz));
	const two = (n) => String(n).padStart(2, "0");
	return {
		date: `${p.year}-${two(p.month)}-${two(p.day)}`,
		time: `${two(p.hour % 24)}:${two(p.minute)}`
	};
}
/** Fecha 'YYYY-MM-DD' más n días. */
function addDays(date, days) {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
//#endregion
//#region src/badges/rules/periods.ts
/**
* Relojes y claves de periodo de las insignias (docs/insignias.md §1.7.1). Las fechas son locales de la liga
* (`leagues.tz`, hoy todas Santo Domingo, UTC−4 sin horario de verano); las de cuenta que suman ligas cortan meses y
* años en Santo Domingo. Las cuentas de fechas usan los helpers de la app (`localParts`, `addDays`).
*/
/** Zona de las insignias de cuenta. */
const BADGE_TZ = DEFAULT_TZ;
/** Claves de periodo (§1.7.1). Una fila por dueño, key, deporte, nivel y periodo. */
const periodKey = {
	/** Siempre (carrera, aniversario): una fila por nivel. */
	always: "-",
	event: (eventId, catId) => catId ? `e:${eventId}:${catId}` : `e:${eventId}`,
	match: (matchId) => `m:${matchId}`,
	/** Un juego de boliche (`i` = índice del juego, desde 0). */
	game: (entryId, i) => `g:${entryId}:${i}`,
	card: (cardId) => `c:${cardId}`,
	/** Un resultado de natación (`swim_entries.id`). */
	race: (swimEntryId) => `r:${swimEntryId}`,
	golfTournament: (id) => `gt:${id}`,
	/** 'YYYY-MM'. */
	month: (month) => month,
	/** Mes `n` de una liga por cajas. */
	box: (eventId, n) => `b:${eventId}:${n}`,
	season: (seasonId, catId) => catId ? `s:${seasonId}:${catId}` : `s:${seasonId}`,
	year: (year) => String(year),
	league: (leagueId) => `l:${leagueId}`
};
/** Fecha local ('YYYY-MM-DD') de una hora ISO en la zona. */
const localDate = (iso, tz = BADGE_TZ) => localParts(iso, tz)?.date ?? null;
/** Fecha de un partido para las insignias: `coalesce(scheduled_at, proposed_at, created_at)` en la zona de la liga. */
function matchDate(m, tz) {
	return localDate(m.scheduled_at ?? m.proposed_at ?? m.created_at, tz);
}
/** Hoy en la zona ('YYYY-MM-DD'). */
const todayIn = (now, tz = BADGE_TZ) => localDate(typeof now === "string" ? now : new Date(now).toISOString(), tz) ?? new Date(now).toISOString().slice(0, 10);
/** 'YYYY-MM' de una fecha. */
const monthOf = (date) => date.slice(0, 7);
/** Mes `n` meses después (o antes, con negativos). */
function addMonths(month, n) {
	const [y, m] = month.split("-").map(Number);
	const t = y * 12 + (m - 1) + n;
	return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")}`;
}
/** Meses de `a` a `b`, ambos incluidos (vacío si `b` va antes). */
function monthsBetween(a, b) {
	const out = [];
	for (let m = a; m <= b && out.length < 1200; m = addMonths(m, 1)) out.push(m);
	return out;
}
/** Primer y último día de un mes. */
function monthRange(month) {
	return [`${month}-01`, addDays(`${addMonths(month, 1)}-01`, -1)];
}
/** Días entre dos fechas (b − a). */
function daysBetween(a, b) {
	return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
}
/** Semana ISO de una fecha ('2026-W40'): el tope de días ponderados es por semana (§1.7.3). */
function isoWeek(date) {
	const d = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
	const year = d.getUTCFullYear();
	const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 864e5 + 1) / 7);
	return `${year}-W${String(week).padStart(2, "0")}`;
}
/** Último día que ya cuenta para las de cuenta: la actividad de hace 48 h o más (§2.1, `mileage`). */
function settledThrough(now, tz = BADGE_TZ) {
	return addDays(todayIn(now, tz), -Math.ceil(2));
}
/** Día en que se evalúa un mes (el 3 del mes siguiente) y un año (el 7 de enero siguiente). */
const monthDueOn = (month) => `${addMonths(month, 1)}-03`;
const yearDueOn = (year) => `${year + 1}-01-07`;
/**
* Desde qué fecha la cuenta es establecida: 7 días después de `created_at` ('YYYY-MM-DD' en UTC, basta para un
* margen de días). Las de BowlingX, desde su primer juego importado si es antes.
*/
function establishedFrom(p) {
	const byAge = addDays(p.created_at.slice(0, 10), 7);
	return p.bowlingx && p.first_import_on && p.first_import_on < byAge ? p.first_import_on : byAge;
}
/** ¿Establecida para un periodo que termina en `periodEnd` ('YYYY-MM-DD')? Nunca si está bloqueada. */
function isEstablished(p, periodEnd) {
	return !!p && !p.blocked_at && establishedFrom(p) <= periodEnd;
}
/**
* ¿La liga es real en el mes `month`? Al menos 4 CE (establecidas al cierre del mes) con actividad válida en ese mes
* o en los dos anteriores. En una liga `kind='torneo'` se cuenta todo el torneo hasta ese mes. Sin retroactivo: solo
* mira hasta el cierre del mes, y una cuenta creada después nunca es establecida para ese mes.
*/
function isRealLeagueMonth(input, month) {
	const { league, months, profiles, exclude } = input;
	const end = monthRange(month)[1];
	const from = league.kind === "torneo" ? "0000-00" : addMonths(month, -2);
	const window = months.filter((m) => m.league_id === league.id && m.month >= from && m.month <= month);
	const users = /* @__PURE__ */ new Set();
	const players = /* @__PURE__ */ new Set();
	for (const m of window) {
		m.users.forEach((u) => users.add(u));
		m.players.forEach((p) => players.add(p));
	}
	if (league.has_minors) return (input.members ?? []).filter((x) => x.league_id === league.id && (x.role === "owner" || x.role === "admin") && x.user_id !== exclude && isEstablished(profiles.get(x.user_id), end)).length >= 2 && players.size >= 6;
	let n = 0;
	for (const u of users) if (u !== exclude && isEstablished(profiles.get(u), end)) n++;
	return n >= 4;
}
/** Liga con peso para el mes: LR, 6+ jugadores activos y 3+ CE activas en el mes. */
function weightyMonth(input, month) {
	if (!isRealLeagueMonth(input, month)) return false;
	const end = monthRange(month)[1];
	const row = input.months.find((m) => m.league_id === input.league.id && m.month === month);
	if (!row || row.players.length < 6) return false;
	return row.users.filter((u) => isEstablished(input.profiles.get(u), end)).length >= 3;
}
/**
* Liga con peso para una temporada o torneo: 6+ competidores que califican y 4+ CE; o 12+ competidores cuyos
* resultados escribieron 2+ cuentas distintas (`proposed_by`, `confirmed_by`, `recorded_by`, `reviewed_by`).
*/
function weightySeason(x) {
	return x.competitors >= 6 && x.establishedAccounts >= 4 || x.competitors >= 12 && x.writers >= 2;
}
/** Liga con peso para el año: 8+ jugadores activos y 4+ CE en el año. */
function weightyYear(x) {
	return x.players >= 8 && x.establishedAccounts >= 4;
}
const CAPS = {
	/** Boliche: juegos por día. */
	bowlingGamesPerDay: 10,
	/** Raqueta: partidos por día. */
	racketMatchesPerDay: 4,
	/** Raqueta: victorias contra el mismo rival (`entrantKey`) por mes. */
	racketWinsPerRivalMonth: 3,
	/** Equipos: victorias contra el mismo equipo por mes. */
	teamWinsPerTeamMonth: 2,
	/** Golf: tarjetas por día. */
	golfCardsPerDay: 1
};
/** Deja los primeros `max` de cada día (la lista ya viene en orden de juego). */
function capPerDay(items, dayOf, max) {
	const used = /* @__PURE__ */ new Map();
	return items.filter((t) => {
		const d = dayOf(t);
		const n = used.get(d) ?? 0;
		if (n >= max) return false;
		used.set(d, n + 1);
		return true;
	});
}
/** Deja los primeros `max` por (rival, mes) (la lista ya viene en orden). */
function capPerRivalMonth(items, rivalOf, monthOf, max) {
	return capPerDay(items, (t) => `${rivalOf(t)}|${monthOf(t)}`, max);
}
const MINIMUMS = {
	/** Título del mes. Boliche: si la liga tuvo 1–2 fechas oficiales, todas y 6+ juegos. */
	titleMonth: {
		bowlingGames: 9,
		bowlingDates: 3,
		bowlingGamesFewDates: 6,
		racketMatches: 4,
		teamMatchesWithLines: 2,
		teamMatchesAsTeam: 3,
		golfCards: 2
	},
	/** Progreso del mes. */
	progressMonth: {
		bowlingGames: 9,
		bowlingBase: 12,
		racketMatches: 4,
		racketPrior90: 6,
		golfCards: 2,
		golfBase: 4,
		swimRaces: 2
	},
	/** Título de temporada: participación mínima. */
	titleSeason: {
		bowlingDatesPct: 50,
		bowlingGames: 12,
		racketMatchesPct: 50,
		teamMatchesPct: 30,
		golfRoundsPct: 50,
		swimMeetsPct: 50
	}
};
/** Niveles del podio según los competidores que califican: <4 nada; 4–5 oro; 6–9 oro y plata; 10+ los tres. */
function podiumLevels(qualifying) {
	if (qualifying < 4) return [];
	if (qualifying < 6) return [3];
	if (qualifying < 10) return [3, 2];
	return [
		3,
		2,
		1
	];
}
/**
* Puestos de competición con un comparador (negativo = `a` va antes): los empatados comparten puesto (1, 2, 2, 4).
* Como `rank` de src/lib/stats.ts, pero con desempates de varias reglas.
*/
function rankWith(rows, cmp) {
	const sorted = [...rows].sort(cmp);
	let place = 0;
	return sorted.map((row, i) => {
		if (i === 0 || cmp(sorted[i - 1], row) !== 0) place = i + 1;
		return {
			row,
			place
		};
	});
}
/**
* Los primeros después de los desempates. Si comparten más de `MAX_SHARED`, nadie: `multiTie` para que la liga
* diga «Empate múltiple: este mes no hubo {figura}».
*/
function topWithTies(rows, cmp) {
	const first = rankWith(rows, cmp).filter((r) => r.place === 1);
	if (first.length > 3) return {
		winners: [],
		multiTie: true
	};
	return {
		winners: first.map((r) => r.row),
		multiTie: false
	};
}
/**
* Oro, plata y bronce de una tabla ya ordenable. `levels` dice qué metales se dan (`podiumLevels`); un puesto que
* comparten más de 3 no da nada. Con empates, el que sigue salta puestos (1, 1, 3): nunca dos oros y una plata
* de tercero.
*/
function podiumAwards(rows, cmp, levels) {
	const ranked = rankWith(rows, cmp);
	const out = [];
	for (const place of [
		1,
		2,
		3
	]) {
		const level = 4 - place;
		if (!levels.includes(level)) continue;
		const at = ranked.filter((r) => r.place === place);
		if (!at.length || at.length > 3) continue;
		for (const r of at) out.push({
			row: r.row,
			place,
			level
		});
	}
	return out;
}
//#endregion
//#region src/badges/rules/activity.ts
/**
* Actividad, días activos, días ponderados y meses activos (docs/insignias.md §1.7.2 y §1.7.3). Todo sale de
* `ActivityDay`: un (jugador, fecha local) con al menos una actividad válida, que arma cada deporte en su archivo de
* reglas (bowling.ts, racket.ts, team.ts, golf.ts, swim.ts) o que SQL manda ya resuelto para las de cuenta.
* Quien llama filtra antes las ligas que no son reales en ese mes (gates.ts).
*/
/** Un día de golf (ronda) o de natación (encuentro) vale 2: son salidas de medio día y hay menos. */
const DAY_WEIGHT = {
	bowling: 1,
	padel: 1,
	tennis: 1,
	pickleball: 1,
	basketball: 1,
	football: 1,
	futsal: 1,
	golf: 2,
	swimming: 2
};
const holderOf = (a, by = "user") => by === "user" ? a.user_id ?? a.player_id : a.player_id;
/** Días activos: uno por (dueño, fecha), sin importar cuántas ligas o actividades hubo ese día. En orden. */
function activeDays(acts, by = "user") {
	const map = /* @__PURE__ */ new Map();
	for (const a of acts) {
		const holder = holderOf(a, by);
		const k = `${holder}|${a.date}`;
		let d = map.get(k);
		if (!d) {
			d = {
				holder,
				date: a.date,
				sports: [],
				leagues: [],
				weight: 1,
				official: false,
				rosterOnly: true
			};
			map.set(k, d);
		}
		if (!d.sports.includes(a.sport)) d.sports.push(a.sport);
		if (!d.leagues.includes(a.league_id)) d.leagues.push(a.league_id);
		if (DAY_WEIGHT[a.sport] === 2) d.weight = 2;
		if (a.official && !a.roster) d.official = true;
		if (!a.roster) d.rosterOnly = false;
	}
	return [...map.values()].sort((x, y) => x.holder < y.holder ? -1 : x.holder > y.holder ? 1 : x.date < y.date ? -1 : x.date > y.date ? 1 : 0);
}
/**
* Días ponderados con el tope de 4 por semana ISO y por dueño: en orden de fecha, los primeros llenan la semana
* (un día de golf que ya no cabe entero suma lo que falta).
*/
function weighDays(days) {
	const used = /* @__PURE__ */ new Map();
	return [...days].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).map((d) => {
		const k = `${d.holder}|${isoWeek(d.date)}`;
		const before = used.get(k) ?? 0;
		const weight = Math.max(0, Math.min(d.weight, 4 - before));
		used.set(k, before + weight);
		return {
			holder: d.holder,
			date: d.date,
			weight
		};
	});
}
/** Días ponderados por mes ('YYYY-MM' → días), de un solo dueño. */
function weightByMonth(days) {
	const out = /* @__PURE__ */ new Map();
	for (const d of days) out.set(monthOf(d.date), (out.get(monthOf(d.date)) ?? 0) + d.weight);
	return out;
}
/** Meses activos (2+ días ponderados), en orden, de un solo dueño. */
function activeMonths(days, min = 2) {
	return [...weightByMonth(days)].filter(([, w]) => w >= min).map(([m]) => m).sort();
}
/**
* Meses seguidos de la racha que llega a `end` (`month_streak`). **Comodín:** un mes inactivo en cualquier ventana
* de `window` meses no rompe la racha, pero tampoco suma. Dos huecos a menos de `window` meses la rompen, igual que
* dos meses inactivos seguidos.
*/
function monthStreak(months, end, window = 12) {
	const active = new Set(months);
	if (!active.size) return 0;
	const first = [...active].sort()[0];
	let count = 0;
	let lastGap = null;
	for (let m = end; m >= first; m = addMonths(m, -1)) {
		if (active.has(m)) {
			count++;
			continue;
		}
		const prev = addMonths(m, -1);
		const farFromGap = lastGap === null || addMonths(m, window) <= lastGap;
		if (!active.has(prev) || !farFromGap) break;
		lastGap = m;
	}
	return count;
}
/** Días activos distintos dentro de los `windowDays` días desde el primero (`strong_start`), de un solo dueño. */
function firstWindowDays(days, windowDays = 30) {
	if (!days.length) return null;
	const sorted = [...new Set(days.map((d) => d.date))].sort();
	const first = sorted[0];
	const last = addDays(first, windowDays - 1);
	return {
		first,
		last,
		days: sorted.filter((d) => d <= last).length
	};
}
/** Familias (series, raqueta, equipo) de unos deportes. */
function familiesOf(sports) {
	return new Set(sports.map((s) => SPORT_FAMILY[s]));
}
/**
* Quién tuvo actividad válida en cada (liga, mes): la base de «liga real». Lo que viene solo por plantilla no
* cuenta (la plantilla vale para días activos, debut y kilometraje, nada más).
*/
function leagueMonths(acts) {
	const map = /* @__PURE__ */ new Map();
	for (const a of acts) {
		if (a.roster) continue;
		const month = monthOf(a.date);
		const k = `${a.league_id}|${month}`;
		const row = map.get(k) ?? {
			league_id: a.league_id,
			month,
			users: /* @__PURE__ */ new Set(),
			players: /* @__PURE__ */ new Set()
		};
		if (a.user_id) row.users.add(a.user_id);
		row.players.add(a.player_id);
		map.set(k, row);
	}
	return [...map.values()].map((r) => ({
		league_id: r.league_id,
		month: r.month,
		users: [...r.users].sort(),
		players: [...r.players].sort()
	})).sort((a, b) => a.league_id < b.league_id ? -1 : a.league_id > b.league_id ? 1 : a.month < b.month ? -1 : a.month > b.month ? 1 : 0);
}
/** Une actividades repetidas (mismo jugador, liga, deporte y fecha): una sola por día, oficial si alguna lo fue. */
function dedupeActivity(acts) {
	const map = /* @__PURE__ */ new Map();
	for (const a of acts) {
		const k = `${a.player_id}|${a.league_id}|${a.sport}|${a.date}`;
		const prev = map.get(k);
		if (!prev) map.set(k, { ...a });
		else {
			prev.official = prev.official || a.official;
			if (!a.roster) prev.roster = false;
			prev.user_id = prev.user_id ?? a.user_id;
		}
	}
	return [...map.values()];
}
//#endregion
//#region src/lib/data/matchCore.ts
/** Lado 1 o 2 de un valor de la base; null si no es ninguno. */
const asSide = (v) => v === 1 || v === 2 ? v : null;
/** Hora de la base como texto ISO (o null). */
const iso = (v) => typeof v === "string" && v ? v : v instanceof Date ? v.toISOString() : null;
const emptySide = (side) => ({
	side,
	teamId: null,
	label: "Por definir",
	seed: null,
	players: []
});
/** Fila + lados + jugadores → partido de la app (horas en texto: `Wire`). */
function toMatch(row, sideRows = [], playerRows = []) {
	const sides = [1, 2].map((n) => {
		const s = sideRows.find((r) => r.match_id === row.id && r.side === n);
		const base = s ? {
			side: n,
			teamId: s.team_id,
			label: s.label,
			seed: s.seed,
			players: []
		} : emptySide(n);
		base.players = playerRows.filter((p) => p.match_id === row.id && p.side === n).map((p) => ({
			playerId: p.player_id,
			side: n,
			position: p.position,
			jersey: p.jersey,
			sub: !!p.sub
		}));
		return base;
	});
	const out = {
		...rowFields(row),
		sides
	};
	if (row.rules !== void 0) out.rules = row.rules ?? {};
	if (row.state !== void 0) out.state = row.state ?? null;
	if (row.history !== void 0) out.history = Array.isArray(row.history) ? row.history : [];
	return out;
}
/** Los campos de la fila (sin lados): también lo que trae el aviso 'match' de tiempo real. */
function rowFields(row) {
	const wo = row.walkover_side;
	return {
		id: row.id,
		leagueId: row.league_id,
		eventId: row.event_id ?? null,
		round: row.round ?? null,
		stage: row.stage ?? "",
		bracketKey: row.bracket_key ?? null,
		court: row.court ?? "",
		scheduledAt: iso(row.scheduled_at),
		status: row.status,
		format: row.format ?? "",
		requireConfirm: row.require_confirm !== false,
		score: row.score ?? null,
		winner: asSide(row.winner_side),
		walkoverSide: wo === 0 || wo === 1 || wo === 2 ? wo : null,
		scorerId: row.scorer_id ?? null,
		leaseUntil: iso(row.lease_until),
		seq: row.seq ?? 0,
		version: row.version ?? 0,
		proposedBy: row.proposed_by ?? null,
		proposedAt: iso(row.proposed_at),
		proposedSide: asSide(row.proposed_side),
		confirmedBy: row.confirmed_by ?? null,
		confirmedAt: iso(row.confirmed_at),
		disputedBy: row.disputed_by ?? null,
		disputedAt: iso(row.disputed_at),
		disputeNote: row.dispute_note ?? null,
		note: row.note ?? null,
		createdBy: row.created_by ?? null,
		seriesId: row.series_id ?? null,
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at)
	};
}
/** Un resultado propuesto sin reclamo cuenta como final a las 48 h. */
const AUTO_CONFIRM_MS = 1728e5;
/** Cuándo (ms) un resultado propuesto cuenta solo; null si no está por confirmar. */
function autoConfirmAt(m) {
	if (m.status !== "finished" || !m.proposedAt) return null;
	const t = Date.parse(m.proposedAt);
	return Number.isFinite(t) ? t + AUTO_CONFIRM_MS : null;
}
/** El resultado cuenta para tablas y estadísticas: confirmado, W.O., o propuesto hace 48 h o más. */
function isFinal(m, now = Date.now()) {
	if (m.status === "confirmed" || m.status === "walkover") return true;
	const at = autoConfirmAt(m);
	return at !== null && at <= now;
}
/** Solo los partidos que cuentan (para las tablas de cada deporte). */
const finalMatches = (list, now = Date.now()) => list.filter((m) => isFinal(m, now));
/** Id del lado para las tablas: la pareja o el equipo; si no hay, sus jugadores ordenados (`p:<id>+<id>`). */
function sideKey(s) {
	if (s.teamId) return s.teamId;
	return `p:${s.players.map((p) => p.playerId).sort().join("+")}`;
}
//#endregion
//#region src/lib/data/stamp.ts
var ServerTime = class {
	iso;
	ms;
	constructor(iso) {
		this.iso = iso;
		this.ms = Date.parse(iso);
	}
	toMillis() {
		return this.ms;
	}
	toDate() {
		return new Date(this.ms);
	}
	toISOString() {
		return this.iso;
	}
};
/** Hora del servidor (texto ISO) como `Stamp`; null si no hay. */
function toStamp(iso) {
	return typeof iso === "string" && iso ? new ServerTime(iso) : null;
}
//#endregion
//#region src/sports/formats/random.ts
/** Hash FNV-1a de 32 bits: el mismo texto da siempre el mismo número. */
function hashString(s) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
/** Número de sorteo de un id: menor sale primero. Con otra semilla (p. ej. el id de la liga) cambia el orden. */
function lotValue(id, seed = "") {
	return hashString(`${seed}:${id}`);
}
//#endregion
//#region src/sports/formats/standings.ts
function emptyRow(id) {
	return {
		id,
		played: 0,
		won: 0,
		drawn: 0,
		lost: 0,
		points: 0,
		for: 0,
		against: 0,
		diff: 0,
		extra: {
			walkovers: 0,
			walkoverWins: 0
		},
		rank: 0
	};
}
function addSide(row, m, side, pts, keys) {
	const other = side === 1 ? 2 : 1;
	row.played++;
	if (m.walkover === side) {
		row.lost++;
		row.points += pts.walkoverLoss;
		row.extra.walkovers++;
	} else if (m.walkover === other) {
		row.won++;
		row.points += pts.walkoverWin ?? pts.win;
		row.extra.walkoverWins++;
	} else if (m.winner === side) {
		row.won++;
		row.points += pts.win;
	} else if (m.winner === null) {
		row.drawn++;
		row.points += pts.draw;
	} else {
		row.lost++;
		row.points += pts.loss;
	}
	for (const [key, pair] of Object.entries(m.totals)) {
		const mine = side === 1 ? pair[0] : pair[1];
		const theirs = side === 1 ? pair[1] : pair[0];
		keys.add(key);
		row.extra[`${key}For`] = (row.extra[`${key}For`] ?? 0) + mine;
		row.extra[`${key}Against`] = (row.extra[`${key}Against`] ?? 0) + theirs;
		row.extra[`${key}Diff`] = (row.extra[`${key}Diff`] ?? 0) + mine - theirs;
	}
}
/**
* Filas de tabla (sin ordenar, rank 0) para `ids`. Solo cuentan los partidos con los dos lados en `ids`
* (una tabla es una competencia cerrada: grupo, caja, liga). El W.O. cuenta como jugado para los dos.
*/
function buildRows(ids, results, points, primary) {
	const rows = /* @__PURE__ */ new Map();
	for (const id of ids) if (!rows.has(id)) rows.set(id, emptyRow(id));
	const keys = /* @__PURE__ */ new Set();
	for (const m of results) {
		const r1 = rows.get(m.side1);
		const r2 = rows.get(m.side2);
		if (!r1 || !r2 || m.side1 === m.side2) continue;
		addSide(r1, m, 1, points, keys);
		addSide(r2, m, 2, points, keys);
	}
	for (const row of rows.values()) {
		for (const k of keys) for (const suf of [
			"For",
			"Against",
			"Diff"
		]) row.extra[k + suf] ??= 0;
		row.for = row.extra[`${primary}For`] ?? 0;
		row.against = row.extra[`${primary}Against`] ?? 0;
		row.diff = row.for - row.against;
	}
	return [...rows.values()];
}
const DEFAULT_POINTS = {
	win: 3,
	draw: 1,
	loss: 0,
	walkoverLoss: 0
};
function defaultBuild(ids, results) {
	const primary = results.length ? Object.keys(results[0].totals)[0] ?? "" : "";
	return buildRows(ids, results, DEFAULT_POINTS, primary);
}
/**
* Ordena la tabla con los criterios y pone `rank` y `decidedBy`. Empates que ningún criterio rompe comparten
* puesto (1, 2, 2, 4) y quedan en el orden de entrada. No cambia las filas recibidas: devuelve copias.
*/
function resolveTies(rows, results, criteria, opts = {}) {
	const build = opts.build ?? defaultBuild;
	const restart = opts.restart ?? "always";
	const byId = new Map(rows.map((r) => [r.id, r]));
	const miniValues = (c, group, ids, games) => {
		const mini = new Map(build(ids, games).map((r) => [r.id, r]));
		return group.map((id) => c.value(mini.get(id) ?? emptyRow(id)));
	};
	const valuesFor = (c, group, above) => {
		const inGroup = new Set(group);
		switch (c.scope) {
			case "all": return group.map((id) => c.value(byId.get(id)));
			case "h2h": return miniValues(c, group, group, results.filter((m) => inGroup.has(m.side1) && inGroup.has(m.side2)));
			case "above": {
				if (above == null) return null;
				const games = results.filter((m) => m.side1 === above && inGroup.has(m.side2) || m.side2 === above && inGroup.has(m.side1));
				if (!games.length) return null;
				return miniValues(c, group, [...group, above], games);
			}
			case "lot": return group.map((id) => lotValue(id, c.seed));
		}
	};
	const order = (group, start, above) => {
		if (group.length === 1) return [{
			id: group[0],
			tiedWithPrev: false
		}];
		for (let i = start; i < criteria.length; i++) {
			const c = criteria[i];
			const values = valuesFor(c, group, above);
			if (!values) continue;
			const asc = c.scope === "lot" ? true : !!c.asc;
			const idx = group.map((_, k) => k).sort((a, b) => (asc ? values[a] - values[b] : values[b] - values[a]) || a - b);
			const parts = [];
			idx.forEach((k, pos) => {
				if (pos > 0 && values[k] === values[idx[pos - 1]]) parts[parts.length - 1].push(group[k]);
				else parts.push([group[k]]);
			});
			if (parts.length === 1) continue;
			const label = typeof c.label === "function" ? c.label(group.length) : c.label;
			const next = restart === "always" || c.scope === "h2h" ? 0 : i + 1;
			const placed = [];
			let prevAbove = above;
			parts.forEach((p, k) => {
				const sub = p.length === 1 ? [{
					id: p[0],
					tiedWithPrev: false
				}] : order(p, next, prevAbove);
				if (k > 0) sub[0] = {
					...sub[0],
					decidedBy: label,
					tiedWithPrev: false
				};
				placed.push(...sub);
				prevAbove = placed[placed.length - 1].id;
			});
			return placed;
		}
		return group.map((id, k) => ({
			id,
			tiedWithPrev: k > 0
		}));
	};
	const placed = order(rows.map((r) => r.id), 0, null);
	const out = [];
	placed.forEach((p, i) => {
		const row = {
			...byId.get(p.id),
			extra: { ...byId.get(p.id).extra },
			rank: p.tiedWithPrev ? out[i - 1].rank : i + 1
		};
		delete row.decidedBy;
		if (p.decidedBy) row.decidedBy = p.decidedBy;
		out.push(row);
	});
	return out;
}
/** Criterios listos para armar listas de desempate. */
const tiebreak = {
	points: (label = "puntos") => ({
		label,
		scope: "all",
		value: (r) => r.points
	}),
	wins: (label = "partidos ganados") => ({
		label,
		scope: "all",
		value: (r) => r.won
	}),
	diff: (label = "diferencia") => ({
		label,
		scope: "all",
		value: (r) => r.diff
	}),
	for: (label = "a favor") => ({
		label,
		scope: "all",
		value: (r) => r.for
	}),
	/** Un número de `extra` (p. ej. 'setsDiff'). */
	stat: (key, label, asc = false) => ({
		label,
		scope: "all",
		value: (r) => r.extra[key] ?? 0,
		asc
	}),
	/** Minitabla entre los empatados; por defecto compara sus puntos de tabla en esos partidos. */
	h2h: (value = (r) => r.points, label = h2hLabel) => ({
		label,
		scope: "h2h",
		value
	}),
	/** Partidos contra el que quedó justo arriba del grupo empatado. */
	vsAbove: (value, label) => ({
		label,
		scope: "above",
		value
	}),
	lot: (seed = "") => ({
		label: "sorteo",
		scope: "lot",
		seed
	})
};
function h2hLabel(tied) {
	return tied === 2 ? "enfrentamiento directo" : "minitabla";
}
/** Tabla completa: filas + desempates de la configuración. */
function standings(ids, results, config) {
	const build = (i, r) => buildRows(i, r, config.points, config.primary);
	return resolveTies(build(ids, results), results, config.criteria, {
		build,
		restart: config.restart
	});
}
/** Ganar 3, perder 1, no presentarse 0. */
const RACKET_POINTS = {
	win: 3,
	draw: 0,
	loss: 1,
	walkoverLoss: 0
};
/**
* Pádel y tenis. Totales esperados en MatchResult: `sets` y `games` (ver `racketMatchResult`).
* Orden: puntos → enfrentamiento directo (2 empatados) o minitabla (3 o más), repetida con los que sigan
* empatados → dif. de sets → dif. de juegos → juegos a favor → sorteo.
*/
function racketTable(points = RACKET_POINTS, lotSeed = "") {
	return {
		points,
		primary: "games",
		criteria: [
			tiebreak.points(),
			tiebreak.h2h(),
			tiebreak.stat("setsDiff", "dif. de sets"),
			tiebreak.stat("gamesDiff", "dif. de juegos"),
			tiebreak.stat("gamesFor", "juegos a favor"),
			tiebreak.lot(lotSeed)
		]
	};
}
function racketStandings(ids, results, opts = {}) {
	return standings(ids, results, racketTable(opts.points, opts.lotSeed));
}
/**
* MatchResult de raqueta con totales `sets` y `games`.
*
* Reglas para la tabla:
* - El súper tie-break cuenta como un set y como un juego (1-0), no por sus puntos.
* - W.O.: el presente gana `walkoverSets` (6-0 6-0) y el ausente queda con `walkover` (0 puntos de tabla).
* - Retiro: gana el rival y, para la tabla, se completa el set en juego a favor del ganador (6-x si el perdedor
*   tenía 4 o menos, 7-5 si tenía 5, 7-6 si tenía 6; en un súper tie-break, 10-x o por 2) y cada set que le
*   falte para ganar el partido se le da 6-0 (o súper tie-break 1-0 en juegos si el decisivo lo es).
*/
function racketMatchResult(input) {
	const gps = input.gamesPerSet ?? 6;
	const toWin = input.setsToWin ?? 2;
	const w = input.winner;
	const wi = w === 1 ? 0 : 1;
	const li = 1 - wi;
	const decider = toWin * 2 - 1;
	const status = input.status ?? "normal";
	if (status === "walkover") return withTotals(input, (input.walkoverSets ?? [[6, 0], [6, 0]]).map((s) => w === 1 ? [s[0], s[1]] : [s[1], s[0]]), false, w);
	const sets = input.sets.map((s) => [s[0], s[1]]);
	const isTb = (i) => !!input.superTiebreak && i === decider - 1;
	const setDone = (s, i) => {
		const hi = Math.max(s[0], s[1]);
		const diff = Math.abs(s[0] - s[1]);
		if (isTb(i)) return hi >= 10 && diff >= 2;
		return hi >= gps && diff >= 2 || hi === gps + 1;
	};
	if (status === "retired") {
		const last = sets.length - 1;
		if (last >= 0 && !setDone(sets[last], last)) {
			const s = sets[last];
			if (isTb(last)) s[wi] = Math.max(10, s[li] + 2);
			else if (s[li] >= gps) {
				s[wi] = gps + 1;
				s[li] = gps;
			} else s[wi] = Math.max(s[wi], s[li] === gps - 1 ? gps + 1 : gps);
		}
		const won = () => sets.filter((s, i) => setDone(s, i) && s[wi] > s[li]).length;
		while (won() < toWin && sets.length < decider) {
			const i = sets.length;
			const s = [0, 0];
			s[wi] = isTb(i) ? 10 : gps;
			sets.push(s);
		}
	}
	return withTotals(input, sets, !!input.superTiebreak, void 0);
}
function withTotals(input, sets, superTb, walkoverWinner) {
	const decider = (input.setsToWin ?? 2) * 2 - 1;
	const setsWon = [0, 0];
	const games = [0, 0];
	sets.forEach((s, i) => {
		if (s[0] === s[1]) return;
		const winnerIdx = s[0] > s[1] ? 0 : 1;
		setsWon[winnerIdx]++;
		if (superTb && i === decider - 1) games[winnerIdx]++;
		else {
			games[0] += s[0];
			games[1] += s[1];
		}
	});
	const result = {
		id: input.id,
		side1: input.side1,
		side2: input.side2,
		winner: input.winner,
		totals: {
			sets: setsWon,
			games
		}
	};
	if (walkoverWinner) result.walkover = walkoverWinner === 1 ? 2 : 1;
	return result;
}
/** Pickleball: la tabla cuenta partidos ganados (1 por victoria). */
const PICKLEBALL_POINTS = {
	win: 1,
	draw: 0,
	loss: 0,
	walkoverLoss: 0
};
/**
* Round robin de USA Pickleball. Fuente: 2026 USA Pickleball Rulebook, regla 15.B.4 (antes 12.C.4 en 2025),
* según el «2026 Rulebook Change Document»: gana quien más partidos gana; los empates se rompen en este orden
* y «el método que rompe el empate ordena a todos los empatados» (los que sigan empatados vuelven a empezar):
* 1. partidos ganados entre los empatados;
* 2. diferencia de puntos de todos los juegos;
* 3. diferencia de puntos entre los empatados;
* 4. diferencia de puntos contra el equipo que quedó justo arriba;
* 5. puntos a favor de todo el round robin (nuevo en 2026).
* Al final, sorteo. Totales esperados en MatchResult: `points` (y opcional `games`).
*/
function pickleballTable(points = PICKLEBALL_POINTS, lotSeed = "") {
	const pd = (r) => r.extra.pointsDiff ?? 0;
	return {
		points,
		primary: "points",
		criteria: [
			tiebreak.points("partidos ganados"),
			tiebreak.h2h((r) => r.won, (n) => n === 2 ? "enfrentamiento directo" : "ganados entre empatados"),
			tiebreak.stat("pointsDiff", "dif. de puntos"),
			tiebreak.h2h(pd, "dif. de puntos entre empatados"),
			tiebreak.vsAbove(pd, "dif. de puntos contra el de arriba"),
			tiebreak.stat("pointsFor", "puntos a favor"),
			tiebreak.lot(lotSeed)
		]
	};
}
function pickleballStandings(ids, results, opts = {}) {
	return standings(ids, results, pickleballTable(opts.points, opts.lotSeed));
}
/**
* MatchResult de pickleball con totales `games` y `points` desde los juegos ([11, 7], [9, 11], …).
* W.O.: `walkover` = el lado que no se presentó; se anotan `walkoverGames` (por defecto un 11-0) a favor del otro.
*/
function pickleballMatchResult(input) {
	let games = input.games.map((g) => [g[0], g[1]]);
	if (input.walkover) {
		const present = input.walkover === 1 ? 2 : 1;
		games = (input.walkoverGames ?? [[11, 0]]).map((g) => present === 1 ? [g[0], g[1]] : [g[1], g[0]]);
	}
	const won = [0, 0];
	const pts = [0, 0];
	for (const g of games) {
		if (g[0] !== g[1]) won[g[0] > g[1] ? 0 : 1]++;
		pts[0] += g[0];
		pts[1] += g[1];
	}
	const winner = input.walkover ? input.walkover === 1 ? 2 : 1 : won[0] === won[1] ? null : won[0] > won[1] ? 1 : 2;
	const result = {
		id: input.id,
		side1: input.side1,
		side2: input.side2,
		winner,
		totals: {
			games: won,
			points: pts
		}
	};
	if (input.walkover) result.walkover = input.walkover;
	return result;
}
//#endregion
//#region src/sports/formats/social.ts
const round2$1 = (x) => Math.round(x * 100) / 100;
const scored$2 = (m) => m.score1 != null && m.score2 != null;
/**
* Tabla individual de americano o mexicano. Cada jugador suma los puntos de su pareja en cada partido.
* Orden: puntos → partidos ganados → dif. de puntos; si sigue el empate, comparten puesto (en el orden de
* `players`). Una ronda cuenta (también sus descansos) cuando tiene al menos un partido con marcador.
*
* `for`/`against`/`diff` son puntos anotados y recibidos de verdad; `points` incluye lo del descanso.
* `extra`: rests (descansos), avg (puntos por partido), bonus (lo sumado por descansar).
*/
function socialStandings(players, rounds, opts = {}) {
	const policy = opts.rest ?? "own-average";
	const rows = /* @__PURE__ */ new Map();
	const bonusRound = /* @__PURE__ */ new Map();
	for (const id of players) {
		if (rows.has(id)) continue;
		rows.set(id, {
			id,
			played: 0,
			won: 0,
			drawn: 0,
			lost: 0,
			points: 0,
			for: 0,
			against: 0,
			diff: 0,
			extra: {
				rests: 0,
				avg: 0,
				bonus: 0
			},
			rank: 0
		});
		bonusRound.set(id, 0);
	}
	const add = (id, mine, theirs) => {
		const r = rows.get(id);
		if (!r) return;
		r.played++;
		r.for += mine;
		r.against += theirs;
		if (mine > theirs) r.won++;
		else if (mine < theirs) r.lost++;
		else r.drawn++;
	};
	for (const round of rounds) {
		const done = round.matches.filter(scored$2);
		if (!done.length) continue;
		let sum = 0;
		let count = 0;
		for (const m of done) {
			for (const p of m.side1) add(p, m.score1, m.score2);
			for (const p of m.side2) add(p, m.score2, m.score1);
			sum += m.score1 * m.side1.length + m.score2 * m.side2.length;
			count += m.side1.length + m.side2.length;
		}
		const roundAvg = count ? sum / count : 0;
		for (const p of round.rests) {
			const r = rows.get(p);
			if (!r) continue;
			r.extra.rests++;
			bonusRound.set(p, bonusRound.get(p) + roundAvg);
		}
	}
	for (const r of rows.values()) {
		r.diff = r.for - r.against;
		const avg = r.played ? r.for / r.played : 0;
		r.extra.avg = round2$1(avg);
		if (policy === "normalize") r.points = round2$1(avg);
		else {
			const bonus = policy === "own-average" ? avg * r.extra.rests : policy === "round-average" ? bonusRound.get(r.id) : 0;
			r.extra.bonus = round2$1(bonus);
			r.points = round2$1(r.for + bonus);
		}
	}
	return resolveTies([...rows.values()], [], [
		tiebreak.points(),
		tiebreak.wins(),
		tiebreak.diff("dif. de puntos")
	]);
}
//#endregion
//#region src/sports/formats/knockout.ts
/** Orden estándar de siembra en el cuadro: 8 → [1, 8, 4, 5, 2, 7, 3, 6]. */
function seedOrder(size) {
	if (size < 1 || (size & size - 1) !== 0) throw new Error("El tamaño del cuadro debe ser potencia de 2.");
	let order = [1];
	while (order.length < size) {
		const n = order.length * 2;
		order = order.flatMap((s) => [s, n + 1 - s]);
	}
	return order;
}
function nextPowerOfTwo(n) {
	let p = 1;
	while (p < n) p *= 2;
	return p;
}
/** Crea el cuadro con los participantes ya ordenados por siembra (mejor primero). */
function createBracket(seeds, opts = {}) {
	if (seeds.length < 2) throw new Error("El cuadro necesita al menos 2 participantes.");
	if (new Set(seeds).size !== seeds.length) throw new Error("Hay participantes repetidos.");
	return buildBracket(seeds.slice(), !!opts.thirdPlace && seeds.length >= 4, {});
}
/**
* Anota (o borra con null) el ganador de un partido y devuelve el cuadro nuevo. Lanza Error si el ganador no
* es uno de los dos lados o si el partido todavía no tiene sus dos lados.
*/
function setWinner$1(bracket, key, winner) {
	const match = bracket.matches.find((m) => m.key === key);
	if (!match) throw new Error("Ese partido no existe en el cuadro.");
	if (match.bye) throw new Error("Ese partido es un pase directo.");
	const winners = { ...bracket.winners };
	if (winner === null) delete winners[key];
	else {
		if (!match.side1 || !match.side2) throw new Error("Todavía no se sabe quién juega ese partido.");
		if (winner !== match.side1 && winner !== match.side2) throw new Error("El ganador tiene que ser uno de los dos lados.");
		winners[key] = winner;
	}
	return buildBracket(bracket.seeds, bracket.thirdPlace, winners);
}
function buildBracket(seeds, thirdPlace, recorded) {
	const size = nextPowerOfTwo(seeds.length);
	const rounds = Math.log2(size);
	const order = seedOrder(size);
	const matches = [];
	const byKey = /* @__PURE__ */ new Map();
	const key = (round, index) => `R${round}-${index + 1}`;
	const winners = {};
	for (let r = 1; r <= rounds; r++) {
		const count = size / 2 ** r;
		for (let i = 0; i < count; i++) {
			const m = {
				key: key(r, i),
				round: r,
				index: i,
				side1: null,
				side2: null,
				seed1: null,
				seed2: null,
				bye: false,
				winner: null,
				next: r < rounds ? {
					key: key(r + 1, Math.floor(i / 2)),
					side: i % 2 === 0 ? 1 : 2
				} : null,
				loserNext: thirdPlace && r === rounds - 1 ? {
					key: "P3",
					side: i % 2 === 0 ? 1 : 2
				} : null,
				thirdPlace: false
			};
			matches.push(m);
			byKey.set(m.key, m);
		}
	}
	if (thirdPlace) {
		const p3 = {
			key: "P3",
			round: rounds,
			index: 1,
			side1: null,
			side2: null,
			seed1: null,
			seed2: null,
			bye: false,
			winner: null,
			next: null,
			loserNext: null,
			thirdPlace: true
		};
		matches.push(p3);
		byKey.set("P3", p3);
	}
	const seedOf = new Map(seeds.map((s, i) => [s, i + 1]));
	const place = (target, id) => {
		if (!target || !id) return;
		const m = byKey.get(target.key);
		if (target.side === 1) {
			m.side1 = id;
			m.seed1 = seedOf.get(id) ?? null;
		} else {
			m.side2 = id;
			m.seed2 = seedOf.get(id) ?? null;
		}
	};
	for (let i = 0; i < size / 2; i++) {
		const m = byKey.get(key(1, i));
		const s1 = order[2 * i];
		const s2 = order[2 * i + 1];
		m.side1 = seeds[s1 - 1] ?? null;
		m.side2 = seeds[s2 - 1] ?? null;
		m.seed1 = m.side1 ? s1 : null;
		m.seed2 = m.side2 ? s2 : null;
	}
	const decide = (m) => {
		if (m.side1 && m.side2 && (recorded[m.key] === m.side1 || recorded[m.key] === m.side2)) {
			m.winner = recorded[m.key];
			winners[m.key] = m.winner;
		}
	};
	for (let r = 1; r <= rounds; r++) for (const m of matches) {
		if (m.round !== r || m.thirdPlace) continue;
		if (r === 1 && (!m.side1 || !m.side2)) {
			m.bye = true;
			m.winner = m.side1 ?? m.side2;
		} else decide(m);
		place(m.next, m.winner);
		if (m.loserNext && m.winner) place(m.loserNext, m.winner === m.side1 ? m.side2 : m.side1);
	}
	const p3 = byKey.get("P3");
	if (p3) decide(p3);
	return {
		seeds,
		size,
		rounds,
		thirdPlace,
		winners,
		matches
	};
}
//#endregion
//#region src/sports/formats/box.ts
/**
* Tamaños de caja para `n` participantes: lo más parejo posible, las de arriba con uno más si no divide exacto.
* Si no hay forma de cumplir el mínimo y el máximo a la vez (p. ej. 7 con 4–6), gana el máximo: [4, 3].
*/
function boxSizes(n, opts = {}) {
	const min = opts.min ?? 4;
	const max = opts.max ?? 6;
	if (n <= 0) return [];
	if (n <= max) return [n];
	const lo = Math.ceil(n / max);
	const hi = Math.max(lo, Math.floor(n / min));
	let k = opts.target ? Math.round(n / opts.target) : lo;
	k = Math.min(hi, Math.max(lo, k));
	const base = Math.floor(n / k);
	const extra = n % k;
	return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}
/**
* Cierra el mes. `standings[b]` es la tabla ya ordenada de la caja b (la de su deporte: racketStandings,
* pickleballStandings…) y debe traer a todos los de la caja.
*
* - Suben los `up` mejores que jugaron al menos `minToPromote` (no en la caja de arriba).
* - Bajan los `down` últimos y cualquiera con menos de `minToStay` partidos (no en la última caja).
* - Las cajas nuevas se arman en este orden: los que se quedan (por su puesto), los que bajan de la caja de
*   arriba y los que suben de la de abajo, y se cortan con los mismos tamaños de antes (o `boxSizes` si
*   cambió la cantidad). Si una caja quedó corta porque bajó más gente, sube el mejor que se quedaba abajo.
*/
function closeBoxMonth(boxes, standings, opts = {}) {
	const up = opts.up ?? 2;
	const down = opts.down ?? 2;
	const minUp = opts.minToPromote ?? 2;
	const minStay = opts.minToStay ?? 2;
	const gone = new Set(opts.withdrawn ?? []);
	const last = boxes.length - 1;
	const fromBox = /* @__PURE__ */ new Map();
	boxes.forEach((b, i) => b.forEach((id) => fromBox.set(id, i)));
	const stay = boxes.map(() => []);
	const promoted = boxes.map(() => []);
	const relegated = boxes.map(() => []);
	const lowPlay = /* @__PURE__ */ new Set();
	boxes.forEach((box, b) => {
		const inBox = new Set(box);
		const table = standings[b].filter((r) => inBox.has(r.id));
		const listed = new Set(table.map((r) => r.id));
		const rows = [...table.map((r) => ({
			id: r.id,
			played: r.played
		})), ...box.filter((id) => !listed.has(id)).map((id) => ({
			id,
			played: 0
		}))].filter((r) => !gone.has(r.id));
		const goDown = /* @__PURE__ */ new Set();
		if (b < last) {
			for (const r of rows) if (r.played < minStay) {
				goDown.add(r.id);
				lowPlay.add(r.id);
			}
			for (let i = rows.length - 1, n = 0; i >= 0 && n < down; i--, n++) goDown.add(rows[i].id);
		}
		const goUp = /* @__PURE__ */ new Set();
		if (b > 0) for (const r of rows) {
			if (goUp.size >= up) break;
			if (!goDown.has(r.id) && r.played >= minUp) goUp.add(r.id);
		}
		for (const r of rows) if (goUp.has(r.id)) promoted[b].push(r.id);
		else if (goDown.has(r.id)) relegated[b].push(r.id);
		else stay[b].push(r.id);
	});
	const order = [];
	boxes.forEach((_, b) => {
		order.push(...stay[b]);
		if (b > 0) order.push(...relegated[b - 1]);
		if (b < last) order.push(...promoted[b + 1]);
	});
	const fresh = (opts.newcomers ?? []).filter((id) => !fromBox.has(id) && !gone.has(id));
	order.push(...fresh);
	const oldSizes = boxes.map((b) => b.length);
	const sizes = order.length === oldSizes.reduce((a, x) => a + x, 0) ? oldSizes : boxSizes(order.length, opts);
	const next = [];
	let i = 0;
	for (const size of sizes) {
		next.push(order.slice(i, i + size));
		i += size;
	}
	const moves = [];
	next.forEach((box, to) => box.forEach((id) => {
		const from = fromBox.get(id);
		if (from == null) moves.push({
			id,
			from: null,
			to,
			move: "nuevo"
		});
		else {
			const move = to < from ? "sube" : to > from ? "baja" : "queda";
			moves.push(lowPlay.has(id) && move === "baja" ? {
				id,
				from,
				to,
				move,
				reason: "pocos-partidos"
			} : {
				id,
				from,
				to,
				move
			});
		}
	}));
	return {
		boxes: next,
		moves
	};
}
//#endregion
//#region src/sports/racket/rules.ts
const RACKET_SPORTS$1 = [
	"tennis",
	"padel",
	"pickleball"
];
const TENNIS = {
	sport: "tennis",
	doubles: false,
	deuce: "ad",
	starAdvantages: 2,
	gamesPerSet: 6,
	tiebreakAt: 6,
	tiebreakTo: 7,
	tiebreakWinBy: 2,
	bestOf: 3,
	finalSet: "set",
	finalTiebreakTo: 10
};
const PADEL = {
	...TENNIS,
	sport: "padel",
	doubles: true,
	deuce: "golden",
	finalSet: "tiebreak"
};
const PICKLEBALL = {
	sport: "pickleball",
	doubles: true,
	scoring: "sideout",
	gameTo: 11,
	winBy: 2,
	bestOf: 1,
	switchAt: 6,
	gamePointOnServeOnly: false
};
/** Plantillas probadas por deporte. La primera es la de por defecto. */
const RULE_PRESETS = {
	tennis: [
		{
			id: "normal",
			label: "Mejor de 3 sets con ventaja",
			rules: TENNIS
		},
		{
			id: "mtb",
			label: "Mejor de 3, el tercero a súper tie-break",
			rules: {
				...TENNIS,
				finalSet: "tiebreak"
			}
		},
		{
			id: "noad-mtb",
			label: "Sin ventaja, el tercero a súper tie-break",
			rules: {
				...TENNIS,
				deuce: "noad",
				finalSet: "tiebreak"
			}
		},
		{
			id: "cortos",
			label: "Sets cortos a 4 (tie-break en 4-4)",
			rules: {
				...TENNIS,
				gamesPerSet: 4,
				tiebreakAt: 4
			}
		},
		{
			id: "fast4",
			label: "Fast4: sets a 4, sin ventaja, tie-break a 5 en 3-3",
			rules: {
				...TENNIS,
				deuce: "noad",
				gamesPerSet: 4,
				tiebreakAt: 3,
				tiebreakTo: 5,
				tiebreakWinBy: 1
			}
		},
		{
			id: "bo5",
			label: "Mejor de 5 sets",
			rules: {
				...TENNIS,
				bestOf: 5
			}
		},
		{
			id: "dobles",
			label: "Dobles, sin ventaja, el tercero a súper tie-break",
			rules: {
				...TENNIS,
				doubles: true,
				deuce: "noad",
				finalSet: "tiebreak"
			}
		}
	],
	padel: [
		{
			id: "amateur",
			label: "Punto de oro, el tercero a súper tie-break",
			rules: PADEL
		},
		{
			id: "ventaja",
			label: "Con ventaja, el tercero a súper tie-break",
			rules: {
				...PADEL,
				deuce: "ad"
			}
		},
		{
			id: "star",
			label: "Star Point (FIP 2026), tres sets completos",
			rules: {
				...PADEL,
				deuce: "star",
				finalSet: "set"
			}
		},
		{
			id: "tres-sets",
			label: "Punto de oro, tres sets completos",
			rules: {
				...PADEL,
				finalSet: "set"
			}
		}
	],
	pickleball: [
		{
			id: "a11",
			label: "Dobles, un juego a 11",
			rules: PICKLEBALL
		},
		{
			id: "bo3",
			label: "Dobles, mejor de 3 juegos a 11",
			rules: {
				...PICKLEBALL,
				bestOf: 3
			}
		},
		{
			id: "a15",
			label: "Dobles, un juego a 15",
			rules: {
				...PICKLEBALL,
				gameTo: 15,
				switchAt: 8
			}
		},
		{
			id: "a21",
			label: "Dobles, un juego a 21",
			rules: {
				...PICKLEBALL,
				gameTo: 21,
				switchAt: 11
			}
		},
		{
			id: "rally",
			label: "Conteo por rally, un juego a 21",
			rules: {
				...PICKLEBALL,
				scoring: "rally",
				gameTo: 21,
				switchAt: 11
			}
		},
		{
			id: "individual",
			label: "Individual, mejor de 3 juegos a 11",
			rules: {
				...PICKLEBALL,
				doubles: false,
				bestOf: 3
			}
		}
	]
};
function defaultRules(sport) {
	if (!RACKET_SPORTS$1.includes(sport)) throw new Error("Deporte de raqueta no válido.");
	return { ...RULE_PRESETS[sport][0].rules };
}
const isInt = (v, min, max) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isBestOf = (v) => v === 1 || v === 3 || v === 5;
/** Errores de las reglas en español (vacío = bien). Revisa también datos que vengan de la base. */
function validateRules(rules) {
	const e = [];
	const r = rules;
	if (!r || typeof r !== "object" || !RACKET_SPORTS$1.includes(r.sport)) return ["Deporte de raqueta no válido."];
	if (typeof r.doubles !== "boolean") e.push("Falta decir si es individual o dobles.");
	if (!isBestOf(r.bestOf)) e.push("El partido es a 1, 3 o 5.");
	if (r.sport === "pickleball") {
		if (r.scoring !== "sideout" && r.scoring !== "rally") e.push("El conteo es tradicional o por rally.");
		if (!isInt(r.gameTo, 5, 25)) e.push("El juego va de 5 a 25 puntos.");
		if (r.winBy !== 1 && r.winBy !== 2) e.push("Se gana por 1 o por 2.");
		if (r.switchAt !== null && !isInt(r.switchAt, 1, Number(r.gameTo) - 1)) e.push("El cambio de lado va entre 1 y los puntos del juego menos 1.");
		if (typeof r.gamePointOnServeOnly !== "boolean") e.push("Falta decir si el punto de juego se gana solo sacando.");
		return e;
	}
	if (r.sport === "padel" && r.doubles !== true) e.push("El pádel siempre es en dobles.");
	if (r.sport === "tennis" && r.deuce !== "ad" && r.deuce !== "noad") e.push("En tenis el 40-40 es con ventaja o sin ventaja.");
	if (r.sport === "padel" && r.deuce !== "ad" && r.deuce !== "golden" && r.deuce !== "star") e.push("En pádel el 40-40 es punto de oro, ventaja o Star Point.");
	if (!isInt(r.starAdvantages, 1, 5)) e.push("Las ventajas del Star Point van de 1 a 5.");
	const gps = r.gamesPerSet;
	if (!isInt(gps, 2, 9)) e.push("Los juegos por set van de 2 a 9.");
	else if (r.tiebreakAt !== null && r.tiebreakAt !== gps && r.tiebreakAt !== Number(gps) - 1) e.push(`El tie-break del set se juega en ${gps}-${gps} o en ${Number(gps) - 1}-${Number(gps) - 1}.`);
	if (!isInt(r.tiebreakTo, 3, 15)) e.push("El tie-break va de 3 a 15 puntos.");
	if (r.tiebreakWinBy !== 1 && r.tiebreakWinBy !== 2) e.push("El tie-break se gana por 1 o por 2.");
	if (r.finalSet !== "set" && r.finalSet !== "tiebreak") e.push("El set decisivo es completo o súper tie-break.");
	if (r.finalSet === "tiebreak" && r.bestOf === 1) e.push("A un solo set no hay súper tie-break.");
	if (!isInt(r.finalTiebreakTo, 5, 21)) e.push("El súper tie-break va de 5 a 21 puntos.");
	return e;
}
function resolveRules(sport, partial = {}) {
	const given = Object.fromEntries(Object.entries(partial).filter(([, v]) => v !== void 0));
	const merged = {
		...defaultRules(sport),
		...given,
		sport
	};
	if (merged.sport === "pickleball") {
		if (!("switchAt" in given)) merged.switchAt = Math.ceil(merged.gameTo / 2);
	} else if (!("tiebreakAt" in given) && "gamesPerSet" in given) merged.tiebreakAt = merged.gamesPerSet;
	const errors = validateRules(merged);
	if (errors.length) throw new Error(errors.join(" "));
	return merged;
}
/** Sorteo con los valores por defecto puestos. En individual el jugador siempre es 0. */
function resolveSetup(setup, doubles) {
	const firstServer = setup?.firstServer ?? 1;
	const leftSide = setup?.leftSide ?? 1;
	const fp = setup?.firstPlayer ?? [0, 0];
	if (firstServer !== 1 && firstServer !== 2) throw new Error("Quién saca primero no es válido.");
	if (leftSide !== 1 && leftSide !== 2) throw new Error("El lado inicial no es válido.");
	if (!Array.isArray(fp) || fp.length !== 2 || fp.some((p) => p !== 0 && p !== 1)) throw new Error("El orden de saque no es válido.");
	return {
		firstServer,
		leftSide,
		firstPlayer: doubles ? [fp[0], fp[1]] : [0, 0]
	};
}
const other$1 = (side) => side === 1 ? 2 : 1;
const flip = (p) => p === 0 ? 1 : 0;
/** Sets (o juegos) que hay que ganar: 1, 2 o 3. */
const needed = (bestOf) => Math.ceil(bestOf / 2);
function assertSide(side) {
	if (side !== 1 && side !== 2) throw new Error("Lado no válido.");
}
function assertPlayer(p) {
	if (p !== 0 && p !== 1) throw new Error("Jugador no válido.");
}
/** Par de enteros de 0 a 99, o Error con `msg`. */
function intPair(v, msg) {
	if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => isInt(x, 0, 99))) throw new Error(msg);
	return [v[0], v[1]];
}
/** Quién ganó una carrera a `to` puntos ganando por `winBy`, si el marcador ya la terminó. */
function raceWinner(to, winBy, [a, b]) {
	if (a >= to && a - b >= winBy) return 1;
	if (b >= to && b - a >= winBy) return 2;
	return null;
}
/** El marcador se puede dar con la carrera todavía abierta. */
function raceOpen(to, winBy, [a, b]) {
	if (a < 0 || b < 0 || raceWinner(to, winBy, [a, b]) !== null) return false;
	return winBy === 2 || a < to && b < to;
}
/** Ganador si el marcador es un final posible de la carrera (el último punto lo ganó el ganador). */
function raceFinal(to, winBy, score) {
	const w = raceWinner(to, winBy, score);
	if (w === null) return null;
	return raceOpen(to, winBy, w === 1 ? [score[0] - 1, score[1]] : [score[0], score[1] - 1]) ? w : null;
}
function setWinnerRaw(r, [a, b]) {
	const t = r.tiebreakAt;
	if (t !== null && a === t + 1 && b === t) return 1;
	if (t !== null && b === t + 1 && a === t) return 2;
	if (a >= r.gamesPerSet && a - b >= 2) return 1;
	if (b >= r.gamesPerSet && b - a >= 2) return 2;
	return null;
}
/** El set puede estar en curso con esos juegos (incluido el empate que lleva al tie-break). */
function setOpen(r, [a, b]) {
	if (a < 0 || b < 0 || setWinnerRaw(r, [a, b]) !== null) return false;
	const t = r.tiebreakAt;
	return t === null || !(a >= t && b >= t && (a > t || b > t));
}
/** Ganador del set si esos juegos son un final posible (6-4, 7-5, 7-6, 4-2 en sets cortos…). */
function setWinner(r, games) {
	const w = setWinnerRaw(r, games);
	if (w === null) return null;
	return setOpen(r, w === 1 ? [games[0] - 1, games[1]] : [games[0], games[1] - 1]) ? w : null;
}
/** El set terminó en tie-break (7-6, 5-4 en sets cortos, 4-3 en Fast4). */
function isTiebreakSet(r, [a, b]) {
	const t = r.tiebreakAt;
	return t !== null && Math.min(a, b) === t && Math.max(a, b) === t + 1;
}
/**
* Revisa y ordena sets terminados escritos a mano o guardados: acepta [6, 4] o { games, tiebreak }.
* En la posición del súper tie-break acepta [10, 7] (o { games: [1, 0], tiebreak: [10, 7] }).
* Lanza un Error en español si algo no cuadra con las reglas.
*/
function normalizeSets(r, input) {
	if (!Array.isArray(input)) throw new Error("Sets no válidos.");
	if (input.length > r.bestOf) throw new Error(`El partido es a ${r.bestOf} set${r.bestOf === 1 ? "" : "s"} como máximo.`);
	const need = needed(r.bestOf);
	const wins = [0, 0];
	return input.map((raw, k) => {
		if (wins[0] >= need || wins[1] >= need) throw new Error("Hay sets después de terminado el partido.");
		const obj = Array.isArray(raw) ? { games: raw } : raw;
		const games = intPair(obj?.games, `Set ${k + 1} no válido.`);
		const tb = obj.tiebreak === void 0 ? void 0 : intPair(obj.tiebreak, `Tie-break del set ${k + 1} no válido.`);
		let set;
		let w;
		if (r.finalSet === "tiebreak" && k === r.bestOf - 1) {
			const pts = tb ?? (games[0] + games[1] === 1 ? void 0 : games);
			w = pts ? raceFinal(r.finalTiebreakTo, 2, pts) : games[0] === 1 ? 1 : 2;
			if (w === null) throw new Error(`Súper tie-break no válido: ${pts[0]}-${pts[1]}.`);
			set = {
				games: w === 1 ? [1, 0] : [0, 1],
				matchTiebreak: true
			};
			if (pts) set.tiebreak = pts;
		} else {
			w = setWinner(r, games);
			if (w === null) throw new Error(`Set ${k + 1} no válido: ${games[0]}-${games[1]}.`);
			set = { games };
			if (tb && isTiebreakSet(r, games)) {
				if (raceFinal(r.tiebreakTo, r.tiebreakWinBy, tb) !== w) throw new Error(`Tie-break del set ${k + 1} no válido: ${tb[0]}-${tb[1]}.`);
				set.tiebreak = tb;
			}
		}
		wins[w - 1]++;
		return set;
	});
}
/** Revisa juegos terminados de pickleball ([11, 7], [9, 11]…). Lanza un Error si alguno no cuadra. */
function normalizeGames(r, input) {
	if (!Array.isArray(input)) throw new Error("Juegos no válidos.");
	if (input.length > r.bestOf) throw new Error(`El partido es a ${r.bestOf} juego${r.bestOf === 1 ? "" : "s"} como máximo.`);
	const need = needed(r.bestOf);
	const wins = [0, 0];
	return input.map((raw, k) => {
		if (wins[0] >= need || wins[1] >= need) throw new Error("Hay juegos después de terminado el partido.");
		const g = intPair(raw, `Juego ${k + 1} no válido.`);
		const w = raceFinal(r.gameTo, r.winBy, g);
		if (w === null) throw new Error(`Juego ${k + 1} no válido: ${g[0]}-${g[1]}.`);
		wins[w - 1]++;
		return g;
	});
}
//#endregion
//#region src/sports/racket/pickleball.ts
function initPickleball(rules, setup) {
	const errors = validateRules(rules);
	if (errors.length || rules.sport !== "pickleball") throw new Error(errors.join(" ") || "Reglas no válidas.");
	const su = resolveSetup(setup, rules.doubles);
	const s = {
		sport: "pickleball",
		rules: { ...rules },
		setup: su,
		games: [],
		score: [0, 0],
		server: su.firstServer,
		serverPlayer: 0,
		serverNumber: null,
		right: [0, 0],
		gameFirstServer: su.firstServer,
		rallies: 0,
		switched: false,
		leftSide: su.leftSide,
		winner: null,
		finish: null,
		quitter: null,
		n: 0,
		serveFrom: "right",
		call: "",
		changeEnds: false
	};
	startGame(s, su.firstServer);
	return refresh$1(s);
}
/** Deja listo un juego nuevo: 0-0, cada pareja en su lugar inicial y saca `first` desde la derecha. */
function startGame(s, first) {
	const r = s.rules;
	s.score = [0, 0];
	s.rallies = 0;
	s.switched = false;
	s.gameFirstServer = first;
	s.server = first;
	s.right = [s.setup.firstPlayer[0], s.setup.firstPlayer[1]];
	s.serverPlayer = r.doubles ? s.right[first - 1] : 0;
	s.serverNumber = r.doubles && r.scoring === "sideout" ? 2 : null;
}
function applyPickleball(state, ev) {
	if (!ev || typeof ev !== "object") throw new Error("Jugada no válida.");
	const s = structuredClone(state);
	s.n++;
	s.changeEnds = false;
	switch (ev.type) {
		case "rally":
			if (ev.won !== "serving" && ev.won !== "receiving") throw new Error("Falta decir quién ganó el peloteo.");
			playing$1(s);
			rally(s, ev.won);
			break;
		case "point":
			assertSide(ev.side);
			playing$1(s);
			rally(s, ev.side === s.server ? "serving" : "receiving");
			break;
		case "positions":
			assertSide(ev.side);
			assertPlayer(ev.right);
			playing$1(s);
			if (!s.rules.doubles) throw new Error("En individual no hay lugares de pareja.");
			if (s.rallies > 0) throw new Error("Los lugares se eligen antes del primer saque del juego.");
			s.right[ev.side - 1] = ev.right;
			if (ev.side === s.server) s.serverPlayer = ev.right;
			break;
		case "retire":
			assertSide(ev.side);
			playing$1(s);
			s.winner = other$1(ev.side);
			s.finish = "retired";
			s.quitter = ev.side;
			break;
		case "walkover":
			assertSide(ev.side);
			playing$1(s);
			if (s.games.length || s.rallies) throw new Error("Ya se jugaron puntos: usa «Retiro».");
			s.winner = other$1(ev.side);
			s.finish = "walkover";
			s.quitter = ev.side;
			break;
		case "correct":
			correct$1(s, ev);
			break;
		default: throw new Error("Jugada no válida para pickleball.");
	}
	return refresh$1(s);
}
function playing$1(s) {
	if (s.winner !== null) throw new Error("El partido ya terminó.");
}
function changeEnds$1(s) {
	s.leftSide = other$1(s.leftSide);
	s.changeEnds = true;
}
function rally(s, won) {
	const r = s.rules;
	const srv = s.server;
	const rcv = other$1(srv);
	s.rallies++;
	if (won === "serving") {
		s.score[srv - 1]++;
		if (r.doubles) s.right[srv - 1] = flip(s.right[srv - 1]);
		return scored$1(s, srv);
	}
	if (r.scoring === "sideout") {
		if (r.doubles && s.serverNumber === 1) {
			s.serverNumber = 2;
			s.serverPlayer = flip(s.serverPlayer);
		} else {
			s.server = rcv;
			s.serverNumber = r.doubles ? 1 : null;
			s.serverPlayer = r.doubles ? s.right[rcv - 1] : 0;
		}
		return;
	}
	const next = [s.score[0], s.score[1]];
	next[rcv - 1]++;
	const blocked = r.gamePointOnServeOnly && raceWinner(r.gameTo, r.winBy, next) === rcv;
	if (!blocked) s.score = next;
	s.server = rcv;
	s.serverPlayer = r.doubles ? s.score[rcv - 1] % 2 === 0 ? s.right[rcv - 1] : flip(s.right[rcv - 1]) : 0;
	if (!blocked) scored$1(s, rcv);
}
function scored$1(s, side) {
	const r = s.rules;
	if (raceWinner(r.gameTo, r.winBy, s.score) === side) return gameOver(s, side);
	if (s.games.length === r.bestOf - 1 && r.switchAt !== null && !s.switched && Math.max(s.score[0], s.score[1]) >= r.switchAt) {
		s.switched = true;
		changeEnds$1(s);
	}
}
function gameOver(s, side) {
	const r = s.rules;
	s.games.push([s.score[0], s.score[1]]);
	s.score = [0, 0];
	s.rallies = 0;
	if (s.games.filter((g) => (g[0] > g[1] ? 1 : 2) === side).length >= needed(r.bestOf)) {
		s.winner = side;
		s.finish = "played";
		return;
	}
	startGame(s, other$1(s.gameFirstServer));
	changeEnds$1(s);
}
function correct$1(s, ev) {
	if (s.finish === "retired" || s.finish === "walkover") throw new Error("Primero deshaz el retiro o el W.O.");
	const r = s.rules;
	const games = normalizeGames(r, ev.games);
	const score = intPair(ev.score, "Puntos del juego en curso no válidos.");
	for (const side of [ev.server, ev.leftSide]) if (side !== void 0) assertSide(side);
	if (ev.serverPlayer !== void 0) assertPlayer(ev.serverPlayer);
	if (ev.serverNumber !== void 0 && ev.serverNumber !== 1 && ev.serverNumber !== 2) throw new Error("Número de sacador no válido.");
	if (ev.right !== void 0) for (const p of intPair(ev.right, "Lugares no válidos.")) assertPlayer(p);
	const need = needed(r.bestOf);
	const wins = [1, 2].map((side) => games.filter((g) => (g[0] > g[1] ? 1 : 2) === side).length);
	const winner = wins[0] >= need ? 1 : wins[1] >= need ? 2 : null;
	if (winner !== null) {
		if (score[0] || score[1]) throw new Error("El partido ya terminó con esos juegos: los puntos van 0-0.");
	} else if (!raceOpen(r.gameTo, r.winBy, score)) throw new Error(`Puntos no válidos para el juego en curso: ${score[0]}-${score[1]}.`);
	const sameGame = games.length === s.games.length;
	const fp = s.setup.firstPlayer;
	s.games = games;
	s.score = score;
	s.rallies = score[0] + score[1];
	s.winner = winner;
	s.finish = winner ? "played" : null;
	s.quitter = null;
	s.gameFirstServer = games.length % 2 === 0 ? s.setup.firstServer : other$1(s.setup.firstServer);
	s.server = ev.server ?? (sameGame ? s.server : s.gameFirstServer);
	s.right = ev.right ? [ev.right[0], ev.right[1]] : [score[0] % 2 === 0 ? fp[0] : flip(fp[0]), score[1] % 2 === 0 ? fp[1] : flip(fp[1])];
	const i = s.server - 1;
	if (r.doubles && r.scoring === "sideout") {
		s.serverNumber = ev.serverNumber ?? (s.rallies === 0 && s.server === s.gameFirstServer ? 2 : 1);
		s.serverPlayer = ev.serverPlayer ?? s.right[i];
	} else {
		s.serverNumber = null;
		s.serverPlayer = r.doubles ? ev.serverPlayer ?? (score[i] % 2 === 0 ? s.right[i] : flip(s.right[i])) : 0;
	}
	s.switched = games.length === r.bestOf - 1 && r.switchAt !== null && Math.max(score[0], score[1]) >= r.switchAt;
	const flips = games.length + (s.switched ? 1 : 0);
	s.leftSide = ev.leftSide ?? (flips % 2 === 0 ? s.setup.leftSide : other$1(s.setup.leftSide));
}
function refresh$1(s) {
	const srv = s.server - 1;
	s.serveFrom = s.rules.doubles ? s.right[srv] === s.serverPlayer ? "right" : "left" : s.score[srv] % 2 === 0 ? "right" : "left";
	s.call = s.winner !== null ? "" : `${s.score[srv]}-${s.score[1 - srv]}${s.serverNumber !== null ? `-${s.serverNumber}` : ""}`;
	return s;
}
//#endregion
//#region src/sports/racket/tennis.ts
const PTS = [
	"0",
	"15",
	"30",
	"40"
];
const DECIDING = {
	ad: "Iguales",
	noad: "Punto decisivo",
	golden: "Punto de oro",
	star: "Star point"
};
/** Con a-b en el juego (sin tie-break), el próximo punto decide el juego a 40-40. */
function isDeciding(r, a, b) {
	if (a !== b || a < 3) return false;
	if (r.deuce === "noad" || r.deuce === "golden") return true;
	return r.deuce === "star" && a - 2 > r.starAdvantages;
}
function initTennis(rules, setup) {
	const errors = validateRules(rules);
	if (errors.length || rules.sport !== "tennis" && rules.sport !== "padel") throw new Error(errors.join(" ") || "Reglas no válidas.");
	const su = resolveSetup(setup, rules.doubles);
	return refresh({
		sport: rules.sport,
		rules: { ...rules },
		setup: su,
		sets: [],
		games: [0, 0],
		points: [0, 0],
		tiebreak: false,
		matchTiebreak: false,
		gameServer: su.firstServer,
		nextPlayer: [su.firstPlayer[0], su.firstPlayer[1]],
		leftSide: su.leftSide,
		won: [0, 0],
		winner: null,
		finish: null,
		quitter: null,
		n: 0,
		server: su.firstServer,
		serverPlayer: 0,
		serveFrom: "right",
		display: ["0", "0"],
		pointsText: "0-0",
		label: null,
		deuces: 0,
		decidingPoint: false,
		changeEnds: false
	});
}
function applyTennis(state, ev) {
	if (!ev || typeof ev !== "object") throw new Error("Jugada no válida.");
	const s = structuredClone(state);
	s.n++;
	s.changeEnds = false;
	switch (ev.type) {
		case "point":
			assertSide(ev.side);
			playing(s);
			point(s, ev.side);
			break;
		case "order":
			order(s, ev.side, ev.player);
			break;
		case "retire":
			assertSide(ev.side);
			playing(s);
			s.winner = other$1(ev.side);
			s.finish = "retired";
			s.quitter = ev.side;
			break;
		case "walkover":
			assertSide(ev.side);
			playing(s);
			if (s.sets.length || s.games[0] || s.games[1] || s.won[0] || s.won[1]) throw new Error("Ya se jugaron puntos: usa «Retiro».");
			s.winner = other$1(ev.side);
			s.finish = "walkover";
			s.quitter = ev.side;
			break;
		case "correct":
			correct(s, ev);
			break;
		default: throw new Error("Jugada no válida para tenis o pádel.");
	}
	return refresh(s);
}
function playing(s) {
	if (s.winner !== null) throw new Error("El partido ya terminó.");
}
function changeEnds(s) {
	s.leftSide = other$1(s.leftSide);
	s.changeEnds = true;
}
function point(s, side) {
	const r = s.rules;
	const i = side - 1;
	s.won[i]++;
	s.points[i]++;
	const a = s.points[i];
	const b = s.points[1 - i];
	if (s.tiebreak) {
		const to = s.matchTiebreak ? r.finalTiebreakTo : r.tiebreakTo;
		const by = s.matchTiebreak ? 2 : r.tiebreakWinBy;
		if (a >= to && a - b >= by) return gameWon(s, side);
		if ((a + b) % 6 === 0) changeEnds(s);
		return;
	}
	if (isDeciding(r, a - 1, b) || a >= 4 && a - b >= 2) gameWon(s, side);
}
function gameWon(s, side) {
	const r = s.rules;
	const wasTiebreak = s.tiebreak;
	const tbPoints = [s.points[0], s.points[1]];
	s.games[side - 1]++;
	if (r.doubles) s.nextPlayer[s.gameServer - 1] = flip(s.nextPlayer[s.gameServer - 1]);
	s.gameServer = other$1(s.gameServer);
	s.points = [0, 0];
	s.tiebreak = false;
	const inSet = s.games[0] + s.games[1];
	const [g, o] = side === 1 ? s.games : [s.games[1], s.games[0]];
	if (wasTiebreak || g >= r.gamesPerSet && g - o >= 2) {
		const set = { games: [s.games[0], s.games[1]] };
		if (wasTiebreak) set.tiebreak = tbPoints;
		if (s.matchTiebreak) set.matchTiebreak = true;
		s.sets.push(set);
		s.games = [0, 0];
		s.matchTiebreak = false;
		if (s.sets.filter((x) => (x.games[0] > x.games[1] ? 1 : 2) === side).length >= needed(r.bestOf)) {
			s.winner = side;
			s.finish = "played";
			return;
		}
		if (r.finalSet === "tiebreak" && s.sets.length === r.bestOf - 1) {
			s.tiebreak = true;
			s.matchTiebreak = true;
		}
	} else if (r.tiebreakAt !== null && s.games[0] === r.tiebreakAt && s.games[1] === r.tiebreakAt) s.tiebreak = true;
	if (inSet % 2 === 1) changeEnds(s);
}
function order(s, side, player) {
	assertSide(side);
	assertPlayer(player);
	playing(s);
	if (!s.rules.doubles) throw new Error("En individual no hay orden de saque.");
	const g = s.games[0] + s.games[1];
	if (!(s.points[0] === 0 && s.points[1] === 0 && (!s.tiebreak || s.matchTiebreak)) || !(g === 0 || g === 1 && side === s.gameServer)) throw new Error("El orden de saque de cada pareja se elige al empezar el set, antes de su primer juego de saque.");
	s.nextPlayer[side - 1] = player;
}
/** Cambios de lado desde el sorteo hasta este marcador (para la corrección del admin). */
function endChanges(sets, games) {
	let n = Math.ceil((games[0] + games[1]) / 2);
	for (const x of sets) {
		n += Math.ceil((x.games[0] + x.games[1]) / 2);
		if (x.tiebreak) n += Math.max(0, Math.floor((x.tiebreak[0] + x.tiebreak[1] - 1) / 6));
	}
	return n;
}
function correct(s, ev) {
	if (s.finish === "retired" || s.finish === "walkover") throw new Error("Primero deshaz el retiro o el W.O.");
	const r = s.rules;
	const sets = normalizeSets(r, ev.sets);
	const games = intPair(ev.games, "Juegos del set en curso no válidos.");
	if (ev.server !== void 0) assertSide(ev.server);
	if (ev.leftSide !== void 0) assertSide(ev.leftSide);
	if (ev.serverPlayer !== void 0) assertPlayer(ev.serverPlayer);
	const need = needed(r.bestOf);
	const wins = [1, 2].map((side) => sets.filter((x) => (x.games[0] > x.games[1] ? 1 : 2) === side).length);
	const winner = wins[0] >= need ? 1 : wins[1] >= need ? 2 : null;
	const mtb = winner === null && r.finalSet === "tiebreak" && sets.length === r.bestOf - 1;
	if (winner !== null || mtb) {
		if (games[0] || games[1]) throw new Error(winner ? "El partido ya terminó con esos sets: los juegos van 0-0." : "El set decisivo es súper tie-break: los juegos van 0-0.");
	} else if (!setOpen(r, games)) throw new Error(`Juegos no válidos para el set en curso: ${games[0]}-${games[1]}.`);
	s.sets = sets;
	s.games = games;
	s.points = [0, 0];
	s.matchTiebreak = mtb;
	s.tiebreak = mtb || r.tiebreakAt !== null && games[0] === r.tiebreakAt && games[1] === r.tiebreakAt;
	s.winner = winner;
	s.finish = winner ? "played" : null;
	s.quitter = null;
	const played = sets.reduce((t, x) => t + x.games[0] + x.games[1], 0) + games[0] + games[1];
	s.gameServer = ev.server ?? (played % 2 === 0 ? s.setup.firstServer : other$1(s.setup.firstServer));
	if (ev.serverPlayer !== void 0 && r.doubles) s.nextPlayer[s.gameServer - 1] = ev.serverPlayer;
	s.leftSide = ev.leftSide ?? (endChanges(sets, games) % 2 === 0 ? s.setup.leftSide : other$1(s.setup.leftSide));
}
/** Recalcula los campos de vista. */
function refresh(s) {
	const r = s.rules;
	const [a, b] = s.points;
	if (s.tiebreak) {
		const k = a + b;
		const turn = k === 0 ? 0 : Math.floor((k + 1) / 2);
		const team = turn % 2 === 0 ? s.gameServer : other$1(s.gameServer);
		s.server = team;
		s.serverPlayer = r.doubles ? (s.nextPlayer[team - 1] + Math.floor(turn / 2)) % 2 : 0;
		s.serveFrom = k % 2 === 0 ? "right" : "left";
		s.display = [String(a), String(b)];
		s.deuces = 0;
		s.decidingPoint = false;
		s.label = s.matchTiebreak ? "Súper tie-break" : "Tie-break";
	} else {
		s.server = s.gameServer;
		s.serverPlayer = r.doubles ? s.nextPlayer[s.gameServer - 1] : 0;
		s.decidingPoint = isDeciding(r, a, b);
		s.deuces = Math.min(a, b) >= 3 ? Math.min(a, b) - 2 : 0;
		s.serveFrom = s.decidingPoint ? null : (a + b) % 2 === 0 ? "right" : "left";
		s.display = a >= 3 && b >= 3 ? a === b ? ["40", "40"] : a > b ? ["AD", "40"] : ["40", "AD"] : [PTS[a], PTS[b]];
		s.label = s.decidingPoint ? DECIDING[r.deuce] : a >= 3 && b >= 3 ? a === b ? "Iguales" : "Ventaja" : null;
	}
	s.pointsText = `${s.display[0]}-${s.display[1]}`;
	if (s.winner !== null) {
		s.serveFrom = null;
		s.label = null;
		s.decidingPoint = false;
	}
	return s;
}
//#endregion
//#region src/sports/racket/index.ts
/** Aplica una jugada a cualquier partido de raqueta (usa las reglas guardadas en el estado). */
function applyRacket(state, ev) {
	return state.sport === "pickleball" ? applyPickleball(state, ev) : applyTennis(state, ev);
}
/** Estado inicial con reglas completas (sin pasar por `createRacketEngine`). */
function initRacket(rules, setup) {
	return rules.sport === "pickleball" ? initPickleball(rules, setup) : initTennis(rules, setup);
}
/**
* Para la tabla: si hubo retiro o W.O., completa el partido como si el ganador ganara todos los puntos que
* faltaban (W.O. = 6-0 6-0 en tenis y pádel, 11-0 en pickleball; retiro = se termina el set o juego en curso
* a favor del ganador y, si hace falta, los que siguen). Si no, devuelve el mismo estado.
*/
function completeMatch(state) {
	if (state.winner === null || state.finish === "played") return state;
	const w = state.winner;
	let s = {
		...structuredClone(state),
		winner: null,
		finish: null,
		quitter: null
	};
	for (let guard = 0; s.winner === null && guard < 5e3; guard++) s = applyRacket(s, {
		type: "point",
		side: w
	});
	return s;
}
/** Totales para la tabla. En retiro y W.O. usa el partido completado (ver `completeMatch`). */
function matchTotals(state) {
	const s = completeMatch(state);
	const count = (list, side) => list.filter((x) => x[side] > x[1 - side]).length;
	if (s.sport === "pickleball") {
		const done = s.games;
		const wins = [count(done, 0), count(done, 1)];
		const points = [s.score[0], s.score[1]];
		for (const g of done) {
			points[0] += g[0];
			points[1] += g[1];
		}
		return {
			sets: wins,
			games: [wins[0], wins[1]],
			points
		};
	}
	const sets = s.sets.map((x) => x.games);
	const games = [s.games[0], s.games[1]];
	for (const g of sets) {
		games[0] += g[0];
		games[1] += g[1];
	}
	return {
		sets: [count(sets, 0), count(sets, 1)],
		games,
		points: [s.won[0], s.won[1]]
	};
}
const TOKEN$1 = /^\[?(\d{1,2})\s*[-–—:/]\s*(\d{1,2})\]?(?:\((\d{1,2})\))?$/;
/**
* Modo «solo resultado»: lee "6-4 3-6 10-7", "7-6(5) 6-4" o "11-7 9-11 11-5" (lado 1 primero) y devuelve un
* estado terminado con esas reglas, listo para `matchTotals` y `racketResult`. Lanza un Error si no cuadra.
*/
function stateFromScore(rules, text, setup) {
	const tokens = String(text ?? "").trim().split(/[\s,;]+/).filter(Boolean).map((t) => {
		const m = TOKEN$1.exec(t);
		if (!m) throw new Error(`No entiendo «${t}». Escribe el marcador así: 6-4 3-6 10-7.`);
		return {
			a: Number(m[1]),
			b: Number(m[2]),
			tb: m[3] === void 0 ? null : Number(m[3])
		};
	});
	if (!tokens.length) throw new Error("Escribe el marcador.");
	let s = initRacket(rules, setup);
	if (s.sport === "pickleball") {
		if (tokens.some((t) => t.tb !== null)) throw new Error("En pickleball no hay tie-break.");
		s = applyPickleball(s, {
			type: "correct",
			games: tokens.map((t) => [t.a, t.b]),
			score: [0, 0]
		});
	} else {
		const r = s.rules;
		const sets = tokens.map((t) => {
			const set = { games: [t.a, t.b] };
			if (t.tb !== null) {
				const win = r.tiebreakWinBy === 2 ? Math.max(r.tiebreakTo, t.tb + 2) : r.tiebreakTo;
				set.tiebreak = t.a > t.b ? [win, t.tb] : [t.tb, win];
			}
			return set;
		});
		s = applyTennis(s, {
			type: "correct",
			sets,
			games: [0, 0]
		});
	}
	if (s.winner === null) throw new Error("Ese marcador no termina el partido.");
	return s;
}
//#endregion
//#region src/pages/sports/racket/logic/results.ts
/**
* Resultados de raqueta para tablas y estadísticas: de un partido de la base (Match) al MatchResult de los
* motores, tablas de parejas (desempates de src/sports/formats), ranking individual de la temporada, noches de
* puntos de la temporada y el récord de un jugador (con cada compañero y contra cada rival). Puro.
*/
/** Partidos a sets (liga, torneo, sueltos): formato '' o 'sets'. Los de puntos son del americano/mexicano. */
const isSetsMatch = (m) => m.format === "" || m.format === "sets";
const isPointsMatch = (m) => m.format === "americano" || m.format === "mexicano";
/**
* Id del lado para las tablas y el cuadro: la pareja (equipo de temporada); en individual, el jugador; si no,
* `p:<id>+<id>` (lado armado solo con jugadores, como en `sideKey`).
*/
function entrantKey(s) {
	if (s.teamId) return s.teamId;
	if (s.players.length === 1) return s.players[0].playerId;
	return sideKey(s);
}
const isObj$7 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const pair = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? [v[0], v[1]] : null;
/** Reglas del partido (rules.match del partido o de la liga) completas; null si no sirven. */
function matchRules(sport, rules) {
	const m = isObj$7(rules) && isObj$7(rules.match) ? rules.match : {};
	try {
		return resolveRules(sport, {
			...m,
			sport
		});
	} catch {
		try {
			return resolveRules(sport, {});
		} catch {
			return null;
		}
	}
}
const PAIRS = /(\d{1,2})\s*-\s*(\d{1,2})/g;
/**
* MatchResult de un partido a sets que ya cuenta (confirmado, W.O. o con las 48 h). Totales: tenis y pádel
* `sets` y `games` (y `points` si se sabe); pickleball `games` y `points`. null si no se puede usar (W.O. doble,
* sin ganador, sin marcador legible).
*/
function racketResultOf(m, sport, rules) {
	const meta = {
		id: m.id,
		side1: entrantKey(m.sides[0]),
		side2: entrantKey(m.sides[1])
	};
	const r = matchRules(sport, rules ?? m.rules);
	if (m.status === "walkover") {
		if (m.walkoverSide !== 1 && m.walkoverSide !== 2) return null;
		const winner = m.walkoverSide === 1 ? 2 : 1;
		if (sport === "pickleball") return pickleballMatchResult({
			...meta,
			games: [],
			walkover: m.walkoverSide
		});
		const sets = r && r.sport !== "pickleball" ? Math.ceil(r.bestOf / 2) : 2;
		const gps = r && r.sport !== "pickleball" ? r.gamesPerSet : 6;
		return racketMatchResult({
			...meta,
			sets: [],
			winner,
			status: "walkover",
			walkoverSets: Array.from({ length: sets }, () => [gps, 0])
		});
	}
	if (m.winner !== 1 && m.winner !== 2) return null;
	const score = m.score ?? {};
	const totals = isObj$7(score.totals) ? score.totals : null;
	const tSets = pair(totals?.sets);
	const tGames = pair(totals?.games);
	const tPoints = pair(totals?.points);
	if (tSets && tGames) {
		if (sport === "pickleball") return {
			...meta,
			winner: m.winner,
			totals: {
				games: tSets,
				points: tPoints ?? [0, 0]
			}
		};
		return {
			...meta,
			winner: m.winner,
			totals: {
				sets: tSets,
				games: tGames,
				...tPoints ? { points: tPoints } : {}
			}
		};
	}
	const text = typeof score.text === "string" ? score.text : "";
	if (r && text) try {
		const t = matchTotals(stateFromScore(r, text));
		if (sport === "pickleball") return {
			...meta,
			winner: m.winner,
			totals: {
				games: t.sets,
				points: t.points
			}
		};
		return {
			...meta,
			winner: m.winner,
			totals: {
				sets: t.sets,
				games: t.games
			}
		};
	} catch {}
	const sets = [...text.matchAll(PAIRS)].map((x) => [Number(x[1]), Number(x[2])]);
	if (sport === "pickleball") return {
		...pickleballMatchResult({
			...meta,
			games: sets
		}),
		winner: m.winner
	};
	const tennis = r && r.sport !== "pickleball" ? r : null;
	return racketMatchResult({
		...meta,
		sets,
		winner: m.winner,
		status: /ret/i.test(text) ? "retired" : "normal",
		gamesPerSet: tennis?.gamesPerSet ?? 6,
		setsToWin: tennis ? Math.ceil(tennis.bestOf / 2) : 2,
		superTiebreak: tennis ? tennis.finalSet === "tiebreak" : sport === "padel"
	});
}
function pointsRule(sport, scheme = "standard") {
	if (sport === "pickleball") return PICKLEBALL_POINTS;
	return scheme === "2-0" ? {
		win: 2,
		draw: 0,
		loss: 0,
		walkoverLoss: 0
	} : RACKET_POINTS;
}
/** Tabla de parejas (o jugadores en individual) de una competencia cerrada: liga, grupo. */
function pairStandings(sport, ids, matches, opts = {}) {
	const results = finalMatches(matches.filter(isSetsMatch), opts.now).map((m) => racketResultOf(m, sport, opts.rules)).filter((x) => !!x);
	const o = {
		points: pointsRule(sport, opts.scheme),
		lotSeed: opts.lotSeed
	};
	return sport === "pickleball" ? pickleballStandings(ids, results, o) : racketStandings(ids, results, o);
}
/** Jugadores de un lado: los del partido; si no hay, la plantilla de la pareja. */
function sidePlayers(s, rosterOf) {
	if (s.players.length) return s.players.map((p) => p.playerId);
	return s.teamId && rosterOf ? [...rosterOf(s.teamId)] : [];
}
/** Lado del jugador en el partido (null si no jugó). */
function playerSide(m, playerId, rosterOf) {
	if (sidePlayers(m.sides[0], rosterOf).includes(playerId)) return 1;
	if (sidePlayers(m.sides[1], rosterOf).includes(playerId)) return 2;
	return null;
}
/** Cuándo fue el partido (para ordenar y para la temporada): la hora programada o cuando se anotó. */
function matchTime(m) {
	const t = Date.parse(m.scheduledAt ?? m.proposedAt ?? m.confirmedAt ?? "");
	if (Number.isFinite(t)) return t;
	return m.createdAt?.toMillis?.() ?? 0;
}
/**
* Ranking individual de la temporada con los partidos a sets que cuentan: cada jugador suma lo de su lado
* (puntos de tabla 3/1/0, sets y juegos). Orden: puntos → ganados → dif. de sets → dif. de juegos → sorteo.
*/
function seasonPlayerTable(matches, opts) {
	const pts = pointsRule(opts.sport, opts.scheme);
	const rows = /* @__PURE__ */ new Map();
	const row = (id) => {
		let r = rows.get(id);
		if (!r) {
			r = {
				id,
				played: 0,
				won: 0,
				drawn: 0,
				lost: 0,
				points: 0,
				for: 0,
				against: 0,
				diff: 0,
				extra: {
					setsFor: 0,
					setsAgainst: 0,
					setsDiff: 0,
					walkovers: 0
				},
				rank: 0
			};
			rows.set(id, r);
		}
		return r;
	};
	for (const m of finalMatches(matches.filter(isSetsMatch), opts.now)) {
		const res = racketResultOf(m, opts.sport, opts.rules);
		if (!res) continue;
		[1, 2].forEach((side) => {
			const i = side - 1;
			const sets = res.totals.sets ?? res.totals.games ?? [0, 0];
			const games = opts.sport === "pickleball" ? res.totals.points ?? [0, 0] : res.totals.games ?? [0, 0];
			for (const p of sidePlayers(m.sides[i], opts.rosterOf)) {
				const r = row(p);
				r.played++;
				if (res.walkover === side) {
					r.lost++;
					r.points += pts.walkoverLoss;
					r.extra.walkovers++;
				} else if (res.walkover ? res.walkover !== side : res.winner === side) {
					r.won++;
					r.points += res.walkover ? pts.walkoverWin ?? pts.win : pts.win;
				} else {
					r.lost++;
					r.points += pts.loss;
				}
				r.for += games[i];
				r.against += games[1 - i];
				r.extra.setsFor += sets[i];
				r.extra.setsAgainst += sets[1 - i];
			}
		});
	}
	for (const r of rows.values()) {
		r.diff = r.for - r.against;
		r.extra.setsDiff = r.extra.setsFor - r.extra.setsAgainst;
		if (opts.sport === "pickleball") r.extra.gamesDiff = r.extra.setsDiff;
	}
	return resolveTies([...rows.values()], [], [
		tiebreak.points(),
		tiebreak.wins(),
		tiebreak.stat("setsDiff", opts.sport === "pickleball" ? "dif. de juegos" : "dif. de sets"),
		tiebreak.diff(opts.sport === "pickleball" ? "dif. de puntos" : "dif. de juegos"),
		tiebreak.lot(opts.lotSeed ?? "")
	]);
}
/** Americano y mexicano de la temporada por jugador: noches, partidos, puntos totales y por partido. */
function seasonNightTable(matches, opts = {}) {
	const rows = /* @__PURE__ */ new Map();
	for (const m of finalMatches(matches.filter(isPointsMatch), opts.now)) {
		const s = pair(m.score?.sides);
		if (!s) continue;
		[0, 1].forEach((i) => {
			const [me, them] = i === 0 ? s : [s[1], s[0]];
			for (const p of sidePlayers(m.sides[i])) {
				const r = rows.get(p) ?? {
					id: p,
					rank: 0,
					nights: 0,
					played: 0,
					won: 0,
					drawn: 0,
					lost: 0,
					points: 0,
					against: 0,
					avg: 0,
					events: /* @__PURE__ */ new Set()
				};
				r.played++;
				r.points += me;
				r.against += them;
				if (me > them) r.won++;
				else if (me < them) r.lost++;
				else r.drawn++;
				if (m.eventId) r.events.add(m.eventId);
				rows.set(p, r);
			}
		});
	}
	const list = [...rows.values()].map(({ events, ...r }) => ({
		...r,
		nights: events.size,
		avg: r.played ? Math.round(r.points / r.played * 10) / 10 : 0
	}));
	list.sort((a, b) => b.points - a.points || b.won - a.won || b.avg - a.avg || (a.id < b.id ? -1 : 1));
	list.forEach((r, i) => {
		const prev = list[i - 1];
		r.rank = prev && prev.points === r.points && prev.won === r.won && prev.avg === r.avg ? prev.rank : i + 1;
	});
	return list;
}
//#endregion
//#region src/badges/rules/racket.ts
/**
* Validación de partidos de raqueta para las insignias (docs/insignias.md §1.7.5 y §2.3): partido contado (R1) y
* validado (R2), cuentas de cada lado, sets leídos del marcador y el % de juegos ganados (línea base, §1.7.6).
* Los partidos se pasan al tipo de la app (`Match`) para usar los mismos helpers que las tablas.
*/
/** Un partido de la foto como `Match` de la app (con sus lados y jugadores), para los helpers de las tablas. */
function appMatch(row, sides, players) {
	const w = toMatch({
		...row,
		state: null
	}, sides, players);
	return {
		...w,
		createdAt: toStamp(w.createdAt),
		updatedAt: toStamp(w.updatedAt)
	};
}
/** Todos los partidos de la foto como `Match`. */
function appMatches(rows, sides = [], players = []) {
	const sidesBy = groupBy$1(sides, (s) => s.match_id);
	const playersBy = groupBy$1(players, (p) => p.match_id);
	return rows.map((r) => appMatch(r, sidesBy.get(r.id) ?? [], playersBy.get(r.id) ?? []));
}
function groupBy$1(list, key) {
	const out = /* @__PURE__ */ new Map();
	for (const x of list) {
		const k = key(x);
		const arr = out.get(k);
		if (arr) arr.push(x);
		else out.set(k, [x]);
	}
	return out;
}
/** Fecha local del partido para las insignias: `coalesce(scheduled_at, proposed_at, created_at)` en la zona. */
function dateOfMatch(m, tz) {
	const created = m.createdAt ? new Date(m.createdAt.toMillis()).toISOString() : "";
	return matchDate({
		scheduled_at: m.scheduledAt,
		proposed_at: m.proposedAt,
		created_at: created
	}, tz);
}
/** Cuentas de un lado (jugadores del partido o de la pareja). */
function sideAccounts(m, side, ctx) {
	const out = /* @__PURE__ */ new Set();
	for (const p of sidePlayers(m.sides[side - 1], ctx.rosterOf)) {
		const u = ctx.userOf(p);
		if (u) out.add(u);
	}
	return out;
}
/** R1: final (confirmado o a las 48 h), sin W.O. ni anulado, y el jugador está en un lado. */
function isR1(m, playerId, ctx) {
	return isFinal(m, ctx.now) && m.status !== "walkover" && m.status !== "void" && playerSide(m, playerId, ctx.rosterOf) !== null;
}
function r2Reason(m, playerId, ctx) {
	if (!isR1(m, playerId, ctx)) return null;
	const side = playerSide(m, playerId, ctx.rosterOf);
	const mine = sideAccounts(m, side, ctx);
	const theirs = sideAccounts(m, other$1(side), ctx);
	const neutral = (u) => !!u && ctx.staff.has(u) && !mine.has(u) && !theirs.has(u);
	const byOfficial = m.proposedSide === null && !!m.proposedBy && !mine.has(m.proposedBy);
	const byRival = !!m.proposedBy && theirs.has(m.proposedBy);
	if (!m.requireConfirm) {
		if (byOfficial) return "oficial";
		return byRival ? "rival" : null;
	}
	if (m.confirmedBy && theirs.has(m.confirmedBy) || byRival) return "rival";
	if (byOfficial) return "oficial";
	if (m.status === "finished" && !m.disputedAt && theirs.size > 0) return "plazo";
	if ((m.history ?? []).some((h) => h.a === "resolve" && neutral(h.by))) return "reclamo";
	if (neutral(m.confirmedBy)) return "neutral";
	return null;
}
/** El jugador ganó (W.O. a favor no cuenta como victoria para las insignias: ver R1). */
function wonBy(m, playerId, rosterOf) {
	const side = playerSide(m, playerId, rosterOf);
	return side !== null && m.winner === side;
}
/**
* Oficial para títulos, asistencia y rachas: partidos de eventos de liga, torneo, cajas y escalera, y partidos
* sueltos, que se confirman. Americano, mexicano y noches son sociales.
*/
const OFFICIAL_EVENTS = /* @__PURE__ */ new Set([
	"liga",
	"torneo",
	"cajas",
	"escalera"
]);
function isOfficialRacket(m, eventType) {
	if (!m.requireConfirm || isPointsMatch(m)) return false;
	return !m.eventId || !!eventType && OFFICIAL_EVENTS.has(eventType);
}
/**
* Actividad válida de raqueta: estar en un lado de un partido R1, o de un W.O. a favor. Una noche de americano o
* mexicano con un partido final da su día (los días se juntan en activity.ts).
*/
function racketActivity(matches, ctx) {
	const out = [];
	for (const m of matches) {
		if (!isFinal(m, ctx.now) || m.status === "void") continue;
		const date = dateOfMatch(m, ctx.tz);
		if (!date) continue;
		const official = isOfficialRacket(m, m.eventId ? ctx.eventType?.(m.eventId) : null);
		for (const side of [1, 2]) {
			if (m.status === "walkover" && m.walkoverSide === side) continue;
			for (const p of sidePlayers(m.sides[side - 1], ctx.rosterOf)) out.push({
				sport: ctx.sport,
				league_id: m.leagueId,
				player_id: p,
				user_id: ctx.userOf(p),
				date,
				official
			});
		}
	}
	return out;
}
const TOKEN = /^\[?(\d{1,2})\s*[-–—:/]\s*(\d{1,2})\]?(?:\((\d{1,2})\))?$/;
/**
* Sets de un partido R1 a sets, leídos con `stateFromScore(matchRules(sport, rules), score.text)`. Se ignora el set
* cortado por `ret.`; un W.O., un partido de puntos o un marcador que no se entiende dan null.
*/
function readSets(m, sport) {
	if (m.status === "walkover" || m.status === "void" || isPointsMatch(m)) return null;
	const rules = matchRules(sport, m.rules);
	const text = typeof m.score?.text === "string" ? m.score.text : "";
	if (!rules || !text) return null;
	const retired = /ret/i.test(text);
	if (!retired) try {
		const s = stateFromScore(rules, text);
		if (s.sport === "pickleball") return {
			rules,
			retired,
			sets: s.games.map((g) => ({
				games: g,
				winner: g[0] > g[1] ? 1 : 2,
				tiebreak: false,
				matchTiebreak: false
			}))
		};
		return {
			rules,
			retired,
			sets: s.sets.map((x) => {
				const games = x.matchTiebreak && x.tiebreak ? x.tiebreak : x.games;
				return {
					games,
					winner: games[0] > games[1] ? 1 : 2,
					tiebreak: !x.matchTiebreak && isTiebreakSet(s.rules, x.games),
					matchTiebreak: !!x.matchTiebreak
				};
			})
		};
	} catch {
		return null;
	}
	const sets = [];
	const tokens = text.split(/[\s,;]+/).filter((t) => t && !/ret/i.test(t));
	for (const [k, t] of tokens.entries()) {
		const x = TOKEN.exec(t);
		if (!x) return null;
		const games = [Number(x[1]), Number(x[2])];
		if (rules.sport === "pickleball") {
			const w = raceFinal(rules.gameTo, rules.winBy, games);
			if (w) sets.push({
				games,
				winner: w,
				tiebreak: false,
				matchTiebreak: false
			});
			continue;
		}
		const decider = rules.finalSet === "tiebreak" && k === rules.bestOf - 1;
		const w = decider ? raceFinal(rules.finalTiebreakTo, 2, games) : setWinner(rules, games);
		if (w) sets.push({
			games,
			winner: w,
			tiebreak: !decider && isTiebreakSet(rules, games),
			matchTiebreak: decider
		});
	}
	return {
		rules,
		retired,
		sets
	};
}
/**
* Juegos de cada lado para el % de juegos ganados (línea base de raqueta): `score.totals.games` o, si falta, los del
* texto (el súper tie-break cuenta como un juego 1-0; en pickleball, los juegos). null en W.O., partidos de puntos o
* marcadores que no se entienden.
*/
function racketGames(m, sport) {
	if (m.status === "walkover" || m.status === "void" || isPointsMatch(m)) return null;
	const totals = m.score?.totals;
	const g = totals && typeof totals === "object" ? totals.games : null;
	if (Array.isArray(g) && g.length === 2 && g.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)) return [g[0], g[1]];
	const read = readSets(m, sport);
	if (!read) return null;
	if (!read.retired) try {
		return matchTotals(stateFromScore(read.rules, String(m.score?.text))).games;
	} catch {
		return null;
	}
	const out = [0, 0];
	for (const s of read.sets) if (read.rules.sport === "pickleball" || s.matchTiebreak) out[s.winner - 1]++;
	else {
		out[0] += s.games[0];
		out[1] += s.games[1];
	}
	return out;
}
//#endregion
//#region src/sports/team/basketball.ts
/** Configuraciones listas: «Liga 5x5 FIBA 4×10», «Liga de barrio a 2 mitades» y «Torneo 3x3 a 21». */
function basketballConfig(preset = "fiba", overrides = {}) {
	const fiba = {
		variant: "5x5",
		periods: 4,
		periodMinutes: 10,
		overtimeMinutes: 5,
		clock: true,
		bonusFrom: 5,
		doubleBonusFrom: null,
		ejection: {
			fouls: 5,
			technicals: 2,
			unsportsmanlike: 2,
			mixed: true
		},
		timeouts: {
			firstHalf: 2,
			secondHalf: 3,
			lastTwoMinutes: 2,
			overtime: 1,
			perGame: null
		},
		target: null,
		overtimeTarget: null,
		forfeitScore: 20
	};
	return {
		...preset === "halves" ? {
			...fiba,
			periods: 2,
			periodMinutes: 20,
			bonusFrom: 7
		} : preset === "3x3" ? {
			...fiba,
			variant: "3x3",
			periods: 1,
			periodMinutes: 10,
			overtimeMinutes: 0,
			bonusFrom: 7,
			doubleBonusFrom: 10,
			ejection: {
				fouls: null,
				technicals: null,
				unsportsmanlike: 2,
				mixed: false
			},
			timeouts: {
				firstHalf: 0,
				secondHalf: 0,
				lastTwoMinutes: 0,
				overtime: 0,
				perGame: 1
			},
			target: 21,
			overtimeTarget: 2
		} : fiba,
		...overrides
	};
}
//#endregion
//#region src/pages/sports/basketball/adapter.ts
function decodeLines$1(raw) {
	if (typeof raw !== "string" || !raw) return [];
	const out = [];
	for (const part of raw.split(";")) {
		const [playerId, side, ...nums] = part.split(":");
		const n = nums.map(Number);
		if (!playerId || side !== "1" && side !== "2" || n.length !== 5 || n.some((x) => !Number.isInteger(x) || x < 0)) continue;
		out.push({
			playerId,
			side: side === "2" ? 2 : 1,
			points: n[0],
			ones: n[1],
			twos: n[2],
			threes: n[3],
			fouls: n[4]
		});
	}
	return out;
}
const isObj$6 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
/** Puntos de cada periodo publicados ([[20,18], …]). */
function periodsFromScore$1(score) {
	const p = score?.periods;
	if (!Array.isArray(p)) return [];
	return p.filter((x) => Array.isArray(x) && x.length === 2 && x.every((n) => typeof n === "number"));
}
/** Resultado del partido para la tabla FIBA (null si no cuenta: sin marcador, W.O. doble o lado sin equipo). */
function matchResultOf$1(m) {
	const [s1, s2] = m.sides;
	if (!s1 || !s2) return null;
	const base = {
		id: m.id,
		side1: sideKey(s1),
		side2: sideKey(s2)
	};
	if (m.status === "walkover") {
		if (m.walkoverSide !== 1 && m.walkoverSide !== 2) return null;
		return {
			...base,
			winner: m.walkoverSide === 1 ? 2 : 1,
			walkover: m.walkoverSide,
			totals: { points: [0, 0] }
		};
	}
	const sides = m.score?.sides;
	if (!Array.isArray(sides) || sides.length !== 2) return null;
	const r = {
		...base,
		winner: m.winner,
		totals: { points: [Number(sides[0]) || 0, Number(sides[1]) || 0] }
	};
	const ending = m.score?.ending;
	if (isObj$6(ending) && (ending.side === 1 || ending.side === 2)) {
		if (ending.kind === "forfeit") r.walkover = ending.side;
		if (ending.kind === "default") r.defaulted = ending.side;
	}
	return r;
}
//#endregion
//#region src/sports/team/football.ts
/** Configuraciones listas. En eliminatorias se prende `extraTime` y/o `shootout`. */
function footballConfig(preset = "football", overrides = {}) {
	const field = {
		variant: "football",
		halfMinutes: 45,
		clock: "running",
		extraTime: false,
		extraTimeMinutes: 15,
		shootout: false,
		shootoutKicks: 5,
		subs: {
			max: 5,
			reentry: false,
			extraTimeBonus: 1
		},
		accumulatedFouls: null,
		timeoutsPerHalf: 0,
		powerPlayMs: null,
		players: 11,
		walkoverScore: 3
	};
	const futsal = {
		...field,
		variant: "futsal",
		halfMinutes: 20,
		clock: "stopped",
		extraTimeMinutes: 5,
		subs: {
			max: null,
			reentry: true,
			extraTimeBonus: 0
		},
		accumulatedFouls: {
			alertAt: 5,
			penaltyFrom: 6
		},
		timeoutsPerHalf: 1,
		powerPlayMs: 12e4,
		players: 5
	};
	return {
		...preset === "futsal" ? futsal : preset === "futsal_amateur" ? {
			...futsal,
			clock: "running"
		} : preset === "football7" ? {
			...field,
			halfMinutes: 30,
			players: 7,
			subs: {
				max: null,
				reentry: true,
				extraTimeBonus: 0
			}
		} : field,
		...overrides
	};
}
//#endregion
//#region src/pages/sports/football/adapter.ts
function decodeLines(raw) {
	if (typeof raw !== "string" || !raw) return [];
	const out = [];
	for (const part of raw.split(";")) {
		const [playerId, side, ...rest] = part.split(":");
		if (!playerId || side !== "1" && side !== "2") continue;
		const n = (i) => {
			const v = Number(rest[i] ?? 0);
			return Number.isInteger(v) && v >= 0 ? v : 0;
		};
		const red = rest[5] === "d" ? "direct" : rest[5] === "s" ? "second_yellow" : null;
		out.push({
			playerId,
			side: side === "2" ? 2 : 1,
			played: rest[0] === "1",
			goals: n(1),
			assists: n(2),
			ownGoals: n(3),
			yellows: n(4),
			red,
			keeper: rest[6] === "1",
			conceded: n(7)
		});
	}
	return out;
}
const TL_KIND = {
	g: "goal",
	o: "own_goal",
	y: "yellow",
	s: "second_yellow",
	r: "red"
};
function decodeTimeline(raw, lines) {
	if (typeof raw !== "string" || !raw) return [];
	const out = [];
	for (const part of raw.split(";")) {
		const m = /^([gosyr])([12])\.([0-9+]*)\.(\d*)\.(\d*)$/.exec(part);
		if (!m) continue;
		const who = (s) => s === "" ? null : lines[Number(s)]?.playerId ?? null;
		out.push({
			kind: TL_KIND[m[1]],
			side: m[2] === "2" ? 2 : 1,
			minute: m[3] || null,
			player: who(m[4]),
			assist: who(m[5])
		});
	}
	return out;
}
const isObj$5 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const pairOf = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number" && Number.isFinite(x)) ? [v[0], v[1]] : null;
/** Goles de cada tiempo publicados ([[1,0],[1,1]]). */
function periodsFromScore(score) {
	const p = score?.periods;
	if (!Array.isArray(p)) return [];
	return p.map(pairOf).filter((x) => x !== null);
}
/** Penales publicados ([4, 3]) o null. */
const pensFromScore = (score) => pairOf(score?.pens);
/** Resultado del partido para la tabla (null si no cuenta: sin marcador, W.O. doble o lado sin equipo). */
function matchResultOf(m) {
	const [s1, s2] = m.sides;
	if (!s1 || !s2) return null;
	const base = {
		id: m.id,
		side1: sideKey(s1),
		side2: sideKey(s2)
	};
	if (m.status === "walkover") {
		if (m.walkoverSide !== 1 && m.walkoverSide !== 2) return null;
		return {
			...base,
			winner: m.walkoverSide === 1 ? 2 : 1,
			walkover: m.walkoverSide,
			totals: { goals: [0, 0] }
		};
	}
	const sides = pairOf(m.score?.sides);
	if (!sides) return null;
	const totals = {};
	const t = m.score?.totals;
	if (isObj$5(t)) for (const k of [
		"yellow",
		"red",
		"cardsYellow",
		"cardsSecondYellow",
		"cardsRed",
		"cardsYellowRed"
	]) {
		const v = pairOf(t[k]);
		if (v) totals[k] = v;
	}
	totals.goals = sides;
	const pens = pensFromScore(m.score);
	if (pens) totals.shootout = pens;
	return {
		...base,
		winner: m.winner,
		totals
	};
}
//#endregion
//#region src/badges/rules/team.ts
/**
* Validación de partidos de equipo (baloncesto, fútbol y sala) para las insignias (docs/insignias.md §1.7.5):
* partido contado (T1), validado (T2) y con estadísticas (TS), apariciones, respaldo por plantilla y resultado de
* cada lado. Las líneas se leen con los `decodeLines` de cada deporte.
*/
/** T1: final (confirmado o a las 48 h), sin anular, sin W.O. y sin forfait (`score.ending`). */
function isT1(m, now) {
	return isFinal(m, now) && m.status !== "walkover" && m.status !== "void" && !m.score?.ending;
}
/** Baloncesto: una línea es coherente si `pts = 1s + 2·2s + 3·3s`; si no, se descarta. */
const coherentBasketballLine = (l) => l.points === l.ones + 2 * l.twos + 3 * l.threes;
/** Líneas de baloncesto del partido (todas, también las incoherentes: sirven de aparición). */
const basketballLinesOf = (m) => decodeLines$1(m.score?.lines);
/** Líneas de fútbol y sala del partido. */
const footballLinesOf = (m) => decodeLines(m.score?.lines);
/** El partido trae estadísticas por jugador (no es «solo resultado»). */
const hasLines = (m) => typeof m.score?.lines === "string" && m.score.lines.length > 0;
/**
* Apariciones (§1.7.5): una fila en `match_players`, una línea de baloncesto o una de fútbol y sala con `played`.
* Nunca la plantilla actual. Jugador → lado.
*/
function appearances(m, sport) {
	const out = /* @__PURE__ */ new Map();
	for (const s of m.sides) for (const p of s.players) out.set(p.playerId, s.side);
	if (sport === "basketball") {
		for (const l of basketballLinesOf(m)) if (!out.has(l.playerId)) out.set(l.playerId, l.side);
	}
	if (sport !== "basketball") {
		for (const l of footballLinesOf(m)) if (l.played && !out.has(l.playerId)) out.set(l.playerId, l.side);
	}
	return out;
}
/**
* Respaldo por plantilla, solo si el partido no tiene ningún dato de alineación: los de la plantilla de cada lado
* que ya estaban (`team_players.created_at` ≤ fecha del partido). Vale para días activos, debut y kilometraje.
*/
function rosterFallback(m, teamPlayers, date, tz) {
	const out = /* @__PURE__ */ new Map();
	for (const s of m.sides) {
		if (!s.teamId) continue;
		for (const tp of teamPlayers) {
			const since = localDate(tp.created_at, tz);
			if (tp.team_id === s.teamId && since && since <= date && !out.has(tp.player_id)) out.set(tp.player_id, s.side);
		}
	}
	return out;
}
/** TS de baloncesto: la línea coherente del jugador en un partido con líneas (el T2 lo revisa quien llama). */
function basketballStatLine(m, playerId) {
	if (!hasLines(m)) return null;
	const l = basketballLinesOf(m).find((x) => x.playerId === playerId);
	return l && coherentBasketballLine(l) ? l : null;
}
/** TS de fútbol y sala: la línea del jugador con `played` (los autogoles nunca cuentan para quien los hizo). */
function footballStatLine(m, playerId) {
	if (!hasLines(m)) return null;
	return footballLinesOf(m).find((x) => x.playerId === playerId && x.played) ?? null;
}
/** Cuentas de la plantilla de un equipo (con rol, si se pide). */
function rosterAccounts(teamId, ctx, roles) {
	const out = /* @__PURE__ */ new Set();
	if (!teamId) return out;
	for (const tp of ctx.teamPlayers) {
		if (tp.team_id !== teamId || roles && !roles.includes(tp.role)) continue;
		const u = ctx.userOf(tp.player_id);
		if (u) out.add(u);
	}
	return out;
}
function t2Reason(m, side, ctx) {
	if (!isT1(m, ctx.now)) return null;
	const mineTeam = m.sides[side - 1].teamId;
	const theirTeam = m.sides[other$1(side) - 1].teamId;
	const mine = rosterAccounts(mineTeam, ctx);
	for (const p of m.sides[side - 1].players) {
		const u = ctx.userOf(p.playerId);
		if (u) mine.add(u);
	}
	const theirs = rosterAccounts(theirTeam, ctx);
	const theirLeads = rosterAccounts(theirTeam, ctx, ["captain", "delegate"]);
	if (m.proposedSide === null && m.proposedBy && !mine.has(m.proposedBy)) return "oficial";
	if (m.confirmedBy && theirLeads.has(m.confirmedBy) || m.proposedBy && theirLeads.has(m.proposedBy)) return "rival";
	if (m.status === "finished" && !m.disputedAt && theirLeads.size > 0) return "plazo";
	const c = m.confirmedBy;
	if (c && ctx.staff.has(c) && !mine.has(c) && !theirs.has(c)) return "neutral";
	return null;
}
/**
* Resultado de un lado: 'G' ganó, 'E' empató (un empate que se decide por penales es empate), 'P' perdió. Sale de
* `score.sides`; si falta, del ganador.
*/
function teamOutcome(m, side) {
	const s = m.score?.sides;
	if (Array.isArray(s) && s.length === 2 && s.every((x) => typeof x === "number")) {
		const [me, them] = side === 1 ? s : [s[1], s[0]];
		return me > them ? "G" : me < them ? "P" : "E";
	}
	if (m.winner === null) return null;
	return m.winner === side ? "G" : "P";
}
/** Ganó en la tanda de penales (fútbol y sala). */
function wonShootout(m, side) {
	const pens = pensFromScore(m.score);
	const s = m.score?.sides;
	if (!pens || !Array.isArray(s) || s[0] !== s[1]) return false;
	return side === 1 ? pens[0] > pens[1] : pens[1] > pens[0];
}
/**
* Actividad válida de equipos: aparecer en un partido T1. Si el partido no tiene ningún dato de alineación, la
* plantilla (marcada `roster`). Todos los partidos de la liga son oficiales.
*/
function teamActivity(matches, ctx) {
	const out = [];
	for (const m of matches) {
		if (!isT1(m, ctx.now)) continue;
		const date = dateOfMatch(m, ctx.tz);
		if (!date) continue;
		const seen = appearances(m, ctx.sport);
		const roster = seen.size === 0;
		const who = roster ? rosterFallback(m, ctx.teamPlayers, date, ctx.tz) : seen;
		for (const p of who.keys()) out.push({
			sport: ctx.sport,
			league_id: m.leagueId,
			player_id: p,
			user_id: ctx.userOf(p),
			date,
			official: true,
			...roster ? { roster: true } : {}
		});
	}
	return out;
}
//#endregion
//#region src/sports/swimming/events.ts
const SWIM_STROKES = [
	"libre",
	"espalda",
	"pecho",
	"mariposa",
	"combinado"
];
const STROKE_LABEL = {
	libre: "Libre",
	espalda: "Espalda",
	pecho: "Pecho",
	mariposa: "Mariposa",
	combinado: "Combinado"
};
const GENDER_LABEL = {
	F: "Femenino",
	M: "Masculino",
	X: "Mixto"
};
/** Clave de la marca personal: estilo + distancia + piscina (25 y 50 m van separadas). */
function bestKey(ev) {
	return `${ev.stroke}-${ev.distance}-${ev.pool}`;
}
//#endregion
//#region src/sports/swimming/bests.ts
/**
* Natación: marcas personales. La marca es el mejor tiempo por estilo + distancia + piscina:
* las de 25 m y 50 m van SEPARADAS (no se convierten). Solo cuentan los tiempos con estado «ok».
*/
/** % de mejora de un tiempo a otro (positivo = bajó), con 2 decimales. */
function improvementPct(from, to) {
	return Math.round((from - to) / from * 1e4) / 100;
}
const valid = (s) => s.status === "ok" && s.time != null && s.time > 0;
/** Marcas personales de un nadador, ordenadas por estilo, piscina y distancia. */
function personalBests(swims) {
	const groups = /* @__PURE__ */ new Map();
	swims.map((s, i) => ({
		s,
		i
	})).filter(({ s }) => valid(s)).sort((a, b) => a.s.date.localeCompare(b.s.date) || a.i - b.i).forEach(({ s }) => {
		const k = bestKey(s);
		groups.set(k, [...groups.get(k) ?? [], s]);
	});
	const out = [];
	groups.forEach((list, key) => {
		const progression = [];
		let best = null;
		list.forEach((s) => {
			if (best && s.time >= best.time) return;
			progression.push({
				date: s.date,
				time: s.time,
				pct: best ? improvementPct(best.time, s.time) : null,
				eventId: s.eventId
			});
			best = s;
		});
		const b = best;
		out.push({
			key,
			distance: b.distance,
			stroke: b.stroke,
			pool: b.pool,
			best: b.time,
			date: b.date,
			swims: list.length,
			first: list[0].time,
			last: list[list.length - 1].time,
			improvementPct: improvementPct(list[0].time, b.time),
			progression
		});
	});
	const strokeOrder = (s) => SWIM_STROKES.indexOf(s);
	return out.sort((a, b) => strokeOrder(a.stroke) - strokeOrder(b.stroke) || a.pool - b.pool || a.distance - b.distance);
}
//#endregion
//#region src/badges/rules/swim.ts
/** Encuentros que dan medallas y puntos: `encuentro` y `torneo`. El `control` solo cuenta para marcas y progreso. */
const isOfficialMeet = (type) => type === "encuentro" || type === "torneo";
/** W1: `ok` con tiempo, encuentro finalizado y el tiempo no lo anotó la cuenta del nadador. */
function isW1(entry, meet, swimmerUser) {
	return entry.status === "ok" && entry.time_cs != null && entry.time_cs > 0 && !!meet?.finalized_at && meet.event_id === entry.event_id && !(swimmerUser && entry.recorded_by === swimmerUser);
}
const swimContext = (events, meets, userOf) => ({
	events: new Map(events.map((e) => [e.id, e])),
	meets: new Map(meets.map((m) => [m.event_id, m])),
	userOf
});
const entryIsW1 = (e, ctx) => isW1(e, ctx.meets.get(e.event_id), ctx.userOf(e.player_id));
/**
* Actividad válida de natación: un resultado `ok`, `dq` o `dnf` (no `dns`) en un encuentro finalizado da el día del
* encuentro. Oficial en `encuentro` y `torneo`.
*/
function swimActivity(entries, ctx) {
	const out = /* @__PURE__ */ new Map();
	for (const e of entries) {
		if (e.status === "dns" || !ctx.meets.get(e.event_id)?.finalized_at) continue;
		const date = ctx.dateOf(e.event_id);
		if (!date) continue;
		const k = `${e.player_id}|${e.event_id}`;
		if (!out.has(k)) out.set(k, {
			sport: "swimming",
			league_id: e.league_id,
			player_id: e.player_id,
			user_id: ctx.userOf(e.player_id),
			date,
			official: isOfficialMeet(ctx.typeOf(e.event_id))
		});
	}
	return [...out.values()];
}
/** Tiempos W1 para las marcas personales (`personalBests`), con la fecha del encuentro. */
function swimsOf(entries, ctx) {
	const out = [];
	for (const e of entries) {
		const ev = ctx.events.get(e.swim_event_id);
		const date = ctx.dateOf(e.event_id);
		if (!ev || !date || !entryIsW1(e, ctx)) continue;
		out.push({
			distance: ev.distance,
			stroke: ev.stroke,
			pool: ev.pool,
			time: e.time_cs,
			status: e.status,
			date,
			eventId: e.event_id,
			entryId: e.id
		});
	}
	return out;
}
/** Los pasos de la progresión de cada prueba, sin el primer tiempo, en orden de fecha. */
function personalBestSteps(swims) {
	const out = [];
	for (const pb of personalBests(swims)) pb.progression.forEach((step, i) => {
		if (i === 0 || step.pct === null) return;
		out.push({
			key: pb.key,
			date: step.date,
			time: step.time,
			pct: step.pct,
			previousDate: pb.progression[i - 1].date,
			eventId: step.eventId
		});
	});
	return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
//#endregion
//#region src/badges/evaluators/kit.ts
/**
* Lo que comparten los evaluadores (docs/insignias.md §3.1): índices de la foto, la cuenta de cada jugador, el
* staff de cada liga, la liga real con memo, la actividad válida de todos los deportes, a quién va cada insignia
* (la cuenta o el jugador sin cuenta, §1.6), el estado con que se da (§3.4) y cómo se arman las decisiones: dar,
* progreso y retirar las provisionales que ya no cumplen. Todo puro: la foto entra, las decisiones salen.
*/
const RACKET_SPORTS = [
	"padel",
	"tennis",
	"pickleball"
];
const TEAM_SPORTS = [
	"basketball",
	"football",
	"futsal"
];
const isRacketSport = (s) => !!s && SPORT_FAMILY[s] === "racket";
const isTeamSport = (s) => s === "basketball" || s === "football" || s === "futsal";
const isObj$4 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const cache = /* @__PURE__ */ new WeakMap();
/** El kit de una foto (se arma una vez por foto, trabajo y hora). */
function kitOf(job, snap, now) {
	let byKey = cache.get(snap);
	if (!byKey) {
		byKey = /* @__PURE__ */ new Map();
		cache.set(snap, byKey);
	}
	const k = `${job.id}|${now}`;
	let kit = byKey.get(k);
	if (!kit) {
		kit = buildKit(job, snap, now);
		byKey.set(k, kit);
	}
	return kit;
}
function buildKit(job, snap, now) {
	const leagues = new Map((snap.leagues ?? []).map((l) => [l.id, l]));
	const players = new Map((snap.players ?? []).map((p) => [p.id, p]));
	const profiles = new Map((snap.profiles ?? []).map((p) => [p.id, p]));
	const events = new Map((snap.events ?? []).map((e) => [e.id, e]));
	const teams = new Map((snap.teams ?? []).map((t) => [t.id, t]));
	const userOf = (p) => players.get(p)?.user_id ?? null;
	const sportOf = (l) => leagues.get(l)?.sport ?? null;
	const tzOf = (l) => leagues.get(l)?.tz || BADGE_TZ;
	const membersBy = /* @__PURE__ */ new Map();
	for (const m of snap.members ?? []) {
		const list = membersBy.get(m.league_id) ?? [];
		list.push(m);
		membersBy.set(m.league_id, list);
	}
	const staffMemo = /* @__PURE__ */ new Map();
	const staff = (l) => {
		let s = staffMemo.get(l);
		if (!s) {
			s = new Set((membersBy.get(l) ?? []).filter((m) => m.role === "owner" || m.role === "admin").map((m) => m.user_id));
			const owner = leagues.get(l)?.owner_id;
			if (owner) s.add(owner);
			staffMemo.set(l, s);
		}
		return s;
	};
	const rosterBy = /* @__PURE__ */ new Map();
	for (const tp of snap.team_players ?? []) {
		const list = rosterBy.get(tp.team_id) ?? [];
		if (!list.includes(tp.player_id)) list.push(tp.player_id);
		rosterBy.set(tp.team_id, list);
	}
	const rosterOf = (t) => rosterBy.get(t) ?? [];
	const matches = appMatches(snap.matches ?? [], snap.match_sides ?? [], snap.match_players ?? []);
	let bowlingMemo = null;
	const bowling = () => {
		if (!bowlingMemo) bowlingMemo = bowlingGames({
			entries: snap.entries ?? [],
			events: snap.events ?? [],
			userOf,
			submissions: snap.submissions ?? [],
			judge: (entry) => {
				const u = userOf(entry.player_id);
				return !!u && isJudge((membersBy.get(entry.league_id) ?? []).find((m) => m.user_id === u));
			}
		});
		return bowlingMemo;
	};
	let actMemo = null;
	const activity = () => {
		if (actMemo) return actMemo;
		const acts = [...snap.activity ?? []];
		const byLeague = /* @__PURE__ */ new Map();
		for (const m of matches) {
			const list = byLeague.get(m.leagueId) ?? [];
			list.push(m);
			byLeague.set(m.leagueId, list);
		}
		for (const [leagueId, list] of byLeague) {
			const sport = sportOf(leagueId);
			if (isRacketSport(sport)) acts.push(...racketActivity(list, {
				now,
				userOf,
				rosterOf,
				sport,
				tz: tzOf(leagueId),
				eventType: (e) => events.get(e)?.type ?? null
			}));
			else if (isTeamSport(sport)) acts.push(...teamActivity(list, {
				now,
				userOf,
				teamPlayers: snap.team_players ?? [],
				sport,
				tz: tzOf(leagueId)
			}));
		}
		acts.push(...bowlingActivity(bowling(), userOf));
		const dateOf = (e) => events.get(e)?.date ?? null;
		acts.push(...golfActivity(snap.golf_cards ?? [], snap.golf_rounds ?? [], {
			userOf,
			dateOf
		}));
		const sctx = swimContext(snap.swim_events ?? [], snap.swim_meets ?? [], userOf);
		acts.push(...swimActivity(snap.swim_entries ?? [], {
			...sctx,
			dateOf,
			typeOf: (e) => events.get(e)?.type ?? null
		}));
		actMemo = dedupeActivity(acts).map((a) => ({
			...a,
			user_id: a.user_id ?? userOf(a.player_id)
		}));
		return actMemo;
	};
	let monthsMemo = null;
	const months = () => {
		if (monthsMemo) return monthsMemo;
		const map = /* @__PURE__ */ new Map();
		for (const r of [...snap.league_months ?? [], ...leagueMonths(activity())]) {
			const k = `${r.league_id}|${r.month}`;
			const row = map.get(k) ?? {
				league_id: r.league_id,
				month: r.month,
				users: /* @__PURE__ */ new Set(),
				players: /* @__PURE__ */ new Set()
			};
			r.users.forEach((u) => row.users.add(u));
			r.players.forEach((p) => row.players.add(p));
			map.set(k, row);
		}
		monthsMemo = [...map.values()].map((r) => ({
			league_id: r.league_id,
			month: r.month,
			users: [...r.users],
			players: [...r.players]
		}));
		return monthsMemo;
	};
	const realMemo = /* @__PURE__ */ new Map();
	const isReal = (leagueId, month, exclude) => {
		const k = `${leagueId}|${month}|${exclude ?? ""}`;
		let v = realMemo.get(k);
		if (v === void 0) {
			const league = leagues.get(leagueId);
			v = !!league && isRealLeagueMonth({
				league,
				months: months(),
				profiles,
				members: snap.members ?? [],
				exclude
			}, month);
			realMemo.set(k, v);
		}
		return v;
	};
	const existing = (holder, key, sport) => {
		const h = holderKey(holder);
		return (snap.awards ?? []).filter((a) => (a.player_id ?? a.user_id) === h && (!key || a.badge_key === key) && (!sport || a.sport === sport));
	};
	const verifiedOnly = (p) => players.get(p)?.verified_only === true;
	return {
		job,
		snap,
		now,
		today: todayIn(now),
		leagues,
		players,
		profiles,
		events,
		teams,
		matches,
		userOf,
		sportOf,
		tzOf,
		staff,
		members: (l) => membersBy.get(l) ?? [],
		rosterOf,
		isReal,
		activity,
		leagueMonths: months,
		bowling,
		existing,
		verifiedOnly
	};
}
/** El id después de un prefijo de `job.ref` ('match:<id>' → '<id>'); null si el ref es de otra cosa. */
function refId(ref, prefix) {
	return ref.startsWith(`${prefix}:`) ? ref.slice(prefix.length + 1) : null;
}
/** Jugadores que manda el trabajo en `payload.players` (un borrado, un vínculo). */
function payloadPlayers(job) {
	const p = job.payload?.players;
	return Array.isArray(p) ? p.filter((x) => typeof x === "string" && !!x) : [];
}
/** Mes 'YYYY-MM' o año 'YYYY' del trabajo, si su ref lo es. */
const jobMonth = (job) => /^\d{4}-\d{2}$/.test(job.ref) ? job.ref : null;
const jobYear = (job) => /^\d{4}$/.test(job.ref) ? Number(job.ref) : null;
/** Días desde una fecha hasta hoy (para las evidencias del historial). */
const ageDays = (kit, date) => daysBetween(date, kit.today);
/**
* Estado con que se da una insignia (§3.4): las de resultado nacen provisionales; las de periodo, de cuenta que se
* acumulan y de eventos cerrados, firmes. En la primera corrida (historial), firme si la evidencia tiene 7+ días.
*/
function statusFor(kit, evidenceDate) {
	const k = kit.job.kind;
	if (k === "resultado" || k === "revisar" || k === "vinculo") return "provisional";
	if (k === "historial") return evidenceDate && ageDays(kit, evidenceDate) >= 7 ? "firme" : "provisional";
	return "firme";
}
const holderKey = (h) => h.player_id ?? h.user_id;
const userHolderOf = (u) => ({
	player_id: null,
	user_id: u,
	league_id: null
});
const playerHolderOf = (p, league) => ({
	player_id: p,
	user_id: null,
	league_id: league
});
/**
* A quién va una insignia de cuenta de un jugador: su cuenta (sumando todos sus jugadores de esos deportes, en
* todas sus ligas), o el jugador en su liga si no tiene cuenta. null si el jugador no está en la foto.
*/
function accountTarget(kit, playerId, sports) {
	const p = kit.players.get(playerId);
	if (!p) return null;
	if (!p.user_id) return {
		holder: playerHolderOf(p.id, p.league_id),
		user: null,
		players: [p.id]
	};
	return {
		holder: userHolderOf(p.user_id),
		user: p.user_id,
		players: accountPlayers(kit, p.user_id, sports)
	};
}
/** Los jugadores de una cuenta (en ligas de esos deportes, si se piden). */
function accountPlayers(kit, userId, sports) {
	const out = [];
	for (const p of kit.players.values()) {
		if (p.user_id !== userId) continue;
		const s = kit.sportOf(p.league_id);
		if (!sports || s && sports.includes(s)) out.push(p.id);
	}
	return out;
}
/** Los dueños de cuenta distintos de unos jugadores. */
function accountTargets(kit, playerIds, sports) {
	const seen = /* @__PURE__ */ new Map();
	for (const p of playerIds) {
		const t = accountTarget(kit, p, sports);
		if (t && !seen.has(holderKey(t.holder))) seen.set(holderKey(t.holder), t);
	}
	return [...seen.values()];
}
/** La cuenta que se excluye de las 4 de la liga real (la del dueño, si es una cuenta). */
const excludeOf = (t) => t.user;
/** ¿La fecha cae en un mes de liga real para ese dueño? */
const realOn = (kit, leagueId, date, t) => kit.isReal(leagueId, monthOf(date), t ? excludeOf(t) : null);
/** Fecha local de un partido en la zona de su liga. */
const matchDay = (kit, m) => dateOfMatch(m, kit.tzOf(m.leagueId));
/** Liga del evento o del partido para `context` (el nombre se copia porque puede cambiar). */
function leagueCtx(kit, leagueId) {
	const l = leagueId ? kit.leagues.get(leagueId) : void 0;
	return l ? { league: {
		id: l.id,
		name: l.name
	} } : {};
}
function eventCtx(kit, eventId) {
	const e = eventId ? kit.events.get(eventId) : void 0;
	return e ? { event: {
		id: e.id,
		name: e.name
	} } : {};
}
function teamCtx(kit, teamId) {
	const t = teamId ? kit.teams.get(teamId) : void 0;
	return t ? { team: {
		id: t.id,
		name: t.name
	} } : teamId ? { team: {
		id: teamId,
		name: ""
	} } : {};
}
function awardOf(def, holder, sport, level, periodKey, status, refs, context = {}) {
	const out = {
		kind: "award",
		...holder,
		badge_key: def.key,
		sport,
		level,
		period_key: periodKey,
		status,
		refs: [...new Set(refs)].slice(0, 20),
		context: {
			v: 1,
			...context
		}
	};
	if (def.privateByDefault) out.hidden = true;
	return out;
}
/**
* Niveles de una insignia de carrera (`gte`) a partir de sus pasos en orden: cada nivel sale del primer paso que
* llega a su umbral (y cumple su requisito). Periodo '-' (una fila por nivel).
*/
function levelAwards(kit, def, holder, sport, variant, steps, opts = {}) {
	const out = [];
	for (const l of def.levels) {
		const step = steps.find((s) => {
			const t = thresholdOf(def, l.level, opts.variantOf?.(s) ?? variant);
			if (t === void 0 || s.n < t) return false;
			return !l.req || !opts.req || opts.req(l.level, s, l.req);
		});
		if (!step) continue;
		const t = thresholdOf(def, l.level, opts.variantOf?.(step) ?? variant);
		out.push(awardOf(def, holder, sport, l.level, "-", statusFor(kit, step.date), [step.ref], {
			...opts.context,
			values: {
				n: opts.actual ? step.n : t,
				...step.values
			}
		}));
	}
	return out;
}
/** Progreso hacia el siguiente nivel (null en `next_level` borra la fila: ya tiene el más alto). */
function progressOf(def, holder, sport, variant, value) {
	const next = nextLevel(def, value, variant);
	return {
		kind: "progress",
		...holder,
		badge_key: def.key,
		sport,
		value,
		target: next?.target ?? value,
		next_level: next?.level ?? null
	};
}
/** Variantes de una fila de baloncesto 3x3. */
const V3X3 = ["basketball3x3", "basketball"];
/**
* Retira (`evidencia`) las provisionales o en revisión de ese alcance que esta corrida ya no da: al revisar un
* resultado, una insignia que dependía de él y ya no cumple se va sola. Las firmes no se tocan (§3.4).
*/
function revokeStale(kit, produced, scope) {
	const given = new Set(produced.filter((d) => d.kind === "award").map((d) => `${holderKey(d)}|${d.badge_key}|${d.sport}|${d.level}|${d.period_key}`));
	const holders = new Set(scope.holders.map(holderKey));
	const keys = new Set(scope.keys);
	const out = [];
	for (const a of kit.snap.awards ?? []) {
		const h = a.player_id ?? a.user_id;
		if (!h || !holders.has(h) || !keys.has(a.badge_key) || scope.sport && a.sport !== scope.sport) continue;
		if (a.status !== "provisional" && a.status !== "en_revision") continue;
		if (scope.period && !scope.period(a.period_key)) continue;
		if (given.has(`${h}|${a.badge_key}|${a.sport}|${a.level}|${a.period_key}`)) continue;
		out.push({
			kind: "revoke",
			player_id: a.player_id,
			user_id: a.user_id,
			league_id: a.league_id,
			badge_key: a.badge_key,
			sport: a.sport,
			level: a.level,
			period_key: a.period_key,
			reason: "evidencia"
		});
	}
	return out;
}
/**
* Dueños que ya tienen filas de un periodo (p. ej. las marcas de un partido): al revisarlo también se revisan los
* que ya no salen en él (un jugador que se quitó de la alineación).
*/
function periodHolders(kit, periodKey) {
	return (kit.snap.awards ?? []).filter((a) => a.period_key === periodKey).map((a) => ({
		player_id: a.player_id,
		user_id: a.user_id,
		league_id: a.league_id
	}));
}
/** Reglas de la liga o del partido como objeto (`rules.match`, `rules.table`…). */
function rulesPart(rules, part) {
	return isObj$4(rules) && isObj$4(rules[part]) ? rules[part] : {};
}
const round1 = (x) => Math.round(x * 10) / 10;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
/** Agrupa una lista por una clave, conservando el orden. */
function groupBy(list, key) {
	const out = /* @__PURE__ */ new Map();
	for (const x of list) {
		const k = key(x);
		const arr = out.get(k);
		if (arr) arr.push(x);
		else out.set(k, [x]);
	}
	return out;
}
/** Fecha local ('YYYY-MM-DD') de una hora de la base en la zona de una liga. */
const dayIn = (kit, iso, leagueId) => localDate(iso, kit.tzOf(leagueId));
//#endregion
//#region src/badges/evaluators/series.ts
/**
* Ayudas de los evaluadores de series (boliche, golf y natación) sobre el kit común (kit.ts): a quién evalúa el
* trabajo, el primer resultado que llega a cada nivel (con lo extra que pide el nivel: B2, G2), el progreso hacia un
* nivel que todavía no tiene, las hazañas que piden aval (§1.7.5) y el retiro de lo que ya no cumple, incluidas las
* que esperan aval.
*/
function parseRef(ref) {
	if (typeof ref !== "string") return null;
	const i = ref.indexOf(":");
	return i > 0 && i < ref.length - 1 ? {
		type: ref.slice(0, i),
		id: ref.slice(i + 1)
	} : null;
}
/** `job.ref` y `payload.refs` (un borrado o un cambio que toca varias filas: 'entry:<id>', 'card:<id>'…). */
function jobRefs(job) {
	const extra = Array.isArray(job.payload?.refs) ? job.payload.refs : [];
	return [job.ref, ...extra].map(parseRef).filter((r) => !!r);
}
/** Ids de las referencias de un tipo. */
const refIds = (job, ...types) => jobRefs(job).filter((r) => types.includes(r.type)).map((r) => r.id);
/** Eventos del trabajo: 'event:', 'meet:', 'round:' y las rondas de un torneo de golf 'gt:'. */
function jobEvents(kit) {
	const out = new Set(refIds(kit.job, "event", "meet", "round"));
	for (const t of refIds(kit.job, "gt")) for (const r of kit.snap.golf_rounds ?? []) if (r.tournament_id === t) out.add(r.event_id);
	return out;
}
/**
* Jugadores que evalúa el trabajo: `snapshot.targets` si viene; si no, los de `payload.players`, los de la cuenta del
* trabajo (`job.user_id`), todos los de la liga en el historial y los dueños de lo que dicen las referencias
* (`entry:`, `card:`, `swim:`, `player:` y todos los de un `event:`, `meet:`, `round:` o `gt:`). De ellos viene el
* historial completo en la foto.
*/
function targetIds(kit) {
	const { job, snap } = kit;
	if (snap.targets) return [...new Set(snap.targets)];
	const ids = new Set(payloadPlayers(job));
	const players = snap.players ?? [];
	if (job.kind === "historial" && job.league_id) {
		for (const p of players) if (p.league_id === job.league_id) ids.add(p.id);
	}
	if (job.user_id) {
		for (const p of players) if (p.user_id === job.user_id) ids.add(p.id);
	}
	for (const id of refIds(job, "player")) ids.add(id);
	const entries = new Set(refIds(job, "entry").map((id) => id.split(":")[0]));
	const cards = new Set(refIds(job, "card"));
	const swims = new Set(refIds(job, "swim"));
	const events = jobEvents(kit);
	for (const e of snap.entries ?? []) if (entries.has(e.id) || events.has(e.event_id)) ids.add(e.player_id);
	for (const c of snap.golf_cards ?? []) if (cards.has(c.id) || events.has(c.event_id)) ids.add(c.player_id);
	for (const s of snap.swim_entries ?? []) if (swims.has(s.id) || events.has(s.event_id)) ids.add(s.player_id);
	return [...ids];
}
/** Jugadores del trabajo en ligas de un deporte. */
function targetPlayers(kit, sport) {
	const out = [];
	for (const id of targetIds(kit)) {
		const p = kit.players.get(id);
		if (p && kit.sportOf(p.league_id) === sport) out.push(p);
	}
	return out;
}
/** Dueños de las insignias de cuenta del trabajo en un deporte (la cuenta con todos sus jugadores, o el jugador). */
const targetAccounts = (kit, sport) => accountTargets(kit, targetPlayers(kit, sport).map((p) => p.id), [sport]);
/**
* Recorre en orden y se queda con el primero que llega a cada nivel (un mismo elemento puede dar varios). `ok` pide
* lo extra del nivel (p. ej. `strict`: B2 o G2). `variant` puede depender del elemento (9 hoyos).
*/
function milestones(def, items, valueOf, opts = {}) {
	const got = /* @__PURE__ */ new Map();
	for (const t of items) {
		const v = valueOf(t);
		if (v == null || !Number.isFinite(v)) continue;
		const variant = typeof opts.variant === "function" ? opts.variant(t) : opts.variant;
		for (const level of levelsReached(def, v, variant)) {
			if (got.has(level)) continue;
			if (opts.ok && !opts.ok(t, levelDef(def, level))) continue;
			got.set(level, t);
		}
		if (got.size === def.levels.length) break;
	}
	return [...got].map(([level, item]) => ({
		level,
		item
	})).sort((a, b) => a.level - b.level);
}
/** Las filas de carrera (periodo '-') de unos hitos. */
function careerAwards(kit, def, holder, sport, hits, proof) {
	return hits.map(({ level, item }) => {
		const p = proof(item, level);
		return awardOf(def, holder, sport, level, "-", statusFor(kit, p.date), p.refs, {
			...p.context,
			values: p.values
		});
	});
}
/** Niveles que el dueño ya tiene activos (provisional, firme o en revisión). */
function heldLevels(kit, holder, key, sport) {
	return new Set(kit.existing(holder, key, sport).filter((a) => a.status !== "revocada").map((a) => a.level));
}
/**
* Progreso hacia el primer nivel que no tiene (ni gana en esta corrida). `value` puede depender del nivel (lo que
* vale para ese nivel: los estrictos solo cuentan lo verificado). Sin nivel que falte, `next_level = null` (borra).
*/
function progressFor(kit, def, holder, sport, value, opts = {}) {
	const held = heldLevels(kit, holder, def.key, sport);
	for (const g of opts.gained ?? []) held.add(g.level);
	const base = {
		kind: "progress",
		...holder,
		badge_key: def.key,
		sport
	};
	for (const l of def.levels) {
		if (held.has(l.level)) continue;
		const target = thresholdOf(def, l.level, opts.variant ?? sport);
		if (target === void 0) break;
		const v = typeof value === "function" ? value(l) : value;
		return {
			...base,
			value: round2(v),
			target,
			next_level: l.level
		};
	}
	return {
		...base,
		value: round2(typeof value === "number" ? value : 0),
		target: 0,
		next_level: null
	};
}
const round2 = (x) => Math.round(x * 100) / 100;
/**
* Quién puede avalar una hazaña (§1.7.5): owners y admins de la liga (y su dueño) que no sean el jugador ni compitan
* en el mismo evento (su grupo o su tanda). Sin cuentas bloqueadas. Vacío = va a la cola del superadmin.
*/
function reviewersFor(kit, leagueId, exclude) {
	const skip = new Set([...exclude].filter((u) => !!u));
	return [...kit.staff(leagueId)].filter((u) => !skip.has(u) && !kit.profiles.get(u)?.blocked_at).sort();
}
function reviewOf(def, holder, sport, level, periodKey, refs, context, reviewers) {
	return {
		kind: "review",
		...holder,
		badge_key: def.key,
		sport,
		level,
		period_key: periodKey,
		refs: [...new Set(refs)],
		context: {
			v: 1,
			...context
		},
		reviewers
	};
}
/**
* Retira (`evidencia`) lo provisional o en revisión de un alcance que esta corrida ya no da ni manda a aval. Sin
* `holders`, vale cualquier dueño (lo de un juego o una tarjeta borrados, que se reconoce por el periodo).
*/
function staleRevokes(kit, produced, scope) {
	const key = (h, k, s, l, p) => `${h}|${k}|${s}|${l}|${p}`;
	const given = new Set(produced.filter((d) => d.kind === "award" || d.kind === "review").map((d) => key(holderKey(d), d.badge_key, d.sport, d.level, d.period_key)));
	const holders = scope.holders ? new Set(scope.holders.map(holderKey)) : null;
	const keys = new Set(scope.keys);
	const out = [];
	for (const a of kit.snap.awards ?? []) {
		const h = a.player_id ?? a.user_id;
		if (!h || holders && !holders.has(h) || !keys.has(a.badge_key) || a.sport !== scope.sport) continue;
		if (a.status !== "provisional" && a.status !== "en_revision") continue;
		if (scope.period && !scope.period(a.period_key)) continue;
		if (given.has(key(h, a.badge_key, a.sport, a.level, a.period_key))) continue;
		out.push({
			kind: "revoke",
			player_id: a.player_id,
			user_id: a.user_id,
			league_id: a.league_id,
			badge_key: a.badge_key,
			sport: a.sport,
			level: a.level,
			period_key: a.period_key,
			reason: "evidencia"
		});
	}
	return out;
}
/** Carrera: todo lo de las keys de cuenta del dueño (periodo '-'). */
const always = (p) => p === "-";
//#endregion
//#region src/badges/evaluators/bowling.ts
/**
* Evaluadores de boliche (docs/insignias.md §2.1 y §2.2): el debut, las de carrera de la cuenta (`bowling_career`,
* `climbing`), las marcas de un juego que van al jugador en su liga (`bowling_game`) y lo de un torneo cerrado
* (`bowling_event` y la parte de boliche de `event_podium`). Los juegos son los B1 del kit (con juez y parte) y las
* tablas del torneo salen de los helpers de la app (`entryLine`, `individualValue`, `teamLines`, `category`) con
* solo esos juegos.
*
* Trabajos: `resultado`/`revisar` con 'entry:<id>' (y `payload.refs`/`payload.players` si se borró), `vinculo`,
* `evento` con 'event:<id>' (a `events.date` + 3 días) e `historial`. Lo que necesita de la foto:
* - `players` de los jugadores del trabajo, de todos los jugadores de boliche de sus cuentas y de los demás que
*   jugaron esos eventos; `leagues` de todos ellos;
* - `entries` con el historial completo de boliche de esas cuentas (y del jugador sin cuenta) y todas las del evento
*   del trabajo; en un `evento`, de cada competidor sus últimos 30 juegos antes de la fecha (línea base);
* - `events` de esas participaciones, `teams` del torneo, `submissions` aprobadas de esos jugadores (juez y parte);
* - `members` owner, admin y anotadores de esas ligas; `profiles` y `league_months` para la liga real;
* - `awards` (incluidas las revocadas) y `progress` de la cuenta y de cada jugador del trabajo.
*/
const def$9 = (key) => badgeDef(key);
const DEBUT$2 = def$9("debut");
const CLIMBING$1 = def$9("climbing");
const PODIUM$1 = def$9("event_podium");
const GAMES = def$9("bowling_games");
const BREAKTHROUGH = def$9("bowling_breakthrough");
const CLUB = def$9("bowling_club");
const SERIES = def$9("bowling_series");
const OVER_AVERAGE = def$9("bowling_over_average");
const STRIKES = def$9("bowling_strike_streak");
const PERFECT = def$9("bowling_perfect_game");
const CLEAN = def$9("bowling_clean_game");
const SPLIT = def$9("bowling_split");
const SEVEN_TEN = def$9("bowling_seven_ten");
const CATEGORY_WIN = def$9("bowling_category_win");
const TEAM_WIN = def$9("bowling_team_win");
const CAREER_KEYS$2 = badgesOfEvaluator("bowling_career").map((d) => d.key);
const GAME_KEYS = badgesOfEvaluator("bowling_game").map((d) => d.key);
const EVENT_KEYS = badgesOfEvaluator("bowling_event").map((d) => d.key);
/**
* Juegos B1 que suman para una insignia de cuenta: de sus jugadores, en ligas reales ese mes (sin contar a la propia
* cuenta entre las 4) y, de un jugador que se reclamó a sí mismo, solo los verificados (B2).
*/
function accountGames(kit, t) {
	const mine = new Set(t.players);
	return kit.bowling().filter((g) => mine.has(g.player_id) && realOn(kit, g.league_id, g.date, t) && (!kit.verifiedOnly(g.player_id) || g.verified));
}
/** Todos los juegos B1 de unos jugadores (la línea base no mira la liga real). En orden de juego. */
const ownGames = (kit, players) => {
	const mine = new Set(players);
	return kit.bowling().filter((g) => mine.has(g.player_id));
};
/** Los jugadores de boliche de la cuenta de un jugador (o él solo, sin cuenta). */
function accountPlayersOf$1(kit, playerId) {
	const u = kit.userOf(playerId);
	if (!u) return [playerId];
	return [...kit.players.values()].filter((p) => p.user_id === u && kit.sportOf(p.league_id) === "bowling").map((p) => p.id);
}
/**
* Línea base de boliche (§1.7.6) de cada fecha: piso de la media de los últimos 30 juegos antes de ese día, con 12 o
* más. Lo mismo que `bowlingBaseline` (baselines.ts), pero sin volver a ordenar para cada juego.
*/
function baselineAt(games, opts = {}) {
	const window = opts.window ?? 30;
	const min = opts.min ?? 12;
	const memo = /* @__PURE__ */ new Map();
	return (date) => {
		let r = memo.get(date);
		if (r !== void 0) return r;
		let lo = 0;
		let hi = games.length;
		while (lo < hi) {
			const mid = lo + hi >> 1;
			if (games[mid].date < date) lo = mid + 1;
			else hi = mid;
		}
		const prior = games.slice(Math.max(0, lo - window), lo);
		r = prior.length < min ? null : {
			base: Math.floor(prior.reduce((n, g) => n + g.score, 0) / prior.length),
			games: prior.length
		};
		memo.set(date, r);
		return r;
	};
}
/** Evidencia de un juego: su fecha, su ref y la liga y el evento. */
const gameProof = (kit, g, values, more = []) => ({
	date: [g, ...more].reduce((d, x) => x.date > d ? x.date : d, g.date),
	refs: [g, ...more].map(gameRef),
	values,
	context: {
		...leagueCtx(kit, g.league_id),
		...eventCtx(kit, g.event_id)
	}
});
const best = (xs) => xs.length ? Math.max(...xs) : 0;
const bowlingDebut = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const t of targetAccounts(kit, "bowling")) {
		const first = accountGames(kit, t)[0];
		const produced = first ? careerAwards(kit, DEBUT$2, t.holder, "bowling", [{
			level: 0,
			item: first
		}], (g) => gameProof(kit, g, {})) : [];
		out.push(...produced, ...staleRevokes(kit, produced, {
			holders: [t.holder],
			keys: [DEBUT$2.key],
			sport: "bowling",
			period: always
		}));
	}
	return out;
};
function seriesOf(games) {
	const out = [];
	for (const list of groupBy(games, (g) => g.entry_id).values()) {
		const run = [...list].sort((a, b) => a.index - b.index);
		for (let i = 0; i + 3 <= run.length; i++) {
			const three = run.slice(i, i + 3);
			out.push({
				games: three,
				sum: three.reduce((n, g) => n + g.score, 0),
				verified: three.every((g) => g.verified)
			});
		}
	}
	const order = new Map(games.map((g, i) => [gameRef(g), i]));
	return out.sort((a, b) => order.get(gameRef(a.games[2])) - order.get(gameRef(b.games[2])));
}
/** Todas las de carrera de boliche de un dueño con sus juegos (ya en orden y en ligas reales). */
function bowlingCareerFor(kit, holder, games, baseGames) {
	const out = [];
	const strictOk = (verified) => (l) => !l.strict || verified;
	const capped = capPerDay(games, (g) => g.date, paramOf(GAMES, "maxPerDay", "bowling") ?? CAPS.bowlingGamesPerDay);
	const counted = capped.map((g, i) => ({
		g,
		n: i + 1
	}));
	const gamesHits = milestones(GAMES, counted, (c) => c.n, { variant: "bowling" });
	out.push(...careerAwards(kit, GAMES, holder, "bowling", gamesHits, (c, level) => gameProof(kit, c.g, { n: thresholdOf(GAMES, level, "bowling") })));
	out.push(progressFor(kit, GAMES, holder, "bowling", capped.length, { gained: gamesHits }));
	const breakHits = milestones(BREAKTHROUGH, games, (g) => g.score, { variant: "bowling" });
	out.push(...careerAwards(kit, BREAKTHROUGH, holder, "bowling", breakHits, (g, level) => gameProof(kit, g, { n: thresholdOf(BREAKTHROUGH, level, "bowling") })));
	out.push(progressFor(kit, BREAKTHROUGH, holder, "bowling", best(games.map((g) => g.score)), { gained: breakHits }));
	const clubHits = milestones(CLUB, games, (g) => g.score, {
		variant: "bowling",
		ok: (g, l) => strictOk(g.verified)(l)
	});
	out.push(...careerAwards(kit, CLUB, holder, "bowling", clubHits, (g, level) => gameProof(kit, g, { n: thresholdOf(CLUB, level, "bowling") })));
	out.push(progressFor(kit, CLUB, holder, "bowling", (l) => best(games.filter((g) => strictOk(g.verified)(l)).map((g) => g.score)), { gained: clubHits }));
	const series = seriesOf(games);
	const seriesHits = milestones(SERIES, series, (s) => s.sum, {
		variant: "bowling",
		ok: (s, l) => strictOk(s.verified)(l)
	});
	out.push(...careerAwards(kit, SERIES, holder, "bowling", seriesHits, (s) => gameProof(kit, s.games[2], { n: s.sum }, [s.games[0], s.games[1]])));
	out.push(progressFor(kit, SERIES, holder, "bowling", (l) => best(series.filter((s) => strictOk(s.verified)(l)).map((s) => s.sum)), { gained: seriesHits }));
	const base = baselineAt(baseGames, {
		window: paramOf(OVER_AVERAGE, "baseWindow", "bowling"),
		min: paramOf(OVER_AVERAGE, "minBaseGames", "bowling")
	});
	const overs = games.flatMap((g) => {
		const b = base(g.date);
		return b ? [{
			g,
			diff: g.score - b.base
		}] : [];
	});
	const overHits = milestones(OVER_AVERAGE, overs, (o) => o.diff, {
		variant: "bowling",
		ok: (o, l) => strictOk(o.g.verified)(l)
	});
	out.push(...careerAwards(kit, OVER_AVERAGE, holder, "bowling", overHits, (o) => gameProof(kit, o.g, { n: o.diff })));
	out.push(progressFor(kit, OVER_AVERAGE, holder, "bowling", (l) => Math.max(0, best(overs.filter((o) => strictOk(o.g.verified)(l)).map((o) => o.diff))), { gained: overHits }));
	const runs = games.flatMap((g) => g.frames ? [{
		g,
		run: longestStrikeRun(g.frames.rolls)
	}] : []);
	const runHits = milestones(STRIKES, runs, (r) => r.run, {
		variant: "bowling",
		ok: (r, l) => strictOk(r.g.verified)(l)
	});
	out.push(...careerAwards(kit, STRIKES, holder, "bowling", runHits, (r) => gameProof(kit, r.g, { n: r.run })));
	out.push(progressFor(kit, STRIKES, holder, "bowling", (l) => best(runs.filter((r) => strictOk(r.g.verified)(l)).map((r) => r.run)), { gained: runHits }));
	return out;
}
const bowlingCareer = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const t of targetAccounts(kit, "bowling")) {
		const produced = bowlingCareerFor(kit, t.holder, accountGames(kit, t), ownGames(kit, t.players));
		out.push(...produced, ...staleRevokes(kit, produced, {
			holders: [t.holder],
			keys: CAREER_KEYS$2,
			sport: "bowling",
			period: always
		}));
	}
	return out;
};
/**
* Subiendo (boliche): media de los últimos 18 juegos menos la de los primeros 18, con 36 o más. Se mide después de
* cada juego y un nivel alcanzado se queda aunque la media baje después.
*/
const bowlingClimbing = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const window = paramOf(CLIMBING$1, "window", "bowling") ?? 18;
	const min = Math.max(paramOf(CLIMBING$1, "minCount", "bowling") ?? 36, window * 2);
	const out = [];
	for (const t of targetAccounts(kit, "bowling")) {
		const games = accountGames(kit, t);
		const steps = [];
		if (games.length >= min) {
			const first = games.slice(0, window).reduce((n, g) => n + g.score, 0) / window;
			let last = games.slice(min - window, min).reduce((n, g) => n + g.score, 0);
			for (let k = min; k <= games.length; k++) {
				if (k > min) last += games[k - 1].score - games[k - 1 - window].score;
				steps.push({
					g: games[k - 1],
					gain: last / window - first
				});
			}
		}
		const hits = milestones(CLIMBING$1, steps, (s) => s.gain, { variant: "bowling" });
		const produced = careerAwards(kit, CLIMBING$1, t.holder, "bowling", hits, (s) => gameProof(kit, s.g, { n: Math.floor(s.gain) }));
		produced.push(progressFor(kit, CLIMBING$1, t.holder, "bowling", Math.max(0, Math.floor(best(steps.map((s) => s.gain)))), { gained: hits }));
		out.push(...produced, ...staleRevokes(kit, produced, {
			holders: [t.holder],
			keys: [CLIMBING$1.key],
			sport: "bowling",
			period: always
		}));
	}
	return out;
};
/** La id de una participación en un ref 'entry:<id>' o 'entry:<id>:<g>'. */
const entryIdOf = (id) => id.split(":")[0];
/** Las marcas de un juego que van al jugador en su liga (período `g:<entry>:<i>`). */
function gameDecisions(kit, entry, games) {
	const out = [];
	const holder = playerHolderOf(entry.player_id, entry.league_id);
	const rivals = (kit.snap.entries ?? []).filter((e) => e.event_id === entry.event_id).map((e) => kit.userOf(e.player_id));
	const reviewers = () => reviewersFor(kit, entry.league_id, [kit.userOf(entry.player_id), ...rivals]);
	for (const g of games) {
		if (!realOn(kit, g.league_id, g.date)) continue;
		const period = periodKey.game(entry.id, g.index);
		const context = {
			...leagueCtx(kit, g.league_id),
			...eventCtx(kit, g.event_id)
		};
		const status = statusFor(kit, g.date);
		const refs = [gameRef(g)];
		const values = {
			n: g.score,
			juego: g.index + 1
		};
		const raw = entry.frames?.[String(g.index)];
		if (g.score === 300 && g.verified && (!raw || g.frames && longestStrikeRun(g.frames.rolls) >= 12)) out.push(reviewOf(PERFECT, holder, "bowling", 0, period, refs, {
			...context,
			values
		}, reviewers()));
		if (!g.frames) continue;
		if (frameStats(g.frames.rolls).opens === 0) out.push(awardOf(CLEAN, holder, "bowling", 0, period, status, refs, {
			...context,
			values
		}));
		if (!g.masks) continue;
		const { splits, sevenTen } = splitConversions(g.frames);
		if (splits.length) out.push(awardOf(SPLIT, holder, "bowling", 0, period, status, refs, {
			...context,
			values: {
				...values,
				splits: splits.length
			}
		}));
		if (sevenTen.length && g.verified) out.push(reviewOf(SEVEN_TEN, holder, "bowling", 0, period, refs, {
			...context,
			values
		}, reviewers()));
	}
	return out;
}
const bowlingGame = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const historial = job.kind === "historial";
	const targets = new Set(targetPlayers(kit, "bowling").map((p) => p.id));
	const refEntries = new Set(refIds(job, "entry").map(entryIdOf));
	const events = jobEvents(kit);
	const byEntry = groupBy(kit.bowling(), (g) => g.entry_id);
	const out = [];
	const scopes = [];
	const seen = /* @__PURE__ */ new Set();
	for (const e of snap.entries ?? []) {
		if (!targets.has(e.player_id) || !(historial || refEntries.has(e.id) || events.has(e.event_id))) continue;
		seen.add(e.id);
		out.push(...gameDecisions(kit, e, byEntry.get(e.id) ?? []));
		scopes.push({
			holders: [playerHolderOf(e.player_id, e.league_id)],
			keys: GAME_KEYS,
			sport: "bowling",
			period: (p) => p.startsWith(`g:${e.id}:`)
		});
	}
	for (const id of refEntries) if (!seen.has(id)) scopes.push({
		keys: GAME_KEYS,
		sport: "bowling",
		period: (p) => p.startsWith(`g:${id}:`)
	});
	if (historial) for (const p of targets) scopes.push({
		holders: [playerHolderOf(p, kit.players.get(p).league_id)],
		keys: GAME_KEYS,
		sport: "bowling",
		period: (k) => k.startsWith("g:")
	});
	for (const s of scopes) out.push(...staleRevokes(kit, out, s));
	return out;
};
const tables = /* @__PURE__ */ new WeakMap();
/**
* La tabla de un torneo con los juegos B1 (los que no cuentan quedan fuera). Si la liga pide foto, solo entran los
* jugadores con todos sus juegos B2.
*/
function eventTable(kit, ev) {
	let byEvent = tables.get(kit);
	if (!byEvent) {
		byEvent = /* @__PURE__ */ new Map();
		tables.set(kit, byEvent);
	}
	const hit = byEvent.get(ev.id);
	if (hit) return hit;
	const event = toEvent(ev, kit.snap.teams ?? []);
	const requirePhoto = !!kit.leagues.get(ev.league_id)?.require_photo;
	const b1 = groupBy(kit.bowling().filter((g) => g.event_id === ev.id), (g) => g.entry_id);
	const lines = [];
	for (const row of kit.snap.entries ?? []) {
		if (row.event_id !== ev.id) continue;
		const games = b1.get(row.id) ?? [];
		if (!games.length || requirePhoto && !games.every((g) => g.verified)) continue;
		const idx = new Set(games.map((g) => g.index));
		const entry = toEntry(row);
		const line = entryLine({
			...entry,
			scores: entry.scores.map((s, i) => idx.has(i) ? s : null),
			photos: entry.photos.map((p, i) => idx.has(i) ? p : null)
		}, event);
		if (line.games > 0) lines.push(line);
	}
	const table = {
		event,
		lines,
		value: individualValue(event)
	};
	byEvent.set(ev.id, table);
	return table;
}
/**
* Torneos de boliche del trabajo: el del ref, o en el historial de una liga todos los suyos que ya pasaron su gracia
* (3 días). El historial de una cuenta (sin liga) no da títulos de eventos: los da el de la liga, con la liga entera.
*/
function scopedEvents(kit) {
	const graceDays = Math.ceil((paramOf(PODIUM$1, "graceHours", "bowling") ?? 72) / 24);
	const refs = jobEvents(kit);
	const historial = kit.job.kind === "historial";
	return [...kit.events.values()].filter((e) => e.type === "torneo" && kit.sportOf(e.league_id) === "bowling" && (historial ? !!kit.job.league_id && e.league_id === kit.job.league_id && addDays(e.date, graceDays) <= kit.today : refs.has(e.id)));
}
const eventContext = (kit, ev) => ({
	...leagueCtx(kit, ev.league_id),
	...eventCtx(kit, ev.id)
});
/** Podio de un torneo de boliche (§2.1): liga `kind='liga'`, 6+ jugadores con juegos B1; tamaño por §1.7.8. */
function bowlingPodiumFor(kit, ev) {
	const league = kit.leagues.get(ev.league_id);
	if (!league || league.kind !== "liga" || !realOn(kit, ev.league_id, ev.date)) return [];
	const { lines, value } = eventTable(kit, ev);
	if (lines.length < (paramOf(PODIUM$1, "minPlayers", "bowling") ?? 6)) return [];
	return podiumAwards(lines, (a, b) => value(b) - value(a), podiumLevels(lines.length)).map(({ row, place, level }) => awardOf(PODIUM$1, playerHolderOf(row.entry.playerId, ev.league_id), "bowling", level, periodKey.event(ev.id), "firme", [`entry:${row.entry.id}`], {
		...eventContext(kit, ev),
		values: {
			n: place,
			of: lines.length,
			value: value(row)
		}
	}));
}
/**
* Mejor de su categoría (§2.2): categoría por el promedio de entrada (`category_cuts`), salvo que esté más de 15
* pinos por debajo de su línea base (anti-sandbagging); 4+ jugadores con juegos B1 en la categoría.
*/
function categoryWinFor(kit, ev) {
	if (!realOn(kit, ev.league_id, ev.date)) return [];
	const { event, lines, value } = eventTable(kit, ev);
	const sandbag = paramOf(CATEGORY_WIN, "sandbagPins", "bowling") ?? 15;
	const min = paramOf(CATEGORY_WIN, "minInCategory", "bowling") ?? 4;
	const cuts = event.categoryCuts ?? DEFAULT_CUTS;
	const byCat = groupBy(lines, (l) => {
		const b = baselineAt(ownGames(kit, accountPlayersOf$1(kit, l.entry.playerId)))(ev.date);
		return category(b && l.entry.average < b.base - sandbag ? b.base : l.entry.average, cuts);
	});
	const out = [];
	for (const [cat, group] of byCat) {
		if (group.length < min) continue;
		for (const row of topWithTies(group, (a, b) => value(b) - value(a)).winners) out.push(awardOf(CATEGORY_WIN, playerHolderOf(row.entry.playerId, ev.league_id), "bowling", 0, periodKey.event(ev.id), "firme", [`entry:${row.entry.id}`], {
			...eventContext(kit, ev),
			values: {
				categoria: cat,
				n: value(row),
				of: group.length
			}
		}));
	}
	return out;
}
/** Título por equipos (§2.2): 3+ equipos con 2+ jugadores con juegos B1; va a los miembros que jugaron. */
function teamWinFor(kit, ev) {
	if (!realOn(kit, ev.league_id, ev.date)) return [];
	const { event, lines } = eventTable(kit, ev);
	const teams = teamLines(event, lines).filter((t) => t.members.length >= (paramOf(TEAM_WIN, "minMembers", "bowling") ?? 2));
	if (teams.length < (paramOf(TEAM_WIN, "minTeams", "bowling") ?? 3)) return [];
	const v = teamValue(event);
	const out = [];
	for (const team of topWithTies(teams, (a, b) => v(b) - v(a)).winners) for (const m of team.members) out.push(awardOf(TEAM_WIN, playerHolderOf(m.entry.playerId, ev.league_id), "bowling", 0, periodKey.event(ev.id), "firme", [`entry:${m.entry.id}`], {
		...eventContext(kit, ev),
		team: {
			id: team.teamId,
			name: team.name
		},
		values: {
			n: v(team),
			of: teams.length
		}
	}));
	return out;
}
const bowlingPodium = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const ev of scopedEvents(kit)) {
		const produced = bowlingPodiumFor(kit, ev);
		out.push(...produced, ...staleRevokes(kit, produced, {
			keys: [PODIUM$1.key],
			sport: "bowling",
			period: (p) => p === periodKey.event(ev.id)
		}));
	}
	return out;
};
const bowlingEvent = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const ev of scopedEvents(kit)) {
		const produced = [...categoryWinFor(kit, ev), ...teamWinFor(kit, ev)];
		out.push(...produced, ...staleRevokes(kit, produced, {
			keys: EVENT_KEYS,
			sport: "bowling",
			period: (p) => p === periodKey.event(ev.id)
		}));
	}
	return out;
};
const BOWLING_EVALUATORS = {
	debut: bowlingDebut,
	climbing: bowlingClimbing,
	event_podium: bowlingPodium,
	bowling_career: bowlingCareer,
	bowling_game: bowlingGame,
	bowling_event: bowlingEvent
};
//#endregion
//#region src/sports/team/standings.ts
/**
* Tablas de posiciones de baloncesto (FIBA) y fútbol/sala, con los desempates recursivos de
* src/sports/formats/standings.ts (`resolveTies`) y la regla que decidió cada puesto en `decidedBy`.
*
* Baloncesto (Reglamento FIBA 2024, Art. 20, Art. 21 y Apéndice D):
* - Ganar 2, perder 1, perder por forfeit 0 (el forfeit se anota 20-0).
* - Default (Art. 21.2): si el ganador iba arriba se queda el marcador, si no, 2-0; y el que se quedó sin
*   jugadores "recibe 1 punto de clasificación" (como una derrota normal), no 0 como en el forfeit.
*   Fuente: FIBA Official Basketball Rules 2024, Art. 21.2.1 y Apéndice D.1.1 (1 punto por partido perdido,
*   "incluido el perdido por default", y 0 por el perdido por forfeit).
* - Desempate (D.1): puntos de tabla entre los empatados → diferencia entre ellos → puntos a favor entre ellos
*   → diferencia general → puntos a favor generales. Si quedan menos empatados (por el criterio que sea),
*   se vuelve a empezar con ellos (si quedan 2, decide el partido entre ellos).
*
* Fútbol y sala: ganar 3, empatar 1, perder 0; W.O. 3-0. Los penales no cuentan para goles ni puntos
* (salvo que la liga dé puntos por la tanda). Desempates configurables; por defecto:
* diferencia de goles → goles a favor → enfrentamiento directo → juego limpio → sorteo.
* Estilo FIFA/UEFA: solo se vuelve a empezar cuando separa un criterio entre empatados (minitabla).
* Juego limpio FIFA, por jugador y partido: amarilla −1, doble amarilla −3, roja directa −4, amarilla + roja −5.
*/
const other = (s) => s === 1 ? 2 : 1;
const oriented = (winner, n) => winner === 1 ? [n, 0] : [0, n];
/** Filas sin ordenar para `ids` con esos partidos. Sirve para la tabla completa y para la minitabla. */
function rowsOf(ids, games, extraKeys) {
	const rows = /* @__PURE__ */ new Map();
	const row = (id) => {
		let r = rows.get(id);
		if (!r) {
			r = {
				id,
				played: 0,
				won: 0,
				drawn: 0,
				lost: 0,
				points: 0,
				for: 0,
				against: 0,
				diff: 0,
				extra: Object.fromEntries(extraKeys.map((k) => [k, 0])),
				rank: 0
			};
			rows.set(id, r);
		}
		return r;
	};
	ids.forEach(row);
	for (const g of games) [0, 1].forEach((i) => {
		const r = row(g.ids[i]);
		r.played++;
		if (g.outcome === 0) r.drawn++;
		else if (g.outcome === i + 1) r.won++;
		else r.lost++;
		r.points += g.pts[i];
		r.for += g.score[i];
		r.against += g.score[1 - i];
		r.diff = r.for - r.against;
		if ("yellow" in r.extra) r.extra.yellow += g.yellow[i];
		if ("red" in r.extra) r.extra.red += g.red[i];
		if ("fairPlay" in r.extra) r.extra.fairPlay += g.fair[i];
		if (g.walkover === i + 1) {
			if ("walkovers" in r.extra) r.extra.walkovers++;
			if ("forfeits" in r.extra) r.extra.forfeits++;
		}
		if (g.defaulted === i + 1 && "defaults" in r.extra) r.extra.defaults++;
		if (g.shootoutWinner === i + 1 && "shootoutWins" in r.extra) r.extra.shootoutWins++;
	});
	return [...rows.values()];
}
/**
* Arma la tabla y la ordena con `resolveTies` de src/sports/formats (minitabla recursiva entre empatados).
* La minitabla usa las mismas reglas de puntos (forfeit, default, W.O., penales) que la tabla completa.
*/
function buildTable(teams, results, gameOf, criteria, restart, extraKeys) {
	const games = (rs) => rs.map(gameOf).filter((g) => g !== null);
	const valid = results.filter((r) => gameOf(r) !== null);
	const build = (ids, rs) => rowsOf(ids, games(rs), extraKeys);
	return resolveTies(build(teams, valid), valid, criteria, {
		build,
		restart
	});
}
/** Sorteo: el orden que ya salió (`lot`) y, si se pide, uno automático con semilla (`lotSeed`, p. ej. el id de la liga). */
function lotCriteria(lot, lotSeed) {
	const out = [];
	if (lot.length) out.push({
		label: "sorteo",
		scope: "all",
		value: (r) => lot.includes(r.id) ? -lot.indexOf(r.id) : -1e9
	});
	if (lotSeed !== null) out.push(tiebreak.lot(lotSeed));
	return out;
}
const FIBA_TABLE = {
	win: 2,
	loss: 1,
	forfeitLoss: 0,
	defaultLoss: 1,
	forfeitScore: 20,
	lot: [],
	lotSeed: null
};
function basketballGame(r, cfg) {
	if (r.side1 === r.side2) return null;
	const base = {
		ids: [r.side1, r.side2],
		fair: [0, 0],
		yellow: [0, 0],
		red: [0, 0]
	};
	if (r.walkover) {
		const w = other(r.walkover);
		return {
			...base,
			score: oriented(w, cfg.forfeitScore),
			pts: w === 1 ? [cfg.win, cfg.forfeitLoss] : [cfg.forfeitLoss, cfg.win],
			outcome: w,
			walkover: r.walkover
		};
	}
	let score = [...r.totals.points ?? [0, 0]];
	if (r.defaulted) {
		const w = other(r.defaulted);
		if (score[w - 1] <= score[r.defaulted - 1]) score = oriented(w, 2);
		return {
			...base,
			score,
			pts: w === 1 ? [cfg.win, cfg.defaultLoss] : [cfg.defaultLoss, cfg.win],
			outcome: w,
			defaulted: r.defaulted
		};
	}
	const w = score[0] > score[1] ? 1 : score[1] > score[0] ? 2 : r.winner;
	if (w === null) return null;
	return {
		...base,
		score,
		pts: w === 1 ? [cfg.win, cfg.loss] : [cfg.loss, cfg.win],
		outcome: w
	};
}
/**
* Tabla FIBA. `teams` pone a todos (también los que no han jugado) y el orden de salida de los empatados.
* `results`: partidos terminados, con `totals.points`. extra: forfeits (perdidos por forfeit), defaults.
*/
function basketballStandings(teams, results, config = {}) {
	const cfg = {
		...FIBA_TABLE,
		...config
	};
	return buildTable(teams, results, (r) => basketballGame(r, cfg), [
		tiebreak.points("puntos"),
		tiebreak.h2h((r) => r.points, "resultado entre ellos"),
		tiebreak.h2h((r) => r.diff, "dif. entre ellos"),
		tiebreak.h2h((r) => r.for, "puntos a favor entre ellos"),
		tiebreak.diff("dif. de puntos"),
		tiebreak.for("puntos a favor"),
		...lotCriteria(cfg.lot, cfg.lotSeed)
	], "always", ["forfeits", "defaults"]);
}
const FOOTBALL_TABLE = {
	win: 3,
	draw: 1,
	loss: 0,
	walkoverLoss: 0,
	walkoverScore: 3,
	shootout: null,
	tiebreak: [
		"diff",
		"for",
		"h2h",
		"fair_play",
		"lot"
	],
	fairPlay: {
		yellow: -1,
		secondYellow: -3,
		red: -4,
		yellowRed: -5
	},
	lot: [],
	lotSeed: null
};
/** Juego limpio de un lado a partir de los totales del partido (ver footballMatchResult). */
function fairPlayOf(t, i, w) {
	if (t.cardsYellow || t.cardsSecondYellow || t.cardsRed || t.cardsYellowRed) {
		const n = (k) => t[k]?.[i] ?? 0;
		return n("cardsYellow") * w.yellow + n("cardsSecondYellow") * w.secondYellow + n("cardsRed") * w.red + n("cardsYellowRed") * w.yellowRed;
	}
	return (t.yellow?.[i] ?? 0) * w.yellow + (t.red?.[i] ?? 0) * w.red;
}
function footballGame(r, cfg) {
	if (r.side1 === r.side2) return null;
	const ids = [r.side1, r.side2];
	const t = r.totals;
	const yellow = [t.yellow?.[0] ?? 0, t.yellow?.[1] ?? 0];
	const red = [t.red?.[0] ?? 0, t.red?.[1] ?? 0];
	const fair = [fairPlayOf(t, 0, cfg.fairPlay), fairPlayOf(t, 1, cfg.fairPlay)];
	if (r.walkover) {
		const w = other(r.walkover);
		return {
			ids,
			score: oriented(w, cfg.walkoverScore),
			pts: w === 1 ? [cfg.win, cfg.walkoverLoss] : [cfg.walkoverLoss, cfg.win],
			outcome: w,
			fair: [0, 0],
			yellow,
			red,
			walkover: r.walkover
		};
	}
	const score = [t.goals?.[0] ?? 0, t.goals?.[1] ?? 0];
	if (score[0] !== score[1]) {
		const w = score[0] > score[1] ? 1 : 2;
		return {
			ids,
			score,
			pts: w === 1 ? [cfg.win, cfg.loss] : [cfg.loss, cfg.win],
			outcome: w,
			fair,
			yellow,
			red
		};
	}
	const pens = t.shootout;
	if (cfg.shootout && pens && pens[0] !== pens[1]) {
		const w = pens[0] > pens[1] ? 1 : 2;
		return {
			ids,
			score,
			pts: w === 1 ? [cfg.shootout.win, cfg.shootout.loss] : [cfg.shootout.loss, cfg.shootout.win],
			outcome: 0,
			fair,
			yellow,
			red,
			shootoutWinner: w
		};
	}
	return {
		ids,
		score,
		pts: [cfg.draw, cfg.draw],
		outcome: 0,
		fair,
		yellow,
		red
	};
}
const FOOTBALL_LABELS = {
	diff: "dif. de goles",
	for: "goles a favor",
	wins: "partidos ganados",
	h2h_points: "enfrentamiento directo",
	h2h_diff: "dif. de goles entre ellos",
	h2h_for: "goles a favor entre ellos",
	fair_play: "juego limpio",
	lot: "sorteo"
};
/**
* Tabla de fútbol o sala. `results`: partidos terminados con `totals.goals` (y tarjetas para el juego limpio).
* extra: yellow, red, fairPlay, walkovers (W.O. en contra), shootoutWins.
*/
function footballStandings(teams, results, config = {}) {
	const cfg = {
		...FOOTBALL_TABLE,
		...config
	};
	const criteria = cfg.tiebreak.flatMap((k) => k === "h2h" ? [
		"h2h_points",
		"h2h_diff",
		"h2h_for"
	] : [k]).flatMap((k) => {
		const label = FOOTBALL_LABELS[k];
		switch (k) {
			case "diff": return [tiebreak.diff(label)];
			case "for": return [tiebreak.for(label)];
			case "wins": return [tiebreak.wins(label)];
			case "h2h_points": return [tiebreak.h2h((r) => r.points, label)];
			case "h2h_diff": return [tiebreak.h2h((r) => r.diff, label)];
			case "h2h_for": return [tiebreak.h2h((r) => r.for, label)];
			case "fair_play": return [tiebreak.stat("fairPlay", label)];
			case "lot": return lotCriteria(cfg.lot, cfg.lotSeed);
		}
	});
	return buildTable(teams, results, (r) => footballGame(r, cfg), [tiebreak.points("puntos"), ...criteria], "h2h", [
		"yellow",
		"red",
		"fairPlay",
		"walkovers",
		"shootoutWins"
	]);
}
const isObj$3 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
/** Los ajustes de events.config.signup (null si el evento no tiene inscripción). */
function parseSignup(raw) {
	if (!isObj$3(raw)) return null;
	const cap = typeof raw.cap === "number" && Number.isInteger(raw.cap) && raw.cap >= 2 && raw.cap <= 64 ? raw.cap : null;
	const until = typeof raw.until === "string" && Number.isFinite(Date.parse(raw.until)) ? raw.until : null;
	const rev = typeof raw.rev === "number" && Number.isFinite(raw.rev) ? Math.max(0, Math.trunc(raw.rev)) : 0;
	return {
		open: raw.open === true,
		cap,
		until,
		rev
	};
}
//#endregion
//#region src/pages/sports/racket/logic/night.ts
/** Tipos de evento que son una noche de puntos ('noche' = el formato va en config.format). */
const NIGHT_TYPES = [
	"americano",
	"mexicano",
	"noche"
];
const isNightType = (type) => NIGHT_TYPES.includes(type);
const isObj$2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const strList$2 = (v, max = 64) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && !!x).slice(0, max) : [];
const int$2 = (v, min, max, dflt) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;
const REST_POLICIES = [
	"own-average",
	"round-average",
	"normalize",
	"none"
];
/** Reglas de puntos saneadas (total 24 por defecto; por tiempo, 15 min). */
function parsePoints(raw) {
	const p = isObj$2(raw) ? raw : {};
	const mode = p.mode === "time" ? "time" : "total";
	const out = {
		mode,
		serveEvery: int$2(p.serveEvery, 1, 20, 4)
	};
	if (mode === "total") out.target = int$2(p.target, 4, 99, 24);
	else out.minutes = int$2(p.minutes, 5, 120, 15);
	return out;
}
/** events.config → NightConfig con todo lo que falte puesto (datos viejos o a medias no rompen la pantalla). */
function parseNightConfig(raw, type = "americano") {
	const c = isObj$2(raw) ? raw : {};
	const format = c.format === "mexicano" || c.format === "americano" ? c.format : type === "mexicano" ? "mexicano" : "americano";
	const players = [...new Set(strList$2(c.players))];
	const courts = strList$2(c.courts, 8).map((x) => x.slice(0, 40));
	const levels = {};
	if (isObj$2(c.levels)) {
		for (const [k, v] of Object.entries(c.levels)) if (typeof v === "number" && Number.isFinite(v)) levels[k] = v;
	}
	const rests = {};
	if (isObj$2(c.rests)) for (const [k, v] of Object.entries(c.rests)) rests[k] = strList$2(v);
	const out = {
		v: 1,
		format,
		players,
		courts: courts.length ? courts : ["Cancha 1"],
		points: parsePoints(c.points),
		rounds: int$2(c.rounds, 1, 30, format === "mexicano" ? 6 : 7),
		rest: REST_POLICIES.includes(c.rest) ? c.rest : "own-average",
		firstRound: c.firstRound === "level" ? "level" : "random",
		levels,
		seed: typeof c.seed === "string" && c.seed ? c.seed : "noche",
		rests,
		round: int$2(c.round, 0, 99, 0),
		closed: c.closed === true
	};
	if (Array.isArray(c.plan) && Array.isArray(c.planPlayers)) {
		out.plan = c.plan.filter(Array.isArray).map((r) => r.filter((m) => Array.isArray(m) && m.length === 4 && m.every((i) => Number.isInteger(i))));
		out.planPlayers = strList$2(c.planPlayers);
		out.planFrom = int$2(c.planFrom, 1, 99, 1);
	}
	const signup = parseSignup(c.signup);
	if (signup) out.signup = signup;
	return out;
}
const playersOf = (m, side) => m.sides[side].players.map((p) => p.playerId);
const closedStatus = (m) => m.status === "confirmed" || m.status === "walkover" || m.status === "void" || m.status === "finished" || m.status === "disputed";
/** Rondas de la noche (en orden) con sus partidos, marcadores que cuentan y descansos. */
function nightRounds(cfg, matches, now = Date.now()) {
	const byRound = /* @__PURE__ */ new Map();
	for (const m of matches) {
		if (m.round == null || m.status === "void") continue;
		const [a, b] = isFinal(m, now) && Array.isArray(m.score?.sides) ? m.score.sides : [null, null];
		const nm = {
			id: m.id,
			round: m.round,
			court: m.court,
			side1: playersOf(m, 0),
			side2: playersOf(m, 1),
			score1: a,
			score2: b,
			match: m
		};
		const list = byRound.get(m.round) ?? [];
		list.push(nm);
		byRound.set(m.round, list);
	}
	const collator = new Intl.Collator("es", { numeric: true });
	return [...byRound.keys()].sort((a, b) => a - b).map((round) => {
		const list = byRound.get(round).sort((x, y) => collator.compare(x.court, y.court));
		const pending = list.filter((x) => !closedStatus(x.match)).length;
		return {
			round,
			matches: list,
			rests: cfg.rests[String(round)] ?? [],
			done: pending === 0,
			started: list.some((x) => x.match.status !== "scheduled" || x.match.seq > 0),
			pending
		};
	});
}
/** Todos los que jugaron o están en la noche (para la tabla). */
function nightPeople(cfg, rounds) {
	const out = new Set(cfg.players);
	for (const r of rounds) {
		for (const m of r.matches) for (const p of [...m.side1, ...m.side2]) out.add(p);
		for (const p of r.rests) out.add(p);
	}
	return [...out];
}
const scored = (rounds) => rounds.map((r) => ({
	round: r.round,
	rests: r.rests,
	matches: r.matches.map((m) => ({
		side1: m.side1,
		side2: m.side2,
		score1: m.score1,
		score2: m.score2
	}))
}));
/** Tabla individual: puntos → partidos ganados → dif. de puntos (src/sports/formats/social). */
function nightTable(cfg, rounds) {
	return socialStandings(nightPeople(cfg, rounds), scored(rounds), { rest: cfg.rest });
}
//#endregion
//#region src/pages/sports/racket/logic/tourney.ts
/**
* Torneo por categorías (A/B/C…): en cada categoría, grupos en zigzag por nivel (todos contra todos), cruces
* 1A–2B y cuadro de eliminación con pases directos para los mejores sembrados y 3.er lugar opcional. También
* sirve sin grupos (cuadro directo). Puro: src/sports/formats (groups, knockout, roundRobin).
*/
const isObj$1 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const strList$1 = (v, max = 64) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && !!x).slice(0, max) : [];
const int$1 = (v, min, max, dflt) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt;
function parseTourneyConfig(raw) {
	const c = isObj$1(raw) ? raw : {};
	const seen = /* @__PURE__ */ new Set();
	const categories = [];
	for (const x of Array.isArray(c.categories) ? c.categories : []) {
		if (!isObj$1(x)) continue;
		const id = typeof x.id === "string" && /^[A-Za-z0-9]{1,6}$/.test(x.id) ? x.id : null;
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const cat = {
			id,
			name: typeof x.name === "string" && x.name.trim() ? x.name.trim().slice(0, 24) : `Categoría ${id}`,
			pairs: [...new Set(strList$1(x.pairs))],
			groups: int$1(x.groups, 0, 16, 0),
			perGroup: int$1(x.perGroup, 1, 4, 2),
			thirdPlace: x.thirdPlace === true
		};
		if (Array.isArray(x.groupsOf)) cat.groupsOf = x.groupsOf.map((g) => strList$1(g));
		if (Array.isArray(x.seeds)) cat.seeds = strList$1(x.seeds);
		categories.push(cat);
	}
	const out = {
		v: 1,
		format: "torneo",
		categories,
		courts: strList$1(c.courts, 12).map((x) => x.slice(0, 40)),
		points: c.points === "2-0" ? "2-0" : "standard"
	};
	const signup = parseSignup(c.signup);
	if (signup) out.signup = signup;
	return out;
}
const bracketKeyOf = (cat, key) => `${cat.id}-${key}`;
/** Partido de la base de ese lugar del cuadro (sin los anulados). */
const matchAt = (cat, key, matches) => matches.find((m) => m.bracketKey === bracketKeyOf(cat, key) && m.status !== "void");
/** Ganador (id de la pareja o del jugador) de un partido que ya cuenta. */
function winnerId(m, now = Date.now()) {
	if (!m || !isFinal(m, now)) return null;
	const w = m.winner ?? (m.walkoverSide === 1 ? 2 : m.walkoverSide === 2 ? 1 : null);
	return w ? entrantKey(m.sides[w - 1]) : null;
}
/** El cuadro de la categoría con los ganadores que ya cuentan (null si todavía no se armó). */
function categoryBracket(cat, matches, now = Date.now()) {
	const seeds = cat.seeds ?? [];
	if (seeds.length < 2) return null;
	let b = createBracket(seeds, { thirdPlace: cat.thirdPlace && seeds.length >= 4 });
	for (let r = 1; r <= b.rounds; r++) for (const key of b.matches.filter((m) => m.round === r && !m.thirdPlace && !m.bye).map((m) => m.key)) b = applyWinner(b, cat, key, matches, now);
	if (b.thirdPlace) b = applyWinner(b, cat, "P3", matches, now);
	return b;
}
function applyWinner(b, cat, key, matches, now) {
	const bm = b.matches.find((m) => m.key === key);
	const w = winnerId(matchAt(cat, key, matches), now);
	if (!bm || !w || !bm.side1 || !bm.side2 || w !== bm.side1 && w !== bm.side2) return b;
	return setWinner$1(b, key, w);
}
//#endregion
//#region src/badges/evaluators/racket.ts
/**
* Evaluadores de raqueta (pádel, tenis y pickleball; docs/insignias.md §2.3): hitos y marcas de carrera
* (`racket_career`), marcas de un partido (`racket_match`), la figura de la noche de americano o mexicano
* (`racket_night`) y el podio de un torneo por categorías (`event_podium`, la parte de raqueta). Los partidos se
* leen con los helpers de la app (tablas, cuadro, noches) y se validan con R1 y R2 (rules/racket.ts).
*/
const def$8 = (key) => badgeDef(key);
/** Contexto R1/R2 de un partido (el staff es el de su liga). */
const matchCtx = (kit, m) => ({
	now: kit.now,
	userOf: kit.userOf,
	rosterOf: kit.rosterOf,
	staff: kit.staff(m.leagueId)
});
/** Los jugadores de un partido (los del partido o, si no hay, la plantilla de la pareja). */
const matchPeople = (kit, m) => [...sidePlayers(m.sides[0], kit.rosterOf), ...sidePlayers(m.sides[1], kit.rosterOf)];
/**
* Jugadores que evalúa un trabajo de resultado: los que manda SQL (`snapshot.targets`, y entonces solo esos); si no,
* los del partido del ref (en equipos, también los que salen en el acta), los de un borrado (`payload.players`), los
* de la cuenta que se vinculó y, en el historial, todos los de la liga.
*/
function jobPlayers(kit) {
	if (kit.snap.targets) return [...new Set(kit.snap.targets)];
	const out = new Set(payloadPlayers(kit.job));
	const pid = refId(kit.job.ref, "player");
	if (pid) out.add(pid);
	const mid = refId(kit.job.ref, "match");
	const m = mid ? kit.matches.find((x) => x.id === mid) : void 0;
	if (m) matchPeople(kit, m).forEach((p) => out.add(p));
	const sport = m ? kit.sportOf(m.leagueId) : null;
	if (m && isTeamSport(sport)) for (const p of appearances(m, sport).keys()) out.add(p);
	if (kit.job.kind === "vinculo" && kit.job.user_id) accountPlayers(kit, kit.job.user_id).forEach((p) => out.add(p));
	if (kit.job.kind === "historial" && kit.job.league_id) {
		for (const p of kit.players.values()) if (p.league_id === kit.job.league_id) out.add(p.id);
	}
	return [...out];
}
/** Los partidos de un dueño en un deporte, en ligas reales ese mes, en orden (`matchTime`). */
function playedBy(kit, t, sport) {
	const mine = new Set(t.players);
	const out = [];
	for (const m of kit.matches) {
		if (kit.sportOf(m.leagueId) !== sport) continue;
		const date = matchDay(kit, m);
		if (!date || !realOn(kit, m.leagueId, date, t)) continue;
		for (const p of mine) {
			const side = playerSide(m, p, kit.rosterOf);
			if (side) {
				out.push({
					m,
					p,
					side,
					date,
					ctx: matchCtx(kit, m)
				});
				break;
			}
		}
	}
	return out.sort((a, b) => matchTime(a.m) - matchTime(b.m) || (a.m.id < b.m.id ? -1 : 1));
}
/** R1 que suma para el dueño (del jugador verificado solo, lo que confirmó una cuenta del otro lado). */
const countsR1 = (kit, x) => isR1(x.m, x.p, x.ctx) && (!kit.verifiedOnly(x.p) || r2Reason(x.m, x.p, x.ctx) === "rival");
const countsR2 = (kit, x) => {
	const r = r2Reason(x.m, x.p, x.ctx);
	return r !== null && (!kit.verifiedOnly(x.p) || r === "rival");
};
const ref$1 = (m) => `match:${m.id}`;
/** Lado ganador de un partido de puntos (americano, mexicano): el que sumó más; null en empate. */
function pointsWinner(m) {
	const s = m.score?.sides;
	if (!Array.isArray(s) || s.length !== 2) return null;
	return s[0] > s[1] ? 1 : s[1] > s[0] ? 2 : null;
}
function racketCareerFor(kit, t, sport) {
	const holder = t.holder;
	const r1 = playedBy(kit, t, sport).filter((x) => countsR1(kit, x));
	const r2 = r1.filter((x) => countsR2(kit, x));
	const out = [];
	const add = (key, steps, value, opts = {}) => {
		const d = def$8(key);
		out.push(...levelAwards(kit, d, holder, sport, sport, steps, opts), progressOf(d, holder, sport, sport, value));
	};
	const counter = (xs) => xs.map((x, i) => ({
		n: i + 1,
		ref: ref$1(x.m),
		date: x.date
	}));
	const matches = capPerDay(r1, (x) => x.date, paramOf(def$8("racket_matches"), "maxPerDay", sport) ?? CAPS.racketMatchesPerDay);
	add("racket_matches", counter(matches), matches.length);
	const capped = capPerRivalMonth(r2.filter((x) => isSetsMatch(x.m) && wonBy(x.m, x.p, kit.rosterOf)), (x) => entrantKey(x.m.sides[other$1(x.side) - 1]), (x) => monthOf(x.date), paramOf(def$8("racket_wins"), "maxPerRivalMonth", sport) ?? CAPS.racketWinsPerRivalMonth);
	add("racket_wins", counter(capped), capped.length);
	const streak = [];
	let run = [];
	let best = 0;
	for (const x of r1.filter((y) => isSetsMatch(y.m))) {
		if (!wonBy(x.m, x.p, kit.rosterOf)) {
			run = [];
			continue;
		}
		if (!countsR2(kit, x)) continue;
		run.push(entrantKey(x.m.sides[other$1(x.side) - 1]));
		best = Math.max(best, run.length);
		streak.push({
			n: run.length,
			ref: ref$1(x.m),
			date: x.date,
			values: { rivales: new Set(run).size }
		});
	}
	add("racket_win_streak", streak, best, {
		actual: true,
		req: (_l, s, req) => Number(s.values?.rivales ?? 0) >= (req.rivals ?? 0)
	});
	const tb = [];
	let tbs = 0;
	for (const x of r2.filter((y) => isSetsMatch(y.m))) {
		const read = readSets(x.m, sport);
		if (!read) continue;
		const gameTo = read.rules.sport === "pickleball" ? read.rules.gameTo : 0;
		const won = read.sets.filter((s) => s.winner === x.side && (read.rules.sport === "pickleball" ? s.games[x.side - 1] > gameTo : s.tiebreak || s.matchTiebreak)).length;
		if (!won) continue;
		tbs += won;
		tb.push({
			n: tbs,
			ref: ref$1(x.m),
			date: x.date
		});
	}
	add("racket_tiebreaks", tb, tbs);
	const partners = /* @__PURE__ */ new Set();
	const ps = [];
	for (const x of r2) {
		const doubles = sport === "padel" || !!matchRules(sport, x.m.rules)?.doubles;
		const won = isPointsMatch(x.m) ? pointsWinner(x.m) === x.side : isSetsMatch(x.m) && wonBy(x.m, x.p, kit.rosterOf);
		if (!doubles || !won) continue;
		const before = partners.size;
		for (const q of sidePlayers(x.m.sides[x.side - 1], kit.rosterOf)) {
			if (t.players.includes(q)) continue;
			partners.add(kit.userOf(q) ?? q);
		}
		if (partners.size > before) ps.push({
			n: partners.size,
			ref: ref$1(x.m),
			date: x.date
		});
	}
	add("racket_partners", ps, partners.size);
	const climbs = [];
	const byMatch = new Map(r2.map((x) => [x.m.id, x]));
	const challenges = [...kit.snap.ladder_challenges ?? []].filter((c) => c.status === "played" && !!c.winner && c.winner === c.challenger && !!c.match_id).sort((a, b) => (a.resolved_at ?? "").localeCompare(b.resolved_at ?? ""));
	for (const c of challenges) {
		const x = byMatch.get(c.match_id);
		if (!x || entrantKey(x.m.sides[x.side - 1]) !== c.challenger) continue;
		climbs.push({
			n: climbs.length + 1,
			ref: ref$1(x.m),
			date: x.date
		});
	}
	add("racket_ladder_climber", climbs, climbs.length);
	out.push(...revokeStale(kit, out, {
		holders: [holder],
		keys: badgesOfEvaluator("racket_career").map((d) => d.key),
		sport,
		period: (k) => k === "-"
	}));
	return out;
}
/** Los dueños de cuenta de un trabajo de resultado, por deporte de raqueta. */
function racketTargets(kit) {
	const out = [];
	const players = jobPlayers(kit);
	for (const sport of RACKET_SPORTS) {
		const mine = players.filter((p) => {
			const pl = kit.players.get(p);
			return !!pl && kit.sportOf(pl.league_id) === sport;
		});
		for (const t of accountTargets(kit, mine, [sport])) out.push({
			sport,
			t
		});
	}
	return out;
}
const racketCareer = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	return racketTargets(kit).flatMap(({ sport, t }) => racketCareerFor(kit, t, sport));
};
/** % de victorias R2 a sets de un jugador en su liga antes de un momento, y cuántos partidos. */
function recordBefore(kit, leagueId, playerId, before) {
	let played = 0;
	let won = 0;
	for (const m of kit.matches) {
		if (m.leagueId !== leagueId || !isSetsMatch(m) || matchTime(m) >= before) continue;
		if (!r2Reason(m, playerId, matchCtx(kit, m))) continue;
		played++;
		if (wonBy(m, playerId, kit.rosterOf)) won++;
	}
	return {
		played,
		pct: played ? won / played * 100 : 0
	};
}
/** Las marcas de un partido para un jugador (ya R2 y en liga real). */
function matchMarks(kit, m, p, side, sport) {
	const out = [];
	if (!isSetsMatch(m)) return out;
	const read = readSets(m, sport);
	const won = wonBy(m, p, kit.rosterOf);
	if (read) {
		const r = read.rules;
		if (read.sets.some((s) => {
			const [mine, theirs] = [s.games[side - 1], s.games[2 - side]];
			if (s.winner !== side || s.matchTiebreak || theirs !== 0) return false;
			return r.sport === "pickleball" ? mine >= r.gameTo : mine === r.gamesPerSet;
		})) out.push({ key: "racket_bagel" });
		if (won && r.bestOf >= 3 && !read.retired && read.sets.length >= 2 && read.sets[0].winner !== side) out.push({ key: "racket_comeback" });
	}
	if (won) {
		const d = def$8("racket_upset");
		const at = matchTime(m);
		const me = recordBefore(kit, m.leagueId, p, at);
		const rivals = sidePlayers(m.sides[2 - side], kit.rosterOf).map((q) => recordBefore(kit, m.leagueId, q, at));
		if (rivals.length) {
			const rPlayed = rivals.reduce((n, r) => n + r.played, 0) / rivals.length;
			const rPct = rivals.reduce((n, r) => n + r.pct, 0) / rivals.length;
			const minRival = paramOf(d, "minRivalMatches", sport) ?? 10;
			const minOwn = paramOf(d, "minOwnMatches", sport) ?? 5;
			const gap = paramOf(d, "pctGap", sport) ?? 25;
			if (rPlayed >= minRival && me.played >= minOwn && rPct - me.pct >= gap) out.push({
				key: "racket_upset",
				values: { gap: Math.round(rPct - me.pct) }
			});
		}
	}
	return out;
}
const racketMatch = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const keys = badgesOfEvaluator("racket_match").map((d) => d.key);
	const mid = refId(job.ref, "match");
	const list = mid ? kit.matches.filter((m) => m.id === mid) : job.kind === "historial" && job.league_id ? kit.matches.filter((m) => m.leagueId === job.league_id) : [];
	const out = [];
	for (const m of list) {
		const sport = kit.sportOf(m.leagueId);
		if (!isRacketSport(sport)) continue;
		const date = matchDay(kit, m);
		const given = [];
		const holders = [];
		for (const side of [1, 2]) for (const p of sidePlayers(m.sides[side - 1], kit.rosterOf)) {
			holders.push(playerHolderOf(p, m.leagueId));
			const ctx = matchCtx(kit, m);
			if (!date || !realOn(kit, m.leagueId, date) || !r2Reason(m, p, ctx)) continue;
			for (const mark of matchMarks(kit, m, p, side, sport)) given.push(awardOf(def$8(mark.key), playerHolderOf(p, m.leagueId), sport, 0, periodKey.match(m.id), statusFor(kit, date), [ref$1(m)], {
				...leagueCtx(kit, m.leagueId),
				...eventCtx(kit, m.eventId),
				...mark.values ? { values: mark.values } : {}
			}));
		}
		out.push(...given, ...revokeStale(kit, given, {
			holders: [...holders, ...periodHolders(kit, periodKey.match(m.id))],
			keys,
			sport,
			period: (k) => k === periodKey.match(m.id)
		}));
	}
	if (mid && !list.length && job.league_id) {
		const holders = [...payloadPlayers(job).map((p) => playerHolderOf(p, job.league_id)), ...periodHolders(kit, periodKey.match(mid))];
		out.push(...revokeStale(kit, [], {
			holders,
			keys,
			period: (k) => k === periodKey.match(mid)
		}));
	}
	return out;
};
/** Hora (ms) del último resultado de la noche. */
const lastResultAt = (ms) => Math.max(0, ...ms.map((m) => Date.parse(m.confirmedAt ?? m.proposedAt ?? "") || 0));
const racketNight = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const d = def$8("racket_night_champion");
	const eid = refId(job.ref, "event");
	const events = [...kit.events.values()].filter((e) => (eid ? e.id === eid : job.kind === "historial" && e.league_id === job.league_id) && isNightType(e.type));
	const out = [];
	for (const e of events) {
		const league = kit.leagues.get(e.league_id);
		const sport = league?.sport;
		if (!league || !isRacketSport(sport) || !d.sports.includes(sport)) continue;
		const ms = kit.matches.filter((m) => m.eventId === e.id && m.status !== "void");
		const closeMs = (paramOf(d, "closeHours", sport) ?? 24) * 36e5;
		if (!ms.length || !ms.every((m) => isFinal(m, now)) || e.date >= kit.today || lastResultAt(ms) > now - closeMs) continue;
		if (!realOn(kit, e.league_id, e.date)) continue;
		const cfg = parseNightConfig(e.config, e.type);
		const rows = nightTable(cfg, nightRounds(cfg, ms, now)).filter((r) => r.played > 0);
		const accounts = new Set(rows.map((r) => kit.userOf(r.id)).filter((u) => !!u));
		const writers = new Set(ms.flatMap((m) => [m.proposedBy, m.confirmedBy]).filter((u) => !!u));
		if (rows.length < (paramOf(d, "minPlayers", sport) ?? 8) || accounts.size < (paramOf(d, "minAccounts", sport) ?? 6) || writers.size < (paramOf(d, "minWriters", sport) ?? 2)) continue;
		const { winners } = topWithTies(rows, (a, b) => a.rank - b.rank);
		for (const w of winners) out.push(awardOf(d, playerHolderOf(w.id, e.league_id), sport, 0, periodKey.event(e.id), "firme", ms.map(ref$1).slice(0, 10), {
			...leagueCtx(kit, e.league_id),
			...eventCtx(kit, e.id),
			values: {
				n: w.points,
				formato: cfg.format,
				jugadores: rows.length
			}
		}));
	}
	return out;
};
/**
* Podio de cada categoría de un torneo (§2.1, `event_podium` de raqueta): oro al ganador de la final
* `<cat>-R<rondas>-1`, plata al que la perdió, bronce al ganador del 3.er lugar o a los dos perdedores de semifinal.
* La final tiene que ser R2 para quien recibe (una final por W.O. vale para el ganador si su semifinal fue R2; el que
* no se presentó no recibe plata). El tamaño del podio sale de los inscritos (§1.7.8).
*/
function racketTourneyPodium(kit, eventId, config) {
	const cfg = parseTourneyConfig(config);
	const ms = kit.matches.filter((m) => m.eventId === eventId);
	const out = [];
	for (const cat of cfg.categories) {
		const bracket = categoryBracket(cat, ms, kit.now);
		if (!bracket) continue;
		const entrants = cat.pairs.length || cat.seeds?.length || 0;
		const levels = podiumLevels(entrants);
		if (!levels.length) continue;
		const final = matchAt(cat, `R${bracket.rounds}-1`, ms);
		const champ = winnerId(final, kit.now);
		if (!final || !champ) continue;
		const places = [];
		const sideOf = (m, id) => entrantKey(m.sides[0]) === id ? 1 : entrantKey(m.sides[1]) === id ? 2 : null;
		const valid = (m, side) => sidePlayers(m.sides[side - 1], kit.rosterOf).filter((p) => !!r2Reason(m, p, matchCtx(kit, m)));
		const semis = semifinals(cat, bracket.rounds, ms);
		const wSide = sideOf(final, champ);
		if (final.status === "walkover") {
			const semi = semis.find((s) => winnerId(s, kit.now) === champ);
			const semiSide = semi ? sideOf(semi, champ) : null;
			const players = semi && semiSide ? valid(semi, semiSide) : [];
			if (levels.includes(3) && players.length) places.push({
				level: 3,
				players,
				match: final
			});
		} else {
			const gold = valid(final, wSide);
			const silver = valid(final, other$1(wSide));
			if (levels.includes(3) && gold.length) places.push({
				level: 3,
				players: gold,
				match: final
			});
			if (levels.includes(2) && silver.length) places.push({
				level: 2,
				players: silver,
				match: final
			});
		}
		if (levels.includes(1)) {
			const p3 = matchAt(cat, "P3", ms);
			const p3Winner = winnerId(p3, kit.now);
			if (p3 && p3Winner && p3.status !== "walkover") {
				const players = valid(p3, sideOf(p3, p3Winner));
				if (players.length) places.push({
					level: 1,
					players,
					match: p3
				});
			} else if (!p3) for (const s of semis) {
				const w = winnerId(s, kit.now);
				if (!w || s.status === "walkover") continue;
				const players = valid(s, other$1(sideOf(s, w)));
				if (players.length) places.push({
					level: 1,
					players,
					match: s
				});
			}
		}
		out.push({
			catId: cat.id,
			entrants,
			places
		});
	}
	return out;
}
function semifinals(cat, rounds, ms) {
	if (rounds < 2) return [];
	return [1, 2].map((i) => matchAt(cat, `R${rounds - 1}-${i}`, ms)).filter((m) => !!m);
}
/** `event_podium` de raqueta: torneos (`type='torneo'`) en ligas `kind='liga'`. */
function racketEventPodium(kit, job) {
	const d = def$8("event_podium");
	const eid = refId(job.ref, "event");
	const out = [];
	for (const e of kit.events.values()) {
		if ((eid ? e.id !== eid : !(job.kind === "historial" && e.league_id === job.league_id)) || e.type !== "torneo") continue;
		const league = kit.leagues.get(e.league_id);
		const sport = league?.sport;
		if (!league || league.kind !== "liga" || !isRacketSport(sport) || !realOn(kit, e.league_id, e.date)) continue;
		for (const cat of racketTourneyPodium(kit, e.id, e.config)) for (const place of cat.places) for (const p of place.players) out.push(awardOf(d, playerHolderOf(p, e.league_id), sport, place.level, periodKey.event(e.id, cat.catId), "firme", [ref$1(place.match)], {
			...leagueCtx(kit, e.league_id),
			...eventCtx(kit, e.id),
			values: {
				categoria: cat.catId,
				inscritos: cat.entrants
			}
		}));
	}
	return out;
}
const racketPodium = (job, snap, now) => racketEventPodium(kitOf(job, snap, now), job);
//#endregion
//#region src/badges/evaluators/team.ts
/**
* Evaluadores de equipos (baloncesto, fútbol y sala; docs/insignias.md §2.4–§2.6): hitos y rachas de carrera
* (`team_career`), la remontada de un partido (`team_match`), puntos y triples (`basketball_career`,
* `basketball_match`), goles, asistencias y vallas (`football_career`, `football_match`) y el podio de un torneo
* relámpago (`event_podium`, la parte de equipos). Apariciones, T1, T2 y TS en rules/team.ts; las líneas y la
* cronología se leen con los adaptadores de cada deporte.
*/
const def$7 = (key) => badgeDef(key);
const ref = (m) => `match:${m.id}`;
/** Contexto T2 de un partido (staff de su liga). */
const teamMatchCtx = (kit, m) => ({
	now: kit.now,
	userOf: kit.userOf,
	teamPlayers: kit.snap.team_players ?? [],
	staff: kit.staff(m.leagueId)
});
/** Reglas del partido (la copia de la liga) o, si no trae, las de la liga. */
const matchRulesOf = (kit, m) => m.rules && Object.keys(m.rules).length ? m.rules : kit.leagues.get(m.leagueId)?.rules;
/** Baloncesto 3x3 (cambia umbrales y apaga los triples). */
const is3x3 = (kit, m) => rulesPart(matchRulesOf(kit, m), "match").variant === "3x3";
/** Variante de una fila de baloncesto para un partido. */
const variantOf = (kit, m, sport) => sport === "basketball" && is3x3(kit, m) ? V3X3 : sport;
/** Partidos T1 en ligas reales ese mes en los que apareció (alineación o acta), en orden. Nunca la plantilla. */
function appearedIn(kit, t, sport) {
	const out = [];
	for (const m of kit.matches) {
		if (kit.sportOf(m.leagueId) !== sport || !isT1(m, kit.now)) continue;
		const date = matchDay(kit, m);
		if (!date || !realOn(kit, m.leagueId, date, t)) continue;
		const seen = appearances(m, sport);
		for (const p of t.players) {
			const side = seen.get(p);
			if (side) {
				out.push({
					m,
					p,
					side,
					date,
					ctx: teamMatchCtx(kit, m)
				});
				break;
			}
		}
	}
	return out.sort((a, b) => a.date.localeCompare(b.date) || (a.m.scheduledAt ?? "").localeCompare(b.m.scheduledAt ?? "") || (a.m.id < b.m.id ? -1 : 1));
}
/** T2 para su lado (del jugador verificado solo, lo que confirmó el otro equipo). */
const countsT2 = (kit, x) => {
	const r = t2Reason(x.m, x.side, x.ctx);
	return r !== null && (!kit.verifiedOnly(x.p) || r === "rival");
};
/** Los dueños de cuenta de un trabajo de resultado, por deporte de equipo. */
function teamTargets(kit, sports = TEAM_SPORTS) {
	const out = [];
	const players = jobPlayers(kit);
	for (const sport of sports) {
		const mine = players.filter((p) => {
			const pl = kit.players.get(p);
			return !!pl && kit.sportOf(pl.league_id) === sport;
		});
		for (const t of accountTargets(kit, mine, [sport])) out.push({
			sport,
			t
		});
	}
	return out;
}
function careerAdder(kit, holder, sport, out) {
	return (key, steps, value, opts = {}, variant = sport) => {
		const d = def$7(key);
		out.push(...levelAwards(kit, d, holder, sport, variant, steps, opts), progressOf(d, holder, sport, variant, value));
	};
}
const counter = (xs) => xs.map((x, i) => ({
	n: i + 1,
	ref: ref(x.m),
	date: x.date
}));
function teamCareerFor(kit, t, sport) {
	const out = [];
	const add = careerAdder(kit, t.holder, sport, out);
	const list = appearedIn(kit, t, sport).filter((x) => !kit.verifiedOnly(x.p) || countsT2(kit, x));
	add("team_matches", counter(list), list.length);
	const capped = capPerRivalMonth(list.filter((x) => countsT2(kit, x) && teamOutcome(x.m, x.side) === "G"), (x) => sideKey(x.m.sides[other$1(x.side) - 1]), (x) => monthOf(x.date), paramOf(def$7("team_wins"), "maxPerTeamMonth", sport) ?? CAPS.teamWinsPerTeamMonth);
	add("team_wins", counter(capped), capped.length);
	const steps = [];
	let run = 0;
	let best = 0;
	for (const x of list) {
		const r = teamOutcome(x.m, x.side);
		if (r === "P") {
			run = 0;
			continue;
		}
		if (!countsT2(kit, x) || sport === "basketball" && r !== "G" || r === null) continue;
		run++;
		best = Math.max(best, run);
		steps.push({
			n: run,
			ref: ref(x.m),
			date: x.date
		});
	}
	add("team_unbeaten", steps, best, { actual: true });
	out.push(...revokeStale(kit, out, {
		holders: [t.holder],
		keys: badgesOfEvaluator("team_career").map((d) => d.key),
		sport,
		period: (k) => k === "-"
	}));
	return out;
}
const teamCareer = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	return teamTargets(kit).flatMap(({ sport, t }) => teamCareerFor(kit, t, sport));
};
/** Líneas TS de un dueño: partido T2 para su lado, con líneas, y la suya coherente. */
function basketballTS(kit, t) {
	return appearedIn(kit, t, "basketball").filter((x) => countsT2(kit, x)).map((x) => ({
		...x,
		line: basketballStatLine(x.m, x.p)
	})).filter((x) => !!x.line);
}
function basketballCareerFor(kit, t) {
	const out = [];
	const add = careerAdder(kit, t.holder, "basketball", out);
	const ts = basketballTS(kit, t);
	let pts = 0;
	const cumPts = [];
	for (const x of ts) {
		pts += x.line.points;
		if (x.line.points > 0) cumPts.push({
			n: pts,
			ref: ref(x.m),
			date: x.date
		});
	}
	add("basketball_first_basket", cumPts, pts);
	add("basketball_points", cumPts, pts);
	const byGame = ts.map((x) => ({
		n: x.line.points,
		ref: ref(x.m),
		date: x.date,
		values: { v3x3: is3x3(kit, x.m) }
	}));
	const last3x3 = ts.length ? is3x3(kit, ts[ts.length - 1].m) : false;
	add("basketball_points_game", byGame, Math.max(0, ...ts.map((x) => x.line.points)), {
		actual: true,
		variantOf: (s) => s.values?.v3x3 ? V3X3 : "basketball"
	}, last3x3 ? V3X3 : "basketball");
	const five = ts.filter((x) => !is3x3(kit, x.m));
	let threes = 0;
	const cumThrees = [];
	for (const x of five) {
		threes += x.line.threes;
		if (x.line.threes > 0) cumThrees.push({
			n: threes,
			ref: ref(x.m),
			date: x.date
		});
	}
	add("basketball_threes", cumThrees, threes);
	add("basketball_threes_game", five.map((x) => ({
		n: x.line.threes,
		ref: ref(x.m),
		date: x.date
	})), Math.max(0, ...five.map((x) => x.line.threes)), { actual: true });
	out.push(...revokeStale(kit, out, {
		holders: [t.holder],
		keys: badgesOfEvaluator("basketball_career").map((d) => d.key),
		sport: "basketball",
		period: (k) => k === "-"
	}));
	return out;
}
const basketballCareer = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	return teamTargets(kit, ["basketball"]).flatMap(({ t }) => basketballCareerFor(kit, t));
};
function footballCareerFor(kit, t, sport) {
	const out = [];
	const add = careerAdder(kit, t.holder, sport, out);
	const ts = appearedIn(kit, t, sport).filter((x) => countsT2(kit, x)).map((x) => ({
		...x,
		line: footballStatLine(x.m, x.p)
	})).filter((x) => !!x.line);
	const cumulative = (pick) => {
		let total = 0;
		const steps = [];
		for (const x of ts) {
			const v = pick(x);
			total += v;
			if (v > 0) steps.push({
				n: total,
				ref: ref(x.m),
				date: x.date
			});
		}
		return {
			steps,
			total
		};
	};
	const goals = cumulative((x) => x.line.goals);
	add("football_first_goal", goals.steps, goals.total);
	add("football_goals", goals.steps, goals.total);
	const assists = cumulative((x) => x.line.assists);
	add("football_assists", assists.steps, assists.total);
	const sheets = cumulative((x) => {
		const s = x.m.score?.sides;
		return x.line.keeper && Array.isArray(s) && s[2 - x.side] === 0 ? 1 : 0;
	});
	add("football_clean_sheet", sheets.steps, sheets.total);
	const inMatch = ts.filter((x) => goalsMatchTimeline(x.m, x.p, x.line.goals));
	add("football_goals_in_match", inMatch.map((x) => ({
		n: x.line.goals,
		ref: ref(x.m),
		date: x.date
	})), Math.max(0, ...inMatch.map((x) => x.line.goals)), { actual: true });
	out.push(...revokeStale(kit, out, {
		holders: [t.holder],
		keys: badgesOfEvaluator("football_career").map((d) => d.key),
		sport,
		period: (k) => k === "-"
	}));
	return out;
}
/** Si el partido trae cronología (`score.tl`), los goles del jugador en ella tienen que ser los de su línea. */
function goalsMatchTimeline(m, p, goals) {
	if (typeof m.score?.tl !== "string" || !m.score.tl) return true;
	return decodeTimeline(m.score.tl, decodeLines(m.score?.lines)).filter((e) => e.kind === "goal" && e.player === p).length === goals;
}
const footballCareer = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	return teamTargets(kit, ["football", "futsal"]).flatMap(({ sport, t }) => footballCareerFor(kit, t, sport));
};
/** Partidos del trabajo: el del ref, o en el historial todos los de la liga. */
function jobMatches(kit, job) {
	const mid = refId(job.ref, "match");
	return {
		list: mid ? kit.matches.filter((m) => m.id === mid) : job.kind === "historial" && job.league_id ? kit.matches.filter((m) => m.leagueId === job.league_id) : [],
		mid
	};
}
/** Minuto de la cronología ('88', '90+3') como número. */
function minuteOf(text) {
	if (!text) return null;
	const m = /^(\d+)(?:\+(\d+))?$/.exec(text);
	return m ? Number(m[1]) + Number(m[2] ?? 0) : null;
}
/** ¿Su lado iba abajo y lo ganó? (§2.4 `team_comeback`). */
function cameBack(kit, m, side, sport) {
	const d = def$7("team_comeback");
	const deficit = paramOf(d, "deficit", sport) ?? 2;
	if (sport === "basketball") {
		if (is3x3(kit, m)) return false;
		const n = Number(rulesPart(matchRulesOf(kit, m), "match").periods) || basketballConfig("fiba").periods;
		const half = periodsFromScore$1(m.score).slice(0, Math.floor(n / 2));
		if (half.length < Math.floor(n / 2) || !half.length) return false;
		const [a, b] = half.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
		return (side === 1 ? a - b : b - a) <= -deficit;
	}
	const first = periodsFromScore(m.score)[0];
	if (first && first[side - 1] < first[2 - side]) return true;
	const tl = typeof m.score?.tl === "string" ? decodeTimeline(m.score.tl, decodeLines(m.score?.lines)) : [];
	let diff = 0;
	for (const e of tl) {
		if (e.kind !== "goal" && e.kind !== "own_goal") continue;
		diff += e.side === side ? 1 : -1;
		if (diff <= -deficit) return true;
	}
	return false;
}
/**
* El gol del triunfo: en la cronología, el gol del jugador después del cual su lado se puso arriba y ya no perdió la
* ventaja, en el último 10 % del tiempo reglamentario o en la prórroga (§2.6 `football_late_winner`).
*/
function lateWinner(kit, m, p, side, sport) {
	const cfgDefault = footballConfig(sport === "futsal" ? "futsal" : "football");
	const match = rulesPart(matchRulesOf(kit, m), "match");
	const clock = match.clock === "running" || match.clock === "stopped" || match.clock === "none" ? match.clock : cfgDefault.clock;
	const half = typeof match.halfMinutes === "number" && match.halfMinutes > 0 ? match.halfMinutes : cfgDefault.halfMinutes;
	if (clock === "none" || typeof m.score?.tl !== "string") return null;
	const tl = decodeTimeline(m.score.tl, decodeLines(m.score?.lines)).filter((e) => e.kind === "goal" || e.kind === "own_goal");
	const score = [0, 0];
	let lead = null;
	for (const e of tl) {
		const before = score[side - 1] - score[2 - side];
		score[e.side - 1]++;
		const after = score[side - 1] - score[2 - side];
		if (before <= 0 && after > 0) lead = e;
		if (after <= 0) lead = null;
	}
	const sides = m.score?.sides;
	if (!lead || !Array.isArray(sides) || sides[0] !== score[0] || sides[1] !== score[1]) return null;
	if (lead.kind !== "goal" || lead.side !== side || lead.player !== p) return null;
	const minute = minuteOf(lead.minute);
	const share = paramOf(def$7("football_late_winner"), "lateShare", sport) ?? .9;
	if (minute === null || minute < share * 2 * half) return null;
	return minute;
}
/** Líneas de baloncesto que se pueden leer enteras (sin cortar por tamaño). */
const fullLines = (m, max) => typeof m.score?.lines === "string" && m.score.lines.length < max;
const teamMatch = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const { list, mid } = jobMatches(kit, job);
	return matchFamily(kit, job, list, mid, "team_match");
};
/** Evalúa las marcas de partido de una familia (`team_match`, `basketball_match`, `football_match`). */
function matchFamily(kit, job, list, mid, family) {
	const keys = badgesOfEvaluator(family).map((d) => d.key);
	const out = [];
	for (const m of list) {
		const sport = kit.sportOf(m.leagueId);
		if (!isTeamSport(sport)) continue;
		if (family === "basketball_match" && sport !== "basketball") continue;
		if (family === "football_match" && sport === "basketball") continue;
		const date = matchDay(kit, m);
		const seen = appearances(m, sport);
		const holders = [...seen.keys()].map((p) => playerHolderOf(p, m.leagueId));
		const given = [];
		const ok = !!date && isT1(m, kit.now) && realOn(kit, m.leagueId, date);
		const ctx = teamMatchCtx(kit, m);
		const give = (key, p, values) => given.push(awardOf(def$7(key), playerHolderOf(p, m.leagueId), sport, 0, periodKey.match(m.id), statusFor(kit, date), [ref(m)], {
			...leagueCtx(kit, m.leagueId),
			...eventCtx(kit, m.eventId),
			...teamCtx(kit, m.sides[(seen.get(p) ?? 1) - 1].teamId),
			...values ? { values } : {}
		}));
		if (ok) {
			const t2 = new Set([1, 2].filter((s) => t2Reason(m, s, ctx) !== null));
			if (family === "team_match") {
				for (const [p, side] of seen) if (t2.has(side) && teamOutcome(m, side) === "G" && cameBack(kit, m, side, sport)) give("team_comeback", p);
			} else if (family === "basketball_match") {
				const v = variantOf(kit, m, sport);
				const lines = hasLines(m) ? basketballLinesOf(m).filter(coherentBasketballLine) : [];
				const totalFouls = basketballLinesOf(m).reduce((n, l) => n + l.fouls, 0);
				const d3 = def$7("basketball_triple_threat");
				const dClean = def$7("basketball_clean_hands");
				for (const l of lines) {
					if (!t2.has(l.side) || !seen.has(l.playerId)) continue;
					if (!is3x3(kit, m) && l.ones >= 1 && l.twos >= 1 && l.threes >= 1 && l.points >= (thresholdOf(d3, 0, v) ?? 15)) give("basketball_triple_threat", l.playerId, { n: l.points });
					if (l.fouls === 0 && l.points >= (thresholdOf(dClean, 0, v) ?? 12) && totalFouls >= (paramOf(dClean, "minMatchFouls", v) ?? 4)) give("basketball_clean_hands", l.playerId, { n: l.points });
				}
				const dLead = def$7("basketball_game_leader");
				if (lines.length && fullLines(m, paramOf(dLead, "maxLinesChars", v) ?? 2800)) {
					const { winners } = topWithTies(lines, (a, b) => b.points - a.points);
					for (const l of winners) if (l.points >= (thresholdOf(dLead, 0, v) ?? 10) && t2.has(l.side)) give("basketball_game_leader", l.playerId, { n: l.points });
				}
			} else if (sport === "football" || sport === "futsal") for (const [p, side] of seen) {
				if (!t2.has(side)) continue;
				if (footballStatLine(m, p) && wonShootout(m, side)) give("football_shootout_win", p, pensFromScore(m.score) ? { pens: pensFromScore(m.score)[side - 1] } : void 0);
				const pens = pensFromScore(m.score);
				if (teamOutcome(m, side) === "G" && !pens) {
					const minute = lateWinner(kit, m, p, side, sport);
					if (minute !== null) give("football_late_winner", p, { minuto: minute });
				}
			}
		}
		out.push(...given, ...revokeStale(kit, given, {
			holders: [...holders, ...periodHolders(kit, periodKey.match(m.id))],
			keys,
			sport,
			period: (k) => k === periodKey.match(m.id)
		}));
	}
	if (mid && !list.length && job.league_id) {
		const holders = [...payloadPlayers(job).map((p) => playerHolderOf(p, job.league_id)), ...periodHolders(kit, periodKey.match(mid))];
		out.push(...revokeStale(kit, [], {
			holders,
			keys,
			period: (k) => k === periodKey.match(mid)
		}));
	}
	return out;
}
const basketballMatch = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const { list, mid } = jobMatches(kit, job);
	return matchFamily(kit, job, list, mid, "basketball_match");
};
const footballMatch = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const { list, mid } = jobMatches(kit, job);
	return matchFamily(kit, job, list, mid, "football_match");
};
/** Ganador de un partido del cuadro: por marcador, o por penales si empataron. */
function knockoutWinner(m) {
	const s = m.score?.sides;
	if (Array.isArray(s) && s[0] !== s[1]) return s[0] > s[1] ? 1 : 2;
	if (wonShootout(m, 1)) return 1;
	if (wonShootout(m, 2)) return 2;
	return m.winner;
}
/**
* Oro y plata de la final `R<n>-1` (los penales desempatan) y bronce del `P3`, entre los partidos del cuadro de un
* torneo. La final (y el 3.er lugar) tienen que ser T2 para el lado que recibe. El tamaño del podio sale de los
* equipos inscritos (§1.7.8).
*/
function teamKnockoutPodium(kit, ms, teamCount) {
	const levels = podiumLevels(teamCount);
	const keyed = ms.filter((m) => m.bracketKey && m.status !== "void");
	const rounds = Math.max(0, ...keyed.map((m) => Number(/^R(\d+)-\d+$/.exec(m.bracketKey)?.[1] ?? 0)));
	const final = keyed.find((m) => m.bracketKey === `R${rounds}-1`);
	const out = [];
	const valid = (m, side) => isT1(m, kit.now) && t2Reason(m, side, teamMatchCtx(kit, m)) !== null;
	if (final && rounds > 0) {
		const w = knockoutWinner(final);
		if (w) {
			const [wt, lt] = [final.sides[w - 1].teamId, final.sides[2 - w].teamId];
			if (levels.includes(3) && wt && valid(final, w)) out.push({
				level: 3,
				teamId: wt,
				match: final
			});
			if (levels.includes(2) && lt && valid(final, other$1(w))) out.push({
				level: 2,
				teamId: lt,
				match: final
			});
		}
	}
	const p3 = keyed.find((m) => m.bracketKey === "P3");
	if (p3 && levels.includes(1)) {
		const w = knockoutWinner(p3);
		const wt = w ? p3.sides[w - 1].teamId : null;
		if (w && wt && valid(p3, w)) out.push({
			level: 1,
			teamId: wt,
			match: p3
		});
	}
	return out;
}
/**
* Quiénes de un equipo reciben un premio del torneo: los que aparecieron en al menos un partido; si el torneo no
* tiene ningún dato de alineación, la plantilla que ya estaba el día del torneo (evidencia «según plantilla»).
*/
function tournamentPlayers(kit, ms, teamId, sport, share = 0) {
	const mine = ms.filter((m) => isT1(m, kit.now) && m.sides.some((s) => s.teamId === teamId));
	const played = /* @__PURE__ */ new Map();
	let anyLineup = false;
	for (const m of mine) {
		const side = m.sides[0].teamId === teamId ? 1 : 2;
		const seen = appearances(m, sport);
		if (seen.size) anyLineup = true;
		for (const [p, s] of seen) if (s === side) played.set(p, (played.get(p) ?? 0) + 1);
	}
	if (anyLineup) {
		const need = Math.max(1, Math.ceil(share * mine.length - 1e-9));
		return {
			players: [...played].filter(([, n]) => n >= need).map(([p]) => p),
			byRoster: false,
			played,
			total: mine.length
		};
	}
	const last = [...mine].sort((a, b) => (matchDay(kit, a) ?? "").localeCompare(matchDay(kit, b) ?? "")).pop();
	const date = last ? matchDay(kit, last) : null;
	if (!last || !date) return {
		players: [],
		byRoster: true,
		played,
		total: mine.length
	};
	const roster = rosterFallback(last, kit.snap.team_players ?? [], date, kit.tzOf(last.leagueId));
	const side = last.sides[0].teamId === teamId ? 1 : 2;
	return {
		players: [...roster].filter(([, s]) => s === side).map(([p]) => p),
		byRoster: true,
		played,
		total: mine.length
	};
}
function teamEventPodium(kit, job) {
	const d = def$7("event_podium");
	const eid = refId(job.ref, "event");
	const out = [];
	const events = [...kit.events.values()].filter((e) => eid ? e.id === eid : job.kind === "historial" && e.league_id === job.league_id);
	for (const e of events) {
		const league = kit.leagues.get(e.league_id);
		const sport = league?.sport;
		if (!league || league.kind !== "liga" || !isTeamSport(sport) || !realOn(kit, e.league_id, e.date)) continue;
		const ms = kit.matches.filter((m) => m.eventId === e.id && m.status !== "void");
		if (!ms.some((m) => m.bracketKey)) continue;
		const teams = new Set(ms.flatMap((m) => m.sides.map((s) => s.teamId)).filter((t) => !!t));
		for (const place of teamKnockoutPodium(kit, ms, teams.size)) {
			const who = tournamentPlayers(kit, ms, place.teamId, sport);
			for (const p of who.players) out.push(awardOf(d, playerHolderOf(p, e.league_id), sport, place.level, periodKey.event(e.id), "firme", [ref(place.match)], {
				...leagueCtx(kit, e.league_id),
				...eventCtx(kit, e.id),
				...teamCtx(kit, place.teamId),
				values: { equipos: teams.size },
				...who.byRoster ? { by_roster: true } : {}
			}));
		}
	}
	return out;
}
const teamPodium = (job, snap, now) => teamEventPodium(kitOf(job, snap, now), job);
//#endregion
//#region src/badges/evaluators/metrics.ts
/**
* Métricas por deporte que comparten las insignias de periodo (mes, año y temporada; docs/insignias.md §2.9–§2.11):
* la figura (promedio, victorias o diferencial), el progreso contra la línea base, las rachas, las fechas de la
* asistencia y las tablas de equipos. Todo sobre una liga y una ventana de fechas ('YYYY-MM-DD', ambas incluidas).
* Las comparaciones van en `key` (mayor es mejor, en orden de desempate) para `topWithTies` y `podiumAwards`.
*/
const monthWindow = (month) => {
	const [from, to] = monthRange(month);
	return {
		from,
		to
	};
};
const yearWindow = (year) => ({
	from: `${year}-01-01`,
	to: `${year}-12-31`
});
const inWin = (d, w) => !!d && d >= w.from && d <= w.to;
/** Primera y segunda mitad de una ventana (por fecha). */
function halves(w) {
	const days = Math.round((Date.parse(`${w.to}T00:00:00Z`) - Date.parse(`${w.from}T00:00:00Z`)) / 864e5);
	const mid = addDays(w.from, Math.floor(days / 2));
	return [{
		from: w.from,
		to: mid
	}, {
		from: addDays(mid, 1),
		to: w.to
	}];
}
const byKey = (a, b) => {
	for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) {
		const d = (b.key[i] ?? 0) - (a.key[i] ?? 0);
		if (Math.abs(d) > 1e-9) return d;
	}
	return 0;
};
/** Jugadores de la cuenta de un jugador en ese deporte (la línea base mira todo su historial), o él solo. */
function selfPlayers(kit, p) {
	const u = kit.userOf(p);
	const sport = kit.sportOf(kit.players.get(p)?.league_id ?? "");
	if (!u) return [p];
	return [...kit.players.values()].filter((x) => x.user_id === u && kit.sportOf(x.league_id) === sport).map((x) => x.id);
}
const entryIndex = /* @__PURE__ */ new WeakMap();
function entryOf(kit, id) {
	let m = entryIndex.get(kit);
	if (!m) {
		m = new Map((kit.snap.entries ?? []).map((e) => [e.id, e]));
		entryIndex.set(kit, m);
	}
	return m.get(id);
}
/** Juegos B1 de una liga en la ventana (oficiales y práctica), en orden de juego. */
const leagueBowling = (kit, leagueId, w) => kit.bowling().filter((g) => g.league_id === leagueId && inWin(g.date, w));
/** Hándicap por juego de su participación (solo torneos): el fijado a mano o el de la regla del evento. */
function gameHcp(kit, g) {
	const e = entryOf(kit, g.entry_id);
	const ev = kit.events.get(g.event_id);
	if (!e || !ev || ev.type !== "torneo") return 0;
	return e.handicap_override ?? calcHandicap(e.average, ev.hcp_base, ev.hcp_percent);
}
/** ¿La mayoría de los torneos rankean por hándicap? (`individual_rank_by` hcp con `hcp_percent` > 0). */
function hcpMajority(kit, eventIds) {
	let n = 0;
	let hcp = 0;
	for (const id of new Set(eventIds)) {
		const e = kit.events.get(id);
		if (!e || e.type !== "torneo") continue;
		n++;
		if (e.hcp_percent > 0 && (e.individual_rank_by ?? "hcp") === "hcp") hcp++;
	}
	return n > 0 && hcp * 2 > n;
}
/**
* Figura de boliche: promedio de los juegos B1 de torneos (con hándicap si la mayoría rankea así). Desempates: más
* juegos, juego más alto. Solo los que llegan al mínimo.
*/
function bowlingFigure(kit, leagueId, w, o) {
	const games = leagueBowling(kit, leagueId, w).filter((g) => g.official);
	const dates = new Set(games.map((g) => g.date));
	const hcp = hcpMajority(kit, games.map((g) => g.event_id));
	const total = o.allGames ? new Set(games.map((g) => g.event_id)) : null;
	const allGames = total ? [...total].reduce((n, e) => n + (kit.events.get(e)?.games ?? 0), 0) : 0;
	const out = [];
	for (const [p, list] of groupBy(games, (g) => g.player_id)) {
		const nd = new Set(list.map((g) => g.date)).size;
		if (!(dates.size < 3 && o.fewGames !== void 0 ? nd === dates.size && list.length >= o.fewGames : list.length >= o.minGames && nd >= o.minDates && (!o.datesPct || nd * 100 >= o.datesPct * dates.size)) || total && list.length < allGames) continue;
		const sum = list.reduce((n, g) => n + g.score + (hcp ? gameHcp(kit, g) : 0), 0);
		const avg = sum / list.length;
		const high = Math.max(...list.map((g) => g.score));
		out.push({
			p,
			key: o.allGames ? [sum, high] : [
				avg,
				list.length,
				high
			],
			values: {
				valor: o.allGames ? `${sum} pinos` : `promedio ${Math.floor(avg)} en ${list.length} juegos`,
				avg: round1(avg),
				games: list.length,
				hcp: hcp ? 1 : 0
			},
			refs: [...new Set(list.map((g) => `event:${g.event_id}`))].slice(0, 10)
		});
	}
	return out;
}
/** Juegos B1 de toda la historia de un jugador (y su cuenta), para la línea base. */
const bowlingHistory = (kit, p) => {
	const mine = new Set(selfPlayers(kit, p));
	return kit.bowling().filter((g) => mine.has(g.player_id));
};
/** Partidos de una liga en la ventana (por la fecha del partido). */
const leagueMatches = (kit, leagueId, w) => kit.matches.filter((m) => m.leagueId === leagueId && inWin(matchDay(kit, m), w));
/** Partido oficial a sets de raqueta (liga, torneo, cajas, escalera o suelto que se confirma). */
const officialRacket = (kit, m) => isSetsMatch(m) && isOfficialRacket(m, m.eventId ? kit.events.get(m.eventId)?.type : null);
/** Partidos R2 a sets de unos jugadores (en unas ligas), con marcador orientado a su lado. */
function racketLines(kit, players, ms, officialOnly) {
	const mine = new Set(players);
	const out = [];
	for (const m of ms) {
		const sport = kit.sportOf(m.leagueId);
		if (!isRacketSport(sport) || !isSetsMatch(m) || officialOnly && !officialRacket(kit, m)) continue;
		const date = matchDay(kit, m);
		if (!date) continue;
		for (const side of [1, 2]) for (const p of sidePlayers(m.sides[side - 1], kit.rosterOf)) {
			if (!mine.has(p) || !r2Reason(m, p, matchCtx(kit, m))) continue;
			const s = Array.isArray(m.score?.sides) ? m.score.sides : [0, 0];
			const g = racketGames(m, sport);
			out.push({
				m,
				p,
				side,
				date,
				won: wonBy(m, p, kit.rosterOf),
				sets: side === 1 ? [s[0], s[1]] : [s[1], s[0]],
				games: g ? side === 1 ? [g[0], g[1]] : [g[1], g[0]] : null
			});
		}
	}
	return out.sort((a, b) => a.date.localeCompare(b.date) || (a.m.scheduledAt ?? "").localeCompare(b.m.scheduledAt ?? ""));
}
/** Todos los jugadores de raqueta que salen en unos partidos. */
const racketPeople = (kit, ms) => new Set(ms.flatMap((m) => [...sidePlayers(m.sides[0], kit.rosterOf), ...sidePlayers(m.sides[1], kit.rosterOf)]));
/** % de juegos ganados de unas líneas (null sin juegos). */
const pctOf = (lines) => gamesWonPct(lines.map((l) => l.games).filter((g) => !!g));
/**
* Figura de raqueta: victorias R2 en formatos oficiales. Desempates: % de victorias, diferencia de sets y de
* juegos. `scheduledPct` pide además ese % de sus partidos oficiales programados (año).
*/
function racketFigure(kit, leagueId, w, minMatches, scheduledPct = 0) {
	const ms = leagueMatches(kit, leagueId, w);
	const lines = racketLines(kit, racketPeople(kit, ms), ms, true);
	const official = ms.filter((m) => officialRacket(kit, m) && m.status !== "void");
	const out = [];
	for (const [p, list] of groupBy(lines, (l) => l.p)) {
		const scheduled = official.filter((m) => m.sides.some((s) => sidePlayers(s, kit.rosterOf).includes(p))).length;
		if (list.length < minMatches || scheduledPct && list.length * 100 < scheduledPct * scheduled) continue;
		const won = list.filter((l) => l.won).length;
		const setDiff = list.reduce((n, l) => n + l.sets[0] - l.sets[1], 0);
		const gameDiff = list.reduce((n, l) => n + (l.games ? l.games[0] - l.games[1] : 0), 0);
		out.push({
			p,
			key: [
				won,
				won / list.length,
				setDiff,
				gameDiff
			],
			values: {
				valor: `${won} victorias en ${list.length} partidos`,
				won,
				played: list.length
			},
			refs: list.slice(-10).map((l) => `match:${l.m.id}`)
		});
	}
	return out;
}
const cardIndex = /* @__PURE__ */ new WeakMap();
/** Todas las tarjetas G1 de la foto, en orden de fecha. */
function golfCards(kit) {
	let out = cardIndex.get(kit);
	if (out) return out;
	const rounds = new Map((kit.snap.golf_rounds ?? []).map((r) => [r.event_id, r]));
	const byEvent = groupBy(kit.snap.golf_cards ?? [], (c) => c.event_id);
	out = [];
	for (const card of kit.snap.golf_cards ?? []) {
		const round = rounds.get(card.event_id);
		if (!round || !isG1(card, round)) continue;
		const date = kit.events.get(card.event_id)?.date ?? (round.closed_at ?? "").slice(0, 10);
		const d = golfDifferential(card, round);
		out.push({
			card,
			round,
			date,
			diff: d?.value ?? null,
			holes: d?.holes ?? null,
			g2: isG2(card, round, byEvent.get(card.event_id) ?? [], kit.userOf)
		});
	}
	out.sort((a, b) => a.date.localeCompare(b.date) || (a.card.id < b.card.id ? -1 : 1));
	cardIndex.set(kit, out);
	return out;
}
/** Tarjetas G2 de 18 hoyos con diferencial de unos jugadores. */
const g2Diffs = (kit, players, filter = () => true) => {
	const mine = new Set(players);
	return golfCards(kit).filter((c) => mine.has(c.card.player_id) && c.g2 && c.holes === 18 && c.diff !== null && filter(c));
};
/** Figura de golf: menor diferencial medio en tarjetas G2 (desempate: el mejor diferencial suelto). */
function golfFigure(kit, leagueId, w, minCards) {
	const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
	const out = [];
	for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
		if (list.length < minCards) continue;
		const avg = mean(list.map((c) => c.diff));
		const best = Math.min(...list.map((c) => c.diff));
		out.push({
			p,
			key: [-avg, -best],
			values: {
				valor: `diferencial ${round1(avg)} en ${list.length} rondas`,
				diff: round1(avg),
				cards: list.length
			},
			refs: list.map((c) => `card:${c.card.id}`)
		});
	}
	return out;
}
/** Línea base de golf: media de las últimas `n` tarjetas G2 de 18 hoyos antes de una fecha (null con menos de `min`). */
function golfBase(kit, p, before, n = 8, min = 4) {
	const prior = g2Diffs(kit, selfPlayers(kit, p), (c) => c.date < before).slice(-n);
	return prior.length >= min ? mean(prior.map((c) => c.diff)) : null;
}
/** Tiempos W1 de unos nadadores (con el encuentro y su fecha), para las marcas personales. */
function swimHistory(kit, players) {
	const mine = new Set(players);
	const ctx = swimContext(kit.snap.swim_events ?? [], kit.snap.swim_meets ?? [], kit.userOf);
	return swimsOf((kit.snap.swim_entries ?? []).filter((e) => mine.has(e.player_id)), {
		...ctx,
		dateOf: (e) => kit.events.get(e)?.date ?? null
	});
}
/** Pasos de marca personal (cuándo bajó su marca y cuánto) de un nadador y su cuenta. */
const personalBestsOf = (kit, p) => personalBestSteps(swimHistory(kit, selfPlayers(kit, p)));
/** Pruebas W1 del nadador en la ventana (en esa liga) que ya tenían una marca anterior. */
function swimsWithPrior(kit, p, leagueId, w) {
	const swims = swimHistory(kit, selfPlayers(kit, p));
	const leagueMeets = new Set((kit.snap.swim_meets ?? []).filter((m) => m.league_id === leagueId).map((m) => m.event_id));
	return swims.filter((s) => inWin(s.date, w) && !!s.eventId && leagueMeets.has(s.eventId) && swims.some((o) => bestKey(o) === bestKey(s) && o.date < s.date)).length;
}
/** Pasos de marca personal de la ventana en encuentros de esa liga. */
function leagueBestSteps(kit, p, leagueId, w) {
	const leagueMeets = new Set((kit.snap.swim_meets ?? []).filter((m) => m.league_id === leagueId).map((m) => m.event_id));
	return personalBestsOf(kit, p).filter((s) => inWin(s.date, w) && !!s.eventId && leagueMeets.has(s.eventId));
}
/** Partidos T1 de un equipo en la ventana, en orden. */
function teamMatchesIn(kit, teamId, w) {
	return kit.matches.filter((m) => isT1(m, kit.now) && m.sides.some((s) => s.teamId === teamId) && inWin(matchDay(kit, m), w)).sort((a, b) => (matchDay(kit, a) ?? "").localeCompare(matchDay(kit, b) ?? "") || (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
}
const sideOfTeam = (m, teamId) => m.sides[0].teamId === teamId ? 1 : 2;
/** ¿El partido es T2 para ese equipo? */
const t2For = (kit, m, teamId) => t2Reason(m, sideOfTeam(m, teamId), teamMatchCtx(kit, m)) !== null;
/**
* Tabla de equipos con las reglas de la liga (`rules.table`; fútbol y sala 3/1/0, baloncesto FIBA) sobre unos
* partidos que ya cuentan (W.O. incluidos).
*/
function teamTable(kit, sport, leagueId, teamIds, ms) {
	const table = rulesPart(kit.leagues.get(leagueId)?.rules, "table");
	const final = ms.filter((m) => isFinal(m, kit.now) && m.status !== "void" && m.sides.every((s) => s.teamId && teamIds.includes(s.teamId)));
	if (sport === "basketball") return basketballStandings(teamIds, final.map(matchResultOf$1).filter((r) => !!r), table);
	return footballStandings(teamIds, final.map(matchResultOf).filter((r) => !!r), table);
}
/** Veces que cada jugador apareció con ese equipo en unos partidos (y si alguno trajo alineación). */
function appearancesFor(ms, teamId, sport) {
	const count = /* @__PURE__ */ new Map();
	let withLineup = 0;
	for (const m of ms) {
		const side = sideOfTeam(m, teamId);
		const seen = appearances(m, sport);
		if (seen.size) withLineup++;
		for (const [p, s] of seen) if (s === side) count.set(p, (count.get(p) ?? 0) + 1);
	}
	return {
		count,
		withLineup
	};
}
//#endregion
//#region src/badges/evaluators/month.ts
/**
* Insignias del mes (docs/insignias.md §2.9), que se evalúan el día 3 por el mes anterior: las de liga
* (`month_league`: figura, mayor progreso, racha, asistencia perfecta, equipo del mes, goleador y valla menos
* vencida), las de cuenta (`month_account`: tu mejor mes y fijo del mes) y la constancia (`month_streak`). Las de
* liga piden liga con peso para el mes y `kind='liga'`; todas quedan firmes (§3.4).
*/
const def$6 = (key) => badgeDef(key);
/** Meses que evalúa un trabajo: el del ref, o en el historial todos los que ya vencieron desde el primero con datos. */
function monthsOf(kit, leagueId) {
	const m = jobMonth(kit.job);
	if (m) return [m];
	if (kit.job.kind !== "historial") return [];
	const rows = kit.leagueMonths().filter((r) => !leagueId || r.league_id === leagueId);
	if (!rows.length) return [];
	const first = rows.map((r) => r.month).sort()[0];
	return monthsBetween(first, lastDueMonth(kit.today));
}
/** El último mes que ya se puede evaluar (el día 3 del mes siguiente). */
function lastDueMonth(today) {
	const m = addMonths(monthOf(today), -1);
	return monthDueOn(m) <= today ? m : addMonths(m, -1);
}
/** ¿El jugador ya existía antes (o el mismo día) de la primera fecha? */
const existedBy = (kit, p, date) => {
	const created = localDate(kit.players.get(p)?.created_at, kit.tzOf(kit.players.get(p)?.league_id ?? ""));
	return !!created && created <= date;
};
/** Los que mejoraron en el mes contra su línea base (§2.9 `most_improved_month`), si llegan al mínimo. */
function monthImprovers(kit, leagueId, sport, w) {
	const d = def$6("most_improved_month");
	const min = paramOf(d, "minGain", sport) ?? 0;
	const mins = MINIMUMS.progressMonth;
	const out = [];
	if (sport === "bowling") for (const [p, games] of groupBy(leagueBowling(kit, leagueId, w), (g) => g.player_id)) {
		if (games.length < mins.bowlingGames) continue;
		const base = bowlingBaseline(bowlingHistory(kit, p), w.from, { min: mins.bowlingBase });
		const gain = base ? mean(games.map((g) => g.score)) - base.base : null;
		if (gain !== null && gain >= min) out.push({
			p,
			key: [gain],
			values: {
				valor: `+${Math.round(gain)} pinos`,
				n: round1(gain),
				base: base.base
			},
			refs: []
		});
	}
	else if (isRacketSport(sport)) {
		const ms = leagueMatches(kit, leagueId, w);
		for (const [p, month] of groupBy(racketLines(kit, racketPeople(kit, ms), ms, false), (l) => l.p)) {
			if (month.length < mins.racketMatches) continue;
			const prior = racketLines(kit, selfPlayers(kit, p), kit.matches, false).filter((l) => l.date >= addDays(w.from, -90) && l.date < w.from);
			if (prior.length < mins.racketPrior90) continue;
			const a = pctOf(month);
			const b = pctOf(prior);
			if (a === null || b === null || a - b < min) continue;
			out.push({
				p,
				key: [a - b],
				values: {
					valor: `+${Math.round(a - b)} puntos de juegos ganados`,
					n: round1(a - b)
				},
				refs: month.map((l) => `match:${l.m.id}`)
			});
		}
	} else if (sport === "golf") {
		const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
		for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
			if (list.length < mins.golfCards) continue;
			const base = golfBase(kit, p, w.from, 8, mins.golfBase);
			const gain = base === null ? null : base - mean(list.map((c) => c.diff));
			if (gain !== null && gain >= min) out.push({
				p,
				key: [gain],
				values: {
					valor: `${round1(gain)} golpes menos`,
					n: round1(gain)
				},
				refs: list.map((c) => `card:${c.card.id}`)
			});
		}
	} else if (sport === "swimming") {
		const swimmers = new Set((kit.snap.swim_entries ?? []).filter((e) => e.league_id === leagueId).map((e) => e.player_id));
		for (const p of swimmers) {
			if (swimsWithPrior(kit, p, leagueId, w) < mins.swimRaces) continue;
			const gain = leagueBestSteps(kit, p, leagueId, w).reduce((n, s) => n + s.pct, 0);
			if (gain >= min) out.push({
				p,
				key: [gain],
				values: {
					valor: `+${round1(gain)} %`,
					n: round1(gain)
				},
				refs: []
			});
		}
	}
	return out;
}
/** Racha más larga del mes de cada jugador (boliche, raqueta, golf) o de cada equipo. */
function monthStreaks(kit, leagueId, sport, w) {
	const players = [];
	const teams = [];
	const best = (p, runs) => {
		const top = [...runs].sort((a, b) => b.n - a.n || b.tb - a.tb)[0];
		if (top) players.push({
			p,
			key: [top.n, top.tb],
			values: { n: top.n },
			refs: top.refs
		});
	};
	if (sport === "bowling") for (const [p, games] of groupBy(leagueBowling(kit, leagueId, w), (g) => g.player_id)) {
		const base = bowlingBaseline(bowlingHistory(kit, p), w.from);
		if (!base) continue;
		const runs = [];
		let cur = [];
		for (const g of [...games, null]) {
			if (g && g.score >= base.base) {
				cur.push(g);
				continue;
			}
			if (cur.length) runs.push({
				n: cur.length,
				tb: mean(cur.map((x) => x.score)) - base.base,
				refs: [...new Set(cur.map((x) => `event:${x.event_id}`))]
			});
			cur = [];
		}
		best(p, runs);
	}
	else if (isRacketSport(sport)) {
		const ms = leagueMatches(kit, leagueId, w).filter((m) => officialRacket(kit, m));
		for (const p of racketPeople(kit, ms)) {
			const mine = ms.filter((m) => playerSide(m, p, kit.rosterOf)).sort((a, b) => (matchDay(kit, a) ?? "").localeCompare(matchDay(kit, b) ?? ""));
			const runs = [];
			let cur = [];
			for (const m of mine) {
				const ctx = matchCtx(kit, m);
				if (!isR1(m, p, ctx)) continue;
				if (!wonBy(m, p, kit.rosterOf)) {
					if (cur.length) runs.push({
						n: cur.length,
						tb: 0,
						refs: cur
					});
					cur = [];
				} else if (r2Reason(m, p, ctx)) cur.push(`match:${m.id}`);
			}
			if (cur.length) runs.push({
				n: cur.length,
				tb: 0,
				refs: cur
			});
			best(p, runs);
		}
	} else if (sport === "golf") {
		const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
		for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
			const base = golfBase(kit, p, w.from);
			if (base === null) continue;
			const runs = [];
			let cur = [];
			for (const c of [...list, null]) {
				if (c && c.diff <= base) {
					cur.push(c);
					continue;
				}
				if (cur.length) runs.push({
					n: cur.length,
					tb: base - mean(cur.map((x) => x.diff)),
					refs: cur.map((x) => `card:${x.card.id}`)
				});
				cur = [];
			}
			best(p, runs);
		}
	} else if (isTeamSport(sport)) for (const teamId of leagueTeams(kit, leagueId)) {
		let cur = [];
		let top = [];
		for (const m of teamMatchesIn(kit, teamId, w)) {
			const r = teamOutcomeFor(m, teamId);
			if (r === "P") {
				cur = [];
				continue;
			}
			if (!t2For(kit, m, teamId) || sport === "basketball" && r !== "G") continue;
			cur = [...cur, m];
			if (cur.length > top.length) top = cur;
		}
		if (top.length) teams.push({
			p: teamId,
			teamId,
			run: top,
			key: [top.length],
			values: { n: top.length },
			refs: top.map((m) => `match:${m.id}`)
		});
	}
	return {
		players,
		teams
	};
}
const teamOutcomeFor = (m, teamId) => {
	const s = m.score?.sides;
	const side = sideOfTeam(m, teamId);
	if (Array.isArray(s) && s.length === 2) {
		const [a, b] = side === 1 ? s : [s[1], s[0]];
		return a > b ? "G" : a < b ? "P" : "E";
	}
	return m.winner === null ? null : m.winner === side ? "G" : "P";
};
/** Equipos de temporada de una liga (los de `teams` sin evento, o los que salen en sus partidos). */
function leagueTeams(kit, leagueId) {
	const own = [...kit.teams.values()].filter((t) => t.league_id === leagueId && !t.event_id).map((t) => t.id);
	if (own.length) return own;
	return [...new Set(kit.matches.filter((m) => m.leagueId === leagueId).flatMap((m) => m.sides.map((s) => s.teamId)).filter((t) => !!t))];
}
/**
* Asistencia de un jugador en la ventana (§2.9 `perfect_attendance_month`; §2.11 `season_attendance` la usa desde su
* primera actividad). Fechas: boliche, torneos con 4+ jugadores con juegos B1; raqueta, sus partidos oficiales que
* terminaron finales o por W.O.; equipos, los partidos de su equipo (todos con alineación); golf, rondas cerradas
* con 3+ tarjetas; natación, encuentros finalizados donde estaba inscrito.
*/
function attendanceIn(kit, leagueId, sport, w, opts = {}) {
	const out = /* @__PURE__ */ new Map();
	const minPlayers = paramOf(def$6("perfect_attendance_month"), "minPlayers", "bowling") ?? 4;
	const minCards = paramOf(def$6("perfect_attendance_month"), "minCards", "golf") ?? 3;
	if (sport === "bowling") {
		const games = leagueBowling(kit, leagueId, w).filter((g) => g.official);
		const dates = [...groupBy(games, (g) => g.event_id)].filter(([, gs]) => new Set(gs.map((g) => g.player_id)).size >= minPlayers);
		const players = new Set(games.map((g) => g.player_id));
		for (const p of players) {
			const present = dates.filter(([, gs]) => gs.some((g) => g.player_id === p)).length;
			out.set(p, {
				dates: dates.length,
				present,
				refs: dates.map(([e]) => `event:${e}`)
			});
		}
	} else if (isRacketSport(sport)) {
		const ms = leagueMatches(kit, leagueId, w).filter((m) => officialRacket(kit, m) && isFinal(m, kit.now));
		for (const p of racketPeople(kit, ms)) {
			const mine = ms.filter((m) => playerSide(m, p, kit.rosterOf));
			const present = mine.filter((m) => !(m.status === "walkover" && m.walkoverSide === playerSide(m, p, kit.rosterOf))).length;
			out.set(p, {
				dates: mine.length,
				present,
				refs: mine.map((m) => `match:${m.id}`)
			});
		}
	} else if (isTeamSport(sport)) for (const teamId of leagueTeams(kit, leagueId)) {
		const all = teamMatchesIn(kit, teamId, w);
		const { withLineup } = appearancesFor(all, teamId, sport);
		if (!all.length) continue;
		const share = opts.lineupShare;
		if (share === void 0 ? withLineup < all.length : withLineup < share * all.length) continue;
		const ms = all.filter((m) => appearances(m, sport).size > 0);
		const { count } = appearancesFor(ms, teamId, sport);
		const roster = (kit.snap.team_players ?? []).filter((tp) => tp.team_id === teamId).map((tp) => tp.player_id);
		for (const p of /* @__PURE__ */ new Set([...roster, ...count.keys()])) out.set(p, {
			dates: ms.length,
			present: count.get(p) ?? 0,
			refs: ms.map((m) => `match:${m.id}`),
			teamId
		});
	}
	else if (sport === "golf") {
		const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w));
		const rounds = [...groupBy(cards, (c) => c.card.event_id)].filter(([, cs]) => cs.length >= minCards);
		for (const p of new Set(cards.map((c) => c.card.player_id))) {
			const present = rounds.filter(([, cs]) => cs.some((c) => c.card.player_id === p)).length;
			out.set(p, {
				dates: rounds.length,
				present,
				refs: rounds.map(([e]) => `round:${e}`)
			});
		}
	} else if (sport === "swimming") {
		const meets = new Map((kit.snap.swim_meets ?? []).map((m) => [m.event_id, m]));
		const entries = (kit.snap.swim_entries ?? []).filter((e) => e.league_id === leagueId && !!meets.get(e.event_id)?.finalized_at && inWin(kit.events.get(e.event_id)?.date, w));
		for (const [p, list] of groupBy(entries, (e) => e.player_id)) {
			const byMeet = groupBy(list, (e) => e.event_id);
			const present = [...byMeet.values()].filter((es) => es.some((e) => e.status !== "dns")).length;
			out.set(p, {
				dates: byMeet.size,
				present,
				refs: [...byMeet.keys()].map((e) => `meet:${e}`)
			});
		}
	}
	return out;
}
/** Primera fecha oficial de la ventana (para saber si el jugador ya existía). */
function firstDate(kit, leagueId, sport, w) {
	if (sport === "bowling") return leagueBowling(kit, leagueId, w).find((g) => g.official)?.date ?? w.from;
	if (sport === "golf") return golfCards(kit).find((c) => c.card.league_id === leagueId && inWin(c.date, w))?.date ?? w.from;
	return leagueMatches(kit, leagueId, w).map((m) => matchDay(kit, m)).filter((d) => !!d).sort()[0] ?? w.from;
}
/** Quiénes de un equipo reciben: los que jugaron `share` de sus partidos; sin alineación, la plantilla. */
function teamShareholders(kit, teamId, ms, sport, share) {
	const { count, withLineup } = appearancesFor(ms, teamId, sport);
	if (withLineup > 0) {
		const need = Math.ceil(share * ms.length - 1e-9);
		return {
			players: new Map([...count].filter(([, n]) => n >= need)),
			byRoster: false
		};
	}
	const first = ms[0];
	const date = first ? matchDay(kit, first) : null;
	if (!first || !date) return {
		players: /* @__PURE__ */ new Map(),
		byRoster: true
	};
	const side = sideOfTeam(first, teamId);
	const roster = rosterFallback(first, kit.snap.team_players ?? [], date, kit.tzOf(first.leagueId));
	return {
		players: new Map([...roster].filter(([, s]) => s === side).map(([p]) => [p, 0])),
		byRoster: true
	};
}
/** Líneas TS de los partidos T2 (para su lado) de la ventana: goles o puntos, portero, recibidos. */
function statLines(kit, ms, sport) {
	const out = [];
	for (const m of ms) {
		if (!isT1(m, kit.now)) continue;
		const ctx = teamMatchCtx(kit, m);
		for (const [p, side] of appearances(m, sport)) {
			if (!countsT2(kit, {
				m,
				p,
				side,
				ctx
			})) continue;
			if (sport === "basketball") {
				const l = basketballStatLine(m, p);
				if (l) out.push({
					p,
					m,
					side,
					goals: l.points,
					keeper: false,
					conceded: 0
				});
			} else {
				const l = footballStatLine(m, p);
				if (l) out.push({
					p,
					m,
					side,
					goals: l.goals,
					keeper: l.keeper,
					conceded: l.conceded
				});
			}
		}
	}
	return out;
}
const monthLeague = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const leagueId = job.league_id;
	const league = leagueId ? kit.leagues.get(leagueId) : void 0;
	if (!league || league.kind !== "liga") return [];
	const out = [];
	for (const month of monthsOf(kit, league.id)) {
		if (!weightyMonth({
			league,
			months: kit.leagueMonths(),
			profiles: kit.profiles,
			members: kit.snap.members ?? []
		}, month)) continue;
		out.push(...monthLeagueFor(kit, league.id, league.sport, month));
	}
	return out;
};
function monthLeagueFor(kit, leagueId, sport, month) {
	const w = monthWindow(month);
	const out = [];
	const give = (key, p, r, extra = {}) => {
		const d = def$6(key);
		if (d.sports !== "all" && !d.sports.includes(sport)) return;
		out.push(awardOf(d, playerHolderOf(p, leagueId), sport, 0, periodKey.month(month), "firme", r.refs, {
			...leagueCtx(kit, leagueId),
			window: [w.from, w.to],
			values: r.values,
			...extra
		}));
	};
	const winners = (rows) => topWithTies(rows, byKey).winners;
	const fig = def$6("player_of_month");
	const figure = sport === "bowling" ? bowlingFigure(kit, leagueId, w, {
		minGames: paramOf(fig, "minGames", sport) ?? MINIMUMS.titleMonth.bowlingGames,
		minDates: paramOf(fig, "minDates", sport) ?? MINIMUMS.titleMonth.bowlingDates,
		fewGames: MINIMUMS.titleMonth.bowlingGamesFewDates
	}) : isRacketSport(sport) ? racketFigure(kit, leagueId, w, paramOf(fig, "minMatches", sport) ?? MINIMUMS.titleMonth.racketMatches) : sport === "golf" ? golfFigure(kit, leagueId, w, paramOf(fig, "minCards", sport) ?? MINIMUMS.titleMonth.golfCards) : [];
	for (const r of winners(figure)) give("player_of_month", r.p, r);
	const prev = periodKey.month(addMonths(month, -1));
	const repeat = new Set((kit.snap.awards ?? []).filter((a) => a.badge_key === "most_improved_month" && a.league_id === leagueId && a.period_key === prev && a.status !== "revocada").map((a) => a.player_id));
	for (const r of winners(monthImprovers(kit, leagueId, sport, w).filter((x) => !repeat.has(x.p)))) give("most_improved_month", r.p, r);
	const minRun = paramOf(def$6("streak_month"), "minRun", sport) ?? 4;
	const streaks = monthStreaks(kit, leagueId, sport, w);
	for (const r of winners(streaks.players.filter((x) => x.key[0] >= minRun))) give("streak_month", r.p, r);
	if (isTeamSport(sport)) {
		const share = paramOf(def$6("streak_month"), "teamShare", sport) ?? .75;
		for (const t of topWithTies(streaks.teams.filter((x) => x.key[0] >= minRun), byKey).winners) {
			const who = teamShareholders(kit, t.teamId, t.run, sport, share);
			for (const p of who.players.keys()) give("streak_month", p, t, {
				...teamCtx(kit, t.teamId),
				...who.byRoster ? { by_roster: true } : {}
			});
		}
	}
	const pa = def$6("perfect_attendance_month");
	const minDates = paramOf(pa, "minDates", sport) ?? 3;
	const first = firstDate(kit, leagueId, sport, w);
	for (const [p, a] of attendanceIn(kit, leagueId, sport, w)) if (a.dates >= minDates && a.present === a.dates && existedBy(kit, p, first)) give("perfect_attendance_month", p, {
		values: { n: a.dates },
		refs: a.refs
	}, a.teamId ? teamCtx(kit, a.teamId) : {});
	if (isTeamSport(sport)) out.push(...teamMonth(kit, leagueId, sport, month, w));
	return out;
}
function teamMonth(kit, leagueId, sport, month, w) {
	const out = [];
	const ctxBase = {
		...leagueCtx(kit, leagueId),
		window: [w.from, w.to]
	};
	const ms = leagueMatches(kit, leagueId, w).filter((m) => isFinal(m, kit.now) && m.status !== "void");
	const t1 = ms.filter((m) => isT1(m, kit.now));
	const teams = leagueTeams(kit, leagueId);
	const tom = def$6("team_of_month");
	const t2Count = new Map(teams.map((t) => [t, t1.filter((m) => m.sides.some((s) => s.teamId === t) && t2For(kit, m, t)).length]));
	if (teams.filter((t) => (t2Count.get(t) ?? 0) >= (paramOf(tom, "minTeamMatches", sport) ?? 2)).length >= (paramOf(tom, "minTeams", sport) ?? 4)) {
		const rows = teamTable(kit, sport, leagueId, teams, ms).filter((r) => (t2Count.get(r.id) ?? 0) >= (paramOf(tom, "minCandidateMatches", sport) ?? 3)).map((r) => ({
			p: r.id,
			key: [
				r.points,
				r.played ? r.points / r.played : 0,
				r.diff,
				r.for
			],
			values: { puntos: r.points },
			refs: []
		}));
		for (const t of topWithTies(rows, byKey).winners) {
			const tms = teamMatchesIn(kit, t.p, w);
			const who = teamShareholders(kit, t.p, tms, sport, paramOf(tom, "share", sport) ?? .5);
			for (const [p, n] of who.players) out.push(awardOf(tom, playerHolderOf(p, leagueId), sport, 0, periodKey.month(month), "firme", tms.map((m) => `match:${m.id}`), {
				...ctxBase,
				...teamCtx(kit, t.p),
				values: {
					jugados: n,
					total: tms.length,
					puntos: t.values.puntos
				},
				...who.byRoster ? { by_roster: true } : {}
			}));
		}
	}
	const tsm = def$6("top_scorer_month");
	const lines = statLines(kit, t1, sport);
	const scorers = [];
	for (const [p, ls] of groupBy(lines, (l) => l.p)) {
		const n = ls.reduce((a, l) => a + l.goals, 0);
		if (ls.length < (paramOf(tsm, "minMatches", sport) ?? 2) || n < (paramOf(tsm, "minGoals", sport) ?? 1)) continue;
		scorers.push({
			p,
			key: [n, n / ls.length],
			values: {
				n,
				partidos: ls.length
			},
			refs: ls.map((l) => `match:${l.m.id}`)
		});
	}
	for (const r of topWithTies(scorers, byKey).winners) out.push(awardOf(tsm, playerHolderOf(r.p, leagueId), sport, 0, periodKey.month(month), "firme", r.refs, {
		...ctxBase,
		values: r.values
	}));
	if (sport !== "basketball") {
		const csm = def$6("clean_sheet_month");
		const keepers = [];
		for (const [p, ls] of groupBy(lines.filter((l) => l.keeper), (l) => l.p)) {
			const sheets = ls.filter((l) => l.conceded === 0).length;
			if (ls.length < (paramOf(csm, "minMatches", sport) ?? 2) || sheets < 1) continue;
			const conceded = ls.reduce((a, l) => a + l.conceded, 0);
			keepers.push({
				p,
				key: [
					-conceded / ls.length,
					sheets,
					ls.length
				],
				values: {
					recibidos: conceded,
					partidos: ls.length,
					vallas: sheets
				},
				refs: ls.map((l) => `match:${l.m.id}`)
			});
		}
		for (const r of topWithTies(keepers, byKey).winners) out.push(awardOf(csm, playerHolderOf(r.p, leagueId), sport, 0, periodKey.month(month), "firme", r.refs, {
			...ctxBase,
			values: r.values
		}));
	}
	return out;
}
/** Dueños de un trabajo de cuenta: la cuenta del trabajo, o en una liga los jugadores sin cuenta. */
function accountJobTargets(kit, sports) {
	const { job } = kit;
	if (job.user_id) {
		const out = accountTargets(kit, [...kit.players.values()].filter((p) => p.user_id === job.user_id).map((p) => p.id), sports);
		return out.length ? out : [{
			holder: {
				player_id: null,
				user_id: job.user_id,
				league_id: null
			},
			user: job.user_id,
			players: []
		}];
	}
	if (!job.league_id) return [];
	return accountTargets(kit, [...kit.players.values()].filter((p) => p.league_id === job.league_id && !p.user_id).map((p) => p.id), sports);
}
/** Actividad de un dueño en ligas reales (con la cuenta fuera de las 4), hasta el día que ya cuenta. */
function targetActivity(kit, t, through) {
	const mine = new Set(t.players);
	return kit.activity().filter((a) => (t.user ? a.user_id === t.user || mine.has(a.player_id) : mine.has(a.player_id)) && realOn(kit, a.league_id, a.date, t) && (!through || a.date <= through));
}
const monthAccount = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const month = jobMonth(job);
	const months = month ? [month] : job.kind === "historial" ? monthsOf(kit, job.league_id) : [];
	const out = [];
	const w = (m) => monthWindow(m);
	const regular = def$6("monthly_regular");
	const best = def$6("personal_best_month");
	for (const t of accountJobTargets(kit)) {
		const acts = targetActivity(kit, t);
		for (const m of months) {
			for (const [sport, list] of groupBy(acts, (a) => a.sport)) {
				const n = weighDays(activeDays(list.filter((a) => inWin(a.date, w(m))), t.user ? "user" : "player")).reduce((a, d) => a + d.weight, 0);
				const level = levelFor(regular, n, sport);
				if (level !== null) out.push(awardOf(regular, t.holder, sport, level, periodKey.month(m), "firme", [], {
					window: [w(m).from, w(m).to],
					values: { n }
				}));
			}
			out.push(...personalBestMonth(kit, t, m, best));
		}
	}
	return out;
};
/** Tu mejor mes (§2.9): la media del mes gana a la de todos tus meses anteriores que calificaron (3+). */
function personalBestMonth(kit, t, month, d) {
	const out = [];
	const minPrior = paramOf(d, "minPriorMonths") ?? 3;
	const w = monthWindow(month);
	const bowlMonths = [...groupBy(kit.bowling().filter((g) => t.players.includes(g.player_id) && realOn(kit, g.league_id, g.date, t) && g.date <= w.to), (g) => monthOf(g.date))].filter(([, gs]) => gs.length >= (paramOf(d, "minGames", "bowling") ?? 9)).map(([m, gs]) => ({
		m,
		v: mean(gs.map((g) => g.score))
	}));
	const cur = bowlMonths.find((x) => x.m === month);
	const prior = bowlMonths.filter((x) => x.m < month);
	if (cur && prior.length >= minPrior) {
		const top = Math.max(...prior.map((x) => x.v));
		if (cur.v > top) out.push(awardOf(d, t.holder, "bowling", 0, periodKey.month(month), "firme", [], {
			window: [w.from, w.to],
			values: {
				valor: `+${round1(cur.v - top)} pinos`,
				avg: round1(cur.v)
			}
		}));
	}
	const golfMonths = [...groupBy(g2Diffs(kit, t.players, (c) => realOn(kit, c.card.league_id, c.date, t) && c.date <= w.to), (c) => monthOf(c.date))].filter(([, cs]) => cs.length >= (paramOf(d, "minCards", "golf") ?? 2)).map(([m, cs]) => ({
		m,
		v: mean(cs.map((c) => c.diff))
	}));
	const gcur = golfMonths.find((x) => x.m === month);
	const gprior = golfMonths.filter((x) => x.m < month);
	if (gcur && gprior.length >= minPrior) {
		const top = Math.min(...gprior.map((x) => x.v));
		if (gcur.v < top) out.push(awardOf(d, t.holder, "golf", 0, periodKey.month(month), "firme", [], {
			window: [w.from, w.to],
			values: {
				valor: `${round1(top - gcur.v)} golpes menos`,
				diff: round1(gcur.v)
			}
		}));
	}
	return out;
}
const monthStreakEval = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const d = def$6("month_streak");
	const month = jobMonth(job) ?? lastDueMonth(kit.today);
	const out = [];
	for (const t of accountJobTargets(kit)) {
		const months = activeMonths(weighDays(activeDays(targetActivity(kit, t, monthWindow(month).to), t.user ? "user" : "player")), paramOf(d, "minWeightedDays") ?? 2);
		const steps = months.filter((m) => m <= month).map((m) => ({
			n: monthStreak(months, m, paramOf(d, "wildcardWindow") ?? 12),
			m
		})).map((s) => ({
			n: s.n,
			ref: `month:${s.m}`,
			date: monthWindow(s.m).to,
			values: { mes: s.m }
		}));
		const current = monthStreak(months, month, paramOf(d, "wildcardWindow") ?? 12);
		out.push(...levelAwards(kit, d, t.holder, "all", "all", steps), progressOf(d, t.holder, "all", "all", current));
	}
	return out;
};
//#endregion
//#region src/badges/evaluators/account.ts
/**
* Insignias de cuenta que se acumulan (docs/insignias.md §2.1 y §2.12): el debut de raqueta y equipos (`debut`, la
* parte de esos deportes), kilometraje, arranque, multideporte, tres mundos y aniversario (`account_activity`), y
* la comunidad (`community`: liga en marcha, mesa técnica, buena vibra y raíces BowlingX). Solo cuenta la actividad
* en ligas reales (sin contar a la propia cuenta entre las 4) y, en las nocturnas, la de hace 48 h o más.
*/
const def$5 = (key) => badgeDef(key);
/** El partido de ese día del jugador (evidencia del debut). */
function matchOn(kit, a) {
	const m = kit.matches.find((x) => {
		if (x.leagueId !== a.league_id || matchDay(kit, x) !== a.date) return false;
		const sport = kit.sportOf(x.leagueId);
		if (isTeamSport(sport)) return appearances(x, sport).has(a.player_id) || x.sides.some((s) => s.teamId && kit.rosterOf(s.teamId).includes(a.player_id));
		return x.sides.some((s) => sidePlayers(s, kit.rosterOf).includes(a.player_id));
	});
	return m ? `match:${m.id}` : null;
}
/** Primera actividad válida del deporte en una liga real (la plantilla vale para el debut en equipos). */
function debutFor(kit, t, sport) {
	const d = def$5("debut");
	const mine = new Set(t.players);
	const first = kit.activity().filter((a) => a.sport === sport && mine.has(a.player_id) && realOn(kit, a.league_id, a.date, t)).sort((a, b) => a.date.localeCompare(b.date))[0];
	const out = [];
	if (first) {
		const ref = matchOn(kit, first);
		out.push(awardOf(d, t.holder, sport, 0, periodKey.always, statusFor(kit, first.date), ref ? [ref] : [], { values: { fecha: first.date } }));
	}
	out.push(...revokeStale(kit, out, {
		holders: [t.holder],
		keys: ["debut"],
		sport,
		period: (k) => k === periodKey.always
	}));
	return out;
}
/** Evaluador de debut para unos deportes (el trabajo trae los jugadores del partido, del vínculo o de la liga). */
const debutOf = (sports) => (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const players = jobPlayers(kit);
	const out = [];
	for (const sport of sports) {
		const mine = players.filter((p) => kit.sportOf(kit.players.get(p)?.league_id ?? "") === sport);
		for (const t of accountTargets(kit, mine, [sport])) out.push(...debutFor(kit, t, sport));
	}
	return out;
};
const racketDebut = debutOf(RACKET_SPORTS);
const teamDebut = debutOf(TEAM_SPORTS);
function accountActivityFor(kit, t) {
	const out = [];
	const acts = targetActivity(kit, t, settledThrough(kit.now));
	const days = activeDays(acts, t.user ? "user" : "player");
	const weighted = weighDays(days);
	const mileage = def$5("mileage");
	let total = 0;
	const steps = [];
	for (const d of weighted) {
		if (!d.weight) continue;
		total += d.weight;
		steps.push({
			n: total,
			ref: `day:${d.date}`,
			date: d.date
		});
	}
	out.push(...levelAwards(kit, mileage, t.holder, "all", "all", steps), progressOf(mileage, t.holder, "all", "all", total));
	const start = def$5("strong_start");
	const win = firstWindowDays(days, paramOf(start, "windowDays") ?? 30);
	if (win) {
		const inWindow = days.filter((d) => d.date <= win.last);
		const hit = levelAwards(kit, start, t.holder, "all", "all", inWindow.map((d, i) => ({
			n: i + 1,
			ref: `day:${d.date}`,
			date: d.date
		})), { actual: true });
		out.push(...hit);
		if (!hit.length && kit.today <= addDays(win.last, 1)) out.push(progressOf(start, t.holder, "all", "all", win.days));
		else out.push({
			...progressOf(start, t.holder, "all", "all", win.days),
			next_level: null
		});
	}
	const minDays = paramOf(def$5("multisport"), "minDaysPerSport") ?? 3;
	const reached = [];
	for (const [sport, list] of groupBy(acts, (a) => a.sport)) {
		const dates = [...new Set(list.map((a) => a.date))].sort();
		if (dates.length >= minDays) reached.push({
			sport,
			date: dates[minDays - 1]
		});
	}
	reached.sort((a, b) => a.date.localeCompare(b.date));
	const multi = def$5("multisport");
	const sportSteps = reached.map((r, i) => ({
		n: i + 1,
		ref: `sport:${r.sport}`,
		date: r.date,
		values: { deportes: reached.slice(0, i + 1).map((x) => x.sport).join(",") }
	}));
	out.push(...levelAwards(kit, multi, t.holder, "all", "all", sportSteps), progressOf(multi, t.holder, "all", "all", reached.length));
	const families = familiesOf(reached.map((r) => r.sport));
	if (families.has("series") && families.has("racket") && families.has("team")) {
		const when = (fam) => reached.find((r) => SPORT_FAMILY[r.sport] === fam).date;
		const date = [
			when("series"),
			when("racket"),
			when("team")
		].sort().pop();
		out.push(awardOf(def$5("three_worlds"), t.holder, "all", 0, periodKey.always, statusFor(kit, date), [], { values: { fecha: date } }));
	}
	if (t.user) out.push(...anniversary(kit, t, weighted));
	return out;
}
function anniversary(kit, t, weighted) {
	const d = def$5("anniversary");
	const profile = kit.profiles.get(t.user);
	if (!profile) return [];
	const created = localDate(profile.created_at, BADGE_TZ) ?? profile.created_at.slice(0, 10);
	const start = profile.bowlingx && profile.first_import_on && profile.first_import_on < created ? profile.first_import_on : created;
	const min = paramOf(d, "minWeightedDays") ?? 12;
	const out = [];
	for (const l of d.levels) {
		const years = Number(l.threshold);
		const on = `${Number(start.slice(0, 4)) + years}${start.slice(4)}`;
		if (on > kit.today) continue;
		const from = addDays(on, -365);
		const n = weighted.filter((x) => x.date >= from && x.date < on).reduce((a, x) => a + x.weight, 0);
		if (n >= min) out.push(awardOf(d, t.holder, "all", l.level, periodKey.always, "firme", [], { values: {
			n: years,
			dias: n,
			fecha: on
		} }));
	}
	return out;
}
const accountActivity = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	return accountJobTargets(kit).flatMap((t) => accountActivityFor(kit, t));
};
/**
* Liga en marcha (§2.12): para el dueño de la liga al evaluar, jugadores distintos con 3+ días activos en ella en
* meses de liga real, y 6+ de ellos cuentas establecidas distintas. Un nivel por liga (`l:<liga>`); se queda aunque
* la transfiera. Una liga con menores sale sin nombre.
*/
function leagueBuilder(kit, userId) {
	const d = def$5("league_builder");
	const minDays = paramOf(d, "minDaysPerPlayer") ?? 3;
	const minAccounts = paramOf(d, "minAccounts") ?? 6;
	const through = settledThrough(kit.now);
	const out = [];
	for (const league of kit.leagues.values()) {
		if (league.owner_id !== userId) continue;
		const acts = kit.activity().filter((a) => a.league_id === league.id && a.date <= through && realOn(kit, league.id, a.date, { user: userId }));
		const steps = [];
		const counted = /* @__PURE__ */ new Set();
		const accounts = /* @__PURE__ */ new Set();
		const days = /* @__PURE__ */ new Map();
		for (const a of [...acts].sort((x, y) => x.date.localeCompare(y.date))) {
			const set = days.get(a.player_id) ?? /* @__PURE__ */ new Set();
			set.add(a.date);
			days.set(a.player_id, set);
			if (set.size < minDays || counted.has(a.player_id)) continue;
			counted.add(a.player_id);
			const u = a.user_id ?? kit.userOf(a.player_id);
			if (u && isEstablished(kit.profiles.get(u), a.date)) accounts.add(u);
			if (accounts.size >= minAccounts) steps.push({
				n: counted.size,
				ref: `league:${league.id}`,
				date: a.date
			});
		}
		const name = league.has_minors ? "Liga juvenil privada" : league.name;
		const given = new Set((kit.snap.awards ?? []).filter((a) => a.badge_key === d.key && a.period_key === periodKey.league(league.id) && a.user_id !== userId && a.status !== "revocada").map((a) => a.level));
		for (const aw of levelAwards(kit, d, {
			player_id: null,
			user_id: userId,
			league_id: null
		}, "all", "all", steps, { context: { league: {
			id: league.id,
			name
		} } })) if (!given.has(aw.level)) out.push({
			...aw,
			period_key: periodKey.league(league.id),
			status: "firme"
		});
	}
	return out;
}
/**
* Mesa técnica (§2.12): días de servicio = (liga real, fecha) en que la cuenta dejó final un partido, aprobó el
* envío de otro, anotó natación o cerró una ronda de golf (SQL ya filtró los días en que tenía jugadores propios).
*/
function tableCrew(kit, userId) {
	const d = def$5("table_crew");
	const through = settledThrough(kit.now);
	const acts = (kit.snap.service ?? []).filter((s) => (s.user_id ?? userId) === userId && s.date <= through && realOn(kit, s.league_id, s.date, { user: userId }));
	const days = [...new Set(acts.map((s) => `${s.league_id}|${s.date}`))].map((k) => k.split("|")[1]).sort();
	const steps = days.map((date, i) => ({
		n: i + 1,
		ref: `day:${date}`,
		date
	}));
	const holder = {
		player_id: null,
		user_id: userId,
		league_id: null
	};
	return [...levelAwards(kit, d, holder, "all", "all", steps), progressOf(d, holder, "all", "all", days.length)];
}
/**
* Buena vibra (§2.12): personas distintas (una cuenta cuenta una vez) que la cuenta felicitó, que no son jugadores
* suyos, tienen un día activo en una liga real (sin contar a la cuenta entre sus 4: jugadores inventados en una liga
* de uno no cuentan) y juegan en una liga donde la cuenta es miembro; los niveles piden 2, 3 o 6 meses distintos.
* Nunca en ligas con menores. Quitar la reacción después no la retira.
*/
function goodVibes(kit, userId) {
	const d = def$5("good_vibes");
	const memberOf = new Set((kit.snap.members ?? []).filter((m) => m.user_id === userId).map((m) => m.league_id));
	const own = new Set([...kit.players.values()].filter((p) => p.user_id === userId).map((p) => p.id));
	const active = /* @__PURE__ */ new Set();
	for (const a of kit.activity()) if (!active.has(a.player_id) && realOn(kit, a.league_id, a.date, { user: userId })) active.add(a.player_id);
	const people = /* @__PURE__ */ new Set();
	const months = /* @__PURE__ */ new Set();
	const steps = [];
	for (const c of [...kit.snap.cheers ?? []].sort((a, b) => a.at.localeCompare(b.at))) {
		if (own.has(c.player_id) || c.user_id === userId || c.active === false || !active.has(c.player_id) || !memberOf.has(c.league_id) || kit.leagues.get(c.league_id)?.has_minors) continue;
		const date = localDate(c.at, BADGE_TZ) ?? c.at.slice(0, 10);
		const person = c.user_id ?? c.player_id;
		const fresh = !people.has(person);
		people.add(person);
		months.add(monthOf(date));
		if (fresh) steps.push({
			n: people.size,
			ref: `player:${c.player_id}`,
			date,
			values: { meses: months.size }
		});
	}
	const holder = {
		player_id: null,
		user_id: userId,
		league_id: null
	};
	return [...levelAwards(kit, d, holder, "all", "all", steps, { req: (_l, s, req) => Number(s.values?.meses ?? 0) >= (req.months ?? 0) }), progressOf(d, holder, "all", "all", people.size)];
}
/** Raíces BowlingX: cuenta que viene de BowlingX (`firebase_uid`) y jugó al menos un día en MatchMate. */
function bowlingxRoots(kit, t) {
	if (!(t.user ? kit.profiles.get(t.user) : void 0)?.bowlingx) return [];
	const first = targetActivity(kit, t, settledThrough(kit.now)).sort((a, b) => a.date.localeCompare(b.date))[0];
	return first ? [awardOf(def$5("bowlingx_roots"), t.holder, "bowling", 0, periodKey.always, "firme", [], { values: { fecha: first.date } })] : [];
}
const community = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const t of accountJobTargets(kit)) {
		if (!t.user) continue;
		out.push(...leagueBuilder(kit, t.user), ...tableCrew(kit, t.user), ...goodVibes(kit, t.user), ...bowlingxRoots(kit, t));
	}
	return out;
};
//#endregion
//#region src/badges/evaluators/boxes.ts
/**
* Liga por cajas y escalera (docs/insignias.md §2.9): la cima de tu caja y subir de caja al cerrar un mes de cajas
* (`box_month`, con la foto del mes que guarda el trabajo `cajas` antes de la poda), y el número 1 de la escalera
* (`ladder_month`, con la foto de los peldaños del día 1). El servidor recalcula las cajas con
* src/sports/formats/box.ts y las tablas de raqueta; no usa lo que calculó el teléfono.
*/
const def$4 = (key) => badgeDef(key);
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const strList = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && !!x) : [];
const int = (v, dflt) => typeof v === "number" && Number.isFinite(v) ? Math.round(v) : dflt;
/** Jugadores de un participante de caja o escalera: el jugador, o la pareja de temporada. */
const peopleOf$1 = (kit, id) => kit.teams.has(id) || kit.rosterOf(id).length ? [...kit.rosterOf(id)] : [id];
/**
* Lee la foto del trabajo `cajas`: `ref = 'box:<evento>:<mes>'` y `payload = {month: config.months[n-1] (con
* `boxes` y `moves`), rules: config.rules, points: config.points}`.
*/
function boxPhoto(ref, payload) {
	const id = refId(ref, "box");
	const [eventId, nText] = id ? id.split(":") : [];
	const month = isObj(payload.month) ? payload.month : null;
	if (!eventId || !month) return null;
	const r = isObj(payload.rules) ? payload.rules : {};
	const moves = (Array.isArray(month.moves) ? month.moves : []).filter(isObj).flatMap((m) => {
		const move = m.move === "sube" || m.move === "baja" || m.move === "queda" || m.move === "nuevo" ? m.move : null;
		return typeof m.id === "string" && move ? [{
			id: m.id,
			from: typeof m.from === "number" ? m.from : null,
			to: int(m.to, 0),
			move
		}] : [];
	});
	return {
		eventId,
		n: int(month.n, Number(nText) || 0),
		start: typeof month.start === "string" ? month.start : null,
		end: typeof month.end === "string" ? month.end : null,
		boxes: (Array.isArray(month.boxes) ? month.boxes : []).map(strList).filter((b) => b.length > 0),
		moves,
		rules: {
			up: int(r.up, 2),
			down: int(r.down, 2),
			minToPromote: int(r.minToPromote, 2),
			minToStay: int(r.minToStay, 2),
			min: int(r.min, 4),
			max: int(r.max, 6)
		},
		points: payload.points === "2-0" ? "2-0" : "standard"
	};
}
/** Tabla de cada caja del mes con los desempates del deporte (como `boxTables` de la app). */
function boxTablesOf(kit, sport, photo, matches) {
	const list = matches.filter((m) => m.eventId === photo.eventId && m.round === photo.n && m.status !== "void");
	return photo.boxes.map((box, b) => pairStandings(sport, box, list, {
		scheme: photo.points,
		now: kit.now,
		lotSeed: `${photo.eventId}:${photo.n}:${b}`
	}));
}
/** Partidos R1 del mes de cada participante (un jugador de la pareja basta). */
function r1Count(kit, photo, id) {
	const people = peopleOf$1(kit, id);
	return kit.matches.filter((m) => m.eventId === photo.eventId && m.round === photo.n && people.some((p) => isR1(m, p, matchCtx(kit, m)))).length;
}
const boxMonth = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const photo = boxPhoto(job.ref, job.payload ?? {});
	const event = photo ? kit.events.get(photo.eventId) : void 0;
	const league = event ? kit.leagues.get(event.league_id) : void 0;
	const sport = league?.sport;
	if (!photo || !event || !league || !isRacketSport(sport)) return [];
	const date = photo.end ?? photo.start ?? event.date;
	const month = monthOf(date);
	if (!realOn(kit, league.id, date)) return [];
	const top = def$4("box_top_month");
	const promoted = def$4("box_promoted");
	const tables = boxTablesOf(kit, sport, photo, kit.matches);
	const out = [];
	const ctx = {
		...leagueCtx(kit, league.id),
		...eventCtx(kit, event.id)
	};
	const give = (d, id, values) => {
		for (const p of peopleOf$1(kit, id)) out.push(awardOf(d, playerHolderOf(p, league.id), sport, 0, periodKey.box(event.id, photo.n), "firme", [`event:${event.id}`], {
			...ctx,
			values
		}));
	};
	const minPlayers = paramOf(top, "minPlayers", sport) ?? 3;
	const minMatches = paramOf(top, "minMatches", sport) ?? 2;
	tables.forEach((rows, b) => {
		if (photo.boxes[b].filter((id) => r1Count(kit, photo, id) >= minMatches).length < minPlayers) return;
		const games = (r) => sport === "pickleball" ? Number(r.extra?.setsDiff ?? 0) : r.diff;
		const sorted = [...rows].sort((a, c) => c.won - a.won || games(c) - games(a));
		const first = sorted[0];
		if (!first) return;
		const tied = sorted.filter((r) => r.won === first.won && games(r) === games(first));
		if (tied.length > 3) return;
		for (const r of tied) if (r.played >= photo.rules.minToPromote) give(top, r.id, {
			caja: b + 1,
			n: r.won
		});
	});
	if (weightyMonth({
		league,
		months: kit.leagueMonths(),
		profiles: kit.profiles,
		members: kit.snap.members ?? []
	}, month)) {
		const recalc = closeBoxMonth(photo.boxes, tables, photo.rules);
		const up = new Map(recalc.moves.filter((m) => m.move === "sube").map((m) => [m.id, m.to]));
		for (const m of photo.moves) if (m.move === "sube" && up.has(m.id)) give(promoted, m.id, { caja: up.get(m.id) + 1 });
	}
	return out;
};
/**
* Número 1 de la escalera (§2.9 `ladder_top`): en la foto del día 1 (`payload.rungs`, o `snapshot.ladder_rungs`)
* está en el puesto 1 de una escalera de 8+ peldaños y durante el mes ganó como retador o defendió el puesto en un
* reto jugado, con partido R2. Así no cuenta que el admin lo ponga primero con `set_ladder`.
*/
const ladderMonth = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const d = def$4("ladder_top");
	const id = refId(job.ref, "ladder");
	const [eventId, month] = id ? [id.slice(0, id.lastIndexOf(":")), id.slice(id.lastIndexOf(":") + 1)] : [];
	const event = eventId ? kit.events.get(eventId) : void 0;
	const league = event ? kit.leagues.get(event.league_id) : void 0;
	const sport = league?.sport;
	if (!event || !league || !isRacketSport(sport) || !/^\d{4}-\d{2}$/.test(month ?? "")) return [];
	const photo = (Array.isArray(job.payload?.rungs) ? job.payload.rungs : snap.ladder_rungs ?? []).filter((r) => r.event_id === event.id);
	if (photo.length < (paramOf(d, "minRungs", sport) ?? 8)) return [];
	const first = photo.find((r) => r.position === 1);
	if (!first || !realOn(kit, league.id, `${month}-01`)) return [];
	const e = first.entrant_id;
	const people = peopleOf$1(kit, first.team_id ?? first.player_id ?? e);
	const byId = new Map(kit.matches.map((m) => [m.id, m]));
	const won = (snap.ladder_challenges ?? []).filter((c) => {
		if (c.event_id !== event.id || c.status !== "played" || c.winner !== e || c.challenger !== e && c.challenged !== e || !c.match_id) return false;
		if (dayIn(kit, c.resolved_at, league.id)?.slice(0, 7) !== month) return false;
		const m = byId.get(c.match_id);
		return !!m && isFinal(m, kit.now) && people.some((p) => playerSide(m, p, kit.rosterOf) && r2Reason(m, p, matchCtx(kit, m)));
	});
	if (!won.length) return [];
	return people.map((p) => awardOf(d, playerHolderOf(p, league.id), sport, 0, periodKey.month(month), "firme", won.map((c) => `match:${c.match_id}`), {
		...leagueCtx(kit, league.id),
		...eventCtx(kit, event.id),
		values: {
			peldanos: photo.length,
			retos: won.length
		}
	}));
};
//#endregion
//#region src/sports/golf/leaderboard.ts
/**
* Golf: leaderboard de una ronda o de un torneo de varias rondas, con desempate por countback,
* y orden de mérito de la temporada.
*
* - Orden: menor neto o bruto (contra el par, así sirve a mitad de ronda y con salidas de par distinto)
*   o mayor Stableford. Los descalificados van al final y sin puesto; los que no han empezado, antes de ellos.
* - Countback (Procedimientos del Comité 5A(3)), solo cuando todos los empatados terminaron:
*   con varias rondas primero la última ronda; después los últimos 9, 6, 3 y 1 hoyos de la última ronda.
*   Siempre por NÚMERO de hoyo (10–18, 13–18, 16–18, 18) aunque hayan salido por otro hoyo (shotgun).
*   En neto se resta la parte proporcional del handicap de juego (1/2, 1/3, 1/6, 1/18), sin redondear.
*   En Stableford cuentan los puntos de esos hoyos. Con 9 hoyos: últimos 6, 3 y 1 (6/9, 3/9, 1/9).
* - Si el countback no decide, comparten el puesto (el comité decide si hace falta un ganador).
*/
const EPS = 1e-9;
function sumOrNull(xs) {
	return xs.some((x) => x == null) ? null : xs.reduce((a, b) => a + b, 0);
}
/** Tramos del countback según los hoyos de la ronda: [9, 6, 3, 1] con 18, [6, 3, 1] con 9. */
function countbackSegments(holes) {
	return [
		9,
		6,
		3,
		1
	].filter((s) => s < holes);
}
/**
* Claves del countback de un jugador que terminó, en orden, normalizadas para que MENOR sea mejor.
*/
function countbackKeys(scores, comp) {
	const keys = [];
	const sign = higherWins(comp) ? -1 : 1;
	const last = scores[scores.length - 1];
	if (!last) return keys;
	if (scores.length > 1) keys.push({
		label: "última ronda",
		v: sign * (roundValue(last, comp) ?? 0)
	});
	const byNumber = [...last.holes].sort((a, b) => a.number - b.number);
	const n = byNumber.length;
	countbackSegments(n).forEach((s) => {
		const seg = byNumber.slice(n - s);
		const label = s === 1 ? "último hoyo" : `últimos ${s}`;
		if (comp.format === "stableford") {
			keys.push({
				label,
				v: -seg.reduce((a, h) => a + (h.points ?? 0), 0)
			});
			return;
		}
		const toPar = seg.reduce((a, h) => a + (h.score ?? 0) - h.par, 0);
		keys.push({
			label,
			v: toPar - (comp.basis === "net" ? last.playingHcp * s / n : 0)
		});
	});
	return keys;
}
/** Leaderboard de una ronda o de un torneo (suma de rondas). Cada jugador trae sus hoyos y su handicap de juego. */
function golfLeaderboard(players, comp, opts = {}) {
	const nRounds = opts.rounds ?? Math.max(1, ...players.map((p) => p.rounds.length));
	const useCountback = opts.countback ?? true;
	const higher = higherWins(comp);
	const rows = players.map((p, order) => {
		const scores = Array.from({ length: nRounds }, (_, i) => p.rounds[i] ?? null).map((r) => r ? scoreRound(r, comp) : null);
		const started = scores.filter((s) => !!s && s.thru > 0);
		const current = [...started].pop();
		const dq = !!p.dq || scores.some((s) => s?.dq);
		const complete = scores.every((s) => s?.complete);
		const value = started.length ? sumOrNull(started.map((s) => roundValue(s, comp))) : null;
		return {
			row: {
				id: p.id,
				rank: null,
				rounds: scores,
				value: dq ? null : value,
				gross: started.length ? sumOrNull(started.map((s) => s.gross)) : null,
				net: started.length ? sumOrNull(started.map((s) => s.net)) : null,
				points: started.reduce((a, s) => a + s.points, 0),
				toPar: started.length ? sumOrNull(started.map((s) => s.toPar)) : null,
				netToPar: started.length ? sumOrNull(started.map((s) => s.netToPar)) : null,
				holesPlayed: started.reduce((a, s) => a + s.thru, 0),
				thru: current?.thru ?? 0,
				roundsDone: scores.filter((s) => s?.complete).length,
				complete,
				dq
			},
			keys: complete && !dq ? countbackKeys(scores, comp) : null,
			order
		};
	});
	const active = rows.filter((r) => !r.row.dq && r.row.value != null);
	const notStarted = rows.filter((r) => !r.row.dq && r.row.value == null);
	const dqs = rows.filter((r) => r.row.dq);
	const norm = (v) => higher ? -v : v;
	active.sort((a, b) => norm(a.row.value) - norm(b.row.value) || b.row.holesPlayed - a.row.holesPlayed || a.order - b.order);
	const out = [];
	let i = 0;
	while (i < active.length) {
		let j = i + 1;
		while (j < active.length && Math.abs(active[j].row.value - active[i].row.value) < EPS) j++;
		const group = active.slice(i, j);
		const rankBase = i + 1;
		if (group.length > 1 && useCountback && group.every((g) => g.keys)) {
			group.sort((a, b) => {
				const ka = a.keys;
				const kb = b.keys;
				for (let k = 0; k < Math.min(ka.length, kb.length); k++) {
					const d = ka[k].v - kb[k].v;
					if (Math.abs(d) > EPS) return d;
				}
				return a.order - b.order;
			});
			group.forEach((g, k) => {
				if (k === 0) {
					g.row.rank = rankBase;
					return;
				}
				const prev = group[k - 1];
				const diff = g.keys.findIndex((key, x) => x < prev.keys.length && Math.abs(key.v - prev.keys[x].v) > EPS);
				if (diff === -1) g.row.rank = prev.row.rank;
				else {
					g.row.rank = rankBase + k;
					g.row.decidedBy = g.keys[diff].label;
				}
			});
		} else group.forEach((g) => g.row.rank = rankBase);
		out.push(...group.map((g) => g.row));
		i = j;
	}
	out.push(...notStarted.map((r) => r.row), ...dqs.map((r) => r.row));
	return out;
}
/** Puntos del orden de mérito por puesto (configurable por la liga). */
const DEFAULT_MERIT_POINTS = [
	25,
	20,
	16,
	13,
	11,
	10,
	9,
	8,
	7,
	6,
	5,
	4,
	3,
	2,
	1
];
/**
* Puntos de un puesto compartido: se suman los puntos de los puestos empatados y se reparten.
* Empatados 2 en el 2.º con [25, 20, 16] → (20 + 16) / 2 = 18.
*/
function sharedPoints(place, tied, table) {
	let total = 0;
	for (let k = 0; k < tied; k++) total += table[place - 1 + k] ?? 0;
	return total / tied;
}
/** Orden de mérito de la temporada: puntos por puesto en cada evento; empates en el evento reparten puntos. */
function orderOfMerit(events, table = DEFAULT_MERIT_POINTS) {
	const acc = /* @__PURE__ */ new Map();
	events.forEach((ev) => {
		const tiedAt = /* @__PURE__ */ new Map();
		ev.rows.forEach((r) => r.rank != null && tiedAt.set(r.rank, (tiedAt.get(r.rank) ?? 0) + 1));
		ev.rows.forEach((r) => {
			const m = acc.get(r.id) ?? {
				id: r.id,
				points: 0,
				events: 0,
				wins: 0,
				best: null,
				rank: 0
			};
			m.events++;
			if (r.rank != null) {
				m.points += sharedPoints(r.rank, tiedAt.get(r.rank), table);
				if (r.rank === 1) m.wins++;
				m.best = m.best == null ? r.rank : Math.min(m.best, r.rank);
			}
			acc.set(r.id, m);
		});
	});
	const list = [...acc.values()].map((m) => ({
		...m,
		points: Math.round(m.points * 100) / 100
	}));
	list.sort((a, b) => b.points - a.points || b.wins - a.wins);
	list.forEach((m, k) => {
		const prev = list[k - 1];
		m.rank = prev && m.points === prev.points && m.wins === prev.wins ? prev.rank : k + 1;
	});
	return list;
}
//#endregion
//#region src/sports/swimming/results.ts
const POINTS_6_LANES = [
	6,
	4,
	3,
	2,
	1
];
/** Puntos de un puesto compartido por `tied` nadadores: la suma de los puestos empatados repartida. */
function splitPoints(place, tied, table) {
	let total = 0;
	for (let k = 0; k < tied; k++) total += table[place - 1 + k] ?? 0;
	return total / tied;
}
const counts = (r) => r.status === "ok" && r.time != null && r.time > 0;
/**
* Puestos y puntos de una prueba. Devuelve las filas agrupadas por sexo y categoría (en el orden en que
* aparece cada grupo), y dentro de cada grupo por puesto; al final del grupo los que no cuentan.
*/
function placeResults(results, table = POINTS_6_LANES) {
	const groups = /* @__PURE__ */ new Map();
	results.forEach((r) => {
		const key = `${r.gender ?? ""}|${r.ageGroup ?? ""}`;
		groups.set(key, [...groups.get(key) ?? [], r]);
	});
	const out = [];
	groups.forEach((rows) => {
		const ok = rows.filter(counts).sort((a, b) => a.time - b.time);
		const rest = rows.filter((r) => !counts(r));
		let i = 0;
		while (i < ok.length) {
			let j = i + 1;
			while (j < ok.length && ok[j].time === ok[i].time) j++;
			const n = j - i;
			const points = splitPoints(i + 1, n, table);
			for (let k = i; k < j; k++) out.push({
				...ok[k],
				place: i + 1,
				points,
				tied: n > 1
			});
			i = j;
		}
		rest.forEach((r) => out.push({
			...r,
			place: null,
			points: 0,
			tied: false
		}));
	});
	return out;
}
//#endregion
//#region src/badges/evaluators/season.ts
/**
* Insignias de temporada (docs/insignias.md §2.11 y §2.12), que se evalúan cuando una fila de `public.seasons` pasa a
* `closed` (trabajo `temporada`, `ref = 'season:<id>'`): título, categoría, mayor progreso, revelación, asistencia,
* goleador, portero, juego limpio, palabra de honor y brazalete (`season_league`), y las del staff (`season_staff`:
* temporada organizada y cuerpo técnico). Piden liga con peso para temporada; las de título, `badges_auto='todas'`
* (eso lo revisa el motor). La tabla que calculó el teléfono (`seasons.standings`) queda como evidencia: el
* servidor recalcula con los mismos helpers. `season_awards` (campeón, subcampeón, tercero) solo ordena a los
* empatados en todo.
*/
const def$3 = (key) => badgeDef(key);
function give(run, key, p, level, values, extra = {}, catId, refs = []) {
	const d = def$3(key);
	if (d.sports !== "all" && !d.sports.includes(run.sport)) return;
	run.out.push(awardOf(d, playerHolderOf(p, run.league.id), run.sport, level, periodKey.season(run.season.id, catId), "firme", refs, {
		...run.ctx,
		values,
		...extra
	}));
}
/** La temporada del trabajo (cerrada) y su liga. */
function seasonOfJob(kit) {
	const id = refId(kit.job.ref, "season");
	const season = (kit.snap.seasons ?? []).find((s) => s.id === id);
	const league = season ? kit.leagues.get(season.league_id) : void 0;
	return season && league && season.status === "closed" ? {
		season,
		league
	} : null;
}
/**
* Liga con peso para la temporada (§1.7.4): competidores (jugadores, o equipos en deportes de equipo) con actividad
* en la ventana, cuentas establecidas entre ellos y cuentas que escribieron resultados.
*/
function weightySeasonFor(kit, league, w) {
	const acts = kit.activity().filter((a) => a.league_id === league.id && !a.roster && inWin(a.date, w));
	const ms = leagueMatches(kit, league.id, w);
	const competitors = isTeamSport(league.sport) ? new Set(ms.filter((m) => isT1(m, kit.now)).flatMap((m) => m.sides.map((s) => s.teamId)).filter((t) => !!t)).size : new Set(acts.map((a) => a.player_id)).size;
	const established = [...new Set(acts.map((a) => a.user_id).filter((u) => !!u))].filter((u) => isEstablished(kit.profiles.get(u), w.to)).length;
	const writers = /* @__PURE__ */ new Set();
	for (const m of ms) for (const u of [m.proposedBy, m.confirmedBy]) if (u) writers.add(u);
	for (const s of kit.snap.submissions ?? []) if (s.league_id === league.id && inWin(s.date, w) && s.reviewed_by) writers.add(s.reviewed_by);
	for (const e of kit.snap.swim_entries ?? []) if (e.league_id === league.id && e.recorded_by && inWin(kit.events.get(e.event_id)?.date, w)) writers.add(e.recorded_by);
	for (const r of kit.snap.golf_rounds ?? []) if (r.league_id === league.id && r.closed_by && inWin(kit.events.get(r.event_id)?.date, w)) writers.add(r.closed_by);
	return weightySeason({
		competitors,
		establishedAccounts: established,
		writers: writers.size
	});
}
const seasonLeague = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const found = seasonOfJob(kit);
	if (!found || !weightySeasonFor(kit, found.league, {
		from: found.season.starts_on,
		to: found.season.ends_on
	})) return [];
	const { season, league } = found;
	const w = {
		from: season.starts_on,
		to: season.ends_on
	};
	const run = {
		kit,
		season,
		league,
		sport: league.sport,
		w,
		ctx: {
			...leagueCtx(kit, league.id),
			season: {
				id: season.id,
				name: season.name
			},
			window: [w.from, w.to]
		},
		out: []
	};
	seasonPodium(run);
	categoryTitle(run);
	seasonMostImproved(run);
	seasonRookie(run);
	seasonAttendance(run);
	if (isTeamSport(league.sport)) {
		seasonScorers(run, league.sport);
		fairPlayTeam(run, league.sport);
		captainBand(run, league.sport);
	}
	fairPlay(run);
	honorWord(run);
	return run.out;
};
/** Orden del admin entre empatados en todo (`season_awards`: campeón, subcampeón, tercero). */
function adminOrder(run) {
	const rank = {
		campeon: 1,
		subcampeon: 2,
		tercero: 3
	};
	const by = /* @__PURE__ */ new Map();
	for (const a of run.kit.snap.season_awards ?? []) {
		if (a.season_id !== run.season.id || !(a.kind in rank)) continue;
		const id = a.team_id ?? a.player_id;
		if (id) by.set(id, rank[a.kind]);
	}
	return (id) => by.get(id) ?? 9;
}
/** Jugadores de un participante de la tabla (una pareja o equipo de temporada, o el jugador). */
const peopleOf = (run, id) => {
	const roster = run.kit.rosterOf(id);
	return roster.length ? [...roster] : run.kit.players.has(id) ? [id] : [];
};
function podiumFrom(run, rows, cmp, who, values, catId) {
	for (const a of podiumAwards(rows, cmp, podiumLevels(rows.length))) for (const p of who(a.row)) give(run, "season_podium", p, a.level, {
		lugar: a.place,
		...values(a.row)
	}, run.league.kind === "torneo" ? { alt: "torneo" } : {}, catId);
}
function seasonPodium(run) {
	const { kit, league, sport, w } = run;
	if (sport === "swimming") return;
	if (sport === "bowling") {
		const rows = bowlingFigure(kit, league.id, w, league.kind === "torneo" ? {
			minGames: 1,
			minDates: 1,
			allGames: true
		} : {
			minGames: MINIMUMS.titleSeason.bowlingGames,
			minDates: 1,
			datesPct: MINIMUMS.titleSeason.bowlingDatesPct
		});
		const order = adminOrder(run);
		podiumFrom(run, rows, (a, b) => byKey(a, b) || order(a.p) - order(b.p), (r) => [r.p], (r) => r.values);
		return;
	}
	if (isRacketSport(sport)) return racketSeasonPodium(run, sport);
	if (isTeamSport(sport)) return teamSeasonPodium(run, sport);
	if (sport === "golf") {
		const merit = golfMerit(run);
		const order = adminOrder(run);
		podiumFrom(run, merit.rows, (a, b) => a.rank - b.rank || order(a.id) - order(b.id), (r) => [r.id], (r) => ({ n: r.points }));
	}
}
function racketSeasonPodium(run, sport) {
	const { kit, league, w } = run;
	const events = [...kit.events.values()].filter((e) => e.league_id === league.id && inWin(e.date, w));
	if (league.kind === "torneo") {
		for (const e of events.filter((x) => x.type === "torneo")) for (const cat of racketTourneyPodium(kit, e.id, e.config)) for (const place of cat.places) for (const p of place.players) give(run, "season_podium", p, place.level, { categoria: cat.catId }, { alt: "torneo" }, cat.catId, [`match:${place.match.id}`]);
		return;
	}
	const ms = leagueMatches(kit, league.id, w);
	const order = adminOrder(run);
	const box = [...kit.events.values()].find((e) => e.league_id === league.id && e.type === "cajas" && ms.some((m) => m.eventId === e.id));
	if (box) {
		const months = Array.isArray(box.config?.months) ? box.config.months : [];
		const closed = new Set(months.filter((m) => m?.closed === true).map((m) => m.n));
		const last = [...new Set(ms.filter((m) => m.eventId === box.id && m.round !== null && closed.has(m.round)).map((m) => m.round))].sort((a, b) => b - a)[0];
		if (last !== void 0) {
			const top = ms.filter((m) => m.eventId === box.id && m.round === last && m.stage === "Caja 1" && m.status !== "void");
			const ids = [...new Set(top.flatMap((m) => m.sides.map((s) => s.teamId ?? s.players[0]?.playerId)).filter((x) => !!x))];
			const first = pairStandings(sport, ids, top, { now: kit.now })[0];
			if (first && ids.length >= 4) for (const p of peopleOf(run, first.id)) give(run, "season_podium", p, 3, {
				lugar: 1,
				caja: 1
			});
		}
		return;
	}
	const ladder = [...kit.events.values()].find((e) => e.league_id === league.id && e.type === "escalera");
	if (ladder) {
		const rungs = (kit.snap.ladder_rungs ?? []).filter((r) => r.event_id === ladder.id).sort((a, b) => a.position - b.position);
		const played = (id) => (kit.snap.ladder_challenges ?? []).filter((c) => c.event_id === ladder.id && c.status === "played" && (c.challenger === id || c.challenged === id) && inWin((c.resolved_at ?? "").slice(0, 10), w)).length;
		rungs.slice(0, 3).forEach((r, i) => {
			const n = played(r.entrant_id);
			if (i === 0 ? n >= 1 : rungs.length >= 10 && n >= 3) for (const p of peopleOf(run, r.team_id ?? r.player_id ?? r.entrant_id)) give(run, "season_podium", p, 3 - i, {
				lugar: i + 1,
				retos: n
			});
		});
		return;
	}
	const official = ms.filter((m) => officialRacket(kit, m));
	const scheme = rulesPart(league.rules, "table").scheme === "2-0" ? "2-0" : "standard";
	if (official.length) {
		const table = official.every((m) => m.sides.every((s) => !!s.teamId)) ? pairStandings(sport, [...new Set(official.flatMap((m) => m.sides.map((s) => s.teamId)))], official, {
			scheme,
			now: kit.now
		}) : seasonPlayerTable(official, {
			sport,
			scheme,
			rosterOf: kit.rosterOf,
			now: kit.now
		});
		const scheduled = (id) => official.filter((m) => m.status !== "void" && m.sides.some((s) => s.teamId === id || sidePlayers(s, kit.rosterOf).includes(id))).length;
		const rows = table.filter((r) => r.played > 0 && r.played * 100 >= MINIMUMS.titleSeason.racketMatchesPct * scheduled(r.id));
		const cmp = (a, b) => sameLine(a, b) ? order(a.id) - order(b.id) : a.rank - b.rank;
		podiumFrom(run, rows, cmp, (r) => peopleOf(run, r.id), (r) => ({
			n: r.points,
			ganados: r.won
		}));
		return;
	}
	const nights = ms.filter(isPointsMatch);
	if (nights.length) {
		const total = new Set(nights.map((m) => m.eventId)).size;
		podiumFrom(run, seasonNightTable(nights, { now: kit.now }).filter((r) => r.nights * 2 >= total), (a, b) => a.rank - b.rank || order(a.id) - order(b.id), (r) => [r.id], (r) => ({ n: r.points }));
	}
}
/** Dos filas de tabla iguales en todo lo que se juega (solo las separaría el sorteo). */
const sameLine = (a, b) => a.points === b.points && a.won === b.won && a.lost === b.lost && a.diff === b.diff && a.for === b.for && Number(a.extra?.setsDiff ?? 0) === Number(b.extra?.setsDiff ?? 0);
function teamSeasonPodium(run, sport) {
	const { kit, league, w } = run;
	const ms = leagueMatches(kit, league.id, w).filter((m) => m.status !== "void");
	const teams = leagueTeams(kit, league.id);
	if (league.kind === "torneo") {
		for (const place of teamKnockoutPodium(kit, ms, teams.length)) {
			const who = tournamentPlayers(kit, ms, place.teamId, sport);
			for (const p of who.players) give(run, "season_podium", p, place.level, { equipos: teams.length }, {
				alt: "torneo",
				...teamCtx(kit, place.teamId),
				...who.byRoster ? { by_roster: true } : {}
			}, null, [`match:${place.match.id}`]);
		}
		return;
	}
	if (teams.length < 4) return;
	const table = teamTable(kit, sport, league.id, teams, ms.filter((m) => !m.bracketKey));
	const order = adminOrder(run);
	for (const a of podiumAwards(table, (x, y) => x.rank - y.rank || order(x.id) - order(y.id), podiumLevels(teams.length))) {
		const tms = teamMatchesIn(kit, a.row.id, w);
		const who = seasonShareholders(kit, a.row.id, tms, sport, MINIMUMS.titleSeason.teamMatchesPct / 100);
		for (const p of who.players.keys()) give(run, "season_podium", p, a.level, {
			lugar: a.place,
			n: a.row.points
		}, {
			...teamCtx(kit, a.row.id),
			...who.byRoster ? { by_roster: true } : {}
		});
	}
}
/** Como `teamShareholders`, pero sin alineación en la temporada va la plantilla anterior al último partido. */
function seasonShareholders(kit, teamId, ms, sport, share) {
	return teamShareholders(kit, teamId, [...ms].reverse(), sport, share);
}
/** Orden de mérito de golf: 10-8-6-5-4-3-2-1 por ronda cerrada (o torneo), con 50 %+ de las rondas jugadas. */
function golfMerit(run) {
	const { kit, league, w } = run;
	const events = [...groupBy(golfCards(kit).filter((c) => c.card.league_id === league.id && inWin(c.date, w) && c.round.status === "cerrada"), (c) => c.round.tournament_id ?? c.round.event_id).values()].map((list) => {
		const rounds = [...new Set(list.map((c) => c.round.event_id))].sort((a, b) => (list.find((c) => c.round.event_id === a).round.round_no ?? 0) - (list.find((c) => c.round.event_id === b).round.round_no ?? 0));
		const comp = list[0].round.competition;
		return { rows: golfLeaderboard([...groupBy(list, (c) => c.card.player_id)].map(([id, cs]) => ({
			id,
			rounds: rounds.map((r) => {
				const c = cs.find((x) => x.round.event_id === r);
				const holes = c ? cardHoles(c.card, c.round) : null;
				return c && holes ? {
					holes,
					playingHcp: c.card.playing_hcp,
					card: {
						strokes: c.card.strokes,
						pickedUp: c.card.picked_up
					}
				} : null;
			})
		})), comp, { rounds: rounds.length }).map((r) => ({
			id: r.id,
			rank: r.complete ? r.rank : null
		})) };
	});
	return {
		rows: orderOfMerit(events, [
			10,
			8,
			6,
			5,
			4,
			3,
			2,
			1
		]).filter((m) => m.events * 100 >= MINIMUMS.titleSeason.golfRoundsPct * events.length),
		events: events.length
	};
}
/** Puntos de natación por (sexo de la prueba, grupo de edad) en pruebas individuales de encuentros oficiales. */
function swimPoints(run) {
	const { kit, league, w } = run;
	const meets = (kit.snap.swim_meets ?? []).filter((m) => m.league_id === league.id && !!m.finalized_at && inWin(kit.events.get(m.event_id)?.date, w) && isOfficialMeet(kit.events.get(m.event_id)?.type));
	const events = new Map((kit.snap.swim_events ?? []).map((e) => [e.id, e]));
	const rows = /* @__PURE__ */ new Map();
	const attended = /* @__PURE__ */ new Map();
	for (const meet of meets) {
		const entries = (kit.snap.swim_entries ?? []).filter((e) => e.event_id === meet.event_id);
		for (const e of entries) if (e.status !== "dns") attended.set(e.player_id, (attended.get(e.player_id) ?? /* @__PURE__ */ new Set()).add(meet.event_id));
		for (const [evId, list] of groupBy(entries, (e) => e.swim_event_id)) {
			const ev = events.get(evId);
			if (!ev) continue;
			const results = list.map((e) => ({
				entryId: e.id,
				swimmerId: e.player_id,
				player: e.player_id,
				gender: ev.gender,
				ageGroup: e.age_group,
				time: e.time_cs,
				status: e.status
			}));
			for (const r of placeResults(results, meet.points)) {
				if (!r.points) continue;
				const cat = `${ev.gender} ${r.ageGroup ?? ""}`.trim();
				const byP = rows.get(cat) ?? /* @__PURE__ */ new Map();
				byP.set(r.player, (byP.get(r.player) ?? 0) + r.points);
				rows.set(cat, byP);
			}
		}
	}
	return {
		rows,
		meets: attended,
		total: meets.length
	};
}
function categoryTitle(run) {
	const { kit, league, sport, w } = run;
	const d = def$3("category_title");
	const minIn = paramOf(d, "minInCategory", sport) ?? 4;
	if (sport === "bowling") {
		const rows = bowlingFigure(kit, league.id, w, {
			minGames: MINIMUMS.titleSeason.bowlingGames,
			minDates: 1,
			datesPct: MINIMUMS.titleSeason.bowlingDatesPct
		});
		if (rows.length < (paramOf(d, "minTotal", sport) ?? 12)) return;
		const games = leagueBowling(kit, league.id, w).filter((g) => g.official);
		const cat = (p) => {
			const first = games.find((g) => g.player_id === p);
			const entry = first ? (kit.snap.entries ?? []).find((e) => e.id === first.entry_id) : void 0;
			const ev = first ? kit.events.get(first.event_id) : void 0;
			if (!first || !entry || !ev) return null;
			const base = bowlingBaseline(bowlingHistory(kit, p), first.date);
			const sandbag = paramOf(d, "sandbagPins", sport) ?? 15;
			return category(base && entry.average < base.base - sandbag ? base.base : entry.average, ev.category_cuts && ev.category_cuts.length === 3 ? ev.category_cuts : DEFAULT_CUTS);
		};
		for (const [c, list] of groupBy(rows, (r) => cat(r.p) ?? "-")) {
			if (c === "-" || list.length < minIn) continue;
			for (const r of topWithTies(list, byKey).winners) give(run, "category_title", r.p, 0, {
				...r.values,
				categoria: c
			}, {}, c);
		}
	} else if (sport === "swimming") {
		const { rows, meets, total } = swimPoints(run);
		for (const [c, byP] of rows) {
			const list = [...byP].filter(([p]) => (meets.get(p)?.size ?? 0) * 2 >= total).map(([p, n]) => ({
				p,
				key: [n],
				values: {
					n: round1(n),
					categoria: c
				},
				refs: []
			}));
			if (list.length < minIn) continue;
			for (const r of topWithTies(list, byKey).winners) give(run, "category_title", r.p, 0, r.values, {}, c.replace(/[^A-Za-z0-9_-]/g, "_"));
		}
	}
}
function seasonMostImproved(run) {
	const { kit, league, sport, w } = run;
	const d = def$3("season_most_improved");
	const [h1, h2] = halves(w);
	const min = paramOf(d, "minGain", sport) ?? 0;
	const eligible = [];
	if (sport === "bowling") {
		const games = leagueBowling(kit, league.id, w);
		const dates = new Set(games.filter((g) => g.official).map((g) => g.date));
		for (const [p, list] of groupBy(games, (g) => g.player_id)) {
			const attended = new Set(list.filter((g) => g.official).map((g) => g.date)).size;
			if (list.length < (paramOf(d, "minGames", sport) ?? 24) || attended * 2 < dates.size) continue;
			let base = bowlingBaseline(bowlingHistory(kit, p), w.from)?.base ?? null;
			if (base === null) {
				if (list.length < 30) continue;
				base = mean(list.slice(0, 12).map((g) => g.score));
			}
			const late = list.filter((g) => inWin(g.date, h2));
			if (!late.length) continue;
			const gain = mean(late.map((g) => g.score)) - base;
			eligible.push({
				p,
				key: [gain],
				values: {
					valor: `+${Math.round(gain)} pinos sobre tu promedio de arranque`,
					n: round1(gain)
				},
				refs: []
			});
		}
	} else if (isRacketSport(sport)) {
		const per = paramOf(d, "minPerHalf", sport) ?? 5;
		const ms = leagueMatches(kit, league.id, w);
		for (const [p, lines] of groupBy(racketLines(kit, racketPeople(kit, ms), ms, false), (l) => l.p)) {
			const a = lines.filter((l) => inWin(l.date, h1));
			const b = lines.filter((l) => inWin(l.date, h2));
			if (a.length < per || b.length < per) continue;
			const gain = (pctOf(b) ?? 0) - (pctOf(a) ?? 0);
			eligible.push({
				p,
				key: [gain],
				values: {
					valor: `+${Math.round(gain)} puntos de juegos ganados`,
					n: round1(gain)
				},
				refs: []
			});
		}
	} else if (sport === "golf") {
		const per = paramOf(d, "minPerHalf", sport) ?? 3;
		const cards = golfCards(kit).filter((c) => c.card.league_id === league.id && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
		for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
			const a = list.filter((c) => inWin(c.date, h1));
			const b = list.filter((c) => inWin(c.date, h2));
			if (a.length < per || b.length < per) continue;
			const gain = mean(a.map((c) => c.diff)) - mean(b.map((c) => c.diff));
			eligible.push({
				p,
				key: [gain],
				values: {
					valor: `${round1(gain)} golpes menos`,
					n: round1(gain)
				},
				refs: []
			});
		}
	} else if (sport === "swimming") {
		const minPb = paramOf(d, "minPersonalBests", sport) ?? 3;
		const swimmers = new Set((kit.snap.swim_entries ?? []).filter((e) => e.league_id === league.id).map((e) => e.player_id));
		for (const p of swimmers) {
			const steps = leagueBestSteps(kit, p, league.id, w);
			if (steps.length) eligible.push({
				p,
				key: [steps.length, steps.reduce((n, s) => n + s.pct, 0)],
				values: {
					valor: `${steps.length} marcas personales`,
					n: steps.length
				},
				refs: []
			});
		}
		if (eligible.length < (paramOf(d, "minEligible", sport) ?? 6)) return;
		for (const r of topWithTies(eligible.filter((x) => x.key[0] >= minPb), byKey).winners) give(run, "season_most_improved", r.p, 0, r.values);
		return;
	} else return;
	if (eligible.length < (paramOf(d, "minEligible", sport) ?? 6)) return;
	for (const r of topWithTies(eligible.filter((x) => x.key[0] >= min), byKey).winners) give(run, "season_most_improved", r.p, 0, r.values);
}
/** La métrica del título por jugador (sin el mínimo del podio), con 50 %+ de asistencia: la usa la revelación. */
function titleMetric(run) {
	const { kit, league, sport, w } = run;
	if (sport === "bowling") return bowlingFigure(kit, league.id, w, {
		minGames: 1,
		minDates: 1,
		datesPct: 50
	});
	if (isRacketSport(sport)) {
		const ms = leagueMatches(kit, league.id, w).filter((m) => officialRacket(kit, m));
		const table = seasonPlayerTable(ms, {
			sport,
			rosterOf: kit.rosterOf,
			now: kit.now
		});
		const scheduled = (p) => ms.filter((m) => m.status !== "void" && m.sides.some((s) => sidePlayers(s, kit.rosterOf).includes(p))).length;
		return table.filter((r) => r.played * 2 >= scheduled(r.id)).map((r) => ({
			p: r.id,
			key: [
				r.points,
				r.won,
				Number(r.extra?.setsDiff ?? 0),
				r.diff
			],
			values: { n: r.points },
			refs: []
		}));
	}
	if (sport === "golf") return golfMerit(run).rows.map((r) => ({
		p: r.id,
		key: [r.points, r.wins],
		values: { n: r.points },
		refs: []
	}));
	if (sport === "swimming") {
		const { rows, meets, total } = swimPoints(run);
		const sum = /* @__PURE__ */ new Map();
		for (const byP of rows.values()) for (const [p, n] of byP) sum.set(p, (sum.get(p) ?? 0) + n);
		return [...sum].filter(([p]) => (meets.get(p)?.size ?? 0) * 2 >= total).map(([p, n]) => ({
			p,
			key: [n],
			values: { n: round1(n) },
			refs: []
		}));
	}
	return [];
}
function seasonRookie(run) {
	const { kit, sport, w } = run;
	const d = def$3("season_rookie");
	if (d.sports === "all" || !d.sports.includes(sport)) return;
	const acts = kit.activity().filter((a) => a.sport === sport && !a.roster);
	const firstOf = (p) => {
		const mine = new Set(selfPlayers(kit, p));
		return acts.filter((a) => mine.has(a.player_id)).reduce((m, a) => m === null || a.date < m ? a.date : m, null);
	};
	const already = (p) => {
		const mine = new Set(selfPlayers(kit, p));
		return (kit.snap.awards ?? []).some((a) => a.badge_key === "season_rookie" && a.sport === sport && a.status !== "revocada" && !!a.player_id && mine.has(a.player_id));
	};
	const rookies = titleMetric(run).filter((r) => inWin(firstOf(r.p), w) && !already(r.p));
	if (rookies.length < (paramOf(d, "minRookies", sport) ?? 3)) return;
	for (const r of topWithTies(rookies, byKey).winners) give(run, "season_rookie", r.p, 0, { ...r.values });
}
function seasonAttendance(run) {
	const { kit, league, sport, w } = run;
	const d = def$3("season_attendance");
	const minDates = paramOf(d, "minDates", sport) ?? 6;
	const share = paramOf(d, "lineupShare", sport) ?? .8;
	const firsts = /* @__PURE__ */ new Map();
	for (const a of kit.activity()) {
		if (a.league_id !== league.id || a.roster || !inWin(a.date, w)) continue;
		const f = firsts.get(a.player_id);
		if (!f || a.date < f) firsts.set(a.player_id, a.date);
	}
	if (sport === "swimming") for (const e of kit.snap.swim_entries ?? []) {
		const date = kit.events.get(e.event_id)?.date;
		if (e.league_id !== league.id || !inWin(date, w)) continue;
		const f = firsts.get(e.player_id);
		if (!f || date < f) firsts.set(e.player_id, date);
	}
	for (const [p, from] of firsts) {
		const a = attendanceIn(kit, league.id, sport, {
			from,
			to: w.to
		}, isTeamSport(sport) ? { lineupShare: share } : {}).get(p);
		if (!a || a.dates < minDates) continue;
		const pct = Math.floor(a.present * 100 / a.dates);
		const level = levelFor(d, pct, sport);
		if (level !== null) give(run, "season_attendance", p, level, {
			n: a.present,
			total: a.dates,
			pct
		}, a.teamId ? teamCtx(kit, a.teamId) : {}, null, a.refs.slice(0, 20));
	}
}
function seasonScorers(run, sport) {
	const { kit, league, w } = run;
	const teams = leagueTeams(kit, league.id);
	const ms = leagueMatches(kit, league.id, w).filter((m) => isT1(m, kit.now));
	const lines = statLines(kit, ms, sport);
	const teamGames = new Map(teams.map((t) => [t, ms.filter((m) => m.sides.some((s) => s.teamId === t)).length]));
	const teamOfLine = (l) => l.m.sides[l.side - 1].teamId;
	const ts = def$3("season_top_scorer");
	if (teams.length >= (paramOf(ts, "minTeams", sport) ?? 4)) {
		const rows = [];
		for (const [p, ls] of groupBy(lines, (l) => l.p)) {
			const team = teamOfLine(ls[ls.length - 1]);
			const games = team ? teamGames.get(team) ?? 0 : 0;
			if (!games || ls.length < (paramOf(ts, "share", sport) ?? .5) * games) continue;
			const total = ls.reduce((n, l) => n + l.goals, 0);
			if (sport === "basketball") {
				if (ls.length < (paramOf(ts, "minMatches", sport) ?? 6)) continue;
				rows.push({
					p,
					key: [total / ls.length],
					values: {
						n: round1(total / ls.length),
						partidos: ls.length
					},
					refs: []
				});
			} else if (total >= (paramOf(ts, "minGoals", sport) ?? 3)) rows.push({
				p,
				key: [total],
				values: {
					n: total,
					partidos: ls.length
				},
				refs: []
			});
		}
		for (const r of topWithTies(rows, byKey).winners) give(run, "season_top_scorer", r.p, 0, r.values);
	}
	if (sport === "basketball") return;
	const bk = def$3("season_best_keeper");
	if (teams.length < (paramOf(bk, "minTeams", sport) ?? 4)) return;
	const keepers = [];
	for (const [p, ls] of groupBy(lines.filter((l) => l.keeper), (l) => l.p)) {
		const team = teamOfLine(ls[ls.length - 1]);
		const games = team ? teamGames.get(team) ?? 0 : 0;
		if (!games || ls.length < (paramOf(bk, "share", sport) ?? .5) * games || ls.length < (paramOf(bk, "minMatches", sport) ?? 6)) continue;
		const conceded = ls.reduce((n, l) => n + l.conceded, 0);
		keepers.push({
			p,
			key: [-conceded / ls.length],
			values: {
				n: round1(conceded / ls.length),
				partidos: ls.length
			},
			refs: []
		});
	}
	for (const r of topWithTies(keepers, byKey).winners) give(run, "season_best_keeper", r.p, 0, r.values);
}
/** Faltas técnicas, antideportivas y descalificantes por jugador desde el acta del modo cancha (`matches.state`). */
function basketballBadFouls(state) {
	const s = state && typeof state === "object" ? state : null;
	if (!s || !Array.isArray(s.log) && !s.base) return null;
	const out = /* @__PURE__ */ new Map();
	const add = (p, n) => {
		if (typeof p === "string" && p && n > 0) out.set(p, (out.get(p) ?? 0) + n);
	};
	const base = s.base && typeof s.base === "object" ? s.base : null;
	if (Array.isArray(base?.players)) for (const side of base.players) {
		if (!side || typeof side !== "object") continue;
		for (const [id, raw] of Object.entries(side)) {
			const pl = raw;
			add(id, (pl.technicals ?? 0) + (pl.unsportsmanlike ?? 0) + (pl.disqualifying ?? 0));
		}
	}
	for (const ev of Array.isArray(s.log) ? s.log : []) if (ev?.type === "foul" && (ev.kind === "technical" || ev.kind === "unsportsmanlike" || ev.kind === "disqualifying")) add(ev.player, 1);
	return out;
}
/** Las actas de baloncesto de la foto (por partido). */
function basketballStates(kit) {
	const out = /* @__PURE__ */ new Map();
	for (const m of kit.snap.matches ?? []) {
		const fouls = basketballBadFouls(m.state);
		if (fouls) out.set(m.id, fouls);
	}
	return out;
}
function fairPlay(run) {
	const { kit, league, sport, w } = run;
	const d = def$3("fair_play");
	if (d.sports === "all" || !d.sports.includes(sport)) return;
	const min = paramOf(d, "minMatches", sport) ?? 8;
	if (sport === "swimming") {
		const meets = new Map((kit.snap.swim_meets ?? []).map((m) => [m.event_id, m]));
		const entries = (kit.snap.swim_entries ?? []).filter((e) => e.league_id === league.id && e.status !== "dns" && !!meets.get(e.event_id)?.finalized_at && inWin(kit.events.get(e.event_id)?.date, w));
		for (const [p, list] of groupBy(entries, (e) => e.player_id)) if (list.length >= min && list.every((e) => e.status === "ok")) give(run, "fair_play", p, 0, { n: list.length });
		return;
	}
	const ms = leagueMatches(kit, league.id, w).filter((m) => isT1(m, kit.now));
	if (sport === "basketball") {
		const states = basketballStates(kit);
		const withState = ms.filter((m) => states.has(m.id));
		if (![...withState].some((m) => [...states.get(m.id).values()].some((n) => n > 0))) return;
		const count = /* @__PURE__ */ new Map();
		for (const m of withState) {
			const fouls = states.get(m.id);
			for (const p of appearances(m, "basketball").keys()) {
				const c = count.get(p) ?? {
					n: 0,
					bad: 0
				};
				c.n++;
				c.bad += fouls.get(p) ?? 0;
				count.set(p, c);
			}
		}
		for (const [p, c] of count) if (c.n >= min && c.bad === 0) give(run, "fair_play", p, 0, { n: c.n });
		return;
	}
	if (!ms.some((m) => footballLinesAll(m).some((l) => l.yellows > 0 || !!l.red))) return;
	const sanctioned = new Set((kit.snap.sanctions ?? []).filter((s) => s.league_id === league.id && inWin((s.created_at ?? "").slice(0, 10), w)).map((s) => s.player_id));
	const per = /* @__PURE__ */ new Map();
	for (const m of ms) for (const l of footballLinesAll(m)) {
		if (!l.played) continue;
		const c = per.get(l.playerId) ?? {
			n: 0,
			yellows: 0,
			reds: 0
		};
		c.n++;
		c.yellows += l.yellows;
		c.reds += l.red ? 1 : 0;
		per.set(l.playerId, c);
	}
	const maxY = paramOf(d, "maxYellows", sport) ?? 1;
	for (const [p, c] of per) if (c.n >= min && c.reds === 0 && c.yellows <= maxY && !sanctioned.has(p)) give(run, "fair_play", p, 0, {
		n: c.n,
		amarillas: c.yellows
	});
}
/** Todas las líneas de fútbol o sala de un partido con estadísticas (también las tarjetas desde el banco). */
const footballLinesAll = (m) => typeof m.score?.lines === "string" ? decodeLines(m.score.lines) : [];
function fairPlayTeam(run, sport) {
	const { kit, league, w } = run;
	const d = def$3("fair_play_team");
	const teams = leagueTeams(kit, league.id);
	const states = sport === "basketball" ? basketballStates(kit) : null;
	const rows = [];
	let anyCard = false;
	for (const t of teams) {
		const ms = teamMatchesIn(kit, t, w).filter((m) => states ? states.has(m.id) : typeof m.score?.lines === "string" && !!m.score.lines);
		if (ms.length < (paramOf(d, "minMatches", sport) ?? 8)) continue;
		let bad = 0;
		for (const m of ms) {
			const side = sideOfTeam(m, t);
			if (states) {
				const fouls = states.get(m.id);
				for (const [p, s] of appearances(m, sport)) if (s === side) bad += fouls.get(p) ?? 0;
			} else for (const l of footballLinesAll(m)) {
				if (l.side !== side) continue;
				bad += l.yellows + (l.red ? paramOf(d, "redWeight", sport) ?? 3 : 0);
			}
		}
		if (bad > 0) anyCard = true;
		rows.push({
			p: t,
			key: [-bad / ms.length],
			values: {
				n: round1(bad / ms.length),
				partidos: ms.length
			},
			refs: []
		});
	}
	if (!anyCard || rows.length < (paramOf(d, "minTeams", sport) ?? 4)) return;
	for (const r of topWithTies(rows, byKey).winners) {
		const who = teamShareholders(kit, r.p, teamMatchesIn(kit, r.p, w), sport, paramOf(d, "share", sport) ?? .4);
		for (const p of who.players.keys()) give(run, "fair_play_team", p, 0, r.values, {
			...teamCtx(kit, r.p),
			...who.byRoster ? { by_roster: true } : {}
		});
	}
}
function captainBand(run, sport) {
	const { kit, league, w } = run;
	const d = def$3("captain_band");
	for (const t of leagueTeams(kit, league.id)) {
		const ms = teamMatchesIn(kit, t, w);
		const walkovers = leagueMatches(kit, league.id, w).filter((m) => m.status === "walkover" && isFinal(m, kit.now) && m.sides[(m.walkoverSide ?? 0) - 1]?.teamId === t).length;
		if (ms.length < (paramOf(d, "minMatches", sport) ?? 8) || walkovers > (paramOf(d, "maxWalkovers", sport) ?? 1)) continue;
		const leads = (kit.snap.team_players ?? []).filter((tp) => tp.team_id === t && (tp.role === "captain" || tp.role === "delegate"));
		for (const tp of leads) give(run, "captain_band", tp.player_id, 0, { n: ms.length }, teamCtx(kit, t));
	}
}
function honorWord(run) {
	const { kit, league, sport, w } = run;
	if (!isRacketSport(sport)) return;
	const d = def$3("honor_word");
	const ms = leagueMatches(kit, league.id, w).filter((m) => officialRacket(kit, m));
	for (const p of racketPeople(kit, ms)) {
		const mine = ms.filter((m) => playerSide(m, p, kit.rosterOf));
		const ctxOf = (m) => ({
			now: kit.now,
			userOf: kit.userOf,
			rosterOf: kit.rosterOf,
			staff: kit.staff(m.leagueId)
		});
		const played = mine.filter((m) => isR1(m, p, ctxOf(m)));
		if (played.length < (paramOf(d, "minMatches", sport) ?? 8)) continue;
		const me = kit.userOf(p);
		if (!mine.some((m) => {
			const side = playerSide(m, p, kit.rosterOf);
			if (m.status === "walkover" && m.walkoverSide === side) return true;
			const h = m.history ?? [];
			const myAccounts = new Set(sidePlayers(m.sides[side - 1], kit.rosterOf).map(kit.userOf).filter((u) => !!u));
			if ((m.proposedSide === side || h.some((x) => x.a === "finish" && !!x.by && myAccounts.has(x.by))) && h.some((x) => x.a === "resolve" && "score" in x)) return true;
			const disputed = h.findIndex((x) => x.a === "dispute" && !!me && x.by === me);
			return disputed >= 0 && h.slice(disputed + 1).some((x) => x.a === "resolve" && !("score" in x));
		})) give(run, "honor_word", p, 0, { n: played.length });
	}
}
/** Fechas oficiales de la temporada: eventos de boliche, jornadas con 2+ partidos finales, rondas y encuentros. */
function seasonDates(kit, league, w) {
	const sport = league.sport;
	if (sport === "bowling") return new Set(leagueBowling(kit, league.id, w).map((g) => g.event_id)).size;
	if (sport === "golf") return (kit.snap.golf_rounds ?? []).filter((r) => r.league_id === league.id && r.status === "cerrada" && inWin(kit.events.get(r.event_id)?.date, w)).length;
	if (sport === "swimming") return (kit.snap.swim_meets ?? []).filter((m) => m.league_id === league.id && !!m.finalized_at && inWin(kit.events.get(m.event_id)?.date, w)).length;
	return [...groupBy(leagueMatches(kit, league.id, w).filter((m) => isFinal(m, kit.now) && m.status !== "void"), (m) => `${m.eventId ?? ""}|${m.round ?? matchDay(kit, m)}`).values()].filter((g) => g.length >= 2).length;
}
const seasonStaff = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const found = seasonOfJob(kit);
	if (!found) return [];
	const { season, league } = found;
	const w = {
		from: season.starts_on,
		to: season.ends_on
	};
	const minors = league.has_minors;
	const ctx = minors ? {
		league: {
			id: league.id,
			name: "Liga juvenil privada"
		},
		window: [w.from, w.to]
	} : {
		...leagueCtx(kit, league.id),
		season: {
			id: season.id,
			name: season.name
		},
		window: [w.from, w.to]
	};
	const out = [];
	const so = def$3("season_organizer");
	const acts = kit.activity().filter((a) => a.league_id === league.id && !a.roster && inWin(a.date, w));
	const players = new Set(acts.map((a) => a.player_id)).size;
	const accounts = new Set(acts.map((a) => a.user_id).filter((u) => !!u)).size;
	const dates = seasonDates(kit, league, w);
	if (dates >= (paramOf(so, "minDates") ?? 8) && players >= (paramOf(so, "minPlayers") ?? 8) && accounts >= (paramOf(so, "minAccounts") ?? 4)) {
		const serviceDays = (u) => new Set((kit.snap.service ?? []).filter((s) => s.league_id === league.id && (s.user_id ?? job.user_id) === u && inWin(s.date, w)).map((s) => s.date)).size;
		for (const u of kit.staff(league.id)) if (serviceDays(u) >= (paramOf(so, "minServiceDays") ?? 5)) out.push(awardOf(so, userHolderOf(u), "all", 0, periodKey.season(season.id), "firme", [], {
			...ctx,
			values: {
				fechas: dates,
				jugadores: players
			}
		}));
	}
	if (league.sport === "swimming") {
		const cb = def$3("coach_board");
		const meets = new Map((kit.snap.swim_meets ?? []).map((m) => [m.event_id, m]));
		for (const club of kit.snap.swim_clubs ?? []) {
			const coach = club.coach_id ? kit.userOf(club.coach_id) : null;
			if (club.league_id !== league.id || !coach) continue;
			const swimmers = new Set((kit.snap.swim_entries ?? []).filter((e) => e.club_id === club.id && e.status !== "dns" && !!meets.get(e.event_id)?.finalized_at && inWin(kit.events.get(e.event_id)?.date, w)).map((e) => e.player_id));
			if (swimmers.size >= (paramOf(cb, "minSwimmers", "swimming") ?? 5)) out.push(awardOf(cb, userHolderOf(coach), "swimming", 0, periodKey.season(season.id), "firme", [], {
				...ctx,
				values: minors ? { n: swimmers.size } : {
					n: swimmers.size,
					club: club.name
				}
			}));
		}
	}
	return out;
};
//#endregion
//#region src/badges/evaluators/year.ts
/**
* Insignias del año (docs/insignias.md §2.10), que se evalúan el 7 de enero por el año anterior: las de cuenta
* (`year_account`: tu año y todo el año) y las de liga (`year_league`: figura y mayor progreso del año, en ligas con
* peso para el año). Todas quedan firmes.
*/
const def$2 = (key) => badgeDef(key);
/** Años que evalúa un trabajo: el del ref, o en el historial todos los ya vencidos (7 de enero) con datos. */
function yearsOf(kit, leagueId) {
	const y = jobYear(kit.job);
	if (y) return [y];
	if (kit.job.kind !== "historial") return [];
	const months = kit.leagueMonths().filter((r) => !leagueId || r.league_id === leagueId).map((r) => Number(r.month.slice(0, 4)));
	if (!months.length) return [];
	const out = [];
	for (let year = Math.min(...months); yearDueOn(year) <= kit.today; year++) out.push(year);
	return out;
}
const yearAccount = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const recap = def$2("year_recap");
	const full = def$2("full_year");
	const out = [];
	for (const year of yearsOf(kit, job.league_id)) {
		const w = yearWindow(year);
		for (const t of accountJobTargets(kit)) {
			const acts = targetActivity(kit, t).filter((a) => inWin(a.date, w));
			const by = t.user ? "user" : "player";
			const weighted = weighDays(activeDays(acts, by));
			const days = weighted.reduce((n, d) => n + d.weight, 0);
			const months = activeMonths(weighted);
			const sports = new Set(acts.map((a) => a.sport));
			const level = months.length >= (paramOf(recap, "minActiveMonths") ?? 6) ? levelFor(recap, days, "all") : null;
			if (level !== null) out.push(awardOf(recap, t.holder, "all", level, periodKey.year(year), "firme", [], {
				window: [w.from, w.to],
				values: {
					n: days,
					anio: year,
					deportes_n: sports.size,
					meses: months.length
				}
			}));
			for (const [sport, list] of groupBy(acts, (a) => a.sport)) {
				const n = activeMonths(weighDays(activeDays(list, by))).length;
				if (levelFor(full, n, sport) !== null) out.push(awardOf(full, t.holder, sport, 0, periodKey.year(year), "firme", [], {
					window: [w.from, w.to],
					values: {
						n,
						anio: year
					}
				}));
			}
		}
	}
	return out;
};
/** Liga con peso para el año: 8+ jugadores activos y 4+ cuentas establecidas en el año. */
function weightyYearFor(kit, leagueId, year) {
	const rows = kit.leagueMonths().filter((r) => r.league_id === leagueId && r.month.startsWith(`${year}-`));
	const players = new Set(rows.flatMap((r) => r.players));
	const users = new Set(rows.flatMap((r) => r.users));
	const end = `${year}-12-31`;
	return weightyYear({
		players: players.size,
		establishedAccounts: [...users].filter((u) => isEstablished(kit.profiles.get(u), end)).length
	});
}
/** Mayor progreso del año (§2.10 `progress_of_year`), por deporte, si llega al mínimo. */
function yearImprovers(kit, leagueId, sport, w) {
	const d = def$2("progress_of_year");
	const min = paramOf(d, "minGain", sport) ?? 0;
	const out = [];
	if (sport === "bowling") {
		const n = paramOf(d, "window", sport) ?? 30;
		for (const [p, games] of groupBy(leagueBowling(kit, leagueId, w), (g) => g.player_id)) {
			if (games.length < 2 * n) continue;
			const gain = mean(games.slice(-n).map((g) => g.score)) - mean(games.slice(0, n).map((g) => g.score));
			if (gain >= min) out.push({
				p,
				key: [gain],
				values: {
					valor: `+${Math.round(gain)} pinos`,
					n: round1(gain)
				},
				refs: []
			});
		}
	} else if (isRacketSport(sport)) {
		const per = paramOf(d, "minMatchesPerHalf", sport) ?? 8;
		const [h1, h2] = [{
			from: w.from,
			to: `${w.from.slice(0, 4)}-06-30`
		}, {
			from: `${w.from.slice(0, 4)}-07-01`,
			to: w.to
		}];
		const ms = leagueMatches(kit, leagueId, w);
		for (const [p, lines] of groupBy(racketLines(kit, racketPeople(kit, ms), ms, false), (l) => l.p)) {
			const a = lines.filter((l) => inWin(l.date, h1));
			const b = lines.filter((l) => inWin(l.date, h2));
			if (a.length < per || b.length < per) continue;
			const gain = (pctOf(b) ?? 0) - (pctOf(a) ?? 0);
			if (gain >= min) out.push({
				p,
				key: [gain],
				values: {
					valor: `+${Math.round(gain)} puntos de juegos ganados`,
					n: round1(gain)
				},
				refs: []
			});
		}
	} else if (sport === "golf") {
		const n = paramOf(d, "window", sport) ?? 6;
		const cards = golfCards(kit).filter((c) => c.card.league_id === leagueId && inWin(c.date, w) && c.g2 && c.holes === 18 && c.diff !== null);
		for (const [p, list] of groupBy(cards, (c) => c.card.player_id)) {
			if (list.length < 2 * n) continue;
			const gain = mean(list.slice(0, n).map((c) => c.diff)) - mean(list.slice(-n).map((c) => c.diff));
			if (gain >= min) out.push({
				p,
				key: [gain],
				values: {
					valor: `${round1(gain)} golpes menos`,
					n: round1(gain)
				},
				refs: []
			});
		}
	} else if (sport === "swimming") {
		const minPb = paramOf(d, "minPersonalBests", sport) ?? 4;
		const swimmers = new Set((kit.snap.swim_entries ?? []).filter((e) => e.league_id === leagueId).map((e) => e.player_id));
		for (const p of swimmers) {
			const steps = leagueBestSteps(kit, p, leagueId, w);
			if (steps.length >= minPb) out.push({
				p,
				key: [steps.length, steps.reduce((n, s) => n + s.pct, 0)],
				values: {
					valor: `${steps.length} marcas personales`,
					n: steps.length
				},
				refs: []
			});
		}
	}
	return out;
}
const yearLeague = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const league = job.league_id ? kit.leagues.get(job.league_id) : void 0;
	if (!league || league.kind !== "liga") return [];
	const sport = league.sport;
	const fig = def$2("figure_of_year");
	const prog = def$2("progress_of_year");
	const out = [];
	for (const year of yearsOf(kit, league.id)) {
		if (!weightyYearFor(kit, league.id, year)) continue;
		const w = yearWindow(year);
		const ctx = {
			...leagueCtx(kit, league.id),
			window: [w.from, w.to]
		};
		const give = (d, r) => {
			if (d.sports !== "all" && !d.sports.includes(sport)) return;
			out.push(awardOf(d, playerHolderOf(r.p, league.id), sport, 0, periodKey.year(year), "firme", r.refs, {
				...ctx,
				values: {
					...r.values,
					anio: year
				}
			}));
		};
		if (!(kit.snap.seasons ?? []).some((s) => s.league_id === league.id && s.starts_on === w.from && s.ends_on === w.to)) {
			const pct = paramOf(fig, "minAttendancePct", sport) ?? 40;
			const rows = sport === "bowling" ? bowlingFigure(kit, league.id, w, {
				minGames: paramOf(fig, "minGames", sport) ?? 36,
				minDates: 1,
				datesPct: pct
			}) : isRacketSport(sport) ? racketFigure(kit, league.id, w, paramOf(fig, "minMatches", sport) ?? 12, pct) : sport === "golf" ? golfFigure(kit, league.id, w, paramOf(fig, "minCards", sport) ?? 8) : [];
			for (const r of topWithTies(rows, byKey).winners) give(fig, r);
		}
		for (const r of topWithTies(yearImprovers(kit, league.id, sport, w), byKey).winners) give(prog, r);
	}
	return out;
};
//#endregion
//#region src/badges/evaluators/families.ts
/** Pádel, tenis y pickleball (§2.3), con su debut y su podio de torneo. */
const RACKET_EVALUATORS = {
	debut: racketDebut,
	racket_career: racketCareer,
	racket_match: racketMatch,
	racket_night: racketNight,
	event_podium: racketPodium
};
/** Baloncesto, fútbol y sala (§2.4–§2.6), con su debut y el podio del torneo relámpago. */
const TEAM_EVALUATORS = {
	debut: teamDebut,
	team_career: teamCareer,
	team_match: teamMatch,
	basketball_career: basketballCareer,
	basketball_match: basketballMatch,
	football_career: footballCareer,
	football_match: footballMatch,
	event_podium: teamPodium
};
/** Mes, cajas, escalera, año y temporada (§2.9–§2.11), para todos los deportes. */
const PERIOD_EVALUATORS = {
	month_league: monthLeague,
	month_account: monthAccount,
	month_streak: monthStreakEval,
	box_month: boxMonth,
	ladder_month: ladderMonth,
	year_account: yearAccount,
	year_league: yearLeague,
	season_league: seasonLeague,
	season_staff: seasonStaff
};
/** De cuenta y comunidad (§2.1 y §2.12). */
const ACCOUNT_EVALUATORS = {
	account_activity: accountActivity,
	community
};
//#endregion
//#region src/badges/evaluators/golf.ts
const def$1 = (key) => badgeDef(key);
const DEBUT$1 = def$1("debut");
const CLIMBING = def$1("climbing");
const PODIUM = def$1("event_podium");
const ROUNDS = def$1("golf_rounds");
const BIRDIES = def$1("golf_birdies");
const BARRIER = def$1("golf_break_barrier");
const STABLEFORD = def$1("golf_stableford");
const COLLECTION = def$1("golf_birdie_collection");
const EAGLE = def$1("golf_eagle");
const HOLE_IN_ONE = def$1("golf_hole_in_one");
const PAR_ROUND = def$1("golf_par_round");
const NO_DISASTER = def$1("golf_no_disaster");
const COURSE_BEST = def$1("golf_course_best");
const CAREER_KEYS$1 = badgesOfEvaluator("golf_career").map((d) => d.key);
const CARD_KEYS = badgesOfEvaluator("golf_card").map((d) => d.key);
const infosMemo$1 = /* @__PURE__ */ new WeakMap();
/** Todas las tarjetas de la foto con su ronda, en orden de fecha (y de firma). */
function cardInfos(kit) {
	const hit = infosMemo$1.get(kit);
	if (hit) return hit;
	const rounds = new Map((kit.snap.golf_rounds ?? []).map((r) => [r.event_id, r]));
	const cards = kit.snap.golf_cards ?? [];
	const byEvent = groupBy(cards, (c) => c.event_id);
	const out = [];
	for (const card of cards) {
		const round = rounds.get(card.event_id);
		const date = kit.events.get(card.event_id)?.date;
		const holes = round ? cardHoles(card, round) : null;
		if (!round || !date || !holes) continue;
		const g1 = isG1(card, round);
		out.push({
			card,
			round,
			date,
			holes,
			nine: holes.length === 9,
			g1,
			g2: g1 && isG2(card, round, byEvent.get(card.event_id) ?? [], kit.userOf),
			gross: g1 ? grossOf(card, holes) : null,
			diff: g1 ? golfDifferential(card, round)?.value ?? null : null
		});
	}
	out.sort((a, b) => a.date !== b.date ? a.date < b.date ? -1 : 1 : (a.card.signed_at ?? "").localeCompare(b.card.signed_at ?? "") || a.card.id.localeCompare(b.card.id));
	infosMemo$1.set(kit, out);
	return out;
}
/**
* Tarjetas G1 que suman para una insignia de cuenta: de sus jugadores, en ligas reales ese mes y, de un jugador que
* se reclamó a sí mismo, solo las G2.
*/
function accountCards(kit, t) {
	const mine = new Set(t.players);
	return cardInfos(kit).filter((i) => mine.has(i.card.player_id) && i.g1 && realOn(kit, i.card.league_id, i.date, t) && (!kit.verifiedOnly(i.card.player_id) || i.g2));
}
/** Los jugadores de golf de la cuenta de un jugador (o él solo, sin cuenta). */
function accountPlayersOf(kit, playerId) {
	const u = kit.userOf(playerId);
	if (!u) return [playerId];
	return [...kit.players.values()].filter((p) => p.user_id === u && kit.sportOf(p.league_id) === "golf").map((p) => p.id);
}
/** Diferenciales de rondas G2 de 18 hoyos de unos jugadores antes de una fecha, en orden (para el índice topado). */
function differentialsBefore(kit, players, date) {
	const mine = new Set(players);
	return cardInfos(kit).filter((i) => mine.has(i.card.player_id) && i.g2 && !i.nine && i.diff != null && i.date < date).map((i) => i.diff);
}
/** Hándicap de juego recalculado con el índice topado (§1.7.6); si no se puede, el de la tarjeta. */
function cappedHcp(kit, i) {
	const index = cappedIndex(i.card.hcp_index, differentialsBefore(kit, accountPlayersOf(kit, i.card.player_id), i.date));
	return cappedPlayingHcp(i.card, i.round, index) ?? i.card.playing_hcp;
}
const scoreInput = (i, playingHcp) => ({
	holes: i.holes,
	playingHcp,
	card: {
		strokes: i.card.strokes,
		putts: i.card.putts,
		pickedUp: i.card.picked_up
	}
});
/** Hoyos jugados (sin levantar) con sus golpes. */
const played = (i) => i.holes.flatMap((h, k) => !i.card.picked_up?.[k] && typeof i.card.strokes[k] === "number" ? [{
	hole: h,
	strokes: i.card.strokes[k]
}] : []);
const birdiesOf = (i) => played(i).filter((x) => x.strokes === x.hole.par - 1).length;
const cardRef = (i) => `card:${i.card.id}`;
const cardProof = (kit, i, values, more = []) => ({
	date: [i, ...more].reduce((d, x) => x.date > d ? x.date : d, i.date),
	refs: [i, ...more].map(cardRef),
	values,
	context: {
		...leagueCtx(kit, i.card.league_id),
		...eventCtx(kit, i.card.event_id)
	}
});
const lowest = (xs) => xs.length ? Math.min(...xs) : null;
const highest = (xs) => xs.length ? Math.max(...xs) : null;
const golfDebut = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const t of targetAccounts(kit, "golf")) {
		const first = accountCards(kit, t)[0];
		const produced = first ? careerAwards(kit, DEBUT$1, t.holder, "golf", [{
			level: 0,
			item: first
		}], (i) => cardProof(kit, i, {})) : [];
		out.push(...produced, ...staleRevokes(kit, produced, {
			holders: [t.holder],
			keys: [DEBUT$1.key],
			sport: "golf",
			period: always
		}));
	}
	return out;
};
/** Todas las de carrera de golf de un dueño con sus tarjetas G1 (ya en orden y en ligas reales). */
function golfCareerFor(kit, t, cards) {
	const out = [];
	const holder = t.holder;
	const capped = capPerDay(cards, (i) => i.date, paramOf(ROUNDS, "maxPerDay", "golf") ?? CAPS.golfCardsPerDay);
	let total = 0;
	const rounds = capped.map((i) => ({
		i,
		n: total += i.nine ? .5 : 1
	}));
	const roundHits = milestones(ROUNDS, rounds, (r) => r.n, { variant: "golf" });
	out.push(...careerAwards(kit, ROUNDS, holder, "golf", roundHits, (r, level) => cardProof(kit, r.i, { n: thresholdOf(ROUNDS, level, "golf") })));
	out.push(progressFor(kit, ROUNDS, holder, "golf", total, { gained: roundHits }));
	let count = 0;
	const birdies = capped.map((i) => {
		const here = birdiesOf(i);
		return {
			i,
			here,
			n: count += here
		};
	});
	const birdieHits = milestones(BIRDIES, birdies, (b) => b.n, {
		variant: "golf",
		ok: (b, l) => !l.strict || b.i.g2 && b.here > 0
	});
	out.push(...careerAwards(kit, BIRDIES, holder, "golf", birdieHits, (b, level) => cardProof(kit, b.i, { n: thresholdOf(BIRDIES, level, "golf") })));
	const g2Birdie = birdies.some((b) => b.i.g2 && b.here > 0) ? 1 : 0;
	out.push(progressFor(kit, BIRDIES, holder, "golf", (l) => l.strict ? g2Birdie : count, { gained: birdieHits }));
	const whole = cards.filter((i) => i.g2 && i.gross != null);
	const variantOf = (i) => i.nine ? "golf9" : "golf";
	const barrierHits = milestones(BARRIER, whole, (i) => i.gross, { variant: variantOf });
	out.push(...careerAwards(kit, BARRIER, holder, "golf", barrierHits, (i, level) => cardProof(kit, i, {
		n: thresholdOf(BARRIER, level, variantOf(i)),
		hoyos: i.holes.length,
		gross: i.gross
	})));
	const best18 = lowest(whole.filter((i) => !i.nine).map((i) => i.gross));
	const best9 = lowest(whole.filter((i) => i.nine).map((i) => i.gross));
	if (best18 != null || best9 != null) out.push(progressFor(kit, BARRIER, holder, "golf", best18 ?? best9, {
		variant: best18 != null ? "golf" : "golf9",
		gained: barrierHits
	}));
	const points = cards.filter((i) => i.g2).map((i) => ({
		i,
		points: scoreRound(scoreInput(i, cappedHcp(kit, i)), {
			format: "stableford",
			basis: "net"
		}).points
	}));
	const stableHits = milestones(STABLEFORD, points, (p) => p.points, { variant: (p) => variantOf(p.i) });
	out.push(...careerAwards(kit, STABLEFORD, holder, "golf", stableHits, (p) => cardProof(kit, p.i, {
		n: p.points,
		hoyos: p.i.holes.length
	})));
	const pts18 = highest(points.filter((p) => !p.i.nine).map((p) => p.points));
	const pts9 = highest(points.filter((p) => p.i.nine).map((p) => p.points));
	if (pts18 != null || pts9 != null) out.push(progressFor(kit, STABLEFORD, holder, "golf", pts18 ?? pts9, {
		variant: pts18 != null ? "golf" : "golf9",
		gained: stableHits
	}));
	const firstOn = (par) => cards.find((i) => played(i).some((x) => x.hole.par === par && x.strokes <= par - 1));
	const three = [
		3,
		4,
		5
	].map(firstOn);
	if (three.every((i) => !!i)) {
		const [a, b, c] = three;
		out.push(...careerAwards(kit, COLLECTION, holder, "golf", [{
			level: 0,
			item: a
		}], () => cardProof(kit, a, {}, [b, c])));
	}
	return out;
}
const golfCareer = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const t of targetAccounts(kit, "golf")) {
		const produced = golfCareerFor(kit, t, accountCards(kit, t));
		out.push(...produced, ...staleRevokes(kit, produced, {
			holders: [t.holder],
			keys: CAREER_KEYS$1,
			sport: "golf",
			period: always
		}));
	}
	return out;
};
/**
* Subiendo (golf): diferencial medio de las primeras 5 tarjetas G2 de 18 hoyos menos el de las últimas 5, con 10 o
* más. Se mide después de cada tarjeta y un nivel alcanzado se queda.
*/
const golfClimbing = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const window = paramOf(CLIMBING, "window", "golf") ?? 5;
	const min = Math.max(paramOf(CLIMBING, "minCount", "golf") ?? 10, window * 2);
	const out = [];
	for (const t of targetAccounts(kit, "golf")) {
		const cards = accountCards(kit, t).filter((i) => i.g2 && !i.nine && i.diff != null);
		const steps = [];
		if (cards.length >= min) {
			const first = cards.slice(0, window).reduce((n, i) => n + i.diff, 0) / window;
			for (let k = min; k <= cards.length; k++) {
				const last = cards.slice(k - window, k).reduce((n, i) => n + i.diff, 0) / window;
				steps.push({
					i: cards[k - 1],
					gain: round1(first - last)
				});
			}
		}
		const hits = milestones(CLIMBING, steps, (s) => s.gain, { variant: "golf" });
		const produced = careerAwards(kit, CLIMBING, t.holder, "golf", hits, (s) => cardProof(kit, s.i, { n: s.gain }));
		produced.push(progressFor(kit, CLIMBING, t.holder, "golf", Math.max(0, ...steps.map((s) => s.gain)), { gained: hits }));
		out.push(...produced, ...staleRevokes(kit, produced, {
			holders: [t.holder],
			keys: [CLIMBING.key],
			sport: "golf",
			period: always
		}));
	}
	return out;
};
/** Las marcas de una tarjeta que van al jugador en su liga (periodo `c:<card>`). */
function cardDecisions(kit, i) {
	if (!i.g1 || !realOn(kit, i.card.league_id, i.date)) return [];
	const out = [];
	const holder = playerHolderOf(i.card.player_id, i.card.league_id);
	const period = periodKey.card(i.card.id);
	const status = statusFor(kit, i.date);
	const refs = [cardRef(i)];
	const context = {
		...leagueCtx(kit, i.card.league_id),
		...eventCtx(kit, i.card.event_id)
	};
	const campo = i.round.course.name;
	const holes = played(i);
	const full = !i.nine && i.gross != null;
	const cards = (kit.snap.golf_cards ?? []).filter((c) => c.event_id === i.card.event_id);
	const reviewers = () => reviewersFor(kit, i.card.league_id, cards.map((c) => kit.userOf(c.player_id)));
	const markers = () => markersOf(i.card, cards, i.round, kit.userOf);
	if (i.g2) {
		const eagles = holes.filter((x) => x.strokes >= 2 && x.strokes <= x.hole.par - 2);
		const plain = eagles.filter((x) => x.strokes === x.hole.par - 2);
		if (plain.length) out.push(awardOf(EAGLE, holder, "golf", 0, period, status, refs, {
			...context,
			values: {
				hoyo: plain[0].hole.number,
				n: plain.length,
				campo
			}
		}));
		else if (eagles.length) out.push(reviewOf(EAGLE, holder, "golf", 0, period, refs, {
			...context,
			alt: "albatross",
			values: {
				hoyo: eagles[0].hole.number,
				campo
			},
			markers: markers()
		}, reviewers()));
		const aces = holes.filter((x) => x.strokes === 1);
		if (aces.length) out.push(reviewOf(HOLE_IN_ONE, holder, "golf", 0, period, refs, {
			...context,
			values: {
				hoyo: aces[0].hole.number,
				campo
			},
			markers: markers()
		}, reviewers()));
		const par = i.holes.reduce((n, h) => n + h.par, 0);
		if (full && i.gross <= par) out.push(reviewOf(PAR_ROUND, holder, "golf", 0, period, refs, {
			...context,
			values: {
				n: i.gross,
				par,
				campo
			},
			markers: markers()
		}, reviewers()));
		if (full && holes.every((x) => x.strokes <= x.hole.par + 2)) out.push(awardOf(NO_DISASTER, holder, "golf", 0, period, status, refs, {
			...context,
			values: {
				n: i.gross,
				campo
			}
		}));
	}
	if (i.gross != null && i.round.course_id) {
		const all = cardInfos(kit);
		const at = all.indexOf(i);
		const prior = all.slice(0, at).filter((x) => x.g1 && x.card.player_id === i.card.player_id && x.round.course_id === i.round.course_id && x.card.tee_id === i.card.tee_id && x.round.nine === i.round.nine && x.date < i.date);
		const before = lowest(prior.filter((x) => x.gross != null).map((x) => x.gross));
		if (prior.length >= (paramOf(COURSE_BEST, "minPriorRounds", "golf") ?? 2) && before != null && i.gross < before) out.push(awardOf(COURSE_BEST, holder, "golf", 0, period, status, refs, {
			...context,
			values: {
				n: i.gross,
				gain: before - i.gross,
				campo
			}
		}));
	}
	return out;
}
const golfCard = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const historial = job.kind === "historial";
	const targets = new Set(targetPlayers(kit, "golf").map((p) => p.id));
	const refCards = new Set(refIds(job, "card"));
	const events = jobEvents(kit);
	const out = [];
	const scopes = [];
	const seen = /* @__PURE__ */ new Set();
	for (const i of cardInfos(kit)) {
		const c = i.card;
		if (!targets.has(c.player_id) || !(historial || refCards.has(c.id) || events.has(c.event_id))) continue;
		seen.add(c.id);
		out.push(...cardDecisions(kit, i));
		scopes.push({
			holders: [playerHolderOf(c.player_id, c.league_id)],
			keys: CARD_KEYS,
			sport: "golf",
			period: (p) => p === periodKey.card(c.id)
		});
	}
	for (const id of refCards) if (!seen.has(id)) scopes.push({
		keys: CARD_KEYS,
		sport: "golf",
		period: (p) => p === periodKey.card(id)
	});
	if (historial) for (const p of targets) scopes.push({
		holders: [playerHolderOf(p, kit.players.get(p).league_id)],
		keys: CARD_KEYS,
		sport: "golf",
		period: (k) => k.startsWith("c:")
	});
	for (const s of scopes) out.push(...staleRevokes(kit, out, s));
	return out;
};
/**
* Podio de golf (§2.1): ronda cerrada (periodo `e:<event>`) o torneo con todas sus rondas cerradas (`gt:<id>`), en
* una liga `kind='liga'`. `golfLeaderboard` con el formato de la competición y desempate por countback, sobre
* tarjetas G1 de 4+ cuentas distintas (en un torneo, de quienes jugaron todas las rondas). Lo neto usa el índice
* topado. Tamaño del podio por §1.7.8; un puesto que comparten más de 3 no da nada.
*/
function golfPodiumFor(kit, rounds, period) {
	const league = kit.leagues.get(rounds[0]?.league_id ?? "");
	if (!league || league.kind !== "liga" || !rounds.every((r) => r.status === "cerrada")) return [];
	const dates = rounds.map((r) => kit.events.get(r.event_id)?.date).filter((d) => !!d);
	if (dates.length !== rounds.length) return [];
	const last = rounds[rounds.length - 1];
	if (!realOn(kit, league.id, dates.reduce((a, b) => a > b ? a : b))) return [];
	const byRound = rounds.map((r) => new Map(cardInfos(kit).filter((i) => i.card.event_id === r.event_id && i.g1).map((i) => [i.card.player_id, i])));
	const players = [...byRound[0].keys()].filter((p) => byRound.every((m) => m.has(p)));
	if (new Set(players.map(kit.userOf).filter((u) => !!u)).size < (paramOf(PODIUM, "minAccounts", "golf") ?? 4)) return [];
	const comp = rounds[0].competition;
	const net = comp.basis === "net";
	const ranked = golfLeaderboard(players.map((p) => ({
		id: p,
		rounds: byRound.map((m) => {
			const i = m.get(p);
			return scoreInput(i, net ? cappedHcp(kit, i) : i.card.playing_hcp);
		})
	})), comp, { rounds: rounds.length }).filter((r) => r.rank != null);
	const levels = podiumLevels(ranked.length);
	const out = [];
	for (const place of [
		1,
		2,
		3
	]) {
		const at = ranked.filter((r) => r.rank === place);
		const level = placeLevel(place);
		if (!at.length || at.length > 3 || level == null || !levels.includes(level)) continue;
		for (const row of at) out.push(awardOf(PODIUM, playerHolderOf(row.id, league.id), "golf", level, period, "firme", byRound.map((m) => cardRef(m.get(row.id))), {
			...leagueCtx(kit, league.id),
			...eventCtx(kit, last.event_id),
			values: {
				n: place,
				of: ranked.length,
				value: row.value
			}
		}));
	}
	return out;
}
/**
* Rondas o torneos del trabajo; en el historial de una liga, todos los suyos que ya pasaron su gracia (24 h desde el
* cierre). El historial de una cuenta (sin liga) no da podios: su foto no trae la historia de los demás (su índice
* topado) y el de la liga ya los da.
*/
function scopedCompetitions(kit) {
	const all = kit.snap.golf_rounds ?? [];
	const graceMs = (paramOf(PODIUM, "graceHours", "golf") ?? 24) * 36e5;
	const historial = kit.job.kind === "historial";
	const refs = jobEvents(kit);
	const tournaments = new Set(refIds(kit.job, "gt"));
	const singles = [];
	for (const r of all) {
		if (!(historial ? !!kit.job.league_id && r.league_id === kit.job.league_id : refs.has(r.event_id))) continue;
		if (r.tournament_id) tournaments.add(r.tournament_id);
		else singles.push(r);
	}
	const out = singles.map((r) => ({
		rounds: [r],
		period: periodKey.event(r.event_id)
	}));
	for (const t of tournaments) {
		const rounds = all.filter((r) => r.tournament_id === t).sort((a, b) => (a.round_no ?? 0) - (b.round_no ?? 0));
		if (rounds.length) out.push({
			rounds,
			period: periodKey.golfTournament(t)
		});
	}
	return out.filter(({ rounds }) => {
		if (!rounds.every((r) => r.status === "cerrada")) return false;
		if (!historial) return true;
		return Math.max(...rounds.map((r) => Date.parse(r.closed_at ?? "") || Infinity)) + graceMs <= kit.now;
	});
}
const golfPodium = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const { rounds, period } of scopedCompetitions(kit)) {
		const produced = golfPodiumFor(kit, rounds, period);
		out.push(...produced, ...staleRevokes(kit, produced, {
			keys: [PODIUM.key],
			sport: "golf",
			period: (p) => p === period
		}));
	}
	return out;
};
const GOLF_EVALUATORS = {
	debut: golfDebut,
	climbing: golfClimbing,
	event_podium: golfPodium,
	golf_career: golfCareer,
	golf_card: golfCard
};
//#endregion
//#region src/badges/evaluators/swim.ts
/**
* Evaluadores de natación (docs/insignias.md §2.1 y §2.8): el debut, las de carrera de la cuenta (`swim_career`) y lo
* de un encuentro finalizado que va al nadador en su liga (`swim_meet`: medallas y récords). Tiempos W1 (rules/swim.ts),
* marcas personales con `personalBests` y puestos con `placeResults`, como la app. Nunca se usa `seed_cs`.
*
* Trabajos: `resultado` con 'meet:<event>' (al finalizar), `vinculo`, `evento` con 'meet:<event>' e `historial`. Lo que
* necesita de la foto:
* - `swim_entries` con el historial completo de natación de esas cuentas (y del jugador sin cuenta), con sus
*   `swim_events`, `swim_meets` y `events` (fecha, tipo y nombre del encuentro);
* - en un `evento`, todo el encuentro y los resultados anteriores de la liga en las mismas pruebas (estilo, distancia,
*   piscina y sexo) para los récords, y `swim_clubs` para el nombre del club;
* - `players`, `leagues`, `members`, `profiles` y `league_months`; `awards` y `progress` de los dueños del trabajo.
*/
const def = (key) => badgeDef(key);
const DEBUT = def("debut");
const RACES = def("swim_races");
const PERSONAL_BEST = def("swim_personal_best");
const BIG_DROP = def("swim_big_drop");
const FOUR_STROKES = def("swim_four_strokes");
const DISTANCE = def("swim_distance");
const MEDAL = def("swim_medal");
const RECORD = def("swim_record");
const CAREER_KEYS = badgesOfEvaluator("swim_career").map((d) => d.key);
const MEET_KEYS = badgesOfEvaluator("swim_meet").map((d) => d.key);
/** Los cuatro estilos de `swim_four_strokes` (el combinado no es uno). */
const FOUR = [
	"libre",
	"espalda",
	"pecho",
	"mariposa"
];
const infosMemo = /* @__PURE__ */ new WeakMap();
/** Todos los resultados de la foto, en orden: fecha, encuentro y número de prueba. */
function swimInfos(kit) {
	const hit = infosMemo.get(kit);
	if (hit) return hit;
	const sctx = swimContext(kit.snap.swim_events ?? [], kit.snap.swim_meets ?? [], kit.userOf);
	const out = [];
	for (const entry of kit.snap.swim_entries ?? []) {
		const ev = sctx.events.get(entry.swim_event_id);
		const meet = sctx.meets.get(entry.event_id);
		const event = kit.events.get(entry.event_id);
		if (!ev || !meet || !event) continue;
		out.push({
			entry,
			ev,
			meet,
			event,
			date: event.date,
			w1: entryIsW1(entry, sctx)
		});
	}
	out.sort((a, b) => a.date.localeCompare(b.date) || a.entry.event_id.localeCompare(b.entry.event_id) || a.ev.num - b.ev.num || a.entry.id.localeCompare(b.entry.id));
	infosMemo.set(kit, out);
	return out;
}
/** Tiempos W1 que suman para una insignia de cuenta: de sus nadadores y en ligas reales ese mes. */
function accountSwims(kit, t) {
	const mine = new Set(t.players);
	return swimInfos(kit).filter((i) => mine.has(i.entry.player_id) && i.w1 && realOn(kit, i.entry.league_id, i.date, t));
}
/** «100 m libre en piscina de 25 m» (con el sexo de la prueba para los récords). */
function raceLabel(ev, withGender = false) {
	const g = withGender ? ` ${GENDER_LABEL[ev.gender].toLowerCase()}` : "";
	return `${ev.distance} m ${STROKE_LABEL[ev.stroke].toLowerCase()}${g} en piscina de ${ev.pool} m`;
}
const swimRef = (i) => `swim:${i.entry.id}`;
const swimProof = (kit, i, values, more = []) => ({
	date: [i, ...more].reduce((d, x) => x.date > d ? x.date : d, i.date),
	refs: [i, ...more].map(swimRef),
	values,
	context: {
		...leagueCtx(kit, i.entry.league_id),
		...eventCtx(kit, i.entry.event_id)
	}
});
/** Primera prueba: un resultado que no es `dns` en un encuentro finalizado (§1.7.2), en liga real. */
const swimDebut = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const t of targetAccounts(kit, "swimming")) {
		const mine = new Set(t.players);
		const first = swimInfos(kit).find((i) => mine.has(i.entry.player_id) && i.entry.status !== "dns" && !!i.meet.finalized_at && realOn(kit, i.entry.league_id, i.date, t) && (!kit.verifiedOnly(i.entry.player_id) || i.w1));
		const produced = first ? careerAwards(kit, DEBUT, t.holder, "swimming", [{
			level: 0,
			item: first
		}], (i) => swimProof(kit, i, {})) : [];
		out.push(...produced, ...staleRevokes(kit, produced, {
			holders: [t.holder],
			keys: [DEBUT.key],
			sport: "swimming",
			period: always
		}));
	}
	return out;
};
/** Todas las de carrera de natación de un dueño con sus tiempos W1 (ya en orden y en ligas reales). */
function swimCareerFor(kit, t, swims) {
	const out = [];
	const holder = t.holder;
	const byId = new Map(swims.map((i) => [i.entry.id, i]));
	const races = swims.map((i, k) => ({
		i,
		n: k + 1
	}));
	const raceHits = milestones(RACES, races, (r) => r.n, { variant: "swimming" });
	out.push(...careerAwards(kit, RACES, holder, "swimming", raceHits, (r, level) => swimProof(kit, r.i, { n: thresholdOf(RACES, level, "swimming") })));
	out.push(progressFor(kit, RACES, holder, "swimming", swims.length, { gained: raceHits }));
	const steps = personalBestSteps(swims.map((i) => ({
		distance: i.ev.distance,
		stroke: i.ev.stroke,
		pool: i.ev.pool,
		time: i.entry.time_cs,
		status: i.entry.status,
		date: i.date,
		eventId: i.entry.id
	}))).flatMap((s) => {
		const i = s.eventId ? byId.get(s.eventId) : void 0;
		return i ? [{
			...s,
			i
		}] : [];
	});
	const counted = steps.map((s, k) => ({
		s,
		n: k + 1
	}));
	const pbHits = milestones(PERSONAL_BEST, counted, (c) => c.n, { variant: "swimming" });
	out.push(...careerAwards(kit, PERSONAL_BEST, holder, "swimming", pbHits, (c, level) => swimProof(kit, c.s.i, {
		n: thresholdOf(PERSONAL_BEST, level, "swimming"),
		prueba: raceLabel(c.s.i.ev)
	})));
	out.push(progressFor(kit, PERSONAL_BEST, holder, "swimming", steps.length, { gained: pbHits }));
	const minDays = paramOf(BIG_DROP, "minDaysSincePrevious", "swimming") ?? 21;
	const drops = steps.filter((s) => daysBetween(s.previousDate, s.date) >= minDays);
	const dropHits = milestones(BIG_DROP, drops, (s) => s.pct, { variant: "swimming" });
	out.push(...careerAwards(kit, BIG_DROP, holder, "swimming", dropHits, (s) => swimProof(kit, s.i, {
		n: s.pct,
		prueba: raceLabel(s.i.ev)
	})));
	out.push(progressFor(kit, BIG_DROP, holder, "swimming", Math.max(0, ...drops.map((s) => s.pct)), { gained: dropHits }));
	const firsts = FOUR.map((s) => swims.find((i) => i.ev.stroke === s));
	if (firsts.every((i) => !!i)) {
		const [a, ...rest] = firsts;
		out.push(...careerAwards(kit, FOUR_STROKES, holder, "swimming", [{
			level: 0,
			item: a
		}], () => swimProof(kit, a, {}, rest)));
	}
	const free = swims.filter((i) => i.ev.stroke === "libre");
	const distHits = milestones(DISTANCE, free, (i) => i.ev.distance, { variant: "swimming" });
	out.push(...careerAwards(kit, DISTANCE, holder, "swimming", distHits, (i, level) => swimProof(kit, i, {
		n: thresholdOf(DISTANCE, level, "swimming"),
		prueba: raceLabel(i.ev)
	})));
	out.push(progressFor(kit, DISTANCE, holder, "swimming", Math.max(0, ...free.map((i) => i.ev.distance)), { gained: distHits }));
	return out;
}
const swimCareer = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const t of targetAccounts(kit, "swimming")) {
		const produced = swimCareerFor(kit, t, accountSwims(kit, t));
		out.push(...produced, ...staleRevokes(kit, produced, {
			holders: [t.holder],
			keys: CAREER_KEYS,
			sport: "swimming",
			period: always
		}));
	}
	return out;
};
/** Metales de un grupo según sus nadadores W1 (§1.7.8): oro con 3+, plata con 4+, bronce con 5+. */
function medalLevels(swimmers) {
	const out = [];
	if (swimmers >= (paramOf(MEDAL, "goldMin", "swimming") ?? 3)) out.push(3);
	if (swimmers >= (paramOf(MEDAL, "silverMin", "swimming") ?? 4)) out.push(2);
	if (swimmers >= (paramOf(MEDAL, "bronzeMin", "swimming") ?? 5)) out.push(1);
	return out;
}
/**
* Medallas de un encuentro `encuentro` o `torneo` (no `control`): lugar por `placeResults` entre los W1 de cada
* prueba, por sexo de la prueba y grupo de edad. Los empatados comparten (hasta 3).
*/
function medalsFor(kit, meet, event) {
	if (!isOfficialMeet(event.type)) return [];
	const out = [];
	const mine = swimInfos(kit).filter((i) => i.entry.event_id === meet.event_id && i.w1);
	for (const list of groupBy(mine, (i) => i.ev.id).values()) {
		const placed = placeResults(list.map((i) => ({
			entryId: i.entry.id,
			gender: i.ev.gender,
			ageGroup: i.entry.age_group,
			time: i.entry.time_cs,
			status: i.entry.status,
			i
		})), meet.points);
		const sizes = /* @__PURE__ */ new Map();
		const ties = /* @__PURE__ */ new Map();
		for (const r of placed) {
			const g = `${r.gender ?? ""}|${r.ageGroup ?? ""}`;
			sizes.set(g, (sizes.get(g) ?? 0) + 1);
			if (r.place != null) ties.set(`${g}|${r.place}`, (ties.get(`${g}|${r.place}`) ?? 0) + 1);
		}
		for (const r of placed) {
			const g = `${r.gender ?? ""}|${r.ageGroup ?? ""}`;
			const level = r.place == null ? null : placeLevel(r.place);
			if (level == null || !medalLevels(sizes.get(g)).includes(level) || (ties.get(`${g}|${r.place}`) ?? 0) > 3) continue;
			out.push(awardOf(MEDAL, playerHolderOf(r.i.entry.player_id, meet.league_id), "swimming", level, periodKey.race(r.i.entry.id), "firme", [swimRef(r.i)], {
				...leagueCtx(kit, meet.league_id),
				...eventCtx(kit, meet.event_id),
				values: {
					n: r.place,
					of: sizes.get(g),
					prueba: raceLabel(r.i.ev),
					time: r.i.entry.time_cs
				}
			}));
		}
	}
	return out;
}
/**
* Récords de un encuentro (una sola vez, al finalizarlo: los récords no se guardan). Liga (oro): el W1 más rápido del
* encuentro en su prueba (estilo, distancia y piscina) y sexo, más rápido que todos los W1 anteriores de la liga, con
* 5+ tiempos de 3+ nadadores. Club (plata): lo mismo dentro de su club, con 3+ tiempos de 2+ nadadores.
*/
function recordsFor(kit, meet) {
	const all = swimInfos(kit).filter((i) => i.w1 && i.entry.league_id === meet.league_id);
	const here = all.filter((i) => i.entry.event_id === meet.event_id);
	if (!here.length) return [];
	const date = here[0].date;
	const keyOf = (i) => `${bestKey(i.ev)}|${i.ev.gender}`;
	const before = groupBy(all.filter((i) => i.entry.event_id !== meet.event_id && i.date < date), keyOf);
	const clubs = new Map((kit.snap.swim_clubs ?? []).map((c) => [c.id, c]));
	const req = (level) => levelDef(RECORD, level)?.req ?? {};
	const out = [];
	const beats = (i, prior, rivals, level) => {
		const r = req(level);
		const time = i.entry.time_cs;
		return prior.length >= (r.minTimes ?? 0) && new Set(prior.map((x) => x.entry.player_id)).size >= (r.minSwimmers ?? 0) && prior.every((x) => time < x.entry.time_cs) && rivals.every((x) => time <= x.entry.time_cs);
	};
	for (const [key, list] of groupBy(here, keyOf)) {
		const prior = before.get(key) ?? [];
		for (const i of list) {
			const holder = playerHolderOf(i.entry.player_id, meet.league_id);
			const give = (level, club) => out.push(awardOf(RECORD, holder, "swimming", level, periodKey.race(i.entry.id), "firme", [swimRef(i)], {
				...leagueCtx(kit, meet.league_id),
				...eventCtx(kit, meet.event_id),
				values: {
					n: i.entry.time_cs,
					prueba: raceLabel(i.ev, true),
					...club ? { club } : {}
				}
			}));
			if (beats(i, prior, list, 3)) give(3);
			const club = i.entry.club_id;
			if (club) {
				const same = (x) => x.entry.club_id === club;
				if (beats(i, prior.filter(same), list.filter(same), 2)) give(2, clubs.get(club)?.name);
			}
		}
	}
	return out;
}
/**
* Encuentros del trabajo: el del ref (`meet:` o `event:`), o en el historial de una liga todos sus finalizados. El
* historial de una cuenta (sin liga) no da medallas ni récords: los da el de la liga, con la liga entera.
*/
function scopedMeets(kit) {
	const refs = jobEvents(kit);
	const historial = kit.job.kind === "historial";
	return (kit.snap.swim_meets ?? []).filter((m) => !!m.finalized_at && (historial ? !!kit.job.league_id && m.league_id === kit.job.league_id : refs.has(m.event_id)));
}
const swimMeet = (job, snap, now) => {
	const kit = kitOf(job, snap, now);
	const out = [];
	for (const meet of scopedMeets(kit)) {
		const event = kit.events.get(meet.event_id);
		const ids = new Set((snap.swim_entries ?? []).filter((e) => e.event_id === meet.event_id).map((e) => periodKey.race(e.id)));
		const produced = event && realOn(kit, meet.league_id, event.date) ? [...medalsFor(kit, meet, event), ...recordsFor(kit, meet)] : [];
		out.push(...produced, ...staleRevokes(kit, produced, {
			keys: MEET_KEYS,
			sport: "swimming",
			period: (p) => ids.has(p)
		}));
	}
	return out;
};
//#endregion
//#region src/badges/engine.ts
/**
* Motor de las insignias automáticas (docs/insignias.md §3.1): `evaluate(job, snapshot, now)` corre, sin E/S, los
* evaluadores que tocan a ese tipo de trabajo (`EVALUATOR_JOBS` en catalog.ts) y devuelve las decisiones que aplica
* `private.badge_apply` en una sola transacción.
*
* Cada familia exporta un `EvaluatorSet` (id del catálogo → uno o varios evaluadores; un id compartido como `debut`
* o `event_podium` lleva uno por deporte, y cada uno solo mira lo suyo) y se suma a `FAMILIES`. Después, el motor
* asienta lo que salió (`settle`):
* - descarta lo que el catálogo no permite (key o deporte que no existen, `badges_auto` de la liga, ligas con
*   menores, las que piden cuenta) y retira la provisional que ya existía de eso;
* - no repite lo que ya está igual (idempotencia): dar una fila provisional con la misma evidencia o una firme, pedir
*   aval de una que ya lo espera, el mismo progreso, o retirar lo que ya no está activo. Una provisional con otra
*   evidencia sí sale (badge_apply actualiza `refs` y `context`), igual que una provisional que ahora pide aval
*   (pasa a `en_revision`) o una en revisión que ya no lo pide (vuelve a provisional);
* - nunca revive lo que se retiró por aval rechazado o por fraude (solo vuelve lo que se retiró por evidencia);
* - si un evaluador da una fila y otro la retira, gana dar.
* `decide` (lo que corre la Edge Function) suma antes las adopciones (`adoptions`): las copias de respaldo de
* jugadores que ahora tienen cuenta pasan a la cuenta (§1.6).
*/
/** Las familias del motor. Una familia nueva se suma aquí. */
const FAMILIES = [
	BOWLING_EVALUATORS,
	GOLF_EVALUATORS,
	{
		debut: swimDebut,
		swim_career: swimCareer,
		swim_meet: swimMeet
	},
	RACKET_EVALUATORS,
	TEAM_EVALUATORS,
	PERIOD_EVALUATORS,
	ACCOUNT_EVALUATORS
];
/** Los evaluadores de un id, en el orden de las familias. */
function evaluatorsOf(id, families = FAMILIES) {
	const out = [];
	for (const f of families) {
		const e = f[id];
		if (!e) continue;
		if (typeof e === "function") out.push(e);
		else out.push(...e);
	}
	return out;
}
/**
* Evalúa un trabajo de la cola con su foto. `now` en milisegundos o ISO (por defecto, la hora de la foto). Los
* trabajos `aviso` los resuelve SQL solo (`badge_notices`).
*/
function evaluate(job, snapshot, now = snapshot.now, families = FAMILIES) {
	if (job.kind === "aviso") return [];
	const t = typeof now === "number" ? now : Date.parse(now);
	const raw = [];
	for (const id of evaluatorsFor(job.kind)) for (const run of evaluatorsOf(id, families)) raw.push(...run(job, snapshot, t));
	return settle(snapshot, raw);
}
/**
* Todo lo que decide el motor para un trabajo (lo que corre la Edge Function, edge.ts): `evaluate` más las
* adopciones de las copias de respaldo (§1.6). Las adopciones van primero: así lo que se le da a la cuenta encuentra
* la fila ya movida y no se avisa dos veces.
*/
function decide(job, snapshot, now = snapshot.now, families = FAMILIES) {
	if (job.kind === "aviso") return [];
	const settled = evaluate(job, snapshot, now, families);
	const { adopt, drop, cleanup } = adoptions(snapshot, settled);
	return [
		...adopt,
		...settled.filter((d) => d.kind === "progress" || !drop.has(rowKey(d))),
		...cleanup
	];
}
/**
* Las copias de respaldo de la foto cuyo jugador ya tiene cuenta: filas de insignias de ámbito cuenta guardadas en
* el jugador (`player_id` + `league_id`). Cada una pasa a la cuenta (`adopt`) y su progreso de jugador se borra
* (la cuenta lleva el suyo). Si el jugador se vinculó él mismo (`players[].verified_only`, §1.6), solo
* cuenta lo verificado: pasa solo lo que la cuenta ya tiene o gana en esta corrida (se juntan); las demás
* provisionales se retiran y las firmes se quedan en el jugador. `drop` son las filas del jugador que ya no hay que
* tocar (se movieron o se retiran aquí).
*/
function adoptions(snapshot, settled) {
	const players = new Map((snapshot.players ?? []).map((p) => [p.id, p]));
	const verifiedOnly = (p) => players.get(p)?.verified_only === true;
	const accountOf = (playerId, leagueId, key) => {
		if (!playerId || !leagueId || badgeDef(key)?.scope !== "cuenta") return null;
		const p = players.get(playerId);
		return p?.user_id && p.league_id === leagueId ? p.user_id : null;
	};
	const accountRows = /* @__PURE__ */ new Set();
	for (const a of snapshot.awards ?? []) if (a.user_id && a.status !== "revocada") accountRows.add(rowKey(a));
	for (const d of settled) if ((d.kind === "award" || d.kind === "review") && d.user_id) accountRows.add(rowKey(d));
	const adopt = [];
	const drop = /* @__PURE__ */ new Set();
	const cleanup = [];
	for (const a of snapshot.awards ?? []) {
		const user = accountOf(a.player_id, a.league_id, a.badge_key);
		if (!user || !a.player_id || !a.league_id) continue;
		const merges = accountRows.has(rowKey({
			...a,
			player_id: null,
			user_id: user
		}));
		if (verifiedOnly(a.player_id) && !merges) {
			if (a.status === "provisional" || a.status === "en_revision") {
				cleanup.push(revokeOf(a));
				drop.add(rowKey(a));
			}
			continue;
		}
		adopt.push({
			kind: "adopt",
			badge_key: a.badge_key,
			sport: a.sport,
			level: a.level,
			period_key: a.period_key,
			player_id: a.player_id,
			league_id: a.league_id,
			user_id: user
		});
		drop.add(rowKey(a));
	}
	for (const p of snapshot.progress ?? []) {
		if (!accountOf(p.player_id, p.league_id, p.badge_key)) continue;
		cleanup.push({
			kind: "progress",
			player_id: p.player_id,
			user_id: null,
			league_id: p.league_id,
			badge_key: p.badge_key,
			sport: p.sport,
			value: p.value,
			target: p.target,
			next_level: null
		});
	}
	return {
		adopt,
		drop,
		cleanup
	};
}
/** La clave única de `badge_awards` (dueño, key, deporte, nivel, periodo). */
const rowKey = (d) => `${d.player_id ?? d.user_id ?? ""}|${d.badge_key}|${d.sport}|${d.level}|${d.period_key}`;
const progressKey = (d) => `${d.player_id ?? d.user_id ?? ""}|${d.badge_key}|${d.sport}`;
const sameRefs = (a, b) => {
	if (a.length !== b.length) return false;
	const x = [...a].sort();
	const y = [...b].sort();
	return x.every((r, i) => r === y[i]);
};
const revokeOf = (a) => ({
	kind: "revoke",
	player_id: a.player_id,
	user_id: a.user_id,
	league_id: a.league_id,
	badge_key: a.badge_key,
	sport: a.sport,
	level: a.level,
	period_key: a.period_key,
	reason: "evidencia"
});
/** ¿El catálogo deja dar esta fila? (key y deporte, liga para las de liga, `badges_auto`, menores, cuenta). */
function permitted(d, leagues) {
	const def = badgeDef(d.badge_key);
	if (!def) return false;
	if (def.sports === "all" ? d.sport !== "all" : d.sport === "all" || !def.sports.includes(d.sport)) return false;
	if (def.accountOnly && !d.user_id) return false;
	if (!d.player_id && !d.user_id) return false;
	const league = d.league_id ? leagues.get(d.league_id) : void 0;
	if (def.scope === "liga" && (!league || !d.player_id)) return false;
	if (league && def.noMinors && league.has_minors) return false;
	return !league || allowedBy(def, league.badges_auto);
}
/**
* Deja solo lo que cambia algo frente a lo que ya existe en la foto (`snapshot.awards` y `snapshot.progress`): en
* orden, dar y pedir aval, retirar, y el progreso.
*/
function settle(snapshot, raw) {
	const leagues = new Map((snapshot.leagues ?? []).map((l) => [l.id, l]));
	const rows = new Map((snapshot.awards ?? []).map((a) => [rowKey(a), a]));
	const progressRows = new Map((snapshot.progress ?? []).map((p) => [progressKey(p), p]));
	const gives = /* @__PURE__ */ new Map();
	const revokes = /* @__PURE__ */ new Map();
	const progress = /* @__PURE__ */ new Map();
	for (const d of raw) {
		if (d.kind === "progress") {
			progress.set(progressKey(d), d);
			continue;
		}
		const k = rowKey(d);
		if (d.kind === "revoke") {
			if (!revokes.has(k)) revokes.set(k, d);
			continue;
		}
		if (!permitted(d, leagues)) {
			const row = rows.get(k);
			if (row && !revokes.has(k)) revokes.set(k, revokeOf(row));
			continue;
		}
		if (!gives.has(k)) gives.set(k, d);
	}
	const out = [];
	for (const [k, d] of gives) {
		revokes.delete(k);
		const row = rows.get(k);
		if (!row) out.push(d);
		else if (row.status === "revocada") {
			if (row.revoke_reason === "evidencia") out.push(d);
		} else if (row.status === "provisional") {
			if (d.kind === "review" || !sameRefs(row.refs, d.refs) || row.context?.alt !== d.context.alt) out.push(d);
		} else if (row.status === "en_revision" && d.kind === "award") out.push(d);
	}
	for (const [k, r] of revokes) {
		const row = rows.get(k);
		if (row && (row.status === "provisional" || row.status === "en_revision")) out.push(r);
	}
	for (const [k, p] of progress) {
		const row = progressRows.get(k);
		if (p.next_level === null) {
			if (row) out.push(p);
		} else if (!row || row.value !== p.value || row.target !== p.target || row.next_level !== p.next_level) out.push(p);
	}
	return out;
}
//#endregion
//#region src/badges/edge.ts
/**
* Entrada del motor para la Edge Function `insignias` (docs/insignias.md §3.1). Es lo único que entra en
* supabase/functions/_shared/badges-engine.gen.js (`pnpm badges:bundle`, scripts/badges/bundle.mjs): un solo ESM sin
* imports que Deno carga tal cual. Todo puro, sin E/S; la función solo pide la foto, llama `evaluateJob` y aplica.
*
* Además del motor, pone en cada insignia que se da (o que pide aval) cómo se llama para el push: `context.name`
* («Primera línea», «Tu 2026») y, con nivel, `context.level_name` (el propio, «Pavo», o el metal: «oro»). Los lee
* `private.badge_push_label`; sin ellos el aviso dice «Insignia». Si el evaluador ya los puso, no se tocan.
*/
/**
* Lo que decide el motor (`decide`: `evaluate` más las copias de respaldo que pasan a la cuenta) con los nombres para
* el push. `now` en milisegundos o ISO (por defecto, la hora de la foto).
*/
function evaluateJob(job, snapshot, now) {
	return withPushLabels(decide(job, snapshot, now ?? snapshot.now));
}
/** Valores del contexto que sirven para rellenar un nombre con `{…}` (`year_recap`: «Tu {anio}»). */
function textVars(d) {
	const vars = {};
	for (const [k, v] of Object.entries(d.context.values ?? {})) if (typeof v === "string" || typeof v === "number") vars[k] = v;
	const c = d.context;
	if (c.league?.name) vars.liga ??= c.league.name;
	if (c.event?.name) vars.evento ??= c.event.name;
	if (c.season?.name) vars.temporada ??= c.season.name;
	if (c.team?.name) vars.equipo ??= c.team.name;
	if (vars.anio === void 0 && /^\d{4}$/.test(d.period_key)) vars.anio = d.period_key;
	return vars;
}
/** Quita lo que quedó sin rellenar («Tu {anio}» sin año → «Tu») y los espacios de más. */
const tidy = (text) => text.replace(/\{[a-z_]+\}/g, "").replace(/\s+/g, " ").trim();
/** Cómo se nombra la insignia en el push: {name, level_name?}; null si la key no está en el catálogo. */
function pushLabel(d) {
	const def = badgeDef(d.badge_key);
	if (!def) return null;
	const variants = variantsOf(d.sport);
	const name = tidy(fillText(nameOf(def, {
		variants,
		alt: typeof d.context.alt === "string" ? d.context.alt : null
	}), textVars(d))) || def.key;
	if (d.level === 0) return { name };
	const own = pickVariant(def.levelNames?.[d.level], variants);
	return {
		name,
		level_name: own ? tidy(fillText(own, textVars(d))) : LEVEL_TIER[d.level]
	};
}
/** Pone `context.name` y `context.level_name` en lo que se da o pide aval (sin cambiar lo que ya traían). */
function withPushLabels(decisions) {
	return decisions.map((d) => {
		if (d.kind !== "award" && d.kind !== "review") return d;
		const label = pushLabel(d);
		if (!label) return d;
		const context = { ...d.context };
		if (typeof context.name !== "string" || !context.name.trim()) context.name = label.name;
		if (label.level_name && (typeof context.level_name !== "string" || !context.level_name.trim())) context.level_name = label.level_name;
		return {
			...d,
			context
		};
	});
}
//#endregion
export { evaluateJob, pushLabel, withPushLabels };
export const SOURCE_HASH = "sha256-1528c458e17c07cf604926b5e301aa66fe8d18bca567b0a8fd37b6595a573b7b";
