/**
 * «Elegir premios» (PrizePicker de la web, docs/premios-torneo.md §6.2): una sección por categoría que premia la
 * competencia («Equipos (scratch)», «Individual (handicap)»…) con el 1.º, el 2.º y el 3.er lugar; en cada uno, la
 * insignia que se lleva: un diseño de la liga o uno nuevo de plantilla («Campeón», «Subcampeón», «Tercer lugar») sin
 * cinta, que sirve para todos los torneos. La cinta la pone el premio (el mes del torneo). Guarda el conjunto completo
 * (set_tournament_prizes). «Diseñar otra» abre el creador de insignias de la web (la app todavía no lo tiene). Se monta
 * al abrirse.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { Check, ChevronDown, Palette, Plus, Sparkles } from 'lucide-react-native';
import { badgeLabel } from '@mm/badges/visual/period';
import { saveLeagueBadge, type LeagueBadge } from '@mm/lib/data/leagueBadges';
import { anyDelivered, PRIZE_PERIOD_MAX, PRIZE_PLACES, prizeErrorText, setTournamentPrizes, slotKeyOf, type PrizePlace, type TournamentPrize } from '@mm/lib/data/prizes';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { defaultPeriod, PLACE_LABEL, type PrizeComp } from '@mm/prizes/catalog';
import { deliveredKeys, designsForPlace, initialRows, PLACE_TEMPLATE, setupSections, TEMPLATE_LABEL, templateDesign, withPodiumTemplates, type PodiumTemplate, type SetupRows } from '@mm/prizes/setup';
import { draftPayload, makerErrorText, periodChoices, templateDraft } from '@mm/components/badges/maker/design';
import { designLook } from '@mm/components/badges/maker/look';
import { archivedHint, designReadyText, periodCheck, periodCount, periodHint, pickerTitle, REMOVE_PRIZES_CONFIRM, ruleLine, savedPrizesText, saveStep, toggleRow } from '@mm/components/prizes/view';
import { Insignia } from '@/components/badges/Insignia';
import { confirmAsync, toast } from '@/components/feedback';
import { Badge, Button, Input, Sheet, Txt } from '@/components/ui';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { NoBadge } from './parts';

export interface PrizePickerProps {
  onClose: () => void;
  comp: PrizeComp;
  /** La premiación guardada (null = todavía no hay premios). */
  prize: TournamentPrize | null;
  /** Los diseños de la liga (`useLeagueBadges`). */
  designs: readonly LeagueBadge[];
}

