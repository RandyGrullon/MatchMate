/**
 * Lo de Pro en Hoy (ProSections.tsx de la web, con su misma lógica: src/components/home/proHome.ts): «Por hacer»
 * (lo que espera al organizador en sus ligas), «En vivo» (cómo van todos en la práctica de hoy) y «Esta semana» (la
 * tira de lunes a domingo que abre el Calendario). En Lite no sale nada de esto.
 */
import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ClipboardCheck, FileSpreadsheet, Inbox, Plus } from 'lucide-react-native';
import type { CalendarMatch } from '@mm/lib/calendar';
import { useEventEntries, useEventLive, useEventSubmissions, usePlayers, type LeagueFeed } from '@mm/lib/data';
import { parseDate } from '@mm/lib/format';
import { isPlannedEvent, type LiveGame } from '@mm/lib/live';
import type { League, Submission } from '@mm/lib/types';
import { nextGameLabel, sheetPath, useNextGame, type GameCell, type NextGame, type TodayGames } from '@mm/lib/useNextGame';
import { leagueSport, sportsOf } from '@mm/sports/registry';
import { boardRows, type BoardRow } from '@mm/components/event/board';
import { LATE_WHEN } from '@mm/components/home/logic';
import { WEEK_LETTERS, approveLine, liveGames, liveShownRows, suggestionsText, teamsLine, weekBusy, weekDays, weekTitle, type ToDo } from '@mm/components/home/proHome';
import { initials } from '@/components/social/Avatar';
import { SportCorner, SportMark } from '@/components/agenda/SportMark';
import { CountBubble } from '@/components/organizer/Organize';
import { Button, Card, Divider, ListRow, RowIcon, SectionHeader, Txt } from '@/components/ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** El link de la derecha del título de una sección («Organizar», «Ver toda», «Calendario»). */
function SectionLink({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Txt variant="meta" tone="accent" accessibilityRole="button" suppressHighlighting style={{ fontFamily: font.semibold, paddingVertical: 12, paddingLeft: 12 }} onPress={onPress}>
      {children}
    </Txt>
  );
}

// ---------- La tarjeta de hoy, en Pro ----------

/**
 * La práctica o el torneo que se juega hoy, en Pro (TodayCard de la web con `pro`): «En juego · 6 jugando» con la liga al
 * lado, el título con «Pista 7», tus juegos en fichas chicas (J1 J2 J3 Serie) y «Seguir juego 3» con «Planilla» al
 * lado (si anotas el evento). «Cómo van todos» va abajo, en «En vivo». Lo que hace cada botón lo pone TodayGameCard.
 */
