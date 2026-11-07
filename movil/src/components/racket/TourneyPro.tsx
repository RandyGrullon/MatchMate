/**
 * El torneo por categorías en Pro (TourneyPage.tsx de la web, con su misma lógica: logic/tourney.ts): «Mié 7 oct · 1
 * categoría · 4 parejas», cada categoría en Grupos · Cuadro · Partidos con el podio. Quien organiza la edita (nombre,
 * siembra por nivel, grupos, clasificados y 3.er lugar), arma los grupos (todos contra todos, en zigzag por la siembra) o
 * el cuadro directo, crea los partidos de grupo que falten, deshace los grupos que no empezaron, arma el cuadro con los
 * que pasan (1A contra 2B…) y pasa a los ganadores. «Nueva categoría» en «•••».
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowDown, ArrowUp, GitFork, Plus, Rows3, Settings2, Shuffle, Trash2, Trophy, Wand2 } from 'lucide-react-native';
import { createMatches, deleteMatch, setMatchSides, useMatches, type Match } from '@mm/lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { racketTourneyComp, racketTourneyFinished } from '@mm/prizes/sports';
import { podium, roundName, type Bracket } from '@mm/sports/formats/knockout';
import { racketTourneyReport } from '@mm/lib/report/racket';
import { eventDay } from '@mm/components/event/eventDay';
import { levelText, useLevels } from '@mm/pages/sports/racket/levels';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
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
  matchAt,
  missingGroupDrafts,
  newCategory,
  parseTourneyConfig,
  qualifiers,
  seedLevel,
  sortBySeedLevel,
  suggestGroups,
  tourneyConfigJson,
  tourneyStarted,
  type TourneyCategory,
  type TourneyConfig,
} from '@mm/pages/sports/racket/logic/tourney';
import { useMySide } from '@mm/pages/sports/racket/match/side';
import { useNames, type Names } from '@mm/pages/sports/racket/names';
import { racketColumns } from '@mm/pages/sports/racket/view';
import { ChoiceChips, ToggleRow } from '../esports/inputs';
import { MatchCard } from '../match/MatchCard';
import { StandingsTable } from '../match/StandingsTable';
import { CategoryPrize, TourneyPrizes } from '../prizes/SportPrizes';
import { ReportButton } from '../tournamentReport/ReportButton';
import { TourneyReport } from '../tournamentReport/SportReports';
import { confirmAsync, toast } from '../feedback';
import { Button, Card, Divider, Empty, Field, Input, Segmented, SectionHeader, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { TourneyMenu } from './EventAdmin';
import { SignupPanel } from './SignupPanel';
import { Note, Pairs, PickList, SaveFooter, ScreenHead, Stepper, useRacketPhone } from './parts';
import { matchRoute } from './RacketHome';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type View3 = 'grupos' | 'cuadro' | 'partidos';
/** Lo que se está guardando: la ruedita va en ese botón y los demás esperan. */
type Pending = 'categoria' | 'grupos' | 'faltan' | 'deshacer' | 'cuadro' | 'avanzar' | 'guardar-cat' | 'borrar-cat';

const Spinner = () => (
  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
    <LogoSpinner size={32} label="Cargando el torneo" />
  </View>
);

