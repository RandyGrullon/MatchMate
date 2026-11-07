import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ClipboardPen, FileDown, ListChecks, Lock, LockOpen, Medal, Megaphone, Pencil, Radio, Timer, Trash2, Trophy } from 'lucide-react-native';
import { streamFor, useLeagueStreams } from '@mm/lib/data/streams';
import { deleteMeet, finalizeMeet, useSwimEntries, useSwimEvents, useSwimMeets, useSwimRules } from '@mm/lib/data/swimming';
import { toIsoDate } from '@mm/lib/format';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { canStartStream, liveHref } from '@mm/components/live/logic';
import { meetMeta } from '@mm/pages/sports/swimming/home';
import { STAGE_LABEL, meetStage, meetTabs, scores, type MeetData, type MeetTabKey } from '@mm/pages/sports/swimming/logic';
import { clubMap, meetTitle, useNames, useSwim } from '@mm/pages/sports/swimming/swim';
import { confirmAsync } from '@/components/feedback';
import { StartStreamSheet } from '@/components/live/StartStreamSheet';
import { ScorersSheet } from '@/components/scorers/ScorersSheet';
import { BackBar, Button, Card, Empty, LoadError, Loading, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { useBusy } from './adminParts';
import { MeetFormSheet } from './MeetForm';
import { MenuSheet, MoreButton, ProLine, TabStrip, runAction, type MenuItem } from './parts';
import { EntriesPanel } from './SwimEntries';
import { HeatSheetPanel, ProgramPanel, ResultsPanel, ScoresPanel } from './SwimPanels';
import { TimingPanel } from './SwimTiming';
import { MeetPrizes } from '@/components/prizes/SportPrizes';
import { ReportSheet } from '@/components/tournamentReport/ReportSheet';
import { SwimReportCard, swimReportSource } from '@/components/tournamentReport/SportReports';
import { REPORT_MENU_HINT } from '@mm/components/tournamentReport/view';

/** Lo que se abre desde «•••» (una hoja a la vez). */
type SheetKey = 'menu' | 'puntos' | 'reporte' | 'cambiar' | 'anotadores' | 'vivo';

/** Lo que tarda en cerrarse una hoja: la siguiente se abre después (en el teléfono no se abren dos a la vez). */
const SHEET_CLOSE_MS = 400;

/**
 * Un encuentro de natación (MeetPage de la web): «‹ Club Acuático» y «•••» arriba, el título grande y una línea con en qué
 * va, el día, la hora y la piscina (en Pro, también los carriles y cuántas pruebas); «Ver en vivo» si se transmite; el
 * anuncio, si hay. Las partes son las de la web (meetTabs): en Lite, Pruebas (inscribirse) · Series · Resultados; en Pro,
 * Programa, Inscritos, Series, Cronometrar, Resultados y Puntos. En Lite, quien organiza o cronometra abre lo de Pro
 * desde «•••» (como un link de Pro en la web), con «Esto es de Pro · Usar Pro».
 * «•••»: «Transmitir en vivo», el reporte (PDF o Excel), los puntos por club, «Cronometrar» y, para el admin, «Programa
 * y series», «Cambiar el encuentro», «Cronometristas», «Finalizar el encuentro» o «Volver a abrir» y «Borrar
 * encuentro». El reporte del admin al finalizar y los premios del encuentro, abajo. `?ver=` abre una parte (como en la
 * web).
 */
export function SwimEventBody({ eventId, embedded = false }: { eventId: string; embedded?: boolean }) {
  const c = useColors();
  const ctx = useSwim();
  const isPro = useIsPro();
  const { lid, isAdmin, isTimer, league, clubs } = ctx;
  const params = useLocalSearchParams<{ ver?: string }>();
  const meets = useSwimMeets(lid);
  const events = useSwimEvents(lid, eventId);
  const entries = useSwimEntries(lid, eventId);
  const rules = useSwimRules(lid).data;
  const streams = useLeagueStreams(lid).data;
  const { name, players } = useNames(lid);
  const today = toIsoDate(useNow());
  const busy = useBusy<'final' | 'borrar'>();
  const [picked, setPicked] = useState<MeetTabKey | null>(null);
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const clubById = useMemo(() => clubMap(clubs.data), [clubs.data]);

  const meet = meets.data.find((m) => m.id === eventId) ?? null;
  const error = meets.error ?? events.error ?? entries.error ?? players.error;
  if (error) return <LoadError error={error} />;
  if ((meets.loading && !meet) || (meet && events.loading && !events.data.length)) return <Loading label="Cargando el encuentro" />;
  if (!meet) {
    return (
      <Empty
        title="Este encuentro no existe"
        action={<Button onPress={() => (router.canGoBack() ? router.back() : router.navigate({ pathname: '/l/[lid]', params: { lid } }))}>Volver</Button>}
      />
    );
  }

  const data: MeetData = { lid, meet, events: events.data, entries: entries.data, clubs: clubById, clubList: clubs.data, name };
  const stage = meetStage(meet, events.data.length);
  const standalone = league.kind === 'torneo';
  // Las partes (Lite o Pro, o un link de Pro para quien organiza o cronometra) y cuál se ve: meetTabs de la web.
  const { tabs, tab, pro, timing } = meetTabs({ meet, events: events.data, entries: entries.data, isPro, isAdmin, isTimer, requested: picked ?? params.ver ?? null });
  // En vivo: «Transmitir en vivo» en «•••» (admins y cronometristas, con la liga en vivo) y, en vivo, «Ver en vivo».
  const stream = streamFor(streams, { eventId: meet.id });
  const canStart = canStartStream(ctx);

  const closeMenu = () => setSheet(null);
  /** Cierra «•••» y, cuando ya se fue, abre la otra hoja. */
  const openAfterMenu = (k: SheetKey) => {
    closeMenu();
    setTimeout(() => setSheet(k), SHEET_CLOSE_MS);
  };
  const openTab = (k: MeetTabKey) => {
    closeMenu();
    setPicked(k);
  };

  const remove = async () => {
    closeMenu();
    if (!(await confirmAsync({ title: '¿Borrar el encuentro?', message: 'Se borran sus pruebas, inscritos, series y resultados. No se puede deshacer.', confirmText: 'Borrar', danger: true }))) return;
    const ok = await busy.run('borrar', () => runAction(() => deleteMeet(lid, meet.id).then(() => true), 'Encuentro borrado'));
    if (ok) {
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/l/[lid]', params: { lid } });
    }
  };
  const toggleFinal = async () => {
    closeMenu();
    const closing = !meet.finalizedAt;
    if (
      closing &&
      !(await confirmAsync({
        title: '¿Finalizar el encuentro?',
        message: 'Los resultados quedan cerrados y cuentan para la tabla de la temporada. Un admin lo puede volver a abrir.',
        confirmText: 'Finalizar',
      }))
    )
      return;
    await busy.run('final', () => runAction(() => finalizeMeet(lid, meet.id, closing), closing ? 'Encuentro finalizado' : 'Encuentro abierto otra vez'));
  };

  const menuItems: MenuItem[] = [
    ...(canStart && !stream
      ? [{ key: 'en-vivo', icon: Radio, label: 'Transmitir en vivo', hint: 'Pon el link de YouTube, Twitch, Facebook…', onPress: () => openAfterMenu('vivo') }]
      : []),
    { key: 'reporte', icon: FileDown, label: 'Reporte del encuentro', hint: REPORT_MENU_HINT, onPress: () => openAfterMenu('reporte') },
    ...(!pro && scores(meet) ? [{ key: 'puntos', icon: Medal, label: 'Puntos por club', hint: 'Y el medallero', onPress: () => openAfterMenu('puntos') }] : []),
    ...(!pro && timing ? [{ key: 'crono', icon: Timer, label: 'Cronometrar', hint: 'Tomar los tiempos de cada serie', onPress: () => openTab('cronometro') }] : []),
    ...(!pro && isAdmin ? [{ key: 'programa', icon: ListChecks, label: 'Programa y series', hint: 'Armar las pruebas y publicar las series', onPress: () => openTab('programa') }] : []),
    ...(isAdmin
      ? [
          ...(!meet.finalizedAt ? [{ key: 'cambiar', icon: Pencil, label: 'Cambiar el encuentro', hint: 'Nombre, fecha, piscina y puntos', onPress: () => openAfterMenu('cambiar') }] : []),
          // Cronometristas: los anotadores de la liga toman los tiempos y publican las series.
          { key: 'anotadores', icon: ClipboardPen, label: 'Cronometristas', hint: 'Quién toma los tiempos', onPress: () => openAfterMenu('anotadores') },
          {
            key: 'final',
            icon: meet.finalizedAt ? LockOpen : Trophy,
            label: meet.finalizedAt ? 'Volver a abrir' : 'Finalizar el encuentro',
            hint: meet.finalizedAt ? 'Para corregir resultados' : 'Cierra los resultados de la temporada',
            onPress: () => void toggleFinal(),
            busy: busy.isBusy('final'),
          },
          ...(!standalone ? [{ key: 'borrar', icon: Trash2, label: 'Borrar encuentro', onPress: () => void remove(), danger: true, busy: busy.isBusy('borrar') }] : []),
        ]
      : []),
  ];
  const more = <MoreButton onPress={() => setSheet('menu')} />;

  const metaLine = (
    <Txt variant="meta" tone="muted" style={embedded ? { flex: 1 } : undefined}>
      {meet.finalizedAt ? (
        <Txt variant="meta" tone="fg2" style={{ fontFamily: font.semibold }}>
          {STAGE_LABEL[stage]}
        </Txt>
      ) : (
        <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
          {STAGE_LABEL[stage]}
        </Txt>
      )}
      {` · ${meetMeta(meet, today, isPro, events.data.length)}`}
    </Txt>
  );

  return (
    <View style={{ gap: 16 }}>
      {embedded ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          {!!meet.finalizedAt && <Lock size={14} color={c.fg2} style={{ marginTop: 3 }} />}
          {metaLine}
          {more}
        </View>
      ) : (
        <>
          {standalone ? <View style={{ alignItems: 'flex-end' }}>{more}</View> : <BackBar label={league.name} fallback={`/l/${lid}`} right={more} />}
          <View style={{ gap: 6 }}>
            <Txt variant="title">{meetTitle(meet)}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
              {!!meet.finalizedAt && <Lock size={14} color={c.fg2} style={{ marginTop: 3 }} />}
              <View style={{ flex: 1, minWidth: 0 }}>{metaLine}</View>
            </View>
            {/* Si el encuentro se está transmitiendo: «Ver en vivo». */}
            {stream && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Ver en vivo"
                onPress={() => router.push(liveHref(lid, stream.id) as Href)}
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 36,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  marginTop: 6,
                  backgroundColor: c.danger,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                })}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.onDanger }} />
                <Txt style={{ fontSize: 14, fontFamily: font.bold, color: c.onDanger }}>Ver en vivo</Txt>
              </Pressable>
            )}
          </View>
        </>
      )}

      {!!meet.announcement && (
        <Card style={{ flexDirection: 'row', gap: 12, padding: 16, backgroundColor: c.accentSoft }}>
          <Megaphone size={16} color={c.accent} style={{ marginTop: 2 }} />
          <Txt style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{meet.announcement}</Txt>
        </Card>
      )}

      {/* Lo de Pro abierto en Lite (desde «•••» o un link de Pro). */}
      {pro && !isPro && <ProLine />}

      {tabs.length <= 3 ? (
        <Segmented<MeetTabKey> label="Partes del encuentro" options={tabs} value={tab} onChange={setPicked} />
      ) : (
        <TabStrip<MeetTabKey> label="Partes del encuentro" items={tabs} active={tab} onChange={setPicked} />
      )}

      <View key={tab}>
        {tab === 'programa' && <ProgramPanel data={data} />}
        {tab === 'inscritos' && <EntriesPanel data={data} />}
        {tab === 'series' && <HeatSheetPanel data={data} manage={pro} />}
        {tab === 'cronometro' && <TimingPanel data={data} />}
        {tab === 'resultados' && <ResultsPanel data={data} />}
        {tab === 'puntos' && <ScoresPanel data={data} />}
      </View>

      {/* El reporte a la mano del admin al finalizar (para todos está en «•••») y los premios, debajo de sus partes. */}
      <SwimReportCard data={data} loading={entries.loading || players.loading} />
      <MeetPrizes data={data} />

      <MenuSheet open={sheet === 'menu'} onClose={closeMenu} title={meetTitle(meet)} items={menuItems} />
      <ReportSheet open={sheet === 'reporte'} onClose={closeMenu} {...swimReportSource(league, data)} />
      <Sheet open={sheet === 'puntos'} onClose={closeMenu} title="Puntos por club" subtitle={meetTitle(meet)}>
        {sheet === 'puntos' && <ScoresPanel data={data} />}
      </Sheet>
      {(canStart || sheet === 'vivo') && <StartStreamSheet lid={lid} eventId={meet.id} defaultTitle={meetTitle(meet)} open={sheet === 'vivo'} onClose={closeMenu} />}
      {isAdmin && (
        <>
          <ScorersSheet
            league={league}
            open={sheet === 'anotadores'}
            onClose={closeMenu}
            target={{ scope: 'evento', refId: meet.id, title: meet.name || (standalone ? league.name : meetTitle(meet)) }}
            participants={entries.data.map((e) => e.playerId)}
          />
          <MeetFormSheet open={sheet === 'cambiar'} onClose={closeMenu} lid={lid} meet={meet} defaults={rules} />
        </>
      )}
    </View>
  );
}
