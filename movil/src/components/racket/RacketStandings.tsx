/**
 * Tabla de la temporada de raqueta (Standings.tsx de la web, con su misma lógica: useRacketSeason): las tablas de las
 * ligas de parejas y de los grupos de los torneos, el ranking individual y las noches. Arriba, la temporada (la de
 * ahora, o la de «?temporada=»): una cerrada muestra sus premios y la tabla que se guardó al cerrarla (SeasonView.tsx de
 * la web); una cerrada sin tabla guardada se calcula con sus partidos, con sus premios arriba.
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Award, ChevronDown, History, ListOrdered, Moon, Trophy } from 'lucide-react-native';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { formatDate } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { pickSeason, type Season } from '@mm/lib/seasons';
import { sortedAwards } from '@mm/components/season/awardOrder';
import { parseSnapshot, seasonDates } from '@mm/components/season/logic';
import type { StandingsColumn } from '@mm/components/match/standings';
import { MODALITY_LABEL, type Modality } from '@mm/pages/sports/racket/logic/modality';
import { seasonPlayerTable, winPct } from '@mm/pages/sports/racket/logic/results';
import { rankingNote, tiebreakText } from '@mm/pages/sports/racket/logic/tiebreaks';
import { useRacketSeason } from '@mm/pages/sports/racket/seasonTable';
import { hasNights } from '@mm/pages/sports/racket/sport';
import { useIsPro } from '@mm/lib/useMode';
import { racketColumns } from '@mm/pages/sports/racket/view';
import { StandingsTable } from '../match/StandingsTable';
import { SnapshotTables } from '../seasonAdmin/SnapshotTables';
import { Card, ChoiceRow, Empty, LoadError, Segmented, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useRacketPhone } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type Tab = 'parejas' | 'ranking' | 'noches';

export function RacketStandings() {
  const c = useColors();
  const { lid, myPlayerId } = useLeagueCtx();
  const { sport, doubles, ext } = useRacketPhone();
  const pro = useIsPro();
  const { temporada } = useLocalSearchParams<{ temporada?: string }>();
  const seasons = useLeagueSeasons(lid);
  const [seasonId, setSeasonId] = useState<string | null>(temporada ?? null);
  const season = pickSeason(seasons.data, seasonId);
  // Una cerrada con su tabla guardada se ve como se guardó.
  const saved = season?.status === 'closed' && parseSnapshot(season.standings) ? season : null;
  const { q, all, matches, comps, kinds, split, nights, names, now } = useRacketSeason(season, sport, ext);
  const nightsWord = ext.words?.nights ?? 'Noches';
  const [picked, setPicked] = useState<Tab | null>(null);
  const [compKey, setCompKey] = useState<string | null>(null);
  const [modoPicked, setModo] = useState<Modality | null>(null);
  const modo: Modality = modoPicked ?? (kinds.dobles.length > kinds.individual.length ? 'dobles' : 'individual');
  const ranking = useMemo(
    () => seasonPlayerTable(split ? kinds[modo] : matches, { sport, rosterOf: names.rosterOf, lotSeed: lid, now }),
    [split, kinds, modo, matches, sport, names, lid, now],
  );
  // Lite: jugados, ganados y el % de victorias; Pro: también perdidos y las diferencias (el % no cabe en el teléfono).
  const pct: StandingsColumn = { key: 'pct', label: '% G', title: 'Porcentaje de victorias', value: (r) => `${winPct(r.won, r.played) ?? 0}%`, wide: pro };
  const rankingColumns: StandingsColumn[] = pro ? [...racketColumns(sport).slice(0, 4), pct, racketColumns(sport)[6]] : [...racketColumns(sport).slice(0, 2), pct];
  // Las tablas de las ligas y los grupos: en Lite, jugados, ganados y perdidos; en Pro, completas.
  const compColumns = pro ? racketColumns(sport) : racketColumns(sport).slice(0, 3);
  const tab: Tab = picked ?? (comps.length ? 'parejas' : ranking.length ? 'ranking' : nights.length ? 'noches' : 'parejas');
  const comp = comps.find((x) => x.key === compKey) ?? comps[0];
  const highlight = [...(myPlayerId ? [myPlayerId] : []), ...names.teamsOf(myPlayerId)];

  const head = { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, color: c.muted };

  if (q.error) return <LoadError error={q.error} />;
  const bar = <SeasonBar seasons={seasons.data} selected={season} onChange={setSeasonId} />;
  if (saved) {
    return (
      <View style={{ gap: 16 }}>
        <Txt variant="title" style={pro ? { fontSize: 28, lineHeight: 34 } : undefined}>
          Tabla
        </Txt>
        {bar}
        <ClosedSeasonView season={saved} highlight={highlight} />
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <Txt variant="title" style={pro ? { fontSize: 28, lineHeight: 34 } : undefined}>
        Tabla
      </Txt>
      <Segmented<Tab>
        label="Qué tabla ver"
        value={tab}
        onChange={setPicked}
        options={[
          { key: 'parejas', label: doubles ? 'Parejas' : 'Ligas' },
          { key: 'ranking', label: 'Ranking' },
          ...(hasNights(sport) ? [{ key: 'noches' as Tab, label: nightsWord }] : []),
        ]}
      />
      {bar}
      {q.loading && !all.length ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <LogoSpinner size={32} label="Cargando la tabla" />
        </View>
      ) : tab === 'parejas' ? (
        comps.length && comp ? (
          <>
            {comps.length > 1 && <Segmented<string> label="Qué tabla" value={comp.key} onChange={setCompKey} options={comps.map((x) => ({ key: x.key, label: x.name }))} />}
            <StandingsTable rows={comp.rows} nameOf={names.entrantName} columns={compColumns} highlight={highlight} />
            <Txt variant="small" tone="muted">
              {tiebreakText(sport)}
            </Txt>
          </>
        ) : (
          <Empty
            icon={<ListOrdered size={28} color={c.accent} />}
            title="Sin tablas todavía"
            text={`Cuando haya una liga de ${doubles ? 'parejas' : 'jugadores'} o un torneo con grupos, su tabla sale aquí.`}
          />
        )
      ) : tab === 'ranking' ? (
        <>
          {split && (
            <Segmented<Modality>
              label="Modalidad"
              value={modo}
              onChange={setModo}
              options={(['individual', 'dobles'] as const).map((k) => ({ key: k, label: MODALITY_LABEL[k] }))}
            />
          )}
          <StandingsTable
            rows={ranking}
            nameOf={names.nameOf}
            columns={rankingColumns}
            highlight={myPlayerId ? [myPlayerId] : []}
            primary={['puntos']}
            empty="Cuando se confirme el primer partido de liga o torneo, sale el ranking."
          />
          <Txt variant="small" tone="muted">
            {split ? `${MODALITY_LABEL[modo]}. ` : ''}
            {rankingNote(sport)}
          </Txt>
        </>
      ) : nights.length ? (
        <Card padded={false}>
          {/* Pro: con encabezado, por la columna de las noches. */}
          {pro && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
              <Txt style={[head, { width: 28 }]}>#</Txt>
              <Txt style={[head, { flex: 1 }]}>JUGADOR</Txt>
              <Txt accessibilityLabel="Noches" style={[head, { width: 44, textAlign: 'right' }]}>
                NOCHES
              </Txt>
              <Txt accessibilityLabel="Partidos jugados" style={[head, { width: 34, textAlign: 'right' }]}>
                PJ
              </Txt>
              <Txt accessibilityLabel="Ganados" style={[head, { width: 34, textAlign: 'right' }]}>
                G
              </Txt>
              <Txt style={[head, { width: 44, textAlign: 'right' }]}>PTS</Txt>
            </View>
          )}
          {nights.map((r, i) => (
            <View
              key={r.id}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i > 0 || pro ? 1 : 0, borderTopColor: c.line, backgroundColor: r.id === myPlayerId ? c.accentSoft : 'transparent' }}
            >
              <Txt style={{ width: 28, fontSize: 15, fontWeight: '600', color: c.muted }}>{r.rank}</Txt>
              <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>
                {names.nameOf(r.id)}
              </Txt>
              {pro && <Txt style={{ width: 44, textAlign: 'right', color: c.fg2 }}>{r.nights}</Txt>}
              <Txt style={{ width: 34, textAlign: 'right', color: c.fg2 }}>{r.played}</Txt>
              <Txt style={{ width: 34, textAlign: 'right', color: c.fg2 }}>{r.won}</Txt>
              <Txt style={{ width: 44, textAlign: 'right', fontSize: 17, fontWeight: '700' }}>{r.points}</Txt>
            </View>
          ))}
        </Card>
      ) : (
        <Empty icon={<Moon size={28} color={c.accent} />} title="Sin noches todavía" text="Los puntos de los americanos y mexicanos de la temporada salen aquí." />
      )}
    </View>
  );
}

