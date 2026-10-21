import { router, useLocalSearchParams } from 'expo-router';
import { Baby, Newspaper } from 'lucide-react-native';
import { useAuth } from '@mm/lib/auth';
import { useLeague } from '@mm/lib/data';
import { useLeagueSocial } from '@mm/lib/data/leagueSocial';
import { useLeaguePosts } from '@mm/lib/data/posts';
import { leagueSport } from '@mm/sports/registry';
import { ComposerCard } from '@/components/social/Composer';
import { PostList } from '@/components/social/PostList';
import { BackBar, Button, Card, Empty, Loading, Screen, Txt } from '@/components/ui';
import { useColors } from '@/theme/theme';

/**
 * El muro de la liga (/l/:lid/muro de la web): «¿Qué pasó en la liga?» para publicar (los miembros: `canPost`) y las
 * publicaciones de la liga. Con menores no hay muro.
 */
export default function LeagueWallScreen() {
  const { lid } = useLocalSearchParams<{ lid: string }>();
  const c = useColors();
  const auth = useAuth();
  const league = useLeague(lid);
  const social = useLeagueSocial(auth.user ? lid : null);
  const posts = useLeaguePosts(auth.user ? lid : null);
  const l = league.data;
  if (auth.loading || (league.loading && !l)) return <Loading />;
  const torneo = l?.kind === 'torneo';
  const back = <BackBar label={l?.name ?? 'Liga'} fallback={`/l/${lid}`} />;
  const head = (
    <>
      <Txt variant="title">Muro</Txt>
      <Txt tone="muted" style={{ marginTop: -10 }}>{`Lo que cuentan ${torneo ? 'en el torneo' : 'en la liga'}`}</Txt>
    </>
  );

  if (l?.hasMinors) {
    return (
      <Screen>
        {back}
        {head}
        <Empty
          icon={<Baby size={28} color={c.accent} />}
          title="Aquí no hay muro"
          text={`${torneo ? 'Este torneo' : 'Esta liga'} tiene menores, así que las publicaciones y los comentarios están apagados para cuidarlos.`}
        />
      </Screen>
    );
  }
  if (!auth.user) {
    return (
      <Screen>
        {back}
        {head}
        <Card style={{ gap: 12 }}>
          <Txt variant="cardTitle">Entra para ver el muro</Txt>
          <Txt tone="fg2">{`Lo que publican ${torneo ? 'los del torneo' : 'los de la liga'}: fotos, resultados y más.`}</Txt>
          <Button variant="primary" size="xl" full onPress={() => router.push('/login')}>
            Entrar
          </Button>
        </Card>
      </Screen>
    );
  }
  const canPost = !!social.data?.canPost;
  return (
    <Screen onRefresh={posts.refresh}>
      {back}
      {head}
      {canPost && l && (
        <ComposerCard
          league={{ id: l.id, name: l.name, sport: leagueSport(l), visibility: l.visibility }}
          placeholder={torneo ? '¿Qué pasó en el torneo?' : '¿Qué pasó en la liga?'}
        />
      )}
      <PostList
        list={posts}
        hideLeague
        empty={
          <Empty
            icon={<Newspaper size={28} color={c.accent} />}
            title="Todavía no hay publicaciones"
            text={canPost ? 'Cuenta cómo les fue o sube la foto del día.' : `Cuando alguien ${torneo ? 'del torneo' : 'de la liga'} publique, sale aquí.`}
          />
        }
      />
    </Screen>
  );
}
