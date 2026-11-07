import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { TEAM_COLORS, colorOf, defaultTeamName, deleteBowlingTeam, saveBowlingTeam, teamColorAt, type BowlingTeam } from '@mm/lib/data/bowlingTeams';
import { useLeagueCtx } from '@mm/lib/league';
import { playersWord } from '@mm/components/bowlingTeams/logic';
import { ColorBoard } from '@/components/balls/DesignControls';
import { confirmAsync } from '@/components/feedback';
import { runAction } from '@/components/swimming/parts';
import { Button, Field, Input, Sheet } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { DangerButton, useBusy } from './parts';

/**
 * Nombre y color del equipo (crear o cambiar) y borrarlo (TeamFormSheet de la web, con su misma lógica). Se monta al
 * abrirse, con lo guardado. Los colores de la lista y «Otro color» (el selector del navegador de la web): el círculo con
 * el color de ahora abre el tablero de colores de las bolas (ColorBoard).
 */
export function TeamFormSheet({ team, index, onClose }: { team: BowlingTeam | null; index: number; onClose: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const busy = useBusy<'guardar' | 'borrar'>();
  const [name, setName] = useState(team?.name ?? '');
  const [color, setColor] = useState(team ? colorOf(team, index) : teamColorAt(index));
  const [board, setBoard] = useState(false);
  const fallback = team?.name ?? defaultTeamName(index);

  const save = async () => {
    const ok = await busy.run('guardar', () =>
      runAction(
        async () => {
          await saveBowlingTeam(lid, { id: team?.id ?? null, name: name.trim() || fallback, color, players: team ? null : [] });
          return true;
        },
        team ? 'Equipo guardado' : 'Equipo creado',
      ),
    );
    if (ok) onClose();
  };

  const remove = async () => {
    if (!team) return;
    const yes = await confirmAsync({
      title: `¿Borrar ${team.name}?`,
      message: `${team.players.length ? `Sus ${playersWord(team.players.length)} quedan sin equipo. ` : ''}Los torneos que ya lo tienen no cambian.`,
      confirmText: 'Borrar',
      danger: true,
    });
    if (!yes) return;
    const ok = await busy.run('borrar', () =>
      runAction(async () => {
        await deleteBowlingTeam(lid, team.id);
        return true;
      }, 'Equipo borrado'),
    );
    if (ok) onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={team ? 'Nombre y color' : 'Nuevo equipo'}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {team && (
            <DangerButton icon={<Trash2 size={20} color={c.danger} />} label={`Borrar ${team.name}`} loading={busy.isBusy('borrar')} disabled={busy.isBusy()} onPress={() => void remove()} />
          )}
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" full loading={busy.isBusy('guardar')} disabled={busy.isBusy()} onPress={() => void save()}>
              {team ? 'Guardar' : 'Crear equipo'}
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 16, paddingBottom: 4 }}>
        <Field label="Nombre">
          <Input value={name} maxLength={60} onChangeText={setName} placeholder={fallback} accessibilityLabel="Nombre" autoFocus />
        </Field>
        <Field label="Color">
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              {TEAM_COLORS.map((col) => {
                const on = color === col;
                return (
                  <Pressable
                    key={col}
                    accessibilityRole="togglebutton"
                    accessibilityLabel={`Color ${col}`}
                    accessibilityState={{ checked: on }}
                    onPress={() => setColor(col)}
                    style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 2 : 0, borderColor: c.fg }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: col, borderWidth: on ? 0 : 1, borderColor: 'rgba(0,0,0,0.1)' }} />
                  </Pressable>
                );
              })}
              {/* «Otro color» (el <input type="color"> de la web): muestra el color de ahora y abre o cierra el tablero. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Otro color"
                accessibilityState={{ expanded: board }}
                onPress={() => setBoard((b) => !b)}
                style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, padding: 3, borderWidth: board ? 2 : 1, borderColor: board ? c.accent : c.line }}>
                  <View style={{ flex: 1, borderRadius: 18, backgroundColor: color, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.2)' }} />
                </View>
              </Pressable>
            </View>
            {board && <ColorBoard value={color} onChange={setColor} />}
          </View>
        </Field>
      </View>
    </Sheet>
  );
}
