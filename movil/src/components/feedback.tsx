/**
 * Avisos cortos abajo de la pantalla («Guardado en tu teléfono…») y la pregunta de confirmar (¿Enviar?). Como
 * `useFeedback` de la web (src/components/feedback.tsx), sin depender de un proveedor: se llaman desde cualquier lado.
 */
import { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { useColors } from '@/theme/theme';
import { Txt } from './ui';

type Tone = 'ok' | 'error';
interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

let current: Toast | null = null;
let seq = 0;
const listeners = new Set<(t: Toast | null) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function toast(text: string, tone: Tone = 'ok') {
  current = { id: ++seq, text, tone };
  listeners.forEach((l) => l(current));
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    listeners.forEach((l) => l(null));
  }, tone === 'error' ? 4500 : 3000);
}

/** Va una vez en la raíz (_layout.tsx). */
export function ToastHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<Toast | null>(current);
  useEffect(() => {
    listeners.add(setT);
    // Un aviso que salió antes de que esto escuchara (los efectos de las pantallas corren antes que los de la raíz).
    setT(current);
    return () => {
      listeners.delete(setT);
    };
  }, []);
  if (!t) return null;
  const Icon = t.tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 76 }]}>
      <Animated.View
        key={t.id}
        entering={FadeInDown.duration(180)}
        exiting={FadeOutDown.duration(160)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: c.fg }]}
      >
        <Icon size={18} color={t.tone === 'error' ? c.danger : c.ok} />
        <Txt variant="meta" style={{ color: c.bg, flex: 1 }}>
          {t.text}
        </Txt>
      </Animated.View>
    </View>
  );
}

/** ¿Seguro? Con el aviso del sistema en el teléfono; en la vista previa web, el `confirm` del navegador. */
export function confirmAsync({ title, message, confirmText, danger }: { title: string; message?: string; confirmText: string; danger?: boolean }): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.([title, message].filter(Boolean).join('\n\n')) ?? false);
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: danger ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 480, width: '100%' },
});
