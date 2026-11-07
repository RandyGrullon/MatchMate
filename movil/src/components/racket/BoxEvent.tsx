/**
 * La liga por cajas (BoxPage.tsx de la web, con su misma lógica: racket-formats/logic/box.ts): cómo va el mes (partidos
 * jugados con su barra y cuándo se cierra), las cajas (la mía primero) con su tabla, quién sube y quién baja si el mes
 * cerrara hoy y sus partidos. Lite: los meses cerrados y los participantes en filas; Pro: Cajas · Meses · Jugadores.
 * Quien organiza: Excel, participantes, reglas y borrar en «•••»; en Pro arma el primer mes, lo rehace si nadie ha
 * jugado y lo cierra (anula lo no jugado, guarda subidas y bajadas y abre el siguiente con sus partidos). En Lite, lo de
 * armar y cerrar el mes va con «Usar Pro».
 */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDown, ArrowUp, Boxes, CalendarCheck2, FileSpreadsheet, History, RefreshCw, Settings2, Trash2, Users } from 'lucide-react-native';
import { useMatches, type Match } from '@mm/lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { isGameSport } from '@mm/sports/racket/rules';
import type { StandingRow } from '@mm/sports/types';
import type { StandingsColumn } from '@mm/components/match/standings';
import { saveBoxMonth } from '@mm/pages/sports/racket-formats/data';
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
} from '@mm/pages/sports/racket-formats/logic/box';
import { boxMonthExcelInput } from '@mm/pages/sports/racket/excel';
import { levelText, useLevels } from '@mm/pages/sports/racket/levels';
import { tiebreakText } from '@mm/pages/sports/racket/logic/tiebreaks';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { useMySide } from '@mm/pages/sports/racket/match/side';
import { useNames } from '@mm/pages/sports/racket/names';
import { courtWords } from '@mm/pages/sports/racket/sport';
import { racketColumns } from '@mm/pages/sports/racket/view';
import { ScreenNotice } from '../esports/bits';
import { ChoiceChips, FinePrint } from '../esports/inputs';
import { MatchCard } from '../match/MatchCard';
import { StandingsTable } from '../match/StandingsTable';
import { confirmAsync, toast } from '../feedback';
import { Badge, Button, Card, Divider, Empty, ListRow, RowIcon, Segmented, SectionHeader, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { BoxRulesFields } from './FormatForms';
import { useDeleteEvent } from './EventAdmin';
import { shareCompetitionExcel } from './excel';
import { EventMenu, PickList, SaveFooter, ScreenHead, useOrganizePro, useRacketPhone, type MenuItem } from './parts';
import { matchRoute } from './RacketHome';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type SheetKey = 'historial' | 'participantes' | 'editar-participantes' | 'reglas' | 'cerrar';
type Tab = 'cajas' | 'historial' | 'participantes';
/** Lo que se está guardando: la ruedita va en ese botón y los demás esperan. */
type Pending = 'primero' | 'rehacer' | 'cerrar' | 'config' | 'excel';

export function BoxView({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid, league, isAdmin, myPlayerId } = useLeagueCtx();
  const { sport, ext, leagueRules } = useRacketPhone();
  const pro = useIsPro();
  const { levels } = useLevels();
  const names = useNames();
  const now = useNow(60_000).getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseBoxConfig(event.config), [event.config]);
  const month = openMonth(cfg) ?? cfg.months.at(-1) ?? null;
  const tables = useMemo(() => (month ? boxTables(sport, month, matches, { scheme: cfg.points, now, lotSeed: event.id }) : []), [sport, month, matches, cfg.points, now, event.id]);
  const preview = useMemo(() => (month && !month.closed ? closeMonth(cfg, month, tables) : null), [cfg, month, tables]);
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [tab, setTab] = useState<Tab>('cajas');
  const [pending, setPending] = useState<Pending | null>(null);
  const title = event.name || 'Liga por cajas';
  const mine = [...(myPlayerId ? [myPlayerId] : []), ...names.teamsOf(myPlayerId)];
  const remove = useDeleteEvent(event, { title, message: 'Se borran sus meses, partidos y resultados. No se puede deshacer.', ok: 'Liga por cajas borrada' });
  // Lite, quien organiza: el mes se arma y se cierra en Pro (el aviso de la pantalla y «•••»).
  const proItem = useOrganizePro(isAdmin, {
    id: `raqueta-cajas-pro:${event.id}`,
    title: 'Organizas las cajas',
    text: 'El mes se arma y se cierra en Pro',
    menu: month && !month.closed ? 'Cerrar el mes' : 'Armar el mes',
  });
  const organize = isAdmin && pro;
  const busy = pending !== null && pending !== 'excel';
  const matchRules = { ...leagueRules, match: { ...((leagueRules.match as Record<string, unknown> | undefined) ?? {}), doubles: cfg.doubles } };
  const started = month ? monthMatches(matches, month.n).some((m) => m.status !== 'scheduled' || m.seq > 0) : false;

  /** Lo hace con su ruedita y avisa; con error, el aviso del error. true si salió bien. */
  const run = async (key: Pending, fn: () => Promise<unknown>, ok: string) => {
    setPending(key);
    try {
      await fn();
      toast(ok);
      return true;
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
      return false;
    } finally {
      setPending(null);
    }
  };

  const saveConfig = async (next: BoxConfig, ok: string) => {
    if (await run('config', () => updateRacketEvent(lid, event.id, { config: boxConfigJson(next) }), ok)) setSheet(null);
  };

  const openFirst = () =>
    run(
      'primero',
      () => {
        const boxes = firstBoxes(
          cfg.entrants.map((id) => names.entrant(id)),
          levels,
          cfg.rules,
        );
        const r = nextMonthRange(null, todayIn(league.tz));
        return saveBoxMonth(lid, event.id, { month: 1, boxes, drafts: monthDrafts(boxes, names.entrant, { rules: matchRules }), label: r.label, start: r.start, end: r.end });
      },
      'Mes armado: a cada quien le tocan sus partidos',
    );

  const redoMonth = async () => {
    if (!month) return;
    if (!(await confirmAsync({ title: `¿Rehacer ${month.label || `el mes ${month.n}`}?`, message: 'Se arman las cajas otra vez con los participantes de ahora (nadie ha jugado).', confirmText: 'Rehacer' }))) return;
    await run(
      'rehacer',
      () => {
        const boxes = month.n === 1 ? firstBoxes(cfg.entrants.map((id) => names.entrant(id)), levels, cfg.rules) : month.boxes;
        return saveBoxMonth(lid, event.id, { month: month.n, boxes, drafts: monthDrafts(boxes, names.entrant, { rules: matchRules }), label: month.label, start: month.start, end: month.end });
      },
      'Mes rehecho',
    );
  };

  const closeAndOpen = async (result: CloseResult) => {
    if (!month) return;
    const r = nextMonthRange(month.end, todayIn(league.tz));
    const done = await run(
      'cerrar',
      () =>
        saveBoxMonth(lid, event.id, {
          month: month.n + 1,
          boxes: result.boxes,
          drafts: monthDrafts(result.boxes, names.entrant, { rules: matchRules }),
          moves: result.moves,
          label: r.label,
          start: r.start,
          end: r.end,
        }),
      `${r.label}: cajas y partidos listos`,
    );
    if (done) setSheet(null);
  };

  const excel = async (m: BoxMonth) => {
    setPending('excel');
    try {
      await shareCompetitionExcel(boxMonthExcelInput({ title, eventDate: event.date, month: m, matches, tables, sport, names, tz: league.tz, courtLabel: courtWords(ext).One, now }));
    } catch (e) {
      console.error(e);
      toast('No se pudo hacer el Excel', 'error');
    } finally {
      setPending(null);
    }
  };

  const progress = month ? monthProgress(month, matches, tables, cfg.rules, now) : null;
  const myBox = month ? month.boxes.findIndex((b) => b.some((id) => mine.includes(id))) : -1;
  const order = month ? [...month.boxes.keys()].sort((a, b) => (a === myBox ? -1 : b === myBox ? 1 : a - b)) : [];
  const unit = cfg.doubles ? 'parejas' : 'jugadores';
  const meta = [`${cfg.entrants.length} ${unit}`, `suben ${cfg.rules.up} y bajan ${cfg.rules.down}`, pro ? `cajas de ${cfg.rules.min} a ${cfg.rules.max}` : null].filter(Boolean).join(' · ');
  const items: MenuItem[] = [
    ...(proItem.item ? [proItem.item] : []),
    ...(isAdmin && month ? [{ key: 'excel', icon: FileSpreadsheet, label: 'Excel', hint: 'Las cajas y los partidos del mes', onPress: () => void excel(month), busy: pending === 'excel' }] : []),
    ...(organize && month && !month.closed && !started
      ? [{ key: 'rehacer', icon: RefreshCw, label: 'Rehacer el mes', hint: 'Nadie ha jugado todavía', onPress: () => void redoMonth(), busy: pending === 'rehacer' }]
      : []),
    ...(isAdmin
      ? [
          { key: 'participantes', icon: Users, label: 'Participantes', hint: 'Entran y salen al cerrar el mes', onPress: () => setSheet('editar-participantes') },
          { key: 'reglas', icon: Settings2, label: 'Reglas de las cajas', hint: 'Tamaños, subidas y bajadas', onPress: () => setSheet('reglas') },
          { key: 'borrar', icon: Trash2, label: 'Borrar la liga por cajas', onPress: () => void remove(), danger: true },
        ]
      : []),
  ];
  const boxesView =
    q.loading && !matches.length ? (
      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
        <LogoSpinner size={32} label="Cargando las cajas" />
      </View>
    ) : (
      month && (
        <View style={{ gap: 30 }}>
          {order.map((b) => (
            <BoxCard key={b} b={b} month={month} rows={tables[b] ?? []} matches={matches} preview={preview} mine={mine} last={b === month.boxes.length - 1} minToStay={cfg.rules.minToStay} />
          ))}
          <FinePrint>{`${tiebreakText(sport)} ↑ sube y ↓ baja si el mes cerrara hoy. Un resultado por confirmar cuenta a las 48 h.`}</FinePrint>
        </View>
      )
    );

  return (
    <View style={{ gap: 22 }}>
      <ScreenHead
        title={title}
        status={month && !month.closed ? { text: month.label || `Mes ${month.n}`, live: true } : null}
        meta={meta}
        right={
          <EventMenu title={title} items={items}>
            {sheet === 'editar-participantes' && <ParticipantsSheet cfg={cfg} busy={pending === 'config'} onClose={() => setSheet(null)} onSave={(x) => void saveConfig(x, 'Participantes guardados')} />}
            {sheet === 'reglas' && <RulesSheet cfg={cfg} busy={pending === 'config'} onClose={() => setSheet(null)} onSave={(x) => void saveConfig(x, 'Reglas guardadas')} />}
          </EventMenu>
        }
      />

      {!month ? (
        organize ? (
          <Card style={{ gap: 6 }}>
            <Txt variant="cardTitle">Armar el primer mes</Txt>
            <Txt variant="meta" tone="fg2">
              {`${cfg.entrants.length} ${unit}. Las cajas salen por nivel y cada caja juega todos contra todos.`}
            </Txt>
            <View style={{ marginTop: 10 }}>
              <Button variant="primary" size="xl" full loading={pending === 'primero'} disabled={cfg.entrants.length < 2 || busy} onPress={() => void openFirst()}>
                Armar el mes
              </Button>
            </View>
          </Card>
        ) : (
          <Empty icon={<Boxes size={28} color={c.accent} />} title="Todavía no empieza" text="Cuando se arme el primer mes, aquí sale tu caja y tus partidos." />
        )
      ) : pro ? (
        <>
          {progress && !month.closed && (
            <MonthCard month={month} done={progress.done} total={progress.total} minToStay={cfg.rules.minToStay} onClose={organize ? () => setSheet('cerrar') : undefined} />
          )}
          <Segmented<Tab>
            label="Qué ver de las cajas"
            value={tab}
            onChange={setTab}
            options={[
              { key: 'cajas', label: 'Cajas' },
              { key: 'historial', label: 'Meses' },
              { key: 'participantes', label: cfg.doubles ? 'Parejas' : 'Jugadores' },
            ]}
          />
          {tab === 'cajas' && boxesView}
          {tab === 'historial' && <MonthsHistory cfg={cfg} />}
          {tab === 'participantes' && <Participants cfg={cfg} month={month} />}
        </>
      ) : (
        <>
          {progress && !month.closed && <MonthCard month={month} done={progress.done} total={progress.total} minToStay={cfg.rules.minToStay} />}
          {boxesView}
          <Card padded={false}>
            <ListRow
              icon={
                <RowIcon>
                  <History size={20} color={c.accent} />
                </RowIcon>
              }
              title="Meses anteriores"
              subtitle="Quién subió y quién bajó"
              onPress={() => setSheet('historial')}
            />
            <Divider inset={68} />
            <ListRow
              icon={
                <RowIcon>
                  <Users size={20} color={c.accent} />
                </RowIcon>
              }
              title={`${cfg.doubles ? 'Parejas' : 'Jugadores'} (${cfg.entrants.length})`}
              subtitle="Su nivel y su caja"
              onPress={() => setSheet('participantes')}
            />
          </Card>
        </>
      )}

      {/* El único aviso de la pantalla, al final (Lite, quien organiza: el mes se arma y se cierra en Pro). */}
      <ScreenNotice notices={[proItem.notice]} />

      <Sheet open={sheet === 'historial'} onClose={() => setSheet(null)} title="Meses anteriores" subtitle={title}>
        <MonthsHistory cfg={cfg} />
      </Sheet>
      <Sheet open={sheet === 'participantes'} onClose={() => setSheet(null)} title={cfg.doubles ? 'Parejas' : 'Jugadores'} subtitle={title}>
        {month && <Participants cfg={cfg} month={month} />}
      </Sheet>
      {sheet === 'cerrar' && month && preview && (
        <CloseSheet month={month} preview={preview} pending={(progress?.total ?? 0) - (progress?.done ?? 0)} busy={pending === 'cerrar'} disabled={busy} onClose={() => setSheet(null)} onConfirm={() => void closeAndOpen(preview)} />
      )}
    </View>
  );
}

