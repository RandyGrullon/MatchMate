import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Globe, Send, SquarePen } from 'lucide-react-native';
import { clearSent, loadDraft, restoreDraft } from '@mm/lib/draft';
import { submitGames } from '@mm/lib/data/submissions';
import { clearGameDraft, gameKey } from '@mm/components/frames/draftMemory';
import { saveErrorMessage } from '@mm/lib/errorText';
import { eventTitle, formatDateLong } from '@mm/lib/format';
import { nextGameLabel, type GameCell } from '@mm/lib/useNextGame';
import { confirmAsync, toast } from '@/components/feedback';
import { BackBar, Badge, Button, Card, Empty, ErrorNote, Loading, Screen, Txt } from '@/components/ui';
import { LeagueScope, sportFamily } from '@/components/league/LeagueScope';
import { RacketEventBody } from '@/components/racket/RacketEvent';
import { useLeague } from '@mm/lib/data';
import { useMyGames } from '@/lib/useMyGames';
import { openOnWeb } from '@/lib/web';
import { useColors } from '@/theme/theme';
import { font, radius } from '@/theme/tokens';

/** Cuánto se espera al servidor antes de decir «sin señal: se envía solo» (la cola lo sigue intentando). */
const QUEUED_AFTER_MS = 6000;

function Cell({ n, cell }: { n: number; cell: GameCell }) {
  const c = useColors();
  const value = cell.kind === 'vacio' ? '–' : cell.kind === 'medias' ? (cell.score ?? '…') : cell.score;
  const note =
    cell.kind === 'tabla' ? (cell.counted ? 'cuenta' : 'por aprobar') : cell.kind === 'telefono' ? 'en el teléfono' : cell.kind === 'enviado' ? 'enviado' : cell.kind === 'medias' ? 'a medias' : 'por anotar';
  const strong = cell.kind === 'tabla' || cell.kind === 'telefono' || cell.kind === 'enviado';
  return (
    <View accessible accessibilityLabel={`Juego ${n}: ${cell.kind === 'vacio' ? 'por anotar' : `${value}, ${note}`}`} style={[styles.cell, { backgroundColor: c.surface2 }]}>
      <Txt variant="small" tone="muted">
        J{n}
      </Txt>
      <Txt style={{ fontFamily: font.bold, fontSize: 26, color: strong ? c.fg : c.faint }}>{String(value)}</Txt>
      <Txt variant="small" tone={cell.kind === 'telefono' ? 'warn' : cell.kind === 'tabla' && cell.counted ? 'ok' : 'muted'} numberOfLines={1}>
        {note}
      </Txt>
    </View>
  );
}

/**
 * Un evento de boliche (práctica o torneo): «Tus juegos» con lo que sigue (anotar, seguir el que va a medias, enviar),
 * como la web (src/pages/EventPage.tsx + MyGamesPanel). La planilla de todos y los resultados, por ahora en la web.
 */
/** El evento: el de raqueta (o el deporte que tenga sus pantallas en la app) o el del boliche. */
export default function EventScreen() {
  const { lid, eventId } = useLocalSearchParams<{ lid: string; eventId: string }>();
  const c = useColors();
  const league = useLeague(lid);
  if (league.loading && !league.data) return <Loading label="Cargando la liga" />;
  if (league.data && sportFamily(league.data) === 'racket') {
    return (
      <Screen>
        <LeagueScope lid={lid}>
          <BackBar label={league.data.name} fallback={`/l/${lid}`} />
          <RacketEventBody eventId={eventId} />
        </LeagueScope>
      </Screen>
    );
  }
  if (league.data && sportFamily(league.data) !== 'series') {
    // Los eventos de equipos (jornadas especiales, el torneo relámpago) y de esports: por ahora en la web.
    return (
      <Screen>
        <BackBar label={league.data.name} fallback={`/l/${lid}`} />
        <Empty
          title={league.data.name}
          action={
            <Button icon={<Globe size={18} color={c.fg} />} onPress={() => openOnWeb(`/l/${lid}/e/${eventId}`)}>
              Abrir en la web
            </Button>
          }
        />
      </Screen>
    );
  }
  return <BowlingEventScreen />;
}

