import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Award, ChevronDown, Lock, Pencil, Save, Sparkles } from 'lucide-react-native';
import { getUserId, invalidate } from '@mm/lib/data/client';
import { useMyMemberships } from '@mm/lib/data/members';
import { badgeTags, setFeaturedBadges, useBadgeProgress, useBadgeStats, useProfileBadges, type ProfileBadges } from '@mm/lib/data/badges';
import { useNow } from '@mm/lib/useNow';
import {
  canReportAward,
  countText,
  featurableLeagueTiles,
  featuredIds,
  featuredIsAuto,
  featuredModel,
  groupTiles,
  leagueTileSub,
  levelLine,
  myBadgesPath,
  shelfOf,
  type BadgeTileModel,
  type FeaturedModel,
  type LeagueTileModel,
} from '@mm/components/badges/logic';
import { useOpened } from '@mm/components/badges/opened';
import { tileSub, type SheetSubject } from '@mm/components/badges/sheet';
import {
  ALL,
  FEATURED_FULL,
  awardTileLabel,
  canFeature,
  currentSubject,
  emptyTab,
  featuredEditLabel,
  leagueTileLabel,
  leaguesTitle,
  linkedSubject,
  lockedLabel,
  noOfficialText,
  pickerIntro,
  pickerSave,
  pickerSlot,
  pickerStart,
  pickerToggle,
  tabModel,
  tabView,
  upcomingLabel,
  type BadgesTabModel,
} from '@mm/components/badges/tab';
import { toast } from '@/components/feedback';
import { Chips } from '@/components/notifications/NoticeList';
import { runAction } from '@/components/swimming/parts';
import { Button, Card, Empty, LoadError, Sheet, Txt } from '@/components/ui';
import { LogoSpinner } from '@/components/Logo';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { BadgeSheet } from './BadgeSheet';
import { BadgeGrid, BadgeTile, LeagueMark } from './BadgeTile';
import { Insignia } from './Insignia';

/**
 * La vitrina del perfil en la app (ProfileBadges de la web, docs/insignias.md §6.1): la pestaña «Insignias» de
 * /u/<id> (se abre con `?tab=insignias`; `&insignia=<id>` abre esa insignia, lo usan Avisos, los push y las
 * destacadas) y las destacadas debajo del nombre. La lógica es la de la web (src/components/badges/tab.ts y logic.ts).
 */

/** Un título chico en mayúsculas (deporte, sección, liga). */
export function Caps({ children }: { children: string }) {
  return (
    <Txt tone="muted" numberOfLines={1} style={styles.caps}>
      {children}
    </Txt>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <Txt accessibilityRole="header" style={{ fontSize: 14, lineHeight: 19, fontFamily: font.bold }}>
      {children}
    </Txt>
  );
}

