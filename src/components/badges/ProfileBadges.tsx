import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Award, ChevronDown, ChevronRight, Lock, Pencil, Save, Sparkles } from 'lucide-react';
import { Insignia } from '../../badges/visual';
import { getUserId, invalidate } from '../../lib/data/client';
import { useMyMemberships } from '../../lib/data/members';
import { badgeTags, setFeaturedBadges, useBadgeProgress, useBadgeStats, useProfileBadges, type ProfileBadges } from '../../lib/data/badges';
import { useNow } from '../../lib/useNow';
import { FilterChips } from '../notifications/FilterChips';
import { useAction, useFeedback } from '../feedback';
import { Button, Card, Empty, LoadError, Modal, SectionHeader, Skeleton, cx, sectionLinkClass } from '../ui';
import { BadgeSheet, tileSub, type SheetSubject } from './BadgeSheet';
import { BadgeGrid, BadgeTile, LeagueMark } from './BadgeTile';
import {
  FEATURED_MAX,
  canReportAward,
  countSplitText,
  countText,
  emptyOwnText,
  featurableLeagueTiles,
  featuredIds,
  featuredIsAuto,
  featuredModel,
  filterChips,
  groupTiles,
  leagueCount,
  leagueShelves,
  leagueTileSub,
  levelLine,
  lockedModels,
  officialCount,
  progressByBadge,
  retiredLines,
  shelfOf,
  upcoming,
  type BadgeTileModel,
  type FeaturedItem,
  type FeaturedModel,
  type LeagueShelf,
  type LeagueTileModel,
  type LockedModel,
  type ProgressModel,
} from './logic';
import { useOpened } from './opened';

