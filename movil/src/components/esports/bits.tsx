/**
 * Piezas chicas de esports (src/components/esports/bits.tsx de la web, §11.4) con los mismos textos y tonos
 * (src/pages/esports/chips.ts): el monograma del juego, el rango, el ID, el estado de la inscripción, la fase del torneo,
 * el logo del equipo, las iniciales de un inscrito y el aviso de la pantalla (NoticeSlot de la web: uno solo, el más
 * importante que no se haya cerrado).
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, View, type StyleProp, type TextStyle } from 'react-native';
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import type { EntryStatus } from '@mm/lib/data/esports';
import { useLogo } from '@mm/lib/logos';
import { useIsPro } from '@mm/lib/useMode';
import { dismissedFor, dismissedSnapshot, dismissNotice, pickEntry, subscribeNotices, type Notice } from '@mm/lib/notices';
import { gameMeta, type GameId, type IdStatus, type Ownership, type Phase, type RankSource, type RankValue } from '@mm/sports/esports';
import {
  ENTRY_TONE,
  PHASE_TONE,
  entryInitials,
  entryStatusText,
  idChipText,
  idChipTone,
  initialsSize,
  monoFontSize,
  phaseText,
  rankChipText,
  rankChipTone,
  teamInitials,
  type ChipTone,
} from '@mm/pages/esports/chips';
import { Badge, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const TONE: Record<ChipTone, 'accent' | 'ok' | 'warn' | 'danger' | 'muted'> = { neutral: 'muted', accent: 'accent', ok: 'ok', warn: 'warn', danger: 'danger' };
const MARK: Record<'sm' | 'md' | 'lg', number> = { sm: 24, md: 32, lg: 48 };

/** El juego como un monograma en su color («VAL», «CS2», «RL»…), sin logos de marcas: 24, 32 o 48 px. */
export function GameMark({ game, size = 'md', side, decorative }: { game: GameId; size?: 'sm' | 'md' | 'lg'; side?: number; decorative?: boolean }) {
  const c = useColors();
  const meta = gameMeta(game);
  const mono = meta?.mono ?? '?';
  const px = side ?? MARK[size];
  return (
    <View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : (meta?.name ?? 'Juego')}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={{ width: px, height: px, borderRadius: px / 4, backgroundColor: meta?.color ?? c.faint, alignItems: 'center', justifyContent: 'center' }}
    >
      <Txt style={{ color: '#fff', fontFamily: font.heavy, fontSize: (monoFontSize(mono) * px) / 48, lineHeight: (monoFontSize(mono) * px) / 40, letterSpacing: -0.3 }}>{mono}</Txt>
    </View>
  );
}

/** El rango con de dónde salió: «Diamante 2 · Verificado» (verde) u «Oro IV · Declarado» (neutro). Nada sin rango. */
export function RankChip({ game, rank, source }: { game: GameId; rank: RankValue | null | undefined; source?: RankSource }) {
  const text = rankChipText(game, rank, source);
  if (!text) return null;
  return <Badge tone={TONE[rankChipTone(source)]}>{text}</Badge>;
}

/** El ID de juego de una persona: «Cuenta conectada» y «Comprobado» en verde, «Declarado» neutro. */
export function IdChip({ ownership, status }: { ownership?: Ownership; status?: IdStatus }) {
  return <Badge tone={TONE[idChipTone(ownership, status)]}>{idChipText(ownership, status)}</Badge>;
}

/** El estado de una inscripción: «Por aprobar», «Aprobado», «Check-in hecho», «Rechazado»… */
export function EntryStatusChip({ status, checkedIn }: { status: EntryStatus; checkedIn?: boolean }) {
  return <Badge tone={TONE[ENTRY_TONE[status]]}>{entryStatusText(status, checkedIn)}</Badge>;
}

/** La fase del torneo: «Inscripción abierta», «Check-in abierto», «En curso», «Terminado»… */
export function PhaseChip({ phase }: { phase: Phase }) {
  return <Badge tone={TONE[PHASE_TONE[phase]]}>{phaseText(phase)}</Badge>;
}

/** El logo del equipo (imagen pública del bucket `logos`) o, sin logo, su tag en un círculo en el color del deporte. */
export function TeamLogo({ path, name, tag, size = 40 }: { path: string | null; name: string; tag: string; size?: number }) {
  const c = useColors();
  const { url } = useLogo(path);
  if (url) {
    return <Image source={{ uri: url }} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface2 }} contentFit="cover" />;
  }
  const text = teamInitials(name, tag);
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Txt numberOfLines={1} style={{ color: c.accent, fontFamily: font.bold, fontSize: (initialsSize(text) * size) / 40 }}>
        {text}
      </Txt>
    </View>
  );
}

/** El círculo con las iniciales de un inscrito individual (los equipos usan TeamLogo). */
export function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const c = useColors();
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Txt tone="fg2" style={{ fontFamily: font.bold, fontSize: size * 0.35 }}>
        {entryInitials(name)}
      </Txt>
    </View>
  );
}

/**
 * El aviso de la pantalla (NoticeSlot de la web): de los que propone la pantalla, el más importante que la cuenta no
 * haya cerrado (lo cerrado se recuerda en el teléfono, src/lib/notices.ts). El botón lleva a su pantalla de la app.
 */
export function ScreenNotice({ notices }: { notices: readonly (Notice | null | false | undefined)[] }) {
  const c = useColors();
  const uid = useAuth().user?.uid ?? null;
  useSyncExternalStore(subscribeNotices, dismissedSnapshot, dismissedSnapshot);
  const entries = notices.flatMap((n, seq) => (n ? [{ notice: n, seq }] : []));
  const entry = pickEntry(entries, dismissedFor(uid));
  if (!entry) return null;
  const n = entry.notice;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, borderWidth: 1, borderColor: c.line, paddingLeft: 16, paddingVertical: 6, paddingRight: 4 }}>
      <View style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
        <Txt variant="meta" style={{ fontFamily: font.semibold }}>
          {n.title}
        </Txt>
        {!!n.text && (
          <Txt tone="muted" style={{ fontSize: 13.5, marginTop: 1 }}>
            {n.text}
          </Txt>
        )}
      </View>
      {n.action && (
        <Pressable
          accessibilityRole="button"
          hitSlop={4}
          onPress={() => {
            void n.action?.onClick?.();
            if (n.action?.to) router.push(n.action.to as Href);
          }}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
        >
          <Txt tone="accent" variant="meta" style={{ fontFamily: font.semibold }}>
            {n.action.label}
          </Txt>
        </Pressable>
      )}
      {n.dismissible !== false && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar aviso"
          hitSlop={4}
          onPress={() => {
            dismissNotice(uid, n);
            n.onDismiss?.();
          }}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={18} color={c.faint} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * El título de una pantalla de esports en Pro (text-title-pro de la web: 28 px, un poco más chico que el `title` de
 * Lite, que es de 32). Va encima de `<Txt variant="title">`.
 */
export const PRO_TITLE = { fontSize: 28, lineHeight: 34, letterSpacing: -0.85 } as const;

/** El título de una pantalla de esports: el `title` de 32 en Lite y el de 28 en Pro (como la web). */
export function TitleText({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const pro = useIsPro();
  return (
    <Txt variant="title" style={[pro && PRO_TITLE, style]}>
      {children}
    </Txt>
  );
}
