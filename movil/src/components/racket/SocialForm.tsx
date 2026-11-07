/**
 * El round robin social del pickleball al crearlo y en sus ajustes (SocialForm.tsx de la web, con su misma lógica:
 * pickleball/social/logic.ts): el juego de cada partido (a 11, 15 o 21, ganando por 2 o por 1, tradicional o por rally),
 * el mixto (quiénes son del grupo A) y «Nuevo › Round robin social» en 3 pasos: fecha, canchas y juego → jugadores →
 * rondas. Crea el evento y abre el round robin.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { createRacketEvent, type RacketEvent } from '@mm/lib/data/racket';
import { saveErrorMessage } from '@mm/lib/errorText';
import { useLeagueCtx } from '@mm/lib/league';
import { GAME_TARGETS, gameText, isSocialEvent, mixedReady, newSocialConfig, parseSocialConfig, socialConfigJson, socialDefaultName, type GameRules, type SocialConfig } from '@mm/pages/sports/pickleball/social/logic';
import { useLevels } from '@mm/pages/sports/racket/levels';
import { nightInfo, suggestRounds } from '@mm/pages/sports/racket/logic/night';
import { todayIn } from '@mm/pages/sports/racket/logic/time';
import { useNames } from '@mm/pages/sports/racket/names';
import { DateStepper } from '../DateStepper';
import { TimeStepper } from '../esports/fields';
import { ChoiceChips, ToggleRow } from '../esports/inputs';
import { toast } from '../feedback';
import { Button, Field, Input, Txt } from '../ui';
import { NightFields, NightPlayers } from './NightForm';
import { Note, Stepper } from './parts';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

/** El juego de cada partido: a 11, 15 o 21, ganando por 2 o por 1, conteo tradicional o por rally. */
export function GameFields({ value, onChange }: { value: GameRules; onChange: (g: GameRules) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Txt tone="muted" style={{ fontSize: 12, fontFamily: font.medium }}>
          Cada partido es un juego a
        </Txt>
        <ChoiceChips<`${number}`>
          label="Cada partido es un juego a"
          value={`${value.to}`}
          items={GAME_TARGETS.map((t) => ({ key: `${t}` as const, label: String(t) }))}
          onChange={(k) => onChange({ ...value, to: Number(k) })}
        />
      </View>
      <ChoiceChips<'2' | '1'>
        label="Ganando por"
        value={value.winBy === 2 ? '2' : '1'}
        items={[
          { key: '2', label: 'Ganando por 2' },
          { key: '1', label: 'Ganando por 1' },
        ]}
        onChange={(k) => onChange({ ...value, winBy: k === '2' ? 2 : 1 })}
      />
      <ChoiceChips<'sideout' | 'rally'>
        label="Conteo"
        value={value.scoring}
        items={[
          { key: 'sideout', label: 'Tradicional' },
          { key: 'rally', label: 'Por rally' },
        ]}
        onChange={(scoring) => onChange({ ...value, scoring })}
      />
      <Txt tone="muted" style={{ fontSize: 12 }}>
        {`${gameText(value)}. Tradicional: solo suma el que saca.`}
      </Txt>
    </View>
  );
}

/** Mixto: de los jugadores, quiénes son del grupo A (cada pareja lleva uno de cada grupo). */
export function MixedGroups({ players, value, onChange }: { players: string[]; value: string[] | null; onChange: (a: string[] | null) => void }) {
  const names = useNames();
  const on = value !== null;
  const a = new Set(value ?? []);
  const nA = players.filter((p) => a.has(p)).length;
  return (
    <View style={{ gap: 8 }}>
      <ToggleRow checked={on} onChange={(v) => onChange(v ? [] : null)} label="Mixto" hint="Cada pareja con uno de cada grupo" />
      {on && (
        <>
          <Txt tone="muted" style={{ fontSize: 12 }}>
            Marca a los del grupo A (por ejemplo, las damas). Grupo A: <Txt style={{ fontSize: 12, fontFamily: font.bold }}>{nA}</Txt> · Grupo B:{' '}
            <Txt style={{ fontSize: 12, fontFamily: font.bold }}>{players.length - nA}</Txt>. Si un grupo tiene más, los que sobran descansan por turnos.
          </Txt>
          <MixedChips players={players} groupA={a} onToggle={(p) => onChange(a.has(p) ? (value ?? []).filter((x) => x !== p) : [...(value ?? []), p])} nameOf={names.nameOf} />
        </>
      )}
    </View>
  );
}

/** Un botón por jugador: «A · Ana» o «B · Luis» (tocarlo lo cambia de grupo). */
function MixedChips({ players, groupA, onToggle, nameOf }: { players: string[]; groupA: ReadonlySet<string>; onToggle: (p: string) => void; nameOf: (id: string) => string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {players.map((p) => {
        const on = groupA.has(p);
        return (
          <Button key={p} variant={on ? 'soft' : 'quiet'} onPress={() => onToggle(p)} accessibilityLabel={`${nameOf(p)}: grupo ${on ? 'A' : 'B'}`}>
            <Txt style={{ fontSize: 15, fontFamily: font.semibold, color: on ? c.accent : c.fg2 }}>{`${on ? 'A · ' : 'B · '}${nameOf(p)}`}</Txt>
          </Button>
        );
      })}
    </View>
  );
}

