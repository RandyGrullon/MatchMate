/**
 * Organizar › Clubes (ClubsAdmin de la web, con su misma lógica: src/pages/sports/swimming/admin.ts): los clubes como
 * filas (los puntos del encuentro son por club; tocar uno lo cambia o lo borra) con «+ Nuevo», quién cronometra (los
 * anotadores de la liga) y lo que la liga pone por defecto a cada encuentro nuevo.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check, Plus, Shield, Timer, Trash2 } from 'lucide-react-native';
import { setMemberScorer, useLeagueMembers } from '@mm/lib/data/members';
import { deleteClub, saveClub, saveSwimRules, useSwimmers, useSwimRules, type AgeScheme, type SwimClub, type SwimRules } from '@mm/lib/data/swimming';
import type { Member } from '@mm/lib/types';
import { leavesOnRemove, removeConfirm } from '@mm/components/scorers/logic';
import { LANE_OPTIONS, clubLine, clubValid, clubsTitle, parsePoints, pointsAfterLanes, rulesDirty, type RulesForm } from '@mm/pages/sports/swimming/admin';
import { SCHEME_LABEL } from '@mm/pages/sports/swimming/logic';
import { useSwim } from '@mm/pages/sports/swimming/swim';
import { ScoreStepper } from '@/components/esports/inputs';
import { confirmAsync } from '@/components/feedback';
import { Button, Card, Empty, Field, Input, SectionHeader, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { ColorField, InlineSelect, SectionAdd, SheetFooter, useBusy } from './adminParts';
import { Lines, runAction } from './parts';

const SCHEMES = (Object.keys(SCHEME_LABEL) as AgeScheme[]).map((s) => ({ value: s, label: SCHEME_LABEL[s] }));
const MIN_LANES = LANE_OPTIONS[0];
const MAX_LANES = LANE_OPTIONS[LANE_OPTIONS.length - 1];

export function ClubsAdmin() {
  const c = useColors();
  const { lid, isAdmin, clubs } = useSwim();
  const members = useLeagueMembers(lid);
  const swimmers = useSwimmers(lid);
  const [editing, setEditing] = useState<SwimClub | 'new' | null>(null);
  const memberName = useMemo(() => new Map(members.data.map((m) => [m.uid, m.name] as const)), [members.data]);
  const count = (id: string) => swimmers.data.filter((s) => s.clubId === id).length;

  if (!isAdmin) return null;

  return (
    <View style={{ gap: 30 }}>
      <View style={{ gap: 10 }}>
        <SectionHeader title={clubsTitle(clubs.data.length)} action={clubs.data.length > 0 ? <SectionAdd onPress={() => setEditing('new')} /> : undefined} />
        {!clubs.data.length ? (
          <Empty
            icon={<Shield size={28} color={c.accent} />}
            title="Todavía no hay clubes"
            text="Los puntos y el medallero se cuentan por club. El entrenador de un club registra e inscribe a sus nadadores."
            action={
              <Button variant="primary" size="lg" icon={<Plus size={20} color={c.accentFg} />} onPress={() => setEditing('new')}>
                Nuevo club
              </Button>
            }
          />
        ) : (
          <Lines>
            {clubs.data.map((x) => (
              <Pressable
                key={x.id}
                accessibilityRole="button"
                accessibilityLabel={`Cambiar ${x.name}`}
                onPress={() => setEditing(x)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
              >
                <View style={[styles.mark, { backgroundColor: c.surface2 }]}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: x.color ?? 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {x.name}
                    </Txt>
                    {!!x.short && (
                      <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
                        {x.short}
                      </Txt>
                    )}
                  </View>
                  <Txt variant="meta" tone="muted" numberOfLines={2}>
                    {clubLine(count(x.id), x.coachId ? (memberName.get(x.coachId) ?? '—') : null)}
                  </Txt>
                </View>
              </Pressable>
            ))}
          </Lines>
        )}
      </View>

      <TimersSection />
      <RulesSection />
      <ClubFormSheet key={editing === 'new' ? 'new' : (editing?.id ?? '')} editing={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

/** Crear, cambiar o borrar un club (ClubFormModal de la web). Se monta al abrirla. */
function ClubFormSheet({ editing, onClose }: { editing: SwimClub | 'new' | null; onClose: () => void }) {
  return editing ? <ClubFormOpen editing={editing} onClose={onClose} /> : null;
}

