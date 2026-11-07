/**
 * Piezas de las noches de puntos (el americano y el mexicano del pádel, el round robin social del pickleball), como
 * night/parts.tsx de la web: tu cancha de la ronda con UN botón, «descansas», «Todo listo para la ronda 1» (quien organiza,
 * en Pro), las canchas de la ronda con «Anotar» y «Marcador», las rondas jugadas, el podio, la tabla corta de Lite, los
 * jugadores y lo de armar las rondas (la siguiente, rehacer, terminar). La noche (RacketEvent.tsx) y el round robin
 * (SocialEvent.tsx) las usan con lo suyo.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Flag, Keyboard, LayoutGrid, Play, RefreshCw, Share2, SkipForward, Trophy, Users } from 'lucide-react-native';
import type { Match, MatchDraft } from '@mm/lib/data/matches';
import { saveNightRound, savePointsResult, updateRacketEvent, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { useIsPro } from '@mm/lib/useMode';
import type { SocialRound } from '@mm/sports/formats';
import type { StandingRow } from '@mm/sports/types';
import type { NextRound, NightConfig, NightRound } from '@mm/pages/sports/racket/logic/night';
import type { PointsEntry } from '@mm/pages/sports/racket/night/entry';
import { useMySide } from '@mm/pages/sports/racket/match/side';
import { useNames } from '@mm/pages/sports/racket/names';
import { MatchCard } from '../match/MatchCard';
import { ResultSheet } from '../match/ResultParts';
import { confirmAsync, toast } from '../feedback';
import { Badge, Button, Card, Divider, Empty, SectionHeader, Txt } from '../ui';
import { matchRoute } from './RacketHome';
import { courtRoute } from './RacketMatch';
import { useRacketPhone } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** «Ronda 2: te toca», la cancha y contra quién; UN botón: «Anotar en la cancha» (o «Ver resultado»). */
export function MyCourt({ match, round }: { match: Match; round: number }) {
  const c = useColors();
  const pro = useIsPro();
  const { lid, myPlayerId } = useLeagueCtx();
  const names = useNames();
  const mySide = match.sides.find((s) => s.players.some((p) => p.playerId === myPlayerId));
  const mates = (mySide?.players ?? []).map((p) => p.playerId).filter((p) => p !== myPlayerId);
  const rival = match.sides.find((s) => s !== mySide);
  const open = match.status === 'scheduled' || match.status === 'live' || match.status === 'suspended';
  return (
    <Card style={{ gap: 6, backgroundColor: c.accentSoft }}>
      <Pressable onPress={() => router.push(matchRoute(lid, match.id))} style={{ gap: 6 }}>
        <Txt variant="meta" tone="accent" style={{ fontWeight: '600' }}>
          ● Ronda {round}: te toca
        </Txt>
        <Txt variant="cardTitle">{match.court || 'Cancha'}</Txt>
        <Txt variant="meta" tone="fg2">
          {mates.length ? `Con ${mates.map(names.nameOf).join(' y ')} ` : ''}contra <Txt variant="meta" style={{ fontWeight: '700' }}>{rival?.label ?? 'el rival'}</Txt>
        </Txt>
      </Pressable>
      {open ? (
        <Button variant="primary" size={pro ? 'lg' : 'xl'} full onPress={() => router.push(courtRoute(lid, match.id))}>
          Anotar en la cancha
        </Button>
      ) : (
        <Button size="lg" full onPress={() => router.push(matchRoute(lid, match.id))}>
          Ver resultado
        </Button>
      )}
    </Card>
  );
}

/** «Ronda 2: descansas.» con lo que dice la noche (suma lo de las reglas, o en la próxima te toca). */
export function RestCard({ round, text }: { round: number; text: string }) {
  const c = useColors();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <LayoutGrid size={24} color={c.accent} />
      <Txt style={{ flex: 1 }}>
        <Txt variant="bodyStrong">Ronda {round}: descansas.</Txt> <Txt tone="fg2">{text}</Txt>
      </Txt>
    </Card>
  );
}

/**
 * Antes de la ronda 1. Quien organiza (en Pro): «Todo listo para la ronda 1» con el resumen y UN botón, «Empezar ronda 1»
 * (y «Jugadores»). Los demás: «Todavía no empieza».
 */
