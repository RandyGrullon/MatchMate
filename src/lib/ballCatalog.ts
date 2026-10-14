/**
 * Catálogo de bolas de boliche (marcas y modelos) para buscar y llenar una bola del arsenal
 * (docs/boliche-equipos-practicas-bolas.md §3). Datos fijos en la app: no hay que pedir nada al servidor.
 *
 * Los modelos: los de las marcas de EE. UU. que salieron de 2016 en adelante (y algunos anteriores que se siguen
 * usando o vendiendo: Hy-Road, !Q Tour Edition, Pitch Black, las de entrada y las de spare). Solo variantes de color
 * cuando la marca las vende con su propio nombre (Hustle Ink, Hustle Camo…); si una línea sale en varios colores
 * («Tropical Surge», «Rhino», «White Dot») va una sola vez.
 * Fuentes: la lista de bolas aprobadas de USBC (bowl.com), las páginas de las marcas y la base de bowwwl.com (fecha de
 * salida, cubierta, núcleo y colores). Lo que no se pudo confirmar no está (o va sin ese campo).
 */

/** Las mismas cubiertas que `BALL_COVERS` (src/lib/balls.ts). */
export type CatalogCover = 'solida' | 'perlada' | 'hibrida' | 'uretano' | 'poliester';

export interface CatalogBall {
  /** 'marca:modelo' en minúsculas y con guiones, p. ej. 'storm:phaze-ii'. Es lo que se guarda en `bowling_balls.catalog`. */
  id: string;
  brand: string;
  name: string;
  cover: CatalogCover;
  /** El nombre de la cubierta según la marca («TX-16», «R2S Pearl»). */
  coverstock?: string;
  core?: 'simetrico' | 'asimetrico';
  /** Año en que salió. */
  year?: number;
  /** Colores aproximados (#rrggbb), del principal al secundario: sirven para proponer el diseño de la bola. */
  colors?: string[];
}

