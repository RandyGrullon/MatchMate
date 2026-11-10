/**
 * El detalle de los juegos de un jugador en un evento de boliche (GameDetailModal de la web, con su lógica:
 * src/components/event/gameDetail.ts), en una hoja: el puesto, los pinos y el promedio; los strikes, spares y abiertos de
 * lo anotado tiro por tiro; cada juego con si cuenta o le falta la foto, «Récord personal» y «+15 sobre tu promedio»,
 * sus cuadros y «Ver foto»; debajo, lo que pase quien lo abre (me gusta y comentarios). Abajo, «Ver su perfil» y Cerrar.
 *
 * EventGameDetail es el del evento (src/pages/EventPage.tsx): lee los me gusta, los comentarios y lo jugado antes (para las
 * marcas) y pone PostSocial debajo. Lo abren la clasificación (Standings) y «Tus juegos».
 */
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Camera, CheckCircle2, ChevronRight, Image as ImageIcon, TrendingUp, Trophy } from 'lucide-react-native';
import { entryMarks, hasMark, overLabel, type GameMark } from '@mm/lib/bowlingSeason';
import { useBowlingGameContext } from '@mm/lib/data/bowlingContext';
import { useCommentsOfEvents, useReactionsOfEvents } from '@mm/lib/data/social';
import type { BowlingEvent, Entry, Player } from '@mm/lib/types';
import { ONLY_TOTAL_TEXT, gameDetail } from '@mm/components/event/gameDetail';
import { PhotoSheet } from '@/components/approvals/parts';
import { LeagueScope } from '@/components/league/LeagueScope';
import { Badge, Button, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { FramesSheet } from './FramesSheet';
import { GamePostSocial } from './GameSocial';
import { Position } from './Position';

/** Lo que tarda una hoja en irse: lo que se abre después (otra pantalla) espera a que se vaya. */
const SHEET_CLOSE_MS = 400;

/** Cierra la hoja y, cuando ya se fue, hace lo pedido (ir a otra pantalla: la hoja no se queda encima). */
export const closeThen =
  (onClose: () => void) =>
  (go: () => void): void => {
    onClose();
    setTimeout(go, SHEET_CLOSE_MS);
  };

/** Una etiqueta con su ícono (Badge de la web con ícono adentro). */
function IconBadge({ tone, icon, children }: { tone: 'accent' | 'ok' | 'warn'; icon: ReactNode; children: string }) {
  const c = useColors();
  const bg = tone === 'accent' ? c.accentSoft : tone === 'ok' ? c.okSoft : c.warnSoft;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: bg }}>
      {icon}
      <Txt style={{ color: c[tone], fontFamily: font.semibold, fontSize: 12 }}>{children}</Txt>
    </View>
  );
}

/** Las marcas del juego como etiquetas (GameMarkBadges de la web). `mine`: «tu promedio»; si no, «su promedio». */
function GameMarkBadges({ mark, mine = true }: { mark: GameMark | null | undefined; mine?: boolean }) {
  const c = useColors();
  if (!hasMark(mark)) return null;
  return (
    <>
      {mark.record && (
        <IconBadge tone="accent" icon={<Trophy size={12} color={c.accent} />}>
          Récord personal
        </IconBadge>
      )}
      {mark.over != null && (
        <IconBadge tone="ok" icon={<TrendingUp size={12} color={c.ok} />}>
          {overLabel(mark.over, mine)}
        </IconBadge>
      )}
    </>
  );
}

/** Un número de arriba (el puesto, los pinos, el promedio) con su nombre y lo de abajo («de 6»). */
function Summary({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2, borderRadius: 12, backgroundColor: c.surface2, paddingHorizontal: 8, paddingVertical: 10 }}>
      <Txt tone="muted" style={{ fontSize: 11 }}>
        {label}
      </Txt>
      <View style={{ height: 32, alignItems: 'center', justifyContent: 'center' }}>
        {typeof value === 'string' || typeof value === 'number' ? <Txt style={{ fontFamily: font.bold, fontSize: 20, fontVariant: ['tabular-nums'] }}>{String(value)}</Txt> : value}
      </View>
      {!!sub && (
        <Txt tone="muted" style={{ fontSize: 11 }}>
          {sub}
        </Txt>
      )}
    </View>
  );
}