export function FirstRound({
  organize,
  summary,
  problem,
  note,
  busy,
  onStart,
  onPlayers,
}: {
  organize: boolean;
  summary: string;
  problem: string | null;
  note?: string | null;
  busy: boolean;
  onStart: () => void;
  onPlayers: () => void;
}) {
  const c = useColors();
  if (!organize) return <Empty icon={<LayoutGrid size={28} color={c.accent} />} title="Todavía no empieza" text="Cuando se arme la ronda 1, aquí sale tu cancha (y te llega un aviso)." />;
  return (
    <Card style={{ gap: 6 }}>
      <Txt variant="cardTitle">Todo listo para la ronda 1</Txt>
      <Txt variant="meta" tone="fg2">
        {summary}
      </Txt>
      {!!problem && (
        <Txt tone="danger" style={{ fontSize: 14, fontFamily: font.semibold }}>
          {problem}
        </Txt>
      )}
      {!!note && (
        <Txt tone="muted" style={{ fontSize: 13 }}>
          {note}
        </Txt>
      )}
      <View style={{ gap: 10, marginTop: 10 }}>
        <Button variant="primary" size="xl" full icon={<Play size={20} color={c.accentFg} />} loading={busy} disabled={!!problem} onPress={onStart}>
          Empezar ronda 1
        </Button>
        <Button size="lg" full icon={<Users size={16} color={c.fg} />} onPress={onPlayers}>
          Jugadores
        </Button>
      </View>
    </Card>
  );
}

/**
 * La ronda de ahora: una tarjeta por cancha con su marcador; tocarla abre el partido. «Anotar» y «Marcador» salen en tu
 * partido y, para quien organiza (o anota, en Pro), en todos. `entry` dice cómo se escribe el marcador de ese partido.
 */
export function RoundCourts({ round, organize, entry }: { round: NightRound; organize: boolean; entry: (m: Match) => PointsEntry | null }) {
  const c = useColors();
  const pro = useIsPro();
  const { lid, league, member } = useLeagueCtx();
  const names = useNames();
  const mySideOf = useMySide();
  const [typing, setTyping] = useState<Match | null>(null);
  const spec = typing ? entry(typing) : null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title={`Ronda ${round.round}`}
        action={
          <Txt variant="meta" tone="muted">
            {round.pending ? `${round.pending} en juego` : 'Todas terminadas'}
          </Txt>
        }
      />
      {round.matches.map((m) => {
        const open = m.match.status === 'scheduled' || m.match.status === 'live' || m.match.status === 'suspended';
        const canScore = mySideOf(m.match) !== null || organize || (pro && !!member?.scorer);
        return (
          <View key={m.id} style={{ backgroundColor: c.surface, borderRadius: 22, overflow: 'hidden' }}>
            <MatchCard match={m.match} mySide={mySideOf(m.match)} tz={league.tz} onPress={() => router.push(matchRoute(lid, m.id))} />
            {open && canScore && (
              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Button variant="soft" size="lg" full icon={<Play size={16} color={c.accent} />} onPress={() => router.push(courtRoute(lid, m.id))}>
                    Anotar
                  </Button>
                </View>
                <View style={{ flex: 1 }}>
                  <Button size="lg" full icon={<Keyboard size={16} color={c.fg} />} onPress={() => setTyping(m.match)}>
                    Marcador
                  </Button>
                </View>
              </View>
            )}
          </View>
        );
      })}
      {round.rests.length > 0 && (
        <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
          Descansan: <Txt variant="meta" style={{ fontFamily: font.semibold }}>{round.rests.map(names.nameOf).join(', ')}</Txt>
        </Txt>
      )}
      {typing && spec && (
        <ResultSheet
          open
          onClose={() => setTyping(null)}
          lid={lid}
          match={typing}
          parser={spec.parser}
          placeholder={spec.placeholder}
          examples={spec.examples}
          hint={spec.hint}
          title={`Marcador de ${typing.court || 'la cancha'}`}
          onSubmit={async (r) => {
            const sides = r.score.sides ?? [0, 0];
            const out = await savePointsResult(lid, typing.id, [sides[0], sides[1]]);
            if (out && !out.ok) throw new Error('Otro teléfono va más adelante con este partido.');
          }}
        />
      )}
    </View>
  );
}