function BowlingEventScreen() {
  const { lid, eventId } = useLocalSearchParams<{ lid: string; eventId: string }>();
  const c = useColors();
  const g = useMyGames(lid, eventId);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (g.loading && !g.event.data) return <Loading label="Cargando el evento" />;
  const ev = g.event.data;
  const league = g.league.data;
  if (!ev || !league) {
    return (
      <Screen>
        <Empty title="Este evento no existe" action={<Button onPress={() => router.navigate({ pathname: '/l/[lid]', params: { lid } })}>Volver a la liga</Button>} />
      </Screen>
    );
  }
  const inPhone = g.cells.filter((x) => x.kind === 'telefono').length;
  const next = g.next;

  const openEditor = (game: number) => router.push({ pathname: '/l/[lid]/e/[eventId]/anotar', params: { lid, eventId, juego: String(game) } });

  async function send() {
    if (!g.playerId || sending) return;
    const d = loadDraft(lid, g.playerId, eventId);
    if (!d) return;
    const values = [...d.values];
    const scores = values.map((v) => (v.trim() ? Number(v) : null));
    while (scores.length && scores[scores.length - 1] == null) scores.pop();
    if (!scores.length) return;
    if (league!.requirePhoto) {
      const ok = await confirmAsync({
        title: '¿Enviar sin foto?',
        message: 'Esta liga pide la foto del marcador para comprobar los juegos. Sin foto se puede enviar, pero quizá el admin no lo acepte.',
        confirmText: 'Enviar sin foto',
      });
      if (!ok) return;
    }
    setSending(true);
    setError(null);
    const frames = d.frames && Object.keys(d.frames).length ? d.frames : null;
    const { sent } = submitGames(lid, { playerId: g.playerId, eventId, date: null, scores, scanned: null, frames, photo: null });
    const result = await Promise.race([sent.then(() => 'ok' as const), new Promise<'cola'>((r) => setTimeout(() => r('cola'), QUEUED_AFTER_MS))]).catch((e: unknown) => e);
    setSending(false);
    if (result === 'ok' || result === 'cola') {
      // Lo enviado sale del teléfono (también lo que iba a medias de esos juegos): queda en la cola o ya en la liga.
      clearSent(lid, g.playerId, eventId, values);
      values.forEach((v, i) => v.trim() && g.place && clearGameDraft(gameKey(g.place, i)));
      toast(result === 'ok' ? 'Enviado: un admin lo revisa y entra en la tabla.' : 'Sin señal: tus juegos se envían solos cuando vuelva la conexión.');
      if (result === 'cola') {
        sent.catch((e: unknown) => {
          restoreDraft(lid, g.playerId!, eventId, { values, frames: d.frames, date: d.date, balls: d.balls });
          toast(`No se pudieron enviar: ${saveErrorMessage(e)} Tus juegos volvieron al teléfono.`, 'error');
        });
      }
    } else {
      setError(saveErrorMessage(result));
    }
  }

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Volver a ${league.name}`}
        onPress={() => (router.canGoBack() ? router.back() : router.navigate({ pathname: '/l/[lid]', params: { lid } }))}
        style={{ flexDirection: 'row', alignItems: 'center', height: 44, marginLeft: -6 }}
      >
        <ChevronLeft size={24} color={c.accent} />
        <Txt tone="accent" variant="bodyStrong" numberOfLines={1}>
          {league.name}
        </Txt>
      </Pressable>
      <View style={{ gap: 4 }}>
        <Txt variant="title">{eventTitle(ev, 'bowling')}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {ev.date === g.today && <Badge tone="ok">En juego</Badge>}
          <Txt tone="muted">
            {formatDateLong(ev.date)} · {ev.games} {ev.games === 1 ? 'juego' : 'juegos'}
          </Txt>
        </View>
      </View>

      {!g.playerId ? (
        <Empty
          title="Todavía no eres jugador de esta liga"
          text="Prepara tu jugador para anotar tus juegos (por ahora, en la web)."
          action={<Button onPress={() => openOnWeb(`/l/${lid}/perfil`)}>Preparar mi jugador</Button>}
        />
      ) : (
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Txt variant="cardTitle">Tus juegos</Txt>
            <Txt variant="meta" tone="muted">
              Serie <Txt variant="bodyStrong">{g.series}</Txt>
            </Txt>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {g.cells.map((cell, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityHint="Abre ese juego para anotarlo o corregirlo"
                disabled={g.closed || cell.kind === 'tabla' || cell.kind === 'enviado'}
                onPress={() => openEditor(i + 1)}
                style={{ flexBasis: '30%', flexGrow: 1 }}
              >
                <Cell n={i + 1} cell={cell} />
              </Pressable>
            ))}
          </View>
          {inPhone > 0 && (
            <Txt variant="meta" tone="warn">
              {inPhone === 1 ? 'Un juego está en tu teléfono, sin enviar.' : `${inPhone} juegos están en tu teléfono, sin enviar.`}
            </Txt>
          )}
          {g.closed && (
            <Txt variant="meta" tone="muted">
              Esta práctica ya cerró: solo un admin puede anotar.
            </Txt>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          {next && (next.kind === 'anotar' || next.kind === 'medias') && !g.closed && (
            <Button variant="primary" size="xl" full icon={<SquarePen size={20} color={c.accentFg} />} onPress={() => openEditor(next.game)}>
              {nextGameLabel(next)}
            </Button>
          )}
          {inPhone > 0 && !g.closed && (
            <Button
              variant={next?.kind === 'enviar' ? 'primary' : 'quiet'}
              size="xl"
              full
              loading={sending}
              icon={<Send size={20} color={next?.kind === 'enviar' ? c.accentFg : c.fg} />}
              onPress={send}
            >
              {inPhone === 1 ? 'Enviar mi juego' : 'Enviar mis juegos'}
            </Button>
          )}
        </Card>
      )}

      <Button full icon={<Globe size={18} color={c.fg} />} onPress={() => openOnWeb(`/l/${lid}/e/${eventId}`)}>
        Planilla y resultados en la web
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cell: { borderRadius: radius.tile, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
});