export function TourneyPro({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid, league, isAdmin } = useLeagueCtx();
  const { sport, side, leagueRules } = useRacketPhone();
  const names = useNames();
  const now = useNow().getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseTourneyConfig(event.config), [event.config]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [catId, setCatId] = useState<string | null>(null);
  const [views, setViews] = useState<Record<string, View3>>({});
  const [ask, setAsk] = useState<'inscripcion' | null>(null);
  const title = event.name || 'Torneo';
  const finished = racketTourneyFinished(cfg.categories, matches, names, now);
  const cat = cfg.categories.find((x) => x.id === catId) ?? cfg.categories[0] ?? null;
  const started = tourneyStarted(cfg) || matches.length > 0;
  const organize = isAdmin;
  const n = cfg.categories.length;

  /** Guarda la configuración. `rev` = la versión de la lista que se editó (si alguien se apuntó mientras tanto, no se pierde). */
  const saveConfig = async (next: TourneyConfig, rev?: number) => {
    const signup = next.signup && rev != null ? { ...next.signup, rev } : next.signup;
    await updateRacketEvent(lid, event.id, { config: tourneyConfigJson({ ...next, signup }) });
  };
  const run = async (key: Pending, fn: () => Promise<void>, ok: string) => {
    setPending(key);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setPending(null);
    }
  };
  const busy = (key?: Pending) => (key ? pending === key : pending !== null);
  const putCategory = (x: TourneyCategory) => ({ ...cfg, categories: cfg.categories.map((y) => (y.id === x.id ? x : y)) });

  const addCategory = () =>
    run(
      'categoria',
      async () => {
        const id = CATEGORY_IDS.find((x) => !cfg.categories.some((y) => y.id === x));
        if (!id) throw new Error('Máximo de categorías');
        await saveConfig({ ...cfg, categories: [...cfg.categories, newCategory(id)] });
        setCatId(id);
        setEditing(id);
      },
      'Categoría agregada',
    );

  const report = {
    report: () => Promise.resolve(racketTourneyReport({ lid, league, event, title, sport, leagueRules, matches: [...matches], names, now })),
    comp: racketTourneyComp(lid, event, { sport, leagueRules, categories: cfg.categories }),
  };
  const meta = [eventDay(event.date, todayIn(league.tz), true), `${n} ${n === 1 ? 'categoría' : 'categorías'}`, `${event.playerCount} ${event.playerCount === 1 ? side[0] : side[1]}`].join(' · ');

  return (
    <View style={{ gap: 20 }}>
      <ScreenHead
        title={title}
        status={finished ? { text: 'Terminado' } : null}
        meta={meta}
        right={
          <TourneyMenu
            event={event}
            title={title}
            cfg={cfg}
            started={started}
            onNewCategory={organize ? () => void addCategory() : undefined}
            adding={busy('categoria')}
            sheet={ask}
            onSheetClosed={() => setAsk(null)}
          />
        }
      />
      {/* Terminado el torneo, quien organiza tiene el reporte a la mano (para todos está abajo). */}
      {organize && finished && <ReportButton {...report} look="card" disabled={(q.loading && !matches.length) || names.loading} />}
      {/* Antes de armar, «Me apunto» por categoría si quien organiza abrió la inscripción. */}
      {cfg.signup && !started && n > 0 && (
        <SignupPanel
          event={event}
          settings={cfg.signup}
          lists={cfg.categories.map((x) => ({ category: x.id, name: x.name, listed: x.pairs }))}
          started={started}
          onEdit={isAdmin ? () => setAsk('inscripcion') : undefined}
        />
      )}

      {n > 1 &&
        (n <= 3 ? (
          <Segmented<string> label="Categoría" value={cat?.id ?? ''} onChange={setCatId} options={cfg.categories.map((x) => ({ key: x.id, label: x.name }))} />
        ) : (
          <ChoiceChips<string> label="Categoría" scroll value={cat?.id ?? null} onChange={setCatId} items={cfg.categories.map((x) => ({ key: x.id, label: x.name }))} />
        ))}

      {!cat ? (
        <Empty
          icon={<Trophy size={28} color={c.accent} />}
          title="Sin categorías"
          text={organize ? undefined : 'El torneo todavía no tiene categorías.'}
          action={
            organize ? (
              <Button variant="primary" size="lg" icon={<Plus size={16} color={c.accentFg} />} loading={busy('categoria')} onPress={() => void addCategory()}>
                Nueva categoría
              </Button>
            ) : undefined
          }
        />
      ) : q.loading && !matches.length ? (
        <Spinner />
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
          busy={busy}
          view={views[cat.id] ?? (cat.seeds?.length ? 'cuadro' : 'grupos')}
          onView={(v) => setViews({ ...views, [cat.id]: v })}
          onEdit={() => setEditing(cat.id)}
          saveCat={(x) => saveConfig(putCategory(x))}
          onRun={run}
          leagueRules={leagueRules}
        />
      )}

      {/* El reporte del torneo (PDF o Excel) y los premios, al final. */}
      <TourneyReport event={event} title={title} cfg={cfg} matches={matches} names={names} loading={q.loading && !matches.length} />
      {n > 0 && <TourneyPrizes event={event} cfg={cfg} matches={matches} names={names} now={now} />}

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
                  void run(
                    'borrar-cat',
                    async () => {
                      await saveConfig({ ...cfg, categories: cfg.categories.filter((x) => x.id !== cat.id) });
                      setEditing(null);
                    },
                    'Categoría borrada',
                  )
          }
          onSave={(x, rev) =>
            void run(
              'guardar-cat',
              async () => {
                await saveConfig(putCategory(x), rev);
                setEditing(null);
              },
              'Categoría guardada',
            )
          }
        />
      )}
    </View>
  );
}

