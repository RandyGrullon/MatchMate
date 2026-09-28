import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowDown, ArrowUp, ClipboardList, Download, GitFork, ListOrdered, Plus, Rows3, Settings2, Shuffle, Trash2, Trophy, Wand2 } from 'lucide-react';
import { deleteEvent } from '../../../../lib/data';
import { createMatches, deleteMatch, setMatchSides, useMatches, type Match } from '../../../../lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '../../../../lib/data/racket';
import { formatDateLong } from '../../../../lib/format';
import { useLeagueCtx } from '../../../../lib/league';
import { useNow } from '../../../../lib/useNow';
import { podium, type Bracket } from '../../../../sports/formats';
import { useFeedback, saveErrorMessage } from '../../../../components/feedback';
import { BackLink } from '../../../../components/BackLink';
import { BracketView, MatchCard, StandingsTable } from '../../../../components/match';
import { Badge, Button, Card, Empty, Field, Input, ListSkeleton, Modal, Position, Tabs, cx } from '../../../../components/ui';
import { Chips, PickList, Section, Stepper, racketColumns } from '../bits';
import { exportCompetitionExcel } from '../excel';
import { entrantKey, forLabel, seasonPlayerTable, setsLabel } from '../logic/results';
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
import { SignupSettingsModal } from '../signup/SignupFields';
import { SignupPanel } from '../signup/SignupPanel';
import { MatchDetail, useMatchParam, useMySide } from '../match/MatchDetail';
import { levelText, useLevels } from '../levels';
import { useNames, type Names } from '../names';
import { useRacket } from '../sport';

type View = 'grupos' | 'cuadro' | 'partidos';

