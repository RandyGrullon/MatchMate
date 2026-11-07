import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { saveGame, useEvent, useEventEntries, usePlayers } from '@mm/lib/data';
import { getUserId } from '@mm/lib/data/client';
import { canScoreEvent, useLeagueCtx } from '@mm/lib/league';
import { slots } from '@mm/lib/stats';
import type { GameFrames } from '@mm/lib/types';
import { tableGameKey } from '@mm/components/frames/draftMemory';
import { isRealPhoto, nextOpenGame } from '@mm/components/event/sheet';
import { runAction } from '@/components/swimming/parts';
import { Button, Empty, LoadError, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { ScoreEntry } from './ScoreEditor';

/**
 * Anotarle a otro un juego desde la Planilla (la hoja de anotar de GamesTab en la web): la misma pantalla de anotar
 * (pines, teclado o total), con J1…Jn arriba para cambiar de juego y, si el juego ya está verificado con foto, el aviso
 * de que vuelve a borrador. Lo anotado sin guardar queda en el teléfono por fila y juego (tableGameKey). Al guardar va
 * a la tabla (saveGame, por la cola) y sigue con el próximo juego sin anotar, o se cierra. Va dentro de LeagueScope.
 */
export function RowScoreEditor({ eventId, entryId, game }: { eventId: string; entryId: string; game: number }) {
  const c = useColors();
  const ctx = useLeagueCtx();
  const { lid, league } = ctx;
  const event = useEvent(lid, eventId);
  const entries = useEventEntries(lid, eventId);
  const players = usePlayers(lid);
  const ev = event.data;
  const entry = entries.data.find((e) => e.id === entryId);
  const error = event.error ?? entries.error;
  if (error) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadError error={error} />
      </Screen>
    );
  }
  if ((event.loading && !ev) || (entries.loading && !entry)) return <Loading label="Abriendo el juego" />;
  if (!ev || !entry) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Empty title="Este juego ya no está en la planilla" action={<Button onPress={() => router.back()}>Volver</Button>} />
      </Screen>
    );
  }
  if (!canScoreEvent(ctx, ev.type)) {
    return (
      <Screen edges={['top', 'bottom']}>
        <LoadError error={new Error('permission-denied')} />
      </Screen>
    );
  }

  const requirePhoto = league.requirePhoto !== false;
  const index = Math.min(Math.max(0, game), ev.games - 1);
  const scores = slots(entry.scores, ev.games, null);
  const verified = isRealPhoto(slots(entry.photos, ev.games, null)[index]);
  const name = players.data.find((p) => p.id === entry.playerId)?.name ?? '(jugador borrado)';
  const pickGame = (i: number) => router.setParams({ juego: String(i + 1) });

  async function save(value: { score: number; frames: GameFrames | null }) {
    const ok = await runAction(async () => {
      await saveGame(lid, ev!, entry!, index, value, requirePhoto);
      return true;
    }, `Juego ${index + 1} guardado`);
    // No se guardó: lo anotado sigue en la memoria del teléfono.
    if (!ok) return false;
    // Sigue con el próximo juego sin anotar, o cierra.
    const next = nextOpenGame(scores, index);
    if (next >= 0) pickGame(next);
    else router.back();
    return true;
  }

  return (
    <ScoreEntry
      key={`${entry.id}-${index}`}
      title={`${name} · Juego ${index + 1}`}
      memoryKey={tableGameKey(getUserId(), lid, ev.id, entry.id, index)}
      initial={{ score: scores[index], frames: entry.frames?.[index] ?? null }}
      ball={null}
      onSave={save}
      onClose={() => router.back()}
      top={
        ev.games > 1 ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {Array.from({ length: ev.games }, (_, i) => {
              const on = i === index;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Juego ${i + 1}`}
                  onPress={() => pickGame(i)}
                  style={{ flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : c.surface2 }}
                >
                  <Txt style={{ fontFamily: font.semibold, fontSize: 14, color: on ? c.accentFg : c.muted }}>{`J${i + 1}`}</Txt>
                </Pressable>
              );
            })}
          </View>
        ) : undefined
      }
      note={
        verified && requirePhoto ? (
          <View style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: c.warnSoft }}>
            <Txt variant="small" style={{ color: c.warn }}>
              Este juego ya está verificado con foto: si lo cambias vuelve a borrador.
            </Txt>
          </View>
        ) : undefined
      }
    />
  );
}
