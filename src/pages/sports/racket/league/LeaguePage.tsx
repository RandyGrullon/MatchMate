import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CalendarDays, CalendarX2, FileSpreadsheet, ListOrdered, Trash2, Users } from 'lucide-react';
import { deleteEvent } from '../../../../lib/data';
import { deleteMatch, useMatches } from '../../../../lib/data/matches';
import { useWithPendingPoints, type RacketEvent } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { useBusy } from '../../../../components/busy';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { eventDay } from '../../../../components/event/EventHeader';
import { MatchCard, ScheduleList, StandingsTable } from '../../../../components/match';
import { useIsPro } from '../../../../components/mode';
import { NoticeSlot } from '../../../../components/NoticeSlot';
import { TuTag } from '../../../../components/ranking/parts';
import { Card, Empty, ListRow, ListSkeleton, RowIcon, Segmented, SectionHeader, Sheet, cx } from '../../../../components/ui';
import { FinePrint, RankRows, eventTypeInfo, racketColumns } from '../bits';
import { exportCompetitionExcel } from '../excel';
import { ScreenHead, useEventBack, useOrganizePro, type RacketMenuItem } from '../frame';
import { parseLeagueConfig } from '../logic/league';
import { forLabel, matchTime, pairStandings, seasonPlayerTable, setsLabel } from '../logic/results';
import { pointsText, tiebreakText } from '../logic/tiebreaks';
import { todayIn } from '../logic/time';
import { MatchDetail, useMatchParam, useMySide } from '../match/MatchDetail';
import { useNames } from '../names';
import { courtWords, useRacket } from '../sport';
import { ScheduleBuilder } from './ScheduleBuilder';

type Tab = 'jornadas' | 'tabla' | 'parejas';

