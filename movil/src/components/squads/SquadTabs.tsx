/**
 * Las pestañas de la página de un equipo (SquadTabs y el muro de SquadPage de la web, con su misma lógica:
 * src/components/squads/logic.ts): Publicaciones (el muro; publican los miembros), Juegos (`squad_games`), Torneos y
 * Estadísticas (`squad_stats`, con las ligas del equipo e «Inscribir en una liga») y la Plantilla (con la tarjeta del
 * jugador de `?jugador=`). Piden sesión: sin cuenta, la página no las monta.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AlertTriangle, Crown, Medal, MoreHorizontal, Newspaper, Send, Swords, Trophy, UserPlus, UserRound } from 'lucide-react-native';
import { useSquadPosts } from '@mm/lib/data/posts';
import { syncSquadRoster, useSquadGames, useSquadStats, withdrawSquadRequest, type SquadGame, type SquadMember, type SquadPage } from '@mm/lib/data/squads';
import { sportMeta } from '@mm/sports/registry';
import {
  LEAGUE_STATUS_TEXT,
  RESULT_MARK,
  canEnterLeagues,
  leaguesSoonText,
  memberCardLine,
  memberLine,
  mineFirstScore,
  recordOrNone,
  recordSummary,
  requestErrorText,
  sortRoster,
  squadAsk,
  squadGameMeta,
  squadGameTitle,
  squadLeagueRows,
  syncErrorText,
  syncText,
  tournamentLine,
  tournamentPath,
  type SquadLeagueRow,
  type SquadViewer,
} from '@mm/components/squads/logic';
import { DateBlock } from '../DateBlock';
import { Avatar } from '../social/Avatar';
import { PostList } from '../social/PostList';
import { confirmAsync, toast } from '../feedback';
import { Button, Card, ListRow, LoadError, Loading, SectionHeader, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { LeagueMark, LeagueStatusBadge, Quiet } from './bits';
import { SquadComposer } from './SquadComposer';

const line = (i: number, color: string) => (i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color } : null);

/** Su perfil en la app (el tuyo es Yo). */
export function openProfile(userId: string, me: boolean) {
  if (me) router.navigate('/yo');
  else router.push({ pathname: '/u/[userId]', params: { userId } });
}

// ---------- Publicaciones ----------

export function SquadWall({ squad, viewer }: { squad: SquadPage; viewer: SquadViewer }) {
  const c = useColors();
  const posts = useSquadPosts(squad.id);
  const member = viewer !== 'none';
  return (
    <View style={{ gap: 14 }}>
      {member && <SquadComposer squad={{ id: squad.id, name: squad.name }} placeholder="¿Qué cuenta el equipo?" />}
      <PostList
        list={posts}
        empty={
          <Quiet
            icon={<Newspaper size={24} color={c.muted} />}
            title="Todavía no hay publicaciones"
            text={member ? 'Escribe lo primero: el próximo partido, un resultado o una foto del equipo.' : 'Cuando el equipo publique algo, sale aquí y en tu Social si lo sigues.'}
          />
        }
      />
    </View>
  );
}

// ---------- Juegos ----------

/** G (verde), E (gris) o P (rojo) en un círculo; sin resultado, nada. */
function ResultMark({ result }: { result: SquadGame['result'] }) {
  const c = useColors();
  if (!result) return null;
  const m = RESULT_MARK[result];
  const bg = m.tone === 'ok' ? c.okSoft : m.tone === 'danger' ? c.dangerSoft : c.surface2;
  const fg = m.tone === 'ok' ? c.ok : m.tone === 'danger' ? c.danger : c.muted;
  return (
    <View accessibilityLabel={m.label} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Txt style={{ color: fg, fontFamily: font.bold, fontSize: 14 }}>{m.short}</Txt>
    </View>
  );
}

/** Un partido: la fecha, «Tigres vs Leones», la liga y la jornada, el marcador (el equipo primero) y G/E/P. Lleva al partido. */
function SquadGameRow({ game: g }: { game: SquadGame }) {
  const score = g.walkover ? null : mineFirstScore(g.score, g.side);
  return (
    <ListRow
      icon={<DateBlock date={g.at} />}
      title={squadGameTitle(g)}
      subtitle={squadGameMeta(g) || null}
      chevron={false}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {!!score && <Txt style={{ fontFamily: font.semibold, fontSize: 15 }}>{score}</Txt>}
          <ResultMark result={g.result} />
        </View>
      }
      onPress={() => openLink(g.url)}
    />
  );
}

