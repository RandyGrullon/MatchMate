/**
 * «Leer foto» / «Verificar con foto» de la Planilla (ScanModal de la web, con su misma lógica: src/components/scanLogic.ts):
 * quien organiza o anota toma o elige la foto del marcador, la IA la lee (scanJobs, sin esperar señal: está mirando),
 * cada fila se empareja con su jugador (los del evento y, para el admin, los demás de la liga, que se inscriben al
 * guardar) y al guardar esos juegos quedan verificados con la foto (save_verified_games). Si la lectura falla, una fila a
 * mano mirando la foto. En la fila de quien verifica, si también juega, la bola de cada juego. Se monta al abrirse
 * (empieza sin foto); va dentro de LeagueScope.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { AlertTriangle, Camera, CheckSquare, ImagePlus, Plus, ScanLine, Sparkles, Square, Trash2 } from 'lucide-react-native';
import { lastBall } from '@mm/lib/balls';
import { fetchEffectiveAverages, saveVerifiedGames, type VerifiedWrite } from '@mm/lib/data';
import { queueGameBalls, rememberBall } from '@mm/lib/data/balls';
import type { CompressedImage } from '@mm/lib/image';
import { useLeagueCtx } from '@mm/lib/league';
import { ScanError } from '@mm/lib/scan-result';
import { cancelScan, scanDone, startScan, useScanJob } from '@mm/lib/scanJobs';
import type { BowlingEvent, Entry, Player } from '@mm/lib/types';
import {
  SCAN_ENROLLS,
  SCAN_FAILED,
  SCAN_NO_PHOTO_NOTE,
  SCAN_OWN_BALLS,
  SCAN_PRIVACY_NOTE,
  SCAN_READING,
  SCAN_REVIEW,
  SCAN_TITLE,
  manualScanRow,
  retargetScanRow,
  scanErrorText,
  scanGameCells,
  scanGamesToSave,
  scanProblems,
  scanReadLine,
  scanRowsFrom,
  scanSaveLabel,
  scanSavedText,
  scanValuesOf,
  useOwnBalls,
  type OwnBalls,
  type RowDraft,
} from '@mm/components/scanLogic';
import { GameBallChip } from '@/components/balls/GameBall';
import { useBusy } from '@/components/bowlingTeams/parts';
import { PickField } from '@/components/players/fields';
import { runAction } from '@/components/swimming/parts';
import { toast } from '@/components/feedback';
import { openLegal } from '@/components/legal/links';
import { Badge, Button, Card, ChoiceRow, Sheet, Txt } from '@/components/ui';
import { pickPhoto, type PhotoSource } from '@/lib/pickImage';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Lo que tarda en irse la hoja antes de abrir otra pantalla (la Privacidad: otra pantalla no se ve encima de una hoja). */
const SHEET_CLOSE_MS = 400;

