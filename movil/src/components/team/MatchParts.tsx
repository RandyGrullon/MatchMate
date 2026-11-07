/**
 * Las piezas del partido de equipos en la app (bits.tsx del baloncesto y del fútbol, Convocatoria.tsx y LiveWatchPill
 * de la web, con su misma lógica: los adaptadores de cada deporte, matchView.ts y teamSports.ts):
 * - «Ver en vivo» si el partido se transmite.
 * - En vivo: el cuarto, el reloj de referencia y las faltas con BONUS (baloncesto); el tiempo y el minuto, el añadido,
 *   las faltas de sala, las rojas y los 2 minutos con uno menos (fútbol y sala).
 * - «Por cuarto» y «Puntos» (baloncesto; en Pro, también triples, tiros libres y faltas); los goles por tiempo, «Goles y
 *   tarjetas», la tabla «Jugadores» de Pro y el acta completa (fútbol y sala); los suspendidos para el partido.
 * - La convocatoria: «¿Vas a este partido?» y cada equipo con cómo va y su «Lista» (el capitán o delegado marca a los
 *   de su equipo; el admin, a todos).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { AlertTriangle, Check, ChevronDown, CircleHelp, Goal, Timer, X } from 'lucide-react-native';
import type { Match } from '@mm/lib/data/matches';
import { streamFor, useLeagueStreams } from '@mm/lib/data/streams';
import { RSVP_LABEL, rsvpShortfall, rsvpSummary, setMatchRsvp, useMatchRsvps, useServerOffset, type MatchRsvp, type RsvpStatus } from '@mm/lib/data/teamSports';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useNow } from '@mm/lib/useNow';
import { liveHref } from '@mm/components/live/logic';
import { formatClock } from '@mm/sports/team/clock';
import type { Side } from '@mm/sports/types';
import { decodeLines as decodeBasketballLines, liveClockMs, liveFromScore as basketballLive, periodsFromScore as basketballPeriods } from '@mm/pages/sports/basketball/adapter';
import { boxRows, periodHeader } from '@mm/pages/sports/basketball/matchView';
import { decodeLines as decodeFootballLines, decodeTimeline, liveFromScore as footballLive, liveMinute, livePowerPlays, pensFromScore } from '@mm/pages/sports/football/adapter';
import { KIND_TEXT, actaRows, eventPlayerSide, periodsLineParts, playerLineNotes, sidePlayerLines, stateFromSnapshot } from '@mm/pages/sports/football/matchView';
import { REASON_TEXT } from '@mm/pages/sports/football/rules';
import { rosterOf, rosterSide, rsvpTargets } from '@mm/pages/sports/team/logic';
import { convocatoriaLine, flaggedCalled } from '@mm/pages/sports/team/matchView';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { rsvpLine } from '@mm/pages/sports/team/view';
import { toast } from '../feedback';
import { Badge, Card, SectionHeader, Txt } from '../ui';
import { Jersey, RsvpBadge, TeamCrest } from './TeamBits';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const isLive = (m: Pick<Match, 'status'>) => m.status === 'live' || m.status === 'suspended';

/** «Ver en vivo» (LiveWatchPill de la web): sale si el partido se está transmitiendo. */
export function LiveWatchPill({ lid, matchId }: { lid: string; matchId: string }) {
  const c = useColors();
  const streams = useLeagueStreams(lid).data;
  const stream = streamFor(streams, { matchId });
  if (!stream) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Ver en vivo"
      onPress={() => router.push(liveHref(lid, stream.id) as Href)}
      style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 18, paddingHorizontal: 14, backgroundColor: c.danger, transform: [{ scale: pressed ? 0.97 : 1 }] })}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.onDanger }} />
      <Txt style={{ fontSize: 14, fontFamily: font.bold, color: c.onDanger }}>Ver en vivo</Txt>
    </Pressable>
  );
}

/** La línea tranquila de lo que pasa en vivo (cada pieza separada; se acomodan en varias líneas). */
function Strip({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4, paddingHorizontal: 4 }}>{children}</View>;
}

