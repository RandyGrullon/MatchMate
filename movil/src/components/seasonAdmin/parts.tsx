/**
 * Piezas de Organizar › Temporada y fechas: la cabeza de una temporada (SeasonHead de la web), una fecha que se puede
 * dejar vacía (el <input type="date"> opcional de la web) y a quién va un premio (el <select> con «Nadie», los equipos
 * o parejas y los jugadores).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarRange, ChevronDown, ChevronUp, Trophy, X } from 'lucide-react-native';
import type { Season } from '@mm/lib/seasons';
import { seasonChampion, seasonHeadDates } from '@mm/components/season/adminLogic';
import { playerRef, teamRef, type AwardRef, type Awardee } from '@mm/components/season/logic';
import { DateStepper } from '@/components/DateStepper';
import { Badge, ChoiceRow, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/** La temporada con su ícono, «En curso» o «Cerrada», sus fechas y, si ya tiene, su campeón. */
export function SeasonHead({ season }: { season: Season }) {
  const c = useColors();
  const champion = seasonChampion(season);
  const active = season.status === 'active';
  const Icon = active ? CalendarRange : Trophy;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={c.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {season.name}
          </Txt>
          <Badge tone={active ? 'accent' : 'muted'}>{active ? 'En curso' : 'Cerrada'}</Badge>
        </View>
        <Txt tone="muted" style={{ fontSize: 12 }}>
          {seasonHeadDates(season)}
        </Txt>
        {champion && (
          <Txt numberOfLines={1} style={{ fontSize: 14, marginTop: 2 }}>
            {`Campeón: ${champion.name}`}
          </Txt>
        )}
      </View>
    </View>
  );
}

/**
 * Una fecha que se puede dejar sin poner (el <input type="date"> opcional de la web): sin fecha, «—» y tocarla pone
 * `start` (o `min` si es antes); con fecha, «‹ ›» y «−7 / +7» (desde `min`) y la X para quitarla.
 */
export function OptionalDayField({ label, value, min, start, onChange }: { label: string; value: string; min?: string; start: string; onChange: (v: string) => void }) {
  const c = useColors();
  if (!value) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onChange(min && start < min ? min : start)}
        style={({ pressed }) => [styles.empty, { borderColor: c.line, backgroundColor: pressed ? c.surface2 : c.surface }]}
      >
        <Txt variant="bodyStrong" tone="muted">
          —
        </Txt>
      </Pressable>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <DateStepper value={value} min={min} onChange={onChange} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Borrar" hitSlop={4} onPress={() => onChange('')} style={[styles.clear, { backgroundColor: c.surface2 }]}>
        <X size={18} color={c.muted} />
      </Pressable>
    </View>
  );
}

/**
 * A quién va un premio (AwardeeSelect de la web): «Nadie», los equipos (o parejas) y los jugadores. La elegida en una
 * caja y, al tocarla, las opciones debajo por grupo (como PickField de Jugadores).
 */
export function AwardeePick({
  value,
  onChange,
  teams,
  players,
  label,
  teamWord,
}: {
  value: AwardRef;
  onChange: (v: AwardRef) => void;
  teams: readonly Awardee[];
  players: readonly Awardee[];
  /** Para el lector de pantalla (el aria-label de la web). */
  label: string;
  teamWord: string;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const groups = [
    { title: teamWord, options: teams.map((t) => ({ key: teamRef(t.id), label: t.name })) },
    { title: 'Jugadores', options: players.map((p) => ({ key: playerRef(p.id), label: p.name })) },
  ].filter((g) => g.options.length > 0);
  const current = groups.flatMap((g) => g.options).find((o) => o.key === value)?.label ?? 'Nadie';
  const Icon = open ? ChevronUp : ChevronDown;
  const pick = (v: AwardRef) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[styles.box, { backgroundColor: c.surface2 }]}
      >
        <Txt numberOfLines={1} style={{ flex: 1, fontSize: 17, fontFamily: font.medium }}>
          {current}
        </Txt>
        <Icon size={20} color={c.muted} />
      </Pressable>
      {open && (
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: 6 }}>
          <ChoiceRow title="Nadie" selected={!value} onPress={() => pick('')} />
          {groups.map((g) => (
            <View key={g.title} style={{ gap: 6 }}>
              <Txt tone="muted" accessibilityRole="header" style={{ marginTop: 6, marginLeft: 4, fontSize: 13, fontFamily: font.semibold }}>
                {g.title}
              </Txt>
              {g.options.map((o) => (
                <ChoiceRow key={o.key} title={o.label} selected={o.key === value} onPress={() => pick(o.key)} />
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { height: 58, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  clear: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  box: { minHeight: 56, borderRadius: radius.btn, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
