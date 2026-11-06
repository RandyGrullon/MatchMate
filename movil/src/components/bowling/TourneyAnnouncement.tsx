import { Linking, Pressable, View } from 'react-native';
import { Megaphone, MessageCircle } from 'lucide-react-native';
import { eventLabel, formatDateLong } from '@mm/lib/format';
import { whatsappUrl } from '@mm/lib/league';
import type { BowlingEvent, League } from '@mm/lib/types';
import { tourneyCountdown } from '@mm/components/league/logic';
import { Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * «Escribir a Ana» por WhatsApp para entrar a un torneo (TourneyContact de la web), con el saludo ya escrito, si la
 * liga tiene el teléfono de su contacto; si no, nada.
 */
export function TourneyContact({ league, eventName }: { league: Pick<League, 'name' | 'contactName' | 'contactPhone'>; eventName: string }) {
  if (!league.contactPhone) return null;
  const contact = league.contactName?.trim();
  const url = whatsappUrl(league.contactPhone, `Hola${contact ? ` ${contact}` : ''}, quiero participar en ${eventName} (${league.name}).`);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 12, paddingHorizontal: 16, backgroundColor: '#25D366', opacity: pressed ? 0.85 : 1 })}
    >
      <MessageCircle size={16} color="#fff" />
      <Txt style={{ color: '#fff', fontFamily: font.semibold, fontSize: 14 }}>{`Escribir a ${contact || 'quien organiza'}`}</Txt>
    </Pressable>
  );
}

/**
 * El anuncio de un torneo que viene, en su pantalla (como EventPage de la web): en una liga, el texto del anuncio y
 * «Escribir a…»; en un torneo sin liga, la tarjeta del anuncio con cuánto falta («En 3 días · Torneo»), el nombre y la
 * fecha, o «Pregúntale a Ana para participar.».
 */
export function TourneyAnnouncement({ event, league, today }: { event: BowlingEvent; league: League; today: string }) {
  const c = useColors();
  if (event.type !== 'torneo' || event.date < today) return null;
  const name = eventLabel(event);
  const text = event.announcement?.trim();
  if (league.kind !== 'torneo') {
    if (!text && !league.contactPhone) return null;
    return (
      <Card style={{ gap: 12, backgroundColor: c.surface2 }}>
        {!!text && (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Megaphone size={16} color={c.accent} style={{ marginTop: 2 }} />
            <Txt style={{ flex: 1, fontSize: 14 }}>{text}</Txt>
          </View>
        )}
        <TourneyContact league={league} eventName={name} />
      </Card>
    );
  }
  const contact = league.contactName?.trim();
  return (
    <Card style={{ gap: 12, borderWidth: 1, borderColor: `${c.accent}4d`, backgroundColor: c.accentSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Megaphone size={20} color={c.accentFg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt tone="accent" style={{ fontSize: 12, fontFamily: font.semibold, letterSpacing: 0.5 }}>{`${tourneyCountdown(event.date, today)} · Torneo`.toUpperCase()}</Txt>
          <Txt style={{ fontSize: 18, fontFamily: font.bold }}>{name}</Txt>
          <Txt tone="muted" style={{ fontSize: 14 }}>
            {(() => {
              const d = formatDateLong(event.date);
              return d.charAt(0).toUpperCase() + d.slice(1);
            })()}
          </Txt>
        </View>
      </View>
      {!!text && <Txt style={{ fontSize: 14 }}>{text}</Txt>}
      {league.contactPhone ? (
        <TourneyContact league={league} eventName={name} />
      ) : (
        !!contact && (
          <Txt tone="muted" style={{ fontSize: 14 }}>
            {`Pregúntale a ${contact} para participar.`}
          </Txt>
        )
      )}
    </Card>
  );
}
