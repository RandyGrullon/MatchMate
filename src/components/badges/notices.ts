import { useMemo } from 'react';
import { useBadgeNotices, useProfileBadges } from '../../lib/data/badges';
import type { GenericNotice } from '../../lib/notifications';
import { useBadgeKit } from './kit';

const NONE: readonly GenericNotice[] = [];

/**
 * Avisos de insignias para la página de Avisos (como avisos genéricos): las ganadas en los últimos 14 días (filtro
 * Social; las del historial en uno solo) y, a quien puede confirmarlas, las hazañas por confirmar (filtro Admin, a
 * Admin › Por confirmar). Salen de la vitrina propia (`profile_badges`) y de `badge_notices`; los textos necesitan el
 * catálogo, que se carga aparte solo si hay algo. Sin cuenta, nada.
 */
export function useBadgeNoticeItems(uid: string | undefined): readonly GenericNotice[] {
  const mine = useProfileBadges(uid ?? null);
  const notices = useBadgeNotices();
  const reviews = uid ? notices.data.reviews : [];
  const need = !!uid && ((mine.data?.awards.length ?? 0) + (mine.data?.leagueAwards?.length ?? 0) > 0 || reviews.length > 0);
  const kit = useBadgeKit(need);
  return useMemo(() => {
    if (!uid || !kit || !need) return NONE;
    const list = kit.badgeNotices(mine.data, reviews, Date.now());
    return list.length ? list : NONE;
  }, [uid, kit, need, mine.data, reviews]);
}
