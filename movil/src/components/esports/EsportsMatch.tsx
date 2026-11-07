/**
 * Una serie de esports (match/MatchSheet.tsx + GameRow.tsx de la web, con su misma lógica: match/game.ts, logic.ts y
 * admin/logic.ts): la fase y la hora, «Ver en vivo» si se transmite, los dos lados con su siembra y la serie («Al mejor
 * de 3», «2-1» y el detalle mapa por mapa), confirmar o reclamar (el capitán rival) y **anotar** mapa por mapa o juego
 * por juego con la regla del juego (el capitán de un lado, el admin o un anotador, mientras la serie siga abierta): el
 * error del motor en vivo, hasta 3 capturas y «Enviar resultado» (o «Guardar resultado» si es admin) con el resumen
 * («Gana Tigres 2-1»). Quien organiza: en «•••», corregir, W.O., cambiar la hora y anular, y decidir un reclamo («Dejar
 * el propuesto» o «Corregir»). Los admins y anotadores (con la liga en vivo activada): «Transmitir en vivo».
 * En el teléfono no hay Pro: lo del organizador sale para los admins de la liga.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { CalendarClock, Camera, Gavel, ImagePlus, MoreHorizontal, Pencil, Plus, Radio, Trash2, Trophy, Undo2, UserX, X, XCircle } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { addMatchProofImage, esportsErrorText, useEntries, type EsportsEntry } from '@mm/lib/data/esports';
import { adminCorrectResult, finishMatch, hasResult, rescheduleMatch, resolveDispute, setWalkover, useMatch, voidMatch, type Match } from '@mm/lib/data/matches';
import { streamFor, useLeagueStreams } from '@mm/lib/data/streams';
import { useLeagueCtx } from '@mm/lib/league';
import { usePhoto } from '@mm/lib/photos';
import { useNow } from '@mm/lib/useNow';
import { sideName, statusInfo, whenText } from '@mm/components/match/format';
import { canStartStream, liveHref } from '@mm/components/live/logic';
import { GAMES, buildSeriesScore, parseSeriesScore, seriesWinner, validateGame, validateSeries, walkoverScore, type GameRecord, type SeriesRules } from '@mm/sports/esports';
import { canAddGame, canScoreSeries, entryBySideTeam, resultSummary, rulesFromMatch, sideOfTeams } from '@mm/pages/sports/esports/logic';
import { CORRECTED_NOTE, KEEP_PROPOSED_NOTE, VOID_ASK, seriesAdminMenu, walkoverOptions, type SeriesMenuKey } from '@mm/pages/sports/esports/admin/logic';
import {
  cleanGame,
  editorLabel,
  editorTitle,
  emptyGame,
  finishToast,
  fightChoices,
  gameWord,
  isCloseGame,
  penaltyState,
  scoringHint,
  seriesLines,
  stockChoices,
  swapFor,
  tidyGame,
  type EditMode,
} from '@mm/pages/sports/esports/match/game';
import { localParts, zonedIso } from '@mm/pages/sports/racket/logic/time';
import { useMyTeams } from '@mm/pages/sports/esports/tournamentData';
import { pickPhoto, type PhotoSource } from '@/lib/pickImage';
import { StartStreamSheet } from '../live/StartStreamSheet';
import { DateStepper } from '../DateStepper';
import { ConfirmResult } from '../match/ResultParts';
import { MatchStatus } from '../match/MatchCard';
import { confirmAsync, toast } from '../feedback';
import { ProofStrip } from './Br';
import { Initials, TeamLogo } from './bits';
import { Legend, TimeStepper } from './fields';
import { ChoiceChips, MenuRow, ScoreStepper, SideStepRow, ToggleRow, WinnerPick } from './inputs';
import { Button, Card, ChoiceRow, Empty, LoadError, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

type SheetKey = null | 'menu' | 'wo' | 'hora' | 'live';

export function EsportsMatch({ matchId }: { matchId: string }) {
  const c = useColors();
  const ctx = useLeagueCtx();
  const { lid, isAdmin, member, league } = ctx;
  const q = useMatch(lid, matchId);
  const m = q.data;
  const entries = useEntries(m?.eventId ?? undefined);
  const myTeams = useMyTeams(entries.data);
  const now = useNow().getTime();
  const entryOf = useMemo(() => entryBySideTeam(entries.data), [entries.data]);
  const streams = useLeagueStreams(lid).data ?? [];
  const [edit, setEdit] = useState<EditMode | null>(null);
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [busy, setBusy] = useState<null | 'dejar' | 'anular'>(null);

  if (q.error) return <LoadError error={q.error} />;
  if (q.loading && !m) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Cargando la serie" />
      </View>
    );
  }
  if (!m) return <Empty title="Esta serie ya no existe" />;
  const rules = rulesFromMatch(m.rules, m.format);
  if (!rules) return <Empty title="No se pudo leer la serie" text="Actualiza la app e intenta de nuevo." />;

  // En el teléfono no hay Pro: lo del organizador (corregir, W.O., la hora, anular, el reclamo) es de los admins.
  const organizer = isAdmin;
  const mySide = sideOfTeams(m, myTeams.act);
  const known = m.sides.every((s) => !!s.teamId);
  const canScore = canScoreSeries(m, { isAdmin, scorer: !!member?.scorer, mySide });
  const names: [string, string] = [sideName(m.sides[0]), sideName(m.sides[1])];
  const heading = m.stage || 'Serie';
  const when = whenText(m.scheduledAt, league.tz, true);
  const status = statusInfo(m, now);
  const mode: EditMode | null = edit ?? (canScore ? 'finish' : null);
  const stream = streamFor(streams, { matchId: m.id });
  const liveTitle = `${names[0]} vs. ${names[1]}`;
  const entryFor = (n: 1 | 2) => {
    const team = m.sides[n - 1].teamId;
    const id = team ? entryOf.get(team) : undefined;
    return id ? (entries.data.find((e) => e.id === id) ?? null) : null;
  };
  const proof = parseSeriesScore(m.score)?.proof ?? [];

  async function keepProposed() {
    setBusy('dejar');
    try {
      await resolveDispute(lid, m!.id, { note: KEEP_PROPOSED_NOTE });
      toast('Reclamo resuelto: queda el propuesto');
    } catch (e) {
      toast(esportsErrorText(e, rules!.game), 'error');
    } finally {
      setBusy(null);
    }
  }
  async function doVoid() {
    setSheet(null);
    if (!(await confirmAsync(VOID_ASK))) return;
    setBusy('anular');
    try {
      await voidMatch(lid, m!.id);
      toast('Serie anulada');
    } catch (e) {
      toast(esportsErrorText(e, rules!.game), 'error');
    } finally {
      setBusy(null);
    }
  }
  const pick: Record<SeriesMenuKey, () => void> = {
    corregir: () => {
      setSheet(null);
      setEdit('correct');
    },
    wo: () => setSheet('wo'),
    hora: () => setSheet('hora'),
    anular: () => void doVoid(),
  };
  const icons: Record<SeriesMenuKey, typeof Pencil> = { corregir: Pencil, wo: UserX, hora: CalendarClock, anular: XCircle };
  const adminItems = organizer ? seriesAdminMenu(m, { known }) : [];
  const canLive = canStartStream(ctx) && !stream;
  const hasMenu = canLive || adminItems.length > 0;

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt variant="title" style={{ flex: 1 }}>
            {heading}
          </Txt>
          {hasMenu && (
            <Pressable accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={6} onPress={() => setSheet('menu')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <MoreHorizontal size={22} color={c.fg} />
            </Pressable>
          )}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <MatchStatus label={status.label} tone={status.tone} live={status.live} />
          <Txt variant="meta" tone="muted">
            {`· ${[`Al mejor de ${rules.bestOf}`, when].filter(Boolean).join(' · ')}`}
          </Txt>
        </View>
        {/* Si la serie se está transmitiendo: «Ver en vivo». */}
        {stream && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Ver en vivo"
            onPress={() => router.push(liveHref(lid, stream.id) as Href)}
            style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, borderRadius: 18, paddingHorizontal: 14, marginTop: 6, backgroundColor: c.danger, transform: [{ scale: pressed ? 0.97 : 1 }] })}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.onDanger }} />
            <Txt style={{ fontSize: 14, fontFamily: font.bold, color: c.onDanger }}>Ver en vivo</Txt>
          </Pressable>
        )}
      </View>

      <SeriesBoard match={m} rules={rules} names={names} mySide={mySide} entryFor={entryFor} />

      <ConfirmResult lid={lid} match={m} mySide={mySide} isAdmin={isAdmin} now={now} />

      {organizer && m.status === 'disputed' && edit !== 'resolve' && (
        <Card style={{ paddingTop: 16, paddingBottom: 18, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Gavel size={16} color={c.danger} />
            <Txt tone="danger" style={{ fontSize: 14, fontFamily: font.bold }}>
              En disputa
            </Txt>
          </View>
          <Txt>{m.disputeNote ? `«${m.disputeNote}»` : 'El rival dice que el resultado no es así.'}</Txt>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Button size="lg" style={{ flex: 1 }} icon={<Undo2 size={16} color={c.fg} />} loading={busy === 'dejar'} onPress={keepProposed}>
              Dejar el propuesto
            </Button>
            <Button variant="soft" size="lg" style={{ flex: 1 }} onPress={() => setEdit('resolve')}>
              Corregir
            </Button>
          </View>
        </Card>
      )}

      {mode && <SeriesEditor key={`${m.id}:${mode}`} match={m} rules={rules} names={names} mode={mode} admin={isAdmin} onCancel={edit ? () => setEdit(null) : undefined} onDone={() => setEdit(null)} />}

      {!mode && !hasResult(m) && !known && m.status !== 'void' && (
        <View style={{ borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 14 }}>
          <Txt variant="meta" tone="muted">
            Esta serie se juega cuando se sepan los dos lados.
          </Txt>
        </View>
      )}

      {proof.length > 0 && <ProofStrip ids={proof} />}

      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={heading}>
        {canLive && <MenuRow icon={<Radio size={20} color={c.fg2} />} label="Transmitir en vivo" hint="Pon el link de YouTube, Twitch, Facebook…" onPress={() => setSheet('live')} />}
        {adminItems.map((it) => {
          const I = icons[it.key];
          return <MenuRow key={it.key} icon={<I size={20} color={it.danger ? c.danger : c.fg2} />} label={it.label} hint={it.hint} danger={it.danger} disabled={it.key === 'anular' && busy === 'anular'} onPress={pick[it.key]} />;
        })}
      </Sheet>
      <StartStreamSheet lid={lid} matchId={m.id} defaultTitle={liveTitle} open={sheet === 'live'} onClose={() => setSheet(null)} />
      <WalkoverSheet open={sheet === 'wo'} onClose={() => setSheet(null)} match={m} rules={rules} names={names} />
      <RescheduleSheet key={`hora:${sheet === 'hora'}`} open={sheet === 'hora'} onClose={() => setSheet(null)} match={m} tz={league.tz} game={rules.game} now={now} />
    </View>
  );
}

