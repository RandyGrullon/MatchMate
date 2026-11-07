/**
 * El torneo de un día de los deportes de equipo en la app (TournamentHub.tsx de la web, con su lógica: tournament.ts,
 * calendarAdmin.ts, src/prizes/sports.ts y src/lib/report/team.ts), sobre todo el «torneo sin liga»:
 * - En el inicio del torneo (`home`) va dentro de la liga: solo «⚡ Torneo relámpago · el día» y, al final, las filas de
 *   «Reporte del torneo» y «Anotadores». Abierto como evento, con su «‹ Liga», «•••» (lo mismo) y su título.
 * - Guía al organizador: 1) los equipos, 2) armar el torneo (grupos de todos contra todos y la eliminatoria, con horas y
 *   canchas; el único botón) y 3) jugar: los partidos por fase y «Pasar a la fase final» cuando terminan los grupos. Los
 *   demás ven los equipos y los partidos. Arriba, los premios del torneo (se entregan cuando cuente la final).
 * En el teléfono, «Los equipos» abre Organizar › Equipos (sus hojas no van dentro de otra hoja).
 */
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Check, ClipboardPen, FileDown, MoreHorizontal, Shirt, Trophy, Zap, type LucideIcon } from 'lucide-react-native';
import { useEvent, useEvents } from '@mm/lib/data/events';
import type { Match } from '@mm/lib/data/matches';
import { teamReportNames, teamNamesOf, KO_WAIT_TEXT } from '@mm/components/prizes/screens';
import { REPORT_MENU_HINT, REPORT_TITLE } from '@mm/components/tournamentReport/view';
import { teamKoReport } from '@mm/lib/report/team';
import { useNow } from '@mm/lib/useNow';
import { koEventOf, teamKoComp, teamKoComplete, teamKoFinished, teamKoProvider } from '@mm/prizes/sports';
import { finishedGroupRanking, stageGroups, tournamentStep, type TournamentStep } from '@mm/pages/sports/team/tournament';
import { teamsStepLine, tournamentMetaLine } from '@mm/pages/sports/team/calendarAdmin';
import { rosterSide } from '@mm/pages/sports/team/logic';
import type { TeamLeague } from '@mm/pages/sports/team/useTeamLeague';
import { basketballConfigFrom } from '@mm/pages/sports/basketball/rules';
import { basketballSeason } from '@mm/pages/sports/basketball/season';
import { footballConfigFrom, knockoutRules, matchMinutes, variantOf } from '@mm/pages/sports/football/rules';
import { groupRanking, useFootballSeason, type FootballSeason } from '@mm/pages/sports/football/season';
import { MenuRow } from '@/components/esports/inputs';
import { MatchCard } from '@/components/match/MatchCard';
import { TournamentPrizes } from '@/components/prizes/TournamentPrizes';
import { ScorersSheet } from '@/components/scorers/ScorersSheet';
import { ReportSheet } from '@/components/tournamentReport/ReportSheet';
import { BackBar, Button, Card, Empty, SectionHeader, Sheet, Txt } from '@/components/ui';
import { LogoSpinner } from '@/components/Logo';
import { TeamDot } from '../TeamBits';
import { Row, ToneIcon } from '../admin/parts';
import { TournamentAdvance, TournamentBuilderSheet } from '../admin/TournamentBuilder';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** Un evento como lo necesita la competencia (el del torneo suelto: de él cuelgan los premios). */
export interface KoEvent {
  id: string;
  name: string;
  date: string;
}

/**
 * El evento del torneo relámpago del «torneo sin liga»: el que creó `create_tournament` (`koEventOf`: el primero de tipo
 * torneo), se entre por el inicio o por la ruta de cualquier evento. Es el único con premio, como en la base. null en
 * una liga normal.
 */
export function useKoEvent(tl: TeamLeague): KoEvent | null {
  const standalone = tl.league.kind === 'torneo';
  const events = useEvents(standalone ? tl.lid : undefined);
  const found = standalone ? koEventOf(events.data) : null;
  return found ? { id: found.id, name: found.name, date: found.date } : null;
}

/** Los premios del torneo relámpago: se entregan cuando cuenta la final. */
export function KnockoutPrizes({ tl, event }: { tl: TeamLeague; event: KoEvent | null }) {
  const now = useNow(30_000).getTime();
  const names = teamNamesOf({ nameOf: tl.nameOf, teamOf: tl.teamOf });
  const matches = tl.matches.data;
  const comp = teamKoComp(tl.lid, { kind: tl.league.kind ?? 'liga', sport: tl.league.sport ?? 'football', event, leagueName: tl.league.name });
  if (!comp || !event) return null;
  return (
    <TournamentPrizes comp={comp} ready={teamKoFinished(matches, now)} waitText={KO_WAIT_TEXT} podium={teamKoProvider(matches, names, now)} webPath={`/l/${tl.lid}/e/${event.id}`} />
  );
}

