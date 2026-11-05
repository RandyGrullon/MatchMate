/**
 * El modo cancha de raqueta en la app (SetsCourt y PointsCourt de la web, con su misma máquina y sus motores: useCourt +
 * racketAdapter, usePointsCourt): antes de empezar, quién saca y de qué lado; después, dos mitades gigantes con sets,
 * juegos, 15/30/40/AD, quién saca y el cambio de lado. El americano y el mexicano: a cuántos puntos (o el reloj) y quién
 * saca. Todo queda en el teléfono y sale solo al volver la señal.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useCourt } from '@mm/court/useCourt';
import type { Match } from '@mm/lib/data/matches';
import { useLeagueCtx } from '@mm/lib/league';
import { useNow } from '@mm/lib/useNow';
import { isGameSport, toLive, type MatchSetup, type Pair, type Player, type RacketEvent, type RacketSport, type RacketState } from '@mm/sports/racket';
import { serveInfo, type PointsConfig } from '@mm/sports/formats';
import type { Side } from '@mm/sports/types';
import { engineRules, racketAdapter } from '@mm/pages/sports/racket/court/adapters';
import { usePointsCourt } from '@mm/pages/sports/racket/court/usePointsCourt';
import { parsePoints } from '@mm/pages/sports/racket/logic/night';
import { rulesText } from '@mm/pages/sports/racket/logic/rulesText';
import { useNames } from '@mm/pages/sports/racket/names';
import { Badge, Button, ChoiceRow, Sheet, Txt } from '../ui';
import { CourtNote, CourtShell, TwoHalves } from '../court/CourtShell';
import { useColors } from '@/theme/theme';

function Choice<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; text: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="bodyStrong">{label}</Txt>
      {options.map((o) => (
        <ChoiceRow key={String(o.value)} title={o.text} selected={value === o.value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

/** Un partido a sets (pádel, tenis, pickleball y, de respaldo, ping pong). */
export function SetsCourt({ match, sport, onExit, isAdmin, userId }: { match: Match; sport: RacketSport; onExit: () => void; isAdmin: boolean; userId: string | null }) {
  const { lid } = useLeagueCtx();
  const names = useNames();
  const adapter = useMemo(() => racketAdapter(sport, match.rules), [sport, match.rules]);
  const rules = useMemo(() => engineRules(sport, match.rules), [sport, match.rules]);
  const court = useCourt<MatchSetup, RacketState, RacketEvent>({ lid, matchId: match.id, userId, adapter, status: match.status, config: null });
  const [retiring, setRetiring] = useState(false);
  const s = court.state;
  const live = s ? toLive(s) : null;
  const labels = [match.sides[0].label, match.sides[1].label] as const;
  const people = match.sides.map((x) => x.players.map((p) => names.nameOf(p.playerId)));
  const pickle = isGameSport(sport);
  const title = [match.stage || (match.round != null ? `Jornada ${match.round}` : null), match.court].filter(Boolean).join(' · ') || 'Partido';

  if (court.ready && !court.snapshot) {
    return (
      <CourtShell title={title} subtitle="Antes de empezar" onExit={onExit} court={court} isAdmin={isAdmin} canSuspend={false}>
        <SetupForm sport={sport} doubles={rules.doubles} labels={labels} people={people} rulesLine={rulesText(rules)} onStart={(setup) => court.start(setup)} />
      </CourtShell>
    );
  }

  const serverName = live && rules.doubles ? people[live.server - 1]?.[live.serverPlayer] : null;
  const winner = court.over ? court.winner : null;
  const header = live && (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {live.done.map((x, i) => (
          <Badge key={i} tone="muted">
            {x}
          </Badge>
        ))}
        {!court.over && (
          <Txt style={{ fontSize: 28, lineHeight: 32, fontWeight: '700' }}>
            {live.now[0]}-{live.now[1]}{' '}
            <Txt variant="small" tone="muted">
              {pickle ? 'puntos' : 'juegos'}
            </Txt>
          </Txt>
        )}
        {!!live.label && <Badge>{live.label}</Badge>}
      </View>
      {!court.over && (
        <CourtNote>
          {pickle && live.call ? (
            <>
              Canto: <Txt variant="bodyStrong">{live.call}</Txt> · saca {labels[live.server - 1]}
            </>
          ) : (
            <>
              Saca <Txt variant="bodyStrong">{serverName ?? labels[live.server - 1]}</Txt>
              {serverName ? ` (${labels[live.server - 1]})` : ''}
              {live.serveFrom ? ` · desde la ${live.serveFrom === 'right' ? 'derecha' : 'izquierda'}` : ' · punto decisivo: elige lado quien recibe'}
            </>
          )}
        </CourtNote>
      )}
      {live.changeEnds && !court.over && <CourtNote tone="accent">↔ Cambio de lado</CourtNote>}
      {court.over && <CourtNote tone="accent">{`${winner ? `Ganan ${labels[winner - 1]}: ${court.summary}` : court.summary}. Toca «Terminar» para enviar.`}</CourtNote>}
    </View>
  );
  const half = (i: 0 | 1) => {
    const side = (i + 1) as Side;
    const big = live ? (pickle ? live.now[i] : (live.points?.[i] ?? '0')) : 0;
    const serving = live?.server === side;
    const sub = pickle ? (serving ? 'Saca' : ' ') : `${live?.now[i] ?? 0} juegos${serving ? ' · saca' : ''}`;
    return { label: labels[i], big, sub, onTap: () => void court.apply({ type: 'point', side }), ariaLabel: `Punto para ${labels[i]}` };
  };
  return (
    <>
      <CourtShell
        title={title}
        subtitle={rulesText(rules)}
        onExit={onExit}
        court={court}
        isAdmin={isAdmin}
        header={header}
        undoLabel="Deshacer punto"
        finishSummary={winner ? `${court.summary} · Ganan ${labels[winner - 1]}` : court.summary}
        onFinished={() => onExit()}
        more={court.readOnly || court.over ? [] : [{ key: 'retiro', label: 'Retiro', hint: 'Alguien no puede seguir: gana el otro lado', onPress: () => setRetiring(true) }]}
      >
        <TwoHalves swap={live?.leftSide === 2} disabled={court.readOnly || court.over || !s} a={half(0)} b={half(1)} />
      </CourtShell>
      <Sheet open={retiring} onClose={() => setRetiring(false)} title="¿Quién se retira?" subtitle="Se guarda el marcador; para la tabla, el set se completa a favor del ganador">
        {([1, 2] as const).map((side) => (
          <Button
            key={side}
            size="lg"
            full
            onPress={() => {
              court.apply({ type: 'retire', side });
              setRetiring(false);
            }}
          >
            {`Se retira ${labels[side - 1]}`}
          </Button>
        ))}
      </Sheet>
    </>
  );
}

