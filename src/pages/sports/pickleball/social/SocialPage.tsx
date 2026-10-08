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
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { StandingsTable, type StandingsColumn } from '../../../../components/match';
import { eventDay } from '../../../../components/event/EventHeader';
import { useIsPro } from '../../../../components/mode';
import { NoticeSlot } from '../../../../components/NoticeSlot';
import { Button, Card, Empty, ListRow, ListSkeleton, RowIcon, Segmented, SectionHeader, Sheet } from '../../../../components/ui';
import { ReportButton } from '../../../../components/tournamentReport/ReportButton';
import { RankRows, Stepper, appOrigin } from '../../racket/bits';
import { ReportSheet, ScorersSheet, ScreenHead, useEventBack, useOrganizePro, type RacketMenuItem } from '../../racket/frame';
import { levelText, useLevels } from '../../racket/levels';
import { NIGHT_MAX_PLAYERS, nightRounds, type NextRound } from '../../racket/logic/night';
import type { SignupSettings } from '../../racket/logic/signup';
import { SignupSettingsModal } from '../../racket/signup/SignupFields';
import { SignupPanel } from '../../racket/signup/SignupPanel';
import { timeLabel, todayIn } from '../../racket/logic/time';
import { MatchDetail, useMatchParam } from '../../racket/match/MatchDetail';
import { useNames } from '../../racket/names';
import { NightFields, NightPlayers } from '../../racket/night/NightForm';
import { NightPrizes } from '../../racket/night/NightPrizes';
import { FirstRound, MyCourt, PlayersList, Podium, RestCard, RoundCourts, RoundList, SaveFooter, ShareBox } from '../../racket/night/parts';
import { useRacket } from '../../racket/sport';
import { GameFields, MixedGroups } from './SocialForm';
import {
  gameParser,
  gameText,
  nextSocialRound,
  parseSocialConfig,
  redoSocialRound,
  socialConfigJson,
  socialDrafts,
  socialShareText,
  socialTable,
  type SocialConfig,
} from './logic';

