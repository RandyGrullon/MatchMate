import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Copy, Lock, Save } from 'lucide-react';
import { Insignia, SHAPES, SHAPE_ORDER, humanPeriod, type BadgeShape } from '../../../badges/visual';
import { saveLeagueBadge, type LeagueBadge, type LimitKind } from '../../../lib/data/leagueBadges';
import { useLeagueCtx } from '../../../lib/league';
import { ACCENT_PRESETS } from '../../../lib/theme';
import { leagueSport } from '../../../sports/registry';
import { SPORT_FAMILY, type SportId } from '../../../sports/types';
import { sportColor } from '../../share/palette';
import { useFeedback } from '../../feedback';
import { Button, Input, Modal, Textarea, cx } from '../../ui';
import { BADGE_TEXT_MAX, textLength } from '../text';
import {
  LIMIT_INFO,
  PALETTE_OPTIONS,
  blankDraft,
  draftDesign,
  draftErrors,
  draftFromBadge,
  draftLook,
  draftPatch,
  draftPayload,
  hasErrors,
  isEmptyPatch,
  isHexColor,
  makerCode,
  makerErrorText,
  paletteDot,
  periodChoices,
  templateDraft,
  type DesignDraft,
  type DraftErrors,
  type PeriodChoice,
} from './design';
import { IconPicker } from './IconPicker';
import { colorAdjusted } from './look';
import { Chip, Counter, Dot, FieldBox, PreviewPair, ShapeOutline, Toggle } from './parts';
import { byTeamAllowed, templateName, templatesFor, type TemplateKey } from './templates';

/** Qué abre el editor: una nueva (con o sin plantilla), cambiar una guardada o hacer una copia («Duplicar»). */
export type EditorMode = { kind: 'new'; template?: TemplateKey | null } | { kind: 'edit'; badge: LeagueBadge } | { kind: 'copy'; badge: LeagueBadge };

const LIMITS: readonly LimitKind[] = ['unica', 'selecta', 'abierta'];

/**
 * «Nueva insignia» (docs/insignias.md §5.4): el editor con la vista previa en claro y en oscuro a 128 px y la fila a
 * 24, 40 y 64 px, que se actualiza con cada letra. Guarda con `save_league_badge`: al crear, todo; al editar, solo lo
 * que cambió (un diseño que ya se dio solo cambia la descripción; para más, «Duplicar»).
 */
export function BadgeEditor({
  mode,
  onClose,
  onSaved,
  onDuplicate,
}: {
  /** null = cerrado. */
  mode: EditorMode | null;
  onClose: () => void;
  onSaved?: (badge: LeagueBadge) => void;
  /** «Duplicar» desde un diseño bloqueado. */
  onDuplicate?: (badge: LeagueBadge) => void;
}) {
  const [busy, setBusy] = useState(false);
  const title = mode?.kind === 'edit' ? 'Cambiar la insignia' : mode?.kind === 'copy' ? 'Copia de la insignia' : 'Nueva insignia';
  return (
    <Modal open={mode != null} onClose={onClose} title={title} wide footer={mode ? <EditorFooter onClose={onClose} busy={busy} /> : undefined}>
      {mode && (
        <EditorForm
          key={mode.kind === 'new' ? `new-${mode.template ?? ''}` : `${mode.kind}-${mode.badge.id}`}
          mode={mode}
          onClose={onClose}
          onSaved={onSaved}
          onDuplicate={onDuplicate}
          onBusy={setBusy}
        />
      )}
    </Modal>
  );
}

const FORM_ID = 'insignia-editor';

function EditorFooter({ onClose, busy }: { onClose: () => void; busy: boolean }) {
  return (
    <>
      <Button className="min-h-11" onClick={onClose}>Cancelar</Button>
      <Button className="min-h-11" variant="primary" type="submit" form={FORM_ID} loading={busy} icon={<Save className="size-4" />}>
        Guardar diseño
      </Button>
    </>
  );
}

