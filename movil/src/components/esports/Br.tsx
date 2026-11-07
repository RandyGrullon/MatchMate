/**
 * Battle royale (br/BrLeaderboard y br/BrGamesList de la web, con su misma lógica): la tabla acumulada (puesto, nombre,
 * victorias, kills, partidas y puntos, con la «i» donde el puesto lo decidió un desempate) y las partidas por jornada
 * (al tocar una, sus puestos y kills con los puntos de cada uno y las capturas). Quien organiza o anota la edita desde
 * ahí («Editar la partida», `onEdit`).
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Crosshair, Pencil } from 'lucide-react-native';
import type { BrGame } from '@mm/lib/data/esports';
import { useLeagueCtx } from '@mm/lib/league';
import { usePhoto } from '@mm/lib/photos';
import { BR_TIEBREAK_TEXT, brPointsOf, type BrRow, type TournamentSettings } from '@mm/sports/esports';
import { BR_GAME_STATUS, brByRound, brGameLine, brGameRows } from '@mm/pages/sports/esports/logic';
import { FinePrint } from './inputs';
import { Button, Card, Empty, ListRow, Loading, RowIcon, SectionHeader, Sheet, Txt } from '../ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export function BrLeaderboard({ rows, nameOf, highlight }: { rows: readonly BrRow[]; nameOf: (entryId: string) => string; highlight?: ReadonlySet<string> }) {
  const c = useColors();
  const [shown, setShown] = useState<string | null>(null);
  if (!rows.length) return <Empty title="Sin tabla todavía" text="Cuando se anote la primera partida, la tabla sale aquí." />;
  const anyPlayed = rows.some((r) => r.played > 0);
  const head = { fontSize: 11, fontFamily: font.bold, letterSpacing: 0.5, color: c.muted } as const;
  return (
    <View style={{ gap: 8 }}>
      <Card padded={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
          <Txt style={[head, { width: 28 }]}>#</Txt>
          <Txt style={[head, { flex: 1 }]}>NOMBRE</Txt>
          <Txt accessibilityLabel="Victorias (1.er puesto)" style={[head, styles.num]}>
            V
          </Txt>
          <Txt accessibilityLabel="Kills" style={[head, styles.num]}>
            K
          </Txt>
          <Txt accessibilityLabel="Partidas jugadas" style={[head, styles.num]}>
            PJ
          </Txt>
          <Txt style={[head, { width: 44, textAlign: 'right' }]}>PTS</Txt>
        </View>
        {rows.map((r) => {
          const me = !!highlight?.has(r.entryId);
          const why = anyPlayed && r.decidedBy ? r.decidedBy : null;
          return (
            <Pressable
              key={r.entryId}
              disabled={!why}
              onPress={() => setShown(shown === r.entryId ? null : r.entryId)}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, backgroundColor: me ? c.accentSoft : 'transparent' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Txt style={{ width: 28, fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{r.rank}</Txt>
                <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.semibold }}>
                  {nameOf(r.entryId)}
                  {why ? <Txt variant="small" tone="muted">{'  ⓘ'}</Txt> : null}
                </Txt>
                <Txt style={[styles.num, { fontSize: 15, color: c.fg2 }]}>{r.wins}</Txt>
                <Txt style={[styles.num, { fontSize: 15, color: c.fg2 }]}>{r.kills}</Txt>
                <Txt style={[styles.num, { fontSize: 15, color: c.fg2 }]}>{r.played}</Txt>
                <Txt style={{ width: 44, textAlign: 'right', fontSize: 18, fontFamily: font.bold }}>{r.points}</Txt>
              </View>
              {why && shown === r.entryId && (
                <Txt variant="small" tone="muted" style={{ marginLeft: 28 }}>
                  Desempate: {why}
                </Txt>
              )}
            </Pressable>
          );
        })}
      </Card>
      <FinePrint>{BR_TIEBREAK_TEXT}</FinePrint>
    </View>
  );
}

export function BrGamesList({ games, settings, nameOf, onEdit }: { games: readonly BrGame[]; settings: TournamentSettings; nameOf: (entryId: string) => string; onEdit?: (g: BrGame) => void }) {
  const c = useColors();
  const [open, setOpen] = useState<BrGame | null>(null);
  if (!games.length) {
    return <Empty icon={<Crosshair size={28} color={c.accent} />} title="Todavía no hay partidas" text="Cuando el organizador anote la primera, sale aquí con los puestos y las kills." />;
  }
  return (
    <View style={{ gap: 26 }}>
      {brByRound(games).map((r) => (
        <View key={r.round} accessibilityLabel={`Jornada ${r.round}`} style={{ gap: 10 }}>
          <SectionHeader title={`Jornada ${r.round}`} />
          <Card padded={false}>
            {r.games.map((g, i) => (
              <View key={g.id} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                <ListRow
                  icon={
                    <RowIcon>
                      <Txt style={{ fontSize: 15, fontFamily: font.bold, color: g.status === 'finished' ? c.accent : c.fg2 }}>{g.gameNo}</Txt>
                    </RowIcon>
                  }
                  title={`Partida ${g.gameNo}`}
                  subtitle={brGameLine(g)}
                  onPress={() => setOpen(g)}
                />
              </View>
            ))}
          </Card>
        </View>
      ))}
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `Jornada ${open.round} · Partida ${open.gameNo}` : ''}
        subtitle={open ? [BR_GAME_STATUS[open.status], open.map].filter(Boolean).join(' · ') : undefined}
        footer={
          open && onEdit ? (
            <Button
              size="lg"
              full
              icon={<Pencil size={16} color={c.fg} />}
              onPress={() => {
                const g = open;
                setOpen(null);
                onEdit(g);
              }}
            >
              Editar la partida
            </Button>
          ) : undefined
        }
      >
        {open && <GameDetail game={open} settings={settings} nameOf={nameOf} />}
      </Sheet>
    </View>
  );
}

/** Los puestos y las kills de una partida, del 1.º para abajo (los que no jugaron al final), con sus puntos. */
function GameDetail({ game, settings, nameOf }: { game: BrGame; settings: TournamentSettings; nameOf: (id: string) => string }) {
  const c = useColors();
  const pts = settings.br ?? { placementPoints: [], killPoints: 1 };
  const rows = brGameRows(game.results);
  return (
    <View style={{ gap: 16 }}>
      {rows.length ? (
        <View>
          {rows.map((r, i) => (
            <View key={r.entryId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.line }}>
              <Txt style={{ width: 28, textAlign: 'center', fontSize: 15, fontFamily: font.semibold, color: c.muted }}>{r.placement ?? '–'}</Txt>
              <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily: font.semibold }}>
                {nameOf(r.entryId)}
              </Txt>
              <Txt tone="muted" style={{ fontSize: 13 }}>{`${r.kills} K`}</Txt>
              <Txt style={{ width: 40, textAlign: 'right', fontSize: 17, fontFamily: font.bold }}>{brPointsOf(pts, r.placement, r.kills)}</Txt>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 14 }}>
          <Txt variant="meta" tone="muted">
            Todavía sin puestos.
          </Txt>
        </View>
      )}
      {game.proof.length > 0 && <ProofStrip ids={game.proof} />}
    </View>
  );
}

