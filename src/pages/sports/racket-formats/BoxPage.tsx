import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, Boxes, CalendarCheck2, FileSpreadsheet, History, RefreshCw, Settings2, Trash2, Users } from 'lucide-react';
import { deleteEvent } from '../../../lib/data';
import { useMatches, type Match } from '../../../lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { isGameSport } from '../../../sports/racket/rules';
import type { StandingRow } from '../../../sports/types';
import { useBusy } from '../../../components/busy';
import { useFeedback, saveErrorMessage } from '../../../components/feedback';
import { MatchCard, StandingsTable, type StandingsColumn } from '../../../components/match';
import { useIsPro } from '../../../components/mode';
import { NoticeSlot } from '../../../components/NoticeSlot';
import { Badge, Button, Card, Empty, ListRow, ListSkeleton, RowIcon, Segmented, SectionHeader, Sheet, cx } from '../../../components/ui';
import { FinePrint, PickList, choiceClass, racketColumns } from '../racket/bits';
import { ScreenHead, useEventBack, useOrganizePro, type RacketMenuItem } from '../racket/frame';
import { levelText, useLevels } from '../racket/levels';
import { exportCompetitionExcel } from '../racket/excel';
import { forLabel, seasonPlayerTable, setsLabel } from '../racket/logic/results';
import { tiebreakText } from '../racket/logic/tiebreaks';
import { todayIn } from '../racket/logic/time';
import { MatchDetail, useMatchParam, useMySide } from '../racket/match/MatchDetail';
import { SaveFooter } from '../racket/night/parts';
import { useNames } from '../racket/names';
import { courtWords, useRacket } from '../racket/sport';
import { BoxRulesFields } from './BoxForm';
import { saveBoxMonth } from './data';
import {
  boxConfigJson,
  boxName,
  boxTables,
  closeMonth,
  entrantLevel,
  firstBoxes,
  monthDrafts,
  monthMatches,
  monthProgress,
  moveText,
  nextMonthRange,
  openMonth,
  parseBoxConfig,
  type BoxConfig,
  type BoxMonth,
  type CloseResult,
} from './logic/box';

type Tab = 'cajas' | 'historial' | 'participantes';
/** Lo que se está guardando: la ruedita va en ese botón y los demás esperan. */
type Pending = 'primero' | 'rehacer' | 'cerrar' | 'config';

/**
 * Liga por cajas (rediseño «Calma y foco»): «‹ Tenis del sábado» con «•••», el título y «● Octubre 2026 · 8 jugadores ·
 * suben 2 y bajan 2». Arriba, cómo va el mes (partidos jugados con su barra y cuándo se cierra; quien organiza, en Pro,
 * lo cierra desde ahí: anula lo no jugado, guarda subidas y bajadas y abre el siguiente con sus partidos). Debajo las
 * cajas (la mía primero) con su tabla, quién sube y quién baja si el mes cerrara hoy, y sus partidos. Lite: los meses
 * cerrados y los participantes en filas; Pro: Cajas · Meses · Jugadores. Rehacer el mes, participantes, reglas, Excel y
 * borrar van en «•••».
 */
