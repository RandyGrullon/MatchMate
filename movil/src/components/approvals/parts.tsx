/**
 * Piezas de aprobar envíos en el teléfono, las mismas en «Por aprobar» del evento (bowling/ApprovalCard.tsx) y en
 * Organizar › Aprobar juegos (ApprovalsPanel.tsx): los botones de cada fila, la foto en chiquito, la foto en grande y
 * la hoja de «Rechazar envío».
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Camera, ImageOff, X, ZoomIn, ZoomOut } from 'lucide-react-native';
import { saveErrorMessage } from '@mm/lib/errorText';
import { usePhoto } from '@mm/lib/photos';
import { toast } from '@/components/feedback';
import { Button, Field, Input, Loading, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Lo que hace la web con useAction: corre lo pedido y, si falla, avisa con el mensaje de siempre; `ok`, el aviso. */
export async function act<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (ok) toast(ok);
    return r;
  } catch (e) {
    toast(saveErrorMessage(e), 'error');
    return undefined;
  }
}

/**
 * Los botones de cada fila (Rechazar con contorno, Aprobar en el color del deporte, suave): se ven de 36 px y se tocan en
 * 44. Mientras espera, la ruedita al lado del texto o, con `over`, en lugar del texto (el botón no cambia de ancho).
 */
export function RowButton({
  children,
  label,
  accent,
  disabled,
  busy,
  over,
  onPress,
}: {
  children: string;
  label: string;
  accent?: boolean;
  disabled?: boolean;
  busy?: boolean;
  over?: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  const color = accent ? c.accent : c.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || (over && busy)}
      hitSlop={{ top: 4, bottom: 4 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowButton,
        accent ? { backgroundColor: c.accentSoft } : { borderWidth: 1.5, borderColor: c.line },
        { opacity: disabled && !busy ? (over ? 0.5 : 0.6) : pressed ? 0.8 : 1 },
      ]}
    >
      {busy && !over ? <ActivityIndicator size="small" color={color} /> : null}
      <Txt style={{ fontFamily: font.semibold, fontSize: 13.5, color, opacity: busy && over ? 0 : 1 }}>{children}</Txt>
      {busy && over ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator size="small" color={color} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * La foto del marcador en chiquito (40 px). Con `onOpen` se toca para verla en grande; sin foto, el ícono (en amarillo
 * con `warn`: la liga la exige). Sin `onOpen`, mientras carga, la cámara.
 */
export function PhotoThumb({ lid, photoId, name, warn, onOpen }: { lid: string; photoId: string | null; name?: string; warn?: boolean; onOpen?: () => void }) {
  const c = useColors();
  const photo = usePhoto(lid, photoId);
  if (!photoId || (!onOpen && !photo.data && !photo.loading)) {
    return (
      <View accessible={!!onOpen} accessibilityLabel={onOpen ? 'Sin foto' : undefined} style={[styles.thumb, { backgroundColor: warn ? c.warnSoft : c.surface2 }]}>
        <ImageOff size={18} color={warn ? c.warn : c.faint} />
      </View>
    );
  }
  if (!onOpen) {
    return (
      <View style={[styles.thumb, { backgroundColor: c.surface2, overflow: 'hidden' }]}>
        {photo.data ? <Image source={{ uri: photo.data.url }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Camera size={18} color={c.faint} />}
      </View>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver la foto de ${name ?? ''}`} onPress={onOpen} style={[styles.thumb, { backgroundColor: '#1f2330', overflow: 'hidden' }]}>
      {photo.data && <Image source={{ uri: photo.data.url }} style={StyleSheet.absoluteFill} contentFit="cover" />}
    </Pressable>
  );
}

/** La foto en grande (PhotoModal de la web). */
export function PhotoSheet({ lid, photo, onClose }: { lid: string; photo: { id: string; title: string } | null; onClose: () => void }) {
  const data = usePhoto(lid, photo?.id ?? null);
  const img = data.data;
  return (
    <Sheet open={photo != null} onClose={onClose} title={photo?.title ?? 'Foto'}>
      {img ? (
        <Image
          source={{ uri: img.url }}
          accessibilityLabel={photo?.title ?? 'Foto del marcador'}
          style={{ width: '100%', aspectRatio: img.width && img.height ? img.width / img.height : 3 / 4, borderRadius: 12 }}
          contentFit="contain"
        />
      ) : data.loading ? (
        <Loading />
      ) : (
        <Txt tone="muted">{data.error ? 'No se pudo cargar la foto. Revisa tu conexión e intenta de nuevo.' : 'La foto ya no existe.'}</Txt>
      )}
    </Sheet>
  );
}

/**
 * La foto del marcador abierta en el envío (PhotoView de la web): se toca (o «Acercar») para verla más grande y moverla
 * con el dedo; «Alejar» la vuelve a su tamaño.
 */
export function PhotoZoom({ uri, width, height }: { uri: string; width: number | null; height: number | null }) {
  const [zoom, setZoom] = useState(false);
  const [box, setBox] = useState(0);
  const win = useWindowDimensions();
  const ratio = width && height ? width / height : 4 / 3;
  const big = box * 2.2;
  const toggle = () => setZoom((z) => !z);
  return (
    <View onLayout={(e) => setBox(e.nativeEvent.layout.width)} style={styles.zoomBox}>
      {zoom && box > 0 ? (
        <ScrollView style={{ maxHeight: win.height * 0.7 }} nestedScrollEnabled>
          <ScrollView horizontal nestedScrollEnabled>
            <Pressable accessibilityRole="button" accessibilityLabel="Foto del marcador" onPress={toggle}>
              <Image source={{ uri }} style={{ width: big, height: big / ratio }} contentFit="contain" />
            </Pressable>
          </ScrollView>
        </ScrollView>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel="Foto del marcador" onPress={toggle}>
          <Image source={{ uri }} style={{ width: '100%', aspectRatio: ratio, maxHeight: win.height * 0.6 }} contentFit="contain" />
        </Pressable>
      )}
      <Pressable accessibilityRole="button" onPress={toggle} hitSlop={8} style={styles.zoomButton}>
        {zoom ? <ZoomOut size={14} color="#fff" /> : <ZoomIn size={14} color="#fff" />}
        <Txt style={{ color: '#fff', fontSize: 12, fontFamily: font.medium }}>{zoom ? 'Alejar' : 'Acercar'}</Txt>
      </Pressable>
    </View>
  );
}

/** «Rechazar envío» con el motivo (lo verá el jugador). `icon`: la X en el botón, como en Organizar › Aprobar. */
export function RejectSheet({
  open,
  note,
  onNote,
  onClose,
  onReject,
  icon,
}: {
  open: boolean;
  note: string;
  onNote: (v: string) => void;
  onClose: () => void;
  onReject: () => void;
  icon?: boolean;
}) {
  const c = useColors();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Rechazar envío"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="danger" icon={icon ? <X size={18} color={c.onDanger} /> : undefined} onPress={onReject} style={{ flex: 1 }}>
            Rechazar
          </Button>
        </View>
      }
    >
      <Field label="Motivo (lo verá el jugador)">
        <Input value={note} maxLength={500} onChangeText={onNote} placeholder="Ej. la foto no se lee" />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  thumb: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowButton: { height: 36, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  center: { alignItems: 'center', justifyContent: 'center' },
  zoomBox: { borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.8)' },
  zoomButton: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4 },
});