const Bonus = () => (
  <Txt tone="danger" style={{ fontSize: 11, fontFamily: font.bold, letterSpacing: 0.5 }}>
    {' BONUS'}
  </Txt>
);

/**
 * Baloncesto en vivo: periodo, reloj de referencia (lo avanza este teléfono con la hora del servidor, sin volver a
 * consultar) y faltas de equipo con BONUS.
 */
export function BasketballLiveStrip({ match: m, names }: { match: Pick<Match, 'score' | 'status'>; names: readonly [string, string] }) {
  const live = basketballLive(m.score);
  const offset = useServerOffset();
  // Con el reloj corriendo se repinta cada medio segundo; si no, cada minuto basta.
  const now = useNow(live?.clk?.r && m.status === 'live' ? 500 : 60_000).getTime();
  if (!live || !isLive(m)) return null;
  const ms = liveClockMs(live, now + offset);
  return (
    <Strip>
      <Txt variant="small" tone="accent" style={{ fontFamily: font.semibold }}>
        {live.pl}
      </Txt>
      {ms !== null && (
        <Txt variant="small" style={{ fontFamily: font.semibold }}>
          {formatClock(ms, 'up')}
          {!live.clk?.r && (
            <Txt variant="small" tone="muted">
              {' (parado)'}
            </Txt>
          )}
        </Txt>
      )}
      <Txt variant="small" tone="muted">
        {`Faltas: ${names[0]} ${live.tf[0]}`}
        {live.bonus[0] && <Bonus />}
        {` · ${names[1]} ${live.tf[1]}`}
        {live.bonus[1] && <Bonus />}
      </Txt>
      {m.status === 'suspended' && (
        <Txt variant="small" tone="warn" style={{ fontFamily: font.semibold }}>
          Suspendido
        </Txt>
      )}
    </Strip>
  );
}