/** «Cerrar el mes» (Pro): así quedan las cajas del mes que viene, con quién sube y quién baja; lo no jugado queda anulado. */
function CloseSheet({
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
  const c = useColors();
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
      {pending > 0 && (
        <View style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.dangerSoft }}>
          <Txt tone="danger" style={{ fontSize: 14 }}>
            {`Quedan ${pending} ${pending === 1 ? 'partido' : 'partidos'} sin jugar o sin confirmar: los que no han empezado quedan anulados.`}
          </Txt>
        </View>
      )}
      {preview.boxes.map((box, i) => (
        <Card key={i} padded={false}>
          <Txt style={{ fontSize: 15, fontFamily: font.bold, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>{boxName(i)}</Txt>
          {box.map((id, j) => {
            const mv = byId.get(id);
            return (
              <View key={id}>
                {j > 0 && <Divider inset={20} />}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 20, paddingVertical: 8 }}>
                  <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.medium }}>
                    {names.entrantName(id)}
                  </Txt>
                  {mv && mv.move !== 'queda' && <Txt style={{ fontSize: 13, fontFamily: font.semibold, color: mv.move === 'baja' ? c.danger : c.accent }}>{moveText(mv)}</Txt>}
                </View>
              </View>
            );
          })}
        </Card>
      ))}
    </Sheet>
  );
}

