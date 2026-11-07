import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { approveSubmission, rejectSubmission } from '@mm/lib/data/submissions';
import { fetchEffectiveAverages } from '@mm/lib/data/players';
import { saveErrorMessage } from '@mm/lib/errorText';
import type { BowlingEvent, Entry, League, Player, Submission } from '@mm/lib/types';
import { approvalTitle, gamesText, quickApproval, type QuickApproval } from '@mm/components/event/approvalLogic';
import { gamesList, shortName } from '@mm/components/event/board';
import { PhotoSheet, PhotoThumb, RejectSheet, RowButton } from '@/components/approvals/parts';
import { toast } from '@/components/feedback';
import { Card, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/**
 * «Por aprobar» en el evento, para quien organiza (ApprovalCard de la web): cada envío de los jugadores con su foto (se
 * toca para verla en grande), quién y qué juego, y Rechazar / Aprobar ahí mismo; arriba, «Aprobar todo». Lo que no se
 * puede aprobar con un toque (no coincide con la foto, sin la foto que se exige…) lleva «Revisar», que abre Organizar ›
 * Aprobar juegos (/l/<liga>/aprobar). La lógica es la de la web (src/components/event/approvalLogic.ts); las piezas
 * (botones, foto, rechazar), las de components/approvals/parts.tsx.
 */
export function ApprovalCard({
  league,
  event,
  subs,
  entries,
  players,
}: {
  league: League;
  event: BowlingEvent;
  subs: readonly Submission[];
  entries: readonly Entry[];
  players: readonly Player[];
}) {
  const c = useColors();
  const lid = league.id;
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ id: string; title: string } | null>(null);
  const requirePhoto = league.requirePhoto !== false;
  const byId = new Map(players.map((p) => [p.id, p]));
  const rows = subs
    .filter((s) => s.status === 'pendiente' && byId.has(s.playerId))
    .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
    .map((sub) => ({ sub, player: byId.get(sub.playerId)!, quick: quickApproval(sub, event.games, requirePhoto) }));
  if (!rows.length) return null;
  const quick = rows.filter((r) => r.quick);

  async function approve(sub: Submission, player: Player, q: QuickApproval) {
    const entry = entries.find((e) => e.playerId === sub.playerId) ?? null;
    const average = entry ? entry.average : ((await fetchEffectiveAverages(lid, [player], { date: event.date, eventId: event.id })).get(player.id) ?? 0);
    await approveSubmission(lid, sub, event, entry, average, q.values, 0);
  }

  async function approveOne(r: (typeof rows)[number]) {
    if (busy) return;
    setBusy(`ok:${r.sub.id}`);
    try {
      await approve(r.sub, r.player, r.quick!);
      toast(`Aprobado: ${r.quick!.games.length === 1 ? 'juego' : 'juegos'} ${gamesList(r.quick!.games)} de ${r.player.name}`);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function approveAll() {
    if (busy) return;
    setBusy('todo');
    let n = 0;
    try {
      for (const r of quick) {
        await approve(r.sub, r.player, r.quick!);
        n += r.quick!.games.length;
      }
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
    if (n) toast(`Aprobados ${n} ${n === 1 ? 'juego' : 'juegos'}`);
  }

  async function reject() {
    const sub = rejecting;
    if (!sub) return;
    setRejecting(null);
    setBusy(`no:${sub.id}`);
    try {
      await rejectSubmission(lid, sub, note.trim() || null);
      toast('Envío rechazado');
      setNote('');
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={{ gap: 4 }}>
      <View accessibilityLabel="Por aprobar" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.warn }} />
          <Txt numberOfLines={1} style={{ color: c.warn, fontFamily: font.semibold, fontSize: 14, flex: 1 }}>
            {approvalTitle(rows.map((r) => r.sub))}
          </Txt>
        </View>
        {quick.length > 1 && (
          <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => void approveAll()} hitSlop={8} style={{ opacity: busy ? 0.6 : 1 }}>
            <Txt tone="accent" style={{ fontFamily: font.semibold, fontSize: 14 }}>
              {busy === 'todo' ? 'Aprobando…' : 'Aprobar todo'}
            </Txt>
          </Pressable>
        )}
      </View>
      {rows.map((r, i) => {
        // En el teléfono, «J1 y J2 · 181 · 204» (la forma corta de la web en pantallas angostas): el número no se corta.
        const { label, short, scores } = gamesText(r.sub, r.quick);
        return (
          <View key={r.sub.id} style={[styles.row, i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null]}>
            <PhotoThumb lid={lid} photoId={r.sub.photoId} name={r.player.name} onOpen={() => r.sub.photoId && setPhoto({ id: r.sub.photoId, title: `${r.player.name} · ${label}` })} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1} style={{ fontSize: 15 }}>
                {shortName(r.player.name)}
              </Txt>
              <Txt tone="muted" numberOfLines={2} style={{ fontSize: 13 }}>
                {`${short} · `}
                <Txt style={{ fontSize: 13, fontFamily: font.semibold, color: c.fg }}>{scores}</Txt>
              </Txt>
            </View>
            <RowButton
              label={`Rechazar ${label.toLowerCase()} de ${r.player.name}`}
              disabled={!!busy}
              busy={busy === `no:${r.sub.id}`}
              onPress={() => setRejecting(r.sub)}
            >
              Rechazar
            </RowButton>
            {r.quick ? (
              <RowButton accent label={`Aprobar ${label.toLowerCase()} de ${r.player.name}`} disabled={!!busy} busy={busy === `ok:${r.sub.id}`} onPress={() => void approveOne(r)}>
                Aprobar
              </RowButton>
            ) : (
              <RowButton accent label={`Revisar el envío de ${r.player.name}`} onPress={() => router.push({ pathname: '/l/[lid]/aprobar', params: { lid } })}>
                Revisar
              </RowButton>
            )}
          </View>
        );
      })}

      <RejectSheet open={rejecting != null} note={note} onNote={setNote} onClose={() => setRejecting(null)} onReject={() => void reject()} />
      <PhotoSheet lid={lid} photo={photo} onClose={() => setPhoto(null)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
});
