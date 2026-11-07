/**
 * Piezas de la mesa anotadora de los deportes de equipo en la app (ScorerPieces.tsx de la web): la cabecera con el
 * marcador grande, el botón grande (+1, +2, GOL, Falta) que cuenta un toque una sola vez y vibra, los puntos de faltas,
 * el botón de un dorsal y la tarjeta amarilla o roja dibujada. Las arma cada deporte dentro de CourtShell.
 */
import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Txt } from '../../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Un toque cuenta una vez: dos toques en menos de esto son uno. */
const GUARD_MS = 280;

function useGuardedTap(fn: () => void): () => void {
  const last = useRef(0);
  return () => {
    const now = Date.now();
    if (now - last.current < GUARD_MS) return;
    last.current = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    fn();
  };
}

export interface HeaderSide {
  name: string;
  color: string;
  score: number;
  /** Línea chica: faltas, bonus, tiempos muertos. */
  sub?: ReactNode;
}

/** Cabecera de la mesa: los dos equipos con el punto de su color y el marcador grande; en el centro, periodo y reloj. */
export function ScoreHeader({ a, b, center }: { a: HeaderSide; b: HeaderSide; center?: ReactNode }) {
  const c = useColors();
  const side = (s: HeaderSide, right: boolean) => (
    <View style={{ flex: 1, minWidth: 0, gap: 4, alignItems: right ? 'flex-end' : 'flex-start' }}>
      <View style={{ flexDirection: right ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' }} />
        <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1, fontSize: 15 }}>
          {s.name}
        </Txt>
      </View>
      <Txt accessibilityLiveRegion="polite" style={{ fontFamily: font.bold, fontSize: 52, lineHeight: 54, fontVariant: ['tabular-nums'] }}>
        {s.score}
      </Txt>
      {s.sub != null && <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, justifyContent: right ? 'flex-end' : 'flex-start' }}>{s.sub}</View>}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 24, backgroundColor: c.surface, paddingHorizontal: 16, paddingVertical: 12 }}>
      {side(a, false)}
      {center != null && <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 2 }}>{center}</View>}
      {side(b, true)}
    </View>
  );
}

/** Una línea chica de la cabecera (faltas, TM). */
export function SubText({ children, tone = 'muted', strong }: { children: ReactNode; tone?: 'muted' | 'danger' | 'accent'; strong?: boolean }) {
  return (
    <Txt variant="small" tone={tone} style={{ fontSize: 13, fontFamily: strong ? font.bold : font.medium, fontVariant: ['tabular-nums'] }}>
      {children}
    </Txt>
  );
}

export type BigTone = 'default' | 'accent' | 'warn' | 'team';

/** Botón grande de la mesa (+1, +2, +3, Falta, GOL). Con `tone="team"`, el color del equipo en `bg` y `fg`. */
export function BigButton({
  children,
  onTap,
  disabled,
  tone = 'default',
  ariaLabel,
  bg,
  fg,
  minHeight = 56,
  fontSize = 26,
  style,
}: {
  children: ReactNode;
  onTap: () => void;
  disabled?: boolean;
  tone?: BigTone;
  ariaLabel?: string;
  bg?: string;
  fg?: string;
  minHeight?: number;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const guarded = useGuardedTap(onTap);
  const colors = { default: [c.surface2, c.fg], accent: [c.accent, c.accentFg], warn: [c.warnSoft, c.warn], team: [bg ?? c.surface2, fg ?? c.fg] }[tone];
  const color = colors[1];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ariaLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={guarded}
      style={({ pressed }) => [
        {
          minHeight,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          paddingHorizontal: 8,
          borderRadius: 18,
          backgroundColor: colors[0],
          borderWidth: tone === 'team' ? StyleSheet.hairlineWidth : 0,
          borderColor: 'rgba(0,0,0,0.08)',
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {typeof children === 'string' || typeof children === 'number' ? <Txt style={{ color, fontFamily: font.bold, fontSize, lineHeight: fontSize + 4, fontVariant: ['tabular-nums'] }}>{children}</Txt> : children}
    </Pressable>
  );
}

/** El texto de un botón grande cuando lleva ícono (con el color que toca). */
export function BigText({ children, color, size = 26 }: { children: ReactNode; color: string; size?: number }) {
  return <Txt style={{ color, fontFamily: font.bold, fontSize: size, lineHeight: size + 4 }}>{children}</Txt>;
}

/** Puntos de faltas: llenos las que tiene; amarillo en el aviso, rojo si salió. Sin tope, «3 F». */
export function FoulDots({ fouls, max, state }: { fouls: number; max: number | null; state: 'ok' | 'warn' | 'out' }) {
  const c = useColors();
  if (max === null) return fouls ? <Txt style={{ fontSize: 11, fontFamily: font.semibold, color: c.muted }}>{`${fouls} F`}</Txt> : null;
  const on = state === 'out' ? c.danger : state === 'warn' ? c.warn : c.fg;
  return (
    <View accessibilityLabel={`${fouls} faltas`} style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: max }, (_, i) => (
        <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i < fouls ? on : c.faint, opacity: i < fouls ? 1 : 0.4 }} />
      ))}
    </View>
  );
}