/** Cómo va el mes: «Octubre 2026 · 1 de 12 partidos jugados» con su barra, cuándo se cierra y (quien organiza, en Pro) «Cerrar el mes». */
function MonthCard({ month, done, total, minToStay, onClose }: { month: BoxMonth; done: number; total: number; minToStay: number; onClose?: () => void }) {
  const c = useColors();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <Card style={{ gap: 6, backgroundColor: c.accentSoft }}>
      <Txt tone="accent" style={{ fontSize: 14, fontFamily: font.semibold }}>
        {month.label || `Mes ${month.n}`}
      </Txt>
      <Txt variant="cardTitle">{`${done} de ${total} partidos jugados`}</Txt>
      <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c.surface2, marginTop: 6 }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 4, backgroundColor: c.accent }} />
      </View>
      <Txt tone="fg2" style={{ fontSize: 13.5, marginTop: 4 }}>
        {`${month.end ? `Se cierra el ${month.end.split('-').reverse().slice(0, 2).join('/')} · ` : ''}con menos de ${minToStay} partidos se baja`}
      </Txt>
      {onClose && (
        <View style={{ marginTop: 10 }}>
          <Button variant="primary" size="lg" full icon={<CalendarCheck2 size={20} color={c.accentFg} />} onPress={onClose}>
            Cerrar el mes
          </Button>
        </View>
      )}
    </Card>
  );
}

