/**
 * Los resultados del encuentro (de la web: ResultsPanel con ScoresPanel), con la misma lógica
 * (src/pages/sports/swimming/logic.ts) y compartir la imagen de cada prueba y de los puntos por club (share.ts). El
 * programa (ProgramPanel.tsx) y la hoja de series (HeatSheet.tsx) están aparte.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ListOrdered, Medal } from 'lucide-react-native';
import type { SwimClub } from '@mm/lib/data/swimming';
import { useLeagueCtx } from '@mm/lib/league';
import { GENDER_LABEL, type MedalRow } from '@mm/sports/swimming';
import { groupLabel, meetScores, pointsText, raceName, raceTitle, resultsByEvent, scores, type MeetData } from '@mm/pages/sports/swimming/logic';
import { meetPointsShare, raceShare } from '@mm/pages/sports/swimming/share';
import { Card, Empty, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { ClubPointsCard, ClubTag, PillPicker, PosNum, StatusBadge, TuTag, openSwimmer, swimTime } from './parts';
import { ShareIconButton } from './ShareImage';

export { HeatSheetPanel } from './HeatSheet';
export { ProgramPanel } from './ProgramPanel';

/** El título de una tarjeta de categoría («FEMENINO · 9-10»). */
function CardLabel({ children }: { children: string }) {
  return (
    <Txt tone="muted" style={styles.cardLabel}>
      {children.toUpperCase()}
    </Txt>
  );
}

/**
 * Resultados por prueba y categoría: cada prueba con su título y compartir, y cada categoría con el puesto, el nadador
 * (tú, resaltado), su club y el tiempo con sus puntos (DQ, DNS y DNF al final, sin puesto). Con más de 2 pruebas,
 * «Todas las pruebas ▾» para ver una.
 */
