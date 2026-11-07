/**
 * Lo de un jugador de raqueta en Lite (Profile.tsx de la web, con su misma lógica: logic/results.ts): «Mis partidos»
 * (`/l/<liga>/perfil`) y la página de otro jugador (`/l/<liga>/j/<jugador>`, «Ver su página»): su nombre con su nivel y
 * sus parejas, jugados y % de victorias en dos números grandes (o los puntos, si solo juega noches), la racha, sus
 * próximos partidos y sus últimos partidos. Compartir su link. Los filtros, los números completos y el récord con cada
 * compañero y rival son de Pro en la web: no van. Va dentro de LeagueScope.
 */
import { useMemo, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Share2, UserRound } from 'lucide-react-native';
import { useMatches, type Match } from '@mm/lib/data/matches';
import { useWithPendingPoints } from '@mm/lib/data/racket';
import { useLeagueCtx } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import { useNow } from '@mm/lib/useNow';
import { levelText, useLevels } from '@mm/pages/sports/racket/levels';
import { fmtPoints } from '@mm/pages/sports/racket/logic/night';
import { isPointsMatch, matchTime, playerRecord, playerSide, winPct } from '@mm/pages/sports/racket/logic/results';
import { useNames } from '@mm/pages/sports/racket/names';
import { MatchCard } from '../match/MatchCard';
import { toast } from '../feedback';
import { Card, Empty, SectionHeader, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { matchRoute } from './RacketHome';
import { useRacketPhone } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Mis partidos en la liga. */
export function RacketMyProfile() {
  const c = useColors();
  const { myPlayerId } = useLeagueCtx();
  if (!myPlayerId) {
    return (
      <View style={{ gap: 22 }}>
        <Txt variant="title">Mis partidos</Txt>
        <Empty icon={<UserRound size={28} color={c.accent} />} title="Todavía no juegas en esta liga" text="Cuando te pongan en una noche, una pareja o un torneo, tus partidos salen aquí." />
      </View>
    );
  }
  return <PlayerProfile playerId={myPlayerId} mine />;
}

/** La página de otro jugador. */
export function RacketPlayer({ playerId }: { playerId: string }) {
  if (!playerId) return <Empty title="Jugador no encontrado" />;
  return <PlayerProfile playerId={playerId} />;
}

function PlayerProfile({ playerId, mine }: { playerId: string; mine?: boolean }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const { sport, ext } = useRacketPhone();
  const names = useNames();
  const now = useNow().getTime();
  const q = useMatches({ lid });
  const all = useWithPendingPoints(lid, q.data);
  const { levels, scale } = useLevels();
  const [sharing, setSharing] = useState(false);
  const player = names.players.find((p) => p.id === playerId);
  const rec = useMemo(() => playerRecord(playerId, all, { sport, rosterOf: names.rosterOf, now }), [playerId, all, sport, names, now]);
  const upcoming = useMemo(
    () =>
      all
        .filter((m) => (m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended' || m.status === 'live') && playerSide(m, playerId, names.rosterOf) !== null)
        .sort((a, b) => matchTime(a) - matchTime(b))
        .slice(0, 3),
    [all, playerId, names],
  );
  const pairs = names.teams.filter((t) => t.roster.some((r) => r.playerId === playerId));

  const share = async () => {
    setSharing(true);
    const url = `${shareOrigin(null)}/l/${lid}/j/${playerId}`;
    const title = `${player?.name ?? 'Jugador'} · ${league.name}`;
    try {
      await Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title }, { dialogTitle: title, subject: title });
    } catch {
      toast('No se pudo compartir.', 'error');
    } finally {
      setSharing(false);
    }
  };

  if (!player && !names.loading) return <Empty title="Este jugador ya no está en la liga" />;
  const s = rec.sets;
  const n = rec.nights;
  const lv = levels[playerId];
  const meta = [mine ? player?.name : null, lv != null ? levelText(lv, scale) : null, ...pairs.map((t) => t.name)].filter(Boolean).join(' · ');
  const pct = winPct(s.won, s.played);
  const card = (m: Match) => (
    <MatchCard key={m.id} match={m} mySide={playerSide(m, playerId, names.rosterOf)} onPress={() => router.push(matchRoute(lid, m.id))} tz={league.tz} now={now} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} />
  );
  // Quien solo juega noches (americano, round robin) ve sus puntos; los demás, sus partidos a sets.
  const duo =
    s.played === 0 && n.played > 0
      ? { left: { value: String(n.played), label: `${n.played === 1 ? 'partido' : 'partidos'} de ${ext.words?.nights ? ext.words.nights.toLowerCase() : 'noche'}` }, right: { value: fmtPoints(Math.round((n.pointsFor / n.played) * 10) / 10), label: 'puntos por partido' } }
      : { left: { value: String(s.played), label: s.played === 1 ? 'partido jugado' : 'partidos jugados' }, right: { value: pct != null ? `${pct}%` : '–', label: 'de victorias' } };

  return (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <Txt variant="title" style={{ flex: 1 }}>
            {mine ? 'Mis partidos' : (player?.name ?? '…')}
          </Txt>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartir"
            accessibilityState={{ busy: sharing }}
            disabled={sharing}
            onPress={() => void share()}
            style={[styles.round, { backgroundColor: c.surface2, opacity: sharing ? 0.7 : 1 }]}
          >
            <Share2 size={20} color={c.fg2} />
          </Pressable>
        </View>
        {!!meta && (
          <Txt variant="meta" tone="muted">
            {meta}
          </Txt>
        )}
      </View>

      {q.loading && !all.length ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <LogoSpinner size={32} label="Cargando los partidos" />
        </View>
      ) : (
        <>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[duo.left, duo.right].map((x) => (
                <Card key={x.label} style={{ flex: 1, gap: 6, paddingHorizontal: 16, paddingVertical: 16 }}>
                  <Txt style={{ fontSize: 34, lineHeight: 38, fontFamily: font.bold }}>{x.value}</Txt>
                  <Txt tone="muted" style={{ fontSize: 14 }}>
                    {x.label}
                  </Txt>
                </Card>
              ))}
            </View>
            {s.last.length > 0 && (
              <View accessibilityLabel={`Últimos: ${s.last.join(' ')}`} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginHorizontal: 4 }}>
                <Txt variant="meta" tone="muted">
                  Últimos:
                </Txt>
                {s.last.map((x, i) => (
                  <View key={i} style={[styles.chip, { backgroundColor: x === 'G' ? c.accentSoft : c.surface2 }]}>
                    <Txt style={{ fontSize: 11, fontFamily: font.bold, color: x === 'G' ? c.accent : c.muted }}>{x}</Txt>
                  </View>
                ))}
                {s.streak && s.streak.n > 1 && (
                  <Txt variant="meta" tone="fg2" style={{ fontFamily: font.semibold }}>
                    {`· ${s.streak.n} ${s.streak.kind === 'G' ? 'ganados' : 'perdidos'} seguidos`}
                  </Txt>
                )}
              </View>
            )}
          </View>

          {upcoming.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title={mine ? 'Tus próximos partidos' : 'Próximos partidos'} />
              {upcoming.map(card)}
            </View>
          )}

          <View style={{ gap: 10 }}>
            <SectionHeader title="Partidos" />
            {rec.matches.length ? rec.matches.slice(0, 6).map(card) : <Empty title="Todavía no hay partidos que cuenten" text="Los partidos confirmados salen aquí." />}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chip: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
