/**
 * «Dar insignia» en la app (GiveBadge de la web, docs/insignias.md §5.6): a quién (con «Sugerencias de la app»), el
 * periodo, la división y una nota, «Así la verá» y el aviso con «Deshacer». Con una insignia por equipo se elige el
 * equipo o la pareja y su plantilla sale marcada. Nadie se la da a sí mismo; los cupos los pone la base. Lo que se
 * decide y se dice en cada paso: src/components/badges/maker/give.ts.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft, ArrowRight, Check, Gift, Search, Sparkles, Undo2, Users } from 'lucide-react-native';
import { badgeLabel } from '@mm/badges/visual/period';
import { awardLeagueBadge, revokeLeagueBadgeAward, type GiveResult, type LeagueBadge, type MadeAward } from '@mm/lib/data/leagueBadges';
import { usePlayers } from '@mm/lib/data/players';
import { useSeasonTeams } from '@mm/lib/data/seasonTeams';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import type { Player } from '@mm/lib/types';
import { leagueSport } from '@mm/sports/registry';
import { BADGE_TEXT_MAX, cleanBadgeText, textLength } from '@mm/components/badges/text';
import { dayText, givenText, makerErrorText, namesText, periodChoices, quotaFullText, quotaLeft, type PeriodChoice } from '@mm/components/badges/maker/design';
import {
  GIVE_STEPS,
  NOTE_HINT,
  NO_ACTIVE_TEXT,
  NO_TEAMS_TEXT,
  STEP_LABEL,
  SUGGEST_FOOT,
  TEAM_ROSTER_HINT,
  UNDONE_TOAST,
  UNDO_NOTE,
  canPick,
  cleanDivision as cleanDivisionOf,
  cleanPeriod as cleanPeriodOf,
  detailErrors,
  detailsOk as detailsOkOf,
  emptyPlayersText,
  giveTitle,
  notifiedText,
  notifyHint,
  notifyLabel,
  notifyState,
  overQuota as overQuotaOf,
  periodOptions,
  pickAll,
  pickDesignSub,
  pickedLine,
  playerList,
  previewDetail,
  quotaLine,
  slotHolders,
  stepIndex,
  suggestionChosen,
  togglePick,
  toggleSuggestion,
  type DetailErrors,
  type GiveStep,
} from '@mm/components/badges/maker/give';
import { designLook } from '@mm/components/badges/maker/look';
import type { Suggestion, SuggestOutcome } from '@mm/components/badges/maker/suggest';
import { useBadgeSuggestions } from '@mm/components/badges/maker/useSuggestions';
import { Insignia } from '@/components/badges/Insignia';
import { toast } from '@/components/feedback';
import { CheckRow, SwitchRow } from '@/components/prizes/parts';
import { Badge, Button, Card, Input, LoadError, Sheet, Txt } from '@/components/ui';
import { LogoSpinner } from '@/components/Logo';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';
import { Chip, Chips, Counter, FieldError, FieldLabel } from './parts';

export interface GiveBadgeProps {
  open: boolean;
  /** El diseño a dar; sin él, primero se elige cuál. */
  badge: LeagueBadge | null;
  /** Los diseños de la liga (para elegir) y los otorgamientos (cupos y quién ya la tiene). */
  designs: readonly LeagueBadge[];
  awards: readonly MadeAward[];
  onClose: () => void;
}

export function GiveBadge({ open, badge, designs, awards, onClose }: GiveBadgeProps) {
  return open ? <GiveFlow key={badge?.id ?? 'elegir'} initial={badge} designs={designs} awards={awards} onClose={onClose} /> : null;
}