export function ScanSheet({
  event,
  entries,
  players,
  focusPlayerId,
  onClose,
}: {
  event: BowlingEvent;
  entries: Entry[];
  players: Player[];
  /** Se abrió desde la fila de un jugador: si la foto trae una sola fila, es la suya, y solo la suya va marcada. */
  focusPlayerId?: string | null;
  onClose: () => void;
}) {
  const c = useColors();
  const { lid, isAdmin, myPlayerId } = useLeagueCtx();
  const [photo, setPhoto] = useState<CompressedImage | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const job = useScanJob(scanId);
  // Quien verifica está mirando: la lectura no espera señal ni reintenta; si falla, anota a mano mirando la foto.
  const scanning = job?.status === 'leyendo';
  const [scanError, setScanError] = useState<string | null>(null);
  const [rows, setRows] = useState<RowDraft[]>([]);
  const saving = useBusy();
  // La lectura de la foto actual (si se elige otra o se cierra, lo que llegue de la anterior no se usa).
  const current = useRef<string | null>(null);
  // Si quien verifica también juega aquí: la bola de cada uno de sus juegos (solo en su fila).
  const ownBalls = useOwnBalls(true, event, entries, rows, myPlayerId);
  // Al cerrar, la lectura que iba ya no se usa (no gasta el cupo gratis de la IA).
  useEffect(() => () => cancelScan(current.current), []);

  const entryOf = (playerId: string) => entries.find((e) => e.playerId === playerId) ?? null;
  const participants = players.filter((p) => entries.some((e) => e.playerId === p.id));
  // Solo el admin inscribe jugadores nuevos al guardar; el anotador usa los que ya están.
  const others = isAdmin ? players.filter((p) => !entries.some((e) => e.playerId === p.id)) : [];

  async function pick(source: PhotoSource) {
    const img = await pickPhoto(source, { scan: true });
    if (!img) return;
    setPhoto(img);
    setRows([]);
    setScanError(null);
    cancelScan(current.current);
    const id = startScan(img.scan, { background: false, leagueId: lid, eventId: event.id });
    current.current = id;
    setScanId(id);
    try {
      const found = await scanDone(id);
      if (current.current !== id) return;
      setRows(scanRowsFrom(found, { participants, others, entryOf, games: event.games, focusPlayerId }));
    } catch (e) {
      if (current.current !== id) return;
      setScanError(e instanceof ScanError ? e.message : SCAN_FAILED);
      setRows([manualScanRow(entryOf(focusPlayerId ?? ''), event.games, focusPlayerId ?? '')]);
    }
  }

  const update = (key: string, patch: Partial<RowDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const included = rows.filter((r) => r.include);
  const problems = scanProblems(rows);
  const gamesToSave = scanGamesToSave(rows, event.games);

  async function save() {
    if (!photo || problems.length || !gamesToSave) return;
    // Las bolas de sus juegos como se ven ahora: al guardar cambian sus puntajes y, con ellos, la que se pone sola.
    const mine = included.find((r) => r.key === ownBalls.row);
    const balls = mine ? ownBalls.update(scanValuesOf(mine, event.games)) : null;
    // Los promedios de los nuevos también se esperan: la ruedita sale desde el toque y se quita aunque fallen.
    const ok = await saving.run('guardar', () =>
      runAction(async () => {
        const newcomers = included.filter((r) => !entryOf(r.playerId)).map((r) => players.find((p) => p.id === r.playerId)!);
        const averages = newcomers.length ? await fetchEffectiveAverages(lid, newcomers, { date: event.date, eventId: event.id }) : new Map<string, number>();
        const writes: VerifiedWrite[] = included.map((r) => ({
          entry: entryOf(r.playerId),
          playerId: r.playerId,
          average: averages.get(r.playerId) ?? 0,
          values: scanValuesOf(r, event.games),
        }));
        await saveVerifiedGames(lid, event, photo, writes);
        return true;
      }),
    );
    if (!ok) return;
    // Sus juegos ya están guardados: la bola de cada uno va detrás, en la cola de la liga (solo las que cambian). La que
    // eligió se pone sola la próxima vez.
    if (balls) {
      queueGameBalls('event', event.id, balls, lid);
      rememberBall(lastBall(Object.values(balls)));
    }
    toast(scanSavedText(gamesToSave));
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={SCAN_TITLE}
      footer={
        photo ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button onPress={onClose} style={{ flex: 1 }}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving.isBusy()} disabled={scanning || !!problems.length || !gamesToSave} onPress={() => void save()} style={{ flex: 1.4 }}>
              {scanSaveLabel(gamesToSave)}
            </Button>
          </View>
        ) : undefined
      }
    >
      {!photo ? (
        <View style={{ gap: 12 }}>
          <View style={[styles.picker, { borderColor: c.line }]}>
            <Camera size={32} color={c.accent} />
            <Txt variant="small" tone="muted" style={{ textAlign: 'center' }}>
              La pantalla de resultados de la pista, que se lean los nombres y los juegos.
            </Txt>
            <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
              <Button size="lg" icon={<Camera size={18} color={c.fg} />} onPress={() => void pick('camera')} style={{ flex: 1 }}>
                Tomar foto
              </Button>
              <Button size="lg" icon={<ImagePlus size={18} color={c.fg} />} onPress={() => void pick('library')} style={{ flex: 1 }}>
                Galería
              </Button>
            </View>
          </View>
          <Txt variant="small" tone="muted">
            {SCAN_NO_PHOTO_NOTE}
          </Txt>
          {/* Aviso de privacidad: la foto la lee Google en su plan gratis (Ley 172-13: decir a quién va y para qué). */}
          <View style={[styles.note, { backgroundColor: c.surface2 }]}>
            <Sparkles size={14} color={c.accent} style={{ marginTop: 2 }} />
            <Txt variant="small" tone="muted" style={{ flex: 1 }}>
              {`${SCAN_PRIVACY_NOTE} `}
              <Txt
                variant="small"
                tone="accent"
                accessibilityRole="link"
                onPress={() => {
                  // La hoja se cierra primero y se abre la Privacidad de la app en «Fotos, logos y la IA de Google».
                  onClose();
                  setTimeout(() => openLegal('privacidad', 'fotos'), SHEET_CLOSE_MS);
                }}
                style={{ textDecorationLine: 'underline' }}
              >
                Más en Privacidad
              </Txt>
            </Txt>
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Image
            source={{ uri: photo.data }}
            accessibilityLabel="Foto del marcador"
            style={{ width: '100%', aspectRatio: photo.width && photo.height ? photo.width / photo.height : 4 / 3, borderRadius: 14 }}
            contentFit="contain"
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button icon={<Camera size={16} color={c.fg} />} onPress={() => void pick('camera')} style={{ flex: 1 }}>
              Otra foto
            </Button>
            <Button icon={<ImagePlus size={16} color={c.fg} />} onPress={() => void pick('library')} style={{ flex: 1 }}>
              Galería
            </Button>
          </View>
          {scanning && (
            <View style={[styles.note, { backgroundColor: c.accentSoft, alignItems: 'center' }]}>
              <ScanLine size={16} color={c.accent} />
              <Txt tone="accent" variant="meta" style={{ flex: 1 }}>
                {SCAN_READING}
              </Txt>
            </View>
          )}
          {!!scanError && (
            <View style={[styles.note, { backgroundColor: c.warnSoft }]}>
              <AlertTriangle size={16} color={c.warn} style={{ marginTop: 1 }} />
              <Txt variant="meta" style={{ flex: 1, color: c.warn }}>
                {scanErrorText(scanError)}
              </Txt>
            </View>
          )}
          {!scanning && !scanError && rows.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Sparkles size={16} color={c.accent} />
              <Txt variant="meta" tone="muted">
                {SCAN_REVIEW}
              </Txt>
            </View>
          )}
          {rows.map((r) => (
            <RowCard
              key={r.key}
              row={r}
              games={event.games}
              entry={entryOf(r.playerId)}
              participants={participants}
              others={others}
              own={ownBalls}
              onPatch={(patch) => update(r.key, patch)}
              onPlayer={(playerId) => setRows((rs) => rs.map((x) => (x.key === r.key ? retargetScanRow(x, playerId, entryOf(playerId), event.games) : x)))}
              onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
            />
          ))}
          {!scanning && (
            <Pressable accessibilityRole="button" onPress={() => setRows((rs) => [...rs, manualScanRow(null, event.games)])} style={styles.quiet}>
              <Plus size={16} color={c.fg2} />
              <Txt tone="fg2" style={{ fontFamily: font.medium }}>
                Agregar fila a mano
              </Txt>
            </Pressable>
          )}
          {problems.length > 0 && included.length > 0 && (
            <View style={{ gap: 2 }}>
              {problems.map((p) => (
                <Txt key={p} variant="small" style={{ color: c.danger }}>
                  {p}
                </Txt>
              ))}
            </View>
          )}
        </View>
      )}
    </Sheet>
  );
}

