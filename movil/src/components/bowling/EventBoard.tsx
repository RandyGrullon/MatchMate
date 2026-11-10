import { Pressable, StyleSheet, View } from 'react-native';
import { boardLine, type BoardRow } from '@mm/components/event/board';
import type { Player } from '@mm/lib/types';
import { Card, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * «Cómo van todos» (EventBoard de la web): cada jugador con su puesto, sus juegos («212 · 245 · 201»; lo que falta por
 * aprobar en gris y «jugando el 3» si es el tuyo a medias) y el total, que solo suma lo aprobado. Ya pasado, «Resultados».
 * Las filas salen de boardRows (src/components/event/board.ts), las mismas de la web. `onOpen`: tocar a alguien que ya
 * tiene juegos abre su juego (el detalle), como la web.
 */
export function EventBoard({
  rows,
  players,
  me,
  live,
  past,
  onOpen,
}: {
  rows: readonly BoardRow[];
  players: readonly Player[];
  me: string | null;
  live: boolean;
  past: boolean;
  onOpen?: (row: BoardRow) => void;
}) {
  const c = useColors();
  if (!rows.length) return null;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? 'Jugador';
  const greyed = rows.some((r) => r.cells.some((x) => x.kind !== 'ok' && x.kind !== 'empty' && !x.partial));
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader
        title={past ? 'Resultados' : 'Cómo van todos'}
        action={
          live ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
              <Txt tone="accent" style={{ fontFamily: font.semibold, fontSize: 13.5 }}>
                En vivo
              </Txt>
            </View>
          ) : undefined
        }
      />
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {rows.map((r, i) => {
          const name = nameOf(r.playerId);
          const mine = r.playerId === me;
          const line = boardLine(r.cells);
          const open = onOpen && r.entry ? () => onOpen(r) : undefined;
          return (
            <Pressable
              key={r.playerId}
              accessible
              accessibilityRole={open ? 'button' : undefined}
              accessibilityLabel={`${r.pos}. ${name}${mine ? ' (tú)' : ''}: ${r.total}`}
              disabled={!open}
              onPress={open}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: mine ? c.accentSoft : pressed ? c.surface2 : 'transparent' },
                i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null,
              ]}
            >
              <Txt style={{ width: 22, textAlign: 'center', fontFamily: font.bold, color: mine ? c.accent : c.muted }}>{r.pos}</Txt>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" numberOfLines={1}>
                  {name}
                  {mine ? <Txt tone="accent" style={{ fontSize: 13 }}>{'  Tú'}</Txt> : null}
                </Txt>
                <Txt variant="meta" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
                  {line.map((g, k) => (
                    <Txt key={k} variant="meta" style={{ color: g.faint ? c.faint : c.muted }}>
                      {`${k > 0 ? ' · ' : ''}${g.text}`}
                    </Txt>
                  ))}
                </Txt>
              </View>
              <Txt style={{ fontFamily: font.bold, fontSize: 20, fontVariant: ['tabular-nums'] }}>{r.total}</Txt>
            </Pressable>
          );
        })}
      </Card>
      {greyed && (
        <Txt tone="muted" style={{ textAlign: 'center', fontSize: 13 }}>
          En gris, los que faltan por aprobar · solo suman los aprobados
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
});
