import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { getUserId } from '@mm/lib/data/client';
import { useBadgeProgress, useBadgeStats, useProfileBadges } from '@mm/lib/data/badges';
import { useNow } from '@mm/lib/useNow';
import { featuredIsAuto, featuredModel } from '@mm/components/badges/logic';
import { useOpened } from '@mm/components/badges/opened';
import { canFeature, previewBadges, tabModel, type PreviewBadge } from '@mm/components/badges/tab';
import { badgeLinkId } from '@mm/pages/yoParts';
import { FeaturedPicker, FeaturedRow } from '@/components/badges/ProfileBadges';
import { Insignia } from '@/components/badges/Insignia';
import { Card, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * Las insignias en Yo (ProfileBadges de la web: BadgesPreview y FeaturedSection), con la lógica de la web
 * (src/components/badges/tab.ts y logic.ts) y las piezas de la vitrina de la app (components/badges).
 */

/** Abre Yo › Insignias (la vitrina), con esa insignia abierta si se pasa. */
export function openMyBadges(insignia?: string | null) {
  router.push({ pathname: '/yo/[parte]', params: insignia ? { parte: 'insignias', insignia } : { parte: 'insignias' } } as never);
}

/** Yo › Lite › «Insignias»: 3 (las ganadas y las que van en camino) y «Ver todas» (la vitrina, Yo › Insignias). */
export function BadgesPreview({ userId, sports }: { userId: string; sports: readonly string[] }) {
  const c = useColors();
  const data = useProfileBadges(userId);
  const own = !!data.data?.isMe || userId === getUserId();
  const progress = useBadgeProgress(own);
  const now = useNow().getTime();
  const [opened] = useOpened(own ? userId : null);
  if (data.loading && !data.data) return <View accessibilityLabel="Cargando insignias" style={{ height: 196, borderRadius: 24, backgroundColor: c.surface2 }} />;
  const model = data.data ? tabModel(data.data, progress.data, sports, now, opened) : null;
  const items = model ? previewBadges(model) : [];
  if (!items.length) return null;
  return <BadgesPreviewView items={items} />;
}

/** La tarjeta «Insignias» de Yo, sin leer la base: 3 insignias a 60 con su nombre y su fecha o lo que falta. */
function BadgesPreviewView({ items }: { items: readonly PreviewBadge[] }) {
  const c = useColors();
  return (
    <View style={{ gap: 12 }}>
      <SectionHeader
        title="Insignias"
        action={
          <Pressable accessibilityRole="link" hitSlop={6} onPress={() => openMyBadges()} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 }}>
            <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: c.accent }}>Ver todas</Txt>
            <ChevronRight size={16} color={c.accent} />
          </Pressable>
        }
      />
      <Card padded={false} style={{ flexDirection: 'row', paddingHorizontal: 8, paddingTop: 18, paddingBottom: 16 }}>
        {items.map((b) => (
          <Pressable
            key={b.id}
            accessibilityRole="button"
            accessibilityLabel={b.label}
            onPress={() => openMyBadges(badgeLinkId(b.to))}
            style={({ pressed }) => ({ flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 2, borderRadius: 16, transform: [{ scale: pressed ? 0.97 : 1 }] })}
          >
            <Insignia badge={b.look} size={64} px={60} pad state={b.state} progress={b.progress ?? undefined} />
            <Txt numberOfLines={2} style={{ marginTop: 10, width: '100%', textAlign: 'center', fontSize: 14, lineHeight: 17, fontFamily: font.bold, letterSpacing: -0.14 }}>
              {b.name}
            </Txt>
            <Txt tone="muted" numberOfLines={2} style={{ marginTop: 1, width: '100%', textAlign: 'center', fontSize: 12.5, lineHeight: 15 }}>
              {b.sub}
            </Txt>
            {b.progress != null && (
              <View style={{ marginTop: 6, width: 64, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: c.surface2 }}>
                <View style={{ width: `${Math.round(b.progress * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: c.accent }} />
              </View>
            )}
          </Pressable>
        ))}
      </Card>
    </View>
  );
}

/**
 * Yo › Insignias › «Destacadas»: las que los demás ven debajo de tu nombre (hasta 3), con el lápiz para elegirlas. No
 * sale si no hay ninguna que se pueda destacar. `onOpen` abre una en la vitrina de abajo.
 */
export function FeaturedSection({ userId, onOpen }: { userId: string; onOpen: (awardId: string) => void }) {
  const data = useProfileBadges(userId);
  const [picking, setPicking] = useState(false);
  const stats = useBadgeStats(featuredIsAuto(data.data));
  const model = featuredModel(data.data, stats.data);
  if (!data.data) return null;
  const own = data.data.isMe;
  const canPick = own && canFeature(data.data);
  if (!model.items.length && !canPick) return null;
  return (
    <View style={{ gap: 6 }}>
      <SectionHeader title="Destacadas" />
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4, marginBottom: 6 }}>
        Las ven los demás debajo de tu nombre.
      </Txt>
      <Card padded={false} style={{ padding: 12 }}>
        <FeaturedRow model={model} own={own} canPick={canPick} onPick={() => setPicking(true)} onOpen={onOpen} />
      </Card>
      {own && picking && <FeaturedPicker data={data.data} shown={model} onClose={() => setPicking(false)} />}
    </View>
  );
}
