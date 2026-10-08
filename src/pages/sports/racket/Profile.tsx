import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Share2, UserRound } from 'lucide-react';
import { useMatches, type Match } from '../../../lib/data/matches';
import { useWithPendingPoints } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { isGameSport } from '../../../sports/racket/rules';
import { playerUrl, shareLink } from '../../../components/share';
import { BusyIcon, useBusy } from '../../../components/busy';
import { useFeedback } from '../../../components/feedback';
import { EventTopBar } from '../../../components/event/EventHeader';
import { MatchCard } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { Card, Empty, ListRow, ListSkeleton, Segmented, StatDuo, cx } from '../../../components/ui';
import { Chips, Section, StatTile } from './bits';
import { fmtPoints } from './logic/night';
import { byModality, MODALITY_LABEL, type Modality } from './logic/modality';
import { isPointsMatch, matchTime, playerRecord, playerSide, winPct, type PeopleLine, type PlayerRecord } from './logic/results';
import { levelText, useLevels } from './levels';
import { useNames } from './names';
import { hasNights, useRacket } from './sport';

/** Mi perfil en la liga (/l/:lid/perfil): «‹ Pádel de los jueves» lo pone LeagueShell. */
export function RacketMyProfile() {
  const { myPlayerId } = useLeagueCtx();
  if (!myPlayerId) {
    return (
      <div className="flex flex-col px-2">
        <h1 className="text-title">Mis partidos</h1>
        <div className="mt-[22px]">
          <Empty icon={<UserRound className="size-8" />} title="Todavía no juegas en esta liga">
            Cuando te pongan en una noche, una pareja o un torneo, tus partidos salen aquí.
          </Empty>
        </div>
      </div>
    );
  }
  return <PlayerProfile playerId={myPlayerId} mine />;
}

/** Perfil de otro jugador (/l/:lid/j/:playerId): trae su propia barra (vuelve a donde estaba, o a la Tabla). */
export function RacketPlayerPage() {
  const { playerId } = useParams();
  if (!playerId) return <Empty title="Jugador no encontrado" />;
  return <PlayerProfile playerId={playerId} />;
}

type Filter = 'todo' | 'sets' | 'noches' | Modality;

/**
 * Lo del jugador (rediseño «Calma y foco»): el título (su nombre o «Mis partidos») con su nivel y sus parejas, sus
 * próximos partidos y sus números.
 * - Lite: jugados y % de victorias en dos números grandes, la racha y sus últimos partidos.
 * - Pro: además, por modalidad o por tipo (liga y torneos, noches), los números completos (sets, juegos, puntos), el
 *   récord con cada compañero y contra cada rival, y más partidos.
 */