function SetupForm({
  sport,
  doubles,
  labels,
  people,
  rulesLine,
  onStart,
}: {
  sport: RacketSport;
  doubles: boolean;
  labels: readonly [string, string];
  people: string[][];
  rulesLine: string;
  onStart: (s: MatchSetup) => void;
}) {
  const [first, setFirst] = useState<Side>(1);
  const [fp, setFp] = useState<Pair<Player>>([0, 0]);
  const [left, setLeft] = useState<Side>(1);
  const pickle = isGameSport(sport);
  return (
    <ScrollView contentContainerStyle={{ gap: 20, paddingBottom: 12 }}>
      <CourtNote>{rulesLine}</CourtNote>
      <Choice
        label="¿Quién saca primero?"
        value={first}
        onChange={setFirst}
        options={[
          { value: 1, text: labels[0] },
          { value: 2, text: labels[1] },
        ]}
      />
      {doubles &&
        ([0, 1] as const).map((i) =>
          (people[i]?.length ?? 0) >= 2 ? (
            <Choice
              key={i}
              label={pickle ? `${labels[i]}: ¿quién empieza a la derecha?` : `${labels[i]}: ¿quién saca primero?`}
              value={fp[i]}
              onChange={(v) => setFp(i === 0 ? [v, fp[1]] : [fp[0], v])}
              options={[
                { value: 0 as Player, text: people[i][0] },
                { value: 1 as Player, text: people[i][1] },
              ]}
            />
          ) : null,
        )}
      <Choice
        label="¿Quién empieza a tu izquierda?"
        value={left}
        onChange={setLeft}
        options={[
          { value: 1, text: labels[0] },
          { value: 2, text: labels[1] },
        ]}
      />
      <Button variant="primary" size="xl" full onPress={() => onStart({ firstServer: first, firstPlayer: fp, leftSide: left })}>
        Empezar el partido
      </Button>
    </ScrollView>
  );
}

