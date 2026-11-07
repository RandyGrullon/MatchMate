/**
 * Organizar › Nadadores (SwimmersAdmin de la web, con su misma lógica: src/pages/sports/swimming/admin.ts): buscar y
 * filtrar por club, «+ Registrar» nadadores sin cuenta (los menores, con el permiso de su padre, madre o tutor) y cada
 * nadador como fila (tocarla lo cambia: club, año de nacimiento y sexo). El año y el sexo solo los ven los admins.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Search, ShieldCheck, Users } from 'lucide-react-native';
import { registerSwimmer, updateSwimmer, useSwimmers, useSwimmersPrivate, type Sex } from '@mm/lib/data/swimming';
import {
  SEX_LABEL,
  filterSwimmers,
  swimmerChanges,
  swimmerFormCheck,
  swimmerFormStart,
  swimmerLine,
  swimmerTag,
  swimmersTitle,
  type SwimmerEditing,
  type SwimmerForm,
} from '@mm/pages/sports/swimming/admin';
import { groupLabel, leagueYear } from '@mm/pages/sports/swimming/logic';
import { clubMap, useNames, useSwim } from '@mm/pages/sports/swimming/swim';
import { initials } from '@/components/social/Avatar';
import { Badge, Button, Empty, Field, Input, ListRow, LoadError, Loading, SectionHeader, Segmented, Sheet, Txt } from '@/components/ui';
import { useNow } from '@mm/lib/useNow';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { CheckRow, InlineSelect, SectionAdd, SheetFooter } from './adminParts';
import { Lines, PillPicker, runAction } from './parts';

/** El círculo con las iniciales (Initials de la web). */
function InitialsMark({ name }: { name: string }) {
  const c = useColors();
  return (
    <View importantForAccessibility="no-hide-descendants" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <Txt tone="fg2" style={{ fontFamily: font.bold, fontSize: 14 }}>
        {initials(name)}
      </Txt>
    </View>
  );
}

