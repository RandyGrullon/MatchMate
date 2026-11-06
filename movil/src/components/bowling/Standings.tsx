import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Flame, Trophy, Users } from 'lucide-react-native';
import { entryLine, individualRule, rank, teamLines, teamRule, type Line } from '@mm/lib/stats';
import type { BowlingEvent, Entry, Player, RankBy } from '@mm/lib/types';
import { bowlingTitle } from '@mm/prizes/catalog';
import { Card, Empty, Segmented, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** El puesto: oro, plata y bronce en los 3 primeros (Position de la web). */
function Position({ pos }: { pos: number }) {
  const c = useColors();
  const color = pos === 1 ? c.gold : pos === 2 ? c.silver : pos === 3 ? c.bronze : null;
  return color ? (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
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

/** Un número de arriba («Mejor juego», «Jugadores»), Stat de la web. */
function Stat({ icon, label, value, sub }: { icon: ReactNode; label: string; value: number; sub?: string }) {
  return (
    <Card style={{ flex: 1, gap: 2, paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Txt tone="muted" style={{ fontSize: 12 }}>
          {label}
        </Txt>
      </View>
      <Txt style={{ fontFamily: font.bold, fontSize: 24 }}>{String(value)}</Txt>
      {!!sub && (
        <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
          {sub}
        </Txt>
      )}
    </Card>
  );
}

/** El título de una tabla con su «Con handicap | Scratch» y si no es el criterio oficial (SectionHeader de la web). */
function Header({ title, mode, onMode, hasHcp, unofficial }: { title: string; mode: RankBy; onMode: (m: RankBy) => void; hasHcp: boolean; unofficial: boolean }) {
  return (
    <View style={{ gap: 8, marginHorizontal: 4 }}>
      <Txt variant="section">
        {title}
        {unofficial && <Txt tone="warn" style={{ fontSize: 14 }}>{'  (no es el criterio oficial del torneo)'}</Txt>}
      </Txt>
      {hasHcp && (
        <Segmented<RankBy>
          label="Ordenar por"
          value={mode}
          onChange={onMode}
          options={[
            { key: 'hcp', label: 'Con handicap' },
            { key: 'scratch', label: 'Scratch' },
          ]}
        />
      )}
    </View>
  );
}

/**
 * La clasificación de un torneo de boliche (o los resultados de una práctica): StandingsTab de la web en solo mirar,
 * como se ve en el teléfono (el puesto, el nombre con sus juegos debajo y el total). En un torneo, primero los
 * equipos (sus jugadores debajo) y después lo individual; cada tabla parte de la regla del torneo y se puede alternar
 * entre «Con handicap» y «Scratch» para mirar. Tocar un jugador abre su página.
 */
export function Standings({ lid, event, entries, players, me }: { lid: string; event: BowlingEvent; entries: Entry[]; players: Player[]; me: string | null }) {
  const c = useColors();
  const isTorneo = event.type === 'torneo';
  const hasHcp = isTorneo && event.hcpPercent > 0;
  const [indMode, setIndMode] = useState<RankBy>(individualRule(event));
  const [teamMode, setTeamMode] = useState<RankBy>(teamRule(event));
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (l: Line) => byId.get(l.entry.playerId)?.name ?? '(jugador borrado)';

  const lines = entries.map((e) => entryLine(e, event)).filter((l) => l.games > 0);
  const pending = entries.reduce((n, e) => n + entryLine(e, event).pending, 0);
  const useHcp = hasHcp && indMode === 'hcp';
  const teamHcp = hasHcp && teamMode === 'hcp';
  const value = (l: Line) => (isTorneo ? (useHcp ? l.total : l.scratch) : l.avg);
  const individual = rank(lines, value);
  const teams = isTorneo ? rank(teamLines(event, lines).filter((t) => t.members.length), (t) => (teamHcp ? t.total : t.scratch)) : [];
  const best = lines.reduce<{ score: number; line: Line | null }>((acc, l) => (l.high > acc.score ? { score: l.high, line: l } : acc), { score: 0, line: null });

  if (!lines.length) {
    return (
      <Empty
        icon={<Trophy size={28} color={c.accent} />}
        title={pending > 0 ? 'Sin juegos verificados' : 'Todavía no hay juegos'}
        text={pending > 0 ? 'La clasificación cuenta solo juegos verificados.' : 'Cuando se anoten los juegos, la clasificación se actualiza sola.'}
      />
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {best.line && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Stat icon={<Flame size={16} color={c.accent} />} label="Mejor juego" value={best.score} sub={nameOf(best.line)} />
          <Stat icon={<Users size={16} color={c.accent} />} label="Jugadores" value={lines.length} />
        </View>
      )}

      {isTorneo && teams.length > 0 && (
        <View style={{ gap: 8 }}>
          <Header title={bowlingTitle('equipo', teamHcp ? 'hcp' : 'scratch')} mode={teamMode} onMode={setTeamMode} hasHcp={hasHcp} unofficial={hasHcp && teamMode !== teamRule(event)} />
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {teams.map(({ row: t, pos }, i) => (
              <View key={t.teamId} style={[styles.row, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
                <Position pos={pos} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {t.name}
                  </Txt>
                  <Txt tone="muted" numberOfLines={2} style={{ fontSize: 12 }}>
                    {t.members.map(nameOf).join(', ')}
                  </Txt>
                </View>
                <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>{String(teamHcp ? t.total : t.scratch)}</Txt>
              </View>
            ))}
          </Card>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Header
          title={isTorneo ? bowlingTitle('individual', useHcp ? 'hcp' : 'scratch') : 'Resultados de la práctica'}
          mode={indMode}
          onMode={setIndMode}
          hasHcp={hasHcp}
          unofficial={hasHcp && indMode !== individualRule(event)}
        />
        <Card padded={false} style={{ overflow: 'hidden' }}>
          {individual.map(({ row: l, pos }, i) => {
            const mine = l.entry.playerId === me;
            return (
              <Pressable
                key={l.entry.id}
                accessibilityRole="button"
                accessibilityLabel={`${pos}. ${nameOf(l)}${mine ? ' (tú)' : ''}: ${isTorneo ? (useHcp ? l.total : l.scratch) : l.avg}`}
                onPress={() => router.push({ pathname: '/l/[lid]/j/[playerId]', params: { lid, playerId: l.entry.playerId } })}
                style={[styles.row, { backgroundColor: mine ? c.accentSoft : 'transparent' }, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}
              >
                <Position pos={pos} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {nameOf(l)}
                  </Txt>
                  <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
                    {l.scores.map((s) => s ?? '–').join(' · ')}
                  </Txt>
                </View>
                <Txt style={{ fontFamily: font.bold, fontSize: 17 }}>{String(isTorneo ? (useHcp ? l.total : l.scratch) : l.avg)}</Txt>
              </Pressable>
            );
          })}
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 10 },
});
