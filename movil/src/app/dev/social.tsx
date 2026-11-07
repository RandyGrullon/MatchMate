import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import { buildSocialNotices } from '@mm/lib/data/follows';
import type { Match } from '@mm/lib/data/matches';
import type { Post } from '@mm/lib/data/posts';
import type { ProfileGame } from '@mm/lib/data/profileGames';
import { LeagueContext, type LeagueCtx } from '@mm/lib/league';
import { buildNotices, groupNotices } from '@mm/lib/notifications';
import { useNow } from '@mm/lib/useNow';
import { QrCode } from '@/components/invite/QrCode';
import { ShareResultSheet } from '@/components/match/ShareResult';
import { NoticeGroups } from '@/components/notifications/NoticeList';
import { GameCard } from '@/components/social/GameCard';
import { PostCard } from '@/components/social/PostCard';
import { Card, ListRow, RowIcon, Screen, SectionHeader } from '@/components/ui';
import { useColors } from '@/theme/theme';

const HOUR = 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const dayAgo = (n: number) => ago(n * 24 * HOUR).slice(0, 10);
const ID = (s: string) => `00000000-0000-7000-8000-00000000${s}`;

const ANA = { id: ID('0002'), name: 'Ana Pérez', username: 'anaperez', avatar: null };
const UNO = { id: ID('0004'), name: 'Jugador Uno', username: 'jugadoruno', avatar: null };
const LEAGUE = { id: ID('0003'), name: 'Liga de los martes', sport: 'bowling' };

const BOWLING: ProfileGame = {
  key: `b:${ID('0b01')}`,
  kind: 'bowling',
  id: ID('0b01'),
  playerId: ID('0p01'),
  userId: ANA.id,
  userName: ANA.name,
  leagueId: LEAGUE.id,
  leagueName: LEAGUE.name,
  sport: 'bowling',
  eventId: ID('0e01'),
  eventName: '',
  eventType: 'practica',
  eventDate: dayAgo(1),
  at: ago(24 * HOUR),
  url: `/l/${LEAGUE.id}/juegos?juego=${ID('0e01')}_${ID('0p01')}`,
  likes: 3,
  likedByMe: false,
  detail: { scores: [176, 212, 189], verified: [true, true, false], series: 577, high: 212 },
};

const PADEL: ProfileGame = {
  key: `m:${ID('0m01')}:${ID('0p02')}`,
  kind: 'match',
  id: ID('0m01'),
  playerId: ID('0p02'),
  userId: UNO.id,
  userName: UNO.name,
  leagueId: ID('0l02'),
  leagueName: 'Pádel de Ejemplo',
  sport: 'padel',
  eventId: null,
  eventName: '',
  eventType: null,
  eventDate: dayAgo(0),
  at: ago(3 * HOUR),
  url: `/l/${ID('0l02')}/juegos?partido=${ID('0m01')}`,
  likes: 12,
  likedByMe: true,
  detail: { side: 1, mine: 'Jugador Uno / Jugador Dos', opponent: 'Jugador Tres / Jugador Cuatro', score: '6-4 6-3', result: 'win', walkover: false, final: true, round: 3 },
};

const GOLF: ProfileGame = {
  ...BOWLING,
  key: `g:${ID('0g01')}`,
  kind: 'golf',
  id: ID('0g01'),
  sport: 'golf',
  leagueName: 'Golf de Ejemplo',
  eventName: 'Ronda del sábado',
  eventDate: dayAgo(5),
  likes: 0,
  detail: { course: 'Campo de Ejemplo', holes: 18, played: 18, gross: 86, playingHcp: 14, signed: true },
};

const SWIM: ProfileGame = {
  ...PADEL,
  key: `s:${ID('0s01')}`,
  kind: 'swim',
  id: ID('0s01'),
  sport: 'swimming',
  leagueName: 'Natación de Ejemplo',
  eventName: 'Copa de Ejemplo',
  eventDate: dayAgo(12),
  likes: 1,
  likedByMe: false,
  detail: { distance: 50, stroke: 'libre', pool: 25, timeCs: 3125, status: 'ok', place: 2 },
};

const base: Omit<Post, 'id' | 'author' | 'text' | 'at'> = {
  photo: null,
  league: null,
  game: null,
  hasGame: false,
  sport: null,
  visibility: 'public',
  likes: 0,
  likedByMe: false,
  comments: 0,
  isMine: false,
  canDelete: false,
};

const POST: Post = {
  ...base,
  id: ID('0001'),
  author: ANA,
  text: 'Hoy hicimos 3 strikes seguidos en la práctica 🎳\nMiren el resumen: https://matchmate.grullonb.com/l/abc y el reglamento en https://example.com/reglas.',
  league: LEAGUE,
  sport: 'bowling',
  visibility: 'followers',
  at: ago(2 * HOUR),
  likes: 12,
  likedByMe: true,
  comments: 3,
};

/** Un juego compartido (de quien publica: sin su nombre en la tarjeta). */
const SHARED: Post = { ...base, id: ID('0005'), author: ANA, text: '¡Por fin pasé de 200! 🎳', league: LEAGUE, game: BOWLING, hasGame: true, sport: 'bowling', visibility: 'league', at: ago(4 * HOUR), likes: 5, comments: 1 };
/** El partido de otro (con su nombre en la tarjeta). */
const SHARED_OTHER: Post = { ...base, id: ID('0006'), author: ANA, text: '¡Qué partidazo el de Jugador Uno! 🎾', game: PADEL, hasGame: true, sport: 'padel', at: ago(5 * HOUR), likes: 2 };
/** Un juego que quien mira ya no puede ver. */
const GONE: Post = { ...base, id: ID('0007'), author: UNO, text: 'Ganamos la final.', hasGame: true, sport: 'padel', at: ago(26 * HOUR) };

