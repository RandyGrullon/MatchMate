/**
 * Lo de un jugador de raqueta (Profile.tsx de la web, con su misma lógica: logic/results.ts y profileFilters.ts): «Mis
 * partidos» (`/l/<liga>/perfil`) y la página de otro jugador (`/l/<liga>/j/<jugador>`, «Ver su página»): su nombre con su
 * nivel y sus parejas, jugados y % de victorias en dos números grandes (o los puntos, si solo juega noches), la racha,
 * sus próximos partidos y sus últimos partidos. Compartir su link.
 * - Pro: además, por modalidad o por tipo (liga y torneos, noches), los números completos (sets, juegos, puntos), el
 *   récord con cada compañero y contra cada rival, y más partidos.
 * Va dentro de LeagueScope.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Share2, UserRound } from 'lucide-react-native';
import { useMatches, type Match } from '@mm/lib/data/matches';
import { useWithPendingPoints } from '@mm/lib/data/racket';
import { useLeagueCtx } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { isGameSport } from '@mm/sports/racket/rules';
import { levelText, useLevels } from '@mm/pages/sports/racket/levels';
import { byModality, MODALITY_LABEL, type Modality } from '@mm/pages/sports/racket/logic/modality';
import { fmtPoints } from '@mm/pages/sports/racket/logic/night';
import { isPointsMatch, matchTime, playerRecord, playerSide, winPct, type PeopleLine, type PlayerRecord } from '@mm/pages/sports/racket/logic/results';
import { useNames } from '@mm/pages/sports/racket/names';
import { profileFilters, scopeProfileMatches, type ProfileFilter } from '@mm/pages/sports/racket/profileFilters';
import { hasNights } from '@mm/pages/sports/racket/sport';
import { ChoiceChips } from '../esports/inputs';
import { MatchCard } from '../match/MatchCard';
import { toast } from '../feedback';
import { Card, Divider, Empty, ListRow, Segmented, SectionHeader, Txt } from '../ui';
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
  const { sport, doubles, ext } = useRacketPhone();
  const pro = useIsPro();
  const names = useNames();
  const now = useNow().getTime();
  const q = useMatches({ lid });
  const all = useWithPendingPoints(lid, q.data);
  const { levels, scale } = useLevels();
  const [sharing, setSharing] = useState(false);
  const [filter, setFilter] = useState<ProfileFilter>('todo');
  const player = names.players.find((p) => p.id === playerId);
  const nightsWord = ext.words?.nights ?? 'Noches';

  // Partidos a sets del jugador por modalidad: si jugó de las dos, las estadísticas van separadas.
  const kinds = useMemo(() => {
    const mineSets = all.filter((m) => !isPointsMatch(m) && playerSide(m, playerId, names.rosterOf) !== null);
    return byModality(mineSets, names.rosterOf);
  }, [all, playerId, names]);
  const split = kinds.individual.length > 0 && kinds.dobles.length > 0;
  // En Lite no hay filtros: se ve todo.
  const shown: ProfileFilter = pro ? filter : 'todo';
  const scoped = useMemo(() => scopeProfileMatches(all, shown, kinds), [all, shown, kinds]);
  const rec = useMemo(() => playerRecord(playerId, scoped, { sport, rosterOf: names.rosterOf, now }), [playerId, scoped, sport, names, now]);
  const bySplit = useMemo(
    () =>
      split && shown === 'todo'
        ? (['individual', 'dobles'] as const).map((k) => [k, playerRecord(playerId, kinds[k], { sport, rosterOf: names.rosterOf, now })] as [Modality, PlayerRecord])
        : null,
    [split, shown, playerId, kinds, sport, names, now],
  );
  const upcoming = useMemo(
    () =>
      all
        .filter((m) => (m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended' || m.status === 'live') && playerSide(m, playerId, names.rosterOf) !== null)
        .sort((a, b) => matchTime(a) - matchTime(b))
        .slice(0, pro ? 5 : 3),
    [all, playerId, names, pro],
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
  const filters = profileFilters({ split, nights: hasNights(sport), nightsWord });
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
          <Txt variant="title" style={[{ flex: 1 }, pro && styles.titlePro]}>
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
                <Streak last={s.last} />
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

          {pro && (
            <>
              {filters.length > 1 &&
                (filters.length <= 3 ? (
                  <Segmented<ProfileFilter> label="Qué partidos contar" value={filter} onChange={setFilter} options={filters} />
                ) : (
                  <ChoiceChips<ProfileFilter> label="Qué partidos contar" scroll value={filter} onChange={setFilter} items={filters} />
                ))}
              {shown !== 'noches' &&
                (bySplit ? (
                  bySplit.map(([k, r]) => <SetsStats key={k} title={`Liga y torneos · ${MODALITY_LABEL[k]}`} s={r.sets} sport={sport} />)
                ) : (
                  <SetsStats title={shown === 'individual' || shown === 'dobles' ? `Liga y torneos · ${MODALITY_LABEL[shown]}` : 'Liga y torneos'} s={s} sport={sport} />
                ))}
              {shown !== 'sets' && n.played > 0 && (
                <View style={{ gap: 10 }}>
                  <SectionHeader title={ext.words?.nightsLong ?? 'Noches de americano y mexicano'} />
                  <Tiles>
                    <StatTile label="Noches" value={String(n.nights)} />
                    <StatTile label="Partidos" value={String(n.played)} sub={`${n.won} G · ${n.drawn} E · ${n.lost} P`} />
                    <StatTile label="Puntos" value={String(n.pointsFor)} sub={`${n.pointsAgainst} en contra`} />
                    <StatTile label="Por partido" value={fmtPoints(Math.round((n.pointsFor / n.played) * 10) / 10)} />
                  </Tiles>
                </View>
              )}
              {(doubles || split || shown === 'dobles') && rec.partners.length > 0 && (
                <View style={{ gap: 10 }}>
                  <SectionHeader title="Con cada compañero" />
                  <PeopleRows lines={rec.partners} nameOf={names.nameOf} lid={lid} />
                </View>
              )}
              {rec.rivals.length > 0 && (
                <View style={{ gap: 10 }}>
                  <SectionHeader title="Contra cada rival" />
                  <PeopleRows lines={rec.rivals} nameOf={names.nameOf} lid={lid} />
                </View>
              )}
            </>
          )}

          <View style={{ gap: 10 }}>
            <SectionHeader title="Partidos" />
            {rec.matches.length ? rec.matches.slice(0, pro ? 12 : 6).map(card) : <Empty title="Todavía no hay partidos que cuenten" text="Los partidos confirmados salen aquí." />}
          </View>
        </>
      )}
    </View>
  );
}

/** Los últimos resultados en fichas: G en el color del deporte y P en gris. */
function Streak({ last }: { last: ('G' | 'P')[] }) {
  const c = useColors();
  return (
    <>
      {last.map((x, i) => (
        <View key={i} style={[styles.chip, { backgroundColor: x === 'G' ? c.accentSoft : c.surface2 }]}>
          <Txt style={{ fontSize: 11, fontFamily: font.bold, color: x === 'G' ? c.accent : c.muted }}>{x}</Txt>
        </View>
      ))}
    </>
  );
}

