import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { BarChart3, CalendarPlus, Check, ChevronRight, FileSpreadsheet, List, PencilLine, Send, Trophy, UserCog, UserPlus, UserRound, Users, type LucideIcon } from 'lucide-react-native';
import { upcomingCalendar, type CalendarItem } from '@mm/lib/calendar';
import { usePlayers } from '@mm/lib/data';
import { toIsoDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { isPlannedEvent, liveGames, type LiveGame } from '@mm/lib/live';
import type { BowlingEvent, EventType } from '@mm/lib/types';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { nextGameLabel, useNextGame, type NextGame } from '@mm/lib/useNextGame';
import { AHEAD_DAYS } from '@mm/components/home/activity';
import { LATE_WHEN, lateTitle, todayTitle } from '@mm/components/home/logic';
import { dateLine, leagueLine, nextDates, nowLine, pastLine, peopleLine, tableTop, type TopRow } from '@mm/components/league/home/logic';
import { useSeasonTable } from '@mm/components/league/home/seasonTable';
import { useLeagueFeed } from '@mm/components/league/home/useLeagueData';
import { useJoinFlow } from '@/components/agenda/joinFlow';
import { WeekAgenda } from '@/components/agenda/WeekAgenda';
import { closeThen } from '@/components/bowling/GameDetail';
import { LeagueTeamsSection } from '@/components/bowling/LeagueTeams';
import { DateBlock } from '@/components/DateBlock';
import { EventFormSheet } from '@/components/event/EventFormSheet';
import { SmallRsvp, canRsvp, useNextAction } from '@/components/home/Activity';
import { SectionLink, useLiveTable } from '@/components/home/ProSections';
import { LeagueMark } from '@/components/leagueSettings/LeagueMark';
import { initials } from '@/components/social/Avatar';
import { SuggestionBox } from '@/components/suggestions/SuggestionBox';
import { Button, Card, Divider, ListRow, Loading, RowIcon, SectionHeader, Sheet, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * La liga de boliche en una sola pantalla (LeagueScreen de src/pages/LeagueHomePage.tsx, rediseño «Calma y foco»), dentro
 * de LeagueScope: quien solo mira una liga pública, «Estás viendo … · Unirme»; «En juego ahora» con UN botón (la misma
 * lógica que Hoy); la Tabla (los 3 de arriba y «Ver toda»); «Próximas fechas» con «Voy» en línea y el Calendario (en Pro,
 * quien organiza crea ahí la próxima práctica o un torneo); los equipos fijos; y las filas Jugadores (la hoja),
 * Resultados anteriores y Mis números, con el buzón al final. El nombre y cuándo/dónde juegan van arriba (LeagueIdent).
 */
export function BowlingLeagueHome() {
  const c = useColors();
  const { lid, league, isAdmin, member } = useLeagueCtx();
  const pro = useIsPro();
  const now = useNow();
  const today = toIsoDate(now);
  const data = useLeagueFeed();
  const players = usePlayers(lid);
  const [sheet, setSheet] = useState<'calendario' | 'jugadores' | null>(null);
  const [creating, setCreating] = useState<EventType | null>(null);

  const live = liveGames([data.feed], [league], now);
  const liveKeys = new Set(live.map((g) => `${lid}:${g.event.id}`));
  const dates = nextDates(
    upcomingCalendar([data.feed], [league], today, AHEAD_DAYS).filter((it) => it.date >= today),
    liveKeys,
  );
  const observer = !member && league.visibility === 'public';

  return (
    <View style={{ gap: 26 }}>
      {observer && <JoinBanner />}

      {data.error && !data.events.length ? null : data.loading ? (
        <Loading label="Cargando las fechas" />
      ) : (
        live.map((g) => <NowCard key={g.event.id} game={g} today={today} member={!!member} />)
      )}

      <TableTop />

      {data.loading ? null : <NextDates items={dates} events={data.events} today={today} onCalendar={() => setSheet('calendario')} />}

      {/* Los equipos fijos de la liga (solo si tiene). */}
      <LeagueTeamsSection />

      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <Users size={20} color={c.accent} />
            </RowIcon>
          }
          title="Jugadores"
          subtitle={players.data.length ? peopleLine(players.data.length) : null}
          onPress={() => setSheet('jugadores')}
        />
        <Divider inset={68} />
        <ListRow
          icon={
            <RowIcon>
              <List size={20} color={c.accent} />
            </RowIcon>
          }
          title="Resultados anteriores"
          subtitle={pastLine(data.events, today)}
          onPress={() => router.push({ pathname: '/l/[lid]/partidos', params: { lid } })}
        />
        {/* «Mis números» (para cualquier miembro: sin jugador todavía, `/perfil` se lo prepara). */}
        {!!member && (
          <>
            <Divider inset={68} />
            <ListRow
              icon={
                <RowIcon>
                  <BarChart3 size={20} color={c.accent} />
                </RowIcon>
              }
              title="Mis números"
              onPress={() => router.push({ pathname: '/l/[lid]/perfil', params: { lid } })}
            />
          </>
        )}
        {/* Para los jugadores: el buzón anónimo para quien organiza (a quien organiza no le sale). */}
        <SuggestionBox row divider />
      </Card>

      <PlayersSheet open={sheet === 'jugadores'} onClose={() => setSheet(null)} />
      <CalendarSheet
        open={sheet === 'calendario'}
        onClose={() => setSheet(null)}
        feed={data.feed}
        today={today}
        onCreate={
          // Pro: quien organiza crea aquí la próxima fecha (en Lite está en Ligas › Crear o unirme).
          isAdmin && pro
            ? (type) => {
                setSheet(null);
                setCreating(type);
              }
            : undefined
        }
      />
      {isAdmin && creating != null && (
        <EventFormSheet
          lid={lid}
          type={creating}
          onClose={() => setCreating(null)}
          onCreated={(id) => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId: id } })}
        />
      )}
    </View>
  );
}