export function TodayCardPro({
  game,
  title,
  lane,
  mine,
  busy,
  onAct,
}: {
  game: LiveGame;
  title: string;
  lane: number | null;
  mine: TodayGames | null;
  busy: boolean;
  onAct: (next: NextGame) => void;
}) {
  const c = useColors();
  const { feed, league, event, info, late } = game;
  const planned = isPlannedEvent(event);
  const table = useLiveTable(game);
  const n = table.rows.length;
  const when = late ? LATE_WHEN : info.startsSoon && info.startLabel ? `Empieza a las ${info.startLabel}` : n ? `En juego · ${n} jugando` : 'En juego';
  const staff = feed.isAdmin || feed.isScorer;
  const next = mine?.next;
  const sheet = !!next && staff && next.kind !== 'planilla';
  return (
    <Card style={{ padding: 18, gap: 14 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${when}`}
        disabled={planned}
        onPress={() => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid: feed.lid, eventId: event.id } })}
        style={{ gap: 10 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <View style={[styles.liveDot, { backgroundColor: c.accent }]} />
            <Txt variant="bodyStrong" tone="accent" style={{ fontSize: 14 }}>
              {when}
            </Txt>
          </View>
          <Txt variant="meta" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {league.name}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SportMark sport="bowling" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="cardTitle" numberOfLines={1} style={{ fontSize: 21, lineHeight: 25 }}>
              {title}
            </Txt>
            {lane != null && (
              <Txt variant="meta" tone="muted" style={{ fontFamily: font.medium }}>
                Pista {lane}
              </Txt>
            )}
          </View>
        </View>
      </Pressable>
      {!mine || mine.loading ? (
        <View accessibilityLabel="Cargando tus juegos">
          <TileRows>{Array.from({ length: event.games + 1 }, (_, i) => <View key={i} style={[styles.tile, { backgroundColor: c.surface2 }]} />)}</TileRows>
        </View>
      ) : (
        <ProTiles cells={mine.cells} series={mine.series} />
      )}
      {next &&
        (sheet ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button variant="primary" size="lg" loading={busy} disabled={busy} onPress={() => onAct(next)} style={{ flex: 1.45 }}>
              {nextGameLabel(next, { pro: true })}
            </Button>
            <Button
              size="lg"
              disabled={busy}
              icon={<FileSpreadsheet size={18} color={c.fg} />}
              onPress={() => onAct({ kind: 'planilla', to: sheetPath(feed.lid, event.id) })}
              style={{ flex: 1 }}
            >
              Planilla
            </Button>
          </View>
        ) : (
          <Button variant="primary" size="lg" full loading={busy} disabled={busy} onPress={() => onAct(next)}>
            {nextGameLabel(next, { pro: true })}
          </Button>
        ))}
    </Card>
  );
}

/** Las fichas chicas de tus juegos (GameTiles de la web en Pro): el que sigue con «+», el que va a medias punteado, la Serie. */
function ProTiles({ cells, series }: { cells: readonly GameCell[]; series: number }) {
  const c = useColors();
  const next = cells.findIndex((x) => x.kind === 'vacio' || x.kind === 'medias');
  const label = (text: string, accent?: boolean) => (
    <Txt numberOfLines={1} style={{ fontSize: 12, fontFamily: font.medium, color: accent ? c.accent : c.muted }}>
      {text}
    </Txt>
  );
  const score = (v: number | string, color: string) => (
    <Txt style={{ fontSize: 24, lineHeight: 26, letterSpacing: -0.7, fontFamily: font.semibold, color, fontVariant: ['tabular-nums'] }}>{v}</Txt>
  );
  return (
    <TileRows>
      {cells.map((cell, i) => {
        const name = `J${i + 1}`;
        if (cell.kind === 'medias') {
          const pct = cell.progress != null ? Math.round(Math.min(1, Math.max(0, cell.progress)) * 100) : null;
          return (
            <View key={i} accessibilityLabel={`${name}: ${cell.score != null ? `${cell.score}, a medias` : 'a medias'}`} style={[styles.tile, styles.draft, { borderColor: c.accent, backgroundColor: c.accentSoft }]}>
              {label(name, true)}
              {cell.score ? (
                <Txt style={{ fontSize: 20, lineHeight: 22, fontFamily: font.semibold, color: c.accent }}>{`${cell.score}…`}</Txt>
              ) : (
                <View>
                  <Txt style={{ fontSize: 13, fontFamily: font.bold, color: c.accent }}>A medias</Txt>
                  {pct != null && (
                    <View style={{ marginTop: 5, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: c.surface }}>
                      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: c.accent }} />
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        }
        if (cell.kind === 'vacio')
          return i === next ? (
            <View key={i} accessibilityLabel={`${name}: por anotar`} style={[styles.tile, { backgroundColor: c.accentSoft }]}>
              {label(name, true)}
              <Plus size={20} color={c.accent} strokeWidth={2.4} />
            </View>
          ) : (
            <View key={i} accessibilityLabel={`${name}: sin anotar`} style={[styles.tile, { backgroundColor: c.surface2 }]}>
              {label(name)}
              {score('–', c.faint)}
            </View>
          );
        // Lo enviado todavía no cuenta: en gris hasta que lo aprueben.
        return (
          <View key={i} accessibilityLabel={`${name}: ${cell.score}`} style={[styles.tile, { backgroundColor: c.surface2 }]}>
            {label(name)}
            {score(cell.score, cell.kind === 'enviado' ? c.faint : c.fg)}
          </View>
        );
      })}
      <View accessibilityLabel={`Serie: ${series}`} style={[styles.tile, { borderWidth: 1, borderColor: c.line }]}>
        {label('Serie')}
        {score(series, c.fg)}
      </View>
    </TileRows>
  );
}

/** Las fichas de a cuatro por fila (grid-cols-4 de la web): la última fila, con huecos para que no se estiren. */
function TileRows({ children }: { children: ReactNode }) {
  const rows: ReactNode[][] = [];
  Children.toArray(children).forEach((ch, i) => {
    if (i % 4 === 0) rows.push([]);
    rows[rows.length - 1].push(ch);
  });
  return (
    <View style={{ gap: 8 }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
          {row}
          {Array.from({ length: 4 - row.length }, (_, i) => (
            <View key={`hueco-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ---------- Por hacer ----------

/** El deporte de la liga de una tarea: el torneo lo lleva siempre; aprobar y el buzón, en la esquina si `corner`. */
interface ToDoSport {
  sport: string;
  game: string | null;
  corner: boolean;
}

/** El ícono de una tarea con el deporte en su esquina (solo si la cuenta tiene ligas de más de un deporte). */
function TaskIcon({ sport, children }: { sport: ToDoSport; children: ReactNode }) {
  if (!sport.corner) return children;
  return (
    <SportCorner sport={sport.sport} game={sport.game}>
      {children}
    </SportCorner>
  );
}

/**
 * Pro · «Por hacer»: lo que espera al organizador en sus ligas, en una lista con contadores (aprobar juegos, torneos sin
 * equipos con el deporte de su liga, buzón; con ligas de varios deportes, cada tarea con el suyo en la esquina).
 * «Organizar» lleva a Organizar de la liga. Nada si no hay nada pendiente.
 */
export function ToDoSection({ todo, leagues }: { todo: readonly ToDo[]; leagues: readonly League[] }) {
  if (!todo.length) return null;
  const many = todo.length > 1;
  const nameOf = (lid: string) => leagues.find((l) => l.id === lid)?.name ?? 'la liga';
  // Con ligas de más de un deporte, también aprobar y el buzón dicen de qué deporte son (en la esquina del ícono).
  const manySports = sportsOf(leagues).length > 1;
  const sportOf = (lid: string): ToDoSport => {
    const l = leagues.find((x) => x.id === lid);
    return { sport: l ? leagueSport(l) : 'bowling', game: l?.game ?? null, corner: manySports };
  };
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Por hacer" action={<SectionLink onPress={() => openLink(`/l/${todo[0].lid}/admin`)}>Organizar</SectionLink>} />
      <Card padded={false}>
        {todo.map((t, i) => (
          <View key={t.lid}>
            {i > 0 && <Divider inset={68} />}
            <ToDoRows todo={t} league={many ? nameOf(t.lid) : null} sport={sportOf(t.lid)} />
          </View>
        ))}
      </Card>
    </View>
  );
}

function ToDoRows({ todo, league, sport }: { todo: ToDo; league: string | null; sport: ToDoSport }) {
  const c = useColors();
  const rows: ReactNode[] = [];
  if (todo.approvals > 0) rows.push(<ApproveRow key="aprobar" lid={todo.lid} pending={todo.pending} league={league} sport={sport} />);
  for (const t of todo.teams)
    rows.push(
      <ListRow
        key={t.id}
        // El torneo con su deporte (y el trofeo chico), como en «Tus torneos».
        icon={<SportMark sport={sport.sport} game={sport.game} torneo />}
        title={t.name}
        subtitle={teamsLine(t.date, league)}
        onPress={() => openLink(`/l/${todo.lid}/e/${t.id}?tab=equipos`)}
      />,
    );
  if (todo.suggestions > 0)
    rows.push(
      <ListRow
        key="buzon"
        icon={
          <TaskIcon sport={sport}>
            <RowIcon>
              <Inbox size={20} color={c.accent} />
            </RowIcon>
          </TaskIcon>
        }
        title={league ? `Buzón · ${league}` : 'Buzón de la liga'}
        subtitle={suggestionsText(todo.suggestions)}
        accessibilityLabel={`Buzón de la liga: ${suggestionsText(todo.suggestions)}`}
        right={<CountBubble n={todo.suggestions} />}
        onPress={() => openLink(`/l/${todo.lid}/admin?tab=buzon`)}
      />,
    );
  return (
    <>
      {rows.map((r, i) => (
        <View key={i}>
          {i > 0 && <Divider inset={68} />}
          {r}
        </View>
      ))}
    </>
  );
}

/** «Aprobar juegos · Sofía y Carmen · con foto» con el contador (lee los nombres de los jugadores de esa liga). */
function ApproveRow({ lid, pending, league, sport }: { lid: string; pending: readonly Submission[]; league: string | null; sport: ToDoSport }) {
  const c = useColors();
  const players = usePlayers(lid);
  const count = pending.length;
  const names = pending.map((s) => players.data.find((p) => p.id === s.playerId)?.name ?? '');
  return (
    <ListRow
      icon={
        <TaskIcon sport={sport}>
          <View style={[styles.taskIcon, { backgroundColor: c.warnSoft }]}>
            <ClipboardCheck size={20} color={c.warn} />
          </View>
        </TaskIcon>
      }
      title="Aprobar juegos"
      subtitle={approveLine(pending, names, league)}
      accessibilityLabel={`Aprobar juegos: ${count} por aprobar`}
      right={<CountBubble n={count} />}
      onPress={() => openLink(`/l/${lid}/admin?tab=aprobar`)}
    />
  );
}

// ---------- En vivo ----------

/** Cómo van todos en el evento y el nombre de cada uno (useLiveTable de la web: la misma tabla de la Planilla). */
function useLiveTable(game: Pick<LiveGame, 'feed' | 'event'>) {
  const lid = game.feed.lid;
  const event = isPlannedEvent(game.event) ? undefined : game.event;
  const entries = useEventEntries(lid, event?.id);
  const subs = useEventSubmissions(lid, event?.id);
  const live = useEventLive(lid, event?.id);
  const players = usePlayers(lid);
  const rows = event ? boardRows(event, entries.data, subs.data, live.data) : [];
  const nameOf = (id: string) => players.data.find((p) => p.id === id)?.name ?? 'Jugador';
  return { rows, nameOf };
}

/**
 * Pro · «En vivo»: cómo van todos en la práctica de hoy (los 3 primeros y tú, con tus juegos «187 · 210 · 74…»). «Ver
 * toda» abre la práctica con la tabla entera. El total y el puesto son solo de lo aprobado; lo que espera aprobación
 * sale en ámbar y no suma.
 */
export function LiveSectionPro({ game, today }: { game: LiveGame; today: string }) {
  const { rows, nameOf } = useLiveTable(game);
  const mine = useNextGame(game, today);
  if (!rows.length) return null;
  const me = game.feed.playerId;
  const lid = game.feed.lid;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title="En vivo"
        action={<SectionLink onPress={() => router.push({ pathname: '/l/[lid]/e/[eventId]', params: { lid, eventId: game.event.id } })}>Ver toda</SectionLink>}
      />
      <Card padded={false}>
        {liveShownRows(rows, me).map((r, i) => (
          <View key={r.playerId}>
            {i > 0 && <Divider inset={16} />}
            <LiveRow row={r} name={nameOf(r.playerId)} me={r.playerId === me} games={liveGames(r, me, mine?.partial?.score)} onPress={() => openLink(`/l/${lid}/j/${r.playerId}`)} />
          </View>
        ))}
      </Card>
    </View>
  );
}

function LiveRow({ row, name, me, games, onPress }: { row: BoardRow; name: string; me: boolean; games: { text: string; pend: boolean }[]; onPress: () => void }) {
  const c = useColors();
  const spoken = games.map((g) => (g.pend ? `${g.text} (por aprobar)` : g.text)).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.pos}. ${name}${me ? ', tú' : ''}: ${row.total}${spoken ? `. ${spoken}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.liveRow, { backgroundColor: pressed ? c.surface2 : me ? c.accentSoft : 'transparent' }]}
    >
      <Txt variant="meta" tone="muted" style={{ width: 18, textAlign: 'center', fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>
        {row.pos}
      </Txt>
      <View style={[styles.face, { backgroundColor: me ? c.accent : c.surface2 }]}>
        <Txt style={{ fontSize: 12, fontFamily: font.semibold, color: me ? c.accentFg : c.fg2 }}>{initials(name)}</Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </Txt>
          {me && (
            <View style={[styles.you, { backgroundColor: c.surface }]}>
              <Txt style={{ fontSize: 12, fontFamily: font.semibold, color: c.accent }}>Tú</Txt>
            </View>
          )}
        </View>
        {games.length > 0 && (
          <Txt variant="meta" tone="muted" numberOfLines={1}>
            {games.map((g, i) => (
              <Txt key={i} variant="meta" tone={g.pend ? 'warn' : 'muted'}>
                {i > 0 ? ' · ' : ''}
                {g.text}
              </Txt>
            ))}
          </Txt>
        )}
      </View>
      <Txt variant="bodyStrong" style={{ fontSize: 17, fontVariant: ['tabular-nums'] }}>
        {row.total}
      </Txt>
    </Pressable>
  );
}

// ---------- Esta semana ----------

/**
 * Pro · «Esta semana · octubre»: la tira de lunes a domingo con un punto en los días que tienen algo y hoy en el color
 * del deporte. Tocarla (o «Calendario») abre el calendario.
 */
export function WeekStrip({
  feeds,
  leagues,
  matches,
  today,
  onOpen,
}: {
  feeds: readonly LeagueFeed[];
  leagues: readonly League[];
  matches: readonly CalendarMatch[];
  today: string;
  onOpen: () => void;
}) {
  const c = useColors();
  const busy = weekBusy(feeds, leagues, matches, today);
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={weekTitle(today)} action={<SectionLink onPress={onOpen}>Calendario</SectionLink>} />
      <Card padded={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir el calendario de la semana" onPress={onOpen} style={styles.week}>
          {weekDays(today).map((d, i) => {
            const isToday = d === today;
            return (
              <View key={d} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <Txt style={{ fontSize: 12, fontFamily: font.semibold, color: c.muted }}>{WEEK_LETTERS[i]}</Txt>
                <View style={[styles.day, isToday && { backgroundColor: c.accent }]}>
                  <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: isToday ? c.accentFg : c.fg }}>{parseDate(d).getDate()}</Txt>
                </View>
                <View style={[styles.dot, { backgroundColor: busy.has(d) ? c.accent : 'transparent' }]} />
              </View>
            );
          })}
        </Pressable>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  tile: { flex: 1, minWidth: 0, height: 64, borderRadius: 15, paddingHorizontal: 11, paddingVertical: 9, justifyContent: 'space-between' },
  draft: { borderWidth: 1.5, borderStyle: 'dashed', paddingHorizontal: 10, paddingVertical: 8 },
  taskIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, paddingVertical: 8 },
  face: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  you: { height: 22, borderRadius: 11, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  week: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 12 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