export const BALL_CATALOG: readonly CatalogBall[] = [
  // Storm (EE. UU.): Premier, Master, Thunder, Hot y Lab; de entrada y spare: Tropical, Ice, Clear Storm, Mix y Pitch.
  { id: 'storm:iq-tour-sapphire', brand: 'Storm', name: '!Q Tour Sapphire', cover: 'perlada', coverstock: 'R2S Pearl', core: 'simetrico', year: 2026, colors: ['#183e64', '#5b7d70'] },
  { id: 'storm:alpha-crux', brand: 'Storm', name: 'Alpha Crux', cover: 'solida', coverstock: 'GI-26 Solid', core: 'asimetrico', year: 2026, colors: ['#1f252e', '#467275', '#96bc45'] },
  { id: 'storm:bionic', brand: 'Storm', name: 'Bionic', cover: 'hibrida', coverstock: 'NRG Hybrid', core: 'simetrico', year: 2026, colors: ['#cc386b', '#4a3453', '#2385a3'] },
  { id: 'storm:concept', brand: 'Storm', name: 'Concept', cover: 'perlada', coverstock: 'ARC Pearl', core: 'simetrico', year: 2026, colors: ['#476077', '#6f8ea4'] },
  { id: 'storm:equinox-hybrid', brand: 'Storm', name: 'Equinox Hybrid', cover: 'hibrida', coverstock: 'A2S Hybrid', core: 'asimetrico', year: 2026, colors: ['#11131b', '#8d3323', '#394b68'] },
  { id: 'storm:ion-max-pearl', brand: 'Storm', name: 'Ion Max Pearl', cover: 'perlada', coverstock: 'NRG Pearl', core: 'asimetrico', year: 2026, colors: ['#283256', '#679290', '#bcc8af'] },
  { id: 'storm:monsoon', brand: 'Storm', name: 'Monsoon', cover: 'solida', coverstock: 'Reactor Solid', core: 'simetrico', year: 2026, colors: ['#723b7a', '#2a9179', '#89d260'] },
  { id: 'storm:rocket-ai', brand: 'Storm', name: 'Rocket A.I.', cover: 'perlada', coverstock: 'A1S Pearl', core: 'simetrico', year: 2026, colors: ['#6a556b', '#462439', '#ac9da3'] },
  { id: 'storm:iq-tour-ai', brand: 'Storm', name: '!Q Tour A.I.', cover: 'hibrida', coverstock: 'R2S Hybrid', core: 'simetrico', year: 2025, colors: ['#525558', '#151f25'] },
  { id: 'storm:equinox', brand: 'Storm', name: 'Equinox', cover: 'perlada', coverstock: 'A1S Pearl', core: 'asimetrico', year: 2025, colors: ['#120f3d', '#755d54', '#a89d9a'] },
  { id: 'storm:equinox-solid', brand: 'Storm', name: 'Equinox Solid', cover: 'solida', coverstock: 'A2S Solid', core: 'asimetrico', year: 2025, colors: ['#2e3135', '#b6b299', '#787d72'] },
  { id: 'storm:identity', brand: 'Storm', name: 'IDentity', cover: 'perlada', coverstock: 'ReX Pearl', core: 'asimetrico', year: 2025, colors: ['#14161d', '#c6323d', '#12b893'] },
  { id: 'storm:ion-pro-solid', brand: 'Storm', name: 'Ion Pro Solid', cover: 'solida', coverstock: 'TX-16 Solid', core: 'asimetrico', year: 2025, colors: ['#004a74', '#3a656b'] },
  { id: 'storm:next-factor', brand: 'Storm', name: 'Next Factor', cover: 'perlada', coverstock: 'R3S Pearl', core: 'asimetrico', year: 2025, colors: ['#1e2426', '#2c517b'] },
  { id: 'storm:phaze-ii-pearl', brand: 'Storm', name: 'Phaze II Pearl', cover: 'perlada', coverstock: 'TX-25 Pearl', core: 'simetrico', year: 2025, colors: ['#aa2c48', '#372376', '#f33b56'] },
  { id: 'storm:typhoon', brand: 'Storm', name: 'Typhoon', cover: 'perlada', coverstock: 'Reactor Pearl', core: 'simetrico', year: 2025, colors: ['#343641', '#735474'] },
  { id: 'storm:absolute-power', brand: 'Storm', name: 'Absolute Power', cover: 'solida', coverstock: 'R2S DEEP Solid', core: 'asimetrico', year: 2024, colors: ['#7c1108', '#1c1728', '#98422f'] },
  { id: 'storm:dna-coil', brand: 'Storm', name: 'DNA Coil', cover: 'perlada', coverstock: 'EXO Pearl', core: 'asimetrico', year: 2024, colors: ['#c2141a', '#3a1719', '#1f2b5a'] },
  { id: 'storm:ion-max', brand: 'Storm', name: 'Ion Max', cover: 'solida', coverstock: 'NRG Solid', core: 'asimetrico', year: 2024, colors: ['#473358', '#c85f9a', '#814370'] },
  { id: 'storm:ion-pro', brand: 'Storm', name: 'Ion Pro', cover: 'hibrida', coverstock: 'TX-16 Hybrid', core: 'asimetrico', year: 2024, colors: ['#262528', '#554f4f'] },
  { id: 'storm:phaze-ai', brand: 'Storm', name: 'Phaze A.I.', cover: 'perlada', coverstock: 'TX-16 Pearl', core: 'simetrico', year: 2024, colors: ['#353538', '#a69786'] },
  { id: 'storm:summit-peak', brand: 'Storm', name: 'Summit Peak', cover: 'perlada', coverstock: 'TX-23 Pearl', core: 'simetrico', year: 2024, colors: ['#1e1f1b', '#1c9060', '#5e3a1c'] },
  { id: 'storm:the-road', brand: 'Storm', name: 'The Road', cover: 'hibrida', coverstock: 'ReX Hybrid', core: 'simetrico', year: 2024, colors: ['#0c090f', '#8d1c21', '#55392a'] },
  { id: 'storm:iq-tour-78-u', brand: 'Storm', name: '!Q Tour 78/U', cover: 'uretano', coverstock: 'Controll 78 Solid Urethane', core: 'simetrico', year: 2023, colors: ['#630215'] },
  { id: 'storm:absolute', brand: 'Storm', name: 'Absolute', cover: 'hibrida', coverstock: 'R2S DEEP Hybrid', core: 'asimetrico', year: 2023, colors: ['#2e2a27', '#8f6423'] },
  { id: 'storm:dna', brand: 'Storm', name: 'DNA', cover: 'solida', coverstock: 'EXO Solid', core: 'asimetrico', year: 2023, colors: ['#12111c', '#4e191e', '#66595f'] },
  { id: 'storm:revenant', brand: 'Storm', name: 'Revenant', cover: 'perlada', coverstock: 'R3S Pearl', core: 'simetrico', year: 2023, colors: ['#0e0b10', '#402460'] },
  { id: 'storm:summit', brand: 'Storm', name: 'Summit', cover: 'hibrida', coverstock: 'TX-23 Hybrid', core: 'simetrico', year: 2023, colors: ['#142b62', '#73817f', '#b9a457'] },
  { id: 'storm:fate', brand: 'Storm', name: 'Fate', cover: 'perlada', coverstock: 'ReX Pearl', core: 'simetrico', year: 2022, colors: ['#285f8c', '#895fb9'] },
  { id: 'storm:infinite-physix', brand: 'Storm', name: 'Infinite PhysiX', cover: 'perlada', coverstock: 'ReX Pearl', core: 'asimetrico', year: 2022, colors: ['#1a1b28', '#3d3060', '#2e5b9a'] },
  { id: 'storm:nova', brand: 'Storm', name: 'Nova', cover: 'hibrida', coverstock: 'R2X Hybrid', core: 'asimetrico', year: 2022, colors: ['#484f4d', '#b0486a', '#78de73'] },
  { id: 'storm:phaze-4', brand: 'Storm', name: 'Phaze 4', cover: 'perlada', coverstock: 'R2S Pearl', core: 'simetrico', year: 2022, colors: ['#2f2433', '#5d555b', '#96755e'] },
  { id: 'storm:phaze-v', brand: 'Storm', name: 'Phaze V', cover: 'perlada', coverstock: 'R2S Pearl', core: 'simetrico', year: 2022, colors: ['#42434a', '#387075'] },
  { id: 'storm:electrify-solid', brand: 'Storm', name: 'Electrify Solid', cover: 'solida', coverstock: 'Reactor Solid', core: 'simetrico', year: 2021, colors: ['#a34c51', '#9d1423'] },
  { id: 'storm:hy-road-max', brand: 'Storm', name: 'Hy-Road Max', cover: 'solida', coverstock: 'NeX Solid', core: 'simetrico', year: 2021, colors: ['#328c42', '#5ac058', '#93eb67'] },
  { id: 'storm:axiom', brand: 'Storm', name: 'Axiom', cover: 'solida', coverstock: 'NeX Solid', core: 'simetrico', year: 2020, colors: ['#5fb4e8', '#1a2a6c', '#5a6b7b'] },
  { id: 'storm:omega-crux', brand: 'Storm', name: 'Omega Crux', cover: 'perlada', coverstock: 'GI-20 Pearl', core: 'asimetrico', year: 2020, colors: ['#f2f2f2', '#b87333', '#41424c'] },
  { id: 'storm:parallax', brand: 'Storm', name: 'Parallax', cover: 'hibrida', coverstock: 'TractionX7 Hybrid', core: 'asimetrico', year: 2020, colors: ['#0f5e8c', '#71797e', '#111111'] },
  { id: 'storm:pitch-purple', brand: 'Storm', name: 'Pitch Purple', cover: 'uretano', coverstock: 'Rev-Controll Solid Urethane', core: 'simetrico', year: 2020, colors: ['#6a1b9a'] },
  { id: 'storm:proton-physix', brand: 'Storm', name: 'Proton PhysiX', cover: 'solida', coverstock: 'NeX Solid', core: 'asimetrico', year: 2020, colors: ['#c2185b', '#111111', '#7e3fbf'] },
  { id: 'storm:trend', brand: 'Storm', name: 'Trend', cover: 'perlada', coverstock: 'R2S Pearl', core: 'simetrico', year: 2020, colors: ['#26c6da', '#0f52ba', '#00897b'] },
  { id: 'storm:all-road', brand: 'Storm', name: 'All-Road', cover: 'hibrida', coverstock: 'NRG Hybrid', core: 'simetrico', year: 2019, colors: ['#2b2b2b', '#00897b'] },
  { id: 'storm:crux-prime', brand: 'Storm', name: 'Crux Prime', cover: 'solida', coverstock: 'SPEC Solid', core: 'asimetrico', year: 2019, colors: ['#504670', '#f1bbcb', '#937695'] },
  { id: 'storm:fever-pitch', brand: 'Storm', name: 'Fever Pitch', cover: 'uretano', coverstock: 'PWR+CTRL', core: 'simetrico', year: 2019, colors: ['#903d2b', '#f67640'] },
  { id: 'storm:phaze-iii', brand: 'Storm', name: 'Phaze III', cover: 'hibrida', coverstock: 'R3S Hybrid', core: 'simetrico', year: 2019, colors: ['#00a86b'] },
  { id: 'storm:tropical-surge', brand: 'Storm', name: 'Tropical Surge', cover: 'perlada', coverstock: 'Reactor Pearl', core: 'simetrico', year: 2019 },
  { id: 'storm:clear-storm', brand: 'Storm', name: 'Clear Storm', cover: 'poliester', coverstock: 'Ultra Clear Polyester', core: 'simetrico', year: 2018 },
  { id: 'storm:physix', brand: 'Storm', name: 'PhysiX', cover: 'hibrida', coverstock: 'NRG Hybrid', core: 'asimetrico', year: 2018, colors: ['#2e2944', '#4b526e', '#89323f'] },
  { id: 'storm:sure-lock', brand: 'Storm', name: 'Sure Lock', cover: 'solida', coverstock: 'GI-17 Solid', core: 'asimetrico', year: 2017, colors: ['#1b3b95', '#6c526c', '#ec9749'] },
  { id: 'storm:timeless', brand: 'Storm', name: 'Timeless', cover: 'hibrida', coverstock: 'R2S Hybrid', core: 'simetrico', year: 2017, colors: ['#59595e', '#272b39', '#979596'] },
  { id: 'storm:phaze', brand: 'Storm', name: 'Phaze', cover: 'perlada', coverstock: 'AX-16 Pearl', core: 'simetrico', year: 2016, colors: ['#2f3d5d', '#bc3d2c', '#675f63'] },
  { id: 'storm:phaze-ii', brand: 'Storm', name: 'Phaze II', cover: 'solida', coverstock: 'TX-16 Solid', core: 'simetrico', year: 2016, colors: ['#d32f2f', '#1e56c8', '#6a1b9a'] },
  { id: 'storm:pitch-blue', brand: 'Storm', name: 'Pitch Blue', cover: 'uretano', coverstock: 'Controll Plus Pearl Urethane', core: 'simetrico', year: 2016, colors: ['#102544', '#544f5b'] },
  { id: 'storm:pitch-black', brand: 'Storm', name: 'Pitch Black', cover: 'uretano', coverstock: 'Controll Solid Urethane', core: 'simetrico', year: 2014, colors: ['#111111'] },
  { id: 'storm:hy-road-pearl', brand: 'Storm', name: 'Hy-Road Pearl', cover: 'perlada', coverstock: 'R2S Pearl', core: 'simetrico', year: 2013, colors: ['#1e56c8', '#6a1b9a'] },
  { id: 'storm:mix', brand: 'Storm', name: 'Mix', cover: 'uretano', coverstock: 'U1S Pearl Urethane', core: 'simetrico', year: 2013 },
  { id: 'storm:iq-tour-edition', brand: 'Storm', name: '!Q Tour Edition', cover: 'solida', coverstock: 'R2S Solid', core: 'simetrico', year: 2012, colors: ['#191970'] },
  { id: 'storm:tropical-breeze', brand: 'Storm', name: 'Tropical Breeze', cover: 'perlada', coverstock: 'Reactor Pearl', core: 'simetrico', year: 2011 },
  { id: 'storm:hy-road', brand: 'Storm', name: 'Hy-Road', cover: 'hibrida', coverstock: 'R2S Hybrid', core: 'simetrico', year: 2008, colors: ['#111111', '#1e56c8'] },
  { id: 'storm:ice-storm', brand: 'Storm', name: 'Ice Storm', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico' },
  { id: 'storm:tropical-storm', brand: 'Storm', name: 'Tropical Storm', cover: 'perlada', coverstock: 'Reactor Pearl', core: 'simetrico' },

  // Roto Grip (grupo Storm): Gem, Idol, RST, UFO, Rubicon, Attention Star y la línea Hustle (cada Hustle con su nombre).
  { id: 'roto-grip:hustle-sos', brand: 'Roto Grip', name: 'Hustle SOS', cover: 'hibrida', coverstock: 'VTC Hybrid', core: 'simetrico', year: 2026, colors: ['#207384', '#1b1a1d', '#364c52'] },
  { id: 'roto-grip:hyped-up', brand: 'Roto Grip', name: 'Hyped Up!', cover: 'hibrida', coverstock: 'V-R1 Hybrid', core: 'simetrico', year: 2026, colors: ['#1b202a', '#797a21'] },
  { id: 'roto-grip:perfect-gem', brand: 'Roto Grip', name: 'Perfect Gem', cover: 'solida', coverstock: 'E-R1 Solid', core: 'asimetrico', year: 2026, colors: ['#1a1929', '#d9436c', '#814258'] },
  { id: 'roto-grip:transform-pearl', brand: 'Roto Grip', name: 'Transform Pearl', cover: 'perlada', coverstock: 'MicroTrax Pearl', core: 'asimetrico', year: 2026, colors: ['#57020d', '#d5363d', '#1a0512'] },
  { id: 'roto-grip:transformer', brand: 'Roto Grip', name: 'Transformer', cover: 'solida', coverstock: 'V-R1 Solid', core: 'asimetrico', year: 2026, colors: ['#62487b', '#986ea9', '#a7abc8'] },
  { id: 'roto-grip:wicked-gremlin', brand: 'Roto Grip', name: 'Wicked Gremlin', cover: 'solida', coverstock: 'G-R1 Solid', core: 'asimetrico', year: 2026, colors: ['#290610', '#a84511', '#6c3c0b'] },
  { id: 'roto-grip:gremlin', brand: 'Roto Grip', name: 'Gremlin', cover: 'perlada', coverstock: 'V-R1 Pearl', core: 'asimetrico', year: 2025, colors: ['#1e0e1b', '#3e2155', '#348134'] },
  { id: 'roto-grip:hustle-earth', brand: 'Roto Grip', name: 'Hustle Earth', cover: 'solida', coverstock: 'VTC Solid', core: 'simetrico', year: 2025, colors: ['#224d54', '#695930', '#3c9146'] },
  { id: 'roto-grip:hustle-glow', brand: 'Roto Grip', name: 'Hustle Glow', cover: 'hibrida', coverstock: 'VTC Hybrid', core: 'simetrico', year: 2025, colors: ['#b9234e', '#46a377', '#ada934'] },
  { id: 'roto-grip:rockstar', brand: 'Roto Grip', name: 'Rockstar', cover: 'solida', coverstock: 'NanoStar Solid', core: 'simetrico', year: 2025, colors: ['#65222b', '#b3562b'] },
  { id: 'roto-grip:rst-hyperdrive', brand: 'Roto Grip', name: 'RST Hyperdrive', cover: 'solida', coverstock: 'MicroTrax Solid', core: 'asimetrico', year: 2025, colors: ['#2c485f', '#d62e5f', '#cd853a'] },
  { id: 'roto-grip:ultimate-wrecker', brand: 'Roto Grip', name: 'Ultimate Wrecker', cover: 'hibrida', coverstock: 'PURE-Response Hybrid', core: 'simetrico', year: 2025, colors: ['#2e0a0f', '#65452d', '#a58c24'] },
  { id: 'roto-grip:attention-star', brand: 'Roto Grip', name: 'Attention Star', cover: 'perlada', coverstock: 'eTrax Plus Pearl', core: 'asimetrico', year: 2024, colors: ['#161114', '#3a3636', '#794d37'] },
  { id: 'roto-grip:hustle-bry', brand: 'Roto Grip', name: 'Hustle BRY', cover: 'hibrida', coverstock: 'VTC Hybrid', core: 'simetrico', year: 2024, colors: ['#244468', '#4c090d', '#7b8ca1'] },
  { id: 'roto-grip:hustle-x-ray', brand: 'Roto Grip', name: 'Hustle X-Ray', cover: 'solida', coverstock: 'VTC Solid', core: 'simetrico', year: 2024, colors: ['#131517', '#35434e'] },
  { id: 'roto-grip:optimum-idol', brand: 'Roto Grip', name: 'Optimum Idol', cover: 'solida', coverstock: 'MicroTrax Solid', core: 'simetrico', year: 2024, colors: ['#7e4a7d', '#b83a76'] },
  { id: 'roto-grip:optimum-idol-pearl', brand: 'Roto Grip', name: 'Optimum Idol Pearl', cover: 'perlada', coverstock: 'MicroTrax Pearl', core: 'simetrico', year: 2024, colors: ['#862970', '#df3f6f', '#d77d4b'] },
  { id: 'roto-grip:x-cell', brand: 'Roto Grip', name: 'X-Cell', cover: 'solida', coverstock: 'eTrax ULTRA Solid', core: 'asimetrico', year: 2024, colors: ['#252f40', '#378088', '#72a16a'] },
  { id: 'roto-grip:clone', brand: 'Roto Grip', name: 'Clone', cover: 'solida', coverstock: 'OpiTrax', core: 'asimetrico', year: 2023, colors: ['#10131b', '#2b915a', '#365835'] },
  { id: 'roto-grip:retro-rg-spare', brand: 'Roto Grip', name: 'Retro RG Spare', cover: 'uretano', coverstock: 'High-Impact Pearl Urethane', core: 'simetrico', year: 2023, colors: ['#252423'] },
  { id: 'roto-grip:tnt', brand: 'Roto Grip', name: 'TNT', cover: 'solida', coverstock: 'eTrax Plus Solid', core: 'simetrico', year: 2023, colors: ['#af2620', '#71191e', '#e3412f'] },
  { id: 'roto-grip:tour-dynam-x', brand: 'Roto Grip', name: 'Tour Dynam-X', cover: 'solida', coverstock: 'TourTrax Solid', core: 'asimetrico', year: 2023, colors: ['#104965', '#0e1015', '#759644'] },
  { id: 'roto-grip:gem', brand: 'Roto Grip', name: 'Gem', cover: 'solida', coverstock: 'MicroTrax Solid', core: 'asimetrico', year: 2022, colors: ['#3d223d', '#c13645', '#e8ad30'] },
  { id: 'roto-grip:hustle-usa', brand: 'Roto Grip', name: 'Hustle USA', cover: 'hibrida', coverstock: 'VTC Hybrid', core: 'simetrico', year: 2022, colors: ['#9e202b', '#322739', '#bfac83'] },
  { id: 'roto-grip:idol-cosmos', brand: 'Roto Grip', name: 'Idol Cosmos', cover: 'perlada', coverstock: 'XtremeTrax Pearl', core: 'simetrico', year: 2022, colors: ['#023d30', '#416660'] },
  { id: 'roto-grip:hustle-camo', brand: 'Roto Grip', name: 'Hustle Camo', cover: 'solida', coverstock: 'VTC Solid', core: 'simetrico', year: 2021, colors: ['#10161f', '#71584b'] },
  { id: 'roto-grip:hustle-wine', brand: 'Roto Grip', name: 'Hustle Wine', cover: 'perlada', coverstock: 'VTC Pearl', core: 'simetrico', year: 2021, colors: ['#11050b'] },
  { id: 'roto-grip:hyped-pearl', brand: 'Roto Grip', name: 'Hyped Pearl', cover: 'perlada', coverstock: 'VTC Pearl', core: 'simetrico', year: 2021, colors: ['#10131c', '#34343f', '#239dc4'] },
  { id: 'roto-grip:idol-helios', brand: 'Roto Grip', name: 'Idol Helios', cover: 'solida', coverstock: 'XtremeTrax Solid', core: 'simetrico', year: 2021, colors: ['#f57c00'] },
  { id: 'roto-grip:rubicon-uc3', brand: 'Roto Grip', name: 'Rubicon UC3', cover: 'uretano', coverstock: 'Tour-ethane Pearl', core: 'asimetrico', year: 2021, colors: ['#dcdcdc'] },
  { id: 'roto-grip:ufo-alert', brand: 'Roto Grip', name: 'UFO Alert', cover: 'hibrida', coverstock: 'eTrax Hybrid', core: 'asimetrico', year: 2021, colors: ['#1b252e', '#571c49', '#375359'] },
  { id: 'roto-grip:nuclear-cell', brand: 'Roto Grip', name: 'Nuclear Cell', cover: 'perlada', coverstock: 'eTrax-P20', core: 'asimetrico', year: 2020, colors: ['#180c28', '#620812', '#a67535'] },
  { id: 'roto-grip:rst-x-1', brand: 'Roto Grip', name: 'RST X-1', cover: 'hibrida', coverstock: 'MicroTrax Hybrid', core: 'asimetrico', year: 2020, colors: ['#21272b', '#4f5658', '#848f8f'] },
  { id: 'roto-grip:rubicon', brand: 'Roto Grip', name: 'Rubicon', cover: 'solida', coverstock: 'eTrax-S20', core: 'asimetrico', year: 2020, colors: ['#181820', '#4d4f5e', '#529cb9'] },
  { id: 'roto-grip:ufo', brand: 'Roto Grip', name: 'UFO', cover: 'solida', coverstock: 'MicroTrax-S20', core: 'asimetrico', year: 2020, colors: ['#191b2d', '#628664', '#61d37f'] },
  { id: 'roto-grip:idol-pro', brand: 'Roto Grip', name: 'Idol Pro', cover: 'solida', coverstock: 'eTrax-S19', core: 'simetrico', year: 2019, colors: ['#0d7083', '#536258', '#3f8e9d'] },
  { id: 'roto-grip:halo', brand: 'Roto Grip', name: 'Halo', cover: 'solida', coverstock: 'MicroTrax-S18', core: 'asimetrico', year: 2018, colors: ['#4f3c55', '#eb4282', '#8b7886'] },
  { id: 'roto-grip:hustle-hybrid', brand: 'Roto Grip', name: 'Hustle Hybrid', cover: 'hibrida', coverstock: 'VTC-H18', core: 'simetrico', year: 2018, colors: ['#07080b', '#214368', '#6b859a'] },
  { id: 'roto-grip:hyper-cell-fused', brand: 'Roto Grip', name: 'Hyper Cell Fused', cover: 'hibrida', coverstock: 'eTrax-H18', core: 'asimetrico', year: 2018, colors: ['#17191e', '#7e328f', '#7c796d'] },
  { id: 'roto-grip:idol', brand: 'Roto Grip', name: 'Idol', cover: 'solida', coverstock: 'MicroTrax-S18', core: 'simetrico', year: 2018, colors: ['#762e7b', '#ab8945'] },
  { id: 'roto-grip:rg-clear-poly', brand: 'Roto Grip', name: 'RG Clear Poly', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico', year: 2018, colors: ['#ae181e', '#670e0f', '#a85454'] },
  { id: 'roto-grip:winner', brand: 'Roto Grip', name: 'Winner', cover: 'perlada', coverstock: 'VTC-P18', core: 'simetrico', year: 2018, colors: ['#1d1618', '#b41d19', '#721614'] },
  { id: 'roto-grip:hustle-ink', brand: 'Roto Grip', name: 'Hustle Ink', cover: 'solida', coverstock: 'Thrilled', core: 'simetrico', year: 2017, colors: ['#162941', '#6a5c4d'] },
  { id: 'roto-grip:dare-devil', brand: 'Roto Grip', name: 'Dare Devil', cover: 'perlada', coverstock: 'Amped Pearl', core: 'simetrico', year: 2016, colors: ['#0c131e', '#0c3c57', '#49757f'] },
  { id: 'roto-grip:hustle-p-r-o', brand: 'Roto Grip', name: 'Hustle P/R/O', cover: 'hibrida', coverstock: 'Stoked', core: 'simetrico', year: 2016, colors: ['#74093c', '#cf2846', '#837a28'] },
  { id: 'roto-grip:no-rules', brand: 'Roto Grip', name: 'No Rules', cover: 'solida', coverstock: 'Micro DNA', core: 'asimetrico', year: 2016, colors: ['#2dc56f', '#de4d27', '#624731'] },

  // 900 Global (también «Global 900», grupo Storm): Zen, Reality, Honey Badger, Origin, Eternity, Burner…
  { id: '900-global:portal', brand: '900 Global', name: 'Portal', cover: 'solida', coverstock: 'Reserve Blend 92 Solid', core: 'asimetrico', year: 2026, colors: ['#850724', '#b56177'] },
  { id: '900-global:vengeance', brand: '900 Global', name: 'Vengeance', cover: 'solida', coverstock: 'Reserve Blend 91 Solid', core: 'simetrico', year: 2026, colors: ['#515459', '#7d7c83'] },
  { id: '900-global:cove', brand: '900 Global', name: 'Cove', cover: 'hibrida', coverstock: 'Reserve Blend 85 Hybrid', core: 'simetrico', year: 2025, colors: ['#2e9275', '#ad936f', '#94c9b3'] },
  { id: '900-global:ember', brand: '900 Global', name: 'Ember', cover: 'perlada', coverstock: 'Reserve Blend 82 Pearl', core: 'simetrico', year: 2025, colors: ['#241116', '#800d18'] },
  { id: '900-global:origin-ex', brand: '900 Global', name: 'Origin EX', cover: 'solida', coverstock: 'Reserve Blend 89 Solid', core: 'asimetrico', year: 2025, colors: ['#5c2453', '#963c33', '#bd8b2b'] },
  { id: '900-global:viking', brand: '900 Global', name: 'Viking', cover: 'hibrida', coverstock: 'Reserve Blend 90 Hybrid', core: 'asimetrico', year: 2025, colors: ['#523576', '#8882a1', '#b6352d'] },
  { id: '900-global:zen-25', brand: '900 Global', name: 'Zen 25', cover: 'perlada', coverstock: 'Reserve Blend 83 Pearl', core: 'simetrico', year: 2025, colors: ['#624853', '#2c1b27', '#ab1e2e'] },
  { id: '900-global:harsh-reality', brand: '900 Global', name: 'Harsh Reality', cover: 'solida', coverstock: 'Reserve Blend 902 Solid', core: 'asimetrico', year: 2024, colors: ['#1c1c1c', '#ba6026', '#712b20'] },
  { id: '900-global:origin', brand: '900 Global', name: 'Origin', cover: 'hibrida', coverstock: 'Reserve Blend 93 Hybrid', core: 'asimetrico', year: 2024, colors: ['#2e366a', '#6c3d77', '#a66664'] },
  { id: '900-global:eternity', brand: '900 Global', name: 'Eternity', cover: 'perlada', coverstock: 'S84 Response Pearl', core: 'asimetrico', year: 2023, colors: ['#171922', '#77596b', '#472b46'] },
  { id: '900-global:sublime', brand: '900 Global', name: 'Sublime', cover: 'hibrida', coverstock: 'Reserve Blend 802', core: 'simetrico', year: 2023, colors: ['#12171c', '#824354', '#513f30'] },
  { id: '900-global:xponent', brand: '900 Global', name: 'Xponent', cover: 'solida', coverstock: 'Reserve Blend 701 Solid', core: 'simetrico', year: 2023, colors: ['#21b4d3', '#0b1144', '#2270a9'] },
  { id: '900-global:reality-check', brand: '900 Global', name: 'Reality Check', cover: 'hibrida', coverstock: 'S84 Beta Hybrid', core: 'asimetrico', year: 2022, colors: ['#251e2e', '#701224', '#97913b'] },
  { id: '900-global:zen-soul', brand: '900 Global', name: 'Zen Soul', cover: 'hibrida', coverstock: 'S77 Response Hybrid', core: 'simetrico', year: 2022, colors: ['#2d2a32', '#8c3447', '#476869'] },
  { id: '900-global:zen-u', brand: '900 Global', name: 'Zen/U', cover: 'uretano', coverstock: 'S35 Urethane+ Solid', core: 'simetrico', year: 2022, colors: ['#181818', '#55471e'] },
  { id: '900-global:altered-reality', brand: '900 Global', name: 'Altered Reality', cover: 'perlada', coverstock: 'S84 Response Pearl', core: 'asimetrico', year: 2021, colors: ['#31313c', '#e94b56', '#a28779'] },
  { id: '900-global:burner-solid', brand: '900 Global', name: 'Burner Solid', cover: 'solida', coverstock: 'S62 Response Solid', core: 'simetrico', year: 2021, colors: ['#d95528', '#0e71ad', '#454561'] },
  { id: '900-global:honey-badger-intensity', brand: '900 Global', name: 'Honey Badger Intensity', cover: 'solida', coverstock: 'S70 Solid', core: 'asimetrico', year: 2021, colors: ['#635b77', '#c68191', '#985f5b'] },
  { id: '900-global:honey-badger-yellow-poly', brand: '900 Global', name: 'Honey Badger Yellow Poly', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico', year: 2021, colors: ['#d5bb1f', '#fef302', '#84750d'] },
  { id: '900-global:reality', brand: '900 Global', name: 'Reality', cover: 'solida', coverstock: 'S84 Response Solid', core: 'asimetrico', year: 2021, colors: ['#5a6c98', '#be7086', '#6fc8e7'] },
  { id: '900-global:wolverine', brand: '900 Global', name: 'Wolverine', cover: 'perlada', coverstock: 'S70 Pearl', core: 'simetrico', year: 2021, colors: ['#2f92bf', '#5c7292', '#9b4c58'] },
  { id: '900-global:zen-master', brand: '900 Global', name: 'Zen Master', cover: 'solida', coverstock: 'S77 Response Solid', core: 'simetrico', year: 2021, colors: ['#3d4058', '#ab4474', '#468b8f'] },
  { id: '900-global:afterburner', brand: '900 Global', name: 'Afterburner', cover: 'hibrida', coverstock: 'S62 Hybrid', core: 'simetrico', year: 2020 },
  { id: '900-global:aspect', brand: '900 Global', name: 'Aspect', cover: 'solida', coverstock: 'S77 Response Solid', core: 'simetrico', year: 2020, colors: ['#bd5b41', '#2a242c', '#7b5060'] },
  { id: '900-global:volatility', brand: '900 Global', name: 'Volatility', cover: 'hibrida', coverstock: 'S86 R Hybrid', core: 'asimetrico', year: 2020, colors: ['#2e2a29', '#6f586f'] },
  { id: '900-global:volt', brand: '900 Global', name: 'Volt', cover: 'solida', coverstock: 'S72R Solid', core: 'simetrico', year: 2020, colors: ['#4db856', '#0baf56'] },
  { id: '900-global:zen', brand: '900 Global', name: 'Zen', cover: 'perlada', coverstock: 'S77 Response Pearl', core: 'simetrico', year: 2020, colors: ['#533b55', '#34708a', '#7a836b'] },
  { id: '900-global:flux', brand: '900 Global', name: 'Flux', cover: 'solida', coverstock: 'S72R Solid', core: 'asimetrico', year: 2019, colors: ['#f1582f'] },
  { id: '900-global:honey-badger-urethane', brand: '900 Global', name: 'Honey Badger Urethane', cover: 'uretano', coverstock: 'S20 Solid Urethane', core: 'asimetrico', year: 2019, colors: ['#4b315b'] },
  { id: '900-global:money-badger', brand: '900 Global', name: 'Money Badger', cover: 'perlada', coverstock: 'S71 Pearl', core: 'asimetrico', year: 2019, colors: ['#054143'] },
  { id: '900-global:ordnance', brand: '900 Global', name: 'Ordnance', cover: 'solida', coverstock: 'S70 Solid', core: 'simetrico', year: 2019, colors: ['#132d4a', '#018cc6', '#185988'] },
  { id: '900-global:badger', brand: '900 Global', name: 'Badger', cover: 'hibrida', coverstock: 'S71 Hybrid', core: 'simetrico', year: 2018, colors: ['#181b28'] },
  { id: '900-global:honey-badger', brand: '900 Global', name: 'Honey Badger', cover: 'perlada', coverstock: 'S71 Pearl', core: 'asimetrico', year: 2017, colors: ['#d6a139'] },
  { id: '900-global:inception', brand: '900 Global', name: 'Inception', cover: 'solida', coverstock: 'S74R Solid', core: 'asimetrico', year: 2016, colors: ['#1f2631', '#4a5d43', '#53f945'] },

  // Motiv: Jackal, Venom, Forge, Raptor, Pride, Supra, Evoke, Thrill y la línea Tank (Microcell Polymer → uretano).
  { id: 'motiv:apex-jackal', brand: 'Motiv', name: 'Apex Jackal', cover: 'perlada', coverstock: 'Propulsion MXV Pearl', core: 'asimetrico', year: 2026, colors: ['#356a81', '#2e3848'] },
  { id: 'motiv:evoke-mayhem', brand: 'Motiv', name: 'Evoke Mayhem', cover: 'solida', coverstock: 'Propulsion MXV Solid', core: 'asimetrico', year: 2026, colors: ['#492379', '#4edcce', '#576a91'] },
  { id: 'motiv:forge-fuel', brand: 'Motiv', name: 'Forge Fuel', cover: 'solida', coverstock: 'Leverage MXT', core: 'simetrico', year: 2026, colors: ['#b92313', '#5d1916', '#cbc536'] },
  { id: 'motiv:frenzy', brand: 'Motiv', name: 'Frenzy', cover: 'perlada', coverstock: 'Vitality', core: 'simetrico', year: 2026, colors: ['#10295e', '#4ac4ef'] },
  { id: 'motiv:raptor-pursuit', brand: 'Motiv', name: 'Raptor Pursuit', cover: 'perlada', coverstock: 'Aerial Propulsion Pearl', core: 'simetrico', year: 2026, colors: ['#421e23', '#a56631', '#b5b8a7'] },
  { id: 'motiv:supra-sport', brand: 'Motiv', name: 'Supra Sport', cover: 'solida', coverstock: 'Leverage MFS', core: 'simetrico', year: 2026, colors: ['#237fb0', '#a35247', '#194968'] },
  { id: 'motiv:venom-hysteria', brand: 'Motiv', name: 'Venom Hysteria', cover: 'perlada', coverstock: 'Propulsion MXV Pearl', core: 'simetrico', year: 2026, colors: ['#131227', '#3c3b56', '#ab161f'] },
  { id: 'motiv:evoke-hysteria', brand: 'Motiv', name: 'Evoke Hysteria', cover: 'perlada', coverstock: 'Propulsion MXV Pearl', core: 'asimetrico', year: 2025, colors: ['#1a1a31', '#486882'] },
  { id: 'motiv:jackal-exj', brand: 'Motiv', name: 'Jackal ExJ', cover: 'hibrida', coverstock: 'Propulsion HVH', core: 'asimetrico', year: 2025, colors: ['#a9a9a6', '#cdcec8', '#736464'] },
  { id: 'motiv:jackal-onyx', brand: 'Motiv', name: 'Jackal Onyx', cover: 'solida', coverstock: 'Leverage HXC', core: 'asimetrico', year: 2025, colors: ['#42424b', '#212125', '#a6ada5'] },
  { id: 'motiv:lethal-venom', brand: 'Motiv', name: 'Lethal Venom', cover: 'solida', coverstock: 'Leverage MXC', core: 'asimetrico', year: 2025, colors: ['#242428', '#9c3c3b', '#dcd754'] },
  { id: 'motiv:max-thrill-hybrid', brand: 'Motiv', name: 'Max Thrill Hybrid', cover: 'hibrida', coverstock: 'Turmoil XP3 Hybrid', core: 'simetrico', year: 2025, colors: ['#6a5eb9', '#4ca1b1', '#483f83'] },
  { id: 'motiv:nebula', brand: 'Motiv', name: 'Nebula', cover: 'perlada', coverstock: 'Dark Matter Propulsion Pearl', core: 'simetrico', year: 2025, colors: ['#111113'] },
  { id: 'motiv:primal-ghost', brand: 'Motiv', name: 'Primal Ghost', cover: 'solida', coverstock: 'Coercion HFS', core: 'simetrico', year: 2025, colors: ['#1a1720', '#592b65'] },
  { id: 'motiv:raptor-reign', brand: 'Motiv', name: 'Raptor Reign', cover: 'solida', coverstock: 'Leverage MXV', core: 'simetrico', year: 2025, colors: ['#2a4742', '#15171a', '#d7d161'] },
  { id: 'motiv:shadow-tank', brand: 'Motiv', name: 'Shadow Tank', cover: 'uretano', coverstock: 'Frixion M7 Pearl MCP', core: 'simetrico', year: 2025, colors: ['#20212a', '#a6afa2', '#474851'] },
  { id: 'motiv:steel-forge', brand: 'Motiv', name: 'Steel Forge', cover: 'perlada', coverstock: 'Propulsion MXV Pearl', core: 'simetrico', year: 2025, colors: ['#575b6a', '#272a39', '#8fc25a'] },
  { id: 'motiv:supra-clutch', brand: 'Motiv', name: 'Supra Clutch', cover: 'hibrida', coverstock: 'Propulsion XRT Hybrid', core: 'simetrico', year: 2025, colors: ['#1e1f21', '#f5f638', '#a51c13'] },
  { id: 'motiv:ascend', brand: 'Motiv', name: 'Ascend', cover: 'perlada', coverstock: 'Vitality', core: 'simetrico', year: 2024 },
  { id: 'motiv:crimson-jackal', brand: 'Motiv', name: 'Crimson Jackal', cover: 'perlada', coverstock: 'Propulsion HV+', core: 'asimetrico', year: 2024, colors: ['#603643', '#271c24'] },
  { id: 'motiv:evoke', brand: 'Motiv', name: 'Evoke', cover: 'solida', coverstock: 'Leverage MXC', core: 'asimetrico', year: 2024, colors: ['#66d13a', '#804147', '#459f95'] },
  { id: 'motiv:hyper-venom', brand: 'Motiv', name: 'Hyper Venom', cover: 'perlada', coverstock: 'Propulsion MXR', core: 'simetrico', year: 2024, colors: ['#ed3d59', '#772631', '#f96784'] },
  { id: 'motiv:max-thrill-solid', brand: 'Motiv', name: 'Max Thrill Solid', cover: 'solida', coverstock: 'Turmoil XP3 Solid', core: 'simetrico', year: 2024, colors: ['#46b3e3', '#df1f18', '#783139'] },
  { id: 'motiv:primal-rage-evolution', brand: 'Motiv', name: 'Primal Rage Evolution', cover: 'perlada', coverstock: 'Propulsion FYJ Pearl', core: 'simetrico', year: 2024, colors: ['#8e2323'] },
  { id: 'motiv:silver-sniper', brand: 'Motiv', name: 'Silver Sniper', cover: 'poliester', coverstock: 'TruShot Polythane', core: 'simetrico', year: 2024, colors: ['#8e939a', '#313439', '#bec1c6'] },
  { id: 'motiv:supra-gt', brand: 'Motiv', name: 'Supra GT', cover: 'perlada', coverstock: 'Propulsion XRT Pearl', core: 'simetrico', year: 2024, colors: ['#212431', '#596076', '#8390a5'] },
  { id: 'motiv:black-venom', brand: 'Motiv', name: 'Black Venom', cover: 'solida', coverstock: 'Leverage MFS', core: 'asimetrico', year: 2023, colors: ['#0f1217', '#393531', '#a97e30'] },
  { id: 'motiv:jackal-ambush', brand: 'Motiv', name: 'Jackal Ambush', cover: 'solida', coverstock: 'Leverage', core: 'asimetrico', year: 2023, colors: ['#1b232c', '#6a7870'] },
  { id: 'motiv:nuclear-forge', brand: 'Motiv', name: 'Nuclear Forge', cover: 'perlada', coverstock: 'Propulsion HVP', core: 'simetrico', year: 2023, colors: ['#1c1c2a', '#435d5e', '#62a0a5'] },
  { id: 'motiv:pride-dynasty', brand: 'Motiv', name: 'Pride Dynasty', cover: 'solida', coverstock: 'Leverage MFS', core: 'asimetrico', year: 2023, colors: ['#1f2155', '#b96d5a', '#bac5bf'] },
  { id: 'motiv:raptor-fury', brand: 'Motiv', name: 'Raptor Fury', cover: 'solida', coverstock: 'Leverage XFS', core: 'simetrico', year: 2023, colors: ['#751f25'] },
  { id: 'motiv:sky-raptor', brand: 'Motiv', name: 'Sky Raptor', cover: 'perlada', coverstock: 'Dynamic Infusion Pearl', core: 'simetrico', year: 2022, colors: ['#3769ad', '#1c2449', '#6e94ae'] },
  { id: 'motiv:trident-odyssey', brand: 'Motiv', name: 'Trident Odyssey', cover: 'solida', coverstock: 'Coercion FYS Solid', core: 'asimetrico', year: 2022, colors: ['#1c2067', '#414e92', '#487bc2'] },
  { id: 'motiv:jackal-legacy', brand: 'Motiv', name: 'Jackal Legacy', cover: 'solida', coverstock: 'Coercion MXC', core: 'asimetrico', year: 2021, colors: ['#371412', '#b74f51'] },
  { id: 'motiv:pride', brand: 'Motiv', name: 'Pride', cover: 'solida', coverstock: 'Coercion UCS', core: 'asimetrico', year: 2021, colors: ['#463930', '#a74f30', '#b9afa3'] },
  { id: 'motiv:purple-tank', brand: 'Motiv', name: 'Purple Tank', cover: 'uretano', coverstock: 'Purple Solid Urethane', core: 'simetrico', year: 2021, colors: ['#6b5596', '#432e6b'] },
  { id: 'motiv:top-thrill', brand: 'Motiv', name: 'Top Thrill', cover: 'perlada', coverstock: 'Turmoil XP', core: 'simetrico', year: 2021, colors: ['#4a2d67', '#ca3331', '#b06b97'] },
  { id: 'motiv:alpha-jackal', brand: 'Motiv', name: 'Alpha Jackal', cover: 'solida', coverstock: 'Coercion HV3', core: 'asimetrico', year: 2020, colors: ['#0b71d7', '#5b2d6f', '#2b4d9a'] },
  { id: 'motiv:forge-flare', brand: 'Motiv', name: 'Forge Flare', cover: 'solida', coverstock: 'Coercion MXC', core: 'simetrico', year: 2020, colors: ['#c92a04', '#521a10', '#f2e801'] },
  { id: 'motiv:aspire', brand: 'Motiv', name: 'Aspire', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico', year: 2019 },
  { id: 'motiv:forge', brand: 'Motiv', name: 'Forge', cover: 'solida', coverstock: 'Coercion HFS', core: 'simetrico', year: 2019, colors: ['#161622', '#b63e2e', '#8b7c86'] },
  { id: 'motiv:ripcord', brand: 'Motiv', name: 'Ripcord', cover: 'solida', coverstock: 'Infusion', core: 'simetrico', year: 2019, colors: ['#191820', '#4b4052', '#b8b8a1'] },
  { id: 'motiv:supra', brand: 'Motiv', name: 'Supra', cover: 'perlada', coverstock: 'Infusion Pearl', core: 'simetrico', year: 2019, colors: ['#211a36', '#584d5d', '#a2a0a5'] },
  { id: 'motiv:tank-blitz', brand: 'Motiv', name: 'Tank Blitz', cover: 'uretano', coverstock: 'Frixion+', core: 'simetrico', year: 2019, colors: ['#e0163b', '#a2263b', '#332a3c'] },
  { id: 'motiv:thrill', brand: 'Motiv', name: 'Thrill', cover: 'solida', coverstock: 'Agility XP', core: 'simetrico', year: 2019 },
  { id: 'motiv:venom-recoil', brand: 'Motiv', name: 'Venom Recoil', cover: 'solida', coverstock: 'Coercion MFS', core: 'asimetrico', year: 2019, colors: ['#d92007', '#761b0e'] },
  { id: 'motiv:hyper-sniper', brand: 'Motiv', name: 'Hyper Sniper', cover: 'poliester', coverstock: 'TruShot Polythane', core: 'simetrico', year: 2017, colors: ['#ff4a0b', '#97e413', '#632514'] },
  { id: 'motiv:jackal-ghost', brand: 'Motiv', name: 'Jackal Ghost', cover: 'solida', coverstock: 'Coercion HFS', core: 'asimetrico', year: 2017, colors: ['#11121b', '#4c3c58', '#6d6878'] },
  { id: 'motiv:trident', brand: 'Motiv', name: 'Trident', cover: 'hibrida', coverstock: 'Coercion HVH', core: 'asimetrico', year: 2016, colors: ['#1a1921', '#3f4153', '#656c80'] },
  { id: 'motiv:jackal', brand: 'Motiv', name: 'Jackal', cover: 'perlada', coverstock: 'Turmoil HFP', core: 'asimetrico', year: 2014, colors: ['#241a23', '#5f464d', '#651921'] },

  // Hammer (grupo Brunswick): la familia Black Widow, Effect, Envy, Obsession, Vibe, Scorpion y los uretanos.
  { id: 'hammer:black-widow-3-0-dynasty', brand: 'Hammer', name: 'Black Widow 3.0 Dynasty', cover: 'solida', coverstock: 'Cohesion Solid', core: 'asimetrico', year: 2026, colors: ['#4a3381', '#9a8cbd'] },
  { id: 'hammer:black-widow-spare', brand: 'Hammer', name: 'Black Widow Spare+', cover: 'poliester', coverstock: 'Polyester', core: 'asimetrico', year: 2026, colors: ['#ababab', '#d8d8d6'] },
  { id: 'hammer:blacklist', brand: 'Hammer', name: 'Blacklist', cover: 'perlada', coverstock: 'Cohesion Pearl', core: 'simetrico', year: 2026, colors: ['#0c1419'] },
  { id: 'hammer:fallout', brand: 'Hammer', name: 'Fallout', cover: 'solida', coverstock: 'HK22C2 Solid', core: 'simetrico', year: 2026, colors: ['#0e5e71', '#1e995d', '#6ba770'] },
  { id: 'hammer:purple-pearl-urethane-78d', brand: 'Hammer', name: 'Purple Pearl Urethane 78D', cover: 'uretano', coverstock: 'Urethane Pearl 78D', core: 'simetrico', year: 2026, colors: ['#1e1331', '#463952', '#6c647d'] },
  { id: 'hammer:reckoning', brand: 'Hammer', name: 'Reckoning', cover: 'solida', coverstock: 'HK22C2 Solid', core: 'asimetrico', year: 2026, colors: ['#7b3e45', '#193d68', '#b55e56'] },
  { id: 'hammer:spawn', brand: 'Hammer', name: 'Spawn', cover: 'solida', coverstock: 'HK22C2 Solid', core: 'asimetrico', year: 2026, colors: ['#2f323e'] },
  { id: 'hammer:black-widow-mania', brand: 'Hammer', name: 'Black Widow Mania', cover: 'perlada', coverstock: 'Cohesion Pearl', core: 'asimetrico', year: 2025, colors: ['#18569f', '#593987'] },
  { id: 'hammer:hammerhead', brand: 'Hammer', name: 'Hammerhead', cover: 'solida', coverstock: 'Aggression Solid', core: 'simetrico', year: 2025, colors: ['#101e3e', '#2b4f79', '#8aa5c8'] },
  { id: 'hammer:nu-2-0', brand: 'Hammer', name: 'NU 2.0', cover: 'solida', coverstock: 'NU Active', core: 'simetrico', year: 2025, colors: ['#605f70'] },
  { id: 'hammer:special-effect', brand: 'Hammer', name: 'Special Effect', cover: 'solida', coverstock: 'Cohesion Solid', core: 'asimetrico', year: 2025, colors: ['#2c2866', '#6c2145'] },
  { id: 'hammer:zero-mercy-pearl', brand: 'Hammer', name: 'Zero Mercy Pearl', cover: 'perlada', coverstock: 'HK22C2 Pearl', core: 'asimetrico', year: 2025, colors: ['#5d6678', '#38273d', '#9c3f28'] },
  { id: 'hammer:zero-mercy-solid', brand: 'Hammer', name: 'Zero Mercy Solid', cover: 'solida', coverstock: 'HK22C2 Solid', core: 'asimetrico', year: 2025, colors: ['#3e3655', '#c57672', '#777176'] },
  { id: 'hammer:anger', brand: 'Hammer', name: 'Anger', cover: 'perlada', coverstock: 'CT Reactive Flip', core: 'simetrico', year: 2024, colors: ['#1c1e2a', '#c66558', '#782b3d'] },
  { id: 'hammer:arctic-vibe', brand: 'Hammer', name: 'Arctic Vibe', cover: 'hibrida', coverstock: 'CT Max Hybrid', core: 'simetrico', year: 2024, colors: ['#a6a1b6', '#cfc9d3', '#8368a2'] },
  { id: 'hammer:black-pearl-urethane', brand: 'Hammer', name: 'Black Pearl Urethane', cover: 'uretano', coverstock: 'Urethane Pearl 78D', core: 'simetrico', year: 2024, colors: ['#0f1218', '#3a3c46'] },
  { id: 'hammer:black-widow-3-0', brand: 'Hammer', name: 'Black Widow 3.0', cover: 'solida', coverstock: 'Aggression Solid', core: 'asimetrico', year: 2024, colors: ['#201c26', '#43404d', '#7d443c'] },
  { id: 'hammer:effect', brand: 'Hammer', name: 'Effect', cover: 'perlada', coverstock: 'Cohesion Pearl', core: 'asimetrico', year: 2024, colors: ['#332874', '#5e60a7'] },
  { id: 'hammer:pure-envy', brand: 'Hammer', name: 'Pure Envy', cover: 'hibrida', coverstock: 'Cohesion Hybrid', core: 'asimetrico', year: 2024, colors: ['#2b275c', '#a83078', '#bf9cad'] },
  { id: 'hammer:scorpion-strike', brand: 'Hammer', name: 'Scorpion Strike', cover: 'perlada', coverstock: 'Semtex Pearl', core: 'simetrico', year: 2024, colors: ['#4d3260', '#795386'] },
  { id: 'hammer:axe', brand: 'Hammer', name: 'Axe', cover: 'perlada', coverstock: 'Low Friction Reactive', core: 'simetrico', year: 2023 },
  { id: 'hammer:black-widow-2-0-hybrid', brand: 'Hammer', name: 'Black Widow 2.0 Hybrid', cover: 'hibrida', coverstock: 'Aggression Hybrid', core: 'asimetrico', year: 2023, colors: ['#4e262c', '#9f263e', '#986243'] },
  { id: 'hammer:extreme-envy', brand: 'Hammer', name: 'Extreme Envy', cover: 'solida', coverstock: 'Envy Solid CFI', core: 'asimetrico', year: 2023, colors: ['#a42437', '#411e27', '#61494d'] },
  { id: 'hammer:hazmat', brand: 'Hammer', name: 'Hazmat', cover: 'hibrida', coverstock: 'Semtex Hybrid', core: 'simetrico', year: 2023, colors: ['#2d253e', '#2b8187', '#18e4a8'] },
  { id: 'hammer:nu-blue-hammer', brand: 'Hammer', name: 'NU Blue Hammer', cover: 'solida', coverstock: 'Not Urethane', core: 'simetrico', year: 2023, colors: ['#0275a0', '#16aedd', '#70ccec'] },
  { id: 'hammer:3-d-offset', brand: 'Hammer', name: '3-D Offset', cover: 'perlada', coverstock: 'Neoflex 25', core: 'asimetrico', year: 2022, colors: ['#7b275b', '#ae5a8f'] },
  { id: 'hammer:dark-web', brand: 'Hammer', name: 'Dark Web', cover: 'solida', coverstock: 'Aggression Solid', core: 'simetrico', year: 2022, colors: ['#2d324d', '#5c5463'] },
  { id: 'hammer:envy', brand: 'Hammer', name: 'Envy', cover: 'solida', coverstock: 'Envy Solid', core: 'asimetrico', year: 2022, colors: ['#e2684a', '#bc2c34', '#622a31'] },
  { id: 'hammer:ocean-vibe', brand: 'Hammer', name: 'Ocean Vibe', cover: 'perlada', coverstock: 'CT Plus Pearl', core: 'simetrico', year: 2022, colors: ['#064e6a', '#1d94c2'] },
  { id: 'hammer:black-widow-ghost-pearl', brand: 'Hammer', name: 'Black Widow Ghost Pearl', cover: 'perlada', coverstock: 'Aggression Pearl', core: 'asimetrico', year: 2021, colors: ['#8d8779', '#e7e2dc', '#b4ac9c'] },
  { id: 'hammer:black-widow-viz-a-ball', brand: 'Hammer', name: 'Black Widow Viz-A-Ball', cover: 'poliester', coverstock: 'Polyester', core: 'asimetrico', year: 2021, colors: ['#a4a6a9', '#757375', '#d4d5d6'] },
  { id: 'hammer:infamous', brand: 'Hammer', name: 'Infamous', cover: 'solida', coverstock: 'Envy Solid', core: 'simetrico', year: 2021, colors: ['#29213e', '#d42026', '#5d3f64'] },
  { id: 'hammer:obsession', brand: 'Hammer', name: 'Obsession', cover: 'solida', coverstock: 'Envy Solid CFI', core: 'asimetrico', year: 2021, colors: ['#512f35', '#a4545d'] },
  { id: 'hammer:raw-hammer', brand: 'Hammer', name: 'Raw Hammer', cover: 'perlada', coverstock: 'Juiced Pearl', core: 'simetrico', year: 2021 },
  { id: 'hammer:scorpion', brand: 'Hammer', name: 'Scorpion', cover: 'hibrida', coverstock: 'Semtex Hybrid', core: 'simetrico', year: 2021, colors: ['#441622', '#9c613a', '#961f28'] },
  { id: 'hammer:black-widow-2-0', brand: 'Hammer', name: 'Black Widow 2.0', cover: 'solida', coverstock: 'Aggression Solid', core: 'asimetrico', year: 2020, colors: ['#252429', '#716e71'] },
  { id: 'hammer:fugitive', brand: 'Hammer', name: 'Fugitive', cover: 'perlada', coverstock: 'Juiced Pearl', core: 'simetrico', year: 2020, colors: ['#582729', '#907767', '#d9d1ca'] },
  { id: 'hammer:redemption-solid', brand: 'Hammer', name: 'Redemption Solid', cover: 'solida', coverstock: 'Aggression NE Solid', core: 'asimetrico', year: 2020, colors: ['#252525', '#caaf89', '#c08150'] },
  { id: 'hammer:ripd', brand: 'Hammer', name: 'Rip\'D', cover: 'hibrida', coverstock: 'Aggression Hybrid CFI', core: 'asimetrico', year: 2018, colors: ['#1a1918', '#7a693d', '#d2ac50'] },
  { id: 'hammer:web', brand: 'Hammer', name: 'Web', cover: 'hibrida', coverstock: 'Aggression Hybrid', core: 'simetrico', year: 2018, colors: ['#080711', '#45047b', '#4442b3'] },
  { id: 'hammer:black-widow-urethane', brand: 'Hammer', name: 'Black Widow Urethane', cover: 'uretano', coverstock: 'Urethane', core: 'asimetrico', year: 2017, colors: ['#080808', '#2c2b2b', '#663a1f'] },
  { id: 'hammer:gauntlet', brand: 'Hammer', name: 'Gauntlet', cover: 'hibrida', coverstock: 'Semtex Hybrid CFI', core: 'asimetrico', year: 2017, colors: ['#161516', '#6c6667'] },
  { id: 'hammer:purple-pearl-urethane', brand: 'Hammer', name: 'Purple Pearl Urethane', cover: 'uretano', coverstock: 'Urethane Pearl', core: 'simetrico', year: 2016, colors: ['#1a1127', '#483c54', '#716983'] },
  { id: 'hammer:black-widow-red-legend', brand: 'Hammer', name: 'Black Widow Red Legend', cover: 'perlada', coverstock: 'NBT Pearl', core: 'asimetrico', year: 2015, colors: ['#490206'] },
  { id: 'hammer:black-widow-legend', brand: 'Hammer', name: 'Black Widow Legend', cover: 'hibrida', coverstock: 'NBT Hybrid', core: 'asimetrico', year: 2014, colors: ['#030303', '#421011'] },

  // Brunswick: Rhino y TZone (de entrada), Crown, Ethos, Mindset, Infinity, Defender, Quantum Evo, Zenith…
  { id: 'brunswick:fury', brand: 'Brunswick', name: 'Fury', cover: 'hibrida', coverstock: 'PK-26', core: 'simetrico', year: 2026 },
  { id: 'brunswick:purple-rhino-pro', brand: 'Brunswick', name: 'Purple Rhino Pro', cover: 'solida', coverstock: 'Savvy Hook 4.0 Solid', core: 'simetrico', year: 2026, colors: ['#312352'] },
  { id: 'brunswick:strategy', brand: 'Brunswick', name: 'Strategy', cover: 'perlada', coverstock: 'EVO Pearl', core: 'asimetrico', year: 2026, colors: ['#171f28', '#305766', '#5f8790'] },
  { id: 'brunswick:alert', brand: 'Brunswick', name: 'Alert', cover: 'solida', coverstock: 'Savvy Hook Solid', core: 'simetrico', year: 2025, colors: ['#3c3b69', '#636b9f', '#9698be'] },
  { id: 'brunswick:combat', brand: 'Brunswick', name: 'Combat', cover: 'perlada', coverstock: 'Alpha Premier Pearl', core: 'asimetrico', year: 2025, colors: ['#6a2d4f', '#18539d', '#313564'] },
  { id: 'brunswick:crown-78u', brand: 'Brunswick', name: 'Crown 78U', cover: 'uretano', coverstock: 'Urethane Solid 78D', core: 'simetrico', year: 2025, colors: ['#382d56', '#5a5c6d'] },
  { id: 'brunswick:crown-victory', brand: 'Brunswick', name: 'Crown Victory', cover: 'hibrida', coverstock: 'Savvy Hook Hybrid', core: 'simetrico', year: 2025, colors: ['#1e2f47', '#405d7b'] },
  { id: 'brunswick:danger-zone', brand: 'Brunswick', name: 'Danger Zone', cover: 'solida', coverstock: 'PowerKoil 26 Solid', core: 'simetrico', year: 2025, colors: ['#09151a', '#2d383c'] },
  { id: 'brunswick:energize', brand: 'Brunswick', name: 'Energize', cover: 'hibrida', coverstock: 'EVO Hybrid', core: 'asimetrico', year: 2025, colors: ['#1b2e43', '#1281a9', '#3f5c70'] },
  { id: 'brunswick:hypnotize', brand: 'Brunswick', name: 'Hypnotize', cover: 'hibrida', coverstock: 'EVO Hybrid', core: 'asimetrico', year: 2025, colors: ['#435b94', '#92abd2'] },
  { id: 'brunswick:infinity-quest', brand: 'Brunswick', name: 'Infinity Quest', cover: 'solida', coverstock: 'EVO Solid', core: 'asimetrico', year: 2025, colors: ['#1f3f7c', '#b92f72', '#b0a2a8'] },
  { id: 'brunswick:beyond-infinity', brand: 'Brunswick', name: 'Beyond Infinity', cover: 'perlada', coverstock: 'A.X.H. Pearl', core: 'asimetrico', year: 2024, colors: ['#0d88a6', '#4c5c7d', '#689493'] },
  { id: 'brunswick:endeavor', brand: 'Brunswick', name: 'Endeavor', cover: 'perlada', coverstock: 'Activator Plus 3.0 Pearl', core: 'simetrico', year: 2024, colors: ['#78868f', '#b9b8b7'] },
  { id: 'brunswick:ivory-rhino-pro', brand: 'Brunswick', name: 'Ivory Rhino Pro', cover: 'perlada', coverstock: 'Activator Plus 3.0 Pearl', core: 'simetrico', year: 2024, colors: ['#bbb8b1', '#918e89'] },
  { id: 'brunswick:mesmerize', brand: 'Brunswick', name: 'Mesmerize', cover: 'solida', coverstock: 'EVO Solid', core: 'asimetrico', year: 2024, colors: ['#242d5d', '#6d5159', '#214f97'] },
  { id: 'brunswick:ultimate-defender', brand: 'Brunswick', name: 'Ultimate Defender', cover: 'hibrida', coverstock: 'ACT 3.0 Hybrid', core: 'asimetrico', year: 2024, colors: ['#4b375a', '#822369', '#9d5480'] },
  { id: 'brunswick:vaporize', brand: 'Brunswick', name: 'Vaporize', cover: 'perlada', coverstock: 'EVO Pearl', core: 'asimetrico', year: 2024, colors: ['#273740'] },
  { id: 'brunswick:ethos', brand: 'Brunswick', name: 'Ethos', cover: 'perlada', coverstock: 'Savvy Hook 4.0 Pearl', core: 'simetrico', year: 2023, colors: ['#2d264c', '#3a4e7a', '#579dc5'] },
  { id: 'brunswick:infinity', brand: 'Brunswick', name: 'Infinity', cover: 'hibrida', coverstock: 'A.X.H. Hybrid', core: 'asimetrico', year: 2023, colors: ['#12294f', '#956b88', '#a5364e'] },
  { id: 'brunswick:mindset', brand: 'Brunswick', name: 'Mindset', cover: 'solida', coverstock: 'Evolution Solid', core: 'asimetrico', year: 2023, colors: ['#0a5789', '#148eba', '#7f8673'] },
  { id: 'brunswick:teal-rhino-pro', brand: 'Brunswick', name: 'Teal Rhino Pro', cover: 'solida', coverstock: 'Activator Plus 3.0 Solid', core: 'simetrico', year: 2023, colors: ['#028d8e', '#6db583'] },
  { id: 'brunswick:attitude', brand: 'Brunswick', name: 'Attitude', cover: 'perlada', coverstock: 'Activator Plus 3.0 Pearl', core: 'simetrico', year: 2022, colors: ['#504c56', '#33879e', '#883563'] },
  { id: 'brunswick:attitude-control', brand: 'Brunswick', name: 'Attitude Control', cover: 'uretano', coverstock: 'Urethane Pearl', core: 'simetrico', year: 2022, colors: ['#391215', '#ae2633', '#ac8150'] },
  { id: 'brunswick:defender', brand: 'Brunswick', name: 'Defender', cover: 'solida', coverstock: 'ACT 3.0 Solid', core: 'asimetrico', year: 2022, colors: ['#2b1c4d', '#87196f', '#4c7c8d'] },
  { id: 'brunswick:crown-jewel', brand: 'Brunswick', name: 'Crown Jewel', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico', year: 2021, colors: ['#764d1e', '#b1722e', '#eabf46'] },
  { id: 'brunswick:knock-out', brand: 'Brunswick', name: 'Knock Out', cover: 'solida', coverstock: 'Savvy Hook 3.0 Solid', core: 'simetrico', year: 2021, colors: ['#2c2c2c', '#772426'] },
  { id: 'brunswick:quantum-evo-pearl', brand: 'Brunswick', name: 'Quantum Evo Pearl', cover: 'perlada', coverstock: 'Evolution', core: 'asimetrico', year: 2021, colors: ['#2b2d43', '#b7636c', '#4e577b'] },
  { id: 'brunswick:quantum-evo-solid', brand: 'Brunswick', name: 'Quantum Evo Solid', cover: 'solida', coverstock: 'Evolution Solid', core: 'asimetrico', year: 2021, colors: ['#0ec93a', '#0049b7', '#062577'] },
  { id: 'brunswick:stellar', brand: 'Brunswick', name: 'Stellar', cover: 'hibrida', coverstock: 'Activator Plus 2.0 Hybrid', core: 'simetrico', year: 2021, colors: ['#1a233a', '#585358'] },
  { id: 'brunswick:igniter-solid', brand: 'Brunswick', name: 'Igniter Solid', cover: 'solida', coverstock: 'Relativity 3.0 Solid', core: 'simetrico', year: 2020, colors: ['#2fa24a', '#6ea65b', '#373942'] },
  { id: 'brunswick:prism-warp', brand: 'Brunswick', name: 'Prism Warp', cover: 'solida', coverstock: 'ACT 2.0', core: 'asimetrico', year: 2020, colors: ['#287a8b', '#604170'] },
  { id: 'brunswick:u-motion', brand: 'Brunswick', name: 'U-Motion', cover: 'uretano', coverstock: 'Solid Urethane', core: 'simetrico', year: 2020, colors: ['#15131a', '#3b2e47', '#8b8690'] },
  { id: 'brunswick:zenith', brand: 'Brunswick', name: 'Zenith', cover: 'solida', coverstock: 'A.X.H. Solid', core: 'asimetrico', year: 2020, colors: ['#67272f', '#d37b60', '#a72a30'] },
  { id: 'brunswick:prism-solid', brand: 'Brunswick', name: 'Prism Solid', cover: 'solida', coverstock: 'ACT Solid', core: 'asimetrico', year: 2019, colors: ['#5db25f', '#9dca9c'] },
  { id: 'brunswick:vapor-zone-solid', brand: 'Brunswick', name: 'Vapor Zone Solid', cover: 'solida', coverstock: 'Activator Plus 2.0 Solid', core: 'asimetrico', year: 2019, colors: ['#252842', '#59495e'] },
  { id: 'brunswick:fearless', brand: 'Brunswick', name: 'Fearless', cover: 'solida', coverstock: 'Relentless', core: 'simetrico', year: 2018, colors: ['#3ca147', '#6a2a79', '#976074'] },
  { id: 'brunswick:quantum-bias', brand: 'Brunswick', name: 'Quantum Bias', cover: 'solida', coverstock: 'ECA-XR Solid', core: 'asimetrico', year: 2018, colors: ['#bfbcb3', '#e6e4e0'] },
  { id: 'brunswick:tenacity', brand: 'Brunswick', name: 'Tenacity', cover: 'perlada', coverstock: 'UR', core: 'asimetrico', year: 2018, colors: ['#2b1f37', '#878984', '#52455f'] },
  { id: 'brunswick:twist', brand: 'Brunswick', name: 'Twist', cover: 'perlada', coverstock: 'R-16', core: 'simetrico', year: 2018, colors: ['#1d222d', '#864861', '#a28141'] },
  { id: 'brunswick:kingpin', brand: 'Brunswick', name: 'Kingpin', cover: 'solida', coverstock: 'ECA Solid', core: 'asimetrico', year: 2017, colors: ['#2f2f40', '#4e5d7c'] },
  { id: 'brunswick:magnitude-035', brand: 'Brunswick', name: 'Magnitude 035', cover: 'solida', coverstock: 'Relativity Flip Solid', core: 'simetrico', year: 2017, colors: ['#1f3c6e', '#852b47'] },
  { id: 'brunswick:magnitude-055', brand: 'Brunswick', name: 'Magnitude 055', cover: 'solida', coverstock: 'Relativity Traction Solid', core: 'simetrico', year: 2017, colors: ['#a1222d', '#48232a', '#b9963c'] },
  { id: 'brunswick:true-motion', brand: 'Brunswick', name: 'True Motion', cover: 'uretano', coverstock: 'True Urethane', core: 'simetrico', year: 2017, colors: ['#333232'] },
  { id: 'brunswick:rhino', brand: 'Brunswick', name: 'Rhino', cover: 'perlada', coverstock: 'R-16', core: 'simetrico', year: 2016 },
  { id: 'brunswick:tzone', brand: 'Brunswick', name: 'TZone', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico', year: 2015 },

  // Ebonite (grupo Brunswick): Game Breaker, The One, Turbo, Envision, Polaris, Entity, Spartan; Maxim de spare.
  { id: 'ebonite:go-time', brand: 'Ebonite', name: 'Go Time', cover: 'solida', coverstock: 'GB 13.7 Solid', core: 'simetrico', year: 2026, colors: ['#4c4c7a', '#252959'] },
  { id: 'ebonite:spartan', brand: 'Ebonite', name: 'Spartan', cover: 'solida', coverstock: 'Optimize Solid', core: 'asimetrico', year: 2026, colors: ['#3c669f', '#7799cc'] },
  { id: 'ebonite:the-great-one', brand: 'Ebonite', name: 'The Great One', cover: 'solida', coverstock: 'GB 15.1 Solid', core: 'asimetrico', year: 2026, colors: ['#3d2861', '#7e84ac'] },
  { id: 'ebonite:turbo-x-nu', brand: 'Ebonite', name: 'Turbo X NU', cover: 'solida', coverstock: 'NU Active', core: 'simetrico', year: 2026, colors: ['#291f4e', '#534f79', '#9395b1'] },
  { id: 'ebonite:entity', brand: 'Ebonite', name: 'Entity', cover: 'solida', coverstock: 'Optimize Solid', core: 'asimetrico', year: 2025, colors: ['#99277b', '#4e2658', '#c72544'] },
  { id: 'ebonite:the-one-ovation', brand: 'Ebonite', name: 'The One Ovation', cover: 'hibrida', coverstock: 'GB 15.1 Hybrid', core: 'asimetrico', year: 2025, colors: ['#2e2833', '#a02648', '#65636c'] },
  { id: 'ebonite:turbo-x', brand: 'Ebonite', name: 'Turbo X', cover: 'solida', coverstock: 'GB 10.7 Solid', core: 'simetrico', year: 2025, colors: ['#302e65'] },
  { id: 'ebonite:crusher', brand: 'Ebonite', name: 'Crusher', cover: 'hibrida', coverstock: 'Optimize Hybrid', core: 'asimetrico', year: 2024, colors: ['#944856', '#402027'] },
  { id: 'ebonite:game-breaker-5', brand: 'Ebonite', name: 'Game Breaker 5', cover: 'solida', coverstock: 'GB 12.7 Solid', core: 'simetrico', year: 2024, colors: ['#1b315c', '#315d94'] },
  { id: 'ebonite:real-time', brand: 'Ebonite', name: 'Real Time', cover: 'solida', coverstock: 'GB 13.7 Solid', core: 'simetrico', year: 2024, colors: ['#a12cb2', '#6f137d', '#be5e8d'] },
  { id: 'ebonite:the-one-reverb', brand: 'Ebonite', name: 'The One Reverb', cover: 'perlada', coverstock: 'GB 15.1 Pearl', core: 'asimetrico', year: 2024, colors: ['#151823', '#733e38', '#576272'] },
  { id: 'ebonite:emerge', brand: 'Ebonite', name: 'Emerge', cover: 'perlada', coverstock: 'Optimize Pearl', core: 'asimetrico', year: 2023, colors: ['#867798', '#3b2a4b', '#c2bcd3'] },
  { id: 'ebonite:fireball', brand: 'Ebonite', name: 'Fireball', cover: 'perlada', coverstock: 'GB 10.7 Pearl', core: 'simetrico', year: 2023, colors: ['#7f2d29', '#d6793b'] },
  { id: 'ebonite:the-one-encore', brand: 'Ebonite', name: 'The One Encore', cover: 'hibrida', coverstock: 'GB 14.4 Hybrid', core: 'asimetrico', year: 2023, colors: ['#078ba4', '#944f8c', '#81a5c0'] },
  { id: 'ebonite:envision', brand: 'Ebonite', name: 'Envision', cover: 'solida', coverstock: 'GSV-X', core: 'asimetrico', year: 2022, colors: ['#192037', '#6a1e26'] },
  { id: 'ebonite:game-breaker-2', brand: 'Ebonite', name: 'Game Breaker 2', cover: 'solida', coverstock: 'GB 10.7 Solid', core: 'simetrico', year: 2022, colors: ['#232225'] },
  { id: 'ebonite:the-one-remix', brand: 'Ebonite', name: 'The One Remix', cover: 'solida', coverstock: 'GB 14.4 Solid', core: 'asimetrico', year: 2022, colors: ['#733a91', '#1e6e84', '#302152'] },
  { id: 'ebonite:game-breaker-4', brand: 'Ebonite', name: 'Game Breaker 4', cover: 'solida', coverstock: 'GB 12.0 Solid', core: 'simetrico', year: 2021, colors: ['#6f2c3b'] },
  { id: 'ebonite:polaris', brand: 'Ebonite', name: 'Polaris', cover: 'solida', coverstock: 'GSV-3 Solid', core: 'asimetrico', year: 2021, colors: ['#27234d', '#9d4136', '#786b54'] },
  { id: 'ebonite:puma', brand: 'Ebonite', name: 'Puma', cover: 'perlada', coverstock: 'GB 10.7 Pearl', core: 'simetrico', year: 2021, colors: ['#302725', '#67583a'] },
  { id: 'ebonite:aero', brand: 'Ebonite', name: 'Aero', cover: 'solida', coverstock: 'GSV-X', core: 'asimetrico', year: 2020, colors: ['#173269', '#465e95', '#8e3150'] },
  { id: 'ebonite:omni', brand: 'Ebonite', name: 'Omni', cover: 'solida', coverstock: 'GSV 2.0', core: 'asimetrico', year: 2020, colors: ['#3a363b', '#8f9198'] },
  { id: 'ebonite:choice', brand: 'Ebonite', name: 'Choice', cover: 'hibrida', coverstock: 'GSV-1 Hybrid', core: 'simetrico', year: 2018, colors: ['#1f191d', '#a6141b', '#632c2d'] },
  { id: 'ebonite:game-breaker-3', brand: 'Ebonite', name: 'Game Breaker 3', cover: 'hibrida', coverstock: 'GB 12.7 Hybrid', core: 'simetrico', year: 2018, colors: ['#1b1a1d'] },
  { id: 'ebonite:turbo-r', brand: 'Ebonite', name: 'Turbo/R', cover: 'solida', coverstock: 'GB 10.7 Solid', core: 'simetrico', year: 2017 },
  { id: 'ebonite:verdict', brand: 'Ebonite', name: 'Verdict', cover: 'solida', coverstock: 'GSV-1 Solid', core: 'simetrico', year: 2017, colors: ['#004a2a', '#507e2f'] },
  { id: 'ebonite:cyclone', brand: 'Ebonite', name: 'Cyclone', cover: 'solida', coverstock: 'GB 10.7 Solid', core: 'simetrico', year: 2011 },
  { id: 'ebonite:maxim', brand: 'Ebonite', name: 'Maxim', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico' },

  // Track (grupo Brunswick): Paragon, Theorem, Stealth, Criterion, Synthesis, Kinetic, Legion…
  { id: 'track:paragon-fire', brand: 'Track', name: 'Paragon Fire', cover: 'solida', coverstock: 'Prime Response Solid', core: 'asimetrico', year: 2026, colors: ['#8e1831', '#dd3749', '#eb8d8e'] },
  { id: 'track:synthesis', brand: 'Track', name: 'Synthesis', cover: 'solida', coverstock: 'QR-12 Solid', core: 'asimetrico', year: 2026, colors: ['#212356', '#585589', '#8f8da5'] },
  { id: 'track:synthesis-prime', brand: 'Track', name: 'Synthesis Prime', cover: 'perlada', coverstock: 'Prime Response Pearl', core: 'asimetrico', year: 2026, colors: ['#245163', '#587083', '#17a2a5'] },
  { id: 'track:cypher-pearl', brand: 'Track', name: 'Cypher Pearl', cover: 'perlada', coverstock: 'Prime Response Pearl', core: 'simetrico', year: 2025, colors: ['#2a507e', '#658ac0', '#91acd7'] },
  { id: 'track:stealth-mode', brand: 'Track', name: 'Stealth Mode', cover: 'solida', coverstock: 'QR-10 Solid', core: 'simetrico', year: 2025, colors: ['#1e2a4b', '#5c263e', '#717486'] },
  { id: 'track:criterion', brand: 'Track', name: 'Criterion', cover: 'solida', coverstock: 'QR-12 Solid', core: 'asimetrico', year: 2024, colors: ['#605ea8', '#30347a', '#90b5b6'] },
  { id: 'track:cypher', brand: 'Track', name: 'Cypher', cover: 'solida', coverstock: 'MR8 Solid', core: 'simetrico', year: 2024, colors: ['#150b1a', '#53604d', '#6b995e'] },
  { id: 'track:theorem-pearl', brand: 'Track', name: 'Theorem Pearl', cover: 'perlada', coverstock: 'Prime Response Pearl', core: 'asimetrico', year: 2024, colors: ['#425f92', '#1f3c66', '#7c98b1'] },
  { id: 'track:archetype', brand: 'Track', name: 'Archetype', cover: 'solida', coverstock: 'QR-11 Solid', core: 'asimetrico', year: 2023, colors: ['#213960', '#69b750', '#acce48'] },
  { id: 'track:kinetic-cobalt', brand: 'Track', name: 'Kinetic Cobalt', cover: 'hibrida', coverstock: 'QR-7 Hybrid', core: 'asimetrico', year: 2023, colors: ['#0e203e', '#2d5291', '#6b3074'] },
  { id: 'track:paragon-pearl', brand: 'Track', name: 'Paragon Pearl', cover: 'perlada', coverstock: 'QR-11 Pearl', core: 'asimetrico', year: 2023, colors: ['#185148', '#35a387', '#a2d1bb'] },
  { id: 'track:stealth-pearl', brand: 'Track', name: 'Stealth Pearl', cover: 'perlada', coverstock: 'QR-9 Pearl', core: 'simetrico', year: 2023, colors: ['#292c43', '#57524b'] },
  { id: 'track:theorem', brand: 'Track', name: 'Theorem', cover: 'hibrida', coverstock: 'Prime Response Hybrid', core: 'asimetrico', year: 2023, colors: ['#252332', '#692336', '#5b596a'] },
  { id: 'track:tundra-fire', brand: 'Track', name: 'Tundra Fire', cover: 'perlada', coverstock: 'DR-5 Pearl', core: 'simetrico', year: 2023, colors: ['#511021', '#a82347', '#c4596b'] },
  { id: 'track:kinetic-black-ice', brand: 'Track', name: 'Kinetic Black Ice', cover: 'perlada', coverstock: 'QR-7 Pearl', core: 'asimetrico', year: 2022, colors: ['#1f2228', '#70635e', '#8f959d'] },
  { id: 'track:legion-solid', brand: 'Track', name: 'Legion Solid', cover: 'solida', coverstock: 'Prime Response', core: 'asimetrico', year: 2022, colors: ['#312560', '#565978'] },
  { id: 'track:paragon', brand: 'Track', name: 'Paragon', cover: 'solida', coverstock: 'QR-11 Solid', core: 'asimetrico', year: 2022, colors: ['#263e8a', '#2170ac', '#6b3682'] },
  { id: 'track:sensor', brand: 'Track', name: 'Sensor', cover: 'perlada', coverstock: 'DR-6 Pearl', core: 'simetrico', year: 2022, colors: ['#29204b', '#917a4e'] },
  { id: 'track:stealth', brand: 'Track', name: 'Stealth', cover: 'solida', coverstock: 'QR-9 Solid', core: 'simetrico', year: 2022, colors: ['#2c292a', '#5e594a'] },
  { id: 'track:heat', brand: 'Track', name: 'Heat', cover: 'solida', coverstock: 'DR-7 Solid', core: 'simetrico', year: 2021, colors: ['#6e4983'] },
  { id: 'track:legion-pearl', brand: 'Track', name: 'Legion Pearl', cover: 'perlada', coverstock: 'Prime Response Pearl', core: 'asimetrico', year: 2021, colors: ['#2a2739', '#705a60', '#a898ae'] },
  { id: 'track:latitude', brand: 'Track', name: 'Latitude', cover: 'solida', coverstock: 'QR-8 Solid', core: 'simetrico', year: 2020, colors: ['#2f2658', '#684f85', '#8e878c'] },

  // Radical (grupo Brunswick): Outer Limits, Katana, Rattler, Sneak Attack, No Doubt, Hitter, Intel…
  { id: 'radical:deep-impact', brand: 'Radical', name: 'Deep Impact', cover: 'hibrida', coverstock: 'HK22C+ Hybrid', core: 'asimetrico', year: 2026, colors: ['#4d2969', '#a5255b', '#66736e'] },
  { id: 'radical:revenge-solid', brand: 'Radical', name: 'Revenge Solid', cover: 'solida', coverstock: 'HyperKinetic Solid', core: 'simetrico', year: 2026, colors: ['#067682', '#212d37', '#426359'] },
  { id: 'radical:vexed', brand: 'Radical', name: 'Vexed', cover: 'solida', coverstock: 'HK22C+ Solid', core: 'asimetrico', year: 2026, colors: ['#302f69', '#695761', '#7195ac'] },
  { id: 'radical:evil-eye', brand: 'Radical', name: 'Evil Eye', cover: 'solida', coverstock: 'HK22C Solid', core: 'simetrico', year: 2025, colors: ['#2b2929'] },
  { id: 'radical:guru-oracle', brand: 'Radical', name: 'Guru Oracle', cover: 'solida', coverstock: 'HK22C Solid', core: 'asimetrico', year: 2025, colors: ['#31425b', '#587068', '#a2c7aa'] },
  { id: 'radical:intel-recon', brand: 'Radical', name: 'Intel Recon', cover: 'perlada', coverstock: 'HyperKinetic Pearl', core: 'simetrico', year: 2025, colors: ['#222442', '#624f6f'] },
  { id: 'radical:power-hitter', brand: 'Radical', name: 'Power Hitter', cover: 'hibrida', coverstock: 'Textured Hybrid', core: 'asimetrico', year: 2025, colors: ['#104b72', '#2995c2', '#a19c84'] },
  { id: 'radical:snapshot', brand: 'Radical', name: 'Snapshot', cover: 'perlada', coverstock: 'HK22C+ Pearl', core: 'simetrico', year: 2025, colors: ['#5f2f3c', '#8d626a', '#b29690'] },
  { id: 'radical:torpedo', brand: 'Radical', name: 'Torpedo', cover: 'perlada', coverstock: 'HK22C+ Pearl', core: 'asimetrico', year: 2025, colors: ['#192b50', '#255880', '#7b273e'] },
  { id: 'radical:breakaway', brand: 'Radical', name: 'Breakaway', cover: 'solida', coverstock: 'HyperKinetic+', core: 'simetrico', year: 2024, colors: ['#432764', '#9d5772'] },
  { id: 'radical:max-bias', brand: 'Radical', name: 'Max Bias', cover: 'hibrida', coverstock: 'HK22+ Textured Hybrid', core: 'asimetrico', year: 2024, colors: ['#01679d', '#5a9d88'] },
  { id: 'radical:no-doubt', brand: 'Radical', name: 'No Doubt', cover: 'perlada', coverstock: 'HK22+ Pearl', core: 'simetrico', year: 2024, colors: ['#1576a0', '#2c356d', '#5f9b99'] },
  { id: 'radical:rattler-nu', brand: 'Radical', name: 'Rattler NU', cover: 'solida', coverstock: 'Not Urethane', core: 'simetrico', year: 2024, colors: ['#01797c', '#0ca9a5', '#3c7c66'] },
  { id: 'radical:deadly-rattler', brand: 'Radical', name: 'Deadly Rattler', cover: 'perlada', coverstock: 'HyperKinetic Pearl', core: 'simetrico', year: 2023, colors: ['#771c2f', '#be2948', '#c0817b'] },
  { id: 'radical:katana-assault', brand: 'Radical', name: 'Katana Assault', cover: 'perlada', coverstock: 'HyperKinetic Pearl', core: 'asimetrico', year: 2023, colors: ['#132c3d', '#678765', '#1989a5'] },
  { id: 'radical:outer-limits', brand: 'Radical', name: 'Outer Limits', cover: 'hibrida', coverstock: 'HyperKinetic Hybrid', core: 'asimetrico', year: 2023, colors: ['#5d7db7', '#2e4c7d', '#babdda'] },
  { id: 'radical:the-hitter', brand: 'Radical', name: 'The Hitter', cover: 'solida', coverstock: 'Utility Solid', core: 'asimetrico', year: 2023, colors: ['#0b0f17', '#3f2e39'] },
  { id: 'radical:zigzag', brand: 'Radical', name: 'ZigZag', cover: 'hibrida', coverstock: 'HyperKinetic Hybrid', core: 'asimetrico', year: 2023, colors: ['#394f48', '#95bc9f', '#5e825b'] },
  { id: 'radical:bigfoot', brand: 'Radical', name: 'Bigfoot', cover: 'perlada', coverstock: 'TP-1+', core: 'simetrico', year: 2022, colors: ['#065066', '#5786ad'] },
  { id: 'radical:crypto', brand: 'Radical', name: 'Crypto', cover: 'solida', coverstock: 'Ai-45', core: 'simetrico', year: 2022, colors: ['#fd5b01', '#0f2c64', '#6d928c'] },
  { id: 'radical:innovator', brand: 'Radical', name: 'Innovator', cover: 'perlada', coverstock: 'MOtion Magic Plus', core: 'asimetrico', year: 2022, colors: ['#512437', '#a83343', '#967b5b'] },
  { id: 'radical:rattler', brand: 'Radical', name: 'Rattler', cover: 'solida', coverstock: 'S.H.A.R.P.', core: 'simetrico', year: 2022, colors: ['#483b64'] },
  { id: 'radical:sneak-attack', brand: 'Radical', name: 'Sneak Attack', cover: 'hibrida', coverstock: 'MTH-1', core: 'simetrico', year: 2022, colors: ['#343842', '#585e69'] },
  { id: 'radical:payback', brand: 'Radical', name: 'Payback', cover: 'perlada', coverstock: 'Ai-27 Pearl Plus', core: 'simetrico', year: 2021, colors: ['#153451', '#562c62', '#7e706c'] },
  { id: 'radical:trail-blazer', brand: 'Radical', name: 'Trail Blazer', cover: 'hibrida', coverstock: 'MOtion Magic', core: 'asimetrico', year: 2021, colors: ['#242e1a', '#048e5f', '#7fa88c'] },
  { id: 'radical:bonus', brand: 'Radical', name: 'Bonu$', cover: 'solida', coverstock: 'Forged Solid', core: 'simetrico', year: 2020, colors: ['#25252f', '#594e47'] },
  { id: 'radical:incognito', brand: 'Radical', name: 'Incognito', cover: 'solida', coverstock: 'S.H.A.R.P.', core: 'asimetrico', year: 2020, colors: ['#15191b', '#2f3e4b'] },
  { id: 'radical:pandemonium', brand: 'Radical', name: 'Pandemonium', cover: 'perlada', coverstock: 'Forged + Pearl', core: 'simetrico', year: 2020, colors: ['#1d1b24', '#7c3136'] },
  { id: 'radical:results', brand: 'Radical', name: 'Results', cover: 'perlada', coverstock: 'TP-1', core: 'asimetrico', year: 2020, colors: ['#ab7751', '#612e37'] },
  { id: 'radical:astro-nuts', brand: 'Radical', name: 'Astro-Nuts', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico', year: 2019, colors: ['#393c42', '#63b663', '#836a4f'] },
  { id: 'radical:squatch', brand: 'Radical', name: 'Squatch', cover: 'perlada', coverstock: 'Ai-39 Pearl', core: 'simetrico', year: 2019, colors: ['#242834', '#4d5857', '#7a7d6d'] },
  { id: 'radical:zing', brand: 'Radical', name: 'Zing!', cover: 'solida', coverstock: 'Forged 2 Solid', core: 'asimetrico', year: 2019, colors: ['#e15389', '#745166', '#1189b9'] },
  { id: 'radical:conspiracy', brand: 'Radical', name: 'Conspiracy', cover: 'solida', coverstock: 'Forged 2 Solid', core: 'asimetrico', year: 2018, colors: ['#282828', '#8d8b5e'] },
  { id: 'radical:intel', brand: 'Radical', name: 'Intel', cover: 'solida', coverstock: 'Ai-25', core: 'simetrico', year: 2018, colors: ['#202939', '#587485'] },

  // Columbia 300 (grupo Brunswick): PowerCOR (Cuda, Piranha, Messenger), Speed, Pulse; White Dot de spare.
  { id: 'columbia-300:pulse', brand: 'Columbia 300', name: 'Pulse', cover: 'solida', coverstock: 'Hyperflex', core: 'simetrico', year: 2025, colors: ['#8d202a', '#c6414e', '#e49aa1'] },
  { id: 'columbia-300:rally', brand: 'Columbia 300', name: 'Rally', cover: 'hibrida', coverstock: 'Formula 1 Hybrid', core: 'asimetrico', year: 2025, colors: ['#19497c', '#6f8b8e'] },
  { id: 'columbia-300:street-rally', brand: 'Columbia 300', name: 'Street Rally', cover: 'perlada', coverstock: 'Formula 1 Pearl', core: 'asimetrico', year: 2025, colors: ['#1c213d', '#3c3372', '#ef8ea0'] },
  { id: 'columbia-300:kaboom', brand: 'Columbia 300', name: 'Kaboom', cover: 'perlada', coverstock: 'Reflex Pearl', core: 'simetrico', year: 2024, colors: ['#241e4c', '#1c508e', '#5a507b'] },
  { id: 'columbia-300:pure-madness', brand: 'Columbia 300', name: 'Pure Madness', cover: 'solida', coverstock: 'ERT Solid', core: 'asimetrico', year: 2024, colors: ['#932230', '#571d2b', '#b77b4d'] },
  { id: 'columbia-300:ricochet-pearl', brand: 'Columbia 300', name: 'Ricochet Pearl', cover: 'perlada', coverstock: 'Micro Flex Pearl', core: 'simetrico', year: 2024, colors: ['#28293c', '#625b5e'] },
  { id: 'columbia-300:super-cuda-powercor', brand: 'Columbia 300', name: 'Super Cuda PowerCOR', cover: 'hibrida', coverstock: 'Formula 1 Hybrid', core: 'simetrico', year: 2024, colors: ['#2b2749', '#867073', '#7f3850'] },
  { id: 'columbia-300:atlas', brand: 'Columbia 300', name: 'Atlas', cover: 'solida', coverstock: 'Formula 1 Solid', core: 'asimetrico', year: 2023, colors: ['#29377f', '#13a7c5', '#4c6693'] },
  { id: 'columbia-300:explosion', brand: 'Columbia 300', name: 'Explosion', cover: 'hibrida', coverstock: 'Reflex Hybrid', core: 'simetrico', year: 2023, colors: ['#435c86', '#131e37', '#989d7f'] },
  { id: 'columbia-300:high-speed', brand: 'Columbia 300', name: 'High Speed', cover: 'hibrida', coverstock: 'Formula 1 Hybrid', core: 'asimetrico', year: 2023, colors: ['#212931', '#38604d', '#7a3842'] },
  { id: 'columbia-300:madness', brand: 'Columbia 300', name: 'Madness', cover: 'perlada', coverstock: 'ERT Pearl', core: 'asimetrico', year: 2023, colors: ['#221c1c', '#5f5036', '#859a4e'] },
  { id: 'columbia-300:piranha-powercor', brand: 'Columbia 300', name: 'Piranha PowerCOR', cover: 'solida', coverstock: 'ERT+ Solid', core: 'simetrico', year: 2023, colors: ['#2e79a6', '#0f4875', '#66a7ad'] },
  { id: 'columbia-300:cuda-powercor', brand: 'Columbia 300', name: 'Cuda PowerCOR', cover: 'solida', coverstock: 'ERT Solid', core: 'simetrico', year: 2022, colors: ['#34121f', '#684255'] },
  { id: 'columbia-300:messenger-powercor-solid', brand: 'Columbia 300', name: 'Messenger PowerCOR Solid', cover: 'solida', coverstock: 'Reflex Solid', core: 'simetrico', year: 2022, colors: ['#223f95', '#4b819b'] },
  { id: 'columbia-300:speed', brand: 'Columbia 300', name: 'Speed', cover: 'hibrida', coverstock: 'Formula 1 Hybrid', core: 'asimetrico', year: 2022, colors: ['#b21d26', '#70141f', '#bb9c73'] },
  { id: 'columbia-300:top-speed', brand: 'Columbia 300', name: 'Top Speed', cover: 'perlada', coverstock: 'Formula 1 Pearl', core: 'asimetrico', year: 2022, colors: ['#452a54', '#ad90b5', '#9c5875'] },
  { id: 'columbia-300:blue-dot', brand: 'Columbia 300', name: 'Blue Dot', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico', year: 2021, colors: ['#707179', '#afb1b9'] },
  { id: 'columbia-300:command', brand: 'Columbia 300', name: 'Command', cover: 'perlada', coverstock: 'ARS', core: 'asimetrico', year: 2021, colors: ['#393e49', '#867a51', '#a2b077'] },
  { id: 'columbia-300:power-torq', brand: 'Columbia 300', name: 'Power Torq', cover: 'solida', coverstock: 'ERT Solid', core: 'simetrico', year: 2021, colors: ['#045d7b', '#1aa8ca', '#82c3a7'] },
  { id: 'columbia-300:authority', brand: 'Columbia 300', name: 'Authority', cover: 'perlada', coverstock: 'ERT 2.0 Pearl', core: 'asimetrico', year: 2020, colors: ['#158f59', '#38333b', '#798a65'] },
  { id: 'columbia-300:maximum-chaos', brand: 'Columbia 300', name: 'Maximum Chaos', cover: 'solida', coverstock: 'ERT Solid', core: 'simetrico', year: 2019, colors: ['#31191f', '#723745', '#937038'] },
  { id: 'columbia-300:messenger', brand: 'Columbia 300', name: 'Messenger', cover: 'perlada', coverstock: 'Super Flex', core: 'simetrico', year: 2019 },
  { id: 'columbia-300:the-beast', brand: 'Columbia 300', name: 'The Beast', cover: 'perlada', coverstock: 'Bend-It Pearl', core: 'simetrico', year: 2019, colors: ['#121622', '#594257', '#736989'] },
  { id: 'columbia-300:savage', brand: 'Columbia 300', name: 'Savage', cover: 'solida', coverstock: 'Exciter Solid', core: 'asimetrico', year: 2018, colors: ['#1d1533', '#780f57', '#5d862f'] },
  { id: 'columbia-300:lit', brand: 'Columbia 300', name: 'Lit', cover: 'solida', coverstock: 'Reflex XS', core: 'asimetrico', year: 2017, colors: ['#201e21', '#602f45', '#71646f'] },
  { id: 'columbia-300:nitrous', brand: 'Columbia 300', name: 'Nitrous', cover: 'perlada', coverstock: 'Boost/R', core: 'simetrico', year: 2016 },
  { id: 'columbia-300:white-dot', brand: 'Columbia 300', name: 'White Dot', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico' },

  // DV8 (grupo Brunswick, desde 2021 de nuevo): Collision, Heckler, Hater, Mantra, Trouble Maker, Verge…
  { id: 'dv8:double-trouble', brand: 'DV8', name: 'Double Trouble', cover: 'perlada', coverstock: 'Havoc Pearl', core: 'simetrico', year: 2026, colors: ['#244d65', '#4b828f', '#8a9a9a'] },
  { id: 'dv8:outsider', brand: 'DV8', name: 'Outsider', cover: 'solida', coverstock: 'Jailbreak (F7)', core: 'asimetrico', year: 2026, colors: ['#0d4884', '#182c49', '#4777a5'] },
  { id: 'dv8:smooth-criminal', brand: 'DV8', name: 'Smooth Criminal', cover: 'hibrida', coverstock: 'Jailbreak (S5)', core: 'simetrico', year: 2026, colors: ['#1a212b', '#405b5d', '#5c8288'] },
  { id: 'dv8:dark-side', brand: 'DV8', name: 'Dark Side', cover: 'hibrida', coverstock: 'Inciter Hybrid', core: 'simetrico', year: 2025, colors: ['#321a4a', '#792c54', '#815f8c'] },
  { id: 'dv8:hater', brand: 'DV8', name: 'Hater', cover: 'hibrida', coverstock: 'Havoc Hybrid', core: 'asimetrico', year: 2024, colors: ['#181927', '#901c28', '#6b474c'] },
  { id: 'dv8:heckler', brand: 'DV8', name: 'Heckler', cover: 'solida', coverstock: 'Maximum Havoc Solid', core: 'asimetrico', year: 2024, colors: ['#1c1d2c', '#c57156', '#6e3c4c'] },
  { id: 'dv8:mantra', brand: 'DV8', name: 'Mantra', cover: 'hibrida', coverstock: 'Inciter Xtreme Hybrid', core: 'asimetrico', year: 2024, colors: ['#527683', '#1e3564', '#94bfc1'] },
  { id: 'dv8:wicked-collision', brand: 'DV8', name: 'Wicked Collision', cover: 'solida', coverstock: 'Havoc Solid', core: 'asimetrico', year: 2024, colors: ['#302f77', '#637a8e', '#1a83a1'] },
  { id: 'dv8:captiv8', brand: 'DV8', name: 'Captiv8', cover: 'perlada', coverstock: 'Inciter Pearl', core: 'simetrico', year: 2023, colors: ['#1e4a27', '#997030', '#537445'] },
  { id: 'dv8:chill', brand: 'DV8', name: 'Chill', cover: 'solida', coverstock: 'Inciter Max Flip Solid', core: 'simetrico', year: 2023, colors: ['#352362', '#497088', '#79a4bf'] },
  { id: 'dv8:trouble-maker', brand: 'DV8', name: 'Trouble Maker', cover: 'hibrida', coverstock: 'Inciter Max Continuation', core: 'simetrico', year: 2023, colors: ['#242536', '#27889b', '#42605a'] },
  { id: 'dv8:violent-collision', brand: 'DV8', name: 'Violent Collision', cover: 'perlada', coverstock: 'Havoc Pearl', core: 'asimetrico', year: 2023, colors: ['#182446', '#7b7d8a', '#a7a7b1'] },
  { id: 'dv8:brutal-collision', brand: 'DV8', name: 'Brutal Collision', cover: 'solida', coverstock: 'Inciter Xtreme Solid', core: 'asimetrico', year: 2022, colors: ['#cd9066', '#0c4291', '#ec5b1a'] },
  { id: 'dv8:collision', brand: 'DV8', name: 'Collision', cover: 'hibrida', coverstock: 'Inciter Max Continuation', core: 'asimetrico', year: 2022, colors: ['#81585d', '#542d40', '#ca1c60'] },
  { id: 'dv8:diamond-diva', brand: 'DV8', name: 'Diamond Diva', cover: 'perlada', coverstock: 'Inciter Max Flip Pearl', core: 'simetrico', year: 2022, colors: ['#9e1c4f', '#32182a', '#967565'] },
  { id: 'dv8:hellcat', brand: 'DV8', name: 'Hellcat', cover: 'solida', coverstock: 'Havoc', core: 'asimetrico', year: 2022, colors: ['#1a1d29', '#d41c45', '#883c6d'] },
  { id: 'dv8:activ8', brand: 'DV8', name: 'Activ8', cover: 'hibrida', coverstock: 'Composite Fang Hybrid', core: 'simetrico', year: 2021, colors: ['#151225', '#685467', '#3a3250'] },
  { id: 'dv8:damn-good-verge', brand: 'DV8', name: 'Damn Good Verge', cover: 'solida', coverstock: 'Inciter Max Traction', core: 'simetrico', year: 2021, colors: ['#342d59', '#696172'] },
  { id: 'dv8:hell-raiser-return', brand: 'DV8', name: 'Hell Raiser Return', cover: 'perlada', coverstock: 'Inciter Max Flip Pearl', core: 'asimetrico', year: 2021, colors: ['#1f1c1d', '#654b4c'] },
  { id: 'dv8:medusa', brand: 'DV8', name: 'Medusa', cover: 'perlada', coverstock: 'Inciter Max Flip Pearl', core: 'asimetrico', year: 2021, colors: ['#696936', '#bcab3e'] },
  { id: 'dv8:intimidator', brand: 'DV8', name: 'Intimidator', cover: 'solida', coverstock: 'Inciter Max', core: 'asimetrico', year: 2020, colors: ['#35285f', '#c5c4ca', '#806473'] },
  { id: 'dv8:verge', brand: 'DV8', name: 'Verge', cover: 'solida', coverstock: 'Inciter Solid', core: 'simetrico', year: 2019, colors: ['#253e69', '#57687e'] },
  { id: 'dv8:turmoil-solid', brand: 'DV8', name: 'Turmoil Solid', cover: 'solida', coverstock: 'Composite Hook Solid', core: 'simetrico', year: 2018, colors: ['#272f6e', '#ac5844', '#c1c2aa'] },
  { id: 'dv8:alley-cat', brand: 'DV8', name: 'Alley Cat', cover: 'solida', coverstock: 'ACR', core: 'asimetrico', year: 2017 },
  { id: 'dv8:hitman', brand: 'DV8', name: 'Hitman', cover: 'perlada', coverstock: 'N-Forcer', core: 'asimetrico', year: 2017, colors: ['#b75c3f', '#2c4450', '#08718c'] },
  { id: 'dv8:pitbull', brand: 'DV8', name: 'Pitbull', cover: 'solida', coverstock: 'Composite Bite', core: 'asimetrico', year: 2017, colors: ['#372331', '#696151', '#7faa5f'] },

  // Pyramid: Path y Path Rising (de entrada), Pathogen, Antidote, Force, Blood Moon, Fortress, Prime.
  { id: 'pyramid:prime-pearl', brand: 'Pyramid', name: 'Prime Pearl', cover: 'perlada', coverstock: 'GPS Navigational Pearl ATX-XX', core: 'asimetrico', year: 2025, colors: ['#5d43aa', '#99d3a4', '#8b91bb'] },
  { id: 'pyramid:prime-solid', brand: 'Pyramid', name: 'Prime Solid', cover: 'solida', coverstock: 'GPS Navigational Solid ATX-XX', core: 'asimetrico', year: 2025, colors: ['#d68b26', '#92560e', '#fddaa8'] },
  { id: 'pyramid:blood-moon-evolve', brand: 'Pyramid', name: 'Blood Moon Evolve', cover: 'perlada', coverstock: 'GPS Navigational Pearl +', core: 'simetrico', year: 2024, colors: ['#7f9992', '#dae6e7', '#aec1c2'] },
  { id: 'pyramid:fortress-endgame', brand: 'Pyramid', name: 'Fortress Endgame', cover: 'solida', coverstock: 'GPS Navigational Solid ATX-XX', core: 'asimetrico', year: 2024, colors: ['#7b8787', '#3e4847', '#c8cecd'] },
  { id: 'pyramid:fortress-solid', brand: 'Pyramid', name: 'Fortress Solid', cover: 'solida', coverstock: 'GPS Navigational Solid ATX-XX', core: 'asimetrico', year: 2023, colors: ['#25191c', '#a7ab9b', '#cacebf'] },
  { id: 'pyramid:fortress', brand: 'Pyramid', name: 'Fortress', cover: 'perlada', coverstock: 'XF Gravitational Pearl', core: 'simetrico', year: 2022, colors: ['#8a8871', '#e6e5e1', '#57584c'] },
  { id: 'pyramid:blue-moon', brand: 'Pyramid', name: 'Blue Moon', cover: 'solida', coverstock: 'GPS Navigational ATX Solid', core: 'asimetrico', year: 2021, colors: ['#1048b3', '#518ee0', '#8cb0e4'] },
  { id: 'pyramid:pathogen-plague', brand: 'Pyramid', name: 'Pathogen Plague', cover: 'uretano', coverstock: 'GPS Navigational Urethane', core: 'simetrico', year: 2018, colors: ['#191919', '#8b8c79'] },
  { id: 'pyramid:blood-moon-rising', brand: 'Pyramid', name: 'Blood Moon Rising', cover: 'hibrida', coverstock: 'GPS Navigational Hybrid', core: 'asimetrico', year: 2017, colors: ['#67221f', '#f44646', '#914741'] },
  { id: 'pyramid:antidote', brand: 'Pyramid', name: 'Antidote', cover: 'solida', coverstock: 'GPS Navigational Solid', core: 'simetrico', year: 2016, colors: ['#1f2217', '#a69119', '#63621b'] },
  { id: 'pyramid:force', brand: 'Pyramid', name: 'Force', cover: 'solida', coverstock: 'GPS Navigational Solid', core: 'asimetrico', year: 2016, colors: ['#161616', '#7e7f7f'] },
  { id: 'pyramid:pathogen-x', brand: 'Pyramid', name: 'Pathogen X', cover: 'perlada', coverstock: 'GPS Navigational Pearl', core: 'simetrico', year: 2016, colors: ['#df6207', '#a54104'] },
  { id: 'pyramid:pathogen', brand: 'Pyramid', name: 'Pathogen', cover: 'solida', coverstock: 'GPS Navigational Solid', core: 'simetrico', year: 2015, colors: ['#42cb3e', '#85d782'] },
  { id: 'pyramid:path-rising', brand: 'Pyramid', name: 'Path Rising', cover: 'perlada', coverstock: 'Path Pearl', core: 'simetrico', year: 2013 },
  { id: 'pyramid:path', brand: 'Pyramid', name: 'Path', cover: 'poliester', coverstock: 'Plastic', core: 'simetrico', year: 2011 },

  // Seismic (ya casi no saca bolas): solo las que se pudieron confirmar.
  { id: 'seismic:blackout-pearl', brand: 'Seismic', name: 'Blackout Pearl', cover: 'perlada', coverstock: 'X3P', core: 'simetrico', year: 2018, colors: ['#000000', '#2e2e2e'] },
  { id: 'seismic:lynx', brand: 'Seismic', name: 'LynX', cover: 'solida', coverstock: 'MSS1000', core: 'simetrico', year: 2017, colors: ['#12191b', '#605d60', '#a1807a'] },
  { id: 'seismic:venator', brand: 'Seismic', name: 'Venator', cover: 'solida', coverstock: 'S.F-7/9 Solid', core: 'asimetrico', year: 2013 },

  // Lane #1: solo la que se pudo confirmar en los últimos años.
  { id: 'lane-1:crystal-bomb', brand: 'Lane #1', name: 'Crystal Bomb', cover: 'poliester', coverstock: 'Polyester', core: 'simetrico', year: 2020, colors: ['#313e4f', '#659ab6', '#536373'] },
];

/** Las marcas del catálogo, en orden alfabético. */
export const BALL_BRANDS: readonly string[] = [...new Set(BALL_CATALOG.map((b) => b.brand))].sort((a, b) => a.localeCompare(b, 'es'));

/**
 * Para comparar: sin acentos, en minúsculas y solo letras, números y espacios. «!Q» es «IQ» («!Q Tour»), «$» es «s»
 * («Bonu$») y los puntos se van salvo entre números («A.I.» → «ai», «2.0» se queda).
 */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/!q/g, 'iq')
    .replace(/\$/g, 's')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Los números romanos de los modelos («Phaze II», «Hy-Road X»), para que también se encuentren con cifras. */
const ROMAN: Readonly<Record<string, string>> = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };

/** Lo doblado con los romanos en cifras: «phaze ii» → «phaze 2». Solo del lado del catálogo, así «v» sigue buscando «Venom». */
const arabic = (folded: string) =>
  folded
    .split(' ')
    .map((t) => ROMAN[t] ?? t)
    .join(' ');

interface Indexed {
  ball: CatalogBall;
  /** Marca y nombre, doblados (y otra vez con los romanos en cifras). */
  hay: string;
  /** Lo mismo sin espacios ni puntos: «hyroad» encuentra «Hy-Road», «rotogrip» a «Roto Grip». */
  compact: string;
  tokens: string[];
  brandTokens: string[];
  /** El nombre doblado y con los romanos en cifras: «storm phaze 2» es el nombre exacto de «Phaze II». */
  names: string[];
}

const INDEX: readonly Indexed[] = BALL_CATALOG.map((ball) => {
  const folded = fold(`${ball.brand} ${ball.name}`);
  const digits = arabic(folded);
  const hay = digits === folded ? folded : `${folded} ${digits}`;
  const name = fold(ball.name);
  return {
    ball,
    hay,
    compact: folded.replace(/[ .]/g, ''),
    tokens: [...new Set(hay.split(' '))],
    brandTokens: fold(ball.brand).split(' '),
    names: [...new Set([name, arabic(name)])],
  };
});

const byId = new Map(BALL_CATALOG.map((b) => [b.id, b]));

/** El modelo por su clave (null si no está). */
export const catalogBall = (id: string | null | undefined): CatalogBall | null => (id ? (byId.get(id) ?? null) : null);

/**
 * Buscar por marca y modelo en cualquier orden y sin acentos: «storm phaze» (o «phaze storm») → los Phaze de Storm.
 * Cada palabra tiene que estar en la marca o el nombre. Primero el nombre exacto, después los que empiezan con lo
 * escrito (sin contar la marca), después los que tienen las palabras al principio de una palabra; y entre iguales, los
 * más nuevos.
 */
export function searchBallCatalog(query: string, limit = 20): CatalogBall[] {
  const words = fold(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const hits: { it: Indexed; tier: number; score: number }[] = [];
  for (const it of INDEX) {
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (it.tokens.includes(w)) score += 3;
      else if (it.tokens.some((t) => t.startsWith(w))) score += 2;
      else if (it.hay.includes(w) || it.compact.includes(w.replace(/\./g, ''))) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const rest = words.filter((w) => !it.brandTokens.includes(w)).join(' ');
    const tier = !rest ? 2 : it.names.includes(rest) ? 0 : it.names.some((n) => n.startsWith(rest)) ? 1 : 2;
    hits.push({ it, tier, score });
  }
  return hits
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.score - a.score ||
        (b.it.ball.year ?? 0) - (a.it.ball.year ?? 0) ||
        a.it.ball.name.localeCompare(b.it.ball.name, 'es'),
    )
    .slice(0, limit)
    .map((h) => h.it.ball);
}
