import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ClipboardList, ClipboardPen, FileDown, GitFork, ListOrdered, Plus, Rows3, Settings2, Shuffle, Trash2, Trophy, Wand2 } from 'lucide-react';
import { deleteEvent } from '../../../../lib/data';
import { createMatches, deleteMatch, setMatchSides, useMatches, type Match } from '../../../../lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '../../../../lib/data/racket';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { racketTourneyComp, racketTourneyFinished } from '../../../../prizes/sports';
import { podium, type Bracket } from '../../../../sports/formats';
import { useBusy } from '../../../../components/busy';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { eventDay } from '../../../../components/event/EventHeader';
import { ReportButton } from '../../../../components/tournamentReport/ReportButton';
import { BracketView, MatchCard, StandingsTable } from '../../../../components/match';
import { useIsPro } from '../../../../components/mode';
import { NoticeSlot } from '../../../../components/NoticeSlot';
import { Button, Card, Empty, Field, Input, ListSkeleton, Segmented, SectionHeader, Sheet, cx } from '../../../../components/ui';
import { Chips, PickList, Stepper, ToggleRow, racketColumns } from '../bits';
import { ReportSheet, ScorersSheet, ScreenHead, useEventBack, useOrganizePro, type RacketMenuItem } from '../frame';
import { entrantKey } from '../logic/results';
import {
  CATEGORY_IDS,
  bracketDrafts,
  bracketSides,
  bracketTodo,
  categoryBracket,
  groupDrafts,
  groupMatches,
  groupStage,
  groupTables,
  groupsDone,
  makeGroups,
  newCategory,
  parseTourneyConfig,
  qualifiers,
  suggestGroups,
  tourneyConfigJson,
  tourneyStarted,
  type TourneyCategory,
  type TourneyConfig,
} from '../logic/tourney';
import { todayIn } from '../logic/time';
import { SignupSettingsModal } from '../signup/SignupFields';
import { SignupPanel } from '../signup/SignupPanel';
import { MatchDetail, useMatchParam, useMySide } from '../match/MatchDetail';
import { levelText, useLevels } from '../levels';
import { SaveFooter } from '../night/parts';
import { entrantPlayers, useNames, type Names } from '../names';
import { useRacket } from '../sport';
import { CategoryPrize, TourneyPrizes } from './TourneyPrizes';

type View = 'grupos' | 'cuadro' | 'partidos';
/** Lo que se está guardando: la ruedita va en ese botón y los demás esperan. */
type Pending = 'categoria' | 'grupos' | 'faltan' | 'deshacer' | 'cuadro' | 'avanzar' | 'guardar-cat' | 'borrar-cat' | 'inscripcion';

/**
 * Torneo por categorías (rediseño «Calma y foco»): «‹ Pádel de los jueves» con «•••» (reporte, nueva categoría,
 * inscripción, anotadores, borrar), el título y «Mié 7 oct · 1 categoría · 4 parejas». Cada categoría con sus parejas
 * sembradas por nivel, grupos en zigzag (todos contra todos), cruces 1A–2B y cuadro con pases directos y 3.er lugar
 * opcional (o cuadro directo sin grupos), en Grupos · Cuadro · Partidos. Lo de armar (grupos, cuadro, pasar ganadores,
 * editar la categoría) es de quien organiza en Pro; en Lite va con «Usar Pro». Antes de armar, la inscripción «Me
 * apunto» por categoría si el admin la abrió.
 */
