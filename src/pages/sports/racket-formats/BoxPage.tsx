import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, Boxes, CalendarCheck2, Download, History, RefreshCw, Settings2, Trash2, Users } from 'lucide-react';
import { deleteEvent } from '../../../lib/data';
import { useMatches, type Match } from '../../../lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '../../../lib/data/racket';
import { useLeagueCtx } from '../../../lib/league';
import { useNow } from '../../../lib/useNow';
import { isGameSport } from '../../../sports/racket/rules';
import type { StandingRow } from '../../../sports/types';
import { useFeedback, saveErrorMessage } from '../../../components/feedback';
import { MatchCard, StandingsTable, type StandingsColumn } from '../../../components/match';
import { Badge, Button, Card, Empty, ListSkeleton, Modal, Tabs, cx } from '../../../components/ui';
import { BackLink } from '../../../components/BackLink';
import { PickList, Section, racketColumns } from '../racket/bits';
import { levelText, useLevels } from '../racket/levels';
import { exportCompetitionExcel } from '../racket/excel';
import { forLabel, seasonPlayerTable, setsLabel } from '../racket/logic/results';
import { tiebreakText } from '../racket/logic/tiebreaks';
import { todayIn } from '../racket/logic/time';
import { MatchDetail, useMatchParam, useMySide } from '../racket/match/MatchDetail';
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