function EditorForm({
  mode,
  onClose,
  onSaved,
  onDuplicate,
  onBusy,
}: {
  mode: EditorMode;
  onClose: () => void;
  onSaved?: (badge: LeagueBadge) => void;
  onDuplicate?: (badge: LeagueBadge) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { lid, league } = useLeagueCtx();
  const { toast } = useFeedback();
  const sport = leagueSport(league);
  const choices = useMemo(() => periodChoices(league, Date.now()), [league]);
  const [draft, setDraft] = useState<DesignDraft>(() =>
    mode.kind === 'new' ? (mode.template ? templateDraft(mode.template, sport, league.kind) : blankDraft()) : { ...draftFromBadge(mode.badge, choices) },
  );
  const original = mode.kind === 'edit' ? mode.badge : null;
  const [locked, setLocked] = useState(original?.locked ?? false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errors = draftErrors(draft);
  const shown = shownErrors(errors, draft, tried);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setFailure(null);
    // Bloqueada, solo cuenta la descripción (lo demás no se manda).
    if (saving || (locked ? !!errors.description : hasErrors(errors))) return;
    setSaving(true);
    onBusy(true);
    try {
      let saved: LeagueBadge;
      if (original) {
        const patch = draftPatch({ ...original, locked }, draft, choices, sport);
        if (isEmptyPatch(patch)) {
          onClose();
          return;
        }
        saved = await saveLeagueBadge(lid, original.id, patch);
        toast('Cambios guardados');
      } else {
        saved = await saveLeagueBadge(lid, null, draftPayload(draft, choices, sport));
        toast(`«${saved.name}» está lista para dar`);
      }
      // Primero se cierra: quien abrió el editor puede abrir otra cosa (el detalle de la nueva).
      onClose();
      onSaved?.(saved);
    } catch (err) {
      console.error(err);
      if (makerCode(err) === 'ya_dada') setLocked(true);
      setFailure(makerErrorText(err, { action: 'guardar' }));
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  return (
    <form id={FORM_ID} onSubmit={submit} noValidate>
      <EditorBody
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onTemplate={(key) => setDraft((d) => withTemplate(d, templateDraft(key, sport, league.kind)))}
        choices={choices}
        sport={sport}
        kind={league.kind}
        leagueName={league.name}
        isNew={mode.kind !== 'edit'}
        locked={locked}
        errors={shown}
        failure={failure}
        onDuplicate={original && onDuplicate ? () => onDuplicate(original) : undefined}
      />
    </form>
  );
}

/**
 * Los avisos que se ven: el del nombre no sale mientras se escriben las primeras letras («C» todavía no es un error);
 * sale al intentar guardar, o si ya tiene 3 o más y algo no está bien (muy largo, un texto que no se puede usar). Lo
 * demás, al escribir. El contador de letras guía mientras tanto.
 */
export function shownErrors(errors: DraftErrors, draft: Pick<DesignDraft, 'name'>, tried: boolean): DraftErrors {
  return tried || draft.name.trim().length >= 3 ? errors : { ...errors, name: undefined };
}

/** Elegir una plantilla no borra lo que ya se escribió: el nombre y la descripción propios se quedan. */
export function withTemplate(current: DesignDraft, template: DesignDraft): DesignDraft {
  return {
    ...template,
    name: current.name.trim() ? current.name : template.name,
    description: current.description.trim() ? current.description : template.description,
  };
}

const familyOf = (sport: string) => (Object.hasOwn(SPORT_FAMILY, sport) ? SPORT_FAMILY[sport as SportId] : null);

/** El cuerpo del editor sin el modal (se prueba con renderToString). */
export function EditorBody({
  draft,
  onChange,
  onTemplate,
  choices,
  sport,
  kind,
  leagueName,
  isNew,
  locked,
  errors,
  failure,
  onDuplicate,
}: {
  draft: DesignDraft;
  onChange: (patch: Partial<DesignDraft>) => void;
  onTemplate: (key: TemplateKey) => void;
  choices: readonly PeriodChoice[];
  sport: string;
  kind?: string;
  leagueName: string;
  isNew: boolean;
  locked: boolean;
  errors: DraftErrors;
  failure?: string | null;
  onDuplicate?: () => void;
}) {
  const look = draftLook(draft, choices, sport);
  const design = draftDesign(draft, choices);
  const name = design.name || 'Sin nombre';
  const period = humanPeriod(look.period);
  const adjusted = colorAdjusted(design, sport);
  const off = locked;
  const sportHex = sportColor(sport);
  const teamWord = familyOf(sport) === 'racket' ? 'Por pareja' : 'Por equipo';
  // En el teléfono la vista previa grande se va al bajar: una tira con la insignia a 40 queda arriba mientras tanto.
  const preview = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const el = preview.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setGone(!e.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div>
      {/* No ocupa lugar (alto 56 y margen −56): aparece sin mover nada. */}
      <div
        aria-hidden="true"
        className={cx(
          'sticky -top-4 z-20 -mx-5 -mb-14 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-5 backdrop-blur transition-opacity sm:hidden',
          gone ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <Insignia badge={look} size={40} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
        {period && <span className="shrink-0 text-xs text-muted">{period}</span>}
      </div>
      <div className="grid gap-5 sm:grid-cols-[19rem_minmax(0,1fr)]">
        <div ref={preview} className="flex flex-col gap-2 sm:sticky sm:top-0 sm:self-start">
          <PreviewPair look={look} name={name} sub={`${leagueName}${period ? ` · ${period}` : ''}`} />
          {adjusted && <p className="text-center text-xs text-muted">Ajustamos el tono para que se lea bien.</p>}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {failure && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2.5 text-sm font-medium text-danger">
              {failure}
            </p>
          )}
          {locked && (
            <div className="flex flex-col gap-2 rounded-xl border border-warn/40 bg-warn-soft px-3 py-2.5 text-sm">
              <p className="flex items-start gap-2 font-medium text-warn">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Esta insignia ya se dio: solo puedes cambiar la descripción. Duplícala para hacer otra versión.
              </p>
              {onDuplicate && (
                <Button size="sm" className="min-h-11 self-start" icon={<Copy className="size-4" />} onClick={onDuplicate}>
                  Duplicar
                </Button>
              )}
            </div>
          )}

          {isNew && (
            <fieldset className="min-w-0 flex flex-col gap-1.5">
              <legend className="mb-1.5 text-xs font-medium text-muted">Empieza con una plantilla</legend>
              <div className="flex flex-wrap gap-1.5">
                {templatesFor(kind).map((t) => (
                  <Chip key={t.key} on={draft.template === t.key} onClick={() => onTemplate(t.key)}>
                    {templateName(t.key, sport, kind === 'torneo')}
                  </Chip>
                ))}
              </div>
            </fieldset>
          )}

          <FieldBox
            label="Nombre (sale debajo de la insignia)"
            htmlFor="insignia-nombre"
            count={<Counter value={textLength(draft.name)} max={BADGE_TEXT_MAX.name} />}
            error={errors.name}
            errorId="insignia-nombre-error"
          >
            <Input
              id="insignia-nombre"
              value={draft.name}
              maxLength={BADGE_TEXT_MAX.name}
              autoComplete="off"
              disabled={off}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'insignia-nombre-error' : undefined}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </FieldBox>

          <fieldset disabled={off} className="min-w-0 flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium text-muted">Forma</legend>
            <div className="flex flex-wrap gap-1.5">
              {SHAPE_ORDER.map((s: BadgeShape) => (
                <Chip key={s} on={draft.shape === s} onClick={() => onChange({ shape: s })} disabled={off}>
                  <ShapeOutline shape={s} className="size-4.5" />
                  {SHAPES[s].name}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={off} className="min-w-0 flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium text-muted">Color</legend>
            <div className="flex flex-wrap gap-1.5">
              {PALETTE_OPTIONS.map((p) => (
                <Chip key={p.value} on={draft.palette === p.value} onClick={() => onChange({ palette: p.value })} disabled={off}>
                  <Dot color={paletteDot(p.value, sportHex, draft.color)} />
                  {p.label}
                </Chip>
              ))}
            </div>
            {draft.palette === 'color' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Colores">
                  {ACCENT_PRESETS.map((c) => {
                    const on = draft.color.toLowerCase() === c.hex;
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        aria-label={c.name}
                        aria-pressed={on}
                        title={c.name}
                        onClick={() => onChange({ color: c.hex })}
                        className={cx('flex size-11 items-center justify-center rounded-xl transition hover:bg-surface-2', on && 'bg-surface-2')}
                      >
                        <span
                          className={cx('size-7 rounded-full border border-black/10', on && 'ring-2 ring-accent ring-offset-2 ring-offset-surface')}
                          style={{ background: c.hex }}
                        />
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Elegir color"
                    value={isHexColor(draft.color) ? draft.color.toLowerCase() : sportHex}
                    onChange={(e) => onChange({ color: e.target.value })}
                    className="size-11 shrink-0 cursor-pointer rounded-xl border border-line bg-surface p-1"
                  />
                  <Input
                    value={draft.color}
                    maxLength={7}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Color en hexadecimal"
                    aria-invalid={!!errors.color}
                    placeholder="#0d9488"
                    className="max-w-36 font-mono"
                    onChange={(e) => onChange({ color: e.target.value.trim() })}
                  />
                </div>
                {errors.color && (
                  <p role="alert" className="text-xs font-medium text-danger">
                    {errors.color}
                  </p>
                )}
              </div>
            )}
          </fieldset>

          <fieldset disabled={off} className="min-w-0 flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium text-muted">Ícono</legend>
            {off ? <p className="text-sm text-muted">No se puede cambiar: la insignia ya se dio.</p> : <IconPicker value={draft.icon} onChange={(icon) => onChange({ icon })} />}
          </fieldset>

          <FieldBox
            label="Texto de arriba (opcional, solo en grande)"
            htmlFor="insignia-arriba"
            count={<Counter value={textLength(draft.topText)} max={BADGE_TEXT_MAX.top} />}
            error={errors.topText}
            errorId="insignia-arriba-error"
          >
            <Input
              id="insignia-arriba"
              value={draft.topText}
              maxLength={BADGE_TEXT_MAX.top}
              autoComplete="off"
              disabled={off}
              aria-invalid={!!errors.topText}
              placeholder="LOS PINOS"
              onChange={(e) => onChange({ topText: e.target.value.toUpperCase() })}
            />
          </FieldBox>

          <fieldset disabled={off} className="min-w-0 flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium text-muted">Periodo o texto de abajo</legend>
            <div className="flex flex-wrap gap-1.5">
              {choices.map((c) => (
                <Chip
                  key={c.mode}
                  on={draft.periodMode === c.mode && !draft.periodFree.trim()}
                  disabled={off}
                  onClick={() =>
                    onChange(c.mode === 'torneo' && !draft.topText.trim() ? { periodMode: c.mode, periodFree: '', topText: 'TORNEO' } : { periodMode: c.mode, periodFree: '' })
                  }
                >
                  {c.label}
                  {c.text && <span className="text-xs text-muted">{c.text}</span>}
                </Chip>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={draft.periodFree}
                maxLength={BADGE_TEXT_MAX.period}
                autoComplete="off"
                disabled={off}
                placeholder="O escribe uno: CLAUSURA"
                aria-label="Texto libre de abajo"
                aria-invalid={!!errors.period}
                onChange={(e) => onChange({ periodFree: e.target.value.toUpperCase() })}
              />
              <Counter value={textLength(draft.periodFree)} max={BADGE_TEXT_MAX.period} />
            </div>
            {errors.period && (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.period}
              </p>
            )}
          </fieldset>

          <fieldset disabled={off} className="min-w-0 flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-medium text-muted">Cupo</legend>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Cupo">
              {LIMITS.map((k) => {
                const on = draft.limitKind === k;
                return (
                  <label
                    key={k}
                    className={cx(
                      'flex min-h-11 cursor-pointer flex-col items-start justify-center rounded-xl border px-3 py-2 text-left transition',
                      on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2',
                    )}
                  >
                    <input type="radio" name="insignia-cupo" value={k} checked={on} onChange={() => onChange({ limitKind: k })} className="sr-only" />
                    <span className={cx('text-sm font-semibold', on && 'text-accent')}>{LIMIT_INFO[k].label}</span>
                    <span className="text-xs text-muted">{LIMIT_INFO[k].hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {byTeamAllowed(sport) && (
            <Toggle
              id="insignia-equipo"
              on={draft.byTeam}
              disabled={off}
              onChange={(byTeam) => onChange({ byTeam })}
              label={teamWord}
              hint="Se da al equipo o la pareja completa (cuenta como 1)"
            />
          )}

          <FieldBox
            label="¿Qué hay que hacer para ganarla?"
            htmlFor="insignia-descripcion"
            count={<Counter value={textLength(draft.description)} max={BADGE_TEXT_MAX.description} />}
            error={errors.description}
            errorId="insignia-descripcion-error"
          >
            <Textarea
              id="insignia-descripcion"
              rows={3}
              value={draft.description}
              maxLength={BADGE_TEXT_MAX.description}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'insignia-descripcion-error' : undefined}
              placeholder="Por ejemplo: la mejor serie de la noche de clausura."
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </FieldBox>
        </div>
      </div>
    </div>
  );
}
