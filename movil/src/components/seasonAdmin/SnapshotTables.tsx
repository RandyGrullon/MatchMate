/**
 * La tabla final de una temporada como se guarda al cerrarla (SnapshotTables y SnapshotTableView de
 * src/components/season/SeasonView.tsx, con la misma foto): con pestañas si son varias; cada una con el puesto (oro,
 * plata y bronce en los 3 primeros), el nombre y sus columnas, la última (la principal) en negrita. Las columnas
 * «anchas» no caben en el teléfono, como en la web. `highlight`: ids de equipo o jugador resaltados.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SeasonSnapshot, SnapshotTable } from '@mm/components/season/logic';
import { TabStrip } from '@/components/swimming/parts';
import { Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export function SnapshotTables({ snapshot, highlight = [] }: { snapshot: SeasonSnapshot; highlight?: readonly string[] }) {
  const [key, setKey] = useState(snapshot.tables[0]?.key ?? '');
  const table = snapshot.tables.find((t) => t.key === key) ?? snapshot.tables[0];
  if (!table) return null;
  return (
    <View style={{ gap: 12 }}>
      {snapshot.tables.length > 1 && <TabStrip label="Tabla final" items={snapshot.tables.map((t) => ({ key: t.key, label: t.title }))} active={table.key} onChange={setKey} />}
      <SnapshotTableView table={table} highlight={highlight} />
    </View>
  );
}

/** El puesto: oro, plata y bronce en los 3 primeros (Position de la web). */
function Position({ pos }: { pos: number }) {
  const c = useColors();
  const color = pos === 1 ? c.gold : pos === 2 ? c.silver : pos === 3 ? c.bronze : null;
  return color ? (
    <View style={[styles.medal, { backgroundColor: color }]}>
      <Txt style={{ fontSize: 12, fontFamily: font.bold, color: c.bg }}>{String(pos)}</Txt>
    </View>
  ) : (
    <View style={{ width: 24, alignItems: 'center' }}>
      <Txt tone="muted" style={{ fontSize: 14, fontFamily: font.medium }}>
        {String(pos)}
      </Txt>
    </View>
  );
}

const cellText = (v: string | number) => (typeof v === 'number' ? v.toLocaleString('es-DO') : v);

/** Una tabla guardada: puesto, nombre y sus columnas (la última, la principal, en negrita). */
export function SnapshotTableView({ table, highlight = [] }: { table: SnapshotTable; highlight?: readonly string[] }) {
  const c = useColors();
  const last = table.columns.length - 1;
  // Las «anchas» se esconden en el teléfono (como `hidden sm:table-cell` en la web).
  const shown = table.columns.map((col, i) => ({ col, i })).filter(({ col }) => !col.wide);
  const head = { fontSize: 12, fontFamily: font.medium, color: c.muted };
  return (
    <View style={{ gap: 8 }}>
      <Card padded={false}>
        <View style={[styles.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
          <Txt style={[head, { width: 32 }]}>#</Txt>
          <Txt style={[head, { flex: 1 }]}>{table.nameLabel}</Txt>
          {shown.map(({ col, i }) => (
            <Txt key={i} accessibilityLabel={col.title} style={[head, styles.cell]}>
              {col.label}
            </Txt>
          ))}
        </View>
        {table.rows.map((r, k) => {
          const mine = (!!r.teamId && highlight.includes(r.teamId)) || (!!r.playerId && highlight.includes(r.playerId));
          return (
            <View
              key={k}
              style={[styles.row, { backgroundColor: mine ? c.accentSoft : 'transparent' }, k < table.rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}
            >
              <View style={{ width: 32 }}>
                <Position pos={r.rank} />
              </View>
              <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
                {r.name}
              </Txt>
              {shown.map(({ i }) => (
                <Txt
                  key={i}
                  tone={i === last ? 'fg' : 'muted'}
                  style={[styles.cell, i === last ? { fontSize: 16, fontFamily: font.bold } : { fontSize: 14 }, { fontVariant: ['tabular-nums'] }]}
                >
                  {cellText(r.values[i] ?? '')}
                </Txt>
              ))}
            </View>
          );
        })}
      </Card>
      {!!table.note && (
        <Txt tone="muted" style={{ fontSize: 12, paddingHorizontal: 4 }}>
          {table.note}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  cell: { minWidth: 44, textAlign: 'right' },
  medal: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
