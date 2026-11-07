import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CircleHelp, Info, MessageCircle, ScrollText, ShieldCheck } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { appVersion } from '@mm/lib/errorReport';
import { sportHomePath } from '@mm/lib/sportContext';
import { SPORT_GROUPS, sportMeta } from '@mm/sports/registry';
import { ABOUT_FEATURES, ABOUT_HEADINGS, ABOUT_NOTE, ABOUT_STEPS, ABOUT_TAGLINE, sportFullName, sportGridColumns } from '@mm/pages/aboutText';
import { Logo } from '@/components/Logo';
import { openLegal } from '@/components/legal/links';
import { BackBar, Button, Card, Divider, ListRow, RowIcon, Screen, SectionHeader, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { colorsFor, useColors, useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Acerca de MatchMate (`/acerca`, AboutPage de la web, con lo mismo que dice: src/pages/aboutText.ts): el logo y el
 * título con la frase, los deportes en cuadros (cada uno a su página, que en la app se abre en la web), qué puedes
 * hacer y cómo empezar en filas, «Crear cuenta» y «Entrar» (sin cuenta) y abajo la privacidad, los términos, cómo
 * escribirnos y la versión. Con cuenta se llega desde Configuración («‹ Configuración»).
 */
export default function AboutScreen() {
  const c = useColors();
  const { isDark } = useTheme();
  const { user } = useAuth();
  const version = appVersion();
  const cols = sportGridColumns(SPORT_GROUPS.length);
  return (
    <Screen>
      {user ? <BackBar label="Configuración" fallback="/cuenta" /> : <BackBar label="Atrás" fallback="/" />}
      <View style={{ gap: 8 }}>
        <Logo size={48} />
        {/* «Acerca de» y la marca (la letra y los colores de Wordmark) en un solo título. */}
        <Txt variant="title" accessibilityRole="header" style={{ marginTop: 12 }}>
          Acerca de{' '}
          <Text style={{ fontFamily: font.heavy, letterSpacing: -0.4 }}>
            Match<Text style={{ color: c.accent }}>Mate</Text>
          </Text>
        </Txt>
        <Txt tone="fg2">{ABOUT_TAGLINE}</Txt>
        <Txt variant="meta" tone="muted">
          {ABOUT_NOTE}
        </Txt>
      </View>

      <SectionHeader title={ABOUT_HEADINGS.sports} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -5 }}>
        {SPORT_GROUPS.map((g) => {
          const sport = g.sports[0]!;
          const tint = colorsFor(isDark, sport);
          const Icon = sportMeta(sport)?.icon ?? CircleHelp;
          return (
            <View key={g.id} style={{ width: `${100 / cols}%`, padding: 5 }}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={sportFullName(g) ?? g.name}
                onPress={() => openLink(sportHomePath(sport))}
                style={({ pressed }) => [styles.sport, { backgroundColor: c.surface, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
              >
                <View style={[styles.sportIcon, { backgroundColor: tint.accentSoft }]}>
                  <Icon size={20} color={tint.accent} />
                </View>
                <Txt numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontFamily: font.semibold, textAlign: 'center' }}>
                  {g.name}
                </Txt>
              </Pressable>
            </View>
          );
        })}
      </View>

      <SectionHeader title={ABOUT_HEADINGS.features} />
      <Card padded={false}>
        {ABOUT_FEATURES.map(({ icon: FeatureIcon, title, text }, i) => (
          <View key={title}>
            {i > 0 && <Divider inset={68} />}
            <ListRow
              icon={
                <RowIcon>
                  <FeatureIcon size={20} color={c.accent} />
                </RowIcon>
              }
              title={title}
              subtitle={text}
            />
          </View>
        ))}
      </Card>

      <SectionHeader title={ABOUT_HEADINGS.steps} />
      <Card padded={false}>
        {ABOUT_STEPS.map((s, i) => (
          <View key={s.title}>
            {i > 0 && <Divider inset={68} />}
            <ListRow
              icon={
                <View style={[styles.step, { backgroundColor: c.accentSoft }]}>
                  <Txt style={{ fontSize: 16, fontFamily: font.bold, color: c.accent }}>{i + 1}</Txt>
                </View>
              }
              title={s.title}
              subtitle={s.text}
            />
          </View>
        ))}
      </Card>
      {!user && (
        <View style={{ gap: 10, marginTop: 4 }}>
          <Button variant="primary" size="xl" full onPress={() => router.push({ pathname: '/login', params: { modo: 'registro' } })}>
            Crear cuenta
          </Button>
          <Button variant="quiet" size="xl" full onPress={() => router.push('/login')}>
            Entrar
          </Button>
        </View>
      )}

      <Card padded={false} style={{ marginTop: 14 }}>
        <ListRow
          icon={
            <RowIcon>
              <ShieldCheck size={20} color={c.accent} />
            </RowIcon>
          }
          title="Privacidad"
          onPress={() => openLegal('privacidad')}
        />
        <Divider inset={68} />
        <ListRow
          icon={
            <RowIcon>
              <ScrollText size={20} color={c.accent} />
            </RowIcon>
          }
          title="Términos"
          onPress={() => openLegal('terminos')}
        />
        <Divider inset={68} />
        <ListRow
          icon={
            <RowIcon>
              <MessageCircle size={20} color={c.accent} />
            </RowIcon>
          }
          title="Contáctanos"
          // La ruta es nueva: los tipos de las rutas se arman al arrancar la vista previa.
          onPress={() => router.push('/contacto' as never)}
        />
      </Card>
      {!!version && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 4, marginTop: -4 }}>
          <Info size={14} color={c.muted} />
          <Txt tone="muted" style={{ fontSize: 13 }}>
            Versión {version}
          </Txt>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sport: { minHeight: 92, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 12 },
  sportIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  step: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
