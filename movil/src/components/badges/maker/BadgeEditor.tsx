/**
 * «Nueva insignia» en la app (BadgeEditor de la web, docs/insignias.md §5.4): a pantalla completa, con la vista previa
 * en claro y en oscuro a 128 y la fila a 24, 40 y 64, que se actualiza con cada letra; al bajar, una tira con la
 * insignia a 40 queda arriba. Guarda con `save_league_badge`: al crear, todo; al editar, solo lo que cambió (un diseño
 * que ya se dio solo cambia la descripción; para más, «Duplicar»). La lógica es la de la web (design.ts y view.ts).
 */
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Copy, Lock, Save, X } from 'lucide-react-native';
import { SHAPES, SHAPE_ORDER } from '@mm/badges/visual/geometry';
import { humanPeriod } from '@mm/badges/visual/period';
import type { BadgeShape } from '@mm/badges/visual/types';
import { saveLeagueBadge, type LeagueBadge } from '@mm/lib/data/leagueBadges';
import { useLeagueCtx } from '@mm/lib/league';
import { ACCENT_PRESETS } from '@mm/lib/theme';
import { useNow } from '@mm/lib/useNow';
import { leagueSport } from '@mm/sports/registry';
import { sportColor } from '@mm/components/share/palette';
import { BADGE_TEXT_MAX, textLength } from '@mm/components/badges/text';
import {
  LIMIT_INFO,
  PALETTE_OPTIONS,
  draftDesign,
  draftErrors,
  draftLook,
  draftPatch,
  draftPayload,
  hasErrors,
  isEmptyPatch,
  makerCode,
  makerErrorText,
  paletteDot,
  periodChoices,
  templateDraft,
  type DesignDraft,
  type DraftErrors,
  type PeriodChoice,
} from '@mm/components/badges/maker/design';
import { colorAdjusted } from '@mm/components/badges/maker/look';
import { byTeamAllowed, templateName, templatesFor, type TemplateKey } from '@mm/components/badges/maker/templates';
import {
  ADJUSTED_TEXT,
  BY_TEAM_HINT,
  LIMITS,
  LOCKED_TEXT,
  editorDraft,
  editorKey,
  editorTitle,
  periodChipPatch,
  previewSub,
  shownErrors,
  teamWord,
  withTemplate,
  type EditorMode,
} from '@mm/components/badges/maker/view';
import { Insignia } from '@/components/badges/Insignia';
import { toast } from '@/components/feedback';
import { SwitchRow } from '@/components/prizes/parts';
import { Button, Input, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Chip, Chips, Counter, Dot, FieldBox, FieldError, FieldLabel, PreviewPair, ShapeOutline } from './parts';
import { IconPicker } from './IconPicker';

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
  return (
    <Modal visible={mode != null} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      {mode && <EditorForm key={editorKey(mode)} mode={mode} onClose={onClose} onSaved={onSaved} onDuplicate={onDuplicate} />}
    </Modal>
  );
}

