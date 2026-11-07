/**
 * El tema de la app: claro u oscuro (el del teléfono, o el que elija la persona) y el color del deporte activo, como
 * la web (src/lib/sportContext.ts + src/lib/theme.ts: brandColors calcula los tonos que se leen en cada modo).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useActiveSport, sportColor } from '@mm/lib/sportContext';
import { brandColors } from '@mm/lib/theme';
import { dark, light, type Colors } from './tokens';

export type ThemeMode = 'system' | 'light' | 'dark';

const MODE_KEY = 'mm:tema-movil';

function readMode(): ThemeMode {
  try {
    const raw = globalThis.localStorage?.getItem(MODE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    return 'system';
  }
}

interface ThemeState {
  colors: Colors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const Ctx = createContext<ThemeState>({ colors: light, isDark: false, mode: 'system', setMode: () => undefined });

/** Los colores con el acento de un deporte (o el morado de MatchMate sin deporte). */
export function colorsFor(isDark: boolean, sport: string | null): Colors {
  const base = isDark ? dark : light;
  const hex = sportColor(sport);
  if (!hex) return base;
  const v = brandColors(hex)[isDark ? 'dark' : 'light'];
  return { ...base, accent: v.accent, accentFg: v.fg, accentSoft: v.soft };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const sport = useActiveSport();
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      if (next === 'system') globalThis.localStorage?.removeItem(MODE_KEY);
      else globalThis.localStorage?.setItem(MODE_KEY, next);
    } catch {
      // Sin almacenamiento: vale mientras la app esté abierta.
    }
  }, []);
  const value = useMemo(() => ({ colors: colorsFor(isDark, sport), isDark, mode, setMode }), [isDark, sport, mode, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Una parte de la app en el color de otro deporte (SportTint/EsportsTint de la web): el acento de `sport` para todo lo
 * de adentro, con el mismo claro u oscuro. Las pantallas de `/esports` van en el violeta de los esports.
 */
export function SportColors({ sport, children }: { sport: string | null; children: ReactNode }) {
  const theme = useContext(Ctx);
  const value = useMemo(() => ({ ...theme, colors: colorsFor(theme.isDark, sport) }), [theme, sport]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
export const useColors = () => useContext(Ctx).colors;
