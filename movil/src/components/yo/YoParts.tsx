import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { CalendarDays, Newspaper } from 'lucide-react-native';
import { useUserPosts } from '@mm/lib/data/posts';
import { useProfileGames } from '@mm/lib/data/profileGames';
import { useActiveSport } from '@mm/lib/sportContext';
import { sportMeta } from '@mm/sports/registry';
import type { SportId } from '@mm/sports/types';
import { initialProfileSport } from '@mm/components/social/socialFormat';
import { ProfileBadgesTab } from '@/components/badges/ProfileBadges';
import { Chips } from '@/components/notifications/NoticeList';
import { ComposerCard } from '@/components/social/Composer';
import { GameList } from '@/components/social/GameCard';
import { PostList } from '@/components/social/PostList';
import { SoloGamesRow } from '@/components/solo/YoSolo';
import { Empty } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { FeaturedSection } from './BadgesPreview';

/**
 * Lo de adentro de cada parte de Yo (`/yo/<parte>`, las partes `?tab=` de ProfilePage de la web), con las piezas de la
 * app que ya usa el perfil (/u/<id>): Mis juegos, Mis publicaciones e Insignias.
 */

/** «Todos» en los chips de deporte. */
const ALL = '*';

/**
 * Yo › Mis juegos: arriba, los juegos sueltos; debajo, tus juegos (con sus me gusta y «Ver más»), por deporte si juegas
 * varios (GamesTab de la web: empieza en el deporte en que estás, si lo juegas).
 */
export function MyGames({ uid, sports }: { uid: string; sports: readonly SportId[] }) {
  const c = useColors();
  const active = useActiveSport();
  // undefined = no ha tocado: el deporte en que estás (si lo juega); null = todos.
  const [pick, setPick] = useState<SportId | null | undefined>(undefined);
  const sport = pick === undefined ? initialProfileSport(active, sports) : pick;
  const games = useProfileGames(uid, sport);
  const meta = sportMeta(sport);
  return (
    <View style={{ gap: 26 }}>
      <SoloGamesRow />
      <View style={{ gap: 12 }}>
        {sports.length > 1 && (
          <Chips<string>
            label="Filtrar por deporte"
            value={sport ?? ALL}
            onChange={(k) => setPick(k === ALL ? null : (k as SportId))}
            items={[{ key: ALL, label: 'Todos' }, ...sports.map((s) => ({ key: s as string, label: sportMeta(s)?.short ?? s }))]}
          />
        )}
        <GameList
          key={sport ?? ALL}
          games={games}
          hideSport={sports.length <= 1}
          empty={
            <Empty
              icon={<CalendarDays size={28} color={c.accent} />}
              title={meta ? `Sin juegos de ${meta.lower}` : 'Todavía no hay juegos'}
              text="Cuando juegues en una liga, tus juegos salen aquí para que los demás te den me gusta."
            />
          }
        />
      </View>
    </View>
  );
}

/** Yo › Mis publicaciones: publicar algo (texto o foto) y lo que ya publicaste. */
export function MyPosts({ uid }: { uid: string }) {
  const c = useColors();
  const posts = useUserPosts(uid);
  return (
    <View style={{ gap: 20 }}>
      <ComposerCard />
      <PostList
        list={posts}
        empty={<Empty icon={<Newspaper size={28} color={c.accent} />} title="Todavía no publicas nada" text="Cuenta cómo te fue o sube una foto. Sale en tu perfil y en Social." />}
      />
    </View>
  );
}

/**
 * Yo › Insignias: «Destacadas» (las que los demás ven debajo de tu nombre) y la vitrina. `insignia` (el link de un aviso,
 * de un push o de la tarjeta de Yo) abre esa; `still` (`&quieta=1`, desde el aviso al ganar) sin repetir la animación.
 */
export function MyBadges({ uid, name, sports, insignia, still }: { uid: string; name: string; sports: readonly SportId[]; insignia?: string | null; still?: boolean }) {
  // La insignia que se abre en la vitrina (la del link, o una destacada que se tocó); null al cerrarla.
  const [link, setLink] = useState<{ id: string; still: boolean } | null>(() => (insignia ? { id: insignia, still: !!still } : null));
  return (
    <View style={{ gap: 26 }}>
      <FeaturedSection userId={uid} onOpen={(id) => setLink({ id, still: false })} />
      <ProfileBadgesTab
        userId={uid}
        name={name}
        sports={sports}
        link={link}
        onLinkDone={() => {
          setLink(null);
          if (insignia) router.setParams({ insignia: undefined, quieta: undefined });
        }}
      />
    </View>
  );
}