/** «Nuevo › Round robin social»: fecha, canchas y juego → jugadores → rondas. Crea el evento y abre el round robin. */
export function SocialForm({ onDone, onBack, last }: { onDone: (eventId: string) => void; onBack: () => void; last?: RacketEvent | null }) {
  const c = useColors();
  const { lid, league } = useLeagueCtx();
  const { levels } = useLevels();
  const [step, setStep] = useState(1);
  const [date, setDate] = useState(() => todayIn(league.tz));
  const [time, setTime] = useState(last?.startTime ?? '18:00');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState<SocialConfig>(() => {
    const prev = last && isSocialEvent(last) ? parseSocialConfig(last.config, last.type) : null;
    return newSocialConfig({
      players: prev?.players ?? [],
      courts: prev?.courts ?? ['Cancha 1', 'Cancha 2'],
      game: prev?.game,
      mixed: prev?.mixed ?? null,
      rounds: prev?.rounds,
      seed: `rr:${Date.now().toString(36)}`,
    });
  });
  const info = useMemo(() => nightInfo(cfg.players.length, cfg.courts.length), [cfg.players.length, cfg.courts.length]);
  const title = name.trim() || socialDefaultName(date);
  const recommended = suggestRounds('americano', cfg.players.length, cfg.courts.length);
  const mixedOk = mixedReady(cfg.players, cfg.mixed);

  const create = async () => {
    setBusy(true);
    try {
      const lv: Record<string, number> = {};
      for (const p of cfg.players) if (levels[p] != null) lv[p] = levels[p];
      const id = await createRacketEvent(lid, { type: 'americano', name: title, date, startTime: time || null, config: socialConfigJson({ ...cfg, levels: lv }) });
      toast('Listo');
      onDone(id);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      {step === 1 && (
        <>
          <Field label="Fecha">
            <DateStepper value={date} onChange={setDate} />
          </Field>
          <Field label="Hora">
            <TimeStepper value={time} onChange={setTime} label="Hora" />
          </Field>
          <Field label="Nombre">
            <Input value={name} maxLength={80} onChangeText={setName} placeholder={title} accessibilityLabel="Nombre" />
          </Field>
          <NightFields value={cfg} onChange={(x) => setCfg({ ...cfg, courts: x.courts })} parts={['courts']} />
          <GameFields value={cfg.game} onChange={(game) => setCfg({ ...cfg, game })} />
        </>
      )}
      {step === 2 && (
        <>
          <Txt tone="muted" style={{ fontSize: 14 }}>
            ¿Quién juega? Las parejas rotan cada ronda: nadie repite compañero mientras se pueda.
          </Txt>
          <NightPlayers
            value={cfg.players}
            levels={levels}
            onChange={(players) =>
              setCfg((x) => ({
                ...x,
                players,
                mixed: x.mixed ? x.mixed.filter((p) => players.includes(p)) : null,
                rounds: x.rounds === suggestRounds('americano', x.players.length, x.courts.length) ? suggestRounds('americano', players.length, x.courts.length) : x.rounds,
              }))
            }
          />
          <MixedGroups players={cfg.players} value={cfg.mixed} onChange={(mixed) => setCfg({ ...cfg, mixed })} />
        </>
      )}
      {step === 3 && (
        <>
          <Txt style={{ fontSize: 14 }}>
            <Txt style={{ fontSize: 14, fontFamily: font.bold }}>{cfg.players.length}</Txt> jugadores · <Txt style={{ fontSize: 14, fontFamily: font.bold }}>{cfg.courts.length}</Txt>{' '}
            {cfg.courts.length === 1 ? 'cancha' : 'canchas'} · {gameText(cfg.game).toLowerCase()}
          </Txt>
          <Stepper label="Rondas" value={cfg.rounds} min={1} max={30} onChange={(rounds) => setCfg({ ...cfg, rounds })} />
          <Note>
            {info.tooFew ? (
              'Hacen falta al menos 4 jugadores.'
            ) : (
              <>
                {`${info.perRound} ${info.perRound === 1 ? 'partido' : 'partidos'} por ronda${info.resting ? `, descansan ${info.resting} por ronda` : ', nadie descansa'}. Recomendadas: ${recommended} rondas. `}
                <Txt accessibilityRole="button" style={{ fontSize: 14, fontFamily: font.medium, color: c.accent }} onPress={() => setCfg({ ...cfg, rounds: recommended })}>
                  {`Usar ${recommended}`}
                </Txt>
              </>
            )}
          </Note>
          <Txt tone="muted" style={{ fontSize: 12 }}>
            Después de crearlo, tocas «Empezar ronda 1» y a cada quien le llega su cancha.
          </Txt>
        </>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button size="lg" full icon={<ChevronLeft size={18} color={c.fg} />} onPress={() => (step === 1 ? onBack() : setStep(step - 1))}>
            Atrás
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          {step < 3 ? (
            <Button variant="primary" size="lg" full disabled={step === 2 && (cfg.players.length < 4 || !mixedOk)} icon={<ChevronRight size={18} color={c.accentFg} />} onPress={() => setStep(step + 1)}>
              Siguiente
            </Button>
          ) : (
            <Button variant="primary" size="lg" full loading={busy} disabled={cfg.players.length < 4 || !mixedOk} onPress={() => void create()}>
              Crear
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}
