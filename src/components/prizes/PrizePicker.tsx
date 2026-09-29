import { useMemo, useState, type FormEvent } from 'react';
import { Check, ChevronDown, Palette, Plus, Sparkles } from 'lucide-react';
import { Insignia, badgeLabel } from '../../badges/visual';
import { saveLeagueBadge, type LeagueBadge } from '../../lib/data/leagueBadges';
import { anyDelivered, PRIZE_PERIOD_MAX, PRIZE_PLACES, prizeErrorText, setTournamentPrizes, slotKeyOf, type PrizePlace, type TournamentPrize } from '../../lib/data/prizes';
import { useLeagueCtx } from '../../lib/league';
import { bowlingRuleText, defaultPeriod, PLACE_LABEL, type PrizeCategoryDef, type PrizeComp } from '../../prizes/catalog';
import {
  deliveredKeys,
  designsForPlace,
  initialRows,
  PLACE_TEMPLATE,
  setupPayload,
  setupProblem,
  setupSections,
  TEMPLATE_LABEL,
  templateDesign,
  withPodiumTemplates,
  type PodiumTemplate,
  type SetupRows,
} from '../../prizes/setup';
import { saveErrorMessage, useFeedback } from '../feedback';
import { Badge, Button, Input, Sheet, cx } from '../ui';
import { BadgeEditor } from '../badges/maker/BadgeEditor';
import { draftPayload, makerErrorText, periodChoices, templateDraft } from '../badges/maker/design';
import { designLook } from '../badges/maker/look';
import { Counter, FieldError } from '../badges/maker/parts';
import { badgeTextError, cleanBadgeText, textLength } from '../badges/text';

const FORM_ID = 'premios-elegir';

export interface PrizePickerProps {
  open: boolean;
  onClose: () => void;
  comp: PrizeComp;
  /** La premiación guardada (null = todavía no hay premios). */
  prize: TournamentPrize | null;
  /** Los diseños de la liga (`useLeagueBadges`). */
  designs: readonly LeagueBadge[];
}

/**
 * «Elegir premios» (docs/premios-torneo.md §6.2): una sección por categoría que premia la competencia («Equipos
 * (scratch)», «Individual (handicap)»…) con el 1.º, el 2.º y el 3.er lugar; en cada uno, la insignia que se lleva: un
 * diseño de la liga o uno nuevo de plantilla («Campeón», «Subcampeón», «Tercer lugar») sin cinta, que sirve para todos
 * los torneos. La cinta la pone el premio (el mes del torneo). Guarda el conjunto completo (set_tournament_prizes).
 */
export function PrizePicker({ open, onClose, comp, prize, designs }: PrizePickerProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={prize ? 'Cambiar premios' : 'Elegir premios'}
      subtitle={comp.name}
      footer={
        <div className="flex justify-end gap-2">
          <Button className="min-h-11" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="min-h-11" variant="primary" type="submit" form={FORM_ID} loading={busy}>
            Guardar premios
          </Button>
        </div>
      }
    >
      {open && <PickerForm key={prize?.id ?? 'nuevo'} comp={comp} prize={prize} designs={designs} onDone={onClose} onBusy={setBusy} />}
    </Sheet>
  );
}

