import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Award, Palette } from 'lucide-react-native';
import { setBadgesAuto, type BadgesAutoMode } from '@mm/lib/data/badges';
import { BADGE_MAKERS_OPTIONS, badgeMakersOf, setBadgePolicy, type BadgeMakers } from '@mm/lib/data/leagueBadges';
import { useLeagueCtx } from '@mm/lib/league';
import { BADGES_AUTO_OPTIONS, badgesAutoIntro, badgesAutoOf, pickedOr } from '@mm/components/badges/settings';
import { runAction } from '@/components/swimming/parts';
import { Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Organizar › Insignias en la app: «Insignias automáticas» (BadgesSettingsCard de la web, §6.5) y «¿Quién diseña y da
 * insignias?» (BadgeMakersCard de maker/MakerSettings.tsx, §5.1). Los cambia el dueño; los admins los ven.
 */

/** Una opción para elegir (el radio de la web): marcada con el borde del acento; sin `onPress`, de solo lectura. */
function Option({ title, hint, selected, busy, onPress }: { title: string; hint?: string; selected: boolean; busy?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !onPress, busy: !!busy }}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { borderColor: selected ? c.accent : c.line, backgroundColor: selected ? c.accentSoft : pressed ? c.surface2 : 'transparent', opacity: onPress ? 1 : 0.8 },
      ]}
    >
      <View style={[styles.radio, { borderColor: selected ? c.accent : c.muted }]}>{selected && <View style={[styles.dot, { backgroundColor: c.accent }]} />}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt variant="meta" style={{ fontFamily: font.semibold }}>
            {title}
          </Txt>
          {busy && <ActivityIndicator size="small" color={c.accent} />}
        </View>
        {!!hint && (
          <Txt variant="small" tone="muted">
            {hint}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}

function SettingsCard({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <Card style={{ gap: 12, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ marginTop: 2 }}>{icon}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" accessibilityRole="header" style={{ fontFamily: font.bold }}>
            {title}
          </Txt>
          <Txt variant="meta" tone="muted">
            {text}
          </Txt>
        </View>
      </View>
      {children}
    </Card>
  );
}

/** «Insignias automáticas»: «Todas», «Sin títulos» o «Ninguna». Lo cambia el dueño; los admins lo ven. */
export function BadgesSettingsCard() {
  const c = useColors();
  const { lid, league, isOwner } = useLeagueCtx();
  const [busy, setBusy] = useState<BadgesAutoMode | null>(null);
  // Lo elegido se ve al momento; cuando llega la liga de nuevo, manda la base.
  const [picked, setPicked] = useState<{ from: BadgesAutoMode; to: BadgesAutoMode } | null>(null);
  const saved = badgesAutoOf(league);
  const value = pickedOr(picked, saved);

  const change = async (mode: BadgesAutoMode) => {
    if (mode === value || busy) return;
    setBusy(mode);
    setPicked({ from: saved, to: mode });
    const ok = await runAction(() => setBadgesAuto(lid, mode), 'Insignias automáticas guardadas');
    if (ok === undefined) setPicked(null);
    setBusy(null);
  };

  return (
    <SettingsCard icon={<Award size={20} color={c.accent} />} title="Insignias automáticas" text={badgesAutoIntro(isOwner)}>
      <View accessibilityRole="radiogroup" accessibilityLabel="Insignias automáticas" style={{ gap: 6 }}>
        {BADGES_AUTO_OPTIONS.map((o) => (
          <Option key={o.mode} title={o.label} hint={o.hint} selected={value === o.mode} busy={busy === o.mode} onPress={isOwner ? () => void change(o.mode) : undefined} />
        ))}
      </View>
    </SettingsCard>
  );
}

/**
 * «¿Quién diseña y da insignias?»: «Solo yo», «Yo y los admins» (por defecto) o «Yo y los que yo elija» (se marcan en
 * Miembros con «Diseña insignias»). La cambia el dueño; los admins ven quiénes.
 */
export function BadgeMakersCard() {
  const c = useColors();
  const { lid, league, isOwner } = useLeagueCtx();
  const [busy, setBusy] = useState<BadgeMakers | null>(null);
  const [picked, setPicked] = useState<{ from: BadgeMakers; to: BadgeMakers } | null>(null);
  const saved = badgeMakersOf(league);
  const value = pickedOr(picked, saved);

  const change = async (v: BadgeMakers) => {
    if (v === value || busy) return;
    setBusy(v);
    setPicked({ from: saved, to: v });
    const ok = await runAction(() => setBadgePolicy(lid, v), 'Listo: ya sabemos quién diseña las insignias');
    if (ok === undefined) setPicked(null);
    setBusy(null);
  };

  return (
    <SettingsCard
      icon={<Palette size={20} color={c.accent} />}
      title="¿Quién diseña y da insignias?"
      text={`Las insignias propias de la liga (más abajo, en «Insignias de la liga»). Nadie se las da a sí mismo. ${isOwner ? 'Tú decides.' : 'Solo el dueño lo cambia.'}`}
    >
      <View accessibilityRole="radiogroup" accessibilityLabel="¿Quién diseña y da insignias?" style={{ gap: 6 }}>
        {BADGE_MAKERS_OPTIONS.map((o) => (
          <Option
            key={o.value}
            title={isOwner ? o.label : o.who[0].toUpperCase() + o.who.slice(1)}
            hint={isOwner ? o.hint : undefined}
            selected={value === o.value}
            busy={busy === o.value}
            onPress={isOwner ? () => void change(o.value) : undefined}
          />
        ))}
      </View>
      {value === 'chosen' && isOwner && (
        <Txt variant="small" tone="muted">
          Marca a quién en Miembros con «Diseña insignias».
        </Txt>
      )}
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
