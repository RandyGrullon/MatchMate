/**
 * Lo del organizador en «Equipos» del torneo (admin/EntriesAdmin.tsx de la web, con su misma lógica: admin/logic.ts):
 * los pendientes con «Aprobar» y «Rechazar» (con una nota que le llega al capitán) y el menú de cada inscrito:
 * «Cambiar siembra», «Quitar check-in» (o marcarlo) y «Editar nombre». Las hojas se abren una a la vez.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, CheckCircle2, Hash, Pencil, X } from 'lucide-react-native';
import { checkIn, decideEntry, esportsErrorText, updateEntry, type EsportsEntry, type EsportsTournament } from '@mm/lib/data/esports';
import { entryLine, pendingEntries } from '@mm/pages/sports/esports/logic';
import { cleanEntryTag, cleanSeedInput, entryAdminItems, entryNameOk, entryTitle, seedFromInput, type EntryMenuKey } from '@mm/pages/sports/esports/admin/logic';
import { toast } from '../feedback';
import { Button, Card, Field, Input, ListRow, SectionHeader, Sheet } from '../ui';
import { Initials } from './bits';
import { MenuRow } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** «Por aprobar (n)»: cada pendiente con «Rechazar» (×) y «Aprobar» (✓). */
export function PendingEntries({ t, entries }: { t: EsportsTournament; entries: readonly EsportsEntry[] }) {
  const c = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<EsportsEntry | null>(null);
  const pending = pendingEntries(entries);
  if (!pending.length) return null;
  async function approve(e: EsportsEntry) {
    setBusy(e.id);
    try {
      await decideEntry(e.id, true);
      toast(`${e.name} aprobado`);
    } catch (err) {
      toast(esportsErrorText(err, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(null);
    }
  }
  const round = (bg: string) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: bg, opacity: busy ? 0.5 : 1 });
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={`Por aprobar (${pending.length})`} />
      <Card padded={false}>
        {pending.map((e, i) => (
          <View key={e.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
            <ListRow
              icon={<Initials name={e.name} />}
              title={entryTitle(e)}
              subtitle={[e.kind === 'free_agent' ? 'Agente libre' : null, entryLine(e)].filter(Boolean).join(' · ')}
              right={
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Rechazar a ${e.name}`} disabled={!!busy} onPress={() => setRejecting(e)} style={round(c.surface2)}>
                    <X size={20} color={c.fg2} />
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Aprobar a ${e.name}`} accessibilityState={{ busy: busy === e.id }} disabled={!!busy} onPress={() => void approve(e)} style={round(c.accentSoft)}>
                    <Check size={20} color={c.accent} strokeWidth={2.6} />
                  </Pressable>
                </View>
              }
            />
          </View>
        ))}
      </Card>
      <RejectSheet t={t} entry={rejecting} onClose={() => setRejecting(null)} />
    </View>
  );
}

