import { useState, type ComponentType } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Baby, CalendarRange, Camera, ChevronDown, Clock, Earth, Globe, Lock, MapPin, MessageCircle, Pencil } from 'lucide-react-native';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { EMPTY_DETAIL, leagueDataTitle, settingsDetails, visibilityLabel, type DetailKey, type SettingsDetail } from '@mm/components/league/settings';
import { Button, Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

const ICONS: Record<DetailKey, ComponentType<{ size?: number; color?: string }>> = {
  venue: MapPin,
  schedule: Clock,
  season: CalendarRange,
  contact: MessageCircle,
  photo: Camera,
  tz: Earth,
  minors: Baby,
};

/**
 * Los datos de la liga (la tarjeta de arriba de Ajustes en la web): cerrada solo se ve el nombre con «Privada» o
 * «Pública»; al tocarla se despliegan el lugar, cuándo juegan, la temporada, el contacto (su WhatsApp abre el chat), la
 * foto del marcador, la zona horaria y si es con menores, con «Editar datos».
 */
export function DataCard({ onEdit }: { onEdit: () => void }) {
  const c = useColors();
  const { league } = useLeagueCtx();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const isPrivate = league.visibility === 'private';
  const Vis = isPrivate ? Lock : Globe;
  return (
    <Card style={{ padding: 16 }}>
      {/* Acordeón: cerrado solo se ve el nombre; al tocarlo se despliegan los datos. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${leagueDataTitle(league.kind)}: ${league.name}. ${visibilityLabel(league.visibility)}`}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, margin: -4, padding: 4, backgroundColor: pressed ? c.surface2 : 'transparent' })}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt variant="small" tone="muted">
              {leagueDataTitle(league.kind)}
            </Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: isPrivate ? c.surface2 : c.accentSoft }}>
              <Vis size={12} color={isPrivate ? c.muted : c.accent} />
              <Txt style={{ fontFamily: font.semibold, fontSize: 11, color: isPrivate ? c.muted : c.accent }}>{visibilityLabel(league.visibility)}</Txt>
            </View>
          </View>
          <Txt variant="section" numberOfLines={1}>
            {league.name}
          </Txt>
        </View>
        <ChevronDown size={20} color={c.muted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </Pressable>
      {open && (
        <View style={{ gap: 10, paddingTop: 16 }}>
          {settingsDetails(league, { at: now }).map((d) => (
            <Detail key={d.key} detail={d} />
          ))}
          <View style={{ marginTop: 6 }}>
            <Button full icon={<Pencil size={18} color={c.fg} />} onPress={onEdit}>
              Editar datos
            </Button>
          </View>
        </View>
      )}
    </Card>
  );
}

function Detail({ detail }: { detail: SettingsDetail }) {
  const c = useColors();
  const Icon = ICONS[detail.key];
  const empty = !detail.value;
  const href = detail.href;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ marginTop: 2 }}>
        <Icon size={16} color={c.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="small" tone="muted">
          {detail.label}
        </Txt>
        {href ? (
          <Txt accessibilityRole="link" tone="accent" numberOfLines={1} onPress={() => void Linking.openURL(href).catch(() => undefined)}>
            {detail.value}
          </Txt>
        ) : (
          <Txt tone={empty ? 'muted' : 'fg'} numberOfLines={1}>
            {detail.value || EMPTY_DETAIL}
          </Txt>
        )}
      </View>
    </View>
  );
}
