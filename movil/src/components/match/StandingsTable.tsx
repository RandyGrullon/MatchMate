/**
 * Tabla de posiciones (StandingsTable de la web, con las mismas columnas: src/components/match/standings.ts): el puesto
 * en gris, el nombre, las columnas cortas (las «anchas» no caben en el teléfono, como en la web) y los puntos al final.
 * Tu fila, en acento suave. Si un puesto lo decidió un desempate, tocar la fila lo dice.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { defaultColumns, type StandingsColumn } from '@mm/components/match/standings';
import type { StandingRow } from '@mm/sports/types';
import { Card, Empty, Txt } from '../ui';
import { useColors } from '@/theme/theme';

const asText = (v: ReactNode) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

export function StandingsTable({
  rows,
  nameOf,
  columns = defaultColumns(),
  highlight = [],
  pointsLabel = 'Pts',
  primary = [],
  empty,
}: {
  rows: readonly StandingRow[];
  nameOf: (id: string) => string;
  columns?: StandingsColumn[];
  highlight?: readonly string[];
  pointsLabel?: string;
  primary?: readonly string[];
  empty?: string;
}) {
  const c = useColors();
  const [shown, setShown] = useState<string | null>(null);
  if (!rows.length) return <Empty title="Sin tabla todavía" text={empty} />;
  const cols = columns.filter((col) => !col.wide);
  const head = { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.5, color: c.muted };
  return (
    <Card padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
        <Txt style={[head, { width: 28 }]}>#</Txt>
        <Txt style={[head, { flex: 1 }]}>NOMBRE</Txt>
        {cols.map((col) => (
          <Txt key={col.key} accessibilityLabel={col.title} style={[head, { width: 34, textAlign: 'right' }]}>
            {col.label.toUpperCase()}
          </Txt>
        ))}
        <Txt style={[head, { width: 40, textAlign: 'right' }]}>{pointsLabel.toUpperCase()}</Txt>
      </View>
      {rows.map((r) => {
        const why = r.decidedBy && !primary.includes(r.decidedBy) ? r.decidedBy : null;
        const me = highlight.includes(r.id);
        return (
          <Pressable
            key={r.id}
            disabled={!why}
            onPress={() => setShown(shown === r.id ? null : r.id)}
            style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: me ? c.accentSoft : 'transparent' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Txt style={{ width: 28, fontSize: 15, fontWeight: '600', color: c.muted }}>{r.rank}</Txt>
              <Txt numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>
                {nameOf(r.id)}
                {why ? <Txt variant="small" tone="muted">{'  ⓘ'}</Txt> : null}
              </Txt>
              {cols.map((col) => (
                <Txt key={col.key} style={{ width: 34, textAlign: 'right', fontSize: 15, color: c.fg2 }}>
                  {asText(col.value(r))}
                </Txt>
              ))}
              <Txt style={{ width: 40, textAlign: 'right', fontSize: 17, fontWeight: '700' }}>{r.points}</Txt>
            </View>
            {why && shown === r.id && (
              <Txt variant="small" tone="muted" style={{ marginLeft: 28 }}>
                Desempate: {why}
              </Txt>
            )}
          </Pressable>
        );
      })}
    </Card>
  );
}
