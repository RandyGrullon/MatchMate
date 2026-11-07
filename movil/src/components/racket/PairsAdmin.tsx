/**
 * Organizar › Parejas y niveles (o Jugadores y niveles; PairsAdmin.tsx de la web, con su misma lógica): las reglas del
 * partido de la liga, las parejas de la temporada (la tabla es de la pareja; las estadísticas, de quien juega) y el
 * nivel de cada jugador en la escala del deporte (pádel 0–7, tenis NTRP, pickleball DUPR, ping pong 1–10). Va dentro de
 * LeagueScope.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Check, Pencil, Plus, Trash2, UserPlus } from 'lucide-react-native';
import { createPlayer } from '@mm/lib/data/players';
import { saveLeagueMatchRules } from '@mm/lib/data/racket';
import { createSeasonTeam, deleteSeasonTeam, pairName, setRoster, updateSeasonTeam, type SeasonTeam } from '@mm/lib/data/seasonTeams';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { formatLevel, parseLevelInput, setLevel, useLevels } from '@mm/pages/sports/racket/levels';
import { presetOf, presetsOf, rulesText } from '@mm/pages/sports/racket/logic/rulesText';
import { useNames } from '@mm/pages/sports/racket/names';
import { useRacket } from '@mm/pages/sports/racket/sport';
import { PickField } from '../players/fields';
import { confirmAsync, toast } from '../feedback';
import { Badge, Button, Card, Empty, Field, Input, SectionHeader, Sheet, Txt } from '../ui';
import { SaveFooter, useQuickMinor } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Lo hace y avisa («Reglas guardadas»); con error, el aviso del error. true si salió bien. */
async function run(fn: () => Promise<unknown>, ok?: string): Promise<boolean> {
  try {
    await fn();
    if (ok) toast(ok);
    return true;
  } catch (e) {
    toast(saveErrorMessage(e), 'error');
    return false;
  }
}

export function PairsAdmin() {
  const c = useColors();
  const { sport, rules, doubles } = useRacket();
  const { lid } = useLeagueCtx();
  const [saving, setSaving] = useState<string | null>(null);
  const current = presetOf(sport, rules);
  const pick = async (id: string, value: Record<string, unknown>) => {
    setSaving(id);
    await run(() => saveLeagueMatchRules(lid, value), 'Reglas guardadas');
    setSaving(null);
  };
  return (
    <View style={{ gap: 30 }}>
      <View style={{ gap: 10 }}>
        <SectionHeader title="Reglas del partido" />
        <Card style={{ gap: 12 }}>
          <Txt tone="fg2" style={{ fontSize: 15 }}>
            Ahora: <Txt style={{ fontSize: 15, fontFamily: font.bold }}>{rulesText(rules)}</Txt>
          </Txt>
          <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
            {presetsOf(sport).map((p) => {
              const on = current?.id === p.id;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, busy: saving === p.id, disabled: saving !== null }}
                  disabled={saving !== null}
                  onPress={() => void pick(p.id, p.rules as unknown as Record<string, unknown>)}
                  style={[styles.preset, { backgroundColor: on ? c.accentSoft : c.surface2, opacity: saving !== null && saving !== p.id ? 0.6 : 1 }]}
                >
                  <Txt style={{ flex: 1, fontSize: 15, fontFamily: font.semibold, color: on ? c.accent : c.fg }}>{p.label}</Txt>
                  {saving === p.id ? <ActivityIndicator color={c.accent} /> : on && <Check size={20} color={c.accent} strokeWidth={2.6} />}
                </Pressable>
              );
            })}
          </View>
          <Txt tone="muted" style={{ fontSize: 13 }}>
            Valen para los partidos nuevos.
          </Txt>
        </Card>
      </View>
      {/* Pádel siempre es de dobles; en tenis, pickleball y ping pong, aunque las reglas sean de individual, las cajas y
          la escalera de dobles piden parejas. */}
      {(doubles || sport !== 'padel') && <PairsSection />}
      <LevelsSection />
    </View>
  );
}

