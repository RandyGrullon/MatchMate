import { View } from 'react-native';
import type { Category } from '@mm/lib/stats';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Letra de la categoría (A–D) según el promedio (CategoryBadge de la web, con sus mismos colores). */
export function CategoryBadge({ value }: { value: Category }) {
  const c = useColors();
  const look = { A: { bg: c.accent, fg: c.accentFg }, B: { bg: c.accentSoft, fg: c.accent }, C: { bg: c.surface2, fg: c.fg }, D: { bg: c.surface2, fg: c.muted } }[value];
  return (
    <View accessible accessibilityLabel={`Categoría ${value}`} style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: look.bg }}>
      <Txt style={{ fontSize: 11, lineHeight: 14, fontFamily: font.bold, color: look.fg }}>{value}</Txt>
    </View>
  );
}