/** Una fila leída (o a mano): marcarla, su jugador, desde qué juego y sus juegos. */
function RowCard({
  row: r,
  games,
  entry,
  participants,
  others,
  own,
  onPatch,
  onPlayer,
  onRemove,
}: {
  row: RowDraft;
  games: number;
  entry: Entry | null;
  participants: readonly Player[];
  others: readonly Player[];
  own: OwnBalls;
  onPatch: (patch: Partial<RowDraft>) => void;
  onPlayer: (playerId: string) => void;
  onRemove: () => void;
}) {
  const c = useColors();
  const read = scanReadLine(r);
  const Box = r.include ? CheckSquare : Square;
  return (
    <Card style={{ gap: 12, padding: 14, opacity: r.include ? 1 : 0.55 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="Incluir esta fila"
          accessibilityState={{ checked: r.include }}
          hitSlop={10}
          onPress={() => onPatch({ include: !r.include })}
        >
          <Box size={22} color={r.include ? c.accent : c.muted} />
        </Pressable>
        <Txt variant="small" tone="muted" style={{ flex: 1 }}>
          {read.read ? (
            <>
              {'Leído: '}
              <Txt variant="small" style={{ fontFamily: font.semibold }}>
                {read.read}
              </Txt>
              {read.check && <Txt variant="small" style={{ color: read.check.ok ? c.ok : c.warn }}>{`  ${read.check.text}`}</Txt>}
            </>
          ) : (
            'Fila manual'
          )}
        </Txt>
        {!r.screenName && <Button variant="ghost" accessibilityLabel="Quitar fila" icon={<Trash2 size={16} color={c.muted} />} onPress={onRemove} />}
      </View>
      <PlayerPick value={r.playerId} participants={participants} others={others} warn={!r.playerId && r.include} onPick={onPlayer} />
      <PickField
        label="Desde el juego"
        value={String(r.start)}
        onChange={(k) => onPatch({ start: Number(k) })}
        options={Array.from({ length: games }, (_, i) => ({ key: String(i), label: `Desde J${i + 1}` }))}
      />
      <RowGames row={r} games={games} entry={entry} own={own} onValues={(values) => onPatch({ values })} />
      {!!r.playerId && !entry && (
        <View style={{ alignSelf: 'flex-start' }}>
          <Badge tone="accent">{SCAN_ENROLLS}</Badge>
        </View>
      )}
    </Card>
  );
}

/** El jugador de la fila (el Select de la web, con «En este evento» y «Otros (se inscriben)»). */
function PlayerPick({
  value,
  participants,
  others,
  warn,
  onPick,
}: {
  value: string;
  participants: readonly Player[];
  others: readonly Player[];
  warn: boolean;
  onPick: (playerId: string) => void;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const name = [...participants, ...others].find((p) => p.id === value)?.name ?? '— Elegir jugador —';
  const choose = (id: string) => {
    setOpen(false);
    onPick(id);
  };
  const group = (title: string, list: readonly Player[]) =>
    list.length > 0 && (
      <View style={{ gap: 6 }}>
        <Txt variant="small" tone="muted" style={{ marginLeft: 4 }}>
          {title}
        </Txt>
        {list.map((p) => (
          <ChoiceRow key={p.id} title={p.name} selected={p.id === value} onPress={() => choose(p.id)} />
        ))}
      </View>
    );
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Jugador: ${name}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={[styles.pick, { backgroundColor: c.surface2, borderColor: warn ? c.warn : 'transparent' }]}
      >
        <Txt numberOfLines={1} tone={value ? 'fg' : 'muted'} style={{ flex: 1, fontSize: 16, fontFamily: font.medium }}>
          {name}
        </Txt>
      </Pressable>
      {open && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Jugador" style={{ gap: 10 }}>
          {group('En este evento', participants)}
          {group('Otros (se inscriben)', others)}
        </View>
      )}
    </View>
  );
}

/**
 * Los juegos de una fila (ScanGames de la web): el puntaje de cada juego del evento (desde «Desde J»; los que no caben,
 * tachados) y, en la de quien verifica (`own.row`), la bola de cada uno debajo.
 */
function RowGames({ row, games, entry, own, onValues }: { row: RowDraft; games: number; entry: Entry | null; own: OwnBalls; onValues: (values: string[]) => void }) {
  const c = useColors();
  const ball = own.row === row.key ? own : null;
  const cells = scanGameCells(row, games, entry);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {cells.map((x, k) => (
          <View key={k} style={{ width: 64, alignItems: 'center', gap: 4 }}>
            <Txt tone="muted" style={{ fontSize: 11 }}>
              {x.label}
            </Txt>
            <TextInput
              accessibilityLabel={`Juego ${x.slot + 1}`}
              keyboardType="number-pad"
              maxLength={3}
              editable={!x.out}
              value={row.values[k]}
              onChangeText={(t) => onValues(row.values.map((v, j) => (j === k ? t.replace(/[^\d]/g, '') : v)))}
              style={[
                styles.game,
                {
                  color: c.fg,
                  backgroundColor: c.surface,
                  borderColor: x.differs ? c.warn : c.line,
                  opacity: x.out ? 0.4 : 1,
                  textDecorationLine: x.out ? 'line-through' : 'none',
                },
              ]}
            />
            {ball && !x.out && <GameBallChip game={x.slot} balls={ball.balls} value={ball.ballOf(x.slot)} onPick={ball.onPick} />}
            {!!x.differs && <Txt style={{ fontSize: 10, color: c.warn }}>{x.differs}</Txt>}
            {x.replaces && (
              <Txt tone="muted" style={{ fontSize: 10 }}>
                reemplaza ✓
              </Txt>
            )}
          </View>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Agregar juego" onPress={() => onValues([...row.values, ''])} style={[styles.addGame, { borderColor: c.line }]}>
          <Plus size={16} color={c.muted} />
        </Pressable>
      </View>
      {ball && (
        <Txt variant="small" tone="muted">
          {SCAN_OWN_BALLS}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { alignItems: 'center', gap: 10, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', paddingHorizontal: 16, paddingVertical: 20 },
  note: { flexDirection: 'row', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  quiet: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start', paddingHorizontal: 4 },
  pick: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  game: { width: '100%', height: 40, borderRadius: 10, borderWidth: 1, textAlign: 'center', fontSize: 16, fontFamily: font.semibold },
  addGame: { width: 40, height: 40, marginTop: 18, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