function ClubFormOpen({ editing, onClose }: { editing: SwimClub | 'new'; onClose: () => void }) {
  const c = useColors();
  const { lid } = useSwim();
  const members = useLeagueMembers(lid);
  const club = editing !== 'new' ? editing : null;
  const [name, setName] = useState(club?.name ?? '');
  const [short, setShort] = useState(club?.short ?? '');
  const [color, setColor] = useState<string | null>(club?.color ?? null);
  const [coach, setCoach] = useState(club?.coachId ?? '');
  const [busy, setBusy] = useState(false);
  // Borrar el club: la ruedita en su botón.
  const [removing, setRemoving] = useState(false);
  const valid = clubValid(name, short);
  const coaches = [{ value: '', label: 'Sin entrenador' }, ...members.data.map((m) => ({ value: m.uid, label: m.name }))];

  const save = async () => {
    setBusy(true);
    const ok = await runAction(() => saveClub(lid, { id: club?.id, name, short, color, coachId: coach || null }), club ? 'Club guardado' : 'Club creado');
    setBusy(false);
    if (ok) onClose();
  };
  const remove = async () => {
    if (!club) return;
    if (!(await confirmAsync({ title: `¿Borrar ${club.name}?`, message: 'Sus nadadores quedan sin club (sus resultados no se borran).', confirmText: 'Borrar', danger: true }))) return;
    setRemoving(true);
    const ok = await runAction(() => deleteClub(lid, club.id).then(() => true), 'Club borrado');
    setRemoving(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={club ? club.name : 'Nuevo club'}
      footer={
        <SheetFooter
          onCancel={onClose}
          left={
            club ? (
              <Button variant="ghost" icon={<Trash2 size={16} color={c.danger} />} loading={removing} disabled={busy} accessibilityLabel="Borrar" onPress={() => void remove()}>
                <Txt tone="danger">Borrar</Txt>
              </Button>
            ) : undefined
          }
        >
          <Button variant="primary" full loading={busy} disabled={!valid || removing} onPress={save}>
            Guardar
          </Button>
        </SheetFooter>
      }
    >
      <View style={{ gap: 16 }}>
        <Field label="Nombre">
          <Input accessibilityLabel="Nombre" value={name} maxLength={60} placeholder="Club Delfines" onChangeText={setName} />
        </Field>
        <Field label="Sigla (opcional)" hint="Hasta 8 letras">
          <Input accessibilityLabel="Sigla (opcional)" value={short} maxLength={8} autoCapitalize="characters" placeholder="DEL" onChangeText={(t) => setShort(t.toUpperCase())} />
        </Field>
        <Field label="Color">
          <ColorField value={color} onChange={setColor} />
        </Field>
        <Field label="Entrenador (opcional)" hint="Un miembro de la liga: registra e inscribe a los nadadores de este club.">
          <InlineSelect label="Entrenador (opcional)" value={coach} options={coaches} onChange={setCoach} />
        </Field>
      </View>
    </Sheet>
  );
}

/** Cronometristas: miembros que toman tiempos y publican series (anotadores). Los nombra el dueño o un admin. */
function TimersSection() {
  const c = useColors();
  const { lid, isAdmin, league } = useSwim();
  const members = useLeagueMembers(lid);
  // Quién se está guardando: la ruedita en su casilla.
  const saving = useBusy();
  const list = members.data.filter((m) => m.role === 'member');

  // Quitárselo a quien entró solo para anotar (sin nadador) lo saca de la liga: se pregunta antes (docs/anotadores.md D5).
  async function toggle(m: Member, on: boolean) {
    const ask = !on && leavesOnRemove(m) ? removeConfirm(m, league.kind) : null;
    if (ask && !(await confirmAsync(ask))) return;
    await saving.run(m.uid, () => runAction(() => setMemberScorer(m, on), on ? 'Ahora cronometra' : (ask?.done ?? 'Ya no cronometra')));
  }
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Cronometristas" />
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4, marginTop: -4 }}>
        {`Toman los tiempos y publican las series (los admins ya pueden).${!isAdmin ? ' Los nombra el dueño o un admin.' : ''}`}
      </Txt>
      {!list.length ? (
        <Txt tone="muted" style={{ marginHorizontal: 4, fontSize: 14 }}>
          Todavía no hay miembros sin permisos en la liga.
        </Txt>
      ) : (
        <Lines>
          {list.map((m) => {
            const busy = saving.isBusy(m.uid);
            const off = !isAdmin || saving.isBusy();
            const on = !!m.scorer;
            return (
              <Pressable
                key={m.uid}
                accessibilityRole="checkbox"
                accessibilityLabel={`${m.name} cronometra`}
                accessibilityState={{ checked: on, disabled: off, busy }}
                disabled={off}
                onPress={() => void toggle(m, !on)}
                style={({ pressed }) => [styles.timer, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
              >
                <View style={[styles.mark, { backgroundColor: on ? c.accentSoft : c.surface2 }]}>
                  <Timer size={20} color={on ? c.accent : c.fg2} />
                </View>
                <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 15, fontFamily: font.semibold }}>
                  {m.name}
                </Txt>
                <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
                  {busy ? (
                    <ActivityIndicator size="small" color={c.muted} />
                  ) : (
                    <View style={[styles.box, { opacity: !isAdmin ? 0.5 : 1 }, on ? { backgroundColor: c.accent, borderColor: c.accent } : { borderColor: c.faint }]}>
                      {on && <Check size={14} color={c.accentFg} strokeWidth={3} />}
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </Lines>
      )}
    </View>
  );
}

/** Lo que la liga pone por defecto a cada encuentro nuevo (se vuelve a llenar si cambia en la base). */
function RulesSection() {
  const { lid } = useSwim();
  const rules = useSwimRules(lid);
  const r = rules.data;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Para cada encuentro nuevo" />
      <RulesCard key={`${r.pool}|${r.lanes}|${r.points.join('-')}|${r.ageGroups}`} lid={lid} rules={r} raw={r.raw} />
    </View>
  );
}

function RulesCard({ lid, rules: r, raw }: { lid: string; rules: SwimRules; raw: Record<string, unknown> }) {
  const [f, setF] = useState<RulesForm>({ pool: r.pool, lanes: r.lanes, points: r.points.join('-'), ageGroups: r.ageGroups });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<RulesForm>) => setF((x) => ({ ...x, ...patch }));
  const parsed = parsePoints(f.points);
  const dirty = rulesDirty(f, r);
  const save = async () => {
    if (!parsed) return;
    setBusy(true);
    await runAction(() => saveSwimRules(lid, raw, { pool: f.pool, lanes: f.lanes, points: parsed, ageGroups: f.ageGroups }), 'Guardado');
    setBusy(false);
  };
  return (
    <Card style={{ gap: 16 }}>
      <Field label="Piscina">
        <Segmented<'25' | '50'>
          label="Piscina"
          value={f.pool === 50 ? '50' : '25'}
          onChange={(v) => set({ pool: v === '50' ? 50 : 25 })}
          options={[
            { key: '25', label: '25 m' },
            { key: '50', label: '50 m' },
          ]}
        />
      </Field>
      <Field label="Carriles">
        <ScoreStepper
          label="Carriles"
          value={f.lanes}
          min={MIN_LANES}
          max={MAX_LANES}
          onChange={(n) => {
            const next = n ?? f.lanes;
            set({ lanes: next, points: pointsAfterLanes(f.points, f.lanes, next) });
          }}
        />
      </Field>
      <Field label="Puntos por puesto">
        <Input accessibilityLabel="Puntos por puesto" value={f.points} invalid={!parsed} onChangeText={(points) => set({ points })} />
      </Field>
      <Field label="Categorías">
        <InlineSelect<AgeScheme> label="Categorías" value={f.ageGroups} options={SCHEMES} onChange={(ageGroups) => set({ ageGroups })} />
      </Field>
      <Button variant="primary" size="lg" full loading={busy} disabled={!dirty || !parsed} onPress={save}>
        Guardar
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 10 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8, paddingLeft: 16, paddingRight: 20 },
  mark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
