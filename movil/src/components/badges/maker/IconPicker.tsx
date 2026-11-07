/**
 * «Ícono» del editor en la app (IconPicker de la web, §5.4): los 53 curados en 5 pestañas (Deporte, Premios, Esfuerzo,
 * Comunidad, Nuestra tierra) y la búsqueda sin tildes («Busca: trofeo, fuego, cigua…»). Con texto busca en todos; cada
 * botón mide 44. Los íconos son los mismos de la insignia (src/badges/visual/icons.ts), dibujados con react-native-svg.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { BADGE_ICONS, ICON_TABS, searchIcons, type BadgeIconKey, type IconTab } from '@mm/badges/visual/icons';
import { Input, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { IconGlyph } from './parts';

export function IconPicker({ value, onChange }: { value: BadgeIconKey; onChange: (k: BadgeIconKey) => void }) {
  const c = useColors();
  const [tab, setTab] = useState<IconTab>(() => BADGE_ICONS[value]?.tab ?? 'deporte');
  const [q, setQ] = useState('');
  // Si el ícono cambia desde afuera (una plantilla), se abre su pestaña para que se vea marcado.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    if (!q.trim() && BADGE_ICONS[value]) setTab(BADGE_ICONS[value].tab);
  }
  const keys = searchIcons(q, tab);
  const searching = q.trim().length > 0;
  return (
    <View style={{ gap: 8 }}>
      <View>
        <View pointerEvents="none" style={styles.searchIcon}>
          <Search size={16} color={c.muted} />
        </View>
        <Input
          value={q}
          onChangeText={setQ}
          placeholder="Busca: trofeo, fuego, cigua…"
          accessibilityLabel="Buscar ícono"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={{ paddingLeft: 38, height: 48, fontSize: 16 }}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Grupos de íconos" contentContainerStyle={{ gap: 4 }}>
        {ICON_TABS.map((t) => {
          const on = !searching && tab === t.key;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setTab(t.key);
                setQ('');
              }}
              style={({ pressed }) => [styles.tab, { backgroundColor: on ? c.accentSoft : pressed ? c.surface2 : 'transparent' }]}
            >
              <Txt variant="meta" style={{ fontFamily: font.medium, color: on ? c.accent : c.muted }}>
                {t.label}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
      {keys.length ? (
        <View accessibilityLabel={searching ? `Íconos con «${q.trim()}»` : 'Íconos'} style={styles.grid}>
          {keys.map((k) => {
            const on = k === value;
            return (
              <Pressable
                key={k}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={BADGE_ICONS[k].label}
                onPress={() => onChange(k)}
                style={({ pressed }) => [
                  styles.icon,
                  { borderColor: on ? c.accent : 'transparent', backgroundColor: on ? c.accent : pressed ? c.surface2 : 'transparent', transform: [{ scale: pressed ? 0.95 : 1 }] },
                ]}
              >
                <IconGlyph icon={k} color={on ? c.accentFg : c.fg} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 12 }}>
          No encontramos ese ícono. Prueba con «trofeo», «fuego» o «cigua».
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchIcon: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  tab: { minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
});
