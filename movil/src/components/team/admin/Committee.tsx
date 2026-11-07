/**
 * Organizar › Equipos › Comité en la app (CommitteeAdmin de FootballAdmin.tsx de la web, con su lógica: rulesAdmin.ts y
 * src/pages/sports/football/data.ts): las sanciones del comité, partidos de suspensión a mano (además de las automáticas
 * por tarjetas), con quitar.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { Gavel, Trash2 } from 'lucide-react-native';
import { deleteFootballSanction, saveFootballSanction, useFootballSanctions } from '@mm/pages/sports/football/data';
import { committeeCandidates, committeeMatches, committeeMatchOption, committeeMatchText, footballNum, sanctionLine, sanctionTitle } from '@mm/pages/sports/team/rulesAdmin';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { useBusy } from '@/components/bowlingTeams/parts';
import { confirmAsync } from '@/components/feedback';
import { PickField } from '@/components/players/fields';
import { Button, Card, Field, Input, SectionHeader, Txt } from '@/components/ui';
import { DangerButton } from '../TeamBits';
import { act, Half, NumField, Pair, Row, SettingsCard } from './parts';
import { useColors } from '@/theme/theme';

export function CommitteeAdmin({ tl }: { tl: TeamLeague }) {
  const c = useColors();
  const sanctions = useFootballSanctions(tl.lid);
  const played = committeeMatches(tl.matches.data);
  const [matchId, setMatchId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // La sanción que se está quitando: la ruedita en su botón.
  const removing = useBusy();
  const match = played.find((m) => m.id === matchId);
  const side = match?.sides.find((s) => s.teamId === teamId);
  const candidates = committeeCandidates(match, teamId, tl.allTeams.data);
  const n = footballNum(count, 1, 50, 0);
  const valid = !!match && !!side && !!playerId && n > 0;
  const matchText = (id: string) => committeeMatchText(tl.matches.data, id, (t) => tl.teamOf(t)?.name);

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const ok = await act(async () => {
      await saveFootballSanction(tl.lid, { matchId, teamId, playerId, matches: n, note });
      return true;
    }, 'Sanción guardada');
    setBusy(false);
    if (ok) {
      setPlayerId('');
      setNote('');
      setCount('1');
    }
  };
  const remove = async (id: string) => {
    const yes = await confirmAsync({ title: 'Quitar la sanción', message: 'Los partidos que ya cumplió no cambian; los que le faltaban se borran.', confirmText: 'Quitar', danger: true });
    if (yes) await removing.run(id, () => act(() => deleteFootballSanction(tl.lid, id), 'Sanción quitada'));
  };

  return (
    <View style={{ gap: 30 }}>
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        Las rojas y las amarillas suspenden solas. Aquí van las sanciones que ponga el comité.
      </Txt>
      <SettingsCard title="Nueva sanción">
        <Field label="Desde el partido">
          <PickField
            label="Desde el partido"
            options={[{ key: '', label: played.length ? 'Elige el partido…' : 'Todavía no hay partidos jugados' }, ...played.map((m) => ({ key: m.id, label: committeeMatchOption(m, matchText(m.id)) }))]}
            value={matchId}
            onChange={(k) => {
              setMatchId(k);
              setTeamId('');
              setPlayerId('');
            }}
          />
        </Field>
        {match && (
          <>
            <Field label="Equipo">
              <PickField
                label="Equipo"
                options={[{ key: '', label: 'Elige…' }, ...match.sides.filter((s) => s.teamId).map((s) => ({ key: s.teamId!, label: tl.teamOf(s.teamId)?.name ?? s.label }))]}
                value={teamId}
                onChange={(k) => {
                  setTeamId(k);
                  setPlayerId('');
                }}
              />
            </Field>
            <Field label="Jugador">
              <PickField label="Jugador" options={[{ key: '', label: 'Elige…' }, ...candidates.map((id) => ({ key: id, label: tl.nameOf(id) }))]} value={playerId} onChange={setPlayerId} disabled={!side} />
            </Field>
            <Pair>
              <Half>
                <NumField label="Partidos de suspensión" value={count} onChange={(v) => setCount(v.replace(/\D/g, '').slice(0, 2))} />
              </Half>
              <Half>
                <Field label="Motivo (opcional)">
                  <Input value={note} maxLength={200} onChangeText={setNote} placeholder="Agresión al árbitro" accessibilityLabel="Motivo (opcional)" />
                </Field>
              </Half>
            </Pair>
          </>
        )}
        <Button variant="primary" size="lg" full icon={<Gavel size={20} color={c.accentFg} />} loading={busy} disabled={!valid} onPress={() => void save()}>
          Guardar sanción
        </Button>
      </SettingsCard>
      <View style={{ gap: 10 }}>
        <SectionHeader
          title="Sanciones del comité"
          action={
            <Txt variant="meta" tone="muted">
              {String(sanctions.data.length)}
            </Txt>
          }
        />
        {!sanctions.data.length ? (
          <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
            No hay sanciones del comité.
          </Txt>
        ) : (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {sanctions.data.map((s, i) => (
              <Row
                key={s.id}
                top={i === 0}
                title={sanctionTitle(tl.nameOf(s.playerId), s.matches)}
                subtitle={sanctionLine(tl.teamOf(s.teamId)?.name, matchText(s.matchId), s.note)}
                trailing={
                  <DangerButton
                    icon={<Trash2 size={20} color={c.danger} />}
                    accessibilityLabel={`Quitar la sanción de ${tl.nameOf(s.playerId)}`}
                    loading={removing.isBusy(s.id)}
                    disabled={removing.isBusy()}
                    onPress={() => void remove(s.id)}
                  />
                }
              />
            ))}
          </Card>
        )}
      </View>
    </View>
  );
}
