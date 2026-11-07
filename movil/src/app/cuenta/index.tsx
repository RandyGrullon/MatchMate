import { useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { AtSign, Pencil } from 'lucide-react-native';
import { displayName, useAuth } from '@mm/lib/auth';
import { invalidate } from '@mm/lib/data/client';
import { peopleTags, usePublicProfile } from '@mm/lib/data/follows';
import { tags } from '@mm/lib/data/keys';
import { blockKeys } from '@mm/lib/data/profileSocial';
import { accountLine, usernameSubtitle } from '@mm/components/cuenta/logic';
import { atUsername } from '@mm/components/social/socialFormat';
import { NameSheet, NeedsProfileCard, PasswordRow, UsernameSheet } from '@/components/account/AccountSheets';
import { NotificationsCard } from '@/components/account/NotificationsCard';
import { PublicProfileSection } from '@/components/account/PublicProfile';
import { AccountData, AppearanceCard, MatchMateCard, MyLeagues, RowGroup, SignOutCard } from '@/components/account/SettingsCards';
import { Avatar } from '@/components/social/Avatar';
import { BackBar, Badge, ListRow, Loading, RowIcon, Screen, Txt } from '@/components/ui';
import { TITLE_PRO } from '@/components/home/proLook';
import { useIsPro } from '@mm/lib/useMode';
import { useColors } from '@/theme/theme';

/**
 * Configuración (el engranaje de Yo), como src/pages/AccountPage.tsx: «‹ Yo», el título y quién eres; después filas en
 * tarjetas: tu cuenta (nombre, @usuario y contraseña, cada uno en su hoja), Perfil público (foto, biografía y personas
 * bloqueadas), Apariencia, Notificaciones, Mis ligas, Tus datos (privacidad, términos, bajar mis datos y borrar la
 * cuenta), MatchMate (el panel del superadmin; Organizar, con lo que espera; Mi empresa; Acerca de y Contáctanos) y, al
 * final, Cerrar sesión. `?foto=1` abre la hoja de la foto y `?recuperar=1` la de la contraseña nueva.
 */
export default function AccountScreen() {
  const c = useColors();
  const auth = useAuth();
  const me = usePublicProfile(auth.user?.uid);
  const [sheet, setSheet] = useState<'nombre' | 'usuario' | null>(null);
  // Pro: lo mismo más denso (el título, tu foto y tu nombre un poco más chicos, como la web).
  const pro = useIsPro();

  if (auth.loading) return <Loading />;
  if (!auth.user) return <Redirect href="/login" />;
  const user = auth.user;
  const name = displayName(auth);
  // Cuenta sin perfil (el registro no alcanzó a crearlo): se completa con el nombre.
  const needsProfile = !auth.profile;
  // Puede faltar en una copia vieja del teléfono hasta que el perfil se vuelve a leer.
  const username = auth.profile?.username ?? '';
  const handle = atUsername(username);
  const line = accountLine(handle, user.email);

  return (
    <Screen onRefresh={() => invalidate(tags.profile(user.uid), peopleTags.user(user.uid), blockKeys.mine)}>
      {/* Se llega con el engranaje de Yo: «‹ Yo» vuelve ahí. */}
      <BackBar label="Yo" fallback="/yo" />
      <Txt variant="title" style={pro ? TITLE_PRO : undefined}>
        Configuración
      </Txt>

      {/* Quién eres, como arriba de Yo. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: pro ? 14 : 16 }}>
        <Avatar name={name} photo={me.data?.avatar} size={pro ? 52 : 60} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1, fontSize: pro ? 22 : 24, lineHeight: pro ? 26 : 28 }}>
              {name}
            </Txt>
            {auth.isSuper && <Badge>Superadmin</Badge>}
          </View>
          {!!line && (
            <Txt variant="meta" tone="muted" numberOfLines={1}>
              {line}
            </Txt>
          )}
        </View>
      </View>

      {needsProfile && <NeedsProfileCard user={user} />}

      <RowGroup>
        {!needsProfile && (
          <ListRow
            icon={
              <RowIcon>
                <Pencil size={20} color={c.accent} />
              </RowIcon>
            }
            title="Tu nombre"
            subtitle={name}
            onPress={() => setSheet('nombre')}
          />
        )}
        {!needsProfile && (
          <ListRow
            icon={
              <RowIcon>
                <AtSign size={20} color={c.accent} />
              </RowIcon>
            }
            title="Tu usuario"
            subtitle={usernameSubtitle(handle)}
            onPress={() => setSheet('usuario')}
          />
        )}
        <PasswordRow />
      </RowGroup>

      {!needsProfile && <PublicProfileSection name={name} profile={me.data} />}

      <AppearanceCard />
      <NotificationsCard />
      <MyLeagues uid={user.uid} />
      <AccountData />
      <MatchMateCard uid={user.uid} />
      <SignOutCard uid={user.uid} />

      {sheet === 'nombre' && <NameSheet user={user} current={name} onClose={() => setSheet(null)} />}
      {sheet === 'usuario' && <UsernameSheet uid={user.uid} current={username} onClose={() => setSheet(null)} />}
    </Screen>
  );
}
