import { Fragment, type ReactNode } from 'react';
import { router } from 'expo-router';
import { List, Newspaper, Shield, Users } from 'lucide-react-native';
import type { PublicProfile } from '@mm/lib/data/follows';
import { useMyEsportsTeams } from '@mm/lib/data/esports';
import { useMySquads } from '@mm/lib/data/squads';
import { myTeamsLine } from '@mm/components/squads/logic';
import { YO_PARTS, postsLine, socialIsEmpty, socialLine, type YoPart } from '@mm/pages/yoParts';
import { SoloEntryRow } from '@/components/solo/YoSolo';
import { Card, Divider, ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';

/** Abre una parte de Yo (`/yo/juegos`, `/yo/publicaciones`, `/yo/insignias`), con «‹ Yo» para volver. */
export const openYoPart = (parte: YoPart) => router.push({ pathname: '/yo/[parte]', params: { parte } } as never);

/**
 * Las filas de Yo › Lite, en una tarjeta y en el orden de la web: Mis juegos, Anotar un juego suelto (si ve los números
 * del boliche), Mis publicaciones, Mis equipos (los de fuera de una liga y los de esports) y Amigos y seguidores (tus
 * seguidores; con todo en cero, buscar personas).
 */
export function YoRows({ uid, profile, showBowling }: { uid: string; profile: PublicProfile | null; showBowling: boolean }) {
  const c = useColors();
  const squads = useMySquads();
  const esportsTeams = useMyEsportsTeams(uid);
  const teamNames = [...squads.data.map((s) => s.name), ...esportsTeams.data.map((t) => t.name)];
  const icon = (Icon: typeof List) => (
    <RowIcon>
      <Icon size={20} color={c.accent} />
    </RowIcon>
  );
  const rows: { key: string; row: ReactNode }[] = [
    { key: 'juegos', row: <ListRow icon={icon(List)} title="Mis juegos" subtitle="Prácticas, torneos y sueltos" onPress={() => openYoPart('juegos')} /> },
    ...(showBowling ? [{ key: 'suelto', row: <SoloEntryRow /> }] : []),
    { key: 'publicaciones', row: <ListRow icon={icon(Newspaper)} title={YO_PARTS.publicaciones} subtitle={postsLine(profile?.posts)} onPress={() => openYoPart('publicaciones')} /> },
    { key: 'equipos', row: <ListRow icon={icon(Shield)} title="Mis equipos" subtitle={myTeamsLine(teamNames)} onPress={() => router.push('/equipos')} /> },
    {
      key: 'amigos',
      row: (
        <ListRow
          icon={icon(Users)}
          title="Amigos y seguidores"
          subtitle={socialLine(profile)}
          onPress={() => (socialIsEmpty(profile) ? router.push('/buscar') : router.push({ pathname: '/u/[userId]/[lista]', params: { userId: uid, lista: 'seguidores' } }))}
        />
      ),
    },
  ];
  return (
    <Card padded={false}>
      {rows.map((r, i) => (
        <Fragment key={r.key}>
          {i > 0 && <Divider inset={68} />}
          {r.row}
        </Fragment>
      ))}
    </Card>
  );
}
