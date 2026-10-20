import { View } from 'react-native';
import { router } from 'expo-router';
import { Download, FileText, Globe, LogOut, Moon, Shield, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { accountErrorMessage } from '@mm/pages/legal/account';
import { NotificationsCard } from '@/components/account/NotificationsCard';
import { toast } from '@/components/feedback';
import { shareMyData } from '@/lib/myData';
import { displayName, logout, useAuth } from '@mm/lib/auth';
import { unsubscribePush } from '@mm/lib/push';
import { Button, Card, Divider, ListRow, Loading, RowIcon, Screen, SectionHeader, Segmented, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors, useTheme, type ThemeMode } from '@/theme/theme';

/** Yo: la cuenta, la apariencia, lo legal y salir (Yo y Configuración de la web). */
export default function YoScreen() {
  const auth = useAuth();
  const c = useColors();
  const { mode, setMode } = useTheme();
  const [exporting, setExporting] = useState(false);
  if (auth.loading) return <Loading />;
  if (!auth.user) {
    return (
      <Screen>
        <Txt variant="title">Yo</Txt>
        <Card style={{ gap: 12 }}>
          <Txt variant="cardTitle">Entra a MatchMate</Txt>
          <Txt tone="fg2">Con tu cuenta ves tus ligas, anotas tus juegos y recibes los avisos.</Txt>
          <Button variant="primary" size="xl" full onPress={() => router.push('/login')}>
            Entrar
          </Button>
        </Card>
      </Screen>
    );
  }
  const uid = auth.user.uid;
  const name = displayName(auth);
  const username = auth.profile?.username;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="cardTitle" tone="accent">
            {name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w.charAt(0).toUpperCase())
              .join('')}
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="cardTitle" numberOfLines={1}>
            {name}
          </Txt>
          <Txt variant="meta" tone="muted" numberOfLines={1}>
            {[username ? `@${username}` : null, auth.user.email].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      </View>

      <SectionHeader title="Apariencia" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Moon size={18} color={c.muted} />
          <Txt tone="fg2">El color es el de tu deporte.</Txt>
        </View>
        <Segmented<ThemeMode>
          label="Apariencia"
          value={mode}
          onChange={setMode}
          options={[
            { key: 'system', label: 'Auto' },
            { key: 'light', label: 'Claro' },
            { key: 'dark', label: 'Oscuro' },
          ]}
        />
      </Card>

      <NotificationsCard />

      <SectionHeader title="Más" />
      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <Globe size={20} color={c.accent} />
            </RowIcon>
          }
          title="Configuración completa"
          subtitle="Perfil público, usuario y contraseña (en la web)"
          onPress={() => openOnWeb('/cuenta')}
        />
        <Divider inset={68} />
        <ListRow
          icon={
            <RowIcon>
              <FileText size={20} color={c.accent} />
            </RowIcon>
          }
          title="Términos"
          onPress={() => openOnWeb('/terminos')}
        />
        <Divider inset={68} />
        <ListRow
          icon={
            <RowIcon>
              <Shield size={20} color={c.accent} />
            </RowIcon>
          }
          title="Política de privacidad"
          onPress={() => openOnWeb('/privacidad')}
        />
      </Card>

      <SectionHeader title="Tus datos" />
      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <Download size={20} color={c.accent} />
            </RowIcon>
          }
          title={exporting ? 'Preparando tus datos…' : 'Descargar mis datos'}
          subtitle="Un archivo con lo que MatchMate guarda de ti"
          onPress={async () => {
            if (exporting) return;
            setExporting(true);
            try {
              toast(`Listo: ${await shareMyData()}`);
            } catch (e) {
              toast(accountErrorMessage(e), 'error');
            } finally {
              setExporting(false);
            }
          }}
        />
        <Divider inset={68} />
        <ListRow
          icon={
            <RowIcon>
              <Trash2 size={20} color={c.danger} />
            </RowIcon>
          }
          title="Borrar mi cuenta"
          subtitle="Tu cuenta y tus datos personales, para siempre"
          onPress={() => router.push('/cuenta/borrar')}
        />
      </Card>

      <Button
        size="xl"
        full
        icon={<LogOut size={20} color={c.danger} />}
        onPress={async () => {
          // Como la web (AccountPage): este teléfono deja de recibir los avisos de la cuenta antes de salir.
          await unsubscribePush(uid);
          await logout();
        }}
      >
        Salir de la cuenta
      </Button>
    </Screen>
  );
}
