import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { CalendarCheck, Camera, CheckCircle2, ChevronLeft, Grid3x3, Keyboard, Plus, ScanLine, UserPlus, Users, X, type LucideIcon } from 'lucide-react-native';
import { addEntries, addEventGame, fetchEffectiveAverages, removeEntry, saveGame, updateEntry } from '@mm/lib/data';
import { getUserId } from '@mm/lib/data/client';
import { useLeagueCtx } from '@mm/lib/league';
import { usePhoto } from '@mm/lib/photos';
import { entryLine, isValidScore, slots, type Line } from '@mm/lib/stats';
import { partialGame, useMemoryTick } from '@mm/lib/useNextGame';
import { NO_PHOTO, type BowlingEvent, type Entry, type LiveScore, type Player, type Submission } from '@mm/lib/types';
import { boardRows, shortName, type BoardCell, type BoardRow, type PartialOf } from '@mm/components/event/board';
import {
  cellSpoken,
  cellText,
  confirmedText,
  emptySheetText,
  groupTotal,
  groupTotalText,
  isRealPhoto,
  missingConfirmed,
  removeEntryConfirm,
  sheetGroups,
} from '@mm/components/event/sheet';
import { clearGameDraft, gameKey, myGamesPlace, readGameDraft, tableGameKey } from '@mm/components/frames/draftMemory';
import { useBusy } from '@/components/bowlingTeams/parts';
import { confirmAsync } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Badge, Button, Card, Empty, Loading, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { AddPlayersSheet } from './AddPlayersSheet';
import { ScanSheet } from './ScanSheet';

const NO_SUBS: Submission[] = [];
const NO_LIVE: LiveScore[] = [];
const EMPTY_CELL: BoardCell = { kind: 'empty', score: null };

/** Abre la hoja de anotar: la de la fila (`entryId`) o, sin fila, la tuya de «Tus juegos». */
const openScore = (lid: string, eventId: string, game: number, entryId?: string) =>
  router.push({ pathname: '/l/[lid]/e/[eventId]/anotar', params: entryId ? { lid, eventId, juego: String(game + 1), fila: entryId } : { lid, eventId, juego: String(game + 1) } });

/**
 * La Planilla del evento (GamesTab de la web, para quien organiza o anota): la tabla en vivo, ordenada por lo que suma
 * cada uno, que es a la vez donde se anotan los juegos de todos. Cada casilla: lo que cuenta (gris), «Por aprobar»
 * (ámbar: enviado o sin la foto que la liga exige; no suma), «Jugando» (contorno del deporte: en el teléfono del jugador,
 * o «74…» a medias) o vacía. Tocar una casilla abre la hoja de anotar de esa fila y ese juego (tu juego a medias sigue
 * en tu hoja). Debajo, Jugador · Juego 4 · Leer foto (verificar con la foto del marcador: ScanSheet) y «Escribir los
 * puntajes a mano»: una casilla por juego para escribir de corrido, verificar y quitar jugadores.
 * El anotador del torneo solo anota: no agrega ni quita jugadores. `readOnly` (la Planilla de Pro de quien no organiza
 * ni anota): solo mirar, sin herramientas; tu juego a medias sigue en tu hoja. Va dentro de LeagueScope.
 */