export function BoxPage({ event }: { event: RacketEvent }) {
  const { lid, base, isAdmin, league, myPlayerId } = useLeagueCtx();
  const { sport, ext, leagueRules } = useRacket();
  const names = useNames();
  const param = useMatchParam();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const now = useNow(60_000).getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseBoxConfig(event.config), [event.config]);
  const month = openMonth(cfg) ?? cfg.months.at(-1) ?? null;
  const tables = useMemo(() => (month ? boxTables(sport, month, matches, { scheme: cfg.points, now, lotSeed: event.id }) : []), [sport, month, matches, cfg.points, now, event.id]);
  const preview = useMemo(() => (month && !month.closed ? closeMonth(cfg, month, tables) : null), [cfg, month, tables]);
  const pending = useBusy<Pending>();
  const busy = pending.isBusy();
  // El Excel va aparte: mientras se arma no detiene lo demás.
  const exporting = useBusy();
  const [editing, setEditing] = useState<null | 'cerrar' | 'participantes' | 'reglas'>(null);
  const [sheet, setSheet] = useState<'historial' | 'participantes' | null>(null);
  const { levels } = useLevels();
  const pro = useIsPro();
  const back = useEventBack();
  const title = event.name || 'Liga por cajas';
  const mine = [...(myPlayerId ? [myPlayerId] : []), ...names.teamsOf(myPlayerId)];
  const proItem = useOrganizePro(isAdmin, {
    id: `raqueta-cajas-pro:${event.id}`,
    title: 'Organizas las cajas',
    text: 'El mes se arma y se cierra en Pro',
    menu: month && !month.closed ? 'Cerrar el mes' : 'Armar el mes',
  });

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const tab: Tab = (search.get('ver') as Tab | null) ?? 'cajas';
  const setTab = (t: Tab) => setSearch({ ver: t }, { replace: true });
  const matchRules = { ...leagueRules, match: { ...((leagueRules.match as Record<string, unknown> | undefined) ?? {}), doubles: cfg.doubles } };
  const started = month ? monthMatches(matches, month.n).some((m) => m.status !== 'scheduled' || m.seq > 0) : false;
  const organize = isAdmin && pro;

  const openFirst = () =>
    pending.run('primero', async () => {
      try {
        const boxes = firstBoxes(cfg.entrants.map((id) => names.entrant(id)), levels, cfg.rules);
        const r = nextMonthRange(null, todayIn(league.tz));
        await saveBoxMonth(lid, event.id, { month: 1, boxes, drafts: monthDrafts(boxes, names.entrant, { rules: matchRules }), label: r.label, start: r.start, end: r.end });
        toast('Mes armado: a cada quien le tocan sus partidos');
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
      }
    });

  const redoMonth = async () => {
    if (!month) return;
    if (!(await confirm({ title: `¿Rehacer ${month.label || `el mes ${month.n}`}?`, message: 'Se arman las cajas otra vez con los participantes de ahora (nadie ha jugado).', confirmText: 'Rehacer' }))) return;
    await pending.run('rehacer', async () => {
      try {
        const boxes = month.n === 1 ? firstBoxes(cfg.entrants.map((id) => names.entrant(id)), levels, cfg.rules) : month.boxes;
        await saveBoxMonth(lid, event.id, { month: month.n, boxes, drafts: monthDrafts(boxes, names.entrant, { rules: matchRules }), label: month.label, start: month.start, end: month.end });
        toast('Mes rehecho');
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
      }
    });
  };

  const closeAndOpen = async (result: CloseResult) => {
    if (!month) return;
    await pending.run('cerrar', async () => {
      try {
        const r = nextMonthRange(month.end, todayIn(league.tz));
        await saveBoxMonth(lid, event.id, {
          month: month.n + 1,
          boxes: result.boxes,
          drafts: monthDrafts(result.boxes, names.entrant, { rules: matchRules }),
          moves: result.moves,
          label: r.label,
          start: r.start,
          end: r.end,
        });
        toast(`${r.label}: cajas y partidos listos`);
        setEditing(null);
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
      }
    });
  };

  const saveConfig = (next: BoxConfig, ok: string) =>
    pending.run('config', async () => {
      try {
        await updateRacketEvent(lid, event.id, { config: boxConfigJson(next) });
        toast(ok);
        setEditing(null);
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
      }
    });

  const remove = async () => {
    if (!(await confirm({ title: `¿Borrar ${title}?`, message: 'Se borran sus meses, partidos y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    navigate(base);
    try {
      await deleteEvent(lid, event.id);
      toast('Liga por cajas borrada');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };

  const excel = (m: BoxMonth) =>
    exporting.run('excel', () =>
      exportCompetitionExcel({
        title: `${title} · ${m.label || `Mes ${m.n}`}`,
        date: m.start ?? event.date,
        matches: monthMatches(matches, m.n),
        tables: m.boxes.map((_, b) => ({ name: boxName(b), rows: tables[b] ?? [] })),
        players: seasonPlayerTable(monthMatches(matches, m.n), { sport, rosterOf: names.rosterOf, now }),
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

  const progress = month ? monthProgress(month, matches, tables, cfg.rules, now) : null;
  const myBox = month ? month.boxes.findIndex((b) => b.some((id) => mine.includes(id))) : -1;
  const order = month ? [...month.boxes.keys()].sort((a, b) => (a === myBox ? -1 : b === myBox ? 1 : a - b)) : [];
  const unit = cfg.doubles ? 'parejas' : 'jugadores';
  const meta = [`${cfg.entrants.length} ${unit}`, `suben ${cfg.rules.up} y bajan ${cfg.rules.down}`, pro ? `cajas de ${cfg.rules.min} a ${cfg.rules.max}` : null].filter(Boolean).join(' · ');
  const menu: RacketMenuItem[] = [
    ...(proItem ? [proItem] : []),
    ...(isAdmin && month ? [{ key: 'excel', icon: FileSpreadsheet, label: 'Excel', hint: 'Las cajas y los partidos del mes', onClick: () => void excel(month), busy: exporting.isBusy(), keep: true }] : []),
    ...(organize && month && !month.closed && !started
      ? [{ key: 'rehacer', icon: RefreshCw, label: 'Rehacer el mes', hint: 'Nadie ha jugado todavía', onClick: () => void redoMonth(), busy: pending.isBusy('rehacer') }]
      : []),
    ...(isAdmin
      ? [
          { key: 'participantes', icon: Users, label: 'Participantes', hint: 'Entran y salen al cerrar el mes', onClick: () => setEditing('participantes') },
          { key: 'reglas', icon: Settings2, label: 'Reglas de las cajas', hint: 'Tamaños, subidas y bajadas', onClick: () => setEditing('reglas') },
          { key: 'borrar', icon: Trash2, label: 'Borrar la liga por cajas', onClick: () => void remove(), danger: true },
        ]
      : []),
  ];

  const boxesView =
    q.loading && !matches.length ? (
      <ListSkeleton rows={3} />
    ) : (
      month && (
        <div className="flex flex-col gap-[30px]">
          {order.map((b) => (
            <BoxCard key={b} b={b} month={month} rows={tables[b] ?? []} matches={matches} preview={preview} mine={mine} onOpen={param.open} last={b === month.boxes.length - 1} minToStay={cfg.rules.minToStay} />
          ))}
          <FinePrint>{tiebreakText(sport)} ↑ sube y ↓ baja si el mes cerrara hoy. Un resultado por confirmar cuenta a las 48 h.</FinePrint>
        </div>
      )
    );

  return (
    <div className="flex flex-col px-2">
      <ScreenHead back={back} title={title} status={month && !month.closed ? { text: month.label || `Mes ${month.n}`, live: true } : null} meta={meta} menu={menu} />

      {!month ? (
        <div className="mt-[22px]">
          {organize ? (
            <Card className="px-5 pt-[18px] pb-5">
              <p className="text-card-title-pro">Armar el primer mes</p>
              <p className="mt-1.5 text-meta text-fg-2">
                {cfg.entrants.length} {unit}. Las cajas salen por nivel y cada caja juega todos contra todos.
              </p>
              <Button variant="primary" size="xl" className="mt-4 w-full" loading={pending.isBusy('primero')} disabled={cfg.entrants.length < 2 || busy} onClick={() => void openFirst()}>
                Armar el mes
              </Button>
            </Card>
          ) : (
            <Empty icon={<Boxes className="size-8" />} title="Todavía no empieza">
              Cuando se arme el primer mes, aquí sale tu caja y tus partidos.
            </Empty>
          )}
        </div>
      ) : (
        <>
          {progress && !month.closed && (
            <MonthCard month={month} done={progress.done} total={progress.total} minToStay={cfg.rules.minToStay} onClose={organize ? () => setEditing('cerrar') : undefined} className="mt-[22px]" />
          )}
          {pro ? (
            <>
              <Segmented
                full
                label="Qué ver de las cajas"
                className="mt-[22px]"
                options={[
                  { key: 'cajas' as Tab, label: 'Cajas', icon: <Boxes aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
                  { key: 'historial' as Tab, label: 'Meses', icon: <History aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
                  { key: 'participantes' as Tab, label: cfg.doubles ? 'Parejas' : 'Jugadores', icon: <Users aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
                ]}
                value={tab}
                onChange={setTab}
              />
              <div key={tab} className="animate-fade-up mt-[22px] flex flex-col gap-4">
                {tab === 'cajas' && boxesView}
                {tab === 'historial' && <MonthsHistory cfg={cfg} />}
                {tab === 'participantes' && <Participants cfg={cfg} month={month} />}
              </div>
            </>
          ) : (
            <>
              <div className="mt-[30px]">{boxesView}</div>
              <Card className="mt-[30px] overflow-hidden">
                <ListRow
                  leading={
                    <RowIcon>
                      <History className="size-5" />
                    </RowIcon>
                  }
                  title="Meses anteriores"
                  subtitle="Quién subió y quién bajó"
                  onClick={() => setSheet('historial')}
                />
                <ListRow
                  leading={
                    <RowIcon>
                      <Users className="size-5" />
                    </RowIcon>
                  }
                  title={`${cfg.doubles ? 'Parejas' : 'Jugadores'} (${cfg.entrants.length})`}
                  subtitle="Su nivel y su caja"
                  onClick={() => setSheet('participantes')}
                />
              </Card>
            </>
          )}
        </>
      )}

      <NoticeSlot className="mt-4" />

      <Sheet open={sheet === 'historial'} onClose={() => setSheet(null)} title="Meses anteriores" subtitle={title}>
        {sheet === 'historial' && (
          <div className="pb-1">
            <MonthsHistory cfg={cfg} />
          </div>
        )}
      </Sheet>
      <Sheet open={sheet === 'participantes'} onClose={() => setSheet(null)} title={cfg.doubles ? 'Parejas' : 'Jugadores'} subtitle={title}>
        {sheet === 'participantes' && month && (
          <div className="pb-1">
            <Participants cfg={cfg} month={month} />
          </div>
        )}
      </Sheet>

      {editing === 'cerrar' && month && preview && (
        <CloseModal month={month} preview={preview} pending={(progress?.total ?? 0) - (progress?.done ?? 0)} busy={pending.isBusy('cerrar')} disabled={busy} onClose={() => setEditing(null)} onConfirm={() => void closeAndOpen(preview)} />
      )}
      {editing === 'participantes' && <ParticipantsModal cfg={cfg} busy={pending.isBusy('config')} disabled={busy} onClose={() => setEditing(null)} onSave={(c) => void saveConfig(c, 'Participantes guardados')} />}
      {editing === 'reglas' && <RulesModal cfg={cfg} busy={pending.isBusy('config')} disabled={busy} onClose={() => setEditing(null)} onSave={(c) => void saveConfig(c, 'Reglas guardadas')} />}
    </div>
  );
}

/** Cómo va el mes: «Octubre 2026 · 1 de 12 partidos jugados» con su barra, cuándo se cierra y (quien organiza) «Cerrar el mes». */
function MonthCard({ month, done, total, minToStay, onClose, className }: { month: BoxMonth; done: number; total: number; minToStay: number; onClose?: () => void; className?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <Card soft className={cx('px-5 pt-[18px] pb-5', className)}>
      <p className="text-sm font-semibold text-accent">{month.label || `Mes ${month.n}`}</p>
      <p className="mt-1 text-card-title-pro">
        <span className="num">{done}</span> de <span className="num">{total}</span> partidos jugados
      </p>
      <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded bg-accent/16">
        <div className="h-full rounded bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2.5 text-[13.5px] text-fg-2">
        {month.end ? `Se cierra el ${month.end.split('-').reverse().slice(0, 2).join('/')} · ` : ''}con menos de {minToStay} partidos se baja
      </p>
      {onClose && (
        <Button variant="primary" size="lg" className="mt-4 w-full" icon={<CalendarCheck2 className="size-5" />} onClick={onClose}>
          Cerrar el mes
        </Button>
      )}
    </Card>
  );
}

/** Una caja: su tabla (con ↑ y ↓ de lo que pasaría hoy) y sus partidos. */
function BoxCard({
  b,
  month,
  rows,
  matches,
  preview,
  mine,
  onOpen,
  last,
  minToStay,
}: {
  b: number;
  month: BoxMonth;
  rows: StandingRow[];
  matches: readonly Match[];
  preview: CloseResult | null;
  mine: string[];
  onOpen: (id: string) => void;
  last: boolean;
  minToStay: number;
}) {
  const { league } = useLeagueCtx();
  const { sport } = useRacket();
  const pro = useIsPro();
  const names = useNames();
  const mySideOf = useMySide();
  const now = useNow(60_000).getTime();
  const list = monthMatches(matches, month.n).filter((m) => m.stage === boxName(b));
  const moveOf = new Map((preview?.moves ?? []).map((m) => [m.id, m] as const));
  const isMine = month.boxes[b].some((id) => mine.includes(id));
  // Lite: PJ, G y P; Pro: también la diferencia de sets o juegos y la de juegos o puntos (en la computadora: en el
  // teléfono no caben con la flecha de sube o baja y el nombre se cortaría).
  const base = racketColumns(sport)
    .filter((c) => c.key !== 'for' && c.key !== 'against' && (pro || ['played', 'won', 'lost'].includes(c.key)))
    .map((c) => (c.key === 'sets' || c.key === 'diff' ? { ...c, wide: true } : c));
  const columns: StandingsColumn[] = [
    ...base,
    {
      key: 'mv',
      label: '',
      title: 'Si el mes cerrara hoy',
      value: (r) => {
        const mv = moveOf.get(r.id);
        if (mv?.move === 'sube') return <ArrowUp className="inline size-4 text-accent" aria-label="sube" />;
        if (mv?.move === 'baja') return <ArrowDown className={cx('inline size-4', mv.reason ? 'text-muted' : 'text-danger')} aria-label={mv.reason ? 'baja por pocos partidos' : 'baja'} />;
        return '';
      },
    },
  ];
  return (
    <section aria-labelledby={`caja-${b}`}>
      <SectionHeader id={`caja-${b}`} title={<span className={cx(isMine && 'text-accent')}>{`${boxName(b)}${isMine ? ' · tu caja' : ''}`}</span>} />
      <StandingsTable rows={rows} nameOf={names.entrantName} columns={columns} highlight={mine} empty="Sin partidos confirmados todavía." />
      {!last && rows.some((r) => r.played < minToStay) && <p className="mx-1 mt-2.5 text-[12.5px] text-muted">Quien no llegue a {minToStay} partidos baja aunque gane.</p>}
      {list.length > 0 && (
        <details className="group mt-1.5" open={isMine}>
          <summary className="mx-1 inline-flex min-h-11 cursor-pointer list-none items-center text-meta font-semibold text-accent [&::-webkit-details-marker]:hidden">
            Partidos de la caja ({list.length})
          </summary>
          <div className="mt-1 grid gap-2.5 sm:grid-cols-2">
            {list.map((m) => (
              <MatchCard key={m.id} match={m} mySide={mySideOf(m)} onClick={() => onOpen(m.id)} tz={league.tz} now={now} roundWord="Mes" />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function MonthsHistory({ cfg }: { cfg: BoxConfig }) {
  const names = useNames();
  const closed = cfg.months.filter((m) => m.closed).reverse();
  if (!closed.length) return <Empty icon={<History className="size-8" />} title="Todavía no se ha cerrado ningún mes" />;
  return (
    <div className="flex flex-col gap-3">
      {closed.map((m) => {
        const up = m.moves.filter((x) => x.move === 'sube');
        const down = m.moves.filter((x) => x.move === 'baja');
        const fresh = m.moves.filter((x) => x.move === 'nuevo');
        return (
          <Card key={m.n} className="flex flex-col gap-1.5 px-5 py-4 text-[15px]">
            <p className="text-[17px] font-[650]">{m.label || `Mes ${m.n}`}</p>
            {up.length > 0 && (
              <p>
                <ArrowUp aria-hidden="true" className="inline size-4 text-accent" /> Subieron: {up.map((x) => `${names.entrantName(x.id)} (${boxName(x.to)})`).join(', ')}
              </p>
            )}
            {down.length > 0 && (
              <p>
                <ArrowDown aria-hidden="true" className="inline size-4 text-danger" /> Bajaron: {down.map((x) => `${names.entrantName(x.id)}${x.reason ? ' (pocos partidos)' : ''}`).join(', ')}
              </p>
            )}
            {fresh.length > 0 && <p className="text-muted">Entraron: {fresh.map((x) => names.entrantName(x.id)).join(', ')}</p>}
            {m.archived ? <p className="text-muted">De este mes ya no se guarda quién subió y quién bajó.</p> : !m.moves.length && <p className="text-muted">Sin cambios.</p>}
          </Card>
        );
      })}
    </div>
  );
}

function Participants({ cfg, month }: { cfg: BoxConfig; month: BoxMonth }) {
  const names = useNames();
  const { levels, scale } = useLevels();
  const boxOf = new Map(month.boxes.flatMap((b, i) => b.map((id) => [id, i] as const)));
  return (
    <Card className="overflow-hidden">
      {cfg.entrants.map((id) => {
        const lv = entrantLevel(names.entrant(id), levels);
        const b = boxOf.get(id);
        return (
          <ListRow
            key={id}
            dense
            title={names.entrantName(id)}
            subtitle={lv != null ? levelText(lv, scale) : undefined}
            trailing={<Badge tone={b == null ? 'neutral' : 'accent'}>{b == null ? 'Entra el mes que viene' : boxName(b)}</Badge>}
          />
        );
      })}
    </Card>
  );
}

/** `busy`: se está guardando esto (la ruedita); `disabled`: hay otra cosa guardándose (espera sin ruedita). */
function CloseModal({
  month,
  preview,
  pending,
  busy,
  disabled,
  onClose,
  onConfirm,
}: {
  month: BoxMonth;
  preview: CloseResult;
  pending: number;
  busy: boolean;
  disabled: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const names = useNames();
  const byId = new Map(preview.moves.map((m) => [m.id, m] as const));
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Cerrar ${month.label || `el mes ${month.n}`}`}
      subtitle="Así quedan las cajas del mes que viene"
      footer={<SaveFooter onClose={onClose} busy={busy} disabled={disabled} onSave={onConfirm} label="Cerrar y abrir el que sigue" />}
    >
      <div className="flex flex-col gap-3 pb-1">
        {pending > 0 && (
          <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
            Quedan {pending} {pending === 1 ? 'partido' : 'partidos'} sin jugar o sin confirmar: los que no han empezado quedan anulados.
          </p>
        )}
        {preview.boxes.map((box, i) => (
          <Card key={i} className="overflow-hidden">
            <p className="px-5 pt-3.5 pb-1 text-[15px] font-[650]">{boxName(i)}</p>
            {box.map((id, j) => {
              const mv = byId.get(id);
              return (
                <div key={id} className={cx('relative flex min-h-11 items-center gap-2 px-5 py-2 text-[15px]', j > 0 && "before:absolute before:top-0 before:right-0 before:left-5 before:h-px before:bg-line before:content-['']")}>
                  <span className="min-w-0 flex-1 truncate font-medium">{names.entrantName(id)}</span>
                  {mv && mv.move !== 'queda' && (
                    <span className={cx('text-[13px] font-semibold', mv.move === 'baja' ? 'text-danger' : 'text-accent')}>{moveText(mv)}</span>
                  )}
                </div>
              );
            })}
          </Card>
        ))}
      </div>
    </Sheet>
  );
}

function ParticipantsModal({ cfg, busy, disabled, onClose, onSave }: { cfg: BoxConfig; busy: boolean; disabled: boolean; onClose: () => void; onSave: (c: BoxConfig) => void }) {
  const names = useNames();
  const [picked, setPicked] = useState(cfg.entrants);
  const items = cfg.doubles
    ? names.teams.map((t) => ({ id: t.id, name: t.name, sub: t.roster.map((r) => names.nameOf(r.playerId)).join(' / ') }))
    : names.players.map((p) => ({ id: p.id, name: p.name }));
  return (
    <Sheet
      open
      onClose={onClose}
      title="Participantes"
      subtitle="Los nuevos entran en la última caja al cerrar el mes"
      footer={<SaveFooter onClose={onClose} busy={busy} disabled={picked.length < 2 || disabled} onSave={() => onSave({ ...cfg, entrants: picked })} />}
    >
      <div className="pb-1">
        <PickList items={items} selected={new Set(picked)} onToggle={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} />
      </div>
    </Sheet>
  );
}

function RulesModal({ cfg, busy, disabled, onClose, onSave }: { cfg: BoxConfig; busy: boolean; disabled: boolean; onClose: () => void; onSave: (c: BoxConfig) => void }) {
  const { sport } = useRacket();
  const [rules, setRules] = useState(cfg.rules);
  const [points, setPoints] = useState(cfg.points);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Reglas de las cajas"
      subtitle="Valen desde el próximo cierre de mes"
      footer={<SaveFooter onClose={onClose} busy={busy} disabled={disabled} onSave={() => onSave({ ...cfg, rules, points })} />}
    >
      <div className="flex flex-col gap-5 pb-1">
        <BoxRulesFields value={rules} onChange={setRules} />
        {/* Pickleball y ping pong traen sus propios puntos de tabla. */}
        {!isGameSport(sport) && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">Puntos de la tabla</span>
            <div className="flex flex-wrap gap-2">
              {(['standard', '2-0'] as const).map((k) => (
                <button key={k} type="button" aria-pressed={points === k} onClick={() => setPoints(k)} className={choiceClass(points === k)}>
                  {k === 'standard' ? 'Ganar 3, perder 1' : 'Ganar 2, perder 0'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
