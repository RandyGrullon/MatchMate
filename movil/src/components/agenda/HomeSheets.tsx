import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarSearch, ChevronRight, PencilLine, Target } from 'lucide-react-native';
import type { CalendarMatch } from '@mm/lib/calendar';
import type { LeagueFeed } from '@mm/lib/data';
import type { League } from '@mm/lib/types';
import { scorePath, type RecentEvent } from '@mm/lib/useNextGame';
import { agendaCardNote, agendaHref, hasAgenda } from '@mm/components/agenda/logic';
import { whereTitle, type AnotarLink as AnotarLinkInfo } from '@mm/components/home/where';
import { DateBlock } from '@/components/DateBlock';
import { Card, ListRow, RowIcon, Sheet, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { WeekAgenda } from './WeekAgenda';

/** Abre la agenda (con el deporte ya filtrado, si viene de uno). */
const openAgenda = (sport?: string | null) => router.push(agendaHref(sport) as never);

/**
 * El Calendario de Hoy (CalendarSheet de la web, src/components/home/HomeSheets.tsx; se abre con «Calendario» de «Lo
 * que viene»): la semana de tus ligas con sus fechas, «Voy» en las prácticas y las semanas que vienen (hasta 8). Al
 * final, «¿Dónde juego esta semana?» (lo abierto en otras ligas: `/agenda`).
 */
export function CalendarSheet({
  open,
  onClose,
  feeds,
  leagues,
  matches,
  today,
  showSport,
}: {
  open: boolean;
  onClose: () => void;
  feeds: readonly LeagueFeed[];
  leagues: readonly League[];
  matches: readonly CalendarMatch[];
  today: string;
  showSport?: boolean;
}) {
  const c = useColors();
  return (
    <Sheet open={open} onClose={onClose} title="Calendario" subtitle="Tus ligas, semana por semana">
      {feeds.length || matches.length ? (
        <WeekAgenda feeds={feeds} leagues={leagues} matches={matches} today={today} showSport={showSport} />
      ) : (
        <Txt variant="meta" tone="muted" style={{ paddingVertical: 16 }}>
          Todavía no hay fechas en tus ligas.
        </Txt>
      )}
      <View style={{ marginHorizontal: -20 }}>
        <ListRow
          icon={
            <RowIcon>
              <CalendarSearch size={20} color={c.accent} />
            </RowIcon>
          }
          title="¿Dónde juego esta semana?"
          subtitle={agendaCardNote(null)}
          onPress={() => {
            onClose();
            openAgenda();
          }}
        />
      </View>
    </Sheet>
  );
}

/**
 * «¿Dónde jugaste?» (WhereSheet de la web): cuando no hay un juego que te toque hoy, a dónde anotar lo que jugaste: los
 * eventos de ayer y de hoy de tus ligas (`recent` de useAnotar). Cada uno abre su evento para anotar el juego que sigue.
 * Un juego suelto se anota desde Yo.
 */
export function WhereSheet({ open, onClose, recent, today }: { open: boolean; onClose: () => void; recent: readonly RecentEvent[]; today: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="¿Dónde jugaste?" subtitle="Elige dónde anotar tu juego">
      <View style={{ marginHorizontal: -20 }}>
        {recent.map((r) => (
          <ListRow
            key={`${r.lid}:${r.event.id}`}
            icon={<DateBlock date={r.event.date} />}
            title={whereTitle(r, today)}
            subtitle={r.leagueName}
            onPress={() => {
              onClose();
              openLink(scorePath(r.lid, r.event.id));
            }}
          />
        ))}
      </View>
    </Sheet>
  );
}

/**
 * El link discreto para anotar sin un juego de hoy (QuietLink de la web), debajo de lo próximo y de «Nada programado»:
 * «Seguir mi juego 2» (en el acento, lleva a ese juego) o «Anotar un juego» (abre «¿Dónde jugaste?»). `link` sale de
 * useAnotar; sin link no se pinta nada.
 */
export function AnotarLink({ link, onWhere }: { link: AnotarLinkInfo | null; onWhere: () => void }) {
  const c = useColors();
  if (!link) return null;
  const resume = link.kind === 'resume';
  const Icon = resume ? PencilLine : Target;
  const color = resume ? c.accent : c.fg2;
  return (
    <Pressable
      accessibilityRole={resume ? 'link' : 'button'}
      onPress={() =>
        link.kind === 'resume'
          ? router.push({ pathname: '/l/[lid]/e/[eventId]/anotar', params: { lid: link.lid, eventId: link.eventId, juego: String(link.game) } })
          : onWhere()
      }
      style={({ pressed }) => [styles.quiet, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon size={17} color={color} />
      <Txt numberOfLines={1} style={{ fontSize: 14, fontFamily: font.medium, color, flexShrink: 1 }}>
        {link.label}
      </Txt>
    </Pressable>
  );
}

/** «Calendario» a la derecha de «Lo que viene» (UpNext de la web): abre la hoja del Calendario. Va en `action` de SectionHeader. */
export function CalendarLink({ onPress }: { onPress: () => void }) {
  return (
    <Txt variant="meta" tone="accent" accessibilityRole="button" suppressHighlighting style={{ fontFamily: font.semibold, paddingVertical: 12, paddingLeft: 12 }} onPress={onPress}>
      Calendario
    </Txt>
  );
}

/**
 * «¿Dónde juego esta semana?» en una tarjeta con su fila (como en Ligas › Buscar ligas abiertas y en la portada sin
 * cuenta de la web): la nota del deporte y, al tocarla, la agenda con ese deporte. En un deporte sin nada para apuntarse
 * (baloncesto, fútbol, natación) no sale.
 */
export function AgendaLinkRow({ sport = null }: { sport?: string | null }) {
  const c = useColors();
  if (sport && !hasAgenda(sport)) return null;
  return (
    <Card padded={false}>
      <ListRow
        icon={
          <RowIcon>
            <CalendarSearch size={20} color={c.accent} />
          </RowIcon>
        }
        title="¿Dónde juego esta semana?"
        subtitle={agendaCardNote(sport)}
        onPress={() => openAgenda(sport)}
      />
    </Card>
  );
}

/**
 * La tarjeta suelta (AgendaLinkCard de la web, src/components/home/AgendaLinkCard.tsx): el ícono, «¿Dónde juego esta
 * semana?», la nota del deporte y la flecha. En un deporte sin nada para apuntarse no sale.
 */
export function AgendaLinkCard({ sport = null }: { sport?: string | null }) {
  const c = useColors();
  if (sport && !hasAgenda(sport)) return null;
  const note = agendaCardNote(sport);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`¿Dónde juego esta semana? ${note}`}
      onPress={() => openAgenda(sport)}
      style={({ pressed }) => [styles.card, { borderColor: c.line, backgroundColor: pressed ? c.surface2 : c.surface }]}
    >
      <View style={[styles.cardIcon, { backgroundColor: c.accentSoft }]}>
        <CalendarSearch size={20} color={c.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong">¿Dónde juego esta semana?</Txt>
        <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
          {note}
        </Txt>
      </View>
      <ChevronRight size={20} color={c.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quiet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, width: '100%' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12 },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
