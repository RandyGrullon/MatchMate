import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, ArrowLeft, BadgeCheck, Merge, Search } from 'lucide-react-native';
import { mergeBlockText, mergeErrorText, mergePlayers, previewMergePlayers, type MergePreview } from '@mm/lib/data/players';
import { useLeagueCtx } from '@mm/lib/league';
import type { Player } from '@mm/lib/types';
import { searchPlayers } from '@mm/components/league/logic';
import { mergeCandidates, mergeSummary } from '@mm/components/players/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { Avatar } from '@/components/social/Avatar';
import { Button, ChoiceRow, Input, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { size } from '@/theme/tokens';

/** Lo que dijo el servidor de una pareja (keep:drop): qué pasaría o por qué no se pudo preguntar. */
type Asked = { preview: MergePreview | null; error: string | null };

function Problem({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View accessibilityRole="alert" style={[styles.problem, { backgroundColor: c.dangerSoft }]}>
      <AlertTriangle size={16} color={c.danger} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>{children}</View>
    </View>
  );
}

/**
 * Organizar › Jugadores › «Juntar con…» (MergePlayerModal de la web, con su misma lógica): alguien quedó dos veces en
 * la lista. Se elige al otro, se ve qué pasaría (merge_league_players_preview) y, al confirmar, todo lo del que se va
 * pasa al que queda (merge_league_players). Se monta abierta en un jugador (de entrada, el que queda).
 */
export function MergePlayerSheet({ player, players, onClose }: { player: Player; players: readonly Player[]; onClose: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const [q, setQ] = useState('');
  const [other, setOther] = useState<string | null>(null);
  // Con qué nombre queda: el jugador desde el que se abrió (true) o el otro.
  const [keepMine, setKeepMine] = useState(true);
  // Lo que contestó el servidor por cada pareja (se vuelve a preguntar cada vez que cambia).
  const [asked, setAsked] = useState<Record<string, Asked>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => mergeCandidates(players, player.id), [players, player]);
  const shown = useMemo(() => searchPlayers(candidates, q), [candidates, q]);
  const otherPlayer = other ? (players.find((p) => p.id === other) ?? null) : null;
  const keep = otherPlayer ? (keepMine ? player : otherPlayer) : null;
  const drop = otherPlayer ? (keepMine ? otherPlayer : player) : null;
  const pair = keep && drop ? `${keep.id}:${drop.id}` : null;
  const answer = pair ? asked[pair] : undefined;
  const preview = answer?.preview ?? null;
  const loading = !!pair && !answer;

  /** Pregunta qué pasaría al juntar `dropId` en `keepId` (cada vez que cambia la pareja o cuál queda). */
  function ask(keepId: string, dropId: string) {
    const key = `${keepId}:${dropId}`;
    setError(null);
    setAsked((a) => {
      const next = { ...a };
      delete next[key];
      return next;
    });
    previewMergePlayers(lid, keepId, dropId)
      .then((p) => setAsked((a) => ({ ...a, [key]: { preview: p, error: null } })))
      .catch((e: unknown) => setAsked((a) => ({ ...a, [key]: { preview: null, error: mergeErrorText(e) } })));
  }

  function pick(id: string) {
    setOther(id);
    ask(keepMine ? player.id : id, keepMine ? id : player.id);
  }

  function chooseKeep(mine: boolean) {
    if (!otherPlayer || mine === keepMine) return;
    setKeepMine(mine);
    ask(mine ? player.id : otherPlayer.id, mine ? otherPlayer.id : player.id);
  }

  async function merge() {
    if (busy || !preview?.canMerge || !keep || !drop) return;
    const ok = await confirmAsync({
      title: `¿Juntar a ${drop.name} con ${keep.name}?`,
      message: `${mergeSummary(preview)} No se puede deshacer.`,
      confirmText: 'Juntar',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await mergePlayers(lid, keep.id, drop.id);
      toast(`Listo: ${drop.name} quedó junto con ${keep.name}`);
      onClose();
    } catch (e) {
      console.error(e);
      setError(mergeErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const blocked = preview ? mergeBlockText(preview.reason, preview.keep.name, preview.drop.name) : null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Juntar a ${player.name} con…`}
      subtitle={!otherPlayer ? 'Elige al otro: todo pasa a uno solo' : undefined}
      footer={
        otherPlayer ? (
          <Button variant="primary" size="xl" full icon={<Merge size={20} color={c.accentFg} />} loading={busy} disabled={!preview?.canMerge || loading} onPress={() => void merge()}>
            Juntar
          </Button>
        ) : undefined
      }
    >
      {!otherPlayer ? (
        <View style={{ gap: 12 }}>
          {candidates.length >= 8 && (
            <View style={{ justifyContent: 'center' }}>
              <Search size={18} color={c.muted} style={{ position: 'absolute', left: 14, zIndex: 1 }} />
              <Input value={q} onChangeText={setQ} placeholder="Buscar jugador" accessibilityLabel="Buscar jugador" style={{ paddingLeft: 42 }} />
            </View>
          )}
          <View style={{ marginHorizontal: -20 }}>
            {shown.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`${p.name}. ${p.uid ? 'Con cuenta' : p.isMinor ? 'Menor' : 'Sin cuenta'}`}
                onPress={() => pick(p.id)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
              >
                <Avatar name={p.name} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Txt variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {p.name}
                    </Txt>
                    {!!p.uid && <BadgeCheck size={16} color={c.accent} accessibilityLabel="Con cuenta" />}
                  </View>
                  <Txt variant="meta" tone="muted">
                    {p.uid ? 'Con cuenta' : p.isMinor ? 'Menor' : 'Sin cuenta'}
                  </Txt>
                </View>
              </Pressable>
            ))}
            {shown.length === 0 && (
              <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
                {candidates.length ? 'Nadie se llama así en la lista.' : 'No hay nadie más en la lista.'}
              </Txt>
            )}
          </View>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOther(null);
              setError(null);
            }}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, alignSelf: 'flex-start' }}
          >
            <ArrowLeft size={16} color={c.accent} />
            <Txt tone="accent" style={{ fontSize: 14 }}>
              Elegir a otro
            </Txt>
          </Pressable>
          <View accessibilityRole="radiogroup" accessibilityLabel="¿Con qué nombre queda?" style={{ gap: 8 }}>
            <Txt variant="meta" style={{ fontWeight: '500' }}>
              ¿Con qué nombre queda?
            </Txt>
            {[player, otherPlayer].map((p) => {
              const mine = p.id === player.id;
              return (
                <ChoiceRow
                  key={p.id}
                  icon={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Avatar name={p.name} size={32} />
                      {!!p.uid && <BadgeCheck size={16} color={c.accent} accessibilityLabel="Con cuenta" />}
                    </View>
                  }
                  title={p.name}
                  selected={mine === keepMine}
                  onPress={() => chooseKeep(mine)}
                />
              );
            })}
          </View>
          <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
            {loading && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={c.muted} />
                <Txt variant="meta" tone="muted">
                  Revisando si se pueden juntar…
                </Txt>
              </View>
            )}
            {!!blocked && (
              <Problem>
                <Txt variant="meta" tone="danger">
                  {blocked}
                </Txt>
              </Problem>
            )}
            {!!preview && !blocked && preview.conflicts.length > 0 && (
              <Problem>
                <Txt variant="meta" tone="danger">
                  Los dos jugaron lo mismo, y así no se pueden juntar:
                </Txt>
                {preview.conflicts.map((x) => (
                  <Txt key={x.what} variant="meta" tone="danger">
                    {`•  ${x.label} (${x.count})`}
                  </Txt>
                ))}
                <Txt variant="meta" tone="danger">
                  Quita lo repetido (borra uno de los dos resultados) y junta otra vez.
                </Txt>
              </Problem>
            )}
            {!!preview?.canMerge && (
              <View style={[styles.summary, { backgroundColor: c.surface2 }]}>
                <Txt variant="meta" tone="fg2">
                  {mergeSummary(preview)}
                </Txt>
              </View>
            )}
            {!!(answer?.error ?? error) && (
              <Problem>
                <Txt variant="meta" tone="danger">
                  {answer?.error ?? error}
                </Txt>
              </Problem>
            )}
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: size.row, paddingHorizontal: 20, paddingVertical: 8 },
  problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  summary: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
});
