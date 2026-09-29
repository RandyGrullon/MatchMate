import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Pause, RotateCcw } from 'lucide-react';
import { Button, cx } from '../../components/ui';
import { contrastRatio } from '../../components/share/palette';
import { ACCENT_PRESETS } from '../../lib/theme';
import { SPORTS, SPORT_LIST } from '../../sports/registry';
import type { SportId } from '../../sports/types';
import { BADGES, CATEGORY_LABEL, badgeSports, fillText, levelNameOf, nameOf, thresholdOf } from '../../badges/catalog';
import type { BadgeDef, Level } from '../../badges/types';
import {
  BADGE_ICONS,
  BADGE_SIZES,
  ICON_TABS,
  Insignia,
  SHAPES,
  SHAPE_ORDER,
  SPORT_EMBLEM,
  TIERS,
  TIER_LABEL,
  TIER_ORDER,
  UnlockInsignia,
  badgeLabel,
  badgePaletteFrom,
  badgeThemeVars,
  makeLook,
  nodesToElements,
  periodRibbon,
  searchIcons,
  svgToReact,
  tierOfLevel,
  type BadgeLook,
  type BadgeShape,
  type BadgeState,
  type BadgeTier,
  type PeriodRibbon,
} from '../../badges/visual';
import { FilterChips, Panel, SectionHeader, Segmented } from './bits';
import { sectionMeta } from './sections';

type Mode = 'light' | 'dark';
type ModeChoice = 'ambos' | Mode;
type SportFilter = 'todos' | 'all' | SportId;

