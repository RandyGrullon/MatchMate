import { StyleSheet, View } from 'react-native';
import { UserMinus } from 'lucide-react-native';
import { colorOf, rosterWith, rosterWithout, saveBowlingTeam, teamOf, type BowlingTeam } from '@mm/lib/data/bowlingTeams';
import { useLeagueCtx } from '@mm/lib/league';
import type { Player } from '@mm/lib/types';
import { teamLine } from '@mm/components/bowlingTeams/logic';
import { runAction } from '@/components/swimming/parts';
import { Card, Divider, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { DangerButton, DenseRow, RowSpinner, TeamMark, useBusy } from './parts';

/**
 * Tocar a un jugador (PlayerSheet de Equipos en la web, con su misma lógica): los otros equipos para moverlo (o
 * ponerlo, si no tiene) y «Sacar de …». Se cierra al terminar.
 */
export function TeamPlayerSheet({ player, teams, averages, onClose }: { player: Player; teams: BowlingTeam[]; averages: ReadonlyMap<string, number>; onClose: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const busy = useBusy();
  const current = teamOf(teams, player.id);
  const others = teams.filter((t) => t.id !== current?.id);
  const average = averages.get(player.id) ?? 0;

  const moveTo = async (t: BowlingTeam) => {
    const ok = await busy.run(t.id, () =>
      runAction(
        async () => {
          await saveBowlingTeam(lid, { id: t.id, name: t.name, color: t.color, players: rosterWith(t, player.id) });
          return true;
        },
        current ? `${player.name} pasó a ${t.name}` : `${player.name} entró a ${t.name}`,
      ),
    );
    if (ok) onClose();
  };

  const takeOut = async () => {
    if (!current) return;
    const ok = await busy.run('sacar', () =>
      runAction(async () => {
        await saveBowlingTeam(lid, { id: current.id, name: current.name, color: current.color, players: rosterWithout(current, player.id) });
        return true;
      }, `${player.name} quedó sin equipo`),
    );
    if (ok) onClose();
  };

  return (
    <Sheet open onClose={onClose} title={player.name} subtitle={[current ? current.name : 'Sin equipo', average ? `promedio ${average}` : ''].filter(Boolean).join(' · ')}>
      <View style={{ gap: 16, paddingBottom: 4 }}>
        {others.length > 0 ? (
          <View>
            <Txt tone="muted" accessibilityRole="header" style={{ marginBottom: 8, fontSize: 14, fontFamily: font.medium }}>
              {current ? 'Mover a' : 'Poner en'}
            </Txt>
            <Card padded={false} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
              {others.map((t, i) => (
                <View key={t.id}>
                  {i > 0 && <Divider inset={20} />}
                  <DenseRow
                    leading={<TeamMark name={t.name} color={colorOf(t, teams.indexOf(t))} />}
                    title={t.name}
                    subtitle={teamLine(t, averages)}
                    onPress={() => void moveTo(t)}
                    accessibilityLabel={`${current ? 'Mover' : 'Poner'} a ${player.name} en ${t.name}`}
                    trailing={busy.isBusy(t.id) ? <RowSpinner /> : undefined}
                  />
                </View>
              ))}
            </Card>
          </View>
        ) : (
          !current && (
            <Txt variant="meta" tone="muted">
              Crea un equipo primero.
            </Txt>
          )
        )}
        {current && (
          <DangerButton
            icon={<UserMinus size={20} color={c.danger} />}
            label={`Sacar de ${current.name}`}
            loading={busy.isBusy('sacar')}
            disabled={busy.isBusy()}
            onPress={() => void takeOut()}
            full
          >
            {`Sacar de ${current.name}`}
          </DangerButton>
        )}
      </View>
    </Sheet>
  );
}
