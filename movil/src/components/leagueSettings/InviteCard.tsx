import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, QrCode as QrIcon, RefreshCw, Share2, Ticket, UserPlus } from 'lucide-react-native';
import { getInviteCode, renewInviteCode } from '@mm/lib/data';
import { shareOrigin } from '@mm/lib/origin';
import type { League } from '@mm/lib/types';
import { codeInviteUrl, inviteShareText } from '@mm/components/invite/logic';
import { RENEW_CODE_CONFIRM, inviteCardText, renewDoneText } from '@mm/components/league/settings';
import { QrCode } from '@/components/invite/QrCode';
import { confirmAsync, toast } from '@/components/feedback';
import { LogoSpinner } from '@/components/Logo';
import { runAction } from '@/components/swimming/parts';
import { Button, Card, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type Busy = 'cambiar' | 'compartir' | 'codigo';

/**
 * La invitación en los ajustes (InviteCard de la web, solo el dueño y los admins): «Invitar personas» (la hoja de
 * invitar con las cuentas de la app, todavía en la web), el código, compartir el link, copiar el código, el QR y
 * cambiar el código (el anterior deja de servir).
 */
export function InviteCard({ league }: { league: League }) {
  const c = useColors();
  // undefined: buscando; null: sin código.
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let alive = true;
    getInviteCode(league.id)
      .then((v) => alive && setCode(v))
      .catch(() => alive && setCode(null));
    return () => {
      alive = false;
    };
  }, [league.id]);

  async function wait(what: Busy, fn: () => Promise<unknown>) {
    setBusy(what);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function renew() {
    if (code && !(await confirmAsync(RENEW_CODE_CONFIRM))) return;
    await wait('cambiar', async () => {
      const next = await runAction(() => renewInviteCode(league), renewDoneText(!!code));
      if (next) setCode(next);
    });
  }

  // Con el dominio de la app (no el de la vista previa): es el link que abre la app en el teléfono de quien lo recibe.
  const url = code ? codeInviteUrl(shareOrigin(null), code) : '';

  return (
    <Card style={{ gap: 16, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
          <Ticket size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" accessibilityRole="header">
            Invitar a la liga
          </Txt>
          <Txt variant="meta" tone="muted">
            {inviteCardText(league.visibility)}
          </Txt>
        </View>
      </View>

      <Button full icon={<UserPlus size={18} color={c.fg} />} onPress={() => void openOnWeb(`/l/${league.id}/admin?tab=liga`)}>
        Invitar personas
      </Button>

      {code === undefined ? (
        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
          <LogoSpinner size={28} label="Preparando la invitación" />
        </View>
      ) : !code ? (
        <Button variant="primary" full loading={busy === 'cambiar'} icon={<Ticket size={18} color={c.accentFg} />} onPress={() => void renew()}>
          Crear invitación
        </Button>
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: 2, borderRadius: 14, paddingVertical: 12, backgroundColor: c.surface2 }}>
            <Txt variant="small" tone="muted">
              Código
            </Txt>
            <Txt selectable style={{ fontFamily: font.bold, fontSize: 24, lineHeight: 30, letterSpacing: 6 }}>
              {code}
            </Txt>
          </View>
          {showQr && (
            <View style={{ alignItems: 'center', borderRadius: 14, padding: 12, backgroundColor: '#ffffff' }}>
              <QrCode value={url} size={208} />
            </View>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Button
                variant="primary"
                full
                icon={<Share2 size={18} color={c.accentFg} />}
                loading={busy === 'compartir'}
                disabled={!!busy}
                onPress={() =>
                  wait('compartir', async () => {
                    try {
                      await Share.share({ message: `${inviteShareText(league.name)}\n${url}`, url });
                    } catch {
                      toast('No se pudo compartir.', 'error');
                    }
                  })
                }
              >
                Compartir
              </Button>
            </View>
            <View style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Button
                full
                icon={<Copy size={18} color={c.fg} />}
                loading={busy === 'codigo'}
                disabled={!!busy}
                onPress={() =>
                  wait('codigo', async () => {
                    await Clipboard.setStringAsync(code);
                    toast('Código copiado');
                  })
                }
              >
                Código
              </Button>
            </View>
            <View style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Button full icon={<QrIcon size={18} color={c.fg} />} onPress={() => setShowQr((s) => !s)}>
                {showQr ? 'Ocultar QR' : 'QR'}
              </Button>
            </View>
            <View style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Button full icon={<RefreshCw size={18} color={c.fg} />} loading={busy === 'cambiar'} disabled={!!busy} onPress={() => void renew()}>
                Cambiar
              </Button>
            </View>
          </View>
        </>
      )}
    </Card>
  );
}