/** Las fichas de los números, de a dos por fila. */
function Tiles({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}

/** Un número grande en su tarjeta: «12 · Jugados · 8 G · 4 P» (StatTile de la web). */
function StatTile({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1, minWidth: 0, gap: 4, paddingHorizontal: 16, paddingVertical: 14 }}>
      <Txt style={{ fontSize: 28, lineHeight: 32, fontFamily: font.bold }}>{value}</Txt>
      <Txt tone="muted" numberOfLines={1} style={{ fontSize: 14 }}>
        {label}
      </Txt>
      {sub != null &&
        (typeof sub === 'string' ? (
          <Txt tone="muted" style={{ fontSize: 13 }}>
            {sub}
          </Txt>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{sub}</View>
        ))}
    </Card>
  );
}

function SetsStats({ title, s, sport }: { title: string; s: PlayerRecord['sets']; sport: string }) {
  // Pickleball y ping pong: «Juegos 12-7» y debajo «Puntos 190-151 (+39)».
  const pk = isGameSport(sport);
  const pointDiff = s.gamesFor - s.gamesAgainst;
  const pct = winPct(s.won, s.played);
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={title} />
      <Tiles>
        <StatTile label="Jugados" value={String(s.played)} sub={`${s.won} G · ${s.lost} P`} />
        <StatTile label="% de victorias" value={pct != null ? `${pct}%` : '–'} />
        <StatTile label="Racha" value={s.streak ? `${s.streak.n} ${s.streak.kind === 'G' ? 'G' : 'P'}` : '–'} sub={s.last.length ? <Streak last={s.last} /> : undefined} />
        <StatTile
          label={pk ? 'Juegos' : 'Sets'}
          value={`${s.setsFor}-${s.setsAgainst}`}
          sub={`${pk ? 'Puntos' : 'Juegos'} ${s.gamesFor}-${s.gamesAgainst}${pk && s.played ? ` (${pointDiff > 0 ? '+' : ''}${pointDiff})` : ''}`}
        />
      </Tiles>
    </View>
  );
}

/** El récord con cada compañero o contra cada rival: una fila por persona con su % de victorias; tocarla abre su página. */
function PeopleRows({ lines, nameOf, lid }: { lines: PeopleLine[]; nameOf: (id: string) => string; lid: string }) {
  return (
    <Card padded={false}>
      {lines.slice(0, 15).map((l, i) => (
        <View key={l.id}>
          {i > 0 && <Divider inset={16} />}
          <ListRow
            title={nameOf(l.id)}
            subtitle={`${l.played} ${l.played === 1 ? 'partido' : 'partidos'} · ${l.won} G · ${l.lost} P`}
            chevron={false}
            right={<Txt style={{ fontSize: 17, fontFamily: font.semibold }}>{`${winPct(l.won, l.played) ?? 0}%`}</Txt>}
            onPress={() => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: l.id } })}
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chip: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  // El título de Pro (text-title-pro de la web: 28 px).
  titlePro: { fontSize: 28, lineHeight: 34 },
});
