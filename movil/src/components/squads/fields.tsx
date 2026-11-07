/**
 * Los datos de un equipo, iguales al crearlo y al editarlo (SquadFields de la web, con su lógica: src/pages/squads/
 * squadForm.ts): nombre, tag (sale solo del nombre hasta que escribes el tuyo), ciudad, color (el del deporte o uno de
 * la lista), descripción y «Busca jugadores». También el selector del deporte de «Crear equipo» (SportPicker de la web)
 * y el logo (TeamLogoField).
 */
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Check, ImagePlus, ImageUp, Megaphone, X, type LucideIcon } from 'lucide-react-native';
import { SQUAD_CITY_MAX, SQUAD_DESCRIPTION_MAX, SQUAD_NAME_MAX } from '@mm/lib/data/squads';
import { logoErrorText } from '@mm/lib/logos';
import { SPORTS, type SportGroup } from '@mm/sports/registry';
import type { SportStatus } from '@mm/sports/status';
import type { SportId } from '@mm/sports/types';
import { SQUAD_COLORS, validColor } from '@mm/components/squads/logic';
import { typedTag, type SquadForm } from '@mm/pages/squads/squadForm';
import { Button, Field, Input, Txt } from '../ui';
import type { PhotoSource } from '@/lib/pickImage';
import { colorsFor, useColors, useTheme } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { SquadLogo } from './bits';
import { pickSquadLogo, type PickedLogo } from './logo';

export function SquadFields({ form, onChange, sport, onTagTyped }: { form: SquadForm; onChange: (patch: Partial<SquadForm>) => void; sport: string; onTagTyped?: () => void }) {
  return (
    <>
      <Field label="Nombre del equipo">
        <Input accessibilityLabel="Nombre del equipo" maxLength={SQUAD_NAME_MAX} autoComplete="off" value={form.name} placeholder="Los Tigres del Este" onChangeText={(name) => onChange({ name })} />
      </Field>
      <Field label="Tag" hint="De 2 a 5 letras o números: sale como [TGR] al lado del nombre.">
        <Input
          accessibilityLabel="Tag"
          maxLength={5}
          autoComplete="off"
          autoCorrect={false}
          autoCapitalize="characters"
          value={form.tag}
          placeholder="TGR"
          style={{ fontFamily: font.semibold, letterSpacing: 1.2 }}
          onChangeText={(v) => {
            onTagTyped?.();
            onChange({ tag: typedTag(v) });
          }}
        />
      </Field>
      <Field label="Ciudad (opcional)">
        <Input accessibilityLabel="Ciudad (opcional)" maxLength={SQUAD_CITY_MAX} autoComplete="off" value={form.city} placeholder="Santo Domingo" onChangeText={(city) => onChange({ city })} />
      </Field>
      <ColorPicker value={form.color} sport={sport} onChange={(color) => onChange({ color })} />
      <Field label="Descripción (opcional)">
        <Input
          accessibilityLabel="Descripción (opcional)"
          multiline
          maxLength={SQUAD_DESCRIPTION_MAX}
          value={form.description}
          placeholder="Jugamos los domingos en la mañana. Buscamos un portero…"
          onChangeText={(description) => onChange({ description })}
          style={{ height: 88, paddingTop: 14, textAlignVertical: 'top' }}
        />
      </Field>
      <SwitchRow
        Icon={Megaphone}
        title="Busca jugadores"
        text="Se ve en el equipo y en la búsqueda: así te encuentran."
        on={form.recruiting}
        onChange={(recruiting) => onChange({ recruiting })}
      />
    </>
  );
}

/** El color del equipo: el del deporte (el de entrada) o uno de la lista. Cada uno se ve de 36 px y se toca en 44. */
export function ColorPicker({ value, sport, onChange }: { value: string | null; sport: string; onChange: (hex: string | null) => void }) {
  const c = useColors();
  const { isDark } = useTheme();
  const current = validColor(value);
  const sportTint = colorsFor(isDark, sport);
  const swatch = (key: string, label: string, bg: string, fg: string, on: boolean, pick: () => void) => (
    <Pressable key={key} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected: on }} onPress={pick} hitSlop={4} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 2 : 0, borderColor: c.fg }}>{on && <Check size={16} color={fg} strokeWidth={3} />}</View>
    </Pressable>
  );
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="bodyStrong" tone="fg2">
        Color
      </Txt>
      <View accessibilityRole="radiogroup" accessibilityLabel="Color" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
        {swatch('deporte', 'El color del deporte', sportTint.accent, sportTint.accentFg, current === null, () => onChange(null))}
        {SQUAD_COLORS.map((col) => swatch(col.hex, col.name, col.hex, '#ffffff', current === col.hex, () => onChange(col.hex)))}
      </View>
      <Txt variant="meta" tone="muted">
        El primero es el del deporte. Se ve en la página del equipo y en su logo.
      </Txt>
    </View>
  );
}

/** Interruptor en tarjeta («Busca jugadores»). */
export function SwitchRow({ Icon, title, text, on, onChange }: { Icon: LucideIcon; title: string; text: string; on: boolean; onChange: (on: boolean) => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={title}
      onPress={() => onChange(!on)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 16, padding: 16, backgroundColor: c.surface2, opacity: pressed ? 0.9 : 1 })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={c.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="meta" tone="muted">
          {text}
        </Txt>
      </View>
      <Switch value={on} onValueChange={onChange} trackColor={{ true: c.accent, false: c.line }} thumbColor="#ffffff" />
    </Pressable>
  );
}