/** Tarjetita amarilla o roja (la doble amarilla, amarilla sobre roja). */
export function CardIcon({ kind }: { kind: 'yellow' | 'second_yellow' | 'red' }) {
  const card = (bg: string, style?: object) => <View style={[{ width: 10, height: 14, borderRadius: 2, backgroundColor: bg, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.12)' }, style]} />;
  if (kind === 'second_yellow') {
    return (
      <View accessibilityLabel="Doble amarilla" style={{ width: 14, height: 16 }}>
        {card('#facc15', { position: 'absolute', left: 0, top: 0 })}
        {card('#dc2626', { position: 'absolute', right: 0, bottom: 0 })}
      </View>
    );
  }
  return <View accessibilityLabel={kind === 'yellow' ? 'Amarilla' : 'Roja'}>{card(kind === 'yellow' ? '#facc15' : '#dc2626')}</View>;
}

/**
 * Fútbol y sala en vivo: tiempo y minuto (lo avanza este teléfono con la hora del servidor), añadido, penales, faltas
 * acumuladas de sala, rojas y los 2 minutos con uno menos.
 */
export function FootballLiveStrip({ match: m, names }: { match: Pick<Match, 'score' | 'status'>; names: readonly [string, string] }) {
  const c = useColors();
  const live = footballLive(m.score);
  const offset = useServerOffset();
  const now = useNow(live?.clk?.r && m.status === 'live' ? 1000 : 60_000).getTime();
  if (!live || !isLive(m)) return null;
  const serverNow = now + offset;
  const minute = liveMinute(live, serverNow);
  const pps = livePowerPlays(live, serverNow);
  const pens = pensFromScore(m.score);
  const tenM = (n: number) =>
    n >= 5 ? (
      <Txt tone="danger" style={{ fontSize: 11, fontFamily: font.bold }}>
        {' 10 m'}
      </Txt>
    ) : null;
  return (
    <Strip>
      <Txt variant="small" tone="accent" style={{ fontFamily: font.semibold }}>
        {live.pl}
      </Txt>
      {!!minute && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Timer size={14} color={c.accent} />
          <Txt variant="small" style={{ fontFamily: font.semibold }}>
            {minute}
            {!live.clk?.r && (
              <Txt variant="small" tone="muted">
                {' (parado)'}
              </Txt>
            )}
          </Txt>
        </View>
      )}
      {live.add != null && live.add > 0 && (
        <Txt variant="small" tone="muted">
          {`+${live.add} de añadido`}
        </Txt>
      )}
      {live.so && pens && (
        <Txt variant="small" style={{ fontFamily: font.semibold }}>
          {`Penales ${pens[0]}-${pens[1]}`}
        </Txt>
      )}
      {live.f && (
        <Txt variant="small" tone="muted">
          {`Faltas: ${names[0]} ${live.f[0]}`}
          {tenM(live.f[0])}
          {` · ${names[1]} ${live.f[1]}`}
          {tenM(live.f[1])}
        </Txt>
      )}
      {(live.r[0] > 0 || live.r[1] > 0) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <CardIcon kind="red" />
          <Txt variant="small" tone="muted">
            {[live.r[0] > 0 ? `${names[0]} ${live.r[0]}` : '', live.r[1] > 0 ? `${names[1]} ${live.r[1]}` : ''].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      )}
      {pps.map((p, i) => (
        <Txt key={i} variant="small" tone="warn" style={{ fontFamily: font.semibold }}>
          {`${names[p.side - 1]} con uno menos · ${formatClock(p.remainingMs, 'up')}`}
        </Txt>
      ))}
      {m.status === 'suspended' && (
        <Txt variant="small" tone="warn" style={{ fontFamily: font.semibold }}>
          Suspendido
        </Txt>
      )}
    </Strip>
  );
}

/** El en vivo del deporte (baloncesto o fútbol y sala). */
export function LiveStrip({ match, names, basketball }: { match: Pick<Match, 'score' | 'status'>; names: readonly [string, string]; basketball: boolean }) {
  return basketball ? <BasketballLiveStrip match={match} names={names} /> : <FootballLiveStrip match={match} names={names} />;
}

// ---------- Baloncesto: por cuarto y puntos ----------

const TH = { fontSize: 11, fontFamily: font.bold, letterSpacing: 0.5, textTransform: 'uppercase' as const };

/** Puntos por periodo («1C 2C 3C 4C Pr.») en una tarjeta, con su título; nada si hay un solo periodo. */
export function PeriodsTable({ match: m, names, periodsPerGame }: { match: Pick<Match, 'score'>; names: readonly [string, string]; periodsPerGame: number }) {
  const c = useColors();
  const periods = basketballPeriods(m.score);
  if (periods.length < 2) return null;
  const cell = { width: 34, textAlign: 'right' as const };
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={periodsPerGame === 2 ? 'Por mitad' : 'Por cuarto'} />
      <Card padded={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flex: 1, minWidth: '100%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
              <View style={{ flex: 1, minWidth: 96 }} />
              {periods.map((_, i) => (
                <Txt key={i} tone="muted" style={[TH, cell]}>
                  {periodHeader(i, periodsPerGame)}
                </Txt>
              ))}
              <Txt tone="muted" style={[TH, cell, { width: 44 }]}>
                T
              </Txt>
            </View>
            {([0, 1] as const).map((k) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.line }}>
                <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1, minWidth: 96, paddingRight: 8, fontSize: 15 }}>
                  {names[k]}
                </Txt>
                {periods.map((p, i) => (
                  <Txt key={i} tone="muted" style={[cell, { fontSize: 15 }]}>
                    {p[k]}
                  </Txt>
                ))}
                <Txt style={[cell, { width: 44, fontSize: 17, fontFamily: font.bold }]}>{periods.reduce((a, p) => a + p[k], 0)}</Txt>
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>
    </View>
  );
}

/** El ancho de cada columna de números de «Puntos» y «Jugadores» (Pro). */
const NUM = 34;

