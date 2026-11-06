/**
 * Piezas de las pantallas de natación en la app (las de bits.tsx, FieldChrome y ranking/parts de la web, con React
 * Native): el club con su color, el tiempo, DQ/DNS/DNF, «Tú», el número en su caja, el selector en píldora, las
 * pestañas, «•••» con su hoja, «Ver las 8», la ficha de una marca y los puntos por club.
 */
import { Children, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronDown, ChevronRight, Ellipsis, type LucideIcon } from 'lucide-react-native';
import type { SwimClub } from '@mm/lib/data/swimming';
import { saveErrorMessage } from '@mm/lib/errorText';
import { formatDate } from '@mm/lib/format';
import { formatSwimTime, STATUS_LABEL, STROKE_LABEL, type PersonalBest, type SwimStatus, type TeamScore } from '@mm/sports/swimming';
import { pointsText } from '@mm/pages/sports/swimming/logic';
import { toast } from '@/components/feedback';
import { Badge, Card, ChoiceRow, SectionHeader, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/** Abre un encuentro (con `ver`, una de sus partes: «cronometro», «resultados», «puntos»…, el ?ver= de la web). */
export const openMeet = (lid: string, eventId: string, ver?: string) =>
  router.push({ pathname: '/l/[lid]/e/[eventId]', params: ver ? { lid, eventId, ver } : { lid, eventId } });

/** Abre la página de un nadador (/l/<liga>/j/<jugador>, como la web). */
export const openSwimmer = (lid: string, playerId: string) => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId } });

/** Hace algo con el servidor y avisa (useAction de la web): el aviso de listo, o el error con el texto de siempre. */
export async function runAction<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (ok) toast(ok);
    return r;
  } catch (e) {
    toast(saveErrorMessage(e), 'error');
    return undefined;
  }
}

/** Tiempo m:ss.hh (o «NT», o lo que diga `empty`), como TimeText de la web. */
export const swimTime = (cs: number | null | undefined, empty = 'NT') => (cs ? formatSwimTime(cs) : empty);

/** Club con su color (o nada si no tiene). `short` = la sigla si hay. */
export function ClubTag({ club, short, size = 12 }: { club: SwimClub | null | undefined; short?: boolean; size?: number }) {
  const c = useColors();
  if (!club) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0, flexShrink: 1 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: club.color ?? c.line }} />
      <Txt tone="muted" numberOfLines={1} style={{ fontSize: size, flexShrink: 1 }}>
        {short && club.short ? club.short : club.name}
      </Txt>
    </View>
  );
}

export function StatusBadge({ status }: { status: SwimStatus }) {
  if (status === 'ok') return null;
  return <Badge tone={status === 'dq' ? 'danger' : 'warn'}>{status === 'dq' ? 'DQ' : STATUS_LABEL[status]}</Badge>;
}

/** «Tú» junto al nombre (TuTag de la web). */
export function TuTag() {
  const c = useColors();
  return (
    <View style={{ borderRadius: radius.pill, paddingHorizontal: 6, height: 18, justifyContent: 'center', backgroundColor: c.accentSoft }}>
      <Txt tone="accent" style={{ fontSize: 11, fontFamily: font.semibold }}>
        Tú
      </Txt>
    </View>
  );
}

/** El número de la prueba (o del carril) en su caja, al principio de la fila. */
export function NumBox({ n, on, strong }: { n: number; on?: boolean; strong?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.numBox, { backgroundColor: strong ? c.accent : on ? c.accentSoft : c.surface2 }]}>
      <Txt style={{ fontFamily: font.bold, fontSize: 17, color: strong ? c.accentFg : on ? c.accent : c.fg2 }}>{n}</Txt>
    </View>
  );
}

/** El puesto al principio de la fila (PosNum de la web). */
export function PosNum({ pos }: { pos: number | null }) {
  const c = useColors();
  return <Txt style={{ width: 18, textAlign: 'center', fontFamily: font.semibold, fontSize: 15, color: pos == null ? c.faint : c.muted }}>{pos == null ? '–' : pos}</Txt>;
}

/** Filas dentro de una tarjeta, con la raya fina entre una y otra. */
export function Lines({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <Card padded={false}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
          {child}
        </View>
      ))}
    </Card>
  );
}

export interface PillOption<K extends string> {
  key: K;
  label: string;
}

/**
 * Elegir una opción en una píldora (PillSelect de la web): «Todas las pruebas ▾». Al tocarla, una hoja con las opciones.
 * Con una sola opción solo se ve su nombre.
 */