type Tab = 'canchas' | 'tabla' | 'rondas' | 'jugadores';
/** Lo que se está guardando: la ruedita va en ese botón y los demás esperan. */
type Pending = 'ronda' | 'rehacer' | 'cerrar' | 'cerrar-fin' | 'abrir' | 'ajustes' | 'jugadores' | 'inscripcion';
/** Las hojas de la pantalla: compartir la tabla, el reporte, los anotadores, las rondas y los jugadores. */
type SheetKey = 'compartir' | 'reporte' | 'anotadores' | 'rondas' | 'jugadores';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const TABLE_COLUMNS: StandingsColumn[] = [
  { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
  { key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost },
  { key: 'for', label: 'PF', title: 'Puntos a favor', value: (r) => r.for, wide: true },
  { key: 'against', label: 'PC', title: 'Puntos en contra', value: (r) => r.against, wide: true },
  { key: 'diff', label: 'Dif.', title: 'Diferencia de puntos', value: (r) => signed(r.diff) },
];

/**
 * Round robin social de pickleball (rediseño «Calma y foco», como la noche del pádel): compañeros que rotan cada ronda y
 * cada partido es un juego a 11 (15 o 21). Jugador: su cancha de la ronda con UN botón y, en Lite, la ronda de ahora y
 * «Cómo van todos»; en Pro, Canchas · Tabla · Rondas. Organizador (en Pro): las canchas de la ronda con «Anotar» y
 * «Marcador», la siguiente ronda, rehacer una ronda que no empezó y terminar; ajustes, jugadores, mixto, inscripción,
 * anotadores, reporte, compartir y borrar en «•••». En Lite, lo de organizar va con «Usar Pro».
 */
export function SocialPage({ event }: { event: RacketEvent }) {
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
  const cfg = useMemo(() => parseSocialConfig(event.config, event.type), [event.config, event.type]);
  const rounds = useMemo(() => nightRounds(cfg, matches, now), [cfg, matches, now]);
  const people = useMemo(() => {
    const out = new Set(cfg.players);
    for (const r of rounds) for (const m of r.matches) for (const p of [...m.side1, ...m.side2]) out.add(p);
    return [...out];
  }, [cfg.players, rounds]);
  const table = useMemo(() => socialTable(people, rounds), [people, rounds]);
  const pending = useBusy<Pending>();
  const busy = pending.isBusy();
  const [editing, setEditing] = useState<null | 'ajustes' | 'jugadores' | 'inscripcion'>(null);
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const pro = useIsPro();
  const back = useEventBack();
  const { levels, scale } = useLevels();
  const title = event.name || 'Round robin';
  const proItem = useOrganizePro(isAdmin && !cfg.closed, {
    id: `raqueta-social-pro:${event.id}`,
    title: 'Organizas este round robin',
    text: 'Las rondas se arman en Pro',
    menu: 'Rondas y marcadores',
  });

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const current = rounds.at(-1) ?? null;
  const finished = cfg.closed || (!!current && current.round >= cfg.rounds && current.done);
  // Con la primera ronda ya no se apunta nadie más (el admin sigue cambiando jugadores a mano).
  const started = !!current || cfg.round > 0 || cfg.closed;
  const organize = isAdmin && pro;
  const requested = search.get('ver') as Tab | null;
  const tab: Exclude<Tab, 'jugadores'> = requested === 'tabla' || requested === 'rondas' ? requested : 'canchas';
  const setTab = (t: Tab) => setSearch({ ver: t }, { replace: true });

  const saveConfig = (next: SocialConfig, ok: string, key: Pending) =>
    pending.run(key, async () => {
      try {
        await updateRacketEvent(lid, event.id, { config: socialConfigJson(next) });
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
          c = { ...cfg, ...next.config };
          await updateRacketEvent(lid, event.id, { config: socialConfigJson(c) });
        }
        const { drafts, rests } = socialDrafts(c, next.social, leagueRules);
        await saveNightRound(lid, event.id, next.round, drafts, rests);
        toast(ok);
        setTab('canchas');
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
      }
    });
  };

  const nextRound = async () => {
    const next = nextSocialRound(cfg, rounds);
    if (next.ok && next.pendingPrev > 0) {
      const go = await confirm({
        title: `Faltan ${next.pendingPrev} ${next.pendingPrev === 1 ? 'partido' : 'partidos'} de la ronda ${current?.round}`,
        message: 'Cuentan cuando terminen. ¿Armar la siguiente ronda de todas formas?',
        confirmText: 'Sí, siguiente ronda',
      });
      if (!go) return;
    }
    await publish(next, next.ok ? `Ronda ${next.round} lista: a cada quien le llegó su cancha` : '', 'ronda');
  };

  const redo = async () => {
    const go = await confirm({ title: `¿Rehacer la ronda ${current?.round}?`, message: 'Se vuelve a sortear con los jugadores de ahora. Nadie ha empezado a jugar.', confirmText: 'Rehacer' });
    if (go) await publish(redoSocialRound(cfg, rounds, Date.now().toString(36)), 'Ronda rehecha', 'rehacer');
  };

  const close = async (closed: boolean, key: Pending) => {
    if (closed && !(await confirm({ title: '¿Terminar el round robin?', message: 'Queda la tabla final. Se puede volver a abrir.', confirmText: 'Terminar' }))) return;
    await saveConfig({ ...cfg, closed }, closed ? 'Round robin terminado' : 'Abierto otra vez', key);
  };

  const remove = async () => {
    if (!(await confirm({ title: `¿Borrar ${title}?`, message: 'Se borran sus rondas y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    navigate(base);
    try {
      await deleteEvent(lid, event.id);
      toast('Round robin borrado');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };

  // Reporte del round robin (PDF o Excel), para todos: el podio, las rondas y la tabla que se ven aquí.
  const report = {
    report: () =>
      import('../../../../lib/report/racket').then((m) =>
        m.pickleballSocialReport({ lid, league, event, title, cfg, rounds, table, nameOf: names.nameOf, finished, now }),
      ),
    comp: racketNightComp(lid, event, sport),
    disabled: (q.loading && !matches.length) || names.loading,
  };

  const share = socialShareText({ title, date: formatDateLong(event.date), rows: table, nameOf: names.nameOf, final: finished, url: `${appOrigin()}${base}/e/${event.id}?ver=tabla` });
  const mine = current?.matches.find((m) => [...m.side1, ...m.side2].includes(myPlayerId ?? '')) ?? null;
  const resting = !!myPlayerId && !!current?.rests.includes(myPlayerId);
  const today = todayIn(league.tz);
  const meta = [eventDay(event.date, today, pro), event.startTime ? timeLabel(event.startTime) : null, gameText(cfg.game)].filter(Boolean).join(' · ');
  const played = table.filter((r) => r.played > 0);
  const first = nextSocialRound(cfg, []);
  const entry = () => ({ parser: gameParser(cfg.game), placeholder: `${cfg.game.to}-7`, examples: [`${cfg.game.to}-9`, `${cfg.game.to}-5`], hint: gameText(cfg.game) });
  const open = (k: SheetKey) => setSheet(k);
  const label = cfg.mixed ? 'Round robin mixto' : 'Round robin';

  const menu: RacketMenuItem[] = [
    { key: 'compartir', icon: Share2, label: 'Compartir la tabla', hint: 'Por WhatsApp o copiada', onClick: () => open('compartir') },
    { key: 'reporte', icon: FileDown, label: 'Reporte del round robin', hint: 'PDF para WhatsApp o imprimir, o Excel', onClick: () => open('reporte') },
    ...(proItem ? [proItem] : []),
    ...(isAdmin
      ? [
          { key: 'ajustes', icon: Settings2, label: 'Ajustes', hint: 'Canchas, rondas y el juego', onClick: () => setEditing('ajustes') },
          { key: 'jugadores', icon: Users, label: 'Jugadores y mixto', hint: 'Quién llega tarde o se va', onClick: () => setEditing('jugadores') },
          ...(!started ? [{ key: 'inscripcion', icon: ClipboardList, label: 'Inscripción', hint: 'Me apunto, cupo y lista de espera', onClick: () => setEditing('inscripcion') }] : []),
          ...(cfg.closed
            ? [{ key: 'abrir', icon: LockOpen, label: 'Volver a abrir', onClick: () => void close(false, 'abrir'), busy: pending.isBusy('abrir') }]
            : current
              ? [{ key: 'cerrar', icon: Lock, label: 'Terminar el round robin', hint: 'Queda la tabla final', onClick: () => void close(true, 'cerrar'), busy: pending.isBusy('cerrar') }]
              : []),
          { key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota este round robin', onClick: () => open('anotadores') },
          { key: 'borrar', icon: Trash2, label: 'Borrar el round robin', onClick: () => void remove(), danger: true },
        ]
      : []),
  ];

  const courts =
    q.loading && !matches.length ? (
      <ListSkeleton rows={2} />
    ) : !current ? (
      <FirstRound
        organize={organize}
        summary={`${cfg.players.length} jugadores en ${cfg.courts.length} ${cfg.courts.length === 1 ? 'cancha' : 'canchas'} · ${cfg.rounds} rondas · ${
          cfg.mixed ? 'cada pareja con uno de cada grupo' : 'sin repetir compañero'
        }`}
        problem={first.ok ? null : first.reason}
        busy={pending.isBusy('ronda')}
        onStart={() => void nextRound()}
        onPlayers={() => setEditing('jugadores')}
      />
    ) : (
      <div className="flex flex-col gap-4">
        {finished && <Podium table={table} nameOf={names.nameOf} value={(r) => `${r.won} G (${signed(r.diff)})`} onShare={() => open('compartir')} />}
        <RoundCourts round={current} organize={organize} entry={entry} onOpen={param.open} onScore={param.openCourt} />
        {organize && !cfg.closed && (
          <div className="flex flex-col gap-2.5">
            {current.round < cfg.rounds && (
              <Button variant="primary" size="lg" className="w-full" loading={pending.isBusy('ronda')} disabled={busy} icon={<SkipForward className="size-5" />} onClick={() => void nextRound()}>
                Siguiente ronda ({current.round + 1} de {cfg.rounds})
              </Button>
            )}
            {current.round >= cfg.rounds && current.done && (
              <Button variant="primary" size="lg" className="w-full" loading={pending.isBusy('cerrar-fin')} disabled={busy} icon={<Flag className="size-5" />} onClick={() => void close(true, 'cerrar-fin')}>
                Terminar el round robin
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
        subtitle={`${cfg.courts.length} ${cfg.courts.length === 1 ? 'cancha' : 'canchas'} · ${cfg.rounds} rondas${cfg.mixed ? ' · mixto' : ''}`}
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
        status={finished ? { text: 'Terminado' } : current ? { text: `Ronda ${current.round} de ${cfg.rounds}`, live: true } : { text: label }}
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
      {resting && !finished && <RestCard round={current!.round} text="En la próxima te toca." className="mt-[22px]" />}

      {/* Terminado, el admin tiene el reporte a la mano (para todos está en «•••»). */}
      {organize && finished && rounds.length > 0 && <ReportButton {...report} look="card" className="mt-[22px]" />}

      {pro ? (
        <>
          <Segmented
            full
            label="Qué ver del round robin"
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
                  pointsLabel="G"
                  primary={['partidos ganados']}
                  empty="Cuando termine el primer juego, sale la tabla."
                />
                <p className="mx-1 text-[12.5px] leading-[1.4] text-muted">Orden: partidos ganados, diferencia y puntos a favor.</p>
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
            <section className="mt-[30px]" aria-labelledby="social-todos">
              <SectionHeader id="social-todos" title="Cómo van todos" />
              <RankRows
                rows={played}
                nameOf={names.nameOf}
                value={(id) => played.find((r) => r.id === id)?.won ?? 0}
                sub={(id) => {
                  const r = played.find((x) => x.id === id);
                  return r ? `${r.played} ${r.played === 1 ? 'juego' : 'juegos'} · ${signed(r.diff)}` : null;
                }}
                highlight={myPlayerId ? [myPlayerId] : []}
              />
              <p className="mx-1 mt-2.5 text-[12.5px] leading-[1.4] text-muted">Juegos ganados · se actualiza al terminar cada juego</p>
            </section>
          )}
          <div className="mt-[30px]">{rows}</div>
        </>
      )}

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
          sub={(id) => [cfg.mixed ? `Grupo ${cfg.mixed.includes(id) ? 'A' : 'B'}` : null, levels[id] != null ? levelText(levels[id], scale) : null].filter(Boolean).join(' · ') || null}
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
          maxCap={NIGHT_MAX_PLAYERS}
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
  cfg: SocialConfig;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onSave: (c: SocialConfig) => void;
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
      title="Ajustes del round robin"
      subtitle="Valen desde la ronda que sigue"
      footer={
        <SaveFooter
          onClose={onClose}
          busy={busy}
          disabled={disabled}
          onSave={() =>
            onSave(
              changedPlan
                ? { ...draft, courts: draft.courts.map((c, i) => c.trim() || `Cancha ${i + 1}`), plan: undefined, planPlayers: undefined, planFrom: undefined }
                : draft,
            )
          }
        />
      }
    >
      <div className="flex flex-col gap-5">
        <NightFields value={draft} onChange={(c) => setDraft({ ...draft, courts: c.courts })} parts={['courts']} />
        <Stepper label="Rondas" value={draft.rounds} min={1} max={30} onChange={(rounds) => setDraft({ ...draft, rounds })} />
        <GameFields value={draft.game} onChange={(game) => setDraft({ ...draft, game })} />
      </div>
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
  cfg: SocialConfig;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onSave: (c: SocialConfig) => void;
}) {
  const { levels } = useLevels();
  const [players, setPlayers] = useState(cfg.players);
  const [mixed, setMixed] = useState(cfg.mixed);
  const [rev, setRev] = useState(cfg.signup?.rev ?? 0);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setPlayers(cfg.players);
      setMixed(cfg.mixed);
      setRev(cfg.signup?.rev ?? 0);
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Jugadores del round robin"
      subtitle="Los cambios valen desde la ronda que sigue"
      footer={
        <SaveFooter
          onClose={onClose}
          busy={busy}
          disabled={disabled || players.length < 4}
          onSave={() => {
            const lv = { ...cfg.levels };
            for (const p of players) if (levels[p] != null) lv[p] = levels[p];
            onSave({
              ...cfg,
              players,
              levels: lv,
              mixed: mixed ? mixed.filter((p) => players.includes(p)) : null,
              ...(cfg.signup ? { signup: { ...cfg.signup, rev } } : {}),
            });
          }}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <NightPlayers value={players} onChange={setPlayers} levels={levels} />
        <MixedGroups players={players} value={mixed} onChange={setMixed} />
      </div>
    </Sheet>
  );
}