/**
 * Los puntos de cada presente (de lo publicado por la mesa), un equipo por tarjeta, del que más anotó al que menos. En Pro
 * (`full`), también triples (3P), tiros libres anotados (TL) y faltas (F; con 5, en rojo).
 */
export function BoxScore({ tl, match: m, full }: { tl: TeamLeague; match: Match; full?: boolean }) {
  const c = useColors();
  const lines = useMemo(() => decodeBasketballLines(m.score?.lines), [m.score]);
  if (!lines.length) return null;
  return (
    <View style={{ gap: 14 }}>
      {m.sides.map((sd) => {
        const rows = boxRows(lines, sd.side);
        if (!rows.length) return null;
        return (
          <Card key={sd.side} padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
              <Txt style={{ flex: 1, fontSize: 15, fontFamily: font.bold }} numberOfLines={1}>
                {tl.teamOf(sd.teamId)?.name ?? sd.label}
              </Txt>
              <Txt tone="muted" style={full ? [TH, { width: NUM, textAlign: 'right' }] : TH} accessibilityLabel="Puntos">
                PTS
              </Txt>
              {full && (
                <>
                  <Txt tone="muted" style={[TH, { width: NUM, textAlign: 'right' }]} accessibilityLabel="Triples">
                    3P
                  </Txt>
                  <Txt tone="muted" style={[TH, { width: NUM, textAlign: 'right' }]} accessibilityLabel="Tiros libres anotados">
                    TL
                  </Txt>
                  <Txt tone="muted" style={[TH, { width: NUM, textAlign: 'right' }]} accessibilityLabel="Faltas">
                    F
                  </Txt>
                </>
              )}
            </View>
            {rows.map((l) => {
              const j = sd.players.find((p) => p.playerId === l.playerId)?.jersey ?? tl.jerseyOf(l.playerId, sd.teamId);
              return (
                <View key={l.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
                  <Txt tone="faint" style={{ width: 30, fontSize: 13, fontFamily: font.semibold }}>
                    {j != null ? `#${j}` : ''}
                  </Txt>
                  <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.medium }}>
                    {tl.nameOf(l.playerId)}
                  </Txt>
                  <Txt style={full ? { width: NUM, textAlign: 'right', fontSize: 17, fontFamily: font.bold } : { fontSize: 17, fontFamily: font.bold }}>{l.points}</Txt>
                  {full && (
                    <>
                      <Txt tone="muted" style={{ width: NUM, textAlign: 'right', fontSize: 15 }}>
                        {l.threes}
                      </Txt>
                      <Txt tone="muted" style={{ width: NUM, textAlign: 'right', fontSize: 15 }}>
                        {l.ones}
                      </Txt>
                      <Txt tone={l.fouls >= 5 ? 'danger' : 'muted'} style={{ width: NUM, textAlign: 'right', fontSize: 15, fontFamily: l.fouls >= 5 ? font.bold : font.regular }}>
                        {l.fouls}
                      </Txt>
                    </>
                  )}
                </View>
              );
            })}
          </Card>
        );
      })}
    </View>
  );
}

// ---------- Fútbol y sala: goles por tiempo, goles y tarjetas, acta completa ----------

/** Goles por tiempo («1T: 1-0 · 2T: 0-1») y los penales. */
export function PeriodsLine({ match: m }: { match: Pick<Match, 'score'> }) {
  const { periods, pens } = periodsLineParts(m.score);
  if (!periods.length && !pens) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, paddingHorizontal: 4 }}>
      {periods.map((p) => (
        <Txt key={p} variant="small" tone="muted">
          {p}
        </Txt>
      ))}
      {!!pens && (
        <Txt variant="small" style={{ fontFamily: font.semibold }}>
          {pens}
        </Txt>
      )}
    </View>
  );
}

/** «#10 Jugador Uno» (el dorsal del partido o el de su equipo). */
function whoIn(tl: TeamLeague, m: Pick<Match, 'sides'>, side: Side, id: string | null | undefined): string {
  if (!id) return '';
  const j = m.sides[side - 1].players.find((p) => p.playerId === id)?.jersey ?? tl.jerseyOf(id, m.sides[side - 1].teamId);
  return `${j != null ? `#${j} ` : ''}${tl.nameOf(id)}`;
}

