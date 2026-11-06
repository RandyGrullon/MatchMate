import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, Clock, Search, UserPlus } from 'lucide-react-native';
import { PICKER_SEARCH_FROM, searchPlayers } from '@mm/components/league/logic';
import type { UnitPair } from '@mm/sports/registry';
import { Input, Txt } from '@/components/ui';
import { Avatar } from '@/components/social/Avatar';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export interface PickablePlayer {
  id: string;
  name: string;
}

/** Lo elegido: el id del jugador, o `null` = «No estoy en la lista» (se crea el suyo). */
export type WhoChoice = string | null;

/**
 * «¿Quién eres?» (WhoAreYouList de la web): los jugadores que el admin ya anotó sin cuenta, para unirse como uno de
 * ellos; la última opción es «No estoy en la lista». Elegir uno deja el pedido y el admin lo aprueba (mientras, la
 * cuenta juega con su propio jugador).
 */
export function WhoAreYouList({
  players,
  value,
  onChange,
  people = ['jugador', 'jugadores'],
  pending = null,
}: {
  players: readonly PickablePlayer[];
  value: WhoChoice;
  onChange: (v: WhoChoice) => void;
  people?: UnitPair;
  pending?: string | null;
}) {
  const c = useColors();
  const [q, setQ] = useState('');
  const shown = useMemo(() => searchPlayers(players, q), [players, q]);
  const option = (id: WhoChoice, label: string, icon: React.ReactNode, first: boolean) => {
    const on = value === id;
    return (
      <Pressable
        key={id ?? 'nuevo'}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={label}
        onPress={() => onChange(id)}
        style={[
          styles.option,
          { backgroundColor: on ? c.accentSoft : 'transparent' },
          !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
        ]}
      >
        {icon}
        <Txt numberOfLines={1} style={{ flex: 1, fontFamily: on ? font.semibold : font.medium, color: on ? c.accent : c.fg }}>
          {label}
        </Txt>
        {id && id === pending && (
          <View style={[styles.pending, { backgroundColor: c.warnSoft }]}>
            <Clock size={12} color={c.warn} />
            <Txt style={{ color: c.warn, fontSize: 12, fontFamily: font.semibold }}>Pendiente de aprobación</Txt>
          </View>
        )}
        <View style={[styles.radio, { borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : 'transparent' }]}>
          {on && <Check size={14} color={c.accentFg} />}
        </View>
      </Pressable>
    );
  };

  return (
    <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
      <Txt variant="meta" tone="muted">
        {`El admin ya anotó a estos ${people[1]}. Si uno eres tú, elígelo: cuando el admin lo apruebe, sus resultados quedan con tu cuenta.`}
      </Txt>
      {players.length >= PICKER_SEARCH_FROM && (
        <View style={{ justifyContent: 'center' }}>
          <View style={{ position: 'absolute', left: 14, zIndex: 1 }}>
            <Search size={16} color={c.muted} />
          </View>
          <Input value={q} onChangeText={setQ} placeholder="Busca tu nombre" accessibilityLabel="Busca tu nombre" style={{ paddingLeft: 38 }} />
        </View>
      )}
      <ScrollView nestedScrollEnabled style={[styles.list, { borderColor: c.line }]}>
        {shown.map((p, i) => option(p.id, p.name, <Avatar name={p.name} size={32} />, i === 0))}
        {shown.length === 0 && (
          <Txt variant="meta" tone="muted" style={{ textAlign: 'center', padding: 12 }}>
            Nadie se llama así en la lista.
          </Txt>
        )}
        {option(
          null,
          'No estoy en la lista',
          <View style={[styles.newIcon, { backgroundColor: c.surface2 }]}>
            <UserPlus size={16} color={c.muted} />
          </View>,
          shown.length === 0,
        )}
      </ScrollView>
      {!!value && value !== pending && (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
          <Clock size={14} color={c.muted} style={{ marginTop: 2 }} />
          <Txt tone="muted" style={{ fontSize: 12, flex: 1 }}>
            Queda pendiente de aprobación del admin. Mientras, juegas con tu cuenta.
          </Txt>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 12, paddingVertical: 8 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  list: { maxHeight: 288, borderWidth: 1, borderRadius: 12 },
  newIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