/** La tarjeta de un partido del torneo (abre el partido). */
export function TournamentMatchCard({ tl, match: m, now }: { tl: TeamLeague; match: Match; now: number }) {
  return (
    <MatchCard
      match={m}
      mySide={rosterSide(m, tl.allTeams.data, tl.myPlayerId)}
      tz={tl.tz}
      now={now}
      roundWord="Jornada"
      onPress={() => router.push({ pathname: '/l/[lid]/partido/[matchId]', params: { lid: tl.lid, matchId: m.id } })}
    />
  );
}

export interface TeamTournamentProps {
  tl: TeamLeague;
  /** El inicio del torneo (dentro de la liga, sin barra propia); si no, abierto como evento. */
  home: boolean;
  title: string;
  /** 'YYYY-MM-DD' (el día del torneo). */
  date?: string | null;
  announcement?: string | null;
  /** matches.format del deporte. */
  format?: string;
  /** Minutos por turno (el partido con su descanso). */
  slotMinutes?: number;
  /** Reglas de la eliminatoria (p. ej. penales si empatan). */
  knockoutRules?: Record<string, unknown>;
  /** Tabla final de un grupo (ids en orden) o null si todavía no termina. */
  rankGroup: (stage: string) => string[] | null;
  renderMatch: (m: Match) => ReactNode;
  /** El evento del torneo suelto (de él cuelgan los premios del torneo). */
  event?: KoEvent | null;
  /** Fútbol y sala: la temporada ya calculada (goleadores y sanciones del comité), para el reporte del torneo. */
  footballSeason?: FootballSeason;
}

interface MenuItem {
  key: 'reporte' | 'anotadores';
  icon: LucideIcon;
  label: string;
  hint: string;
}