/** Los partidos del equipo en sus ligas, del más nuevo al más viejo, con «Ver más». */
export function SquadGamesTab({ squadId }: { squadId: string }) {
  const c = useColors();
  const games = useSquadGames(squadId);
  if (games.loading && !games.data.length) return <Loading label="Cargando los partidos" />;
  if (games.error && !games.data.length) return <LoadError error={games.error} onRetry={games.refresh} />;
  if (!games.data.length) return <Quiet icon={<Swords size={24} color={c.muted} />} title="Todavía no hay partidos" text="Cuando el equipo juegue en una liga, sus partidos salen aquí con el resultado." />;
  return (
    <View style={{ gap: 12 }}>
      <Card padded={false}>
        {games.data.map((g, i) => (
          <View key={g.key} style={line(i, c.line)}>
            <SquadGameRow game={g} />
          </View>
        ))}
      </Card>
      {games.moreError && (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <AlertTriangle size={16} color={c.danger} />
          <Txt variant="meta" tone="danger">
            No se pudieron cargar más. Intenta de nuevo.
          </Txt>
        </View>
      )}
      {games.hasMore && (
        <Button loading={games.loadingMore} onPress={() => games.loadMore()} style={{ alignSelf: 'center' }}>
          Ver más
        </Button>
      )}
    </View>
  );
}

// ---------- Torneos ----------

/** Los torneos donde jugó (ligas tipo torneo y torneos de sus ligas), el más nuevo primero, con su récord. */
export function SquadTournamentsTab({ squadId }: { squadId: string }) {
  const c = useColors();
  const stats = useSquadStats(squadId);
  const list = stats.data?.tournaments ?? [];
  if (stats.loading && !stats.data) return <Loading label="Cargando los torneos" />;
  if (stats.error && !stats.data) return <LoadError error={stats.error} />;
  if (!list.length) return <Quiet icon={<Trophy size={24} color={c.muted} />} title="Todavía no juega torneos" text="Cuando el equipo juegue un torneo, sale aquí con su récord." />;
  return (
    <Card padded={false}>
      {list.map((t, i) => (
        <View key={`${t.leagueId}:${t.eventId ?? ''}`} style={line(i, c.line)}>
          <ListRow icon={<LeagueMark sport={t.sport} logo={null} />} title={t.name} subtitle={tournamentLine(t)} onPress={() => openLink(tournamentPath(t))} />
        </View>
      ))}
    </Card>
  );
}

// ---------- Estadísticas ----------

function Stat({ value, label, first }: { value: number; label: string; first?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 12, borderLeftWidth: first ? 0 : StyleSheet.hairlineWidth, borderLeftColor: c.line }}>
      <Txt style={{ fontSize: 23, lineHeight: 27, fontFamily: font.semibold }}>{value.toLocaleString('es-DO')}</Txt>
      <Txt variant="small" tone="muted" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * El récord total (jugados, ganados, empatados y perdidos) y las ligas del equipo: cada una con su récord, el de cada
 * temporada y cómo va su solicitud. El capitán retira una solicitud pendiente, pasa los miembros nuevos a una liga donde
 * ya está e inscribe el equipo en otra (`onRequest`).
 */
export function SquadStatsTab({ squad, viewer, onRequest }: { squad: SquadPage; viewer: SquadViewer; onRequest: () => void }) {
  const c = useColors();
  const stats = useSquadStats(squad.id);
  const record = stats.data?.record ?? squad.record;
  const rows = useMemo(() => squadLeagueRows(squad.leagues, stats.data?.leagues), [squad.leagues, stats.data]);
  const summary = recordSummary(record);
  return (
    <View style={{ gap: 28 }}>
      <View style={{ gap: 10 }}>
        <SectionHeader title="Récord" />
        <Card padded={false}>
          <View style={{ flexDirection: 'row' }}>
            <Stat first value={record.played} label="Jugados" />
            <Stat value={record.won} label="Ganados" />
            <Stat value={record.drawn} label="Empatados" />
            <Stat value={record.lost} label="Perdidos" />
          </View>
          <Txt variant="meta" tone="muted" style={{ textAlign: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingHorizontal: 20, paddingVertical: 10 }}>
            {summary || 'Sin partidos todavía'}
          </Txt>
        </Card>
      </View>
      <SquadLeagues squad={squad} rows={rows} viewer={viewer} onRequest={onRequest} />
    </View>
  );
}

