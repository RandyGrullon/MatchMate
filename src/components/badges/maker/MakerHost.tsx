import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Insignia, badgeLabel } from '../../../badges/visual';
import type { LeagueBadge, LeagueBadgesData, MadeAward } from '../../../lib/data/leagueBadges';
import { Badge, cx } from '../../ui';
import { BadgeEditor, type EditorMode } from './BadgeEditor';
import { LIMIT_INFO, awardTitle, dayText } from './design';
import { DesignSheet } from './DesignSheet';
import { GiveBadge } from './GiveBadge';
import { designLook } from './look';

/**
 * Lo que comparten la pestaña de Admin y el estante de la liga: los tres modales del creador (el detalle, el editor y
 * «Dar insignia») y cómo pasan de uno a otro, y las filas de diseños y de otorgamientos.
 */

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
  const close = () => {
    setSheet(null);
    setEditor(null);
    setGive(null);
  };
  return {
    sheet,
    editor,
    give,
    openSheet: (b) => {
      close();
      setSheet(b);
    },
    openEditor: (m) => {
      close();
      setEditor(m);
    },
    openGive: (b) => {
      close();
      setGive({ badge: b });
    },
    close,
  };
}

/** Los modales del creador. Al crear una insignia se abre su detalle (con «Dar insignia» a mano). */
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
export function DesignRow({ badge, sport, onOpen, reports }: { badge: LeagueBadge; sport: string; onOpen: () => void; reports?: boolean }) {
  const look = designLook(badge, sport);
  const who = badge.active ? (badge.active === 1 ? '1 la tiene' : `${badge.active} la tienen`) : 'Nadie la tiene todavía';
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${badgeLabel(badge.name, look)}: ${who}`}
      className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-2 active:bg-surface-2"
    >
      <Insignia badge={look} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{badge.name}</span>
          {badge.status === 'oculta' && <Badge tone="danger">Escondida</Badge>}
          {reports && (badge.openReports ?? 0) > 0 && <Badge tone="warn">Reportada</Badge>}
        </span>
        <span className="block truncate text-xs text-muted">
          {LIMIT_INFO[badge.limitKind].label}
          {badge.periodText ? ` · ${badge.periodText}` : ''} · {who}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
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
  className,
}: {
  awards: readonly MadeAward[];
  designs: readonly LeagueBadge[];
  names: ReadonlyMap<string, string>;
  sport: string;
  tz?: string;
  limit?: number;
  onOpen: (b: LeagueBadge) => void;
  className?: string;
}) {
  const byId = new Map(designs.map((d) => [d.id, d] as const));
  const list = awards.filter((a) => !a.revokedAt && !a.hidden && byId.has(a.badgeId) && byId.get(a.badgeId)!.status !== 'oculta').slice(0, limit);
  if (!list.length) return null;
  return (
    <ul className={cx('flex flex-col', className)}>
      {list.map((a) => {
        const d = byId.get(a.badgeId)!;
        const look = designLook(d, sport, a.period);
        return (
          <li key={a.id}>
            <button type="button" onClick={() => onOpen(d)} className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-1 text-left transition hover:bg-surface-2">
              <Insignia badge={look} size={24} />
              <span className="min-w-0 flex-1 truncate text-sm">
                <b className="font-semibold">{names.get(a.playerId) ?? 'Jugador'}</b>
                <span className="text-muted">{` · ${awardTitle(d.name, a.period)}`}</span>
              </span>
              <span className="shrink-0 text-xs text-muted">{dayText(a.awardedAt, tz)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