export function TeamTournament({ tl, home, title, date, announcement, format, slotMinutes, knockoutRules: koRules, rankGroup, renderMatch, event = null, footballSeason }: TeamTournamentProps) {
  const c = useColors();
  const [building, setBuilding] = useState(false);
  const [sheet, setSheet] = useState<'reporte' | 'anotadores' | null>(null);
  const [menu, setMenu] = useState(false);
  const now = useNow(60_000).getTime();
  const teams = tl.teams.data;
  const matches = tl.matches.data;
  const step = tournamentStep(teams.length, matches.length);
  const stages = stageGroups(matches);
  const live = matches.filter((m) => m.status === 'live' || m.status === 'suspended');
  const loading = (tl.teams.loading && !teams.length) || (tl.matches.loading && !matches.length);
  // En el inicio del torneo no hay evento en la dirección: el día es el del evento del torneo.
  const day = date || event?.date || null;

  // Reporte del torneo (PDF o Excel), para todos: se arma al tocar, con las tablas y la eliminatoria de la app.
  const report = () =>
    teamKoReport({
      lid: tl.lid,
      league: tl.league,
      title,
      date: day,
      matches,
      teamIds: teams.map((t) => t.id),
      names: teamReportNames(tl),
      rules: tl.rules.data,
      now,
      football: footballSeason,
    });
  const comp = teamKoComp(tl.lid, { kind: tl.league.kind ?? 'liga', sport: tl.league.sport ?? 'football', event, leagueName: tl.league.name });
  const reportReady = !loading && !tl.players.loading;
  const finished = step === 'play' && teamKoComplete(matches, now);
  const meta = tournamentMetaLine(day);

  const open = (s: 'reporte' | 'anotadores') => {
    setMenu(false);
    setSheet(s);
  };
  const items: MenuItem[] = [
    ...(reportReady ? [{ key: 'reporte' as const, icon: FileDown, label: REPORT_TITLE, hint: REPORT_MENU_HINT }] : []),
    ...(tl.isAdmin ? [{ key: 'anotadores' as const, icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota los partidos' }] : []),
  ];

  return (
    <View style={{ gap: home ? 22 : 16 }}>
      {home ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Zap size={16} color={c.accent} />
          <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold, flexShrink: 1 }}>
            {meta}
          </Txt>
        </View>
      ) : (
        <>
          <BackBar
            label={tl.league.name}
            fallback={`/l/${tl.lid}`}
            right={
              items.length > 0 ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={8} onPress={() => setMenu(true)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <MoreHorizontal size={22} color={c.fg} />
                </Pressable>
              ) : undefined
            }
          />
          <View style={{ gap: 6 }}>
            <Txt variant="title">{title}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Zap size={16} color={c.accent} />
              <Txt variant="meta" tone="muted" style={{ flexShrink: 1 }}>
                {meta}
              </Txt>
            </View>
          </View>
        </>
      )}
      {!!announcement && <Txt tone="fg2">{announcement}</Txt>}

      <View style={{ gap: 30 }}>
        {tl.isAdmin && step !== 'play' && <Steps tl={tl} step={step} onBuild={() => setBuilding(true)} />}

        {tl.isAdmin && <TournamentAdvance tl={tl} rankGroup={rankGroup} />}

        {/* Terminado el torneo, el admin tiene el reporte a la mano (para todos está en «•••» o abajo). */}
        {tl.isAdmin && finished && reportReady && (
          <Card padded={false} style={{ overflow: 'hidden', backgroundColor: c.accentSoft }}>
            <Row top leading={<ToneIcon icon={FileDown} accent />} title={REPORT_TITLE} subtitle={REPORT_MENU_HINT} onPress={() => open('reporte')} />
          </Card>
        )}

        <KnockoutPrizes tl={tl} event={event} />

        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <LogoSpinner size={32} label="Cargando el torneo" />
          </View>
        ) : step !== 'play' ? (
          !tl.isAdmin && (
            <Empty icon={<Trophy size={32} color={c.accent} />} title="El torneo todavía no está armado" text="Cuando el organizador arme los grupos y los partidos, salen aquí con su hora y su cancha." />
          )
        ) : (
          <>
            {live.length > 0 && (
              <View style={{ gap: 10 }}>
                <SectionHeader title="En vivo" />
                <View style={{ gap: 10 }}>
                  {live.map((m) => (
                    <View key={m.id}>{renderMatch(m)}</View>
                  ))}
                </View>
              </View>
            )}
            {stages.map((g) => (
              <View key={g.stage} style={{ gap: 10 }}>
                <SectionHeader title={g.stage} />
                <View style={{ gap: 10 }}>
                  {g.matches.map((m) => (
                    <View key={m.id}>{renderMatch(m)}</View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        {teams.length > 0 && (step === 'play' || !tl.isAdmin) && (
          <View style={{ gap: 10 }}>
            <SectionHeader
              title="Equipos"
              action={
                <Txt variant="meta" tone="muted">
                  {String(teams.length)}
                </Txt>
              }
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {teams.map((t) => (
                <View key={t.id} style={{ height: 36, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, paddingHorizontal: 14, backgroundColor: c.surface }}>
                  <TeamDot team={t} />
                  <Txt numberOfLines={1} style={{ fontSize: 15, fontFamily: font.semibold, flexShrink: 1 }}>
                    {t.name}
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* En el inicio no hay «•••» (la barra es la de la liga): lo mismo como filas al final. */}
        {home && items.length > 0 && (
          <Card padded={false} style={{ overflow: 'hidden' }}>
            {items.map((it, i) => (
              <Row key={it.key} top={i === 0} leading={<ToneIcon icon={it.icon} accent />} title={it.label} subtitle={it.hint} onPress={() => open(it.key)} />
            ))}
          </Card>
        )}
      </View>

      <Sheet open={menu} onClose={() => setMenu(false)} title={title}>
        {items.map((it) => (
          <MenuRow key={it.key} icon={<it.icon size={20} color={c.fg} />} label={it.label} hint={it.hint} onPress={() => open(it.key)} />
        ))}
      </Sheet>
      <ReportSheet open={sheet === 'reporte'} onClose={() => setSheet(null)} report={report} comp={comp} />
      {/* La mesa: quién anota los partidos (de la liga, por @usuario o con el link). Siempre de la liga. */}
      {tl.isAdmin && (
        <ScorersSheet
          league={tl.league}
          open={sheet === 'anotadores'}
          onClose={() => setSheet(null)}
          target={{ scope: 'liga', refId: null, title }}
          participants={teams.flatMap((t) => t.roster.map((r) => r.playerId))}
        />
      )}
      {tl.isAdmin && <TournamentBuilderSheet tl={tl} open={building} onClose={() => setBuilding(false)} format={format} slotMinutes={slotMinutes} knockoutRules={koRules} />}
    </View>
  );
}

/** El número del paso en su círculo (con ✓ cuando está hecho). */
function StepMark({ n, done }: { n: number; done: boolean }) {
  const c = useColors();
  return (
    <View accessibilityLabel={`Paso ${n}`} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.accent : c.accentSoft }}>
      {done ? <Check size={20} strokeWidth={2.6} color={c.accentFg} /> : <Txt style={{ fontSize: 15, fontFamily: font.bold, color: c.accent }}>{n}</Txt>}
    </View>
  );
}

/**
 * Los pasos del organizador, como filas numeradas: los equipos (abre Organizar › Equipos), armar el torneo (el único
 * botón de la pantalla) y a jugar.
 */
function Steps({ tl, step, onBuild }: { tl: TeamLeague; step: Exclude<TournamentStep, 'play'>; onBuild: () => void }) {
  const c = useColors();
  const n = tl.teams.data.length;
  const showTeams = () => router.push({ pathname: '/l/[lid]/equipos', params: { lid: tl.lid, parte: 'equipos' } });
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader title="Para armar el torneo" />
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <Row top leading={<StepMark n={1} done={n >= 2} />} title="Los equipos" subtitle={teamsStepLine(n)} onPress={showTeams} accessibilityLabel={n ? 'Ver los equipos' : 'Crear los equipos'} />
        <View style={{ gap: 14, paddingTop: 10, paddingRight: 18, paddingBottom: 18, paddingLeft: 18, borderTopWidth: 1, borderTopColor: c.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <StepMark n={2} done={false} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong">Arma el torneo</Txt>
              <Txt variant="meta" tone="muted">
                Grupos y después la eliminatoria, con horas y canchas.
              </Txt>
            </View>
          </View>
          {step === 'build' && (
            <Button variant="primary" size="lg" icon={<Trophy size={20} color={c.accentFg} />} disabled={n < 2} onPress={onBuild}>
              Armar el torneo
            </Button>
          )}
        </View>
        <Row leading={<StepMark n={3} done={false} />} title="A jugar" subtitle="Se anota en la cancha; al terminar los grupos, pasas a la final." />
      </Card>
      {step === 'teams' && (
        <Button variant="primary" size="lg" full icon={<Shirt size={20} color={c.accentFg} />} onPress={showTeams}>
          {n ? 'Seguir con los equipos' : 'Crear los equipos'}
        </Button>
      )}
    </View>
  );
}

/** Lo que cada deporte le pasa al torneo: el evento que se abrió (si es evento) y el torneo suelto. */
interface SportTournamentProps {
  tl: TeamLeague;
  home: boolean;
  /** El evento abierto (`/l/<liga>/e/<evento>`); en el inicio, ninguno. */
  eventId?: string;
}

/** El torneo relámpago del baloncesto: tabla FIBA de cada grupo (solo con sus partidos) cuando el grupo terminó. */
export function BasketballTournament({ tl, home, eventId }: SportTournamentProps) {
  const now = useNow(30_000).getTime();
  const e = useEvent(tl.lid, eventId).data;
  const koEvent = useKoEvent(tl);
  const config = basketballConfigFrom(tl.rules.data);
  const rankGroup = (stage: string) => finishedGroupRanking(tl.matches.data, stage, now, (ms, ids) => basketballSeason(ms, ids, tl.rules.data, now).standings.map((r) => r.id));
  return (
    <TeamTournament
      tl={tl}
      home={home}
      event={koEvent}
      title={e?.name || tl.league.name}
      date={e?.date}
      announcement={e?.announcement}
      format={config.variant === '3x3' ? '3x3' : 'fiba'}
      slotMinutes={config.variant === '3x3' ? 20 : 50}
      rankGroup={rankGroup}
      renderMatch={(m) => <TournamentMatchCard tl={tl} match={m} now={now} />}
    />
  );
}

/** El torneo relámpago del fútbol y la sala (con penales si empatan en la eliminatoria). */
export function FootballTournament({ tl, home, eventId }: SportTournamentProps) {
  const now = useNow(30_000).getTime();
  const e = useEvent(tl.lid, eventId).data;
  const koEvent = useKoEvent(tl);
  const season = useFootballSeason(tl);
  const variant = variantOf(tl.league.sport);
  const config = footballConfigFrom(tl.rules.data, variant);
  const rankGroup = (stage: string) => groupRanking(season, tl.matches.data, stage, now);
  return (
    <TeamTournament
      tl={tl}
      home={home}
      event={koEvent}
      title={e?.name || tl.league.name}
      date={e?.date}
      announcement={e?.announcement}
      format={variant}
      slotMinutes={matchMinutes(config) - 5}
      knockoutRules={knockoutRules(tl.rules.data, variant)}
      rankGroup={rankGroup}
      renderMatch={(m) => <TournamentMatchCard tl={tl} match={m} now={now} />}
      footballSeason={season}
    />
  );
}
