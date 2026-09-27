import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Share2, UserRound } from 'lucide-react';
import { useMatches, type Match } from '../../../lib/data/matches';
import { useWithPendingPoints } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { playerUrl, shareLink } from '../../../components/share';
import { useFeedback } from '../../../components/feedback';
import { BackLink } from '../../../components/BackLink';
import { MatchCard } from '../../../components/match';
import { Badge, Button, Card, Empty, ListSkeleton, cx } from '../../../components/ui';
import { Chips, Section, StatTile } from './bits';
import { fmtPoints } from './logic/night';
import { byModality, MODALITY_LABEL, type Modality } from './logic/modality';
import { isPointsMatch, matchTime, playerRecord, playerSide, winPct, type PeopleLine, type PlayerRecord } from './logic/results';
import { levelText, useLevels } from './levels';
import { useNames } from './names';
import { useRacket } from './sport';

/** Mi perfil en la liga (/l/:lid/perfil). */
export function RacketMyProfile() {
  const { myPlayerId } = useLeagueCtx();
  if (!myPlayerId) {
    return (
      <Empty icon={<UserRound className="size-8" />} title="Todavía no juegas en esta liga">
        Cuando el admin te ponga en una noche, una pareja o un torneo, tus partidos y estadísticas salen aquí.
      </Empty>
    );
  }
  return <PlayerProfile playerId={myPlayerId} mine />;
}

/** Perfil de otro jugador (/l/:lid/j/:playerId). */
export function RacketPlayerPage() {
  const { playerId } = useParams();
  const { base } = useLeagueCtx();
  if (!playerId) return <Empty title="Jugador no encontrado" />;
  return (
    <div className="flex flex-col gap-3">
      <BackLink fallback={`${base}/ranking`} />
      <PlayerProfile playerId={playerId} />
    </div>
  );
}

type Filter = 'todo' | 'sets' | 'noches' | Modality;