/** Una caja: su tabla (con ↑ y ↓ de lo que pasaría hoy) y sus partidos (abiertos en la caja propia). */
function BoxCard({
  b,
  month,
  rows,
  matches,
  preview,
  mine,
  last,
  minToStay,
}: {
  b: number;
  month: BoxMonth;
  rows: StandingRow[];
  matches: readonly Match[];
  preview: CloseResult | null;
  mine: string[];
  last: boolean;
  minToStay: number;
}) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const { sport } = useRacketPhone();
  const names = useNames();
  const mySideOf = useMySide();
  const now = useNow(60_000).getTime();
  const list = monthMatches(matches, month.n).filter((m) => m.stage === boxName(b));
  const moveOf = new Map((preview?.moves ?? []).map((m) => [m.id, m] as const));
  const isMine = month.boxes[b].some((id) => mine.includes(id));
  const [open, setOpen] = useState(isMine);
  // Lite: PJ, G y P, y la flecha de si sube o baja.
  const columns: StandingsColumn[] = [
    ...racketColumns(sport).filter((col) => ['played', 'won', 'lost'].includes(col.key)),
    {
      key: 'mv',
      label: '',
      title: 'Si el mes cerrara hoy',
      value: (r) => {
        const mv = moveOf.get(r.id);
        return mv?.move === 'sube' ? '↑' : mv?.move === 'baja' ? '↓' : '';
      },
    },
  ];
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={`${boxName(b)}${isMine ? ' · tu caja' : ''}`} />
      <StandingsTable rows={rows} nameOf={names.entrantName} columns={columns} highlight={mine} empty="Sin partidos confirmados todavía." />
      {!last && rows.some((r) => r.played < minToStay) && (
        <Txt tone="muted" style={{ fontSize: 12.5, marginHorizontal: 4 }}>
          {`Quien no llegue a ${minToStay} partidos baja aunque gane.`}
        </Txt>
      )}
      {list.length > 0 && (
        <>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ minHeight: 44, justifyContent: 'center', marginHorizontal: 4 }}>
            <Txt variant="meta" style={{ fontFamily: font.semibold, color: c.accent }}>{`Partidos de la caja (${list.length})`}</Txt>
          </Pressable>
          {open &&
            list.map((m) => <MatchCard key={m.id} match={m} mySide={mySideOf(m)} onPress={() => router.push(matchRoute(lid, m.id))} tz={league.tz} now={now} roundWord="Mes" />)}
        </>
      )}
    </View>
  );
}