/** Un partido de pádel terminado, para «Compartir el resultado». */
const MATCH = {
  id: ID('0m01'),
  leagueId: ID('0l02'),
  eventId: null,
  round: 3,
  stage: '',
  court: 'Cancha 2',
  scheduledAt: ago(4 * HOUR),
  status: 'confirmed',
  score: { text: '6-4 6-3' },
  winner: 1,
  walkoverSide: null,
  proposedAt: ago(3 * HOUR),
  sides: [
    { side: 1, teamId: null, label: 'Jugador Uno / Jugador Dos', seed: null, players: [{ playerId: ID('0p02'), side: 1, position: null, jersey: null, sub: false }] },
    { side: 2, teamId: null, label: 'Jugador Tres / Jugador Cuatro', seed: null, players: [{ playerId: ID('0p03'), side: 2, position: null, jersey: null, sub: false }] },
  ],
} as unknown as Match;

/** La liga del partido (para «Publicar en Social»: eres miembro y jugaste el lado 1). */
const PADEL_CTX = {
  lid: ID('0l02'),
  league: { id: ID('0l02'), name: 'Pádel de Ejemplo', sport: 'padel', visibility: 'private', hasMinors: false, tz: 'America/Santo_Domingo' },
  member: { role: 'player' },
  isAdmin: false,
  isOwner: false,
  isScorer: false,
  canScore: false,
  myPlayerId: ID('0p02'),
  base: `/l/${ID('0l02')}`,
} as unknown as LeagueCtx;

/** Los avisos sociales de la campana (lo que manda social_notices). */
const NOTICE_ROWS = [
  { kind: 'post_comment' as const, at: ago(HOUR), userId: ANA.id, name: ANA.name, postId: ID('0005'), text: '¡Buena serie!' },
  { kind: 'post_like' as const, at: ago(2 * HOUR), userId: UNO.id, name: UNO.name, postId: ID('0005') },
  { kind: 'post_like' as const, at: ago(3 * HOUR), userId: ANA.id, name: ANA.name, postId: ID('0005') },
  {
    kind: 'like' as const,
    at: ago(26 * HOUR),
    userId: UNO.id,
    name: UNO.name,
    gameKind: 'bowling' as const,
    id: BOWLING.id,
    playerId: BOWLING.playerId,
    leagueId: LEAGUE.id,
    leagueName: LEAGUE.name,
    sport: 'bowling',
    url: BOWLING.url,
  },
  { kind: 'follow' as const, at: ago(50 * HOUR), userId: UNO.id, name: UNO.name },
];

/**
 * Solo en desarrollo: lo de Social con datos fijos (para probarlo en la vista previa web sin cuenta): una publicación,
 * un juego compartido (el suyo y el de otro), uno que ya no se ve, los juegos de «Juegos» con me gusta, «Compartir el
 * resultado» de un partido, los avisos sociales de la campana y el QR de una invitación. Sin cuenta, el me gusta lleva a
 * entrar; con la demostración puesta (/dev/empresa), Social y Avisos traen lo mismo de verdad (demoSocial.ts). En la
 * app publicada (__DEV__ falso) lleva a Hoy.
 */
export default function DevSocial() {
  const c = useColors();
  const now = useNow().getTime();
  const [sharing, setSharing] = useState(false);
  if (!__DEV__) return <Redirect href="/" />;
  const notices = buildNotices([], [], new Date(now).toISOString().slice(0, 10), now, null, buildSocialNotices(NOTICE_ROWS));
  return (
    <Screen>
      <SectionHeader title="Publicación" />
      <PostCard post={POST} />
      <SectionHeader title="Juego compartido" />
      <PostCard post={SHARED} />
      <PostCard post={SHARED_OTHER} />
      <PostCard post={GONE} />
      <SectionHeader title="Juegos" />
      {[PADEL, BOWLING, GOLF, SWIM].map((g) => (
        <GameCard key={g.key} game={g} showUser />
      ))}
      <SectionHeader title="Compartir un partido" />
      <Card padded={false}>
        <ListRow
          icon={
            <RowIcon>
              <Share2 size={20} color={c.accent} />
            </RowIcon>
          }
          title="Compartir el resultado"
          subtitle="Imagen o texto para WhatsApp"
          onPress={() => setSharing(true)}
        />
      </Card>
      {sharing && (
        <LeagueContext.Provider value={PADEL_CTX}>
          <ShareResultSheet
            onClose={() => setSharing(false)}
            match={MATCH}
            title="Pádel de Ejemplo"
            subtitle="Jornada 3 · Cancha 2"
            roundWord="Jornada"
            url={`https://matchmate.grullonb.com/l/${ID('0l02')}/juegos?partido=${ID('0m01')}`}
            mySide={1}
          />
        </LeagueContext.Provider>
      )}
      <SectionHeader title="Avisos sociales" />
      <NoticeGroups groups={groupNotices(notices, now)} now={now} isUnread={(n) => n.time > now - 3 * HOUR} showSport={false} onOpen={() => undefined} />
      <SectionHeader title="QR de invitación" />
      <QrCode value="https://matchmate.grullonb.com/unirse/ZZZZ2345" />
    </Screen>
  );
}