/**
 * La vitrina del perfil (docs/insignias.md §6.1): la pestaña «Insignias» de `/u/:id` y `/perfil` (se abre con
 * `?tab=insignias`; `&insignia=<id>` abre esa insignia, lo usan Avisos, los push y las destacadas) y las destacadas
 * debajo del nombre. Los demás ven lo que devuelve `profile_badges` (las reglas sociales las pone la base); el dueño ve
 * además «Próximas», las bloqueadas, las ocultas y las que su liga está confirmando. Las de sus ligas (del creador y
 * premios del torneo) cuentan en el total, se pueden destacar y llevan la marca «LIGA».
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
  /** El total: las oficiales y las de sus ligas. */
  count: number;
  /** «20 de MatchMate · 4 de sus ligas» (null sin las de sus ligas). */
  split: string | null;
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
  const official = officialCount(data.awards);
  const league = leagueCount(data.leagueAwards ?? []);
  return {
    own,
    count: official + league,
    split: countSplitText(official, league, own),
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
        <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Award className="size-5 text-accent" aria-hidden="true" />
            {countText(model.count)}
          </h2>
          {model.split && <p className="pl-7 text-xs text-muted">{model.split}</p>}
        </div>
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
                    sub={leagueTileSub(t, model.own)}
                    count={t.count}
                    label={`${t.top.fullLabel}${t.count > 1 ? `, ${t.count} veces` : ''}${t.state === 'new' ? ', nueva' : ''}${t.hidden ? ', solo tú la ves' : model.own && !t.onProfile ? ', solo en tu liga' : ''}`}
                    league
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
  // Las que se ven debajo del nombre (elegidas o, si no eligió, las que salen solas): el detalle dice «Quitar de
  // destacadas» en esas y al destacar otra parte de ellas (no de una lista vacía).
  const shown = useMemo(() => (own && data.data ? featuredModel(data.data, stats.data) : null), [own, data.data, stats.data]);

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
    const league = tile ? null : model.leagues.flatMap((l) => l.tiles).find((t) => t.views.some((v) => v.award.id === wanted));
    if (tile) open({ kind: 'award', tile }, still);
    else if (league) open({ kind: 'league', tile: league }, still);
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
        featured={shown ? featuredIds(shown) : []}
        featuredAuto={!!shown?.auto}
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

// ---------- Yo: las 3 de la tarjeta «Insignias» y la línea de Pro ----------

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Lo que llevan los links de Yo a sus partes: «‹ Yo» vuelve atrás en vez de abrir Yo otra vez. */
export const YO_STATE = { yo: true } as const;

/** «6 oct»: cuándo la ganó (debajo del nombre en la tarjeta de Yo). */
export function wonOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** «Te faltan 6 pinos» → «te faltan 6 pinos» (en la mitad de una frase). */
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Una de las 3 insignias de la tarjeta de Yo: ganada (con su fecha), en camino (con su barrita) o por ganar. */
export interface PreviewBadge {
  id: string;
  look: BadgeTileModel['top']['look'];
  state: 'unlocked' | 'new' | 'progress' | 'locked';
  /** 0 a 1 (solo las que van en camino). */
  progress: number | null;
  name: string;
  sub: string;
  /** A dónde lleva: la vitrina con esa insignia abierta (`?tab=insignias&insignia=…`) o la vitrina. */
  to: string;
  label: string;
}

/**
 * Las 3 de la tarjeta «Insignias» de Yo: las ganadas más nuevas (dejando lugar a la que está más cerca de ganarse, «te
 * faltan 6») y, si no alcanza, las que van en camino y las que faltan por ganar.
 */
export function previewBadges(model: BadgesTabModel, max = 3): PreviewBadge[] {
  const won: PreviewBadge[] = model.tiles
    .filter((t) => t.bucket === 'ok')
    .map((t) => ({
      id: t.id,
      look: t.top.look,
      state: t.state === 'new' ? 'new' : 'unlocked',
      progress: null,
      name: t.top.name,
      sub: wonOn(t.top.award.awardedAt),
      to: `?tab=insignias&insignia=${encodeURIComponent(t.top.award.id)}`,
      label: `${t.top.label}${t.state === 'new' ? ', nueva' : ''}`,
    }));
  const going: PreviewBadge[] = model.upcoming.map((p) => ({
    id: p.id,
    look: p.look,
    state: 'progress',
    progress: p.ratio,
    name: p.name,
    sub: lowerFirst(p.text),
    to: '?tab=insignias',
    label: `${p.name}, bloqueada. ${p.text}`,
  }));
  const locked: PreviewBadge[] = model.locked
    .filter((l) => !l.progress)
    .map((l) => ({ id: l.id, look: l.look, state: 'locked', progress: null, name: l.name, sub: 'Por ganar', to: '?tab=insignias', label: `${l.name}, bloqueada` }));
  const room = max - Math.min(going.length, 1);
  return [...won.slice(0, room), ...going, ...won.slice(room), ...locked].slice(0, max);
}

/** La línea de «Insignias» en Pro: «2 de 18 · Serie de 600: te faltan 6». */
export function badgesLine(model: BadgesTabModel): string {
  const total = model.count + model.locked.length;
  const next = model.upcoming[0];
  return [model.own && total > model.count ? `${model.count} de ${total}` : countText(model.count), next && `${next.name}: ${lowerFirst(next.text)}`]
    .filter(Boolean)
    .join(' · ');
}

/** La vitrina de la cuenta, ya calculada (para la tarjeta y la línea de Yo); null mientras se lee. */
export function useBadgesModel(userId: string, sports: readonly string[]): { model: BadgesTabModel | null; loading: boolean } {
  const data = useProfileBadges(userId);
  const own = !!data.data?.isMe || userId === getUserId();
  const progress = useBadgeProgress(own);
  const now = useNow().getTime();
  const [opened] = useOpened(own ? userId : null);
  const model = useMemo(() => (data.data ? tabModel(data.data, progress.data, sports, now, opened) : null), [data.data, progress.data, sports, now, opened]);
  return { model, loading: data.loading && !data.data };
}

/** La tarjeta «Insignias» de Yo, sin leer la base: 3 insignias a 60 px con su nombre y su fecha o lo que falta. */
export function BadgesPreviewView({ items, className }: { items: readonly PreviewBadge[]; className?: string }) {
  return (
    <section aria-labelledby="yo-insignias" className={className}>
      <SectionHeader
        id="yo-insignias"
        title="Insignias"
        action={
          <Link to="?tab=insignias" state={YO_STATE} className={sectionLinkClass}>
            Ver todas
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        }
      />
      <Card className="grid grid-cols-3 px-2 pt-[18px] pb-4">
        {items.map((b) => (
          <Link
            key={b.id}
            to={b.to}
            state={YO_STATE}
            aria-label={b.label}
            className="flex min-w-0 flex-col items-center rounded-2xl px-0.5 text-center transition active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Insignia badge={b.look} size={64} px={60} pad state={b.state} progress={b.progress ?? undefined} />
            <b className="mt-2.5 line-clamp-2 w-full text-sm leading-tight font-[650] tracking-[-0.01em]">{b.name}</b>
            <span className="mt-px line-clamp-2 w-full text-[12.5px] leading-tight text-muted">{b.sub}</span>
            {b.progress != null && (
              <span aria-hidden="true" className="mt-1.5 block h-[5px] w-16 overflow-hidden rounded-[3px] bg-surface-2">
                <i className="block h-full rounded-[3px] bg-accent" style={{ width: `${Math.round(b.progress * 100)}%` }} />
              </span>
            )}
          </Link>
        ))}
      </Card>
    </section>
  );
}

/** Yo › Lite › «Insignias»: 3 (las ganadas y las que van en camino) y «Ver todas» (la vitrina, `?tab=insignias`). */
export function BadgesPreview({ userId, sports, className }: { userId: string; sports: readonly string[]; className?: string }) {
  const { model, loading } = useBadgesModel(userId, sports);
  if (loading) return <Skeleton className={cx('h-[196px] rounded-3xl', className)} />;
  const items = model ? previewBadges(model) : [];
  if (!items.length) return null;
  return <BadgesPreviewView items={items} className={className} />;
}

/** Yo › Pro › fila «Insignias»: la línea «2 de 18 · Serie de 600: te faltan 6». */
export function BadgesLineText({ userId, sports }: { userId: string; sports: readonly string[] }) {
  const { model } = useBadgesModel(userId, sports);
  return <>{model ? badgesLine(model) : 'Tu vitrina'}</>;
}

/**
 * Yo › Insignias › «Destacadas»: las que los demás ven debajo de tu nombre (hasta 3), con el lápiz para elegirlas. No
 * sale si no hay ninguna que se pueda destacar.
 */
export function FeaturedSection({ userId, className }: { userId: string; className?: string }) {
  const data = useProfileBadges(userId);
  const [picking, setPicking] = useState(false);
  const stats = useBadgeStats(featuredIsAuto(data.data));
  const model = useMemo(() => featuredModel(data.data, stats.data), [data.data, stats.data]);
  if (!data.data) return null;
  const own = data.data.isMe;
  const canPick = own && canFeature(data.data);
  if (!model.items.length && !canPick) return null;
  return (
    <section aria-labelledby="yo-destacadas" className={className}>
      <SectionHeader id="yo-destacadas" title="Destacadas" />
      <p className="mx-1 -mt-1.5 mb-3 text-sm text-muted">Las ven los demás debajo de tu nombre.</p>
      <Card className="p-3">
        <FeaturedRow model={model} own={own} canPick={canPick} onPick={() => setPicking(true)} />
      </Card>
      {own && picking && <FeaturedPicker data={data.data} shown={model} onClose={() => setPicking(false)} />}
    </section>
  );
}

// ---------- Destacadas ----------

/** ¿El dueño tiene alguna que se pueda destacar? (automática que se ve, o de la liga que los demás ven). */
const canFeature = (data: ProfileBadges) =>
  data.awards.some((a) => (a.status === 'provisional' || a.status === 'firme') && !a.hidden) || (data.leagueAwards ?? []).some((a) => !a.hidden && a.onProfile);

/**
 * La fila de destacadas, sin leer la base (la de verdad es `FeaturedBadges`): hasta 3 a 40 px (las de la liga con la
 * marca «LIGA»); tocar una la abre en la pestaña. El dueño tiene el lápiz para elegirlas o, sin ninguna, «Elige hasta 3
 * para mostrar aquí»; si salen solas, se lo dice debajo.
 */
export function FeaturedRow({ model, own, canPick, onPick }: { model: FeaturedModel; own: boolean; canPick: boolean; onPick: () => void }) {
  const { items, auto } = model;
  if (!items.length && !(own && canPick)) return null;
  const edit = auto ? 'Elegir tus destacadas' : 'Cambiar las destacadas';
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {items.map((it: FeaturedItem) => (
        <Link
          key={it.id}
          to={`?tab=insignias&insignia=${encodeURIComponent(it.id)}`}
          className="relative inline-flex size-11 items-center justify-center rounded-xl transition hover:bg-surface-2 active:scale-95"
          title={it.title}
        >
          <Insignia badge={it.view.look} size={40} label={it.label} />
          {it.kind === 'liga' && <LeagueMark className="absolute -top-0.5 -right-1" />}
        </Link>
      ))}
      {own && (
        <button
          type="button"
          onClick={onPick}
          className={cx(
            'inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent transition hover:bg-accent-soft active:scale-[0.97]',
            items.length > 0 && 'w-11 justify-center px-0',
          )}
          aria-label={items.length ? edit : undefined}
          title={items.length ? edit : undefined}
        >
          {items.length ? (
            <Pencil className="size-4" aria-hidden="true" />
          ) : (
            <>
              <Sparkles className="size-4" aria-hidden="true" /> Elige hasta 3 para mostrar aquí
            </>
          )}
        </button>
      )}
      {own && auto && items.length > 0 && <p className="w-full text-center text-[11px] text-muted">Salen solas · toca el lápiz para elegirlas</p>}
    </div>
  );
}