export function SwimmersAdmin() {
  const c = useColors();
  const { lid, isAdmin, clubs } = useSwim();
  const { players } = useNames(lid);
  const swimmers = useSwimmers(lid);
  const priv = useSwimmersPrivate(lid, isAdmin);
  const [q, setQ] = useState('');
  const [club, setClub] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SwimmerEditing | null>(null);
  const infoBy = useMemo(() => new Map(swimmers.data.map((s) => [s.playerId, s] as const)), [swimmers.data]);
  const privBy = useMemo(() => new Map(priv.data.map((p) => [p.playerId, p] as const)), [priv.data]);
  const byClub = useMemo(() => clubMap(clubs.data), [clubs.data]);
  const list = filterSwimmers(players.data, q, club, infoBy);

  if (!isAdmin) return null;
  const error = players.error ?? swimmers.error ?? priv.error;
  if (error) return <LoadError error={error} />;

  return (
    <View style={{ gap: 26 }}>
      <View style={{ gap: 10 }}>
        <View style={{ justifyContent: 'center' }}>
          <Search size={16} color={c.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }} />
          <Input value={q} onChangeText={setQ} placeholder="Buscar nadador" accessibilityLabel="Buscar nadador" returnKeyType="search" style={{ paddingLeft: 40, backgroundColor: c.surface }} />
        </View>
        {clubs.data.length > 0 && (
          <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
            <PillPicker
              label="Club"
              options={[{ key: '', label: 'Todos los clubes' }, ...clubs.data.map((x) => ({ key: x.id, label: x.name })), { key: '-', label: 'Sin club' }]}
              value={club}
              onChange={setClub}
            />
          </View>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title={swimmersTitle(players.loading, list.length)} action={<SectionAdd label="Registrar" onPress={() => setAdding(true)} />} />
        {players.loading && !players.data.length ? (
          <Loading label="Cargando los nadadores" />
        ) : !list.length ? (
          <Empty
            icon={<Users size={28} color={c.accent} />}
            title={players.data.length ? 'Nadie con ese filtro' : 'Todavía no hay nadadores'}
            text={players.data.length ? undefined : 'Registra a los nadadores de cada club para inscribirlos en los encuentros.'}
          />
        ) : (
          <Lines>
            {list.map((p) => {
              const info = infoBy.get(p.id);
              const pr = privBy.get(p.id);
              const clubOf = info?.clubId ? byClub.get(info.clubId) : null;
              const tag = swimmerTag(p, pr);
              return (
                <ListRow
                  key={p.id}
                  onPress={() => setEditing({ player: p, info, priv: pr })}
                  accessibilityLabel={`Cambiar a ${p.name}`}
                  icon={<InitialsMark name={p.name} />}
                  title={p.name}
                  subtitle={swimmerLine(clubOf?.name, pr)}
                  chevron={false}
                  right={
                    info?.category || tag ? (
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        {!!info?.category && <Badge>{groupLabel(info.category)}</Badge>}
                        {tag && <Badge tone={tag.tone}>{tag.label}</Badge>}
                      </View>
                    ) : undefined
                  }
                />
              );
            })}
          </Lines>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 4 }}>
          <ShieldCheck size={16} color={c.ok} style={{ marginTop: 1 }} />
          <Txt tone="muted" style={{ flex: 1, fontSize: 12.5, lineHeight: 17 }}>
            El año y el sexo solo los ven los admins; los demás ven la categoría. Los menores no tienen cuenta.
          </Txt>
        </View>
      </View>

      <SwimmerFormSheet open={adding} onClose={() => setAdding(false)} />
      <SwimmerFormSheet key={editing?.player.id ?? ''} open={!!editing} onClose={() => setEditing(null)} editing={editing} />
    </View>
  );
}

const SEXES = (['F', 'M', 'X'] as Sex[]).map((s) => ({ key: s, label: SEX_LABEL[s] }));

/**
 * Registrar o cambiar un nadador (SwimmerFormModal de la web). `fixedClub`: el entrenador registra solo en su club (y
 * después no ve el año ni el sexo: solo los admins). Se monta al abrirla.
 */
export function SwimmerFormSheet(props: { open: boolean; onClose: () => void; editing?: SwimmerEditing | null; fixedClub?: string }) {
  return props.open ? <SwimmerFormOpen {...props} /> : null;
}

function SwimmerFormOpen({ onClose, editing, fixedClub }: { onClose: () => void; editing?: SwimmerEditing | null; fixedClub?: string }) {
  const { lid, league, clubs } = useSwim();
  const minorsOk = !!league.hasMinors;
  const [form, setForm] = useState<SwimmerForm>(() => swimmerFormStart(editing, { minorsOk, fixedClub }));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SwimmerForm>) => setForm((f) => ({ ...f, ...patch }));
  // El año de hoy en la zona de la liga: la base cuenta la edad igual.
  const thisYear = leagueYear(league.tz, useNow().getTime());
  const { birthYear, badYear, ageProblem, valid } = swimmerFormCheck(form, { thisYear, editing, minorsOk, fixedClub });
  const clubOptions = [{ value: '', label: 'Sin club' }, ...clubs.data.map((x) => ({ value: x.id, label: x.name }))];

  const save = async () => {
    setBusy(true);
    const ok = await runAction(
      async () => {
        if (!editing) {
          await registerSwimmer(lid, {
            name: form.name,
            clubId: form.club || null,
            isMinor: form.isMinor,
            birthYear,
            sex: form.sex || null,
            consent: form.isMinor && form.consent,
            guardianName: form.guardian || null,
          });
        } else {
          await updateSwimmer(lid, editing.player.id, swimmerChanges(editing, form, birthYear));
        }
        return true;
      },
      editing ? 'Nadador guardado' : 'Nadador registrado',
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? editing.player.name : 'Registrar nadador'}
      footer={
        <SheetFooter onCancel={onClose}>
          <Button variant="primary" full loading={busy} disabled={!valid} onPress={save}>
            Guardar
          </Button>
        </SheetFooter>
      }
    >
      <View style={{ gap: 16 }}>
        <Field label="Nombre">
          <Input accessibilityLabel="Nombre" value={form.name} maxLength={60} placeholder="Nombre y apellido" autoFocus={!editing} onChangeText={(name) => set({ name })} />
        </Field>
        {!editing && (
          <CheckRow
            checked={form.isMinor}
            disabled={!minorsOk}
            onChange={(isMinor) => set({ isMinor })}
            label="Es menor de 18 años (sin cuenta)"
            hint={minorsOk ? null : 'Para registrar menores, activa «Liga con menores» en Organizar › Ajustes (la liga queda privada).'}
          />
        )}
        <Field label="Año de nacimiento" hint={form.isMinor ? 'Obligatorio' : 'Para su categoría'}>
          <Input
            accessibilityLabel="Año de nacimiento"
            value={form.year}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="2015"
            invalid={badYear}
            onChangeText={(t) => set({ year: t.replace(/\D/g, '') })}
          />
        </Field>
        <Field label="Club">
          <InlineSelect label="Club" value={form.club} options={clubOptions} disabled={!!fixedClub} onChange={(club) => set({ club })} />
        </Field>
        {!!ageProblem && (
          <Txt accessibilityRole="alert" tone="warn" style={{ fontSize: 12 }}>
            {ageProblem}
          </Txt>
        )}
        <Field label={form.isMinor ? 'Sexo (obligatorio)' : 'Sexo'}>
          <Segmented<Sex | ''> label="Sexo" value={form.sex} onChange={(sex) => set({ sex })} options={SEXES} />
        </Field>
        {(form.isMinor || !!editing?.player.isMinor) && (
          <>
            <Field label="Padre, madre o tutor (opcional)">
              <Input accessibilityLabel="Padre, madre o tutor (opcional)" value={form.guardian} maxLength={60} onChangeText={(guardian) => set({ guardian })} />
            </Field>
            <CheckRow
              boxed
              checked={form.consent}
              disabled={!!editing?.priv?.consentAt}
              onChange={(consent) => set({ consent })}
              label="Su padre, madre o tutor dio permiso para registrarlo en la app."
              hint="Queda anotado quién lo registró y cuándo. Solo se guardan el nombre, el año de nacimiento y el sexo."
            />
          </>
        )}
      </View>
    </Sheet>
  );
}
