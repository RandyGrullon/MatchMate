/**
 * Piezas chicas de Equipos (SquadBits, SquadFollowButton y SquadResultRow de la web, con su misma lógica:
 * src/components/squads/logic.ts): el color del equipo, su logo (o el tag en un círculo de su color), la fila de un
 * equipo, el estado de una liga, Seguir / Siguiendo, el ícono de una liga y la tarjeta de «no hay nada» (Quiet).
 *
 * El color: la app no tiene un tema por partes (la web pone las variables del color del equipo en un bloque), así que
 * lo del equipo que va en su color (el logo, la cabecera, la hoja de crear) lo pinta con `useSquadColors`; lo demás
 * sigue con el color del deporte activo.
 */
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { BellPlus, Check } from 'lucide-react-native';
import { getUserId } from '@mm/lib/data/client';
import { setSquadFollowing, squadErrorText, type SquadLite, type SquadRequestStatus } from '@mm/lib/data/squads';
import { useLogo } from '@mm/lib/logos';
import { brandColors } from '@mm/lib/theme';
import { sportMeta } from '@mm/sports/registry';
import { LEAGUE_STATUS_TEXT, LEAGUE_STATUS_TONE, squadLine, squadResultLine, squadTitle, validColor } from '@mm/components/squads/logic';
import { toast } from '../feedback';
import { Badge, ListRow, Txt } from '../ui';
import { colorsFor, useColors, useTheme } from '@/theme/theme';
import { font, type Colors } from '@/theme/tokens';

// ---------- Color ----------

/** Los colores con el acento del equipo (en claro y en oscuro, con el contraste de los del deporte); sin color, el del deporte. */
export function squadColors(isDark: boolean, color: string | null | undefined, sport: string): Colors {
  const base = colorsFor(isDark, sport);
  const hex = validColor(color);
  if (!hex) return base;
  const v = brandColors(hex)[isDark ? 'dark' : 'light'];
  return { ...base, accent: v.accent, accentFg: v.fg, accentSoft: v.soft };
}

export function useSquadColors(color: string | null | undefined, sport: string): Colors {
  const { isDark } = useTheme();
  return squadColors(isDark, color, sport);
}

// ---------- Ir ----------

/** La página del equipo (`/equipos/<id>`; `params`: `?invitar=1`, `?tab=`, `?jugador=`). */
export function openSquad(id: string, params: Record<string, string> = {}, replace = false) {
  const href = { pathname: '/equipos/[squadId]', params: { squadId: id, ...params } } as never;
  if (replace) router.replace(href);
  else router.push(href);
}

// ---------- Logo ----------

/** Tamaño de las letras del círculo (en el de 40 px) según cuántas son, como la web. */
const tagSize = (text: string) => (text.length <= 2 ? 15 : text.length === 3 ? 12.5 : text.length === 4 ? 10.5 : 9);

/** El logo del equipo (imagen pública del bucket `logos`) o, sin logo, su tag en un círculo de su color (o el de su deporte). */
export function SquadLogo({ squad, size = 40 }: { squad: Pick<SquadLite, 'logo' | 'name' | 'tag' | 'color' | 'sport'>; size?: number }) {
  const c = useSquadColors(squad.color, squad.sport);
  const { url, pending } = useLogo(squad.logo);
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (url) return <Image source={{ uri: url }} accessibilityIgnoresInvertColors style={[box, { backgroundColor: c.surface2 }]} contentFit="cover" />;
  if (pending) return <View style={[box, { backgroundColor: c.surface2 }]} />;
  const text = (squad.tag || squad.name.slice(0, 2)).toUpperCase().slice(0, 5) || '?';
  return (
    <View importantForAccessibility="no-hide-descendants" style={[box, { backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }]}>
      <Txt numberOfLines={1} style={{ color: c.accentFg, fontFamily: font.bold, fontSize: (tagSize(text) * size) / 40 }}>
        {text}
      </Txt>
    </View>
  );
}

/** El logo de una liga o, sin logo, el ícono de su deporte en su color (LeagueTile de la web). */
export function LeagueMark({ sport, logo, size = 40 }: { sport: string; logo: string | null; size?: number }) {
  const { isDark } = useTheme();
  const c = colorsFor(isDark, sport);
  const { url } = useLogo(logo);
  const Icon = sportMeta(sport)?.icon;
  const box = { width: size, height: size, borderRadius: 12 };
  if (url) return <Image source={{ uri: url }} accessibilityIgnoresInvertColors style={[box, { backgroundColor: c.surface2 }]} contentFit="cover" />;
  return <View style={[box, { backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>{Icon ? <Icon size={Math.round(size / 2)} color={c.accent} /> : null}</View>;
}

// ---------- Filas ----------

/** Un equipo en una lista: su logo, «Nombre [TAG]», su línea y lo de la derecha. Toda la fila abre el equipo. */
export function SquadRow({ squad, subtitle, right }: { squad: SquadLite; subtitle?: string; right?: ReactNode }) {
  const row = <ListRow icon={<SquadLogo squad={squad} />} title={squadTitle(squad)} subtitle={subtitle ?? (squadLine(squad) || null)} chevron={!right} onPress={() => openSquad(squad.id)} />;
  if (!right) return row;
  // Lo de la derecha (Seguir…) va al lado de la fila, no dentro: un botón no puede ir dentro de otro.
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 16 }}>
      <View style={{ flex: 1, minWidth: 0 }}>{row}</View>
      {right}
    </View>
  );
}