function EditorForm({
  mode,
  onClose,
  onSaved,
  onDuplicate,
}: {
  mode: EditorMode;
  onClose: () => void;
  onSaved?: (badge: LeagueBadge) => void;
  onDuplicate?: (badge: LeagueBadge) => void;
}) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const sport = leagueSport(league);
  const now = useNow().getTime();
  const choices = periodChoices(league, now);
  const [draft, setDraft] = useState<DesignDraft>(() => editorDraft(mode, sport, league.kind, choices));
  const original = mode.kind === 'edit' ? mode.badge : null;
  const [locked, setLocked] = useState(original?.locked ?? false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // La tira de arriba sale cuando la vista previa grande ya se fue al bajar.
  const [previewEnd, setPreviewEnd] = useState(0);
  const [gone, setGone] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const errors = draftErrors(draft);
  const shown = shownErrors(errors, draft, tried);
  const look = draftLook(draft, choices, sport);
  const name = draftDesign(draft, choices).name || 'Sin nombre';
  const period = humanPeriod(look.period);

  async function submit() {
    setTried(true);
    setFailure(null);
    // Bloqueada, solo cuenta la descripción (lo demás no se manda).
    if (saving || (locked ? !!errors.description : hasErrors(errors))) return;
    setSaving(true);
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
      // El aviso va arriba del formulario, debajo de la vista previa.
      scroll.current?.scrollTo({ y: Math.max(0, previewEnd - 24), animated: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: c.line }]}>
          <Txt variant="cardTitle" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
            {editorTitle(mode)}
          </Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" hitSlop={8} onPress={onClose} style={[styles.close, { backgroundColor: c.surface2 }]}>
            <X size={20} color={c.fg} />
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scroll}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={32}
            onScroll={(e) => {
              const next = previewEnd > 0 && e.nativeEvent.contentOffset.y > previewEnd - 64;
              if (next !== gone) setGone(next);
            }}
            contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 20 }}
          >
            <View onLayout={(e) => setPreviewEnd(e.nativeEvent.layout.y + e.nativeEvent.layout.height)} style={{ gap: 8 }}>
              <PreviewPair look={look} name={name} sub={previewSub(league.name, period)} />
              {colorAdjusted(draftDesign(draft, choices), sport) && (
                <Txt variant="small" tone="muted" style={{ textAlign: 'center', fontFamily: font.regular }}>
                  {ADJUSTED_TEXT}
                </Txt>
              )}
            </View>
            <EditorBody
              draft={draft}
              onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              onTemplate={(key) => setDraft((d) => withTemplate(d, templateDraft(key, sport, league.kind)))}
              choices={choices}
              sport={sport}
              kind={league.kind}
              isNew={mode.kind !== 'edit'}
              locked={locked}
              errors={shown}
              failure={failure}
              onDuplicate={original && onDuplicate ? () => onDuplicate(original) : undefined}
            />
          </ScrollView>
          {/* La tira con la insignia a 40: aparece sin mover nada. */}
          {gone && (
            <View pointerEvents="none" aria-hidden style={[styles.strip, { backgroundColor: c.surface, borderBottomColor: c.line }]}>
              <Insignia badge={look} size={40} />
              <Txt variant="meta" numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: font.semibold }}>
                {name}
              </Txt>
              {!!period && (
                <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
                  {period}
                </Txt>
              )}
            </View>
          )}
        </View>
        <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.bg }]}>
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} icon={<Save size={16} color={c.accentFg} />} onPress={submit} style={{ flex: 1 }}>
            Guardar diseño
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** El formulario del editor (lo de debajo de la vista previa). */
function EditorBody({
  draft,
  onChange,
  onTemplate,
  choices,
  sport,
  kind,
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
  isNew: boolean;
  locked: boolean;
  errors: DraftErrors;
  failure?: string | null;
  onDuplicate?: () => void;
}) {
  const c = useColors();
  const off = locked;
  const sportHex = sportColor(sport);
  return (
    <View style={{ gap: 20 }}>
      {!!failure && (
        <View accessibilityLiveRegion="polite" style={[styles.box, { backgroundColor: c.dangerSoft }]}>
          <Txt variant="meta" tone="danger" style={{ fontFamily: font.medium }}>
            {failure}
          </Txt>
        </View>
      )}
      {locked && (
        <View style={[styles.box, { gap: 8, backgroundColor: c.warnSoft, borderWidth: 1, borderColor: c.warn }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Lock size={16} color={c.warn} style={{ marginTop: 2 }} />
            <Txt variant="meta" tone="warn" style={{ flex: 1, fontFamily: font.medium }}>
              {LOCKED_TEXT}
            </Txt>
          </View>
          {onDuplicate && (
            <View style={{ alignSelf: 'flex-start' }}>
              <Button icon={<Copy size={16} color={c.fg} />} onPress={onDuplicate}>
                Duplicar
              </Button>
            </View>
          )}
        </View>
      )}

      {isNew && (
        <View style={{ gap: 6 }}>
          <FieldLabel label="Empieza con una plantilla" />
          <Chips>
            {templatesFor(kind).map((t) => (
              <Chip key={t.key} on={draft.template === t.key} onPress={() => onTemplate(t.key)} text={templateName(t.key, sport, kind === 'torneo')} />
            ))}
          </Chips>
        </View>
      )}

      <FieldBox label="Nombre (sale debajo de la insignia)" count={<Counter value={textLength(draft.name)} max={BADGE_TEXT_MAX.name} />} error={errors.name}>
        <Input
          accessibilityLabel="Nombre (sale debajo de la insignia)"
          value={draft.name}
          maxLength={BADGE_TEXT_MAX.name}
          autoCorrect={false}
          editable={!off}
          invalid={!!errors.name}
          onChangeText={(name) => onChange({ name })}
          style={off ? { opacity: 0.6 } : undefined}
        />
      </FieldBox>

      <View style={{ gap: 6 }}>
        <FieldLabel label="Forma" />
        <Chips>
          {SHAPE_ORDER.map((s: BadgeShape) => (
            <Chip
              key={s}
              on={draft.shape === s}
              disabled={off}
              onPress={() => onChange({ shape: s })}
              text={SHAPES[s].name}
              left={<ShapeOutline shape={s} color={draft.shape === s ? c.accent : c.fg} />}
            />
          ))}
        </Chips>
      </View>

      <View style={{ gap: 6 }}>
        <FieldLabel label="Color" />
        <Chips>
          {PALETTE_OPTIONS.map((p) => (
            <Chip
              key={p.value}
              on={draft.palette === p.value}
              disabled={off}
              onPress={() => onChange({ palette: p.value })}
              text={p.label}
              left={<Dot color={paletteDot(p.value, sportHex, draft.color)} />}
            />
          ))}
        </Chips>
        {draft.palette === 'color' && (
          <View style={{ gap: 6 }}>
            <View accessibilityLabel="Colores" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {ACCENT_PRESETS.map((p) => {
                const on = draft.color.toLowerCase() === p.hex;
                return (
                  <Pressable
                    key={p.hex}
                    accessibilityRole="button"
                    accessibilityLabel={p.name}
                    accessibilityState={{ selected: on, disabled: off }}
                    disabled={off}
                    onPress={() => onChange({ color: p.hex })}
                    style={({ pressed }) => [styles.swatch, { backgroundColor: on || pressed ? c.surface2 : 'transparent' }]}
                  >
                    <View style={[styles.swatchDot, { backgroundColor: p.hex }, on && { borderWidth: 2, borderColor: c.accent }]} />
                  </Pressable>
                );
              })}
            </View>
            <Input
              accessibilityLabel="Color en hexadecimal"
              value={draft.color}
              maxLength={7}
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
              editable={!off}
              placeholder="#0d9488"
              invalid={!!errors.color}
              onChangeText={(t) => onChange({ color: t.trim() })}
              style={{ maxWidth: 160, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}
            />
            <FieldError text={errors.color} />
          </View>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <FieldLabel label="Ícono" />
        {off ? (
          <Txt variant="meta" tone="muted">
            No se puede cambiar: la insignia ya se dio.
          </Txt>
        ) : (
          <IconPicker value={draft.icon} onChange={(icon) => onChange({ icon })} />
        )}
      </View>

      <FieldBox label="Texto de arriba (opcional, solo en grande)" count={<Counter value={textLength(draft.topText)} max={BADGE_TEXT_MAX.top} />} error={errors.topText}>
        <Input
          accessibilityLabel="Texto de arriba (opcional, solo en grande)"
          value={draft.topText}
          maxLength={BADGE_TEXT_MAX.top}
          autoCorrect={false}
          autoCapitalize="characters"
          editable={!off}
          placeholder="LOS PINOS"
          invalid={!!errors.topText}
          onChangeText={(t) => onChange({ topText: t.toUpperCase() })}
          style={off ? { opacity: 0.6 } : undefined}
        />
      </FieldBox>

      <View style={{ gap: 6 }}>
        <FieldLabel label="Periodo o texto de abajo" />
        <Chips>
          {choices.map((ch) => (
            <Chip
              key={ch.mode}
              on={draft.periodMode === ch.mode && !draft.periodFree.trim()}
              disabled={off}
              onPress={() => onChange(periodChipPatch(ch, draft))}
              text={ch.label}
              sub={ch.text || null}
            />
          ))}
        </Chips>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Input
            accessibilityLabel="Texto libre de abajo"
            value={draft.periodFree}
            maxLength={BADGE_TEXT_MAX.period}
            autoCorrect={false}
            autoCapitalize="characters"
            editable={!off}
            placeholder="O escribe uno: CLAUSURA"
            invalid={!!errors.period}
            onChangeText={(t) => onChange({ periodFree: t.toUpperCase() })}
            style={[{ flex: 1 }, off ? { opacity: 0.6 } : null]}
          />
          <Counter value={textLength(draft.periodFree)} max={BADGE_TEXT_MAX.period} />
        </View>
        <FieldError text={errors.period} />
      </View>

      <View style={{ gap: 6 }}>
        <FieldLabel label="Cupo" />
        <View accessibilityRole="radiogroup" accessibilityLabel="Cupo" style={{ flexDirection: 'row', gap: 6 }}>
          {LIMITS.map((k) => {
            const on = draft.limitKind === k;
            return (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: off }}
                accessibilityLabel={`${LIMIT_INFO[k].label}: ${LIMIT_INFO[k].hint}`}
                disabled={off}
                onPress={() => onChange({ limitKind: k })}
                style={({ pressed }) => [
                  styles.limit,
                  { borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : pressed ? c.surface2 : 'transparent', opacity: off ? 0.5 : 1 },
                ]}
              >
                <Txt variant="meta" style={{ fontFamily: font.semibold, color: on ? c.accent : c.fg }}>
                  {LIMIT_INFO[k].label}
                </Txt>
                <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
                  {LIMIT_INFO[k].hint}
                </Txt>
              </Pressable>
            );
          })}
        </View>
      </View>

      {byTeamAllowed(sport) && <SwitchRow on={draft.byTeam} disabled={off} onChange={(byTeam) => onChange({ byTeam })} label={teamWord(sport)} hint={BY_TEAM_HINT} />}

      <FieldBox label="¿Qué hay que hacer para ganarla?" count={<Counter value={textLength(draft.description)} max={BADGE_TEXT_MAX.description} />} error={errors.description}>
        <Input
          accessibilityLabel="¿Qué hay que hacer para ganarla?"
          value={draft.description}
          maxLength={BADGE_TEXT_MAX.description}
          multiline
          textAlignVertical="top"
          placeholder="Por ejemplo: la mejor serie de la noche de clausura."
          invalid={!!errors.description}
          onChangeText={(description) => onChange({ description })}
          style={styles.area}
        />
      </FieldBox>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  strip: { position: 'absolute', top: 0, left: 0, right: 0, height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  footer: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  box: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  swatch: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatchDot: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.1)' },
  limit: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  area: { height: 96, paddingTop: 12, paddingBottom: 12 },
});