function SquadLeagues({ squad, rows, viewer, onRequest }: { squad: SquadPage; rows: SquadLeagueRow[]; viewer: SquadViewer; onRequest: () => void }) {
  const c = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  const captain = viewer === 'captain';
  const canEnter = canEnterLeagues(squad.sport);

  if (!canEnter && !rows.length) return <Quiet icon={<Trophy size={24} color={c.muted} />} title="Ligas" text={leaguesSoonText(squad.sport)} />;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(l: SquadLeagueRow) {
    if (!l.requestId) return;
    if (!(await confirmAsync(squadAsk.withdraw(l.name)))) return;
    await run(l.requestId, async () => {
      try {
        await withdrawSquadRequest(squad.id, { requestId: l.requestId!, leagueId: l.leagueId });
        toast('Solicitud retirada');
      } catch (e) {
        console.error(e);
        toast(requestErrorText(e), 'error');
      }
    });
  }

  async function sync(l: SquadLeagueRow) {
    await run(l.leagueId, async () => {
      try {
        toast(syncText(await syncSquadRoster(squad.id, l.leagueId)));
      } catch (e) {
        console.error(e);
        toast(syncErrorText(e), 'error');
      }
    });
  }

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Ligas" />
      {rows.length ? (
        <Card padded={false}>
          {rows.map((l, i) => {
            const joined = l.status === 'approved' || l.status === null;
            const key = l.requestId ?? l.leagueId;
            const buttons: ReactNode =
              captain && l.status === 'pending' ? (
                <Button loading={busy === key} disabled={busy !== null} onPress={() => withdraw(l)}>
                  Retirar solicitud
                </Button>
              ) : captain && joined ? (
                <Button loading={busy === l.leagueId} disabled={busy !== null} icon={<UserPlus size={16} color={c.fg} />} onPress={() => sync(l)}>
                  Pasar miembros nuevos
                </Button>
              ) : null;
            return (
              <View key={key} style={line(i, c.line)}>
                <ListRow
                  icon={<LeagueMark sport={l.sport} logo={l.logo} />}
                  title={l.name}
                  subtitle={joined ? recordOrNone(l.record) : LEAGUE_STATUS_TEXT[l.status!]}
                  right={l.status ? <LeagueStatusBadge status={l.status} /> : undefined}
                  onPress={() => router.push({ pathname: '/l/[lid]', params: { lid: l.leagueId } })}
                />
                {(l.seasons.length > 0 || buttons) && (
                  <View style={{ gap: 8, paddingLeft: 68, paddingRight: 18, paddingBottom: 12 }}>
                    {l.seasons.length > 0 && (
                      <View accessibilityLabel={`Temporadas en ${l.name}`}>
                        {l.seasons.map((s) => (
                          <View key={s.seasonId} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 2 }}>
                            <Txt variant="meta" tone="fg2" numberOfLines={1} style={{ flexShrink: 1 }}>
                              {s.name}
                            </Txt>
                            <Txt variant="meta" tone="muted">
                              {recordOrNone(s.record)}
                            </Txt>
                          </View>
                        ))}
                      </View>
                    )}
                    {buttons}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      ) : (
        <Quiet
          icon={<Medal size={24} color={c.muted} />}
          title="Todavía no juega en ninguna liga"
          text={captain ? `Inscríbelo en una liga de ${sportMeta(squad.sport)?.lower ?? 'su deporte'}: los admins de la liga deciden.` : 'Cuando el capitán lo inscriba en una liga, sale aquí.'}
        />
      )}
      {captain && canEnter && (
        <Button variant="soft" size="xl" full icon={<Send size={20} color={c.accent} />} onPress={onRequest} style={{ marginTop: 6 }}>
          Inscribir en una liga
        </Button>
      )}
    </View>
  );
}

// ---------- Plantilla ----------

/** El jugador del link `?jugador=` (su «perfil en equipo» desde el perfil global): la foto, el nombre, «#10 · Portero · Capitán» y «Ver su perfil». */
function SquadMemberCard({ member: m, squadName }: { member: SquadMember; squadName: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 16, borderRadius: 22, backgroundColor: c.accentSoft, paddingHorizontal: 20, paddingVertical: 16 }}>
      <View accessibilityLabel={`${m.name} en ${squadName}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Avatar name={m.name} photo={m.avatar} size={64} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="small" tone="accent" numberOfLines={1} style={{ fontFamily: font.semibold }}>
            {`En ${squadName}`}
          </Txt>
          <Txt variant="cardTitle" numberOfLines={1}>
            {m.isMe ? `${m.name} (tú)` : m.name}
          </Txt>
          <Txt variant="meta" tone="fg2">
            {memberCardLine(m)}
          </Txt>
          {!!m.username && (
            <Txt variant="small" tone="muted">
              {`@${m.username}`}
            </Txt>
          )}
        </View>
        {m.jersey != null && (
          <Txt importantForAccessibility="no" tone="accent" style={{ fontSize: 34, lineHeight: 38, fontFamily: font.bold }}>
            {m.jersey}
          </Txt>
        )}
      </View>
      <Button full icon={<UserRound size={16} color={c.fg} />} onPress={() => openProfile(m.id, m.isMe)} style={{ backgroundColor: c.surface }}>
        Ver su perfil
      </Button>
    </View>
  );
}

/**
 * La plantilla: el capitán primero, cada uno con su posición y número; la fila lleva a su perfil. El capitán toca «•••»
 * para la posición y el número, la capitanía o sacarlo. `highlight` (`?jugador=`): su tarjeta arriba y su fila marcada.
 */
export function SquadRosterTab({ squad, viewer, highlight, onPick }: { squad: SquadPage; viewer: SquadViewer; highlight: string | null; onPick: (m: SquadMember) => void }) {
  const c = useColors();
  const roster = useMemo(() => sortRoster(squad.roster), [squad.roster]);
  const picked = highlight ? roster.find((m) => m.id === highlight) : undefined;
  const captain = viewer === 'captain';
  if (!roster.length) {
    return (
      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Cargando la plantilla" />
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      {picked && <SquadMemberCard member={picked} squadName={squad.name} />}
      <View style={{ gap: 12 }}>
        {captain && (
          <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
            Con «•••» cambias su posición y número, le pasas la capitanía o lo sacas.
          </Txt>
        )}
        <Card padded={false}>
          {roster.map((m, i) => {
            const marked = m.isMe || m.id === highlight;
            return (
              <View key={m.id} style={[line(i, c.line), marked ? { backgroundColor: c.accentSoft } : null]}>
                <ListRow
                  icon={<Avatar name={m.name} photo={m.avatar} size={40} />}
                  title={m.isMe ? `${m.name} (tú)` : m.name}
                  subtitle={memberLine(m) || null}
                  chevron={!captain && m.role !== 'captain'}
                  right={
                    m.role === 'captain' || captain ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {m.role === 'captain' && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: c.accentSoft, paddingHorizontal: 10, paddingVertical: 3 }}>
                            <Crown size={12} color={c.accent} />
                            <Txt style={{ color: c.accent, fontFamily: font.semibold, fontSize: 12 }}>Capitán</Txt>
                          </View>
                        )}
                        {captain && (
                          <Pressable accessibilityRole="button" accessibilityLabel={`${m.name}: opciones`} hitSlop={4} onPress={() => onPick(m)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
                            <MoreHorizontal size={20} color={c.muted} />
                          </Pressable>
                        )}
                      </View>
                    ) : undefined
                  }
                  onPress={() => openProfile(m.id, m.isMe)}
                />
              </View>
            );
          })}
        </Card>
      </View>
    </View>
  );
}