/** Una ronda jugada: cada cancha con sus dos parejas y sus puntos (tocarla abre el partido, o `onOpen`). */
export function RoundList({ round, onOpen }: { round: NightRound; onOpen?: (matchId: string) => void }) {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const pair = (ids: string[]) => ids.map(names.nameOf).join(' / ');
  return (
    <Card padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
        <Txt variant="bodyStrong">Ronda {round.round}</Txt>
        {!round.done && <Badge>En juego</Badge>}
      </View>
      {round.matches.map((m, i) => (
        <View key={m.id}>
          {i > 0 && <Divider inset={20} />}
          <Pressable onPress={() => (onOpen ? onOpen(m.id) : router.push(matchRoute(lid, m.id)))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="small" tone="muted">
                {m.court || 'Cancha'}
              </Txt>
              <Txt numberOfLines={1}>{pair(m.side1)}</Txt>
              <Txt numberOfLines={1}>{pair(m.side2)}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt style={{ fontSize: 17, fontWeight: '700' }}>{m.score1 ?? '–'}</Txt>
              <Txt style={{ fontSize: 17, fontWeight: '700' }}>{m.score2 ?? '–'}</Txt>
            </View>
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

/** «Tabla final»: los 3 primeros con su número (`value`) y «Compartir la tabla». */
export function Podium({ table, nameOf, value, onShare }: { table: readonly StandingRow[]; nameOf: (id: string) => string; value: (r: StandingRow) => string; onShare: () => void }) {
  const c = useColors();
  const top = table.filter((r) => r.played > 0).slice(0, 3);
  if (!top.length) return null;
  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Trophy size={20} color={c.gold} />
        <Txt variant="cardTitle">Tabla final</Txt>
      </View>
      <View style={{ marginTop: 6 }}>
        {top.map((r, i) => (
          <View key={r.id} style={[styles.podiumRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
            <Txt style={{ width: 20, textAlign: 'center', fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{r.rank}</Txt>
            <Txt numberOfLines={1} style={{ flex: 1, fontFamily: font.semibold }}>
              {nameOf(r.id)}
            </Txt>
            <Txt style={{ fontSize: 17, fontFamily: font.bold }}>{value(r)}</Txt>
          </View>
        ))}
      </View>
      <Button variant="soft" size="lg" full icon={<Share2 size={16} color={c.accent} />} onPress={onShare}>
        Compartir la tabla
      </Button>
    </Card>
  );
}

/** La tabla corta de Lite («Cómo van todos»): puesto, nombre (con «Tú»), una línea chica y el número grande. */
export function RankRows({ rows, nameOf, value, sub, highlight = [] }: { rows: readonly { id: string; rank: number }[]; nameOf: (id: string) => string; value: (id: string) => string; sub?: (id: string) => string | null; highlight?: readonly string[] }) {
  const c = useColors();
  return (
    <Card padded={false}>
      {rows.map((r, i) => {
        const me = highlight.includes(r.id);
        const line = sub?.(r.id);
        return (
          <View key={r.id} style={[styles.rankRow, { backgroundColor: me ? c.accentSoft : 'transparent' }, i > 0 && !me && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
            <Txt style={{ width: 28, fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{r.rank}</Txt>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontFamily: font.semibold }}>
                  {nameOf(r.id)}
                </Txt>
                {me && <Badge>Tú</Badge>}
              </View>
              {!!line && (
                <Txt tone="muted" style={{ fontSize: 13 }}>
                  {line}
                </Txt>
              )}
            </View>
            <Txt style={{ fontSize: 20, fontFamily: font.bold }}>{value(r.id)}</Txt>
          </View>
        );
      })}
    </Card>
  );
}

/** Los jugadores en una hoja: el nombre, una línea (nivel, grupo del mixto) y un número a la derecha (sus puntos). */
export function PlayersList({ ids, sub, value }: { ids: readonly string[]; sub?: (id: string) => string | null; value?: (id: string) => string | null }) {
  const c = useColors();
  const names = useNames();
  if (!ids.length) return <Empty title="Sin jugadores" />;
  return (
    <View>
      {ids.map((id, i) => {
        const line = sub?.(id);
        const v = value?.(id);
        return (
          <View key={id} style={[styles.playerRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                {names.nameOf(id)}
              </Txt>
              {!!line && (
                <Txt tone="muted" style={{ fontSize: 13 }}>
                  {line}
                </Txt>
              )}
            </View>
            {v != null && <Txt style={{ fontSize: 17, fontFamily: font.semibold }}>{v}</Txt>}
          </View>
        );
      })}
    </View>
  );
}

// ---------- Armar las rondas (quien organiza, en Pro) ----------

type RoundsPending = 'ronda' | 'rehacer' | 'cerrar-fin';

/**
 * Publicar las rondas de la noche o del round robin (NightPage y SocialPage de la web): «Empezar ronda 1», «Siguiente
 * ronda», «Rehacer la ronda» y «Terminar» al final. Lo de cada formato va en `o` (cómo se arma la ronda, cómo se guarda
 * la configuración y los textos).
 */
export function useRoundsAdmin<C extends NightConfig>(o: {
  event: RacketEvent;
  cfg: C;
  rounds: readonly NightRound[];
  next: (cfg: C, rounds: readonly NightRound[]) => NextRound;
  redo: (cfg: C, rounds: readonly NightRound[], salt: string) => NextRound;
  drafts: (cfg: C, social: SocialRound, leagueRules: Record<string, unknown>) => { drafts: MatchDraft[]; rests: string[] };
  json: (cfg: C) => Record<string, unknown>;
  /** El mensaje de «Faltan 2 partidos de la ronda 3». */
  pendingMessage: string;
  /** «¿Terminar la noche?» y lo que dice al terminar. */
  close: { title: string; confirmText: string; ok: string };
  /** Se publicó una ronda (la pantalla vuelve a Canchas). */
  onPublished?: () => void;
}) {
  const { lid } = useLeagueCtx();
  const { leagueRules } = useRacketPhone();
  const [pending, setPending] = useState<RoundsPending | null>(null);
  const current = o.rounds.at(-1) ?? null;

  const publish = async (next: NextRound, ok: string, key: RoundsPending) => {
    if (!next.ok) {
      toast(next.reason, 'error');
      return;
    }
    setPending(key);
    try {
      let c = o.cfg;
      if (next.config) {
        c = { ...o.cfg, ...next.config } as C;
        await updateRacketEvent(lid, o.event.id, { config: o.json(c) });
      }
      const { drafts, rests } = o.drafts(c, next.social, leagueRules);
      await saveNightRound(lid, o.event.id, next.round, drafts, rests);
      toast(ok);
      o.onPublished?.();
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setPending(null);
    }
  };

  const nextRound = async () => {
    const next = o.next(o.cfg, o.rounds);
    if (next.ok && next.pendingPrev > 0) {
      const go = await confirmAsync({
        title: `Faltan ${next.pendingPrev} ${next.pendingPrev === 1 ? 'partido' : 'partidos'} de la ronda ${current?.round}`,
        message: o.pendingMessage,
        confirmText: 'Sí, siguiente ronda',
      });
      if (!go) return;
    }
    await publish(next, next.ok ? `Ronda ${next.round} lista: a cada quien le llegó su cancha` : '', 'ronda');
  };

  const redo = async () => {
    const go = await confirmAsync({ title: `¿Rehacer la ronda ${current?.round}?`, message: 'Se vuelve a sortear con los jugadores de ahora. Nadie ha empezado a jugar.', confirmText: 'Rehacer' });
    if (go) await publish(o.redo(o.cfg, o.rounds, Date.now().toString(36)), 'Ronda rehecha', 'rehacer');
  };

  const finish = async () => {
    if (!(await confirmAsync({ title: o.close.title, message: 'Queda la tabla final. Se puede volver a abrir.', confirmText: o.close.confirmText }))) return;
    setPending('cerrar-fin');
    try {
      await updateRacketEvent(lid, o.event.id, { config: o.json({ ...o.cfg, closed: true }) });
      toast(o.close.ok);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setPending(null);
    }
  };

  return { pending, nextRound, redo, finish };
}

/** Debajo de las canchas (quien organiza, en Pro): la siguiente ronda, terminar al final o rehacer la que no empezó. */
export function RoundsButtons({ round, rounds, admin, finishLabel }: { round: NightRound; rounds: number; admin: ReturnType<typeof useRoundsAdmin>; finishLabel: string }) {
  const c = useColors();
  const busy = admin.pending !== null;
  return (
    <View style={{ gap: 10 }}>
      {round.round < rounds && (
        <Button variant="primary" size="lg" full loading={admin.pending === 'ronda'} disabled={busy} icon={<SkipForward size={20} color={c.accentFg} />} onPress={() => void admin.nextRound()}>
          {`Siguiente ronda (${round.round + 1} de ${rounds})`}
        </Button>
      )}
      {round.round >= rounds && round.done && (
        <Button variant="primary" size="lg" full loading={admin.pending === 'cerrar-fin'} disabled={busy} icon={<Flag size={20} color={c.accentFg} />} onPress={() => void admin.finish()}>
          {finishLabel}
        </Button>
      )}
      {!round.started && (
        <Button size="lg" full loading={admin.pending === 'rehacer'} disabled={busy} icon={<RefreshCw size={16} color={c.fg} />} onPress={() => void admin.redo()}>
          Rehacer la ronda
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  podiumRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 4 },
});