const clockKey = (id: string) => `mm:reloj:${id}`;
function readClock(id: string): number | null {
  try {
    const v = Number(localStorage.getItem(clockKey(id)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function writeClock(id: string, at: number | null) {
  try {
    if (at === null) localStorage.removeItem(clockKey(id));
    else localStorage.setItem(clockKey(id), String(at));
  } catch {
    // sin almacenamiento: el reloj vive solo en pantalla
  }
}
const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** El americano y el mexicano: +1 a la pareja que ganó el punto, a cuántos se juega (o el reloj) y quién saca. */
export function PointsCourt({ match, onExit, isAdmin, userId }: { match: Match; onExit: () => void; isAdmin: boolean; userId: string | null }) {
  const c = useColors();
  const { lid } = useLeagueCtx();
  const points = useMemo(() => parsePoints((match.rules as Record<string, unknown> | undefined)?.points), [match.rules]);
  const config = useMemo<PointsConfig>(() => ({ ...points, firstServe: 1 }), [points]);
  const court = usePointsCourt({ lid, matchId: match.id, userId, status: match.status, config });
  const [swap, setSwap] = useState(false);
  const [started, setStarted] = useState<number | null>(() => readClock(match.id));
  // Por tiempo: el reloj se mueve cada segundo.
  const nowMs = useNow(points.mode === 'time' ? 1000 : 60_000).getTime();
  const s = court.state;
  const a = s?.score[0] ?? 0;
  const b = s?.score[1] ?? 0;
  const serve = s ? serveInfo(s) : null;
  const total = a + b;
  // Por tiempo: el reloj arranca con el primer punto (se guarda en el teléfono).
  const point = (side: Side) => {
    if (points.mode === 'time' && started === null) {
      const at = Date.now();
      setStarted(at);
      writeClock(match.id, at);
    }
    court.apply({ type: 'point', side });
  };
  const names = [match.sides[0].label, match.sides[1].label] as const;
  const elapsed = started ? Math.max(0, nowMs - started) : 0;
  const limit = (points.minutes ?? 15) * 60_000;
  const timeUp = points.mode === 'time' && started !== null && elapsed >= limit;
  const left = points.mode === 'total' ? Math.max(0, (points.target ?? 24) - total) : null;
  const winner = s && court.over ? (a === b ? null : a > b ? 1 : 2) : null;
  const header = (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {points.mode === 'total' ? (
          <Txt style={{ fontSize: 19, fontWeight: '700' }}>
            A {points.target}{' '}
            <Txt tone="muted" style={{ fontSize: 19 }}>
              · {court.over ? 'terminó' : `faltan ${left}`}
            </Txt>
          </Txt>
        ) : (
          <Txt style={{ fontSize: 19, fontWeight: '700', color: timeUp ? c.danger : c.fg }}>
            ⏱ {mmss(elapsed)}{' '}
            <Txt tone="muted" style={{ fontSize: 19 }}>
              de {points.minutes}:00
            </Txt>
          </Txt>
        )}
        <Button accessibilityLabel="Cambiar de lado en la pantalla" onPress={() => setSwap(!swap)}>
          Lados
        </Button>
      </View>
      {serve && !court.over && (
        <CourtNote tone={serve.changed ? 'accent' : 'neutral'}>
          {serve.changed ? 'Cambio de saque: ' : 'Saca: '}
          <Txt variant="bodyStrong">{names[serve.side - 1]}</Txt>
        </CourtNote>
      )}
      {timeUp && !court.over && <CourtNote tone="danger">¡Tiempo! Toca «Terminar» para guardar el marcador.</CourtNote>}
      {court.over && <CourtNote tone="accent">{`${winner ? `Ganan ${names[winner - 1]} ${Math.max(a, b)}-${Math.min(a, b)}` : `Empate ${a}-${b}`}. Toca «Terminar».`}</CourtNote>}
    </View>
  );
  return (
    <CourtShell
      title={[match.court, match.round != null ? `Ronda ${match.round}` : null].filter(Boolean).join(' · ')}
      subtitle="Toca la pareja que ganó el punto"
      onExit={onExit}
      court={court}
      isAdmin={isAdmin}
      header={header}
      undoLabel="Deshacer punto"
      finishSummary={winner ? `${a}-${b} · Ganan ${names[winner - 1]}` : `${a}-${b}${s && a === b ? ' · Empate' : ''}`}
      onFinished={() => {
        writeClock(match.id, null);
        onExit();
      }}
    >
      <TwoHalves
        swap={swap}
        disabled={court.readOnly || court.over || !s}
        a={{ label: names[0], big: a, sub: serve?.side === 1 ? 'Saca' : ' ', onTap: () => point(1), ariaLabel: `Punto para ${names[0]}` }}
        b={{ label: names[1], big: b, sub: serve?.side === 2 ? 'Saca' : ' ', onTap: () => point(2), ariaLabel: `Punto para ${names[1]}` }}
      />
    </CourtShell>
  );
}