/**
 * Hasta 3 insignias a 40 px debajo del nombre (§6.1): las que eligió la cuenta, automáticas o de sus ligas. Si no
 * eligió ninguna salen solas: los premios del torneo, las demás de sus ligas y las automáticas más raras.
 */
export function FeaturedBadges({ userId }: { userId: string }) {
  const data = useProfileBadges(userId);
  const [picking, setPicking] = useState(false);
  // La rareza solo hace falta para las que salen solas.
  const stats = useBadgeStats(featuredIsAuto(data.data));
  const model = useMemo(() => featuredModel(data.data, stats.data), [data.data, stats.data]);
  if (!data.data) return null;
  const own = data.data.isMe;
  return (
    <>
      <FeaturedRow model={model} own={own} canPick={own && canFeature(data.data)} onPick={() => setPicking(true)} />
      {own && picking && <FeaturedPicker data={data.data} shown={model} onClose={() => setPicking(false)} />}
    </>
  );
}

/** Una que se puede elegir, con su número si ya está elegida. */
function Pickable({ at, children }: { at: number; children: ReactNode }) {
  return (
    <div className={cx('relative rounded-xl', at >= 0 && 'bg-accent-soft ring-2 ring-accent')}>
      {children}
      {at >= 0 && (
        <span className="pointer-events-none absolute top-1 left-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-fg" aria-hidden="true">
          {at + 1}
        </span>
      )}
    </div>
  );
}

