import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CalendarDays, CalendarX2, Download, ListOrdered, Trash2, Users } from 'lucide-react';
import { deleteEvent } from '../../../../lib/data';
import { deleteMatch, useMatches } from '../../../../lib/data/matches';
import { useWithPendingPoints, type RacketEvent } from '../../../../lib/data/racket';
import { formatDateLong } from '../../../../lib/format';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { BackLink } from '../../../../components/BackLink';
import { MatchCard, ScheduleList, StandingsTable } from '../../../../components/match';
import { Badge, Button, Card, Empty, ListSkeleton, Tabs } from '../../../../components/ui';
import { eventTypeInfo, racketColumns } from '../bits';
import { exportCompetitionExcel } from '../excel';
import { parseLeagueConfig } from '../logic/league';
import { forLabel, pairStandings, seasonPlayerTable, setsLabel } from '../logic/results';
import { pointsText, tiebreakText } from '../logic/tiebreaks';
import { MatchDetail, useMatchParam, useMySide } from '../match/MatchDetail';
import { useNames } from '../names';
import { courtWords, useRacket } from '../sport';
import { ScheduleBuilder } from './ScheduleBuilder';

type Tab = 'jornadas' | 'tabla' | 'parejas';

/**
 * Liga de parejas: jornadas (calendario con canchas o mesas y horas), tabla con los desempates del pádel y las
 * parejas. Sin calendario, el admin lo arma aquí (ScheduleBuilder).
 */
export function LeaguePage({ event }: { event: RacketEvent }) {
  const { lid, base, isAdmin, league, myPlayerId } = useLeagueCtx();
  const { sport, ext, doubles, side } = useRacket();
  const names = useNames();
  const param = useMatchParam();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const now = useNow().getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const mySideOf = useMySide();
  const cfg = useMemo(() => parseLeagueConfig(event.config, event.date), [event.config, event.date]);
  const table = useMemo(() => pairStandings(sport, cfg.pairs, matches, { scheme: cfg.points, lotSeed: event.id, now }), [sport, cfg, matches, event.id, now]);
  const [busy, setBusy] = useState(false);
  const title = event.name || eventTypeInfo('liga', doubles).label;

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const requested = search.get('ver') as Tab | null;
  const tab: Tab = requested ?? 'jornadas';
  const mine = names.teamsOf(myPlayerId);
  const highlight = doubles ? mine : myPlayerId ? [myPlayerId] : [];
  const started = matches.some((m) => m.status !== 'scheduled' || m.seq > 0);

  const removeSchedule = async () => {
    if (!(await confirm({ title: '¿Borrar el calendario?', message: 'Se borran todos los partidos (ninguno ha empezado). Luego lo armas de nuevo.', confirmText: 'Borrar calendario', danger: true })))
      return;
    setBusy(true);
    try {
      for (const m of matches) await deleteMatch(lid, m.id);
      toast('Calendario borrado');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: `¿Borrar ${title}?`, message: 'Se borran sus partidos y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    navigate(base);
    try {
      await deleteEvent(lid, event.id);
      toast('Liga borrada');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };

  const excel = () =>
    exportCompetitionExcel({
      title,
      date: event.date,
      matches,
      tables: [{ name: 'Tabla', rows: table }],
      players: seasonPlayerTable(matches, { sport, rosterOf: names.rosterOf, now }),
      entrantName: names.entrantName,
      nameOf: names.nameOf,
      tz: league.tz,
      forLabel: forLabel(sport),
      setsLabel: setsLabel(sport),
      courtLabel: courtWords(ext).One,
    }).catch((e) => {
      console.error(e);
      toast('No se pudo hacer el Excel', 'error');
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {league.kind !== 'torneo' && <BackLink fallback={base} className="mt-1" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            <Badge tone="accent">{cfg.double ? 'Ida y vuelta' : 'Solo ida'}</Badge>
          </div>
          <p className="text-sm text-muted first-letter:uppercase">
            Desde {formatDateLong(cfg.startDate || event.date)} · {cfg.pairs.length} {cfg.pairs.length === 1 ? side[0] : side[1]} ·{' '}
            {pointsText(sport, cfg.points)}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Download className="size-4" />} onClick={() => void excel()} disabled={!matches.length}>
            Excel
          </Button>
          {matches.length > 0 && !started && (
            <Button size="sm" icon={<CalendarX2 className="size-4" />} loading={busy} onClick={() => void removeSchedule()}>
              Rehacer el calendario
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
            Borrar
          </Button>
        </div>
      )}

      {q.loading && !matches.length ? (
        <ListSkeleton rows={3} />
      ) : !matches.length ? (
        isAdmin ? (
          <ScheduleBuilder event={event} cfg={cfg} />
        ) : (
          <Empty icon={<CalendarDays className="size-8" />} title="El calendario todavía no está">
            Cuando el admin arme las jornadas, aquí salen tus partidos con {courtWords(ext).one} y hora.
          </Empty>
        )
      ) : (
        <>
          <Tabs
            items={[
              { key: 'jornadas' as Tab, label: 'Jornadas', icon: <CalendarDays className="size-4" /> },
              { key: 'tabla' as Tab, label: 'Tabla', icon: <ListOrdered className="size-4" /> },
              { key: 'parejas' as Tab, label: doubles ? 'Parejas' : 'Jugadores', icon: <Users className="size-4" /> },
            ]}
            active={tab}
            onChange={(k) => setSearch({ ver: k }, { replace: true })}
          />
          <div key={tab} className="animate-fade-up flex flex-col gap-3">
            {tab === 'jornadas' && (
              <ScheduleList
                matches={matches}
                groupBy="round"
                roundWord="Jornada"
                tz={league.tz}
                now={now}
                renderMatch={(m) => <MatchCard match={m} mySide={mySideOf(m)} roundWord="Jornada" tz={league.tz} now={now} onClick={() => param.open(m.id)} />}
              />
            )}
            {tab === 'tabla' && (
              <>
                <StandingsTable
                  rows={table}
                  nameOf={names.entrantName}
                  columns={racketColumns(sport)}
                  highlight={highlight}
                />
                <p className="px-1 text-xs text-muted">{tiebreakText(sport)} Un resultado por confirmar cuenta a las 48 h.</p>
              </>
            )}
            {tab === 'parejas' && (
              <Card className="divide-y divide-line overflow-hidden">
                {cfg.pairs.map((id) => (
                  <div key={id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{names.entrantName(id)}</span>
                      {doubles && <span className="block truncate text-xs text-muted">{names.rosterOf(id).map(names.nameOf).join(' / ')}</span>}
                    </span>
                    {highlight.includes(id) && <Badge tone="accent">{doubles ? 'Tu pareja' : 'Tú'}</Badge>}
                  </div>
                ))}
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