export function TourneyPage({ event }: { event: RacketEvent }) {
  const { lid, base, isAdmin, league } = useLeagueCtx();
  const { sport, side, leagueRules } = useRacket();
  const names = useNames();
  const param = useMatchParam();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const now = useNow().getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseTourneyConfig(event.config), [event.config]);
  const pending = useBusy<Pending>();
  const [editing, setEditing] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'reporte' | 'anotadores' | null>(null);
  const pro = useIsPro();
  const back = useEventBack();
  const title = event.name || 'Torneo';
  const finished = racketTourneyFinished(cfg.categories, matches, names, now);
  const proItem = useOrganizePro(isAdmin && !finished, {
    id: `raqueta-torneo-pro:${event.id}`,
    title: 'Organizas este torneo',
    text: 'Grupos y cuadro se arman en Pro',
    menu: 'Armar grupos y cuadro',
  });

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const catId = search.get('cat') ?? cfg.categories[0]?.id ?? null;
  const cat = cfg.categories.find((c) => c.id === catId) ?? cfg.categories[0] ?? null;
  const set = (patch: Record<string, string>) => setSearch({ ...Object.fromEntries(search), ...patch }, { replace: true });

  const started = tourneyStarted(cfg) || matches.length > 0;
  const organize = isAdmin && pro;
  /** Guarda la configuración. `rev` = la versión de la lista que se editó (si alguien se apuntó mientras tanto, no se pierde). */
  const saveConfig = async (next: TourneyConfig, rev?: number) => {
    const signup = next.signup && rev != null ? { ...next.signup, rev } : next.signup;
    await updateRacketEvent(lid, event.id, { config: tourneyConfigJson({ ...next, signup }) });
  };
  const withBusy = async (key: Pending, fn: () => Promise<void>, ok: string) => {
    await pending.run(key, async () => {
      try {
        await fn();
        toast(ok);
      } catch (e) {
        toast(saveErrorMessage(e), 'error');
      }
    });
  };
  const putCategory = (c: TourneyCategory) => ({ ...cfg, categories: cfg.categories.map((x) => (x.id === c.id ? c : x)) });

  const addCategory = () =>
    withBusy('categoria', async () => {
      const id = CATEGORY_IDS.find((x) => !cfg.categories.some((c) => c.id === x));
      if (!id) throw new Error('Máximo de categorías');
      await saveConfig({ ...cfg, categories: [...cfg.categories, newCategory(id)] });
      set({ cat: id });
      setEditing(id);
    }, 'Categoría agregada');

  const remove = async () => {
    if (!(await confirm({ title: `¿Borrar ${title}?`, message: 'Se borran sus partidos y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    navigate(base);
    try {
      await deleteEvent(lid, event.id);
      toast('Torneo borrado');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    }
  };

  // Reporte del torneo (PDF o Excel), para todos: se arma al tocar, con los cuadros y las tablas de la pantalla.
  const report = {
    report: () =>
      import('../../../../lib/report/racket').then((m) => m.racketTourneyReport({ lid, league, event, title, sport, leagueRules, matches, names, now })),
    comp: racketTourneyComp(lid, event, { sport, leagueRules, categories: cfg.categories }),
    disabled: (q.loading && !matches.length) || names.loading,
  };

  const n = cfg.categories.length;
  const meta = [eventDay(event.date, todayIn(league.tz), pro), `${n} ${n === 1 ? 'categoría' : 'categorías'}`, `${event.playerCount} ${event.playerCount === 1 ? side[0] : side[1]}`].join(' · ');
  const menu: RacketMenuItem[] = [
    ...(n > 0 ? [{ key: 'reporte', icon: FileDown, label: 'Reporte del torneo', hint: 'PDF para WhatsApp o imprimir, o Excel', onClick: () => setSheet('reporte') }] : []),
    ...(proItem ? [proItem] : []),
    ...(isAdmin
      ? [
          ...(organize && n < CATEGORY_IDS.length
            ? [{ key: 'categoria', icon: Plus, label: 'Nueva categoría', hint: 'A, B, C…', onClick: () => void addCategory(), busy: pending.isBusy('categoria') }]
            : []),
          ...(!started && n > 0 ? [{ key: 'inscripcion', icon: ClipboardList, label: 'Inscripción', hint: 'Me apunto por categoría', onClick: () => setEditing('inscripcion') }] : []),
          { key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota este torneo', onClick: () => setSheet('anotadores') },
          { key: 'borrar', icon: Trash2, label: 'Borrar el torneo', onClick: () => void remove(), danger: true },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col px-2">
      <ScreenHead back={back} title={title} status={finished ? { text: 'Terminado' } : null} meta={meta} menu={menu} />

      {/* Terminado el torneo, quien organiza tiene el reporte a la mano (para todos está en «•••»). */}
      {organize && finished && <ReportButton {...report} look="card" className="mt-[22px]" />}

      {cfg.signup && !started && n > 0 && (
        <SignupPanel
          event={event}
          settings={cfg.signup}
          lists={cfg.categories.map((c) => ({ category: c.id, name: c.name, listed: c.pairs }))}
          started={started}
          onEdit={isAdmin ? () => setEditing('inscripcion') : undefined}
          className="mt-[22px]"
        />
      )}

      {n > 1 &&
        (n <= 3 ? (
          <Segmented full label="Categoría" className="mt-[22px]" options={cfg.categories.map((c) => ({ key: c.id, label: c.name }))} value={cat?.id ?? ''} onChange={(k) => set({ cat: k })} />
        ) : (
          <Chips className="mt-[22px]" items={cfg.categories.map((c) => ({ key: c.id, label: c.name }))} value={cat?.id ?? ''} onChange={(k) => set({ cat: k })} />
        ))}

      <div className="mt-[22px]">
        {!cat ? (
          <Empty icon={<Trophy className="size-8" />} title="Sin categorías">
            {organize ? (
              <Button variant="primary" size="lg" className="mt-3" icon={<Plus className="size-4" />} loading={pending.isBusy('categoria')} onClick={() => void addCategory()}>
                Nueva categoría
              </Button>
            ) : (
              'El torneo todavía no tiene categorías.'
            )}
          </Empty>
        ) : q.loading && !matches.length ? (
          <ListSkeleton rows={3} />
        ) : (
          <CategoryView
            key={cat.id}
            event={event}
            cfg={cfg}
            cat={cat}
            matches={matches}
            names={names}
            now={now}
            organize={organize}
            busy={pending.isBusy}
            view={(search.get('ver') as View | null) ?? (cat.seeds?.length ? 'cuadro' : 'grupos')}
            onView={(v) => set({ ver: v })}
            onEdit={() => setEditing(cat.id)}
            saveCat={(c) => saveConfig(putCategory(c))}
            onRun={withBusy}
            leagueRules={leagueRules}
          />
        )}
      </div>

      {/* Los premios del torneo, al final. */}
      {n > 0 && (
        <div className="mt-[30px] empty:hidden">
          <TourneyPrizes event={event} cfg={cfg} matches={matches} names={names} now={now} />
        </div>
      )}

      <NoticeSlot className="mt-4" />

      {cat && editing === cat.id && (
        <CategoryEditor
          cfg={cfg}
          cat={cat}
          busy={pending.isBusy}
          onClose={() => setEditing(null)}
          onRemove={
            matches.some((m) => m.stage.startsWith(`${cat.name} ·`))
              ? undefined
              : () =>
                  void withBusy('borrar-cat', async () => {
                    await saveConfig({ ...cfg, categories: cfg.categories.filter((c) => c.id !== cat.id) });
                    setEditing(null);
                  }, 'Categoría borrada')
          }
          onSave={(c, rev) =>
            void withBusy('guardar-cat', async () => {
              await saveConfig(putCategory(c), rev);
              setEditing(null);
            }, 'Categoría guardada')
          }
        />
      )}

      {sheet === 'reporte' && <ReportSheet open onClose={() => setSheet(null)} report={report.report} comp={report.comp ?? null} />}
      {sheet === 'anotadores' && (
        <ScorersSheet
          open
          onClose={() => setSheet(null)}
          target={{ scope: 'evento', refId: event.id, title: event.name || (league.kind === 'torneo' ? league.name : title) }}
          participants={cfg.categories.flatMap((c) => entrantPlayers(c.pairs, names))}
        />
      )}

      {isAdmin && (
        <SignupSettingsModal
          open={editing === 'inscripcion'}
          value={cfg.signup ?? null}
          busy={pending.isBusy('inscripcion')}
          disabled={pending.isBusy()}
          unit={side}
          perCategory
          defaultCap={8}
          tz={league.tz}
          onClose={() => setEditing(null)}
          onSave={(s) =>
            void withBusy(
              'inscripcion',
              async () => {
                if (s) await saveConfig({ ...cfg, signup: s });
                setEditing(null);
              },
              s?.open ? 'Inscripción abierta' : 'Inscripción cerrada',
            )
          }
        />
      )}
    </div>
  );
}

function CategoryView({
  event,
  cfg,
  cat,
  matches,
  names,
  now,
  organize,
  busy,
  view,
  onView,
  onEdit,
  saveCat,
  onRun,
  leagueRules,
}: {
  event: RacketEvent;
  cfg: TourneyConfig;
  cat: TourneyCategory;
  matches: Match[];
  names: Names;
  now: number;
  /** Quien organiza, en Pro: arma grupos y cuadro y edita la categoría. */
  organize: boolean;
  /** Sin clave: si hay algo guardándose; con clave: si es eso. */
  busy: (key?: Pending) => boolean;
  view: View;
  onView: (v: View) => void;
  onEdit: () => void;
  /** Guarda la categoría (lanza el error: lo muestra `onRun`). */
  saveCat: (c: TourneyCategory) => Promise<void>;
  onRun: (key: Pending, fn: () => Promise<void>, ok: string) => Promise<void>;
  leagueRules: Record<string, unknown>;
}) {
  const { lid, league, myPlayerId } = useLeagueCtx();
  const { sport, doubles, side } = useRacket();
  const param = useMatchParam();
  const mySideOf = useMySide();
  const { confirm } = useFeedback();
  const hasGroups = !!cat.groupsOf?.length;
  const tables = useMemo(() => (hasGroups ? groupTables(sport, cat, matches, { scheme: cfg.points, now }) : []), [hasGroups, sport, cat, matches, cfg.points, now]);
  const done = groupsDone(cat, matches, now);
  const bracket = useMemo(() => categoryBracket(cat, matches, now), [cat, matches, now]);
  const catMatches = matches.filter((m) => m.stage.startsWith(`${cat.name} ·`));
  const highlight = doubles ? names.teamsOf(myPlayerId) : myPlayerId ? [myPlayerId] : [];
  const entrants = names.entrants(cat.pairs);
  const rules = leagueRules;

  const createGroups = () =>
    onRun('grupos', async () => {
      const groups = makeGroups(cat);
      const next = { ...cat, groupsOf: groups };
      await saveCat(next);
      await createMatches(lid, groupDrafts(next, groups, entrants, { eventId: event.id, rules }));
    }, 'Partidos de los grupos listos');

  const missingGroupMatches = () =>
    onRun('faltan', async () => {
      const all = groupDrafts(cat, cat.groupsOf ?? [], entrants, { eventId: event.id, rules });
      const exists = (a: string, b: string, stage: string) =>
        matches.some((m) => m.stage === stage && ((entrantKey(m.sides[0]) === a && entrantKey(m.sides[1]) === b) || (entrantKey(m.sides[0]) === b && entrantKey(m.sides[1]) === a)));
      const missing = all.filter((d) => !exists(d.sides[0].teamId ?? d.sides[0].players?.[0]?.playerId ?? '', d.sides[1].teamId ?? d.sides[1].players?.[0]?.playerId ?? '', d.stage ?? ''));
      if (missing.length) await createMatches(lid, missing);
    }, 'Partidos creados');

  const undoGroups = async () => {
    const list = catMatches;
    if (list.some((m) => m.status !== 'scheduled' || m.seq > 0)) return;
    if (!(await confirm({ title: '¿Deshacer los grupos?', message: 'Se borran los partidos de los grupos (ninguno ha empezado).', confirmText: 'Deshacer', danger: true }))) return;
    await onRun('deshacer', async () => {
      for (const m of list) await deleteMatch(lid, m.id);
      await saveCat({ ...cat, groupsOf: undefined, seeds: undefined });
    }, 'Grupos deshechos');
  };

  const buildBracket = (seeds: string[]) =>
    onRun('cuadro', async () => {
      const next = { ...cat, seeds };
      await saveCat(next);
      const b = categoryBracket(next, matches, now);
      if (b) {
        const todo = bracketTodo(next, b, matches);
        if (todo.create.length) await createMatches(lid, bracketDrafts(next, b, todo.create, names.entrants(seeds), { eventId: event.id, rules }));
      }
      onView('cuadro');
    }, 'Partidos del cuadro listos');

  const advance = (b: Bracket) =>
    onRun('avanzar', async () => {
      const todo = bracketTodo(cat, b, matches);
      const all = names.entrants(cat.seeds ?? []);
      if (todo.create.length) await createMatches(lid, bracketDrafts(cat, b, todo.create, all, { eventId: event.id, rules }));
      for (const u of todo.update) {
        const [a, c] = bracketSides(u.bm, all);
        await setMatchSides(lid, u.match.id, [a, c]);
      }
    }, 'Cuadro al día');

  const card = (m: Match) => <MatchCard key={m.id} match={m} mySide={mySideOf(m)} tz={league.tz} now={now} onClick={() => param.open(m.id)} />;

  // Sin grupos ni cuadro todavía.
  if (!hasGroups && !cat.seeds?.length) {
    return (
      <Card className="px-5 pt-[18px] pb-5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-card-title-pro">{cat.name}</p>
            <p className="mt-1 text-meta text-fg-2">
              {cat.pairs.length} {cat.pairs.length === 1 ? side[0] : side[1]} · {cat.groups > 0 ? `${cat.groups} grupos, pasan ${cat.perGroup}` : 'cuadro directo'}
              {cat.thirdPlace ? ' · con 3.er lugar' : ''}
            </p>
          </div>
          {organize && (
            <Button variant="quiet" className="h-11 shrink-0 rounded-full px-4" icon={<Settings2 className="size-4" />} onClick={onEdit}>
              Editar
            </Button>
          )}
        </div>
        {cat.pairs.length > 0 && (
          <ol className="mt-3 flex flex-col">
            {cat.pairs.map((id, i) => (
              <li key={id} className={cx('flex min-h-11 items-center gap-3', i > 0 && 'border-t border-line')}>
                <span className="w-5 text-center text-[15px] font-semibold text-muted tabular-nums">{i + 1}</span>
                <span className={cx('min-w-0 truncate text-[15px] font-semibold', highlight.includes(id) && 'text-accent')}>{names.entrantName(id)}</span>
              </li>
            ))}
          </ol>
        )}
        {organize ? (
          cat.pairs.length < 2 ? (
            <p className="mt-3 text-sm font-semibold text-danger">Elige al menos 2 {side[1]} en «Editar».</p>
          ) : cat.groups > 0 ? (
            <Button variant="primary" size="xl" className="mt-4 w-full" loading={busy('grupos')} disabled={busy()} icon={<Rows3 className="size-5" />} onClick={() => void createGroups()}>
              Armar los grupos
            </Button>
          ) : (
            <Button variant="primary" size="xl" className="mt-4 w-full" loading={busy('cuadro')} disabled={busy()} icon={<GitFork className="size-5" />} onClick={() => void buildBracket(cat.pairs)}>
              Armar el cuadro
            </Button>
          )
        ) : (
          <p className="mt-3 text-meta text-muted">Cuando se armen los grupos o el cuadro, salen aquí.</p>
        )}
      </Card>
    );
  }

  const q = hasGroups && done.done && !cat.seeds?.length ? qualifiers(sport, cat, matches, { scheme: cfg.points, now }) : [];
  const todo = bracket ? bracketTodo(cat, bracket, matches) : null;
  const pending = todo ? todo.create.length + todo.update.length : 0;
  const medals = bracket ? podium(bracket) : [];
  const shown: View = !hasGroups && view === 'grupos' ? 'cuadro' : view;

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        full
        label="Qué ver de la categoría"
        options={[
          ...(hasGroups ? [{ key: 'grupos' as View, label: 'Grupos', icon: <ListOrdered aria-hidden="true" className="size-4 max-[359px]:hidden" /> }] : []),
          { key: 'cuadro' as View, label: 'Cuadro', icon: <GitFork aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
          { key: 'partidos' as View, label: 'Partidos', icon: <Rows3 aria-hidden="true" className="size-4 max-[359px]:hidden" /> },
        ]}
        value={shown}
        onChange={onView}
      />

      {shown === 'grupos' && hasGroups && (
        <div className="flex flex-col gap-6">
          {organize && done.missing > 0 && (
            <Button variant="quiet" size="lg" className="w-full" loading={busy('faltan')} disabled={busy()} onClick={() => void missingGroupMatches()}>
              Crear los {done.missing} partidos que faltan
            </Button>
          )}
          {cat.groupsOf!.map((_, g) => {
            const list = groupMatches(cat, g, matches);
            return (
              <section key={g} aria-labelledby={`grupo-${cat.id}-${g}`}>
                <SectionHeader id={`grupo-${cat.id}-${g}`} title={groupStage(cat, g)} />
                <StandingsTable rows={tables[g] ?? []} nameOf={names.entrantName} columns={racketColumns(sport)} highlight={highlight} empty="Todavía no hay resultados." />
                {list.length > 0 && (
                  <details className="group mt-2.5">
                    <summary className="mx-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-meta font-semibold text-accent [&::-webkit-details-marker]:hidden">
                      Partidos del grupo ({list.length})
                    </summary>
                    <div className="mt-1 grid gap-2.5 sm:grid-cols-2">{list.map(card)}</div>
                  </details>
                )}
              </section>
            );
          })}
          {organize && !cat.seeds?.length && (
            <Card className="px-5 pt-[18px] pb-5">
              <p className="text-card-title-pro">Cuadro</p>
              {done.done ? (
                <>
                  <p className="mt-1.5 text-meta text-fg-2">
                    Pasan {q.length}: {q.map((x) => `${x.label} ${names.entrantName(x.id)}`).join(' · ')}
                  </p>
                  <Button variant="primary" size="xl" className="mt-4 w-full" loading={busy('cuadro')} disabled={busy()} icon={<GitFork className="size-5" />} onClick={() => void buildBracket(q.map((x) => x.id))}>
                    Armar el cuadro
                  </Button>
                </>
              ) : (
                <p className="mt-1.5 text-meta text-fg-2">
                  Cuando terminen los grupos ({done.pending} {done.pending === 1 ? 'partido' : 'partidos'} por jugar o confirmar) se arma: 1A contra 2B, 1B contra 2A…
                </p>
              )}
              {catMatches.every((m) => m.status === 'scheduled' && m.seq === 0) && (
                <Button variant="quiet" size="lg" className="mt-2.5 w-full" loading={busy('deshacer')} disabled={busy()} onClick={() => void undoGroups()}>
                  Deshacer los grupos
                </Button>
              )}
            </Card>
          )}
        </div>
      )}

      {shown === 'cuadro' &&
        (bracket ? (
          <div className="flex flex-col gap-4">
            {medals[0] ? (
              <Card className="px-5 pt-[18px] pb-4">
                <p className="flex items-center gap-2 text-card-title-pro">
                  <Trophy aria-hidden="true" className="size-5 text-gold" /> Podio
                </p>
                <ol className="mt-2.5 flex flex-col">
                  {medals.map((id, i) =>
                    id ? (
                      <li key={i} className={cx('flex min-h-11 items-center gap-3', i > 0 && 'border-t border-line')}>
                        <span className="w-5 text-center text-[15px] font-semibold text-muted tabular-nums">{i + 1}</span>
                        <span className="min-w-0 truncate text-[15px] font-semibold">{names.entrantName(id)}</span>
                      </li>
                    ) : null,
                  )}
                </ol>
                <CategoryPrize eventId={event.id} catId={cat.id} className="mt-2 border-t border-line pt-3" />
              </Card>
            ) : (
              <CategoryPrize eventId={event.id} catId={cat.id} className="px-1" />
            )}
            {organize && pending > 0 && (
              <Button variant="primary" size="lg" className="w-full" loading={busy('avanzar')} disabled={busy()} icon={<Wand2 className="size-5" />} onClick={() => void advance(bracket)}>
                Pasar ganadores al cuadro ({pending})
              </Button>
            )}
            <BracketView
              bracket={bracket}
              nameOf={names.entrantName}
              highlight={highlight}
              matchOf={(key) => matches.find((m) => m.bracketKey === `${cat.id}-${key}` && m.status !== 'void')}
              onMatch={(bm) => {
                const m = matches.find((x) => x.bracketKey === `${cat.id}-${bm.key}` && x.status !== 'void');
                if (m) param.open(m.id);
              }}
            />
          </div>
        ) : (
          <Empty icon={<GitFork className="size-8" />} title="El cuadro todavía no está">
            Se arma cuando terminen los grupos.
          </Empty>
        ))}

      {shown === 'partidos' && (catMatches.length ? <div className="grid gap-2.5 sm:grid-cols-2">{catMatches.map(card)}</div> : <Empty title="Sin partidos todavía" />)}
    </div>
  );
}

/** Editar la categoría: nombre, parejas en orden de siembra (por nivel), grupos, clasificados y 3.er lugar. */
function CategoryEditor({
  cfg,
  cat,
  busy,
  onClose,
  onSave,
  onRemove,
}: {
  cfg: TourneyConfig;
  cat: TourneyCategory;
  busy: (key?: Pending) => boolean;
  onClose: () => void;
  /** `rev` = la versión de la lista cuando se abrió (para no perder a quien se apunte mientras tanto). */
  onSave: (c: TourneyCategory, rev: number | undefined) => void;
  onRemove?: () => void;
}) {
  const { doubles, side } = useRacket();
  const names = useNames();
  const { levels, scale } = useLevels();
  const [draft, setDraft] = useState<TourneyCategory>(cat);
  const [rev] = useState(cfg.signup?.rev);
  const locked = !!cat.groupsOf?.length || !!cat.seeds?.length;
  const taken = new Set(cfg.categories.filter((c) => c.id !== cat.id).flatMap((c) => c.pairs));
  const levelOf = (id: string) => {
    const ids = doubles ? names.rosterOf(id) : [id];
    const known = ids.map((p) => levels[p]).filter((x): x is number => x != null);
    return known.length ? Math.round(known.reduce((a, b) => a + b, 0) * 1000) / 1000 : null;
  };
  const items = (doubles ? names.teams.map((t) => ({ id: t.id, name: t.name })) : names.players.map((p) => ({ id: p.id, name: p.name })))
    .filter((x) => !taken.has(x.id))
    .map((x) => ({ ...x, sub: levelOf(x.id) != null ? levelText(levelOf(x.id)!, scale) : undefined }));
  const move = (i: number, d: -1 | 1) => {
    const p = [...draft.pairs];
    const j = i + d;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    setDraft({ ...draft, pairs: p });
  };
  const byLevel = () => setDraft({ ...draft, pairs: [...draft.pairs].sort((a, b) => (levelOf(b) ?? -1) - (levelOf(a) ?? -1)) });
  const n = draft.pairs.length;

  return (
    <Sheet
      open
      onClose={onClose}
      title={cat.name}
      subtitle={locked ? 'Los grupos o el cuadro ya se armaron' : `${n} ${n === 1 ? side[0] : side[1]}`}
      footer={
        <div className="flex flex-col gap-2">
          <SaveFooter onClose={onClose} busy={busy('guardar-cat')} disabled={busy()} onSave={() => onSave({ ...draft, name: draft.name.trim() || cat.name }, rev)} />
          {onRemove && (
            <Button variant="ghost" className="h-11 w-full text-danger" icon={<Trash2 className="size-4" />} loading={busy('borrar-cat')} disabled={busy()} onClick={onRemove}>
              Borrar categoría
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5 pb-1">
        <Field label="Nombre">
          <Input value={draft.name} maxLength={24} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={locked} />
        </Field>
        {locked ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-2">Para cambiar las {side[1]}, deshaz los grupos primero.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stepper label="Grupos (0 = cuadro)" value={draft.groups} min={0} max={Math.max(0, Math.floor(n / 2))} onChange={(groups) => setDraft({ ...draft, groups })} />
              <Stepper label="Pasan de cada grupo" value={draft.perGroup} min={1} max={4} onChange={(perGroup) => setDraft({ ...draft, perGroup })} />
            </div>
            <p className="-mt-2 text-[13px] text-muted">
              Con {n}: {suggestGroups(n) ? `${suggestGroups(n)} grupos` : 'cuadro directo'}.{' '}
              <button type="button" className="-my-3 inline-flex min-h-11 items-center font-semibold text-accent" onClick={() => setDraft({ ...draft, groups: suggestGroups(n) })}>
                Usar
              </button>
            </p>
            <ToggleRow checked={draft.thirdPlace} onChange={(thirdPlace) => setDraft({ ...draft, thirdPlace })} label="Partido por el 3.er lugar" />
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-semibold">Siembra (el mejor primero)</p>
                <Button variant="soft" className="h-10 rounded-full" icon={<Shuffle className="size-4" />} onClick={byLevel}>
                  Por nivel
                </Button>
              </div>
              {draft.pairs.length ? (
                <Card className="overflow-hidden">
                  {draft.pairs.map((id, i) => (
                    <div key={id} className="mm-row relative flex min-h-12 items-center gap-2 pr-2 pl-4">
                      <span className="w-5 text-center text-sm font-semibold text-muted tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{names.entrantName(id)}</span>
                      {levelOf(id) != null && <span className="text-[13px] text-muted">{levelOf(id)}</span>}
                      <Button variant="ghost" className="size-11 rounded-full" icon={<ArrowUp className="size-4" />} aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} />
                      <Button variant="ghost" className="size-11 rounded-full" icon={<ArrowDown className="size-4" />} aria-label="Bajar" disabled={i === draft.pairs.length - 1} onClick={() => move(i, 1)} />
                    </div>
                  ))}
                </Card>
              ) : (
                <p className="text-sm text-muted">Elige abajo las {side[1]} de esta categoría.</p>
              )}
            </div>
            <PickList
              items={items}
              selected={new Set(draft.pairs)}
              onToggle={(id) => setDraft({ ...draft, pairs: draft.pairs.includes(id) ? draft.pairs.filter((x) => x !== id) : [...draft.pairs, id] })}
              empty={doubles ? 'No hay parejas libres: ármalas en Organizar › Parejas y niveles.' : 'No hay jugadores libres.'}
            />
          </>
        )}
      </div>
    </Sheet>
  );
}