function PairsSection() {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const names = useNames();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<SeasonTeam | 'new' | null>(null);
  const paired = new Set(names.teams.flatMap((t) => t.roster.map((r) => r.playerId)));
  const free = names.players.filter((p) => !paired.has(p.id)).length;
  const remove = async (t: SeasonTeam) => {
    if (!(await confirmAsync({ title: `¿Borrar ${t.name}?`, message: 'Sus partidos se quedan con el nombre de la pareja.', confirmText: 'Borrar', danger: true }))) return;
    setDeleting(t.id);
    await run(() => deleteSeasonTeam(lid, t.id), 'Pareja borrada');
    setDeleting(null);
  };
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title={`Parejas (${names.teams.length})`}
        action={
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setEditing('new')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
            <Plus size={18} color={c.accent} strokeWidth={2.4} />
            <Txt variant="bodyStrong" tone="accent">
              Pareja
            </Txt>
          </Pressable>
        }
      />
      {names.teams.length ? (
        <Card padded={false}>
          {names.teams.map((t, i) => (
            <View key={t.id} style={[styles.row, { borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                  {t.name}
                </Txt>
                <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>
                  {t.roster.map((r) => names.nameOf(r.playerId)).join(' / ') || 'Sin jugadores'}
                </Txt>
              </View>
              {t.roster.length !== 2 && <Badge tone="danger">{`${t.roster.length} jugadores`}</Badge>}
              <Pressable accessibilityRole="button" accessibilityLabel={`Editar ${t.name}`} hitSlop={4} onPress={() => setEditing(t)} style={styles.icon}>
                <Pencil size={16} color={c.fg} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Borrar ${t.name}`}
                accessibilityState={{ busy: deleting === t.id, disabled: deleting !== null }}
                hitSlop={4}
                disabled={deleting !== null}
                onPress={() => void remove(t)}
                style={styles.icon}
              >
                {deleting === t.id ? <ActivityIndicator color={c.faint} /> : <Trash2 size={16} color={c.faint} />}
              </Pressable>
            </View>
          ))}
        </Card>
      ) : (
        <Empty title="Todavía no hay parejas" text="Para la liga de parejas y los torneos. El americano no las necesita." />
      )}
      {free > 0 && names.teams.length > 0 && (
        <Txt tone="muted" style={{ fontSize: 13, marginHorizontal: 4 }}>
          {free} jugadores sin pareja.
        </Txt>
      )}
      {editing && <PairEditor team={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

function PairEditor({ team, onClose }: { team: SeasonTeam | null; onClose: () => void }) {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const [a, setA] = useState(team?.roster[0]?.playerId ?? '');
  const [b, setB] = useState(team?.roster[1]?.playerId ?? '');
  const [name, setName] = useState(team?.name ?? '');
  const [busy, setBusy] = useState(false);
  const paired = new Set(names.teams.filter((t) => t.id !== team?.id).flatMap((t) => t.roster.map((r) => r.playerId)));
  const options = [...names.players].sort((x, y) => Number(paired.has(x.id)) - Number(paired.has(y.id)) || x.name.localeCompare(y.name, 'es'));
  const auto = pairName([a, b].filter(Boolean).map(names.nameOf));

  const save = async () => {
    setBusy(true);
    const players = [a, b].filter(Boolean).map((playerId) => ({ playerId }));
    const finalName = name.trim() || auto;
    const ok = await run(
      async () => {
        if (team) {
          if (finalName !== team.name) await updateSeasonTeam(lid, team.id, { name: finalName });
          await setRoster(lid, team.id, players);
        } else {
          await createSeasonTeam(lid, { name: finalName, players });
        }
      },
      team ? 'Pareja guardada' : 'Pareja creada',
    );
    setBusy(false);
    if (ok) onClose();
  };

  // El <select> de la web: «(elige)» y los jugadores (quien ya tiene pareja, abajo y dicho); el otro de la pareja no sale.
  const select = (value: string, set: (v: string) => void, other: string, label: string) => (
    <Field label={label}>
      <PickField<string>
        label={label}
        value={value}
        options={[{ key: '', label: '(elige)' }, ...options.filter((p) => p.id !== other).map((p) => ({ key: p.id, label: `${p.name}${paired.has(p.id) ? ' (ya tiene pareja)' : ''}` }))]}
        onChange={set}
      />
    </Field>
  );

  return (
    <Sheet open onClose={onClose} title={team ? `Editar ${team.name}` : 'Nueva pareja'} footer={<SaveFooter onClose={onClose} busy={busy} disabled={!a || !b || !(name.trim() || auto)} onSave={() => void save()} />}>
      {select(a, setA, b, 'Jugador 1 (drive)')}
      {select(b, setB, a, 'Jugador 2 (revés)')}
      <Field label="Nombre de la pareja" hint="Si lo dejas vacío: los dos nombres.">
        <Input value={name} maxLength={60} onChangeText={setName} placeholder={auto || 'Ana / Luis'} accessibilityLabel="Nombre de la pareja" />
      </Field>
      <Txt tone="muted" style={{ fontSize: 13 }}>
        Si un día falta alguien, en el partido se pone al suplente («Quién juega»).
      </Txt>
    </Sheet>
  );
}

function LevelsSection() {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const { sport } = useRacket();
  const names = useNames();
  const { levels, scale } = useLevels();
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Liga con menores: «Es menor de edad» y su tutor debajo del nombre.
  const minor = useQuickMinor(!!newName.trim());

  const add = async () => {
    const n = newName.trim();
    if (!n) return;
    const m = minor.take();
    if (m === undefined) return;
    setAdding(true);
    if (await run(() => createPlayer(lid, n, null, m), `${n} agregado`)) {
      setNewName('');
      minor.reset();
    }
    setAdding(false);
  };

  const save = async (id: string) => {
    const raw = drafts[id];
    if (raw === undefined) return;
    const v = parseLevelInput(raw, scale);
    if (v === 'invalido') return;
    await run(() => setLevel(lid, id, sport, v));
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  };

  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={`Jugadores y ${scale.label === 'Nivel' ? 'nivel' : scale.label} (${names.players.length})`} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Input value={newName} maxLength={60} onChangeText={setNewName} placeholder="Agregar jugador" accessibilityLabel="Nombre del jugador nuevo" returnKeyType="done" onSubmitEditing={() => void add()} />
        </View>
        <Button variant="soft" size="xl" icon={<UserPlus size={18} color={c.accent} />} loading={adding} disabled={!newName.trim()} accessibilityLabel="Agregar jugador" onPress={() => void add()} />
      </View>
      {minor.fields}
      {names.players.length ? (
        <Card padded={false}>
          {names.players.map((p, i) => (
            <LevelRow
              key={p.id}
              first={i === 0}
              name={p.name}
              label={`${scale.label} de ${p.name}`}
              placeholder={scale.placeholder}
              value={drafts[p.id] ?? (levels[p.id] != null ? formatLevel(levels[p.id], scale) : '')}
              onChange={(v) => setDrafts((d) => ({ ...d, [p.id]: v }))}
              onSave={() => save(p.id)}
            />
          ))}
        </Card>
      ) : (
        <Empty title="Sin jugadores" />
      )}
      <Txt tone="muted" style={{ fontSize: 13, marginHorizontal: 4 }}>
        {scale.hint}
      </Txt>
    </View>
  );
}

/** El nivel de un jugador: se guarda al salir del campo, con la ruedita al lado mientras guarda (cada fila la suya). */
function LevelRow({
  first,
  name,
  label,
  placeholder,
  value,
  onChange,
  onSave,
}: {
  first: boolean;
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => Promise<void>;
}) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await onSave();
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.row, { borderTopWidth: first ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
      <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.semibold }}>
        {name}
      </Txt>
      {busy && <ActivityIndicator color={c.muted} />}
      <View style={{ width: 84 }}>
        <Input
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          accessibilityState={{ busy }}
          editable={!busy}
          placeholder={placeholder}
          value={value}
          onChangeText={onChange}
          onBlur={() => void save()}
          returnKeyType="done"
          style={{ height: 44, textAlign: 'center', fontSize: 16, paddingHorizontal: 8 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preset: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 60, paddingVertical: 8, paddingLeft: 20, paddingRight: 12 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