export function ResultsPanel({ data }: { data: MeetData }) {
  const c = useColors();
  const { lid, myPlayerId } = useLeagueCtx();
  const { meet, events, entries, clubs, name } = data;
  const [only, setOnly] = useState<string>('');
  const withResults = useMemo(() => resultsByEvent(events, entries, meet.points), [events, entries, meet.points]);
  const withPoints = scores(meet);

  if (!withResults.length) {
    return <Empty icon={<ListOrdered size={28} color={c.accent} />} title="Todavía no hay resultados" text="Salen aquí apenas se publica cada serie." />;
  }
  const shown = only ? withResults.filter((x) => x.ev.id === only) : withResults;

  return (
    <View style={{ gap: 26 }}>
      {(withResults.length > 2 || !meet.finalizedAt) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: -8 }}>
          {withResults.length > 2 ? (
            <PillPicker label="Prueba" options={[{ key: '', label: 'Todas las pruebas' }, ...withResults.map(({ ev }) => ({ key: ev.id, label: raceTitle(ev) }))]} value={only} onChange={setOnly} />
          ) : (
            <View />
          )}
          {!meet.finalizedAt && (
            <Txt tone="muted" style={{ fontSize: 13 }}>
              Provisionales hasta finalizar
            </Txt>
          )}
        </View>
      )}
      {shown.map(({ ev, groups }) => (
        <View key={ev.id} style={{ gap: 10 }}>
          <SectionHeader
            title={raceTitle(ev)}
            action={<ShareIconButton label={`Compartir los resultados de ${raceName(ev)}`} path={`/l/${lid}/e/${meet.id}?ver=resultados`} card={() => raceShare(data, ev, groups)} />}
          />
          {groups.map((g) => (
            <Card key={g.key} padded={false}>
              <CardLabel>{`${GENDER_LABEL[g.gender]} · ${groupLabel(g.ageGroup)}`}</CardLabel>
              {g.rows.map((r) => {
                const me = !!myPlayerId && r.swimmerId === myPlayerId;
                return (
                  <View key={r.entryId} style={[styles.row, { gap: 12 }, me && { backgroundColor: c.accentSoft }, r.place == null && { opacity: 0.7 }]}>
                    <PosNum pos={r.place} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Pressable accessibilityRole="link" onPress={() => openSwimmer(lid, r.swimmerId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 15, flexShrink: 1 }}>
                          {name(r.swimmerId)}
                        </Txt>
                        {me && <TuTag />}
                      </Pressable>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
                        <ClubTag club={r.teamId ? clubs.get(r.teamId) : null} short />
                        {r.tied && (
                          <Txt tone="muted" style={{ fontSize: 12 }}>
                            empate
                          </Txt>
                        )}
                      </View>
                    </View>
                    <StatusBadge status={r.status} />
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt style={{ fontFamily: font.bold, fontSize: 17, fontVariant: ['tabular-nums'] }}>{swimTime(r.time, '')}</Txt>
                      {withPoints && r.points > 0 && (
                        <Txt tone="muted" style={{ fontSize: 12 }}>
                          {`${pointsText(r.points)} ${r.points === 1 ? 'pt' : 'pts'}`}
                        </Txt>
                      )}
                    </View>
                  </View>
                );
              })}
            </Card>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Puntos por club y medallero del encuentro. */
export function ScoresPanel({ data }: { data: MeetData }) {
  const c = useColors();
  const { meet, events, entries, clubs } = data;
  const s = useMemo(() => meetScores(events, entries, meet.points), [events, entries, meet.points]);
  if (!s.clubs.length && !s.medals.length) {
    return <Empty icon={<Medal size={28} color={c.accent} />} title="Todavía no hay puntos" text="Los puntos por club salen de los resultados de cada prueba." />;
  }
  return (
    <View style={{ gap: 26 }}>
      <ClubPointsCard
        rows={s.clubs}
        clubs={clubs}
        caption={`Por puesto: ${meet.points.join('-')}. En un empate se reparten.${meet.finalizedAt ? '' : ' Provisional hasta finalizar.'}`}
        action={
          s.clubs.length > 0 ? (
            <ShareIconButton label="Compartir los puntos por club" path={`/l/${data.lid}/e/${meet.id}?ver=puntos`} card={() => meetPointsShare(meet, s.clubs, clubs)} />
          ) : undefined
        }
      />
      <MedalsCard rows={s.medals} clubs={clubs} />
    </View>
  );
}

function MedalsCard({ rows, clubs }: { rows: MedalRow[]; clubs: Map<string, SwimClub> }) {
  const c = useColors();
  if (!rows.length) return null;
  const head = (label: string, width: number, last?: boolean) => (
    <Txt tone="muted" style={[styles.th, { width }, last && { marginRight: 20 }]}>
      {label.toUpperCase()}
    </Txt>
  );
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Medallero" />
      <Card padded={false}>
        <View style={[styles.tr, { paddingTop: 14, paddingBottom: 8 }]}>
          <Txt tone="muted" style={[styles.th, { flex: 1, textAlign: 'left', paddingLeft: 20 }]}>
            CLUB
          </Txt>
          {head('Oro', 48)}
          {head('Plata', 48)}
          {head('Bronce', 56)}
          {head('Total', 56, true)}
        </View>
        {rows.map((m) => (
          <View key={m.id} style={[styles.tr, { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20 }}>
              <Txt tone="muted" style={{ width: 16, fontSize: 12, fontVariant: ['tabular-nums'] }}>
                {m.rank}
              </Txt>
              <ClubTag club={clubs.get(m.id) ?? { id: m.id, name: '(club borrado)', short: '', color: null, coachId: null }} size={14} />
            </View>
            <Txt style={[styles.td, { width: 48, fontFamily: font.semibold }]}>{m.gold}</Txt>
            <Txt style={[styles.td, { width: 48 }]}>{m.silver}</Txt>
            <Txt style={[styles.td, { width: 56 }]}>{m.bronze}</Txt>
            <Txt tone="muted" style={[styles.td, { width: 56, marginRight: 20 }]}>
              {m.total}
            </Txt>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  cardLabel: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, fontSize: 12, fontFamily: font.semibold, letterSpacing: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingVertical: 8, paddingLeft: 16, paddingRight: 20 },
  tr: { flexDirection: 'row', alignItems: 'center' },
  th: { fontSize: 12, fontFamily: font.semibold, letterSpacing: 0.7, textAlign: 'center' },
  td: { fontSize: 14, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
