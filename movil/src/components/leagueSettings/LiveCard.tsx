import { useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, Radio } from 'lucide-react-native';
import { setLeagueLive } from '@mm/lib/data/streams';
import { useLeagueCtx } from '@mm/lib/league';
import { liveExplain, liveToggleText } from '@mm/components/league/settings';
import { runAction } from '@/components/swimming/parts';
import { Card, Divider, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * «Transmisiones en vivo» en los ajustes (LiveSettingsCard de la web, `leagues.live_enabled`): los admins la prenden o
 * la apagan. Lo elegido se ve al momento; si falla, vuelve. Prendida, «Ir a En vivo» (`/l/<liga>/vivo`).
 */
export function LiveCard() {
  const c = useColors();
  const { lid, league, isAdmin } = useLeagueCtx();
  const [saving, setSaving] = useState(false);
  // Lo elegido se ve al momento; cuando llega la liga de nuevo, manda la base.
  const [picked, setPicked] = useState<{ from: boolean; to: boolean } | null>(null);
  const saved = league.liveEnabled === true;
  const on = picked && picked.from === saved ? picked.to : saved;

  async function toggle() {
    if (!isAdmin || saving) return;
    const next = !on;
    setSaving(true);
    setPicked({ from: saved, to: next });
    const ok = await runAction(async () => {
      await setLeagueLive(lid, next);
      return true;
    }, liveToggleText(next));
    if (!ok) setPicked(null);
    setSaving(false);
  }

  return (
    <Card padded={false}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: on, disabled: !isAdmin, busy: saving }}
        disabled={!isAdmin}
        onPress={() => void toggle()}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, backgroundColor: pressed ? c.surface2 : 'transparent', opacity: isAdmin ? 1 : 0.6 })}
      >
        <Radio size={20} color={c.accent} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong">Transmisiones en vivo</Txt>
          <Txt variant="meta" tone="muted">
            {liveExplain(league)}
          </Txt>
        </View>
        {saving ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 4 }} />
        ) : (
          <Switch
            value={on}
            disabled={!isAdmin}
            onValueChange={() => void toggle()}
            trackColor={{ true: c.accent, false: c.surface2 }}
            thumbColor="#ffffff"
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
      </Pressable>
      {on && saved && (
        <>
          <Divider />
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/l/[lid]/vivo', params: { lid } } as never)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, backgroundColor: pressed ? c.surface2 : 'transparent' })}
          >
            <Txt variant="bodyStrong" tone="accent" style={{ flex: 1 }}>
              Ir a En vivo
            </Txt>
            <ChevronRight size={16} color={c.accent} />
          </Pressable>
        </>
      )}
    </Card>
  );
}