export function EventSheet({
  event,
  entries,
  players,
  subs = NO_SUBS,
  live = NO_LIVE,
  readOnly = false,
  onOpen,
}: {
  event: BowlingEvent;
  entries: Entry[];
  players: Player[];
  subs?: readonly Submission[];
  live?: readonly LiveScore[];
  /** Solo mirar (quien no organiza ni anota este evento). */
  readOnly?: boolean;
  /** Tocar el nombre de quien ya tiene juegos abre su juego (el detalle), como `onOpen` de GamesTab en la web. */
  onOpen?: (entry: Entry) => void;
}) {
  const c = useColors();
  const { lid, league, isAdmin, myPlayerId } = useLeagueCtx();
  const [quick, setQuick] = useState(false);
  const [adding, setAdding] = useState(false);
  const [photo, setPhoto] = useState<{ entry: Entry; game: number; photoId: string } | null>(null);
  const requirePhoto = league.requirePhoto !== false;
  const busy = useBusy();
  // Aparte: quitar la verificación no espera (ni detiene) a quitar un jugador o agregar un juego.
  const unverifying = useBusy();
  const [addingConfirmed, setAddingConfirmed] = useState(false);
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (e: Entry) => byId.get(e.playerId)?.name ?? '(jugador borrado)';
  const isTorneo = event.type === 'torneo';
  const empty = emptySheetText(isAdmin, isTorneo);
  // Verificar con la foto del marcador: la hoja (undefined = cerrada; un jugador = desde su fila).
  const [scanFor, setScanFor] = useState<string | null | undefined>(undefined);

  // En la grilla se ven también los borradores (vista previa).
  const lines = entries.map((e) => entryLine(e, event, true)).sort((a, b) => nameOf(a.entry).localeCompare(nameOf(b.entry)));
  const pending = lines.reduce((n, l) => n + l.pending, 0);
  // Confirmados con «Voy» que todavía no están anotados como asistentes.
  const missing = missingConfirmed(event, entries, new Set(byId.keys()));
  const groups = sheetGroups(event, lines);

  async function addConfirmed() {
    setAddingConfirmed(true);
    const chosen = missing.map((id) => byId.get(id)!);
    await runAction(async () => {
      const avgs = await fetchEffectiveAverages(lid, chosen, { date: event.date, eventId: event.id });
      await addEntries(lid, event, chosen.map((p) => ({ id: p.id, average: avgs.get(p.id) ?? 0 })));
    }, `${chosen.length} agregados`);
    setAddingConfirmed(false);
  }

  function setScore(entry: Entry, game: number, value: number | null) {
    void runAction(async () => {
      await saveGame(lid, event, entry, game, { score: value, frames: null }, requirePhoto);
      // Lo que quedó a medias en la hoja de ese juego ya no vale: manda lo que se escribió en la casilla.
      clearGameDraft(tableGameKey(getUserId(), lid, event.id, entry.id, game));
    });
  }

  async function unverify() {
    if (!photo) return;
    const ok = await confirmAsync({
      title: 'Quitar verificación',
      message: requirePhoto
        ? 'El juego vuelve a borrador y deja de contar hasta que se verifique con otra foto.'
        : 'Se quita la foto; el juego sigue contando como anotado sin foto.',
      confirmText: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    const photos = slots(photo.entry.photos, event.games, null);
    photos[photo.game] = requirePhoto ? null : NO_PHOTO;
    // La foto sigue abierta (con la ruedita en «Quitar verificación») hasta que se guarda.
    await unverifying.run('quitar', () => runAction(() => updateEntry(lid, photo.entry.id, { photos })));
    setPhoto(null);
  }

  async function remove(entry: Entry) {
    const ok = await confirmAsync(removeEntryConfirm(nameOf(entry)));
    if (ok) await busy.run(`x:${entry.id}`, () => runAction(() => removeEntry(lid, entry)));
  }

  // En la práctica «Otro juego» va por la cola y se ve de una; en el torneo espera al servidor (con la ruedita).
  const gameQueued = !event.type || event.type === 'practica';
  function addGame() {
    const add = () => runAction(() => addEventGame(lid, event), `Juego ${event.games + 1} agregado`);
    void (gameQueued ? add() : busy.run('juego', add));
  }

  // ---------- La Planilla ----------
  // Lo que quedó a medias en la hoja de anotar de este teléfono: el tuyo en «Tus juegos» y el de cada fila aquí.
  useMemoryTick();
  const uid = getUserId();
  const myPlace = myPlayerId ? myGamesPlace(uid, lid, myPlayerId, event.id) : null;
  const myHalf = (game: number) => (myPlace ? partialGame(readGameDraft(gameKey(myPlace, game))) : null);
  const partialOf: PartialOf = (playerId, entry, game) =>
    (playerId === myPlayerId ? myHalf(game) : null) ?? (entry ? partialGame(readGameDraft(tableGameKey(uid, lid, event.id, entry.id, game))) : null);
  const board = boardRows(event, entries, subs, live, { partial: partialOf, all: true });
  const boardGroups: { key: string; title: string | null; rows: BoardRow[]; lines: Line[] }[] = isTorneo
    ? groups.map((g) => ({ ...g, rows: board.filter((r) => g.lines.some((l) => l.entry.id === r.entry?.id)) }))
    : [{ key: '_all', title: null, rows: board, lines }];
  const shown = Math.max(event.games, ...board.map((r) => r.cells.length));
  // Hasta 4 juegos caben en un teléfono; con más, la tabla se desliza de lado.
  const wide = shown > 4;

  /** Tocar una casilla: tu juego a medias sigue en tu hoja; lo demás, la hoja de anotar de esa fila y ese juego. */
  function openCell(r: BoardRow, game: number) {
    if (r.playerId === myPlayerId && myPlace && readGameDraft(gameKey(myPlace, game))) return openScore(lid, event.id, game);
    if (!r.entry || readOnly) return;
    openScore(lid, event.id, Math.min(game, event.games - 1), r.entry.id);
  }

  const tools: { key: string; icon: LucideIcon; label: string; onPress: () => void; busy?: boolean; disabled?: boolean; aria?: string }[] = [
    ...(!isTorneo && isAdmin ? [{ key: 'jugador', icon: UserPlus, label: 'Jugador', aria: 'Agregar asistentes', onPress: () => setAdding(true) }] : []),
    ...(isAdmin && event.games < 10
      ? [{ key: 'juego', icon: Plus, label: `Juego ${event.games + 1}`, aria: `Agregar el juego ${event.games + 1}`, onPress: addGame, busy: busy.isBusy('juego') }]
      : []),
    {
      key: 'foto',
      icon: ScanLine,
      label: 'Leer foto',
      aria: requirePhoto ? 'Leer y verificar con la foto del marcador' : 'Leer la foto del marcador',
      onPress: () => setScanFor(null),
      disabled: !players.length,
    },
  ];

  // Confirmaron «Voy» y todavía no están en la planilla: una fila para agregarlos (solo si falta alguno).
  const confirmedNotice = !readOnly && !isTorneo && isAdmin && missing.length > 0 && (
    <View style={[styles.notice, { borderColor: c.line }]}>
      <CalendarCheck size={20} color={c.accent} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={{ fontSize: 15, fontFamily: font.semibold }}>{confirmedText(missing.length)}</Txt>
        <Txt numberOfLines={1} tone="muted" style={{ fontSize: 13 }}>
          {missing.map((id) => byId.get(id)!.name).join(', ')}
        </Txt>
      </View>
      <Button variant="soft" icon={<UserPlus size={16} color={c.accent} />} loading={addingConfirmed} onPress={() => void addConfirmed()}>
        Agregar
      </Button>
    </View>
  );

  const nameW = wide ? 84 : undefined;
  const cellW = wide ? 46 : undefined;
  const grid = (rows: ReactNode) =>
    wide ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ minWidth: '100%' }}>{rows}</View>
      </ScrollView>
    ) : (
      rows
    );

  const sheetView = (
    <View style={{ gap: 12 }}>
      {board.length === 0 ? (
        <Empty icon={<Users size={32} color={c.accent} />} title={empty.title} text={empty.text} />
      ) : (
        boardGroups.map((g) => (
          <Card key={g.key} padded={false} style={{ paddingTop: 4, paddingBottom: 6 }}>
            {g.title && (
              <View style={[styles.groupHead, { borderBottomColor: c.line }]}>
                <Txt numberOfLines={1} style={{ flex: 1, fontSize: 14, fontFamily: font.semibold }}>
                  {g.title}
                </Txt>
                <TeamTotal total={groupTotal(event, g.lines)} />
              </View>
            )}
            {grid(
              <>
                <View style={styles.gridRow}>
                  <Txt style={[styles.head, { color: c.muted }, nameW ? { width: nameW } : { flex: 1.7 }]}>Jugador</Txt>
                  {Array.from({ length: shown }, (_, i) => (
                    <Txt key={i} style={[styles.head, { color: c.muted, textAlign: 'center' }, cellW ? { width: cellW } : { flex: 1 }]}>
                      {`J${i + 1}`}
                    </Txt>
                  ))}
                  <Txt style={[styles.head, { color: c.muted, textAlign: 'right' }, wide ? { width: 48 } : { flex: 0.9 }]}>Total</Txt>
                </View>
                {g.rows.map((r, i) => {
                  const me = r.playerId === myPlayerId;
                  const name = byId.get(r.playerId)?.name ?? '(jugador borrado)';
                  const line = isTorneo && r.entry ? g.lines.find((l) => l.entry.id === r.entry!.id) : undefined;
                  return (
                    <View key={r.playerId} style={[styles.gridRow, { minHeight: 50, backgroundColor: me ? c.accentSoft : 'transparent' }, i > 0 && !me ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
                      <Pressable
                        accessibilityRole={onOpen && r.entry ? 'button' : undefined}
                        accessibilityLabel={onOpen && r.entry ? `Ver el juego de ${name}` : undefined}
                        disabled={!onOpen || !r.entry}
                        onPress={onOpen && r.entry ? () => onOpen(r.entry!) : undefined}
                        style={({ pressed }) => [nameW ? { width: nameW } : { flex: 1.7, minWidth: 0 }, { opacity: pressed ? 0.7 : 1 }]}
                      >
                        <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold }}>
                          {shortName(name)}
                        </Txt>
                        {me && <Txt style={{ fontSize: 12, fontFamily: font.semibold, color: c.accent }}>Tú</Txt>}
                        {!!line && <Txt style={{ fontSize: 12, color: c.muted, fontVariant: ['tabular-nums'] }}>{`hcp ${line.hcp}`}</Txt>}
                      </Pressable>
                      {Array.from({ length: shown }, (_, k) => {
                        const cell = r.cells[k] ?? EMPTY_CELL;
                        const can = (!!r.entry && !readOnly) || (me && !!cell.partial);
                        return (
                          <View key={k} style={cellW ? { width: cellW } : { flex: 1 }}>
                            <SheetCell cell={cell} me={me} label={`${name}, juego ${k + 1}`} onPress={can ? () => openCell(r, k) : undefined} />
                          </View>
                        );
                      })}
                      <Txt style={[{ textAlign: 'right', fontSize: 18, fontFamily: font.semibold, fontVariant: ['tabular-nums'], color: r.counted ? c.fg : c.faint }, wide ? { width: 48 } : { flex: 0.9 }]}>
                        {r.counted ? String(r.total) : '–'}
                      </Txt>
                    </View>
                  );
                })}
              </>,
            )}
          </Card>
        ))
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginHorizontal: 4 }}>
        <View style={styles.legend}>
          <View style={[styles.swatch, { backgroundColor: c.warnSoft, borderColor: c.warn }]} />
          <Txt variant="small" tone="muted">
            Por aprobar (aún no suma)
          </Txt>
        </View>
        <View style={styles.legend}>
          <View style={[styles.swatch, { borderColor: c.accent }]} />
          <Txt variant="small" tone="muted">
            Jugando
          </Txt>
        </View>
      </View>

      {!readOnly && (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {tools.map((t) => {
              const Icon = t.icon;
              return (
                <View key={t.key} style={{ flex: 1 }}>
                  <Button full accessibilityLabel={t.aria} icon={<Icon size={16} color={c.fg} />} loading={t.busy} disabled={t.disabled} onPress={t.onPress}>
                    {t.label}
                  </Button>
                </View>
              );
            })}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setQuick(true)} style={styles.quiet}>
            <Keyboard size={18} color={c.fg2} />
            <Txt tone="fg2" style={{ fontFamily: font.medium }}>
              Escribir los puntajes a mano
            </Txt>
          </Pressable>
        </>
      )}
    </View>
  );

  const quickView = (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Txt variant="section">Escribir a mano</Txt>
        <Pressable accessibilityRole="button" onPress={() => setQuick(false)} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
          <ChevronLeft size={18} color={c.accent} />
          <Txt tone="accent" style={{ fontFamily: font.medium }}>
            Ver la planilla
          </Txt>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button icon={<ScanLine size={16} color={c.fg} />} onPress={() => setScanFor(null)} disabled={!players.length}>
          {requirePhoto ? 'Verificar con foto' : 'Leer foto'}
        </Button>
        {isAdmin && event.games < 10 && (
          <Button icon={<Plus size={16} color={c.fg} />} loading={busy.isBusy('juego')} onPress={addGame}>
            Otro juego
          </Button>
        )}
        {!isTorneo && isAdmin && (
          <Button icon={<UserPlus size={16} color={c.fg} />} onPress={() => setAdding(true)}>
            Agregar asistentes
          </Button>
        )}
        {requirePhoto && pending > 0 && <Badge tone="warn">{`${pending} ${pending === 1 ? 'juego sin foto' : 'juegos sin foto'}`}</Badge>}
      </View>

      {entries.length === 0 ? (
        <Empty icon={<Users size={32} color={c.accent} />} title={empty.title} text={empty.text} />
      ) : (
        groups.map((g) => (
          <Card key={g.key} padded={false}>
            {g.title && (
              <View style={[styles.groupHead, { borderBottomColor: c.line, backgroundColor: c.surface2 }]}>
                <Txt numberOfLines={1} style={{ flex: 1, fontSize: 14, fontFamily: font.semibold }}>
                  {g.title}
                </Txt>
                <TeamTotal total={groupTotal(event, g.lines)} />
              </View>
            )}
            {g.lines.map((l, li) => {
              const name = nameOf(l.entry);
              const photos = slots(l.entry.photos, event.games, null);
              const firstOpen = Math.max(0, l.scores.findIndex((s) => s == null));
              const removing = busy.isBusy(`x:${l.entry.id}`);
              return (
                <View key={l.entry.id} style={[styles.quickRow, li ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Txt numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.medium }}>
                      {name}
                    </Txt>
                    {isTorneo && <Txt variant="small" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{`hcp ${l.hcp}`}</Txt>}
                    <View style={{ flex: 1 }} />
                    {!isTorneo && isAdmin && (
                      <Button variant="ghost" accessibilityLabel={`Quitar a ${name}`} icon={<X size={16} color={c.muted} />} loading={removing} disabled={busy.isBusy()} onPress={() => void remove(l.entry)} />
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                      {l.scores.map((s, i) => (
                        <View key={i} style={{ flex: 1, minWidth: 0 }}>
                          <ScoreBox
                            label={`${name} juego ${i + 1}`}
                            value={s}
                            verified={isRealPhoto(photos[i])}
                            counted={photos[i] === NO_PHOTO}
                            onCommit={(v) => setScore(l.entry, i, v)}
                            onOpenPhoto={() => setPhoto({ entry: l.entry, game: i, photoId: photos[i]! })}
                          />
                        </View>
                      ))}
                    </View>
                    <View style={{ width: 56, alignItems: 'flex-end' }}>
                      <Txt style={{ fontFamily: font.semibold, fontVariant: ['tabular-nums'] }}>{l.total ? String(l.total) : '—'}</Txt>
                      {requirePhoto && l.pending > 0 && <Txt style={{ fontSize: 10, color: c.warn }}>vista previa</Txt>}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4 }}>
                    <Button
                      variant="ghost"
                      accessibilityLabel={`Anotar juegos de ${name} (pines, teclado o total)`}
                      icon={<Grid3x3 size={16} color={l.entry.frames && Object.keys(l.entry.frames).length ? c.accent : c.muted} />}
                      onPress={() => openScore(lid, event.id, firstOpen, l.entry.id)}
                    />
                    <Button
                      variant="ghost"
                      accessibilityLabel={`Verificar juegos de ${name} con foto`}
                      icon={requirePhoto && l.pending > 0 ? <Camera size={16} color={c.warn} /> : <CheckCircle2 size={16} color={c.muted} />}
                      onPress={() => setScanFor(l.entry.playerId)}
                    />
                  </View>
                </View>
              );
            })}
          </Card>
        ))
      )}

      <View style={{ gap: 4 }}>
        {requirePhoto ? (
          <>
            <View style={styles.legend}>
              <View style={[styles.swatch, { borderColor: c.warn, borderStyle: 'dashed', borderWidth: 1 }]} />
              <Txt variant="small" tone="muted">
                Borrador sin foto: no cuenta
              </Txt>
            </View>
            <View style={styles.legend}>
              <CheckCircle2 size={12} color={c.ok} />
              <Txt variant="small" tone="muted">
                Verificado con foto
              </Txt>
            </View>
          </>
        ) : (
          <Txt variant="small" tone="muted">
            Esta liga no exige foto: lo que anotas cuenta de una.
          </Txt>
        )}
        <View style={styles.legend}>
          <Grid3x3 size={12} color={c.muted} />
          <Txt variant="small" tone="muted">
            Anotar con pines, teclado o total
          </Txt>
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ gap: 12 }}>
      {confirmedNotice}
      {quick && !readOnly ? quickView : sheetView}
      {/* Se monta al abrirse: empieza sin foto. */}
      {scanFor !== undefined && <ScanSheet event={event} entries={entries} players={players} focusPlayerId={scanFor} onClose={() => setScanFor(undefined)} />}
      {adding && !isTorneo && isAdmin && <AddPlayersSheet event={event} entries={entries} players={players} onClose={() => setAdding(false)} />}
      <PhotoWithUnverify
        lid={lid}
        photo={photo ? { id: photo.photoId, title: `${nameOf(photo.entry)} · Juego ${photo.game + 1}` } : null}
        onClose={() => setPhoto(null)}
        busy={unverifying.isBusy()}
        onUnverify={() => void unverify()}
      />
    </View>
  );
}