function PickerForm({ comp, prize, designs, onDone, onBusy }: { comp: PrizeComp; prize: TournamentPrize | null; designs: readonly LeagueBadge[]; onDone: () => void; onBusy: (b: boolean) => void }) {
  const { lid, league } = useLeagueCtx();
  const { confirm, toast } = useFeedback();
  const sections = useMemo(() => setupSections(comp, prize), [comp, prize]);
  // Los diseños que se crean aquí se ven antes de que vuelva la lista de la liga.
  const [created, setCreated] = useState<LeagueBadge[]>([]);
  const all = useMemo(() => [...created.filter((c) => !designs.some((d) => d.id === c.id)), ...designs], [created, designs]);
  const [rows, setRows] = useState<SetupRows>(() => initialRows(sections, prize, designs));
  const [period, setPeriod] = useState(prize?.period ?? defaultPeriod(comp.date));
  const [choosing, setChoosing] = useState<string | null>(null);
  const [editorFor, setEditorFor] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const delivered = useMemo(() => deliveredKeys(prize), [prize]);
  const periodLocked = anyDelivered(prize);
  const choices = useMemo(() => periodChoices(league, Date.now()), [league]);

  const cleanPeriod = cleanBadgeText(period).toUpperCase();
  const periodError = textLength(cleanPeriod) > PRIZE_PERIOD_MAX ? `La cinta lleva hasta ${PRIZE_PERIOD_MAX} letras.` : badgeTextError(period);

  /** El diseño de plantilla del podio que ya hay, o uno nuevo sin cinta. */
  async function templateId(key: PodiumTemplate, pool: readonly LeagueBadge[]): Promise<LeagueBadge> {
    const have = templateDesign(pool, key);
    if (have) return have;
    const draft = { ...templateDraft(key, comp.sport, 'torneo'), periodMode: 'none' as const };
    const saved = await saveLeagueBadge(lid, null, draftPayload(draft, choices, comp.sport));
    setCreated((c) => [saved, ...c]);
    return saved;
  }

  async function createFor(key: string, template: PodiumTemplate) {
    setCreating(key);
    setError(null);
    try {
      const b = await templateId(template, []);
      setRows((r) => ({ ...r, [key]: { on: true, badgeId: b.id } }));
      setChoosing(null);
      toast(`«${b.name}» está lista`);
    } catch (e) {
      console.error(e);
      setError(makerErrorText(e, { action: 'guardar' }));
    } finally {
      setCreating(null);
    }
  }

  async function applyTemplates() {
    setCreating('todas');
    setError(null);
    try {
      let pool = [...all];
      const ids = {} as Record<PodiumTemplate, string>;
      for (const key of Object.values(PLACE_TEMPLATE)) {
        const b = await templateId(key, pool);
        pool = [b, ...pool];
        ids[key] = b.id;
      }
      setRows((r) => withPodiumTemplates(sections, r, ids, delivered));
      setChoosing(null);
    } catch (e) {
      console.error(e);
      setError(makerErrorText(e, { action: 'guardar' }));
    } finally {
      setCreating(null);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const problem = periodError ?? setupProblem(sections, rows);
    if (problem) {
      setError(problem);
      return;
    }
    const slots = setupPayload(sections, rows, prize);
    if (!slots.length) {
      if (!prize) {
        setError('Prende al menos un lugar y elige su insignia.');
        return;
      }
      const ok = await confirm({
        title: '¿Quitar los premios del torneo?',
        message: 'Ningún lugar se lleva insignia. Los puedes volver a elegir cuando quieras.',
        confirmText: 'Quitar premios',
        danger: true,
      });
      if (!ok) return;
    }
    setError(null);
    setSaving(true);
    onBusy(true);
    try {
      const saved = await setTournamentPrizes({ lid, scope: comp.scope, refId: comp.refId, period: periodLocked ? null : cleanPeriod, slots });
      toast(saved ? 'Premios guardados' : 'Quitaste los premios del torneo');
      onDone();
    } catch (err) {
      console.error(err);
      setError(prizeErrorText(err, saveErrorMessage));
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  const rule = comp.kind === 'bowling' && comp.bowling ? bowlingRuleText(comp.bowling) : null;

  return (
    <>
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-5">
        <PickerBody
          sections={sections}
          rows={rows}
          designs={all}
          sport={comp.sport}
          period={period}
          periodLocked={periodLocked}
          periodError={periodError}
          delivered={delivered}
          choosing={choosing}
          creating={creating}
          error={error}
          ruleText={rule ? [rule.rule, rule.note].filter(Boolean).join(' ') : null}
          onPeriod={setPeriod}
          onToggle={(key, on) =>
            setRows((r) => ({ ...r, [key]: { on, badgeId: r[key]?.badgeId ?? (on ? (templateDesign(all, PLACE_TEMPLATE[placeOfKey(key)])?.id ?? null) : null) } }))
          }
          onChoosing={(key) => setChoosing((c) => (c === key ? null : key))}
          onChoose={(key, id) => {
            setRows((r) => ({ ...r, [key]: { on: true, badgeId: id } }));
            setChoosing(null);
          }}
          onCreate={createFor}
          onDesign={(key) => setEditorFor(key)}
          onUseTemplates={applyTemplates}
        />
      </form>
      {/* Fuera del formulario: el editor tiene el suyo («Guardar diseño» no guarda los premios). */}
      <BadgeEditor
        mode={editorFor ? { kind: 'new' } : null}
        onClose={() => setEditorFor(null)}
        onSaved={(b) => {
          setCreated((c) => [b, ...c]);
          if (editorFor) setRows((r) => ({ ...r, [editorFor]: { on: true, badgeId: b.id } }));
          setChoosing(null);
        }}
      />
    </>
  );
}

const placeOfKey = (key: string): PrizePlace => (Number(key.split('|')[2]) || 1) as PrizePlace;

export interface PickerBodyProps {
  sections: readonly PrizeCategoryDef[];
  rows: SetupRows;
  designs: readonly LeagueBadge[];
  sport: string;
  period: string;
  periodLocked: boolean;
  periodError?: string | null;
  /** Los lugares ya entregados (no cambian). */
  delivered: ReadonlySet<string>;
  /** El lugar con la lista de insignias abierta. */
  choosing: string | null;
  /** Creando un diseño de plantilla: la clave del lugar o 'todas'. */
  creating: string | null;
  error?: string | null;
  /** «Regla del torneo: Equipos por scratch, Individual con handicap.» (boliche). */
  ruleText?: string | null;
  onPeriod: (v: string) => void;
  onToggle: (key: string, on: boolean) => void;
  onChoosing: (key: string) => void;
  onChoose: (key: string, badgeId: string) => void;
  onCreate: (key: string, template: PodiumTemplate) => void;
  onDesign: (key: string) => void;
  onUseTemplates: () => void;
}

/** El contenido de «Elegir premios» sin estado (las pruebas lo dibujan con renderToString). */
export function PickerBody(p: PickerBodyProps) {
  const byId = new Map(p.designs.map((d) => [d.id, d] as const));
  const periodHint = p.periodLocked ? 'Ya se entregaron premios: la cinta no cambia.' : 'La cinta de abajo de las insignias: el mes del torneo. Hasta 10 letras.';
  return (
    <>
      {p.ruleText && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">{p.ruleText}</p>}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="premios-cinta" className="text-xs font-medium text-muted">
            Cinta de las insignias
          </label>
          <Counter value={textLength(cleanBadgeText(p.period))} max={PRIZE_PERIOD_MAX} />
        </div>
        <Input
          id="premios-cinta"
          value={p.period}
          disabled={p.periodLocked}
          maxLength={20}
          autoCapitalize="characters"
          aria-describedby="premios-cinta-ayuda premios-cinta-error"
          onChange={(e) => p.onPeriod(e.target.value)}
        />
        <p id="premios-cinta-ayuda" className="text-xs text-muted">
          {periodHint}
        </p>
        <FieldError id="premios-cinta-error" text={p.periodError} />
      </div>

      <Button type="button" className="min-h-11 self-start" icon={<Sparkles className="size-4" />} loading={p.creating === 'todas'} disabled={p.creating != null} onClick={p.onUseTemplates}>
        Usar Campeón, Subcampeón y Tercer lugar
      </Button>

      {p.sections.map((sec) => (
        <fieldset key={`${sec.category}|${sec.division}`} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">{sec.title}</legend>
          {PRIZE_PLACES.map((place) => {
            const key = slotKeyOf({ category: sec.category, division: sec.division, place });
            const row = p.rows[key] ?? { on: false, badgeId: null };
            const design = row.badgeId ? (byId.get(row.badgeId) ?? null) : null;
            const locked = p.delivered.has(key);
            const id = `premio-${key.replace(/[^A-Za-z0-9]/g, '-')}`;
            return (
              <div key={key} className={cx('flex flex-col gap-2 rounded-xl border border-line p-3', !row.on && 'bg-surface-2/40')}>
                <div className="flex items-center gap-3">
                  {/* Toda la fila es el interruptor (44 px de alto, como el resto de la hoja). */}
                  <label htmlFor={id} className={cx('flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm font-medium', locked ? 'cursor-default' : 'cursor-pointer')}>
                    <input
                      id={id}
                      type="checkbox"
                      role="switch"
                      className="size-4 shrink-0 accent-[var(--accent)]"
                      checked={row.on}
                      disabled={locked}
                      onChange={(e) => p.onToggle(key, e.target.checked)}
                    />
                    {PLACE_LABEL[place]}
                  </label>
                  {locked && <Badge tone="ok">Entregado</Badge>}
                </div>
                {row.on && (
                  <button
                    type="button"
                    disabled={locked}
                    aria-expanded={p.choosing === key}
                    onClick={() => p.onChoosing(key)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left transition hover:bg-surface-2 disabled:pointer-events-none"
                  >
                    {design ? <Insignia badge={designLook(design, p.sport)} size={40} /> : <span className="size-10 shrink-0 rounded-full border border-dashed border-line" aria-hidden="true" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{design ? design.name : 'Elegir insignia'}</span>
                      {design && design.status !== 'activa' && <span className="block text-xs text-warn">Archivada: elige otra o actívala</span>}
                    </span>
                    {!locked && <ChevronDown className={cx('size-4 shrink-0 text-muted transition', p.choosing === key && 'rotate-180')} aria-hidden="true" />}
                  </button>
                )}
                {row.on && p.choosing === key && !locked && (
                  <PrizeBadgePicker
                    place={place}
                    designs={p.designs}
                    selected={row.badgeId}
                    sport={p.sport}
                    creating={p.creating === key}
                    busy={p.creating != null}
                    onChoose={(badgeId) => p.onChoose(key, badgeId)}
                    onCreate={(t) => p.onCreate(key, t)}
                    onDesign={() => p.onDesign(key)}
                  />
                )}
              </div>
            );
          })}
        </fieldset>
      ))}
      {p.error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {p.error}
        </p>
      )}
    </>
  );
}

/**
 * La lista de insignias para un lugar (§6.2): los diseños activos de la liga, arriba el de plantilla de ese lugar;
 * «Crear “Campeón”» si la liga todavía no lo tiene, y «Diseñar otra» (el editor de siempre).
 */
export function PrizeBadgePicker({
  place,
  designs,
  selected,
  sport,
  creating,
  busy,
  onChoose,
  onCreate,
  onDesign,
}: {
  place: PrizePlace;
  designs: readonly LeagueBadge[];
  selected: string | null;
  sport: string;
  creating?: boolean;
  busy?: boolean;
  onChoose: (badgeId: string) => void;
  onCreate: (template: PodiumTemplate) => void;
  onDesign: () => void;
}) {
  const list = designsForPlace(designs, place);
  const template = PLACE_TEMPLATE[place];
  const missing = !templateDesign(designs, template);
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface-2/60 p-1.5">
      {list.length > 0 && (
        <ul role="listbox" aria-label={`Insignia del ${PLACE_LABEL[place]}`} className="flex max-h-72 flex-col overflow-y-auto">
          {list.map((d) => {
            const look = designLook(d, sport);
            const on = d.id === selected;
            return (
              <li key={d.id} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => onChoose(d.id)}
                  aria-label={badgeLabel(d.name, look)}
                  className={cx('flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1 text-left transition hover:bg-surface', on && 'bg-surface')}
                >
                  <Insignia badge={look} size={40} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                  {on && <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {list.length === 0 && <p className="px-2 py-1.5 text-xs text-muted">La liga todavía no tiene insignias activas.</p>}
      <div className="flex flex-wrap gap-2 p-1">
        {missing && (
          <Button type="button" size="sm" className="min-h-11" icon={<Plus className="size-4" />} loading={creating} disabled={busy} onClick={() => onCreate(template)}>
            Crear «{TEMPLATE_LABEL[template]}»
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" className="min-h-11" icon={<Palette className="size-4" />} disabled={busy} onClick={onDesign}>
          Diseñar otra
        </Button>
      </div>
    </div>
  );
}
