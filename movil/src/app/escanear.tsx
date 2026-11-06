import { useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, Flashlight, Keyboard, X } from 'lucide-react-native';
import { codeReady, normalizeCode, routeFromScan } from '@mm/components/scanner/logic';
import { APP_ORIGIN, OLD_ORIGINS } from '@mm/lib/origin';
import { Txt } from '@/components/ui';
import { appRoute } from '@/lib/links';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Los links de la app que se aceptan (el dominio y las direcciones viejas: sus QR impresos se siguen leyendo). */
const ORIGINS = [APP_ORIGIN, ...OLD_ORIGINS];
const HINT = 'Apunta al código de la liga, equipo o invitación';

/** Lo que dice la falta de permiso en el teléfono (problemCopy de la web, la parte de «la app instalada»). */
const deniedBody = () =>
  Platform.OS === 'ios'
    ? 'Ve a Ajustes › MatchMate › Cámara. Mientras, puedes escribir el código.'
    : 'Mantén presionado el ícono de MatchMate › Información de la app › Permisos › Cámara. Mientras, puedes escribir el código.';

/**
 * Escanear el QR (el lector de la web, src/components/scanner/QrScanner.tsx): la cámara a pantalla completa con
 * «Apunta al código de la liga, equipo o invitación». Un link de MatchMate o un código de invitación abre su pantalla
 * (routeFromScan, la misma lógica de la web); otra cosa no se abre nunca sola: «Ese QR no es de MatchMate» con lo que
 * dice, «Copiar» y «Escanear otro». Abajo, «Escribir el código». Arriba, cerrar y la linterna.
 */
export default function ScanScreen() {
  const c = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [foreign, setForeign] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState('');
  // Una sola lectura a la vez (la cámara manda el mismo código muchas veces por segundo).
  const handled = useRef<string | null>(null);

  function go(path: string) {
    const route = appRoute(path);
    if (route) router.replace(route as never);
    else {
      router.back();
      void openOnWeb(path);
    }
  }

  function onScan(data: string) {
    if (!data || handled.current === data || typing) return;
    handled.current = data;
    const r = routeFromScan(data, ORIGINS);
    if (r.kind === 'app') go(r.path);
    else {
      setCopied(false);
      setForeign(r.text);
    }
  }

  function rescan() {
    setForeign(null);
    setCopied(false);
    // El que se descartó no vuelve a salir enseguida; uno nuevo sí.
    setTimeout(() => (handled.current = null), 1500);
  }

  const ready = codeReady(code);
  const submitCode = () => ready && go(`/unirse/${normalizeCode(code)}`);
  const denied = permission && !permission.granted;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {permission?.granted && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={foreign ? undefined : (r) => onScan(r.data)}
        />
      )}

      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={() => router.back()} style={styles.round}>
          <X size={22} color="#fff" />
        </Pressable>
        {permission?.granted && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Linterna"
            accessibilityState={{ selected: torch }}
            onPress={() => setTorch((t) => !t)}
            style={[styles.round, torch && { backgroundColor: '#fff' }]}
          >
            <Flashlight size={20} color={torch ? '#000' : '#fff'} />
          </Pressable>
        )}
      </View>

      {!foreign && !typing && permission?.granted && <View pointerEvents="none" style={[styles.frame, { borderColor: c.accent }]} />}

      <View style={styles.bottom}>
        {denied ? (
          <View style={styles.glass}>
            <Txt style={styles.h3}>Falta el permiso de la cámara</Txt>
            <Txt style={styles.dim}>{deniedBody()}</Txt>
            <Pressable
              accessibilityRole="button"
              onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
              style={[styles.pill, { backgroundColor: c.accent, marginTop: 12 }]}
            >
              <Txt style={[styles.pillText, { color: c.accentFg }]}>{permission.canAskAgain ? 'Intentar de nuevo' : 'Abrir ajustes'}</Txt>
            </Pressable>
          </View>
        ) : foreign ? (
          <View style={styles.glass} accessibilityLiveRegion="polite">
            <Txt style={styles.h3}>Ese QR no es de MatchMate</Txt>
            <Txt style={styles.dim}>No lo abrimos. Esto es lo que dice:</Txt>
            <Txt numberOfLines={3} style={styles.mono}>
              {foreign}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Pressable
                accessibilityRole="button"
                onPress={async () => {
                  await Clipboard.setStringAsync(foreign);
                  setCopied(true);
                }}
                style={[styles.pill, { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)' }]}
              >
                {copied ? <Check size={18} color="#fff" /> : <Copy size={18} color="#fff" />}
                <Txt style={styles.pillText}>{copied ? 'Copiado' : 'Copiar'}</Txt>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={rescan} style={[styles.pill, { flex: 1, backgroundColor: c.accent }]}>
                <Txt style={[styles.pillText, { color: c.accentFg }]}>Escanear otro</Txt>
              </Pressable>
            </View>
          </View>
        ) : typing ? (
          <View style={styles.glass}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt style={styles.h3}>Escribe el código</Txt>
              <Pressable accessibilityRole="button" accessibilityLabel="Volver a la cámara" onPress={() => setTyping(false)} hitSlop={8}>
                <X size={20} color="rgba(255,255,255,0.8)" />
              </Pressable>
            </View>
            <Txt style={styles.dim}>
              Son 8 letras y números, como <Txt style={{ color: '#fff', fontFamily: font.bold }}>ABCD2345</Txt>.
            </Txt>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TextInput
                autoFocus
                accessibilityLabel="Código de invitación"
                placeholder="CÓDIGO"
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={12}
                returnKeyType="go"
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                onSubmitEditing={submitCode}
                style={styles.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready }}
                disabled={!ready}
                onPress={submitCode}
                style={[styles.pill, { width: 96, backgroundColor: c.accent, opacity: ready ? 1 : 0.5 }]}
              >
                <Txt style={[styles.pillText, { color: c.accentFg }]}>Unirme</Txt>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Txt style={[styles.pillText, { textAlign: 'center', marginBottom: 12 }]} accessibilityLiveRegion="polite">
              {permission?.granted ? HINT : 'Abriendo la cámara…'}
            </Txt>
            <Pressable accessibilityRole="button" onPress={() => setTyping(true)} style={[styles.pill, { alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 18 }]}>
              <Keyboard size={19} color="#fff" />
              <Txt style={styles.pillText}>Escribir el código</Txt>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 52, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  frame: { position: 'absolute', top: '28%', alignSelf: 'center', width: 240, height: 240, borderRadius: 28, borderWidth: 3 },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 40 },
  glass: { borderRadius: 26, padding: 16, backgroundColor: 'rgba(20,22,30,0.82)' },
  h3: { color: '#fff', fontFamily: font.bold, fontSize: 17 },
  dim: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 4 },
  mono: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 10, borderRadius: 12, padding: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  pill: { height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  pillText: { color: '#fff', fontFamily: font.semibold, fontSize: 15 },
  input: { flex: 1, height: 48, borderRadius: 14, paddingHorizontal: 14, color: '#fff', fontFamily: font.bold, fontSize: 18, letterSpacing: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
});