/** Goles y tarjetas del acta con su minuto (de lo publicado), local a la izquierda y visita a la derecha. */
export function MatchTimeline({ tl, match: m, names }: { tl: TeamLeague; match: Pick<Match, 'score' | 'sides'>; names: readonly [string, string] }) {
  const c = useColors();
  const lines = useMemo(() => decodeFootballLines(m.score?.lines), [m.score]);
  const events = useMemo(() => decodeTimeline(m.score?.tl, lines), [m.score, lines]);
  if (!events.length) return null;
  return (
    <Card style={{ paddingVertical: 8 }}>
      {events.map((e, i) => {
        const playerSide = eventPlayerSide(e);
        const right = e.side === 2;
        const goal = e.kind === 'goal' || e.kind === 'own_goal';
        const name = whoIn(tl, m, playerSide, e.player) || (goal ? names[e.side - 1] : '');
        return (
          <View key={i} style={{ flexDirection: right ? 'row-reverse' : 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.line }}>
            <Txt tone="muted" style={{ width: 36, textAlign: 'center', fontSize: 13, fontFamily: font.semibold }}>
              {e.minute ? `${e.minute}'` : ''}
            </Txt>
            {goal ? <Goal size={16} color={e.kind === 'own_goal' ? c.danger : c.ok} /> : <CardIcon kind={e.kind as 'yellow' | 'second_yellow' | 'red'} />}
            <View style={{ flex: 1, minWidth: 0, alignItems: right ? 'flex-end' : 'flex-start' }}>
              <Txt style={{ fontSize: 15, fontFamily: font.medium, textAlign: right ? 'right' : 'left' }}>
                {name}
                {e.kind === 'own_goal' && <Txt tone="muted">{' (autogol)'}</Txt>}
                {!e.player && !goal && <Txt tone="muted">{KIND_TEXT[e.kind]}</Txt>}
              </Txt>
              {!!e.assist && (
                <Txt variant="small" tone="muted" style={{ textAlign: right ? 'right' : 'left' }}>
                  {`Asistencia: ${whoIn(tl, m, e.side, e.assist)}`}
                </Txt>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/**
 * «Jugadores» (Pro, PlayersTable de la web): los de cada lado por dorsal con goles (y autogoles), asistencias y tarjetas
 * del acta publicada, un equipo por tarjeta; el portero con sus recibidos y los del banco, apagados.
 */
export function PlayersTable({ tl, match: m }: { tl: TeamLeague; match: Match }) {
  const c = useColors();
  const lines = useMemo(() => decodeFootballLines(m.score?.lines), [m.score]);
  if (!lines.length) return null;
  const jersey = (l: (typeof lines)[number]) => m.sides[l.side - 1].players.find((p) => p.playerId === l.playerId)?.jersey ?? tl.jerseyOf(l.playerId, m.sides[l.side - 1].teamId);
  return (
    <View style={{ gap: 14 }}>
      {m.sides.map((sd) => {
        const rows = sidePlayerLines(lines, sd.side, jersey);
        if (!rows.length) return null;
        return (
          <Card key={sd.side} padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
              <Txt style={{ flex: 1, fontSize: 15, fontFamily: font.bold }} numberOfLines={1}>
                {tl.teamOf(sd.teamId)?.name ?? sd.label}
              </Txt>
              <Txt tone="muted" style={[TH, { width: NUM, textAlign: 'right' }]} accessibilityLabel="Goles">
                G
              </Txt>
              <Txt tone="muted" style={[TH, { width: NUM, textAlign: 'right' }]} accessibilityLabel="Asistencias">
                A
              </Txt>
              <Txt tone="muted" style={[TH, { width: NUM + 10, textAlign: 'right' }]} accessibilityLabel="Tarjetas">
                T
              </Txt>
            </View>
            {rows.map((l) => {
              const j = jersey(l);
              const notes = playerLineNotes(l);
              return (
                <View key={l.playerId} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
                  <Txt tone="faint" style={{ width: 30, fontSize: 13, fontFamily: font.semibold }}>
                    {j != null ? `#${j}` : ''}
                  </Txt>
                  <Txt numberOfLines={1} tone={l.played ? 'fg' : 'muted'} style={{ flex: 1, fontSize: 15, fontFamily: font.medium }}>
                    {tl.nameOf(l.playerId)}
                    {notes.length > 0 && <Txt tone="muted" style={{ fontSize: 13, fontFamily: font.regular }}>{` ${notes.join(' ')}`}</Txt>}
                  </Txt>
                  <Txt style={{ width: NUM, textAlign: 'right', fontSize: 17, fontFamily: font.bold }}>
                    {l.goals || ''}
                    {l.ownGoals ? <Txt tone="danger" style={{ fontSize: 12, fontFamily: font.regular }}>{` (${l.ownGoals} AG)`}</Txt> : null}
                  </Txt>
                  <Txt tone="muted" style={{ width: NUM, textAlign: 'right', fontSize: 15 }}>
                    {l.assists || ''}
                  </Txt>
                  <View style={{ width: NUM + 10, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                    {l.red === 'second_yellow' ? (
                      <CardIcon kind="second_yellow" />
                    ) : (
                      <>
                        {Array.from({ length: l.yellows }, (_, k) => (
                          <CardIcon key={k} kind="yellow" />
                        ))}
                        {l.red === 'direct' && <CardIcon kind="red" />}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </Card>
        );
      })}
    </View>
  );
}

/** El acta completa (de la lista de jugadas del anotador): goles, tarjetas, cambios, porteros, tiempos muertos y penales. */
export function FullActa({ tl, match: m, names }: { tl: TeamLeague; match: Match; names: readonly [string, string] }) {
  const c = useColors();
  const state = useMemo(() => stateFromSnapshot(m.state), [m.state]);
  if (!state) {
    return (
      <Txt variant="meta" tone="muted">
        Este partido no tiene el acta del anotador (se anotó solo el resultado).
      </Txt>
    );
  }
  if (!state.timeline.length) {
    return (
      <Txt variant="meta" tone="muted">
        Todavía no hay jugadas.
      </Txt>
    );
  }
  const rows = actaRows(state.timeline, names, (side, id) => whoIn(tl, m, side, id));
  return (
    <View>
      {rows.map((it, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.line }}>
          <Txt tone="muted" style={{ width: 48, fontSize: 12, fontFamily: font.semibold }}>
            {it.when}
          </Txt>
          {(it.kind === 'yellow' || it.kind === 'second_yellow' || it.kind === 'red') && <CardIcon kind={it.kind} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt style={{ fontSize: 14 }}>
              <Txt style={{ fontSize: 14, fontFamily: font.medium }}>{it.title}</Txt>
              {it.team ? <Txt tone="muted" style={{ fontSize: 14 }}>{` · ${it.team}`}</Txt> : null}
            </Txt>
            {!!it.detail && (
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {it.detail}
              </Txt>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Aviso de suspendidos para un partido (la app avisa, no bloquea). */
export function SuspendedNotice({
  tl,
  list,
  title = 'Suspendidos para este partido',
}: {
  tl: TeamLeague;
  list: readonly { player: string; team: string; remaining: number; reason: string }[];
  title?: string;
}) {
  const c = useColors();
  if (!list.length) return null;
  return (
    <View accessibilityRole="alert" style={{ gap: 4, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: c.dangerSoft }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <AlertTriangle size={16} color={c.danger} />
        <Txt variant="meta" tone="danger" style={{ fontFamily: font.semibold }}>
          {title}
        </Txt>
      </View>
      {list.map((s) => (
        <Txt key={`${s.team}:${s.player}`} variant="meta" tone="danger">
          {`${tl.nameOf(s.player)} (${tl.teamOf(s.team)?.name ?? 'equipo'}) · ${REASON_TEXT[s.reason] ?? s.reason}${s.remaining > 1 ? ` · le faltan ${s.remaining} partidos` : ''}`}
        </Txt>
      ))}
    </View>
  );
}

// ---------- Convocatoria ----------

const RSVP_ORDER: readonly RsvpStatus[] = ['yes', 'maybe', 'no'];

/**
 * Voy / Tal vez / No voy (RsvpButtons de la web): tocar el que ya está marcado lo quita. Mientras se guarda, la ruedita
 * en el que se tocó y no se puede tocar otro. `raised`: sobre un fondo de color, los no elegidos en blanco.
 */
export function RsvpButtons({
  value,
  onChange,
  disabled,
  size = 'md',
  label = 'Convocatoria',
  raised,
}: {
  value: RsvpStatus | null | undefined;
  onChange: (next: RsvpStatus | null) => Promise<unknown> | void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  raised?: boolean;
}) {
  const c = useColors();
  const [busy, setBusy] = useState<RsvpStatus | null>(null);
  const icon: Record<RsvpStatus, typeof Check> = { yes: Check, maybe: CircleHelp, no: X };
  async function pick(s: RsvpStatus) {
    if (busy) return;
    setBusy(s);
    try {
      await onChange(value === s ? null : s);
    } finally {
      setBusy(null);
    }
  }
  return (
    <View accessibilityLabel={label} accessibilityState={{ busy: !!busy }} style={{ flexDirection: 'row', gap: 6 }}>
      {RSVP_ORDER.map((s) => {
        const active = value === s;
        const bg = !active ? (raised ? c.surface : c.surface2) : s === 'yes' ? c.accent : s === 'maybe' ? c.warnSoft : c.dangerSoft;
        const fg = !active ? c.fg2 : s === 'yes' ? c.accentFg : s === 'maybe' ? c.warn : c.danger;
        const I = icon[s];
        return (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: disabled || !!busy }}
            disabled={disabled || !!busy}
            onPress={() => void pick(s)}
            hitSlop={size === 'sm' ? { top: 4, bottom: 4 } : undefined}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              height: size === 'sm' ? 36 : 44,
              borderRadius: size === 'sm' ? 12 : 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingHorizontal: 8,
              backgroundColor: bg,
              opacity: disabled || (busy && busy !== s) ? 0.5 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            {busy === s ? <ActivityIndicator size="small" color={fg} /> : <I size={16} color={fg} />}
            <Txt numberOfLines={1} style={{ color: fg, fontFamily: font.semibold, fontSize: size === 'sm' ? 13 : 15 }}>
              {RSVP_LABEL[s]}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Convocatoria de un partido (Voy / No voy / Tal vez). Cada jugador marca la suya («¿Vas a este partido?», arriba);
 * cada equipo es una tarjeta con cómo va («3 van · faltan 2», en ámbar si no llega al mínimo) y «Lista»: el capitán o
 * delegado ve la lista de su equipo y marca a quien no tiene la app; el admin, a todos. Va por la cola: sin señal se ve
 * de una y sale sola. `flags` (el fútbol): jugadores con un aviso corto («Suspendido»).
 */
export function Convocatoria({ tl, match: m, minPlayers, flags }: { tl: TeamLeague; match: Match; minPlayers: number; flags?: ReadonlyMap<string, string> }) {
  const c = useColors();
  const rsvps = useMatchRsvps(tl.lid, [m.id]);
  const [open, setOpen] = useState<Side | null>(null);
  const teams = tl.allTeams.data;
  const targets = rsvpTargets(m, teams, tl.myPlayerId, tl.isAdmin);
  const mySide = rosterSide(m, teams, tl.myPlayerId);
  const editable = m.status === 'scheduled' || m.status === 'postponed' || m.status === 'live' || m.status === 'suspended';
  const statusOf = (playerId: string): MatchRsvp | undefined => rsvps.data.find((r) => r.matchId === m.id && r.playerId === playerId);

  async function set(playerId: string, side: Side, status: RsvpStatus | null) {
    try {
      await setMatchRsvp(tl.lid, m.id, playerId, side, status);
      if (!status) toast('Convocatoria quitada');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  }

  const sides = m.sides.filter((s) => s.teamId && rosterOf(teams, s.teamId).length);
  if (!sides.length) return null;

  return (
    <View style={{ gap: 12 }}>
      <SectionHeader
        title="Convocatoria"
        action={
          <Txt variant="meta" tone="muted">
            {`Mínimo ${minPlayers}`}
          </Txt>
        }
      />
      {mySide && tl.myPlayerId && editable && (
        <Card style={{ gap: 12 }}>
          <Txt variant="bodyStrong">¿Vas a este partido?</Txt>
          <RsvpButtons value={statusOf(tl.myPlayerId)?.status} onChange={(s) => set(tl.myPlayerId!, mySide, s)} label="Mi convocatoria" />
        </Card>
      )}
      {sides.map((s) => {
        const roster = rosterOf(teams, s.teamId).map((r) => r.playerId);
        const sum = rsvpSummary(rsvps.data, m.id, s.side, roster);
        const short = editable && m.status !== 'live' ? rsvpShortfall(sum, minPlayers) : null;
        const team = tl.teamOf(s.teamId);
        const alerts = flaggedCalled(sum, flags);
        const isOpenList = open === s.side;
        return (
          <Card key={s.side} padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 10, paddingLeft: 20, paddingRight: 18 }}>
              <TeamCrest team={team} label={s.label} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {team?.name ?? s.label}
                </Txt>
                <Txt variant="meta" tone={short !== null ? 'warn' : 'muted'} style={short !== null ? { fontFamily: font.medium } : undefined}>
                  {convocatoriaLine(rsvpLine(sum, minPlayers), sum.no.length)}
                </Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpenList }}
                onPress={() => setOpen(isOpenList ? null : s.side)}
                hitSlop={{ top: 4, bottom: 4 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, borderRadius: 18, paddingHorizontal: 12, backgroundColor: c.surface2 }}
              >
                <Txt variant="meta" tone="fg2" style={{ fontFamily: font.semibold }}>
                  Lista
                </Txt>
                <ChevronDown size={16} color={c.fg2} style={{ transform: [{ rotate: isOpenList ? '180deg' : '0deg' }] }} />
              </Pressable>
            </View>
            {alerts.map((pid) => (
              <View key={pid} accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingBottom: 10 }}>
                <AlertTriangle size={16} color={c.danger} />
                <Txt variant="small" tone="danger" style={{ flex: 1, fontFamily: font.semibold }}>
                  {`${tl.nameOf(pid)}: ${flags!.get(pid)} y está convocado.`}
                </Txt>
              </View>
            ))}
            {isOpenList &&
              [...sum.yes, ...sum.maybe, ...sum.none, ...sum.no].map((pid) => {
                const r = statusOf(pid);
                const canSet = editable && !!targets.find((t) => t.side === s.side && t.playerIds.includes(pid));
                return (
                  <View key={pid} style={{ gap: 8, paddingVertical: 10, paddingLeft: 20, paddingRight: 18, borderTopWidth: 1, borderTopColor: c.line }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Jersey n={tl.jerseyOf(pid, s.teamId)} color={team?.color ?? undefined} />
                      <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.medium }}>
                        {tl.nameOf(pid)}
                      </Txt>
                      {flags?.has(pid) && <Badge tone="danger">{flags.get(pid)}</Badge>}
                      {!(canSet && pid !== tl.myPlayerId) && <RsvpBadge status={r?.status} pending={r?.pending} />}
                    </View>
                    {canSet && pid !== tl.myPlayerId && <RsvpButtons size="sm" value={r?.status} onChange={(st) => set(pid, s.side, st)} label={`Convocatoria de ${tl.nameOf(pid)}`} />}
                  </View>
                );
              })}
          </Card>
        );
      })}
    </View>
  );
}