/**
 * Liga por cajas: el mes abierto con la tabla y los partidos de cada caja (mi caja primero), quién sube y quién
 * baja si el mes cerrara hoy, el historial de los meses y los participantes. El admin arma el primer mes, cierra
 * el mes (una sola llamada: anula lo no jugado, guarda subidas y bajadas y abre el siguiente con sus partidos),
 * rehace el mes si nadie empezó y cambia participantes y reglas.
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
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<null | 'cerrar' | 'participantes' | 'reglas'>(null);
  const { levels } = useLevels();
  const title = event.name || 'Liga por cajas';
  const mine = [...(myPlayerId ? [myPlayerId] : []), ...names.teamsOf(myPlayerId)];

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const tab: Tab = (search.get('ver') as Tab | null) ?? 'cajas';
  const setTab = (t: Tab) => setSearch({ ver: t }, { replace: true });
  const matchRules = { ...leagueRules, match: { ...((leagueRules.match as Record<string, unknown> | undefined) ?? {}), doubles: cfg.doubles } };
  const started = month ? monthMatches(matches, month.n).some((m) => m.status !== 'scheduled' || m.seq > 0) : false;

  const openFirst = async () => {
    setBusy(true);
    try {
      const boxes = firstBoxes(cfg.entrants.map((id) => names.entrant(id)), levels, cfg.rules);
      const r = nextMonthRange(null, todayIn(league.tz));
      await saveBoxMonth(lid, event.id, { month: 1, boxes, drafts: monthDrafts(boxes, names.entrant, { rules: matchRules }), label: r.label, start: r.start, end: r.end });
      toast('Mes armado: a cada quien le tocan sus partidos');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const redoMonth = async () => {
    if (!month) return;
    if (!(await confirm({ title: `¿Rehacer ${month.label || `el mes ${month.n}`}?`, message: 'Se arman las cajas otra vez con los participantes de ahora (nadie ha jugado).', confirmText: 'Rehacer' }))) return;
    setBusy(true);
    try {
      const boxes = month.n === 1 ? firstBoxes(cfg.entrants.map((id) => names.entrant(id)), levels, cfg.rules) : month.boxes;
      await saveBoxMonth(lid, event.id, { month: month.n, boxes, drafts: monthDrafts(boxes, names.entrant, { rules: matchRules }), label: month.label, start: month.start, end: month.end });
      toast('Mes rehecho');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const closeAndOpen = async (result: CloseResult) => {
    if (!month) return;
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async (next: BoxConfig, ok: string) => {
    setBusy(true);
    try {
      await updateRacketEvent(lid, event.id, { config: boxConfigJson(next) });
      toast(ok);
      setEditing(null);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

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
    });

  const progress = month ? monthProgress(month, matches, tables, cfg.rules, now) : null;
  const myBox = month ? month.boxes.findIndex((b) => b.some((id) => mine.includes(id))) : -1;
  const order = month ? [...month.boxes.keys()].sort((a, b) => (a === myBox ? -1 : b === myBox ? 1 : a - b)) : [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        {league.kind !== 'torneo' && <BackLink fallback={base} className="mt-1" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
            <Badge tone="accent">{cfg.doubles ? 'Cajas de parejas' : 'Liga por cajas'}</Badge>
            {month && !month.closed && <Badge tone="ok">{month.label || `Mes ${month.n}`}</Badge>}
          </div>
          <p className="text-sm text-muted">
            {cfg.entrants.length} {cfg.doubles ? 'parejas' : 'jugadores'} · cajas de {cfg.rules.min} a {cfg.rules.max} · suben {cfg.rules.up} y bajan {cfg.rules.down} · mínimo {cfg.rules.minToStay}{' '}
            partidos para salvarse
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {month && !month.closed && (
            <Button size="sm" variant="primary" icon={<CalendarCheck2 className="size-4" />} onClick={() => setEditing('cerrar')}>
              Cerrar el mes
            </Button>
          )}
          {month && !month.closed && !started && (
            <Button size="sm" icon={<RefreshCw className="size-4" />} loading={busy} onClick={() => void redoMonth()}>
              Rehacer el mes
            </Button>
          )}
          <Button size="sm" icon={<Users className="size-4" />} onClick={() => setEditing('participantes')}>
            Participantes
          </Button>
          <Button size="sm" icon={<Settings2 className="size-4" />} onClick={() => setEditing('reglas')}>
            Reglas
          </Button>
          {month && (
            <Button size="sm" icon={<Download className="size-4" />} onClick={() => void excel(month)}>
              Excel
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
            Borrar
          </Button>
        </div>
      )}

      {!month ? (
        isAdmin ? (
          <Card className="flex flex-col gap-3 p-4">
            <p className="font-semibold">Armar el primer mes</p>
            <p className="text-sm text-muted">
              {cfg.entrants.length} {cfg.doubles ? 'parejas' : 'jugadores'}. Las cajas salen por nivel y cada caja juega todos contra todos.
            </p>
            <Button variant="primary" className="h-12 text-base" loading={busy} disabled={cfg.entrants.length < 2} onClick={() => void openFirst()}>
              Armar el mes
            </Button>
          </Card>
        ) : (
          <Empty icon={<Boxes className="size-8" />} title="Todavía no empieza">
            Cuando el admin arme el primer mes, aquí sale tu caja y tus partidos.
          </Empty>
        )
      ) : (
        <>
          {progress && !month.closed && (
            <Card className="flex flex-col gap-1 px-4 py-3">
              <p className="text-sm">
                <b>{month.label || `Mes ${month.n}`}</b>: {progress.done} de {progress.total} partidos jugados
                {month.end ? ` · se cierra el ${month.end.split('-').reverse().slice(0, 2).join('/')}` : ''}.
              </p>
              <p className="text-xs text-muted">Pónganse de acuerdo para jugar dentro del mes. Quien juegue menos de {cfg.rules.minToStay} partidos baja.</p>
            </Card>
          )}
          <Tabs
            items={[
              { key: 'cajas' as Tab, label: 'Cajas', icon: <Boxes className="size-4" /> },
              { key: 'historial' as Tab, label: 'Meses', icon: <History className="size-4" /> },
              { key: 'participantes' as Tab, label: cfg.doubles ? 'Parejas' : 'Jugadores', icon: <Users className="size-4" /> },
            ]}
            active={tab}
            onChange={setTab}
          />
          <div key={tab} className="animate-fade-up flex flex-col gap-4">
            {tab === 'cajas' &&
              (q.loading && !matches.length ? (
                <ListSkeleton rows={3} />
              ) : (
                <>
                  {order.map((b) => (
                    <BoxCard key={b} b={b} month={month} rows={tables[b] ?? []} matches={matches} preview={preview} mine={mine} onOpen={param.open} last={b === month.boxes.length - 1} minToStay={cfg.rules.minToStay} />
                  ))}
                  <p className="px-1 text-xs text-muted">
                    {tiebreakText(sport)} ↑ sube y ↓ baja si el mes cerrara hoy. Un resultado por confirmar cuenta a las 48 h.
                  </p>
                </>
              ))}
            {tab === 'historial' && <MonthsHistory cfg={cfg} />}
            {tab === 'participantes' && <Participants cfg={cfg} month={month} />}
          </div>
        </>
      )}

      {editing === 'cerrar' && month && preview && (
        <CloseModal month={month} preview={preview} pending={(progress?.total ?? 0) - (progress?.done ?? 0)} busy={busy} onClose={() => setEditing(null)} onConfirm={() => void closeAndOpen(preview)} />
      )}
      {editing === 'participantes' && <ParticipantsModal cfg={cfg} busy={busy} onClose={() => setEditing(null)} onSave={(c) => void saveConfig(c, 'Participantes guardados')} />}
      {editing === 'reglas' && <RulesModal cfg={cfg} busy={busy} onClose={() => setEditing(null)} onSave={(c) => void saveConfig(c, 'Reglas guardadas')} />}
    </div>
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
  const names = useNames();
  const mySideOf = useMySide();
  const now = useNow(60_000).getTime();
  const list = monthMatches(matches, month.n).filter((m) => m.stage === boxName(b));
  const moveOf = new Map((preview?.moves ?? []).map((m) => [m.id, m] as const));
  const isMine = month.boxes[b].some((id) => mine.includes(id));
  const columns: StandingsColumn[] = [
    ...racketColumns(sport).filter((c) => c.key !== 'for' && c.key !== 'against'),
    {
      key: 'mv',
      label: '',
      title: 'Si el mes cerrara hoy',
      value: (r) => {
        const mv = moveOf.get(r.id);
        if (mv?.move === 'sube') return <ArrowUp className="inline size-4 text-ok" aria-label="sube" />;
        if (mv?.move === 'baja') return <ArrowDown className={cx('inline size-4', mv.reason ? 'text-warn' : 'text-danger')} aria-label={mv.reason ? 'baja por pocos partidos' : 'baja'} />;
        return '';
      },
    },
  ];
  return (
    <Section title={<span className={cx(isMine && 'text-accent')}>{`${boxName(b)}${isMine ? ' · tu caja' : ''}`}</span>}>
      <StandingsTable rows={rows} nameOf={names.entrantName} columns={columns} highlight={mine} empty="Sin partidos confirmados todavía." />
      {!last && rows.some((r) => r.played < minToStay) && (
        <p className="px-1 text-xs text-warn">Quien no llegue a {minToStay} partidos baja aunque gane.</p>
      )}
      {list.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface px-3 py-2" open={isMine}>
          <summary className="cursor-pointer py-1 text-sm font-medium">Partidos de la caja ({list.length})</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {list.map((m) => (
              <MatchCard key={m.id} match={m} mySide={mySideOf(m)} onClick={() => onOpen(m.id)} tz={league.tz} now={now} roundWord="Mes" />
            ))}
          </div>
        </details>
      )}
    </Section>
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
          <Card key={m.n} className="flex flex-col gap-1 px-4 py-3 text-sm">
            <p className="font-semibold">{m.label || `Mes ${m.n}`}</p>
            {up.length > 0 && (
              <p>
                <ArrowUp className="inline size-4 text-ok" /> Subieron: {up.map((x) => `${names.entrantName(x.id)} (${boxName(x.to)})`).join(', ')}
              </p>
            )}
            {down.length > 0 && (
              <p>
                <ArrowDown className="inline size-4 text-danger" /> Bajaron: {down.map((x) => `${names.entrantName(x.id)}${x.reason ? ' (pocos partidos)' : ''}`).join(', ')}
              </p>
            )}
            {fresh.length > 0 && <p className="text-muted">Entraron: {fresh.map((x) => names.entrantName(x.id)).join(', ')}</p>}
            {m.archived ? (
              <p className="text-muted">De este mes ya no se guarda quién subió y quién bajó.</p>
            ) : (
              !m.moves.length && <p className="text-muted">Sin cambios.</p>
            )}
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
    <Card className="divide-y divide-line overflow-hidden">
      {cfg.entrants.map((id) => {
        const lv = entrantLevel(names.entrant(id), levels);
        const b = boxOf.get(id);
        return (
          <div key={id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate font-medium">{names.entrantName(id)}</span>
            {lv != null && <Badge tone="neutral">{levelText(lv, scale)}</Badge>}
            <Badge tone={b == null ? 'warn' : 'accent'}>{b == null ? 'Entra el mes que viene' : boxName(b)}</Badge>
          </div>
        );
      })}
    </Card>
  );
}

function CloseModal({ month, preview, pending, busy, onClose, onConfirm }: { month: BoxMonth; preview: CloseResult; pending: number; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const names = useNames();
  const byId = new Map(preview.moves.map((m) => [m.id, m] as const));
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={`Cerrar ${month.label || `el mes ${month.n}`}`}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={onConfirm}>
            Cerrar y abrir el mes que sigue
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {pending > 0 && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
            Quedan {pending} {pending === 1 ? 'partido' : 'partidos'} sin jugar o sin confirmar: los que no han empezado quedan anulados.
          </p>
        )}
        <p className="text-sm text-muted">Así quedan las cajas del mes que viene (se arman sus partidos solos):</p>
        {preview.boxes.map((box, i) => (
          <Card key={i} className="overflow-hidden">
            <p className="border-b border-line px-4 py-2 text-sm font-semibold">{boxName(i)}</p>
            <div className="divide-y divide-line">
              {box.map((id) => {
                const mv = byId.get(id);
                return (
                  <div key={id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{names.entrantName(id)}</span>
                    {mv && mv.move !== 'queda' && (
                      <span className={cx('text-xs font-medium', mv.move === 'sube' ? 'text-ok' : mv.move === 'baja' ? 'text-danger' : 'text-accent')}>{moveText(mv)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </Modal>
  );
}

function ParticipantsModal({ cfg, busy, onClose, onSave }: { cfg: BoxConfig; busy: boolean; onClose: () => void; onSave: (c: BoxConfig) => void }) {
  const names = useNames();
  const [picked, setPicked] = useState(cfg.entrants);
  const items = cfg.doubles
    ? names.teams.map((t) => ({ id: t.id, name: t.name, sub: t.roster.map((r) => names.nameOf(r.playerId)).join(' / ') }))
    : names.players.map((p) => ({ id: p.id, name: p.name }));
  return (
    <Modal
      open
      onClose={onClose}
      title="Participantes"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} disabled={picked.length < 2} onClick={() => onSave({ ...cfg, entrants: picked })}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Los nuevos entran en la última caja al cerrar el mes; quien sale, deja su caja al cerrar el mes.</p>
        <PickList items={items} selected={new Set(picked)} onToggle={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} />
      </div>
    </Modal>
  );
}

function RulesModal({ cfg, busy, onClose, onSave }: { cfg: BoxConfig; busy: boolean; onClose: () => void; onSave: (c: BoxConfig) => void }) {
  const { sport } = useRacket();
  const [rules, setRules] = useState(cfg.rules);
  const [points, setPoints] = useState(cfg.points);
  return (
    <Modal
      open
      onClose={onClose}
      title="Reglas de las cajas"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => onSave({ ...cfg, rules, points })}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <BoxRulesFields value={rules} onChange={setRules} />
        {/* Pickleball y ping pong traen sus propios puntos de tabla. */}
        {!isGameSport(sport) && (
          <div className="grid grid-cols-2 gap-2">
            {(['standard', '2-0'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={points === k}
                onClick={() => setPoints(k)}
                className={cx('min-h-12 rounded-xl border-2 px-3 text-sm font-semibold', points === k ? 'border-accent bg-accent-soft text-accent' : 'border-line')}
              >
                {k === 'standard' ? 'Ganar 3, perder 1' : 'Ganar 2, perder 0'}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">Valen desde el próximo cierre de mes.</p>
      </div>
    </Modal>
  );
}
