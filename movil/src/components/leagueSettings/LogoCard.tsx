import { useState } from 'react';
import { View } from 'react-native';
import { Camera, ImageUp, Trash2 } from 'lucide-react-native';
import { useLeagueCtx } from '@mm/lib/league';
import { logoErrorText, removeLeagueLogo, uploadLeagueLogo } from '@mm/lib/logos';
import { LOGO_REMOVED_TEXT, logoButtonLabel, logoDoneText, logoHint, removeLogoConfirm } from '@mm/components/league/settings';
import { confirmAsync, toast } from '@/components/feedback';
import { Button, Card, Txt } from '@/components/ui';
import type { PhotoSource } from '@/lib/pickImage';
import { useColors } from '@/theme/theme';
import { LeagueMark } from './LeagueMark';
import { pickLogo } from './logoImage';

/**
 * El logo de la liga o del torneo (LogoCard de la web): cómo se ve, «Subir logo» o «Cambiar» de la galería (o tomarlo
 * con la cámara; se recorta al cuadrado del centro y se comprime en el teléfono) y «Quitar» (vuelve el ícono del
 * deporte). Necesita señal.
 */
export function LogoCard() {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = league.kind ?? 'liga';
  const has = !!league.logoPath;

  async function upload(source: PhotoSource) {
    if (busy) return;
    setError(null);
    let logo;
    try {
      logo = await pickLogo(source);
    } catch (e) {
      setError(logoErrorText(e, kind));
      return;
    }
    if (!logo) return;
    setBusy('upload');
    try {
      await uploadLeagueLogo(lid, logo);
      toast(logoDoneText(has));
    } catch (e) {
      setError(logoErrorText(e, kind));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!(await confirmAsync(removeLogoConfirm(kind)))) return;
    setBusy('remove');
    setError(null);
    try {
      await removeLeagueLogo(lid);
      toast(LOGO_REMOVED_TEXT);
    } catch (e) {
      setError(logoErrorText(e, kind));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 12, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <LeagueMark league={league} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" accessibilityRole="header">
            Logo
          </Txt>
          <Txt variant="meta" tone="muted">
            {logoHint(has, kind)}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button
          variant={has ? 'secondary' : 'primary'}
          loading={busy === 'upload'}
          disabled={!!busy}
          icon={<ImageUp size={18} color={has ? c.fg : c.accentFg} />}
          onPress={() => void upload('library')}
        >
          {logoButtonLabel(busy === 'upload', has)}
        </Button>
        <Button variant="secondary" accessibilityLabel="Tomar una foto" disabled={!!busy} icon={<Camera size={18} color={c.fg} />} onPress={() => void upload('camera')} />
        {has && (
          <Button variant="ghost" loading={busy === 'remove'} disabled={!!busy} icon={<Trash2 size={18} color={c.fg} />} onPress={() => void remove()}>
            Quitar
          </Button>
        )}
      </View>
      {!!error && (
        <Txt variant="meta" tone="danger" accessibilityRole="alert">
          {error}
        </Txt>
      )}
    </Card>
  );
}
