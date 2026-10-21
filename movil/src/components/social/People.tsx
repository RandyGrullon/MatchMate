/**
 * Seguir, una persona en una lista y un juego en una lista (como FollowButton, UserLink y GameList de la web).
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { setFollowing } from '@mm/lib/data/follows';
import { setLeagueFollowing } from '@mm/lib/data/leagueSocial';
import type { ProfileGame } from '@mm/lib/data/profileGames';
import { gameSummary } from '@mm/lib/data/profileGames';
import { saveErrorMessage } from '@mm/lib/errorText';
import { toIsoDate } from '@mm/lib/format';
import { sportMeta } from '@mm/sports/registry';
import { atUsername, gameDateLabel } from '@mm/components/social/socialFormat';
import { Avatar } from './Avatar';
import { userRoute } from './PostCard';
import { toast } from '../feedback';
import { Button, Txt } from '../ui';
import { openLink } from '@/lib/links';
import { useColors } from '@/theme/theme';

/** Seguir / Siguiendo (cambia al momento; si falla, vuelve y lo dice). */
export function FollowButton({ userId, isFollowing, followsYou, name }: { userId: string; isFollowing: boolean; followsYou?: boolean; name?: string }) {
  const [over, setOver] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const on = over ?? isFollowing;
  async function toggle() {
    if (busy) return;
    const next = !on;
    setOver(next);
    setBusy(true);
    try {
      await setFollowing(userId, next);
      if (!next && name) toast(`Ya no sigues a ${name}`);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setOver(null);
      setBusy(false);
    }
  }
  return (
    <Button
      variant={on ? 'quiet' : 'primary'}
      accessibilityLabel={name ? `${on ? 'Dejar de seguir a' : 'Seguir a'} ${name}` : undefined}
      onPress={toggle}
    >
      {on ? 'Siguiendo' : followsYou ? 'Seguir también' : 'Seguir'}
    </Button>
  );
}

/** Una persona: foto, nombre y @usuario (lleva a su perfil) y, si no eres tú, Seguir. */
export function PersonRow({
  person,
}: {
  person: { id: string; name: string; username: string; avatar?: string | null; isFollowing: boolean; followsYou: boolean; isMe?: boolean };
}) {
  const name = person.name.trim() || 'Alguien';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
      <Pressable accessibilityRole="link" accessibilityLabel={`Perfil de ${name}`} onPress={() => router.push(userRoute(person.id))} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={name} photo={person.avatar} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {person.isMe ? `${name} (tú)` : name}
          </Txt>
          {!!atUsername(person.username) && (
            <Txt variant="meta" tone="muted" numberOfLines={1}>
              {atUsername(person.username)}
              {person.followsYou && !person.isMe ? ' · Te sigue' : ''}
            </Txt>
          )}
        </View>
      </Pressable>
      {!person.isMe && <FollowButton userId={person.id} isFollowing={person.isFollowing} followsYou={person.followsYou} name={name} />}
    </View>
  );
}

/** Un juego (boliche, partido, golf…): el deporte, el resumen y la fecha; con `showUser`, de quién es. */
export function GameRow({ game, showUser }: { game: ProfileGame; showUser?: boolean }) {
  const c = useColors();
  const meta = sportMeta(game.sport);
  const Icon = meta?.icon ?? Trophy;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => game.url && openLink(game.url)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? c.surface2 : 'transparent' })}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${meta?.color ?? c.accent}22` }}>
        <Icon size={20} color={meta?.color ?? c.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {showUser && (
          <Txt variant="bodyStrong" numberOfLines={1} onPress={() => router.push(userRoute(game.userId))}>
            {game.userName}
          </Txt>
        )}
        <Txt variant={showUser ? 'meta' : 'bodyStrong'} numberOfLines={2}>
          {gameSummary(game)}
        </Txt>
        <Txt variant="small" tone="muted" numberOfLines={1}>
          {[game.leagueName, gameDateLabel(game.eventDate, toIsoDate(new Date()))].filter(Boolean).join(' · ')}
        </Txt>
      </View>
    </Pressable>
  );
}

/** Seguir / Siguiendo una liga pública: sus publicaciones salen en Social. */
export function LeagueFollowButton({ leagueId, name, following }: { leagueId: string; name: string; following: boolean }) {
  const [over, setOver] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const on = over ?? following;
  async function toggle() {
    if (busy) return;
    const next = !on;
    setOver(next);
    setBusy(true);
    try {
      await setLeagueFollowing(leagueId, next);
      toast(next ? `Sigues ${name}: sus publicaciones salen en Social` : `Ya no sigues ${name}`);
    } catch (e) {
      toast(saveErrorMessage(e), 'error');
    } finally {
      setOver(null);
      setBusy(false);
    }
  }
  return (
    <Button variant={on ? 'quiet' : 'primary'} accessibilityLabel={`${on ? 'Dejar de seguir' : 'Seguir'} ${name}`} onPress={toggle}>
      {on ? 'Siguiendo' : 'Seguir'}
    </Button>
  );
}
