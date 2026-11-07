import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LandPlot, Plus, Trash2 } from 'lucide-react-native';
import { deleteGolfCourse, saveGolfCourse, saveGolfRules, useGolfCourses, useGolfRules, type GolfCourseDoc } from '@mm/lib/data/golf';
import { useLeagueCtx } from '@mm/lib/league';
import type { GolfCompetition } from '@mm/sports/golf/scoring';
import {
  MAX_TEES,
  courseDraft,
  courseErrors,
  courseLine,
  coursePar,
  draftCourse,
  newTee,
  parSplit,
  parseMeritPoints,
  resizeCourse,
  shownErrors,
  teeLine,
  type CourseDraft,
  type TeeDraft,
} from '@mm/pages/sports/golf/courseForm';
import { formatLabel } from '@mm/pages/sports/golf/logic';
import { confirmAsync } from '@/components/feedback';
import { ToggleRow } from '@/components/esports/inputs';
import { Button, Card, Divider, Empty, Field, Input, ListRow, Loading, RowIcon, SectionHeader, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { CompetitionPicker } from './RoundForm';
import { SectionAdd, golfAction } from './parts';

/**
 * Organizar › Campos (GolfAdmin de la web, con su misma lógica: courseForm.ts): los campos del club como filas (par y SI
 * por hoyo, salidas con rating y slope; tocar uno lo abre para cambiarlo o borrarlo) con «+ Agregar» a la derecha, y el
 * formato por defecto de la liga con los puntos del orden de mérito. Editar un campo no cambia las rondas ya creadas.
 * Va dentro de LeagueScope (la pantalla pone el título y «‹ atrás»).
 */
export function GolfAdmin() {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const courses = useGolfCourses(lid);
  const [editing, setEditing] = useState<GolfCourseDoc | 'nuevo' | null>(null);

  return (
    <View style={{ gap: 26 }}>
      <View style={{ gap: 10 }}>
        <SectionHeader title="Campos del club" action={courses.data.length > 0 ? <SectionAdd label="Agregar" onPress={() => setEditing('nuevo')} /> : undefined} />
        {courses.loading && !courses.data.length ? (
          <Loading label="Cargando los campos" />
        ) : !courses.data.length ? (
          <Empty
            icon={<LandPlot size={28} color={c.accent} />}
            title="Todavía no hay campos"
            text="El par y el SI de cada hoyo y el rating y slope de cada salida (salen en la tarjeta del club)."
            action={
              <Button variant="primary" size="lg" icon={<Plus size={20} color={c.accentFg} />} onPress={() => setEditing('nuevo')}>
                Agregar campo
              </Button>
            }
          />
        ) : (
          <Card padded={false}>
            {courses.data.map((x, i) => (
              <View key={x.id}>
                {i > 0 && <Divider inset={68} />}
                <ListRow
                  icon={
                    <RowIcon>
                      <LandPlot size={20} color={c.accent} />
                    </RowIcon>
                  }
                  title={x.name}
                  subtitle={courseLine(x)}
                  accessibilityLabel={`Editar ${x.name}`}
                  onPress={() => setEditing(x)}
                />
              </View>
            ))}
          </Card>
        )}
      </View>
      <RulesCard />
      {editing != null && <CourseEditor course={editing === 'nuevo' ? null : editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

/** Formato por defecto de las rondas nuevas y puntos del orden de mérito (lo de la liga hasta que se cambie). */
function RulesCard() {
  const { lid } = useLeagueCtx();
  const rules = useGolfRules(lid);
  const [pickedComp, setComp] = useState<GolfCompetition | null>(null);
  const [text, setPoints] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const comp = pickedComp ?? rules.data.competition;
  const points = text ?? rules.data.meritPoints.join(', ');
  const { points: parsed, bad } = parseMeritPoints(points);

  async function save() {
    setBusy(true);
    await golfAction(() => saveGolfRules(lid, { competition: comp, meritPoints: parsed }), 'Reglas guardadas');
    setBusy(false);
  }

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Formato de la liga" />
      <Card style={{ gap: 16 }}>
        <Txt variant="meta" tone="muted">{`Lo que sale al crear una ronda (se cambia en cada una). Ahora: ${formatLabel(rules.data.competition)}.`}</Txt>
        <CompetitionPicker value={comp} onChange={setComp} />
        <Field label="Puntos del orden de mérito por puesto" hint="Del 1.º en adelante, separados por coma. Un empate reparte los puntos.">
          <Input value={points} onChangeText={setPoints} keyboardType="numbers-and-punctuation" invalid={bad} />
        </Field>
        <Button variant="primary" size="lg" full loading={busy} disabled={bad} onPress={() => void save()}>
          Guardar formato
        </Button>
      </Card>
    </View>
  );
}

const PARS = [3, 4, 5, 6] as const;

/**
 * «Nuevo campo» o «Editar <campo>» (CourseEditor de la web): el nombre, 9 o 18 hoyos, el par y el SI de cada hoyo, las
 * salidas con su rating y slope (y los de cada vuelta) y lo que falta para guardar. Se monta abierta: cada vez empieza
 * con lo del campo (o uno nuevo).
 */
function CourseEditor({ course, onClose }: { course: GolfCourseDoc | null; onClose: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const [d, setD] = useState<CourseDraft>(() => courseDraft(course));
  const [busy, setBusy] = useState<'guardar' | 'borrar' | null>(null);
  const { name, holes, tees } = d;
  const n = holes.length;
  const draft = draftCourse(course?.id ?? 'nuevo', name, holes, tees);
  const errors = courseErrors(draft, tees);
  const split = parSplit(holes);

  const setHole = (i: number, patch: Partial<CourseDraft['holes'][number]>) => setD({ ...d, holes: holes.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const setTee = (i: number, patch: Partial<TeeDraft>) => setD({ ...d, tees: tees.map((t, k) => (k === i ? { ...t, ...patch } : t)) });

  function setCount(count: 9 | 18) {
    // A 9 se quedan los hoyos 1–9 con sus SI en orden (1 al 9).
    const next = resizeCourse(holes, tees, count);
    if (next) setD({ ...d, ...next });
  }

  async function save() {
    if (errors.length || busy) return;
    setBusy('guardar');
    const ok = await golfAction(async () => {
      await saveGolfCourse(lid, { id: course?.id, name: draft.name, holes: draft.holes, tees: draft.tees });
      return true;
    }, 'Campo guardado');
    setBusy(null);
    if (ok) onClose();
  }

  async function remove() {
    if (!course) return;
    const ok = await confirmAsync({
      title: `¿Borrar ${course.name}?`,
      message: 'Las rondas ya creadas guardan su copia del campo y no cambian.',
      confirmText: 'Borrar',
      danger: true,
    });
    if (!ok) return;
    setBusy('borrar');
    const done = await golfAction(async () => {
      await deleteGolfCourse(lid, course.id);
      return true;
    }, 'Campo borrado');
    setBusy(null);
    if (done) onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={course ? `Editar ${course.name}` : 'Nuevo campo'}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {course && (
            <Button
              variant="ghost"
              accessibilityLabel="Borrar"
              icon={<Trash2 size={18} color={c.danger} />}
              loading={busy === 'borrar'}
              disabled={busy === 'guardar'}
              onPress={() => void remove()}
            />
          )}
          <Button onPress={onClose} style={{ flex: 1 }}>
            Cancelar
          </Button>
          <Button variant="primary" loading={busy === 'guardar'} disabled={!!errors.length || busy === 'borrar'} onPress={() => void save()} style={{ flex: 1.4 }}>
            Guardar campo
          </Button>
        </View>
      }
    >
      <Field label="Nombre del campo">
        <Input value={name} maxLength={60} onChangeText={(v) => setD({ ...d, name: v })} placeholder="Club de Golf …" />
      </Field>
      <Field label="Hoyos">
        <Segmented<'9' | '18'>
          label="Hoyos del campo"
          options={[
            { key: '9', label: '9 hoyos' },
            { key: '18', label: '18 hoyos' },
          ]}
          value={n === 9 ? '9' : '18'}
          onChange={(k) => setCount(k === '9' ? 9 : 18)}
        />
      </Field>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Txt variant="bodyStrong" tone="fg2">
            Par y SI de cada hoyo
          </Txt>
          <Txt tone="muted" style={{ fontSize: 13 }}>
            {'Par total '}
            <Txt style={{ fontSize: 13, fontFamily: font.bold }}>{String(coursePar(holes))}</Txt>
            {split ? ` (${split})` : ''}
          </Txt>
        </View>
        <Txt tone="muted" style={{ fontSize: 12 }}>
          SI = índice de dificultad (1 = el hoyo más difícil), sin repetir. Sale en la tarjeta del club.
        </Txt>
        <View style={[styles.holeRow, { minHeight: 28 }]}>
          <Txt tone="muted" style={[styles.holeNum, { fontSize: 12, fontFamily: font.regular }]}>
            Hoyo
          </Txt>
          <Txt tone="muted" style={{ flex: 1, fontSize: 12 }}>
            Par
          </Txt>
          <Txt tone="muted" style={{ width: 64, fontSize: 12, textAlign: 'center' }}>
            SI
          </Txt>
        </View>
        {holes.map((hole, i) => (
          <View key={i} style={styles.holeRow}>
            <Txt style={styles.holeNum}>{String(i + 1)}</Txt>
            <View accessibilityRole="radiogroup" accessibilityLabel={`Par del hoyo ${i + 1}`} style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
              {PARS.map((p) => {
                const on = hole.par === p;
                return (
                  <Pressable
                    key={p}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Par ${p}`}
                    onPress={() => setHole(i, { par: p })}
                    style={[styles.parChip, { backgroundColor: on ? c.accent : c.surface2 }]}
                  >
                    <Txt style={{ fontFamily: font.semibold, fontSize: 15, color: on ? c.accentFg : c.fg2 }}>{String(p)}</Txt>
                  </Pressable>
                );
              })}
            </View>
            <Input
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel={`SI del hoyo ${i + 1}`}
              value={Number.isFinite(hole.si) ? String(hole.si) : ''}
              onChangeText={(t) => setHole(i, { si: t === '' ? Number.NaN : Number(t) })}
              style={styles.siInput}
            />
          </View>
        ))}
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Txt variant="bodyStrong" tone="fg2">
            Salidas (tees)
          </Txt>
          {tees.length < MAX_TEES && (
            <Button icon={<Plus size={18} color={c.fg} />} onPress={() => setD({ ...d, tees: [...tees, newTee('')] })}>
              Otra salida
            </Button>
          )}
        </View>
        {tees.map((t, i) => (
          <View key={t.id} style={[styles.tee, { borderColor: c.line }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Txt tone="muted" style={{ fontSize: 12, flex: 1 }}>
                {teeLine(i, draft.tees[i]?.par, t)}
              </Txt>
              <Button
                variant="ghost"
                accessibilityLabel="Quitar salida"
                icon={<Trash2 size={18} color={c.muted} />}
                disabled={tees.length === 1}
                onPress={() => setD({ ...d, tees: tees.filter((_, k) => k !== i) })}
              />
            </View>
            <Field label="Nombre">
              <Input value={t.name} maxLength={40} onChangeText={(v) => setTee(i, { name: v })} placeholder="Blancas" />
            </Field>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="Rating">
                  <Input keyboardType="decimal-pad" value={t.rating} onChangeText={(v) => setTee(i, { rating: v })} placeholder="71.2" />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Slope">
                  <Input keyboardType="number-pad" value={t.slope} onChangeText={(v) => setTee(i, { slope: v })} placeholder="128" />
                </Field>
              </View>
            </View>
            {n === 18 && <ToggleRow checked={t.byNine} onChange={(v) => setTee(i, { byNine: v })} label="Rating y slope de cada vuelta (para rondas de 9 hoyos)" />}
            {n === 18 && t.byNine && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    ['Ida: rating', 'front', 'rating', 'decimal-pad'],
                    ['Ida: slope', 'front', 'slope', 'number-pad'],
                    ['Vuelta: rating', 'back', 'rating', 'decimal-pad'],
                    ['Vuelta: slope', 'back', 'slope', 'number-pad'],
                  ] as const
                ).map(([label, side, key, kb]) => (
                  <View key={label} style={{ flexBasis: '46%', flexGrow: 1 }}>
                    <Field label={label}>
                      <Input keyboardType={kb} value={t[side][key]} onChangeText={(v) => setTee(i, { [side]: { ...t[side], [key]: v } })} />
                    </Field>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>

      {errors.length > 0 && (
        <View accessibilityLiveRegion="polite" style={[styles.errors, { backgroundColor: c.warnSoft }]}>
          {shownErrors(errors).map((e) => (
            <Txt key={e} tone="warn" style={{ fontSize: 14 }}>{`• ${e}`}</Txt>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  holeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  holeNum: { width: 34, fontFamily: font.semibold, fontSize: 14, fontVariant: ['tabular-nums'] },
  parChip: { flex: 1, maxWidth: 48, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  siInput: { width: 64, height: 44, paddingHorizontal: 8, textAlign: 'center', borderRadius: 12 },
  tee: { gap: 10, borderRadius: 16, borderWidth: 1.5, padding: 12 },
  errors: { gap: 2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