/** Las que el elegidor abre marcadas: las que se ven debajo del nombre (también las que salen solas). */
export const pickerStart = (data: ProfileBadges, shown: FeaturedModel): string[] => (shown.auto ? featuredIds(shown) : [...data.featured]);

/**
 * Qué hace «Guardar» en el elegidor: nada si no cambió lo que se ve (así abrir y guardar no deja fijas las que salen
 * solas, ni borra las elegidas); si no, guardar `picked` con su aviso ([] = vuelven a salir solas).
 */
export function pickerSave(start: readonly string[], picked: readonly string[], auto: boolean): { save: false } | { save: true; done: string } {
  const same = start.length === picked.length && start.every((id, i) => id === picked[i]);
  if (same || (auto && picked.length === 0)) return { save: false };
  return { save: true, done: picked.length ? 'Destacadas guardadas' : 'Listo: ahora salen solas' };
}

/**
 * Elegir hasta 3 destacadas (en el orden en que se tocan): las automáticas que se ven y las de sus ligas que los demás
 * ven en el perfil (primero los premios del torneo). Abre con las que se ven debajo del nombre marcadas, también las
 * que salen solas (`shown`).
 */
export function FeaturedPicker({ data, shown, onClose }: { data: ProfileBadges; shown: FeaturedModel; onClose: () => void }) {
  const run = useAction();
  const { toast } = useFeedback();
  const now = useNow().getTime();
  const [start] = useState<string[]>(() => pickerStart(data, shown));
  const [picked, setPicked] = useState<string[]>(start);
  const [saving, setSaving] = useState(false);
  const tiles = useMemo(() => groupTiles(data.awards, { own: true, now }).filter((t) => t.bucket === 'ok'), [data.awards, now]);
  const leagueTiles = useMemo(() => featurableLeagueTiles(data, now), [data, now]);

  const toggle = (t: BadgeTileModel | LeagueTileModel) => {
    const ids = t.views.map((v) => v.award.id);
    if (!picked.some((id) => ids.includes(id)) && picked.length >= FEATURED_MAX) {
      toast('Ya tienes 3 destacadas. Quita una para poner esta.', 'error');
      return;
    }
    setPicked((p) => (p.some((id) => ids.includes(id)) ? p.filter((id) => !ids.includes(id)) : p.length >= FEATURED_MAX ? p : [...p, t.top.award.id]));
  };

  const save = async () => {
    const plan = pickerSave(start, picked, shown.auto);
    if (!plan.save) {
      onClose();
      return;
    }
    setSaving(true);
    const ok = await run(async () => {
      await setFeaturedBadges(picked);
      return true;
    }, plan.done);
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
      <p className={cx('text-sm text-muted', shown.auto ? 'mb-1' : 'mb-3')}>{`Elige hasta 3 para mostrar debajo de tu nombre (${picked.length} de 3).`}</p>
      {shown.auto && <p className="mb-3 text-xs text-muted">Mientras no elijas, salen solas: primero tus premios del torneo.</p>}
      <FeaturedChoices tiles={tiles} leagueTiles={leagueTiles} picked={picked} onToggle={toggle} />
    </Modal>
  );
}