// ---------- Encabezado ----------

/** «(ícono o logo) Liga de los martes / Martes 7:30 pm · Bolera Sambil» (LeagueIdent de la web): el nombre nunca se corta. */
export function LeagueIdent() {
  const { league } = useLeagueCtx();
  const line = leagueLine(league);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <LeagueMark league={league} size={56} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Txt variant="title" accessibilityRole="header">
          {league.name}
        </Txt>
        {!!line && (
          <Txt tone="muted" style={{ fontSize: 14.5 }}>
            {line}
          </Txt>
        )}
      </View>
    </View>
  );
}

// ---------- Quien solo mira ----------

/**
 * Observador de una liga pública (JoinBanner de la web): «Estás viendo …» con «Unirme» (y «¿Quién eres?» si el admin ya
 * anotó jugadores sin cuenta). Al unirse ya es jugador: la pantalla cambia sola.
 */
function JoinBanner() {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const flow = useJoinFlow();
  const join = () => void flow.start({ lid, name: league.name, sport: league.sport, kind: league.kind, next: `/l/${lid}` });
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ gap: 2 }}>
        <Txt variant="bodyStrong">{`Estás viendo ${league.name}`}</Txt>
        <Txt variant="meta" tone="muted">
          Únete para confirmar asistencia, subir tus juegos y salir en el ranking.
        </Txt>
      </View>
      <Button variant="primary" icon={<UserPlus size={16} color={c.accentFg} />} loading={flow.busy === lid} onPress={join}>
        Unirme
      </Button>
      {flow.modal}
    </Card>
  );
}

// ---------- «En juego ahora» ----------

/** Ícono del botón según lo que hace (el mismo de Hoy en la web). */
const NEXT_ICON: Record<NextGame['kind'], LucideIcon> = {
  medias: PencilLine,
  anotar: PencilLine,
  enviar: Send,
  ver: Check,
  preparar: UserRound,
  planilla: FileSpreadsheet,
};

/**
 * La práctica (o el torneo) que se juega ahora en la liga (NowCard de la web): «En juego ahora · 6 jugando», el nombre
 * (abre la práctica: cómo van todos), lo tuyo en una línea («Llevas 187 y 210 · el juego 3 va a medias») y UN botón con
 * la misma lógica que Hoy. Quien mira sin ser miembro ve la tarjeta sin el botón, y no ve la práctica del horario que
 * nadie abrió ni la de anoche.
 */