/**
 * Estadísticas del jugador: partidos a sets (jugados, ganados, % de victorias, racha, sets y juegos), noches de
 * americano y mexicano (puntos y promedio), récord con cada compañero y contra cada rival, y sus partidos. Si
 * juega individual y dobles (tenis, pickleball), cada modalidad va por separado.
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
  const player = names.players.find((p) => p.id === playerId);
  const nightsWord = ext.words?.nights ?? 'Noches';

  // Partidos a sets del jugador por modalidad: si jugó de las dos, las estadísticas van separadas.
  const kinds = useMemo(() => {
    const mineSets = all.filter((m) => !isPointsMatch(m) && playerSide(m, playerId, names.rosterOf) !== null);
    return byModality(mineSets, names.rosterOf);
  }, [all, playerId, names]);
  const split = kinds.individual.length > 0 && kinds.dobles.length > 0;
  const scoped = useMemo(
    () =>
      all.filter((m) => {
        if (filter === 'sets') return !isPointsMatch(m);
        if (filter === 'noches') return isPointsMatch(m);
        if (filter === 'individual' || filter === 'dobles') return kinds[filter].includes(m);
        return true;
      }),
    [all, filter, kinds],
  );
  const rec = useMemo(() => playerRecord(playerId, scoped, { sport, rosterOf: names.rosterOf, now }), [playerId, scoped, sport, names, now]);
  const bySplit = useMemo(
    () =>
      split && filter === 'todo'
        ? (['individual', 'dobles'] as const).map((k) => [k, playerRecord(playerId, kinds[k], { sport, rosterOf: names.rosterOf, now })] as [Modality, PlayerRecord])
        : null,
    [split, filter, playerId, kinds, sport, names, now],
  );
  const upcoming = useMemo(
    () =>
      all
        .filter((m) => (m.status === 'scheduled' || m.status === 'postponed' || m.status === 'suspended' || m.status === 'live') && playerSide(m, playerId, names.rosterOf) !== null)
        .sort((a, b) => matchTime(a) - matchTime(b))
        .slice(0, 5),
    [all, playerId, names],
  );
  const pairs = names.teams.filter((t) => t.roster.some((r) => r.playerId === playerId));

  if (!player && !names.loading) return <Empty title="Este jugador ya no está en la liga" />;
  const s = rec.sets;
  const n = rec.nights;
  const linkOf = (m: Match) => (m.eventId ? `${base}/e/${m.eventId}?partido=${m.id}` : `${base}/juegos?partido=${m.id}`);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-lg font-bold text-accent">
          {(player?.name ?? '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">{mine ? 'Mis partidos' : (player?.name ?? '…')}</h1>
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            {mine && <span>{player?.name}</span>}
            {levels[playerId] != null && <Badge tone="accent">{levelText(levels[playerId], scale)}</Badge>}
            {pairs.map((t) => (
              <Badge key={t.id} tone="neutral">
                {t.name}
              </Badge>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          aria-label="Compartir"
          icon={<Share2 className="size-5" />}
          onClick={async () => {
            if (await shareLink(playerUrl(lid, playerId), `${player?.name ?? 'Jugador'} · ${league.name}`)) toast('Link copiado');
          }}
        />
      </div>

      {upcoming.length > 0 && (
        <Section title={mine ? 'Tus próximos partidos' : 'Próximos partidos'}>
          <div className="grid gap-2 sm:grid-cols-2">
            {upcoming.map((m) => (
              <MatchCard key={m.id} match={m} mySide={playerSide(m, playerId, names.rosterOf)} to={linkOf(m)} tz={league.tz} now={now} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} />
            ))}
          </div>
        </Section>
      )}

      <Chips
        items={[
          { key: 'todo' as Filter, label: 'Todo' },
          ...(split
            ? [
                { key: 'individual' as Filter, label: MODALITY_LABEL.individual },
                { key: 'dobles' as Filter, label: MODALITY_LABEL.dobles },
              ]
            : [{ key: 'sets' as Filter, label: 'Liga y torneos' }]),
          { key: 'noches' as Filter, label: nightsWord },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {q.loading && !all.length ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          {filter !== 'noches' &&
            (bySplit ? (
              bySplit.map(([k, r]) => <SetsStats key={k} title={`Liga y torneos · ${MODALITY_LABEL[k]}`} s={r.sets} sport={sport} />)
            ) : (
              <SetsStats title={filter === 'individual' || filter === 'dobles' ? `Liga y torneos · ${MODALITY_LABEL[filter]}` : 'Liga y torneos'} s={s} sport={sport} />
            ))}
          {filter !== 'sets' && n.played > 0 && (
            <Section title={ext.words?.nightsLong ?? 'Noches de americano y mexicano'}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Noches" value={n.nights} />
                <StatTile label="Partidos" value={n.played} sub={`${n.won} G · ${n.drawn} E · ${n.lost} P`} />
                <StatTile label="Puntos" value={n.pointsFor} sub={`${n.pointsAgainst} en contra`} />
                <StatTile label="Por partido" value={fmtPoints(Math.round((n.pointsFor / n.played) * 10) / 10)} />
              </div>
            </Section>
          )}
          {(doubles || split || filter === 'dobles') && rec.partners.length > 0 && (
            <Section title="Con cada compañero">
              <PeopleTable lines={rec.partners} nameOf={names.nameOf} base={base} />
            </Section>
          )}
          {rec.rivals.length > 0 && (
            <Section title="Contra cada rival">
              <PeopleTable lines={rec.rivals} nameOf={names.nameOf} base={base} />
            </Section>
          )}
          <Section title="Partidos">
            {rec.matches.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {rec.matches.slice(0, 12).map((m) => (
                  <MatchCard key={m.id} match={m} mySide={playerSide(m, playerId, names.rosterOf)} to={linkOf(m)} tz={league.tz} now={now} roundWord={isPointsMatch(m) ? 'Ronda' : 'Jornada'} />
                ))}
              </div>
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
  const pk = sport === 'pickleball';
  const pointDiff = s.gamesFor - s.gamesAgainst;
  return (
    <Section title={title}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

function Streak({ last }: { last: ('G' | 'P')[] }) {
  return (
    <span className="flex gap-1" aria-label={`Últimos: ${last.join(' ')}`}>
      {last.map((x, i) => (
        <span key={i} className={cx('inline-flex size-4 items-center justify-center rounded text-[10px] font-bold', x === 'G' ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')}>
          {x}
        </span>
      ))}
    </span>
  );
}

function PeopleTable({ lines, nameOf, base }: { lines: PeopleLine[]; nameOf: (id: string) => string; base: string }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted">
          <tr className="border-b border-line">
            <th className="px-4 py-2 text-left font-medium">Jugador</th>
            <th className="px-2 py-2 text-right font-medium">PJ</th>
            <th className="px-2 py-2 text-right font-medium">G</th>
            <th className="px-2 py-2 text-right font-medium">P</th>
            <th className="px-4 py-2 text-right font-medium">% G</th>
          </tr>
        </thead>
        <tbody>
          {lines.slice(0, 15).map((l) => (
            <tr key={l.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2">
                <Link to={`${base}/j/${l.id}`} className="font-medium hover:text-accent">
                  {nameOf(l.id)}
                </Link>
              </td>
              <td className="px-2 py-2 text-right text-muted tabular-nums">{l.played}</td>
              <td className="px-2 py-2 text-right text-muted tabular-nums">{l.won}</td>
              <td className="px-2 py-2 text-right text-muted tabular-nums">{l.lost}</td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums">{winPct(l.won, l.played) ?? 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