function GiveFlow({ initial, designs, awards, onClose }: { initial: LeagueBadge | null; designs: readonly LeagueBadge[]; awards: readonly MadeAward[]; onClose: () => void }) {
  const c = useColors();
  const { lid, league, myPlayerId } = useLeagueCtx();
  const sport = leagueSport(league);
  const players = usePlayers(lid);
  const now = useNow().getTime();
  const choices = periodChoices(league, now);
  const [badge, setBadge] = useState<LeagueBadge | null>(initial);
  const [step, setStep] = useState<GiveStep>(initial ? 'quien' : 'cual');
  const [picked, setPicked] = useState<string[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [period, setPeriod] = useState(initial?.periodText ?? '');
  const [division, setDivision] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(!league.hasMinors);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GiveResult | null>(null);
  const teams = useSeasonTeams(badge?.byTeam ? lid : undefined);
  const suggestions = useBadgeSuggestions({ template: badge?.template ?? null, byTeam: badge?.byTeam ?? false, periodText: badge?.periodText ?? '', enabled: step === 'quien' });

  const byId = new Map(players.data.map((p) => [p.id, p] as const));
  const nameOf = (id: string) => byId.get(id)?.name ?? 'Jugador';
  const cleanPeriod = cleanPeriodOf(period);
  const cleanDivision = cleanDivisionOf(division);
  const holders = slotHolders(awards, badge, cleanPeriod, cleanDivision);
  const left = badge ? quotaLeft(badge, awards, cleanPeriod, cleanDivision) : 0;
  const team = teams.data.find((t) => t.id === teamId) ?? null;

  const free = (id: string) => canPick(id, myPlayerId, holders);
  const pick = (ids: readonly string[], to: string | null = teamId) => {
    setTeamId(to);
    setPicked(pickAll(ids, free));
  };
  /** Una sugerencia: un equipo reemplaza la selección por su plantilla; un jugador se suma (o se quita si ya estaba). */
  const suggest = (s: Suggestion) => {
    if (badge?.byTeam && s.teamId) return pick(s.playerIds, s.teamId);
    setPicked((p) => toggleSuggestion(p, s, free));
  };
  const toggle = (id: string) => setPicked((p) => togglePick(p, id));

  const textErrors = detailErrors(period, division, note);
  const detailsOk = detailsOkOf(period, division, note);
  // El cupo que se ve en el teléfono (la base decide igual): con una por equipo, el equipo cuenta 1.
  const overQuota = overQuotaOf({ badge, awards, left, picked, teamId, period: cleanPeriod, division: cleanDivision });
  const quotaText = badge ? quotaFullText({ name: badge.name, limitKind: badge.limitKind, period: cleanPeriod, holders: [...holders].map(nameOf) }) : '';

  async function give() {
    if (!badge || busy) return;
    if (overQuota) {
      setError(quotaText);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await awardLeagueBadge({ badge, players: picked, teamId: badge.byTeam ? teamId : null, period: cleanPeriod, division: cleanDivision, note, notify: notify && !league.hasMinors });
      setResult(res);
      setStep('listo');
    } catch (e) {
      console.error(e);
      setError(makerErrorText(e, { action: 'dar', name: badge.name, limitKind: badge.limitKind, period: cleanPeriod, holders: [...holders].map(nameOf) }));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!result || busy) return;
    setBusy(true);
    try {
      await revokeLeagueBadgeAward(lid, result.awards.map((a) => a.id));
      toast(UNDONE_TOAST);
      onClose();
    } catch (e) {
      console.error(e);
      setError(makerErrorText(e, { action: 'quitar' }));
    } finally {
      setBusy(false);
    }
  }

  const back = (to: GiveStep) => () => {
    setError(null);
    setStep(to);
  };

  let body: ReactNode;
  let footer: ReactNode;
  const row = (a: ReactNode, b?: ReactNode) => (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}>{a}</View>
      {b && <View style={{ flex: 1 }}>{b}</View>}
    </View>
  );
  if (step === 'cual' || !badge) {
    body = (
      <PickDesign
        designs={designs}
        sport={sport}
        onPick={(b) => {
          setBadge(b);
          setPeriod(b.periodText);
          setPicked([]);
          setTeamId(null);
          setStep('quien');
        }}
      />
    );
    footer = row(
      <Button full onPress={onClose}>
        Cancelar
      </Button>,
    );
  } else if (step === 'quien') {
    body = (
      <WhoStep
        badge={badge}
        players={players.data}
        loading={players.loading}
        error={players.error}
        picked={picked}
        onToggle={toggle}
        onSuggestion={suggest}
        myPlayerId={myPlayerId}
        holders={holders}
        left={left}
        period={cleanPeriod}
        teams={badge.byTeam ? teams.data : null}
        teamsLoading={teams.loading}
        teamsError={teams.error}
        teamId={teamId}
        onTeam={(id) => {
          const t = teams.data.find((x) => x.id === id);
          pick(t ? t.roster.map((r) => r.playerId) : [], id);
        }}
        suggestions={suggestions.outcome}
        suggestionsLoading={suggestions.loading}
      />
    );
    footer = row(
      <Button full onPress={onClose}>
        Cancelar
      </Button>,
      <Button full variant="primary" icon={<ArrowRight size={16} color={c.accentFg} />} disabled={!picked.length || (badge.byTeam && !teamId)} onPress={() => setStep('detalles')}>
        Siguiente
      </Button>,
    );
  } else if (step === 'detalles') {
    body = (
      <DetailsStep
        badge={badge}
        choices={choices}
        period={period}
        onPeriod={setPeriod}
        division={division}
        onDivision={setDivision}
        note={note}
        onNote={setNote}
        notify={notify}
        onNotify={setNotify}
        minors={!!league.hasMinors}
        errors={textErrors}
        withAccount={picked.filter((id) => byId.get(id)?.uid).length}
      />
    );
    footer = row(
      <Button full icon={<ArrowLeft size={16} color={c.fg} />} onPress={back('quien')}>
        Atrás
      </Button>,
      <Button full variant="primary" icon={<ArrowRight size={16} color={c.accentFg} />} disabled={!detailsOk} onPress={() => setStep('vista')}>
        Siguiente
      </Button>,
    );
  } else if (step === 'vista') {
    body = (
      <PreviewStep
        badge={badge}
        sport={sport}
        leagueName={league.name}
        tz={league.tz}
        nowIso={new Date(now).toISOString()}
        period={cleanPeriod}
        division={cleanDivision}
        note={cleanBadgeText(note)}
        names={picked.map(nameOf)}
        teamName={badge.byTeam ? (team?.name ?? null) : null}
        error={error ?? (overQuota ? quotaText : null)}
      />
    );
    footer = row(
      <Button full icon={<ArrowLeft size={16} color={c.fg} />} onPress={back('detalles')}>
        Atrás
      </Button>,
      <Button full variant="primary" icon={<Gift size={16} color={c.accentFg} />} loading={busy} disabled={overQuota} onPress={() => void give()}>
        Dar insignia
      </Button>,
    );
  } else {
    body = <DoneStep badge={badge} result={result} names={picked.map(nameOf)} period={cleanPeriod} error={error} />;
    footer = row(
      <Button full icon={<Undo2 size={16} color={c.fg} />} loading={busy} onPress={() => void undo()}>
        Deshacer
      </Button>,
      <Button full variant="primary" icon={<Check size={16} color={c.accentFg} />} onPress={onClose}>
        Listo
      </Button>,
    );
  }

  return (
    <Sheet open onClose={onClose} title={giveTitle(badge)} footer={footer}>
      {step !== 'cual' && step !== 'listo' && <Steps step={step} />}
      {body}
    </Sheet>
  );
}

