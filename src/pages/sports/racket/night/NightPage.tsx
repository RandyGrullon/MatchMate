import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ClipboardList, ClipboardPen, FileDown, Flag, LayoutGrid, Lock, LockOpen, RefreshCw, Rows3, Settings2, Share2, SkipForward, Trash2, Trophy, Users } from 'lucide-react';
import { deleteEvent } from '../../../../lib/data';
import { useMatches } from '../../../../lib/data/matches';
import { saveNightRound, updateRacketEvent, useWithPendingPoints, type RacketEvent } from '../../../../lib/data/racket';
import { formatDateLong } from '../../../../lib/format';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { racketNightComp } from '../../../../prizes/sports';
import { useBusy } from '../../../../components/busy';
import type { Match } from '../../../../lib/data/matches';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { StandingsTable, pointsResultParser, type StandingsColumn } from '../../../../components/match';
import { eventDay } from '../../../../components/event/EventHeader';
import { useIsPro } from '../../../../components/mode';
import { NoticeSlot } from '../../../../components/NoticeSlot';
import { Button, Card, Empty, ListRow, ListSkeleton, RowIcon, Segmented, SectionHeader, Sheet } from '../../../../components/ui';
import { ReportButton } from '../../../../components/tournamentReport/ReportButton';
import {
  NIGHT_MAX_PLAYERS,
  fmtPoints,
  nextNightRound,
  nightConfigJson,
  nightRounds,
  nightShareText,
  nightTable,
  parseNightConfig,
  parsePoints,
  pointsLabel,
  redoNightRound,
  roundDrafts,
  type NightConfig,
  type NextRound,
} from '../logic/night';
import { timeLabel, todayIn } from '../logic/time';
import { levelText, useLevels } from '../levels';
import { MatchDetail, useMatchParam } from '../match/MatchDetail';
import { useNames } from '../names';
import { useRacket } from '../sport';
import { NightPrizes } from './NightPrizes';
import { RankRows, appOrigin, eventTypeInfo } from '../bits';
import { ReportSheet, ScorersSheet, ScreenHead, useEventBack, useOrganizePro, type RacketMenuItem } from '../frame';
import type { SignupSettings } from '../logic/signup';
import { SignupSettingsModal } from '../signup/SignupFields';
import { SignupPanel } from '../signup/SignupPanel';
import { NightFields, NightPlayers } from './NightForm';
import { FirstRound, MyCourt, PlayersList, Podium, RestCard, RoundCourts, RoundList, SaveFooter, ShareBox } from './parts';

type Tab = 'canchas' | 'tabla' | 'rondas' | 'jugadores';
/** Lo que se está guardando: la ruedita va en ese botón y los demás esperan. */
type Pending = 'ronda' | 'rehacer' | 'cerrar' | 'cerrar-fin' | 'abrir' | 'ajustes' | 'jugadores' | 'inscripcion';
/** Las hojas de la pantalla: compartir la tabla, el reporte, los anotadores, las rondas y los jugadores. */
type SheetKey = 'compartir' | 'reporte' | 'anotadores' | 'rondas' | 'jugadores';

/** Cupo más grande de la inscripción de la noche (lo que se puede elegir a mano). */
const NIGHT_SIGNUP_MAX = NIGHT_MAX_PLAYERS;

