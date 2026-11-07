/**
 * Un juego de cualquier deporte (GameCard.tsx, LikeButton.tsx, SportBadge.tsx y GameList.tsx de la web), con la misma
 * lógica: la tarjeta de las listas (perfil e inicio, la pestaña «Juegos» de Social) con quién, el deporte, dónde y
 * cuándo, el resultado a su manera (pinos, marcador, golpes, tiempo), el me gusta, «Compartir en Social», «Reportar»
 * (no en los tuyos) y «Ver»; el juego dentro de una publicación (sin me gusta ni «Reportar»), «Juego no disponible», y la
 * lista por páginas.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronRight, CircleHelp, EyeOff, Flag, Flame, Heart, Medal, Search, Timer, TrendingUp, Trophy } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { gameMarks, hasMark, marksSummary, type GameMark } from '@mm/lib/bowlingSeason';
import { useBowlingGameContext } from '@mm/lib/data/bowlingContext';
import { getUserId } from '@mm/lib/data/client';
import type { Paged } from '@mm/lib/data/follows';
import { socialErrorText } from '@mm/lib/data/posts';
import { gameSummary, optimisticLikes, setGameLike, useFollowingGames, type ProfileGame } from '@mm/lib/data/profileGames';
import { saveErrorMessage } from '@mm/lib/errorText';
import { toIsoDate } from '@mm/lib/format';
import { useNow } from '@mm/lib/useNow';
import { sportMeta } from '@mm/sports/registry';
import { STROKE_LABEL } from '@mm/sports/swimming/events';
import { formatSwimTime } from '@mm/sports/swimming/time';
import { compactCount, gameDateLabel, likeLabel, matchResult, sportShort } from '@mm/components/social/socialFormat';
import { Avatar } from './Avatar';
import { ReportSheet } from './ContentMenu';
import { GameShareButton } from './ShareToSocial';
import { toast } from '../feedback';
import { Badge, Button, Card, Empty, ErrorNote, Txt } from '../ui';
import { LogoSpinner } from '../Logo';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';
import { font } from '@/theme/tokens';

const strokeText = (s: string) => (STROKE_LABEL as Record<string, string>)[s] ?? s;
/** «hoy», «Ayer», «12 sept.»: la primera letra en mayúscula (como `first-letter:uppercase` de la web). */
const upperFirst = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** Insignia del deporte (ícono y nombre corto) con su color. */
export function SportBadge({ sport }: { sport: string }) {
  const c = useColors();
  const meta = sportMeta(sport);
  const Icon = meta?.icon ?? CircleHelp;
  const color = meta?.color ?? c.accent;
  return (
    <View style={[styles.sportBadge, { backgroundColor: `${color}24` }]}>
      <Icon size={14} color={color} />
      <Txt numberOfLines={1} style={{ color, fontFamily: font.semibold, fontSize: 12 }}>
        {sportShort(sport)}
      </Txt>
    </View>
  );
}

/** El número grande de la derecha con su nota. */
function Big({ value, note }: { value: ReactNode; note: string }) {
  return (
    <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
      <Txt style={{ fontFamily: font.bold, fontSize: 24, lineHeight: 29, fontVariant: ['tabular-nums'] }}>{value}</Txt>
      <Txt tone="muted" style={{ fontSize: 11 }}>
        {note}
      </Txt>
    </View>
  );
}

/**
 * Los pinos de cada juego del boliche (200 o más, resaltado; si no, el color de su marca: «Récord personal» o «+15
 * sobre tu promedio»); `verified[k] === false` se ve más claro.
 */
export function ScoreChips({ scores, verified, marks }: { scores: readonly number[]; verified?: readonly boolean[]; marks?: readonly (GameMark | null)[] | null }) {
  const c = useColors();
  return (
    <>
      {scores.map((s, k) => {
        const mark = marks?.[k];
        const hot = s >= 200;
        const marked = !hot && hasMark(mark);
        const fg = hot ? c.accentFg : marked ? c.accent : c.fg;
        const Icon = hot ? Flame : marked ? (mark.record ? Trophy : TrendingUp) : null;
        return (
          <View
            key={k}
            accessibilityLabel={`Juego ${k + 1}${verified?.[k] === false ? ' (por aprobar)' : ''}: ${s}`}
            style={[styles.chip, { backgroundColor: hot ? c.accent : marked ? c.accentSoft : c.surface2, opacity: verified?.[k] === false ? 0.7 : 1 }]}
          >
            {Icon && <Icon size={12} color={fg} />}
            <Txt style={{ color: fg, fontFamily: font.bold, fontSize: 14, fontVariant: ['tabular-nums'] }}>{s}</Txt>
          </View>
        );
      })}
    </>
  );
}