/** Juegos de un jugador en un evento: pinos, cuadros tiro por tiro, strikes/spares y la foto (GameDetailModal de la web). */
export function GameDetailSheet({
  lid,
  event,
  entries,
  entry,
  name,
  onClose,
  marks,
  mine,
  children,
}: {
  lid: string;
  event: BowlingEvent;
  entries: Entry[];
  entry: Entry;
  name: string;
  onClose: () => void;
  /** «Récord personal» y «+15 sobre tu promedio» de cada juego (null mientras no se sabe). */
  marks?: (GameMark | null)[] | null;
  /** El juego es de quien mira («tu promedio»; si no, «su promedio»). */
  mine?: boolean;
  /** Debajo de los juegos (me gusta y comentarios). */
  children?: ReactNode;
}) {
  const c = useColors();
  const [photo, setPhoto] = useState<{ id: string; title: string } | null>(null);
  const detail = gameDetail(event, entries, entry);
  const { line, pos, totals, isTorneo } = detail;
  const leave = closeThen(onClose);

  return (
    <Sheet
      open
      onClose={onClose}
      title={name}
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 }}>
          <Pressable
            accessibilityRole="link"
            hitSlop={4}
            onPress={() => leave(() => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: entry.playerId } }))}
            style={{ marginRight: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: 4 }}
          >
            <Txt tone="accent" style={{ fontFamily: font.medium, fontSize: 14 }}>
              Ver su perfil
            </Txt>
            <ChevronRight size={16} color={c.accent} />
          </Pressable>
          <Button onPress={onClose}>Cerrar</Button>
        </View>
      }
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Summary label={detail.placeLabel} value={pos ? <Position pos={pos.pos} /> : '—'} sub={pos ? `de ${pos.of}` : undefined} />
        <Summary label={detail.pinsLabel} value={detail.pins} />
        <Summary label="Promedio" value={line.avg || '—'} />
      </View>

      {totals && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Badge tone="accent">{`${totals.strikes} strikes`}</Badge>
          <Badge tone="accent">{`${totals.spares} spares`}</Badge>
          <Badge tone="muted">{`${totals.opens} abiertos`}</Badge>
        </View>
      )}

      {detail.games.map(({ score: s, verified, frames, photo: realPhoto }, i) => (
        <View key={i} style={{ gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>{`Juego ${i + 1}`}</Txt>
            {s == null ? (
              <Badge tone="muted">Sin jugar</Badge>
            ) : verified ? (
              <IconBadge tone="ok" icon={<CheckCircle2 size={12} color={c.ok} />}>
                Cuenta
              </IconBadge>
            ) : (
              <IconBadge tone="warn" icon={<Camera size={12} color={c.warn} />}>
                Falta foto
              </IconBadge>
            )}
            {verified && <GameMarkBadges mark={marks?.[i]} mine={mine} />}
            <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Txt style={{ fontFamily: font.bold, fontSize: 24, fontVariant: ['tabular-nums'], color: !verified && s != null ? c.warn : c.fg }}>{s ?? '—'}</Txt>
              {isTorneo && s != null && line.hcp > 0 && (
                <Txt tone="muted" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{`+${line.hcp}`}</Txt>
              )}
            </View>
          </View>
          {frames ? (
            <FramesSheet rolls={frames.rolls} current={null} />
          ) : (
            s != null && (
              <Txt tone="muted" style={{ fontSize: 12 }}>
                {ONLY_TOTAL_TEXT}
              </Txt>
            )
          )}
          {realPhoto && (
            <Button icon={<ImageIcon size={16} color={c.fg} />} onPress={() => setPhoto({ id: realPhoto, title: `${name} · Juego ${i + 1}` })} style={{ alignSelf: 'flex-start' }}>
              Ver foto
            </Button>
          )}
        </View>
      ))}
      {children}
      {/* La foto en grande, encima del detalle (PhotoModal de la web). */}
      <PhotoSheet lid={lid} photo={photo} onClose={() => setPhoto(null)} />
    </Sheet>
  );
}

/**
 * El detalle del juego de alguien en el evento, como lo abre la web (src/pages/EventPage.tsx): con «Récord personal» y
 * «+15 sobre tu promedio» (lo jugado antes de este evento) y, debajo, me gusta, felicitar y comentarios. Va puesto solo
 * mientras está abierto.
 */
export function EventGameDetail({
  lid,
  event,
  entries,
  players,
  entry,
  me,
  onClose,
}: {
  lid: string;
  event: BowlingEvent;
  entries: Entry[];
  players: readonly Player[];
  entry: Entry;
  /** El jugador de la cuenta en la liga (el juego es «tuyo»). */
  me: string | null;
  onClose: () => void;
}) {
  // Me gusta y comentarios de los juegos del evento, y lo jugado antes por cada inscrito (las marcas).
  const reactions = useReactionsOfEvents(lid, [event.id]);
  const comments = useCommentsOfEvents(lid, [event.id]);
  const context = useBowlingGameContext(entries.map((e) => e.id), lid);
  const current = entries.find((e) => e.id === entry.id) ?? entry;
  const name = players.find((p) => p.id === entry.playerId)?.name ?? '(jugador borrado)';
  const mine = entry.playerId === me;
  return (
    <GameDetailSheet lid={lid} event={event} entries={entries} entry={current} name={name} onClose={onClose} marks={entryMarks(current, context.data[entry.id])} mine={mine}>
      {/* PostSocial lee la liga (miembro, admin): aquí puede venir de una hoja sin ella. */}
      <LeagueScope lid={lid}>
        <GamePostSocial
          entry={entry}
          reactions={reactions.data.filter((r) => r.entryId === entry.id)}
          comments={comments.data.filter((cm) => cm.entryId === entry.id)}
          isMine={mine}
          leave={closeThen(onClose)}
        />
      </LeagueScope>
    </GameDetailSheet>
  );
}