/** W.O.: quién no vino (o ninguno). El marcador lo arma el motor (`walkoverScore`). */
function WalkoverSheet({ open, onClose, match: m, rules, names }: { open: boolean; onClose: () => void; match: Match; rules: SeriesRules; names: readonly [string, string] }) {
  const { lid } = useLeagueCtx();
  const [absent, setAbsent] = useState<0 | 1 | 2 | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (absent === null) return;
    setBusy(true);
    try {
      await setWalkover(lid, m.id, absent, { score: walkoverScore(rules, absent) });
      toast('W.O. guardado');
      onClose();
    } catch (e) {
      toast(esportsErrorText(e, rules.game), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="W.O."
      subtitle="Gana el que se presentó"
      footer={
        <Button variant="primary" size="lg" full disabled={absent === null} loading={busy} onPress={save}>
          Guardar W.O.
        </Button>
      }
    >
      <View accessibilityRole="radiogroup" accessibilityLabel="Quién no vino" style={{ gap: 8 }}>
        {walkoverOptions(names).map((o) => (
          <ChoiceRow key={o.key} title={o.label} selected={absent === o.key} onPress={() => setAbsent(o.key)} />
        ))}
      </View>
    </Sheet>
  );
}

/** Cambiar la hora de la serie (en la zona de la liga). */
function RescheduleSheet({ open, onClose, match: m, tz, game, now }: { open: boolean; onClose: () => void; match: Match; tz?: string; game: SeriesRules['game']; now: number }) {
  const { lid } = useLeagueCtx();
  const [start] = useState(() => localParts(m.scheduledAt, tz) ?? localParts(new Date(now).toISOString(), tz)!);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [busy, setBusy] = useState(false);
  const iso = zonedIso(date, time, tz);
  async function save() {
    if (!iso) return;
    setBusy(true);
    try {
      await rescheduleMatch(lid, m.id, iso);
      toast('Hora cambiada');
      onClose();
    } catch (e) {
      toast(esportsErrorText(e, game), 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Cambiar hora"
      footer={
        <Button variant="primary" size="lg" full disabled={!iso} loading={busy} onPress={save}>
          Guardar
        </Button>
      }
    >
      <View style={{ gap: 8 }}>
        <Legend>Día</Legend>
        <DateStepper value={date} onChange={setDate} />
      </View>
      <View style={{ gap: 8 }}>
        <Legend>Hora</Legend>
        <TimeStepper value={time} onChange={setTime} label="Hora" />
      </View>
    </Sheet>
  );
}

/**
 * Los dos lados con la serie en grande (mapas o juegos ganados), el ganador con copa y el mío en acento suave; debajo,
 * mapa por mapa («Ascent 13-9»).
 */
function SeriesBoard({
  match: m,
  rules,
  names,
  mySide,
  entryFor,
}: {
  match: Match;
  rules: SeriesRules;
  names: readonly [string, string];
  mySide: 1 | 2 | null;
  entryFor: (n: 1 | 2) => EsportsEntry | null;
}) {
  const c = useColors();
  const score = parseSeriesScore(m.score);
  const lines = seriesLines(score, rules, names);
  return (
    <Card style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 16 }}>
      {m.sides.map((s, i) => {
        const won = m.winner === s.side;
        const absent = m.status === 'walkover' && (m.walkoverSide === s.side || m.walkoverSide === 0);
        const entry = entryFor(s.side);
        return (
          <View
            key={s.side}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 16, marginHorizontal: -10, paddingHorizontal: 10, marginTop: i ? 2 : 0, backgroundColor: mySide === s.side ? c.accentSoft : 'transparent' }}
          >
            {entry?.kind === 'team' ? <TeamLogo path={null} name={entry.name} tag={entry.tag} /> : <Initials name={names[i]} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt numberOfLines={1} style={{ fontSize: 17, fontFamily: won ? font.bold : m.winner ? font.medium : font.semibold, color: m.winner && !won ? c.muted : c.fg }}>
                {names[i]}
              </Txt>
              {(s.seed != null || absent) && (
                <Txt tone="muted" style={{ fontSize: 13 }}>
                  {[s.seed != null ? `Siembra ${s.seed}` : null, absent ? 'No vino' : null].filter(Boolean).join(' · ')}
                </Txt>
              )}
            </View>
            {won && <Trophy size={20} color={c.gold} accessibilityLabel="Ganó" />}
            <Txt style={{ width: 36, textAlign: 'right', fontSize: 30, lineHeight: 34, fontFamily: won ? font.bold : font.medium, color: won ? c.fg : c.faint }}>{score ? score.sides[i] : '–'}</Txt>
          </View>
        );
      })}
      {lines.length > 0 && (
        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
          {lines.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}>
              <Txt tone="muted" style={{ width: 64, fontSize: 14 }}>
                {l.label}
              </Txt>
              <Txt tone="fg2" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>
                {l.map}
              </Txt>
              <Txt style={{ fontSize: 14, fontFamily: font.semibold }}>{l.result}</Txt>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/**
 * Anotar la serie: un bloque por mapa o juego (se agregan de a uno hasta que alguien gana), las capturas y el botón con
 * el resumen. `finish`: lo anota el capitán (falta que confirme el rival) o el admin/anotador (queda confirmado);
 * `correct`: el admin corrige; `resolve`: el admin decide un reclamo con otro marcador.
 */
function SeriesEditor({
  match: m,
  rules,
  names,
  mode,
  admin,
  onCancel,
  onDone,
}: {
  match: Match;
  rules: SeriesRules;
  names: [string, string];
  mode: EditMode;
  admin: boolean;
  onCancel?: () => void;
  onDone: () => void;
}) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const uid = useAuth().user?.uid ?? null;
  const [prev] = useState(() => (mode === 'finish' ? null : parseSeriesScore(m.score)));
  const [games, setGames] = useState<GameRecord[]>(() => (prev?.games.length ? prev.games.map((g) => ({ ...g })) : [emptyGame(rules)]));
  const [touched, setTouched] = useState<Set<number>>(() => new Set(prev?.games.map((_, i) => i) ?? []));
  const [proof, setProof] = useState<string[]>(() => [...(prev?.proof ?? [])]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState<null | 'enviar' | 'foto'>(null);
  const word = gameWord(rules);

  const clean = games.map(cleanGame);
  const errors = clean.map((g, i) => (touched.has(i) || tried ? validateGame(rules, g, i) : null));
  const seriesErrors = tried ? validateSeries(rules, clean, { final: true }) : [];
  const summary = resultSummary(rules, clean, names);
  const addable = canAddGame(rules, clean) && clean.every((g, i) => !validateGame(rules, g, i));

  const change = (i: number, g: GameRecord) => {
    setGames((list) => list.map((x, j) => (j === i ? g : x)));
    setTouched((s) => new Set(s).add(i));
  };

  async function addPhoto(source: PhotoSource) {
    if (proof.length >= 3) return;
    setBusy('foto');
    try {
      const img = await pickPhoto(source);
      if (!img) return;
      const id = await addMatchProofImage(lid, m.eventId ?? '', img);
      setProof((p) => [...p, id].slice(0, 3));
    } catch (e) {
      toast(esportsErrorText(e, rules.game), 'error');
    } finally {
      setBusy(null);
    }
  }
  const [asking, setAsking] = useState(false);
  const pickFrom = (source: PhotoSource) => {
    setAsking(false);
    void addPhoto(source);
  };

  async function submit() {
    setTried(true);
    if (validateSeries(rules, clean, { final: true }).length) return;
    const score = buildSeriesScore(rules, clean, proof);
    const winner = seriesWinner(rules, clean) ?? null;
    setBusy('enviar');
    try {
      if (mode === 'correct') {
        await adminCorrectResult(lid, m.id, { score, winner, note: CORRECTED_NOTE });
        toast('Resultado corregido');
      } else if (mode === 'resolve') {
        await resolveDispute(lid, m.id, { score, winner, note: CORRECTED_NOTE });
        toast('Reclamo resuelto con el marcador nuevo');
      } else {
        const said = finishToast(await finishMatch(lid, m.id, { score, winner }));
        toast(said.text, said.tone);
      }
      onDone();
    } catch (e) {
      toast(esportsErrorText(e, rules.game), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 4 }}>
        <Txt variant="section" accessibilityRole="header" style={{ flex: 1 }}>
          {editorTitle(mode)}
        </Txt>
        {onCancel && (
          <Pressable accessibilityRole="button" onPress={onCancel} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
            <X size={16} color={c.accent} />
            <Txt variant="meta" tone="accent" style={{ fontFamily: font.semibold }}>
              Cancelar
            </Txt>
          </Pressable>
        )}
      </View>
      {mode === 'finish' && !admin && !!uid && (
        <Txt tone="muted" style={{ fontSize: 13.5, marginHorizontal: 4, marginTop: -4 }}>
          {scoringHint(rules)}
        </Txt>
      )}
      {games.map((g, i) => (
        <GameRow
          key={i}
          rules={rules}
          index={i}
          game={g}
          names={names}
          onChange={(x) => change(i, x)}
          onRemove={i > 0 && i === games.length - 1 ? () => setGames((list) => list.slice(0, -1)) : undefined}
          error={errors[i]}
        />
      ))}
      {addable && (
        <Button size="lg" full icon={<Plus size={20} color={c.fg} />} onPress={() => setGames((list) => [...list, emptyGame(rules)])}>
          {`Agregar ${word.toLowerCase()} ${games.length + 1}`}
        </Button>
      )}

      <View style={{ gap: 8 }}>
        <Txt tone="fg2" variant="meta" style={{ fontFamily: font.bold, marginHorizontal: 4 }}>
          Foto de la pantalla final (opcional, hasta 3)
        </Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {proof.map((id) => (
            <ProofThumb key={id} id={id} onRemove={() => setProof((p) => p.filter((x) => x !== id))} />
          ))}
          {proof.length < 3 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agregar una captura"
              disabled={busy === 'foto'}
              onPress={() => setAsking(true)}
              style={{ width: 80, height: 80, borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: c.line, alignItems: 'center', justifyContent: 'center', opacity: busy === 'foto' ? 0.6 : 1 }}
            >
              {busy === 'foto' ? <LogoSpinner size={28} label="Subiendo la captura" /> : <Camera size={28} color={c.accent} />}
            </Pressable>
          )}
        </ScrollView>
        <Sheet open={asking} onClose={() => setAsking(false)} title="Foto de la pantalla final">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button size="xl" icon={<Camera size={20} color={c.fg} />} onPress={() => pickFrom('camera')} style={{ flex: 1 }}>
              Tomar foto
            </Button>
            <Button size="xl" icon={<ImagePlus size={20} color={c.fg} />} onPress={() => pickFrom('library')} style={{ flex: 1 }}>
              Galería
            </Button>
          </View>
        </Sheet>
      </View>

      {seriesErrors.length > 0 && (
        <View accessibilityRole="alert" style={{ gap: 4, marginHorizontal: 4 }}>
          {seriesErrors.map((e) => (
            <Txt key={e} tone="danger" style={{ fontSize: 13.5, fontFamily: font.medium }}>
              {e}
            </Txt>
          ))}
        </View>
      )}
      <Txt accessibilityLiveRegion="polite" tone={summary.done ? 'fg' : 'muted'} style={{ textAlign: 'center', fontSize: 15, fontFamily: font.semibold, marginTop: 4 }}>
        {summary.text}
      </Txt>
      <Button variant="primary" size="xl" full loading={busy === 'enviar'} disabled={busy === 'foto'} onPress={submit}>
        {editorLabel(mode, admin)}
      </Button>
    </View>
  );
}

function ProofThumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const photo = usePhoto(lid, id);
  return (
    <View style={{ width: 80, height: 80, borderRadius: 16, overflow: 'hidden', backgroundColor: c.surface2 }}>
      {photo.data && <Image source={{ uri: photo.data.url }} accessibilityLabel="Captura" style={StyleSheet.absoluteFill} contentFit="cover" />}
      <Pressable accessibilityRole="button" accessibilityLabel="Quitar la captura" onPress={onRemove} style={{ position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'flex-end', padding: 6 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} color="#fff" />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Un mapa o juego de la serie con la regla del juego (GameRow de la web): VALORANT y CS2, el mapa y las rondas; Rocket
 * League, goles y la prórroga; EA SPORTS FC, goles y penales; NBA 2K, puntos; LoL y MLBB, «¿Quién ganó?» y kills; SF6 y
 * TEKKEN 8, quién ganó y las rondas; Smash, quién ganó y las vidas; Clash Royale, quién ganó y las coronas. Debajo, el
 * error del motor en vivo.
 */
function GameRow({
  rules,
  index,
  game: g,
  names,
  onChange,
  onRemove,
  error,
}: {
  rules: SeriesRules;
  index: number;
  game: GameRecord;
  names: readonly [string, string];
  onChange: (g: GameRecord) => void;
  onRemove?: () => void;
  error?: string | null;
}) {
  const c = useColors();
  const [picking, setPicking] = useState(false);
  const meta = GAMES[rules.game];
  const word = gameWord(rules);
  const set = (patch: Partial<GameRecord>) => onChange(tidyGame(rules, { ...g, ...patch }));
  const pair = (key: 'a' | 'b', max: number, what: string, optional = false) => (
    <ScoreStepper value={g[key]} optional={optional} min={0} max={max} label={`${what} de ${names[key === 'a' ? 0 : 1]}`} onChange={(n) => set({ [key]: n } as Partial<GameRecord>)} />
  );
  const steppers = (max: number, what: string, optional = false) => (
    <View>
      <SideStepRow name={names[0]}>{pair('a', max, what, optional)}</SideStepRow>
      <SideStepRow name={names[1]} top>
        {pair('b', max, what, optional)}
      </SideStepRow>
    </View>
  );
  const small = (text: string) => (
    <Txt tone="muted" style={{ fontSize: 13, marginTop: 8 }}>
      {text}
    </Txt>
  );

  let body: ReactNode = null;
  switch (meta.scoring) {
    case 'val':
    case 'cs': {
      const mapName = g.map ? (meta.maps.find((x) => x.id === g.map)?.name ?? g.map) : null;
      body = (
        <>
          {meta.maps.length > 0 && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${word} ${index + 1}: cuál`}
                onPress={() => setPicking(true)}
                style={{ height: 44, borderRadius: 12, backgroundColor: c.surface2, paddingHorizontal: 14, justifyContent: 'center', marginBottom: 4 }}
              >
                <Txt tone={mapName ? 'fg' : 'muted'}>{mapName ?? 'Mapa (opcional)'}</Txt>
              </Pressable>
              <Sheet open={picking} onClose={() => setPicking(false)} title={`${word} ${index + 1}: cuál`}>
                <ChoiceRow
                  title="Mapa (opcional)"
                  selected={!g.map}
                  onPress={() => {
                    set({ map: undefined });
                    setPicking(false);
                  }}
                />
                {meta.maps.map((x) => (
                  <ChoiceRow
                    key={x.id}
                    title={x.name}
                    selected={g.map === x.id}
                    onPress={() => {
                      set({ map: x.id });
                      setPicking(false);
                    }}
                  />
                ))}
              </Sheet>
            </>
          )}
          {steppers(99, 'Rondas')}
        </>
      );
      break;
    }
    case 'goals_ot':
      body = (
        <>
          {steppers(99, 'Goles')}
          {isCloseGame(g) && <ToggleRow checked={g.ot === true} onChange={(v) => set({ ot: v ? true : undefined })} label="Prórroga (gol de oro)" />}
        </>
      );
      break;
    case 'goals_pen': {
      const { tied, draw } = penaltyState(g);
      body = (
        <>
          {steppers(30, 'Goles')}
          {tied && rules.draws && (
            <ToggleRow checked={draw} onChange={(v) => set(v ? { pa: undefined, pb: undefined } : { pa: 0, pb: 0 })} label="Empate (sin penales)" hint="En grupos o liga al mejor de 1 se puede empatar." />
          )}
          {tied && !draw && (
            <View style={{ marginTop: 4, borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
              <Txt tone="fg2" variant="meta" style={{ fontFamily: font.bold }}>
                Penales
              </Txt>
              <SideStepRow name={names[0]}>
                <ScoreStepper value={g.pa} min={0} max={30} label={`Penales de ${names[0]}`} onChange={(n) => set({ pa: n ?? 0 })} />
              </SideStepRow>
              <SideStepRow name={names[1]}>
                <ScoreStepper value={g.pb} min={0} max={30} label={`Penales de ${names[1]}`} onChange={(n) => set({ pb: n ?? 0 })} />
              </SideStepRow>
            </View>
          )}
          {tied && !rules.draws && g.pa == null && g.pb == null && (
            <Pressable accessibilityRole="button" onPress={() => set({ pa: 0, pb: 0 })} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Txt tone="accent" variant="meta" style={{ fontFamily: font.semibold }}>
                Poner los penales
              </Txt>
            </Pressable>
          )}
        </>
      );
      break;
    }
    case 'points':
      body = steppers(300, 'Puntos');
      break;
    case 'win':
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set({ w })} />
          {small('Kills (opcional)')}
          {steppers(200, 'Kills', true)}
        </>
      );
      break;
    case 'fight': {
      const fight = fightChoices(rules, g);
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set(swapFor(g, w))} />
          {!!g.w && (
            <>
              {small('Rondas (opcional)')}
              <ChoiceChips label="Rondas del juego" items={fight.items} value={fight.value} onChange={(k) => set(fight.pick(k))} />
            </>
          )}
        </>
      );
      break;
    }
    case 'stocks': {
      const stocks = stockChoices(rules, g);
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set(swapFor(g, w))} />
          {!!g.w && (
            <>
              {small('Vidas que le quedaron (opcional)')}
              <ChoiceChips label="Vidas que le quedaron" items={stocks.items} value={stocks.value} onChange={(k) => set(stocks.pick(k))} />
            </>
          )}
        </>
      );
      break;
    }
    case 'crowns':
      body = (
        <>
          <WinnerPick value={g.w ?? null} names={names} onChange={(w) => set({ w })} />
          {small('Coronas')}
          {steppers(3, 'Coronas')}
        </>
      );
      break;
    case 'br':
      body = null;
      break;
  }

  return (
    <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderWidth: error ? 1 : 0, borderColor: c.danger }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, marginBottom: 6 }}>
        <Txt style={{ flex: 1, fontSize: 15, fontFamily: font.bold }}>{`${word} ${index + 1}`}</Txt>
        {onRemove && (
          <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${word.toLowerCase()} ${index + 1}`} onPress={onRemove} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}>
            <Trash2 size={18} color={c.faint} />
          </Pressable>
        )}
      </View>
      <View style={{ gap: 8 }}>{body}</View>
      {!!error && (
        <Txt accessibilityRole="alert" tone="danger" style={{ marginTop: 8, fontSize: 13.5, fontFamily: font.medium }}>
          {error}
        </Txt>
      )}
    </Card>
  );
}