/** La grilla por deporte y sección, con sus títulos. */
function Shelf<T extends { id: string; def: BadgeTileModel['def']; sport: string }>({ items, filter, render }: { items: readonly T[]; filter: string | null; render: (item: T) => ReactNode }) {
  const groups = shelfOf(items, filter);
  return (
    <View style={{ gap: 16 }}>
      {groups.map((g) => (
        <View key={g.sport} style={{ gap: 8 }}>
          {filter === null && groups.length > 1 && <Heading>{g.label}</Heading>}
          {g.sections.map((s) => (
            <View key={s.section}>
              <Caps>{s.section}</Caps>
              <BadgeGrid>{s.tiles.map(render)}</BadgeGrid>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Lo de adentro de la pestaña, sin leer la base. `onOpen` abre el detalle de una insignia o de una bloqueada. */
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
  const c = useColors();
  const { chips, active, filter: f, first, shown, leagues, locked } = tabView(model, { sports, name, filter, showLocked });
  const empty = emptyTab(model.own, first, sports);

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <View style={{ gap: 2 }}>
          <View style={styles.row}>
            <Award size={20} color={c.accent} />
            <Txt variant="section" accessibilityRole="header">
              {countText(model.count)}
            </Txt>
          </View>
          {!!model.split && (
            <Txt variant="small" tone="muted" style={{ paddingLeft: 28 }}>
              {model.split}
            </Txt>
          )}
        </View>
        {chips.length > 2 && <Chips label="Filtrar insignias" items={chips} value={active} onChange={onFilter} />}
      </View>

      {model.own && model.upcoming.length > 0 && (
        <View style={{ gap: 8 }}>
          <Heading>Próximas</Heading>
          <Card padded={false} style={{ padding: 8 }}>
            <BadgeGrid columns={3}>
              {model.upcoming.map((p) => (
                <BadgeTile
                  key={p.id}
                  look={p.look}
                  state="progress"
                  progress={p.ratio}
                  name={p.name}
                  sub={p.text}
                  label={upcomingLabel(p)}
                  onOpen={() => onOpen({ kind: 'locked', model: p })}
                />
              ))}
            </BadgeGrid>
          </Card>
        </View>
      )}

      <View style={{ gap: 12 }}>
        <Heading>MatchMate</Heading>
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
                label={awardTileLabel(t)}
                onOpen={() => onOpen({ kind: 'award', tile: t })}
              />
            )}
          />
        ) : leagues.length ? (
          <Txt variant="meta" tone="muted">
            {noOfficialText(model.own)}
          </Txt>
        ) : (
          <Empty icon={<Award size={28} color={c.accent} />} title={empty.title} text={empty.text} />
        )}
      </View>

      {leagues.length > 0 && (
        <View style={{ gap: 12 }}>
          <Heading>{leaguesTitle(model.own)}</Heading>
          {leagues.map((l) => (
            <View key={l.leagueId}>
              <Caps>{l.leagueName}</Caps>
              <BadgeGrid>
                {l.tiles.map((t) => (
                  <BadgeTile
                    key={t.id}
                    look={t.top.look}
                    state={t.state}
                    name={t.top.name}
                    sub={leagueTileSub(t, model.own)}
                    count={t.count}
                    label={leagueTileLabel(t, model.own)}
                    league
                    onOpen={() => onOpen({ kind: 'league', tile: t })}
                  />
                ))}
              </BadgeGrid>
            </View>
          ))}
        </View>
      )}

      {model.own && model.locked.length > 0 && (
        <View style={{ gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showLocked }}
            onPress={onToggleLocked}
            style={({ pressed }) => [styles.toggle, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
          >
            <Lock size={18} color={c.fg} />
            <Txt variant="bodyStrong" style={{ fontSize: 15 }}>
              {showLocked ? 'Ocultar bloqueadas' : 'Ver bloqueadas'}
            </Txt>
            <ChevronDown size={18} color={c.fg} style={{ transform: [{ rotate: showLocked ? '180deg' : '0deg' }] }} />
          </Pressable>
          {showLocked && (
            <Shelf
              items={locked}
              filter={f}
              render={(l) => (
                <BadgeTile
                  key={l.id}
                  look={l.look}
                  state={l.progress ? 'progress' : 'locked'}
                  progress={l.progress?.ratio}
                  name={l.name}
                  sub={l.progress?.text}
                  label={lockedLabel(l.name)}
                  onOpen={() => onOpen({ kind: 'locked', model: l })}
                />
              )}
            />
          )}
        </View>
      )}

      {model.retired.length > 0 && (
        <View style={{ gap: 4 }}>
          {model.retired.map((r) => (
            <Txt key={r.id} variant="small" tone="muted">
              {r.text}
            </Txt>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * La pestaña «Insignias» del perfil. `link` abre esa insignia (el `?insignia=` del link o una destacada que se tocó);
 * `still` (`?quieta=1`, desde el aviso al ganar, que ya la animó) sin repetir la animación. Al cerrarla, `onLinkDone`
 * (la pantalla deja `link` en null).
 */
export function ProfileBadgesTab({
  userId,
  name,
  sports,
  link,
  onLinkDone,
}: {
  userId: string;
  name: string;
  sports: readonly string[];
  link?: { id: string; still: boolean } | null;
  onLinkDone?: () => void;
}) {
  const data = useProfileBadges(userId);
  const own = !!data.data?.isMe || userId === getUserId();
  const progress = useBadgeProgress(own);
  const stats = useBadgeStats(true);
  const now = useNow().getTime();
  const [opened, markOpened] = useOpened(own ? userId : null);
  // Reportar una de liga es de sus miembros: las ligas de quien mira.
  const viewer = getUserId();
  const memberships = useMyMemberships(!own && viewer ? viewer : undefined);
  const memberLeagues = new Set(memberships.data.map((m) => m.leagueId));
  const [filter, setFilter] = useState(ALL);
  const [showLocked, setShowLocked] = useState(false);
  const [picked, setPicked] = useState<{ subject: SheetSubject; animate: boolean } | null>(null);

  const model = data.data ? tabModel(data.data, progress.data, sports, now, opened) : null;
  // Las que se ven debajo del nombre (elegidas o, si no eligió, las que salen solas).
  const shown = own && data.data ? featuredModel(data.data, stats.data) : null;

  if (data.loading && !data.data) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Cargando insignias" />
      </View>
    );
  }
  if (data.error && !data.data) return <LoadError error={data.error} onRetry={() => invalidate(badgeTags.user(userId))} />;
  if (!model) return null;

  const linked = !picked && link ? linkedSubject(model, link.id) : null;
  const active = picked ?? (linked ? { subject: linked, animate: !link?.still && linked.kind === 'award' && linked.tile.state === 'new' } : null);
  // Si el detalle abierto cambió (se ocultó, se destacó), se muestra lo de ahora.
  const current = active ? currentSubject(model, active.subject) : null;

  const open = (s: SheetSubject) => {
    if ((s.kind === 'award' || s.kind === 'league') && own) markOpened(s.tile.views.map((v) => v.award.id));
    setPicked({ subject: s, animate: s.kind === 'award' && s.tile.state === 'new' });
  };
  const close = () => {
    if (!picked && linked && (linked.kind === 'award' || linked.kind === 'league') && own) markOpened(linked.tile.views.map((v) => v.award.id));
    if (link) onLinkDone?.();
    setPicked(null);
  };

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
        onClose={close}
        own={model.own}
        featured={shown ? featuredIds(shown) : []}
        featuredAuto={!!shown?.auto}
        stats={stats.data}
        progress={model.progress}
        webPath={(id) => (model.own ? myBadgesPath(id, { still: true }) : `/u/${userId}?tab=insignias&insignia=${encodeURIComponent(id)}&quieta=1`)}
        canReport={current?.kind === 'award' && canReportAward(current.tile.top.award, model.own, memberLeagues)}
        animate={!!active?.animate}
      />
    </>
  );
}

// ---------- Destacadas ----------

/**
 * La fila de destacadas (FeaturedRow de la web): hasta 3 a 40 (las de la liga con la marca «LIGA»); tocar una la abre en
 * la pestaña. El dueño tiene el lápiz para elegirlas o, sin ninguna, «Elige hasta 3 para mostrar aquí»; si salen solas,
 * se lo dice debajo.
 */
export function FeaturedRow({ model, own, canPick, onPick, onOpen }: { model: FeaturedModel; own: boolean; canPick: boolean; onPick: () => void; onOpen: (awardId: string) => void }) {
  const c = useColors();
  const { items, auto } = model;
  if (!items.length && !(own && canPick)) return null;
  const edit = featuredEditLabel(auto);
  return (
    <View style={styles.featured}>
      {items.map((it) => (
        <Pressable
          key={it.id}
          accessibilityRole="button"
          accessibilityLabel={it.label}
          onPress={() => onOpen(it.id)}
          style={({ pressed }) => [styles.featuredItem, { backgroundColor: pressed ? c.surface2 : 'transparent', transform: [{ scale: pressed ? 0.95 : 1 }] }]}
        >
          <Insignia badge={it.view.look} size={40} />
          {it.kind === 'liga' && <LeagueMark style={{ position: 'absolute', top: -2, right: -4 }} />}
        </Pressable>
      ))}
      {own && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={items.length ? edit : 'Elige hasta 3 para mostrar aquí'}
          onPress={onPick}
          style={({ pressed }) => [styles.pick, items.length > 0 && { width: 44, paddingHorizontal: 0 }, { backgroundColor: pressed ? c.accentSoft : 'transparent' }]}
        >
          {items.length ? (
            <Pencil size={18} color={c.accent} />
          ) : (
            <>
              <Sparkles size={18} color={c.accent} />
              <Txt variant="meta" tone="accent" style={{ fontFamily: font.medium }}>
                Elige hasta 3 para mostrar aquí
              </Txt>
            </>
          )}
        </Pressable>
      )}
      {own && auto && items.length > 0 && (
        <Txt tone="muted" style={{ width: '100%', textAlign: 'center', fontSize: 11 }}>
          Salen solas · toca el lápiz para elegirlas
        </Txt>
      )}
    </View>
  );
}

/**
 * Hasta 3 insignias a 40 debajo del nombre (§6.1, FeaturedBadges de la web): las que eligió la cuenta, automáticas o
 * de sus ligas. Si no eligió ninguna salen solas. `onOpen` abre una en la pestaña.
 */
export function FeaturedBadges({ userId, onOpen }: { userId: string; onOpen: (awardId: string) => void }) {
  const data = useProfileBadges(userId);
  const [picking, setPicking] = useState(false);
  // La rareza solo hace falta para las que salen solas.
  const stats = useBadgeStats(featuredIsAuto(data.data));
  const model = featuredModel(data.data, stats.data);
  if (!data.data) return null;
  const own = data.data.isMe;
  return (
    <>
      <FeaturedRow model={model} own={own} canPick={own && canFeature(data.data)} onPick={() => setPicking(true)} onOpen={onOpen} />
      {own && picking && <FeaturedPicker data={data.data} shown={model} onClose={() => setPicking(false)} />}
    </>
  );
}

/** Una que se puede elegir, con su número si ya está elegida. */
function Pickable({ at, children }: { at: number; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.pickable, at >= 0 && { backgroundColor: c.accentSoft, borderColor: c.accent }]}>
      {children}
      {at >= 0 && (
        <View pointerEvents="none" aria-hidden style={[styles.slot, { backgroundColor: c.accent }]}>
          <Txt style={{ color: c.accentFg, fontSize: 11, lineHeight: 14, fontFamily: font.bold }}>{at + 1}</Txt>
        </View>
      )}
    </View>
  );
}

/**
 * Elegir hasta 3 destacadas (FeaturedPicker de la web), en el orden en que se tocan: las automáticas que se ven y las
 * de sus ligas que los demás ven en el perfil. Abre con las que se ven debajo del nombre marcadas.
 */
export function FeaturedPicker({ data, shown, onClose }: { data: ProfileBadges; shown: FeaturedModel; onClose: () => void }) {
  const c = useColors();
  const now = useNow().getTime();
  const [start] = useState<string[]>(() => pickerStart(data, shown));
  const [picked, setPicked] = useState<string[]>(start);
  const [saving, setSaving] = useState(false);
  const tiles = groupTiles(data.awards, { own: true, now }).filter((t) => t.bucket === 'ok');
  const leagueTiles = featurableLeagueTiles(data, now);

  const toggle = (t: BadgeTileModel | LeagueTileModel) => {
    const r = pickerToggle(picked, t);
    if (r.full) {
      toast(FEATURED_FULL, 'error');
      return;
    }
    setPicked(r.next);
  };

  const save = async () => {
    const plan = pickerSave(start, picked, shown.auto);
    if (!plan.save) {
      onClose();
      return;
    }
    setSaving(true);
    const ok = await runAction(async () => {
      await setFeaturedBadges(picked);
      return true;
    }, plan.done);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Destacadas"
      footer={
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
          <Button onPress={onClose}>Cancelar</Button>
          <Button variant="primary" loading={saving} icon={<Save size={18} color={c.accentFg} />} onPress={() => void save()}>
            Guardar
          </Button>
        </View>
      }
    >
      <View style={{ gap: 4 }}>
        <Txt variant="meta" tone="muted">
          {pickerIntro(picked.length)}
        </Txt>
        {shown.auto && (
          <Txt variant="small" tone="muted">
            Mientras no elijas, salen solas: primero tus premios del torneo.
          </Txt>
        )}
      </View>
      <FeaturedChoices tiles={tiles} leagueTiles={leagueTiles} picked={picked} onToggle={toggle} />
    </Sheet>
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
  return (
    <View style={{ gap: 16 }}>
      {tiles.length > 0 && (
        <View>
          {leagueTiles.length > 0 && <Caps>MatchMate</Caps>}
          <BadgeGrid>
            {tiles.map((t) => {
              const at = pickerSlot(picked, t);
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
        </View>
      )}
      {leagueTiles.length > 0 && (
        <View>
          <Caps>De mis ligas</Caps>
          <BadgeGrid>
            {leagueTiles.map((t) => {
              const at = pickerSlot(picked, t);
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
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caps: { fontSize: 11, lineHeight: 15, fontFamily: font.semibold, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44, borderRadius: 12, paddingHorizontal: 12 },
  featured: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 },
  featuredItem: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, paddingHorizontal: 12 },
  pickable: { borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  slot: { position: 'absolute', top: 4, left: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
