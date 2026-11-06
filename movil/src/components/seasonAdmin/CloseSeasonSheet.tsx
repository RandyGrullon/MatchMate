import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Flag, Plus, Trash2 } from 'lucide-react-native';
import { closeSeason } from '@mm/lib/data/seasonAdmin';
import { useLeagueCtx } from '@mm/lib/league';
import type { Season } from '@mm/lib/seasons';
import { leagueSport } from '@mm/sports/registry';
import { awardOptions, awardTeamWord, closeSeasonNotes, optionalAward, seasonErrorText } from '@mm/components/season/adminLogic';
import { AWARD_LABEL, awardsArg, awardsProblem, initialAwards, newOtherAward, parseSnapshot, type AwardDraft, type SeasonTableResult } from '@mm/components/season/logic';
import { confirmAsync, toast } from '@/components/feedback';
import { Button, Field, Input, Loading, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { AwardeePick } from './parts';
import { SnapshotTables } from './SnapshotTables';

/**
 * Cerrar (o corregir) la temporada (CloseSeasonModal de la web, con su misma lógica): la tabla final como se va a
 * guardar y los premios. Al corregir una cerrada se guarda la misma tabla y solo cambian los premios (sin avisar otra
 * vez). `table`: la tabla de esa temporada que da el deporte (CloseSeason.tsx). Se monta al abrirse.
 */
export function CloseSeasonSheet({ season, table, onClose }: { season: Season; table: SeasonTableResult; onClose: () => void }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const closed = season.status === 'closed';
  const saved = useMemo(() => (closed ? parseSnapshot(season.standings) : null), [closed, season.standings]);
  const snapshot = saved ?? table.snapshot;
  const [awards, setAwards] = useState<AwardDraft[] | null>(() => (table.loading ? null : initialAwards(snapshot, season, table.suggested, table.podium)));
  const [others, setOthers] = useState(0);
  const [busy, setBusy] = useState(false);
  // Los premios se proponen cuando la tabla termina de cargar (con los datos que ya hay en el teléfono, de una vez).
  if (!awards && !table.loading) setAwards(initialAwards(snapshot, season, table.suggested, table.podium));

  // Quien ya tenía un premio aunque ya no esté en la lista (se borró de un equipo) sigue saliendo.
  const players = useMemo(() => awardOptions(table.players, season.awards, snapshot, 'playerId'), [table.players, season.awards, snapshot]);
  const teams = useMemo(() => awardOptions(table.teams, season.awards, snapshot, 'teamId'), [table.teams, season.awards, snapshot]);

  const teamWord = awardTeamWord(leagueSport(league));
  const problem = awards ? awardsProblem(awards) : null;
  // Un playoff a medias (`running`): su final todavía no se juega y el campeón saldría de la tabla.
  const { fromPlayoff, running, podiumNote } = closeSeasonNotes(season, table.podium);
  const set = (key: string, patch: Partial<AwardDraft>) => setAwards((list) => list?.map((a) => (a.key === key ? { ...a, ...patch } : a)) ?? list);

  const save = async () => {
    if (!awards || problem || busy) return;
    if (
      running &&
      !(await confirmAsync({
        title: '¿Cerrar con los playoffs en juego?',
        message: `La final todavía no se juega. Si cierras ahora, los juegos que falten no cuentan en ${season.name} y el aviso sale con el campeón que elijas.`,
        confirmText: 'Cerrar igual',
        danger: true,
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await closeSeason(lid, season.id, snapshot, awardsArg(awards));
      toast(closed ? 'Premios corregidos' : `${season.name} cerrada: se avisó a la liga`);
      onClose();
    } catch (e) {
      console.error(e);
      toast(seasonErrorText(e, 'Revisa los premios: cada uno tiene que ir a un jugador o equipo de la liga.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={closed ? `Corregir ${season.name}` : `Cerrar ${season.name}`}
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button size="lg" onPress={onClose}>
            Cancelar
          </Button>
          <View style={{ flex: 1 }}>
            <Button variant="primary" size="lg" full loading={busy} disabled={!awards || !!problem} icon={<Flag size={18} color={c.accentFg} />} onPress={() => void save()}>
              {closed ? 'Guardar premios' : 'Cerrar temporada'}
            </Button>
          </View>
        </View>
      }
    >
      <View style={{ gap: 20, paddingBottom: 4 }}>
        <Txt tone="muted" style={{ fontSize: 14 }}>
          {closed
            ? saved
              ? 'La tabla guardada no cambia. Los premios se reemplazan y no se avisa otra vez a la liga.'
              : 'No tenía tabla guardada: se guarda la de sus juegos, como está hoy. Los premios se reemplazan y no se avisa otra vez a la liga.'
            : `Se guarda la tabla como está hoy y se avisa a la liga. Los juegos que se jueguen después de hoy ya no cuentan en ${season.name}.`}
        </Txt>
        {running && (
          <View accessibilityRole="alert" style={[styles.warn, { borderColor: c.warn, backgroundColor: c.warnSoft }]}>
            <Txt tone="warn" style={{ fontSize: 14 }}>
              Los playoffs no han terminado: el campeón saldrá de la final. Si cierras ahora, los juegos que falten no cuentan en esta temporada.
            </Txt>
          </View>
        )}

        <View style={{ gap: 8 }}>
          <Txt tone="muted" accessibilityRole="header" style={styles.section}>
            Tabla final
          </Txt>
          {table.loading && !saved ? (
            <Loading />
          ) : snapshot.tables.length ? (
            <SnapshotTables snapshot={snapshot} />
          ) : (
            <View style={[styles.note, { backgroundColor: c.surface2 }]}>
              <Txt tone="muted" style={{ fontSize: 14 }}>
                Todavía no hay resultados en esta temporada: se guarda sin tabla.
              </Txt>
            </View>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <Txt tone="muted" accessibilityRole="header" style={styles.section}>
            Premios
          </Txt>
          {fromPlayoff && (
            <Txt tone="muted" style={{ fontSize: 12 }}>
              El campeón y el subcampeón salen de la final del playoff. Puedes cambiarlos.
            </Txt>
          )}
          {!!podiumNote && (
            <Txt tone="muted" style={{ fontSize: 12 }}>
              {podiumNote}
            </Txt>
          )}
          {!awards ? (
            <Loading />
          ) : (
            <>
              {awards.map((a) =>
                a.kind === 'otro' ? (
                  <View key={a.key} style={[styles.other, { borderColor: c.line }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Field label="Premio">
                          <Input value={a.label} maxLength={40} placeholder="Mejor portero" accessibilityLabel="Premio" onChangeText={(label) => set(a.key, { label })} />
                        </Field>
                      </View>
                      <Button
                        variant="ghost"
                        accessibilityLabel="Quitar este premio"
                        icon={<Trash2 size={18} color={c.danger} />}
                        onPress={() => setAwards((list) => list?.filter((x) => x.key !== a.key) ?? list)}
                        style={{ marginBottom: 6 }}
                      />
                    </View>
                    <AwardeePick value={a.ref} onChange={(v) => set(a.key, { ref: v })} teams={teams} players={players} label={a.label || 'Otro premio'} teamWord={teamWord} />
                    <Input value={a.note} maxLength={200} placeholder="Nota (opcional)" accessibilityLabel="Nota" onChangeText={(note) => set(a.key, { note })} />
                  </View>
                ) : (
                  <View key={a.key} style={{ gap: 6 }}>
                    <Txt tone={a.kind === 'campeon' ? 'fg' : 'muted'} style={{ fontSize: 13, fontFamily: font.medium }}>
                      {`${AWARD_LABEL[a.kind]}${optionalAward(a.kind) ? ' (opcional)' : ''}`}
                    </Txt>
                    <AwardeePick value={a.ref} onChange={(v) => set(a.key, { ref: v })} teams={teams} players={players} label={AWARD_LABEL[a.kind]} teamWord={teamWord} />
                  </View>
                ),
              )}
              <Button
                icon={<Plus size={18} color={c.fg} />}
                style={{ alignSelf: 'flex-start' }}
                onPress={() => {
                  setAwards((list) => [...(list ?? []), newOtherAward(others)]);
                  setOthers((n) => n + 1);
                }}
              >
                Otro premio
              </Button>
              {!!problem && (
                <Txt tone="warn" style={{ fontSize: 14 }}>
                  {problem}
                </Txt>
              )}
            </>
          )}
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 14, fontFamily: font.semibold },
  warn: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 8 },
  note: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  other: { gap: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
});
