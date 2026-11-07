import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AlertTriangle, Grid3x3, ImageOff, Sparkles } from 'lucide-react-native';
import { fetchEffectiveAverages } from '@mm/lib/data/players';
import { practiceForDate } from '@mm/lib/data/events';
import { approveSubmission, rejectSubmission } from '@mm/lib/data/submissions';
import { useLeagueCtx } from '@mm/lib/league';
import { usePhoto } from '@mm/lib/photos';
import type { BowlingEvent, Entry, Player, Submission } from '@mm/lib/types';
import { shortName } from '@mm/components/organizer/hubLogic';
import {
  approvalDraft,
  approveLabel,
  approvedText,
  defaultStart,
  eventLine,
  gameRows,
  gamesLine,
  isGone,
  isReady,
  isUnverified,
  notInEventText,
  proposalOf,
  readDiffers,
  sentText,
  tableRows,
  targetGames,
  whereText,
} from '@mm/pages/approvals';
import { FramesSheet } from '@/components/bowling/FramesSheet';
import { useBusy } from '@/components/bowlingTeams/parts';
import { toast } from '@/components/feedback';
import { PickField } from '@/components/players/fields';
import { Badge, Button, Field, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { PhotoReading } from './PhotoReading';
import { PhotoThumb, PhotoZoom, RejectSheet, RowButton, act } from './parts';

/** Lo que «Aprobar todo» necesita de cada envío: si está listo y cómo se aprueba (con lo que tiene puesto ahora). */
export interface Approver {
  ready: boolean;
  games: number;
  approve: () => Promise<boolean>;
}

/**
 * Un envío en Organizar › Aprobar juegos (SubmissionRow de la web, con su lógica: src/pages/approvals.ts): su foto,
 * quién, de qué evento (si hay de más de uno), «Juego 2 · 181», Rechazar y Aprobar. Al tocarlo se abre la foto, lo que
 * leyó la IA, los cuadros y los juegos para corregir antes de aprobar (y desde qué juego se guardan). Se anota en
 * «Aprobar todo» con `register` (lo que tiene puesto ahora) y espera mientras corre (`running`).
 */
export function SubmissionRow({
  sub,
  event,
  events,
  showEvent,
  player,
  entry,
  running,
  register,
  first,
}: {
  sub: Submission;
  event?: BowlingEvent;
  events: BowlingEvent[];
  showEvent: boolean;
  player?: Player;
  entry: Entry | null;
  running: boolean;
  register: (id: string, get: () => Approver) => () => void;
  /** El primero de la lista (sin raya arriba). */
  first: boolean;
}) {
  const c = useColors();
  const { lid, league, myPlayerId } = useLeagueCtx();
  const photo = usePhoto(lid, sub.photoId);
  // La liga exige foto pero el jugador lo envió sin ella: el admin decide si lo acepta.
  const unverified = isUnverified(sub, league);
  const [open, setOpen] = useState(false);
  const [showFrames, setShowFrames] = useState(false);
  const busy = useBusy<'aprobar' | 'rechazar' | 'descartar'>();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  // Juegos por posición (J1, J2...); se propone lo leído por la IA y, si no hay, lo anotado.
  const rows = gameRows(sub);
  const count = rows.length;
  // Juegos del evento destino (una práctica nueva por fecha tiene al menos 3, o los que subió).
  const games = targetGames(event, count);
  const proposal = proposalOf(rows);
  const firstSlot = defaultStart(sub, entry, games, count);
  const [values, setValues] = useState<string[]>(proposal);
  const [start, setStart] = useState(firstSlot);
  // La foto se lee en segundo plano, así que lo leído puede llegar con el envío abierto. Si lo pidió el admin (Leer
  // con IA) y no tocó nada, se propone solo; si llegó del teléfono del jugador, no se cambia lo que el admin está
  // revisando: se marca y se ofrece «Usar lo leído».
  const [edited, setEdited] = useState(false);
  const [proposeRead, setProposeRead] = useState(false);
  const [lateRead, setLateRead] = useState(false);
  // Lo que se vio la última vez: otro evento (o se inscribió) vuelve a proponer; otra lectura, lo de arriba.
  const resetKey = `${sub.id}|${event?.id ?? ''}|${entry == null}`;
  const scannedKey = JSON.stringify(sub.scanned ?? null);
  const [seen, setSeen] = useState({ resetKey, scannedKey });
  if (seen.resetKey !== resetKey || seen.scannedKey !== scannedKey) {
    setSeen({ resetKey, scannedKey });
    if (seen.resetKey !== resetKey) {
      setValues(proposal);
      setStart(firstSlot);
    }
    if (seen.scannedKey !== scannedKey) {
      if (proposeRead) {
        setProposeRead(false);
        if (!edited) setValues(proposal);
      } else if (sub.scanned != null) {
        setLateRead(true);
      }
    }
  }
  const differs = readDiffers(lateRead, proposal, values);

  const gone = isGone(sub, event, player);
  const draft = approvalDraft(values, start, games);
  const locked = busy.isBusy() || running;

  async function approve(silent = false): Promise<boolean> {
    if (!player) return false;
    const ok = await busy.run('aprobar', () =>
      act(async () => {
        const target = event ?? (await practiceForDate(lid, events, sub.date ?? '', count));
        const average = entry ? entry.average : ((await fetchEffectiveAverages(lid, [player], { date: target.date, eventId: target.id || null })).get(player.id) ?? 0);
        await approveSubmission(lid, sub, target, entry, average, draft.values, start);
        return true;
      }),
    );
    if (ok && !silent) toast(approvedText(draft.toSave, player.name));
    return !!ok;
  }

  // «Aprobar todo» toma lo que este envío tiene puesto ahora (se pone al día después de cada dibujo). Sin foto (cuando
  // la liga la exige) o con algo mal escrito, se queda para revisarlo uno por uno.
  const approver: Approver = { ready: isReady({ gone, invalid: draft.invalid, toSave: draft.toSave, unverified }), games: draft.toSave, approve: () => approve(true) };
  const latest = useRef<Approver>({ ready: false, games: 0, approve: async () => false });
  useEffect(() => {
    latest.current = approver;
  });
  useEffect(() => register(sub.id, () => latest.current), [register, sub.id]);

  async function reject() {
    // La hoja se cierra y la ruedita sale en «Rechazar» del envío.
    setRejecting(false);
    await busy.run('rechazar', () => act(() => rejectSubmission(lid, sub, note.trim() || null), 'Envío rechazado'));
  }

  const line = first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line };

  if (gone || !player) {
    return (
      <View style={[styles.gone, line]}>
        <Txt variant="meta" tone="muted" style={{ flex: 1 }}>
          Envío de un jugador o evento que ya no existe.
        </Txt>
        <Button
          variant="secondary"
          loading={busy.isBusy('descartar')}
          disabled={locked}
          onPress={() => void busy.run('descartar', () => act(() => rejectSubmission(lid, sub, 'Evento o jugador eliminado')))}
        >
          Descartar
        </Button>
      </View>
    );
  }

  const strong = { fontFamily: font.semibold, color: c.fg } as const;

  return (
    <View style={[styles.wrap, line]}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${player.name}: ${open ? 'cerrar' : 'ver la foto y los juegos'}`}
          onPress={() => setOpen((o) => !o)}
          style={({ pressed }) => [styles.who, { opacity: pressed ? 0.7 : 1 }]}
        >
          <PhotoThumb lid={lid} photoId={sub.photoId} warn={unverified} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Txt numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontFamily: font.semibold }}>
                {shortName(player.name)}
              </Txt>
              {/* El dueño y los admins también juegan: sus propios envíos se aprueban aquí igual. */}
              {sub.playerId === myPlayerId && <Badge tone="accent">Tú</Badge>}
            </View>
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 13, marginTop: 1 }}>
              {unverified && <Text style={{ color: c.warn, fontFamily: font.medium }}>Sin foto · </Text>}
              {showEvent && `${eventLine(event, sub.date)} · `}
              <GamesLine values={values} start={start} strong={strong} />
            </Txt>
          </View>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <RowButton over label={`Rechazar el envío de ${player.name}`} busy={busy.isBusy('rechazar')} disabled={locked} onPress={() => setRejecting(true)}>
            Rechazar
          </RowButton>
          <RowButton
            over
            accent
            label={approveLabel(draft.toSave, player.name)}
            busy={busy.isBusy('aprobar')}
            disabled={draft.invalid || !draft.toSave || locked}
            onPress={() => void approve()}
          >
            Aprobar
          </RowButton>
        </View>
      </View>

      {open && (
        <View style={{ gap: 16, paddingTop: 12, paddingBottom: 8 }}>
          {unverified ? (
            <View style={[styles.notice, { backgroundColor: c.warnSoft }]}>
              <AlertTriangle size={24} color={c.warn} />
              <Txt variant="bodyStrong" tone="warn" style={{ textAlign: 'center', fontSize: 14 }}>
                Enviado sin foto del marcador
              </Txt>
              <Txt variant="small" tone="warn" style={{ textAlign: 'center', fontFamily: font.regular }}>
                Esta liga exige foto. Apruébalo solo si confías en los juegos; si no, recházalo y pídele la foto.
              </Txt>
            </View>
          ) : !sub.photoId ? (
            <View style={[styles.blank, { backgroundColor: c.surface2 }]}>
              <ImageOff size={24} color={c.muted} />
              <Txt variant="meta" tone="muted">
                Sin foto (la liga no la exige)
              </Txt>
            </View>
          ) : photo.data ? (
            <PhotoZoom uri={photo.data.url} width={photo.data.width} height={photo.data.height} />
          ) : photo.loading ? (
            <View accessibilityLabel="Cargando la foto" style={[styles.skeleton, { backgroundColor: c.surface2 }]} />
          ) : (
            <View style={[styles.blank, { backgroundColor: c.surface2 }]}>
              <ImageOff size={24} color={c.muted} />
              <Txt variant="meta" tone="muted">
                {photo.error ? 'No se pudo cargar la foto (¿sin señal?)' : 'La foto ya no existe'}
              </Txt>
            </View>
          )}

          <View style={{ gap: 12 }}>
            <Txt variant="meta" tone="muted">
              {whereText(event, sub.date)}
              {sub.createdAt ? sentText(sub.createdAt.toMillis()) : ''}
            </Txt>
            {!!sub.photoId && <PhotoReading sub={sub} player={player} photoUrl={photo.data?.url ?? null} onApply={() => setProposeRead(true)} />}
            {!!sub.scannedName && (
              <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
                La IA tomó la fila <Text style={strong}>{sub.scannedName}</Text> de la foto.
              </Txt>
            )}
            {differs && (
              <View style={[styles.differs, { backgroundColor: c.accentSoft }]}>
                <Sparkles size={16} color={c.accent} />
                <Txt variant="meta" tone="accent" style={{ flex: 1 }}>
                  Llegó lo que leyó la IA y no coincide con lo que se va a guardar.
                </Txt>
                <Button
                  variant="secondary"
                  onPress={() => {
                    setEdited(false);
                    setLateRead(false);
                    setValues(proposal);
                  }}
                >
                  Usar lo leído
                </Button>
              </View>
            )}
            {!!sub.frames && Object.keys(sub.frames).length > 0 && (
              <View style={{ gap: 8 }}>
                <Button variant="secondary" icon={<Grid3x3 size={18} color={c.fg} />} onPress={() => setShowFrames((v) => !v)} style={{ alignSelf: 'flex-start' }}>
                  {showFrames ? 'Ocultar cuadros' : 'Ver cuadros que anotó'}
                </Button>
                {showFrames &&
                  Object.entries(sub.frames).map(([k, f]) => (
                    <View key={k} style={{ gap: 4 }}>
                      <Txt variant="small" tone="muted">{`J${+k + 1}`}</Txt>
                      <FramesSheet rolls={f.rolls} current={null} />
                    </View>
                  ))}
              </View>
            )}

            <View>
              <View style={styles.tr}>
                <Txt variant="small" tone="muted" style={styles.slotCol}>
                  Juego
                </Txt>
                <Txt variant="small" tone="muted" style={styles.numCol}>
                  Anotó
                </Txt>
                <Txt variant="small" tone="muted" style={styles.numCol}>
                  Leyó la IA
                </Txt>
                <Txt variant="small" tone="muted" style={styles.inputHead}>
                  Se guarda
                </Txt>
              </View>
              {tableRows(rows, start, games, entry).map((r, k) => (
                <View key={k} style={[styles.tr, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                  <View style={[styles.slotCol, { flexDirection: 'row', alignItems: 'baseline', gap: 4 }]}>
                    {r.outside ? <Txt variant="meta" tone="danger">fuera</Txt> : <Txt variant="meta">{`J${r.slot + 1}`}</Txt>}
                    {r.replaces && <Txt style={{ fontSize: 10, color: c.muted }}>(reemplaza)</Txt>}
                  </View>
                  <Txt variant="meta" style={[styles.numCol, styles.num, r.mismatch && { color: c.warn }]}>
                    {r.typed ?? '—'}
                  </Txt>
                  <Txt variant="meta" style={[styles.numCol, styles.num, r.mismatch && { color: c.warn }]}>
                    {r.scanned ?? '—'}
                  </Txt>
                  <View style={styles.inputCol}>
                    <TextInput
                      keyboardType="number-pad"
                      inputMode="numeric"
                      value={values[k] ?? ''}
                      onChangeText={(t) => {
                        setEdited(true);
                        setValues((vs) => vs.map((x, j) => (j === k ? t : x)));
                      }}
                      accessibilityLabel={`Juego ${r.slot + 1}`}
                      style={[styles.input, { borderColor: c.line, backgroundColor: c.surface, color: c.fg }]}
                    />
                  </View>
                </View>
              ))}
            </View>
            <Field label="Guardar desde el juego">
              <PickField
                label="Guardar desde el juego"
                options={Array.from({ length: games }, (_, i) => ({ key: String(i), label: `Juego ${i + 1}` }))}
                value={String(start)}
                onChange={(k) => setStart(Number(k))}
              />
            </Field>
            {!entry && (
              <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
                {notInEventText(player.name)}
              </Txt>
            )}
          </View>
        </View>
      )}

      <RejectSheet icon open={rejecting} note={note} onNote={setNote} onClose={() => setRejecting(false)} onReject={() => void reject()} />
    </View>
  );
}

/** Cómo quedan los juegos del envío: «Juego 2 · 181» o «J1 187 · J2 210» (el número en negrita). */
function GamesLine({ values, start, strong }: { values: readonly string[]; start: number; strong: { fontFamily: string; color: string } }) {
  const games = gamesLine(values, start);
  if (!games.length) return <>Sin juegos</>;
  if (games.length === 1) {
    return (
      <>
        {`Juego ${games[0].slot} · `}
        <Text style={strong}>{games[0].v}</Text>
      </>
    );
  }
  return (
    <>
      {games.map((g, i) => (
        <Text key={g.slot}>
          {`${i > 0 ? ' · ' : ''}J${g.slot} `}
          <Text style={strong}>{g.v}</Text>
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  who: { flex: 1, minWidth: 0, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10 },
  gone: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 16, paddingRight: 14 },
  notice: { alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 20 },
  blank: { height: 128, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16 },
  skeleton: { height: 192, borderRadius: 16 },
  differs: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 32, gap: 6 },
  slotCol: { flex: 1.1 },
  numCol: { flex: 1, textAlign: 'right' },
  inputHead: { flex: 1.1, textAlign: 'right' },
  inputCol: { flex: 1.1, alignItems: 'flex-end', paddingVertical: 4 },
  num: { fontVariant: ['tabular-nums'] },
  input: { height: 44, width: 64, borderRadius: 12, borderWidth: 1, textAlign: 'center', fontFamily: font.semibold, fontSize: 15 },
});
