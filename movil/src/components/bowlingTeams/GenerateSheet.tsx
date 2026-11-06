import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { RefreshCw, Scale, Shuffle } from 'lucide-react-native';
import { TEAM_SIZES, defaultTeamSize, draftsFromGroups, setBowlingTeams, type BowlingTeam } from '@mm/lib/data/bowlingTeams';
import { useLeagueCtx } from '@mm/lib/league';
import type { Player } from '@mm/lib/types';
import { useNow } from '@mm/lib/useNow';
import { generateCandidates, generateGroups, generateSummary, playersWord, replaceMessage, type GenerateMode } from '@mm/components/bowlingTeams/logic';
import { confirmAsync } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Button, Card, Field, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { SectionLink, TeamDot, useBusy } from './parts';

/**
 * «Generar equipos» (GenerateSheet de la web, con su misma lógica): cómo (al azar o parejos por promedio), de a
 * cuántos (2 a 6) y quiénes entran (todos, o tocar para dejar a alguien fuera); abajo, cómo quedan. «Usar estos
 * equipos» reemplaza los de ahora (con aviso si hay): reutiliza sus nombres, colores e ids en orden. Se monta al
 * abrirse: empieza desde cero, como quedó la liga.
 */
export function GenerateSheet({ onClose, players, teams, averages }: { onClose: () => void; players: Player[]; teams: BowlingTeam[]; averages: ReadonlyMap<string, number> }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const busy = useBusy();
  const now = useNow();
  // «Parejos por promedio» no cabe en una pantalla angosta (en la web, «por promedio» se esconde bajo 390 px).
  const narrow = useWindowDimensions().width < 390;
  const [mode, setMode] = useState<GenerateMode>('azar');
  const [size, setSize] = useState(() => defaultTeamSize(players.length, teams));
  // La semilla del azar: la hora al abrir; «Mezclar otra vez» la cambia.
  const [seed, setSeed] = useState(() => now.getTime());
  const [out, setOut] = useState<ReadonlySet<string>>(() => new Set());
  const [choosing, setChoosing] = useState(false);

  const candidates = useMemo(() => generateCandidates(players, out, averages), [players, out, averages]);
  const groups = useMemo(() => generateGroups(mode, candidates, size, seed), [mode, candidates, size, seed]);
  const drafts = draftsFromGroups(groups, teams);
  const { sums, spread, gone } = generateSummary(groups, teams.length);

  const use = async () => {
    if (busy.isBusy() || candidates.length < 2) return;
    if (teams.length) {
      const yes = await confirmAsync({ title: '¿Cambiar los equipos?', message: replaceMessage(teams.length, drafts.length), confirmText: 'Cambiar' });
      if (!yes) return;
    }
    const ok = await busy.run('usar', () =>
      runAction(async () => {
        await setBowlingTeams(lid, drafts);
        return true;
      }, `${drafts.length} ${drafts.length === 1 ? 'equipo listo' : 'equipos listos'}`),
    );
    if (ok) onClose();
  };

  const toggle = (id: string) =>
    setOut((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const modes: { key: GenerateMode; label: string; ariaLabel: string; icon: typeof Shuffle }[] = [
    { key: 'azar', label: 'Al azar', ariaLabel: 'Al azar', icon: Shuffle },
    { key: 'parejos', label: narrow ? 'Parejos' : 'Parejos por promedio', ariaLabel: 'Parejos por promedio', icon: Scale },
  ];

  return (
    <Sheet
      open
      onClose={onClose}
      title="Generar equipos"
      subtitle={`${playersWord(candidates.length)} → ${groups.length} ${groups.length === 1 ? 'equipo' : 'equipos'}`}
      footer={
        <Button variant="primary" size="lg" full loading={busy.isBusy('usar')} disabled={candidates.length < 2 || busy.isBusy()} onPress={() => void use()}>
          Usar estos equipos
        </Button>
      }
    >
      <View style={{ gap: 20, paddingBottom: 4 }}>
        <View style={{ gap: 8 }}>
          <View accessibilityRole="radiogroup" accessibilityLabel="Cómo se arman" style={[styles.segmented, { backgroundColor: c.surface2 }]}>
            {modes.map((o) => {
              const on = o.key === mode;
              const Icon = o.icon;
              return (
                <Pressable
                  key={o.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={o.ariaLabel}
                  onPress={() => setMode(o.key)}
                  style={[styles.segment, on && { backgroundColor: c.segOn, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
                >
                  <Icon size={16} color={on ? c.fg : c.muted} />
                  <Txt variant="bodyStrong" tone={on ? 'fg' : 'muted'} numberOfLines={1}>
                    {o.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
          <Txt tone="muted" style={{ fontSize: 13 }}>
            {mode === 'azar' ? 'Cada vez que mezclas sale otro reparto.' : 'Sumas de promedio parejas y, cuando se puede, sin repetir categoría en un equipo.'}
          </Txt>
        </View>

        <Field label="Jugadores por equipo">
          <View accessibilityRole="radiogroup" accessibilityLabel="Jugadores por equipo" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TEAM_SIZES.map((n) => {
              const on = size === n;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setSize(n)}
                  style={({ pressed }) => [styles.size, { backgroundColor: on ? c.accent : c.surface2, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Txt style={{ fontSize: 16, fontFamily: font.semibold, color: on ? c.accentFg : c.fg }}>{String(n)}</Txt>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <View>
          <View style={styles.headRow}>
            <Txt style={{ fontSize: 14, fontFamily: font.medium, flexShrink: 1 }} accessibilityRole="header">
              Quiénes entran{' '}
              <Txt tone="muted" style={{ fontSize: 14 }}>
                {`· ${candidates.length} de ${players.length}`}
              </Txt>
            </Txt>
            <SectionLink expanded={choosing} onPress={() => setChoosing((x) => !x)}>
              {choosing ? 'Listo' : 'Cambiar'}
            </SectionLink>
          </View>
          {choosing && (
            <View style={{ marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {players.map((p) => {
                const on = !out.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="togglebutton"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(p.id)}
                    style={({ pressed }) => [styles.chip, { backgroundColor: on ? c.accentSoft : c.surface2, opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Txt style={{ fontSize: 14, fontFamily: font.medium, color: on ? c.accent : c.muted, textDecorationLine: on ? 'none' : 'line-through' }}>{p.name}</Txt>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <View>
          <View style={[styles.headRow, { marginBottom: 8 }]}>
            <Txt variant="section" accessibilityRole="header">
              Así quedan
            </Txt>
            {mode === 'azar' ? (
              <SectionLink icon={<RefreshCw size={16} color={c.accent} style={{ marginRight: 4 }} />} onPress={() => setSeed((s) => s + 1)}>
                Mezclar otra vez
              </SectionLink>
            ) : (
              <Txt tone="muted" style={{ fontSize: 13 }}>
                Diferencia: <Txt style={{ fontSize: 13, fontFamily: font.bold }}>{String(spread)}</Txt> pinos
              </Txt>
            )}
          </View>
          {gone > 0 && (
            <Txt tone="warn" style={{ fontSize: 13, marginBottom: 8 }}>
              {gone === 1 ? 'Se borra 1 equipo que sobra.' : `Se borran ${gone} equipos que sobran.`}
            </Txt>
          )}
          {candidates.length < 2 ? (
            <Txt variant="meta" tone="muted">
              Hacen falta al menos 2 jugadores.
            </Txt>
          ) : (
            <View style={{ gap: 12 }}>
              {drafts.map((d, i) => (
                <Card key={i} style={{ padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
                  <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TeamDot color={d.color} />
                    <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: font.semibold }}>
                      {d.name}
                    </Txt>
                    <Txt tone="muted" style={{ fontSize: 13 }}>{`suma ${sums[i]}`}</Txt>
                  </View>
                  <View style={{ gap: 4 }}>
                    {groups[i].map((m) => (
                      <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Txt numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                          {m.name}
                        </Txt>
                        <Txt tone="muted" style={{ fontSize: 14 }}>
                          {m.average ? String(m.average) : '—'}
                        </Txt>
                      </View>
                    ))}
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
  segment: { flex: 1, height: 40, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  size: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  chip: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, justifyContent: 'center' },
});
