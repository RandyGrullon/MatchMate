/**
 * Invitar a una liga (el último paso de crear y la invitación de la liga en la web): el QR y el código, «Compartir
 * link» (la hoja de compartir del teléfono) y «Copiar código». Si la liga no tiene código, «Crear invitación». Quien no
 * es admin (miembro de una liga pública) comparte el link de la liga (inviteLink de la web).
 */
import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, Share2 } from 'lucide-react-native';
import { getInviteCode, renewInviteCode } from '@mm/lib/data';
import { saveErrorMessage } from '@mm/lib/errorText';
import { shareOrigin } from '@mm/lib/origin';
import { codeInviteUrl, inviteLink, inviteShareText } from '@mm/components/invite/logic';
import { QrCode } from './QrCode';
import { toast } from '../feedback';
import { Button, Card, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';

export function InvitePanel({ lid, name, isAdmin = true }: { lid: string; name: string; isAdmin?: boolean }) {
  // undefined: buscando; null: sin código.
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    getInviteCode(lid)
      .then((v) => alive && setCode(v))
      .catch(() => alive && setCode(null));
    return () => {
      alive = false;
    };
  }, [lid, isAdmin]);

  if (!isAdmin) {
    const link = inviteLink({ lid, isAdmin: false, code: null, origin: shareOrigin(null) });
    return link.kind === 'url' ? <LinkPanel url={link.url} name={name} /> : null;
  }
  if (code === undefined) {
    return (
      <View style={{ paddingVertical: 40, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Preparando la invitación" />
      </View>
    );
  }
  if (!code) {
    return (
      <Card style={{ alignItems: 'center', gap: 12 }}>
        <Txt variant="meta" tone="muted">
          Todavía no hay código para entrar.
        </Txt>
        <Button
          variant="primary"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              setCode(await renewInviteCode({ id: lid }));
              toast('Invitación creada');
            } catch (e) {
              toast(saveErrorMessage(e), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Crear invitación
        </Button>
      </Card>
    );
  }
  // Con el dominio de la app (no el de la vista previa): es el link que abre la app en el teléfono de quien lo recibe.
  return <LinkPanel url={codeInviteUrl(shareOrigin(null), code)} name={name} code={code} />;
}

/** El QR del link, el código (si hay), «Compartir link» y «Copiar código» (o «Copiar link»). */
function LinkPanel({ url, name, code }: { url: string; name: string; code?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: 'center', borderRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, backgroundColor: c.surface }}>
        <View style={{ borderRadius: 16, backgroundColor: '#ffffff', padding: 8 }}>
          <QrCode value={url} />
        </View>
        {code && (
          <>
            <Txt variant="meta" tone="muted" style={{ marginTop: 16 }}>
              Código
            </Txt>
            <Txt selectable style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: 3 }}>
              {code}
            </Txt>
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button
            full
            icon={<Share2 size={18} color={c.fg} />}
            onPress={async () => {
              try {
                await Share.share({ message: `${inviteShareText(name)}\n${url}`, url });
              } catch {
                toast('No se pudo compartir.', 'error');
              }
            }}
          >
            Compartir link
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            full
            icon={<Copy size={18} color={c.fg} />}
            onPress={async () => {
              await Clipboard.setStringAsync(code ?? url);
              toast(code ? 'Código copiado' : 'Link copiado');
            }}
          >
            {code ? 'Copiar código' : 'Copiar link'}
          </Button>
        </View>
      </View>
    </View>
  );
}
