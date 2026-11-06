/**
 * Una serie de esports (match/MatchSheet.tsx + GameRow.tsx de la web, Lite, con su misma lógica: match/game.ts y
 * logic.ts): la fase y la hora, los dos lados con su siembra y la serie («Al mejor de 3», «2-1» y el detalle mapa por
 * mapa), confirmar o reclamar (el capitán rival) y **anotar** mapa por mapa o juego por juego con la regla del juego (el
 * capitán de un lado, el admin o un anotador, mientras la serie siga abierta): el error del motor en vivo, hasta 3
 * capturas y «Enviar resultado» (o «Guardar resultado» si es admin) con el resumen («Gana Tigres 2-1»). Corregir, W.O.,
 * cambiar la hora, anular, decidir un reclamo y transmitir en vivo, en la web.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, ImagePlus, Plus, Trash2, Trophy, X } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { addMatchProofImage, esportsErrorText, useEntries, type EsportsEntry } from '@mm/lib/data/esports';
import { finishMatch, hasResult, useMatch, type Match } from '@mm/lib/data/matches';
import { useLeagueCtx } from '@mm/lib/league';
import { usePhoto } from '@mm/lib/photos';
import { useNow } from '@mm/lib/useNow';
import { sideName, statusInfo, whenText } from '@mm/components/match/format';
import { GAMES, buildSeriesScore, parseSeriesScore, seriesWinner, validateGame, validateSeries, type GameRecord, type SeriesRules } from '@mm/sports/esports';
import { canAddGame, canScoreSeries, entryBySideTeam, resultSummary, rulesFromMatch, sideOfTeams } from '@mm/pages/sports/esports/logic';
import { cleanGame, emptyGame, finishToast, fightChoices, gameWord, isCloseGame, penaltyState, scoringHint, seriesLines, stockChoices, swapFor, tidyGame } from '@mm/pages/sports/esports/match/game';
import { useMyTeams } from '@mm/pages/sports/esports/tournamentData';
import { pickPhoto, type PhotoSource } from '@/lib/pickImage';
import { ConfirmResult } from '../match/ResultParts';
import { MatchStatus } from '../match/MatchCard';
import { toast } from '../feedback';
import { ProofStrip } from './Br';
import { Initials, TeamLogo } from './bits';
import { ChoiceChips, ScoreStepper, SideStepRow, ToggleRow, WinnerPick } from './inputs';
import { Button, Card, ChoiceRow, Empty, LoadError, Sheet, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

export function EsportsMatch({ matchId }: { matchId: string }) {
  const c = useColors();
  const { lid, isAdmin, member, league } = useLeagueCtx();
  const q = useMatch(lid, matchId);
  const m = q.data;
  const entries = useEntries(m?.eventId ?? undefined);
  const myTeams = useMyTeams(entries.data);
  const now = useNow().getTime();
  const entryOf = useMemo(() => entryBySideTeam(entries.data), [entries.data]);

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

  const mySide = sideOfTeams(m, myTeams.act);
  const known = m.sides.every((s) => !!s.teamId);
  const canScore = canScoreSeries(m, { isAdmin, scorer: !!member?.scorer, mySide });
  const names: [string, string] = [sideName(m.sides[0]), sideName(m.sides[1])];
  const heading = m.stage || 'Serie';
  const when = whenText(m.scheduledAt, league.tz, true);
  const status = statusInfo(m, now);
  const entryFor = (n: 1 | 2) => {
    const team = m.sides[n - 1].teamId;
    const id = team ? entryOf.get(team) : undefined;
    return id ? (entries.data.find((e) => e.id === id) ?? null) : null;
  };
  const proof = parseSeriesScore(m.score)?.proof ?? [];

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Txt variant="title">{heading}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <MatchStatus label={status.label} tone={status.tone} live={status.live} />
          <Txt variant="meta" tone="muted">
            {`· ${[`Al mejor de ${rules.bestOf}`, when].filter(Boolean).join(' · ')}`}
          </Txt>
        </View>
      </View>

      <SeriesBoard match={m} rules={rules} names={names} mySide={mySide} entryFor={entryFor} />

      <ConfirmResult lid={lid} match={m} mySide={mySide} isAdmin={isAdmin} now={now} />

      {canScore && <SeriesEditor key={`${m.id}:finish`} match={m} rules={rules} names={names} admin={isAdmin} />}

      {!canScore && !hasResult(m) && !known && m.status !== 'void' && (
        <View style={{ borderRadius: 16, backgroundColor: c.surface2, paddingHorizontal: 16, paddingVertical: 14 }}>
          <Txt variant="meta" tone="muted">
            Esta serie se juega cuando se sepan los dos lados.
          </Txt>
        </View>
      )}

      {proof.length > 0 && <ProofStrip ids={proof} />}
    </View>
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

/** Anotar la serie (el capitán, el admin o el anotador): un bloque por mapa o juego, las capturas y el botón con el resumen. */
function SeriesEditor({ match: m, rules, names, admin }: { match: Match; rules: SeriesRules; names: [string, string]; admin: boolean }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const uid = useAuth().user?.uid ?? null;
  const [games, setGames] = useState<GameRecord[]>(() => [emptyGame(rules)]);
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  const [proof, setProof] = useState<string[]>([]);
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
    setBusy('enviar');
    try {
      const said = finishToast(await finishMatch(lid, m.id, { score: buildSeriesScore(rules, clean, proof), winner: seriesWinner(rules, clean) ?? null }));
      toast(said.text, said.tone);
    } catch (e) {
      toast(esportsErrorText(e, rules.game), 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: 12 }}>
      <Txt variant="section" accessibilityRole="header" style={{ marginHorizontal: 4 }}>
        Anotar resultado
      </Txt>
      {!admin && !!uid && (
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
        {admin ? 'Guardar resultado' : 'Enviar resultado'}
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
