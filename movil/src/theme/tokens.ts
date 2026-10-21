/**
 * Los colores y medidas de MatchMate, los mismos de la web (src/index.css): claro, oscuro y el «Calma y foco» del
 * rediseño. El acento (accent, accentFg, accentSoft) cambia con el deporte activo (theme.tsx).
 */
export interface Colors {
  bg: string;
  surface: string;
  surface2: string;
  fg: string;
  fg2: string;
  muted: string;
  faint: string;
  line: string;
  segOn: string;
  accent: string;
  accentFg: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  onDanger: string;
  ok: string;
  okSoft: string;
  warn: string;
  warnSoft: string;
  gold: string;
  silver: string;
  bronze: string;
  /** Fondo detrás de una hoja o un aviso (no está en la web como variable: es el scrim de los diálogos). */
  scrim: string;
}

export const light: Colors = {
  bg: '#f4f5f8',
  surface: '#ffffff',
  surface2: '#eef0f4',
  fg: '#151822',
  fg2: '#3d4352',
  muted: '#646b7a',
  faint: '#a3a9b6',
  line: '#e2e5eb',
  segOn: '#ffffff',
  accent: '#4338ca',
  accentFg: '#ffffff',
  accentSoft: '#e8e7fb',
  danger: '#c62828',
  dangerSoft: '#fdecec',
  onDanger: '#ffffff',
  ok: '#1b7f4b',
  okSoft: '#e4f5ec',
  warn: '#a15c00',
  warnSoft: '#fdf2df',
  gold: '#c79a1c',
  silver: '#8a94a3',
  bronze: '#b0703a',
  scrim: 'rgba(13, 15, 21, 0.45)',
};

export const dark: Colors = {
  bg: '#0d0f15',
  surface: '#161922',
  surface2: '#1e222d',
  fg: '#eceef3',
  fg2: '#c9cdd6',
  muted: '#9aa1b0',
  faint: '#646b7b',
  line: '#2a2f3b',
  segOn: '#303545',
  accent: '#8b8cf6',
  accentFg: '#0d0f15',
  accentSoft: '#25264a',
  danger: '#f07070',
  dangerSoft: '#3a1c1f',
  onDanger: '#0d0f15',
  ok: '#4cc987',
  okSoft: '#15301f',
  warn: '#f0b04a',
  warnSoft: '#362a14',
  gold: '#e6bf4a',
  silver: '#b5bdc9',
  bronze: '#d99a62',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

/** Inter, como la web (los pesos que se cargan en _layout.tsx). */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
} as const;

/** Las medidas de texto del rediseño (index.css: text-hero, text-title, text-body…). */
export const type = {
  hero: { fontSize: 64, lineHeight: 61, letterSpacing: -1.9, fontFamily: font.bold },
  heroSm: { fontSize: 52, lineHeight: 52, letterSpacing: -1.6, fontFamily: font.bold },
  stat: { fontSize: 40, lineHeight: 40, letterSpacing: -1.2, fontFamily: font.bold },
  title: { fontSize: 32, lineHeight: 38, letterSpacing: -1, fontFamily: font.bold },
  cardTitle: { fontSize: 22, lineHeight: 27, letterSpacing: -0.4, fontFamily: font.bold },
  section: { fontSize: 19, lineHeight: 24, letterSpacing: -0.3, fontFamily: font.bold },
  body: { fontSize: 16, lineHeight: 23, fontFamily: font.regular },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontFamily: font.semibold },
  /** El texto de una publicación abierta (text-[17px] leading-relaxed de la web). */
  bodyLarge: { fontSize: 17, lineHeight: 27, fontFamily: font.regular },
  meta: { fontSize: 14, lineHeight: 19, fontFamily: font.regular },
  small: { fontSize: 12.5, lineHeight: 16, fontFamily: font.medium },
} as const;

export const radius = { card: 22, tile: 18, btn: 16, key: 14, pill: 999 } as const;

/** Alto de los botones grandes (Lite) y de las filas tocables (mínimo 44 de Apple). */
export const size = { btn: 56, btnPro: 48, row: 56, touch: 44 } as const;