function MonthsHistory({ cfg }: { cfg: BoxConfig }) {
  const c = useColors();
  const names = useNames();
  const closed = cfg.months.filter((m) => m.closed).reverse();
  if (!closed.length) return <Empty icon={<History size={28} color={c.accent} />} title="Todavía no se ha cerrado ningún mes" />;
  return (
    <View style={{ gap: 12 }}>
      {closed.map((m) => {
        const up = m.moves.filter((x) => x.move === 'sube');
        const down = m.moves.filter((x) => x.move === 'baja');
        const fresh = m.moves.filter((x) => x.move === 'nuevo');
        return (
          <Card key={m.n} style={{ gap: 6, backgroundColor: c.surface2 }}>
            <Txt style={{ fontSize: 17, fontFamily: font.bold }}>{m.label || `Mes ${m.n}`}</Txt>
            {up.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <ArrowUp size={16} color={c.accent} style={{ marginTop: 2 }} />
                <Txt style={{ flex: 1, fontSize: 15 }}>{`Subieron: ${up.map((x) => `${names.entrantName(x.id)} (${boxName(x.to)})`).join(', ')}`}</Txt>
              </View>
            )}
            {down.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <ArrowDown size={16} color={c.danger} style={{ marginTop: 2 }} />
                <Txt style={{ flex: 1, fontSize: 15 }}>{`Bajaron: ${down.map((x) => `${names.entrantName(x.id)}${x.reason ? ' (pocos partidos)' : ''}`).join(', ')}`}</Txt>
              </View>
            )}
            {fresh.length > 0 && <Txt tone="muted" style={{ fontSize: 15 }}>{`Entraron: ${fresh.map((x) => names.entrantName(x.id)).join(', ')}`}</Txt>}
            {m.archived ? (
              <Txt tone="muted" style={{ fontSize: 15 }}>
                De este mes ya no se guarda quién subió y quién bajó.
              </Txt>
            ) : (
              !m.moves.length && (
                <Txt tone="muted" style={{ fontSize: 15 }}>
                  Sin cambios.
                </Txt>
              )
            )}
          </Card>
        );
      })}
    </View>
  );
}

