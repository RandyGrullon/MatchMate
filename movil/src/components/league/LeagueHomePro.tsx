/**
 * Lo general del inicio de cualquier liga que cambia con el modo (LeagueHome.tsx, LeagueShell.tsx,
 * LeagueHomePage.tsx y organizer/SuspendDay.tsx de la web, con su misma lógica: src/components/league/homeNotices.ts):
 * - `LeagueHomeNotice` (o `useLeagueHomeNotices`): el aviso de la pantalla para quien organiza. En Lite, lo que espera
 *   por él (o los primeros pasos) y la sugerencia «Organizas esta liga · Probar Pro» (una sola vez); en Pro no sale
 *   (va en la fila).
 * - `OrganizesRow`: Pro · «Organizas esta liga» (o «este torneo») con lo que espera y su número; lleva a Organizar.
 * - `SuspendTodayCard`: Pro · «Hoy · 2 prácticas · Suspender» si hoy hay algo que suspender.
 * Van dentro de LeagueScope (leen la liga con useLeagueCtx).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { CalendarX, ClipboardList, CloudRain } from 'lucide-react-native';
import { suspendable, useLeaguePending, useSuspendPreview } from '@mm/lib/data/organizer';
import { useLeagueCtx } from '@mm/lib/league';
import type { Notice } from '@mm/lib/notices';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { leagueSport } from '@mm/sports/registry';
import { useLeagueToDo } from '@mm/components/league/home/useLeagueData';
import { leaguePendingNotice, leagueProCopy, organizesRow } from '@mm/components/league/homeNotices';
import { suspendCounts } from '@mm/components/organizer/logic';
import { leagueToday } from '@mm/components/organizer/suspendForm';
import { ScreenNotice } from '@/components/esports/bits';
import { useProSuggestion } from '@/components/home/useProSuggestion';
import { CountBubble } from '@/components/organizer/Organize';
import { SuspendDaySheet } from '@/components/seasonAdmin/SuspendDay';
import { Button, Card, ListRow, RowIcon, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';

/**
 * El aviso del inicio de la liga (su NoticeSlot en la web, useLeagueHomeNotices), para quien la organiza: en Lite, lo
 * pendiente o los primeros pasos (a Organizar) y «Organizas esta liga · Probar Pro». Sale uno solo, el más importante.
 * A los demás no les pide nada; en Pro, nada (lo pendiente va en el número de «Organizas esta liga»).
 */
export function LeagueHomeNotice() {
  return <ScreenNotice notices={useLeagueHomeNotices()} />;
}

/**
 * Los avisos que el inicio de la liga propone (useLeagueHomeNotices de la web), para juntarlos con los de la pantalla
 * del deporte en un solo ScreenNotice si esa pantalla ya tiene el suyo: lo pendiente (Lite) y «Probar Pro».
 */
export function useLeagueHomeNotices(): (Notice | null)[] {
  const { lid, league, isAdmin } = useLeagueCtx();
  const pro = useIsPro();
  const p = useLeaguePending(isAdmin && !pro ? lid : null).data;
  const pending = isAdmin && !pro ? leaguePendingNotice(p, lid, league.kind) : null;
  // El boliche: «Aprueba juegos en Pro»; los otros deportes confirman resultados en sus partidos.
  const suggestion = useProSuggestion({ ...leagueProCopy(league.kind, leagueSport(league) === 'bowling'), enabled: isAdmin });
  return [pending, suggestion];
}

/**
 * Pro · «Organizas esta liga» (lo de la antigua pestaña Admin, con lo que espera y su número): en el boliche «Jugadores,
 * fechas y ajustes»; en los otros deportes «Gente, fechas y ajustes» y, en un torneo suelto, «Organizas este torneo».
 * Solo a quien organiza y en Pro (en Lite no sale: es el aviso «Probar Pro»).
 */
export function OrganizesRow() {
  const c = useColors();
  const { lid, league, isAdmin, base } = useLeagueCtx();
  const pro = useIsPro();
  const bowling = leagueSport(league) === 'bowling';
  const toDo = useLeagueToDo(isAdmin && pro ? lid : null, bowling);
  if (!isAdmin || !pro) return null;
  const row = organizesRow(league.kind, bowling, toDo.line, base);
  return (
    <ListRow
      icon={
        <RowIcon>
          <ClipboardList size={20} color={c.accent} />
        </RowIcon>
      }
      title={row.title}
      subtitle={row.subtitle}
      accessibilityLabel={toDo.count ? `${row.title}: ${toDo.count} ${toDo.count === 1 ? 'pendiente' : 'pendientes'}` : undefined}
      right={toDo.count ? <CountBubble n={toDo.count} /> : undefined}
      onPress={() => openLink(row.to)}
    />
  );
}

/**
 * Pro · «Hoy · Suspender» (SuspendTodayCard de la web), a quien organiza: si hoy hay algo que se puede suspender, lo que
 * hay («2 prácticas · 1 partido») y «Suspender», que abre la hoja de Organizar › Temporada y fechas con hoy.
 */
export function SuspendTodayCard() {
  const c = useColors();
  const { lid, league, isAdmin } = useLeagueCtx();
  const pro = useIsPro();
  const now = useNow();
  const on = isAdmin && pro;
  const today = leagueToday(league.tz, now);
  const preview = useSuspendPreview(on ? lid : null, on ? today : null);
  const [open, setOpen] = useState(false);
  const p = preview.data;
  if (!on || !p || suspendable(p) === 0) return null;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
      <RowIcon>
        <CloudRain size={20} color={c.accent} />
      </RowIcon>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="small" tone="muted">
          Hoy
        </Txt>
        <Txt variant="meta" numberOfLines={1} style={{ fontWeight: '600' }}>
          {suspendCounts(p).join(' · ')}
        </Txt>
      </View>
      <Button icon={<CalendarX size={16} color={c.fg} />} onPress={() => setOpen(true)}>
        Suspender
      </Button>
      {/* Se monta al abrirse: empieza en hoy y sin motivo. */}
      {open && <SuspendDaySheet onClose={() => setOpen(false)} />}
    </Card>
  );
}