export function PrizePicker({ onClose, comp, prize, designs }: PrizePickerProps) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const now = useNow().getTime();
  const sections = setupSections(comp, prize);
  // Los diseños que se crean aquí se ven antes de que vuelva la lista de la liga.
  const [created, setCreated] = useState<LeagueBadge[]>([]);
  const all = [...created.filter((x) => !designs.some((d) => d.id === x.id)), ...designs];
  const [rows, setRows] = useState<SetupRows>(() => initialRows(sections, prize, designs));
  const [period, setPeriod] = useState(prize?.period ?? defaultPeriod(comp.date));
  const [choosing, setChoosing] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const delivered = deliveredKeys(prize);
  const periodLocked = anyDelivered(prize);
  const { clean: cleanPeriod, error: periodError } = periodCheck(period);
  const byId = new Map(all.map((d) => [d.id, d] as const));
  const rule = ruleLine(comp);
  const count = periodCount(period);

  /** El diseño de plantilla del podio que ya hay, o uno nuevo sin cinta. */
  async function templateId(key: PodiumTemplate, pool: readonly LeagueBadge[]): Promise<LeagueBadge> {
    const have = templateDesign(pool, key);
    if (have) return have;
    const draft = { ...templateDraft(key, comp.sport, 'torneo'), periodMode: 'none' as const };
    const saved = await saveLeagueBadge(lid, null, draftPayload(draft, periodChoices(league, now), comp.sport));
    setCreated((list) => [saved, ...list]);
    return saved;
  }

  async function createFor(key: string, template: PodiumTemplate) {
    setCreating(key);
    setError(null);
    try {
      const b = await templateId(template, []);
      setRows((r) => ({ ...r, [key]: { on: true, badgeId: b.id } }));
      setChoosing(null);
      toast(designReadyText(b.name));
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

  async function submit() {
    if (saving) return;
    const step = saveStep(sections, rows, prize, periodError);
    if (step.kind === 'error') {
      setError(step.text);
      return;
    }
    if (step.kind === 'confirm' && !(await confirmAsync({ ...REMOVE_PRIZES_CONFIRM }))) return;
    setError(null);
    setSaving(true);
    try {
      const saved = await setTournamentPrizes({ lid, scope: comp.scope, refId: comp.refId, period: periodLocked ? null : cleanPeriod, slots: step.slots });
      toast(savedPrizesText(saved));
      onClose();
    } catch (err) {
      console.error(err);
      setError(prizeErrorText(err, saveErrorMessage));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={pickerTitle(prize)}
      subtitle={comp.name}
      footer={
        // Un solo botón (la X de arriba cierra sin guardar).
        <Button variant="primary" size="xl" full loading={saving} onPress={submit}>
          Guardar premios
        </Button>
      }
    >
      {!!rule && (
        <View style={[styles.rule, { backgroundColor: c.surface2 }]}>
          <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
            {rule}
          </Txt>
        </View>
      )}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <Txt variant="small" tone="muted">
            Cinta de las insignias
          </Txt>
          <Txt variant="small" tone={count > PRIZE_PERIOD_MAX ? 'danger' : 'muted'} style={{ fontFamily: font.regular, fontVariant: ['tabular-nums'] }}>
            {`${count}/${PRIZE_PERIOD_MAX}`}
          </Txt>
        </View>
        <Input
          accessibilityLabel="Cinta de las insignias"
          value={period}
          editable={!periodLocked}
          maxLength={20}
          autoCapitalize="characters"
          autoCorrect={false}
          invalid={!!periodError}
          onChangeText={setPeriod}
          style={periodLocked ? { opacity: 0.6 } : undefined}
        />
        <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
          {periodHint(periodLocked)}
        </Txt>
        {!!periodError && (
          <Txt variant="small" tone="danger" accessibilityLiveRegion="polite">
            {periodError}
          </Txt>
        )}
      </View>

      <View style={{ alignSelf: 'flex-start' }}>
        <Button icon={<Sparkles size={16} color={c.fg} />} loading={creating === 'todas'} disabled={creating != null} onPress={applyTemplates}>
          Usar Campeón, Subcampeón y Tercer lugar
        </Button>
      </View>

      {sections.map((sec) => (
        <View key={`${sec.category}|${sec.division}`} style={{ gap: 8 }}>
          <Txt variant="meta" accessibilityRole="header" style={{ fontFamily: font.semibold, color: c.fg }}>
            {sec.title}
          </Txt>
          {PRIZE_PLACES.map((place) => {
            const key = slotKeyOf({ category: sec.category, division: sec.division, place });
            const row = rows[key] ?? { on: false, badgeId: null };
            const design = row.badgeId ? (byId.get(row.badgeId) ?? null) : null;
            const locked = delivered.has(key);
            const open = choosing === key;
            const archived = design ? archivedHint(design) : null;
            return (
              <View key={key} style={[styles.place, { backgroundColor: c.surface2, opacity: row.on ? 1 : 0.75 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {/* Toda la fila es el interruptor (44 de alto, como el resto de la hoja). */}
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: row.on, disabled: locked }}
                    accessibilityLabel={PLACE_LABEL[place]}
                    disabled={locked}
                    onPress={() => setRows((r) => toggleRow(r, key, !row.on, all))}
                    style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                  >
                    <Switch
                      value={row.on}
                      disabled={locked}
                      onValueChange={(on) => setRows((r) => toggleRow(r, key, on, all))}
                      trackColor={{ true: c.accent, false: c.line }}
                      thumbColor="#ffffff"
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                    />
                    <Txt variant="meta" style={{ fontFamily: font.medium, color: c.fg }}>
                      {PLACE_LABEL[place]}
                    </Txt>
                  </Pressable>
                  {locked && <Badge tone="ok">Entregado</Badge>}
                </View>
                {row.on && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open, disabled: locked }}
                    disabled={locked}
                    onPress={() => setChoosing((k) => (k === key ? null : key))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 4 }}
                  >
                    {design ? <Insignia badge={designLook(design, comp.sport)} size={40} /> : <NoBadge size={40} dashed />}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="meta" numberOfLines={1} style={{ fontFamily: font.semibold, color: c.fg }}>
                        {design ? design.name : 'Elegir insignia'}
                      </Txt>
                      {!!archived && (
                        <Txt variant="small" tone="warn" style={{ fontFamily: font.regular }}>
                          {archived}
                        </Txt>
                      )}
                    </View>
                    {!locked && <ChevronDown size={16} color={c.muted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />}
                  </Pressable>
                )}
                {row.on && open && !locked && (
                  <PrizeBadgePicker
                    place={place}
                    designs={all}
                    selected={row.badgeId}
                    sport={comp.sport}
                    creating={creating === key}
                    busy={creating != null}
                    onChoose={(badgeId) => {
                      setRows((r) => ({ ...r, [key]: { on: true, badgeId } }));
                      setChoosing(null);
                    }}
                    onCreate={(t) => void createFor(key, t)}
                    onDesign={() => void openOnWeb(`/l/${lid}/admin?tab=insignias`)}
                  />
                )}
              </View>
            );
          })}
        </View>
      ))}
      {!!error && (
        <Txt variant="meta" tone="danger" accessibilityLiveRegion="polite" style={{ fontFamily: font.medium }}>
          {error}
        </Txt>
      )}
    </Sheet>
  );
}

