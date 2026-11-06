import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import { timeFromDigits } from '@mm/sports/swimming';
import { keypadPress, keypadText } from '@mm/pages/sports/swimming/timing';
import { Button, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/**
 * Teclado mm:ss.hh para los tiempos de los cronómetros físicos (TimeKeypad de la web): las cifras se llenan desde la
 * derecha («2845» = 28.45). Guardar lo pone; «Sin tiempo» lo borra. Se abre con las cifras en blanco.
 */
export function TimeKeypad({
  open,
  title,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: number | null;
  onClose: () => void;
  onSave: (cs: number | null) => void;
}) {
  // Se monta de nuevo cada vez que se abre (las cifras empiezan en blanco, como la web).
  return (
    <Sheet open={open} onClose={onClose} title={title} subtitle="2845 = 28.45 · 10532 = 1:05.32">
      {open && <Keys initial={initial} onClose={onClose} onSave={onSave} />}
    </Sheet>
  );
}

function Keys({ initial, onClose, onSave }: { initial: number | null; onClose: () => void; onSave: (cs: number | null) => void }) {
  const c = useColors();
  const [digits, setDigits] = useState('');
  const cs = digits ? timeFromDigits(digits) : null;
  const shown = keypadText(digits, initial);
  const press = (d: string) => setDigits((x) => keypadPress(x, d));
  const key = (label: string, onPress: () => void, aria?: string, small?: boolean) => (
    <Pressable
      key={aria ?? label}
      accessibilityRole="button"
      accessibilityLabel={aria ?? label}
      onPress={onPress}
      style={({ pressed }) => [styles.key, { backgroundColor: c.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
    >
      <Txt style={{ fontFamily: font.bold, fontSize: small ? 18 : 26, color: small ? c.muted : c.fg }}>{label}</Txt>
    </Pressable>
  );
  return (
    <View style={{ gap: 16 }}>
      <Txt
        accessibilityLiveRegion="polite"
        style={{ textAlign: 'center', fontFamily: font.bold, fontSize: 52, lineHeight: 58, fontVariant: ['tabular-nums'], color: digits && !cs ? c.danger : !digits ? c.muted : c.fg }}
      >
        {shown}
      </Txt>
      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => press(d)))}
        {key('C', () => setDigits(''), 'Borrar todo', true)}
        {key('0', () => press('0'))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar una cifra"
          onPress={() => setDigits((x) => x.slice(0, -1))}
          style={({ pressed }) => [styles.key, { backgroundColor: c.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
        >
          <Delete size={24} color={c.fg} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button size="lg" onPress={() => onSave(null)}>
          Sin tiempo
        </Button>
        <Button variant="primary" size="lg" disabled={!!digits && !cs} onPress={() => (digits ? cs && onSave(cs) : onClose())} style={{ flex: 1 }}>
          Guardar
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  key: { width: '31.5%', flexGrow: 1, height: 64, borderRadius: radius.key, alignItems: 'center', justifyContent: 'center' },
});