/**
 * Liga de parejas (rediseño «Calma y foco»): «‹ Pádel de los jueves» con «•••» (Excel, rehacer el calendario, borrar),
 * el título y «Desde mié 7 oct · 4 parejas · solo ida».
 * - Lite: tu próximo partido, la tabla corta («Tabla», con los puntos) y las jornadas; las parejas, en su fila.
 * - Pro: Jornadas · Tabla · Parejas en un segmentado, con la tabla completa y sus desempates.
 * Sin calendario, quien organiza (en Pro) lo arma aquí (ScheduleBuilder); en Lite, el aviso «Usar Pro».
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
  const [sheet, setSheet] = useState<'parejas' | null>(null);
  const exporting = useBusy();
  const pro = useIsPro();
  const back = useEventBack();
  const title = event.name || eventTypeInfo('liga', doubles).label;
  // Lite, quien organiza y todavía no hay calendario: se arma en Pro.
  const proItem = useOrganizePro(isAdmin && !q.loading && !matches.length, {
    id: `raqueta-liga-pro:${event.id}`,
    title: 'Falta el calendario',
    text: 'Las jornadas se arman en Pro',
    menu: 'Armar el calendario',
  });

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const requested = search.get('ver') as Tab | null;
  const tab: Tab = requested ?? 'jornadas';
  const mine = names.teamsOf(myPlayerId);
  const highlight = doubles ? mine : myPlayerId ? [myPlayerId] : [];
  const started = matches.some((m) => m.status !== 'scheduled' || m.seq > 0);
  const organize = isAdmin && pro;

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
    exporting.run('excel', () =>
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
      }),
    );

  const today = todayIn(league.tz);
  const count = `${cfg.pairs.length} ${cfg.pairs.length === 1 ? side[0] : side[1]}`;
  const day = eventDay(cfg.startDate || event.date, today, pro);
  const meta = [`Desde ${day.charAt(0).toLowerCase()}${day.slice(1)}`, count, cfg.double ? 'ida y vuelta' : 'solo ida', pro ? pointsText(sport, cfg.points) : null].filter(Boolean).join(' · ');
  const menu: RacketMenuItem[] = [
    ...(proItem ? [proItem] : []),
    ...(isAdmin && matches.length
      ? [{ key: 'excel', icon: FileSpreadsheet, label: 'Excel', hint: 'Partidos, tabla y jugadores', onClick: () => void excel(), busy: exporting.isBusy(), keep: true }]
      : []),
    ...(organize && matches.length > 0 && !started
      ? [{ key: 'rehacer', icon: CalendarX2, label: 'Rehacer el calendario', hint: 'Ningún partido ha empezado', onClick: () => void removeSchedule(), busy }]
      : []),
    ...(isAdmin ? [{ key: 'borrar', icon: Trash2, label: 'Borrar la liga', onClick: () => void remove(), danger: true }] : []),
  ];
  // Mi próximo partido (Lite): el que sigue por jugar con mi pareja.
  const next =
    mine.length || myPlayerId
      ? matches
          .filter((m) => (m.status === 'scheduled' || m.status === 'live' || m.status === 'suspended' || m.status === 'postponed') && mySideOf(m) !== null)
          .sort((a, b) => matchTime(a) - matchTime(b))[0]
      : undefined;

  const schedule = (
    <ScheduleList
      matches={matches}
      groupBy="round"
      roundWord="Jornada"
      tz={league.tz}
      now={now}
      renderMatch={(m) => <MatchCard match={m} mySide={mySideOf(m)} roundWord="Jornada" tz={league.tz} now={now} onClick={() => param.open(m.id)} />}
    />
  );
  const pairsList = (
    <Card className="overflow-hidden">
      {cfg.pairs.map((id) => (
        <ListRow
          key={id}
          dense={pro}
          me={highlight.includes(id)}
          title={
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">{names.entrantName(id)}</span>
              {highlight.includes(id) && <TuTag />}
            </span>
          }
          subtitle={doubles ? names.rosterOf(id).map(names.nameOf).join(' / ') : undefined}
        />
      ))}
    </Card>
  );

  let body;
  if (q.loading && !matches.length) body = <ListSkeleton rows={3} />;
  else if (!matches.length)
    body = organize ? (
      <ScheduleBuilder event={event} cfg={cfg} />
    ) : (
      <Empty icon={<CalendarDays className="size-8" />} title="El calendario todavía no está">
        Cuando se armen las jornadas, aquí salen tus partidos con {courtWords(ext).one} y hora.
      </Empty>
    );
  else if (pro)
    body = (
      <>
        <Segmented
          full
          label="Qué ver de la liga"
          options={[
            { key: 'jornadas' as Tab, label: 'Jornadas', icon: <CalendarDays aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
            { key: 'tabla' as Tab, label: 'Tabla', icon: <ListOrdered aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
            { key: 'parejas' as Tab, label: doubles ? 'Parejas' : 'Jugadores', icon: <Users aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
          ]}
          value={tab}
          onChange={(k) => setSearch({ ver: k }, { replace: true })}
        />
        <div key={tab} className="animate-fade-up mt-4 flex flex-col gap-3">
          {tab === 'jornadas' && schedule}
          {tab === 'tabla' && (
            <>
              <StandingsTable rows={table} nameOf={names.entrantName} columns={racketColumns(sport)} highlight={highlight} />
              <FinePrint>{tiebreakText(sport)} Un resultado por confirmar cuenta a las 48 h.</FinePrint>
            </>
          )}
          {tab === 'parejas' && pairsList}
        </div>
      </>
    );
  else
    body = (
      <div className="flex flex-col gap-[30px]">
        {next && (
          <section aria-labelledby="liga-mio">
            <SectionHeader id="liga-mio" title="Tu próximo partido" />
            <MatchCard match={next} mySide={mySideOf(next)} roundWord="Jornada" tz={league.tz} now={now} onClick={() => param.open(next.id)} />
          </section>
        )}
        <section aria-labelledby="liga-tabla">
          <SectionHeader id="liga-tabla" title="Tabla" />
          <RankRows
            rows={table}
            nameOf={names.entrantName}
            value={(id) => table.find((r) => r.id === id)?.points ?? 0}
            sub={(id) => {
              const r = table.find((x) => x.id === id);
              return r ? `${r.played} ${r.played === 1 ? 'jugado' : 'jugados'} · ${r.won} G · ${r.lost} P` : null;
            }}
            highlight={highlight}
          />
          <p className="mx-1 mt-2.5 text-[12.5px] leading-[1.4] text-muted">Puntos: {pointsText(sport, cfg.points)}</p>
        </section>
        <section aria-labelledby="liga-jornadas">
          <SectionHeader id="liga-jornadas" title="Jornadas" />
          {schedule}
        </section>
        <Card className="overflow-hidden">
          <ListRow
            leading={
              <RowIcon>
                <Users className="size-5" />
              </RowIcon>
            }
            title={doubles ? `Parejas (${cfg.pairs.length})` : `Jugadores (${cfg.pairs.length})`}
            onClick={() => setSheet('parejas')}
          />
        </Card>
      </div>
    );

  return (
    <div className="flex flex-col px-2">
      <ScreenHead back={back} title={title} meta={meta} menu={menu} />
      <div className={cx(pro ? 'mt-[22px]' : 'mt-[26px]')}>{body}</div>
      <NoticeSlot className="mt-4" />
      <Sheet open={sheet === 'parejas'} onClose={() => setSheet(null)} title={doubles ? 'Parejas' : 'Jugadores'} subtitle={title}>
        {sheet === 'parejas' && <div className="pb-1">{pairsList}</div>}
      </Sheet>
    </div>
  );
}
