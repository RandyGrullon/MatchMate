import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useLeagueStreams } from '@mm/lib/data/streams';
import { PLATFORM_LABEL } from '@mm/lib/streams';
import { streamLine, streamTitle } from '@mm/components/live/logic';
import { Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { PlatformMark } from './PlatformMark';

/**
 * Arriba en el inicio de la liga (todos los deportes), solo cuando hay algo en vivo (LiveBanner de la web): una tarjeta
 * chica por transmisión activa con «● EN VIVO», el título (o el partido), la plataforma y «Ver», que abre En vivo de la
 * liga con esa transmisión. Sin transmisiones no sale nada (tampoco a quien puede transmitir).
 */
export function LiveBanner({ lid }: { lid: string }) {
  const c = useColors();
  const streams = useLeagueStreams(lid).data;
  if (!streams.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {streams.map((s) => {
        const title = streamTitle(s);
        return (
          <Pressable
            key={s.id}
            accessibilityRole="link"
            accessibilityLabel={`En vivo: ${title}, en ${PLATFORM_LABEL[s.platform]}. Ver`}
            onPress={() => router.push({ pathname: '/l/[lid]/vivo', params: { lid, s: s.id } })}
            style={({ pressed }) => ({
              minHeight: 72,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: c.dangerSoft,
              backgroundColor: pressed ? c.surface2 : c.surface,
              paddingHorizontal: 16,
              paddingVertical: 12,
            })}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.danger }} />
                <Txt style={{ fontSize: 11, fontFamily: font.bold, letterSpacing: 0.9, color: c.danger }}>EN VIVO</Txt>
              </View>
              <Txt numberOfLines={1} style={{ fontSize: 16, fontFamily: font.semibold }}>
                {title}
              </Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <PlatformMark platform={s.platform} size={16} />
                <Txt numberOfLines={1} tone="muted" style={{ flexShrink: 1, fontSize: 13 }}>
                  {streamLine(s)}
                </Txt>
              </View>
            </View>
            <View style={{ height: 36, borderRadius: 18, backgroundColor: c.danger, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Txt style={{ fontSize: 14, fontFamily: font.bold, color: c.onDanger }}>Ver</Txt>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
