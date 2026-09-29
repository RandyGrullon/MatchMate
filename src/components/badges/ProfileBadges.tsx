import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Award, ChevronDown, Lock, Pencil, Save, Sparkles } from 'lucide-react';
import { Insignia } from '../../badges/visual';
import { getUserId, invalidate } from '../../lib/data/client';
import { useMyMemberships } from '../../lib/data/members';
import { badgeTags, setFeaturedBadges, useBadgeProgress, useBadgeStats, useProfileBadges, type BadgeAward, type ProfileBadges } from '../../lib/data/badges';
import { useNow } from '../../lib/useNow';
import { FilterChips } from '../notifications/FilterChips';
import { useAction, useFeedback } from '../feedback';
import { Button, Card, Empty, LoadError, Modal, Skeleton, cx } from '../ui';
import { BadgeSheet, tileSub, type SheetSubject } from './BadgeSheet';
import { BadgeGrid, BadgeTile } from './BadgeTile';
import {
  canReportAward,
  countText,
  emptyOwnText,
  filterChips,
  groupTiles,
  leagueShelves,
  levelLine,
  lockedModels,
  officialCount,
  progressByBadge,
  retiredLines,
  shelfOf,
  upcoming,
  viewAward,
  type BadgeTileModel,
  type LeagueShelf,
  type LockedModel,
  type ProgressModel,
} from './logic';
import { useOpened } from './opened';

/**
 * La vitrina del perfil (docs/insignias.md §6.1): la pestaña «Insignias» de `/u/:id` y `/perfil` (se abre con
 * `?tab=insignias`; `&insignia=<id>` abre esa insignia, lo usan Avisos y los push) y las destacadas debajo del
 * nombre. Los demás ven lo que devuelve `profile_badges` (las reglas sociales las pone la base); el dueño ve además
 * «Próximas», las bloqueadas, las ocultas y las que su liga está confirmando.
 */

const ALL = 'todas';

function TabSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando insignias">
      <Skeleton className="h-6 w-32" />
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Lo que ve la pestaña, ya calculado (sirve para probarla sin base). */
export interface BadgesTabModel {
  own: boolean;
  count: number;
  tiles: BadgeTileModel[];
  upcoming: ProgressModel[];
  locked: LockedModel[];
  retired: { id: string; text: string }[];
  progress: ReadonlyMap<string, ProgressModel>;
  /** «De mis ligas»: las que dio el creador de cada liga. */
  leagues: LeagueShelf[];
}

export function tabModel(data: ProfileBadges, progress: Parameters<typeof upcoming>[0], sports: readonly string[], now: number, opened?: ReadonlySet<string>): BadgesTabModel {
  const own = data.isMe;
  return {
    own,
    count: officialCount(data.awards),
    tiles: groupTiles(data.awards, { own, now, opened }),
    upcoming: own ? upcoming(progress) : [],
    locked: own ? lockedModels(sports, data.awards, progress) : [],
    retired: own ? retiredLines(data.awards) : [],
    progress: own ? progressByBadge(progress) : new Map(),
    leagues: leagueShelves(data.leagueAwards ?? [], { own, now, opened }),
  };
}