/** El cuadro por rondas (cuartos, semifinal, final): cada partido con sus dos lados; tocarlo abre el partido. */
export function BracketRounds({ cat, bracket, matches }: { cat: TourneyCategory; bracket: Bracket; matches: readonly Match[] }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const names = useNames();
  return (
    <>
      {Array.from({ length: bracket.rounds }, (_, i) => i + 1).map((r) => (
        <View key={r} style={{ gap: 10 }}>
          <SectionHeader title={roundName(r, bracket.rounds)} />
          <Card padded={false}>
            {bracket.matches
              .filter((bm) => bm.round === r && !bm.thirdPlace)
              .map((bm, i) => {
                const m = matchAt(cat, bm.key, matches);
                const sideText = (id: string | null) => (id ? names.entrantName(id) : bm.bye ? 'Pase directo' : 'Por definir');
                return (
                  <View key={bm.key}>
                    {i > 0 && <Divider inset={16} />}
                    <Pressable disabled={!m} onPress={() => m && router.push(matchRoute(lid, m.id))} style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 2 }}>
                      {[bm.side1, bm.side2].map((id, k) => (
                        <Txt key={k} numberOfLines={1} style={{ fontWeight: bm.winner && bm.winner === id ? '700' : '500', color: bm.winner && bm.winner !== id ? c.muted : c.fg }}>
                          {sideText(id)}
                        </Txt>
                      ))}
                    </Pressable>
                  </View>
                );
              })}
          </Card>
        </View>
      ))}
    </>
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
  /** Quien organiza: arma grupos y cuadro y edita la categoría. */
  organize: boolean;
  /** Sin clave: si hay algo guardándose; con clave: si es eso. */
  busy: (key?: Pending) => boolean;
  view: View3;
  onView: (v: View3) => void;
  onEdit: () => void;
  /** Guarda la categoría (lanza el error: lo muestra `onRun`). */
  saveCat: (x: TourneyCategory) => Promise<void>;
  onRun: (key: Pending, fn: () => Promise<void>, ok: string) => Promise<void>;
  leagueRules: Record<string, unknown>;
}) {
  const c = useColors();
  const { lid, league, myPlayerId } = useLeagueCtx();
  const { sport, doubles, side } = useRacketPhone();
  const mySideOf = useMySide();
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({});
  const hasGroups = !!cat.groupsOf?.length;
  const tables = useMemo(() => (hasGroups ? groupTables(sport, cat, matches, { scheme: cfg.points, now }) : []), [hasGroups, sport, cat, matches, cfg.points, now]);
  const done = groupsDone(cat, matches, now);
  const bracket = useMemo(() => categoryBracket(cat, matches, now), [cat, matches, now]);
  const catMatches = matches.filter((m) => m.stage.startsWith(`${cat.name} ·`));
  const highlight = doubles ? names.teamsOf(myPlayerId) : myPlayerId ? [myPlayerId] : [];
  const entrants = names.entrants(cat.pairs);
  const rules = leagueRules;

  const createGroups = () =>
    onRun(
      'grupos',
      async () => {
        const groups = makeGroups(cat);
        const next = { ...cat, groupsOf: groups };
        await saveCat(next);
        await createMatches(lid, groupDrafts(next, groups, entrants, { eventId: event.id, rules }));
      },
      'Partidos de los grupos listos',
    );

  const missingGroupMatches = () =>
    onRun(
      'faltan',
      async () => {
        const missing = missingGroupDrafts(cat, matches, entrants, { eventId: event.id, rules });
        if (missing.length) await createMatches(lid, missing);
      },
      'Partidos creados',
    );

  const undoGroups = async () => {
    if (catMatches.some((m) => m.status !== 'scheduled' || m.seq > 0)) return;
    if (!(await confirmAsync({ title: '¿Deshacer los grupos?', message: 'Se borran los partidos de los grupos (ninguno ha empezado).', confirmText: 'Deshacer', danger: true }))) return;
    await onRun(
      'deshacer',
      async () => {
        for (const m of catMatches) await deleteMatch(lid, m.id);
        await saveCat({ ...cat, groupsOf: undefined, seeds: undefined });
      },
      'Grupos deshechos',
    );
  };

  const buildBracket = (seeds: string[]) =>
    onRun(
      'cuadro',
      async () => {
        const next = { ...cat, seeds };
        await saveCat(next);
        const b = categoryBracket(next, matches, now);
        if (b) {
          const todo = bracketTodo(next, b, matches);
          if (todo.create.length) await createMatches(lid, bracketDrafts(next, b, todo.create, names.entrants(seeds), { eventId: event.id, rules }));
        }
        onView('cuadro');
      },
      'Partidos del cuadro listos',
    );

  const advance = (b: Bracket) =>
    onRun(
      'avanzar',
      async () => {
        const todo = bracketTodo(cat, b, matches);
        const all = names.entrants(cat.seeds ?? []);
        if (todo.create.length) await createMatches(lid, bracketDrafts(cat, b, todo.create, all, { eventId: event.id, rules }));
        for (const u of todo.update) {
          const [a, x] = bracketSides(u.bm, all);
          await setMatchSides(lid, u.match.id, [a, x]);
        }
      },
      'Cuadro al día',
    );

  const card = (m: Match) => <MatchCard key={m.id} match={m} mySide={mySideOf(m)} tz={league.tz} now={now} onPress={() => router.push(matchRoute(lid, m.id))} />;

  // Sin grupos ni cuadro todavía.
  if (!hasGroups && !cat.seeds?.length) {
    return (
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Txt variant="cardTitle">{cat.name}</Txt>
            <Txt variant="meta" tone="fg2">
              {`${cat.pairs.length} ${cat.pairs.length === 1 ? side[0] : side[1]} · ${cat.groups > 0 ? `${cat.groups} grupos, pasan ${cat.perGroup}` : 'cuadro directo'}${cat.thirdPlace ? ' · con 3.er lugar' : ''}`}
            </Txt>
          </View>
          {organize && (
            <Button icon={<Settings2 size={16} color={c.fg} />} onPress={onEdit}>
              Editar
            </Button>
          )}
        </View>
        {cat.pairs.length > 0 && (
          <View style={{ marginTop: 6 }}>
            {cat.pairs.map((id, i) => (
              <View key={id} style={[styles.seedRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <Txt style={{ width: 20, textAlign: 'center', fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{i + 1}</Txt>
                <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.semibold, color: highlight.includes(id) ? c.accent : c.fg }}>
                  {names.entrantName(id)}
                </Txt>
              </View>
            ))}
          </View>
        )}
        {organize ? (
          cat.pairs.length < 2 ? (
            <Txt tone="danger" style={{ fontSize: 14, fontFamily: font.semibold, marginTop: 6 }}>
              {`Elige al menos 2 ${side[1]} en «Editar».`}
            </Txt>
          ) : cat.groups > 0 ? (
            <View style={{ marginTop: 10 }}>
              <Button variant="primary" size="xl" full loading={busy('grupos')} disabled={busy()} icon={<Rows3 size={20} color={c.accentFg} />} onPress={() => void createGroups()}>
                Armar los grupos
              </Button>
            </View>
          ) : (
            <View style={{ marginTop: 10 }}>
              <Button variant="primary" size="xl" full loading={busy('cuadro')} disabled={busy()} icon={<GitFork size={20} color={c.accentFg} />} onPress={() => void buildBracket(cat.pairs)}>
                Armar el cuadro
              </Button>
            </View>
          )
        ) : (
          <Txt variant="meta" tone="muted" style={{ marginTop: 6 }}>
            Cuando se armen los grupos o el cuadro, salen aquí.
          </Txt>
        )}
      </Card>
    );
  }

  const q = hasGroups && done.done && !cat.seeds?.length ? qualifiers(sport, cat, matches, { scheme: cfg.points, now }) : [];
  const todo = bracket ? bracketTodo(cat, bracket, matches) : null;
  const pendingMoves = todo ? todo.create.length + todo.update.length : 0;
  const medals = bracket ? podium(bracket) : [];
  const shown: View3 = !hasGroups && view === 'grupos' ? 'cuadro' : view;

  return (
    <View style={{ gap: 16 }}>
      <Segmented<View3>
        label="Qué ver de la categoría"
        value={shown}
        onChange={onView}
        options={[...(hasGroups ? [{ key: 'grupos' as View3, label: 'Grupos' }] : []), { key: 'cuadro' as View3, label: 'Cuadro' }, { key: 'partidos' as View3, label: 'Partidos' }]}
      />

      {shown === 'grupos' && hasGroups && (
        <View style={{ gap: 24 }}>
          {organize && done.missing > 0 && (
            <Button size="lg" full loading={busy('faltan')} disabled={busy()} onPress={() => void missingGroupMatches()}>
              {`Crear los ${done.missing} partidos que faltan`}
            </Button>
          )}
          {cat.groupsOf!.map((_, g) => {
            const list = groupMatches(cat, g, matches);
            const open = !!openGroups[g];
            return (
              <View key={g} style={{ gap: 10 }}>
                <SectionHeader title={groupStage(cat, g)} />
                <StandingsTable rows={tables[g] ?? []} nameOf={names.entrantName} columns={racketColumns(sport)} highlight={highlight} empty="Todavía no hay resultados." />
                {list.length > 0 && (
                  <>
                    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpenGroups({ ...openGroups, [g]: !open })} style={{ minHeight: 44, justifyContent: 'center', marginHorizontal: 4 }}>
                      <Txt variant="meta" style={{ fontFamily: font.semibold, color: c.accent }}>{`Partidos del grupo (${list.length})`}</Txt>
                    </Pressable>
                    {open && list.map(card)}
                  </>
                )}
              </View>
            );
          })}
          {organize && !cat.seeds?.length && (
            <Card style={{ gap: 6 }}>
              <Txt variant="cardTitle">Cuadro</Txt>
              {done.done ? (
                <>
                  <Txt variant="meta" tone="fg2">
                    {`Pasan ${q.length}: ${q.map((x) => `${x.label} ${names.entrantName(x.id)}`).join(' · ')}`}
                  </Txt>
                  <View style={{ marginTop: 10 }}>
                    <Button variant="primary" size="xl" full loading={busy('cuadro')} disabled={busy()} icon={<GitFork size={20} color={c.accentFg} />} onPress={() => void buildBracket(q.map((x) => x.id))}>
                      Armar el cuadro
                    </Button>
                  </View>
                </>
              ) : (
                <Txt variant="meta" tone="fg2">
                  {`Cuando terminen los grupos (${done.pending} ${done.pending === 1 ? 'partido' : 'partidos'} por jugar o confirmar) se arma: 1A contra 2B, 1B contra 2A…`}
                </Txt>
              )}
              {catMatches.every((m) => m.status === 'scheduled' && m.seq === 0) && (
                <View style={{ marginTop: 6 }}>
                  <Button size="lg" full loading={busy('deshacer')} disabled={busy()} onPress={() => void undoGroups()}>
                    Deshacer los grupos
                  </Button>
                </View>
              )}
            </Card>
          )}
        </View>
      )}

      {shown === 'cuadro' &&
        (bracket ? (
          <View style={{ gap: 16 }}>
            {medals[0] ? (
              <Card style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Trophy size={20} color={c.gold} />
                  <Txt variant="cardTitle">Podio</Txt>
                </View>
                <View style={{ marginTop: 6 }}>
                  {medals.map((id, i) =>
                    id ? (
                      <View key={i} style={[styles.seedRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                        <Txt style={{ width: 20, textAlign: 'center', fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{i + 1}</Txt>
                        <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.semibold }}>
                          {names.entrantName(id)}
                        </Txt>
                      </View>
                    ) : null,
                  )}
                </View>
                <View style={{ marginTop: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
                  <CategoryPrize eventId={event.id} catId={cat.id} />
                </View>
              </Card>
            ) : (
              <CategoryPrize eventId={event.id} catId={cat.id} />
            )}
            {organize && pendingMoves > 0 && (
              <Button variant="primary" size="lg" full loading={busy('avanzar')} disabled={busy()} icon={<Wand2 size={20} color={c.accentFg} />} onPress={() => void advance(bracket)}>
                {`Pasar ganadores al cuadro (${pendingMoves})`}
              </Button>
            )}
            <BracketRounds cat={cat} bracket={bracket} matches={matches} />
          </View>
        ) : (
          <Empty icon={<GitFork size={28} color={c.accent} />} title="El cuadro todavía no está" text="Se arma cuando terminen los grupos." />
        ))}

      {shown === 'partidos' && (catMatches.length ? <View style={{ gap: 10 }}>{catMatches.map(card)}</View> : <Empty title="Sin partidos todavía" />)}
    </View>
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
  onSave: (x: TourneyCategory, rev: number | undefined) => void;
  onRemove?: () => void;
}) {
  const c = useColors();
  const { doubles, side } = useRacketPhone();
  const names = useNames();
  const { levels, scale } = useLevels();
  const [draft, setDraft] = useState<TourneyCategory>(cat);
  const [rev] = useState(cfg.signup?.rev);
  const locked = !!cat.groupsOf?.length || !!cat.seeds?.length;
  const taken = new Set(cfg.categories.filter((x) => x.id !== cat.id).flatMap((x) => x.pairs));
  const levelOf = (id: string) => seedLevel(doubles ? names.rosterOf(id) : [id], levels);
  const items = (doubles ? names.teams.map((t) => ({ id: t.id, name: t.name })) : names.players.map((p) => ({ id: p.id, name: p.name })))
    .filter((x) => !taken.has(x.id))
    .map((x) => {
      const lv = levelOf(x.id);
      return { ...x, sub: lv != null ? levelText(lv, scale) : undefined };
    });
  const move = (i: number, d: -1 | 1) => {
    const p = [...draft.pairs];
    const j = i + d;
    if (j < 0 || j >= p.length) return;
    [p[i], p[j]] = [p[j], p[i]];
    setDraft({ ...draft, pairs: p });
  };
  const n = draft.pairs.length;
  const suggested = suggestGroups(n);
  const arrow = (a11y: string, Icon: typeof ArrowUp, off: boolean, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: off }} disabled={off} onPress={onPress} style={[styles.arrow, { opacity: off ? 0.35 : 1 }]}>
      <Icon size={18} color={c.fg2} />
    </Pressable>
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={cat.name}
      subtitle={locked ? 'Los grupos o el cuadro ya se armaron' : `${n} ${n === 1 ? side[0] : side[1]}`}
      footer={
        <View style={{ gap: 8 }}>
          <SaveFooter onClose={onClose} busy={busy('guardar-cat')} disabled={busy()} onSave={() => onSave({ ...draft, name: draft.name.trim() || cat.name }, rev)} />
          {onRemove && (
            <Button variant="ghost" full icon={<Trash2 size={16} color={c.danger} />} loading={busy('borrar-cat')} disabled={busy()} onPress={onRemove}>
              <Txt tone="danger" style={{ fontFamily: font.semibold }}>
                Borrar categoría
              </Txt>
            </Button>
          )}
        </View>
      }
    >
      <Field label="Nombre">
        <Input value={draft.name} maxLength={24} editable={!locked} onChangeText={(name) => setDraft({ ...draft, name })} accessibilityLabel="Nombre" />
      </Field>
      {locked ? (
        <Note>{`Para cambiar las ${side[1]}, deshaz los grupos primero.`}</Note>
      ) : (
        <>
          <Pairs>
            <Stepper label="Grupos (0 = cuadro)" value={draft.groups} min={0} max={Math.max(0, Math.floor(n / 2))} onChange={(groups) => setDraft({ ...draft, groups })} />
            <Stepper label="Pasan de cada grupo" value={draft.perGroup} min={1} max={4} onChange={(perGroup) => setDraft({ ...draft, perGroup })} />
          </Pairs>
          <Txt tone="muted" style={{ fontSize: 13 }}>
            {`Con ${n}: ${suggested ? `${suggested} grupos` : 'cuadro directo'}. `}
            <Txt accessibilityRole="button" style={{ fontSize: 13, fontFamily: font.semibold, color: c.accent }} onPress={() => setDraft({ ...draft, groups: suggested })}>
              Usar
            </Txt>
          </Txt>
          <ToggleRow checked={draft.thirdPlace} onChange={(thirdPlace) => setDraft({ ...draft, thirdPlace })} label="Partido por el 3.er lugar" />
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Txt style={{ fontSize: 15, fontFamily: font.semibold }}>Siembra (el mejor primero)</Txt>
              <Button variant="soft" icon={<Shuffle size={16} color={c.accent} />} onPress={() => setDraft({ ...draft, pairs: sortBySeedLevel(draft.pairs, levelOf) })}>
                Por nivel
              </Button>
            </View>
            {draft.pairs.length ? (
              <Card padded={false}>
                {draft.pairs.map((id, i) => {
                  const lv = levelOf(id);
                  return (
                    <View key={id} style={[styles.editRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                      <Txt style={{ width: 20, textAlign: 'center', fontSize: 14, fontFamily: font.semibold, color: c.muted }}>{i + 1}</Txt>
                      <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.semibold }}>
                        {names.entrantName(id)}
                      </Txt>
                      {lv != null && (
                        <Txt tone="muted" style={{ fontSize: 13 }}>
                          {String(lv)}
                        </Txt>
                      )}
                      {arrow('Subir', ArrowUp, i === 0, () => move(i, -1))}
                      {arrow('Bajar', ArrowDown, i === draft.pairs.length - 1, () => move(i, 1))}
                    </View>
                  );
                })}
              </Card>
            ) : (
              <Txt tone="muted" style={{ fontSize: 14 }}>
                {`Elige abajo las ${side[1]} de esta categoría.`}
              </Txt>
            )}
          </View>
          <PickList
            items={items}
            selected={new Set(draft.pairs)}
            onToggle={(id) => setDraft({ ...draft, pairs: draft.pairs.includes(id) ? draft.pairs.filter((x) => x !== id) : [...draft.pairs, id] })}
            empty={doubles ? 'No hay parejas libres: ármalas en Organizar › Parejas y niveles.' : 'No hay jugadores libres.'}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  seedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 16, paddingRight: 8 },
  arrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