/**
 * Arriba de la tabla: la temporada con sus fechas («Temporada 2026 ▾ · Cerrada · …»), que se cambia al tocarla (con 2 o
 * más). Una cerrada sin tabla guardada (la de abajo se calcula con sus partidos) muestra debajo sus premios.
 */
function SeasonBar({ seasons, selected, onChange }: { seasons: readonly Season[]; selected: Season | null; onChange: (id: string) => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  if (!selected) return null;
  const many = seasons.length > 1;
  const unsaved = selected.status === 'closed' && !parseSnapshot(selected.standings);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Temporada: ${selected.name}`}
        accessibilityState={{ disabled: !many }}
        disabled={!many}
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
      >
        <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
          {selected.name}
        </Txt>
        {many && <ChevronDown size={16} color={c.muted} />}
        <Txt tone="muted" numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
          {`${selected.status === 'closed' ? 'Cerrada · ' : ''}${seasonDates(selected)}`}
        </Txt>
      </Pressable>
      {unsaved && <SeasonAwardsCard season={selected} />}
      <Sheet open={open} onClose={() => setOpen(false)} title="Temporada">
        {seasons.map((x) => (
          <ChoiceRow
            key={x.id}
            title={`${x.name}${x.status === 'active' ? ' (en curso)' : ''}`}
            subtitle={seasonDates(x)}
            selected={x.id === selected.id}
            onPress={() => {
              onChange(x.id);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

/** Los premios de una temporada cerrada (el campeón arriba) con la fecha del cierre (SeasonAwardsCard de la web). */
function SeasonAwardsCard({ season }: { season: Season }) {
  const c = useColors();
  if (season.status !== 'closed') return null;
  const { champion, rest } = sortedAwards(season.awards);
  return (
    <Card style={{ gap: 12, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft }}>
          <Trophy size={20} color={c.accent} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt tone="muted" style={{ fontSize: 12 }}>
            {`${season.name} · terminó${season.endsOn ? ` el ${formatDate(season.endsOn)}` : ''}`}
          </Txt>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {champion ? `Campeón: ${champion.name}` : 'Temporada cerrada'}
          </Txt>
        </View>
      </View>
      {rest.map((a) => (
        <View key={a.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Award size={16} color={c.muted} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt style={{ fontSize: 14 }}>
              <Txt tone="muted" style={{ fontSize: 14 }}>{`${a.label}: `}</Txt>
              <Txt style={{ fontSize: 14, fontFamily: font.medium }}>{a.name}</Txt>
            </Txt>
            {!!a.note && (
              <Txt tone="muted" style={{ fontSize: 12 }}>
                {a.note}
              </Txt>
            )}
          </View>
        </View>
      ))}
    </Card>
  );
}

/** Una temporada cerrada: sus premios y la tabla que se guardó al cerrarla (ClosedSeasonView de la web). */
function ClosedSeasonView({ season, highlight }: { season: Season; highlight: readonly string[] }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const snapshot = useMemo(() => parseSnapshot(season.standings), [season.standings]);
  return (
    <View style={{ gap: 16 }}>
      <SeasonAwardsCard season={season} />
      {snapshot ? (
        <SnapshotTables snapshot={snapshot} highlight={highlight} />
      ) : (
        <Empty icon={<ListOrdered size={28} color={c.accent} />} title="Sin tabla guardada" text="Esta temporada se cerró sin tabla." />
      )}
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push({ pathname: '/l/[lid]/temporadas', params: { lid } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}
      >
        <History size={16} color={c.accent} />
        <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.medium }}>
          Todas las temporadas
        </Txt>
      </Pressable>
    </View>
  );
}
