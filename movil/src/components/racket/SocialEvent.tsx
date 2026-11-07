/**
 * El round robin social del pickleball (SocialPage.tsx de la web, con su misma lógica: pickleball/social/logic.ts):
 * compañeros que rotan cada ronda y cada partido es un juego a 11 (15 o 21). Jugador: su cancha de la ronda con UN botón
 * y, en Lite, la ronda de ahora y «Cómo van todos»; en Pro, Canchas · Tabla · Rondas. Quien organiza (en Pro): las
 * canchas de la ronda con «Anotar» y «Marcador», la siguiente ronda, rehacer una ronda que no empezó y terminar; ajustes,
 * jugadores y mixto, inscripción, anotadores, reporte, compartir y borrar en «•••». En Lite, lo de organizar va con
 * «Usar Pro».
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { ClipboardList, ClipboardPen, FileDown, Lock, LockOpen, Rows3, Settings2, Share2, Trash2, Users } from 'lucide-react-native';
import { useMatches } from '@mm/lib/data/matches';
import { updateRacketEvent, useWithPendingPoints, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { formatDateLong } from '@mm/lib/format';
import { useLeagueCtx } from '@mm/lib/league';
import { shareOrigin } from '@mm/lib/origin';
import { useIsPro } from '@mm/lib/useMode';
import { useNow } from '@mm/lib/useNow';
import { pickleballSocialReport } from '@mm/lib/report/racket';
import { racketNightComp } from '@mm/prizes/sports';
import { eventDay } from '@mm/components/event/eventDay';
import type { StandingsColumn } from '@mm/components/match/standings';
import {
  gameText,
  nextSocialRound,
  parseSocialConfig,
  redoSocialRound,
  socialConfigJson,
  socialDrafts,
  socialEntry,
  socialFirstSummary,
  socialShareText,
  socialTable,
  type SocialConfig,
} from '@mm/pages/sports/pickleball/social/logic';
import { levelText, useLevels } from '@mm/pages/sports/racket/levels';
import { NIGHT_MAX_PLAYERS, nightRounds } from '@mm/pages/sports/racket/logic/night';
import type { SignupSettings } from '@mm/pages/sports/racket/logic/signup';
import { timeLabel, todayIn } from '@mm/pages/sports/racket/logic/time';
import { useNames } from '@mm/pages/sports/racket/names';
import { NightPrizes } from '../prizes/SportPrizes';
import { ScorersSheet } from '../scorers/ScorersSheet';
import { ReportButton } from '../tournamentReport/ReportButton';
import { ReportSheet } from '../tournamentReport/ReportSheet';
import { ScreenNotice } from '../esports/bits';
import { confirmAsync, toast } from '../feedback';
import { StandingsTable } from '../match/StandingsTable';
import { Button, Card, Divider, Empty, ListRow, RowIcon, Segmented, SectionHeader, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { ShareSheet, useDeleteEvent } from './EventAdmin';
import { NightFields, NightPlayers, SignupSettingsSheet } from './NightForm';
import { FirstRound, MyCourt, PlayersList, Podium, RankRows, RestCard, RoundCourts, RoundList, RoundsButtons, useRoundsAdmin } from './NightParts';
import { matchRoute } from './RacketHome';
import { SignupPanel } from './SignupPanel';
import { GameFields, MixedGroups } from './SocialForm';
import { EventMenu, SHEET_CLOSE_MS, SaveFooter, ScreenHead, Stepper, useOrganizePro, useRacketPhone, type MenuItem } from './parts';
import { useColors } from '@/theme/theme';

type Tab = 'canchas' | 'tabla' | 'rondas';
type SheetKey = 'compartir' | 'reporte' | 'anotadores' | 'rondas' | 'jugadores' | 'ajustes' | 'editar-jugadores' | 'inscripcion';

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

const TABLE_COLUMNS: StandingsColumn[] = [
  { key: 'played', label: 'PJ', title: 'Partidos jugados', value: (r) => r.played },
  { key: 'lost', label: 'P', title: 'Perdidos', value: (r) => r.lost },
  { key: 'for', label: 'PF', title: 'Puntos a favor', value: (r) => r.for, wide: true },
  { key: 'against', label: 'PC', title: 'Puntos en contra', value: (r) => r.against, wide: true },
  { key: 'diff', label: 'Dif.', title: 'Diferencia de puntos', value: (r) => signed(r.diff) },
];

export function SocialView({ event }: { event: RacketEvent }) {
  const c = useColors();
  const { lid, league, isAdmin, myPlayerId } = useLeagueCtx();
  const { sport } = useRacketPhone();
  const pro = useIsPro();
  const names = useNames();
  const { levels, scale } = useLevels();
  const now = useNow(30_000).getTime();
  const q = useMatches({ lid, eventId: event.id });
  const matches = useWithPendingPoints(lid, q.data);
  const cfg = useMemo(() => parseSocialConfig(event.config, event.type), [event.config, event.type]);
  const rounds = useMemo(() => nightRounds(cfg, matches, now), [cfg, matches, now]);
  const people = useMemo(() => {
    const out = new Set(cfg.players);
    for (const r of rounds) for (const m of r.matches) for (const p of [...m.side1, ...m.side2]) out.add(p);
    return [...out];
  }, [cfg.players, rounds]);
  const table = useMemo(() => socialTable(people, rounds), [people, rounds]);
  const [tab, setTab] = useState<Tab>('canchas');
  const [sheet, setSheet] = useState<SheetKey | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const title = event.name || 'Round robin';
  // Lite, quien organiza: armar las rondas y poner marcadores está en Pro (el aviso de la pantalla y «•••»).
  const proItem = useOrganizePro(isAdmin && !cfg.closed, {
    id: `raqueta-social-pro:${event.id}`,
    title: 'Organizas este round robin',
    text: 'Las rondas se arman en Pro',
    menu: 'Rondas y marcadores',
  });
  const admin = useRoundsAdmin({
    event,
    cfg,
    rounds,
    next: nextSocialRound,
    redo: redoSocialRound,
    drafts: socialDrafts,
    json: socialConfigJson,
    pendingMessage: 'Cuentan cuando terminen. ¿Armar la siguiente ronda de todas formas?',
    close: { title: '¿Terminar el round robin?', confirmText: 'Terminar', ok: 'Round robin terminado' },
    onPublished: () => setTab('canchas'),
  });
  const remove = useDeleteEvent(event, { title, message: 'Se borran sus rondas y resultados. No se puede deshacer.', ok: 'Round robin borrado' });

  const current = rounds.at(-1) ?? null;
  const finished = cfg.closed || (!!current && current.round >= cfg.rounds && current.done);
  // Con la primera ronda ya no se apunta nadie más (el admin sigue cambiando jugadores a mano).
  const started = !!current || cfg.round > 0 || cfg.closed;
  const organize = isAdmin && pro;

  const saveConfig = async (next: SocialConfig, ok: string, key: string) => {
    setSaving(key);
    try {
      await updateRacketEvent(lid, event.id, { config: socialConfigJson(next) });
      toast(ok);
      setSheet(null);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setSaving(null);
    }
  };
  const close = async (closed: boolean, key: string) => {
    if (closed && !(await confirmAsync({ title: '¿Terminar el round robin?', message: 'Queda la tabla final. Se puede volver a abrir.', confirmText: 'Terminar' }))) return;
    await saveConfig({ ...cfg, closed }, closed ? 'Round robin terminado' : 'Abierto otra vez', key);
  };

  // Reporte del round robin (PDF o Excel), para todos: el podio, las rondas y la tabla que se ven aquí.
  const report = {
    report: () => Promise.resolve(pickleballSocialReport({ lid, league, event, title, cfg, rounds: [...rounds], table: [...table], nameOf: names.nameOf, finished, now })),
    comp: racketNightComp(lid, event, sport),
  };
  const share = socialShareText({ title, date: formatDateLong(event.date), rows: table, nameOf: names.nameOf, final: finished, url: `${shareOrigin(null)}/l/${lid}/e/${event.id}?ver=tabla` });
  const mine = current?.matches.find((m) => [...m.side1, ...m.side2].includes(myPlayerId ?? '')) ?? null;
  const resting = !!myPlayerId && !!current?.rests.includes(myPlayerId);
  const meta = [eventDay(event.date, todayIn(league.tz), pro), event.startTime ? timeLabel(event.startTime) : null, gameText(cfg.game)].filter(Boolean).join(' · ');
  const played = table.filter((r) => r.played > 0);
  const first = nextSocialRound(cfg, []);
  const label = cfg.mixed ? 'Round robin mixto' : 'Round robin';

  const items: MenuItem[] = [
    { key: 'compartir', icon: Share2, label: 'Compartir la tabla', hint: 'Por WhatsApp o copiada', onPress: () => setSheet('compartir') },
    { key: 'reporte', icon: FileDown, label: 'Reporte del round robin', hint: 'PDF para WhatsApp o imprimir, o Excel', onPress: () => setSheet('reporte') },
    ...(proItem.item ? [proItem.item] : []),
    ...(isAdmin
      ? [
          { key: 'ajustes', icon: Settings2, label: 'Ajustes', hint: 'Canchas, rondas y el juego', onPress: () => setSheet('ajustes') },
          { key: 'jugadores', icon: Users, label: 'Jugadores y mixto', hint: 'Quién llega tarde o se va', onPress: () => setSheet('editar-jugadores') },
          ...(!started ? [{ key: 'inscripcion', icon: ClipboardList, label: 'Inscripción', hint: 'Me apunto, cupo y lista de espera', onPress: () => setSheet('inscripcion') }] : []),
          ...(cfg.closed
            ? [{ key: 'abrir', icon: LockOpen, label: 'Volver a abrir', onPress: () => void close(false, 'abrir'), busy: saving === 'abrir' }]
            : current
              ? [{ key: 'cerrar', icon: Lock, label: 'Terminar el round robin', hint: 'Queda la tabla final', onPress: () => void close(true, 'cerrar'), busy: saving === 'cerrar' }]
              : []),
          { key: 'anotadores', icon: ClipboardPen, label: 'Anotadores', hint: 'Quién anota este round robin', onPress: () => setSheet('anotadores') },
          { key: 'borrar', icon: Trash2, label: 'Borrar el round robin', onPress: () => void remove(), danger: true },
        ]
      : []),
  ];

  const courts =
    q.loading && !matches.length ? (
      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
        <LogoSpinner size={32} label="Cargando las canchas" />
      </View>
    ) : !current ? (
      <FirstRound
        organize={organize}
        summary={socialFirstSummary(cfg)}
        problem={first.ok ? null : first.reason}
        busy={admin.pending === 'ronda'}
        onStart={() => void admin.nextRound()}
        onPlayers={() => setSheet('editar-jugadores')}
      />
    ) : (
      <View style={{ gap: 16 }}>
        {finished && <Podium table={table} nameOf={names.nameOf} value={(r) => `${r.won} G (${signed(r.diff)})`} onShare={() => setSheet('compartir')} />}
        <RoundCourts round={current} organize={organize} entry={() => socialEntry(cfg.game)} />
        {organize && !cfg.closed && <RoundsButtons round={current} rounds={cfg.rounds} admin={admin} finishLabel="Terminar el round robin" />}
      </View>
    );

  const rows = (
    <Card padded={false}>
      {!pro && rounds.length > 1 && (
        <>
          <ListRow
            icon={
              <RowIcon>
                <Rows3 size={20} color={c.accent} />
              </RowIcon>
            }
            title="Rondas anteriores"
            subtitle={`${rounds.length - 1} ${rounds.length - 1 === 1 ? 'ronda' : 'rondas'}`}
            onPress={() => setSheet('rondas')}
          />
          <Divider inset={68} />
        </>
      )}
      <ListRow
        icon={
          <RowIcon>
            <Users size={20} color={c.accent} />
          </RowIcon>
        }
        title={`Jugadores (${cfg.players.length})`}
        subtitle={`${cfg.courts.length} ${cfg.courts.length === 1 ? 'cancha' : 'canchas'} · ${cfg.rounds} rondas${cfg.mixed ? ' · mixto' : ''}`}
        onPress={() => setSheet('jugadores')}
      />
    </Card>
  );

  return (
    <View style={{ gap: 22 }}>
      <ScreenHead
        title={title}
        status={finished ? { text: 'Terminado' } : current ? { text: `Ronda ${current.round} de ${cfg.rounds}`, live: true } : { text: label }}
        meta={meta}
        right={<EventMenu title={title} items={items} />}
      />

      {/* Antes de empezar, «Me apunto» si quien organiza abrió la inscripción. */}
      {cfg.signup && !started && (
        <SignupPanel event={event} settings={cfg.signup} lists={[{ category: null, name: null, listed: cfg.players }]} started={started} onEdit={isAdmin ? () => setSheet('inscripcion') : undefined} />
      )}

      {mine && !finished && current && <MyCourt match={mine.match} round={current.round} />}
      {resting && !finished && current && <RestCard round={current.round} text="En la próxima te toca." />}

      {/* Terminado, el admin tiene el reporte a la mano (para todos está en «•••»). */}
      {organize && finished && rounds.length > 0 && <ReportButton {...report} look="card" disabled={(q.loading && !matches.length) || names.loading} />}

      {pro ? (
        <>
          <Segmented<Tab>
            label="Qué ver del round robin"
            value={tab}
            onChange={setTab}
            options={[
              { key: 'canchas', label: 'Canchas' },
              { key: 'tabla', label: 'Tabla' },
              { key: 'rondas', label: 'Rondas' },
            ]}
          />
          {tab === 'canchas' && courts}
          {tab === 'tabla' && (
            <>
              <StandingsTable
                rows={played}
                nameOf={names.nameOf}
                columns={TABLE_COLUMNS}
                highlight={myPlayerId ? [myPlayerId] : []}
                pointsLabel="G"
                primary={['partidos ganados']}
                empty="Cuando termine el primer juego, sale la tabla."
              />
              <Txt variant="small" tone="muted">
                Orden: partidos ganados, diferencia y puntos a favor.
              </Txt>
            </>
          )}
          {tab === 'rondas' && (rounds.length ? rounds.slice().reverse().map((r) => <RoundList key={r.round} round={r} />) : <Empty title="Todavía no hay rondas" />)}
          {rows}
        </>
      ) : (
        <>
          {courts}
          {played.length > 0 && (
            <View style={{ gap: 10 }}>
              <SectionHeader title="Cómo van todos" />
              <RankRows
                rows={played}
                nameOf={names.nameOf}
                value={(id) => String(played.find((r) => r.id === id)?.won ?? 0)}
                sub={(id) => {
                  const r = played.find((x) => x.id === id);
                  return r ? `${r.played} ${r.played === 1 ? 'juego' : 'juegos'} · ${signed(r.diff)}` : null;
                }}
                highlight={myPlayerId ? [myPlayerId] : []}
              />
              <Txt variant="small" tone="muted" style={{ marginHorizontal: 4 }}>
                Juegos ganados · se actualiza al terminar cada juego
              </Txt>
            </View>
          )}
          {rows}
        </>
      )}

      {/* Los premios, al final (se eligen y se entregan; no son de todos los días). */}
      <NightPrizes event={event} table={table} finished={finished} nameOf={names.nameOf} />

      <ScreenNotice notices={[proItem.notice]} />

      {sheet === 'compartir' && <ShareSheet title={title} text={share} onClose={() => setSheet(null)} />}
      <Sheet open={sheet === 'rondas'} onClose={() => setSheet(null)} title="Rondas" subtitle={title}>
        {rounds
          .slice()
          .reverse()
          .map((r) => (
            <RoundList
              key={r.round}
              round={r}
              onOpen={(id) => {
                setSheet(null);
                setTimeout(() => router.push(matchRoute(lid, id)), SHEET_CLOSE_MS);
              }}
            />
          ))}
      </Sheet>
      <Sheet
        open={sheet === 'jugadores'}
        onClose={() => setSheet(null)}
        title={`Jugadores (${cfg.players.length})`}
        subtitle={title}
        footer={
          isAdmin ? (
            <Button
              size="lg"
              full
              icon={<Users size={16} color={c.fg} />}
              onPress={() => {
                setSheet(null);
                setTimeout(() => setSheet('editar-jugadores'), SHEET_CLOSE_MS);
              }}
            >
              Cambiar jugadores
            </Button>
          ) : undefined
        }
      >
        <PlayersList
          ids={cfg.players}
          sub={(id) => [cfg.mixed ? `Grupo ${cfg.mixed.includes(id) ? 'A' : 'B'}` : null, levels[id] != null ? levelText(levels[id], scale) : null].filter(Boolean).join(' · ') || null}
        />
      </Sheet>
      <ReportSheet open={sheet === 'reporte'} onClose={() => setSheet(null)} report={report.report} comp={report.comp ?? null} />
      <ScorersSheet
        league={league}
        open={sheet === 'anotadores'}
        onClose={() => setSheet(null)}
        target={{ scope: 'evento', refId: event.id, title: event.name || (league.kind === 'torneo' ? league.name : title) }}
        participants={cfg.players}
      />
      {sheet === 'ajustes' && <SettingsSheet cfg={cfg} busy={saving === 'ajustes'} onClose={() => setSheet(null)} onSave={(x) => void saveConfig(x, 'Guardado', 'ajustes')} />}
      {sheet === 'editar-jugadores' && <PlayersSheet cfg={cfg} busy={saving === 'jugadores'} onClose={() => setSheet(null)} onSave={(x) => void saveConfig(x, 'Jugadores guardados', 'jugadores')} />}
      {sheet === 'inscripcion' && (
        <SignupSettingsSheet
          value={cfg.signup ?? null}
          busy={saving === 'inscripcion'}
          unit={['jugador', 'jugadores']}
          defaultCap={Math.max(4, cfg.courts.length * 4)}
          maxCap={NIGHT_MAX_PLAYERS}
          tz={league.tz}
          onClose={() => setSheet(null)}
          onSave={(s: SignupSettings | null) => void saveConfig(s ? { ...cfg, signup: s } : cfg, s?.open ? 'Inscripción abierta' : 'Inscripción cerrada', 'inscripcion')}
        />
      )}
    </View>
  );
}