/** Las marcas de todos los juegos en una línea: «Récord personal en el juego 2 · +18 sobre tu promedio en el juego 3». */
function MarksLine({ marks, mine = true }: { marks: readonly (GameMark | null)[] | null | undefined; mine?: boolean }) {
  const parts = marks ? marksSummary(marks, mine) : [];
  if (!parts.length) return null;
  return (
    <Txt tone="accent" style={{ fontFamily: font.medium, fontSize: 12 }}>
      {parts.join(' · ')}
    </Txt>
  );
}

const tone = (t: 'ok' | 'danger' | 'neutral') => (t === 'neutral' ? 'muted' : t);

/** El resultado a su manera: los pinos y la serie, el marcador, los golpes o el tiempo. */
function GameBody({ game, marks, mine }: { game: ProfileGame; marks?: (GameMark | null)[] | null; mine?: boolean }) {
  const c = useColors();
  switch (game.kind) {
    case 'bowling':
    case 'solo': {
      const d = game.detail;
      if (!d.scores.length)
        return (
          <Txt variant="meta" tone="muted">
            Sin juegos anotados
          </Txt>
        );
      // Lo que cuenta no lleva marca; lo que falta aprobar dice «Por aprobar» (rediseño: sin «Verificado»).
      const verified = game.kind === 'bowling' ? game.detail.verified : undefined;
      const pending = !!verified?.some((v) => v === false);
      return (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <ScoreChips scores={d.scores} verified={verified} marks={game.kind === 'bowling' ? marks : null} />
              {pending && (
                <Txt tone="muted" style={{ alignSelf: 'center', fontFamily: font.medium, fontSize: 11 }}>
                  Por aprobar
                </Txt>
              )}
            </View>
            <Big value={d.scores.length > 1 ? d.series : d.high} note={d.scores.length > 1 ? `Serie · alto ${d.high}` : 'Pinos'} />
          </View>
          {game.kind === 'bowling' && <MarksLine marks={marks} mine={mine} />}
        </View>
      );
    }
    case 'match': {
      const d = game.detail;
      const res = matchResult(game);
      const stage = d.stage ? d.stage : d.round ? `Jornada ${d.round}` : null;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              {res ? <Badge tone={tone(res.tone)}>{res.label}</Badge> : <Badge tone="muted">{d.final ? 'Jugado' : 'Por confirmar'}</Badge>}
              {!!stage && (
                <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12, flexShrink: 1 }}>
                  {stage}
                </Txt>
              )}
            </View>
            <Txt variant="meta" numberOfLines={1}>
              <Txt variant="meta" style={{ fontFamily: font.semibold }}>
                {d.mine || 'Su lado'}
              </Txt>
              <Txt variant="meta" tone="muted">
                {' vs '}
              </Txt>
              <Txt variant="meta" style={{ fontFamily: font.semibold }}>
                {d.opponent || 'Rival'}
              </Txt>
            </Txt>
          </View>
          {d.score && !d.walkover ? <Big value={d.score} note="Marcador" /> : null}
        </View>
      );
    }
    case 'golf': {
      const d = game.detail;
      const holes = d.played < d.holes ? `${d.played} de ${d.holes} hoyos` : `${d.holes} hoyos`;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Flag size={16} color={c.muted} />
              <Txt variant="meta" numberOfLines={1} style={{ fontFamily: font.semibold, flexShrink: 1 }}>
                {d.course || 'Campo'}
              </Txt>
            </View>
            <Txt tone="muted" style={{ fontSize: 12 }}>
              {holes}
              {d.playingHcp != null && ` · hcp ${d.playingHcp}`}
              {d.signed && ' · firmada'}
            </Txt>
          </View>
          {d.dq ? <Badge tone="danger">Descalificado</Badge> : <Big value={d.gross} note="Golpes" />}
        </View>
      );
    }
    case 'swim': {
      const d = game.detail;
      const ok = d.status === 'ok' && d.timeCs != null;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Timer size={16} color={c.muted} />
              <Txt variant="meta" style={{ fontFamily: font.semibold }}>
                {d.distance} m {strokeText(d.stroke).toLowerCase()}
              </Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Txt tone="muted" style={{ fontSize: 12 }}>
                Piscina de {d.pool} m
              </Txt>
              {!!d.place && d.place <= 3 && <Medal size={14} color={c.warn} />}
              {!!d.place && (
                <Txt tone="muted" style={{ fontSize: 12 }}>
                  {` · ${d.place}.º lugar`}
                </Txt>
              )}
            </View>
          </View>
          {ok ? <Big value={formatSwimTime(d.timeCs)} note="Tiempo" /> : <Badge tone="warn">{d.status.toUpperCase()}</Badge>}
        </View>
      );
    }
  }
}

