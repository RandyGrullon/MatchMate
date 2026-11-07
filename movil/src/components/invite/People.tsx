/**
 * Las piezas de elegir personas para invitar (las de src/components/invite/InviteSheet.tsx de la web, con su lógica:
 * src/components/invite/logic.ts): el buscador (nombre o @usuario), la lista según `peopleView` (las que sigues, los
 * resultados, la espera, «nadie» o el error), la tarjeta de cada persona y la barra de enviar.
 */
import { Pressable, View } from 'react-native';
import { Check, Search, Send, Users, X } from 'lucide-react-native';
import type { PersonHit } from '@mm/lib/data/people';
import { handleOf, personLabel, personState, personStateText, selectedSummary, sendLabel, type InviteTarget, type PeopleView } from '@mm/components/invite/logic';
import { Avatar } from '../social/Avatar';
import { Button, Empty, Input, LoadError, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** El buscador de personas (nombre o @usuario). */
export function PeopleSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Search size={16} color={c.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }} />
      <Input
        accessibilityLabel="Buscar personas"
        value={value}
        onChangeText={onChange}
        placeholder="Busca por nombre o @usuario"
        returnKeyType="search"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={60}
        style={{ flex: 1, height: 48, paddingLeft: 38, paddingRight: 44 }}
      />
      {!!value && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
          onPress={() => onChange('')}
          style={{ position: 'absolute', right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={16} color={c.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** Lo de debajo del buscador según `peopleView`: las tarjetas, la espera, «nadie» o el error. */
export function PeopleList({
  view,
  query,
  people,
  settled,
  error,
  selected,
  onToggle,
  kind = 'liga',
}: {
  view: PeopleView;
  /** Lo escrito (para «No encontramos a nadie con…»). */
  query: string;
  people: readonly PersonHit[];
  /** false mientras espera a que deje de escribir (la lista de antes se ve más clara). */
  settled: boolean;
  error: Error | null;
  selected: ReadonlyMap<string, PersonHit>;
  onToggle: (hit: PersonHit) => void;
  /** Liga, torneo o equipo («En la liga» / «En el torneo» / «Ya está»). */
  kind?: InviteTarget;
}) {
  const c = useColors();
  const grid = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', opacity: settled ? 1 : 0.7 }}>
      {people.map((hit) => (
        <View key={hit.id} style={{ width: '25%', padding: 4 }}>
          <PersonTile hit={hit} selected={selected.has(hit.id)} onToggle={() => onToggle(hit)} kind={kind} />
        </View>
      ))}
    </View>
  );
  switch (view) {
    case 'following':
      return (
        <View style={{ gap: 8 }}>
          <Txt variant="bodyStrong" accessibilityRole="header">
            Personas que sigues
          </Txt>
          {grid}
        </View>
      );
    case 'results':
      return grid;
    case 'loading':
      return (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <LogoSpinner size={36} label="Buscando personas" />
        </View>
      );
    case 'no-following':
      return <Empty icon={<Users size={28} color={c.accent} />} title="Aún no sigues a nadie" text="Búscalos por su nombre o @usuario arriba." />;
    case 'short':
      return (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 32 }}>
          Escribe al menos 2 letras.
        </Txt>
      );
    case 'none':
      return (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 32 }}>
          {`No encontramos a nadie con «${query}»`}
        </Txt>
      );
    case 'error':
      return error ? <LoadError error={error} /> : null;
  }
}

/**
 * Una persona en la hoja: foto, nombre y @usuario. Tocar elige o suelta (contorno y marca del color de la liga). Quien
 * ya está o ya tiene invitación sale con eso y no se puede elegir; si pasó a estarlo mientras estaba elegida (otro la
 * invitó, llegó el tiempo real), se puede soltar.
 */
export function PersonTile({ hit, selected, onToggle, kind = 'liga' }: { hit: PersonHit; selected: boolean; onToggle: () => void; kind?: InviteTarget }) {
  const c = useColors();
  const state = personState(hit);
  const handle = handleOf(hit.username);
  const locked = !!state && !selected;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={personLabel(hit, kind)}
      accessibilityState={{ selected: locked ? undefined : selected, disabled: locked }}
      disabled={locked}
      onPress={onToggle}
      style={({ pressed }) => ({
        alignItems: 'center',
        gap: 4,
        borderRadius: 16,
        paddingTop: 10,
        paddingBottom: 8,
        paddingHorizontal: 2,
        borderWidth: selected ? 2 : 0,
        borderColor: c.accent,
        backgroundColor: selected ? c.accentSoft : pressed && !locked ? c.surface2 : 'transparent',
      })}
    >
      <View style={{ opacity: state ? 0.5 : 1 }}>
        <Avatar name={hit.name || hit.username} photo={hit.avatar} size={56} />
      </View>
      <Txt numberOfLines={1} style={{ fontSize: 12, fontFamily: font.medium, alignSelf: 'stretch', textAlign: 'center' }}>
        {hit.name || handle}
      </Txt>
      {state ? (
        <Txt numberOfLines={1} tone="accent" style={{ fontSize: 11, fontFamily: font.medium }}>
          {personStateText(state, kind)}
        </Txt>
      ) : (
        !!handle && (
          <Txt numberOfLines={1} tone="muted" style={{ fontSize: 11 }}>
            {handle}
          </Txt>
        )
      )}
      {selected && (
        <View style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={14} color={c.accentFg} strokeWidth={3} />
        </View>
      )}
    </Pressable>
  );
}

/** A quiénes va y el botón de enviar (abajo mientras hay alguien elegido). */
export function SendBar({ people, sending, onSend, onClear }: { people: readonly PersonHit[]; sending: boolean; onSend: () => void; onClear: () => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {selectedSummary(people)}
        </Txt>
        <Button variant="ghost" disabled={sending} onPress={onClear}>
          Quitar
        </Button>
      </View>
      <Button variant="primary" size="lg" full loading={sending} icon={<Send size={16} color={c.accentFg} />} onPress={onSend}>
        {sendLabel(people.length)}
      </Button>
    </View>
  );
}
