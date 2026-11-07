import { Fragment, type ReactNode } from 'react';
import { router } from 'expo-router';
import { Award, BarChart3, List, Newspaper, Shield, Users } from 'lucide-react-native';
import type { PublicProfile } from '@mm/lib/data/follows';
import { useMyEsportsTeams } from '@mm/lib/data/esports';
import { useMySquads } from '@mm/lib/data/squads';
import { useBallSection } from '@mm/components/balls/stats';
import { myTeamsLine } from '@mm/components/squads/logic';
import { YO_PARTS, postsLine, socialIsEmpty, socialLine, type YoPart } from '@mm/pages/yoParts';
import { BallIcon } from '@/components/balls/bits';
import { SoloEntryRow } from '@/components/solo/YoSolo';
import { Card, Divider, ListRow, RowIcon } from '@/components/ui';
import { useColors } from '@/theme/theme';
import { useBadgesLine } from './BadgesPreview';

/** Abre una parte de Yo (`/yo/juegos`, `/yo/publicaciones`, `/yo/insignias`, `/yo/estadisticas`), con «‹ Yo» para volver. */
export const openYoPart = (parte: YoPart) => router.push({ pathname: '/yo/[parte]', params: { parte } } as never);

/**
 * Las filas de Yo en una tarjeta y en el orden de la web (ProfilePage):
 * - Lite: Mis juegos, Anotar un juego suelto (si ve los números del boliche), Mis publicaciones, Mis equipos (los de
 *   fuera de una liga y los de esports) y Amigos y seguidores (tus seguidores; con todo en cero, buscar personas).
 * - Pro (`pro`): Por liga y temporada, Mis juegos, Anotar un juego suelto, Mis publicaciones, Mis equipos, Insignias
 *   (con cuántas tienes), Amigos y seguidores y, si ve el boliche y todavía no tiene bolas, Mis bolas.
 */
export function YoRows({ uid, profile, showBowling, pro = false, sports = [] }: { uid: string; profile: PublicProfile | null; showBowling: boolean; pro?: boolean; sports?: readonly string[] }) {
  const c = useColors();
  const squads = useMySquads();
  const esportsTeams = useMyEsportsTeams(uid);
  const balls = useBallSection();
  const badges = useBadgesLine(uid, sports);
  const teamNames = [...squads.data.map((s) => s.name), ...esportsTeams.data.map((t) => t.name)];
  const icon = (Icon: typeof List) => (
    <RowIcon>
      <Icon size={20} color={c.accent} />
    </RowIcon>
  );
  const games = { key: 'juegos', row: <ListRow icon={icon(List)} title="Mis juegos" subtitle="Prácticas, torneos y sueltos" onPress={() => openYoPart('juegos')} /> };
  const solo = showBowling ? [{ key: 'suelto', row: <SoloEntryRow /> }] : [];
  const posts = { key: 'publicaciones', row: <ListRow icon={icon(Newspaper)} title={YO_PARTS.publicaciones} subtitle={postsLine(profile?.posts)} onPress={() => openYoPart('publicaciones')} /> };
  const teams = { key: 'equipos', row: <ListRow icon={icon(Shield)} title="Mis equipos" subtitle={myTeamsLine(teamNames)} onPress={() => router.push('/equipos')} /> };
  const friends = {
    key: 'amigos',
    row: (
      <ListRow
        icon={icon(Users)}
        title="Amigos y seguidores"
        subtitle={socialLine(profile)}
        onPress={() => (socialIsEmpty(profile) ? router.push('/buscar') : router.push({ pathname: '/u/[userId]/[lista]', params: { userId: uid, lista: 'seguidores' } }))}
      />
    ),
  };
  const rows: { key: string; row: ReactNode }[] = pro
    ? [
        { key: 'estadisticas', row: <ListRow icon={icon(BarChart3)} title={YO_PARTS.estadisticas} onPress={() => openYoPart('estadisticas')} /> },
        games,
        ...solo,
        posts,
        teams,
        { key: 'insignias', row: <ListRow icon={icon(Award)} title="Insignias" subtitle={badges} onPress={() => openYoPart('insignias')} /> },
        friends,
        ...(showBowling && !balls.has && !balls.loading
          ? [
              {
                key: 'bolas',
                row: (
                  <ListRow
                    icon={
                      <RowIcon>
                        <BallIcon size={20} color={c.accent} />
                      </RowIcon>
                    }
                    title="Mis bolas"
                    subtitle="Agrega tu bola y mira con cuál tiras mejor"
                    onPress={() => router.push({ pathname: '/bolas' as never, params: { nueva: '1' } } as never)}
                  />
                ),
              },
            ]
          : []),
      ]
    : [games, ...solo, posts, teams, friends];
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
