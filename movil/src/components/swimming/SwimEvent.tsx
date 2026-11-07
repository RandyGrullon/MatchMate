import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FileDown, Lock, Medal, Megaphone, Timer } from 'lucide-react-native';
import { useSwimEntries, useSwimEvents, useSwimMeets } from '@mm/lib/data/swimming';
import { toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { meetMeta } from '@mm/pages/sports/swimming/home';
import { STAGE_LABEL, meetStage, meetTabs, scores, type MeetData, type MeetTabKey } from '@mm/pages/sports/swimming/logic';
import { clubMap, meetTitle, useNames, useSwim } from '@mm/pages/sports/swimming/swim';
import { BackBar, Button, Card, Empty, LoadError, Loading, Segmented, Sheet, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { MenuSheet, MoreButton, TabStrip, type MenuItem } from './parts';
import { EntriesPanel } from './SwimEntries';
import { HeatSheetPanel, ProgramPanel, ResultsPanel, ScoresPanel } from './SwimPanels';
import { TimingPanel } from './SwimTiming';
import { MeetPrizes } from '@/components/prizes/SportPrizes';
import { ReportSheet } from '@/components/tournamentReport/ReportSheet';
import { SwimReportCard, swimReportSource } from '@/components/tournamentReport/SportReports';
import { REPORT_MENU_HINT } from '@mm/components/tournamentReport/view';

/**
 * Un encuentro de natación (MeetPage de la web, Lite): «‹ Club Acuático» y «•••» arriba, el título grande y una línea
 * con en qué va, el día, la hora y la piscina; el anuncio, si hay. Las partes son las de la web (meetTabs): Pruebas
 * (inscribirse) · Series · Resultados y, para quien cronometra, «Cronometrar» en «•••» abre las de Pro (Programa,
 * Inscritos, Series, Cronometrar, Resultados y Puntos), como un link de Pro en la web. Los puntos por club van en
 * «•••», con el reporte (PDF o Excel). Lo del admin (cambiar, finalizar, borrar, cronometristas, armar el programa y
 * las series) y la transmisión en vivo, en la web; el reporte del admin al finalizar y los premios del encuentro, abajo.
 * `?ver=` abre una parte (como en la web).
 */
export function SwimEventBody({ eventId, embedded = false }: { eventId: string; embedded?: boolean }) {
  const c = useColors();
  const { lid, isAdmin, isTimer, league, clubs } = useSwim();
  const params = useLocalSearchParams<{ ver?: string }>();
  const meets = useSwimMeets(lid);
  const events = useSwimEvents(lid, eventId);
  const entries = useSwimEntries(lid, eventId);
  const { name, players } = useNames(lid);
  const today = toIsoDate(useNow());
  const [picked, setPicked] = useState<MeetTabKey | null>(null);
  const [menu, setMenu] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  // «Reporte del encuentro» de «•••» (PDF o Excel), para todos.
  const [reporting, setReporting] = useState(false);
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
  // En el teléfono no hay Pro: lo de Pro se abre con un link de Pro (cronometrar), como en Lite en la web.
  const { tabs, tab, pro, timing } = meetTabs({ meet, events: events.data, entries: entries.data, isPro: false, isAdmin, isTimer, requested: picked ?? params.ver ?? null });

  const closeMenu = () => setMenu(false);
  const menuItems: MenuItem[] = [
    {
      key: 'reporte',
      icon: FileDown,
      label: 'Reporte del encuentro',
      hint: REPORT_MENU_HINT,
      onPress: () => {
        closeMenu();
        setReporting(true);
      },
    },
    ...(!pro && scores(meet)
      ? [
          {
            key: 'puntos',
            icon: Medal,
            label: 'Puntos por club',
            hint: 'Y el medallero',
            onPress: () => {
              closeMenu();
              setPointsOpen(true);
            },
          },
        ]
      : []),
    ...(!pro && timing
      ? [
          {
            key: 'crono',
            icon: Timer,
            label: 'Cronometrar',
            hint: 'Tomar los tiempos de cada serie',
            onPress: () => {
              closeMenu();
              setPicked('cronometro');
            },
          },
        ]
      : []),
  ];
  const more = menuItems.length > 0 ? <MoreButton onPress={() => setMenu(true)} /> : null;

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
      {` · ${meetMeta(meet, today, false, events.data.length)}`}
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
          {standalone ? more && <View style={{ alignItems: 'flex-end' }}>{more}</View> : <BackBar label={league.name} fallback={`/l/${lid}`} right={more} />}
          <View style={{ gap: 6 }}>
            <Txt variant="title">{meetTitle(meet)}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
              {!!meet.finalizedAt && <Lock size={14} color={c.fg2} style={{ marginTop: 3 }} />}
              <View style={{ flex: 1, minWidth: 0 }}>{metaLine}</View>
            </View>
          </View>
        </>
      )}

      {!!meet.announcement && (
        <Card style={{ flexDirection: 'row', gap: 12, padding: 16, backgroundColor: c.accentSoft }}>
          <Megaphone size={16} color={c.accent} style={{ marginTop: 2 }} />
          <Txt style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{meet.announcement}</Txt>
        </Card>
      )}

      {tabs.length <= 3 ? (
        <Segmented<MeetTabKey> label="Partes del encuentro" options={tabs} value={tab} onChange={setPicked} />
      ) : (
        <TabStrip<MeetTabKey> label="Partes del encuentro" items={tabs} active={tab} onChange={setPicked} />
      )}

      <View key={tab}>
        {tab === 'programa' && <ProgramPanel data={data} />}
        {tab === 'inscritos' && <EntriesPanel data={data} />}
        {tab === 'series' && <HeatSheetPanel data={data} />}
        {tab === 'cronometro' && <TimingPanel data={data} />}
        {tab === 'resultados' && <ResultsPanel data={data} />}
        {tab === 'puntos' && <ScoresPanel data={data} />}
      </View>

      {/* El reporte a la mano del admin al finalizar (para todos está en «•••») y los premios, debajo de sus partes. */}
      <SwimReportCard data={data} loading={entries.loading || players.loading} />
      <MeetPrizes data={data} />

      <MenuSheet open={menu} onClose={closeMenu} title={meetTitle(meet)} items={menuItems} />
      <ReportSheet open={reporting} onClose={() => setReporting(false)} {...swimReportSource(league, data)} />
      <Sheet open={pointsOpen} onClose={() => setPointsOpen(false)} title="Puntos por club" subtitle={meetTitle(meet)}>
        {pointsOpen && <ScoresPanel data={data} />}
      </Sheet>
    </View>
  );
}