/** Las capturas de la partida o la serie (miniaturas que se abren grandes). */
export function ProofStrip({ ids }: { ids: readonly string[] }) {
  const c = useColors();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 4 }}>
        <Camera size={16} color={c.fg2} />
        <Txt tone="fg2" variant="meta" style={{ fontFamily: font.semibold }}>
          {ids.length === 1 ? 'Captura' : 'Capturas'}
        </Txt>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {ids.map((id, i) => (
          <Thumb key={id} id={id} n={i + 1} onOpen={() => setOpen(id)} />
        ))}
      </ScrollView>
      <PhotoSheet photoId={open} onClose={() => setOpen(null)} />
    </View>
  );
}

function Thumb({ id, n, onOpen }: { id: string; n: number; onOpen: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const photo = usePhoto(lid, id);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver la captura ${n}`} onPress={onOpen} style={{ width: 80, height: 80, borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface2 }}>
      {photo.data && <Image source={{ uri: photo.data.url }} style={StyleSheet.absoluteFill} contentFit="cover" />}
    </Pressable>
  );
}

/** La captura en grande (PhotoModal de la web, con el título «Captura»). */
export function PhotoSheet({ photoId, onClose }: { photoId: string | null; onClose: () => void }) {
  const { lid } = useLeagueCtx();
  const data = usePhoto(lid, photoId);
  const img = data.data;
  return (
    <Sheet open={photoId != null} onClose={onClose} title="Captura">
      {img ? (
        <Image
          source={{ uri: img.url }}
          accessibilityLabel="Captura"
          style={{ width: '100%', aspectRatio: img.width && img.height ? img.width / img.height : 16 / 9, borderRadius: 12 }}
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
  num: { width: 30, textAlign: 'right' },
});
