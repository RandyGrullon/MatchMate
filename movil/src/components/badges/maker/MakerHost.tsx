/**
 * Lo que comparten Organizar › Insignias, el estante de la liga y la página del jugador en la app (MakerHost de la
 * web): las tres hojas del creador (el detalle, el editor y «Dar insignia») y cómo pasan de una a otra, y las filas de
 * diseños y de otorgamientos. En el teléfono una hoja se cierra y la siguiente sale un momento después (dos a la vez
 * no se pueden mostrar).
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { badgeLabel } from '@mm/badges/visual/period';
import type { LeagueBadge, LeagueBadgesData, MadeAward } from '@mm/lib/data/leagueBadges';
import { awardTitle, dayText } from '@mm/components/badges/maker/design';
import { designLook } from '@mm/components/badges/maker/look';
import { designHoldersText, designRowSub, recentAwards, type EditorMode } from '@mm/components/badges/maker/view';
import { Insignia } from '@/components/badges/Insignia';
import { Badge, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { BadgeEditor } from './BadgeEditor';
import { DesignSheet } from './DesignSheet';
import { GiveBadge } from './GiveBadge';

/** Lo que tarda una hoja en irse antes de abrir la siguiente. */
const SHEET_CLOSE_MS = 400;

export interface MakerState {
  sheet: LeagueBadge | null;
  editor: EditorMode | null;
  give: { badge: LeagueBadge | null } | null;
  openSheet: (b: LeagueBadge) => void;
  openEditor: (m: EditorMode) => void;
  openGive: (b: LeagueBadge | null) => void;
  close: () => void;
}

export function useMaker(): MakerState {
  const [sheet, setSheet] = useState<LeagueBadge | null>(null);
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [give, setGive] = useState<{ badge: LeagueBadge | null } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const open = !!(sheet || editor || give);
  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSheet(null);
    setEditor(null);
    setGive(null);
  };
  /** Cierra lo abierto y abre lo nuevo (un momento después si había otra hoja). */
  const swap = (next: () => void) => {
    const wasOpen = open;
    close();
    if (wasOpen) timer.current = setTimeout(next, SHEET_CLOSE_MS);
    else next();
  };
  return {
    sheet,
    editor,
    give,
    openSheet: (b) => swap(() => setSheet(b)),
    openEditor: (m) => swap(() => setEditor(m)),
    openGive: (b) => swap(() => setGive({ badge: b })),
    close,
  };
}

/** Las hojas del creador. Al crear una insignia se abre su detalle (con «Dar insignia» a mano). */
export function MakerModals({ m, data }: { m: MakerState; data: LeagueBadgesData }) {
  return (
    <>
      <DesignSheet
        badge={m.sheet}
        onClose={m.close}
        onEdit={(b) => m.openEditor({ kind: 'edit', badge: b })}
        onDuplicate={(b) => m.openEditor({ kind: 'copy', badge: b })}
        onGive={(b) => m.openGive(b)}
      />
      <BadgeEditor
        mode={m.editor}
        onClose={m.close}
        onSaved={(b) => {
          if (m.editor?.kind !== 'edit') m.openSheet(b);
        }}
        onDuplicate={(b) => m.openEditor({ kind: 'copy', badge: b })}
      />
      <GiveBadge open={m.give != null} badge={m.give?.badge ?? null} designs={data.designs} awards={data.awards} onClose={m.close} />
    </>
  );
}

/** Una fila de la lista de diseños: la insignia a 40, el nombre, el cupo y cuántos la tienen. */
export function DesignRow({ badge, sport, onOpen, reports, first }: { badge: LeagueBadge; sport: string; onOpen: () => void; reports?: boolean; first?: boolean }) {
  const c = useColors();
  const look = designLook(badge, sport);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${badgeLabel(badge.name, look)}: ${designHoldersText(badge.active)}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent' }, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
    >
      <Insignia badge={look} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <Txt variant="meta" numberOfLines={1} style={{ fontFamily: font.semibold, flexShrink: 1 }}>
            {badge.name}
          </Txt>
          {badge.status === 'oculta' && <Badge tone="danger">Escondida</Badge>}
          {reports && (badge.openReports ?? 0) > 0 && <Badge tone="warn">Reportada</Badge>}
        </View>
        <Txt variant="small" tone="muted" numberOfLines={1} style={{ fontFamily: font.regular }}>
          {designRowSub(badge)}
        </Txt>
      </View>
      <ChevronRight size={16} color={c.muted} />
    </Pressable>
  );
}

/** Las últimas que se dieron: «Ana · Campeón · TEMP 2026 · 4 oct 2026». */
export function RecentAwards({
  awards,
  designs,
  names,
  sport,
  tz,
  limit = 5,
  onOpen,
  divided,
}: {
  awards: readonly MadeAward[];
  designs: readonly LeagueBadge[];
  names: ReadonlyMap<string, string>;
  sport: string;
  tz?: string;
  limit?: number;
  onOpen: (b: LeagueBadge) => void;
  /** Con la raya de arriba (debajo de la grilla del estante). */
  divided?: boolean;
}) {
  const c = useColors();
  const list = recentAwards(awards, designs, limit);
  if (!list.length) return null;
  return (
    <View style={divided ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 4 } : undefined}>
      {list.map(({ award: a, design: d }) => {
        const look = designLook(d, sport, a.period);
        const who = names.get(a.playerId) ?? 'Jugador';
        return (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityLabel={`${who} · ${awardTitle(d.name, a.period)} · ${dayText(a.awardedAt, tz)}`}
            onPress={() => onOpen(d)}
            style={({ pressed }) => [styles.recent, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
          >
            <Insignia badge={look} size={24} />
            <Txt variant="meta" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="meta" style={{ fontFamily: font.semibold }}>
                {who}
              </Txt>
              <Txt variant="meta" tone="muted">{` · ${awardTitle(d.name, a.period)}`}</Txt>
            </Txt>
            <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
              {dayText(a.awardedAt, tz)}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 8, paddingHorizontal: 4 },
});