function NowCard({ game, today, member }: { game: LiveGame; today: string; member: boolean }) {
  const c = useColors();
  const { event, info, feed, late } = game;
  const planned = isPlannedEvent(event);
  const mine = useNextGame(member ? game : null, today);
  const table = useLiveTable(game);
  const { busy, act } = useNextAction(game, today);
  if (!member && (planned || late)) return null;
  const n = table.rows.length;
  const title = late ? lateTitle(mine?.next) : todayTitle(event, game.today ?? today);
  const when = late ? LATE_WHEN : info.startsSoon && info.startLabel ? `Empieza a las ${info.startLabel}` : 'En juego ahora';
  const line = mine && !mine.loading ? nowLine(mine.cells, mine.next) : member ? null : 'Mira cómo van todos';
  const Icon = mine ? NEXT_ICON[mine.next.kind] : null;
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Txt numberOfLines={1} style={{ flex: 1, fontSize: 21, fontFamily: font.bold, letterSpacing: -0.4 }}>
          {title}
        </Txt>
        {!planned && <ChevronRight size={20} color={c.accent} />}
      </View>
      {line ? (
        <Txt tone="fg2" style={{ fontSize: 14.5, marginTop: 3 }}>
          {line}
        </Txt>
      ) : (
        <View style={{ marginTop: 6, height: 16, width: '75%', borderRadius: 6, backgroundColor: c.surface2 }} />
      )}
    </>
  );
  return (
    <View accessibilityLabel={`${title}: ${when}`} style={{ borderRadius: 24, backgroundColor: c.accentSoft, paddingTop: 18, paddingRight: 18, paddingBottom: 18, paddingLeft: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
          <Txt numberOfLines={1} tone="accent" style={{ fontSize: 14, fontFamily: font.semibold }}>
            {when}
          </Txt>
        </View>
        {n > 0 && <Txt tone="fg2" style={{ fontSize: 14, fontFamily: font.medium }}>{`${n} ${late ? 'anotaron' : 'jugando'}`}</Txt>}
      </View>
      {/* La del horario que nadie abrió todavía no tiene a dónde llevar. */}
      {planned ? (
        <View style={{ marginTop: 8 }}>{body}</View>
      ) : (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${title}: cómo van todos`}
          onPress={() => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid: feed.lid, eventId: event.id } })}
          style={({ pressed }) => ({ marginTop: 8, opacity: pressed ? 0.7 : 1 })}
        >
          {body}
        </Pressable>
      )}
      {member &&
        (mine && Icon ? (
          <Button variant="primary" size="xl" full loading={busy} disabled={busy} icon={<Icon size={20} color={c.accentFg} />} onPress={() => void act(mine.next)} style={{ marginTop: 16 }}>
            {nextGameLabel(mine.next)}
          </Button>
        ) : (
          <View style={{ marginTop: 16, height: 56, borderRadius: 16, backgroundColor: c.surface2 }} />
        ))}
    </View>
  );
}

// ---------- Tabla: los 3 de arriba ----------

/** El círculo con las iniciales (el tuyo en el color del deporte). */
function Initials({ name, me }: { name: string; me: boolean }) {
  const c = useColors();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: me ? c.accent : c.surface2 }}>
      <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: me ? c.accentFg : c.fg2 }}>{initials(name)}</Txt>
    </View>
  );
}

/** «Tú» en tu fila. */
function MeTag() {
  const c = useColors();
  return (
    <View style={{ height: 22, borderRadius: 11, backgroundColor: c.surface, paddingHorizontal: 8, justifyContent: 'center' }}>
      <Txt tone="accent" style={{ fontSize: 12, fontFamily: font.semibold }}>
        Tú
      </Txt>
    </View>
  );
}

/** Una persona en una lista (la Tabla o la hoja Jugadores): el puesto (si hay), las iniciales, el nombre y «Tú». */
function PersonRow({ name, me, pos, value, label, onPress }: { name: string; me: boolean; pos?: number; value?: number; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: me ? c.accentSoft : pressed ? c.surface2 : 'transparent',
      })}
    >
      {pos != null && <Txt style={{ width: 18, textAlign: 'center', fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{pos}</Txt>}
      <Initials name={name} me={me} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </Txt>
        {me && <MeTag />}
      </View>
      {value != null && <Txt style={{ fontSize: 18, fontFamily: font.bold, fontVariant: ['tabular-nums'] }}>{value}</Txt>}
    </Pressable>
  );
}

/**
 * «Tabla · Ver toda» (TableTop de la web): los 3 de arriba por promedio (tu fila resaltada con «Tú»; si vas más abajo, tu
 * fila en el tercer lugar). Cada fila abre la página del jugador; «Ver toda», la Tabla.
 */
function TableTop() {
  const { lid, myPlayerId } = useLeagueCtx();
  const table = useSeasonTable();
  const rows: TopRow[] = tableTop(table.rows, myPlayerId);
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Tabla" action={<SectionLink onPress={() => router.push({ pathname: '/l/[lid]/tabla', params: { lid } })}>Ver toda</SectionLink>} />
      {table.loading && !rows.length ? (
        <Loading label="Cargando la tabla" />
      ) : rows.length ? (
        <Card padded={false}>
          {rows.map(({ pos, row, me }, i) => (
            <View key={row.playerId}>
              {i > 0 && <Divider inset={16} />}
              <PersonRow
                name={row.name}
                me={me}
                pos={pos}
                value={row.average}
                label={`${pos}.º ${row.name}${me ? ' (tú)' : ''}: promedio ${row.average}`}
                onPress={() => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: row.playerId } })}
              />
            </View>
          ))}
        </Card>
      ) : (
        <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
          La tabla sale cuando alguien tenga sus juegos aprobados de la temporada.
        </Txt>
      )}
    </View>
  );
}

// ---------- Próximas fechas ----------

/**
 * «Próximas fechas · Calendario» (NextDates de la web): la próxima práctica con «Voy» en línea y los torneos que vienen
 * («Sábado · torneo · 6 inscritos»). «Calendario» abre la semana completa.
 */
function NextDates({ items, events, today, onCalendar }: { items: readonly CalendarItem[]; events: readonly BowlingEvent[]; today: string; onCalendar: () => void }) {
  const { lid } = useLeagueCtx();
  const signedUp = (it: CalendarItem) => events.find((e) => e.id === it.eventId)?.playerCount ?? null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Próximas fechas" action={<SectionLink onPress={onCalendar}>Calendario</SectionLink>} />
      {items.length ? (
        <Card padded={false}>
          {items.map((it, i) => {
            const line = dateLine(it, today, it.type === 'torneo' ? signedUp(it) : null);
            // Una práctica del horario que el admin todavía no creó no tiene pantalla propia.
            const to = it.href !== `/l/${lid}` ? it.href : undefined;
            // «Voy» va al lado de la fila, no adentro (un botón no puede ir dentro de otro).
            return (
              <View key={it.key}>
                {i > 0 && <Divider inset={16} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: canRsvp(it) ? 16 : 0 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ListRow
                      icon={<DateBlock date={it.date} />}
                      title={it.name}
                      subtitle={line}
                      accessibilityLabel={`${it.name}, ${line}`}
                      chevron={!!to && !canRsvp(it)}
                      onPress={to ? () => openLink(to) : undefined}
                    />
                  </View>
                  {canRsvp(it) && <SmallRsvp item={it} />}
                </View>
              </View>
            );
          })}
        </Card>
      ) : (
        <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
          Nada más en los próximos 30 días.
        </Txt>
      )}
    </View>
  );
}

// ---------- Las hojas ----------

/**
 * «Jugadores · <liga>» (PlayersSheet de la web): toda la gente de la liga por nombre (también los que todavía no entran
 * en la Tabla); cada fila abre la página del jugador. En Pro, quien organiza tiene «Editar jugadores».
 */
function PlayersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useColors();
  const { lid, league, myPlayerId, isAdmin } = useLeagueCtx();
  const pro = useIsPro();
  const players = usePlayers(open ? lid : undefined);
  const list = [...players.data].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const leave = closeThen(onClose);
  return (
    <Sheet open={open} onClose={onClose} title="Jugadores" subtitle={league.name}>
      <View style={{ marginHorizontal: -20 }}>
        {players.loading && !list.length ? (
          <Loading label="Cargando los jugadores" />
        ) : list.length ? (
          list.map((p) => (
            <PersonRow
              key={p.id}
              name={p.name}
              me={p.id === myPlayerId}
              label={p.id === myPlayerId ? `${p.name} (tú)` : p.name}
              onPress={() => leave(() => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: p.id } }))}
            />
          ))
        ) : (
          <Txt variant="meta" tone="muted" style={{ paddingHorizontal: 20, paddingVertical: 16 }}>
            Todavía no hay jugadores.
          </Txt>
        )}
        {isAdmin && pro && (
          <ListRow
            icon={
              <RowIcon>
                <UserCog size={20} color={c.accent} />
              </RowIcon>
            }
            title="Editar jugadores"
            subtitle="Agregar, cambiar nombres y vincular cuentas"
            onPress={() => leave(() => router.push({ pathname: '/l/[lid]/jugadores', params: { lid } }))}
          />
        )}
      </View>
    </Sheet>
  );
}

/**
 * El Calendario de la liga (LeagueCalendarSheet de la web): la semana con sus fechas y «Voy», y las que vienen (el mismo
 * calendario de Hoy, solo con esta liga). En Pro, quien organiza crea aquí la próxima práctica o un torneo.
 */
function CalendarSheet({
  open,
  onClose,
  feed,
  today,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  feed: ReturnType<typeof useLeagueFeed>['feed'];
  today: string;
  onCreate?: (type: EventType) => void;
}) {
  const c = useColors();
  const { league } = useLeagueCtx();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Calendario"
      subtitle={league.name}
      footer={
        onCreate ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button variant="soft" size="lg" style={{ flex: 1 }} icon={<CalendarPlus size={18} color={c.accent} />} accessibilityLabel="Nueva práctica" onPress={() => onCreate('practica')}>
              Práctica
            </Button>
            <Button variant="quiet" size="lg" style={{ flex: 1 }} icon={<Trophy size={18} color={c.fg} />} accessibilityLabel="Nuevo torneo" onPress={() => onCreate('torneo')}>
              Torneo
            </Button>
          </View>
        ) : undefined
      }
    >
      {open && <WeekAgenda feeds={[feed]} leagues={[league]} matches={[]} today={today} />}
    </Sheet>
  );
}
