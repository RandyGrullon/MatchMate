/**
 * El anotador de mesa en la app (OfficialsList.tsx y OfficialSheet / OfficialPicker de MatchAdminPanel.tsx de la web,
 * con su lógica: calendarAdmin.ts y scorerCandidates de logic.ts): los partidos por jugar con su anotador designado
 * como filas; tocar una abre la hoja para elegirlo. Si termina el partido quien está designado, el resultado queda final.
 * Se puede designar a un admin, a un anotador de la liga o al capitán o delegado de uno de los dos equipos.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Check, UserCheck } from 'lucide-react-native';
import type { Match } from '@mm/lib/data/matches';
import { setMatchOfficial, type MatchOfficial } from '@mm/lib/data/teamSports';
import { officialChoices, officialMatches, officialRowWhen, officialRowWho } from '@mm/pages/sports/team/calendarAdmin';
import { sideNames } from '@mm/pages/sports/team/lists';
import { scorerCandidates, type ScorerCandidate } from '@mm/pages/sports/team/logic';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { todayIn, vsTitle } from '@mm/pages/sports/team/view';
import { useBusy } from '@/components/bowlingTeams/parts';
import { Card, Empty, Sheet, Txt } from '@/components/ui';
import { act, Row, ToneIcon } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Organizar: los partidos por jugar con su anotador de mesa designado. */
export function OfficialsList({ tl }: { tl: TeamLeague }) {
  const open = officialMatches(tl.matches.data);
  const [editing, setEditing] = useState<string | null>(null);
  const match = editing ? (open.find((m) => m.id === editing) ?? null) : null;
  if (!open.length) return <Empty title="No hay partidos por jugar" text="Arma el calendario o crea un partido suelto." />;
  const today = todayIn(tl.tz);
  return (
    <>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {open.map((m, i) => {
          const official = tl.officialOf(m.id);
          const names = sideNames(tl, m);
          return (
            <Row
              key={m.id}
              top={i === 0}
              leading={<ToneIcon icon={UserCheck} accent={!!official} />}
              title={vsTitle(names)}
              subtitle={
                <View>
                  <Txt variant="meta" tone="muted" numberOfLines={1}>
                    {officialRowWhen(m, tl.tz, today)}
                  </Txt>
                  <Txt variant="meta" tone="fg2" style={{ fontFamily: font.semibold }} numberOfLines={1}>
                    {officialRowWho(official)}
                  </Txt>
                </View>
              }
              onPress={() => setEditing(m.id)}
              accessibilityLabel={`Anotador de mesa de ${names[0]} vs. ${names[1]}`}
            />
          );
        })}
      </Card>
      {match && <OfficialSheet tl={tl} match={match} open onClose={() => setEditing(null)} />}
    </>
  );
}

/** La hoja «Anotador de mesa» de un partido (también la usa el «•••» del partido). */
export function OfficialSheet({ tl, match: m, open, onClose }: { tl: TeamLeague; match: Match; open: boolean; onClose: () => void }) {
  const official = tl.officialOf(m.id);
  const candidates = scorerCandidates(m, tl.allTeams.data, tl.members.data, tl.players.data);
  const names = sideNames(tl, m);
  return (
    <Sheet open={open} onClose={onClose} title="Anotador de mesa" subtitle={`${names[0]} vs. ${names[1]}`}>
      <OfficialPicker tl={tl} match={m} official={official} candidates={candidates} onDone={onClose} />
      <Txt variant="small" tone="muted">
        Si termina el partido quien está designado, el resultado queda final. Para otra persona, hazla anotadora en Miembros.
      </Txt>
    </Sheet>
  );
}

/** La lista para elegir al anotador: tocar uno lo designa (o «Sin designar» lo quita). */
export function OfficialPicker({ tl, match: m, official, candidates, onDone }: { tl: Pick<TeamLeague, 'lid'>; match: Pick<Match, 'id'>; official: MatchOfficial | null; candidates: readonly ScorerCandidate[]; onDone?: () => void }) {
  const c = useColors();
  const saving = useBusy();
  const list = officialChoices(official, candidates);
  const current = official?.userId ?? '';
  const choose = (uid: string) =>
    saving.run(uid || 'nadie', async () => {
      if (uid === current) return onDone?.();
      const ok = await act(async () => {
        await setMatchOfficial(tl.lid, m.id, uid || null);
        return true;
      }, uid ? 'Anotador de mesa designado' : 'Sin anotador designado');
      if (ok) onDone?.();
    });
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Anotador de mesa">
      {list.map((o) => {
        const on = o.uid === current;
        const key = o.uid || 'nadie';
        return (
          <Pressable
            key={key}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, disabled: saving.isBusy() }}
            disabled={saving.isBusy()}
            onPress={() => void choose(o.uid)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 8, backgroundColor: pressed ? c.surface2 : 'transparent', opacity: saving.isBusy() && !saving.isBusy(key) ? 0.7 : 1 })}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {o.name}
              </Txt>
              <Txt variant="small" tone="muted" numberOfLines={1}>
                {o.why}
              </Txt>
            </View>
            <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.accent : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: c.faint }}>
              {saving.isBusy(key) ? <ActivityIndicator size="small" color={on ? c.accentFg : c.faint} /> : on ? <Check size={16} strokeWidth={2.6} color={c.accentFg} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
