/**
 * Los campos de agregar y editar a un jugador (Organizar › Jugadores), como los de la web: el número del deporte
 * (SportStatFields.tsx), «Es menor de edad», el permiso del tutor y sus datos (GuardianFields.tsx), y una lista para
 * elegir en vez del <select> de la web (la cuenta para vincular, la posición).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { MIN_RANK_GAMES } from '@mm/lib/stats';
import { MAX_INDEX } from '@mm/sports/golf/course';
import { racketScale, statKind, teamPositions, type GuardianDraft, type StatDraft } from '@mm/components/players/logic';
import { ToggleRow } from '@/components/esports/inputs';
import { ChoiceRow, Field, Input, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/**
 * Elegir una opción (el <select> de la web): la elegida en una caja y, al tocarla, las opciones debajo. La primera
 * opción puede ser la de «nada» («— Elegir cuenta —»), como en la web.
 */
export function PickField<K extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  /** Para el lector de pantalla (el aria-label de la web). */
  label: string;
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  disabled?: boolean;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value) ?? options[0];
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        disabled={disabled}
        onPress={() => setOpen(!open)}
        style={[styles.box, { backgroundColor: c.surface2, opacity: disabled ? 0.5 : 1 }]}
      >
        <Txt numberOfLines={1} style={{ flex: 1, fontSize: 17, fontFamily: font.medium }}>
          {current?.label ?? ''}
        </Txt>
        <Icon size={20} color={c.muted} />
      </Pressable>
      {open && (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: 6 }}>
          {options.map((o) => (
            <ChoiceRow
              key={o.key || '-'}
              title={o.label}
              selected={o.key === value}
              onPress={() => {
                onChange(o.key);
                setOpen(false);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Los números del deporte al agregar o editar a alguien (SportStatFields de la web): promedio fijo (boliche), nivel
 * (raqueta), Index (golf), posición y dorsal (equipos). `averageHint`: lo que dice debajo del promedio (al editar).
 */
export function SportStatFields({ sport, draft, onChange, averageHint }: { sport: string; draft: StatDraft; onChange: (next: StatDraft) => void; averageHint?: string }) {
  const kind = statKind(sport);
  const set = (k: keyof StatDraft) => (v: string) => onChange({ ...draft, [k]: v });

  if (kind === 'bowling') {
    return (
      <Field
        label="Promedio fijo (opcional)"
        hint={averageHint ?? `Cuenta para el handicap mientras no tenga ${MIN_RANK_GAMES} juegos verificados en la temporada; después manda el de sus juegos. Sin él, empieza en 0.`}
      >
        <Input keyboardType="number-pad" value={draft.average} onChangeText={set('average')} placeholder="Automático" accessibilityLabel="Promedio fijo (opcional)" />
      </Field>
    );
  }

  if (kind === 'racket') {
    const scale = racketScale(sport);
    return (
      <Field label={`${scale.label} (opcional)`} hint={scale.hint}>
        <Input keyboardType="decimal-pad" value={draft.level} onChangeText={set('level')} placeholder={scale.placeholder} accessibilityLabel={scale.label} />
      </Field>
    );
  }

  if (kind === 'golf') {
    return (
      <Field
        label="Handicap Index (opcional)"
        hint={`De +10 a ${MAX_INDEX} (no oficial). Un «plus» se escribe con +, por ejemplo +1.2. Sirve para el handicap de juego de cada ronda.`}
      >
        <Input keyboardType="numbers-and-punctuation" value={draft.index} onChangeText={set('index')} placeholder="Ej. 18.4" accessibilityLabel="Handicap Index" />
      </Field>
    );
  }

  if (kind === 'team') {
    const positions = teamPositions(sport);
    const options = draft.position && !positions.includes(draft.position) ? [...positions, draft.position] : positions;
    return (
      <View style={{ gap: 12 }}>
        <Field label="Posición preferida">
          <PickField
            label="Posición preferida"
            options={[{ key: '', label: '— Cualquiera —' }, ...options.map((p) => ({ key: p, label: p }))]}
            value={draft.position}
            onChange={set('position')}
          />
        </Field>
        <Field label="Dorsal">
          <Input keyboardType="number-pad" value={draft.jersey} onChangeText={set('jersey')} placeholder="Ej. 10" accessibilityLabel="Dorsal preferido" />
        </Field>
        <Txt variant="small" tone="muted">
          Opcional. Sirve de guía al armar las plantillas de los equipos.
        </Txt>
      </View>
    );
  }

  return null;
}

/**
 * «Es menor de edad» (solo en ligas con menores). Un menor no tiene cuenta, nadie lo puede reclamar y no sale en lo
 * social; el nombre de su tutor y su teléfono solo los ven los admins.
 */
export function MinorCheck({
  checked,
  onChange,
  label = 'Es menor de edad',
  hint = 'Sin cuenta: nadie lo puede reclamar y no sale en lo social.',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
}) {
  return <ToggleRow checked={checked} onChange={onChange} label={label} hint={hint} />;
}

/** El permiso del padre, madre o tutor (obligatorio para registrar a un menor). */
export function ConsentCheck({
  checked,
  onChange,
  label = 'El tutor dio permiso',
  hint = 'Su padre, madre o tutor aceptó que lo registres en la app. Queda anotado quién lo registró y cuándo.',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  hint?: string;
}) {
  return <ToggleRow checked={checked} onChange={onChange} label={label} hint={hint} />;
}

/** Padre, madre o tutor (obligatorio), su teléfono (opcional) y el permiso. */
export function GuardianFields({ value, onChange }: { value: GuardianDraft; onChange: (v: GuardianDraft) => void }) {
  const set = (patch: Partial<GuardianDraft>) => onChange({ ...value, ...patch });
  return (
    <View style={{ gap: 12 }}>
      <Field label="Padre, madre o tutor">
        <Input maxLength={60} value={value.guardianName} onChangeText={(guardianName) => set({ guardianName })} placeholder="Nombre y apellido" autoComplete="off" accessibilityLabel="Padre, madre o tutor" />
      </Field>
      <Field label="Teléfono del tutor (opcional)">
        <Input
          keyboardType="phone-pad"
          maxLength={24}
          value={value.guardianPhone}
          onChangeText={(guardianPhone) => set({ guardianPhone })}
          placeholder="809 555 1234"
          autoComplete="off"
          accessibilityLabel="Teléfono del tutor (opcional)"
        />
      </Field>
      <ConsentCheck checked={value.consent} onChange={(consent) => set({ consent })} />
      <Txt variant="small" tone="muted">
        El tutor y su teléfono solo los ven los admins de la liga.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { height: 56, borderRadius: radius.btn, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