/** «Ajustes del round robin»: canchas, rondas y el juego (valen desde la ronda que sigue). Se monta al abrirse. */
function SettingsSheet({ cfg, busy, onClose, onSave }: { cfg: SocialConfig; busy: boolean; onClose: () => void; onSave: (c: SocialConfig) => void }) {
  const [draft, setDraft] = useState(cfg);
  const changedPlan = draft.courts.length !== cfg.courts.length || draft.rounds !== cfg.rounds;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Ajustes del round robin"
      subtitle="Valen desde la ronda que sigue"
      footer={
        <SaveFooter
          onClose={onClose}
          busy={busy}
          onSave={() =>
            onSave(changedPlan ? { ...draft, courts: draft.courts.map((x, i) => x.trim() || `Cancha ${i + 1}`), plan: undefined, planPlayers: undefined, planFrom: undefined } : draft)
          }
        />
      }
    >
      <NightFields value={draft} onChange={(x) => setDraft({ ...draft, courts: x.courts })} parts={['courts']} />
      <Stepper label="Rondas" value={draft.rounds} min={1} max={30} onChange={(rounds) => setDraft({ ...draft, rounds })} />
      <GameFields value={draft.game} onChange={(game) => setDraft({ ...draft, game })} />
    </Sheet>
  );
}