const MODE_LABEL: Record<Mode, string> = { light: 'Claro', dark: 'Oscuro' };
const MODE_OPTIONS: readonly { value: ModeChoice; label: string }[] = [
  { value: 'ambos', label: 'Los dos' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

/** Categoría que dice cada forma (§4.2). */
const SHAPE_USE: Record<BadgeShape, string> = {
  hex: 'Hitos, bienvenida y mejora',
  shield: 'Podios, temporada y torneo',
  circle: 'Constancia, rachas y asistencia',
  star: 'Marcas',
  medal: 'Mensual',
  medal_laurel: 'Anual',
  square: 'Comunidad y juego limpio',
};

// Periodos de ejemplo (la cinta real sale del otorgamiento).
const MONTH = periodRibbon({ kind: 'month', year: 2026, month: 10 });
const SEASON = periodRibbon({ kind: 'season', startsOn: '2026-01-10', endsOn: '2026-11-28' });
const YEAR = periodRibbon({ kind: 'year', year: 2026 });
const LEAGUE_COLOR = '#0d9488';

const STATES: readonly { state: BadgeState; label: string; note: string }[] = [
  { state: 'locked', label: 'Bloqueada', note: 'Solo el dueño' },
  { state: 'progress', label: 'Progreso', note: 'Vas 7 de 10' },
  { state: 'unlocked', label: 'Desbloqueada', note: 'La ven todos' },
  { state: 'new', label: 'Nueva', note: '7 días o hasta abrirla' },
  { state: 'review', label: 'En revisión', note: 'La liga la confirma' },
  { state: 'hidden', label: 'Oculta', note: 'La ocultó el dueño' },
];

/** Ejemplo de cada forma con su periodo típico. */
function shapeLook(shape: BadgeShape, tier: BadgeLook['tier'], sport: SportId | null = 'football'): BadgeLook {
  const period: PeriodRibbon | null =
    shape === 'shield' ? SEASON : shape === 'medal' ? MONTH : shape === 'medal_laurel' ? YEAR : shape === 'circle' ? periodRibbon({ kind: 'streak', count: 8 }) : null;
  const custom = typeof tier === 'object';
  return makeLook({ shape, tier, sport, period, notches: shape === 'circle' ? 8 : undefined, origin: custom ? 'liga' : 'app', icon: custom ? 'bird' : undefined });
}

/** Deporte con que se muestra una insignia del catálogo: el del filtro si lo tiene, si no el primero. */
function sportFor(def: BadgeDef, filter: SportFilter): SportId | 'all' {
  const list = badgeSports(def);
  if (filter !== 'todos' && list.includes(filter)) return filter;
  return list[0];
}

/** La cinta de ejemplo según el periodo de la insignia (§4.5). */
function samplePeriod(def: BadgeDef, threshold: number | undefined): PeriodRibbon | null {
  switch (def.period) {
    case 'mes':
    case 'cajas':
      return MONTH;
    case 'temporada':
      return SEASON;
    case 'anio':
      return YEAR;
    case 'evento':
      return def.shape === 'shield' ? MONTH : null;
    default:
      return def.shape === 'circle' && threshold ? periodRibbon({ kind: 'streak', count: threshold }) : null;
  }
}

interface CatalogCell {
  level: Level;
  look: BadgeLook;
  levelName: string;
  label: string;
}

function catalogCells(def: BadgeDef, sport: SportId | 'all'): CatalogCell[] {
  const name = fillText(nameOf(def, { sport }), { anio: 2026 });
  return [...def.levels]
    .sort((a, b) => a.level - b.level)
    .map(({ level }) => {
      const threshold = thresholdOf(def, level, sport);
      const tier = tierOfLevel(level);
      const look = makeLook({
        shape: def.shape,
        tier,
        sport,
        icon: def.icon,
        period: samplePeriod(def, threshold),
        // En los podios el nivel es el puesto: va en el nombre («Primer lugar»), sin puntos.
        pips: def.compare === 'place' ? 0 : undefined,
        notches: def.shape === 'circle' && def.period === 'siempre' ? threshold : undefined,
      });
      const levelName = fillText(levelNameOf(def, level, { sport }), { n: threshold ?? '' });
      return { level, look, levelName, label: badgeLabel(name, look) };
    });
}

/** Un recuadro por tema (o los dos lado a lado): siempre claro u oscuro, sin importar el modo de la pantalla. */
function ThemeBoxes({ modes, children, className }: { modes: readonly Mode[]; children: (m: Mode) => ReactNode; className?: string }) {
  return (
    <div className={cx('grid gap-3', modes.length > 1 && 'xl:grid-cols-2')}>
      {modes.map((m) => (
        <div key={m} className={cx('min-w-0 rounded-xl border border-line p-3', className)} style={badgeThemeVars(m) as CSSProperties}>
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">{MODE_LABEL[m]}</p>
          {children(m)}
        </div>
      ))}
    </div>
  );
}

function Cell({ children, title, note }: { children: ReactNode; title?: ReactNode; note?: ReactNode }) {
  return (
    <figure className="m-0 flex min-w-0 flex-col items-center gap-1 text-center">
      {children}
      {(title || note) && (
        <figcaption className="text-xs leading-tight">
          {title && <b className="block font-semibold">{title}</b>}
          {note && <span className="text-muted">{note}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/** Un ícono de la grilla de 24 tal cual (trazo del color del texto). */
function IconGlyph({ icon, className }: { icon: string; className?: string }) {
  const els = nodesToElements([{ t: 'icon', key: icon, x: 0, y: 0, k: 1, color: 'currentColor', width: 2 }], 'light');
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      {els.map((el, i) => svgToReact(el, i))}
    </svg>
  );
}

const ratio = (a: string, b: string) => contrastRatio(a, b).toFixed(2);

/**
 * Galería de las insignias (superadmin, docs/insignias.md §4.10 y §6.6): las formas en cada nivel, los tamaños, los
 * estados, la animación de desbloqueo, todo el catálogo en cada nivel, los íconos del creador y los colores de liga,
 * en claro y en oscuro. Para aprobar el dibujo y revisar un cambio de forma, ícono o umbral.
 */
/** `tabs`: el selector de vista de la sección (BadgesSection); va junto al del tema. */
export default function BadgesGallery({ tabs }: { tabs?: ReactNode } = {}) {
  const [choice, setChoice] = useState<ModeChoice>('ambos');
  const [sport, setSport] = useState<SportFilter>('todos');
  const [replay, setReplay] = useState(0);
  const [still, setStill] = useState(false);
  const [unlockTier, setUnlockTier] = useState<BadgeTier | 'unico'>('oro');
  const [iconQuery, setIconQuery] = useState('');
  const modes: readonly Mode[] = choice === 'ambos' ? ['light', 'dark'] : [choice];

  const sportChips = useMemo(
    () => [
      { key: 'todos' as SportFilter, label: 'Todas', count: BADGES.length },
      { key: 'all' as SportFilter, label: 'Cuenta', count: BADGES.filter((d) => d.sports === 'all').length },
      ...SPORT_LIST.map((s) => ({ key: s.id as SportFilter, label: s.short, count: BADGES.filter((d) => d.sports !== 'all' && d.sports.includes(s.id)).length })),
    ],
    [],
  );
  const defs = useMemo(
    () => BADGES.filter((d) => sport === 'todos' || (sport === 'all' ? d.sports === 'all' : d.sports !== 'all' && d.sports.includes(sport))),
    [sport],
  );
  const levelsShown = defs.reduce((n, d) => n + d.levels.length, 0);
  const iconKeys = iconQuery.trim() ? searchIcons(iconQuery) : null;

  const streak = [3, 6, 12, 24, 36];
  const unlockLook = makeLook({ shape: 'star', tier: unlockTier, sport: 'bowling' });

  return (
    <>
      <SectionHeader
        title="Insignias"
        hint={sectionMeta('insignias').hint}
        actions={
          <>
            {tabs}
            <Segmented label="Tema de la galería" options={MODE_OPTIONS} value={choice} onChange={setChoice} size="sm" />
          </>
        }
      />

      <Panel title="Metales" subtitle="§4.3 · El metal dice el nivel. El texto de la cinta pasa 7:1 y el borde 3:1 contra toda superficie.">
        <ThemeBoxes modes={modes}>
          {(m) => (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              {TIER_ORDER.map((t, i) => {
                const look = makeLook({ shape: 'circle', tier: t, icon: 'flame', period: periodRibbon({ kind: 'streak', count: streak[i] }), notches: streak[i] });
                return (
                  <Cell key={t} title={TIERS[t].name} note={`Cinta ${ratio('#ffffff', TIERS[t].ribbon)}:1 · borde ${m === 'light' ? TIERS[t].rimL : TIERS[t].rimD}`}>
                    <Insignia badge={look} size={128} label={badgeLabel(`Constancia ×${streak[i]}`, look)} />
                  </Cell>
                );
              })}
              <Cell title={TIER_LABEL.unico} note="Oro sin puntos ni tachas">
                <Insignia badge={makeLook({ shape: 'hex', tier: 'unico', icon: 'sparkles' })} size={128} />
              </Cell>
              <Cell title="Color de liga" note={`Campo ${badgePaletteFrom(LEAGUE_COLOR)?.field}`}>
                <Insignia badge={shapeLook('hex', { custom: LEAGUE_COLOR }, 'bowling')} size={128} />
              </Cell>
            </div>
          )}
        </ThemeBoxes>
      </Panel>

      <Panel title="Formas y niveles" subtitle="§4.2 · La forma dice la categoría; el campo y el emblema, el deporte.">
        <ThemeBoxes modes={modes}>
          {() => (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-y-2 text-left text-xs">
                <thead>
                  <tr className="text-muted">
                    <th className="pr-2 font-medium">Forma</th>
                    {[...TIER_ORDER, 'unico' as const].map((t) => (
                      <th key={t} className="px-1 text-center font-medium">
                        {TIER_LABEL[t]}
                      </th>
                    ))}
                    <th className="px-1 text-center font-medium">Liga</th>
                  </tr>
                </thead>
                <tbody>
                  {SHAPE_ORDER.map((s) => (
                    <tr key={s}>
                      <th className="pr-2 align-middle font-normal">
                        <b className="block font-semibold">{SHAPES[s].name}</b>
                        <span className="text-muted">{SHAPE_USE[s]}</span>
                      </th>
                      {[...TIER_ORDER, 'unico' as const].map((t) => (
                        <td key={t} className="px-1 text-center">
                          <Insignia badge={shapeLook(s, t)} size={64} label={`${SHAPES[s].name}, ${TIER_LABEL[t].toLowerCase()}`} className="mx-auto" />
                        </td>
                      ))}
                      <td className="px-1 text-center">
                        <Insignia badge={shapeLook(s, { custom: LEAGUE_COLOR }, 'bowling')} size={64} label={`${SHAPES[s].name}, color de liga`} className="mx-auto" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ThemeBoxes>
      </Panel>

      <Panel title="Tamaños" subtitle="§4.6 · 24 px junto a nombres, 40 en avisos, 64 en la grilla y 128 en el detalle. Cada uno con su detalle.">
        <ThemeBoxes modes={modes}>
          {() => (
            <div className="flex flex-col gap-4">
              {SHAPE_ORDER.map((s) => (
                <div key={s} className="flex flex-wrap items-end gap-5">
                  {BADGE_SIZES.map((size) => (
                    <Cell key={size} note={`${size} px`}>
                      <Insignia badge={shapeLook(s, 'oro', 'bowling')} size={size} label={`${SHAPES[s].name}, oro, ${size} píxeles`} />
                    </Cell>
                  ))}
                </div>
              ))}
            </div>
          )}
        </ThemeBoxes>
      </Panel>

      <Panel title="Estados" subtitle="§4.7 · Bloqueadas, progreso, revisión y ocultas solo las ve el dueño.">
        <ThemeBoxes modes={modes}>
          {() => (
            <div className="flex flex-col gap-4">
              {([40, 64, 128] as const).map((size) => (
                <div key={size} className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {STATES.map(({ state, label, note }) => (
                    <Cell key={state} title={size === 40 ? label : undefined} note={size === 40 ? note : undefined}>
                      <Insignia
                        badge={makeLook({ shape: 'hex', tier: 'oro', sport: 'tennis' })}
                        size={size}
                        state={state}
                        progress={0.7}
                        pad
                        label={badgeLabel('Victorias', { tier: 'oro' }, state)}
                      />
                    </Cell>
                  ))}
                </div>
              ))}
            </div>
          )}
        </ThemeBoxes>
      </Panel>

      <Panel
        title="Desbloqueo"
        subtitle="§4.8 · 1.3 s; con movimiento reducido o la pestaña oculta, solo un fundido de 200 ms."
        actions={
          <>
            <Button size="sm" variant={still ? 'primary' : 'secondary'} icon={<Pause className="size-4" />} onClick={() => setStill((v) => !v)} aria-pressed={still}>
              Sin movimiento
            </Button>
            <Button size="sm" variant="primary" icon={<RotateCcw className="size-4" />} onClick={() => setReplay((r) => r + 1)}>
              Repetir
            </Button>
          </>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Nivel de la animación">
          {[...TIER_ORDER, 'unico' as const].map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={unlockTier === t}
              onClick={() => {
                setUnlockTier(t);
                setReplay((r) => r + 1);
              }}
              className={cx(
                'h-8 rounded-full px-3 text-sm font-medium transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                unlockTier === t ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted hover:text-fg',
              )}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
        <ThemeBoxes modes={modes}>
          {() => (
            <div className="flex justify-center">
              <UnlockInsignia badge={unlockLook} replay={replay} still={still} label={badgeLabel('Club 250', unlockLook)} />
            </div>
          )}
        </ThemeBoxes>
      </Panel>

      <Panel title="Catálogo" subtitle={`§2 · ${defs.length} insignias, ${levelsShown} niveles. Cada una con el deporte del filtro (o el primero que tiene).`}>
        <div className="mb-3">
          <FilterChips label="Deporte" items={sportChips} value={sport} onChange={setSport} />
        </div>
        <ThemeBoxes modes={modes}>
          {() => (
            <div className="grid gap-2 sm:grid-cols-2">
              {defs.map((def) => {
                const sp = sportFor(def, sport);
                const cells = catalogCells(def, sp);
                return (
                  <article key={def.key} className="flex min-w-0 flex-col gap-2 rounded-lg bg-surface-2/60 p-2.5">
                    <header className="min-w-0">
                      <h3 className="truncate text-sm font-semibold">{fillText(nameOf(def, { sport: sp }), { anio: 2026 })}</h3>
                      <p className="truncate text-xs text-muted">
                        <code>{def.key}</code> · {CATEGORY_LABEL[def.category]} · {sp === 'all' ? 'Cuenta' : SPORTS[sp].short}
                      </p>
                    </header>
                    <div className="flex flex-wrap gap-2">
                      {cells.map((c) => (
                        <Cell key={c.level} note={c.levelName}>
                          <Insignia badge={c.look} size={64} label={c.label} />
                        </Cell>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </ThemeBoxes>
      </Panel>

      <Panel title="Emblemas por deporte" subtitle="§4.4 · El blanco sobre cada campo pasa 4.5:1 (el peor es tenis).">
        <ThemeBoxes modes={modes}>
          {() => (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
              {SPORT_LIST.map((s) => {
                const look = makeLook({ shape: 'hex', tier: 'plata', sport: s.id });
                return (
                  <Cell key={s.id} title={s.short} note={`${ratio('#ffffff', look.field)}:1`}>
                    <Insignia badge={look} size={64} label={`${s.short}: ${BADGE_ICONS[SPORT_EMBLEM[s.id]].label}`} />
                  </Cell>
                );
              })}
            </div>
          )}
        </ThemeBoxes>
      </Panel>

      <Panel title="Íconos del creador" subtitle={`§5.4 · ${Object.keys(BADGE_ICONS).length} íconos en ${ICON_TABS.length} pestañas, con búsqueda sin tildes.`}>
        <input
          type="search"
          value={iconQuery}
          onChange={(e) => setIconQuery(e.target.value)}
          placeholder="Busca: trofeo, fuego, cigua…"
          aria-label="Buscar ícono"
          className="mb-3 h-10 w-full max-w-sm rounded-xl border border-line bg-bg px-3 text-sm outline-none focus-visible:border-accent"
        />
        {(iconKeys ? [{ key: 'q', label: `Con «${iconQuery.trim()}»`, keys: iconKeys }] : ICON_TABS.map((t) => ({ key: t.key, label: t.label, keys: searchIcons('', t.key) }))).map((g) => (
          <section key={g.key} className="mb-3">
            <h3 className="mb-1.5 text-xs font-semibold text-muted">{g.label}</h3>
            {g.keys.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
                {g.keys.map((k) => (
                  <div key={k} className="flex flex-col items-center gap-1 rounded-lg bg-surface-2 p-2 text-center" title={k}>
                    <IconGlyph icon={k} className="size-6" />
                    <span className="text-[11px] leading-tight">{BADGE_ICONS[k].label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No encontramos ese ícono. Prueba con «trofeo», «fuego» o «cigua».</p>
            )}
          </section>
        ))}
        <p className="text-xs text-muted">
          De estado (no salen en el creador):{' '}
          {(['lock', 'hourglass', 'eye-off'] as const).map((k) => (
            <span key={k} className="mx-1 inline-flex items-center gap-1 align-middle">
              <IconGlyph icon={k} className="size-4" />
              <code>{k}</code>
            </span>
          ))}
        </p>
      </Panel>

      <Panel title="Colores de liga" subtitle="§4.3 · Del color elegido salen campo (4.5:1), cinta (7:1) y bordes (3:1). Si hubo que cambiarlo, el editor lo dice.">
        <ThemeBoxes modes={modes}>
          {() => (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[...ACCENT_PRESETS.map((p) => ({ name: p.name, hex: p.hex })), { name: 'Amarillo', hex: '#facc15' }, { name: 'Celeste', hex: '#22d3ee' }].map((c) => {
                const p = badgePaletteFrom(c.hex);
                return (
                  <Cell key={c.hex} title={c.name} note={p ? `${p.field} · ${p.adjusted ? 'ajustado' : 'sin ajuste'}` : c.hex}>
                    <Insignia badge={shapeLook('shield', { custom: c.hex }, 'bowling')} size={64} label={`${c.name}, color de liga`} />
                  </Cell>
                );
              })}
            </div>
          )}
        </ThemeBoxes>
      </Panel>
    </>
  );
}
