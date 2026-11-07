/**
 * Piezas de las pantallas de golf de la app (las de bits.tsx, FieldChrome y YoStats de la web, con React Native): hacer
 * algo con el servidor y avisar, la salida (tees) para elegir, de dónde sale el handicap, los números en su cuadrícula,
 * el selector con ‹ › y «•••».
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Ellipsis, Plus } from 'lucide-react-native';
import { handicapFor } from '@mm/sports/golf/course';
import type { GolfRoundFull } from '@mm/lib/data/golf';
import { saveErrorMessage } from '@mm/lib/errorText';
import { hcpText, indexText } from '@mm/pages/sports/golf/logic';
import type { GolfNumber } from '@mm/pages/sports/golf/profile';
import { toast } from '@/components/feedback';
import { Card, ChoiceRow, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Lo que tarda una hoja en irse: lo que se abre después (otra pantalla, otra hoja) espera a que se vaya. */
export const SHEET_CLOSE_MS = 400;

/** Hace algo con el servidor y avisa (useAction de la web): el aviso de listo, o el error con el texto de siempre. */
export async function golfAction<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (ok) toast(ok);
    return r;
  } catch (e) {
    toast(saveErrorMessage(e), 'error');
    return undefined;
  }
}

/** Abre una ronda (con `tab`: «tarjeta», «leaderboard» o «jugadores», el ?tab= de la web). */
export const openRound = (lid: string, eventId: string, tab?: string) =>
  router.push({ pathname: '/l/[lid]/e/[eventId]', params: tab ? { lid, eventId, tab } : { lid, eventId } });

/** Abre la página de golf de un jugador (/l/<liga>/j/<jugador>, como la web). */
export const openGolfer = (lid: string, playerId: string) => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId } });

/** Organizar › Campos (`/l/<liga>/admin?tab=campos` en la web). */
export const openCourses = (lid: string) => router.push({ pathname: '/l/[lid]/campos', params: { lid } } as never);

/** De dónde sale el handicap (HcpExplain de la web): Index → handicap de campo → handicap de juego. */
export function hcpLine(round: GolfRoundFull, teeId: string, index: number | null): string | null {
  if (index == null) return 'Sin Index: juega con handicap 0 (en neto cuenta como bruto).';
  try {
    const info = handicapFor(index, round.course, teeId, { nine: round.nine, allowance: round.competition.allowance });
    return `Index ${indexText(index)} (no oficial) → handicap de campo ${hcpText(info.courseHcpRounded)} → handicap de juego ${hcpText(info.playingHcp)} (${info.allowance} %)${info.holes === 9 ? ', a 9 hoyos' : ''}${info.estimated ? '. Rating de 9 hoyos estimado.' : '.'}`;
  } catch {
    return null;
  }
}

/** La salida (tees) para elegir (TeeSelect de la web): nombre, rating / slope y par. */
export function TeePicker({ round, value, onChange, disabled }: { round: GolfRoundFull; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <Card padded={false} style={{ gap: 6, backgroundColor: 'transparent', opacity: disabled ? 0.6 : 1 }}>
      {round.course.tees.map((t) => (
        <ChoiceRow key={t.id} title={t.name} subtitle={`${t.rating} / ${t.slope} · par ${t.par}`} selected={t.id === value} onPress={() => !disabled && onChange(t.id)} />
      ))}
    </Card>
  );
}

/** Los números en una cuadrícula de 3 (NumbersGrid de la web): el valor grande y su nombre debajo. */
export function NumbersGrid({ items }: { items: readonly GolfNumber[] }) {
  const c = useColors();
  return (
    <Card padded={false}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {items.map((it, i) => (
          <View
            key={it.label}
            accessible
            accessibilityLabel={`${it.label}: ${it.value}`}
            style={[
              styles.cell,
              i >= 3 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
              i % 3 !== 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.line },
            ]}
          >
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12, fontFamily: font.medium }}>
              {it.label}
            </Txt>
            <Txt style={{ fontFamily: font.bold, fontSize: 25, lineHeight: 29, color: it.accent ? c.accent : c.fg }}>{String(it.value)}</Txt>
          </View>
        ))}
      </View>
    </Card>
  );
}

/**
 * Elegir uno de una lista corta con ‹ › (el <select> de la web en una fila): el grupo de un jugador, el hoyo de salida
 * de un grupo, el par de un hoyo. `label`: para quien usa el lector de pantalla.
 */
export function Stepper<T>({ options, value, onChange, text, label, disabled }: { options: readonly T[]; value: T; onChange: (v: T) => void; text: (v: T) => string; label: string; disabled?: boolean }) {
  const c = useColors();
  const at = Math.max(0, options.indexOf(value));
  const move = (n: number) => onChange(options[Math.min(options.length - 1, Math.max(0, at + n))]);
  const btn = (a11y: string, n: number, child: ReactNode, off: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${a11y}`}
      accessibilityState={{ disabled: off }}
      disabled={off}
      hitSlop={4}
      onPress={() => move(n)}
      style={[styles.stepBtn, { backgroundColor: c.surface2, opacity: off ? 0.35 : 1 }]}
    >
      {child}
    </Pressable>
  );
  return (
    <View accessibilityLabel={`${label}: ${text(value)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {btn('anterior', -1, <ChevronLeft size={18} color={c.fg} />, !!disabled || at === 0)}
      <Txt variant="bodyStrong" numberOfLines={1} style={{ minWidth: 86, textAlign: 'center', fontSize: 15 }}>
        {text(value)}
      </Txt>
      {btn('siguiente', 1, <ChevronRight size={18} color={c.fg} />, !!disabled || at >= options.length - 1)}
    </View>
  );
}

/** «•••» arriba de la ronda (MoreButton de la web). */
export function MoreButton({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={4} onPress={onPress} style={[styles.more, { backgroundColor: c.surface2 }]}>
      <Ellipsis size={22} color={c.fg2} strokeWidth={2.4} />
    </Pressable>
  );
}

/** «+ Agregar» (o «+ Nueva») a la derecha del título de una sección (SectionAdd de la web). */
export function SectionAdd({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36 }}>
      <Plus size={18} color={c.accent} strokeWidth={2.4} />
      <Txt tone="accent" variant="bodyStrong">
        {label}
      </Txt>
    </Pressable>
  );
}

/** Un link dentro de un texto (el <Link> de la web): en el color del deporte. */
export function TextLink({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Txt accessibilityRole="link" tone="accent" onPress={onPress} style={{ fontFamily: font.semibold, textDecorationLine: 'underline' }}>
      {children}
    </Txt>
  );
}

const styles = StyleSheet.create({
  cell: { width: '33.333%', paddingHorizontal: 14, paddingVertical: 13, gap: 3 },
  stepBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