/** Los pasos: «1 ¿A quién?», 2 y 3 (en el teléfono solo dice el nombre del paso en el que está). */
function Steps({ step }: { step: GiveStep }) {
  const c = useColors();
  const at = stepIndex(step);
  return (
    <View accessibilityLabel="Pasos" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {GIVE_STEPS.map((k, i) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityState={{ selected: i === at }}>
          <View style={[styles.stepDot, { backgroundColor: i <= at ? c.accent : c.surface2 }]}>
            <Txt style={{ fontSize: 11, lineHeight: 14, fontFamily: font.semibold, color: i <= at ? c.accentFg : c.muted }}>{i + 1}</Txt>
          </View>
          {i === at && (
            <Txt variant="small" tone="accent">
              {STEP_LABEL[k]}
            </Txt>
          )}
        </View>
      ))}
    </View>
  );
}

/** Elegir cuál dar (cuando «Dar insignia» se abre sin un diseño). */
function PickDesign({ designs, sport, onPick }: { designs: readonly LeagueBadge[]; sport: string; onPick: (b: LeagueBadge) => void }) {
  const c = useColors();
  const active = designs.filter((d) => d.status === 'activa');
  if (!active.length)
    return (
      <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 24 }}>
        {NO_ACTIVE_TEXT}
      </Txt>
    );
  return (
    <View style={{ gap: 4 }}>
      <Txt variant="meta" accessibilityRole="header" style={{ fontFamily: font.semibold, marginBottom: 4 }}>
        ¿Cuál vas a dar?
      </Txt>
      {active.map((d) => {
        const look = designLook(d, sport);
        return (
          <Pressable
            key={d.id}
            accessibilityRole="button"
            accessibilityLabel={`${badgeLabel(d.name, look)}. ${pickDesignSub(d)}`}
            onPress={() => onPick(d)}
            style={({ pressed }) => [styles.option, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
          >
            <Insignia badge={look} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="meta" numberOfLines={1} style={{ fontFamily: font.semibold }}>
                {d.name}
              </Txt>
              <Txt variant="small" tone="muted" numberOfLines={1} style={{ fontFamily: font.regular }}>
                {pickDesignSub(d)}
              </Txt>
            </View>
            <ArrowRight size={16} color={c.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Paso 1, «¿A quién?»: las sugerencias arriba y la lista de jugadores (o el equipo y su plantilla). */
function WhoStep({
  badge,
  players,
  loading,
  error,
  picked,
  onToggle,
  onSuggestion,
  myPlayerId,
  holders,
  left,
  period,
  teams,
  teamsLoading,
  teamsError,
  teamId,
  onTeam,
  suggestions,
  suggestionsLoading,
}: {
  badge: LeagueBadge;
  players: readonly Player[];
  loading?: boolean;
  error?: Error | null;
  picked: readonly string[];
  onToggle: (id: string) => void;
  onSuggestion: (s: Suggestion) => void;
  myPlayerId: string | null;
  holders: ReadonlySet<string>;
  left: number;
  period: string;
  teams: readonly { id: string; name: string; roster: readonly { playerId: string }[] }[] | null;
  teamsLoading?: boolean;
  teamsError?: Error | null;
  teamId: string | null;
  onTeam: (id: string) => void;
  suggestions: SuggestOutcome | null;
  suggestionsLoading?: boolean;
}) {
  const c = useColors();
  const [q, setQ] = useState('');
  const team = teams?.find((t) => t.id === teamId) ?? null;
  const list = playerList(players, q, team ? team.roster : null);
  return (
    <View style={{ gap: 16 }}>
      {suggestions && <SuggestionsBox outcome={suggestions} loading={suggestionsLoading} picked={picked} teamId={badge.byTeam ? teamId : null} onPick={onSuggestion} />}

      <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
        {quotaLine(badge, left, period)}
      </Txt>

      {teams && (
        <View style={{ gap: 6 }}>
          <FieldLabel label="Equipo o pareja" />
          {teams.length ? (
            <Chips>
              {teams.map((t) => (
                <Chip key={t.id} on={teamId === t.id} onPress={() => onTeam(t.id)} text={t.name} left={<Users size={16} color={teamId === t.id ? c.accent : c.fg} />} />
              ))}
            </Chips>
          ) : teamsLoading ? (
            <LogoSpinner size={24} />
          ) : teamsError ? (
            <LoadError error={teamsError} />
          ) : (
            <Txt variant="meta" tone="muted">
              {NO_TEAMS_TEXT}
            </Txt>
          )}
          {team && (
            <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
              {TEAM_ROSTER_HINT}
            </Txt>
          )}
        </View>
      )}

      {(!teams || team) && (
        <View style={{ gap: 8 }}>
          <View>
            <View pointerEvents="none" style={styles.searchIcon}>
              <Search size={16} color={c.muted} />
            </View>
            <Input
              value={q}
              onChangeText={setQ}
              placeholder="Busca un jugador"
              accessibilityLabel="Buscar jugador"
              autoCorrect={false}
              returnKeyType="search"
              style={{ paddingLeft: 38, height: 48, fontSize: 16 }}
            />
          </View>
          <View accessibilityLabel="Jugadores" style={[styles.players, { borderColor: c.line }]}>
            {loading && !players.length ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <LogoSpinner size={28} />
              </View>
            ) : error && !players.length ? (
              <View style={{ padding: 12 }}>
                <LoadError error={error} />
              </View>
            ) : list.length ? (
              list.map((p, i) => {
                const me = p.id === myPlayerId;
                const has = holders.has(p.id);
                const on = picked.includes(p.id);
                return (
                  <View
                    key={p.id}
                    style={[styles.player, { backgroundColor: on ? c.accentSoft : 'transparent' }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <CheckRow checked={on} label={p.name} disabled={me || has} onPress={() => onToggle(p.id)} />
                    </View>
                    {me ? <Badge tone="muted">Tú</Badge> : has ? <Badge tone="ok">Ya la tiene</Badge> : !p.uid && <Badge tone="muted">Sin cuenta</Badge>}
                  </View>
                );
              })
            ) : (
              <Txt variant="meta" tone="muted" style={{ textAlign: 'center', paddingVertical: 20, paddingHorizontal: 12 }}>
                {emptyPlayersText(players.length > 0)}
              </Txt>
            )}
          </View>
          <Txt variant="small" tone="muted" accessibilityLiveRegion="polite" style={{ fontFamily: font.regular }}>
            {pickedLine(
              picked.map((id) => players.find((p) => p.id === id)?.name ?? 'Jugador'),
              !!myPlayerId,
            )}
          </Txt>
        </View>
      )}
    </View>
  );
}

/** «Sugerencias de la app»: los primeros con sus números. Tocar una la elige. */
function SuggestionsBox({ outcome, loading, picked, teamId, onPick }: { outcome: SuggestOutcome; loading?: boolean; picked: readonly string[]; teamId: string | null; onPick: (s: Suggestion) => void }) {
  const c = useColors();
  return (
    <View style={[styles.suggest, { backgroundColor: c.surface2 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Sparkles size={16} color={c.accent} />
        <Txt variant="meta" accessibilityRole="header" style={{ fontFamily: font.semibold }}>
          Sugerencias de la app
        </Txt>
      </View>
      {loading && !outcome.list.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LogoSpinner size={18} label="Calculando" />
          <Txt variant="meta" tone="muted">
            Calculando…
          </Txt>
        </View>
      ) : outcome.list.length ? (
        <View>
          {outcome.list.map((s) => {
            const on = suggestionChosen(s, picked, teamId);
            return (
              <Pressable
                key={s.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${s.name}. ${s.detail}`}
                onPress={() => onPick(s)}
                style={({ pressed }) => [styles.suggestion, { backgroundColor: pressed ? c.surface : 'transparent' }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="meta" numberOfLines={1} style={{ fontFamily: font.semibold, color: on ? c.accent : c.fg }}>
                    {s.name}
                  </Txt>
                  <Txt variant="small" tone="muted" numberOfLines={1} style={{ fontFamily: font.regular }}>
                    {s.detail}
                  </Txt>
                </View>
                {on ? (
                  <Check size={16} color={c.accent} />
                ) : (
                  <Txt variant="small" tone="accent" style={{ fontFamily: font.semibold }}>
                    Elegir
                  </Txt>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : (
        !!outcome.note && (
          <Txt variant="meta" tone="muted">
            {outcome.note}
          </Txt>
        )
      )}
      <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
        {SUGGEST_FOOT}
      </Txt>
    </View>
  );
}

/** Paso 2: periodo (el del diseño, uno de los de hoy o uno libre), división, nota y «Avisarle». */
function DetailsStep({
  badge,
  choices,
  period,
  onPeriod,
  division,
  onDivision,
  note,
  onNote,
  notify,
  onNotify,
  minors,
  errors,
  withAccount,
}: {
  badge: LeagueBadge;
  choices: readonly PeriodChoice[];
  period: string;
  onPeriod: (v: string) => void;
  division: string;
  onDivision: (v: string) => void;
  note: string;
  onNote: (v: string) => void;
  notify: boolean;
  onNotify: (v: boolean) => void;
  minors: boolean;
  errors: DetailErrors;
  withAccount: number;
}) {
  const current = cleanPeriodOf(period);
  const options = periodOptions(badge, choices);
  const toggle = notifyState(notify, minors, withAccount);
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <FieldLabel label="Periodo" />
        <Chips>
          {options.map((o) => (
            <Chip key={o.key} on={current === o.text} onPress={() => onPeriod(o.text)} text={o.label} sub={o.text || null} />
          ))}
        </Chips>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Input
            value={period}
            maxLength={BADGE_TEXT_MAX.period}
            onChangeText={(v) => onPeriod(v.toUpperCase())}
            placeholder="O escribe uno: CLAUSURA"
            accessibilityLabel="Periodo"
            autoCapitalize="characters"
            autoCorrect={false}
            invalid={!!errors.period}
            style={{ flex: 1 }}
          />
          <Counter value={textLength(period)} max={BADGE_TEXT_MAX.period} />
        </View>
        <FieldError text={errors.period} />
      </View>

      <View style={{ gap: 6 }}>
        <FieldLabel label="División (opcional)" count={<Counter value={textLength(division)} max={BADGE_TEXT_MAX.division} />} />
        <Input
          value={division}
          maxLength={BADGE_TEXT_MAX.division}
          onChangeText={onDivision}
          placeholder="Cat. A, Femenino…"
          accessibilityLabel="División (opcional)"
          autoCorrect={false}
          invalid={!!errors.division}
        />
        <FieldError text={errors.division} />
      </View>

      <View style={{ gap: 6 }}>
        <FieldLabel label="Nota para el jugador (opcional)" count={<Counter value={textLength(note)} max={BADGE_TEXT_MAX.note} />} />
        <Input
          value={note}
          maxLength={BADGE_TEXT_MAX.note}
          onChangeText={onNote}
          placeholder="“Por tu 279 en la final”"
          accessibilityLabel="Nota para el jugador (opcional)"
          multiline
          textAlignVertical="top"
          invalid={!!errors.note}
          style={{ height: 80, paddingTop: 12, paddingBottom: 12 }}
        />
        <Txt variant="small" tone="muted" style={{ fontFamily: font.regular }}>
          {NOTE_HINT}
        </Txt>
        <FieldError text={errors.note} />
      </View>

      <SwitchRow on={toggle.on} disabled={toggle.disabled} onChange={onNotify} label={notifyLabel(withAccount)} hint={notifyHint(minors, withAccount)} />
    </View>
  );
}

/** Paso 3, «Así la verá»: la insignia a 128 sobre la tarjeta del jugador. */
function PreviewStep({
  badge,
  sport,
  leagueName,
  tz,
  nowIso,
  period,
  division,
  note,
  names,
  teamName,
  error,
}: {
  badge: LeagueBadge;
  sport: string;
  leagueName: string;
  tz?: string;
  nowIso: string;
  period: string;
  division: string;
  note: string;
  names: readonly string[];
  teamName: string | null;
  error: string | null;
}) {
  const c = useColors();
  const look = designLook(badge, sport, period);
  const detail = previewDetail(division, teamName);
  return (
    <View style={{ gap: 12 }}>
      <Txt variant="meta" style={{ fontFamily: font.semibold }}>
        Así la verá
      </Txt>
      <Card style={{ alignItems: 'center', gap: 8, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>
        <Insignia badge={look} size={128} label={badgeLabel(badge.name, look)} />
        <Txt variant="section" style={{ textAlign: 'center' }}>
          {badge.name}
        </Txt>
        {!!badge.description && (
          <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
            {badge.description}
          </Txt>
        )}
        {!!detail && (
          <Txt variant="small" tone="muted">
            {detail}
          </Txt>
        )}
        <Txt variant="small" tone="muted" style={{ fontFamily: font.regular, textAlign: 'center' }}>
          {`Otorgada por ${leagueName} · ${dayText(nowIso, tz)}`}
        </Txt>
        {!!note && (
          <View style={[styles.note, { backgroundColor: c.surface2 }]}>
            <Txt variant="meta" style={{ fontStyle: 'italic' }}>{`“${note}”`}</Txt>
          </View>
        )}
      </Card>
      <Txt variant="meta">
        {'Para '}
        <Txt variant="meta" style={{ fontFamily: font.bold }}>
          {namesText(names, 4)}
        </Txt>
        .
      </Txt>
      {!!error && (
        <View accessibilityLiveRegion="polite" style={[styles.error, { backgroundColor: c.dangerSoft }]}>
          <Txt variant="meta" tone="danger" style={{ fontFamily: font.medium }}>
            {error}
          </Txt>
        </View>
      )}
    </View>
  );
}

/** El aviso de listo, con «Deshacer» (sirve 24 h; después, solo el dueño la quita). */
function DoneStep({ badge, result, names, period, error }: { badge: LeagueBadge; result: GiveResult | null; names: readonly string[]; period: string; error: string | null }) {
  const c = useColors();
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
      <View style={[styles.done, { backgroundColor: c.okSoft }]}>
        <Check size={24} color={c.ok} />
      </View>
      <Txt variant="bodyStrong" style={{ textAlign: 'center' }}>
        {givenText(names, badge.name, period)}
      </Txt>
      <Txt variant="meta" tone="muted" style={{ textAlign: 'center' }}>
        {notifiedText(result?.notified ?? 0)}
        {UNDO_NOTE}
      </Txt>
      {!!error && (
        <View style={[styles.error, { backgroundColor: c.dangerSoft }]}>
          <Txt variant="meta" tone="danger" style={{ fontFamily: font.medium }}>
            {error}
          </Txt>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stepDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  searchIcon: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  players: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  player: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 12 },
  suggest: { gap: 6, borderRadius: 12, padding: 12 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 4 },
  note: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  error: { alignSelf: 'stretch', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  done: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