function Participants({ cfg, month }: { cfg: BoxConfig; month: BoxMonth }) {
  const names = useNames();
  const { levels, scale } = useLevels();
  const boxOf = new Map(month.boxes.flatMap((b, i) => b.map((id) => [id, i] as const)));
  return (
    <Card padded={false}>
      {cfg.entrants.map((id, i) => {
        const lv = entrantLevel(names.entrant(id), levels);
        const b = boxOf.get(id);
        return (
          <View key={id}>
            {i > 0 && <Divider inset={16} />}
            <ListRow title={names.entrantName(id)} subtitle={lv != null ? levelText(lv, scale) : undefined} chevron={false} right={<Badge tone={b == null ? 'muted' : 'accent'}>{b == null ? 'Entra el mes que viene' : boxName(b)}</Badge>} />
          </View>
        );
      })}
    </Card>
  );
}

function ParticipantsSheet({ cfg, busy, onClose, onSave }: { cfg: BoxConfig; busy: boolean; onClose: () => void; onSave: (c: BoxConfig) => void }) {
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
      footer={<SaveFooter onClose={onClose} busy={busy} disabled={picked.length < 2} onSave={() => onSave({ ...cfg, entrants: picked })} />}
    >
      <PickList items={items} selected={new Set(picked)} onToggle={(id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} />
    </Sheet>
  );
}

function RulesSheet({ cfg, busy, onClose, onSave }: { cfg: BoxConfig; busy: boolean; onClose: () => void; onSave: (c: BoxConfig) => void }) {
  const { sport } = useRacketPhone();
  const [rules, setRules] = useState(cfg.rules);
  const [points, setPoints] = useState(cfg.points);
  return (
    <Sheet open onClose={onClose} title="Reglas de las cajas" subtitle="Valen desde el próximo cierre de mes" footer={<SaveFooter onClose={onClose} busy={busy} onSave={() => onSave({ ...cfg, rules, points })} />}>
      <BoxRulesFields value={rules} onChange={setRules} />
      {/* Pickleball y ping pong traen sus propios puntos de tabla. */}
      {!isGameSport(sport) && (
        <View style={{ gap: 8 }}>
          <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
            Puntos de la tabla
          </Txt>
          <ChoiceChips<'standard' | '2-0'>
            label="Puntos de la tabla"
            value={points === '2-0' ? '2-0' : 'standard'}
            items={[
              { key: 'standard', label: 'Ganar 3, perder 1' },
              { key: '2-0', label: 'Ganar 2, perder 0' },
            ]}
            onChange={setPoints}
          />
        </View>
      )}
    </Sheet>
  );
}