/**
 * La lista de insignias para un lugar (§6.2): los diseños activos de la liga, arriba el de plantilla de ese lugar;
 * «Crear “Campeón”» si la liga todavía no lo tiene, y «Diseñar otra» (el creador de la web).
 */
function PrizeBadgePicker({
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
  const c = useColors();
  const list = designsForPlace(designs, place);
  const template = PLACE_TEMPLATE[place];
  const missing = !templateDesign(designs, template);
  return (
    <View style={[styles.list, { backgroundColor: c.surface }]}>
      {list.length > 0 ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={`Insignia del ${PLACE_LABEL[place]}`}>
          {list.map((d) => {
            const look = designLook(d, sport);
            const on = d.id === selected;
            return (
              <Pressable
                key={d.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={badgeLabel(d.name, look)}
                onPress={() => onChoose(d.id)}
                style={({ pressed }) => [styles.option, (on || pressed) && { backgroundColor: c.surface2 }]}
              >
                <Insignia badge={look} size={40} />
                <Txt variant="meta" numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: font.medium, color: c.fg }}>
                  {d.name}
                </Txt>
                {on && <Check size={16} color={c.accent} />}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Txt variant="small" tone="muted" style={{ paddingHorizontal: 8, paddingVertical: 6, fontFamily: font.regular }}>
          La liga todavía no tiene insignias activas.
        </Txt>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 4 }}>
        {missing && (
          <Button icon={<Plus size={16} color={c.fg} />} loading={creating} disabled={busy} onPress={() => onCreate(template)}>
            {`Crear «${TEMPLATE_LABEL[template]}»`}
          </Button>
        )}
        <Button variant="ghost" icon={<Palette size={16} color={c.fg} />} disabled={busy} onPress={onDesign}>
          Diseñar otra
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rule: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  place: { gap: 8, borderRadius: 16, padding: 16 },
  list: { gap: 4, borderRadius: 12, padding: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
});