function PlayerProfile({ playerId, mine }: { playerId: string; mine?: boolean }) {
  const { lid, base, league } = useLeagueCtx();
  const { sport, doubles, ext } = useRacket();
  const names = useNames();
  const { toast } = useFeedback();
  const now = useNow().getTime();
  const q = useMatches({ lid });
  const all = useWithPendingPoints(lid, q.data);
  const { levels, scale } = useLevels();
  const [filter, setFilter] = useState<Filter>('todo');
  const sharing = useBusy();
  const pro = useIsPro();
  const player = names.players.find((p) => p.id === playerId);
  const nightsWord = ext.words?.nights ?? 'Noches';

  // Partidos a sets del jugador por modalidad: si jugó de las dos, las estadísticas van separadas.
  const kinds = useMemo(() => {
    const mineSets = all.filter((m) => !isPointsMatch(m) && playerSide(m, playerId, names.rosterOf) !== null);
    return byModality(mineSets, names.rosterOf);
  }, [all, playerId, names]);
  const split = kinds.individual.length > 0 && kinds.dobles.length > 0;
  // En Lite no hay filtros: se ve todo.
  const shown: Filter = pro ? filter : 'todo';
  const scoped = useMemo(
    () =>
      all.filter((m) => {
        if (shown === 'sets') return !isPointsMatch(m);
        if (shown === 'noches') return isPointsMatch(m);
        if (shown === 'individual' || shown === 'dobles') return kinds[shown].includes(m);
        return true;
      }),
    [all, shown, kinds],
  );
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

  const share = () =>
    void sharing.run('compartir', async () => {
      if (await shareLink(playerUrl(lid, playerId), `${player?.name ?? 'Jugador'} · ${league.name}`)) toast('Link copiado');
    });
  const shareButton = (
    <button
      type="button"
      onClick={share}
      disabled={sharing.isBusy()}
      aria-label="Compartir"
      className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-2 transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-70"
    >
      <BusyIcon busy={sharing.isBusy()} icon={<Share2 className="size-5" />} className="size-5" />
    </button>
  );

  if (!player && !names.loading) return <Empty title="Este jugador ya no está en la liga" />;
  const s = rec.sets;
  const n = rec.nights;
  const linkOf = (m: Match) => (m.eventId ? `${base}/e/${m.eventId}?partido=${m.id}` : `${base}/juegos?partido=${m.id}`);
  const lv = levels[playerId];
  const meta = [mine ? player?.name : null, lv != null ? levelText(lv, scale) : null, ...pairs.map((t) => t.name)].filter(Boolean).join(' · ');
  const pct = winPct(s.won, s.played);
  const filters = [
    { key: 'todo' as Filter, label: 'Todo' },
    ...(split
      ? [
          { key: 'individual' as Filter, label: MODALITY_LABEL.individual },
          { key: 'dobles' as Filter, label: MODALITY_LABEL.dobles },
        ]
      : hasNights(sport)
        ? [{ key: 'sets' as Filter, label: 'Liga y torneos' }]
        : []),
    ...(hasNights(sport) ? [{ key: 'noches' as Filter, label: nightsWord }] : []),
  ];
  const card = (m: Match) => <MatchCard key={m.id} match={m} mySide={playerSide(m, playerId, names.rosterOf)} to={linkOf(m)} tz={league.tz} now={now} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} />;

  return (
    <div className="flex flex-col px-2">
      {/* Mis partidos va dentro de la liga (LeagueShell pone «‹ Pádel de los jueves»); la página de otro trae la suya. */}
      {mine ? (
        <div className="flex items-start justify-between gap-3">
          <h1 className={pro ? 'text-title-pro' : 'text-title'}>Mis partidos</h1>
          {shareButton}
        </div>
      ) : (
        <>
          <EventTopBar back={{ label: league.name, fallback: `${base}/ranking` }} right={shareButton} />
          <h1 className={cx('break-words', pro ? 'mt-0.5 text-title-pro' : 'mt-1 text-title')}>{player?.name ?? '…'}</h1>
        </>
      )}
      {meta && <p className={cx('text-meta text-muted', pro ? 'mt-1' : 'mt-1.5')}>{meta}</p>}

      {q.loading && !all.length ? (
        <div className="mt-[22px]">
          <ListSkeleton rows={3} />
        </div>
      ) : (
        <>
          {/* Quien solo juega noches (americano, round robin) ve sus puntos; los demás, sus partidos a sets. */}
          {s.played === 0 && n.played > 0 ? (
            <StatDuo
              className="mt-[22px]"
              left={{ value: n.played, label: `${n.played === 1 ? 'partido' : 'partidos'} de ${ext.words?.nights ? ext.words.nights.toLowerCase() : 'noche'}` }}
              right={{ value: fmtPoints(Math.round((n.pointsFor / n.played) * 10) / 10), label: 'puntos por partido' }}
            />
          ) : (
            <StatDuo
              className="mt-[22px]"
              left={{ value: s.played, label: s.played === 1 ? 'partido jugado' : 'partidos jugados' }}
              right={{ value: pct != null ? `${pct}%` : '–', label: 'de victorias' }}
            />
          )}
          {s.last.length > 0 && (
            <p className="mx-1 mt-3 flex items-center gap-2 text-meta text-muted">
              Últimos: <Streak last={s.last} />
              {s.streak && s.streak.n > 1 && (
                <span className="font-semibold text-fg-2">
                  · {s.streak.n} {s.streak.kind === 'G' ? 'ganados' : 'perdidos'} seguidos
                </span>
              )}
            </p>
          )}

          {upcoming.length > 0 && (
            <Section title={mine ? 'Tus próximos partidos' : 'Próximos partidos'} className="mt-[30px]">
              <div className="grid gap-2.5 sm:grid-cols-2">{upcoming.map(card)}</div>
            </Section>
          )}

          {pro && (
            <>
              {filters.length > 1 &&
                (filters.length <= 3 ? (
                  <Segmented full label="Qué partidos contar" className="mt-[30px]" options={filters} value={filter} onChange={setFilter} />
                ) : (
                  <Chips className="mt-[30px]" items={filters} value={filter} onChange={setFilter} />
                ))}
              {shown !== 'noches' &&
                (bySplit ? (
                  bySplit.map(([k, r]) => <SetsStats key={k} title={`Liga y torneos · ${MODALITY_LABEL[k]}`} s={r.sets} sport={sport} />)
                ) : (
                  <SetsStats title={shown === 'individual' || shown === 'dobles' ? `Liga y torneos · ${MODALITY_LABEL[shown]}` : 'Liga y torneos'} s={s} sport={sport} />
                ))}
              {shown !== 'sets' && n.played > 0 && (
                <Section title={ext.words?.nightsLong ?? 'Noches de americano y mexicano'} className="mt-[30px]">
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <StatTile label="Noches" value={n.nights} />
                    <StatTile label="Partidos" value={n.played} sub={`${n.won} G · ${n.drawn} E · ${n.lost} P`} />
                    <StatTile label="Puntos" value={n.pointsFor} sub={`${n.pointsAgainst} en contra`} />
                    <StatTile label="Por partido" value={fmtPoints(Math.round((n.pointsFor / n.played) * 10) / 10)} />
                  </div>
                </Section>
              )}
              {(doubles || split || shown === 'dobles') && rec.partners.length > 0 && (
                <Section title="Con cada compañero" className="mt-[30px]">
                  <PeopleRows lines={rec.partners} nameOf={names.nameOf} base={base} />
                </Section>
              )}
              {rec.rivals.length > 0 && (
                <Section title="Contra cada rival" className="mt-[30px]">
                  <PeopleRows lines={rec.rivals} nameOf={names.nameOf} base={base} />
                </Section>
              )}
            </>
          )}

          <Section title="Partidos" className="mt-[30px]">
            {rec.matches.length ? (
              <div className="grid gap-2.5 sm:grid-cols-2">{rec.matches.slice(0, pro ? 12 : 6).map(card)}</div>
            ) : (
              <Empty title="Todavía no hay partidos que cuenten">Los partidos confirmados salen aquí.</Empty>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function SetsStats({ title, s, sport }: { title: string; s: PlayerRecord['sets']; sport: string }) {
  // Pickleball y ping pong: «Juegos 12-7» y debajo «Puntos 190-151 (+39)».
  const pk = isGameSport(sport);
  const pointDiff = s.gamesFor - s.gamesAgainst;
  return (
    <Section title={title} className="mt-[30px]">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile label="Jugados" value={s.played} sub={`${s.won} G · ${s.lost} P`} />
        <StatTile label="% de victorias" value={winPct(s.won, s.played) != null ? `${winPct(s.won, s.played)}%` : '–'} />
        <StatTile label="Racha" value={s.streak ? `${s.streak.n} ${s.streak.kind === 'G' ? 'G' : 'P'}` : '–'} sub={s.last.length ? <Streak last={s.last} /> : undefined} />
        <StatTile
          label={pk ? 'Juegos' : 'Sets'}
          value={`${s.setsFor}-${s.setsAgainst}`}
          sub={`${pk ? 'Puntos' : 'Juegos'} ${s.gamesFor}-${s.gamesAgainst}${pk && s.played ? ` (${pointDiff > 0 ? '+' : ''}${pointDiff})` : ''}`}
        />
      </div>
    </Section>
  );
}

/** Los últimos resultados en fichas: G en el color del deporte y P en gris. */
function Streak({ last }: { last: ('G' | 'P')[] }) {
  return (
    <span className="inline-flex gap-1" aria-label={`Últimos: ${last.join(' ')}`}>
      {last.map((x, i) => (
        <span
          key={i}
          className={cx('inline-grid size-5 place-items-center rounded-md text-[11px] font-bold', x === 'G' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}
        >
          {x}
        </span>
      ))}
    </span>
  );
}

/** El récord con cada compañero o contra cada rival: una fila por persona con su % de victorias. */
function PeopleRows({ lines, nameOf, base }: { lines: PeopleLine[]; nameOf: (id: string) => string; base: string }) {
  return (
    <Card className="overflow-hidden">
      {lines.slice(0, 15).map((l) => (
        <ListRow
          key={l.id}
          dense
          to={`${base}/j/${l.id}`}
          chevron={false}
          title={nameOf(l.id)}
          subtitle={`${l.played} ${l.played === 1 ? 'partido' : 'partidos'} · ${l.won} G · ${l.lost} P`}
          value={`${winPct(l.won, l.played) ?? 0}%`}
        />
      ))}
    </Card>
  );
}