export function PillPicker<K extends string>({ options, value, onChange, label }: { options: readonly PillOption<K>[]; value: K; onChange: (key: K) => void; label: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value) ?? options[0];
  if (!current) return null;
  const pill = (
    <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 14, flexShrink: 1 }}>
      {current.label}
    </Txt>
  );
  if (options.length < 2) return <View style={[styles.pill, { backgroundColor: c.surface2 }]}>{pill}</View>;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current.label}`} onPress={() => setOpen(true)} style={[styles.pill, { backgroundColor: c.surface2 }]}>
        {pill}
        <ChevronDown size={16} color={c.muted} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        {options.map((o) => (
          <ChoiceRow
            key={o.key}
            title={o.label}
            selected={o.key === value}
            onPress={() => {
              onChange(o.key);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

/** Más de 3 partes (las pestañas de la web): una fila de píldoras que se desliza. */
export function TabStrip<K extends string>({ items, active, onChange, label }: { items: readonly PillOption<K>[]; active: K; onChange: (key: K) => void; label: string }) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel={label} contentContainerStyle={{ gap: 6 }}>
      {items.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t.key)}
            style={[styles.tab, { backgroundColor: on ? c.accent : c.surface2 }]}
          >
            <Txt style={{ fontFamily: font.semibold, fontSize: 15, color: on ? c.accentFg : c.fg2 }}>{t.label}</Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** «•••» arriba del encuentro (MoreButton de la web). */
export function MoreButton({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={4} onPress={onPress} style={[styles.more, { backgroundColor: c.surface2 }]}>
      <Ellipsis size={22} color={c.fg2} strokeWidth={2.4} />
    </Pressable>
  );
}

export interface MenuItem {
  key: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  onPress: () => void;
}

/** La hoja de «•••» (EventMenu de la web): cada opción con su ícono, su nombre y la línea de abajo. */
export function MenuSheet({ open, onClose, title, items }: { open: boolean; onClose: () => void; title: string; items: readonly MenuItem[] }) {
  const c = useColors();
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={it.hint ? `${it.label}. ${it.hint}` : it.label}
            onPress={it.onPress}
            style={({ pressed }) => [styles.menuRow, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
          >
            <View style={[styles.menuIcon, { backgroundColor: c.surface2 }]}>
              <Icon size={20} color={c.fg2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {it.label}
              </Txt>
              {!!it.hint && (
                <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
                  {it.hint}
                </Txt>
              )}
            </View>
            <ChevronRight size={20} color={c.faint} />
          </Pressable>
        );
      })}
    </Sheet>
  );
}

/** Las primeras `max` y, si hay más, «Ver las 8» debajo (ShowMore de la web: se abren ahí mismo). */
export function ShowMore<T>({ items, max = 3, noun, render }: { items: readonly T[]; max?: number; noun: string; render: (shown: readonly T[]) => ReactNode }) {
  const c = useColors();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, max);
  return (
    <>
      {render(shown)}
      {items.length > max && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: all }}
          onPress={() => setAll(!all)}
          style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12 }}
        >
          <Txt tone="accent" style={{ fontFamily: font.medium, fontSize: 14 }}>
            {all ? 'Ver menos' : `Ver ${items.length === 1 ? 'la otra' : `las ${items.length}`} ${noun}`}
          </Txt>
          <ChevronDown size={16} color={c.accent} style={all ? { transform: [{ rotate: '180deg' }] } : undefined} />
        </Pressable>
      )}
    </>
  );
}

/**
 * Una marca personal como ficha (BestTile de la web): la prueba y la piscina arriba (sin la piscina con `hidePool`), el
 * tiempo grande y el día. `raised`: sobre el fondo de la pantalla (blanca); si no, gris.
 */
export function BestTile({ best, onPress, active, raised, hidePool }: { best: PersonalBest; onPress?: () => void; active?: boolean; raised?: boolean; hidePool?: boolean }) {
  const c = useColors();
  const label = `${best.distance} m ${STROKE_LABEL[best.stroke]}${hidePool ? '' : ` · ${best.pool} m`}`;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: !!active } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.tile,
        { backgroundColor: active ? c.accentSoft : raised ? c.surface : c.surface2, borderColor: active ? c.accent : 'transparent' },
      ]}
    >
      <Txt numberOfLines={1} style={{ fontSize: 13, fontFamily: font.medium, color: active ? c.accent : c.muted }}>
        {label}
      </Txt>
      <Txt style={{ fontFamily: font.bold, fontSize: 24, lineHeight: 28, marginTop: 6, fontVariant: ['tabular-nums'] }}>{swimTime(best.best)}</Txt>
      <Txt tone="muted" style={{ fontSize: 12, marginTop: 4 }}>
        {formatDate(best.date)}
      </Txt>
    </Pressable>
  );
}

/** Las fichas de dos en dos. */
export function TileGrid({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={{ width: '48.5%', flexGrow: 1 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function MedalDots({ gold, silver, bronze }: { gold: number; silver: number; bronze: number }) {
  const c = useColors();
  const dot = (n: number, color: string, label: string) => (
    <View accessible accessibilityLabel={`${n} de ${label}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Txt tone="muted" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>
        {n}
      </Txt>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {dot(gold, c.gold, 'oro')}
      {dot(silver, c.silver, 'plata')}
      {dot(bronze, c.bronze, 'bronce')}
    </View>
  );
}

/** Los clubes por puntos (ClubPointsCard de la web): el puesto, el club con su color y sus medallas, los puntos en grande. */
export function ClubPointsCard({
  rows,
  clubs,
  caption,
  title = 'Puntos por club',
}: {
  rows: (Pick<TeamScore, 'points' | 'gold' | 'silver' | 'bronze' | 'rank'> & { teamId?: string; clubId?: string })[];
  clubs: Map<string, SwimClub>;
  caption?: string;
  title?: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={title} />
      <Lines>
        {rows.map((r) => {
          const id = r.teamId ?? r.clubId ?? '';
          const club = clubs.get(id) ?? { id, name: '(club borrado)', short: '', color: null, coachId: null };
          return (
            <View key={id} style={styles.pointsRow}>
              <PosNum pos={r.rank} />
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: club.color ?? c.line }} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {club.name}
                </Txt>
                <MedalDots gold={r.gold} silver={r.silver} bronze={r.bronze} />
              </View>
              <Txt style={{ fontFamily: font.bold, fontSize: 22, fontVariant: ['tabular-nums'] }}>{pointsText(r.points)}</Txt>
            </View>
          );
        })}
      </Lines>
      {!!caption && (
        <Txt tone="muted" style={{ fontSize: 12.5, marginHorizontal: 4 }}>
          {caption}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  numBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, borderRadius: radius.pill, paddingLeft: 13, paddingRight: 12, alignSelf: 'flex-start', maxWidth: '100%' },
  tab: { height: 40, borderRadius: radius.pill, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 8 },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tile: { borderRadius: radius.tile, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1.5 },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 10, paddingLeft: 16, paddingRight: 20 },
});