/**
 * Torneo por categorías: cada categoría con sus parejas sembradas por nivel, grupos en zigzag (todos contra
 * todos), cruces 1A–2B y cuadro con pases directos y 3.er lugar opcional (o cuadro directo sin grupos). Antes de
 * armar grupos o cuadro, la inscripción «Me apunto» por categoría (cupo, fecha límite y lista de espera) si el
 * admin la abrió; el admin sigue eligiendo a mano en «Editar».
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
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const title = event.name || 'Torneo';

  if (param.id) return <MatchDetail matchId={param.id} eventId={event.id} title={title} onBack={param.close} />;

  const catId = search.get('cat') ?? cfg.categories[0]?.id ?? null;
  const cat = cfg.categories.find((c) => c.id === catId) ?? cfg.categories[0] ?? null;
  const set = (patch: Record<string, string>) => setSearch({ ...Object.fromEntries(search), ...patch }, { replace: true });

  const started = tourneyStarted(cfg) || matches.length > 0;
  /** Guarda la configuración. `rev` = la versión de la lista que se editó (si alguien se apuntó mientras tanto, no se pierde). */
  const saveConfig = async (next: TourneyConfig, rev?: number) => {
    const signup = next.signup && rev != null ? { ...next.signup, rev } : next.signup;
    await updateRacketEvent(lid, event.id, { config: tourneyConfigJson({ ...next, signup }) });
  };
  const withBusy = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const putCategory = (c: TourneyCategory) => ({ ...cfg, categories: cfg.categories.map((x) => (x.id === c.id ? c : x)) });

  const addCategory = () =>
    withBusy(async () => {
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

  const excel = () =>
    exportCompetitionExcel({
      title,
      date: event.date,
      matches,
      tables: cfg.categories.flatMap((c) => groupTables(sport, c, matches, { scheme: cfg.points, now }).map((rows, g) => ({ name: groupStage(c, g), rows }))),
      players: seasonPlayerTable(matches, { sport, rosterOf: names.rosterOf, now }),
      entrantName: names.entrantName,
      nameOf: names.nameOf,
      tz: league.tz,
      forLabel: forLabel(sport),
      setsLabel: setsLabel(sport),
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
            <Badge tone="accent">
              <Trophy className="size-3" /> Torneo
            </Badge>
          </div>
          <p className="text-sm text-muted first-letter:uppercase">
            {formatDateLong(event.date)} · {cfg.categories.length} {cfg.categories.length === 1 ? 'categoría' : 'categorías'} · {event.playerCount} {side[1]}
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {cfg.categories.length < CATEGORY_IDS.length && (
            <Button size="sm" icon={<Plus className="size-4" />} loading={busy} onClick={() => void addCategory()}>
              Categoría
            </Button>
          )}
          {!started && cfg.categories.length > 0 && (
            <Button size="sm" icon={<ClipboardList className="size-4" />} onClick={() => setEditing('inscripcion')}>
              Inscripción
            </Button>
          )}
          <Button size="sm" icon={<Download className="size-4" />} onClick={() => void excel()} disabled={!matches.length}>
            Excel
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => void remove()}>
            Borrar
          </Button>
        </div>
      )}

      {cfg.signup && !started && cfg.categories.length > 0 && (
        <SignupPanel
          event={event}
          settings={cfg.signup}
          lists={cfg.categories.map((c) => ({ category: c.id, name: c.name, listed: c.pairs }))}
          started={started}
          onEdit={isAdmin ? () => setEditing('inscripcion') : undefined}
        />
      )}

      {cfg.categories.length > 1 && <Chips items={cfg.categories.map((c) => ({ key: c.id, label: c.name }))} value={cat?.id ?? ''} onChange={(k) => set({ cat: k })} />}

      {!cat ? (
        <Empty icon={<Trophy className="size-8" />} title="Sin categorías">
          {isAdmin ? 'Agrega una categoría con el botón de arriba.' : 'El torneo todavía no tiene categorías.'}
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
          busy={busy}
          view={(search.get('ver') as View | null) ?? (cat.seeds?.length ? 'cuadro' : 'grupos')}
          onView={(v) => set({ ver: v })}
          onEdit={() => setEditing(cat.id)}
          saveCat={(c) => saveConfig(putCategory(c))}
          onRun={withBusy}
          leagueRules={leagueRules}
        />
      )}

      {cat && editing === cat.id && (
        <CategoryEditor
          cfg={cfg}
          cat={cat}
          busy={busy}
          onClose={() => setEditing(null)}
          onRemove={
            matches.some((m) => m.stage.startsWith(`${cat.name} ·`))
              ? undefined
              : () =>
                  void withBusy(async () => {
                    await saveConfig({ ...cfg, categories: cfg.categories.filter((c) => c.id !== cat.id) });
                    setEditing(null);
                  }, 'Categoría borrada')
          }
          onSave={(c, rev) =>
            void withBusy(async () => {
              await saveConfig(putCategory(c), rev);
              setEditing(null);
            }, 'Categoría guardada')
          }
        />
      )}

      {isAdmin && (
        <SignupSettingsModal
          open={editing === 'inscripcion'}
          value={cfg.signup ?? null}
          busy={busy}
          unit={side}
          perCategory
          defaultCap={8}
          tz={league.tz}
          onClose={() => setEditing(null)}
          onSave={(s) =>
            void withBusy(
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
  busy: boolean;
  view: View;
  onView: (v: View) => void;
  onEdit: () => void;
  /** Guarda la categoría (lanza el error: lo muestra `onRun`). */
  saveCat: (c: TourneyCategory) => Promise<void>;
  onRun: (fn: () => Promise<void>, ok: string) => Promise<void>;
  leagueRules: Record<string, unknown>;
}) {
  const { lid, isAdmin, league, myPlayerId } = useLeagueCtx();
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
    onRun(async () => {
      const groups = makeGroups(cat);
      const next = { ...cat, groupsOf: groups };
      await saveCat(next);
      await createMatches(lid, groupDrafts(next, groups, entrants, { eventId: event.id, rules }));
    }, 'Partidos de los grupos listos');

  const missingGroupMatches = () =>
    onRun(async () => {
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
    await onRun(async () => {
      for (const m of list) await deleteMatch(lid, m.id);
      await saveCat({ ...cat, groupsOf: undefined, seeds: undefined });
    }, 'Grupos deshechos');
  };

  const buildBracket = (seeds: string[]) =>
    onRun(async () => {
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
    onRun(async () => {
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
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{cat.name}</p>
            <p className="text-sm text-muted">
              {cat.pairs.length} {cat.pairs.length === 1 ? side[0] : side[1]} ·{' '}
              {cat.groups > 0 ? `${cat.groups} grupos, pasan ${cat.perGroup} de cada uno` : 'cuadro directo'}
              {cat.thirdPlace ? ' · con 3.er lugar' : ''}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" icon={<Settings2 className="size-4" />} onClick={onEdit}>
              Editar
            </Button>
          )}
        </div>
        {cat.pairs.length > 0 && (
          <ol className="flex flex-col gap-1 text-sm">
            {cat.pairs.map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                <span className={cx('truncate', highlight.includes(id) && 'font-semibold text-accent')}>{names.entrantName(id)}</span>
              </li>
            ))}
          </ol>
        )}
        {isAdmin ? (
          cat.pairs.length < 2 ? (
            <p className="text-sm text-warn">Elige al menos 2 {side[1]} en «Editar».</p>
          ) : cat.groups > 0 ? (
            <Button variant="primary" className="h-12" loading={busy} icon={<Rows3 className="size-5" />} onClick={() => void createGroups()}>
              Armar los grupos
            </Button>
          ) : (
            <Button variant="primary" className="h-12" loading={busy} icon={<GitFork className="size-5" />} onClick={() => void buildBracket(cat.pairs)}>
              Armar el cuadro
            </Button>
          )
        ) : (
          <p className="text-sm text-muted">Cuando el admin arme los grupos o el cuadro, salen aquí.</p>
        )}
      </Card>
    );
  }

  const q = hasGroups && done.done && !cat.seeds?.length ? qualifiers(sport, cat, matches, { scheme: cfg.points, now }) : [];
  const todo = bracket ? bracketTodo(cat, bracket, matches) : null;
  const pending = todo ? todo.create.length + todo.update.length : 0;
  const medals = bracket ? podium(bracket) : [];

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        items={[
          ...(hasGroups ? [{ key: 'grupos' as View, label: 'Grupos', icon: <ListOrdered className="size-4" /> }] : []),
          { key: 'cuadro' as View, label: 'Cuadro', icon: <GitFork className="size-4" /> },
          { key: 'partidos' as View, label: 'Partidos', icon: <Rows3 className="size-4" /> },
        ]}
        active={!hasGroups && view === 'grupos' ? 'cuadro' : view}
        onChange={onView}
      />

      {view === 'grupos' && hasGroups && (
        <div className="flex flex-col gap-4">
          {isAdmin && done.missing > 0 && (
            <Button className="h-11" loading={busy} onClick={() => void missingGroupMatches()}>
              Crear los {done.missing} partidos que faltan
            </Button>
          )}
          {cat.groupsOf!.map((_, g) => (
            <Section key={g} title={groupStage(cat, g)}>
              <StandingsTable rows={tables[g] ?? []} nameOf={names.entrantName} columns={racketColumns(sport)} highlight={highlight} empty="Todavía no hay resultados." />
              <details className="rounded-2xl border border-line bg-surface px-4 py-2">
                <summary className="cursor-pointer text-sm font-medium">Partidos del grupo ({groupMatches(cat, g, matches).length})</summary>
                <div className="mt-2 grid gap-2 pb-2 sm:grid-cols-2">{groupMatches(cat, g, matches).map(card)}</div>
              </details>
            </Section>
          ))}
          {isAdmin && !cat.seeds?.length && (
            <Card className="flex flex-col gap-2 p-4">
              <p className="font-semibold">Cuadro</p>
              {done.done ? (
                <>
                  <p className="text-sm text-muted">
                    Pasan {q.length}: {q.map((x) => `${x.label} ${names.entrantName(x.id)}`).join(' · ')}
                  </p>
                  <Button variant="primary" className="h-12" loading={busy} icon={<GitFork className="size-5" />} onClick={() => void buildBracket(q.map((x) => x.id))}>
                    Armar el cuadro con los clasificados
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Cuando terminen los grupos ({done.pending} {done.pending === 1 ? 'partido' : 'partidos'} por jugar o confirmar) se arma el cuadro: 1A contra 2B, 1B
                  contra 2A…
                </p>
              )}
              {catMatches.every((m) => m.status === 'scheduled' && m.seq === 0) && (
                <Button size="sm" variant="ghost" className="self-start" onClick={() => void undoGroups()}>
                  Deshacer los grupos
                </Button>
              )}
            </Card>
          )}
        </div>
      )}

      {(view === 'cuadro' || (!hasGroups && view === 'grupos')) &&
        (bracket ? (
          <div className="flex flex-col gap-3">
            {medals[0] && (
              <Card className="flex flex-col gap-1.5 p-4">
                {medals.map((id, i) =>
                  id ? (
                    <div key={i} className="flex items-center gap-3">
                      <Position pos={i + 1} />
                      <span className="truncate font-medium">{names.entrantName(id)}</span>
                    </div>
                  ) : null,
                )}
              </Card>
            )}
            {isAdmin && pending > 0 && (
              <Button variant="primary" className="h-12" loading={busy} icon={<Wand2 className="size-5" />} onClick={() => void advance(bracket)}>
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

      {view === 'partidos' && (catMatches.length ? <div className="grid gap-2 sm:grid-cols-2">{catMatches.map(card)}</div> : <Empty title="Sin partidos todavía" />)}
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
  busy: boolean;
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
    <Modal
      open
      onClose={onClose}
      wide
      title={cat.name}
      footer={
        <>
          {onRemove && (
            <Button variant="ghost" icon={<Trash2 className="size-4" />} onClick={onRemove}>
              Borrar categoría
            </Button>
          )}
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" loading={busy} onClick={() => onSave({ ...draft, name: draft.name.trim() || cat.name }, rev)}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input value={draft.name} maxLength={24} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={locked} />
        </Field>
        {locked ? (
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Los grupos o el cuadro ya se armaron: para cambiar las {side[1]}, deshaz los grupos primero.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stepper label="Grupos (0 = cuadro directo)" value={draft.groups} min={0} max={Math.max(0, Math.floor(n / 2))} onChange={(groups) => setDraft({ ...draft, groups })} />
              <Stepper label="Pasan de cada grupo" value={draft.perGroup} min={1} max={4} onChange={(perGroup) => setDraft({ ...draft, perGroup })} />
            </div>
            <p className="text-xs text-muted">
              Recomendado con {n}: {suggestGroups(n) ? `${suggestGroups(n)} grupos` : 'cuadro directo'}.{' '}
              <button type="button" className="font-medium text-accent" onClick={() => setDraft({ ...draft, groups: suggestGroups(n) })}>
                Usar
              </button>
            </p>
            <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line px-3">
              <input type="checkbox" checked={draft.thirdPlace} onChange={(e) => setDraft({ ...draft, thirdPlace: e.target.checked })} className="size-5 accent-[var(--accent)]" />
              <span className="text-sm font-medium">Partido por el 3.er lugar</span>
            </label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Siembra (el mejor primero)</p>
                <Button size="sm" icon={<Shuffle className="size-4" />} onClick={byLevel}>
                  Por nivel
                </Button>
              </div>
              {draft.pairs.length ? (
                <Card className="divide-y divide-line overflow-hidden">
                  {draft.pairs.map((id, i) => (
                    <div key={id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{names.entrantName(id)}</span>
                      {levelOf(id) != null && <span className="text-xs text-muted">{levelOf(id)}</span>}
                      <Button size="sm" variant="ghost" icon={<ArrowUp className="size-4" />} aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)} />
                      <Button size="sm" variant="ghost" icon={<ArrowDown className="size-4" />} aria-label="Bajar" disabled={i === draft.pairs.length - 1} onClick={() => move(i, 1)} />
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
              empty={doubles ? 'No hay parejas libres: ármalas en Admin › Parejas y niveles.' : 'No hay jugadores libres.'}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