function TeamTotal({ total }: { total: { main: number; hcp: number | null } }) {
  return (
    <Txt variant="small" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
      {groupTotalText(total)}
    </Txt>
  );
}

/**
 * Una casilla de la Planilla (38 px de alto): lo que cuenta en gris (en tu fila, en blanco), «Por aprobar» en ámbar,
 * «Jugando» con el contorno del deporte («74…» a medias) o vacía con contorno.
 */
function SheetCell({ cell, me, label, onPress }: { cell: BoardCell; me: boolean; label: string; onPress?: () => void }) {
  const c = useColors();
  const look =
    cell.kind === 'ok'
      ? { backgroundColor: me ? c.surface : c.surface2, borderColor: 'transparent', color: c.fg }
      : cell.kind === 'pend'
        ? { backgroundColor: c.warnSoft, borderColor: c.warn, color: c.warn }
        : cell.kind === 'play'
          ? { backgroundColor: 'transparent', borderColor: c.accent, color: c.accent }
          : { backgroundColor: 'transparent', borderColor: c.line, color: c.fg };
  const spoken = `${label}: ${cellSpoken(cell)}`;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={spoken}
      disabled={!onPress}
      onPress={onPress}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [styles.cell, { backgroundColor: look.backgroundColor, borderColor: look.borderColor, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
    >
      <Txt style={{ fontSize: cell.kind === 'play' ? 15 : 16, fontFamily: font.semibold, fontVariant: ['tabular-nums'], color: look.color }}>{cellText(cell)}</Txt>
    </Pressable>
  );
}

/**
 * La casilla de pinos de un juego en «Escribir a mano» (ScoreInput de la web): guarda al salir (o con «siguiente»).
 * Verificado con foto: bloqueada, con la marca, y abre la foto. `counted` (liga sin foto obligatoria): cuenta tal cual.
 * Si no: borrador (contorno punteado) hasta verificarlo.
 */
function ScoreBox({
  label,
  value,
  verified,
  counted,
  onCommit,
  onOpenPhoto,
}: {
  label: string;
  value: number | null;
  verified: boolean;
  counted: boolean;
  onCommit: (v: number | null) => void;
  onOpenPhoto: () => void;
}) {
  const c = useColors();
  // Lo que se escribe mientras la casilla está abierta (null = se ve lo guardado).
  const [draft, setDraft] = useState<string | null>(null);
  if (verified) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}, verificado`} onPress={onOpenPhoto} style={[styles.box, { borderColor: c.ok, backgroundColor: c.okSoft }]}>
        <Txt style={{ fontFamily: font.semibold, color: c.ok, fontVariant: ['tabular-nums'] }}>{String(value)}</Txt>
        <CheckCircle2 size={12} color={c.ok} style={{ position: 'absolute', top: 3, right: 3 }} />
      </Pressable>
    );
  }
  const shown = draft ?? (value == null ? '' : String(value));
  const n = shown.trim() === '' ? null : Number(shown);
  const invalid = n != null && !isValidScore(n);
  const draftStyle = value != null && !counted;

  function commit() {
    const raw = draft;
    setDraft(null);
    if (raw == null) return;
    const typed = raw.trim() === '' ? null : Number(raw);
    if (typed != null && !isValidScore(typed)) return;
    if (typed !== value) onCommit(typed);
  }

  return (
    <View>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        maxLength={3}
        value={shown}
        selectTextOnFocus
        returnKeyType="next"
        onFocus={() => setDraft(value == null ? '' : String(value))}
        onChangeText={(t) => setDraft(t.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onSubmitEditing={commit}
        style={[
          styles.box,
          {
            color: invalid ? c.danger : c.fg,
            backgroundColor: c.surface,
            borderColor: invalid ? c.danger : draftStyle ? c.warn : c.line,
            borderStyle: draftStyle && !invalid ? 'dashed' : 'solid',
            fontFamily: value != null ? font.semibold : font.medium,
          },
        ]}
      />
      {draftStyle && draft == null && <Camera size={12} color={c.warn} style={{ position: 'absolute', top: 3, right: 3 }} accessibilityLabel="Falta foto" />}
    </View>
  );
}

/** La foto del juego verificado en grande (PhotoModal de la web) con «Quitar verificación». */
function PhotoWithUnverify({
  lid,
  photo,
  onClose,
  busy,
  onUnverify,
}: {
  lid: string;
  photo: { id: string; title: string } | null;
  onClose: () => void;
  busy: boolean;
  onUnverify: () => void;
}) {
  const c = useColors();
  const data = usePhoto(lid, photo?.id ?? null);
  const img = data.data;
  return (
    <Sheet
      open={photo != null}
      onClose={onClose}
      title={photo?.title ?? 'Foto'}
      footer={
        <Button variant="ghost" loading={busy} onPress={onUnverify}>
          <Txt style={{ color: c.danger, fontFamily: font.semibold }}>Quitar verificación</Txt>
        </Button>
      }
    >
      {img ? (
        <Image
          source={{ uri: img.url }}
          accessibilityLabel={photo?.title ?? 'Foto del marcador'}
          style={{ width: '100%', aspectRatio: img.width && img.height ? img.width / img.height : 3 / 4, borderRadius: 12 }}
          contentFit="contain"
        />
      ) : data.loading ? (
        <Loading />
      ) : (
        <Txt tone="muted">{data.error ? 'No se pudo cargar la foto. Revisa tu conexión e intenta de nuevo.' : 'La foto ya no existe.'}</Txt>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, paddingVertical: 10, paddingLeft: 16, paddingRight: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 10 },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 16, paddingRight: 14, paddingVertical: 5 },
  head: { fontSize: 12, fontFamily: font.semibold, letterSpacing: 0.6, textTransform: 'uppercase' },
  cell: { height: 38, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4, borderWidth: 1.5 },
  quiet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, alignSelf: 'center', paddingHorizontal: 8 },
  quickRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  box: { height: 40, borderRadius: 10, borderWidth: 1, textAlign: 'center', fontSize: 16, alignItems: 'center', justifyContent: 'center' },
});
