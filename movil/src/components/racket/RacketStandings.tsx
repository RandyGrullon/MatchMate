/**
 * Tabla de la temporada de raqueta (Standings.tsx de la web, con su misma lógica: useRacketSeason): las tablas de las
 * ligas de parejas y de los grupos de los torneos, el ranking individual y las noches. La temporada de ahora; ver una
 * temporada cerrada, por ahora en la web.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ListOrdered, Moon } from 'lucide-react-native';
import { useLeagueSeasons } from '@mm/lib/data/seasons';
import { useLeagueCtx } from '@mm/lib/league';
import { pickSeason } from '@mm/lib/seasons';
import type { StandingsColumn } from '@mm/components/match/standings';
import { MODALITY_LABEL, type Modality } from '@mm/pages/sports/racket/logic/modality';
import { seasonPlayerTable, winPct } from '@mm/pages/sports/racket/logic/results';
import { rankingNote, tiebreakText } from '@mm/pages/sports/racket/logic/tiebreaks';
import { useRacketSeason } from '@mm/pages/sports/racket/seasonTable';
import { hasNights, useRacket } from '@mm/pages/sports/racket/sport';
import { racketColumns } from '@mm/pages/sports/racket/view';
import { StandingsTable } from '../match/StandingsTable';
import { Card, Empty, LoadError, Segmented, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';

type Tab = 'parejas' | 'ranking' | 'noches';

export function RacketStandings() {
  const c = useColors();
  const { lid, myPlayerId } = useLeagueCtx();
  const { sport, doubles, ext } = useRacket();
  const seasons = useLeagueSeasons(lid);
  const season = pickSeason(seasons.data, null);
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
  // Como Lite en la web: jugados, ganados y el % de victorias; las tablas de ligas y grupos, jugados, ganados y perdidos.
  const rankingColumns: StandingsColumn[] = [
    ...racketColumns(sport).slice(0, 2),
    { key: 'pct', label: '% G', title: 'Porcentaje de victorias', value: (r) => `${winPct(r.won, r.played) ?? 0}%` },
  ];
  const compColumns = racketColumns(sport).slice(0, 3);
  const tab: Tab = picked ?? (comps.length ? 'parejas' : ranking.length ? 'ranking' : nights.length ? 'noches' : 'parejas');
  const comp = comps.find((x) => x.key === compKey) ?? comps[0];
  const highlight = [...(myPlayerId ? [myPlayerId] : []), ...names.teamsOf(myPlayerId)];

  if (q.error) return <LoadError error={q.error} />;
  return (
    <View style={{ gap: 16 }}>
      <Txt variant="title">Tabla</Txt>
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
      {!!season?.name && seasons.data.length > 1 && (
        <Txt variant="meta" tone="muted">
          {season.name}
        </Txt>
      )}
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
          {nights.map((r, i) => (
            <View
              key={r.id}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.line, backgroundColor: r.id === myPlayerId ? c.accentSoft : 'transparent' }}
            >
              <Txt style={{ width: 28, fontSize: 15, fontWeight: '600', color: c.muted }}>{r.rank}</Txt>
              <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>
                {names.nameOf(r.id)}
              </Txt>
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