/** Rechazar con una nota (opcional) que le llega al capitán. */
function RejectSheet({ t, entry, onClose }: { t: EsportsTournament; entry: EsportsEntry | null; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function reject() {
    if (!entry) return;
    setBusy(true);
    try {
      await decideEntry(entry.id, false, note);
      toast('Inscripción rechazada');
      setNote('');
      onClose();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={!!entry}
      onClose={onClose}
      title={entry ? `¿Rechazar a ${entry.name}?` : ''}
      subtitle="Le llega el aviso con tu nota"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" style={{ flex: 1 }} onPress={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" size="lg" style={{ flex: 1 }} loading={busy} onPress={reject}>
            Rechazar
          </Button>
        </View>
      }
    >
      <Field label="Nota (opcional)" hint="Ejemplo: falta un titular con su ID de juego.">
        <Input accessibilityLabel="Nota (opcional)" multiline maxLength={200} value={note} onChangeText={setNote} style={{ height: 88, paddingTop: 14, textAlignVertical: 'top' }} />
      </Field>
    </Sheet>
  );
}

type Panel = 'menu' | 'seed' | 'name';

/** El menú de un inscrito para quien organiza (una hoja a la vez: el menú, la siembra o el nombre). */
export function EntryAdminSheet({ t, entry, onClose }: { t: EsportsTournament; entry: EsportsEntry | null; onClose: () => void }) {
  const [panel, setPanel] = useState<Panel>('menu');
  const close = () => {
    setPanel('menu');
    onClose();
  };
  if (!entry) return null;
  return (
    <>
      <EntryMenu t={t} entry={entry} open={panel === 'menu'} onClose={close} onPick={setPanel} />
      <SeedEdit t={t} entry={entry} open={panel === 'seed'} onClose={close} />
      <NameEdit t={t} entry={entry} open={panel === 'name'} onClose={close} />
    </>
  );
}

function EntryMenu({ t, entry, open, onClose, onPick }: { t: EsportsTournament; entry: EsportsEntry; open: boolean; onClose: () => void; onPick: (p: Panel) => void }) {
  const c = useColors();
  const [busy, setBusy] = useState(false);
  async function toggleCheckin() {
    setBusy(true);
    try {
      await checkIn(entry.id, !!entry.checkedInAt);
      toast(entry.checkedInAt ? 'Check-in quitado' : 'Check-in hecho');
      onClose();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(false);
    }
  }
  const icon: Record<EntryMenuKey, typeof Hash> = { seed: Hash, checkin: CheckCircle2, name: Pencil };
  return (
    <Sheet open={open} onClose={onClose} title={entry.name}>
      {entryAdminItems(t, entry).map((it) => {
        const I = icon[it.key];
        return (
          <MenuRow
            key={it.key}
            icon={<I size={20} color={c.fg2} />}
            label={it.label}
            hint={it.hint}
            disabled={busy}
            onPress={() => (it.key === 'checkin' ? void toggleCheckin() : onPick(it.key))}
          />
        );
      })}
    </Sheet>
  );
}

function SeedEdit({ t, entry, open, onClose }: { t: EsportsTournament; entry: EsportsEntry; open: boolean; onClose: () => void }) {
  const [seed, setSeed] = useState(entry.seed ? String(entry.seed) : '');
  const [busy, setBusy] = useState(false);
  const { n, ok } = seedFromInput(seed);
  async function save() {
    setBusy(true);
    try {
      await updateEntry(entry.id, { seed: n });
      toast('Siembra guardada');
      onClose();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cambiar siembra"
      subtitle={entry.name}
      footer={
        <Button variant="primary" size="lg" full disabled={!ok} loading={busy} onPress={save}>
          Guardar
        </Button>
      }
    >
      <Field label="Siembra (1 es el mejor; vacío = sin siembra)">
        <Input accessibilityLabel="Siembra" keyboardType="number-pad" value={seed} onChangeText={(v) => setSeed(cleanSeedInput(v))} />
      </Field>
    </Sheet>
  );
}

function NameEdit({ t, entry, open, onClose }: { t: EsportsTournament; entry: EsportsEntry; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(entry.name);
  const [tag, setTag] = useState(entry.tag);
  const [busy, setBusy] = useState(false);
  const ok = entryNameOk(name, tag);
  async function save() {
    setBusy(true);
    try {
      await updateEntry(entry.id, { name, tag });
      toast('Nombre guardado');
      onClose();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'inscripcion'), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar nombre"
      footer={
        <Button variant="primary" size="lg" full disabled={!ok} loading={busy} onPress={save}>
          Guardar
        </Button>
      }
    >
      <Field label="Nombre">
        <Input accessibilityLabel="Nombre" maxLength={40} value={name} onChangeText={setName} />
      </Field>
      <Field label="Tag (hasta 5, mayúsculas)">
        <Input accessibilityLabel="Tag" maxLength={5} autoCapitalize="characters" value={tag} onChangeText={(v) => setTag(cleanEntryTag(v))} style={{ fontFamily: font.semibold, letterSpacing: 1.2 }} />
      </Field>
    </Sheet>
  );
}