/** Botón de un dorsal: número grande, nombre corto, lo suyo (puntos, goles, tarjetas) y faltas. Seleccionado: borde del color. */
export function JerseyButton({
  jersey,
  name,
  stat,
  fouls,
  foulMax,
  state,
  selected,
  color,
  onTap,
  disabled,
  dim,
}: {
  jersey: number | null;
  name: string;
  /** «12 pts», «1 G». */
  stat?: ReactNode;
  fouls: number;
  foulMax: number | null;
  state: 'ok' | 'warn' | 'out';
  selected?: boolean;
  color: string;
  onTap: () => void;
  disabled?: boolean;
  /** En el banco o ya salió (más clarito). */
  dim?: boolean;
}) {
  const c = useColors();
  const guarded = useGuardedTap(onTap);
  const bg = selected ? c.surface : state === 'warn' ? c.warnSoft : state === 'out' ? c.dangerSoft : c.surface2;
  const fg = selected ? c.fg : state === 'warn' ? c.warn : state === 'out' ? c.danger : c.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={`${jersey != null ? `Dorsal ${jersey}, ` : ''}${name}${state === 'out' ? ', fuera del juego' : state === 'warn' ? ', una falta más y sale' : ''}`}
      disabled={disabled}
      onPress={guarded}
      style={({ pressed }) => ({
        minHeight: 64,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        paddingHorizontal: 4,
        paddingVertical: 4,
        borderRadius: 16,
        backgroundColor: bg,
        borderWidth: selected ? 2.5 : 0,
        borderColor: selected ? color : 'transparent',
        opacity: disabled ? 0.4 : dim ? 0.6 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Txt style={{ fontFamily: font.bold, fontSize: 22, lineHeight: 24, color: fg, fontVariant: ['tabular-nums'] }}>{jersey ?? '–'}</Txt>
      <Txt numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 11, lineHeight: 13, color: fg, maxWidth: '100%' }}>
        {name}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {stat}
        <FoulDots fouls={fouls} max={foulMax} state={state} />
      </View>
      {state === 'out' && <Txt style={{ fontSize: 10, fontFamily: font.bold, color: c.danger, textTransform: 'uppercase' }}>Fuera</Txt>}
    </Pressable>
  );
}

/** Lo de un dorsal debajo del nombre («12 pts», «1 G»). */
export function StatText({ children, strong }: { children: ReactNode; strong?: boolean }) {
  const c = useColors();
  return <Txt style={{ fontSize: 11, lineHeight: 13, fontFamily: strong ? font.bold : font.medium, color: strong ? c.fg : c.muted, fontVariant: ['tabular-nums'] }}>{children}</Txt>;
}

const YELLOW = '#facc15';
const RED = '#dc2626';

/** Tarjeta amarilla, roja o doble amarilla (CardIcon de la web). */
export function CardIcon({ kind, scale = 1 }: { kind: 'yellow' | 'second_yellow' | 'red'; scale?: number }) {
  const w = 10 * scale;
  const h = 14 * scale;
  const card = (color: string, extra?: ViewStyle) => <View style={[{ width: w, height: h, borderRadius: 2, backgroundColor: color, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' }, extra]} />;
  if (kind === 'second_yellow') {
    return (
      <View accessibilityLabel="Doble amarilla" style={{ width: w + 4 * scale, height: h + 2 * scale }}>
        {card(YELLOW, { position: 'absolute', left: 0, top: 0 })}
        {card(RED, { position: 'absolute', right: 0, bottom: 0 })}
      </View>
    );
  }
  return <View accessibilityLabel={kind === 'yellow' ? 'Amarilla' : 'Roja'}>{card(kind === 'yellow' ? YELLOW : RED)}</View>;
}
