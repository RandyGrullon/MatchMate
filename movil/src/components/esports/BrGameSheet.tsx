/**
 * «Anotar partida» de battle royale (admin/BrGameSheet.tsx de la web, con su misma lógica: logic.ts y admin/logic.ts):
 * la jornada y la partida, el mapa y, por cada inscrito, el puesto (del 1 al número de inscritos, sin repetir: los
 * tomados salen apagados; «— No jugó») y las kills con − y +; hasta 3 capturas. «Guardar partida» → saveBrGame
 * (reemplaza lo anterior de esa partida). Editando una: «Anular» o «Borrar». Lo anotan quien organiza y los anotadores.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ban, Camera, ImagePlus, Trash2, X } from 'lucide-react-native';
import { addMatchProofImage, deleteBrGame, esportsErrorText, saveBrGame, type BrGame, type EsportsEntry, type EsportsTournament } from '@mm/lib/data/esports';
import { useLeagueCtx } from '@mm/lib/league';
import { usePhoto } from '@mm/lib/photos';
import { competitors, nextBrSlot, placementError } from '@mm/pages/sports/esports/logic';
import { BR_CLASH_TEXT, BR_DELETE_ASK, brClash, brInitialRows, brSheetTitle, brSlotRanges } from '@mm/pages/sports/esports/admin/logic';
import { pickPhoto, type PhotoSource } from '@/lib/pickImage';
import { LogoSpinner } from '../Logo';
import { confirmAsync, toast } from '../feedback';
import { Button, Card, Field, Input, Sheet, Txt } from '../ui';
import { Legend } from './fields';
import { ChoiceChips, ScoreStepper } from './inputs';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export function BrGameSheet({
  open,
  onClose,
  t,
  entries,
  games,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  t: EsportsTournament;
  entries: readonly EsportsEntry[];
  games: readonly BrGame[];
  editing?: BrGame | null;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={brSheetTitle(editing)} subtitle={t.name}>
      {open && <Body key={editing?.id ?? 'nueva'} t={t} entries={entries} games={games} editing={editing ?? null} onDone={onClose} />}
    </Sheet>
  );
}

type Row = { placement: number | null; kills: number };

function Body({ t, entries, games, editing, onDone }: { t: EsportsTournament; entries: readonly EsportsEntry[]; games: readonly BrGame[]; editing: BrGame | null; onDone: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const list = competitors(entries);
  const total = list.length;
  const [slot] = useState(() => (editing ? { round: editing.round, gameNo: editing.gameNo } : nextBrSlot(games, t.settings)));
  const [round, setRound] = useState(slot.round);
  const [gameNo, setGameNo] = useState(slot.gameNo);
  const [map, setMap] = useState(editing?.map ?? '');
  const [proof, setProof] = useState<string[]>(() => [...(editing?.proof ?? [])]);
  const [rows, setRows] = useState<Record<string, Row>>(() => brInitialRows(list, editing));
  const [tried, setTried] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<null | 'guardar' | 'anular' | 'borrar' | 'foto'>(null);
  const results = list.map((e) => ({ entryId: e.id, placement: rows[e.id]?.placement ?? null, kills: rows[e.id]?.kills ?? 0 }));
  const error = placementError(results, total);
  const taken = new Map(results.filter((r) => r.placement != null).map((r) => [r.placement!, r.entryId]));
  const clash = brClash(games, round, gameNo, !!editing);
  const { rounds, perRound } = brSlotRanges(t, round, gameNo);
  const set = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));

  async function save(status?: 'void') {
    setTried(true);
    if (!status && (error || clash)) return;
    setBusy(status ? 'anular' : 'guardar');
    try {
      await saveBrGame(t.eventId, { id: editing?.id, round, gameNo, map: map.trim(), proof, results, ...(status ? { status } : {}) });
      toast(status ? 'Partida anulada' : 'Partida guardada');
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'torneo'), 'error');
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    if (!editing) return;
    if (!(await confirmAsync(BR_DELETE_ASK))) return;
    setBusy('borrar');
    try {
      await deleteBrGame(t.eventId, editing.id);
      toast('Partida borrada');
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, t.game, 'torneo'), 'error');
    } finally {
      setBusy(null);
    }
  }
  async function addPhoto(source: PhotoSource) {
    setAsking(false);
    if (proof.length >= 3) return;
    setBusy('foto');
    try {
      const img = await pickPhoto(source);
      if (!img) return;
      const id = await addMatchProofImage(lid, t.eventId, img);
      setProof((p) => [...p, id].slice(0, 3));
    } catch (e) {
      toast(esportsErrorText(e, t.game), 'error');
    } finally {
      setBusy(null);
    }
  }

  if (!total) {
    return (
      <Txt variant="meta" tone="muted">
        Todavía no hay inscritos aprobados.
      </Txt>
    );
  }
  const numbers = (n: number, word: string) => Array.from({ length: n }, (_, i) => ({ key: String(i + 1), label: `${word} ${i + 1}` }));
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Legend>Jornada</Legend>
        {editing ? <Txt variant="bodyStrong">{`Jornada ${round}`}</Txt> : <ChoiceChips scroll label="Jornada" items={numbers(rounds, 'Jornada')} value={String(round)} onChange={(k) => setRound(Number(k))} />}
      </View>
      <View style={{ gap: 8 }}>
        <Legend>Partida</Legend>
        {editing ? <Txt variant="bodyStrong">{`Partida ${gameNo}`}</Txt> : <ChoiceChips scroll label="Partida" items={numbers(perRound, 'Partida')} value={String(gameNo)} onChange={(k) => setGameNo(Number(k))} />}
        {clash && (
          <Txt tone="danger" style={{ fontSize: 13.5, fontFamily: font.medium }}>
            {BR_CLASH_TEXT}
          </Txt>
        )}
      </View>
      <Field label="Mapa (opcional)">
        <Input accessibilityLabel="Mapa (opcional)" maxLength={24} placeholder="Bermuda, Erangel…" value={map} onChangeText={setMap} />
      </Field>

      <View style={{ gap: 8 }}>
        <Legend>Puesto y kills</Legend>
        <Card padded={false}>
          {list.map((e, i) => {
            const r = rows[e.id];
            const open = picking === e.id;
            return (
              <View key={e.id} style={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}>
                <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                  {e.name}
                </Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Puesto de ${e.name}`}
                    accessibilityState={{ expanded: open }}
                    onPress={() => setPicking(open ? null : e.id)}
                    style={{ width: 112, height: 44, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: open ? c.accentSoft : c.surface2 }}
                  >
                    <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: r.placement == null ? c.muted : c.fg }}>{r.placement == null ? '— No jugó' : `${r.placement}.º`}</Txt>
                  </Pressable>
                  <ScoreStepper value={r.kills} min={0} max={200} label={`Kills de ${e.name}`} onChange={(n) => set(e.id, { kills: n ?? 0 })} />
                </View>
                {open && (
                  <View accessibilityRole="radiogroup" accessibilityLabel={`Puesto de ${e.name}`} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {[null, ...Array.from({ length: total }, (_, k) => k + 1)].map((p) => {
                      const owner = p == null ? undefined : taken.get(p);
                      const off = !!owner && owner !== e.id;
                      const on = r.placement === p;
                      return (
                        <Pressable
                          key={p ?? 'no'}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on, disabled: off }}
                          disabled={off}
                          onPress={() => {
                            set(e.id, { placement: p });
                            setPicking(null);
                          }}
                          style={{ minWidth: 52, height: 40, borderRadius: 20, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : c.surface2, opacity: off ? 0.35 : 1 }}
                        >
                          <Txt style={{ fontSize: 14, fontFamily: font.semibold, color: on ? c.accentFg : c.fg2 }}>{p == null ? '— No jugó' : `${p}.º`}</Txt>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      </View>

      <View style={{ gap: 8 }}>
        <Legend>Capturas (opcional, hasta 3)</Legend>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {proof.map((id) => (
            <Thumb key={id} id={id} onRemove={() => setProof((p) => p.filter((x) => x !== id))} />
          ))}
          {proof.length < 3 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agregar una captura"
              disabled={busy === 'foto'}
              onPress={() => setAsking((v) => !v)}
              style={{ width: 80, height: 80, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', justifyContent: 'center', opacity: busy === 'foto' ? 0.6 : 1 }}
            >
              {busy === 'foto' ? <LogoSpinner size={28} label="Subiendo la captura" /> : <Camera size={28} color={c.accent} />}
            </Pressable>
          )}
        </ScrollView>
        {asking && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button size="lg" style={{ flex: 1 }} icon={<Camera size={20} color={c.fg} />} onPress={() => void addPhoto('camera')}>
              Tomar foto
            </Button>
            <Button size="lg" style={{ flex: 1 }} icon={<ImagePlus size={20} color={c.fg} />} onPress={() => void addPhoto('library')}>
              Galería
            </Button>
          </View>
        )}
      </View>

      {tried && !!error && (
        <Txt accessibilityRole="alert" tone="danger" style={{ fontSize: 13.5, fontFamily: font.medium, marginHorizontal: 4 }}>
          {error}
        </Txt>
      )}
      <Button variant="primary" size="lg" full loading={busy === 'guardar'} disabled={busy === 'foto'} onPress={() => save()}>
        Guardar partida
      </Button>
      {editing && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" style={{ flex: 1 }} icon={<Ban size={16} color={c.fg} />} loading={busy === 'anular'} disabled={editing.status === 'void'} onPress={() => save('void')}>
            Anular
          </Button>
          <Button size="lg" style={{ flex: 1 }} icon={<Trash2 size={16} color={c.danger} />} loading={busy === 'borrar'} onPress={remove}>
            Borrar
          </Button>
        </View>
      )}
    </View>
  );
}

function Thumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const photo = usePhoto(lid, id);
  return (
    <View style={{ width: 80, height: 80, borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface2 }}>
      {photo.data && <Image source={{ uri: photo.data.url }} accessibilityLabel="Captura" style={StyleSheet.absoluteFill} contentFit="cover" />}
      <Pressable accessibilityRole="button" accessibilityLabel="Quitar la captura" onPress={onRemove} style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'flex-end', padding: 6 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} color="#fff" />
        </View>
      </Pressable>
    </View>
  );
}
