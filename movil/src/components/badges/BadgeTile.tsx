import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LEAGUE_TAB } from '@mm/badges/visual/palette';
import type { BadgeLook, BadgeState } from '@mm/badges/visual/types';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Insignia } from './Insignia';

/**
 * La pestaña «LIGA» chiquita (las de la liga a 40 y 64, donde el dibujo no la lleva: §4.6), como LeagueMark de la web.
 * Es solo visual (el nombre accesible ya dice la liga).
 */
export function LeagueMark({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" aria-hidden style={[styles.league, { backgroundColor: LEAGUE_TAB }, style]}>
      <Text style={styles.leagueText}>LIGA</Text>
    </View>
  );
}

/**
 * Una insignia de la grilla (BadgeTile de la web): el dibujo a 64 con su estado, el nombre, el nivel (o «Te faltan 3
 * juegos») y «×N» en las repetibles. Todo el cuadro se toca. `league`: una de la liga, con «LIGA» abajo a la izquierda
 * (arriba a la izquierda va «Nueva»; abajo a la derecha, «×N»).
 */
export function BadgeTile({
  look,
  state = 'unlocked',
  progress,
  name,
  sub,
  count = 1,
  label,
  onOpen,
  pressed,
  league,
}: {
  look: BadgeLook;
  state?: BadgeState;
  progress?: number;
  name: string;
  /** Debajo del nombre: el nivel, «En revisión», «Te faltan 3 juegos». */
  sub?: string | null;
  count?: number;
  /** Nombre accesible del botón. */
  label: string;
  onOpen?: () => void;
  /** Se elige (destacadas). */
  pressed?: boolean;
  /** Es de la liga (del creador o un premio del torneo). */
  league?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={pressed != null ? { selected: pressed } : undefined}
      onPress={onOpen}
      style={({ pressed: down }) => [styles.tile, { backgroundColor: down ? c.surface2 : 'transparent', transform: [{ scale: down ? 0.97 : 1 }] }]}
    >
      <View>
        <Insignia badge={look} size={64} state={state} progress={progress} pad />
        {count > 1 && (
          <View pointerEvents="none" style={[styles.count, { backgroundColor: c.surface, borderColor: c.line }]}>
            <Text style={{ color: c.fg, fontFamily: font.bold, fontSize: 11, lineHeight: 16 }}>×{count}</Text>
          </View>
        )}
        {/* «Nueva» en palabras, no solo el brillo y el punto (§4.7). */}
        {state === 'new' && (
          <View pointerEvents="none" aria-hidden style={[styles.fresh, { backgroundColor: c.accent }]}>
            <Text style={{ color: c.accentFg, fontFamily: font.bold, fontSize: 10, lineHeight: 16 }}>Nueva</Text>
          </View>
        )}
        {league && <LeagueMark style={{ position: 'absolute', bottom: 0, left: -4 }} />}
      </View>
      <Txt numberOfLines={2} style={{ fontSize: 12, lineHeight: 15, fontFamily: font.semibold, textAlign: 'center' }}>
        {name}
      </Txt>
      {!!sub && (
        <Txt tone="muted" numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, textAlign: 'center' }}>
          {sub}
        </Txt>
      )}
    </Pressable>
  );
}

/** Grilla de 4 por fila (`columns` para otra cuenta, como las 3 de «Próximas»). */
export function BadgeGrid({ children, columns = 4 }: { children: ReactNode; columns?: number }) {
  const width = `${100 / columns}%` as const;
  return (
    <View style={styles.grid}>
      {Children.map(children, (child) => (child == null || child === false ? null : <View style={{ width }}>{child}</View>))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 2, paddingVertical: 6, minHeight: 44 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  count: { position: 'absolute', right: -4, bottom: 0, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6 },
  fresh: { position: 'absolute', top: -4, left: -4, borderRadius: 999, paddingHorizontal: 6 },
  league: { borderRadius: 4, paddingHorizontal: 4, borderWidth: 1, borderColor: '#ffffff' },
  leagueText: { color: '#ffffff', fontFamily: font.heavy, fontSize: 9, lineHeight: 14, letterSpacing: 0.4 },
});
