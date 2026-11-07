import { useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Inbox } from 'lucide-react-native';
import { useAllEntries, useEvents, usePlayers, useSubmissions } from '@mm/lib/data';
import { useLeagueCtx } from '@mm/lib/league';
import {
  EMPTY_TEXT,
  EMPTY_TITLE,
  LIST_HINT,
  approveAllPrompt,
  approvedAllText,
  listTitle,
  showEventOf,
  sortSubmissions,
  targetEvent,
} from '@mm/pages/approvals';
import { useBusy } from '@/components/bowlingTeams/parts';
import { confirmAsync, toast } from '@/components/feedback';
import { Card, Empty, LoadError, Loading, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { SubmissionRow, type Approver } from './SubmissionRow';

/**
 * Organizar › Aprobar juegos (ApprovalsPage de la web, con su lógica: src/pages/approvals.ts): los envíos de los
 * jugadores (lo más viejo primero) en una tarjeta, con «Por aprobar · 2 con foto» y «Aprobar todo» arriba; cada uno con
 * su foto, «Juego 2 · 181», Rechazar y Aprobar, y al tocarlo la foto, lo que leyó la IA, los cuadros y los juegos para
 * corregir. Lo aprobado cuenta en la tabla y en las estadísticas; lo pendiente no suma. Va dentro de LeagueScope.
 */
export function ApprovalsPanel() {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const subs = useSubmissions(lid, 'pendiente');
  const events = useEvents(lid);
  const players = usePlayers(lid);
  const entries = useAllEntries(lid);
  const all = useBusy();
  // Cada envío se anota (y se quita al irse): lo que tiene puesto ahora.
  const approvers = useRef(new Map<string, () => Approver>());
  const running = all.isBusy();

  const sorted = sortSubmissions(subs.data);
  // De más de un evento (o fecha): cada envío dice de cuál es.
  const showEvent = showEventOf(sorted);

  function register(id: string, get: () => Approver) {
    approvers.current.set(id, get);
    return () => {
      if (approvers.current.get(id) === get) approvers.current.delete(id);
    };
  }

  async function approveAll() {
    const list = [...approvers.current.values()].map((get) => get());
    const ready = list.filter((a) => a.ready);
    if (!ready.length) return;
    const games = ready.reduce((n, a) => n + a.games, 0);
    const left = list.length - ready.length;
    const ok = await confirmAsync(approveAllPrompt(ready.length, games, left));
    if (!ok) return;
    await all.run('todo', async () => {
      let done = 0;
      let saved = 0;
      for (const a of ready) {
        if (await a.approve()) {
          done++;
          saved += a.games;
        }
      }
      if (done) toast(approvedAllText(saved, done));
    });
  }

  if (subs.error) return <LoadError error={subs.error} />;
  if (subs.loading || events.loading || players.loading) return <Loading />;
  if (!sorted.length) return <Empty icon={<Inbox size={28} color={c.accent} />} title={EMPTY_TITLE} text={EMPTY_TEXT} />;

  return (
    <View style={{ gap: 12 }}>
      <Card padded={false}>
        <View style={styles.head}>
          <View style={[styles.dot, { backgroundColor: c.warn }]} />
          <Txt style={{ flex: 1, color: c.warn, fontFamily: font.semibold, fontSize: 14, paddingVertical: 4 }}>{listTitle(sorted)}</Txt>
          {/* Mientras corre se queda (con su ruedita) aunque ya quede uno solo. */}
          {(sorted.length > 1 || running) && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: running, busy: running }}
              disabled={running}
              onPress={() => void approveAll()}
              style={({ pressed }) => [styles.all, { opacity: running ? 0.6 : pressed ? 0.7 : 1 }]}
            >
              {running && <ActivityIndicator size="small" color={c.accent} />}
              <Txt tone="accent" style={{ fontFamily: font.semibold, fontSize: 14 }}>
                Aprobar todo
              </Txt>
            </Pressable>
          )}
        </View>
        {sorted.map((s, i) => {
          // Envío por fecha: va a la práctica de ese día si ya existe (si no, se crea al aprobar).
          const event = targetEvent(s, events.data);
          return (
            <SubmissionRow
              key={s.id}
              sub={s}
              event={event}
              events={events.data}
              showEvent={showEvent}
              player={players.data.find((p) => p.id === s.playerId)}
              entry={event ? (entries.data.find((e) => e.eventId === event.id && e.playerId === s.playerId) ?? null) : null}
              running={running}
              register={register}
              first={i === 0}
            />
          );
        })}
      </Card>
      <Txt variant="meta" tone="muted" style={{ marginHorizontal: 4 }}>
        {LIST_HINT}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingTop: 6, paddingLeft: 16, paddingRight: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  all: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
});
