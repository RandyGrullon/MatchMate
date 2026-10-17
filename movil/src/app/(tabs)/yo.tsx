import { View } from 'react-native';
import { router } from 'expo-router';
import { FileText, Globe, LogOut, Moon, Shield } from 'lucide-react-native';
import { displayName, logout, useAuth } from '@mm/lib/auth';
import { Button, Card, Divider, ListRow, Loading, RowIcon, Screen, SectionHeader, Segmented, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors, useTheme, type ThemeMode } from '@/theme/theme';

/** Yo: la cuenta, la apariencia, lo legal y salir (Yo y Configuración de la web). */
export default function YoScreen() {
  const auth = useAuth();
  const c = useColors();
  const { mode, setMode } = useTheme();
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

      <SectionHeader title="Más" />
      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <Globe size={20} color={c.accent} />
            </RowIcon>
          }
          title="Configuración completa"
          subtitle="Perfil público, usuario, contraseña y avisos (en la web)"
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

      <Button size="xl" full icon={<LogOut size={20} color={c.danger} />} onPress={() => void logout()}>
        Salir de la cuenta
      </Button>
    </Screen>
  );
}