/**
 * Primer paso de «Crear equipo» (SportPicker de la web): de qué deporte, solo los que la cuenta puede crear; el fútbol
 * sale una vez y pide la modalidad. «Beta» si solo lo crea el superadmin.
 */
export function SportPicker({ groups, status, value, onChange }: { groups: readonly SportGroup[]; status: Readonly<Record<SportId, SportStatus>>; value: SportId; onChange: (sport: SportId) => void }) {
  const c = useColors();
  const current = groups.find((g) => g.sports.includes(value));
  const beta = (ids: readonly SportId[]) => ids.every((id) => status[id] === 'beta');
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Txt variant="meta" tone="muted" style={{ fontFamily: font.medium }}>
          ¿De qué deporte?
        </Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {groups.map((g) => {
            const active = g === current;
            const Icon = g.icon;
            return (
              <Pressable
                key={g.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => !active && onChange(g.sports[0]!)}
                style={({ pressed }) => ({
                  width: '48.5%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  minHeight: 56,
                  borderRadius: 16,
                  padding: 10,
                  borderWidth: active ? 1.5 : 1,
                  borderColor: active ? c.accent : c.line,
                  backgroundColor: active ? c.accentSoft : 'transparent',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? c.accent : c.surface2 }}>
                  <Icon size={20} color={active ? c.accentFg : c.fg2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" tone={active ? 'accent' : 'fg'} numberOfLines={1}>
                    {g.name}
                  </Txt>
                  {!!g.alias && (
                    <Txt variant="small" tone="muted" numberOfLines={1}>
                      {g.alias}
                    </Txt>
                  )}
                  {beta(g.sports) && (
                    <Txt variant="small" tone="muted">
                      Beta
                    </Txt>
                  )}
                </View>
                {active && <Check size={16} color={c.accent} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      {current && current.sports.length > 1 && (
        <View style={{ gap: 8 }}>
          <Txt variant="meta" tone="muted" style={{ fontFamily: font.medium }}>
            Modalidad
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {current.sports.map((id) => {
              const active = id === value;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => onChange(id)}
                  style={({ pressed }) => ({
                    width: '48.5%',
                    minHeight: 44,
                    borderRadius: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    backgroundColor: active ? c.accent : 'transparent',
                    borderWidth: active ? 0 : 1,
                    borderColor: c.line,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Txt variant="bodyStrong" style={{ color: active ? c.accentFg : c.fg2 }}>
                    {SPORTS[id].modality ?? SPORTS[id].label}
                  </Txt>
                  {status[id] === 'beta' && (
                    <Txt variant="small" style={{ color: active ? c.accentFg : c.muted }}>
                      Beta
                    </Txt>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={{ borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Txt variant="meta" tone="muted">
          {`El deporte no se cambia después de crear.${groups.some((g) => g.sports.some((id) => status[id] === 'beta')) ? ' Los que dicen «Beta» solo los puede crear el superadmin mientras se prueban.' : ''}`}
        </Txt>
      </View>
    </View>
  );
}

/**
 * «Logo (opcional)» (TeamLogoField de la web): la vista previa (el elegido, el de ahora o un cuadro vacío), «Elegir
 * logo» o «Cambiar» (galería) con la cámara al lado, y «Quitar». Se recorta al cuadrado del centro.
 */
export function SquadLogoField({
  value,
  onChange,
  squad,
  removed,
  onRemove,
}: {
  value: PickedLogo | null;
  onChange: (logo: PickedLogo | null) => void;
  squad: { logo: string | null; name: string; tag: string; color: string | null; sport: string };
  removed: boolean;
  onRemove: (removed: boolean) => void;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showCurrent = !value && !removed && !!squad.logo;

  async function pick(source: PhotoSource) {
    setBusy(true);
    setError(null);
    try {
      const picked = await pickSquadLogo(source);
      if (picked) {
        onChange(picked);
        onRemove(false);
      }
    } catch (e) {
      setError(logoErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Txt variant="bodyStrong" tone="fg2">
        Logo (opcional)
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: c.surface2, padding: 12 }}>
        {value ? (
          <Image source={{ uri: value.preview }} accessibilityIgnoresInvertColors style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.surface }} contentFit="cover" />
        ) : showCurrent ? (
          <SquadLogo squad={squad} size={56} />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}>
            <ImagePlus size={24} color={c.muted} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button loading={busy} icon={<ImageUp size={16} color={c.fg} />} onPress={() => void pick('library')} style={{ backgroundColor: c.surface }}>
            {busy ? 'Preparando…' : value || showCurrent ? 'Cambiar' : 'Elegir logo'}
          </Button>
          {!busy && <Button accessibilityLabel="Tomar una foto" icon={<Camera size={16} color={c.fg} />} onPress={() => void pick('camera')} style={{ backgroundColor: c.surface }} />}
          {(value || showCurrent) && !busy && (
            <Button variant="ghost" icon={<X size={16} color={c.fg} />} onPress={() => (value ? onChange(null) : onRemove(true))}>
              Quitar
            </Button>
          )}
        </View>
      </View>
      {error ? (
        <Txt variant="meta" tone="danger" accessibilityRole="alert">
          {error}
        </Txt>
      ) : (
        <Txt variant="meta" tone="muted">
          Se recorta al cuadrado del centro. Es una imagen pública.
        </Txt>
      )}
    </View>
  );
}