/** «Jugadores del round robin» y el mixto (valen desde la ronda que sigue). Se monta al abrirse. */
function PlayersSheet({ cfg, busy, onClose, onSave }: { cfg: SocialConfig; busy: boolean; onClose: () => void; onSave: (c: SocialConfig) => void }) {
  const { levels } = useLevels();
  const [players, setPlayers] = useState(cfg.players);
  const [mixed, setMixed] = useState(cfg.mixed);
  // La versión de la lista que se abrió: si alguien se apunta mientras tanto, la base no lo pierde al guardar.
  const [rev] = useState(cfg.signup?.rev ?? 0);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Jugadores del round robin"
      subtitle="Los cambios valen desde la ronda que sigue"
      footer={
        <SaveFooter
          onClose={onClose}
          busy={busy}
          disabled={players.length < 4}
          onSave={() => {
            const lv = { ...cfg.levels };
            for (const p of players) if (levels[p] != null) lv[p] = levels[p];
            onSave({ ...cfg, players, levels: lv, mixed: mixed ? mixed.filter((p) => players.includes(p)) : null, ...(cfg.signup ? { signup: { ...cfg.signup, rev } } : {}) });
          }}
        />
      }
    >
      <NightPlayers value={players} onChange={setPlayers} levels={levels} />
      <MixedGroups players={players} value={mixed} onChange={setMixed} />
    </Sheet>
  );
}