const TABLE_COLUMNS: StandingsColumn[] = [
  { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
  { key: 'won', label: 'G', title: 'Ganados', value: (r) => r.won },
  { key: 'drawn', label: 'E', title: 'Empatados', value: (r) => r.drawn, wide: true },
  { key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost },
  { key: 'diff', label: 'Dif.', title: 'Diferencia de puntos', value: (r) => (r.diff > 0 ? `+${r.diff}` : r.diff), wide: true },
  { key: 'rests', label: 'Desc.', title: 'Descansos', value: (r) => r.extra.rests ?? 0, wide: true },
];

/**
 * La noche de Americano o Mexicano (rediseño «Calma y foco»): «‹ Pádel de los jueves» con «•••», el título y «● Ronda 1
 * de 7 · Jueves 7 oct · 7:00 pm · A 24 puntos».
 * - Jugador (Lite y Pro): arriba su cancha de la ronda («Te toca · Cancha 2 · con Ana contra Luis / Pedro») con UN
 *   botón, «Anotar en la cancha». En Lite, debajo, la ronda de ahora, «Cómo van todos» (la tabla corta) y las filas
 *   «Rondas anteriores» y «Jugadores». En Pro, Canchas · Tabla · Rondas en un segmentado, con la tabla completa.
 * - Organizador (en Pro): la ronda actual de cada cancha con «Anotar» y «Marcador», la siguiente ronda al instante,
 *   rehacer una ronda que no empezó y terminar la noche. Ajustes, jugadores, inscripción, anotadores, el reporte,
 *   compartir y borrar van en «•••». En Lite, lo de organizar se esconde con un aviso «Usar Pro».
 * Antes de empezar, la inscripción «Me apunto» (cupo, fecha límite y lista de espera) si el admin la abrió.
 */
export function NightPage({ event }: { event: RacketEvent }) {
  const { lid, base, isAdmin, league, myPlayerId } = useLeagueCtx();
  const { sport, leagueRules } = useRacket();
  const names = useNames();
  const param = useMatchParam();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const now = useNow(30_000).getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseNightConfig(event.config, event.type), [event.config, event.type]);
  const rounds = useMemo(() => nightRounds(cfg, matches, now), [cfg, matches, now]);
  const table = useMemo(() => nightTable(cfg, rounds), [cfg, rounds]);
  const pending = useBusy<Pending>();
  const busy = pending.isBusy();
  const [editing, setEditing] = useState<null | 'ajustes' | 'jugadores' | 'inscripcion'>(null);
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const pro = useIsPro();
  const back = useEventBack();
  const { levels, scale } = useLevels();
  const title = event.name || eventTypeInfo(event.type).label;
  // Lite, quien organiza: armar las rondas y poner marcadores está en Pro (el aviso de la pantalla y «•••»).
  const proItem = useOrganizePro(isAdmin && !cfg.closed, {
    id: `raqueta-noche-pro:${event.id}`,
    title: 'Organizas esta noche',
    text: 'Las rondas se arman en Pro',
    menu: 'Rondas y marcadores',
  });

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const current = rounds.at(-1) ?? null;
  const finished = cfg.closed || (!!current && current.round >= cfg.rounds && current.done);
  // Como la base: la noche empezó al publicar una ronda o al cerrarse (ya nadie se apunta ni sube de la espera).
  const started = !!current || cfg.round > 0 || cfg.closed;
  // Las herramientas del organizador en la pantalla (en Lite van con «Usar Pro»).
  const organize = isAdmin && pro;
  const requested = search.get('ver') as Tab | null;
  // Pro: Canchas · Tabla · Rondas (los jugadores, en su fila; un link viejo `?ver=jugadores` abre su hoja).
  const tab: Exclude<Tab, 'jugadores'> = requested === 'tabla' || requested === 'rondas' ? requested : 'canchas';
  const setTab = (t: Tab) => setSearch({ ver: t }, { replace: true });

  const saveConfig = (next: NightConfig, ok: string, key: Pending) =>
    pending.run(key, async () => {
      try {
        await updateRacketEvent(lid, event.id, { config: nightConfigJson(next) });
        toast(ok);
        return true;
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
        return false;
      }
    });

  const publish = async (next: NextRound, ok: string, key: Pending) => {
    if (!next.ok) {
      toast(next.reason, 'error');
      return;
    }
    await pending.run(key, async () => {
      try {
        let c = cfg;
        if (next.config) {
          c = next.config;
          await updateRacketEvent(lid, event.id, { config: nightConfigJson(c) });
        }
        const { drafts, rests } = roundDrafts(c, next.social, leagueRules);
        await saveNightRound(lid, event.id, next.round, drafts, rests);
        toast(ok);
        setTab('canchas');
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
      }
    });
  };

  const nextRound = async () => {
    const next = nextNightRound(cfg, rounds);
    if (next.ok && next.pendingPrev > 0) {
      const go = await confirm({
        title: `Faltan ${next.pendingPrev} ${next.pendingPrev === 1 ? 'partido' : 'partidos'} de la ronda ${current?.round}`,
        message: 'Los puntos cuentan cuando terminen. ¿Armar la siguiente ronda de todas formas?',
        confirmText: 'Sí, siguiente ronda',
      });
      if (!go) return;
    }
    await publish(next, next.ok ? `Ronda ${next.round} lista: a cada quien le llegó su cancha` : '', 'ronda');
  };

  const redo = async () => {
    const go = await confirm({ title: `¿Rehacer la ronda ${current?.round}?`, message: 'Se vuelve a sortear con los jugadores de ahora. Nadie ha empezado a jugar.', confirmText: 'Rehacer' });
    if (go) await publish(redoNightRound(cfg, rounds, Date.now().toString(36)), 'Ronda rehecha', 'rehacer');
  };

  const closeNight = async (closed: boolean, key: Pending) => {
    if (closed && !(await confirm({ title: '¿Terminar la noche?', message: 'Queda la tabla final. Se puede volver a abrir.', confirmText: 'Terminar la noche' }))) return;
    await saveConfig({ ...cfg, closed }, closed ? 'Noche terminada' : 'Noche abierta otra vez', key);
  };

  const remove = async () => {
    if (!(await confirm({ title: `¿Borrar ${title}?`, message: 'Se borran sus rondas y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    navigate(base);
    try {
      await deleteEvent(lid, event.id);
      toast('Noche borrada');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };

  const share = nightShareText({
    title,
    date: formatDateLong(event.date),
    rows: table,
    nameOf: names.nameOf,
    points: cfg.points,
    final: finished,
    url: `${appOrigin()}${base}/e/${event.id}?ver=tabla`,
  });

  // Reporte de la noche (PDF o Excel), para todos: el podio, las rondas y la tabla que se ven aquí.
  const report = {
    report: () =>
      import('../../../../lib/report/racket').then((m) =>
        m.racketNightReport({ lid, league, event, title, cfg, rounds, table, nameOf: names.nameOf, finished, now }),
      ),
    comp: racketNightComp(lid, event, sport),
    disabled: (q.loading && !matches.length) || names.loading,
  };

  const mine = current?.matches.find((m) => [...m.side1, ...m.side2].includes(myPlayerId ?? '')) ?? null;
  const resting = !!myPlayerId && !!current?.rests.includes(myPlayerId);
  const today = todayIn(league.tz);
  const meta = [eventDay(event.date, today, pro), event.startTime ? timeLabel(event.startTime) : null, pointsLabel(cfg.points)]
    .filter(Boolean)
    .join(' · ');
  const played = table.filter((r) => r.played > 0 || r.points > 0);
  const open = (k: SheetKey) => setSheet(k);
  const first = nextNightRound(cfg, []);
  // El marcador de un partido de la ronda: los puntos de cada lado (con lo que suman, si es a un total).
  const pointsEntry = (m: Match) => {
    const pts = parsePoints((m.rules as Record<string, unknown> | undefined)?.points);
    return { parser: pointsResultParser(pts), placeholder: '14-10', hint: pts.mode === 'total' ? `suman ${pts.target}` : undefined };
  };

  const menu: RacketMenuItem[] = [
    { key: 'compartir', icon: Share2, label: 'Compartir la tabla', hint: 'Por WhatsApp o copiada', onClick: () => open('compartir') },
    { key: 'reporte', icon: FileDown, label: 'Reporte de la noche', hint: 'PDF para WhatsApp o imprimir, o Excel', onClick: () => open('reporte') },
    ...(proItem ? [proItem] : []),
    ...(isAdmin
      ? [
          { key: 'ajustes', icon: Settings2, label: 'Ajustes de la noche', hint: 'Canchas, puntos, rondas y descansos', onClick: () => setEditing('ajustes') },
          { key: 'jugadores', icon: Users, label: 'Jugadores', hint: 'Quién llega tarde o se va', onClick: () => setEditing('jugadores') },
          ...(!started ? [{ key: 'inscripcion', icon: ClipboardList, label: 'Inscripción', hint: 'Me apunto, cupo y lista de espera', onClick: () => setEditing('inscripcion') }] : []),
          ...(cfg.closed
            ? [{ key: 'abrir', icon: LockOpen, label: 'Volver a abrir la noche', onClick: () => void closeNight(false, 'abrir'), busy: pending.isBusy('abrir') }]
            : current
              ? [{ key: 'cerrar', icon: Lock, label: 'Terminar la noche', hint: 'Queda la tabla final', onClick: () => void closeNight(true, 'cerrar'), busy: pending.isBusy('cerrar') }]
              : []),
          { key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota esta noche', onClick: () => open('anotadores') },
          { key: 'borrar', icon: Trash2, label: 'Borrar la noche', onClick: () => void remove(), danger: true },
        ]
      : []),
  ];

  // Las canchas de la ronda de ahora (o, antes de empezar, la ronda 1 para el organizador o el aviso para los demás).
  const courts =
    q.loading && !matches.length ? (
      <ListSkeleton rows={2} />
    ) : !current ? (
      <FirstRound
        organize={organize}
        summary={`${cfg.players.length} jugadores en ${cfg.courts.length} ${cfg.courts.length === 1 ? 'cancha' : 'canchas'} · ${cfg.rounds} rondas · ${
          cfg.format === 'mexicano' ? (cfg.firstRound === 'level' ? 'la 1 por nivel' : 'la 1 al azar') : 'sin repetir compañero'
        }`}
        problem={first.ok ? null : first.reason}
        note={cfg.signup?.open ? 'Al empezar la ronda 1 se cierra la inscripción.' : null}
        busy={pending.isBusy('ronda')}
        onStart={() => void nextRound()}
        onPlayers={() => setEditing('jugadores')}
      />
    ) : (
      <div className="flex flex-col gap-4">
        {finished && <Podium table={table} nameOf={names.nameOf} value={(r) => fmtPoints(r.points)} onShare={() => open('compartir')} />}
        <RoundCourts round={current} organize={organize} entry={pointsEntry} onOpen={param.open} onScore={param.openCourt} />
        {organize && !cfg.closed && (
          <div className="flex flex-col gap-2.5">
            {current.round < cfg.rounds && (
              <Button variant="primary" size="lg" className="w-full" loading={pending.isBusy('ronda')} disabled={busy} icon={<SkipForward className="size-5" />} onClick={() => void nextRound()}>
                Siguiente ronda ({current.round + 1} de {cfg.rounds})
              </Button>
            )}
            {current.round >= cfg.rounds && current.done && (
              <Button variant="primary" size="lg" className="w-full" loading={pending.isBusy('cerrar-fin')} disabled={busy} icon={<Flag className="size-5" />} onClick={() => void closeNight(true, 'cerrar-fin')}>
                Terminar la noche
              </Button>
            )}
            {!current.started && (
              <Button variant="quiet" size="lg" className="w-full" loading={pending.isBusy('rehacer')} disabled={busy} icon={<RefreshCw className="size-4" />} onClick={() => void redo()}>
                Rehacer la ronda
              </Button>
            )}
          </div>
        )}
      </div>
    );

  // Las filas de abajo: lo que se mira de vez en cuando (en hojas).
  const rows = (
    <Card className="overflow-hidden">
      {!pro && rounds.length > 1 && (
        <ListRow
          leading={
            <RowIcon>
              <Rows3 className="size-5" />
            </RowIcon>
          }
          title="Rondas anteriores"
          subtitle={`${rounds.length - 1} ${rounds.length - 1 === 1 ? 'ronda' : 'rondas'}`}
          onClick={() => open('rondas')}
        />
      )}
      <ListRow
        leading={
          <RowIcon>
            <Users className="size-5" />
          </RowIcon>
        }
        title={`Jugadores (${cfg.players.length})`}
        subtitle={`${cfg.courts.length} ${cfg.courts.length === 1 ? 'cancha' : 'canchas'} · ${cfg.rounds} rondas`}
        onClick={() => open('jugadores')}
        dense={pro}
      />
    </Card>
  );

  return (
    <div className="flex flex-col px-2">
      <ScreenHead
        back={back}
        title={title}
        status={finished ? { text: 'Terminada' } : current ? { text: `Ronda ${current.round} de ${cfg.rounds}`, live: true } : { text: eventTypeInfo(cfg.format).label }}
        meta={meta}
        menu={menu}
      />

      {cfg.signup && !started && (
        <SignupPanel
          event={event}
          settings={cfg.signup}
          lists={[{ category: null, name: null, listed: cfg.players }]}
          started={started}
          onEdit={isAdmin ? () => setEditing('inscripcion') : undefined}
          className="mt-[22px]"
        />
      )}

      {mine && !finished && <MyCourt match={mine.match} round={current!.round} onOpen={() => param.open(mine.id)} onScore={() => param.openCourt(mine.id)} className="mt-[22px]" />}
      {resting && !finished && <RestCard round={current!.round} text="Sumas lo que dicen las reglas de la noche." className="mt-[22px]" />}

      {/* Terminada la noche, el admin tiene el reporte a la mano (para todos está en «•••»). */}
      {organize && finished && rounds.length > 0 && <ReportButton {...report} look="card" className="mt-[22px]" />}

      {pro ? (
        <>
          <Segmented
            full
            label="Qué ver de la noche"
            className="mt-[22px]"
            options={[
              { key: 'canchas' as const, label: 'Canchas', icon: <LayoutGrid aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
              { key: 'tabla' as const, label: 'Tabla', icon: <Trophy aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
              { key: 'rondas' as const, label: 'Rondas', icon: <Rows3 aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div key={tab} className="animate-fade-up mt-4 flex flex-col gap-4">
            {tab === 'canchas' && courts}
            {tab === 'tabla' && (
              <>
                <StandingsTable
                  rows={played}
                  nameOf={names.nameOf}
                  columns={TABLE_COLUMNS}
                  highlight={myPlayerId ? [myPlayerId] : []}
                  primary={['puntos']}
                  empty="Cuando termine el primer partido, sale la tabla."
                />
                <p className="mx-1 text-[12.5px] leading-[1.4] text-muted">
                  Orden: puntos, partidos ganados y diferencia.{cfg.rest !== 'none' && ' Quien descansa suma según las reglas.'}
                </p>
              </>
            )}
            {tab === 'rondas' && (rounds.length ? rounds.slice().reverse().map((r) => <RoundList key={r.round} round={r} onOpen={param.open} />) : <Empty title="Todavía no hay rondas" />)}
          </div>
          <div className="mt-[30px]">{rows}</div>
        </>
      ) : (
        <>
          <div className="mt-[30px]">{courts}</div>
          {played.length > 0 && (
            <section className="mt-[30px]" aria-labelledby="noche-todos">
              <SectionHeader id="noche-todos" title="Cómo van todos" />
              <RankRows
                rows={played}
                nameOf={names.nameOf}
                value={(id) => fmtPoints(played.find((r) => r.id === id)?.points ?? 0)}
                sub={(id) => {
                  const r = played.find((x) => x.id === id);
                  return r ? `${r.played} ${r.played === 1 ? 'partido' : 'partidos'} · ${r.won} G` : null;
                }}
                highlight={myPlayerId ? [myPlayerId] : []}
              />
              <p className="mx-1 mt-2.5 text-[12.5px] leading-[1.4] text-muted">Puntos de cada uno · se actualiza al terminar cada partido</p>
            </section>
          )}
          <div className="mt-[30px]">{rows}</div>
        </>
      )}

      {/* El único aviso de la pantalla, al final (como en la práctica del boliche). */}
      {/* Los premios de la noche, al final (se eligen y se entregan; no son de todos los días). */}
      <div className="mt-[30px] empty:hidden">
        <NightPrizes event={event} table={table} finished={finished} nameOf={names.nameOf} />
      </div>

      <NoticeSlot className="mt-4" />

      <Sheet open={sheet === 'compartir'} onClose={() => setSheet(null)} title="Compartir la tabla" subtitle={title}>
        {sheet === 'compartir' && <ShareBox text={share} />}
      </Sheet>
      <Sheet open={sheet === 'rondas'} onClose={() => setSheet(null)} title="Rondas" subtitle={title}>
        <div className="flex flex-col gap-3 pb-1">
          {rounds
            .slice()
            .reverse()
            .map((r) => (
              <RoundList
                key={r.round}
                round={r}
                onOpen={(id) => {
                  setSheet(null);
                  param.open(id);
                }}
              />
            ))}
        </div>
      </Sheet>
      <Sheet
        open={sheet === 'jugadores' || requested === 'jugadores'}
        onClose={() => {
          setSheet(null);
          if (requested === 'jugadores') setTab('canchas');
        }}
        title={`Jugadores (${cfg.players.length})`}
        subtitle={title}
        footer={
          isAdmin ? (
            <Button
              variant="quiet"
              size="lg"
              className="w-full"
              icon={<Users className="size-4" />}
              onClick={() => {
                setSheet(null);
                setEditing('jugadores');
              }}
            >
              Cambiar jugadores
            </Button>
          ) : undefined
        }
      >
        <PlayersList
          ids={cfg.players}
          sub={(id) => (levels[id] != null ? levelText(levels[id], scale) : null)}
          value={(id) => {
            const r = table.find((x) => x.id === id);
            return r ? `${fmtPoints(r.points)} pts` : null;
          }}
        />
      </Sheet>
      {sheet === 'reporte' && <ReportSheet open onClose={() => setSheet(null)} report={report.report} comp={report.comp ?? null} />}
      {sheet === 'anotadores' && (
        <ScorersSheet
          open
          onClose={() => setSheet(null)}
          target={{ scope: 'evento', refId: event.id, title: event.name || (league.kind === 'torneo' ? league.name : title) }}
          participants={cfg.players}
        />
      )}

      <SettingsModal open={editing === 'ajustes'} cfg={cfg} busy={pending.isBusy('ajustes')} disabled={busy} onClose={() => setEditing(null)} onSave={async (c) => (await saveConfig(c, 'Guardado', 'ajustes')) && setEditing(null)} />
      <PlayersModal open={editing === 'jugadores'} cfg={cfg} busy={pending.isBusy('jugadores')} disabled={busy} onClose={() => setEditing(null)} onSave={async (c) => (await saveConfig(c, 'Jugadores guardados', 'jugadores')) && setEditing(null)} />
      {isAdmin && (
        <SignupSettingsModal
          open={editing === 'inscripcion'}
          value={cfg.signup ?? null}
          busy={pending.isBusy('inscripcion')}
          disabled={busy}
          unit={['jugador', 'jugadores']}
          defaultCap={Math.max(4, cfg.courts.length * 4)}
          maxCap={NIGHT_SIGNUP_MAX}
          tz={league.tz}
          onClose={() => setEditing(null)}
          onSave={async (s: SignupSettings | null) =>
            (await saveConfig(s ? { ...cfg, signup: s } : cfg, s?.open ? 'Inscripción abierta' : 'Inscripción cerrada', 'inscripcion')) && setEditing(null)
          }
        />
      )}
    </div>
  );
}

/** `busy`: se está guardando esto (la ruedita); `disabled`: hay otra cosa guardándose (Guardar espera sin ruedita). */
function SettingsModal({
  open,
  cfg,
  busy,
  disabled,
  onClose,
  onSave,
}: {
  open: boolean;
  cfg: NightConfig;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onSave: (c: NightConfig) => void;
}) {
  const [draft, setDraft] = useState(cfg);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setDraft(cfg);
  }
  const changedPlan = draft.courts.length !== cfg.courts.length || draft.rounds !== cfg.rounds;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ajustes de la noche"
      subtitle="Valen desde la ronda que sigue"
      footer={
        <SaveFooter
          onClose={onClose}
          busy={busy}
          disabled={disabled}
          onSave={() => onSave(changedPlan ? { ...draft, courts: draft.courts.map((c, i) => c.trim() || `Cancha ${i + 1}`), plan: undefined, planPlayers: undefined, planFrom: undefined } : draft)}
        />
      }
    >
      <NightFields value={draft} onChange={setDraft} />
    </Sheet>
  );
}

function PlayersModal({
  open,
  cfg,
  busy,
  disabled,
  onClose,
  onSave,
}: {
  open: boolean;
  cfg: NightConfig;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onSave: (c: NightConfig) => void;
}) {
  const { levels } = useLevels();
  const [players, setPlayers] = useState(cfg.players);
  // La versión de la lista que se abrió: si alguien se apunta mientras tanto, la base no lo pierde al guardar.
  const [rev, setRev] = useState(cfg.signup?.rev ?? 0);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setPlayers(cfg.players);
      setRev(cfg.signup?.rev ?? 0);
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Jugadores de la noche"
      subtitle="Los cambios valen desde la ronda que sigue"
      footer={
        <SaveFooter
          onClose={onClose}
          busy={busy}
          disabled={disabled || (players.length < 4 && !cfg.signup)}
          onSave={() => {
            const lv = { ...cfg.levels };
            for (const p of players) if (levels[p] != null) lv[p] = levels[p];
            onSave({ ...cfg, players, levels: lv, ...(cfg.signup ? { signup: { ...cfg.signup, rev } } : {}) });
          }}
        />
      }
    >
      <NightPlayers value={players} onChange={setPlayers} levels={levels} />
    </Sheet>
  );
}
