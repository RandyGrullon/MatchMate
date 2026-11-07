import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useColors } from '@/theme/theme';
import { Txt } from '../ui';

/**
 * La hoja del creador de bolas: la misma Sheet de ui.tsx (título, línea de abajo, la X, lo de adentro con
 * desplazamiento y el pie fijo), con dos cosas que la del creador de la web tiene y la de la app no: `top`, lo que se
 * queda arriba al bajar (la bola grande, como su `sticky top-0`), y que mientras se arrastra un control (useScrollLock)
 * lo de adentro no se desplaza, así el dedo mueve el control y no la hoja.
 */

const ScrollLock = createContext<(locked: boolean) => void>(() => undefined);

/** Para los controles que se arrastran: `lock(true)` al tocarlos y `lock(false)` al soltarlos. */
export const useScrollLock = () => useContext(ScrollLock);

/**
 * ¿Está el teclado abierto? Con él, la bola deja de quedarse arriba (taparía lo que se escribe), como en la web.
 */
export function useKeyboardOpen(): boolean {
  // La vista previa web no tiene Keyboard.isVisible.
  const [open, setOpen] = useState(() => Keyboard.isVisible?.() ?? false);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

export function DesignerSheet({
  title,
  subtitle,
  onClose,
  top,
  children,
  footer,
}: {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  /** Lo que se queda arriba, fuera del desplazamiento. */
  top?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [locked, setLocked] = useState(false);
  return (
    // Se monta abierta (la pantalla la quita al cerrar), como el creador de la web.
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        <Animated.View entering={SlideInDown.duration(240)} style={[styles.sheet, { backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="cardTitle" accessibilityRole="header" numberOfLines={2}>
                {title}
              </Txt>
              {!!subtitle && (
                <Txt variant="meta" tone="muted" numberOfLines={1}>
                  {subtitle}
                </Txt>
              )}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={8} onPress={onClose} style={[styles.close, { backgroundColor: c.surface2 }]}>
              <X size={20} color={c.fg} />
            </Pressable>
          </View>
          {top != null && <View style={{ paddingTop: 16 }}>{top}</View>}
          <ScrollLock.Provider value={setLocked}>
            <ScrollView scrollEnabled={!locked} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 16, paddingVertical: 16 }}>
              {children}
            </ScrollView>
          </ScrollLock.Provider>
          {footer}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, maxHeight: '90%' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
