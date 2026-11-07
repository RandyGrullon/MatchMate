/**
 * «Logo (opcional)» de un equipo de esports (TeamLogoField de teams/CreateTeamSheet.tsx en la web): la vista previa (el
 * elegido, el de ahora o un cuadro vacío), «Elegir logo» o «Cambiar» (galería) con la cámara al lado, y «Quitar». Se
 * recorta al cuadrado del centro y se comprime al elegirlo (`pickSquadLogo`, con src/lib/pickImage.ts: el mismo logo de
 * los equipos, en JPEG); se sube después (al crear o al guardar) con `uploadTeamLogo`.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, ImagePlus, ImageUp, X } from 'lucide-react-native';
import { logoErrorText } from '@mm/lib/logos';
import type { PhotoSource } from '@/lib/pickImage';
import { pickSquadLogo, type PickedLogo } from '../squads/logo';
import { Button, Txt } from '../ui';
import { TeamLogo } from './bits';
import { useColors } from '@/theme/theme';

export type { PickedLogo };

export function TeamLogoField({
  value,
  onChange,
  name,
  tag,
  current = null,
  removed = false,
  onRemove,
}: {
  value: PickedLogo | null;
  onChange: (logo: PickedLogo | null) => void;
  name: string;
  tag: string;
  current?: string | null;
  removed?: boolean;
  onRemove?: (removed: boolean) => void;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showCurrent = !value && !removed && !!current;

  async function pick(source: PhotoSource) {
    setBusy(true);
    setError(null);
    try {
      const picked = await pickSquadLogo(source);
      if (picked) {
        onChange(picked);
        onRemove?.(false);
      }
    } catch (e) {
      setError(logoErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Txt variant="bodyStrong" tone="fg2">
        Logo (opcional)
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: c.surface2, padding: 12 }}>
        {value ? (
          <Image source={{ uri: value.preview }} accessibilityIgnoresInvertColors style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.surface }} contentFit="cover" />
        ) : showCurrent ? (
          <TeamLogo path={current} name={name} tag={tag} size={56} />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
            <ImagePlus size={24} color={c.muted} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button loading={busy} icon={<ImageUp size={16} color={c.fg} />} onPress={() => void pick('library')} style={{ backgroundColor: c.surface }}>
            {busy ? 'Preparando…' : value || showCurrent ? 'Cambiar' : 'Elegir logo'}
          </Button>
          {!busy && <Button accessibilityLabel="Tomar una foto" icon={<Camera size={16} color={c.fg} />} onPress={() => void pick('camera')} style={{ backgroundColor: c.surface }} />}
          {(value || showCurrent) && !busy && (
            <Button
              variant="ghost"
              icon={<X size={16} color={c.fg} />}
              onPress={() => {
                if (value) onChange(null);
                else onRemove?.(true);
              }}
            >
              Quitar
            </Button>
          )}
        </View>
      </View>
      {error ? (
        <Txt variant="meta" tone="danger" accessibilityRole="alert">
          {error}
        </Txt>
      ) : (
        <Txt variant="meta" tone="muted">
          Se recorta al cuadrado del centro. Es una imagen pública.
        </Txt>
      )}
    </View>
  );
}
