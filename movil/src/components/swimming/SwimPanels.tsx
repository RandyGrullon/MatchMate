/**
 * Las partes del encuentro que se miran (de la web: ProgramPanel, HeatSheetPanel y ResultsPanel con ScoresPanel), con
 * la misma lógica (src/pages/sports/swimming/logic.ts). Armar el programa y las series, publicarlas y compartir las
 * imágenes de los resultados se quedan en la web.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ListChecks, ListOrdered, Medal, Rows3 } from 'lucide-react-native';
import type { SwimClub } from '@mm/lib/data/swimming';
import { useLeagueCtx } from '@mm/lib/league';
import { GENDER_LABEL, type MedalRow } from '@mm/sports/swimming';
import {
  groupLabel,
  meetScores,
  pointsText,
  publishedHeats,
  raceDetail,
  raceName,
  raceTitle,
  resultsByEvent,
  scores,
  type MeetData,
} from '@mm/pages/sports/swimming/logic';
import { Card, Empty, ListRow, SectionHeader, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { ClubPointsCard, ClubTag, Lines, NumBox, PillPicker, PosNum, StatusBadge, TuTag, openSwimmer, swimTime } from './parts';

/** El título de una tarjeta de categoría o de serie («FEMENINO · 9-10», «SERIE 1 DE 2»). */
function CardLabel({ children }: { children: string }) {
  return (
    <Txt tone="muted" style={styles.cardLabel}>
      {children.toUpperCase()}
    </Txt>
  );
}

/** El programa: las pruebas en orden (el número, la prueba, para quién y cuántos van). Cambiarlo, en la web. */
export function ProgramPanel({ data }: { data: MeetData }) {
  const c = useColors();
  const { events, entries } = data;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.swimEventId, (m.get(e.swimEventId) ?? 0) + 1);
    return m;
  }, [entries]);
  if (!events.length) return <Empty icon={<ListChecks size={28} color={c.accent} />} title="Todavía no hay pruebas" text="El organizador está armando el programa." />;
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title={events.length === 1 ? '1 prueba' : `${events.length} pruebas`} />
      <Lines>
        {events.map((ev) => {
          const n = counts.get(ev.id) ?? 0;
          return <ListRow key={ev.id} chevron={false} icon={<NumBox n={ev.num} />} title={raceName(ev)} subtitle={`${raceDetail(ev)} · ${n === 1 ? '1 inscrito' : `${n} inscritos`}`} />;
        })}
      </Lines>
      <Txt tone="muted" style={{ fontSize: 13, marginHorizontal: 4 }}>
        Finales por tiempo: en cada serie nadan juntas las categorías; el puesto es por categoría.
      </Txt>
    </View>
  );
}

/** La hoja de series publicada: cada prueba con sus series y una fila por carril (tu carril, resaltado). */
export function HeatSheetPanel({ data }: { data: MeetData }) {
  const c = useColors();
  const { myPlayerId } = useLeagueCtx();
  const { meet, events, entries } = data;
  const withEntries = events.filter((ev) => entries.some((e) => e.swimEventId === ev.id));
  if (!withEntries.length) {
    return <Empty icon={<Rows3 size={28} color={c.accent} />} title="Sin inscritos todavía" text="La hoja de series se arma con los inscritos de cada prueba." />;
  }
  if (!meet.heatsPublishedAt) {
    return <Empty icon={<Rows3 size={28} color={c.accent} />} title="La hoja de series todavía no está" text="El organizador la publica antes del encuentro." />;
  }
  return (
    <View style={{ gap: 26 }}>
      {withEntries.map((ev) => {
        const pub = publishedHeats(ev, entries, meet.lanes);
        return (
          <View key={ev.id} style={{ gap: 10 }}>
            <SectionHeader title={raceTitle(ev)} />
            {pub.unassigned.length > 0 && (
              <Txt tone="warn" style={{ fontSize: 13, marginHorizontal: 4 }}>
                {`${pub.unassigned.length === 1 ? '1 inscrito sin serie' : `${pub.unassigned.length} inscritos sin serie`} (se inscribieron después).`}
              </Txt>
            )}
            {pub.heats.map((h) => (
              <Card key={h.n} padded={false}>
                <CardLabel>{`Serie ${h.n} de ${pub.heats.length}`}</CardLabel>
                {h.lanes.map((l) => {
                  const me = !!myPlayerId && l.entry?.playerId === myPlayerId;
                  return (
                    <View key={l.lane} style={[styles.row, me && { backgroundColor: c.accentSoft }]}>
                      <NumBox n={l.lane} strong={me} />
                      {l.entry ? (
                        <>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Txt numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 15 }}>
                              {data.name(l.entry.playerId)}
                            </Txt>
                            <ClubTag club={l.entry.clubId ? data.clubs.get(l.entry.clubId) : null} short />
                          </View>
                          <Txt tone="muted" style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
                            {swimTime(l.entry.seed)}
                          </Txt>
                        </>
                      ) : (
                        <Txt tone="faint" style={{ flex: 1, fontSize: 14 }}>
                          Libre
                        </Txt>
                      )}
                    </View>
                  );
                })}
              </Card>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Resultados por prueba y categoría: el puesto, el nadador (tú, resaltado), su club y el tiempo con sus puntos (DQ, DNS
 * y DNF al final, sin puesto). Con más de 2 pruebas, «Todas las pruebas ▾» para ver una.
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
          <SectionHeader title={raceTitle(ev)} />
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
      <ClubPointsCard rows={s.clubs} clubs={clubs} caption={`Por puesto: ${meet.points.join('-')}. En un empate se reparten.${meet.finalizedAt ? '' : ' Provisional hasta finalizar.'}`} />
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