/** Dónde fue: la liga y el evento (un juego suelto: su título y la bolera). */
const whereOf = (game: ProfileGame) =>
  (game.kind === 'solo' ? [game.detail.title || 'Juego suelto', game.detail.venue] : [game.leagueName, game.eventName]).filter((s) => s && s.trim()).join(' · ');

/** El deporte y la fecha, a la derecha de la cabecera. */
function SportAndDate({ sport, date, hideSport }: { sport: string; date: string; hideSport?: boolean }) {
  return (
    <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
      {!hideSport && <SportBadge sport={sport} />}
      {!!date && (
        <Txt tone="muted" style={{ fontSize: 11 }}>
          {upperFirst(date)}
        </Txt>
      )}
    </View>
  );
}

/**
 * El juego dentro de una publicación (y en la hoja para compartirlo): el deporte, dónde y cuándo (y quién lo jugó, con
 * `showUser`) y el resultado a su manera, sin me gusta ni «Reportar». Tocarlo abre el juego en su liga (`link` y si
 * tiene ruta: un juego suelto solo la tiene para su dueño).
 */
export function GameEmbed({ game, today, link = true, showUser }: { game: ProfileGame; today?: string; link?: boolean; showUser?: boolean }) {
  const c = useColors();
  const now = useNow();
  const date = gameDateLabel(game.eventDate, today ?? toIsoDate(now));
  const where = whereOf(game);
  const title = showUser ? game.userName : where || 'Juego';
  const sub = showUser ? where : null;
  const inner = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="meta" numberOfLines={1} style={{ fontFamily: font.semibold }}>
            {title}
          </Txt>
          {!!sub && (
            <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
              {sub}
            </Txt>
          )}
        </View>
        <SportAndDate sport={game.sport} date={date} />
      </View>
      <GameBody game={game} />
    </>
  );
  const box = [styles.embed, { borderColor: c.line, backgroundColor: c.surface }];
  if (link && game.url) {
    const url = game.url;
    return (
      <Pressable accessibilityRole="link" accessibilityLabel={`Ver el juego: ${gameSummary(game)}`} onPress={() => openLink(url)} style={({ pressed }) => [box, { opacity: pressed ? 0.85 : 1 }]}>
        {inner}
      </Pressable>
    );
  }
  return <View style={box}>{inner}</View>;
}