/** Un equipo encontrado: «Equipo · Fútbol · … · Busca jugadores» y, a la derecha, «Tu equipo» o Seguir / Siguiendo. */
export function SquadResultRow({ squad, mine, following }: { squad: SquadLite; mine: boolean; following: boolean }) {
  return (
    <SquadRow
      squad={squad}
      subtitle={squadResultLine(squad)}
      right={mine ? <Badge tone="accent">Tu equipo</Badge> : <SquadFollowButton squadId={squad.id} name={squad.name} following={following} size="sm" />}
    />
  );
}

const BADGE_TONE = { warn: 'warn', ok: 'ok', danger: 'danger', neutral: 'muted' } as const;

/** «Pendiente» (ámbar), «Aceptado» (verde), «Rechazado» (rojo). */
export function LeagueStatusBadge({ status }: { status: SquadRequestStatus }) {
  return <Badge tone={BADGE_TONE[LEAGUE_STATUS_TONE[status]]}>{LEAGUE_STATUS_TEXT[status]}</Badge>;
}

/** «No hay nada» (Quiet de la web): el ícono, el título y una línea. */
export function Quiet({ icon, title, text }: { icon: ReactNode; title: string; text?: string }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingVertical: 28, borderRadius: 22, backgroundColor: c.surface }}>
      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>{icon}</View>
      <Txt variant="bodyStrong" style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {!!text && (
        <Txt variant="meta" tone="muted" style={{ textAlign: 'center', maxWidth: 320 }}>
          {text}
        </Txt>
      )}
    </View>
  );
}

// ---------- Seguir ----------

/**
 * Seguir / Siguiendo un equipo (SquadFollowButton de la web): sus publicaciones salen en tu Social. El cambio se ve al
 * momento y se queda mientras el equipo diga lo de antes; si falla, sale el error y vuelve lo de antes. Sin cuenta,
 * lleva a entrar. Nunca se muestra a sus miembros (ya lo ven).
 */
export function SquadFollowButton({ squadId, following, name, size = 'md', full }: { squadId: string; following: boolean; name?: string; size?: 'sm' | 'md'; full?: boolean }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  // Lo tocado (y lo que decía el equipo al tocar): se ve hasta que llega algo distinto de lo de antes.
  const [shown, setShown] = useState<{ value: boolean; from: boolean } | null>(null);
  const on = shown && (busy || following === shown.from) ? shown.value : following;

  async function toggle() {
    if (busy) return;
    if (!getUserId()) {
      router.push('/login');
      return;
    }
    const next = !on;
    const from = following;
    setBusy(true);
    setShown({ value: next, from });
    try {
      const res = await setSquadFollowing(squadId, next);
      setShown({ value: res.following, from });
      toast(res.following ? `Sigues a ${name ?? 'este equipo'}: sus publicaciones salen en Social` : `Ya no sigues a ${name ?? 'este equipo'}`);
    } catch (e) {
      setShown(null);
      toast(squadErrorText(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const fg = on ? c.fg : c.accentFg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on, busy }}
      accessibilityLabel={name ? `${on ? 'Dejar de seguir' : 'Seguir'} ${name}` : undefined}
      accessibilityHint={on ? 'Toca para dejar de seguir' : 'Sus publicaciones salen en tu Social'}
      disabled={busy}
      onPress={() => void toggle()}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: full ? 48 : 44,
        paddingHorizontal: size === 'sm' ? 12 : 20,
        borderRadius: full ? 14 : 22,
        alignSelf: full ? 'stretch' : 'auto',
        backgroundColor: on ? c.surface : c.accent,
        borderWidth: on ? 1 : 0,
        borderColor: c.line,
        opacity: busy ? 0.8 : pressed ? 0.85 : 1,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : on ? <Check size={16} color={fg} /> : <BellPlus size={16} color={fg} />}
      <Txt style={{ color: fg, fontFamily: font.semibold, fontSize: full ? 16 : 14 }}>{on ? 'Siguiendo' : 'Seguir'}</Txt>
    </Pressable>
  );
}