/** La grilla por deporte y sección, con sus títulos. */
function Shelf<T extends { id: string; def: BadgeTileModel['def']; sport: string }>({
  items,
  filter,
  render,
}: {
  items: readonly T[];
  filter: string | null;
  render: (item: T) => ReactNode;
}) {
  const groups = shelfOf(items, filter);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.sport} className="flex flex-col gap-2">
          {filter === null && groups.length > 1 && <h4 className="text-sm font-bold tracking-tight">{g.label}</h4>}
          {g.sections.map((s) => (
            <div key={s.section}>
              <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{s.section}</p>
              <BadgeGrid>{s.tiles.map(render)}</BadgeGrid>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Lo de adentro de la pestaña, sin leer la base (la pestaña de verdad es `ProfileBadgesTab`). `onOpen` abre el
 * detalle de una insignia o de una bloqueada.
 */
export function BadgesTabView({
  model,
  sports,
  name,
  filter,
  onFilter,
  showLocked,
  onToggleLocked,
  onOpen,
}: {
  model: BadgesTabModel;
  sports: readonly string[];
  name: string;
  filter: string;
  onFilter: (f: string) => void;
  showLocked: boolean;
  onToggleLocked: () => void;
  onOpen: (s: SheetSubject) => void;
}) {
  const chips = filterChips(sports, [...model.tiles, ...(showLocked ? model.locked : [])]);
  const active = chips.some((c) => c.key === filter) ? filter : ALL;
  const f = active === ALL ? null : active;
  const first = name.split(/\s+/)[0] || name;
  const shown = model.tiles.filter((t) => f === null || t.sport === f);
  const leagues = model.leagues
    .map((l) => ({ ...l, tiles: l.tiles.filter((t) => f === null || t.top.award.sport === f) }))
    .filter((l) => l.tiles.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <Award className="size-5 text-accent" aria-hidden="true" />
          {countText(model.count)}
        </h2>
        {chips.length > 2 && <FilterChips label="Filtrar insignias" items={chips} value={active} onChange={onFilter} />}
      </div>

      {model.own && model.upcoming.length > 0 && (
        <section aria-labelledby="insignias-proximas" className="flex flex-col gap-2">
          <h3 id="insignias-proximas" className="text-sm font-bold tracking-tight">
            Próximas
          </h3>
          <Card className="p-2">
            <div className="grid grid-cols-3 gap-1">
              {model.upcoming.map((p) => (
                <BadgeTile
                  key={p.id}
                  look={p.look}
                  state="progress"
                  progress={p.ratio}
                  name={p.name}
                  sub={p.text}
                  label={`${p.name}, bloqueada. ${p.text}`}
                  onOpen={() => onOpen({ kind: 'locked', model: p })}
                />
              ))}
            </div>
          </Card>
        </section>
      )}

      <section aria-labelledby="insignias-matchmate" className="flex flex-col gap-3">
        <h3 id="insignias-matchmate" className="text-sm font-bold tracking-tight">
          MatchMate
        </h3>
        {shown.length ? (
          <Shelf
            items={shown}
            filter={f}
            render={(t) => (
              <BadgeTile
                key={t.id}
                look={t.top.look}
                state={t.state}
                name={t.top.name}
                sub={tileSub(t)}
                count={t.count}
                label={`${t.top.label}${t.count > 1 ? `, ${t.count} veces` : ''}${t.state === 'new' ? ', nueva' : ''}${t.bucket === 'review' ? ', en revisión' : t.bucket === 'hidden' ? ', solo tú la ves' : ''}`}
                onOpen={() => onOpen({ kind: 'award', tile: t })}
              />
            )}
          />
        ) : leagues.length ? (
          <p className="text-sm text-muted">{model.own ? 'Todavía no tienes insignias de MatchMate.' : 'Todavía no tiene insignias de MatchMate.'}</p>
        ) : (
          <Empty icon={<Award className="size-7" aria-hidden="true" />} title={model.own ? 'Todavía no tienes insignias' : 'Todavía no tiene insignias.'}>
            {model.own ? emptyOwnText(sports) : `Cuando ${first} gane una en sus ligas, sale aquí.`}
          </Empty>
        )}
      </section>

      {leagues.length > 0 && (
        <section aria-labelledby="insignias-ligas" className="flex flex-col gap-3">
          <h3 id="insignias-ligas" className="text-sm font-bold tracking-tight">
            {model.own ? 'De mis ligas' : 'De sus ligas'}
          </h3>
          {leagues.map((l) => (
            <div key={l.leagueId}>
              <p className="mb-1 truncate px-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{l.leagueName}</p>
              <BadgeGrid>
                {l.tiles.map((t) => (
                  <BadgeTile
                    key={t.id}
                    look={t.top.look}
                    state={t.state}
                    name={t.top.name}
                    sub={t.hidden ? 'Solo tú la ves' : (t.top.detail ?? t.top.date)}
                    count={t.count}
                    label={`${t.top.label}, de ${l.leagueName}${t.count > 1 ? `, ${t.count} veces` : ''}${t.state === 'new' ? ', nueva' : ''}`}
                    onOpen={() => onOpen({ kind: 'league', tile: t })}
                  />
                ))}
              </BadgeGrid>
            </div>
          ))}
        </section>
      )}

      {model.own && model.locked.length > 0 && (
        <section className="flex flex-col gap-3">
          <Button className="h-11 self-start" variant="ghost" icon={<Lock className="size-4" />} aria-expanded={showLocked} onClick={onToggleLocked}>
            {showLocked ? 'Ocultar bloqueadas' : 'Ver bloqueadas'}
            <ChevronDown className={cx('size-4 transition-transform', showLocked && 'rotate-180')} aria-hidden="true" />
          </Button>
          {showLocked && (
            <Shelf
              items={model.locked.filter((l) => f === null || l.sport === f)}
              filter={f}
              render={(l) => (
                <BadgeTile
                  key={l.id}
                  look={l.look}
                  state={l.progress ? 'progress' : 'locked'}
                  progress={l.progress?.ratio}
                  name={l.name}
                  sub={l.progress?.text}
                  label={`${l.name}, bloqueada`}
                  onOpen={() => onOpen({ kind: 'locked', model: l })}
                />
              )}
            />
          )}
        </section>
      )}

      {model.retired.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {model.retired.map((r) => (
            <li key={r.id}>{r.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** La pestaña «Insignias» del perfil. */
export default function ProfileBadgesTab({ userId, name, sports }: { userId: string; name: string; sports: readonly string[] }) {
  const data = useProfileBadges(userId);
  const own = !!data.data?.isMe || userId === getUserId();
  const progress = useBadgeProgress(own);
  const stats = useBadgeStats(true);
  const now = useNow().getTime();
  const [opened, markOpened] = useOpened(own ? userId : null);
  // Reportar una de liga es de sus miembros: las ligas de quien mira.
  const viewer = getUserId();
  const memberships = useMyMemberships(!own && viewer ? viewer : undefined);
  const memberLeagues = useMemo(() => new Set(memberships.data.map((m) => m.leagueId)), [memberships.data]);
  const [filter, setFilter] = useState(ALL);
  const [showLocked, setShowLocked] = useState(false);
  const [subject, setSubject] = useState<SheetSubject | null>(null);
  const [animate, setAnimate] = useState(false);
  const [params, setParams] = useSearchParams();

  const model = useMemo(() => (data.data ? tabModel(data.data, progress.data, sports, now, opened) : null), [data.data, progress.data, sports, now, opened]);

  const open = (s: SheetSubject, still = false) => {
    setAnimate(!still && s.kind === 'award' && s.tile.state === 'new');
    if ((s.kind === 'award' || s.kind === 'league') && own) markOpened(s.tile.views.map((v) => v.award.id));
    setSubject(s);
  };

  // `?insignia=<id>` (Avisos, push): abre esa insignia una vez y se quita del link. `&quieta=1` (desde el aviso al
  // ganar, que ya la animó): sin repetir la animación.
  const wanted = params.get('insignia');
  const still = params.get('quieta') === '1';
  useEffect(() => {
    if (!wanted || !model) return;
    const tile = model.tiles.find((t) => t.views.some((v) => v.award.id === wanted));
    if (tile) open({ kind: 'award', tile }, still);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('insignia');
        next.delete('quieta');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega el id o los datos
  }, [wanted, model]);

  if (data.loading && !data.data) return <TabSkeleton />;
  if (data.error && !data.data) return <LoadError error={data.error} onRetry={() => invalidate(badgeTags.user(userId))} />;
  if (!model) return null;

  // Si el detalle abierto cambió (se ocultó, se destacó), se muestra lo de ahora.
  const current: SheetSubject | null =
    subject?.kind === 'award'
      ? (() => {
          const t = model.tiles.find((x) => x.views.some((v) => subject.tile.views.some((w) => w.award.id === v.award.id)));
          return t ? { kind: 'award', tile: t } : subject;
        })()
      : subject?.kind === 'league'
        ? (() => {
            const t = model.leagues.flatMap((l) => l.tiles).find((x) => x.views.some((v) => subject.tile.views.some((w) => w.award.id === v.award.id)));
            return t ? { kind: 'league', tile: t } : subject;
          })()
        : subject;

  return (
    <>
      <BadgesTabView
        model={model}
        sports={sports}
        name={name}
        filter={filter}
        onFilter={setFilter}
        showLocked={showLocked}
        onToggleLocked={() => setShowLocked((s) => !s)}
        onOpen={open}
      />
      <BadgeSheet
        subject={current}
        onClose={() => setSubject(null)}
        own={model.own}
        featured={data.data?.featured ?? []}
        stats={stats.data}
        progress={model.progress}
        playerName={name}
        shareLink={typeof location !== 'undefined' ? `${location.origin}/u/${userId}` : undefined}
        canReport={current?.kind === 'award' && canReportAward(current.tile.top.award, model.own, memberLeagues)}
        animate={animate}
      />
    </>
  );
}

// ---------- Destacadas ----------

/** Las destacadas en orden (solo las que se pueden ver). */
export function featuredViews(data: ProfileBadges | null) {
  if (!data) return [];
  const byId = new Map(data.awards.map((a) => [a.id, a]));
  return data.featured.map((id) => byId.get(id)).filter((a): a is BadgeAward => !!a && (a.status === 'provisional' || a.status === 'firme') && !a.hidden).map(viewAward).filter((v) => v !== null);
}

/**
 * Hasta 3 insignias a 40 px debajo del nombre (§6.1). Tocar una la abre en la pestaña. El dueño sin ninguna ve «Elige
 * hasta 3 para mostrar aquí»; los demás, nada.
 */
export function FeaturedBadges({ userId }: { userId: string }) {
  const data = useProfileBadges(userId);
  const [picking, setPicking] = useState(false);
  const views = featuredViews(data.data);
  const own = !!data.data?.isMe;
  if (!data.data) return null;
  const eligible = data.data.awards.some((a) => (a.status === 'provisional' || a.status === 'firme') && !a.hidden);
  if (!views.length && !(own && eligible)) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {views.map((v) => (
        <Link
          key={v.award.id}
          to={`?tab=insignias&insignia=${encodeURIComponent(v.award.id)}`}
          className="inline-flex size-11 items-center justify-center rounded-xl transition hover:bg-surface-2 active:scale-95"
          title={`${v.name} · ${levelLine(v)}`}
        >
          <Insignia badge={v.look} size={40} label={v.label} />
        </Link>
      ))}
      {own && (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className={cx(
            'inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent transition hover:bg-accent-soft active:scale-[0.97]',
            views.length > 0 && 'w-11 justify-center px-0',
          )}
          aria-label={views.length ? 'Cambiar las destacadas' : undefined}
          title={views.length ? 'Cambiar las destacadas' : undefined}
        >
          {views.length ? (
            <Pencil className="size-4" aria-hidden="true" />
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden="true" /> Elige hasta 3 para mostrar aquí
            </>
          )}
        </button>
      )}
      {own && picking && <FeaturedPicker data={data.data} onClose={() => setPicking(false)} />}
    </div>
  );
}

/** Elegir hasta 3 destacadas (en el orden en que se tocan). */
export function FeaturedPicker({ data, onClose }: { data: ProfileBadges; onClose: () => void }) {
  const run = useAction();
  const { toast } = useFeedback();
  const now = useNow().getTime();
  const [picked, setPicked] = useState<string[]>(() => [...data.featured]);
  const [saving, setSaving] = useState(false);
  const tiles = useMemo(() => groupTiles(data.awards, { own: true, now }).filter((t) => t.bucket === 'ok'), [data.awards, now]);

  const toggle = (t: BadgeTileModel) => {
    const ids = t.views.map((v) => v.award.id);
    if (!picked.some((id) => ids.includes(id)) && picked.length >= 3) {
      toast('Ya tienes 3 destacadas. Quita una para poner esta.', 'error');
      return;
    }
    setPicked((p) => (p.some((id) => ids.includes(id)) ? p.filter((id) => !ids.includes(id)) : p.length >= 3 ? p : [...p, t.top.award.id]));
  };

  const save = async () => {
    setSaving(true);
    const ok = await run(async () => {
      await setFeaturedBadges(picked);
      return true;
    }, picked.length ? 'Destacadas guardadas' : 'Ya no tienes destacadas');
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Destacadas"
      footer={
        <>
          <Button className="h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="h-11" variant="primary" loading={saving} icon={<Save className="size-4" />} onClick={() => void save()}>
            Guardar
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">{`Elige hasta 3 para mostrar debajo de tu nombre (${picked.length} de 3).`}</p>
      <BadgeGrid>
        {tiles.map((t) => {
          const at = picked.findIndex((id) => t.views.some((v) => v.award.id === id));
          return (
            <div key={t.id} className={cx('relative rounded-xl', at >= 0 && 'bg-accent-soft ring-2 ring-accent')}>
              <BadgeTile
                look={t.top.look}
                name={t.top.name}
                sub={levelLine(t.top)}
                label={`${t.top.label}${at >= 0 ? `, destacada ${at + 1}` : ''}`}
                pressed={at >= 0}
                onOpen={() => toggle(t)}
              />
              {at >= 0 && (
                <span className="pointer-events-none absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg" aria-hidden="true">
                  {at + 1}
                </span>
              )}
            </div>
          );
        })}
      </BadgeGrid>
    </Modal>
  );
}