/** Una publicación con un juego que quien mira no puede ver (se borró, es de una liga que no ve o lo bloquearon). */
export function GameUnavailable() {
  const c = useColors();
  return (
    <View style={[styles.embed, { borderColor: c.line, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
      <EyeOff size={16} color={c.muted} />
      <Txt variant="meta" tone="muted">
        Juego no disponible
      </Txt>
    </View>
  );
}

/**
 * Corazón de me gusta de un juego: se llena al tocarlo y el número cambia al momento (en todas las listas: lo hace la
 * capa de datos). Si falla (sin señal, muy seguido) sale el error y vuelve lo del servidor. Sin cuenta, lleva a entrar.
 */
export function GameLikeButton({ game }: { game: ProfileGame }) {
  const c = useColors();
  const path = usePathname();
  const [busy, setBusy] = useState(false);
  // Lo que se ve mientras llega la respuesta (por si el juego no está en ninguna lista guardada).
  const [over, setOver] = useState<Pick<ProfileGame, 'likes' | 'likedByMe'> | null>(null);
  const shown = over ?? game;
  const liked = shown.likedByMe;

  async function toggle() {
    if (busy) return;
    if (!getUserId()) {
      router.push({ pathname: '/login', params: { next: path } });
      return;
    }
    const next = !liked;
    if (next) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setOver(optimisticLikes(shown, next));
    setBusy(true);
    try {
      await setGameLike(game, next);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setOver(null);
      setBusy(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={likeLabel(liked, shown.likes)}
      accessibilityState={{ selected: liked, busy }}
      onPress={toggle}
      style={({ pressed }) => [styles.action, { backgroundColor: pressed ? (liked ? c.dangerSoft : c.surface2) : 'transparent' }]}
    >
      <Heart size={20} color={liked ? c.danger : c.muted} fill={liked ? c.danger : 'transparent'} />
      <Txt tone={liked ? 'danger' : 'muted'} style={{ fontFamily: font.semibold, fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {shown.likes > 0 ? compactCount(shown.likes) : 'Me gusta'}
      </Txt>
    </Pressable>
  );
}

/** «Reportar juego» (la bandera): no sale en lo tuyo; sin cuenta, lleva a entrar. */
function ReportGameButton({ game }: { game: ProfileGame }) {
  const c = useColors();
  const { user } = useAuth();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (user?.uid === game.userId) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reportar juego"
        onPress={() => (user ? setOpen(true) : router.push({ pathname: '/login', params: { next: path } }))}
        style={({ pressed }) => [styles.icon, { backgroundColor: pressed ? c.surface2 : 'transparent' }]}
      >
        <Flag size={16} color={c.muted} />
      </Pressable>
      {open && <ReportSheet kind="game" targetId={game.id} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Tarjeta de un juego para el perfil y el inicio (de cualquier deporte): quién (si `showUser`), el deporte, la liga y
 * el evento, el resultado a su manera, el me gusta, «Compartir en Social» (si puedes publicarlo: miembro de su liga, o tu
 * juego suelto) y «Reportar» (no en los tuyos). «Ver» abre el juego en su liga. Un juego suelto (sin liga) lleva la
 * bolera en vez de la liga, «Ver» solo para su dueño y no se reporta como juego (se reporta la cuenta desde su perfil).
 */
export function GameCard({
  game,
  showUser,
  today,
  marks,
  mine,
  hideSport,
}: {
  game: ProfileGame;
  showUser?: boolean;
  today?: string;
  /** Boliche: «Récord personal» y «+15 sobre tu promedio» de cada juego (null mientras no se sabe). */
  marks?: (GameMark | null)[] | null;
  /** El juego es de quien mira («tu promedio»; si no, «su promedio»). */
  mine?: boolean;
  /** Sin el chip del deporte (quien juega uno solo: se repetía en cada tarjeta). */
  hideSport?: boolean;
}) {
  const c = useColors();
  const now = useNow();
  const date = gameDateLabel(game.eventDate, today ?? toIsoDate(now));
  const title = game.kind === 'solo' ? game.detail.title || game.eventName || 'Juego suelto' : game.eventName || game.leagueName || 'Juego';
  const sub = game.kind === 'solo' ? game.detail.venue : game.eventName ? game.leagueName : null;
  const where = whereOf(game);
  const name = game.userName.trim() || 'Jugador';
  const url = game.url;
  return (
    <Card padded={false} style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        {showUser ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Ver el perfil de ${name}`}
            onPress={() => router.push({ pathname: '/u/[userId]', params: { userId: game.userId } })}
            style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <Avatar name={name} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>
                {name}
              </Txt>
              <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
                {where || 'Juego'}
              </Txt>
            </View>
          </Pressable>
        ) : (
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="meta" numberOfLines={1} style={{ fontFamily: font.semibold }}>
              {title}
            </Txt>
            {!!sub?.trim() && (
              <Txt tone="muted" numberOfLines={1} style={{ fontSize: 12 }}>
                {sub}
              </Txt>
            )}
          </View>
        )}
        <SportAndDate sport={game.sport} date={date} hideSport={hideSport} />
      </View>

      <GameBody game={game} marks={marks} mine={mine} />

      <View style={[styles.footer, { borderTopColor: c.line }]}>
        <GameLikeButton game={game} />
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <GameShareButton game={game} preview={<GameEmbed game={game} today={today} link={false} showUser={showUser} />} />
          {game.kind !== 'solo' && <ReportGameButton game={game} />}
          {!!url && (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Ver el juego: ${gameSummary(game)}`}
              onPress={() => openLink(url)}
              style={({ pressed }) => [styles.see, { backgroundColor: pressed ? c.accentSoft : 'transparent' }]}
            >
              <Txt tone="accent" style={{ fontFamily: font.medium, fontSize: 14 }}>
                Ver
              </Txt>
              <ChevronRight size={16} color={c.accent} />
            </Pressable>
          )}
        </View>
      </View>
    </Card>
  );
}

/**
 * Lista de juegos por páginas (perfil o inicio): cargando, error (con reintentar), vacía (`empty`) y «Ver más». En el
 * boliche, lo jugado antes de cada juego para marcar «Récord personal» y «+15 sobre tu promedio».
 */
export function GameList({ games, showUser, empty, hideSport }: { games: Paged<ProfileGame>; showUser?: boolean; empty: ReactNode; hideSport?: boolean }) {
  const now = useNow();
  const today = toIsoDate(now);
  const { user } = useAuth();
  const bowlingIds = games.data
    .filter((g) => g.kind === 'bowling')
    .map((g) => g.id)
    .slice(0, 100);
  const context = useBowlingGameContext(bowlingIds);
  if (games.loading && !games.data.length) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <LogoSpinner size={36} label="Cargando juegos" />
      </View>
    );
  }
  if (games.error && !games.data.length) {
    return (
      <View style={{ gap: 10 }}>
        <ErrorNote>{socialErrorText(games.error, 'No se pudieron cargar los juegos.')}</ErrorNote>
        <Button onPress={games.refresh}>Reintentar</Button>
      </View>
    );
  }
  if (!games.data.length) return <>{empty}</>;
  return (
    <View style={{ gap: 12 }}>
      {games.data.map((g) => {
        const ctx = g.kind === 'bowling' ? context.data[g.id] : undefined;
        return (
          <GameCard
            key={g.key}
            game={g}
            showUser={showUser}
            hideSport={hideSport}
            today={today}
            marks={g.kind === 'bowling' && ctx ? gameMarks(g.detail.scores, g.detail.verified, ctx, { frozen: ctx.average }) : null}
            mine={!!user && g.userId === user.uid}
          />
        );
      })}
      {games.moreError && (
        <Txt variant="meta" tone="danger" style={{ textAlign: 'center' }}>
          No se pudieron cargar más. Intenta de nuevo.
        </Txt>
      )}
      {games.hasMore && (
        <Button full loading={games.loadingMore} onPress={games.loadMore}>
          Ver más
        </Button>
      )}
    </View>
  );
}

/** «Juegos» de Social (FollowingGames de SocialPage.tsx): los juegos de quien sigues, con me gusta. */
export function FollowingGames() {
  const c = useColors();
  const games = useFollowingGames(null);
  return (
    <GameList
      games={games}
      showUser
      empty={
        <Empty
          icon={<Trophy size={28} color={c.accent} />}
          title="Todavía no hay juegos"
          text="Cuando alguien que sigues juegue, sus juegos salen aquí para darles me gusta."
          action={
            <Button variant="soft" full icon={<Search size={18} color={c.accent} />} onPress={() => router.push('/buscar')}>
              Buscar personas
            </Button>
          }
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  sportBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, flexShrink: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 44, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  embed: { gap: 12, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  footer: { marginHorizontal: -8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 44, height: 44, borderRadius: 12, paddingHorizontal: 10 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  see: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, borderRadius: 12, paddingHorizontal: 12 },
});