/** Las grillas del elegidor: «MatchMate» y «De mis ligas» (con la marca «LIGA»), con el número de las elegidas. */
export function FeaturedChoices({
  tiles,
  leagueTiles,
  picked,
  onToggle,
}: {
  tiles: readonly BadgeTileModel[];
  leagueTiles: readonly LeagueTileModel[];
  picked: readonly string[];
  onToggle: (t: BadgeTileModel | LeagueTileModel) => void;
}) {
  const slot = (t: BadgeTileModel | LeagueTileModel) => picked.findIndex((id) => t.views.some((v) => v.award.id === id));
  const heading = (text: string) => <p className="mb-1 px-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{text}</p>;
  return (
    <div className="flex flex-col gap-4">
      {tiles.length > 0 && (
        <div>
          {leagueTiles.length > 0 && heading('MatchMate')}
          <BadgeGrid>
            {tiles.map((t) => {
              const at = slot(t);
              return (
                <Pickable key={t.id} at={at}>
                  <BadgeTile
                    look={t.top.look}
                    name={t.top.name}
                    sub={levelLine(t.top)}
                    label={`${t.top.label}${at >= 0 ? `, destacada ${at + 1}` : ''}`}
                    pressed={at >= 0}
                    onOpen={() => onToggle(t)}
                  />
                </Pickable>
              );
            })}
          </BadgeGrid>
        </div>
      )}
      {leagueTiles.length > 0 && (
        <div>
          {heading('De mis ligas')}
          <BadgeGrid>
            {leagueTiles.map((t) => {
              const at = slot(t);
              return (
                <Pickable key={t.id} at={at}>
                  <BadgeTile
                    look={t.top.look}
                    name={t.top.name}
                    sub={[t.top.prize?.competition, t.top.leagueName].filter(Boolean).join(' · ')}
                    label={`${t.top.fullLabel}${at >= 0 ? `, destacada ${at + 1}` : ''}`}
                    pressed={at >= 0}
                    league
                    onOpen={() => onToggle(t)}
                  />
                </Pickable>
              );
            })}
          </BadgeGrid>
        </div>
      )}
    </div>
  );
}
